// Builds the fillable test PDFs into server/public/test/pdf/ (served at /test/pdf/…).
// Rerun after editing: node scripts/build-test-pdfs.mjs. The output is committed.
//
// rental-application.pdf: 3 pages, IRS-style internal names (f1_01[0]…) so labels must come from
//   tooltips (TU) or nearby text; a dropdown with export/display pairs, a radio group with export
//   values 1/2/3, checkboxes whose "on" value isn't "Yes", sensitive fields on page 3, and one
//   field shown on two pages (two widgets, one value).
// no-fields.pdf, xfa-only.pdf, password.pdf, corrupted.pdf: the friendly-error cases.
// Not built here: fw9.pdf, the IRS Form W-9 (a real government form, public domain), and
// owner-locked.pdf (rental-application.pdf encrypted with an owner password, made on macOS with
// scripts/lib/make-owner-locked.swift).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PDFDocument, PDFDict, PDFHexString, PDFName, StandardFonts, rgb } = require('pdf-lib');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'server', 'public', 'test', 'pdf');
mkdirSync(out, { recursive: true });

const LETTER = [612, 792];
const ink = rgb(0.1, 0.1, 0.1);

async function rentalApplication() {
  const doc = await PDFDocument.create();
  doc.setTitle('Rental Application');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();
  const pages = [doc.addPage(LETTER), doc.addPage(LETTER), doc.addPage(LETTER)];
  const text = (page, s, x, y, size = 10, f = font) => page.drawText(s, { x, y, size, font: f, color: ink });
  const tu = (field, s) => field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(s));
  const box = (page, x, y, w, h) => page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5 });
  const textField = (name, page, x, y, w, h = 16) => {
    box(page, x, y, w, h);
    const f = form.createTextField(name);
    f.addToPage(page, { x, y, width: w, height: h, font, borderWidth: 0 });
    return f;
  };
  /** A checkbox whose "on" export value is `on` (pdf-lib always creates "Yes"). */
  const checkBox = (name, page, x, y, on) => {
    const f = form.createCheckBox(name);
    f.addToPage(page, { x, y, width: 11, height: 11 });
    const ap = f.acroField.getWidgets()[0].dict.lookup(PDFName.of('AP'), PDFDict);
    for (const k of ['N', 'D']) {
      const d = ap.lookup(PDFName.of(k), PDFDict);
      const yes = d.get(PDFName.of('Yes'));
      d.delete(PDFName.of('Yes'));
      d.set(PDFName.of(on), yes);
    }
    return f;
  };

  pages.forEach((p, i) => {
    text(p, 'MAPLE STREET PROPERTIES', 50, 750, 9, bold);
    text(p, `Rental Application  -  Page ${i + 1} of 3`, 400, 750, 9);
  });

  // Page 1: applicant
  const p1 = pages[0];
  text(p1, 'Rental Application', 50, 710, 20, bold);
  text(p1, 'Section A. Applicant', 50, 680, 13, bold);
  text(p1, '1  Full legal name', 50, 652, 9);
  tu(textField('topmostSubform[0].Page1[0].f1_01[0]', p1, 50, 630, 400), "Applicant's full legal name (first, middle, last)");
  text(p1, '2  Date of birth (MM/DD/YYYY)', 50, 604);
  textField('topmostSubform[0].Page1[0].f1_02[0]', p1, 230, 600, 120);
  text(p1, '3  Email address', 50, 576, 9);
  textField('topmostSubform[0].Page1[0].f1_03[0]', p1, 50, 554, 300);
  text(p1, '4  Phone number', 50, 528);
  textField('topmostSubform[0].Page1[0].f1_04[0]', p1, 230, 524, 160);
  text(p1, '5  State / Province', 50, 494);
  box(p1, 230, 490, 160, 16);
  const state = form.createDropdown('topmostSubform[0].Page1[0].dd1[0]');
  // Export value / display pairs, like real forms: the PDF stores "QC", the reader shows "Quebec".
  state.acroField.dict.set(
    PDFName.of('Opt'),
    doc.context.obj(
      [['CA', 'California'], ['NY', 'New York'], ['TX', 'Texas'], ['QC', 'Quebec']].map(([v, d]) => [PDFHexString.fromText(v), PDFHexString.fromText(d)]),
    ),
  );
  state.addToPage(p1, { x: 230, y: 490, width: 160, height: 16, font, borderWidth: 0 });
  text(p1, '6  Do you currently rent or own your home?', 50, 460);
  const housing = form.createRadioGroup('topmostSubform[0].Page1[0].rb1[0]');
  [['1', 'Rent', 70], ['2', 'Own', 160], ['3', 'Other', 250]].forEach(([value, label, x]) => {
    housing.addOptionToPage(value, p1, { x, y: 436, width: 11, height: 11 });
    text(p1, label, x + 16, 438);
  });

  // Page 2: income + a field repeated in the header of pages 2 and 3
  const p2 = pages[1];
  const repeated = form.createTextField('topmostSubform[0].Header[0].ApplicantName[0]');
  tu(repeated, 'Applicant name (repeated on each page)');
  for (const p of [pages[1], pages[2]]) {
    text(p, 'Applicant:', 50, 722, 9);
    box(p, 100, 718, 250, 14);
    repeated.addToPage(p, { x: 100, y: 718, width: 250, height: 14, font, borderWidth: 0 });
  }
  text(p2, 'Section B. Employment and income', 50, 680, 13, bold);
  text(p2, '7  Employer name', 50, 652, 9);
  textField('topmostSubform[0].Page2[0].f2_01[0]', p2, 50, 630, 300);
  text(p2, '8  Gross monthly income ($)', 50, 604);
  textField('topmostSubform[0].Page2[0].f2_02[0]', p2, 230, 600, 120);
  checkBox('topmostSubform[0].Page2[0].c2_1[0]', p2, 50, 570, 'On');
  text(p2, 'I have pets', 68, 572);

  // Page 3: identity + consent
  const p3 = pages[2];
  text(p3, 'Section C. Identity and consent', 50, 680, 13, bold);
  text(p3, '9  Social Security Number', 50, 652);
  textField('topmostSubform[0].Page3[0].f3_01[0]', p3, 230, 648, 160);
  text(p3, '10  Bank account number (for deposit refunds)', 50, 622, 9);
  textField('topmostSubform[0].Page3[0].f3_02[0]', p3, 50, 600, 300);
  tu(checkBox('topmostSubform[0].Page3[0].c3_1[0]', p3, 50, 570, 'Consent'), 'I authorize the landlord to obtain my credit report.');
  text(p3, 'I authorize the landlord to obtain my credit report.', 68, 572);
  text(p3, '11  Today’s date', 50, 540);
  textField('topmostSubform[0].Page3[0].f3_03[0]', p3, 230, 536, 120);
  text(p3, 'Sign and submit this application yourself.', 50, 500, 9);

  return doc.save();
}

