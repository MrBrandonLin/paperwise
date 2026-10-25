/**
 * FORM STATE: one reducer for every AgentEvent, plus the questions everybody asks about the
 * state ("what's next?", "is this field relevant?", "what's missing?").
 *
 * Pure TypeScript, no browser APIs: the side-panel engine uses it, and so can the teammate's UI
 * with the mock player:
 *
 *   let state = initialFormState('fr');
 *   player.subscribe((event) => { state = reduceFormState(state, event); render(state); });
 */
import type {
  AgentEvent,
  CaptionLine,
  FieldState,
  FormMap,
  FormMapField,
  FormState,
  Language,
  ScannedField,
  ScanResult,
  SessionPhase,
} from './contract';

/** Engine-only actions on top of AgentEvents. */
export type FormStateAction =
  | AgentEvent
  | { type: 'scan_updated'; scan: ScanResult }
  | { type: 'phase'; phase: SessionPhase; error?: string }
  | { type: 'language_changed'; language: Language };

const MAX_CAPTIONS = 200;

export function initialFormState(language: Language = 'en'): FormState {
  return {
    phase: 'idle',
    userLanguage: language,
    scan: null,
    map: null,
    fields: {},
    activeFieldId: null,
    agentMode: 'off',
    captions: [],
    explanation: null,
    review: null,
  };
}

export function reduceFormState(state: FormState, action: FormStateAction): FormState {
  switch (action.type) {
    case 'form_detected':
    case 'form_map_updated': {
      const phase = state.phase === 'idle' || state.phase === 'scanning' || state.phase === 'understanding' ? 'ready' : state.phase;
      return { ...state, map: action.map, phase, fields: withFields(state.fields, action.map.fields.map((f) => f.id)) };
    }
    case 'scan_updated': {
      // Values the user typed before we started (or sensitive "filled" flags) come in here.
      const fields = withFields(state.fields, action.scan.fields.map((f) => f.id));
      for (const f of action.scan.fields) {
        const cur = fields[f.id]!;
        if (cur.status === 'empty' && f.filled) {
          fields[f.id] = { ...cur, status: 'filled', value: f.currentValue, displayValue: f.sensitive ? '' : f.currentValue, source: 'page' };
        }
      }
      return { ...state, scan: action.scan, fields };
    }
    case 'phase':
      return { ...state, phase: action.phase, error: action.error };
    case 'language_changed':
      return { ...state, userLanguage: action.language };
    case 'agent_state': {
      const phase = action.mode !== 'off' && state.phase === 'ready' ? 'interview' : state.phase;
      return { ...state, agentMode: action.mode, phase };
    }
    case 'transcript': {
      const line: CaptionLine = { role: action.role, text: action.text, final: action.final, at: action.at };
      const captions = [...state.captions];
      const last = captions.at(-1);
      // A line still being heard is replaced by the next one from the same speaker.
      if (last && last.role === action.role && !last.final) captions[captions.length - 1] = line;
      else captions.push(line);
      return { ...state, captions: captions.slice(-MAX_CAPTIONS) };
    }
    case 'go_to_field':
      return { ...state, activeFieldId: action.id, explanation: state.explanation?.fieldId === action.id ? state.explanation : null };
    case 'fill_field':
      return setField(state, action.id, {
        status: 'filled',
        value: action.value,
        displayValue: action.displayValue,
        confidence: action.confidence,
        source: action.source,
        reviewReason: undefined,
        later: undefined,
      });
    case 'field_later':
      return setField(state, action.id, { later: true, ...(state.fields[action.id]?.status === 'review' ? { status: 'empty' as const, reviewReason: undefined } : {}) });
    case 'flag_for_review':
      return setField(state, action.id, {
        status: 'review',
        reviewReason: action.reason,
        ...(action.value !== undefined ? { value: action.value } : {}),
        ...(action.displayValue !== undefined ? { displayValue: action.displayValue } : {}),
      });
    case 'request_typing':
      return setField(state, action.id, { status: 'needs_typing', reviewReason: action.reason });
    case 'highlight_field': {
      const cur = state.fields[action.id];
      if (cur?.status === action.status) return state;
      return setField(state, action.id, { status: action.status, ...(action.status === 'filled' ? { reviewReason: undefined, later: undefined } : {}) });
    }
    case 'explain_field':
      return { ...state, explanation: { fieldId: action.id, text: action.explanation } };
    case 'review_started':
      return { ...state, phase: 'review', review: { sectionIds: action.sectionIds, currentSectionId: null } };
    case 'review_section':
      return state.review ? { ...state, review: { ...state.review, currentSectionId: action.sectionId } } : state;
    case 'section_progress':
    case 'scroll_to_field':
      return state; // derived / page-only
  }
}

