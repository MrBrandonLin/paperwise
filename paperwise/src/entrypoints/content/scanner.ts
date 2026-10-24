import type { FieldKind, FieldOption, ScannedField, ScanResult } from '@/shared/contract';
import { FIELD_ATTR, SENSITIVE_ATTR } from '@/shared/config';

/** Input types we never touch. */
const SKIPPED_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'file',
  'color',
  'range',
]);

let nextId = 1;

/** All fields carrying this id (several for a radio group). */
export function elementsFor(id: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[${FIELD_ATTR}="${CSS.escape(id)}"]`)];
}

// ---------------------------------------------------------------------------
// Scan cache: on open, the button, the watcher, the panel and the prefetch all ask for a scan
// within a second. They share ONE real scan unless the page changed in between (the watchers
// and the filler call markDirty on DOM changes, user input, and our own writes).
// ---------------------------------------------------------------------------

const SCAN_CACHE_MS = 1000;
let cached: { at: number; result: ScanResult } | null = null;
let dirty = true;
let realScans = 0;

/** The page changed: the next scanPage() really rescans. */
export function markDirty() {
  dirty = true;
}

/** How many real scans ran (for tests and debugging). */
export function scanCount(): number {
  return realScans;
}

/**
 * Scan the page and tag each field with data-paperwise-id (cached briefly, see above).
 * Hidden fields are included too (visible: false): forms often hide conditional questions
 * ("If yes, describe…") until an answer reveals them. Only hidden fields that sit in a form
 * (or page) with at least one visible field are kept, to skip unrelated hidden widgets.
 */
export function scanPage(): ScanResult {
  if (cached && !dirty && Date.now() - cached.at < SCAN_CACHE_MS) return cached.result;
  dirty = false;
  realScans++;
  const result = scanNow();
  cached = { at: Date.now(), result };
  return result;
}

function scanNow(): ScanResult {
  const found: { field: ScannedField; scope: HTMLFormElement | null }[] = [];
  const seenRadioGroups = new Set<string>();

  const elements = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea',
  );

  for (const el of elements) {
    if (el.disabled) continue;
    const kind = kindOf(el);
    if (!kind) continue;

    if (kind === 'radio') {
      const input = el as HTMLInputElement;
      const groupKey = `${input.form?.id ?? ''}::${input.name}`;
      if (!input.name || seenRadioGroups.has(groupKey)) continue;
      seenRadioGroups.add(groupKey);
      found.push({ field: scanRadioGroup(input), scope: el.form });
      continue;
    }

    found.push({ field: scanSingle(el, kind), scope: el.form });
  }

  const scopesWithVisible = new Set(found.filter((f) => f.field.visible).map((f) => f.scope));
  const fields = found.filter((f) => f.field.visible || scopesWithVisible.has(f.scope)).map((f) => f.field);

  return {
    url: location.href,
    pageTitle: document.title,
    pageLanguage: document.documentElement.lang || undefined,
    fields,
  };
}

function scanSingle(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  kind: FieldKind,
): ScannedField {
  const id = tag(el);
  const label = labelOf(el);
  const sensitive = markSensitive(el, kind, label);
  const isCheckbox = kind === 'checkbox';
  const checked = isCheckbox && (el as HTMLInputElement).checked;
  const field: ScannedField = {
    id,
    kind,
    label,
    name: el.name || undefined,
    required: el.required || el.getAttribute('aria-required') === 'true',
    visible: isVisible(el),
    // Sensitive values never leave the page: only whether the field is filled.
    currentValue: sensitive ? '' : isCheckbox ? String(checked) : el.value,
    filled: isCheckbox ? checked : el.value !== '',
    sensitive,
    helpText: helpTextOf(el),
    sectionHint: sectionOf(el),
    autocomplete: el.getAttribute('autocomplete') || undefined,
  };

  if (el instanceof HTMLSelectElement) {
    field.options = [...el.options]
      .filter((o) => !o.disabled)
      .map((o) => ({ value: o.value, label: o.text.trim() }));
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    field.placeholder = el.placeholder || undefined;
    if (el.maxLength > 0) field.maxLength = el.maxLength;
  }
  if (el instanceof HTMLInputElement) {
    field.min = el.min || undefined;
    field.max = el.max || undefined;
    field.pattern = el.pattern || undefined;
  }
  return field;
}

function scanRadioGroup(first: HTMLInputElement): ScannedField {
  const radios = [
    ...document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(first.name)}"]`),
  ].filter((r) => r.form === first.form);

  // All radios in a group share one id, based on the group name.
  const id = radios.map((r) => r.getAttribute(FIELD_ATTR)).find(Boolean) ?? uniqueId(first.name, radios);
  radios.forEach((r) => r.setAttribute(FIELD_ATTR, id));

  const options: FieldOption[] = radios.map((r) => ({ value: r.value, label: labelOf(r) }));
  const checked = radios.find((r) => r.checked);
  const fieldset = first.closest('fieldset');

  return {
    id,
    kind: 'radio',
    label: groupQuestionOf(radios, fieldset) || first.name,
    name: first.name,
    required: radios.some((r) => r.required),
    visible: radios.some(isVisible),
    options,
    currentValue: checked?.value ?? '',
    filled: !!checked,
    sensitive: false,
    helpText: helpTextOf(first),
    sectionHint: sectionOf(fieldset ?? first),
  };
}

