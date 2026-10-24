/**
 * The form engine: FORM STATE + the agent's tools, with the safety rail.
 *
 * The agent only PROPOSES. Every proposal is validated (type, real date, option exists,
 * confidence, legal confirmation, field applies right now) before anything touches the page.
 * A failed proposal turns the field amber ("review") and tells the agent exactly how to re-ask.
 * Sensitive fields are never accepted by voice. The engine never submits the form.
 *
 * No browser.* calls: the page is reached through a PageTransport, so this runs in tests too.
 * Nothing is persisted: state lives in memory for the session only.
 */
import { CONFIDENCE_THRESHOLD } from '../shared/config';
import type {
  AgentEvent,
  AgentToolName,
  FieldIdArgs,
  FieldStatus,
  FillFieldArgs,
  FlagForReviewArgs,
  FormMap,
  FormMapField,
  FormState,
  Language,
  ScanResult,
  ToolResult,
} from '../shared/contract';
import {
  askOrder,
  conditionMet,
  initialFormState,
  isApplicable,
  mapField,
  missingRequired,
  nextField,
  progress,
  reduceFormState,
  scannedField,
  type FormStateAction,
} from '../shared/form-state';
import type { ContentRequest, Result } from '../shared/messages';
import { validateValue } from './validate';

export interface PageTransport {
  send<T>(req: ContentRequest): Promise<Result<T>>;
}

/** Checking a legal box needs a clear yes, not a guess. */
export const LEGAL_CONFIDENCE = 0.9;

const T = {
  unsure: { en: 'I’m not sure I heard this right.', fr: 'Je ne suis pas sûr d’avoir bien compris.' },
  legal: { en: 'This one needs your clear yes.', fr: 'Il me faut votre accord clair pour celui-ci.' },
  pageRefused: { en: 'The page did not accept this answer.', fr: 'La page n’a pas accepté cette réponse.' },
  typeIt: { en: 'Please type it yourself in the highlighted box.', fr: 'Merci de le taper vous-même dans la case en surbrillance.' },
  typedByYou: { en: 'typed by you (hidden)', fr: 'tapé par vous (masqué)' },
};

