import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, FileUp, Loader2 } from 'lucide-react';
import type { FormState, Language } from '@/shared/contract';
import { Button } from '@/ui/components/button';
import type { PdfErrorCode, PdfStatus, PdfViewerRequest, Result } from '@/shared/messages';
import { pdfCopy } from './copy';
import { isReviewDone } from './review';
import { isViewerUrl, looksLikePdfUrl, viewerUrl } from './urls';

/**
 * PDFs in the side panel: open one (file picker, drag and drop, or "Fill this PDF" when the
 * tab shows Chrome's PDF viewer), and turn on the viewer's download once the review is done.
 * The file is read in the browser: a dropped file becomes a blob: URL that only our viewer
 * page can read.
 *
 * Opening a PDF = open our viewer, wait until it has every field on screen, then reload the
 * panel: it starts fresh on the viewer tab like on any page (scan → map → interview). If a
 * conversation is under way, the user confirms first (what's on the page stays there).
 */
export function usePdf({ state, notice }: { state: FormState; notice: boolean }) {
  /** The active tab shows a PDF in Chrome's own viewer. */
  const [pdfTab, setPdfTab] = useState<{ tabId: number; url: string } | null>(null);
  /** The active tab is our viewer. */
  const [viewerTab, setViewerTab] = useState<number | null>(null);
  const [error, setError] = useState<PdfErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  /** Opening the PDF would end this conversation: waiting for the user's ok. */
  const [confirm, setConfirm] = useState<(() => void) | null>(null);
  const inProgress = state.captions.some((c) => c.role === 'user') || state.agentMode !== 'off';

  useEffect(() => {
    void (async () => {
      const tab = await activeTab();
      if (!tab?.id) return;
      if (isViewerUrl(tab.url)) {
        setViewerTab(tab.id);
        const st = await viewerStatus(tab.id, 10_000);
        if (st?.state === 'error') setError(st.code ?? 'unreadable');
      } else if (looksLikePdfUrl(tab.url)) {
        setPdfTab({ tabId: tab.id, url: tab.url! });
      }
    })();
  }, []);

  // PDFs at URLs that don't end in .pdf: only checked when the page shows no form (one HEAD request).
  useEffect(() => {
    if (!notice || pdfTab || viewerTab !== null) return;
    void (async () => {
      const tab = await activeTab();
      if (tab?.id && (await servesPdf(tab.url))) setPdfTab({ tabId: tab.id, url: tab.url! });
    })();
  }, [notice]);

  // The viewer's "Download filled PDF" turns on once the review is done.
  const sentDone = useRef<boolean | null>(null);
  const done = isReviewDone(state);
  useEffect(() => {
    if (viewerTab === null || sentDone.current === done) return;
    sentDone.current = done;
    void sendToViewer(viewerTab, { type: 'PDF_REVIEW_DONE', done });
  }, [viewerTab, done]);

  async function openViewer(open: () => Promise<number | undefined>) {
    setError(null);
    setBusy(true);
    const tabId = await open().catch(() => undefined);
    const st = tabId === undefined ? null : await viewerStatus(tabId, 60_000);
    if (st?.state === 'ready') {
      location.reload(); // start fresh on the viewer, like on any page
      return;
    }
    setError(st?.code ?? 'unreadable');
    setBusy(false);
  }

  /** Ask first when a conversation is under way. */
  function guarded(go: () => void) {
    if (inProgress) setConfirm(() => go);
    else go();
  }

  /** The PDF in this tab (Chrome's viewer) → our viewer, in the same tab. */
  function fillThisPdf() {
    if (!pdfTab) return;
    guarded(() => void openViewer(async () => (await browser.tabs.update(pdfTab.tabId, { url: viewerUrl({ url: pdfTab.url }) }))?.id));
  }

  /** A file from the picker or a drop → our viewer, in a new tab next to this one. */
  function openFile(file: File | undefined) {
    if (!file) return;
    if (!isPdfFile(file)) {
      setError('notPdf');
      return;
    }
    guarded(() => {
      // Lives as long as this panel page: the viewer copies it at once, before the panel reloads.
      const blob = URL.createObjectURL(file);
      void openViewer(async () => {
        const current = await activeTab();
        const tab = await browser.tabs.create({ url: viewerUrl({ blob, name: file.name }), index: current ? current.index + 1 : undefined });
        return tab.id;
      });
    });
  }

  /** The done screen's "Download filled PDF": the viewer writes and saves the file. */
  function download() {
    if (viewerTab !== null) void sendToViewer(viewerTab, { type: 'PDF_DOWNLOAD' });
  }

  return {
    pdfTab,
    viewerTab,
    error,
    busy,
    done,
    fillThisPdf,
    openFile,
    download,
    confirming: confirm !== null,
    confirmOpen: () => {
      const go = confirm;
      setConfirm(null);
      go?.();
    },
    cancelOpen: () => setConfirm(null),
  };
}

