/**
 * Paperwise shared contract.
 *
 * This file is the contract between the engine (content script, background,
 * side panel logic, backend) and the visual UI built in Lovable.
 * Do NOT change it silently — any change must be announced to the whole team.
 *
 * Pure types only: no runtime imports, so the backend can import it too.
 */

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

/**
 * Languages Paperwise can talk in (names, direction, ElevenLabs codes: shared/languages.ts).
 * Changed 2026-10-24 (was 'en' | 'fr'): the finishing pass adds 9 conversation languages.
 */
export type Language = 'en' | 'es' | 'fr' | 'ar' | 'pt' | 'zh' | 'ru' | 'vi' | 'tl' | 'hi' | 'ko';

/** The same text in several languages: English always, others when translated (else English). */
export type LocalizedText = { en: string } & Partial<Record<Language, string>>;

/** Field kinds the scanner understands. Anything else is skipped. */
export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'password';

/**
 * How much care a field needs.
 * - none:      ordinary field
 * - important: real consequences if wrong (income, dates, deadlines)
 * - legal:     consent, agreement, signature-like checkboxes
 * - sensitive: SSN, bank details, passwords — never accepted by voice, user types it
 */
export type RiskLevel = 'none' | 'important' | 'legal' | 'sensitive';

export interface FieldOption {
  /** The value the page expects (submitted value). */
  value: string;
  /** The visible label, in the form's language. */
  label: string;
}

// ---------------------------------------------------------------------------
// 1. Scanned fields — produced by the content script from the live DOM
// ---------------------------------------------------------------------------

export interface ScannedField {
  /** Stable id, also written to the element as data-paperwise-id. */
  id: string;
  kind: FieldKind;
  /** Best human label found (label[for], aria-label, placeholder, name…). */
  label: string;
  name?: string;
  placeholder?: string;
  required: boolean;
  /**
   * Shown on the page right now. Hidden fields are scanned too (conditional questions the
   * page reveals later), so their questions exist from the start. Only ask visible ones.
   */
  visible: boolean;
  /** For select and radio groups. */
  options?: FieldOption[];
  /** Current value on the page. Checkbox: 'true' | 'false'. Always '' for sensitive fields. */
  currentValue: string;
  /** Whether the field has a value (the only thing we know about sensitive fields). */
  filled: boolean;
  /**
   * SSN, bank/account/card numbers, passwords…: the value never leaves the page.
   * Detected by the scanner from type/label; the form map's risk refines it.
   */
  sensitive: boolean;
  /** Help text linked to the field (aria-describedby), if any. */
  helpText?: string;
  /** Nearest fieldset legend or heading, used to guess sections. */
  sectionHint?: string;
  autocomplete?: string;
  min?: string;
  max?: string;
  maxLength?: number;
  pattern?: string;
}

export interface ScanResult {
  url: string;
  pageTitle: string;
  /** Value of <html lang>, if any. */
  pageLanguage?: string;
  fields: ScannedField[];
}

// ---------------------------------------------------------------------------
// 2. Form map — built by the backend (POST /form-map), streamed section by section.
//    All text is in ONE language: the user's (FormMap.language). Changing language = new map.
// ---------------------------------------------------------------------------

export interface FieldCondition {
  /** Only ask this field when the other field… */
  fieldId: string;
  /** …has one of these values (option values; checkbox: 'true' | 'false'). */
  oneOf: string[];
}

export interface FormMapField {
  id: string;
  /** The question to ask, warm and in plain words, in the user's language. */
  plainQuestion: string;
  /** Filled in on demand when the user asks "what does this mean?". Not in the upfront map. */
  explanation?: string;
  risk: RiskLevel;
  /** Why it is risky, one plain sentence, shown and spoken during review. */
  riskReason?: string;
  /** Ask order, 1-based (page order unless a group moves it). */
  order: number;
  /** Fields asked together with one question (e.g. "full name" → first + last). */
  groupId?: string;
  /** Conditional logic. If set, skip unless the condition is true. */
  showIf?: FieldCondition;
  /** Expected format hint for the agent (English), e.g. "YYYY-MM-DD" or "digits only". */
  formatHint?: string;
}

