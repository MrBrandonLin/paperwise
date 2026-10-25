import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { stream } from 'hono/streaming';
import type { Language } from '../../src/shared/contract.ts';
import { isLanguage } from '../../src/shared/languages.ts';
import type { FormMapRequestBody } from '../../src/shared/messages.ts';
import { env } from './env.ts';
import { streamFormMap } from './form-map.ts';
import { paths } from './paths.ts';

/** The HTTP app (no listening here, so tests can call app.request directly). */
export const app = new Hono();
app.use(logger());
app.use(cors());

app.get('/health', (c) =>
  c.json({ ok: true, gemini: !!env.geminiApiKey, elevenlabs: !!(env.elevenlabsApiKey && env.elevenlabsAgentId) }),
);

/**
 * { scan, language } → NDJSON stream: FormMapUpdate lines (the first one at once: the local
 * skeleton, or the cached map), then one FormMapDone line.
 * Only the form's structure is used; field values are dropped right away and never logged.
 */
app.post('/form-map', async (c) => {
  const body = await c.req.json<FormMapRequestBody>().catch(() => null);
  const scan = body?.scan;
  if (!scan || !Array.isArray(scan.fields)) return c.json({ error: 'Body must be { scan: ScanResult, language }' }, 400);
  const language: Language = isLanguage(body.language) ? body.language : 'en';

  c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
  c.header('Cache-Control', 'no-store');
  return stream(c, async (s) => {
    let open = true;
    s.onAbort(() => {
      open = false;
    });
    const write = async (line: unknown) => {
      if (open) await s.write(JSON.stringify(line) + '\n');
    };
    // Keep lines in order even though updates arrive from parallel parts.
    let pending: Promise<void> = Promise.resolve();
    const done = await streamFormMap(scan, language, (u) => {
      pending = pending.then(() => write(u));
    });
    await pending;
    await write(done);
  });
});

/**
 * Short-lived credentials for the private ElevenLabs agent. The API key never leaves the server.
 *   default            → { conversationToken }  WebRTC (what the side panel uses: lowest latency)
 *   ?transport=websocket → { signedUrl }        WebSocket (used by the Node voice simulation)
 */
app.get('/agent-token', async (c) => {
  if (!env.elevenlabsApiKey || !env.elevenlabsAgentId) {
    return c.json({ error: 'ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID missing in server/.env' }, 500);
  }
  const credits = await creditsLeft();
  if (credits !== null && credits < MIN_CREDITS) {
    console.error(`[agent-token] ElevenLabs credits used up (${credits} left)`);
    return c.json({ error: `${OUT_OF_CREDITS} (${credits} left)` }, 402);
  }
  const agent = encodeURIComponent(env.elevenlabsAgentId);
  const websocket = c.req.query('transport') === 'websocket';
  const url = websocket
    ? `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent}`
    : `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agent}`;
  const res = await fetch(url, { headers: { 'xi-api-key': env.elevenlabsApiKey } });
  if (!res.ok) {
    const detail = await res.text();
    console.error('[agent-token] ElevenLabs error', res.status, detail.slice(0, 300));
    return c.json({ error: `ElevenLabs returned ${res.status}` }, 502);
  }
  const body = (await res.json()) as { token?: string; signed_url?: string };
  return c.json(websocket ? { signedUrl: body.signed_url } : { conversationToken: body.token });
});

/**
 * ElevenLabs refuses conversations once the plan's credits are used up, but only after connecting
 * ("agent disconnected"), which looked like a dropped connection in a loop. Checked here first.
 * null = unknown (the key may not be allowed to read the subscription): don't block.
 */
const MIN_CREDITS = 200;
export const OUT_OF_CREDITS = 'ElevenLabs credits used up';
let creditsCache: { at: number; left: number | null } | null = null;
async function creditsLeft(): Promise<number | null> {
  if (creditsCache && Date.now() - creditsCache.at < 30_000) return creditsCache.left;
  let left: number | null = null;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': env.elevenlabsApiKey! }, signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const s = (await res.json()) as { character_count?: number; character_limit?: number };
      if (typeof s.character_count === 'number' && typeof s.character_limit === 'number') left = s.character_limit - s.character_count;
    }
  } catch {
    /* unknown */
  }
  creditsCache = { at: Date.now(), left };
  return left;
}

/** Test forms for development and the demo: http://localhost:8787/test/rental.html */
app.use('/test/*', serveStatic({ root: paths.public }));