export type PdfPanel = ReturnType<typeof usePdf>;

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToViewer<T>(tabId: number, msg: PdfViewerRequest): Promise<Result<T> | null> {
  try {
    return ((await browser.tabs.sendMessage(tabId, msg)) as Result<T>) ?? null;
  } catch {
    return null; // not loaded yet
  }
}

/** The viewer's status once it has finished opening its PDF (ready or error); null if it never answers. */
async function viewerStatus(tabId: number, timeoutMs: number): Promise<PdfStatus | null> {
  const end = Date.now() + timeoutMs;
  let last: PdfStatus | null = null;
  for (;;) {
    const res = await sendToViewer<PdfStatus>(tabId, { type: 'PDF_STATUS' });
    if (res?.ok) {
      last = res.data;
      if (last.state !== 'loading') return last;
    }
    if (Date.now() > end) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** A web page that is really a PDF (no .pdf in the URL): ask the server for its type. */
async function servesPdf(url: string | undefined): Promise<boolean> {
  if (!url || !/^https?:/i.test(url)) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
    return (res.headers.get('content-type') ?? '').toLowerCase().includes('application/pdf');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// UI (the teammate's glass style; Tailwind classes, scanned via styles/panel.css)
// ---------------------------------------------------------------------------

/** "Open a PDF" + "Fill this PDF with Paperwise" + PDF problems, inside the panel. */
export function PdfCard({ pdf, language }: { pdf: PdfPanel; language: Language }) {
  const c = pdfCopy(language);
  const input = useRef<HTMLInputElement>(null);
  if (pdf.confirming) {
    return (
      <section className="glass-light my-3 rounded-xl px-4 py-3 [--glass-tint:var(--warning)]" role="alertdialog" aria-label={c.confirmTitle}>
        <p className="flex items-start gap-2 font-bold">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" /> {c.confirmTitle}
        </p>
        <p className="mt-1 leading-relaxed">{c.confirmText}</p>
        <div className="mt-3 flex gap-2">
          <Button className="h-11 flex-1 rounded-xl" onClick={pdf.confirmOpen}>
            {c.confirmYes}
          </Button>
          <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={pdf.cancelOpen}>
            {c.confirmNo}
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="glass-light my-3 rounded-xl px-4 py-3 [--glass-tint:var(--primary)]" aria-label="PDF">
      {pdf.busy && (
        <p role="status" className="mb-2 flex items-center gap-2">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {c.opening}
        </p>
      )}
      {pdf.error && (
        <p role="alert" className="mb-2 flex items-start gap-2 text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {c.errors[pdf.error]}
        </p>
      )}
      {pdf.pdfTab && !pdf.busy && (
        <div className="mb-3">
          <p className="mb-2 flex items-center gap-2 font-bold">
            <FileText className="size-4 text-primary" aria-hidden="true" /> {c.pdfTab}
          </p>
          <Button className="h-11 w-full rounded-xl" onClick={pdf.fillThisPdf}>
            {c.fillThisPdf}
          </Button>
        </div>
      )}
      {!pdf.busy && (
        <>
          <p className="mb-2 text-muted-foreground">{c.openPdfHint}</p>
          <Button variant="outline" className="h-11 w-full rounded-xl" onClick={() => input.current?.click()}>
            <FileUp aria-hidden="true" /> {c.openPdf}
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              pdf.openFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </>
      )}
    </section>
  );
}

/** Drag a PDF anywhere onto the panel. */
export function PdfDropZone({ pdf, language }: { pdf: PdfPanel; language: Language }) {
  const [over, setOver] = useState(false);
  const openFile = useRef(pdf.openFile);
  openFile.current = pdf.openFile;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overHandler = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // allow the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // don't let the panel navigate to the file
      depth = 0;
      setOver(false);
      openFile.current(e.dataTransfer?.files[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('drop', drop);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-2 z-[100] grid place-items-center rounded-2xl border-[3px] border-dashed border-primary bg-card/95 text-lg font-bold text-primary">
      <span className="flex items-center gap-2">
        <FileUp className="size-6" aria-hidden="true" /> {pdfCopy(language).dropHere}
      </span>
    </div>
  );
}
