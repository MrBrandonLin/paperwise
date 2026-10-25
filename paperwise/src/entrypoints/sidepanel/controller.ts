import { Conversation } from '@elevenlabs/client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Language, ScanResult } from '@/shared/contract';
import type { AgentTokenResponse, ExtensionEvent, FormMapDone, HealthResponse } from '@/shared/messages';
import { progress } from '@/shared/form-state';
import { FormEngine } from '@/engine/engine';
import { VoiceSession, type ConversationLike, type TurnLatency } from '@/engine/voice-session';
import { getMicPermission } from '@/lib/mic';
import { getActiveTabId, toBackground, toContent, UNSUPPORTED_PAGE } from '@/lib/messaging';
import type { PanelNotice } from '@/ui/adapter';
import { toLanguage } from '@/shared/languages';

/** The form's own language: the map is built once, in it (the agent translates when it talks). */
export function formLanguageOf(scan: ScanResult): Language {
  return toLanguage(scan.pageLanguage) ?? 'en';
}

/**
 * Everything the side panel does, shared by the real UI (teammate's panel) and the debug panel
 * (Shift+D): scan the page → stream the form map → engine (FORM STATE) → voice session.
 */
export function usePaperwise() {
  const tabRef = useRef<number | null>(null);
  const [engine] = useState(
    () => new FormEngine({ send: (req) => (tabRef.current === null ? Promise.resolve({ ok: false, error: 'No tab' }) : toContent(tabRef.current, req)) }),
  );
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const [log, setLog] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [mapTiming, setMapTiming] = useState('');
  const [rawScan, setRawScan] = useState<ScanResult | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const requestRef = useRef('');
  const startedRef = useRef(0);
  const firstReadyRef = useRef<number | null>(null);

  const write = useCallback((line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 80)), []);

  useEffect(() => {
    void checkBackend();
    void scanAndMap(engine.getState().userLanguage);

    engine.onMapStale = (scan) => {
      write('page shows fields the map does not know → updating the map (only the new fields are mapped)');
      void buildMap(scan, formLanguageOf(scan));
    };

    const onEvent = (msg: ExtensionEvent, sender: { tab?: { id?: number } }) => {
      if (msg?.type === 'EVENT_FORM_MAP') {
        if (msg.requestId !== requestRef.current) return;
        const line = msg.line;
        engine.setMap(line.map, line.type === 'update' ? line.readySectionId : undefined);
        const since = Date.now() - startedRef.current;
        const ready = line.map.sections.filter((s) => s.ready).length;
        if (ready > 0 && firstReadyRef.current === null) firstReadyRef.current = since;
        if (line.type === 'update') setMapTiming(`map: ${line.stage} · ${ready}/${line.map.sections.length} sections ready · ${since} ms`);
        return;
      }
      if (msg?.type === 'EVENT_MIC_GRANTED' || sender.tab?.id !== tabRef.current) return;
      if (msg.type === 'EVENT_USER_EDIT') {
        write(`user edited ${msg.id}${msg.sensitive ? ' (sensitive: value stays on the page)' : ` = "${msg.value}"`}`);
        void engine.userEdited(msg);
      } else if (msg.type === 'EVENT_FIELDS_CHANGED') {
        write(`fields changed: ${msg.scan.fields.filter((f) => f.visible).length} visible of ${msg.scan.fields.length}`);
        setRawScan(msg.scan);
        engine.setScan(msg.scan);
      }
    };
    browser.runtime.onMessage.addListener(onEvent);
    return () => browser.runtime.onMessage.removeListener(onEvent);
  }, []);

  // The floating button on the page shows progress ("3/12").
  const lastProgress = useRef('');
  useEffect(() => {
    if (tabRef.current === null || !state.map) return;
    const p = progress(state);
    const key = `${p.done}/${p.total}/${state.userLanguage}`;
    if (key === lastProgress.current) return;
    lastProgress.current = key;
    void toContent(tabRef.current, { type: 'PROGRESS', done: p.done, total: p.total, language: state.userLanguage });
  }, [state]);

  async function checkBackend() {
    const res = await toBackground<HealthResponse>({ type: 'API_HEALTH' });
    if (res.ok) {
      setHealth(res.data);
      write(`backend ok (gemini key: ${res.data.gemini}, elevenlabs key: ${res.data.elevenlabs})`);
    } else {
      setHealth(null);
      write(`backend error: ${res.error}`);
    }
  }

  async function scan(): Promise<ScanResult | null> {
    const id = await getActiveTabId();
    if (id === null) {
      write('no active tab');
      return null;
    }
    const res = await toContent<ScanResult>(id, { type: 'SCAN' });
    if (!res.ok) {
      setNotice(res.error === UNSUPPORTED_PAGE ? 'unsupported' : 'unreachable');
      write(res.error === UNSUPPORTED_PAGE ? res.error : `scan error: ${res.error}`);
      return null;
    }
    setNotice(null);
    tabRef.current = id;
    setRawScan(res.data);
    engine.setScan(res.data);
    return res.data;
  }

  async function scanAndMap(language: Language) {
    engine.setPhase('scanning');
    const s = await scan();
    if (!s) return engine.setPhase('idle');
    write(`scanned ${s.fields.length} fields (${s.fields.filter((f) => !f.visible).length} hidden) on ${s.url}`);
    if (s.fields.length === 0) {
      setNotice('noForm');
      return engine.setPhase('idle');
    }
    engine.setPhase('understanding');
    await buildMap(s, formLanguageOf(s));
  }

  async function buildMap(s: ScanResult, language: Language) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestRef.current = requestId;
    startedRef.current = Date.now();
    firstReadyRef.current = null;
    const res = await toBackground<FormMapDone>({ type: 'API_FORM_MAP', scan: s, language, requestId });
    if (requestRef.current !== requestId) return; // a newer request replaced this one
    if (!res.ok) {
      write(`form-map error: ${res.error}`);
      if (!engine.getState().map) setNotice('offline');
      return;
    }
    const d = res.data;
    engine.setMap(d.map);
    const total = Date.now() - startedRef.current;
    setMapTiming(
      `map (${d.source}${d.mode === 'new-fields' ? `, new fields: ${d.newFieldIds?.join(', ')}` : ''}): first section ${firstReadyRef.current ?? '—'} ms · complete ${d.completeMs ?? total} ms · in panel ${total} ms`,
    );
    write(`form map ${d.source} · ${d.map.fields.length} fields · ${language}${d.fallbackReason ? ` · fallback: ${d.fallbackReason}` : ''}`);
  }

  /**
   * The conversation language. The map stays as it is (it's in the form's language). During a
   * conversation the agent is asked to switch (its language_detection tool changes voice + ASR).
   */
  function changeLanguage(language: Language) {
    if (language === engine.getState().userLanguage) return;
    engine.setLanguage(language);
    voice.requestLanguage(language);
  }

  async function doToken() {
    const res = await toBackground<AgentTokenResponse>({ type: 'API_AGENT_TOKEN' });
    write(res.ok ? `agent token ok (${res.data.conversationToken ? 'WebRTC' : 'WebSocket'})` : `agent-token error: ${res.error}`);
  }

  const voice = useVoice(engine, write);

  return { engine, state, log, write, health, checkBackend, mapTiming, rawScan, scan, scanAndMap, changeLanguage, doToken, notice, tabId: tabRef.current, voice };
}

