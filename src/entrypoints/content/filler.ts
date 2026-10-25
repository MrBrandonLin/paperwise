import { ACTIVE_ATTR, RECHECK_EVENT, STATUS_ATTR } from '@/shared/config';
import type { FieldStatus } from '@/shared/contract';
import type { Result } from '@/shared/messages';
import { pageUi } from './page-ui-store';
import { elementsFor, isSensitive, isVisible, markDirty, scanPage } from './scanner';

/**
 * Filling, highlighting and scrolling the real page fields.
 *
 * Filling rule: set the value with the NATIVE setter (from the element's prototype),
 * then dispatch bubbling 'input' and 'change' events, so React/Vue-controlled inputs
 * register the change. Checkbox/radio: click() (what frameworks listen to), with a
 * native-setter fallback. After every write we read the value back: if the page
 * rejected it (bad date, unknown option…), we report an error instead of pretending.
 */

export interface FillOutcome {
  /** The value now on the page (select/radio: the option value). Always '' for sensitive fields. */
  value: string;
  filled: boolean;
}

type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;


/** True while we are writing to the page, so our own events aren't seen as user edits. */
let writing = false;
export function isWriting(): boolean {
  return writing;
}

// ---------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------

export function fillField(id: string, value: string): Result<FillOutcome> {
  const els = findFields(id);
  if (els.length === 0) return fail(`Field ${id} is not on the page any more.`);

  const first = els[0]!;
  if (first.disabled) return fail('This field is disabled on the page.');
  if (!els.some(isVisible)) return fail('This field is hidden on the page right now (its condition is not met).');
  if ('readOnly' in first && first.readOnly) return fail('This field is read-only on the page.');

  writing = true;
  let result: Result<FillOutcome>;
  try {
    if (first instanceof HTMLInputElement && first.type === 'radio') {
      result = fillRadio(els as HTMLInputElement[], value);
    } else if (first instanceof HTMLInputElement && first.type === 'checkbox') {
      result = fillCheckbox(first, value);
    } else if (first instanceof HTMLSelectElement) {
      result = fillSelect(first, value);
    } else {
      result = fillText(first, value);
    }
  } finally {
    writing = false;
    markDirty(); // values (and maybe visibility) changed: the next scan must be fresh
  }
  // The fill animation: the value flows onto the field. Sensitive values never: a check only.
  if (result.ok && result.data.filled) pageUi.flashFill(id, isSensitive(first) ? '' : shownValue(els, result.data.value));
  // Some widgets (React date pickers, custom selects) accept a value, then put their own back a
  // moment later. Look again: if it changed, say so like a user edit (the agent then re-asks).
  if (result.ok) verifyLater(id, els, readValue(els));

  // Sensitive: report only filled / not filled, and don't echo the value in errors.
  if (isSensitive(first)) {
    if (result.ok) return ok({ value: '', filled: result.data.filled });
    return fail(value ? result.error.split(value).join('(hidden)') : result.error);
  }
  return result;
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, raw: string): Result<FillOutcome> {
  const type = el instanceof HTMLInputElement ? el.type : 'textarea';
  let value = raw;

  if (type === 'number') {
    const n = normalizeNumber(raw);
    if (n === null) return fail(`"${raw}" is not a number.`);
    value = n;
  }
  if (type === 'date' && raw !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return fail(`Date must be YYYY-MM-DD, got "${raw}".`);
  }
  value = type === 'date' ? value.trim() : value;

  const previous = el.value;
  setNativeValue(el, value);
  dispatch(el, 'input', 'change');
  blur(el);

  const now = el.value;
  if (value !== '' && now === '') {
    // The browser or the page refused it (e.g. 2026-02-30) and emptied the field: put the old value back.
    setNativeValue(el, previous);
    dispatch(el, 'input', 'change');
    return fail(type === 'date' ? `"${raw}" is not a real date.` : `The page did not accept "${raw}".`);
  }

  // On the page, but the form would refuse it at submit (step, min/max, email, pattern…).
  const problem = validityProblem(el);
  if (problem) {
    setNativeValue(el, previous);
    dispatch(el, 'input', 'change');
    return fail(`"${raw}" can't go in this field: ${problem}`);
  }
  return ok({ value: now, filled: now !== '' });
}

/** Browser validation problems caused by the value (not "required but empty"). */
function validityProblem(el: HTMLInputElement | HTMLTextAreaElement): string | null {
  const v = el.validity;
  const input = el instanceof HTMLInputElement ? el : null;
  if (v.stepMismatch) return input?.step && input.step !== '1' ? `it must be in steps of ${input.step}.` : 'it must be a whole number.';
  if (v.rangeUnderflow) return `it must be at least ${input?.min}.`;
  if (v.rangeOverflow) return `it must be at most ${input?.max}.`;
  if (v.typeMismatch) return input?.type === 'email' ? 'it is not a valid email address.' : `it is not a valid ${input?.type}.`;
  if (v.patternMismatch) return `it doesn't match the format the form expects${el.title ? ` (${el.title})` : ''}.`;
  if (v.tooLong) return `it is too long (max ${el.maxLength} characters).`;
  if (v.tooShort) return `it is too short (min ${el.minLength} characters).`;
  if (v.badInput) return 'the browser could not read it.';
  return null;
}