export interface FormSection {
  id: string;
  title: string;
  fieldIds: string[];
  /**
   * false while the backend is still writing this section's questions: its fields then carry
   * the page label as a stand-in question. Sections arrive one by one (first one first).
   */
  ready: boolean;
}

export interface FieldGroup {
  id: string;
  /** One question that covers all fields in the group. */
  plainQuestion: string;
  fieldIds: string[];
  /**
   * 'one' = a set of checkboxes where only one applies (the W-9's tax classification): one
   * question listing the choices; checking one skips the others. (2026-10-24)
   */
  pick?: 'one';
}

export interface FormMap {
  /** Language of every text in this map (the user's language). */
  language: Language;
  /** e.g. "Rental application". Page title until the backend has written a friendly one. */
  title: string;
  /** One or two sentences: what this form is and what it is for. May be '' while streaming. */
  summary: string;
  estimatedMinutes: number;
  /** Language the form itself is written in (values are written in this language). */
  formLanguage: string;
  sections: FormSection[];
  groups: FieldGroup[];
  fields: FormMapField[];
  /** true once every section is ready and the title/summary are written. */
  complete: boolean;
}

// ---------------------------------------------------------------------------
// 3. Form state — single source of truth, owned by the side panel
// ---------------------------------------------------------------------------

/**
 * - empty:        nothing yet
 * - filled:       value written to the page and validated
 * - review:       needs the user's attention (low confidence, failed validation, risky)
 * - needs_typing: sensitive — waiting for the user to type it on the page
 * - skipped:      not applicable (condition false) or user chose to skip
 */
export type FieldStatus = 'empty' | 'filled' | 'review' | 'needs_typing' | 'skipped';

/** Who last changed the value. */
export type ValueSource = 'agent' | 'user' | 'page';

export interface FieldState {
  id: string;
  status: FieldStatus;
  /** Value written to the page, in the form's language. Checkbox: 'true' | 'false'. */
  value: string;
  /** What we show/speak to the user, in the user's language. */
  displayValue: string;
  /** 0..1, from the agent's proposal. */
  confidence?: number;
  /** Why the field needs attention (review / needs_typing), user language. */
  reviewReason?: string;
  source?: ValueSource;
  /** The user wants to come back to it: asked again after the others, before the review. (2026-10-24) */
  later?: boolean;
}

export type SessionPhase =
  | 'idle' // panel open, nothing scanned
  | 'scanning' // reading the page
  | 'understanding' // Gemini building the form map
  | 'ready' // map ready, waiting for user to start
  | 'interview' // voice conversation running
  | 'review' // final read-back before the user submits
  | 'done' // user told us they are finished
  | 'error';

/** Voice agent state, drives the listening / thinking / speaking visuals. */
export type AgentMode = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface CaptionLine {
  role: 'agent' | 'user';
  text: string;
  /** false while still being heard (the next line from the same speaker replaces it). */
  final: boolean;
  /** Date.now() */
  at: number;
}

