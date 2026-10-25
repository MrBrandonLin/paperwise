/** Where PDFs open in Paperwise: our own viewer page (pdf.js), never Chrome's. */
export const VIEWER_PATH = '/pdf-viewer.html';

export type PdfSource = { url: string } | { blob: string; name: string };

/** The viewer for a PDF at a URL (a PDF tab), or for a file the user dropped (a blob: URL of the side panel). */
export function viewerUrl(src: PdfSource): string {
  const q = new URLSearchParams('url' in src ? { src: src.url } : { blob: src.blob, name: src.name });
  return `${browser.runtime.getURL(VIEWER_PATH)}?${q}`;
}

export function isViewerUrl(url: string | undefined): boolean {
  return !!url && url.startsWith(browser.runtime.getURL(VIEWER_PATH));
}

/** A web or file URL whose path ends in .pdf (Chrome shows those in its own PDF viewer). */
export function looksLikePdfUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'file:'].includes(u.protocol) && /\.pdf$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** "…/forms/fw9.pdf?x=1" → "fw9.pdf". */
export function fileNameOf(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return last || 'document.pdf';
  } catch {
    return 'document.pdf';
  }
}

/** "fw9.pdf" → "fw9-filled.pdf". */
export function filledName(name: string): string {
  return `${name.replace(/\.pdf$/i, '') || 'document'}-filled.pdf`;
}
