// pnpm test:pdf — fillable PDF support (branch pdf-support). Needs `pnpm build` first.
//
//  1. Node: labels built for the test PDFs (tooltip / nearby text), the pdf-lib export (values in
//     the ORIGINAL fields, real "on" values, export/display dropdowns, XFA dropped, nothing
//     flattened), read back with pdf-lib, pdf.js and Apple PDFKit (macOS Preview's engine).
//  2. Real extension in Chromium: the viewer opens PDFs (all pages' fields at once), friendly
//     errors, the real engine drives it through the panel's real messaging (fill every kind,
//     sensitive fields typed by the user only, go_to_field on page 3, highlights), download is
//     locked until the review is done, then the downloaded file is checked like in 1.
//  3. Side panel: "Open a PDF" (file picker) and drag and drop open the viewer and the panel
//     restarts on it; a dropped non-PDF gets a friendly message.
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFRadioGroup, PDFTextField, type PDFField } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import puppeteer, { type Page } from 'puppeteer-core';
import { findBrowser, ROOT, serveTestPages } from './lib/test-browser.mjs';
import { PDF_COPY } from '../src/pdf/copy';
import { fillPdf, type PdfValue } from '../src/pdf/export';
import { extractPdf, readTooltips } from '../src/pdf/extract';
import { buildLabels } from '../src/pdf/labels';
import { isReviewDone } from '../src/pdf/review';
import { filledName, fileNameOf, looksLikePdfUrl } from '../src/pdf/urls';
import { initialFormState } from '../src/shared/form-state';

let failures = 0;
let passes = 0;
const check = (cond: unknown, msg: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for a line in the debug panel's log. The panel reloads itself on the way: retry across it. */
async function logShows(page: Page, re: RegExp, timeoutMs = 20_000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (re.test(text)) return true;
    await sleep(200);
  }
  return false;
}

const PDF_DIR = join(ROOT, 'server', 'public', 'test', 'pdf');
const EXT = join(ROOT, '.output', 'chrome-mv3');
const read = (name: string) => new Uint8Array(readFileSync(join(PDF_DIR, name)));
const R = (s: string) => `topmostSubform[0].${s}`;

// ---------------------------------------------------------------------------------------------
// Reading a PDF back
// ---------------------------------------------------------------------------------------------

function valueOf(f: PDFField): string {
  if (f instanceof PDFTextField) return f.getText() ?? '';
  if (f instanceof PDFDropdown) return f.acroField.getValues().map((v) => v.decodeText()).join('|');
  if (f instanceof PDFCheckBox || f instanceof PDFRadioGroup) {
    const v = f.acroField.dict.lookup(PDFName.of('V'));
    return v instanceof PDFName ? v.decodeText() : 'Off';
  }
  return '';
}

async function readBack(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const acro = doc.catalog.lookup(PDFName.of('AcroForm')) as import('pdf-lib').PDFDict;
  const hasXfa = acro.has(PDFName.of('XFA'));
  const needAppearances = String(acro.lookup(PDFName.of('NeedAppearances')) ?? '');
  const form = doc.getForm();
  const fields = new Map(form.getFields().map((f) => [f.getName(), f]));
  const value = (name: string) => (fields.has(name) ? valueOf(fields.get(name)!) : '(missing)');
  const states = (name: string) =>
    (fields.get(name) as PDFRadioGroup | PDFCheckBox).acroField.getWidgets().map((w) => w.getAppearanceState()?.decodeText() ?? '');
  const sizes = doc.getPages().map((p) => p.getSize());
  return { doc, hasXfa, needAppearances, fields, value, states, sizes };
}

/** pdf.js's view of the values (another reader's parser). */
async function pdfjsValues(bytes: Uint8Array): Promise<Record<string, string>> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const objs = (await doc.getFieldObjects()) as Map<string, { value: unknown; type: string }[]> | null; // a Map since pdf.js 6
  const out: Record<string, string> = {};
  for (const [name, list] of objs ?? []) {
    const withValue = list.find((o) => o.value !== undefined && o.value !== '' && o.value !== 'Off') ?? list[0];
    out[name] = String(withValue?.value ?? '');
  }
  if (!objs) {
    // No field index in the file (some writers leave it out): read each page's widgets.
    for (let n = 1; n <= doc.numPages; n++) {
      for (const a of (await (await doc.getPage(n)).getAnnotations()) as { fieldName?: string; fieldValue?: unknown }[]) {
        if (a.fieldName && a.fieldValue && a.fieldValue !== 'Off') out[a.fieldName] = String(a.fieldValue);
      }
    }
  }
  return out;
}

interface KitField {
  name: string;
  page: number;
  value: string;
  on: boolean;
  ink: number;
}
const hasPdfKit = process.platform === 'darwin' && existsSync('/usr/bin/swift');

