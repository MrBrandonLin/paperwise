/**
 * Voice session: the ElevenLabs conversation, wired to the form engine.
 *
 *  - the six client tools call the engine (validation + fill), results go back to the agent
 *  - the form map + rules go in at session start (prompt override), the first question is the
 *    agent's first message (saves a turn)
 *  - after every change the agent gets the compact state summary: inside every tool result for
 *    its own actions, and as a contextual update for everything else (user edits on the page,
 *    map updates), sent only while it is listening
 *  - agent_state + transcript AgentEvents come from the real session, so the UI built on the
 *    mock player works unchanged
 *  - turn latency: user stops talking (local mic) → agent starts speaking
 *
 * The SDK is injected (startSession), so this runs in tests with a fake.
 */
import { asrKeywords, buildAgentPrompt, buildFirstMessage } from '../shared/agent-prompt';
import { AGENT_TOOLS } from '../shared/agent-tools';
import type { AgentEvent, AgentMode, Language } from '../shared/contract';
import type { Result } from '../shared/messages';
import type { FormEngine } from './engine';
import { nextField } from '../shared/form-state';
import { detectLanguage, fromElevenLabs, languageInfo } from '../shared/languages';

/** The parts of the SDK conversation we use. */
export interface ConversationLike {
  endSession(): Promise<void>;
  sendContextualUpdate(text: string): void;
  /** A typed message, handled by the agent like a spoken one. */
  sendUserMessage(text: string): void;
  getInputVolume(): number;
  /** Hold to talk: no sound reaches the agent while muted (the SDK's setMicMuted). */
  setMicMuted?(muted: boolean): void;
}

export interface VoiceDeps {
  /** Conversation.startSession from @elevenlabs/client (or a fake). */
  startSession: (options: Record<string, unknown>) => Promise<ConversationLike>;
  /** Short-lived WebRTC token from our backend. */
  getToken: () => Promise<Result<{ conversationToken: string }>>;
  /** Audio worklets served from the extension (its CSP blocks the SDK's blob: workers). */
  workletPaths?: { rawAudioProcessor?: string; audioConcatProcessor?: string };
  libsampleratePath?: string;
  /** Optional LLM override per session (A/B speed tests). */
  llm?: string;
  /** TTS speaking speed, 0.7–1.2 (the panel's "slower"). Fixed for a session. */
  speed?: number;
  /** Typing only: no microphone, the agent answers in text (captions), no audio. */
  textOnly?: boolean;
  now?: () => number;
}

export interface TurnLatency {
  /** User stopped talking → agent audio started. What the user feels. */
  totalMs: number;
  /** User stopped talking → final transcript received (speech end detection + ASR). */
  toTranscriptMs?: number;
  /** Time spent inside our tools during the turn. */
  toolsMs: number;
}

/**
 * "What does this mean?", "why do they need this?", "is it safe?" in our languages: the agent's
 * reply is an explanation (shown on the panel's card).
 */
const ASKS_MEANING = new RegExp(
  [
    'what (does|do|is) .{0,30}(mean|that)', 'meaning', 'why do (they|you) need', 'is (it|this|that) safe', 'what is this for',
    'qu[ée] significa', 'qu[ée] quiere decir', 'por qu[ée] (lo )?(necesitan|piden)', 'es seguro',
    'veut dire', "qu'est-ce que", 'pourquoi (ils|vous|on)', 'est-ce (que c.est )?s[ûu]r',
    'o que (significa|quer dizer)', 'por que (precisam|pedem)', '[ée] seguro',
    'ما معنى', 'ماذا يعني', 'لماذا', 'هل هو آمن',
    '什么意思', '为什么', '安全吗',
    'что (значит|означает)', 'зачем', 'это безопасно',
    'nghĩa là gì', 'tại sao', 'có an toàn',
    'ano ang ibig sabihin', 'bakit', 'ligtas ba',
    'मतलब', 'क्यों', 'सुरक्षित',
    '무슨 뜻', '왜', '안전한가',
  ].join('|'),
  'i',
);

/** checkAnswered: the field isn't the open question (several answers at once, or a guess). */
const VOLUNTEERED = 'volunteered';
const NOT_ANSWERED = (id: string, last: string) =>
  `The user has not answered ${id} yet (their last words: "${last}"). Ask its question and wait for the answer. Never fill a field the user did not answer.`;

/** Fills one user answer may cause (a group question fills several fields) and how long it counts. */
const ANSWER_CREDITS = 6;
const ANSWER_CREDIT_MS = 30_000;

