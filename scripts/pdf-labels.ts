// pnpm pdf:labels [file.pdf…] — the labels Paperwise builds for PDF fields: internal name (before)
// → label (after) and where it came from (tooltip / text left, right, above / name).
// Default: every PDF in server/public/test/pdf/.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ROOT } from './lib/test-browser.mjs';
import { extractPdf, readTooltips } from '../src/pdf/extract';
import { buildLabels, checkboxKidFields, labelKey, pdfFieldIds } from '../src/pdf/labels';

const dir = join(ROOT, 'server', 'public', 'test', 'pdf');
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.pdf')).map((f) => join(dir, f));
const fonts = join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';

for (const file of files) {
  const bytes = new Uint8Array(readFileSync(file));
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: fonts, verbosity: 0 }).promise;
  } catch (err) {
    console.log(`\n${basename(file)}: can't open (${(err as Error).name})`);
    continue;
  }
  const { widgets, texts } = await extractPdf(doc, await readTooltips(bytes));
  console.log(`\n${basename(file)}: ${widgets.length} widgets on ${doc.numPages} pages`);
  if (!widgets.length) continue;
  const labels = buildLabels(widgets, texts);
  const kids = checkboxKidFields(widgets);
  const ids = pdfFieldIds([...labels.fields.keys()]);
  const seen = new Set<string>();
  for (const w of widgets) {
    const key = labelKey(w, kids.has(w.fieldName));
    if (seen.has(key)) continue;
    seen.add(key);
    const l = labels.fields.get(key)!;
    const opts = w.kind === 'radio' ? widgets.filter((x) => x.fieldName === w.fieldName).map((x) => `${x.exportValue}="${labels.options.get(x.annotationId) ?? ''}"`).join(' ') : '';
    console.log(`  p${w.page} ${w.kind.padEnd(8)} ${w.fieldName}\n         → ${ids.get(key)}  "${l.label}"  [${l.source}]${opts ? `  options: ${opts}` : ''}`);
  }
}
