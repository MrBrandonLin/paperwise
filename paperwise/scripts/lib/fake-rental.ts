/**
 * A fake /test/rental.html for Node tests: the real scanned structure, and a page that behaves
 * like the real one (employer shows for employed/self, pets description for pets = yes).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FormMap, Language, ScanResult } from '../../src/shared/contract';
import type { ContentRequest, Result } from '../../src/shared/messages';
import type { PageTransport } from '../../src/engine/engine';

export const scan0 = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'test-pages', 'scans', 'rental.json'), 'utf8')) as ScanResult;
export const F = (id: string) => scan0.fields.find((f) => f.id === id)!;
export class FakePage implements PageTransport {
  values = new Map<string, string>();
  calls: ContentRequest[] = [];
  refuse = new Set<string>();
  /**
   * reactLike: like /test/rental-react.html, conditional fields aren't in the page at all until
   * their condition is met (React renders them), instead of being hidden.
   */
  constructor(private readonly opts: { reactLike?: boolean } = {}) {}
  async send<T>(req: ContentRequest): Promise<Result<T>> {
    this.calls.push(req);
    if (req.type === 'SCAN') return { ok: true, data: this.scan() as T };
    if (req.type === 'FILL') {
      if (this.refuse.has(req.id)) return { ok: false, error: 'The page did not accept it.' };
      this.values.set(req.id, req.value);
      const sensitive = F(req.id).sensitive;
      return { ok: true, data: { value: sensitive ? '' : req.value, filled: req.value !== '' } as T };
    }
    return { ok: true, data: null as T };
  }
  scan(): ScanResult {
    const status = this.values.get('pw-status') ?? '';
    const pets = this.values.get('pw-pets') ?? '';
    const fields = scan0.fields.map((f) => {
      const value = this.values.get(f.id) ?? '';
      const visible = f.id === 'pw-employer' ? status === 'employed' || status === 'self' : f.id === 'pw-pets-desc' ? pets === 'yes' : true;
      return { ...f, visible, currentValue: f.sensitive ? '' : value, filled: value !== '' };
    });
    return { ...scan0, url: this.opts.reactLike ? 'http://localhost:8787/test/rental-react.html' : scan0.url, fields: this.opts.reactLike ? fields.filter((f) => f.visible) : fields };
  }
  fills(id: string) {
    return this.calls.filter((c) => c.type === 'FILL' && c.id === id).length;
  }
}

/** A form map like the backend's, for the rental form. */
export function rentalMap(language: Language): FormMap {
  const risk: Record<string, 'legal' | 'important' | 'sensitive'> = {
    'pw-ssn': 'sensitive', 'pw-dob': 'important', 'pw-income': 'important', 'pw-movein': 'important', 'pw-credit': 'legal', 'pw-truth': 'legal',
  };
  const sections = [...new Set(scan0.fields.map((f) => f.sectionHint ?? ''))];
  return {
    language,
    title: 'Rental application',
    summary: '',
    estimatedMinutes: 6,
    formLanguage: 'en',
    complete: true,
    sections: sections.map((t, i) => ({ id: `s${i + 1}`, title: t, ready: true, fieldIds: scan0.fields.filter((f) => (f.sectionHint ?? '') === t).map((f) => f.id) })),
    groups: [{ id: 'g-name', plainQuestion: 'What is your full name?', fieldIds: ['pw-first', 'pw-last'] }],
    fields: scan0.fields.map((f, i) => ({
      id: f.id,
      plainQuestion: `Q ${f.label}`,
      risk: risk[f.id] ?? 'none',
      riskReason: risk[f.id] ? `Because ${f.label}.` : undefined,
      order: i + 1,
      groupId: f.id === 'pw-first' || f.id === 'pw-last' ? 'g-name' : undefined,
      showIf: f.id === 'pw-employer' ? { fieldId: 'pw-status', oneOf: ['employed', 'self'] } : f.id === 'pw-pets-desc' ? { fieldId: 'pw-pets', oneOf: ['yes'] } : undefined,
      formatHint: f.kind === 'date' ? 'YYYY-MM-DD' : f.kind === 'number' ? 'whole number, 0 or more' : undefined,
    })),
  };
}


/** Any form from a saved scan (the W-9): fills are kept, sensitive values never echoed. */
export class ScanPage implements PageTransport {
  values = new Map<string, string>();
  calls: ContentRequest[] = [];
  constructor(private readonly base: ScanResult) {}
  async send<T>(req: ContentRequest): Promise<Result<T>> {
    this.calls.push(req);
    if (req.type === 'SCAN') return { ok: true, data: this.scan() as T };
    if (req.type === 'FILL') {
      this.values.set(req.id, req.value);
      const sensitive = this.base.fields.find((f) => f.id === req.id)?.sensitive;
      return { ok: true, data: { value: sensitive ? '' : req.value, filled: req.value !== '' && req.value !== 'false' } as T };
    }
    return { ok: true, data: null as T };
  }
  scan(): ScanResult {
    return {
      ...this.base,
      fields: this.base.fields.map((f) => {
        const value = this.values.get(f.id) ?? '';
        return { ...f, currentValue: f.sensitive ? '' : value, filled: value !== '' && value !== 'false' };
      }),
    };
  }
}