function kindOf(el: Element): FieldKind | null {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (!(el instanceof HTMLInputElement)) return null;
  const t = (el.type || 'text').toLowerCase();
  if (SKIPPED_INPUT_TYPES.has(t)) return null;
  switch (t) {
    case 'email':
    case 'tel':
    case 'number':
    case 'date':
    case 'checkbox':
    case 'radio':
    case 'password':
      return t;
    default:
      return 'text'; // text, search, url, unknown
  }
}

function tag(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const existing = el.getAttribute(FIELD_ATTR);
  if (existing) return existing;
  const id = uniqueId(el.id || el.name, [el]);
  el.setAttribute(FIELD_ATTR, id);
  return id;
}

/**
 * Ids come from the element's id or name ("pw-first"), so a field gets the same id again
 * if the page re-creates it (React re-render, conditional section shown again).
 * Falls back to a counter. `owners` are the elements allowed to already hold the id.
 */
function uniqueId(base: string, owners: Element[]): string {
  const slug = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const candidate = slug ? `pw-${slug}` : `pw-${nextId++}`;
  let id = candidate;
  for (let n = 2; isTaken(id, owners); n++) id = `${candidate}-${n}`;
  return id;
}

function isTaken(id: string, owners: Element[]): boolean {
  return elementsFor(id).some((el) => !owners.includes(el));
}

// ---------------------------------------------------------------------------
// Sensitive fields: values must never leave the page.
// The form map's risk level refines this later; this is the first line of defence.
// ---------------------------------------------------------------------------

const SENSITIVE_AUTOCOMPLETE = new Set([
  'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
  'current-password', 'new-password', 'one-time-code',
]);

const SENSITIVE_TEXT = new RegExp(
  [
    // Identity numbers
    'ssn', 'social security', 'social insurance', 'national insurance', 'tax ?id', 'taxpayer id', 'itin',
    'passport (number|no)', 's[ée]curit[ée] sociale', 'num[ée]ro fiscal', 'nir',
    // Bank
    'iban', 'swift', 'bic', 'routing (number|no)', 'sort code', 'rib', '(bank )?account (number|no)',
    'num[ée]ro de compte',
    // Cards
    'card (number|no)', 'credit card', 'debit card', 'carte bancaire', 'num[ée]ro de carte',
    'cvv', 'cvc', 'csc', 'security code', 'cryptogramme',
    // Secrets
    'pin( code)?', 'password', 'passcode', 'mot de passe',
  ]
    .map((p) => `\\b(${p})\\b`)
    .join('|'),
  'i',
);

