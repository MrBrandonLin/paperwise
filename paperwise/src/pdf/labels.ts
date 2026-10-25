/**
 * Labels and ids for PDF form fields. PDF fields often have internal names like
 * "topmostSubform[0].Page1[0].f1_01[0]": the user-facing label comes from the field's tooltip
 * (TU) when it has one, otherwise from the text printed next to it on the page.
 *
 * Pure code (no DOM, no pdf.js): the viewer feeds it pdf.js annotations + text positions, and
 * `pnpm pdf:labels` runs it on the test PDFs in Node. Coordinates are PDF points, y going up.
 */

export type PdfWidgetKind = 'text' | 'checkbox' | 'radio' | 'select';

export interface PdfWidget {
  /** pdf.js annotation id ("935R"): the DOM element's data-element-id. */
  annotationId: string;
  /** Full PDF field name, e.g. "topmostSubform[0].Page1[0].f1_01[0]". */
  fieldName: string;
  kind: PdfWidgetKind;
  /** 1-based page number. */
  page: number;
  /** [x1, y1, x2, y2], bottom-left to top-right. */
  rect: [number, number, number, number];
  /** The field's tooltip (TU), if any. */
  tooltip?: string;
  /** Checkbox / radio: the widget's "on" export value. */
  exportValue?: string;
}

export interface PdfText {
  page: number;
  str: string;
  /** Baseline start. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelSource = 'tooltip' | 'left' | 'right' | 'above' | 'name';

export interface PdfLabels {
  /** Per field (per widget id for checkboxes that share a name but have different "on" values). */
  fields: Map<string, { label: string; source: LabelSource }>;
  /** Radio options and checkbox kids: the text next to that one box. Keyed by annotationId. */
  options: Map<string, string>;
}

const MAX_LABEL = 300;
/** How far (points) a label may sit from its field. 72 pt = 1 inch. */
const LEFT_GAP_TEXT = 72;
const LEFT_GAP_FAR = 160;
const LEFT_GAP_BOX = 120;
const RIGHT_GAP_BOX = 40;
const ABOVE_GAP = 30;

interface Phrase {
  page: number;
  text: string;
  x: number;
  x2: number;
  /** Baseline. */
  y: number;
  /** Font size-ish. */
  h: number;
  /** Already used as a checkbox/radio's own label (to its right): not a heading for other fields. */
  claimed?: boolean;
}

/** Key for a field's label: the field name, or name + export value for checkbox kids. */
export function labelKey(w: PdfWidget, kidsWithOwnValue: boolean): string {
  return kidsWithOwnValue ? `${w.fieldName}#${w.exportValue ?? ''}` : w.fieldName;
}

/** Checkbox fields whose widgets have different "on" values act like radio buttons. */
export function checkboxKidFields(widgets: PdfWidget[]): Set<string> {
  const values = new Map<string, Set<string>>();
  for (const w of widgets) {
    if (w.kind !== 'checkbox') continue;
    const set = values.get(w.fieldName) ?? new Set();
    set.add(w.exportValue ?? '');
    values.set(w.fieldName, set);
  }
  return new Set([...values].filter(([, v]) => v.size > 1).map(([k]) => k));
}

export function buildLabels(widgets: PdfWidget[], texts: PdfText[]): PdfLabels {
  const phrases = toPhrases(texts);
  const kids = checkboxKidFields(widgets);
  const fields = new Map<string, { label: string; source: LabelSource }>();
  const options = new Map<string, string>();

  // 1. Boxes first: their label is the text right next to them. Those phrases are claimed, so a
  //    text field below "Trust/estate" isn't labelled "Trust/estate".
  for (const w of widgets) {
    if (w.kind !== 'checkbox' && w.kind !== 'radio') continue;
    // The closer side wins: "☐ Rent" (right), or "foreign partners . . . . ☐" (left, dot leaders).
    const right = rightOf(phrases, w.page, w.rect);
    const left = leftOf(phrases, w.page, w.rect, LEFT_GAP_BOX);
    const p = right && (!left || right.x - w.rect[2] <= w.rect[0] - left.x2) ? right : left;
    if (p) {
      p.claimed = true;
      options.set(w.annotationId, paragraphText(phrases, p));
    }
  }

  // 2. Every field's label (first widget of each field).
  const byKey = new Map<string, PdfWidget[]>();
  for (const w of widgets) {
    const key = labelKey(w, kids.has(w.fieldName));
    byKey.set(key, [...(byKey.get(key) ?? []), w]);
  }
  for (const [key, group] of byKey) {
    const first = group[0]!;
    const tooltip = clean(first.tooltip);
    if (tooltip && !isInternalName(tooltip, first.fieldName)) {
      fields.set(key, { label: tooltip, source: 'tooltip' });
      continue;
    }
    const found =
      first.kind === 'radio'
        ? questionAbove(phrases, first.page, unionRect(group.filter((g) => g.page === first.page)))
        : first.kind === 'checkbox'
          ? optionOf(options, first)
          : nearestLabel(phrases, first);
    fields.set(key, found ?? { label: humanizeName(first.fieldName), source: 'name' });
  }

  // 3. Split text fields with one printed label ("Social security number" over 3 boxes): number
  //    them. (A checkbox + its write-in box may share a label: that's fine as is.)
  const sameLabel = new Map<string, string[]>();
  for (const [key, l] of fields) sameLabel.set(l.label, [...(sameLabel.get(l.label) ?? []), key]);
  for (const keys of sameLabel.values()) {
    if (keys.length < 2 || !keys.every((k) => byKey.get(k)![0]!.kind === 'text')) continue;
    keys.forEach((key, i) => {
      const l = fields.get(key)!;
      fields.set(key, { ...l, label: `${l.label} (part ${i + 1} of ${keys.length})` });
    });
  }
  return { fields, options };
}

