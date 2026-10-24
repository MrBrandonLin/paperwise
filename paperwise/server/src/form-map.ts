import type {
  FieldCondition,
  FieldGroup,
  FormMap,
  FormMapField,
  FormSection,
  Language,
  RiskLevel,
  ScanResult,
} from '../../src/shared/contract.ts';
import type { FormMapDone, FormMapPartTiming, FormMapUpdate } from '../../src/shared/messages.ts';
import { env } from './env.ts';
import { FormMapCache } from './form-map-cache.ts';
import { structureSignature, toStructure, type FieldStructure, type FormStructure } from './form-structure.ts';
import { geminiConfigured, limiter, requestStructuredHedged, type GeminiResult } from './gemini.ts';
import { buildPartPrompt, PART_SYSTEM_PROMPT, partSchema, type PartSection } from './prompts/form-map.ts';
import type { Priority } from './rate-limit.ts';

/**
 * Form map, built for speed.
 *
 *   0 ms   skeleton: every field, sections, order, format hints, sensitive fields — all local.
 *          Questions are the page labels until Gemini's arrive.
 *          A part not answered after ~2.5 s gets a second identical request (first answer wins).
 *   ~1 s   each part of the form (a few sections) comes back from its own PARALLEL Gemini call
 *          and is streamed in as soon as it lands; a tiny call writes the title + summary.
 *   15 s   a part still missing gets the label questions (fallback); its late answer still
 *          streams in and lands in the cache.
 *
 * Cached per (page + field signature + language), in memory and on disk. Visibility is not part
 * of the signature: showing a hidden field never triggers a call. Fields that appear later
 * (React rendering a conditional question) are mapped ALONE and merged in; existing fields are
 * never re-mapped. Only text in the user's language is generated; no explanations upfront.
 */

const PART_TIMEOUT_MS = env.formMapTimeoutMs;
/** Field budget per part: small parts finish fast; a cap on parts keeps us under rate limits. */
const MAX_PARTS = 4;
const MIN_PART_FIELDS = 3;
const MAX_SECTION_FIELDS = 8;

const cache = FormMapCache.fromEnv();
/** Latest map per page + language: what new fields get merged into. */
const byPage = new Map<string, FormMap>();
for (const [key, map] of cache.all()) byPage.set(pageKeyOf(key, map.language), map);

const builds = new Map<string, Build>();

export function clearFormMapCache() {
  cache.clear();
  byPage.clear();
}

/**
 * Build (or reuse) the form map. onUpdate gets the map each time more of it is ready, starting
 * immediately. Resolves when every part has settled (including late Gemini answers).
 */
export async function streamFormMap(
  scan: ScanResult,
  language: Language,
  onUpdate: (u: FormMapUpdate) => void = () => {},
  opts: { priority?: Exclude<Priority, 'hedge'> } = {},
): Promise<FormMapDone> {
  const started = Date.now();
  const structure = toStructure(scan);
  const key = `${structureSignature(structure)}|${language}`;
  const pageKey = `${structure.page}|${language}`;
  const count = structure.fields.length;

  const cacheHit = (map: FormMap, why: string): FormMapDone => {
    console.log(`[form-map] cache hit (${why}) · ${count} fields · ${language} · ${structure.page}`);
    onUpdate({ type: 'update', stage: 'cache', map, ms: Date.now() - started });
    return { type: 'done', map, source: 'cache', mode: 'full', ms: Date.now() - started, completeMs: Date.now() - started, parts: [] };
  };

  // The page's latest map wins when it knows every field (it may hold more: fields merged in
  // earlier that are gone from the page right now).
  const base = byPage.get(pageKey);
  const known = new Set(base?.fields.map((f) => f.id));
  const newFields = structure.fields.filter((f) => !known.has(f.id));
  if (base && newFields.length === 0) {
    cache.set(key, base);
    return cacheHit(base, 'page map covers all fields');
  }
  const cached = cache.get(key);
  if (cached) return cacheHit(cached, 'same form');

  // Same build already running (prefetch + panel, quick rescans): join it.
  let build = builds.get(key);
  if (!build) {
    const incremental = !!base && newFields.length < count;
    build = new Build(structure, language, key, pageKey, opts.priority ?? 'user', incremental ? base : undefined);
    builds.set(key, build);
    build.done.finally(() => builds.delete(key)).catch(() => {});
  }
  return build.subscribe(onUpdate, started);
}