export type Paperwise = ReturnType<typeof usePaperwise>;

/** The ElevenLabs voice session (one at a time), used by both panels. */
export interface VoiceOptions {
  /** LLM override (debug A/B). */
  llm?: string;
  /** Typing only: no microphone, text replies. */
  textOnly?: boolean;
  /** Speaking speed 0.7–1.2. */
  speed?: number;
  /** Noisy room: the microphone is off unless the user holds the talk button (or Space). */
  holdToTalk?: boolean;
}

/** The ElevenLabs voice session (one at a time), used by both panels. */
function useVoice(engine: FormEngine, write: (line: string) => void) {
  const session = useRef<VoiceSession | null>(null);
  const [active, setActive] = useState(false);
  /** 'mic' = permission needed · 'lost' = reconnecting · 'lostFailed' = gave up · else an error text. */
  const [problem, setProblem] = useState<'mic' | 'lost' | 'lostFailed' | string>('');
  const [turns, setTurns] = useState<TurnLatency[]>([]);
  const [textOnly, setTextOnly] = useState(false);
  const options = useRef<VoiceOptions>({});
  /** The user pressed End (vs the connection dropping). */
  const endedByUser = useRef(false);
  const reconnects = useRef(0);
  /** Typed while no session ran: sent once the agent has connected. */
  const queued = useRef<string[]>([]);

  useEffect(() => () => void session.current?.end(), []);
  // The session can end by itself (network, server): reconnect once and resume, else explain.
  const mode = useSyncExternalStore(engine.subscribe, () => engine.getState().agentMode);
  useEffect(() => {
    if (mode !== 'off' || !active || session.current?.active) {
      if (mode === 'listening' && queued.current.length) {
        for (const text of queued.current.splice(0)) session.current?.sendText(text);
      }
      if (mode === 'listening') reconnects.current = 0;
      return;
    }
    setActive(false);
    if (endedByUser.current) return;
    if (reconnects.current < 2) {
      reconnects.current++;
      setProblem('lost');
      write('voice: connection lost, reconnecting');
      void start(options.current);
    } else setProblem('lostFailed');
  }, [mode, active]);

  async function start(opts: VoiceOptions = options.current) {
    options.current = opts;
    endedByUser.current = false;
    setProblem((p) => (p === 'lost' ? p : ''));
    setTextOnly(!!opts.textOnly);
    if (!opts.textOnly && (await getMicPermission()) !== 'granted') {
      void browser.tabs.create({ url: browser.runtime.getURL('/mic-permission.html') });
      setProblem('mic');
      return;
    }
    const s = new VoiceSession(engine, {
      startSession: (o) => Conversation.startSession(o as Parameters<typeof Conversation.startSession>[0]) as Promise<ConversationLike>,
      getToken: async () => {
        const res = await toBackground<AgentTokenResponse>({ type: 'API_AGENT_TOKEN' });
        if (!res.ok) return res;
        return res.data.conversationToken ? { ok: true, data: { conversationToken: res.data.conversationToken } } : { ok: false, error: 'No token' };
      },
      workletPaths: {
        rawAudioProcessor: browser.runtime.getURL('/elevenlabs/rawAudioProcessor.js'),
        audioConcatProcessor: browser.runtime.getURL('/elevenlabs/audioConcatProcessor.js'),
      },
      libsampleratePath: browser.runtime.getURL('/elevenlabs/libsamplerate.worklet.js'),
      llm: opts.llm || undefined,
      speed: opts.speed,
      textOnly: opts.textOnly,
    });
    s.onLatency = () => setTurns([...s.turns]);
    s.setMicMuted(!!opts.holdToTalk && !opts.textOnly);
    session.current = s;
    const res = await s.start();
    setActive(res.ok);
    if (res.ok) setProblem('');
    else {
      setProblem(res.error);
      write(`voice: could not start: ${res.error}`);
    }
  }

  async function end() {
    endedByUser.current = true;
    queued.current = [];
    await session.current?.end();
    setActive(false);
    setProblem('');
  }

  /** Restart with new options (speed, voice ↔ typing), keeping every answer: the agent resumes. */
  async function restart(opts: VoiceOptions) {
    options.current = { ...options.current, ...opts };
    if (!session.current?.active) return;
    await end();
    await start(options.current);
  }

  /** UiEvent user_text. With no conversation running, it starts one (typing only). */
  function sendText(text: string) {
    if (!session.current?.active) {
      queued.current.push(text);
      if (!active) void start({ ...options.current, textOnly: true });
      return;
    }
    const r = session.current.sendText(text);
    if (r && !r.ok) write(`voice: typed message not sent: ${r.error}`);
  }

  function requestLanguage(language: Language) {
    session.current?.requestLanguage(language);
  }

  /** Hold to talk on/off, during a conversation too (no reconnect). */
  function setHoldToTalk(on: boolean) {
    options.current = { ...options.current, holdToTalk: on };
    session.current?.setMicMuted(on);
  }

  /** Hold to talk: the user is holding the talk button (or Space). */
  function talk(on: boolean) {
    if (options.current.holdToTalk) session.current?.setMicMuted(!on);
  }

  const micLevel = useCallback(() => session.current?.inputLevel() ?? 0, []);

  return { active, problem, textOnly, turns, start, end, restart, sendText, requestLanguage, setHoldToTalk, talk, micLevel, stats: () => session.current?.stats() };
}
