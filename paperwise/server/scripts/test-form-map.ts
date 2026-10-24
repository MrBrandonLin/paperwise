/**
 * pnpm --dir server test:form-map — checks the form-map pipeline WITHOUT a real Gemini key,
 * against a local fake Gemini (generateContent wire format):
 * request shape + privacy, parallel parts, streaming order, repairs, language, cache, shared
 * builds, slow part → fallback + late patch, failing part, hidden fields, new fields merged,
 * hedging, request budget, HTTP NDJSON route, disk cache.
 */
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paths } from '../src/paths.ts';
import type { FormMap, ScanResult } from '../../src/shared/contract.ts';
import type { FormMapStreamLine, FormMapUpdate } from '../../src/shared/messages.ts';

// --- Fake Gemini --------------------------------------------------------------------------
interface Seen {
  at: number;
  ids: string[];
  withMeta: boolean;
  system: string;
  input: string;
  body: string;
}
type Behavior = { delay?: number; status?: number; reply?: unknown };
let seen: Seen[] = [];
let behavior: (ids: string[], n: number) => Behavior = () => ({});

type Schema = { properties: Record<string, { items?: { properties?: { id?: { enum?: string[] } } } }> };

function defaultReply(ids: string[], sectionIds: string[], withMeta: boolean) {
  return {
    ...(withMeta ? { title: 'Friendly title', summary: 'Friendly summary.' } : {}),
    sections: sectionIds.map((id) => ({ id, t: `T ${id}` })),
    fields: ids.map((id) => ({
      id,
      q: `Q ${id}`,
      ...(id === 'pw-first' || id === 'pw-last' ? { g: 'What is your full name?' } : {}),
      ...(id === 'pw-credit' || id === 'pw-truth' ? { r: 'legal', w: 'Legal.' } : {}),
      ...(id === 'pw-employer' ? { s: { id: 'pw-status', v: ['employed', 'self'] } } : {}),
      // "true" for a yes/no radio: must be mapped to the option value "yes".
      ...(id === 'pw-pets-desc' ? { s: { id: 'pw-pets', v: ['true'] } } : {}),
    })),
  };
}

const fake = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'GET') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"name":"models/x"}');
    const parsed = JSON.parse(body);
    const schema = parsed.generationConfig.responseJsonSchema as Schema;
    const ids = schema.properties.fields!.items!.properties!.id!.enum!;
    const sectionIds = schema.properties.sections!.items!.properties!.id!.enum!;
    const withMeta = 'title' in schema.properties;
    seen.push({ at: Date.now(), ids, withMeta, system: parsed.systemInstruction.parts[0].text, input: parsed.contents[0].parts[0].text, body });
    const b = behavior(ids, seen.length);
    setTimeout(() => {
      if (b.status) {
        return res.writeHead(b.status, { 'content-type': 'application/json' }).end(`{"error":{"code":${b.status},"message":"fake ${b.status}","status":"X"}}`);
      }
      const reply = b.reply ?? defaultReply(ids, sectionIds, withMeta);
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 120, cachedContentTokenCount: 400 },
        }),
      );
    }, b.delay ?? 40);
  });
});
await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));

process.env.GEMINI_API_KEY = 'fake-key';
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
process.env.GEMINI_MODEL = 'test-model';
process.env.FORM_MAP_TIMEOUT_MS = '700';
process.env.FORM_MAP_HEDGE_MS = '0';
process.env.GEMINI_RPM = '1000';
process.env.FORM_MAP_CACHE_FILE = '';
delete process.env.GEMINI_THINKING_LEVEL;
const { streamFormMap, getFormMap, clearFormMapCache } = await import('../src/form-map.ts');
const { requestStructuredHedged } = await import('../src/gemini.ts');
const { RateLimiter } = await import('../src/rate-limit.ts');
const { FormMapCache } = await import('../src/form-map-cache.ts');
const { app } = await import('../src/app.ts');