function withFields(fields: Record<string, FieldState>, ids: string[]): Record<string, FieldState> {
  const next = { ...fields };
  for (const id of ids) next[id] ??= { id, status: 'empty', value: '', displayValue: '' };
  return next;
}

function setField(state: FormState, id: string, patch: Partial<FieldState>): FormState {
  const cur = state.fields[id] ?? { id, status: 'empty', value: '', displayValue: '' };
  return { ...state, fields: { ...state.fields, [id]: { ...cur, ...patch, id } } };
}

// ---------------------------------------------------------------------------
// Questions about the state
// ---------------------------------------------------------------------------

export function scannedField(state: FormState, id: string): ScannedField | undefined {
  return state.scan?.fields.find((f) => f.id === id);
}

export function mapField(state: FormState, id: string): FormMapField | undefined {
  return state.map?.fields.find((f) => f.id === id);
}

/** Current value of a field, from our state or (if never touched) from the page. */
export function valueOf(state: FormState, id: string): string {
  const s = state.fields[id];
  if (s && s.status !== 'empty') return s.value;
  return scannedField(state, id)?.currentValue ?? '';
}

/** Is the map's condition (showIf) met right now? */
export function conditionMet(state: FormState, field: FormMapField): boolean {
  if (!field.showIf) return true;
  return field.showIf.oneOf.includes(valueOf(state, field.showIf.fieldId));
}

/**
 * Should we ask this field now? On the page and visible, and its condition met.
 * (The page's own visibility wins: a hidden field is never asked even if the map thinks so.)
 */
export function isApplicable(state: FormState, id: string): boolean {
  const scanned = scannedField(state, id);
  const mapped = mapField(state, id);
  if (!scanned || !scanned.visible) return false;
  return mapped ? conditionMet(state, mapped) : true;
}

/** Done = filled, or skipped on purpose. */
export function isDone(state: FormState, id: string): boolean {
  const s = state.fields[id]?.status;
  return s === 'filled' || s === 'skipped';
}

/** The fields to ask, in order. */
export function askOrder(state: FormState): FormMapField[] {
  return [...(state.map?.fields ?? [])].sort((a, b) => a.order - b.order).filter((f) => isApplicable(state, f.id));
}

/** Next field the conversation should go to: review items first, then the first empty one. */
export function nextField(state: FormState): FormMapField | undefined {
  const order = askOrder(state);
  const open = (f: FormMapField) => !isDone(state, f.id) && state.fields[f.id]?.status !== 'needs_typing';
  // Review items first, then the rest in order; "come back later" ones once everything else is done.
  return (
    order.find((f) => state.fields[f.id]?.status === 'review') ??
    order.find((f) => open(f) && !state.fields[f.id]?.later) ??
    order.find((f) => open(f))
  );
}

/** Required + applicable fields that are not filled yet. */
export function missingRequired(state: FormState): FormMapField[] {
  return askOrder(state).filter((f) => scannedField(state, f.id)?.required && state.fields[f.id]?.status !== 'filled');
}

export interface SectionProgress {
  sectionId: string;
  title: string;
  done: number;
  total: number;
}

/** Progress per section, counting only fields that apply right now. */
export function progress(state: FormState): { sections: SectionProgress[]; done: number; total: number } {
  const sections = (state.map?.sections ?? []).map((s) => {
    const ids = s.fieldIds.filter((id) => isApplicable(state, id));
    return { sectionId: s.id, title: s.title, done: ids.filter((id) => isDone(state, id)).length, total: ids.length };
  });
  return {
    sections,
    done: sections.reduce((n, s) => n + s.done, 0),
    total: sections.reduce((n, s) => n + s.total, 0),
  };
}

export type { FormMap };
