import 'pdfjs-dist/web/pdf_viewer.css';
import './style.css';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { DOCUMENT_TITLE_ATTR, DOCUMENT_URL_ATTR } from '@/shared/config';
import type { ScanResult } from '@/shared/contract';
import type { ContentEvent, ContentRequest, PdfErrorCode, PdfStatus, PdfViewerRequest, Result } from '@/shared/messages';
import { openPanel, prefetchFormMap } from '@/entrypoints/content/floating-button';
import { handleContentRequest } from '@/entrypoints/content/handler';
import { mountPageUi } from '@/entrypoints/content/page-ui';
import { pageUi } from '@/entrypoints/content/page-ui-store';
import { markDirty, scanPage } from '@/entrypoints/content/scanner';
import { watchFieldChanges, watchUserEdits } from '@/entrypoints/content/watchers';
import { PDF_COPY, pdfCopy } from '@/pdf/copy';
import { EncryptedPdfError, fillPdf } from '@/pdf/export';
import { extractPdf, readTooltips } from '@/pdf/extract';
import { buildLabels } from '@/pdf/labels';
import { fileNameOf, filledName } from '@/pdf/urls';
import { collectValues, prepareFields, trackTouched } from '@/pdf/viewer/fields';
import { PdfView, ZOOM_MAX, ZOOM_MIN } from '@/pdf/viewer/render';

/**
 * Paperwise PDF viewer: an extension page that shows a fillable PDF with pdf.js, its form fields
 * as real HTML inputs. To the side panel it is just another page: it answers the same requests
 * as the content script (same scanner, filler, highlights, in-page UI) and sends the same events.
 * The PDF is read here, in the browser, and never uploaded: only the scan (field structure)
 * goes to the server, as with web forms.
 *
 * ?src=<url>               a PDF on the web or on disk (from a tab showing Chrome's PDF viewer)
 * ?blob=<url>&name=<name>  a file the user dropped on / picked in the side panel
 * &forms=0                 no inputs: draw the fields' own appearances (what other readers show; tests)
 */

const asset = (path: string) => browser.runtime.getURL(path as Parameters<typeof browser.runtime.getURL>[0]);
GlobalWorkerOptions.workerSrc = asset('/pdfjs/pdf.worker.min.mjs');

const params = new URLSearchParams(location.search);
const srcUrl = params.get('src');
const blobUrl = params.get('blob');
const forms = params.get('forms') !== '0';
const name = params.get('name') || (srcUrl ? fileNameOf(srcUrl) : 'document.pdf');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  name: $('name'),
  pageInfo: $('pageInfo'),
  zoomOut: $<HTMLButtonElement>('zoomOut'),
  zoomIn: $<HTMLButtonElement>('zoomIn'),
  zoomLevel: $('zoomLevel'),
  zoomFit: $<HTMLButtonElement>('zoomFit'),
  download: $<HTMLButtonElement>('download'),
  status: $('status'),
  scroller: $('scroller'),
  viewer: $('viewer'),
  error: $('error'),
};

let status: PdfStatus = { state: 'loading', fields: 0, name };
let reviewDone = false;
let saving = false;
let original: Uint8Array | null = null;
let pdfDoc: PDFDocumentProxy | null = null;
let view: PdfView | null = null;
let message = '';
let resolveReady!: () => void;
const ready = new Promise<void>((r) => (resolveReady = r));

const copy = () => pdfCopy(pageUi.get().language);

class PdfFail extends Error {
  constructor(readonly code: PdfErrorCode) {
    super(code);
  }
}

// --- Messages: the side panel talks to this page like to a content script ---------------------

const CONTENT_REQUESTS = new Set<ContentRequest['type']>(['PING', 'SCAN', 'FILL', 'HIGHLIGHT', 'GO_TO', 'CLEAR_HIGHLIGHTS', 'PROGRESS']);