// --- Helpers ------------------------------------------------------------------------------
let failures = 0;
let passes = 0;
const check = (cond: unknown, msg: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const load = (name: string) => JSON.parse(readFileSync(join(paths.scans, `${name}.json`), 'utf8')) as ScanResult;
const rental = load('rental');
const reactInitial = load('rental-react');
const reactExpanded = load('rental-react-expanded');
const at = (s: ScanResult, path: string): ScanResult => ({ ...s, url: `http://localhost:8787${path}` });
const field = (m: FormMap, id: string) => m.fields.find((f) => f.id === id)!;
const reset = () => {
  seen = [];
  behavior = () => ({});
};

try {
  // -----------------------------------------------------------------------------------------
  console.log('\n=== Whole form: parallel parts, streamed, nothing private sent');
  reset();
  behavior = (ids) => ({ delay: ids.includes('pw-movein') ? 300 : 60 }); // one slower part
  const withValues: ScanResult = {
    ...at(rental, '/test/a.html?email=zelda.private%40example.com#step2'),
    fields: rental.fields.map((f) => (f.kind === 'text' || f.kind === 'email' ? { ...f, currentValue: 'Zelda-Private-Value', filled: true } : f)),
  };
  const updates: FormMapUpdate[] = [];
  const d1 = await streamFormMap(withValues, 'en', (u) => updates.push(u));
  check(d1.source === 'gemini' && d1.mode === 'full', `source ${d1.source}, mode ${d1.mode}`);
  check(seen.length === 4, `4 parts → 4 requests, title/summary inside the first (got ${seen.length})`);
  check(seen.filter((r) => r.withMeta).length === 1, 'exactly one request also writes title + summary');
  const spread = Math.max(...seen.map((r) => r.at)) - Math.min(...seen.map((r) => r.at));
  check(spread < 100, `all parts sent in parallel (spread ${spread} ms)`);
  check(updates[0]?.stage === 'skeleton' && updates[0].ms < 50, `skeleton first, at ${updates[0]?.ms} ms`);
  check(updates[0]!.map.fields.length === 15 && !updates[0]!.map.complete, 'skeleton has every field, not complete');
  const readyCounts = updates.map((u) => u.map.sections.filter((s) => s.ready).length);
  check(readyCounts.join(',') === [...readyCounts].sort((a, b) => a - b).join(','), `sections become ready one by one (${readyCounts.join(' → ')})`);
  check((d1.firstSectionMs ?? 0) < (d1.completeMs ?? 0) - 150, `first section (${d1.firstSectionMs} ms) well before complete (${d1.completeMs} ms)`);
  check(d1.map.complete && d1.map.sections.every((s) => s.ready), 'final map complete, all sections ready');
  const all = seen.map((r) => r.body).join('\n');
  check(!all.includes('Zelda-Private-Value'), 'no field values sent');
  check(!all.includes('zelda.private') && !all.includes('step2'), 'no query string / hash sent');
  check(!all.includes('currentValue') && !all.includes('"filled"'), 'no currentValue / filled keys');
  check(seen.every((r) => r.system === seen[0]!.system), 'same system prompt in every call (implicit prompt cache)');
  check(seen.every((r) => r.input.includes('simple English')), 'English requested');
  check(!all.includes('explanation'), 'no explanations requested');
  check(d1.map.title === 'Friendly title' && d1.map.summary === 'Friendly summary.', 'title + summary from the first part');
  check(field(d1.map, 'pw-first').plainQuestion === 'Q pw-first', 'Gemini questions applied');
  check(field(d1.map, 'pw-ssn').risk === 'sensitive', 'SSN stays sensitive (scanner flag)');
  check(d1.map.groups.length === 1 && d1.map.groups[0]!.plainQuestion === 'What is your full name?', 'group from the shared g question');
  check(field(d1.map, 'pw-first').groupId === d1.map.groups[0]!.id && field(d1.map, 'pw-last').groupId === d1.map.groups[0]!.id, 'both name fields in the group');
  check(JSON.stringify(field(d1.map, 'pw-employer').showIf) === JSON.stringify({ fieldId: 'pw-status', oneOf: ['employed', 'self'] }), 'condition on employer');
  check(JSON.stringify(field(d1.map, 'pw-pets-desc').showIf) === JSON.stringify({ fieldId: 'pw-pets', oneOf: ['yes'] }), '"true" mapped to the yes option');
  check(field(d1.map, 'pw-credit').risk === 'legal' && field(d1.map, 'pw-credit').riskReason === 'Legal.', 'legal risk + reason');
  check(field(d1.map, 'pw-dob').formatHint === 'YYYY-MM-DD', 'format hints computed locally');
  check(d1.map.fields.every((f, i) => f.order === i + 1), 'page order');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Messy output is repaired');
  reset();
  behavior = (ids) =>
    ids.includes('pw-first')
      ? {
          reply: {
            title: 'T',
            summary: 'S',
            sections: [{ id: 's1', t: 'About you' }],
            fields: [
              { id: 'pw-first', q: 'First?' },
              { id: 'pw-first', q: 'duplicate' },
              { id: 'pw-ghost', q: '?' },
              { id: 'pw-ssn', q: 'Type it yourself.', r: 'important', w: 'x' },
              { id: 'pw-email', q: 'Email?', g: 'lonely group', s: { id: 'pw-email', v: ['x'] } },
            ],
          },
        }
      : {};
  const d2 = await getFormMap(at(rental, '/test/messy.html'));
  check(field(d2.map, 'pw-first').plainQuestion === 'First?', 'first answer kept, duplicate dropped');
  check(!d2.map.fields.some((f) => f.id === 'pw-ghost'), 'unknown field dropped');
  check(field(d2.map, 'pw-last').plainQuestion === 'Last name', 'missing field keeps its label');
  check(field(d2.map, 'pw-ssn').risk === 'sensitive' && field(d2.map, 'pw-ssn').plainQuestion === 'Type it yourself.', 'sensitive risk cannot be lowered');
  check(!field(d2.map, 'pw-email').showIf, 'self-condition dropped');
  check(!d2.map.groups.some((g) => g.fieldIds.includes('pw-email')), 'one-field group dropped');
  check(d2.map.sections.find((s) => s.id === 's1')?.title === 'About you', 'section title applied');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Language: French text, cached per language');
  reset();
  const fr = await getFormMap(at(rental, '/test/a.html'), 'fr');
  check(fr.source === 'gemini' && fr.map.language === 'fr' && seen.length === 4, `French built separately (${fr.source}, ${seen.length} requests)`);
  check(seen.every((r) => r.input.includes('French')), 'French requested');
  check(field(fr.map, 'pw-ssn').plainQuestion.startsWith('Q '), 'sensitive label sent, question written by Gemini');
  reset();
  const en2 = await getFormMap(at(rental, '/test/a.html'), 'en');
  const fr2 = await getFormMap(at(rental, '/test/a.html?x=1'), 'fr');
  check(en2.source === 'cache' && fr2.source === 'cache' && seen.length === 0, `both languages cached (${en2.source}/${fr2.source}, ${seen.length} requests)`);

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Two requests at once → one build');
  reset();
  const [a1, a2] = await Promise.all([getFormMap(at(rental, '/test/two.html')), getFormMap(at(rental, '/test/two.html'))]);
  check(a1.source === 'gemini' && a2.source === 'gemini' && seen.length === 4, `shared build (${seen.length} requests)`);

  // -----------------------------------------------------------------------------------------
  console.log('\n=== One part slower than the limit → its labels now, Gemini later');
  reset();
  behavior = (ids) => ({ delay: ids.includes('pw-credit') ? 1200 : 50 });
  const slowUpdates: FormMapUpdate[] = [];
  const s1 = await streamFormMap(at(rental, '/test/slow.html'), 'en', (u) => slowUpdates.push(u));
  check((s1.completeMs ?? 0) >= 690 && (s1.completeMs ?? 0) < 900, `complete at the limit (${s1.completeMs} ms), not waiting for the slow part`);
  const atComplete = slowUpdates.find((u) => u.map.complete)!.map;
  check(field(atComplete, 'pw-credit').plainQuestion.startsWith('I authorize'), 'slow part shows the label meanwhile');
  check(field(atComplete, 'pw-first').plainQuestion === 'Q pw-first', 'other parts already have Gemini questions');
  check(slowUpdates.some((u) => u.stage === 'late') && field(s1.map, 'pw-credit').plainQuestion === 'Q pw-credit', 'late answer streamed in');
  check(s1.source === 'gemini', 'everything ended up from Gemini → cached');
  reset();
  check((await getFormMap(at(rental, '/test/slow.html'))).source === 'cache' && seen.length === 0, 'next visit: cache');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== One part fails → only that part falls back, not cached');
  reset();
  behavior = (ids) => (ids.includes('pw-movein') ? { status: 400 } : {});
  const e1 = await getFormMap(at(rental, '/test/error.html'));
  check(e1.source === 'mixed', `source ${e1.source}`);
  check(field(e1.map, 'pw-movein').plainQuestion === 'Desired move-in date' && field(e1.map, 'pw-first').plainQuestion === 'Q pw-first', 'failed part has labels, others Gemini');
  check(e1.map.complete, 'map still complete');
  reset();
  const e2 = await getFormMap(at(rental, '/test/error.html'));
  check(e2.source === 'gemini' && seen.length === 4, 'not cached: next visit tries Gemini again');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Hidden fields: in the first map; showing one = no new call');
  reset();
  const h1 = await getFormMap(at(rental, '/test/hidden.html'));
  check(seen.some((r) => r.input.includes('"hidden":true')), 'hidden fields sent marked hidden');
  check(!!field(h1.map, 'pw-employer').showIf, 'hidden employer has its question + condition from the start');
  reset();
  const shown = at({ ...rental, fields: rental.fields.map((f) => (f.id === 'pw-employer' ? { ...f, visible: true } : f)) }, '/test/hidden.html');
  const h2 = await getFormMap(shown);
  check(h2.source === 'cache' && seen.length === 0 && h2.map === h1.map, `employer shown → ${h2.source}, ${seen.length} requests`);

  // -----------------------------------------------------------------------------------------
  console.log('\n=== New fields (React): only they are mapped, merged, never re-mapped');
  reset();
  const n1 = await getFormMap(at(reactInitial, '/test/react.html'));
  const before = JSON.parse(JSON.stringify(n1.map)) as FormMap;
  reset();
  const nUpdates: FormMapUpdate[] = [];
  const n2 = await streamFormMap(at(reactExpanded, '/test/react.html'), 'en', (u) => nUpdates.push(u));
  check(n2.mode === 'new-fields' && JSON.stringify(n2.newFieldIds) === '["pw-employer","pw-pets-desc"]', `mode ${n2.mode}: ${n2.newFieldIds?.join(', ')}`);
  check(seen.length === 1 && JSON.stringify(seen[0]!.ids) === '["pw-employer","pw-pets-desc"]', 'one request, only the 2 new fields');
  check(!seen[0]!.withMeta, 'no title/summary rewrite');
  check(nUpdates[0]!.map.fields.length === 15 && !nUpdates[0]!.map.complete, 'merged skeleton at once, not complete yet');
  const m = n2.map;
  check(before.fields.every((o) => JSON.stringify({ ...field(m, o.id), order: 0 }) === JSON.stringify({ ...o, order: 0 })), 'existing fields unchanged (only order shifts)');
  check(m.title === before.title && JSON.stringify(m.groups) === JSON.stringify(before.groups), 'title + groups unchanged');
  check(field(m, 'pw-employer').order === field(m, 'pw-status').order + 1, 'employer right after status');
  check(field(m, 'pw-pets-desc').order === field(m, 'pw-pets').order + 1, 'pets description right after pets');
  const sectionOf = (id: string) => m.sections.find((s) => s.fieldIds.includes(id))?.id;
  check(sectionOf('pw-employer') === sectionOf('pw-status') && sectionOf('pw-pets-desc') === sectionOf('pw-pets'), 'new fields in their neighbour sections');
  check(m.sections.flatMap((s) => s.fieldIds).length === 15, 'every field in exactly one section');
  check(m.complete && m.sections.every((s) => s.ready), 'complete again');
  reset();
  const back = [await getFormMap(at(reactInitial, '/test/react.html')), await getFormMap(at(reactExpanded, '/test/react.html'))];
  check(back.every((r) => r.source === 'cache') && seen.length === 0 && back[0]!.map.fields.length === 15, 'back and forth: cache, page map keeps all 15');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Hedging: a slow request gets a twin; the first answer wins');
  reset();
  behavior = (_ids, n) => ({ delay: n === 1 ? 1500 : 50 });
  const t0 = Date.now();
  const tinySchema = {
    type: 'object',
    properties: { sections: { items: { properties: { id: { enum: ['s1'] } } } }, fields: { items: { properties: { id: { enum: ['a'] } } } } },
  };
  const hedged = await requestStructuredHedged({ system: 's', input: 'i', schema: tinySchema }, 200);
  const took = Date.now() - t0;
  check(hedged.attempt === 2 && took < 700, `hedge won after ${took} ms (attempt ${hedged.attempt})`);
  check(seen.length === 2, '2 requests sent');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Request budget');
  const rl = new RateLimiter(4, 2);
  check(rl.tryAcquire('user') && rl.tryAcquire('hedge'), 'slots free: user + hedge go');
  check(!rl.tryAcquire('hedge'), 'hedge refused once only the reserve is left');
  let bgStarted = false;
  void rl.acquire('background').then(() => (bgStarted = true));
  await sleep(50);
  check(!bgStarted, 'background waits instead of using the reserve');
  await rl.acquire('user');
  check(rl.available() === 1, `user may use a reserved slot (left ${rl.available()})`);

  // -----------------------------------------------------------------------------------------
  console.log('\n=== HTTP route streams NDJSON');
  reset();
  clearFormMapCache();
  const res = await app.request('/form-map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scan: at(rental, '/test/http.html'), language: 'fr' }),
  });
  const lines = (await res.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as FormMapStreamLine);
  check(res.headers.get('content-type')?.includes('ndjson'), 'NDJSON content type');
  check(lines[0]?.type === 'update' && (lines[0] as FormMapUpdate).stage === 'skeleton', 'first line: skeleton');
  check(lines.at(-1)?.type === 'done' && lines.at(-1)!.map.language === 'fr', 'last line: done, French');
  check(lines.filter((l) => l.type === 'update').length >= 5, `progress lines streamed (${lines.length} lines)`);
  const bad = await app.request('/form-map', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  check(bad.status === 400, 'bad body → 400');

  // -----------------------------------------------------------------------------------------
  console.log('\n=== Disk cache survives a restart');
  const file = join(mkdtempSync(join(tmpdir(), 'pw-cache-')), 'maps.json');
  const c1 = new FormMapCache(file);
  c1.set('k|en', d1.map);
  await sleep(450);
  check(JSON.stringify(new FormMapCache(file).get('k|en')) === JSON.stringify(d1.map), 'saved and reloaded');
} finally {
  fake.close();
}

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nALL ${passes} PASSED`);
process.exit(failures ? 1 : 0);
