import {
  PDFArray,
  PDFBool,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFHexString,
  PDFNumber,
  PDFString,
  PDFTextField,
  StandardFonts,
  type PDFAcroButton,
  type PDFAcroChoice,
  type PDFField,
  type PDFFont,
} from 'pdf-lib';

/**
 * Write the user's answers into the ORIGINAL PDF's form fields (pdf-lib), keeping its layout:
 * nothing is flattened, only fields whose value changed are touched.
 *
 * Pure (no DOM): the viewer calls it on download, test:pdf calls it in Node.
 */
export interface PdfValue {
  /** Full PDF field name. */
  fieldName: string;
  kind: 'text' | 'checkbox' | 'radio' | 'select';
  /**
   * text: the text · checkbox / radio: the chosen box's "on" export value, '' = none ·
   * select: the option's export value (several for multi-select lists).
   */
  value: string | string[];
}

export interface FillReport {
  bytes: Uint8Array;
  /** Fields whose value was written. */
  written: string[];
  /** Fields we couldn't draw ourselves (e.g. characters the standard font lacks): readers draw them (NeedAppearances). */
  noAppearance: string[];
  /** Answers that couldn't be written at all, with why. */
  skipped: { fieldName: string; reason: string }[];
}

/**
 * The PDF is encrypted (locked against changes, though it opens without a password): pdf-lib
 * can't write it. (Our own class: pdf-lib's errors don't survive instanceof.)
 */
export class EncryptedPdfError extends Error {
  constructor() {
    super('This PDF is encrypted');
  }
}

export async function fillPdf(original: Uint8Array, values: PdfValue[]): Promise<FillReport> {
  // updateMetadata: false keeps the original Producer / dates.
  const doc = await PDFDocument.load(original, { updateMetadata: false, ignoreEncryption: true });
  if (doc.isEncrypted) throw new EncryptedPdfError();
  // Hybrid forms carry an XFA copy of the form too. Readers that prefer XFA (Acrobat) would show
  // its old, empty values: pdf-lib drops XFA here, so every reader uses the fields we fill.
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const report: FillReport = { bytes: new Uint8Array(), written: [], noAppearance: [], skipped: [] };

  for (const v of values) {
    const field = form.getFieldMaybe(v.fieldName);
    if (!field) {
      report.skipped.push({ fieldName: v.fieldName, reason: 'not in the PDF' });
      continue;
    }
    try {
      const changed = write(field, v);
      if (changed === 'same') continue;
      report.written.push(v.fieldName);
      if (changed === 'draw' && !drawAppearance(field, font)) report.noAppearance.push(v.fieldName);
    } catch (err) {
      report.skipped.push({ fieldName: v.fieldName, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // Every reader shows the values: we drew new appearances above, and NeedAppearances asks
  // readers to redraw fields from their values too (covers anything we couldn't draw).
  if (report.written.length) form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
  // Our appearances are already drawn: don't let pdf-lib redraw (and restyle) other fields.
  report.bytes = await doc.save({ updateFieldAppearances: false });
  return report;
}

/** Set the value. 'same' = nothing to do · 'state' = a box state switch (its drawings exist) · 'draw' = needs a new drawing. */
function write(field: PDFField, v: PdfValue): 'same' | 'state' | 'draw' {
  if (field instanceof PDFTextField) {
    let text = String(v.value);
    const max = field.getMaxLength();
    if (max !== undefined && text.length > max) text = text.slice(0, max);
    if ((field.getText() ?? '') === text) return 'same';
    field.setText(text || undefined);
    return 'draw';
  }
  if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
    // Set the field value and each box's appearance state by hand: check() / select() only know
    // the first box's "on" value, and they'd redraw the boxes in pdf-lib's own style.
    const on = String(v.value);
    const acro = field.acroField;
    const widgets = acro.getWidgets();
    const target = on ? onStateFor(acro, on) : PDFName.of('Off');
    if (!target) throw new Error(`no box with the value "${on}"`);
    const current = acro.dict.lookup(PDFName.of('V'));
    if (current instanceof PDFName ? current === target : !on) return 'same';
    acro.dict.set(PDFName.of('V'), target);
    for (const w of widgets) w.setAppearanceState(w.getOnValue() === target ? target : PDFName.of('Off'));
    return 'state';
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const wanted = Array.isArray(v.value) ? v.value : [String(v.value)];
    // Options can be [export value, display text] pairs: the field stores the export value.
    const options = field.acroField.getOptions();
    const picked = wanted.filter(Boolean).map((w) => {
      const o = options.find((o) => o.value.decodeText() === w) ?? options.find((o) => o.display?.decodeText() === w);
      if (!o) throw new Error(`"${w}" is not one of the choices`);
      return o;
    });
    const before = field.acroField.getValues().map((x) => x.decodeText());
    const after = picked.map((o) => o.value.decodeText());
    if (before.join('\n') === after.join('\n')) return 'same';
    setChoice(field.acroField, picked.map((o) => o.value), picked.map((o) => options.indexOf(o)));
    return 'draw';
  }
  throw new Error('unsupported field type');
}

/**
 * The box state name for an export value. Usually the same name ("Yes", "1"); but when the field
 * has an /Opt list, boxes are named by position ("0", "1", "2") and /Opt holds their export values.
 */
function onStateFor(acro: PDFAcroButton, exportValue: string): PDFName | null {
  const widgets = acro.getWidgets();
  const opt = acro.dict.lookup(PDFName.of('Opt'));
  if (opt instanceof PDFArray) {
    for (let i = 0; i < Math.min(opt.size(), widgets.length); i++) {
      const o = opt.lookup(i);
      if ((o instanceof PDFString || o instanceof PDFHexString) && o.decodeText() === exportValue) return widgets[i]!.getOnValue() ?? null;
    }
  }
  const name = PDFName.of(exportValue);
  return widgets.some((w) => w.getOnValue() === name) ? name : null;
}

/**
 * Store a choice's value(s) directly: pdf-lib's setValues only accepts display texts, but the
 * PDF must store the export value ("QC", not "Quebec"). /I (selected indexes) kept in sync.
 */
function setChoice(acro: PDFAcroChoice, values: (PDFString | PDFHexString)[], indexes: number[]) {
  const ctx = acro.dict.context;
  acro.dict.set(PDFName.of('V'), values.length === 1 ? values[0]! : ctx.obj(values));
  if (acro.dict.has(PDFName.of('I')) || values.length > 1) acro.dict.set(PDFName.of('I'), ctx.obj(indexes.sort((a, b) => a - b).map((i) => PDFNumber.of(i))));
}

/** Draw the field's new appearance. false = couldn't (the reader will, from NeedAppearances). */
function drawAppearance(field: PDFField, font: PDFFont): boolean {
  try {
    if (field instanceof PDFTextField) field.updateAppearances(font);
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList) drawChoice(field, font);
    return true;
  } catch {
    return false;
  }
}

/**
 * pdf-lib draws a choice with its stored value; for [export, display] options that is the
 * export code ("QC") instead of what the user picked ("Quebec"). Draw with the display text,
 * then put the export value back.
 */
function drawChoice(field: PDFDropdown | PDFOptionList, font: PDFFont) {
  const acro = field.acroField;
  const stored = acro.dict.get(PDFName.of('V'));
  const options = acro.getOptions();
  const shown = acro.getValues().map((v) => options.find((o) => o.value.decodeText() === v.decodeText())?.display ?? v);
  acro.setValues(shown);
  try {
    field.updateAppearances(font);
  } finally {
    if (stored) acro.dict.set(PDFName.of('V'), stored);
  }
}
