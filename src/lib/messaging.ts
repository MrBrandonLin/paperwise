import type { ScriptPublicPath } from 'wxt/utils/inject-script';
import type { BackgroundRequest, ContentRequest, Result } from '@/shared/messages';
import { isViewerUrl } from '@/pdf/urls';

/** Shown instead of a technical error on pages where extensions can't run. */
export const UNSUPPORTED_PAGE = "Paperwise can't work on this page.";

/** Send a request to the background worker. */
export async function toBackground<T>(msg: BackgroundRequest): Promise<Result<T>> {
  try {
    const res = (await browser.runtime.sendMessage(msg)) as Result<T> | undefined;
    return res ?? { ok: false, error: 'No response from background' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Send a request to the content script of a tab.
 * Tabs that were open before the extension (re)loaded have no live content script: we inject it
 * and retry once. Safe to retry: a request that never reached the page did nothing.
 */
export async function toContent<T>(tabId: number, msg: ContentRequest): Promise<Result<T>> {
  try {
    return await send<T>(tabId, msg);
  } catch {
    // Our PDF viewer page answers like a content script once it has loaded: wait for it, never inject.
    if (isViewerUrl((await browser.tabs.get(tabId).catch(() => null))?.url)) return toViewer<T>(tabId, msg);
    const injected = await ensureContentScript(tabId);
    if (!injected.ok) return injected;
    try {
      return await send<T>(tabId, msg);
    } catch {
      return { ok: false, error: 'Paperwise could not connect to this page. Reload the page and try again.' };
    }
  }
}

/** The PDF viewer tab is still loading (or reloading): retry for a few seconds. */
async function toViewer<T>(tabId: number, msg: ContentRequest): Promise<Result<T>> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      return await send<T>(tabId, msg);
    } catch {
      // not listening yet
    }
  }
  return { ok: false, error: 'Paperwise could not connect to the PDF. Reload its tab and try again.' };
}

async function send<T>(tabId: number, msg: ContentRequest): Promise<Result<T>> {
  const res = (await browser.tabs.sendMessage(tabId, msg)) as Result<T> | undefined;
  return res ?? { ok: false, error: 'No response from page' };
}

/** One injection per tab at a time (the panel sends several requests on open). */
const injecting = new Map<number, Promise<Result<null>>>();

function ensureContentScript(tabId: number): Promise<Result<null>> {
  let job = injecting.get(tabId);
  if (!job) {
    job = inject(tabId).finally(() => injecting.delete(tabId));
    injecting.set(tabId, job);
  }
  return job;
}

async function inject(tabId: number): Promise<Result<null>> {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab || !isScriptableUrl(tab.url)) return { ok: false, error: UNSUPPORTED_PAGE };
  // The same file the manifest declares (WXT names it), so the two can't drift.
  const files = (browser.runtime.getManifest().content_scripts?.[0]?.js ?? []) as ScriptPublicPath[];
  try {
    await browser.scripting.executeScript({ target: { tabId }, files });
    return { ok: true, data: null };
  } catch {
    // Chrome refuses: PDF viewer, error pages, file:// without permission, other extensions' pages…
    return { ok: false, error: UNSUPPORTED_PAGE };
  }
}

/** Pages Chrome never lets extensions script. Unknown URL (no tab info) counts as not scriptable. */
export function isScriptableUrl(url: string | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'file:'].includes(u.protocol)) return false; // chrome://, about:, edge://, view-source:…
  if (u.hostname === 'chromewebstore.google.com') return false;
  if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return false;
  if (u.hostname === 'microsoftedge.microsoft.com' && u.pathname.startsWith('/addons')) return false;
  return true;
}

/** The tab the side panel is working on. */
export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}