function fillSelect(el: HTMLSelectElement, raw: string): Result<FillOutcome> {
  const options = [...el.options].filter((o) => !o.disabled);
  const option = matchOption(
    options.map((o) => ({ value: o.value, label: o.text, ref: o })),
    raw,
  );
  if (!option) {
    const labels = options.filter((o) => o.value !== '').map((o) => o.text.trim());
    return fail(`No option matches "${raw}". Options: ${labels.join(', ')}.`);
  }

  setNativeValue(el, option.value);
  dispatch(el, 'input', 'change');
  blur(el);

  if (el.value !== option.value) return fail(`The page did not accept "${option.label}".`);
  return ok({ value: el.value, filled: el.value !== '' });
}

function fillCheckbox(el: HTMLInputElement, raw: string): Result<FillOutcome> {
  const want = parseBool(raw);
  if (want === null) return fail(`Checkbox needs yes or no, got "${raw}".`);

  if (el.checked !== want) el.click();
  if (el.checked !== want) {
    // A handler blocked the click: set it directly and notify the page.
    setNativeChecked(el, want);
    dispatch(el, 'input', 'change');
  }
  if (el.checked !== want) return fail('The page did not let us change this checkbox.');
  return ok({ value: String(el.checked), filled: el.checked });
}

function fillRadio(radios: HTMLInputElement[], raw: string): Result<FillOutcome> {
  if (raw.trim() === '') return fail('A radio choice cannot be cleared.');
  const match = matchOption(
    radios.map((r) => ({ value: r.value, label: radioLabel(r), ref: r })),
    raw,
  );
  if (!match) {
    return fail(`No choice matches "${raw}". Choices: ${radios.map(radioLabel).join(', ')}.`);
  }

  const radio = match.ref;
  if (!radio.checked) radio.click();
  if (!radio.checked) {
    setNativeChecked(radio, true);
    dispatch(radio, 'input', 'change');
  }
  if (!radio.checked) return fail(`The page did not let us choose "${match.label}".`);
  return ok({ value: radioValue(radio), filled: true });
}

function readValue(els: FieldEl[]): string {
  const first = els[0]!;
  if (first instanceof HTMLInputElement && first.type === 'radio') return radioValue((els as HTMLInputElement[]).find((r) => r.checked));
  if (first instanceof HTMLInputElement && first.type === 'checkbox') return String(first.checked);
  return first.value;
}

/** A radio's value; without a value attribute ("on"), its label, like the scanner reports it. */
function radioValue(r: HTMLInputElement | undefined): string {
  if (!r) return '';
  return r.getAttribute('value') === null ? radioLabel(r) : r.value;
}

const pendingChecks = new Map<string, ReturnType<typeof setTimeout>>();

function verifyLater(id: string, els: FieldEl[], written: string) {
  // Only the latest fill of a field is checked (two quick fills aren't a revert).
  clearTimeout(pendingChecks.get(id));
  pendingChecks.set(id, setTimeout(() => {
    pendingChecks.delete(id);
    if (!els[0]?.isConnected || readValue(els) === written) return;
    markDirty();
    // The watchers report the page's real value, like a user edit (the agent then re-asks).
    document.dispatchEvent(new CustomEvent(RECHECK_EVENT, { detail: id }));
  }, 400));
}

export interface FieldReading extends FillOutcome {
  sensitive: boolean;
}

/** Current value of a field, safe to send out of the page (sensitive values are blanked). */
export function readField(id: string): FieldReading | null {
  const els = findFields(id, false);
  const first = els[0];
  if (!first) return null;
  let value: string;
  let filled: boolean;
  if (first instanceof HTMLInputElement && first.type === 'radio') {
    value = radioValue((els as HTMLInputElement[]).find((r) => r.checked));
    filled = value !== '';
  } else if (first instanceof HTMLInputElement && first.type === 'checkbox') {
    value = String(first.checked);
    filled = first.checked;
  } else {
    value = first.value;
    filled = value !== '';
  }
  const sensitive = isSensitive(first);
  return { value: sensitive ? '' : value, filled, sensitive };
}

// ---------------------------------------------------------------------------
// Highlight, scroll, clear
// ---------------------------------------------------------------------------

