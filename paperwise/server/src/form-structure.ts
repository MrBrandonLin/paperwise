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
}

export interface FormStructure {
  /** Origin + path only: query strings can contain personal data. */
  page: string;
  pageTitle: string;
  pageLanguage?: string;
  fields: FieldStructure[];
}

export function toStructure(scan: ScanResult): FormStructure {
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
  const hash = createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
  return `${s.page}#${hash}`;
}

function dropEmpty<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as T;
}