browser.runtime.onMessage.addListener((msg: ContentRequest | PdfViewerRequest, _sender, sendResponse: (r: Result<unknown>) => void) => {
  if (msg?.type === 'PDF_STATUS') {
    sendResponse({ ok: true, data: status });
    return false;
  }
  if (msg?.type === 'PDF_DOWNLOAD') {
    // From the panel's done screen. Same rule as the button: only after the review.
    sendResponse(reviewDone ? { ok: true, data: null } : { ok: false, error: 'Review not done yet.' });
    if (reviewDone) void download();
    return false;
  }
  if (msg?.type === 'PDF_REVIEW_DONE') {
    reviewDone = msg.done;
    render();
    sendResponse({ ok: true, data: null });
    return false;
  }
  if (!CONTENT_REQUESTS.has(msg?.type as ContentRequest['type'])) return false; // broadcasts meant for others
  // Requests that arrive while the PDF is still opening wait for it.
  void ready.then(() => {
    if (status.state === 'ready') sendResponse(handleContentRequest(msg as ContentRequest));
    else if (msg.type === 'SCAN') sendResponse({ ok: true, data: emptyScan() });
    else sendResponse({ ok: false, error: PDF_COPY.en.errors[status.code ?? 'unreadable'] });
  });
  return true;
});

const broadcast = (event: ContentEvent) => void browser.runtime.sendMessage(event).catch(() => {});

function emptyScan(): ScanResult {
  return { url: location.href, pageTitle: document.title, fields: [] };
}

// --- Open --------------------------------------------------------------------------------------

async function load() {
  try {
    const bytes = await fetchBytes();
    original = bytes;
    const doc = await openPdf(bytes);
    pdfDoc = doc;
    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as { IsXFAPresent?: boolean; Title?: string; Language?: string };
    // The page's language is the PDF's (what answers are written in), never the user's.
    document.documentElement.lang = info.Language || 'en';
    const { widgets, texts } = await extractPdf(doc, await readTooltips(bytes));
    if (widgets.length === 0) throw new PdfFail(info.IsXFAPresent ? 'xfa' : 'noFields');

    view = new PdfView(doc, ui.viewer, ui.scroller, forms);
    const first = (await doc.getPage(1)).getViewport({ scale: 1 });
    const fit = (ui.scroller.clientWidth - 48) / ((first.width * 96) / 72);
    await view.renderAll(Math.min(1.5, Math.max(ZOOM_MIN, fit)));
    setupZoom(view);

    if (forms) {
      prepareFields(widgets, buildLabels(widgets, texts));
      trackTouched(document);
    }
    // What the scan calls this document. Not the viewer's URL (the same for every PDF) and not the
    // file name (it may hold the user's name): the PDF's fingerprint and its own title.
    const fingerprint = doc.fingerprints.filter(Boolean).join('-');
    document.documentElement.setAttribute(DOCUMENT_URL_ATTR, `file:///pdf/${fingerprint}`);
    document.documentElement.setAttribute(DOCUMENT_TITLE_ATTR, info.Title?.trim() || 'PDF form');
    markDirty();
    const scan = scanPage();
    status = { state: 'ready', fields: scan.fields.length, name };
    if (forms) startPageTools();
    broadcast({ type: 'EVENT_PDF_READY', fields: scan.fields.length });
  } catch (err) {
    const code = err instanceof PdfFail ? err.code : 'corrupted';
    if (!(err instanceof PdfFail)) console.error('[paperwise] PDF failed to open', err);
    status = { state: 'error', code, fields: 0, name };
    broadcast({ type: 'EVENT_PDF_FAILED', code });
  } finally {
    resolveReady();
    render();
  }
}

/** The PDF's bytes, read here in the browser (never sent to our server). */
async function fetchBytes(): Promise<Uint8Array> {
  let bytes: Uint8Array;
  if (blobUrl) {
    // The side panel's copy of a dropped file: gone once the panel reloads or closes.
    if (!blobUrl.startsWith('blob:')) throw new PdfFail('unreadable');
    try {
      bytes = new Uint8Array(await (await fetch(blobUrl)).arrayBuffer());
    } catch {
      throw new PdfFail('expired');
    }
  } else if (srcUrl && /^(https?|file):/i.test(srcUrl)) {
    try {
      const res = await fetch(srcUrl, { credentials: 'include' });
      if (!res.ok) throw new PdfFail('unreadable');
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (err instanceof PdfFail) throw err;
      if (srcUrl.startsWith('file:') && !(await browser.extension.isAllowedFileSchemeAccess())) throw new PdfFail('fileAccess');
      throw new PdfFail('unreadable');
    }
  } else {
    throw new PdfFail('unreadable');
  }
  // A PDF starts with "%PDF-" (allowed within the first 1 KB). A login page instead of the file = unreadable.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) throw new PdfFail(blobUrl ? 'notPdf' : 'unreadable');
  return bytes;
}