export class VoiceSession {
  private conversation: ConversationLike | null = null;
  private unsubscribe: (() => void) | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private volumeTimer: ReturnType<typeof setInterval> | undefined;
  private lastUpdate = '';
  private changes: string[] = [];
  /**
   * The agent is mid-turn (heard the user, running tools, or speaking). State updates wait until
   * it is done: an update arriving while it composes its reply after a tool call cancelled that
   * reply in live tests (the agent went silent until its 10 s timeout). The tool result already
   * carries the state, so nothing is lost.
   */
  private turnBusy = false;
  /** Changes made by the agent's own tool calls: it gets the state in the tool result instead. */
  private inTool = false;
  /**
   * Never guess: fill_field / flag_for_review need something the user actually said. Each final
   * user transcript allows a few of them (a group answer fills several fields). Live tests showed
   * the agent filling fields during a pause, before the user had answered.
   */
  private answerCredits = 0;
  private creditsAt = 0;
  /** Fields the user's last answer can be about (see answerTargets). */
  private answerable = new Set<string>();
  private lastAnswer = '';
  private updatePending = false;
  private idleFlush: ReturnType<typeof setTimeout> | undefined;
  private agentDraft = '';
  /**
   * The user asked what something means / why it's needed / if it's safe: the agent's next reply
   * is the explanation, shown on the panel's card (whether or not the agent called explain_field).
   */
  private explaining: string | null = null;
  /** The language of the user's last clear words (detectLanguage). */
  private userSpeaks: Language | null = null;
  private micMuted = false;
  /** Last typed message: the server may echo it back as a user transcript (don't count it twice). */
  private typed: { text: string; at: number } | null = null;

  // Latency tracking
  private mode: AgentMode = 'off';
  private noiseFloor = 0.4;
  private voiceRun = 0;
  private lastVoiceAt = 0;
  private userSpokeThisTurn = false;
  private transcriptAt = 0;
  private toolsMsThisTurn = 0;
  readonly turns: TurnLatency[] = [];
  onLatency: (t: TurnLatency) => void = () => {};

  constructor(
    private readonly engine: FormEngine,
    private readonly deps: VoiceDeps,
  ) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  get active(): boolean {
    return this.conversation !== null;
  }

  async start(): Promise<Result<null>> {
    if (this.conversation) return { ok: true, data: null };
    const state = this.engine.getState();
    if (!state.map) return { ok: false, error: 'No form map yet.' };
    const language: Language = state.userLanguage;
    // A second session on the same form (speed change, reconnect, after a pause): "let's continue".
    const resume = state.captions.some((c) => c.role === 'user');

    this.setMode('connecting');
    const token = await this.deps.getToken();
    if (!token.ok) {
      this.setMode('off');
      return { ok: false, error: token.error };
    }

    const clientTools = Object.fromEntries(
      AGENT_TOOLS.map((t) => [
        t.name,
        async (params: unknown) => {
          this.turnBusy = true;
          if (t.name === 'fill_field' || t.name === 'flag_for_review') {
            const id = (params as { id?: string } | null)?.id ?? '';
            const refusal = this.checkAnswered(id);
            if (refusal === VOLUNTEERED && t.name === 'fill_field') {
              // The user gave this answer along with another ("I'm Ana López, born March 3rd 1990"):
              // accepted as a proposal the user confirms (held amber, not written yet).
              params = { ...(params as object), confidence: 0.5 };
            } else if (refusal) return JSON.stringify({ ok: false, message: refusal === VOLUNTEERED ? NOT_ANSWERED(id, this.lastAnswer) : refusal });
          }
          const started = this.now();
          this.inTool = true;
          if (t.name === 'explain_field') this.explaining = (params as { id?: string } | null)?.id ?? this.explaining;
          const result = await this.engine.callTool(t.name, params).finally(() => (this.inTool = false));
          this.toolsMsThisTurn += this.now() - started;
          // The agent learns the new state right here, with the result: no separate update needed
          // (live tests: a separate update made the agent speak again and repeat itself).
          this.lastUpdate = this.engine.contextForAgent();
          return JSON.stringify({ ...result, state: this.lastUpdate });
        },
      ]),
    );

    try {
      this.conversation = await this.deps.startSession({
        conversationToken: token.data.conversationToken,
        connectionType: 'webrtc',
        overrides: {
          agent: {
            prompt: { prompt: buildAgentPrompt(state.map, state.scan, language), ...(this.deps.llm ? { llm: this.deps.llm } : {}) },
            firstMessage: buildFirstMessage(state.map, language, { resume }),
            language: languageInfo(language).elevenlabs,
          },
          asr: { keywords: asrKeywords(state.scan) },
          ...(this.deps.speed !== undefined ? { tts: { speed: Math.min(1.2, Math.max(0.7, this.deps.speed)) } } : {}),
          ...(this.deps.textOnly ? { conversation: { textOnly: true } } : {}),
        },
        clientTools,
        workletPaths: this.deps.workletPaths,
        libsampleratePath: this.deps.libsampleratePath,
        onConnect: () => this.setMode('listening'),
        onDisconnect: () => this.cleanup(),
        onError: (message: string) => console.warn('[voice] error', message),
        onModeChange: ({ mode }: { mode: 'speaking' | 'listening' }) => this.onModeChange(mode),
        onMessage: ({ source, message }: { source: 'user' | 'ai'; message: string }) => this.onFinalMessage(source, message),
        onIncomingEvent: (e: { type?: string } & Record<string, unknown>) => this.onIncoming(e),
      });
    } catch (err) {
      this.setMode('off');
      return { ok: false, error: String(err instanceof Error ? err.message : err) };
    }

    if (this.micMuted) this.conversation.setMicMuted?.(true);
    // Keep the agent in sync with every change in the form state.
    this.unsubscribe = this.engine.onEvent((e) => this.noteChange(e));
    this.volumeTimer = setInterval(() => this.sampleVolume(), 30);
    return { ok: true, data: null };
  }

