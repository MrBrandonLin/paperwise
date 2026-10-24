/**
 * The ONE adapter between our engine and the teammate's UI.
 *
 * His Lovable design was a standalone demo with its own types (DemoField, DemoScenario,
 * `values: Record<string, string>`, a speaking boolean, an "Add to form" proposal…), not our
 * contract. His components stay presentational; this file turns our FormState into exactly what
 * they show. Pure: no React, no browser APIs (tested in test:state).
 *
 * Mismatches handled here (his → ours):
 *  - DemoField.question            → group question, else FormMapField.plainQuestion (streams in)
 *  - DemoField.explanation upfront  → state.explanation, only when the user asks
 *  - DemoField.section (string)    → FormSection.title + fieldIds
 *  - DemoField.type (5 kinds)       → ScannedField.kind (10 kinds); the panel never renders inputs
 *  - values[id] non-empty = done    → FieldState.status; done = filled + skipped (progress())
 *  - completed / all fields         → progress(): applicable fields only (hidden ones don't count)
 *  - active (index)                 → activeFieldId, else nextField()
 *  - speaking boolean (text timer)  → AgentMode: off | connecting | listening | thinking | speaking
 *  - bubbleReply (his Gemini)       → the agent's latest caption (live while streaming)
 *  - messages (typed, user only)    → user captions (spoken or typed), partial → final
 *  - pending "Add to form" proposal → dropped: the agent fills live; amber review + spoken confirm
 *  - his UI-side validation         → dropped: the engine validates (safety rail)
 *  - /session 'unclear' + 'stakes'  → status 'review' + reviewReason; risk legal/important + riskReason
 *  - "Language: English" (static)   → userLanguage (en | fr), all copy localized (copy.ts)
 *  - PDF envelope                   → dropped (out of scope; sensitive values are never held)
 * Safety: sensitive fields never show a value here — only "typed on the page (hidden)".
 */
import type { AgentMode, FieldStatus, FormState, Language, RiskLevel } from '@/shared/contract';
import { askOrder, isApplicable, mapField, nextField, progress, scannedField } from '@/shared/form-state';
import { COPY, type Copy } from './copy';

export type PanelScreen = 'loading' | 'notice' | 'ready' | 'talking' | 'review' | 'finished';

export interface Attention {
  kind: 'typing' | 'review' | 'legal' | 'important';
  title: string;
  text: string;
  /** What the agent heard (review), never for sensitive fields. */
  heard?: string;
  /** needs_typing: the user has typed something on the page. */
  done?: boolean;
}

export interface ReviewItem {
  id: string;
  question: string;
  answer: string;
  status: FieldStatus;
  risk: RiskLevel;
  riskReason?: string;
}

export interface PanelView {
  copy: Copy;
  language: Language;
  screen: PanelScreen;
  activity: AgentMode;
  bubble: { label: string; text: string; live: boolean };
  progress: { done: number; total: number };
  /** The map is still streaming in (sections not ready yet). */
  preparing: boolean;
  attention: Attention | null;
  explanation: { question: string; text: string } | null;
  review: { position: number; total: number; title: string; items: ReviewItem[] } | null;
  /** Recent user lines (spoken or typed); the last one may still be partial. */
  userLines: { text: string; final: boolean }[];
  /** The conversation is running (mic on, typing allowed). */
  inConversation: boolean;
  canStart: boolean;
  /** Shown instead of everything else (e.g. "Paperwise can't work on this page."). */
  notice: string | null;
}

/** Why the panel can't help on this page (shown instead of everything else). */
export type PanelNotice = 'unsupported' | 'unreachable' | 'noForm' | 'offline';

export interface PanelExtras {
  notice?: PanelNotice | null;
}