/** Decide if a field is sensitive and mark it on the element (the filler and watchers read the mark). */
function markSensitive(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, kind: FieldKind, label: string): boolean {
  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  const words = [label, el.name, el.id, 'placeholder' in el ? el.placeholder : '', el.getAttribute('aria-label') ?? '']
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // accountNumber → account Number
    .replace(/[_.\-[\]]+/g, ' '); // applicant_ssn → applicant ssn
  const sensitive =
    kind === 'password' || autocomplete.some((a) => SENSITIVE_AUTOCOMPLETE.has(a)) || SENSITIVE_TEXT.test(words);
  if (sensitive) el.setAttribute(SENSITIVE_ATTR, 'true');
  else el.removeAttribute(SENSITIVE_ATTR);
  return sensitive;
}

/** True if the scanner marked this element sensitive. */
export function isSensitive(el: Element): boolean {
  return el.hasAttribute(SENSITIVE_ATTR);
}

/** Help text linked with aria-describedby, e.g. "We use this to verify your identity." */
function helpTextOf(el: HTMLElement): string | undefined {
  const ids = el.getAttribute('aria-describedby');
  if (!ids) return undefined;
  const text = clean(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  );
  return text ? text.slice(0, 300) : undefined;
}

/** Can the user see this field right now? */
export function isVisible(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"], [hidden]')) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Custom-styled checkboxes/radios are often visually hidden but still usable.
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return true;
  return el.offsetWidth > 0 || el.offsetHeight > 0;
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').replace(/\*$/, '').trim();
}

/** Best label for an element, most reliable source first. */
function labelOf(el: HTMLElement): string {
  const fieldEl = el as HTMLInputElement;
  const firstLabel = fieldEl.labels?.[0];
  if (firstLabel) {
    const text = clean(firstLabel.textContent);
    if (text) return text;
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' '),
    );
    if (text) return text;
  }
  if (fieldEl.placeholder) return clean(fieldEl.placeholder);
  if (el.title) return clean(el.title);
  return fieldEl.name || el.id || 'Unlabeled field';
}

/**
 * The radio group's OWN question ("Do you have pets?"), not the section it sits in:
 *  1. the radiogroup's aria-label / aria-labelledby
 *  2. the fieldset legend, only if that fieldset holds nothing but this group
 *  3. the text just before the group (e.g. <p>Do you have pets?</p><div>…radios…</div>)
 */
function groupQuestionOf(radios: HTMLInputElement[], fieldset: HTMLFieldSetElement | null): string {
  const first = radios[0]!;
  const group = first.closest<HTMLElement>('[role="radiogroup"]');
  if (group) {
    const aria = clean(group.getAttribute('aria-label'));
    if (aria) return aria;
    const by = group.getAttribute('aria-labelledby');
    const text = by ? clean(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')) : '';
    if (text) return text;
  }
  if (fieldset) {
    const fields = [...fieldset.querySelectorAll('input, select, textarea')];
    const onlyThisGroup = fields.every((f) => radios.includes(f as HTMLInputElement));
    const legend = clean(fieldset.querySelector('legend')?.textContent);
    if (onlyThisGroup && legend) return legend;
  }
  return textBefore(group ?? commonParent(radios));
}

/** Smallest element holding all the radios. */
function commonParent(radios: HTMLInputElement[]): HTMLElement {
  let parent = radios[0]!.parentElement!;
  while (parent.parentElement && !radios.every((r) => parent.contains(r))) parent = parent.parentElement;
  return parent;
}

/** Text of the nearest previous sibling that is plain text (not another field or its label). */
function textBefore(el: HTMLElement): string {
  for (let n = el.previousElementSibling; n; n = n.previousElementSibling) {
    if (n.matches('input, select, textarea, fieldset, form') || n.querySelector('input, select, textarea')) return '';
    if (n instanceof HTMLLabelElement && n.htmlFor) return ''; // another field's label
    const text = clean(n.textContent);
    if (text) return text.length <= 200 ? text : '';
  }
  return '';
}

/** Nearest fieldset legend or preceding heading. */
function sectionOf(el: Element): string | undefined {
  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent;
  if (legend) return clean(legend);
  // Walk backwards through the document for the closest heading.
  const headings = [...document.querySelectorAll('h1, h2, h3, h4')];
  let best: Element | undefined;
  for (const h of headings) {
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    else break;
  }
  return best ? clean(best.textContent) || undefined : undefined;
}