function optionOf(options: Map<string, string>, w: PdfWidget): { label: string; source: LabelSource } | null {
  const text = options.get(w.annotationId);
  return text ? { label: text, source: 'right' } : null;
}

/**
 * Text fields and dropdowns, in order:
 *  1. text right on top of the box ("Social security number" over the boxes), unless a label sits
 *     right against its left side ("Other (see instructions) [____]")
 *  2. text on the same row, to the left ("Date of birth  [____]")
 *  3. text above (a heading line over a wide box)
 *  4. text above, looking wider (3rd box of a split field)
 *  5. text far to the left (forms with a label column)
 */
function nearestLabel(phrases: Phrase[], w: PdfWidget): { label: string; source: LabelSource } | null {
  const left = leftOf(phrases, w.page, w.rect, LEFT_GAP_TEXT);
  const above = aboveOf(phrases, w.page, w.rect, 8);
  const leftGap = left ? w.rect[0] - left.x2 : Infinity;
  const aboveGap = above ? above.y - w.rect[3] : Infinity;
  const pick = (p: Phrase, source: LabelSource) => ({ label: paragraphText(phrases, p), source });
  if (above && aboveGap <= 8 && leftGap > 12) return pick(above, 'above');
  if (left) return pick(left, 'left');
  if (above) return pick(above, 'above');
  const wide = aboveOf(phrases, w.page, w.rect, 60);
  if (wide) return pick(wide, 'above');
  const far = leftOf(phrases, w.page, w.rect, LEFT_GAP_FAR);
  return far ? pick(far, 'left') : null;
}

