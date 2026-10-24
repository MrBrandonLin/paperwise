import { BACKEND_URL } from '@/shared/config';
import type { Language, ScanResult } from '@/shared/contract';
import type {
  AgentTokenResponse,
  BackgroundRequest,
  ContentEvent,
  FormMapDone,
  FormMapStreamLine,
  HealthResponse,
  Result,
} from '@/shared/messages';

/**
 * Background service worker.
 * - Opens the side panel (toolbar icon or floating button).
 * - Talks to the backend, so the backend URL lives in one place.
 * - Streams the form map: every line from the backend is forwarded to the side panel at once.
 * Keep runtime code inside main(): WXT imports this file in Node at build time.
 */
export default defineBackground(() => {
  // Toolbar icon opens the side panel.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[paperwise] setPanelBehavior failed', err));

  browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
    switch (message.type) {
      case 'OPEN_PANEL': {
        // Must be called synchronously inside the user-gesture message, no await before it.
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
          sendResponse(fail('No tab'));
          return false;
        }
        browser.sidePanel
          .open({ tabId })
          .then(() => sendResponse(ok(null)))
          .catch((err: unknown) => sendResponse(fail(String(err))));
        // Start the form map while the panel opens: it is often ready before the user looks.
        if (message.scan && message.language) prefetch(message.scan, message.language);
        return true;
      }
      case 'API_HEALTH':
        respond(api<HealthResponse>('GET', '/health'), sendResponse);
        return true;
      case 'API_FORM_MAP':
        respond(
          streamFormMap(message.scan, message.language, (line) =>
            broadcast({ type: 'EVENT_FORM_MAP', requestId: message.requestId, line }),
          ),
          sendResponse,
        );
        return true;
      case 'API_FORM_MAP_PREFETCH':
        prefetch(message.scan, message.language);
        sendResponse(ok(null));
        return false;
      case 'API_AGENT_TOKEN':
        respond(api<AgentTokenResponse>('GET', '/agent-token'), sendResponse);
        return true;
      default:
        // Not for us (e.g. content events meant for the side panel).
        return false;
    }
  });
});

/** Recent prefetches, so hovering the button twice doesn't start two builds. */
const prefetched = new Map<string, number>();

/** Fire-and-forget: the backend builds + caches the map; the panel's own request joins it. */
function prefetch(scan: ScanResult, language: Language) {
  const key = `${scan.url}|${language}|${scan.fields.length}`;
  if (Date.now() - (prefetched.get(key) ?? 0) < 30_000) return;
  prefetched.set(key, Date.now());
  streamFormMap(scan, language, () => {}).catch(() => {});
}

/** POST /form-map and pass every NDJSON line on as it arrives. Resolves with the final line. */
async function streamFormMap(
  scan: ScanResult,
  language: Language,
  onLine: (line: FormMapStreamLine) => void,
): Promise<Result<FormMapDone>> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/form-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scan, language }),
    });
  } catch (err) {
    return fail(`Backend unreachable at ${BACKEND_URL} (${String(err)})`);
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    return fail(json?.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let done: FormMapDone | null = null;
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (value) buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const text = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!text) continue;
      const line = JSON.parse(text) as FormMapStreamLine;
      onLine(line);
      if (line.type === 'done') done = line;
    }
    if (finished) break;
  }
  return done ? ok(done) : fail('Form map stream ended early');
}

function broadcast(event: ContentEvent) {
  browser.runtime.sendMessage(event).catch(() => {});
}

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}
function fail(error: string): Result<never> {
  return { ok: false, error };
}

function respond<T>(p: Promise<Result<T>>, sendResponse: (r: Result<T>) => void) {
  p.then(sendResponse).catch((err: unknown) => sendResponse(fail(String(err))));
}

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return fail(json?.error ?? `HTTP ${res.status}`);
    return ok(json as T);
  } catch (err) {
    return fail(`Backend unreachable at ${BACKEND_URL} (${String(err)})`);
  }
}
