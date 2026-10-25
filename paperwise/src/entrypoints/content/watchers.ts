import type { ScanResult } from '@/shared/contract';
import { FIELD_ATTR, RECHECK_EVENT } from '@/shared/config';
import { isWriting, readField, type FieldReading } from './filler';
import { markDirty, scanPage } from './scanner';

/**
 * Page watchers. No browser.* calls here: they take callbacks, so they can be tested
 * on a plain page.
 */

/** Wait after the last keystroke before reporting a typed value. */
const TYPING_DEBOUNCE_MS = 500;
/** At most one rescan this often while the page keeps changing. */
const RESCAN_THROTTLE_MS = 400;

/**
 * Report values the USER changed on the page. Our own fills are ignored
 * (synthetic events, or events fired while we write).
 * Sensitive fields report only filled / not filled: their values never leave the page.
 */
export function watchUserEdits(onEdit: (id: string, reading: FieldReading) => void): () => void {
  const lastSent = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const keyOf = (r: FieldReading) => `${r.filled}|${r.value}`;

  const report = (id: string) => {
    timers.delete(id);
    const reading = readField(id);
    if (!reading) return;
    // Sensitive fields look the same before and after a retype (filled, no value), so report every edit.
    if (!reading.sensitive && lastSent.get(id) === keyOf(reading)) return;
    lastSent.set(id, keyOf(reading));
    onEdit(id, reading);
  };

  const onEvent = (e: Event) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    markDirty(); // a value changed: the next scan must see it
    const id = el.getAttribute(FIELD_ATTR);
    if (!id) return;

    if (!e.isTrusted || isWriting()) {
      // Our own write: remember it so the next real edit is compared against it.
      const r = readField(id);
      if (r) lastSent.set(id, keyOf(r));
      return;
    }

    clearTimeout(timers.get(id));
    const typing = e.type === 'input' && !(el instanceof HTMLSelectElement) && !isToggle(el);
    if (typing) timers.set(id, setTimeout(() => report(id), TYPING_DEBOUNCE_MS));
    else report(id);
  };

  // The filler saw the page put its own value back after our fill (React widgets): report it.
  const onRecheck = (e: Event) => {
    const id = (e as CustomEvent<string>).detail;
    if (typeof id === 'string') report(id);
  };

  document.addEventListener('input', onEvent, true);
  document.addEventListener('change', onEvent, true);
  document.addEventListener(RECHECK_EVENT, onRecheck);
  return () => {
    document.removeEventListener('input', onEvent, true);
    document.removeEventListener('change', onEvent, true);
    document.removeEventListener(RECHECK_EVENT, onRecheck);
    timers.forEach(clearTimeout);
  };
}

/**
 * Rescan when the page's fields change (a hidden field is shown, a new field is added or removed,
 * options change). Calls onChange with the new scan only when the field list differs.
 */
export function watchFieldChanges(onChange: (scan: ScanResult) => void): () => void {
  let lastKey = keyOf(scanPage());
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rescan = () => {
    timer = undefined;
    const scan = scanPage();
    const key = keyOf(scan);
    if (key === lastKey) return;
    lastKey = key;
    onChange(scan);
  };

  const observer = new MutationObserver((records) => {
    // Our own button and highlight styles are not page changes.
    if (records.every(isOwnMutation)) return;
    markDirty();
    // Throttle, not debounce: a page that animates forever still gets rescanned.
    timer ??= setTimeout(rescan, RESCAN_THROTTLE_MS);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    // Our own data-paperwise-* attributes are not in this list, so we don't trigger ourselves.
    attributeFilter: ['style', 'class', 'hidden', 'disabled', 'type', 'aria-hidden', 'open'],
  });

  return () => {
    observer.disconnect();
    clearTimeout(timer);
  };
}

/** Our in-page UI host (its shadow root is invisible to this observer). */
const OWN_TAG = 'PAPERWISE-UI';
const OWN_IDS = new Set(['paperwise-root', 'paperwise-styles']);

function isOwnNode(n: Node): boolean {
  return n instanceof Element && (n.tagName === OWN_TAG || OWN_IDS.has(n.id) || !!n.closest('#paperwise-root'));
}

function isOwnMutation(r: MutationRecord): boolean {
  if (r.type !== 'childList') return isOwnNode(r.target);
  const nodes = [...r.addedNodes, ...r.removedNodes];
  return nodes.length > 0 && nodes.every(isOwnNode);
}

function isToggle(el: Element): boolean {
  return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
}

/** What counts as "the fields changed": ids, kinds, options and visibility. Not values. */
function keyOf(scan: ScanResult): string {
  return scan.fields
    .map((f) => `${f.id}:${f.kind}:${f.visible ? 'v' : 'h'}:${f.options?.map((o) => o.value).join(',') ?? ''}`)
    .join('|');
}