function questionAbove(phrases: Phrase[], page: number, rect: PdfWidget['rect']): { label: string; source: LabelSource } | null {
  const p = aboveOf(phrases, page, rect, 8) ?? leftOf(phrases, page, rect, LEFT_GAP_FAR);
  return p ? { label: paragraphText(phrases, p), source: p.y > rect[3] ? 'above' : 'left' } : null;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The phrase's vertical middle sits within the field's height. */
function sameRow(p: Phrase, rect: PdfWidget['rect']): boolean {
  const mid = p.y + p.h * 0.35;
  return mid >= rect[1] - 3 && mid <= rect[3] + 3;
}

function leftOf(phrases: Phrase[], page: number, rect: PdfWidget['rect'], maxGap: number): Phrase | null {
  let best: Phrase | null = null;
  for (const p of phrases) {
    if (p.page !== page || !sameRow(p, rect) || p.x2 > rect[0] + 2 || rect[0] - p.x2 > maxGap) continue;
    if (!best || p.x2 > best.x2) best = p;
  }
  return best;
}

function rightOf(phrases: Phrase[], page: number, rect: PdfWidget['rect']): Phrase | null {
  let best: Phrase | null = null;
  for (const p of phrases) {
    if (p.page !== page || p.claimed || !sameRow(p, rect) || p.x < rect[2] - 2 || p.x - rect[2] > RIGHT_GAP_BOX) continue;
    if (!best || p.x < best.x) best = p;
  }
  return best;
}

/** Nearest unclaimed phrase whose baseline is just above the field and that overlaps it horizontally. */
function aboveOf(phrases: Phrase[], page: number, rect: PdfWidget['rect'], slack: number): Phrase | null {
  let best: Phrase | null = null;
  for (const p of phrases) {
    if (p.page !== page || p.claimed) continue;
    const dy = p.y - rect[3];
    if (dy < -2 || dy > ABOVE_GAP) continue;
    if (p.x >= rect[2] + (slack > 8 ? 10 : 0) || p.x2 <= rect[0] - slack) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}

/** The phrase plus the lines of the same paragraph above it (same indent, normal line spacing). */
function paragraphText(phrases: Phrase[], start: Phrase): string {
  const lines = [start];
  let cur = start;
  for (let i = 0; i < 3; i++) {
    const prev = phrases.find(
      (q) => q.page === cur.page && q !== cur && q.y > cur.y && q.y - cur.y <= 1.45 * Math.max(q.h, cur.h) && Math.abs(q.x - cur.x) <= 14,
    );
    if (!prev) break;
    lines.unshift(prev);
    cur = prev;
  }
  return clean(lines.map((l) => l.text).join(' ')).slice(0, MAX_LABEL);
}

function unionRect(ws: PdfWidget[]): PdfWidget['rect'] {
  return [
    Math.min(...ws.map((w) => w.rect[0])),
    Math.min(...ws.map((w) => w.rect[1])),
    Math.max(...ws.map((w) => w.rect[2])),
    Math.max(...ws.map((w) => w.rect[3])),
  ];
}

/**
 * Text items → phrases: items on the same line, close together, joined. Dot leaders
 * ("See instructions . . . . ☐") stretch the phrase toward its box but add no text.
 */
function toPhrases(texts: PdfText[]): Phrase[] {
  const isFiller = (s: string) => /^[\s.\-–—_:·•|]+$/.test(s);
  const items = texts
    .filter((t) => t.str.trim())
    .map((t) => ({ ...t, h: t.height || 8 }))
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const phrases: Phrase[] = [];
  let cur: Phrase | null = null;
  for (const t of items) {
    const sameLine = cur && cur.page === t.page && Math.abs(cur.y - t.y) <= Math.max(1.5, 0.25 * t.h);
    const gap = cur ? t.x - cur.x2 : 0;
    if (isFiller(t.str)) {
      // Leaders: up to ~2 em apart. A lone dash between boxes ("___ – ___") is no label.
      if (cur && sameLine && gap >= -1 && gap <= 2 * t.h && /\./.test(t.str)) cur.x2 = Math.max(cur.x2, t.x + t.width);
      else if (!sameLine) cur = null;
      continue;
    }
    if (cur && sameLine && gap >= -1 && gap <= Math.max(6, 1.2 * t.h)) {
      const space = /\s$/.test(cur.text) || /^\s/.test(t.str) || gap > 0.2 * t.h ? ' ' : '';
      cur.text += space + t.str;
      cur.x2 = Math.max(cur.x2, t.x + t.width);
      cur.h = Math.max(cur.h, t.h);
    } else {
      cur = { page: t.page, text: t.str, x: t.x, x2: t.x + t.width, y: t.y, h: t.h };
      phrases.push(cur);
    }
  }
  for (const p of phrases) p.text = clean(p.text.replace(/(\s*\.){2,}\s*$/, ''));
  return phrases.filter((p) => p.text);
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim().slice(0, MAX_LABEL);
}

/** A tooltip that is just the internal name again ("f1_01[0]") tells the user nothing. */
function isInternalName(tooltip: string, fieldName: string): boolean {
  const last = fieldName.split('.').pop() ?? fieldName;
  return tooltip === fieldName || tooltip === last || tooltip === last.replace(/\[\d+\]$/, '');
}

/** Last resort: "topmostSubform[0].Header[0].ApplicantName[0]" → "Applicant name". */
export function humanizeName(fieldName: string): string {
  const last = (fieldName.split('.').pop() ?? fieldName).replace(/\[\d+\]/g, '');
  const words = last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : fieldName;
}

/**
 * Our field id for a PDF field: stable (same PDF → same ids), readable, and mapped back to the
 * PDF field name by the viewer (data-pdf-field on the element).
 * "topmostSubform[0].Page1[0].f1_01[0]" → "pw-Page1-f1_01".
 */
export function pdfFieldIds(keys: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const key of [...keys].sort()) {
    const [name, exportValue] = key.split('#');
    const base = slug(
      name!
        .replace(/\[0\]/g, '')
        .replace(/\[(\d+)\]/g, '-$1')
        .replace(/^(topmostSubform|form1)\./, '') + (exportValue !== undefined ? `-${exportValue}` : ''),
    );
    let id = `pw-${base || 'field'}`;
    for (let n = 2; taken.has(id); n++) id = `pw-${base}-${n}`;
    taken.add(id);
    ids.set(key, id);
  }
  return ids;
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}