async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    return await getDocument({
      data: bytes.slice(), // pdf.js takes ownership of its copy; we keep the original for the download
      cMapUrl: asset('/pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: asset('/pdfjs/standard_fonts/'),
      wasmUrl: asset('/pdfjs/wasm/'),
      iccUrl: asset('/pdfjs/iccs/'),
      enableXfa: false,
    }).promise;
  } catch (err) {
    const n = (err as { name?: string } | null)?.name;
    throw new PdfFail(n === 'PasswordException' ? 'password' : 'corrupted');
  }
}

/** Same as the content script on a web page: in-page UI (button + highlights) and the watchers. */
function startPageTools() {
  mountPageUi({ open: openPanel, intent: prefetchFormMap }).showButton();
  watchUserEdits((id, r) => broadcast({ type: 'EVENT_USER_EDIT', id, value: r.value, filled: r.filled, sensitive: r.sensitive }));
  watchFieldChanges((scan) => broadcast({ type: 'EVENT_FIELDS_CHANGED', scan }));
}

// --- Toolbar -----------------------------------------------------------------------------------

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function setupZoom(v: PdfView) {
  ui.zoomOut.onclick = () => v.setZoom([...ZOOMS].reverse().find((z) => z < v.zoom - 0.01) ?? ZOOM_MIN);
  ui.zoomIn.onclick = () => v.setZoom(ZOOMS.find((z) => z > v.zoom + 0.01) ?? ZOOM_MAX);
  ui.zoomFit.onclick = () => v.setZoom(v.fitWidthZoom());
  const onChange = () => render();
  new MutationObserver(onChange).observe(ui.viewer, { attributes: true, attributeFilter: ['style'] });
  let raf = 0;
  ui.scroller.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  });
}

ui.download.onclick = () => void download();

async function download() {
  if (!original || !reviewDone || saving) return;
  saving = true;
  message = '';
  render();
  try {
    let bytes: Uint8Array;
    let skipped = 0;
    try {
      const report = await fillPdf(original, collectValues());
      bytes = report.bytes;
      skipped = report.skipped.length;
      if (report.skipped.length) console.warn('[paperwise] not written:', report.skipped);
    } catch (err) {
      // pdf-lib can't edit encrypted PDFs (owner-locked forms still open without a password):
      // pdf.js saves those itself, with our values, keeping the encryption.
      if (!(err instanceof EncryptedPdfError) || !pdfDoc) throw err;
      bytes = await pdfDoc.saveDocument();
    }
    saveFile(bytes, filledName(name));
    message = skipped ? copy().savedSome(skipped) : '';
  } catch (err) {
    console.error('[paperwise] could not save the filled PDF', err);
    message = copy().saveFailed;
  } finally {
    saving = false;
    render();
  }
}

function saveFile(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Toolbar + messages from the current state (language follows the side panel). */
function render() {
  const c = copy();
  // The toolbar speaks the user's language; the document stays in the PDF's (see load()).
  document.querySelector('.toolbar')?.setAttribute('lang', pageUi.get().language);
  document.title = `${name} – Paperwise`;
  ui.name.textContent = name;
  ui.name.title = name;
  const total = pdfDoc?.numPages ?? 0;
  ui.pageInfo.textContent = view && total ? c.page(view.currentPage(), total) : '';
  ui.zoomOut.setAttribute('aria-label', c.zoomOut);
  ui.zoomIn.setAttribute('aria-label', c.zoomIn);
  ui.zoomLevel.textContent = view ? `${Math.round(view.zoom * 100)}%` : '';
  ui.zoomLevel.setAttribute('aria-label', `${c.zoom} ${ui.zoomLevel.textContent}`);
  ui.zoomFit.textContent = c.fitWidth;
  for (const el of [ui.zoomOut, ui.zoomIn, ui.zoomFit]) el.disabled = !view;

  const canSave = status.state === 'ready' && forms && reviewDone && !saving;
  ui.download.disabled = !canSave;
  ui.download.textContent = saving ? c.downloading : c.download;
  ui.download.title = reviewDone ? '' : c.downloadLocked;
  ui.download.hidden = status.state === 'error' || !forms;

  ui.status.textContent = status.state === 'loading' ? c.loading : message;
  ui.error.hidden = status.state !== 'error';
  ui.error.textContent = status.state === 'error' ? c.errors[status.code ?? 'unreadable'] : '';
}

pageUi.subscribe(render);
render();
void load();

// For tests and debugging.
(window as unknown as { __paperwisePdf: unknown }).__paperwisePdf = { status: () => status, collectValues };