export function toPanelView(state: FormState, extras: PanelExtras = {}): PanelView {
  const language = state.userLanguage;
  const copy = COPY[language];
  const map = state.map;
  const activity = state.agentMode;
  const inConversation = activity !== 'off';
  const prog = progress(state);
  const order = askOrder(state);
  const next = nextField(state);
  const focusId = state.activeFieldId && isApplicable(state, state.activeFieldId) ? state.activeFieldId : next?.id ?? null;
  const userLines = state.captions
    .filter((c) => c.role === 'user')
    .slice(-4)
    .map((c) => ({ text: c.text, final: c.final }));
  const lastAgent = [...state.captions].reverse().find((c) => c.role === 'agent');
  const allDone = !!map && prog.total > 0 && !next;

  const base = {
    copy,
    language,
    activity,
    progress: { done: prog.done, total: prog.total },
    preparing: !!map && !map.complete,
    userLines,
    inConversation,
  };

  // 1. Nothing to work with.
  const notice = extras.notice ? copy.notices[extras.notice] : state.phase === 'error' ? state.error ?? null : null;
  if (notice) {
    return { ...base, screen: 'notice', bubble: { label: copy.appName, text: notice, live: false }, attention: null, explanation: null, review: null, canStart: false, notice };
  }
  if (!map) {
    return { ...base, screen: 'loading', bubble: { label: copy.appName, text: copy.reading, live: false }, attention: null, explanation: null, review: null, canStart: false, notice: null };
  }

  // 2. Review read-back.
  const reviewing = state.phase === 'review' && state.review;
  let review: PanelView['review'] = null;
  // The read-back starts at the first section until the agent moves to one.
  const currentId = reviewing ? state.review!.currentSectionId ?? state.review!.sectionIds[0] : undefined;
  if (reviewing && currentId) {
    const section = map.sections.find((s) => s.id === currentId);
    const position = state.review!.sectionIds.indexOf(currentId) + 1;
    if (section) {
      review = {
        position,
        total: state.review!.sectionIds.length,
        title: section.title,
        items: section.fieldIds.filter((id) => isApplicable(state, id)).map((id) => reviewItem(state, id, copy)),
      };
    }
  }

  // 3. The speech bubble: what the agent is saying, or what comes next.
  const focusLabel = focusId ? fieldLabel(state, focusId, order.findIndex((f) => f.id === focusId) + 1, copy) : copy.appName;
  let bubble: PanelView['bubble'];
  if (review) bubble = { label: copy.readingBack(review.position, review.total), text: lastAgent?.text ?? '', live: !!lastAgent && !lastAgent.final };
  else if (activity === 'connecting') bubble = { label: copy.appName, text: copy.connecting, live: false };
  else if (inConversation && lastAgent) bubble = { label: allDone ? copy.readyToReview : focusLabel, text: lastAgent.text, live: !lastAgent.final };
  else if (allDone) bubble = { label: copy.readyToReview, text: copy.allAnswered, live: false };
  else if (state.captions.length > 0) bubble = { label: focusLabel, text: copy.paused, live: false };
  else bubble = { label: copy.appName, text: copy.intro(map.title, map.estimatedMinutes), live: false };

  const screen: PanelScreen = review ? 'review' : allDone && !inConversation ? 'finished' : inConversation ? 'talking' : 'ready';

  return {
    ...base,
    screen,
    bubble,
    attention: focusId && !review ? attentionFor(state, focusId, copy) : null,
    explanation: explanationView(state),
    review,
    canStart: !inConversation,
    notice: null,
  };
}

function isSensitive(state: FormState, id: string): boolean {
  return !!scannedField(state, id)?.sensitive || mapField(state, id)?.risk === 'sensitive';
}

/** "Field 3 · Phone number": the label as written on the page, so the user can find it. */
function fieldLabel(state: FormState, id: string, n: number, copy: Copy): string {
  const label = scannedField(state, id)?.label || mapField(state, id)?.plainQuestion || id;
  return copy.fieldLabel(Math.max(n, 1), label);
}

function attentionFor(state: FormState, id: string, copy: Copy): Attention | null {
  const f = state.fields[id];
  const m = mapField(state, id);
  const sensitive = isSensitive(state, id);
  if (f?.status === 'needs_typing' || (sensitive && f?.status !== 'filled' && state.activeFieldId === id)) {
    return { kind: 'typing', title: copy.typeIt, text: f?.reviewReason || copy.typingHelp, done: !!scannedField(state, id)?.filled };
  }
  if (sensitive && f?.status === 'filled') return { kind: 'typing', title: copy.typeIt, text: copy.typedDone, done: true };
  if (f?.status === 'review') {
    return { kind: 'review', title: copy.checkThis, text: f.reviewReason ?? '', ...(f.displayValue ? { heard: f.displayValue } : {}) };
  }
  if (m?.risk === 'legal' && m.riskReason) return { kind: 'legal', title: copy.legal, text: m.riskReason };
  if (m?.risk === 'important' && m.riskReason) return { kind: 'important', title: copy.important, text: m.riskReason };
  return null;
}

function explanationView(state: FormState): PanelView['explanation'] {
  const e = state.explanation;
  if (!e) return null;
  const m = mapField(state, e.fieldId);
  const group = m?.groupId ? state.map?.groups.find((g) => g.id === m.groupId) : undefined;
  return { question: group?.plainQuestion ?? m?.plainQuestion ?? '', text: e.text };
}

function reviewItem(state: FormState, id: string, copy: Copy): ReviewItem {
  const f = state.fields[id];
  const m = mapField(state, id);
  const status: FieldStatus = f?.status ?? 'empty';
  let answer: string;
  if (isSensitive(state, id)) answer = scannedField(state, id)?.filled || status === 'filled' ? copy.typedOnPage : copy.notAnswered;
  else if (status === 'skipped') answer = copy.skipped;
  else answer = f?.displayValue || f?.value || copy.notAnswered;
  return {
    id,
    question: m?.plainQuestion ?? scannedField(state, id)?.label ?? id,
    answer,
    status,
    risk: m?.risk ?? 'none',
    ...(m?.riskReason ? { riskReason: m.riskReason } : {}),
  };
}
