import { FIELD_ATTR, GROUP_QUESTION_ATTR } from '@/shared/config';
import type { PdfValue } from '../export';
import { checkboxKidFields, labelKey, pdfFieldIds, type PdfLabels, type PdfWidget } from '../labels';

/** The PDF field name on each input (maps our ids back to the PDF). */
export const PDF_FIELD_ATTR = 'data-pdf-field';
/** Set once the user or the agent changed an input: only those are written into the PDF. */
const TOUCHED_ATTR = 'data-pdf-touched';

type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Make pdf.js's inputs look like a well-labelled web form to the scanner, without changing how
 * pdf.js handles them (it keys everything on data-element-id and name):
 *  - our stable id (FIELD_ATTR) from the PDF field name; widgets of one field share it
 *  - aria-label = the built label (tooltip or nearby text)
 *  - radios: value = their export value, aria-label = their option text, the group's question
 * Returns the id → PDF field name map.
 */
export function prepareFields(widgets: PdfWidget[], labels: PdfLabels): Map<string, string> {
  const kids = checkboxKidFields(widgets);
  const ids = pdfFieldIds([...labels.fields.keys()]);
  const idToName = new Map<string, string>();
  for (const w of widgets) {
    const el = document.querySelector<FieldEl>(`[data-element-id="${CSS.escape(w.annotationId)}"]`);
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    const key = labelKey(w, kids.has(w.fieldName));
    const id = ids.get(key);
    const label = labels.fields.get(key)?.label;
    if (!id || !label) continue;
    el.setAttribute(FIELD_ATTR, id);
    el.setAttribute(PDF_FIELD_ATTR, w.fieldName);
    idToName.set(id, w.fieldName);
    if (el instanceof HTMLSelectElement) {
      // pdf.js's blank "nothing chosen yet" entry (hidden, value " ") is no answer to offer.
      for (const o of el.options) if (o.hidden && !o.value.trim()) o.disabled = true;
    }
    if (w.kind === 'radio' && el instanceof HTMLInputElement) {
      el.value = w.exportValue ?? '';
      el.setAttribute('aria-label', labels.options.get(w.annotationId) || w.exportValue || label);
      el.setAttribute(GROUP_QUESTION_ATTR, label);
    } else {
      el.setAttribute('aria-label', label);
    }
  }
  return idToName;
}

/** Remember which fields changed (user typing, or our filler's input/change events). */
export function trackTouched(root: Document) {
  const mark = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.(`[${PDF_FIELD_ATTR}]`);
    if (el) el.setAttribute(TOUCHED_ATTR, '');
  };
  root.addEventListener('input', mark, true);
  root.addEventListener('change', mark, true);
}

/**
 * The values to write into the PDF: only fields that were touched (a field never edited keeps
 * exactly what the PDF had, even when pdf.js shows it formatted differently).
 * Sensitive values are included: this runs in the viewer page and the file goes to the user's disk.
 */
export function collectValues(): PdfValue[] {
  const groups = new Map<string, FieldEl[]>();
  for (const el of document.querySelectorAll<FieldEl>(`[${PDF_FIELD_ATTR}]`)) {
    const name = el.getAttribute(PDF_FIELD_ATTR)!;
    groups.set(name, [...(groups.get(name) ?? []), el]);
  }
  const values: PdfValue[] = [];
  for (const [fieldName, els] of groups) {
    if (!els.some((el) => el.hasAttribute(TOUCHED_ATTR))) continue;
    const first = els[0]!;
    if (first instanceof HTMLInputElement && first.type === 'radio') {
      values.push({ fieldName, kind: 'radio', value: (els as HTMLInputElement[]).find((r) => r.checked)?.value ?? '' });
    } else if (first instanceof HTMLInputElement && first.type === 'checkbox') {
      // pdf.js puts each box's "on" export value in an exportValue attribute.
      const on = (els as HTMLInputElement[]).find((c) => c.checked);
      values.push({ fieldName, kind: 'checkbox', value: on ? (on.getAttribute('exportValue') ?? 'Yes') : '' });
    } else if (first instanceof HTMLSelectElement) {
      values.push({ fieldName, kind: 'select', value: first.multiple ? [...first.selectedOptions].map((o) => o.value) : first.value });
    } else {
      // Copies of one field on several pages are kept in sync by pdf.js: take the one last edited.
      const edited = els.find((el) => el.hasAttribute(TOUCHED_ATTR)) ?? first;
      values.push({ fieldName, kind: 'text', value: edited.value });
    }
  }
  return values;
}