/** Convenience for scripts/tests: the final result only. */
export function getFormMap(scan: ScanResult, language: Language = 'en'): Promise<FormMapDone> {
  return streamFormMap(scan, language);
}

// ---------------------------------------------------------------------------
// One build: skeleton now, parts in parallel, streamed as they land
// ---------------------------------------------------------------------------

interface Part {
  id: string;
  sections: PartSection[];
  fieldIds: string[];
}

class Build {
  map: FormMap;
  readonly done: Promise<FormMapDone>;
  private listeners = new Set<{ fn: (u: FormMapUpdate) => void; since: number }>();
  private readonly started = Date.now();
  private readonly mode: 'full' | 'new-fields';
  private readonly newFieldIds?: string[];
  private firstSectionMs?: number;
  private completeMs?: number;

  constructor(
    private readonly structure: FormStructure,
    private readonly language: Language,
    private readonly key: string,
    private readonly pageKey: string,
    private readonly priority: Exclude<Priority, 'hedge'>,
    base?: FormMap,
  ) {
    this.mode = base ? 'new-fields' : 'full';
    const known = new Set(base?.fields.map((f) => f.id));
    const target = base ? structure.fields.filter((f) => !known.has(f.id)) : structure.fields;
    this.newFieldIds = base ? target.map((f) => f.id) : undefined;

    const sections = planSections(target, base ? `n${base.sections.length + 1}-` : 's');
    if (base) {
      // New fields join the section of the field before them on the page, not ready yet.
      const merged = mergeFields(base, { fields: target.map((f, i) => localField(f, i + 1, language)), groups: [], sections: [] }, structure);
      const waiting = new Set(target.map((f) => f.id));
      this.map = {
        ...merged,
        sections: merged.sections.map((s) => (s.fieldIds.some((id) => waiting.has(id)) ? { ...s, ready: false } : s)),
        complete: waiting.size === 0,
      };
    } else {
      this.map = skeletonMap(structure, sections, language);
    }

    // As many parallel parts as the request budget allows right now (at least 1, at most 4).
    const parts = planParts(sections, target, Math.max(1, Math.min(MAX_PARTS, limiter.available())));
    this.done = this.run(parts, target);
  }

  subscribe(fn: (u: FormMapUpdate) => void, since: number): Promise<FormMapDone> {
    fn({ type: 'update', stage: 'skeleton', map: this.map, ms: Date.now() - since });
    const entry = { fn, since };
    this.listeners.add(entry);
    return this.done.finally(() => this.listeners.delete(entry));
  }

  private emit(stage: FormMapUpdate['stage'], readySectionId?: string) {
    for (const l of this.listeners) l.fn({ type: 'update', stage, map: this.map, readySectionId, ms: Date.now() - l.since });
  }