export function highlightField(id: string, status: FieldStatus): Result<null> {
  const els = findFields(id);
  if (els.length === 0) return fail(`Field ${id} is not on the page any more.`);
  for (const target of highlightTargets(els)) {
    if (status === 'empty') target.removeAttribute(STATUS_ATTR);
    else target.setAttribute(STATUS_ATTR, status);
  }
  return ok(null);
}

/** Scroll to the field and mark it as the active one. focus: also put the cursor in it. */
export function goToField(id: string, focus = false): Result<null> {
  const els = findFields(id);
  if (els.length === 0) return fail(`Field ${id} is not on the page any more.`);
  if (!els.some(isVisible)) return fail('This field is hidden on the page right now.');
  document.querySelectorAll(`[${ACTIVE_ATTR}]`).forEach((el) => el.removeAttribute(ACTIVE_ATTR));

  const targets = highlightTargets(els);
  targets.forEach((t) => t.setAttribute(ACTIVE_ATTR, ''));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  targets[0]!.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  if (focus) els[0]!.focus({ preventScroll: true });
  return ok(null);
}

export function clearHighlights(): Result<null> {
  document.querySelectorAll(`[${STATUS_ATTR}], [${ACTIVE_ATTR}]`).forEach((el) => {
    el.removeAttribute(STATUS_ATTR);
    el.removeAttribute(ACTIVE_ATTR);
  });
  return ok(null);
}

/** Radio groups are highlighted as one box when they have a container; other fields as themselves. */
function highlightTargets(els: FieldEl[]): HTMLElement[] {
  const first = els[0]!;
  if (first instanceof HTMLInputElement && first.type === 'radio') {
    const group = first.closest<HTMLElement>('[role="radiogroup"], fieldset');
    if (group && els.every((r) => group.contains(r))) return [group];
  }
  return els;
}

/** What the fill animation shows: the visible choice for selects and radios, nothing for checkboxes. */
function shownValue(els: FieldEl[], value: string): string {
  const first = els[0]!;
  if (first instanceof HTMLSelectElement) return first.selectedOptions[0]?.text.trim() ?? value;
  if (first instanceof HTMLInputElement && first.type === 'checkbox') return '';
  if (first instanceof HTMLInputElement && first.type === 'radio') {
    const checked = (els as HTMLInputElement[]).find((r) => r.checked);
    return checked ? radioLabel(checked) : value;
  }
  return value;
}

/*
 * Highlights are only data attributes on the fields (STATUS_ATTR, ACTIVE_ATTR). The in-page UI
 * (content/page-ui.tsx) draws them in its own shadow root: no styles are injected into the page.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fields for an id. If none (page re-rendered), rescan once and try again. */
function findFields(id: string, rescan = true): FieldEl[] {
  let els = elementsFor(id) as FieldEl[];
  if (els.length === 0 && rescan) {
    markDirty();
    scanPage();
    els = elementsFor(id) as FieldEl[];
  }
  return els;
}

function setNativeValue(el: FieldEl, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function setNativeChecked(el: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (setter) setter.call(el, checked);
  else el.checked = checked;
}

function dispatch(el: Element, ...types: string[]) {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Some forms validate or format on blur, so send blur events too (focus does not move). */
function blur(el: Element) {
  el.dispatchEvent(new FocusEvent('blur'));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

interface Choice<T> {
  value: string;
  label: string;
  ref: T;
}

/** Match by exact value, then label, then loosely (case, accents, punctuation), then unique prefix. */
function matchOption<T>(choices: Choice<T>[], raw: string): Choice<T> | null {
  const exact = choices.find((c) => c.value === raw);
  if (exact) return exact;

  const want = loose(raw);
  if (!want) return null;
  const byLabel = choices.find((c) => loose(c.label) === want) ?? choices.find((c) => loose(c.value) === want);
  if (byLabel) return byLabel;

  const prefix = choices.filter((c) => c.value !== '' && loose(c.label).startsWith(want));
  return prefix.length === 1 ? prefix[0]! : null;
}

function loose(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function radioLabel(r: HTMLInputElement): string {
  return (r.labels?.[0]?.textContent ?? r.getAttribute('aria-label') ?? r.value).replace(/\s+/g, ' ').trim();
}

function parseBool(raw: string): boolean | null {
  const v = loose(raw);
  if (['true', 'yes', 'y', 'on', '1', 'checked', 'oui', 'x'].includes(v)) return true;
  if (['false', 'no', 'n', 'off', '0', 'unchecked', 'non', ''].includes(v)) return false;
  return null;
}

/** "1,800" → "1800", "1 800,50" → "1800.50", "$2,000.5" → "2000.5". Null if not a number. */
function normalizeNumber(raw: string): string | null {
  let s = raw.replace(/[\s  $€£]/g, '');
  if (s === '') return '';
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}
function fail(error: string): Result<never> {
  return { ok: false, error };
}
