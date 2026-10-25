import { AnnotationLayer, AnnotationMode, setLayerDimensions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';

type Viewport = ReturnType<PDFPageProxy['getViewport']>;
type RenderTask = ReturnType<PDFPageProxy['render']>;

/** PDF points (1/72 in) → CSS pixels (1/96 in): zoom 100% shows the page at its real size. */
const CSS_UNITS = 96 / 72;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

interface PageView {
  n: number;
  page: PDFPageProxy;
  div: HTMLDivElement;
  canvas: HTMLCanvasElement;
  layer: AnnotationLayer | null;
  /**
   * Checkboxes and radio buttons: pdf.js draws their "on" and "off" pictures into small canvases
   * of their own (shown by the input's state). Filled while the page draws, handed to the layer.
   */
  boxCanvases: Map<string, unknown>;
  /** Scale the canvas was last drawn at (0 = never). */
  drawnScale: number;
  task: RenderTask | null;
}

/**
 * The pages, pdf.js's way: each page = a canvas (the printed page) + an annotation layer (the
 * form fields as real HTML inputs, `renderForms`). Every page's form layer is built up front, so
 * the scanner sees fields on page 3 at once; canvases are drawn when a page comes near the screen.
 * Zoom changes only the CSS scale (pdf.js layers are sized with --scale-factor) and redraws
 * canvases: the inputs are never rebuilt, so ids, values and highlights survive zooming.
 */
export class PdfView {
  readonly pages: PageView[] = [];
  zoom = 1;
  private observer: IntersectionObserver | null = null;
  private visible = new Set<number>();

  constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly viewer: HTMLElement,
    private readonly scroller: HTMLElement,
    /** false = draw the fields' own appearances (what other readers show), no HTML inputs. */
    private readonly forms = true,
  ) {}

  private get scale() {
    return this.zoom * CSS_UNITS;
  }

  async renderAll(zoom: number) {
    this.zoom = zoom;
    this.viewer.style.setProperty('--scale-factor', String(this.scale));
    const fieldObjects = this.forms ? await this.doc.getFieldObjects() : null;
    for (let n = 1; n <= this.doc.numPages; n++) {
      const page = await this.doc.getPage(n);
      const viewport = page.getViewport({ scale: this.scale });
      const div = document.createElement('div');
      div.className = 'page';
      div.dataset.pageNumber = String(n);
      setLayerDimensions(div, viewport);
      // A heading per page: the scanner uses headings as section hints ("Page 2 of 3").
      const heading = document.createElement('h2');
      heading.className = 'sr-only';
      heading.textContent = `Page ${n} of ${this.doc.numPages}`;
      const wrapper = document.createElement('div');
      wrapper.className = 'canvasWrapper';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      wrapper.append(canvas);
      div.append(heading, wrapper);
      this.viewer.append(div);
      const view: PageView = { n, page, div, canvas, layer: null, boxCanvases: new Map(), drawnScale: 0, task: null };
      this.pages.push(view);
      if (this.forms) view.layer = await this.renderFormLayer(view, viewport, fieldObjects);
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.pageNumber);
          if (e.isIntersecting) this.visible.add(n);
          else this.visible.delete(n);
        }
        this.drawVisible();
      },
      { root: this.scroller, rootMargin: '100% 0px' },
    );
    for (const p of this.pages) this.observer.observe(p.div);
  }

  private async renderFormLayer(view: PageView, viewport: Viewport, fieldObjects: unknown) {
    const div = document.createElement('div');
    div.className = 'annotationLayer';
    view.div.append(div);
    const annotations = await view.page.getAnnotations({ intent: 'display' });
    const layerViewport = viewport.clone({ dontFlip: true });
    const params = {
      div,
      page: view.page,
      viewport: layerViewport,
      annotationStorage: this.doc.annotationStorage,
      linkService: this.linkService,
      accessibilityManager: null,
      annotationCanvasMap: view.boxCanvases,
      annotationEditorUIManager: null,
      structTreeLayer: null,
      commentManager: null,
    };
    const layer = new AnnotationLayer(params as unknown as ConstructorParameters<typeof AnnotationLayer>[0]);
    await layer.render({
      ...params,
      annotations,
      renderForms: true,
      enableScripting: false, // never run a PDF's JavaScript
      hasJSActions: false,
      fieldObjects: fieldObjects as Map<string, object[]> | null,
      imageResourcesPath: '',
    } as unknown as Parameters<AnnotationLayer['render']>[0]);
    return layer;
  }

  private drawVisible() {
    for (const n of this.visible) {
      const view = this.pages[n - 1];
      if (view && view.drawnScale !== this.scale) void this.draw(view);
    }
  }

  private async draw(view: PageView) {
    view.task?.cancel();
    view.boxCanvases.clear();
    const scale = this.scale;
    const viewport = view.page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    const task = view.page.render({
      canvas,
      canvasContext: canvas.getContext('2d')!,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      // With HTML inputs on top, pdf.js leaves the fields out of the canvas.
      annotationMode: this.forms ? AnnotationMode.ENABLE_FORMS : AnnotationMode.ENABLE,
      annotationCanvasMap: this.forms ? (view.boxCanvases as Map<string, HTMLCanvasElement>) : undefined,
    });
    view.task = task;
    try {
      await task.promise;
      view.canvas.replaceWith(canvas); // swap when ready: no blank flash while zooming
      view.canvas = canvas;
      view.drawnScale = scale;
      if (view.boxCanvases.size) view.layer?.refreshCanvases(); // box pictures into their boxes
    } catch {
      // Cancelled by a newer zoom.
    } finally {
      if (view.task === task) view.task = null;
    }
  }

  /** Zoom, keeping the same spot of the document on screen. */
  setZoom(zoom: number) {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
    if (z === this.zoom) return;
    const ratio = this.scroller.scrollTop / Math.max(1, this.scroller.scrollHeight);
    this.zoom = z;
    this.viewer.style.setProperty('--scale-factor', String(this.scale));
    for (const view of this.pages) {
      const viewport = view.page.getViewport({ scale: this.scale });
      setLayerDimensions(view.div, viewport);
      view.layer?.update({ viewport: viewport.clone({ dontFlip: true }) } as Parameters<AnnotationLayer['update']>[0]);
    }
    this.scroller.scrollTop = ratio * this.scroller.scrollHeight;
    this.drawVisible();
  }

  /** The zoom at which the widest page fills the window's width. */
  fitWidthZoom(): number {
    const widest = Math.max(...this.pages.map((p) => p.page.getViewport({ scale: 1 }).width));
    return (this.scroller.clientWidth - 48) / (widest * CSS_UNITS);
  }

  /** The page at the top of the screen. */
  currentPage(): number {
    const top = this.scroller.getBoundingClientRect().top + 8;
    const hit = this.pages.find((p) => p.div.getBoundingClientRect().bottom > top);
    return hit?.n ?? 1;
  }

  scrollToPage(n: number) {
    this.pages[n - 1]?.div.scrollIntoView({ block: 'start' });
  }

  /** Links inside the PDF: web links open in a new tab, links to a page scroll there. */
  private readonly linkService = {
    externalLinkEnabled: true,
    eventBus: undefined,
    addLinkAttributes: (link: HTMLAnchorElement, url: string) => {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
    },
    getDestinationHash: () => '#',
    getAnchorUrl: () => '#',
    goToDestination: async (dest: unknown) => {
      const explicit = typeof dest === 'string' ? await this.doc.getDestination(dest) : (dest as unknown[] | null);
      const ref = explicit?.[0];
      const index = typeof ref === 'number' ? ref : ref ? await this.doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]) : -1;
      if (index >= 0) this.scrollToPage(index + 1);
    },
    executeNamedAction: () => {},
    executeSetOCGState: () => {},
  };
}