  private async run(parts: Part[], target: FieldStructure[]): Promise<FormMapDone> {
    const what = this.mode === 'full' ? `whole form, ${target.length} fields` : `new fields only: ${this.newFieldIds!.join(', ')}`;
    const timings: FormMapPartTiming[] = [];
    let fallbackReason: string | undefined;

    const noKey = !geminiConfigured();
    if (noKey) fallbackReason = 'GEMINI_API_KEY not set';

    // Everything in parallel: one call per part. The first part also writes title + summary.
    const partJobs = parts.map((part, i) =>
      this.settle(
        noKey ? Promise.reject(new Error(fallbackReason)) : this.askPart(part, i === 0 && this.mode === 'full'),
        (result, late) => {
          const repairs = this.applyPart(part, result.raw);
          if (i === 0 && this.mode === 'full') this.applyMeta(result.raw);
          const t = this.timing(part, result, late);
          timings.push(t);
          this.firstSectionMs ??= t.ms;
          console.log(
            `[form-map] part ${i + 1}/${parts.length} (${part.sections.map((s) => s.id).join('+')}, ${part.fieldIds.length} fields) · ${late ? 'LATE ' : ''}gemini ${secs(t.ms)}${tokens(result)}` +
              (repairs.length ? ` · repaired: ${repairs.join('; ')}` : ''),
          );
          this.emit(late ? 'late' : 'section', part.sections[0]?.id);
        },
        (reason) => {
          fallbackReason ??= reason;
          this.markReady(part);
          timings.push({ id: part.id, fields: part.fieldIds.length, ms: Date.now() - this.started, ok: false, error: reason });
          console.log(`[form-map] part ${i + 1}/${parts.length} FALLBACK (label questions) · ${reason}`);
          this.emit('section', part.sections[0]?.id);
        },
      ),
    );

    // Complete = every part answered or timed out (the user never waits more than 15 s).
    await Promise.all(partJobs.map((j) => j.onTime));
    this.map = { ...this.map, complete: true };
    this.completeMs = Date.now() - this.started;
    this.emit('section');

    // Done = late answers in too. Cache only a map fully written by Gemini.
    const oks = await Promise.all(partJobs.map((j) => j.settled));
    const allOk = !noKey && oks.every(Boolean);
    const source = allOk ? 'gemini' : oks.some(Boolean) ? 'mixed' : 'fallback';
    if (allOk) {
      cache.set(this.key, this.map);
      byPage.set(this.pageKey, this.map);
    }
    const ms = Date.now() - this.started;
    console.log(
      `[form-map] ${source.toUpperCase()} (${what}) · ${this.language} · ${parts.length} parallel parts · first section ${secs(this.firstSectionMs)} · complete ${secs(this.completeMs)}` +
        (fallbackReason && !allOk ? ` · fallback: ${fallbackReason}` : ''),
    );
    return {
      type: 'done',
      map: this.map,
      source,
      mode: this.mode,
      newFieldIds: this.newFieldIds,
      ms,
      firstSectionMs: this.firstSectionMs,
      completeMs: this.completeMs,
      parts: timings,
      fallbackReason: allOk ? undefined : fallbackReason,
    };
  }

  /**
   * Run a job with the 15 s limit. onTime resolves at the answer or the limit, whichever is
   * first; settled resolves (true = success) when the job really ends.
   */
  private settle(
    job: Promise<GeminiResult>,
    onSuccess: (r: GeminiResult, late: boolean) => void,
    onFallback: (reason: string) => void,
  ): { onTime: Promise<void>; settled: Promise<boolean> } {
    let timedOut = false;
    let resolveOnTime!: () => void;
    const onTime = new Promise<void>((r) => (resolveOnTime = r));
    const timer = setTimeout(() => {
      timedOut = true;
      onFallback(`Gemini slower than ${PART_TIMEOUT_MS / 1000}s`);
      resolveOnTime();
    }, PART_TIMEOUT_MS);
    const settled = job.then(
      (r) => {
        clearTimeout(timer);
        onSuccess(r, timedOut);
        resolveOnTime();
        return true;
      },
      (err: unknown) => {
        clearTimeout(timer);
        if (!timedOut) onFallback(`Gemini error: ${String(err)}`);
        else console.log(`[form-map] late Gemini answer failed: ${String(err)}`);
        resolveOnTime();
        return false;
      },
    );
    return { onTime, settled };
  }