async function noFields() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage(LETTER).drawText('A plain PDF: a letter, with nothing to fill in.', { x: 50, y: 700, size: 12, font });
  return doc.save();
}

/** An XFA-only form: the form lives in XFA XML, the AcroForm has no fields (like LiveCycle forms). */
async function xfaOnly() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage(LETTER).drawText('Please wait... If this message is not replaced, your PDF viewer may not support XFA forms.', { x: 30, y: 700, size: 10, font });
  const xdp =
    '<?xml version="1.0" encoding="UTF-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/3.3/">' +
    '<subform name="form1"><field name="FullName"><ui><textEdit/></ui></field></subform></template></xdp:xdp>';
  const xfa = doc.context.register(doc.context.flateStream(xdp));
  doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [], XFA: xfa }));
  return doc.save();
}

/**
 * Needs a password to open: an Encrypt dictionary whose check value doesn't match the empty
 * password. (pdf-lib can't encrypt; readers ask for the password before reading anything else.)
 */
async function passwordProtected() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage(LETTER).drawText('Secret', { x: 50, y: 700, size: 12, font });
  const hex = (b) => PDFHexString.of(b.repeat(32));
  const enc = doc.context.obj({ Filter: 'Standard', V: 1, R: 2, Length: 40, O: hex('5a'), U: hex('a5'), P: -44 });
  doc.context.trailerInfo.Encrypt = doc.context.register(enc);
  const id = PDFHexString.of('0123456789abcdef0123456789abcdef');
  doc.context.trailerInfo.ID = doc.context.obj([id, id]);
  return doc.save({ useObjectStreams: false });
}

function corrupted() {
  return Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R\nthis file was cut off in the middle of a downl', 'latin1');
}

const files = {
  'rental-application.pdf': await rentalApplication(),
  'no-fields.pdf': await noFields(),
  'xfa-only.pdf': await xfaOnly(),
  'password.pdf': await passwordProtected(),
  'corrupted.pdf': corrupted(),
};
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(out, name), bytes);
  console.log(`${name.padEnd(24)} ${String(bytes.length).padStart(7)} bytes`);
}
