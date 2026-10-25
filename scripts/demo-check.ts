// pnpm demo:check [--full] — is everything ready for the live demo? Prints READY / NOT READY.
//
//  - the backend runs (pnpm server) and its keys load (Gemini + ElevenLabs)
//  - the demo forms' maps come from the cache, instantly: /test/rental.html, /test/rental-react.html,
//    the IRS W-9 and the rental PDF (one map per form, in the form's language: the agent speaks
//    English, Spanish, French… from the same map)
//  - the ElevenLabs agent: a conversation token, multilingual voice (Eleven v4 Turbo),
//    language switching, presets for every language
//  - the extension is built and newer than the code
//  - the test suites pass (fast ones; --full adds the browser suites, ~3 min)
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/test-browser.mjs';
import { LANGUAGES } from '../src/shared/languages';

const BACKEND = 'http://localhost:8787';
const full = process.argv.includes('--full');
const problems: string[] = [];
const ok = (cond: boolean, msg: string, fix?: string) => {
  console.log(`  ${cond ? '✓' : '✗'}  ${msg}${!cond && fix ? `\n       → ${fix}` : ''}`);
  if (!cond) problems.push(msg);
  return cond;
};

console.log('\n=== Backend');
let health: { ok?: boolean; gemini?: boolean; elevenlabs?: boolean } = {};
try {
  health = (await (await fetch(`${BACKEND}/health`)).json()) as typeof health;
} catch {
  /* not running */
}
const up = ok(!!health.ok, `server running at ${BACKEND}`, 'start it: pnpm server');
if (up) {
  ok(!!health.gemini, 'Gemini key loaded (server/.env GEMINI_API_KEY)', 'put GEMINI_API_KEY in server/.env, restart pnpm server');
  ok(!!health.elevenlabs, 'ElevenLabs key + agent loaded (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID)', 'put both in server/.env, restart pnpm server');
}

if (up) {
  console.log('\n=== Demo forms: maps from the cache (instant)');
  const scansDir = join(ROOT, 'server', 'test-pages', 'scans');
  for (const file of ['rental.json', 'rental-react.json', 'pdf-fw9.json', 'pdf-rental-application.json']) {
    if (!existsSync(join(scansDir, file))) {
      ok(false, `${file}: saved scan missing`);
      continue;
    }
    const scan = JSON.parse(readFileSync(join(scansDir, file), 'utf8')) as { pageLanguage?: string };
    const language = (scan.pageLanguage ?? 'en').slice(0, 2);
    const t0 = Date.now();
    let first = 0;
    let done: { source?: string; map?: { fields: unknown[]; complete: boolean } } = {};
    try {
      const res = await fetch(`${BACKEND}/form-map`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scan, language }) });
      const text = await res.text();
      first = Date.now() - t0;
      done = JSON.parse(text.trim().split('\n').at(-1)!) as typeof done;
    } catch (err) {
      ok(false, `${file}: map request failed (${String(err)})`);
      continue;
    }
    ok(done.source === 'cache' && first < 300, `${file}: ${done.source}, ${done.map?.fields.length} fields, ${first} ms`, 'first run builds it (a few seconds); run demo:check again: it should say cache');
  }

  console.log('\n=== Voice agent (ElevenLabs)');
  try {
    const token = (await (await fetch(`${BACKEND}/agent-token`)).json()) as { conversationToken?: string; error?: string };
    ok(!!token.conversationToken, `conversation token ${token.conversationToken ? 'OK' : token.error ?? ''}`, 'check ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID');
  } catch (err) {
    ok(false, `agent token: ${String(err)}`);
  }
  const env = readFileSync(join(ROOT, 'server', '.env'), 'utf8');
  const key = /^ELEVENLABS_API_KEY=(.+)$/m.exec(env)?.[1]?.trim();
  const agent = /^ELEVENLABS_AGENT_ID=(.+)$/m.exec(env)?.[1]?.trim();
  if (key && agent) {
    const a = (await (await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent}`, { headers: { 'xi-api-key': key } })).json()) as {
      conversation_config?: { tts?: { model_id?: string }; language_presets?: Record<string, unknown>; agent?: { prompt?: { built_in_tools?: { language_detection?: unknown } } } };
    };
    const c = a.conversation_config;
    ok(c?.tts?.model_id === 'eleven_v4_turbo', `voice model ${c?.tts?.model_id} (all languages from one voice)`, 'pnpm --dir server agent:setup');
    ok(!!c?.agent?.prompt?.built_in_tools?.language_detection, 'language switching (language_detection) on', 'pnpm --dir server agent:setup');
    const sub = (await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })).json()) as { character_count?: number; character_limit?: number };
    if (typeof sub.character_count === 'number' && typeof sub.character_limit === 'number') {
      const left = sub.character_limit - sub.character_count;
      ok(left >= 5000, `ElevenLabs credits left: ${left} of ${sub.character_limit}`, left < 200 ? 'out of credits: the agent hangs up at once. Add credits or upgrade the plan (elevenlabs.io → Subscription), or use a teammate’s key' : 'low: a full demo conversation uses a few thousand; add credits');
    }
    const presets = Object.keys(c?.language_presets ?? {});
    const missing = LANGUAGES.filter((l) => l.code !== 'en' && !presets.includes(l.elevenlabs)).map((l) => l.code);
    ok(missing.length === 0, `languages: en + ${presets.join(', ')}`, `missing ${missing.join(', ')}: pnpm --dir server agent:setup`);
  }
}

console.log('\n=== Extension build');
const manifest = join(ROOT, '.output', 'chrome-mv3', 'manifest.json');
const built = existsSync(manifest) ? statSync(manifest).mtimeMs : 0;
const newest = (dir: string): number =>
  Math.max(0, ...readdirSync(dir, { withFileTypes: true }).map((d) => (d.isDirectory() ? newest(join(dir, d.name)) : statSync(join(dir, d.name)).mtimeMs)));
const src = newest(join(ROOT, 'src'));
ok(built > 0, 'built (.output/chrome-mv3)', 'pnpm build, then reload the extension in chrome://extensions');
ok(built >= src, 'build is newer than the code', 'pnpm build, then reload the extension in chrome://extensions');
ok(existsSync(join(ROOT, 'public', 'pdfjs', 'pdf.worker.min.mjs')), 'PDF viewer files present (public/pdfjs)', 'pnpm install');

console.log(`\n=== Tests${full ? '' : ' (fast; --full adds the browser suites)'}`);
const suites = ['pnpm -s test:state', 'pnpm -s test:voice', 'pnpm --dir server -s test:form-map', 'pnpm --dir server -s test:paths', ...(full ? ['pnpm -s test:fill', 'pnpm -s test:reach', 'pnpm -s test:pdf', 'pnpm -s test:a11y'] : [])];
for (const cmd of suites) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });
    ok(true, `${cmd.replace(/^pnpm (--dir server )?-s /, '')}: ${out.trim().split('\n').at(-1)}`);
  } catch (err) {
    const out = String((err as { stdout?: string }).stdout ?? '');
    ok(false, `${cmd}: ${out.trim().split('\n').at(-1) ?? 'failed'}`);
  }
}

console.log(problems.length ? `\nNOT READY (${problems.length}): ${problems.join(' · ')}\n` : '\nREADY ✓  Open http://localhost:8787/test/rental.html and press the Paperwise button.\n');
process.exit(problems.length ? 1 : 0);