  private askPart(part: Part, withMeta: boolean): Promise<GeminiResult> {
    const s = this.structure;
    const first = s.fields.findIndex((f) => part.fieldIds.includes(f.id));
    const earlier = s.fields.slice(0, Math.max(0, first)).filter((f) => !f.sensitive);
    const whole = withMeta
      ? {
          sectionTitles: [...new Set(s.fields.map((f) => f.sectionHint).filter((x): x is string => !!x))],
          labels: s.fields.map((f) => f.label),
        }
      : undefined;
    return requestStructuredHedged(
      {
        system: PART_SYSTEM_PROMPT,
        input: buildPartPrompt({ language: this.language, pageTitle: s.pageTitle, sections: part.sections, earlier, whole }),
        schema: partSchema(
          part.fieldIds,
          part.sections.map((x) => x.id),
          s.fields.filter((f) => !f.sensitive).map((f) => f.id),
          withMeta,
        ),
      },
      env.formMapHedgeMs,
      this.priority,
    );
  }

  /** Write a part's questions into the map. Returns what had to be repaired. */
  private applyPart(part: Part, raw: unknown): string[] {
    const repairs: string[] = [];
    const r = isObject(raw) ? raw : {};
    const inPart = new Set(part.fieldIds);
    const allById = new Map(this.structure.fields.map((f) => [f.id, f]));
    const updates = new Map<string, Partial<FormMapField>>();
    const groupQuestion = new Map<string, string>();

    for (const item of asArray(r.fields)) {
      if (!isObject(item) || typeof item.id !== 'string' || !inPart.has(item.id) || updates.has(item.id)) {
        repairs.push(`dropped field ${isObject(item) ? String(item.id) : '?'}`);
        continue;
      }
      const q = typeof item.q === 'string' ? item.q.trim() : '';
      if (!q) repairs.push(`${item.id}: no question`);
      const source = allById.get(item.id)!;
      if (typeof item.g === 'string' && item.g.trim() && !source.sensitive) groupQuestion.set(item.id, item.g.trim());
      // The scanner's sensitive flag always wins: never asked aloud, local risk reason.
      if (source.sensitive) {
        updates.set(item.id, q ? { plainQuestion: q } : {});
        continue;
      }
      const risk: RiskLevel = item.r === 'legal' || item.r === 'important' ? item.r : 'none';
      updates.set(item.id, {
        ...(q ? { plainQuestion: q } : {}),
        risk,
        riskReason: risk === 'none' ? undefined : (typeof item.w === 'string' && item.w.trim()) || FALLBACK_RISK_REASON[risk][this.language],
        showIf: asCondition(item.s, item.id, allById, repairs),
      });
    }
    for (const id of part.fieldIds) if (!updates.has(id)) repairs.push(`${id}: missing (kept label)`);

    // Groups: fields of this part carrying the same group question, at least 2, not grouped yet.
    const grouped = new Set(this.map.groups.flatMap((g) => g.fieldIds));
    const byQuestion = new Map<string, string[]>();
    for (const id of part.fieldIds) {
      const gq = groupQuestion.get(id);
      if (gq && !grouped.has(id)) byQuestion.set(gq, [...(byQuestion.get(gq) ?? []), id]);
    }
    const groups: FieldGroup[] = [...byQuestion]
      .filter(([, ids]) => ids.length >= 2)
      .map(([q, ids]) => ({ id: `g-${ids[0]}`, plainQuestion: q, fieldIds: ids }));
    const groupOf = new Map(groups.flatMap((g) => g.fieldIds.map((id) => [id, g.id] as const)));

    const titles = new Map<string, string>();
    for (const s of asArray(r.sections)) {
      if (isObject(s) && typeof s.id === 'string' && typeof s.t === 'string' && s.t.trim()) titles.set(s.id, s.t.trim());
    }
    const partSections = new Set(part.sections.map((s) => s.id));
    const readyIds = this.sectionsHolding(part);

    this.map = {
      ...this.map,
      fields: this.map.fields.map((f) => {
        const u = updates.get(f.id);
        const groupId = groupOf.get(f.id);
        return u || groupId ? { ...f, ...u, ...(groupId ? { groupId } : {}) } : f;
      }),
      groups: [...this.map.groups, ...groups],
      sections: this.map.sections.map((s) =>
        readyIds.has(s.id) ? { ...s, ready: true, ...(partSections.has(s.id) && titles.get(s.id) ? { title: titles.get(s.id)! } : {}) } : s,
      ),
    };
    return repairs;
  }

