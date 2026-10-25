import { createHash } from 'node:crypto';
import type { FieldKind, FieldOption, ScanResult } from '../../src/shared/contract.ts';

/**
 * The part of a scan that is allowed to leave our server: the form's STRUCTURE.
 * Built field by field from an allow-list, so values (currentValue, filled) can never slip
 * through to Gemini or the logs, even if the scan format grows.
 */
export interface FieldStructure {
  id: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  sensitive: boolean;
  /** false = hidden on the page right now (often a conditional question). */
  visible: boolean;
  name?: string;
  placeholder?: string;
  helpText?: string;
  sectionHint?: string;
  autocomplete?: string;
  options?: FieldOption[];
  min?: string;
  max?: string;
  maxLength?: number;
  pattern?: string;
  /**
   * Checkboxes of one "pick one" set (same name but an index: c1_1[0] … c1_1[6], like the
   * W-9's tax classification): the set's key. Asked as one question listing the choices.
   */
  oneOf?: string;
}

/** Bump when the form-map prompt or map shape changes (old cached maps are then ignored). */
export const MAP_VERSION = 2;

/** The page part of cache keys, with the map version: maps from an older prompt never match. */
export function versionedPage(page: string): string {
  return `v${MAP_VERSION}:${page}`;
}

export interface FormStructure {
  /** Origin + path only: query strings can contain personal data. */
  page: string;
  pageTitle: string;
  pageLanguage?: string;
  fields: FieldStructure[];
}

export function toStructure(scan: ScanResult): FormStructure {
  const sets = choiceSets(scan);
  return {
    page: pageKey(scan.url),
    pageTitle: scan.pageTitle,
    pageLanguage: scan.pageLanguage,
    fields: scan.fields.map((f) =>
      dropEmpty({
        id: f.id,
        kind: f.kind,
        label: f.label,
        required: f.required,
        sensitive: !!f.sensitive,
        visible: f.visible !== false,
        name: f.name,
        placeholder: f.placeholder,
        helpText: f.helpText,
        sectionHint: f.sectionHint,
        autocomplete: f.autocomplete,
        options: f.options?.map((o) => ({ value: o.value, label: o.label })),
        min: f.min,
        max: f.max,
        maxLength: f.maxLength,
        pattern: f.pattern,
        oneOf: sets.get(f.id),
      }),
    ),
  };
}

/** Origin + path of a URL (no query, no hash). */
export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

/**
 * Cache key: same page + same fields (ids, kinds, labels, options) → same form map.
 * Visibility is NOT part of it: a hidden field being shown must not trigger a new Gemini call.
 */
export function structureSignature(s: FormStructure): string {
  const shape = s.fields.map((f) => [f.id, f.kind, f.label, f.required, f.sensitive, f.options?.map((o) => o.value)]);
  // The prompt's version is part of the key: a better prompt must not be hidden by old cached maps.
  const hash = createHash('sha256').update(JSON.stringify([MAP_VERSION, shape])).digest('hex').slice(0, 16);
  return `${versionedPage(s.page)}#${hash}`;
}

function dropEmpty<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as T;
}

/**
 * "Pick one" checkbox sets: 3+ checkboxes whose names differ only by a final index
 * ("…c1_1[0]", "…c1_1[1]", …). PDF forms use them where a web form would use radio buttons.
 */
export function choiceSets(scan: ScanResult): Map<string, string> {
  const byBase = new Map<string, string[]>();
  for (const f of scan.fields) {
    if (f.kind !== 'checkbox' || !f.name) continue;
    const m = /^(.*)\[\d+\]$/.exec(f.name);
    if (!m) continue;
    byBase.set(m[1]!, [...(byBase.get(m[1]!) ?? []), f.id]);
  }
  const out = new Map<string, string>();
  for (const [base, ids] of byBase) if (ids.length >= 3) for (const id of ids) out.set(id, base.split('.').pop() ?? base);
  return out;
}