export class FormEngine {
  private state: FormState;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: AgentEvent) => void>();
  /** Called when the page shows fields the map doesn't know yet (rebuild/merge the map). */
  onMapStale: (scan: ScanResult) => void = () => {};

  constructor(
    private readonly page: PageTransport,
    language: Language = 'en',
  ) {
    this.state = initialFormState(language);
  }

  // --- Store (React: useSyncExternalStore(engine.subscribe, engine.getState)) --------------

  getState = (): FormState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Every AgentEvent the engine produces (UI animations, logs, agent updates). */
  onEvent(fn: (e: AgentEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  /** For the voice session: agent_state + transcript events from the real conversation. */
  emitEvent(event: AgentEvent) {
    this.apply(event);
  }

  private apply(action: FormStateAction) {
    this.state = reduceFormState(this.state, action);
    if (!['scan_updated', 'phase', 'language_changed'].includes(action.type)) {
      for (const fn of this.eventListeners) fn(action as AgentEvent);
    }
    for (const fn of this.listeners) fn();
  }

  private get lang(): Language {
    return this.state.userLanguage;
  }

  // --- Inputs --------------------------------------------------------------------------------

  setScan(scan: ScanResult) {
    this.apply({ type: 'scan_updated', scan });
    const known = new Set(this.state.map?.fields.map((f) => f.id));
    if (this.state.map && scan.fields.some((f) => !known.has(f.id))) this.onMapStale(scan);
  }

  setMap(map: FormMap, readySectionId?: string) {
    if (!this.state.map) {
      const scan = this.state.scan;
      this.apply({ type: 'form_detected', url: scan?.url ?? '', pageTitle: scan?.pageTitle ?? '', fieldCount: map.fields.length, map });
    } else {
      this.apply({ type: 'form_map_updated', map, readySectionId });
    }
  }

  setLanguage(language: Language) {
    this.apply({ type: 'language_changed', language });
  }

  setPhase(phase: FormState['phase'], error?: string) {
    this.apply({ type: 'phase', phase, error });
  }

  // --- Agent tools ---------------------------------------------------------------------------

  /** Dispatch a tool call from the agent. Names match the ElevenLabs client tools. */
  async callTool(name: AgentToolName | string, args: unknown): Promise<ToolResult> {
    const a = (args ?? {}) as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id : '';
    switch (name) {
      case 'fill_field':
        return this.fillField({
          id,
          value: String(a.value ?? ''),
          display_value: String(a.display_value ?? a.value ?? ''),
          confidence: Number(a.confidence ?? 0),
        });
      case 'flag_for_review':
        return this.flagForReview({ id, reason: String(a.reason ?? '') });
      case 'go_to_field':
        return this.goToField({ id });
      case 'explain_field':
        return this.explainField({ id });
      case 'request_typing':
        return this.requestTyping({ id });
      case 'start_review':
        return this.startReview();
      default:
        return { ok: false, message: `Unknown tool "${name}".` };
    }
  }

  async fillField(args: FillFieldArgs): Promise<ToolResult> {
    const known = this.checkKnown(args.id);
    if (known) return known;
    const { id } = args;
    const scanned = scannedField(this.state, id)!;
    const mapped = mapField(this.state, id);

    if (!scanned.visible) return { ok: false, message: `Field ${id} is hidden on the page right now (its condition is not met). Skip it.` };
    if (mapped && !conditionMet(this.state, mapped)) {
      return { ok: false, message: `Field ${id} does not apply: it depends on ${mapped.showIf!.fieldId}. Skip it.` };
    }

    const v = validateValue(scanned, mapped, args.value, this.lang);
    if (!v.ok) {
      await this.toReview(id, v.user, args.value, args.display_value);
      return { ok: false, message: v.agent };
    }

    // Optional field the user doesn't want to answer: skip it (and clear anything on the page).
    if (v.value === '' && !scanned.required) {
      if (scannedField(this.state, id)?.currentValue) await this.page.send({ type: 'FILL', id, value: '' });
      this.apply({ type: 'highlight_field', id, status: 'skipped' });
      await this.page.send({ type: 'HIGHLIGHT', id, status: 'skipped' });
      return { ok: true, message: `Skipped. ${this.nextInstruction()}`, data: { next: this.nextSummary() } };
    }

    const confidence = Math.max(0, Math.min(1, Number.isFinite(args.confidence) ? args.confidence : 0));
    if (confidence < CONFIDENCE_THRESHOLD) {
      await this.toReview(id, T.unsure[this.lang], v.value, args.display_value);
      return {
        ok: false,
        message: `Not sure enough (confidence ${confidence}). Read back "${args.display_value}" to the user and ask them to confirm, then call fill_field again with confidence ≥ ${CONFIDENCE_THRESHOLD}.`,
      };
    }
    if (mapped?.risk === 'legal' && v.value === 'true' && confidence < LEGAL_CONFIDENCE) {
      await this.toReview(id, T.legal[this.lang], v.value, args.display_value);
      return {
        ok: false,
        message: `Legal field. First read this to the user: "${mapped.riskReason ?? ''}". Only after a clear yes, call fill_field again with confidence ≥ ${LEGAL_CONFIDENCE}.`,
      };
    }

    const res = await this.page.send<{ value: string; filled: boolean }>({ type: 'FILL', id, value: v.value });
    if (!res.ok) {
      await this.toReview(id, T.pageRefused[this.lang], v.value, args.display_value);
      return { ok: false, message: `The page refused it: ${res.error} Ask again.` };
    }

    this.apply({
      type: 'fill_field',
      id,
      value: res.data.value,
      displayValue: args.display_value || res.data.value,
      confidence,
      source: 'agent',
    });
    await this.highlight(id, 'filled');
    // The answer may reveal or hide other fields (conditions): look at the page again now.
    await this.refreshScan();
    return { ok: true, message: `Filled. ${this.nextInstruction()}`, data: { next: this.nextSummary() } };
  }

  async flagForReview(args: FlagForReviewArgs): Promise<ToolResult> {
    const known = this.checkKnown(args.id);
    if (known) return known;
    await this.toReview(args.id, args.reason || T.unsure[this.lang]);
    return { ok: true, message: 'Marked for review. Ask the confirming question now.' };
  }

  async goToField(args: FieldIdArgs): Promise<ToolResult> {
    const known = this.checkKnown(args.id);
    if (known) return known;
    const res = await this.page.send({ type: 'GO_TO', id: args.id });
    if (!res.ok) return { ok: false, message: `Cannot go there: ${res.error}` };
    this.apply({ type: 'go_to_field', id: args.id });
    this.apply({ type: 'scroll_to_field', id: args.id });
    if (this.state.phase === 'review' && this.state.map) {
      const sections = this.state.review?.sectionIds ?? [];
      const section = this.state.map.sections.find((s) => s.fieldIds.includes(args.id));
      if (section && section.id !== this.state.review?.currentSectionId) {
        this.apply({ type: 'review_section', sectionId: section.id, sectionTitle: section.title, position: sections.indexOf(section.id) + 1, total: sections.length });
      }
    }
    return { ok: true, message: 'On the page now.', data: this.fieldSummary(args.id) };
  }

  async explainField(args: FieldIdArgs): Promise<ToolResult> {
    const known = this.checkKnown(args.id);
    if (known) return known;
    const info = this.fieldSummary(args.id);
    const scanned = scannedField(this.state, args.id)!;
    const text = scanned.helpText || info.riskReason || info.question;
    this.apply({ type: 'explain_field', id: args.id, explanation: text });
    return {
      ok: true,
      message: 'Explain in plain words what this field means and why the form asks for it, using this data. Then ask the question again.',
      data: { ...info, label: scanned.label, helpText: scanned.helpText },
    };
  }

  async requestTyping(args: FieldIdArgs): Promise<ToolResult> {
    const known = this.checkKnown(args.id);
    if (known) return known;
    if (this.state.fields[args.id]?.status === 'filled') return { ok: true, message: 'Already filled on the page. Move on.' };
    await this.page.send({ type: 'GO_TO', id: args.id, focus: true });
    this.apply({ type: 'go_to_field', id: args.id });
    this.apply({ type: 'request_typing', id: args.id, reason: T.typeIt[this.lang] });
    await this.highlight(args.id, 'needs_typing');
    return {
      ok: true,
      message: 'Ask the user to type it themselves in the highlighted box and to tell you when done. Never ask them to say it. You will get an update when it is filled.',
    };
  }

  async startReview(): Promise<ToolResult> {
    const missing = missingRequired(this.state);
    const inReview = askOrder(this.state).filter((f) => this.state.fields[f.id]?.status === 'review');
    if (missing.length || inReview.length) {
      const list = [...inReview, ...missing.filter((m) => !inReview.includes(m))];
      return {
        ok: false,
        message: `Not ready for review. First handle: ${list.map((f) => `${f.id} ("${f.plainQuestion}")`).join(', ')}.`,
        data: { missing: list.map((f) => ({ id: f.id, question: f.plainQuestion, status: this.state.fields[f.id]?.status ?? 'empty' })) },
      };
    }

    const map = this.state.map!;
    const sections = map.sections
      .map((s) => ({
        id: s.id,
        title: s.title,
        items: s.fieldIds
          .filter((id) => isApplicable(this.state, id) && this.state.fields[id]?.status === 'filled')
          .map((id) => {
            const f = mapField(this.state, id)!;
            const st = this.state.fields[id]!;
            const sensitive = f.risk === 'sensitive' || scannedField(this.state, id)?.sensitive;
            return {
              id,
              question: f.plainQuestion,
              answer: sensitive ? T.typedByYou[this.lang] : st.displayValue || st.value,
              risk: f.risk,
              riskReason: f.riskReason,
              confirm: f.risk === 'legal' || f.risk === 'important',
            };
          }),
      }))
      .filter((s) => s.items.length > 0);

    this.apply({ type: 'review_started', sectionIds: sections.map((s) => s.id) });
    return {
      ok: true,
      message:
        'Read the answers back section by section, in the user’s language. Call go_to_field on the first field of each section as you read it. ' +
        'Slow down on items with confirm: true: say the riskReason and ask for a clear yes. If the user wants a change, call fill_field again. ' +
        'At the end, ask them to check the page and press Submit themselves. Never submit.',
      data: { sections },
    };
  }

  // --- User edits on the page ----------------------------------------------------------------

  async userEdited(e: { id: string; value: string; filled: boolean; sensitive: boolean }) {
    if (!scannedField(this.state, e.id)) await this.refreshScan();
    if (e.sensitive) {
      // We only learn "filled or not"; the value never leaves the page.
      if (e.filled) {
        this.apply({ type: 'fill_field', id: e.id, value: '', displayValue: '', confidence: 1, source: 'user' });
        await this.highlight(e.id, 'filled');
      } else {
        const wasAsked = this.state.fields[e.id]?.status === 'needs_typing';
        this.apply({ type: 'highlight_field', id: e.id, status: wasAsked ? 'needs_typing' : 'empty' });
      }
      return;
    }
    const scanned = scannedField(this.state, e.id);
    if (!scanned) return;
    if (e.value === '') {
      this.apply({ type: 'highlight_field', id: e.id, status: 'empty' });
      await this.highlight(e.id, 'empty');
      return;
    }
    const v = validateValue(scanned, mapField(this.state, e.id), e.value, this.lang);
    if (v.ok) {
      this.apply({ type: 'fill_field', id: e.id, value: e.value, displayValue: e.value, confidence: 1, source: 'user' });
      await this.highlight(e.id, 'filled');
    } else {
      await this.toReview(e.id, v.user, e.value, e.value);
    }
    await this.refreshScan();
  }

  // --- What the agent needs to know (sent as a contextual update after every change) ---------

  contextForAgent(): string {
    const s = this.state;
    if (!s.map) return 'No form map yet.';
    const p = progress(s);
    const next = nextField(s);
    const review = askOrder(s).filter((f) => s.fields[f.id]?.status === 'review');
    const typing = askOrder(s).filter((f) => s.fields[f.id]?.status === 'needs_typing');
    const lines = [
      `User language: ${s.userLanguage}. Form: ${s.map.title}. Progress: ${p.done}/${p.total} answered.`,
      s.activeFieldId ? `Current field: ${s.activeFieldId}.` : '',
      next ? `Next: ${next.id} — "${next.plainQuestion}"${next.risk !== 'none' ? ` (${next.risk}: ${next.riskReason ?? ''})` : ''}.` : 'Every question is answered: call start_review.',
      review.length ? `Needs confirming: ${review.map((f) => `${f.id} (${s.fields[f.id]?.reviewReason ?? ''})`).join('; ')}.` : '',
      typing.length ? `Waiting for the user to type: ${typing.map((f) => f.id).join(', ')}.` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  // --- Helpers -------------------------------------------------------------------------------

  private checkKnown(id: string): ToolResult | null {
    if (scannedField(this.state, id) && mapField(this.state, id)) return null;
    const ids = askOrder(this.state).map((f) => f.id);
    return { ok: false, message: `Unknown field id "${id}". Valid ids now: ${ids.slice(0, 30).join(', ')}.` };
  }

  private async toReview(id: string, reason: string, value?: string, displayValue?: string) {
    this.apply({ type: 'flag_for_review', id, reason, value, displayValue });
    await this.highlight(id, 'review');
  }

  private async highlight(id: string, status: FieldStatus) {
    this.apply({ type: 'highlight_field', id, status });
    await this.page.send({ type: 'HIGHLIGHT', id, status });
  }

  private async refreshScan() {
    const res = await this.page.send<ScanResult>({ type: 'SCAN' });
    if (res.ok) this.setScan(res.data);
  }

  private fieldSummary(id: string) {
    const f = mapField(this.state, id) as FormMapField;
    const scanned = scannedField(this.state, id)!;
    const st = this.state.fields[id];
    return {
      id,
      question: f.plainQuestion,
      risk: f.risk,
      riskReason: f.riskReason,
      formatHint: f.formatHint,
      options: scanned.options?.filter((o) => o.value !== '').map((o) => o.label),
      currentValue: scanned.sensitive ? undefined : st?.displayValue || st?.value || scanned.currentValue || undefined,
    };
  }

  private nextSummary() {
    const n = nextField(this.state);
    return n ? { id: n.id, question: n.plainQuestion, risk: n.risk, riskReason: n.riskReason, sensitive: n.risk === 'sensitive' } : null;
  }

  private nextInstruction(): string {
    const n = nextField(this.state);
    if (!n) return 'Every question is answered: call start_review.';
    if (n.risk === 'sensitive') return `Next: ${n.id} is sensitive — call request_typing.`;
    const group = n.groupId ? this.state.map?.groups.find((g) => g.id === n.groupId) : undefined;
    const open = group?.fieldIds.filter((id) => isApplicable(this.state, id) && this.state.fields[id]?.status !== 'filled') ?? [];
    if (group && open.length > 1) return `Next: ask "${group.plainQuestion}" — one answer fills ${open.join(' + ')} (call fill_field for each).`;
    return `Next: ask "${n.plainQuestion}" (id ${n.id}).`;
  }
}
