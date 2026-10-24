/**
 * pnpm --dir server form-map:print [scan names…] [--lang en|fr|both] [--json] [--warm]
 *
 * Builds the form map for saved test-form scans (server/test-pages/scans/*.json, refreshed by
 * `pnpm scan:test-forms`) through the real streaming path, and prints WHEN each piece arrived
 * (skeleton, each section, title), then the readable map.
 * Cold by default: empty cache, disk cache off, so timings are honest. Scans run in order and
 * share the in-memory cache like one browsing session (rental-react then rental-react-expanded
 * maps only the 2 new fields).
 *   --lang    language(s) to build (default en)
 *   --json    also print the full JSON
 *   --warm    use the disk cache (shows cache-hit timings)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../src/paths.ts';
import type { FormMap, Language, ScanResult } from '../../src/shared/contract.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const langArg = args[args.indexOf('--lang') + 1];
const languages: Language[] = !args.includes('--lang') ? ['en'] : langArg === 'both' ? ['en', 'fr'] : [langArg === 'fr' ? 'fr' : 'en'];
const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--lang');
if (names.length === 0) names.push('rental', 'rental-react');

if (!flag('warm')) process.env.FORM_MAP_CACHE_FILE = '';
const { streamFormMap } = await import('../src/form-map.ts');

for (const language of languages) {
  for (const name of names) {
    const scan = JSON.parse(readFileSync(join(paths.scans, `${name}.json`), 'utf8')) as ScanResult;
    const line = '='.repeat(100);
    console.log(`\n${line}\n${name}  ·  ${scan.fields.length} fields  ·  ${language}\n${line}`);

    const done = await streamFormMap(scan, language, (u) => {
      const ready = u.map.sections.filter((s) => s.ready).length;
      const what = u.stage === 'section' && u.readySectionId ? `section ${u.readySectionId} ready` : u.stage;
      console.log(`  +${String(u.ms).padStart(5)} ms  ${what.padEnd(22)} sections ready ${ready}/${u.map.sections.length}${u.map.complete ? '  · COMPLETE' : ''}`);
    });

    const what = done.mode === 'new-fields' ? `new fields only: ${done.newFieldIds?.join(', ')}` : 'whole form';
    console.log(
      `\n  source: ${done.source} (${what}) · first section ${ms(done.firstSectionMs)} · complete ${ms(done.completeMs)} · all settled ${ms(done.ms)}` +
        (done.fallbackReason ? ` · fallback: ${done.fallbackReason}` : ''),
    );
    for (const p of done.parts) {
      console.log(
        `    part ${p.id}: ${p.fields} fields · ${p.ok ? 'ok' : 'FALLBACK'}${p.late ? ' (late)' : ''} at ${ms(p.ms)}` +
          (p.outputTokens ? ` · ${p.inputTokens} in / ${p.outputTokens} out tokens` : '') +
          (p.error ? ` · ${p.error}` : ''),
      );
    }
    printReadable(done.map);
    if (flag('json')) console.log(`\n--- Full form map JSON ---\n${JSON.stringify(done.map, null, 2)}`);
  }
}

function ms(v: number | undefined) {
  return v === undefined ? '—' : `${v} ms`;
}

function printReadable(map: FormMap) {
  console.log(`\n  ${map.title}   (~${map.estimatedMinutes} min, text: ${map.language}, form: ${map.formLanguage})`);
  if (map.summary) console.log(`  ${map.summary}`);
  for (const g of map.groups) console.log(`  Group ${g.id} [${g.fieldIds.join(', ')}]: ${g.plainQuestion}`);
  for (const section of map.sections) {
    console.log(`\n  ## ${section.title}${section.ready ? '' : '  (not ready)'}`);
    for (const id of section.fieldIds) {
      const f = map.fields.find((x) => x.id === id)!;
      const tags = [
        f.risk !== 'none' ? f.risk.toUpperCase() : '',
        f.groupId ? `group ${f.groupId}` : '',
        f.showIf ? `only if ${f.showIf.fieldId} ∈ [${f.showIf.oneOf.join(', ')}]` : '',
        f.formatHint ? `format: ${f.formatHint}` : '',
      ].filter(Boolean);
      console.log(`  ${String(f.order).padStart(2)}. ${f.id.padEnd(14)} ${f.plainQuestion}${tags.length ? `   (${tags.join(' · ')})` : ''}`);
      if (f.riskReason) console.log(`      ! ${f.riskReason}`);
    }
  }
}