/** Apple PDFKit (macOS Preview): values and ink drawn inside each field. */
function pdfkit(bytes: Uint8Array): KitField[] | null {
  if (!hasPdfKit) return null;
  const file = join(mkdtempSync(join(tmpdir(), 'pw-pdfkit-')), 'f.pdf');
  writeFileSync(file, bytes);
  const out = execFileSync('swift', [join(ROOT, 'scripts', 'lib', 'pdfkit-check.swift'), file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return (JSON.parse(out) as { fields: KitField[] }).fields;
}

// ---------------------------------------------------------------------------------------------
// Expected results for the rental test PDF (shared by the Node and the browser runs)
// ---------------------------------------------------------------------------------------------

const RENTAL_ANSWERS = {
  name: 'Amina Diallo',
  state: 'QC',
  housing: '2',
  pets: 'On', // this box's real "on" value (not "Yes")
  consent: 'Consent',
  ssn: '123-45-6789',
  income: '3200',
};

async function verifyRental(bytes: Uint8Array, label: string, original: Uint8Array) {
  const b = await readBack(bytes);
  const o = await readBack(original);
  check(b.value(R('Page1[0].f1_01[0]')) === RENTAL_ANSWERS.name, `${label}: text written into the original field (${b.value(R('Page1[0].f1_01[0]'))})`);
  check(b.value(R('Page1[0].dd1[0]')) === 'QC', `${label}: dropdown stores the export value "QC" (shown as Quebec)`);
  // This radio group lists its export values in /Opt (1, 2, 3): buttons are named by position.
  check(b.states(R('Page1[0].rb1[0]')).join(',') === 'Off,1,Off', `${label}: radio "2" (Own) → only the 2nd button on (${b.states(R('Page1[0].rb1[0]')).join(',')})`);
  check(b.value(R('Page2[0].c2_1[0]')) === 'On', `${label}: checkbox uses its real "on" value "On" (${b.value(R('Page2[0].c2_1[0]'))})`);
  check(b.value(R('Page3[0].c3_1[0]')) === 'Consent', `${label}: consent checkbox = its "on" value "Consent"`);
  check(b.value(R('Page3[0].f3_01[0]')) === RENTAL_ANSWERS.ssn, `${label}: SSN typed by the user is in the file (local download only)`);
  check(b.value(R('Header[0].ApplicantName[0]')) === RENTAL_ANSWERS.name, `${label}: field shown on two pages = one value`);
  check(b.value(R('Page3[0].f3_03[0]')) === '' && b.value(R('Page1[0].f1_03[0]')) === '', `${label}: fields never answered stay empty`);
  check(b.fields.size === o.fields.size, `${label}: not flattened: every field is still a field (${b.fields.size}/${o.fields.size})`);
  check(JSON.stringify(b.sizes) === JSON.stringify(o.sizes), `${label}: same pages, same sizes (${b.sizes.length} pages)`);
  check(b.needAppearances === 'true', `${label}: NeedAppearances set (readers redraw from values)`);

  const js = await pdfjsValues(bytes);
  check(js[R('Page1[0].f1_01[0]')] === RENTAL_ANSWERS.name && js[R('Page1[0].dd1[0]')] === 'QC', `${label}: pdf.js reads the same values (${js[R('Page1[0].dd1[0]')]}, radio ${js[R('Page1[0].rb1[0]')]})`);

  const kit = pdfkit(bytes);
  if (kit) {
    const k = (name: string) => kit.filter((f) => f.name === name);
    const nameField = k(R('Page1[0].f1_01[0]'))[0];
    check(nameField?.value === RENTAL_ANSWERS.name && nameField.ink > 0.01, `${label}: PDFKit (Preview) shows the name (ink ${(nameField?.ink ?? 0).toFixed(3)})`);
    const ssnField = k(R('Page3[0].f3_01[0]'))[0];
    check(!!ssnField && ssnField.ink > 0.01, `${label}: PDFKit draws the SSN (ink ${(ssnField?.ink ?? 0).toFixed(3)})`);
    const dd = k(R('Page1[0].dd1[0]'))[0];
    check(!!dd && dd.ink > 0.01, `${label}: PDFKit draws the dropdown choice "${dd?.value}" (ink ${(dd?.ink ?? 0).toFixed(3)})`);
    const radios = k(R('Page1[0].rb1[0]'));
    check(radios.map((r) => r.on).join(',') === 'false,true,false', `${label}: PDFKit shows the 2nd radio button on`);
    check(k(R('Page2[0].c2_1[0]'))[0]?.on && k(R('Page3[0].c3_1[0]'))[0]?.on, `${label}: PDFKit shows both checkboxes checked`);
    const blank = k(R('Page3[0].f3_03[0]'))[0];
    check(blank?.ink === 0, `${label}: PDFKit: an unanswered field stays blank`);
  }
}

try {
  // =============================================================================================
  console.log('\n=== 1. Labels for the test PDFs (tooltip, else the text next to the field)');
  for (const [file, expected] of [
    [
      'rental-application.pdf',
      {
        [R('Page1[0].f1_01[0]')]: ["Applicant's full legal name (first, middle, last)", 'tooltip'],
        [R('Page1[0].f1_02[0]')]: ['2 Date of birth (MM/DD/YYYY)', 'left'],
        [R('Page1[0].f1_03[0]')]: ['3 Email address', 'above'],
        [R('Page1[0].dd1[0]')]: ['5 State / Province', 'left'],
        [R('Page1[0].rb1[0]')]: ['6 Do you currently rent or own your home?', 'above'],
        [R('Page2[0].c2_1[0]')]: ['I have pets', 'right'],
        [R('Page3[0].f3_01[0]')]: ['9 Social Security Number', 'left'],
        [R('Page3[0].c3_1[0]')]: ['I authorize the landlord to obtain my credit report.', 'tooltip'],
      },
    ],
    [
      'fw9.pdf',
      {
        [R('Page1[0].f1_02[0]')]: ['2 Business name/disregarded entity name, if different from above.', 'above'],
        [R('Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]')]: ['Individual/sole proprietor', 'right'],
        [R('Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]')]: ['Other (see instructions)', 'left'],
        [R('Page1[0].f1_05[0]')]: ['Exempt payee code (if any)', 'left'],
        [R('Page1[0].f1_11[0]')]: ['Social security number (part 1 of 3)', 'above'],
        [R('Page1[0].f1_13[0]')]: ['Social security number (part 3 of 3)', 'above'],
        [R('Page1[0].Address_ReadOrder[0].f1_08[0]')]: ['6 City, state, and ZIP code', 'above'],
      },
    ],
  ] as const) {
    const bytes = read(file);
    const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0, standardFontDataUrl: join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/' }).promise;
    const { widgets, texts } = await extractPdf(doc, await readTooltips(bytes));
    const labels = buildLabels(widgets, texts);
    for (const [name, [label, source]] of Object.entries(expected)) {
      const got = labels.fields.get(name);
      check(got?.label === label && got.source === source, `${file}: ${name.replace('topmostSubform[0].', '')} → "${got?.label}" [${got?.source}]`);
    }
    if (file === 'rental-application.pdf') {
      const radios = widgets.filter((w) => w.fieldName === R('Page1[0].rb1[0]')).map((w) => `${w.exportValue}=${labels.options.get(w.annotationId)}`);
      check(radios.join(' ') === '1=Rent 2=Own 3=Other', `radio options from the text next to each button: ${radios.join(' ')}`);
    }
  }

  // =============================================================================================
  console.log('\n=== 2. Export with pdf-lib (Node), read back by pdf-lib, pdf.js and PDFKit');
  const rental = read('rental-application.pdf');
  const values: PdfValue[] = [
    { fieldName: R('Page1[0].f1_01[0]'), kind: 'text', value: RENTAL_ANSWERS.name },
    { fieldName: R('Page1[0].dd1[0]'), kind: 'select', value: RENTAL_ANSWERS.state },
    { fieldName: R('Page1[0].rb1[0]'), kind: 'radio', value: RENTAL_ANSWERS.housing },
    { fieldName: R('Page2[0].c2_1[0]'), kind: 'checkbox', value: RENTAL_ANSWERS.pets },
    { fieldName: R('Page3[0].c3_1[0]'), kind: 'checkbox', value: RENTAL_ANSWERS.consent },
    { fieldName: R('Page3[0].f3_01[0]'), kind: 'text', value: RENTAL_ANSWERS.ssn },
    { fieldName: R('Header[0].ApplicantName[0]'), kind: 'text', value: RENTAL_ANSWERS.name },
    { fieldName: R('Page2[0].f2_02[0]'), kind: 'text', value: RENTAL_ANSWERS.income },
    // Characters Helvetica can't draw: written, drawn by readers from NeedAppearances.
    { fieldName: R('Page2[0].f2_01[0]'), kind: 'text', value: 'Nguyễn Café' },
    { fieldName: 'not.a.field', kind: 'text', value: 'x' },
  ];
  const report = await fillPdf(rental, values);
  check(report.written.length === 9, `9 answers written (${report.written.length})`);
  check(report.skipped.length === 1 && report.skipped[0]!.fieldName === 'not.a.field', 'an unknown field is reported, not fatal');
  check(report.noAppearance.join() === R('Page2[0].f2_01[0]'), `"Nguyễn" can't be drawn with the standard font: left to readers (${report.noAppearance.length})`);
  check((await readBack(report.bytes)).value(R('Page2[0].f2_01[0]')) === 'Nguyễn Café', 'its value is still written exactly');
  await verifyRental(report.bytes, 'node export', rental);
  const bad = await fillPdf(rental, [{ fieldName: R('Page1[0].dd1[0]'), kind: 'select', value: 'ZZ' }]);
  check(bad.skipped[0]?.reason.includes('not one of the choices'), `a choice the dropdown doesn't have is refused (${bad.skipped[0]?.reason})`);
  const none = await fillPdf(rental, []);
  check((await readBack(none.bytes)).needAppearances === '' && none.written.length === 0, 'nothing answered → nothing changed (no NeedAppearances)');

  const w9 = read('fw9.pdf');
  const w9Report = await fillPdf(w9, [
    { fieldName: R('Page1[0].f1_01[0]'), kind: 'text', value: RENTAL_ANSWERS.name },
    { fieldName: R('Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]'), kind: 'checkbox', value: '1' },
    { fieldName: R('Page1[0].f1_11[0]'), kind: 'text', value: '123' },
    { fieldName: R('Page1[0].f1_12[0]'), kind: 'text', value: '45' },
    { fieldName: R('Page1[0].f1_13[0]'), kind: 'text', value: '6789' },
  ]);
  const w9Back = await readBack(w9Report.bytes);
  check(!w9Back.hasXfa && (await readBack(w9)).hasXfa, 'W-9: its XFA copy is dropped, so Acrobat shows the filled fields');
  check(w9Back.value(R('Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]')) === '1', 'W-9: checkbox set to its real "on" value "1"');
  check(w9Back.value(R('Page1[0].f1_12[0]')) === '45' && w9Back.fields.size === (await readBack(w9)).fields.size, 'W-9: SSN boxes written, nothing flattened');
  const w9Kit = pdfkit(w9Report.bytes);
  if (w9Kit) {
    const name = w9Kit.find((f) => f.name === R('Page1[0].f1_01[0]'));
    const box = w9Kit.find((f) => f.name === R('Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]'));
    check(name?.value === RENTAL_ANSWERS.name && name.ink > 0.01 && box?.on, `W-9: PDFKit shows the name (ink ${(name?.ink ?? 0).toFixed(3)}) and the checked box`);
  } else console.log('  (PDFKit checks skipped: not on macOS)');

  console.log('\n=== 3. Small rules');
  check(looksLikePdfUrl('https://www.irs.gov/pub/irs-pdf/fw9.pdf') && looksLikePdfUrl('file:///Users/a/Form.PDF') && !looksLikePdfUrl('https://x.com/pdf') && !looksLikePdfUrl('chrome://settings/x.pdf'), 'PDF tab detection by URL');
  check(filledName('fw9.pdf') === 'fw9-filled.pdf' && filledName('Lease Form.PDF') === 'Lease Form-filled.pdf', 'download name: original + "-filled.pdf"');
  check(fileNameOf('https://x.com/forms/W%209.pdf?v=2') === 'W 9.pdf', 'file name from a URL');
  const st = initialFormState('en');
  check(!isReviewDone(st), 'download locked before the review');
  check(!isReviewDone({ ...st, phase: 'review', agentMode: 'speaking', review: { sectionIds: ['s1', 's2'], currentSectionId: 's1' } }), '…locked while the review reads section 1 of 2');
  check(isReviewDone({ ...st, phase: 'review', agentMode: 'speaking', review: { sectionIds: ['s1', 's2'], currentSectionId: 's2' } }), '…open at the last section');
  check(isReviewDone({ ...st, phase: 'review', agentMode: 'off', review: { sectionIds: ['s1', 's2'], currentSectionId: 's1' } }), '…open when the conversation ends during the review');
  check(isReviewDone({ ...st, phase: 'done' }), '…open when the user said they are done');

  // =============================================================================================
  if (!existsSync(join(EXT, 'manifest.json'))) throw new Error('No build found: run `pnpm build` first.');
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(ROOT, 'scripts', 'test-pdf-entry.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    define: { 'import.meta.env.DEV': 'false' },
    banner: { js: 'globalThis.browser ??= chrome;' },
    plugins: [
      {
        name: 'alias',
        setup(b) {
          b.onResolve({ filter: /^@\// }, (a) => {
            const base = join(ROOT, 'src', a.path.slice(2));
            return { path: existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx` };
          });
          b.onResolve({ filter: /^wxt\// }, (a) => ({ path: a.path, external: true }));
        },
      },
    ],
  });
  const bundle = outputFiles[0]!.text;

  const { base: BASE, close: closeServer } = await serveTestPages();
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, pipe: true, enableExtensions: true });
  const downloads = mkdtempSync(join(tmpdir(), 'pw-downloads-'));
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  try {
    const extId = await browser.installExtension(EXT);
    const viewerBase = `chrome-extension://${extId}/pdf-viewer.html`;

    // The stand-in side panel: an extension page with the engine + the panel's messaging.
    const panel = await browser.newPage();
    await panel.goto(`chrome-extension://${extId}/mic-permission.html`);
    await panel.evaluate(bundle);
    await panel.evaluate(() => {
      const w = window as unknown as { __events: unknown[] };
      w.__events = [];
      chrome.runtime.onMessage.addListener((m, s) => void w.__events.push({ ...m, fromTab: s.tab?.id }));
    });

    async function openViewer(query: string) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const t0 = Date.now();
      await page.goto(`${viewerBase}?${query}`);
      await page.waitForFunction(() => (window as any).__paperwisePdf?.status().state !== 'loading', { timeout: 30_000 });
      const ms = Date.now() - t0;
      const tabId = await panel.evaluate(async (q) => (await chrome.tabs.query({})).find((t) => t.url?.includes(q))?.id, query);
      const status = await page.evaluate(() => (window as any).__paperwisePdf.status());
      return { page, tabId: tabId!, status, ms, errors };
    }
    const src = (file: string) => `src=${encodeURIComponent(`${BASE}/test/pdf/${file}`)}`;
    const toViewer = (tabId: number, msg: unknown) => panel.evaluate((id, m) => (window as any).__t.toContent(id, m), tabId, msg as object);
    const tool = (name: string, args: object) => panel.evaluate((n, a) => (window as any).__t.engines[0].callTool(n, a), name, args);
    const engineField = (id: string) => panel.evaluate((i) => (window as any).__t.engines[0].getState().fields[i], id);

    // ---------------------------------------------------------------------------------------
    console.log('\n=== 4. PDFs that can\'t be filled: friendly messages');
    for (const [file, code] of [
      ['no-fields.pdf', 'noFields'],
      ['xfa-only.pdf', 'xfa'],
      ['password.pdf', 'password'],
      ['corrupted.pdf', 'corrupted'],
      ['missing.pdf', 'unreadable'],
    ] as const) {
      const v = await openViewer(src(file));
      const shown = await v.page.$eval('#error', (e) => ((e as HTMLElement).hidden ? '' : e.textContent));
      const scan = await toViewer(v.tabId, { type: 'SCAN' });
      check(v.status.code === code && shown === PDF_COPY.en.errors[code] && scan.ok && scan.data.fields.length === 0, `${file}: "${shown}"`);
      await v.page.close();
    }
    const expired = await openViewer(`blob=${encodeURIComponent('blob:chrome-extension://x/gone')}&name=a.pdf`);
    check(expired.status.code === 'expired', `a dropped file whose panel is gone: "${PDF_COPY.en.errors.expired}"`);
    await expired.page.close();

    // ---------------------------------------------------------------------------------------
    console.log('\n=== 5. Rental PDF in the viewer, driven by the real engine');
    const v = await openViewer(src('rental-application.pdf'));
    check(v.status.state === 'ready' && v.status.fields === 14 && v.errors.length === 0, `opens in ${v.ms} ms: ${v.status.fields} fields, no page errors ${v.errors.join(' ')}`);
    const perPage = await v.page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => p.querySelectorAll('input, select, textarea').length));
    check(perPage.join(',') === '8,4,5', `every page's fields are in the page at once, not lazily (inputs per page: ${perPage.join(', ')})`);
    check(await v.page.$eval('#download', (b) => (b as HTMLButtonElement).disabled), 'Download filled PDF: locked before the review');

    await panel.evaluate((id) => (window as any).__t.makeEngine(id).then((e: unknown) => (window as any).__t.engines.push(e)), v.tabId);
    // Events from the viewer reach the engine, like in the side panel's controller.
    await panel.evaluate((tabId) => {
      chrome.runtime.onMessage.addListener((m, s) => {
        if (s.tab?.id === tabId && m.type === 'EVENT_USER_EDIT') void (window as any).__t.engines[0].userEdited(m);
      });
    }, v.tabId);
    const scan = await toViewer(v.tabId, { type: 'SCAN' });
    const ids = scan.data.fields.map((f: { id: string }) => f.id);
    check(ids.includes('pw-Page1-f1_01') && ids.includes('pw-Page3-f3_03') && !ids.some((i: string) => i.includes('zoom')), 'field ids from the PDF names (pw-Page1-f1_01 …), no toolbar controls');
    check(/^file:\/\/\/pdf\/[0-9a-f-]+$/.test(scan.data.url) && scan.data.pageTitle === 'Rental Application', `the scan names the PDF by its fingerprint + own title, not the viewer URL or file name (${scan.data.url.slice(0, 30)}…, "${scan.data.pageTitle}")`);
    const scanJson = JSON.stringify(scan.data);
    check(!scanJson.includes('%PDF') && scanJson.length < 20_000, `what would go to the server is the field structure only (${scanJson.length} bytes, no file content)`);

    const val = (sel: string) => v.page.$eval(sel, (e) => (e as HTMLInputElement).value);
    const byId = (id: string) => `[data-paperwise-id="${id}"]`;
    let r = await tool('fill_field', { id: 'pw-Page1-f1_01', value: RENTAL_ANSWERS.name, confidence: 0.95 });
    check(r.ok && (await val(byId('pw-Page1-f1_01'))) === RENTAL_ANSWERS.name, `fill_field text → on the PDF (${r.message ?? ''})`);
    r = await tool('fill_field', { id: 'pw-Page1-dd1', value: 'Quebec', confidence: 0.95 });
    check(r.ok && (await val(byId('pw-Page1-dd1'))) === 'QC', `fill_field dropdown "Quebec" → option QC (${r.message ?? ''})`);
    r = await tool('fill_field', { id: 'pw-Page1-rb1', value: 'Own', confidence: 0.95 });
    const checkedRadio = await v.page.evaluate(() => (document.querySelector('[data-paperwise-id="pw-Page1-rb1"]:checked') as HTMLInputElement | null)?.value);
    check(r.ok && checkedRadio === '2', `fill_field radio "Own" → export value 2 (${checkedRadio})`);
    r = await tool('fill_field', { id: 'pw-Page2-c2_1', value: 'yes', confidence: 0.95 });
    check(r.ok && (await v.page.$eval(byId('pw-Page2-c2_1'), (e) => (e as HTMLInputElement).checked)), 'fill_field checkbox → checked');
    r = await tool('fill_field', { id: 'pw-Page3-c3_1', value: 'yes', confidence: 0.95 });
    check(r.ok, `legal checkbox filled after the agent confirmed (${r.message ?? ''})`);
    r = await tool('fill_field', { id: 'pw-Header-ApplicantName', value: RENTAL_ANSWERS.name, confidence: 0.95 });
    const copies = await v.page.$$eval(byId('pw-Header-ApplicantName'), (els) => els.map((e) => (e as HTMLInputElement).value));
    check(r.ok && copies.length === 2 && copies.every((c) => c === RENTAL_ANSWERS.name), `a field printed on pages 2 and 3: one question, both copies filled (${copies.length})`);
    r = await tool('fill_field', { id: 'pw-Page2-f2_02', value: RENTAL_ANSWERS.income, confidence: 0.95 });
    check(r.ok, 'income filled');

    // Sensitive: never by voice. The user types it on the PDF.
    r = await tool('fill_field', { id: 'pw-Page3-f3_01', value: RENTAL_ANSWERS.ssn, confidence: 0.99 });
    check(!r.ok && (await val(byId('pw-Page3-f3_01'))) === '', `the agent can't fill the SSN (${r.message?.slice(0, 70)}…)`);
    r = await tool('request_typing', { id: 'pw-Page3-f3_01' });
    await sleep(800);
    const focused = await v.page.evaluate(() => document.activeElement?.getAttribute('data-paperwise-id'));
    const ssnBox = await v.page.$eval(byId('pw-Page3-f3_01'), (e) => {
      const b = e.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= window.innerHeight;
    });
    check(r.ok && focused === 'pw-Page3-f3_01' && ssnBox, 'request_typing: scrolls to page 3 and puts the cursor in the SSN box');
    await v.page.bringToFront();
    await v.page.keyboard.type(RENTAL_ANSWERS.ssn);
    await sleep(1000);
    const edits = (await panel.evaluate(() => (window as any).__events)).filter((e: { type: string; id: string }) => e.type === 'EVENT_USER_EDIT' && e.id === 'pw-Page3-f3_01');
    check(edits.length > 0 && edits.every((e: { value: string; sensitive: boolean }) => e.value === '' && e.sensitive), `typed SSN: the panel learns "filled", never the value (${edits.length} event(s))`);
    check((await engineField('pw-Page3-f3_01'))?.status === 'filled', 'engine marks the SSN filled');

    // go_to_field + highlights
    await v.page.evaluate(() => document.getElementById('scroller')!.scrollTo(0, 0));
    r = await tool('go_to_field', { id: 'pw-Page3-f3_03' });
    await sleep(900);
    const onScreen = await v.page.$eval(byId('pw-Page3-f3_03'), (e) => {
      const b = e.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= window.innerHeight;
    });
    const pageInfo = await v.page.$eval('#pageInfo', (e) => e.textContent);
    check(r.ok && onScreen && pageInfo === 'Page 3 of 3', `go_to_field scrolls to the right page (${pageInfo})`);
    r = await tool('flag_for_review', { id: 'pw-Page2-f2_02', reason: 'Is that per month?' });
    await sleep(300);
    const amber = await v.page.evaluate(() => !!document.querySelector('paperwise-ui')?.shadowRoot?.querySelector('[data-status="review"]'));
    check(r.ok && amber, 'flag_for_review: amber box drawn over the PDF field (in-page UI)');
    r = await tool('fill_field', { id: 'pw-Page2-f2_02', value: RENTAL_ANSWERS.income, confidence: 0.95 });

    // Zoom keeps the inputs (and what's in them)
    await v.page.click('#zoomIn');
    await sleep(300);
    const afterZoom = await val(byId('pw-Page1-f1_01'));
    const stillTagged = await v.page.$$eval('[data-paperwise-id]', (els) => els.length);
    check(afterZoom === RENTAL_ANSWERS.name && stillTagged === 17, `zoom: same inputs, values kept (${stillTagged} tagged inputs)`);

    r = await tool('start_review', {});
    check(r.ok, `start_review (${r.message?.slice(0, 50) ?? ''}…)`);
    check(await v.page.$eval('#download', (b) => (b as HTMLButtonElement).disabled), 'download still locked while the review runs');
    await panel.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'PDF_REVIEW_DONE', done: true }), v.tabId);
    await sleep(100);
    check(!(await v.page.$eval('#download', (b) => (b as HTMLButtonElement).disabled)), 'review done → "Download filled PDF" turns on');

    await v.page.click('#download');
    const file = join(downloads, 'rental-application-filled.pdf');
    for (let i = 0; i < 50 && !existsSync(file); i++) await sleep(100);
    check(existsSync(file), `downloaded as rental-application-filled.pdf (${readdirSync(downloads).join(', ')})`);
    if (existsSync(file)) {
      const downloaded = new Uint8Array(readFileSync(file));
      await verifyRental(downloaded, 'downloaded', rental);
      const b = await readBack(downloaded);
      check(b.value(R('Page2[0].f2_02[0]')) === RENTAL_ANSWERS.income && b.value(R('Page1[0].f1_02[0]')) === '', 'only answered fields changed');

      // Re-open the downloaded file in the viewer (as if the user dropped it on the panel).
      const blob = await panel.evaluate((b64) => {
        const bin = atob(b64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      }, Buffer.from(downloaded).toString('base64'));
      const again = await openViewer(`blob=${encodeURIComponent(blob)}&name=rental-application-filled.pdf`);
      const rescan = await toViewer(again.tabId, { type: 'SCAN' });
      const f = (id: string) => rescan.data.fields.find((x: { id: string }) => x.id === id);
      check(
        f('pw-Page1-f1_01')?.currentValue === RENTAL_ANSWERS.name && f('pw-Page1-dd1')?.currentValue === 'QC' && f('pw-Page1-rb1')?.currentValue === '2' && f('pw-Page2-c2_1')?.currentValue === 'true',
        're-opened in Paperwise: the answers are there',
      );
      check(f('pw-Page3-f3_01')?.filled && f('pw-Page3-f3_01')?.currentValue === '', '…and the SSN shows as filled, its value still never leaves the page');
      await again.page.close();
    }
    await v.page.close();

    // ---------------------------------------------------------------------------------------
    console.log('\n=== 6. IRS W-9 (real form, no tooltips)');
    const w = await openViewer(src('fw9.pdf'));
    check(w.status.state === 'ready' && w.status.fields === 23, `opens in ${w.ms} ms: ${w.status.fields} fields`);
    const w9Scan = await toViewer(w.tabId, { type: 'SCAN' });
    check(w9Scan.data.url !== scan.data.url, 'two PDFs → two different documents for the server (no mixed-up form maps)');
    await panel.evaluate(() => ((window as any).__t.engines = []));
    await panel.evaluate((id) => (window as any).__t.makeEngine(id).then((e: unknown) => (window as any).__t.engines.push(e)), w.tabId);
    r = await tool('fill_field', { id: 'pw-Page1-f1_01', value: RENTAL_ANSWERS.name, confidence: 0.95 });
    const r2 = await tool('fill_field', { id: 'pw-Page1-Boxes3a-b_ReadOrder-c1_1', value: 'yes', confidence: 0.95 });
    const r3 = await tool('fill_field', { id: 'pw-Page1-f1_11', value: '123', confidence: 0.95 });
    check(r.ok && r2.ok && !r3.ok, 'name + "Individual" box filled; SSN box refused by voice');
    for (const [id, part] of [['pw-Page1-f1_11', '123'], ['pw-Page1-f1_12', '45'], ['pw-Page1-f1_13', '6789']]) {
      await w.page.click(byId(id!));
      await w.page.keyboard.type(part!);
    }
    // The panel's done screen asks the viewer to save: refused before the review is done.
    const early = await panel.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'PDF_DOWNLOAD' }), w.tabId);
    check(!early.ok, 'panel "Download filled PDF" refused before the review is done');
    await panel.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'PDF_REVIEW_DONE', done: true }), w.tabId);
    await sleep(100);
    const fromPanel = await panel.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'PDF_DOWNLOAD' }), w.tabId);
    check(fromPanel.ok, 'panel "Download filled PDF" (done screen) saves the file');
    const w9File = join(downloads, 'fw9-filled.pdf');
    for (let i = 0; i < 50 && !existsSync(w9File); i++) await sleep(100);
    if (existsSync(w9File)) {
      const got = await readBack(new Uint8Array(readFileSync(w9File)));
      check(
        got.value(R('Page1[0].f1_01[0]')) === RENTAL_ANSWERS.name && got.value(R('Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]')) === '1' && got.value(R('Page1[0].f1_13[0]')) === '6789' && !got.hasXfa,
        'fw9-filled.pdf: name, box (on value "1"), typed SSN; XFA dropped',
      );
    } else check(false, 'fw9-filled.pdf downloaded');
    const boxPictures = await w.page.$$eval('.buttonWidgetAnnotation.checkBox canvas.annotationContent', (c) => c.length);
    check(boxPictures >= 8, `checkbox pictures sit in their own boxes, not on the page (${boxPictures}): unchecked boxes look empty`);
    await w.page.close();

    // ---------------------------------------------------------------------------------------
    console.log('\n=== 6b. A PDF locked against changes (owner password, opens without one)');
    // Made with macOS PDFKit: pdf-lib can't write encrypted files, so the viewer saves with pdf.js.
    const locked = await openViewer(src('owner-locked.pdf'));
    check(locked.status.state === 'ready' && locked.status.fields === 14, `opens: ${locked.status.fields} fields`);
    await toViewer(locked.tabId, { type: 'FILL', id: 'pw-Page1-f1_01', value: RENTAL_ANSWERS.name });
    await toViewer(locked.tabId, { type: 'FILL', id: 'pw-Page2-c2_1', value: 'yes' });
    await panel.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'PDF_REVIEW_DONE', done: true }), locked.tabId);
    await sleep(100);
    await locked.page.click('#download');
    const lockedFile = join(downloads, 'owner-locked-filled.pdf');
    for (let i = 0; i < 50 && !existsSync(lockedFile); i++) await sleep(100);
    if (existsSync(lockedFile)) {
      const lockedBytes = new Uint8Array(readFileSync(lockedFile));
      const js = await pdfjsValues(lockedBytes);
      const kit = pdfkit(lockedBytes);
      const kitName = kit?.find((f) => f.name === R('Page1[0].f1_01[0]'));
      check(js[R('Page1[0].f1_01[0]')] === RENTAL_ANSWERS.name && (!kit || (kitName?.value === RENTAL_ANSWERS.name && kitName.ink > 0.01)), `saved by pdf.js, still encrypted: pdf.js + PDFKit read the name (ink ${(kitName?.ink ?? 0).toFixed(3)})`);
      check(Buffer.from(lockedBytes).includes('/Encrypt'), 'the lock is kept');
    } else check(false, 'owner-locked-filled.pdf downloaded');
    await locked.page.close();

    // ---------------------------------------------------------------------------------------
    console.log('\n=== 7. Side panel: "Open a PDF" and drag and drop');
    const side = await browser.newPage();
    await side.goto(`chrome-extension://${extId}/sidepanel.html#debug`);
    await side.waitForSelector('input[type="file"]');
    const openText = await side.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Open a PDF'));
    check(openText, 'the panel has "Open a PDF"');
    const input = await side.$('input[type="file"]');
    await (input as import('puppeteer-core').ElementHandle<HTMLInputElement>).uploadFile(join(PDF_DIR, 'rental-application.pdf'));
    const panelSees = await logShows(side, /scanned 14 fields .* on file:\/\/\/pdf\//);
    const viewerTabs = await panel.evaluate(async () => (await chrome.tabs.query({})).filter((t) => t.url?.includes('pdf-viewer.html?blob=')).map((t) => decodeURIComponent(t.url!)));
    check(viewerTabs.some((u) => u.includes('name=rental-application.pdf')), 'picked file → opens in the viewer (new tab, read from a local blob: URL)');
    check(panelSees, 'the panel restarts on the viewer and scans the PDF (14 fields)');

    const side2 = await browser.newPage();
    await side2.goto(`chrome-extension://${extId}/sidepanel.html#debug`);
    await side2.waitForSelector('input[type="file"]');
    const overlay = await side2.evaluate(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      const shown = document.body.innerText.includes('Drop your PDF here');
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
      return { shown, error: document.body.innerText.includes("That file isn’t a PDF") };
    });
    check(overlay.shown && overlay.error, 'dragging shows "Drop your PDF here"; a non-PDF gets a friendly message');
    await side2.evaluate(async (url) => {
      const bytes = await (await fetch(url)).arrayBuffer();
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'fw9.pdf', { type: 'application/pdf' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, `${BASE}/test/pdf/fw9.pdf`);
    const dropped = await logShows(side2, /scanned 23 fields .* on file:\/\/\/pdf\//);
    check(dropped, 'dropped PDF → viewer opens, the panel scans it (W-9: 23 fields)');

    // ---------------------------------------------------------------------------------------
    console.log('\n=== 8. A tab showing a PDF in Chrome\'s viewer: "Fill this PDF with Paperwise"');
    // Headless Chrome has no PDF viewer (it downloads PDFs), so a small server stands in for a
    // tab showing a PDF: the tab gets a page at a .pdf URL, fetches of that URL get the real PDF.
    const fakeTab = createServer((req, res) => {
      if (req.headers['sec-fetch-dest'] === 'document') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<embed type="application/pdf">');
      else res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(Buffer.from(rental));
    });
    await new Promise<void>((r) => fakeTab.listen(0, '127.0.0.1', r));
    const fakeUrl = `http://127.0.0.1:${(fakeTab.address() as { port: number }).port}/forms/rental-application.pdf`;
    // The panel works on its window's active tab: load it in a background tab while the PDF tab is active.
    const pdfTab = await browser.newPage();
    await pdfTab.goto(fakeUrl);
    const side3 = await browser.newPage();
    await side3.goto(`chrome-extension://${extId}/sidepanel.html#debug`);
    await pdfTab.bringToFront();
    await side3.reload();
    const offered = await logShows(side3, /This tab is a PDF\.\s*Fill this PDF with Paperwise/);
    check(offered, `the panel offers "${PDF_COPY.en.fillThisPdf}"`);
    await side3.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Fill this PDF with Paperwise')?.click());
    const switched = await logShows(side3, /scanned 14 fields .* on file:\/\/\/pdf\//);
    check(switched && pdfTab.url().includes('/pdf-viewer.html?src='), 'click → the same tab opens the PDF in Paperwise\'s viewer and the panel scans it');
    fakeTab.close();
  } finally {
    await browser.close();
    closeServer();
  }
} catch (err) {
  failures++;
  console.error('ERROR', err);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