  private applyMeta(raw: unknown) {
    if (!isObject(raw)) return;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    this.map = { ...this.map, ...(title ? { title } : {}), ...(summary ? { summary } : {}) };
  }

  /** Fallback: keep the label questions, but stop showing the sections as "preparing". */
  private markReady(part: Part) {
    const ids = this.sectionsHolding(part);
    this.map = { ...this.map, sections: this.map.sections.map((s) => (ids.has(s.id) ? { ...s, ready: true } : s)) };
  }

  /** Map sections that contain this part's fields (in new-fields mode they are existing sections). */
  private sectionsHolding(part: Part): Set<string> {
    const ids = new Set(part.fieldIds);
    return new Set(this.map.sections.filter((s) => s.fieldIds.some((id) => ids.has(id))).map((s) => s.id));
  }

  private timing(part: Part, r: GeminiResult, late: boolean): FormMapPartTiming {
    return {
      id: part.id,
      fields: part.fieldIds.length,
      ms: Date.now() - this.started,
      ok: true,
      late: late || undefined,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    };
  }
}

// ---------------------------------------------------------------------------
// Planning: sections (from the page) and parts (what each parallel call writes)
// ---------------------------------------------------------------------------

interface PlannedSection extends PartSection {
  fieldIds: string[];
}

/** Consecutive fields with the same page heading form a section; big ones are split. */
export function planSections(fields: FieldStructure[], idPrefix = 's'): PlannedSection[] {
  const runs: { pageTitle: string; fields: FieldStructure[] }[] = [];
  for (const f of fields) {
    const title = f.sectionHint ?? '';
    const last = runs.at(-1);
    if (last && last.pageTitle === title) last.fields.push(f);
    else runs.push({ pageTitle: title, fields: [f] });
  }
  const out: PlannedSection[] = [];
  for (const run of runs) {
    const pieces = Math.ceil(run.fields.length / MAX_SECTION_FIELDS);
    const size = Math.ceil(run.fields.length / pieces);
    for (let i = 0; i < run.fields.length; i += size) {
      const chunk = run.fields.slice(i, i + size);
      out.push({ id: `${idPrefix}${out.length + 1}`, pageTitle: run.pageTitle, fields: chunk, fieldIds: chunk.map((f) => f.id) });
    }
  }
  return out;
}