  async end() {
    const c = this.conversation;
    this.cleanup();
    await c?.endSession().catch(() => {});
  }

  /**
   * The user typed instead of speaking (UiEvent user_text). Same as a spoken answer: a caption,
   * and the agent may fill the open question from it. Sensitive values never go here (the
   * agent asks the user to type those on the page).
   */
  sendText(text: string): Result<null> {
    const t = text.trim();
    if (!t) return { ok: false, error: 'Empty message.' };
    if (!this.conversation) return { ok: false, error: 'Start the conversation first.' };
    this.typed = { text: t, at: this.now() };
    this.heardUser(t);
    this.conversation.sendUserMessage(t);
    return { ok: true, data: null };
  }

  /**
   * The user picked another language in the panel during the conversation: ask the agent to
   * switch (it calls language_detection, which changes its voice and speech recognition).
   * Sent as a user message but not as an answer (no caption, no fill allowed from it).
   */
  requestLanguage(language: Language) {
    if (!this.conversation) return;
    const name = languageInfo(language).name;
    const text = `(I chose ${name} in the Paperwise settings. Please speak ${name} with me from now on, and carry on where we were.)`;
    this.typed = { text, at: this.now() };
    this.conversation.sendUserMessage(text);
  }

  /**
   * Hold to talk (noisy rooms): muted, the agent hears nothing, so other people's voices can't
   * answer for the user or cut the agent off. Set before start() to begin muted.
   */
  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    this.conversation?.setMicMuted?.(muted);
  }

  /** Microphone level 0..1 while the conversation runs (drives the voice meter). */
  inputLevel(): number {
    return this.conversation?.getInputVolume() ?? 0;
  }

  /** Something happened outside the conversation that the agent should know (e.g. page edit). */
  notify(text: string) {
    this.changes.push(text);
    this.scheduleUpdate();
  }

  // --- Contextual updates -------------------------------------------------------------------

  private noteChange(e: AgentEvent) {
    // Our own conversation events are not news for the agent, nor what its tools just did.
    if (e.type === 'agent_state' || e.type === 'transcript' || e.type === 'scroll_to_field') return;
    if (this.inTool) return;
    if (e.type === 'fill_field' && e.source === 'user') {
      const field = this.engine.getState().map?.fields.find((f) => f.id === e.id);
      this.changes.push(
        e.value === '' && e.displayValue === ''
          ? `The user typed ${e.id} on the page (value hidden).`
          : `The user changed ${e.id}${field ? ` ("${field.plainQuestion}")` : ''} on the page to "${e.displayValue}".`,
      );
    }
    this.scheduleUpdate();
  }

  private scheduleUpdate() {
    if (this.turnBusy || this.mode === 'speaking') {
      this.updatePending = true;
      // Safety net: if the agent stays silent, still deliver the update after a while.
      clearTimeout(this.idleFlush);
      this.idleFlush = setTimeout(() => {
        this.turnBusy = false;
        this.flushPending();
      }, 4000);
      return;
    }
    clearTimeout(this.updateTimer);
    // Coalesce bursts (a fill = fill + highlight + rescan) into one update.
    this.updateTimer = setTimeout(() => this.sendUpdate(), 150);
  }

  private flushPending() {
    if (!this.updatePending) return;
    this.updatePending = false;
    this.scheduleUpdate();
  }

  private sendUpdate() {
    if (!this.conversation) return;
    const context = this.engine.contextForAgent();
    // Only when something new happened or the state reads differently: no noise for the agent.
    if (this.changes.length === 0 && context === this.lastUpdate) return;
    const text = ['[state]', ...this.changes, context].join('\n');
    this.changes = [];
    this.lastUpdate = context;
    this.conversation.sendContextualUpdate(text);
  }

  // --- Events from the session → AgentEvents ---------------------------------------------------

  private setMode(mode: AgentMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.engine.emitEvent({ type: 'agent_state', mode });
  }

  private onModeChange(mode: 'speaking' | 'listening') {
    if (mode === 'listening' && this.mode === 'speaking') {
      // The agent finished its turn: now it can take the news.
      this.turnBusy = false;
      clearTimeout(this.idleFlush);
      this.setMode(mode);
      this.flushPending();
      return;
    }
    if (mode === 'speaking') {
      if (this.userSpokeThisTurn && this.lastVoiceAt) {
        const t: TurnLatency = {
          totalMs: this.now() - this.lastVoiceAt,
          toTranscriptMs: this.transcriptAt ? this.transcriptAt - this.lastVoiceAt : undefined,
          toolsMs: this.toolsMsThisTurn,
        };
        this.turns.push(t);
        this.onLatency(t);
      }
      this.userSpokeThisTurn = false;
      this.transcriptAt = 0;
      this.toolsMsThisTurn = 0;
    }
    this.setMode(mode);
  }

  private onFinalMessage(source: 'user' | 'ai', message: string) {
    if (source === 'user') {
      const echo = this.typed && this.typed.text === message.trim() && this.now() - this.typed.at < 5000;
      this.typed = null;
      if (!echo) this.heardUser(message);
      return;
    }
    // Captions in plain words, whatever the model wrote (stray markdown like **bold**).
    message = message.replace(/\*\*|__|^#+\s*/gm, '');
    this.engine.emitEvent({ type: 'transcript', role: 'agent', text: message, final: true, at: this.now() });
    this.agentDraft = '';
    if (this.explaining) {
      this.engine.showExplanation(this.explaining, message);
      this.explaining = null;
    }
    // Safety net: the agent answered in another language than the user's (it didn't switch).
    // Tell it once it listens again; the next answer comes in the user's language.
    const replied = detectLanguage(message);
    if (this.userSpeaks && replied && replied !== this.userSpeaks) {
      const name = languageInfo(this.userSpeaks).name;
      this.notify(`The user speaks ${name}. Call language_detection with ${name} and answer only in ${name} from now on.`);
    }
  }

  /** The user answered (spoken final transcript, or typed): caption + permission to fill. */
  private heardUser(message: string) {
    this.engine.emitEvent({ type: 'transcript', role: 'user', text: message, final: true, at: this.now() });
    // The user changed language without asking (just answered in Russian): the panel follows at
    // once (captions, words, RTL); the agent is told by its prompt to answer in their language.
    const spoken = detectLanguage(message);
    if (spoken) this.userSpeaks = spoken;
    if (spoken && spoken !== this.engine.getState().userLanguage) this.engine.setLanguage(spoken);
    this.turnBusy = true;
    this.answerCredits = ANSWER_CREDITS;
    this.creditsAt = this.now();
    this.answerable = this.answerTargets();
    this.lastAnswer = message;
    this.transcriptAt = this.now();
    if (ASKS_MEANING.test(message)) {
      const s = this.engine.getState();
      this.explaining = nextField(s)?.id ?? s.activeFieldId ?? null;
    }
    // Heard the user, the agent is now working on the answer.
    if (this.mode === 'listening') this.setMode('thinking');
  }

  private onIncoming(e: { type?: string } & Record<string, unknown>) {
    if (e.type === 'tentative_user_transcript') {
      const text = (e.tentative_user_transcription_event as { user_transcript?: string } | undefined)?.user_transcript;
      if (text) this.engine.emitEvent({ type: 'transcript', role: 'user', text, final: false, at: this.now() });
    } else if (e.type === 'agent_chat_response_part') {
      // Live captions while the agent's answer streams in.
      const part = e.text_response_part as { text?: string; type?: string } | undefined;
      if (part?.type === 'start') this.agentDraft = '';
      if (part?.text) {
        this.agentDraft += part.text;
        this.engine.emitEvent({ type: 'transcript', role: 'agent', text: this.agentDraft, final: false, at: this.now() });
      }
    } else if (e.type === 'interruption') {
      this.setMode('listening');
    } else if (e.type === 'agent_tool_response_full_payload' || e.type === 'agent_tool_response') {
      // ElevenLabs' language_detection switched the conversation language: the panel follows.
      const payload = (e.agent_tool_response_full_payload ?? e.agent_tool_response) as { tool_name?: string; full_tool_result?: string } | undefined;
      if (payload?.tool_name === 'language_detection') {
        const language = languageFromToolResult(payload.full_tool_result);
        if (language && language !== this.engine.getState().userLanguage) this.engine.setLanguage(language);
      }
    }
  }

  // --- Turn latency: local mic level, so "user stopped talking" is measured where it happens --

  private sampleVolume() {
    const c = this.conversation;
    if (!c) return;
    const v = c.getInputVolume();
    // Track the room's noise floor slowly; speech = clearly above it.
    if (v < this.noiseFloor) this.noiseFloor = v;
    else this.noiseFloor += (v - this.noiseFloor) * 0.002;
    const voice = v > this.noiseFloor + 0.12 && this.mode !== 'speaking';
    // At least ~150 ms of voice counts as the user talking (ignores clicks and echo tails).
    this.voiceRun = voice ? this.voiceRun + 1 : 0;
    if (this.voiceRun >= 5) this.userSpokeThisTurn = true;
    if (voice && this.userSpokeThisTurn) this.lastVoiceAt = this.now();
  }

  /**
   * Never guess. A fill needs something the user actually said, about that field:
   *  - each final user transcript allows a few fills (a group answer fills several fields)
   *  - only for the question that was open when they spoke (next field, the field the agent went
   *    to, their groups), or a field answered before (a correction)
   * Live tests showed the agent asking a question and filling an invented answer in the same breath.
   */
  private checkAnswered(id: string): string | null {
    if (this.answerCredits <= 0 || this.now() - this.creditsAt > ANSWER_CREDIT_MS) {
      return 'The user has not answered yet. Ask the question (once) and wait for their answer. Never fill a field without an answer.';
    }
    this.answerCredits--;
    // Not the open question: maybe the user answered several at once. Allowed only as a proposal.
    if (!this.answerable.has(id)) return VOLUNTEERED;
    return null;
  }

  private answerTargets(): Set<string> {
    const s = this.engine.getState();
    const ids = new Set<string>();
    const addWithGroup = (id: string | null | undefined) => {
      if (!id) return;
      ids.add(id);
      const g = s.map?.groups.find((x) => x.fieldIds.includes(id));
      g?.fieldIds.forEach((x) => ids.add(x));
    };
    addWithGroup(nextField(s)?.id);
    addWithGroup(s.activeFieldId);
    for (const f of Object.values(s.fields)) if (f.status !== 'empty') ids.add(f.id); // corrections
    return ids;
  }

  /** Median and 90th percentile of the measured turns. */
  stats(): { count: number; medianMs?: number; p90Ms?: number; lastMs?: number } {
    const xs = this.turns.map((t) => t.totalMs).sort((a, b) => a - b);
    if (!xs.length) return { count: 0 };
    const at = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
    return { count: xs.length, medianMs: at(0.5), p90Ms: at(0.9), lastMs: this.turns.at(-1)!.totalMs };
  }

  private cleanup() {
    clearTimeout(this.updateTimer);
    clearTimeout(this.idleFlush);
    clearInterval(this.volumeTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.conversation = null;
    this.setMode('off');
  }
}

/** The language in language_detection's result (JSON or text, ElevenLabs codes like "es" / "fil"). */
export function languageFromToolResult(result: string | undefined): Language | null {
  if (!result) return null;
  try {
    const json = JSON.parse(result) as Record<string, unknown>;
    for (const key of ['language', 'language_code', 'new_language', 'detected_language']) {
      const found = fromElevenLabs(typeof json[key] === 'string' ? (json[key] as string) : undefined);
      if (found) return found;
    }
  } catch {
    // not JSON
  }
  const m = /\b(?:language(?:_code)?|to)\W{0,3}([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\b/i.exec(result);
  return m ? fromElevenLabs(m[1]!.toLowerCase()) : null;
}