export interface FormState {
  phase: SessionPhase;
  userLanguage: Language;
  scan: ScanResult | null;
  map: FormMap | null;
  /** Keyed by field id. */
  fields: Record<string, FieldState>;
  /** Field the conversation is currently on. */
  activeFieldId: string | null;
  agentMode: AgentMode;
  captions: CaptionLine[];
  /** The explanation being given right now (user asked "what does this mean?"). */
  explanation: { fieldId: string; text: string } | null;
  /** Review step: sections in read-back order, and the one being read now. */
  review: { sectionIds: string[]; currentSectionId: string | null } | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// 4. Agent client tools — what the ElevenLabs agent can call
//    Names and parameters must match the tools configured in the ElevenLabs dashboard.
// ---------------------------------------------------------------------------

export interface FillFieldArgs {
  id: string;
  /** Value in the form's language and format. */
  value: string;
  /** Same value in the user's language, for display. */
  display_value: string;
  /** 0..1 */
  confidence: number;
}

export interface FlagForReviewArgs {
  id: string;
  reason: string;
}

export interface FieldIdArgs {
  id: string;
}

export type AgentToolName =
  | 'fill_field'
  | 'flag_for_review'
  | 'go_to_field'
  | 'explain_field'
  | 'request_typing'
  | 'start_review'
  /** "I don't know yet" / "I'll come back to it": asked again before the review. (2026-10-24) */
  | 'come_back_later';

/** What every tool returns to the agent (as a JSON string). */
export interface ToolResult {
  ok: boolean;
  /** Short instruction for the agent, e.g. "Date invalid. Ask again." */
  message: string;
  /** Extra data, e.g. the explanation for explain_field. */
  data?: unknown;
}

// ---------------------------------------------------------------------------
// 5. Events — how the engine and the UI talk while a session runs
//    Engine → UI: AgentEvent.  UI → engine: UiEvent.
//    During UI work, src/shared/mock-player.ts emits realistic AgentEvents with no AI running.
// ---------------------------------------------------------------------------

/** Engine → UI. Event names are snake_case; payload props are camelCase. */
export type AgentEvent =
  /**
   * A form was found on the page. Sent before the user presses start. The map may still be
   * streaming (map.complete false): form_map_updated events follow as sections get ready.
   */
  | {
      type: 'form_detected';
      url: string;
      pageTitle: string;
      fieldCount: number;
      map: FormMap;
    }
  /** More of the map is ready (a section's questions, or the title/summary). Replace the map. */
  | { type: 'form_map_updated'; map: FormMap; readySectionId?: string }
  /** Voice agent state: drives the listening / thinking / speaking visuals. */
  | { type: 'agent_state'; mode: AgentMode }
  /**
   * A caption line. While `final` is false the text is still being heard:
   * replace the previous non-final line of the same role instead of adding a new one.
   */
  | { type: 'transcript'; role: CaptionLine['role']; text: string; final: boolean; at: number }
  /** The conversation moved to this field (it becomes activeFieldId). */
  | { type: 'go_to_field'; id: string }
  /** come_back_later: the user will answer this one later (before the review). (2026-10-24) */
  | { type: 'field_later'; id: string }
  /** A value was validated and written to the page. */
  | {
      type: 'fill_field';
      id: string;
      /** In the form's language, as written to the page. */
      value: string;
      /** In the user's language, for display. */
      displayValue: string;
      confidence: number;
      source: ValueSource;
    }
  /** The field needs the user's attention (amber). May carry the unsure guess. */
  | {
      type: 'flag_for_review';
      id: string;
      /** Why, in the user's language. */
      reason: string;
      value?: string;
      displayValue?: string;
    }
  /** The agent is explaining a field (user asked "what does this mean?"). */
  | { type: 'explain_field'; id: string; explanation: string }
  /** Progress changed. done = filled + skipped. */
  | {
      type: 'section_progress';
      sectionId: string;
      /** In the user's language. */
      sectionTitle: string;
      done: number;
      total: number;
      formDone: number;
      formTotal: number;
    }
  /**
   * Sensitive field: the user must type it on the page themselves, never by voice.
   * Once they have, a highlight_field with status 'filled' follows. The value is never sent.
   */
  | { type: 'request_typing'; id: string; reason: string }
  /** The read-back before submit starts. Sections are read in this order. */
  | { type: 'review_started'; sectionIds: string[] }
  /** Now reading back this section. sectionTitle in the user's language; position is 1-based ("2 of 4"). */
  | { type: 'review_section'; sectionId: string; sectionTitle: string; position: number; total: number }
  /** The field's highlight on the page changed. */
  | { type: 'highlight_field'; id: string; status: FieldStatus }
  /** The page was scrolled to this field. */
  | { type: 'scroll_to_field'; id: string };

/** UI → engine. */
export type UiEvent =
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'language_selected'; language: Language }
  /**
   * The user typed a message to the agent instead of speaking (an answer or a question).
   * Treated exactly like a spoken answer. Never use it for sensitive values: those are typed
   * on the page itself (request_typing).
   */
  | { type: 'user_text'; text: string }
  /**
   * The user changed a value themselves (typed in the panel or on the page).
   * Sensitive fields: value is always '' — only `filled` says whether they typed something.
   */
  | { type: 'user_edited_field'; id: string; value: string; filled: boolean; sensitive: boolean };

export type AgentEventType = AgentEvent['type'];
export type UiEventType = UiEvent['type'];