/** Group sections into at most MAX_PARTS parallel calls. (Sensitive fields: label only, never a value.) */
export function planParts(sections: PlannedSection[], target: FieldStructure[], maxParts = MAX_PARTS): Part[] {
  const askable = new Set(target.map((f) => f.id));
  const budget = Math.max(MIN_PART_FIELDS, Math.ceil(askable.size / maxParts));
  const parts: Part[] = [];
  let current: Part | null = null;
  for (const s of sections) {
    const fields = s.fields.filter((f) => askable.has(f.id));
    if (fields.length === 0) continue;
    const section = { id: s.id, pageTitle: s.pageTitle, fields };
    if (current && current.fieldIds.length + fields.length <= budget) {
      current.sections.push(section);
      current.fieldIds.push(...fields.map((f) => f.id));
    } else {
      current = { id: `p${parts.length + 1}`, sections: [section], fieldIds: fields.map((f) => f.id) };
      parts.push(current);
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Local pieces: skeleton map, label questions, sensitive questions, risk/format guesses
// ---------------------------------------------------------------------------

const TEXT = {
  part: { en: (n: number) => `Part ${n}`, fr: (n: number) => `Partie ${n}` },
  optional: { en: ' (optional)', fr: ' (facultatif)' },
  sensitive: {
    en: (label: string) => `Please type your ${label} yourself, in the highlighted box.`,
    fr: (label: string) => `Merci de taper vous-même ce champ (« ${label} ») dans la case en surbrillance.`,
  },
};

const FALLBACK_RISK_REASON: Record<Exclude<RiskLevel, 'none'>, Record<Language, string>> = {
  important: { en: 'Check this one carefully: a mistake here can matter.', fr: 'Vérifiez bien : une erreur ici peut compter.' },
  legal: { en: 'This is an agreement with legal meaning.', fr: 'C’est un accord qui a une valeur juridique.' },
  sensitive: {
    en: 'This is private: someone could misuse it, so never say it out loud.',
    fr: 'C’est une information privée : ne la dites jamais à voix haute.',
  },
};

export function skeletonMap(structure: FormStructure, sections: PlannedSection[], language: Language): FormMap {
  return {
    language,
    title: structure.pageTitle || 'Web form',
    summary: '',
    estimatedMinutes: estimateMinutes(structure.fields.length),
    formLanguage: structure.pageLanguage?.slice(0, 2) || 'en',
    sections: sections.map(
      (s, i): FormSection => ({
        id: s.id,
        title: s.pageTitle || TEXT.part[language](i + 1),
        fieldIds: s.fieldIds,
        ready: false,
      }),
    ),
    groups: [],
    fields: structure.fields.map((f, i) => localField(f, i + 1, language)),
    complete: false,
  };
}

/** The local stand-in for a field: label question, keyword risk, local format hint. */
function localField(f: FieldStructure, order: number, language: Language): FormMapField {
  const risk = guessRisk(f);
  return {
    id: f.id,
    plainQuestion: f.sensitive ? TEXT.sensitive[language](f.label) : f.label + (f.required ? '' : TEXT.optional[language]),
    risk,
    riskReason: risk === 'none' ? undefined : FALLBACK_RISK_REASON[risk][language],
    order,
    formatHint: formatHintFor(f),
  };
}

function guessRisk(f: FieldStructure): RiskLevel {
  if (f.sensitive || f.kind === 'password') return 'sensitive';
  const t = `${f.label} ${f.name ?? ''} ${f.autocomplete ?? ''}`.toLowerCase();
  if (/agree|consent|authori[sz]e|terms|certify|signature|sign\b|accepte|autorise|certifie/.test(t)) return 'legal';
  if (/income|salary|revenu|salaire|date of birth|birth|naissance|deadline|move-?in|co-?signer|guarantor|garant/.test(t)) {
    return 'important';
  }
  return 'none';
}

function formatHintFor(f: FieldStructure): string | undefined {
  if (f.kind === 'date') return 'YYYY-MM-DD';
  if (f.kind === 'number') return f.min === '0' ? 'whole number, 0 or more' : 'number';
  if (f.kind === 'checkbox') return 'true or false';
  if (f.kind === 'email') return 'email address';
  if (f.kind === 'tel') return 'phone number, digits';
  if (f.options?.length) return `one of: ${f.options.filter((o) => o.value !== '').map((o) => o.value).join(', ')}`;
  return undefined;
}

function estimateMinutes(questions: number): number {
  return Math.max(1, Math.round((questions * 25) / 60));
}

// ---------------------------------------------------------------------------
// Merge new fields into an existing map. Existing fields keep their content (only their order
// number may shift); new fields go right after the field before them on the page.
// ---------------------------------------------------------------------------

type MapParts = Pick<FormMap, 'fields' | 'groups' | 'sections'>;

export function mergeFields(base: FormMap, parts: MapParts, structure: FormStructure): FormMap {
  const existing = new Set(base.fields.map((f) => f.id));
  const added = parts.fields.filter((f) => !existing.has(f.id));
  const pageOrder = structure.fields.map((f) => f.id);

  const ordered = [...base.fields].sort((a, b) => a.order - b.order).map((f) => f.id);
  const addedSorted = [...added].sort((a, b) => pageOrder.indexOf(a.id) - pageOrder.indexOf(b.id));
  for (const f of addedSorted) {
    const prev = previousOnPage(f.id, pageOrder, ordered);
    ordered.splice(prev ? ordered.indexOf(prev) + 1 : 0, 0, f.id);
  }
  const position = new Map(ordered.map((id, i) => [id, i + 1]));
  const fields = [...base.fields, ...added].map((f) => ({ ...f, order: position.get(f.id)! })).sort((a, b) => a.order - b.order);

  const sections = base.sections.map((s) => ({ ...s, fieldIds: [...s.fieldIds] }));
  const placed = new Set(sections.flatMap((s) => s.fieldIds));
  for (const f of addedSorted) {
    if (placed.has(f.id)) continue;
    const prev = previousOnPage(f.id, pageOrder, [...placed]);
    const target = sections.find((s) => prev && s.fieldIds.includes(prev)) ?? sections[0];
    if (target) target.fieldIds.push(f.id);
    else sections.push({ id: 's1', title: TEXT.part[base.language](1), fieldIds: [f.id], ready: false });
    placed.add(f.id);
  }
  for (const s of sections) s.fieldIds.sort((a, b) => position.get(a)! - position.get(b)!);

  return {
    ...base,
    fields,
    groups: [...base.groups, ...parts.groups],
    sections,
    estimatedMinutes: Math.max(base.estimatedMinutes, estimateMinutes(fields.length)),
  };
}

/** Closest field before `id` on the page that is already in `among`. */
function previousOnPage(id: string, pageOrder: string[], among: string[]): string | undefined {
  const set = new Set(among);
  for (let i = pageOrder.indexOf(id) - 1; i >= 0; i--) if (set.has(pageOrder[i]!)) return pageOrder[i];
  return undefined;
}

// ---------------------------------------------------------------------------
// Validation helpers: never trust model output blindly
// ---------------------------------------------------------------------------

function asCondition(raw: unknown, selfId: string, byId: Map<string, FieldStructure>, repairs: string[]): FieldCondition | undefined {
  if (!isObject(raw)) return undefined;
  const target = typeof raw.id === 'string' ? byId.get(raw.id) : undefined;
  if (!target || target.id === selfId) {
    repairs.push(`dropped condition on ${selfId}`);
    return undefined;
  }
  let values = asArray(raw.v).filter((v): v is string => typeof v === 'string');
  if (target.kind === 'checkbox') {
    values = values.map((v) => (/^(true|yes|checked|on|oui)$/i.test(v) ? 'true' : 'false'));
  } else if (target.options?.length) {
    // Accept labels too (and true/false for a yes/no choice), but store option values.
    const yes = /^(yes|y|oui|true|1)$/i;
    const no = /^(no|n|non|false|0)$/i;
    values = values
      .map((v) => {
        const direct = target.options!.find((o) => o.value === v || o.label.toLowerCase() === v.toLowerCase());
        if (direct) return direct.value;
        const want = yes.test(v) ? yes : no.test(v) ? no : null;
        return want ? target.options!.find((o) => want.test(o.value) || want.test(o.label))?.value : undefined;
      })
      .filter((v): v is string => v !== undefined);
  }
  values = [...new Set(values)];
  if (values.length === 0) {
    repairs.push(`dropped condition on ${selfId} (no valid values in ${JSON.stringify(raw.v)} for ${target.id})`);
    return undefined;
  }
  return { fieldId: target.id, oneOf: values };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function pageKeyOf(cacheKey: string, language: Language): string {
  return `${cacheKey.split('#')[0]}|${language}`;
}

function secs(ms: number | undefined): string {
  return ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

function tokens(r: GeminiResult): string {
  if (!r.outputTokens) return '';
  const cached = r.cachedTokens ? ` (${r.cachedTokens} cached)` : '';
  return ` · ${r.inputTokens} in${cached} / ${r.outputTokens} out tokens${r.attempt === 2 ? ' · hedge won' : ''}`;
}
