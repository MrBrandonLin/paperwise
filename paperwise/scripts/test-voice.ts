/**
 * pnpm test:voice — the voice session wiring, with a fake ElevenLabs SDK:
 * session options (token, WebRTC, prompt with the form map, first message, language, keywords,
 * worklets), the six client tools → engine, contextual updates after every change (incl. page
 * edits), agent_state + transcript events, and the turn-latency measurement.
 */
import { AGENT_TOOLS } from '../src/shared/agent-tools';
import type { AgentEvent } from '../src/shared/contract';
import { FormEngine } from '../src/engine/engine';
import { VoiceSession, type ConversationLike } from '../src/engine/voice-session';
import { FakePage, rentalMap } from './lib/fake-rental';

let failures = 0;
let passes = 0;
const check = (cond: unknown, msg: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Opts = Record<string, any>;
class FakeConversation implements ConversationLike {
  updates: string[] = [];
  typed: string[] = [];
  ended = false;
  volume = 0.4;
  constructor(readonly opts: Opts) {}
  async endSession() {
    this.ended = true;
    this.opts.onDisconnect?.({ reason: 'user' });
  }
  sendContextualUpdate(text: string) {
    this.updates.push(text);
  }
  sendUserMessage(text: string) {
    this.typed.push(text);
  }
  getInputVolume() {
    return this.volume;
  }
}

function setup(language: 'en' | 'fr' = 'fr', tokenOk = true) {
  const page = new FakePage();
  const engine = new FormEngine(page, language);
  engine.setScan(page.scan());
  engine.setMap(rentalMap(language));
  const events: AgentEvent[] = [];
  engine.onEvent((e) => events.push(e));
  let convo: FakeConversation | null = null;
  const session = new VoiceSession(engine, {
    startSession: async (opts) => (convo = new FakeConversation(opts)),
    getToken: async () => (tokenOk ? { ok: true, data: { conversationToken: 'tok-123' } } : { ok: false, error: 'no key' }),
    workletPaths: { rawAudioProcessor: 'chrome-extension://x/elevenlabs/rawAudioProcessor.js' },
  });
  return { page, engine, events, session, convo: () => convo! };
}

console.log('\n=== Session start');
{
  const noMap = new VoiceSession(new FormEngine(new FakePage()), { startSession: async () => new FakeConversation({}), getToken: async () => ({ ok: true, data: { conversationToken: 't' } }) });
  check(!(await noMap.start()).ok, 'refuses to start without a form map');
  const failing = setup('fr', false);
  const r = await failing.session.start();
  check(!r.ok && failing.engine.getState().agentMode === 'off', 'token failure → error, agent off');

  const { session, convo, engine } = setup('fr');
  const ok = await session.start();
  const o = convo().opts;
  check(ok.ok && session.active, 'started');
  check(o.conversationToken === 'tok-123' && o.connectionType === 'webrtc', 'WebRTC with our token');
  const prompt: string = o.overrides.agent.prompt.prompt;
  check(prompt.includes('Speak only French') && prompt.includes('never submit'), 'prompt: rules + French');
  check(prompt.includes('pw-dob | Q Date of birth') && prompt.includes('format: YYYY-MM-DD'), 'prompt: form map lines with formats');
  check(prompt.includes('only if pw-status is employed or self'), 'prompt: conditions');
  check(prompt.includes('SENSITIVE') && prompt.includes('LEGAL'), 'prompt: risks');
  check(prompt.includes('pw-first + pw-last: "What is your full name?"'), 'prompt: group question');
  check(o.overrides.agent.language === 'fr' && o.overrides.agent.firstMessage.startsWith('Bonjour') && o.overrides.agent.firstMessage.includes('What is your full name?'), 'first message: French welcome + first question');
  check(o.overrides.asr.keywords.includes('Self-employed'), 'ASR keywords from the choices');
  check(AGENT_TOOLS.every((t) => typeof o.clientTools[t.name] === 'function') && Object.keys(o.clientTools).length === 6, 'all six client tools registered');
  check(o.workletPaths.rawAudioProcessor.startsWith('chrome-extension://'), 'worklets served by the extension');
  check(engine.getState().agentMode === 'connecting', 'agent_state: connecting');
  o.onConnect({ conversationId: 'c1' });
  check(engine.getState().agentMode === 'listening', 'agent_state: listening once connected');
  await session.end();
}

console.log('\n=== Client tools → engine, contextual updates after every change');
{
  const { session, convo, engine, page } = setup('fr');
  await session.start();
  const tools = convo().opts.clientTools;
  /** The agent speaks its reply, then listens again (end of its turn). */
  const agentTurn = async () => {
    convo().opts.onModeChange({ mode: 'speaking' });
    await sleep(30);
    convo().opts.onModeChange({ mode: 'listening' });
    await sleep(250);
  };
  convo().opts.onMessage({ source: 'user', message: 'Marie' });
  const raw = await tools.fill_field({ id: 'pw-first', value: 'Marie', display_value: 'Marie', confidence: 0.95 });
  const result = JSON.parse(raw);
  check(typeof raw === 'string' && result.ok && page.values.get('pw-first') === 'Marie', 'fill_field reaches the page, result returned as JSON');
  check(typeof result.state === 'string' && result.state.includes('Next: pw-last'), 'the tool result carries the new state');
  await agentTurn();
  check(convo().updates.length === 0, 'no separate update for the agent’s own actions (it made the agent repeat itself)');
  convo().opts.onMessage({ source: 'user', message: 'Dubois' });
  await tools.fill_field({ id: 'pw-last', value: 'Dubois', display_value: 'Dubois', confidence: 0.95 });
  await agentTurn();
  convo().opts.onMessage({ source: 'user', message: 'Le trente février' });
  const bad = JSON.parse(await tools.fill_field({ id: 'pw-dob', value: '2026-02-30', display_value: '30 février', confidence: 0.9 }));
  await agentTurn();
  check(!bad.ok && bad.state.includes('Needs confirming: pw-dob'), 'refusal: agent told, amber field in the state it gets back');
  await engine.userEdited({ id: 'pw-email', value: 'marie@example.com', filled: true, sensitive: false });
  await sleep(250);
  check(convo().updates.length === 1 && convo().updates.at(-1)!.includes('The user changed pw-email') && convo().updates.at(-1)!.includes('marie@example.com'), 'page edit by the user → contextual update');
  await tools.request_typing({ id: 'pw-ssn' });
  await agentTurn();
  await engine.userEdited({ id: 'pw-ssn', value: '', filled: true, sensitive: true });
  await sleep(250);
  const last = convo().updates.at(-1)!;
  check(last.includes('The user typed pw-ssn on the page (value hidden)'), 'SSN typed → agent told, value hidden');
  const explain = JSON.parse(await tools.explain_field({ id: 'pw-income' }));
  check(explain.ok && explain.data.label.startsWith('Gross monthly income'), 'explain_field returns what is known about the field');
  const review = JSON.parse(await tools.start_review({}));
  check(!review.ok && review.message.includes('Not ready'), 'start_review refuses while questions are open');
  await agentTurn();
  const n = convo().updates.length;
  await sleep(300);
  check(convo().updates.length === n, 'no update when nothing changed');
  // A user edit while the agent talks waits for the end of its turn.
  convo().opts.onModeChange({ mode: 'speaking' });
  await engine.userEdited({ id: 'pw-phone', value: '555-0142', filled: true, sensitive: false });
  await sleep(250);
  check(convo().updates.length === n, 'user edit while the agent speaks: held back');
  convo().opts.onModeChange({ mode: 'listening' });
  await sleep(250);
  check(convo().updates.length === n + 1 && convo().updates.at(-1)!.includes('The user changed pw-phone'), 'delivered when the agent is done');
  const m = convo().updates.length;
  await session.end();
  await engine.userEdited({ id: 'pw-last', value: 'Dubois', filled: true, sensitive: false });
  await sleep(250);
  check(convo().updates.length === m && convo().ended, 'after end: no more updates, session closed');
  check(engine.getState().agentMode === 'off', 'agent_state: off');
}

console.log('\n=== Never guess: no fill without something the user said');
{
  const { session, convo, page } = setup('fr');
  await session.start();
  const tools = convo().opts.clientTools;
  const early = JSON.parse(await tools.fill_field({ id: 'pw-employer', value: '', display_value: '', confidence: 0.9 }));
  check(!early.ok && early.message.includes('has not answered yet') && page.fills('pw-employer') === 0, 'fill before any answer → refused, page untouched');
  const flag = JSON.parse(await tools.flag_for_review({ id: 'pw-dob', reason: 'x' }));
  check(!flag.ok, 'flag_for_review before any answer → refused');
  check(JSON.parse(await tools.go_to_field({ id: 'pw-dob' })).ok, 'navigation tools still work');
  convo().opts.onMessage({ source: 'user', message: 'Marie Dubois' });
  const a = JSON.parse(await tools.fill_field({ id: 'pw-first', value: 'Marie', display_value: 'Marie', confidence: 0.95 }));
  const b = JSON.parse(await tools.fill_field({ id: 'pw-last', value: 'Dubois', display_value: 'Dubois', confidence: 0.95 }));
  check(a.ok && b.ok, 'one answer can fill a group (first + last name)');
  const invented = JSON.parse(await tools.fill_field({ id: 'pw-income', value: '3000', display_value: 'trois mille', confidence: 1 }));
  check(!invented.ok && invented.message.includes('has not answered pw-income') && page.fills('pw-income') === 0, 'an invented answer for another question is refused (live bug)');
  const correction = JSON.parse(await tools.fill_field({ id: 'pw-first', value: 'Marie-Anne', display_value: 'Marie-Anne', confidence: 0.95 }));
  check(correction.ok, 'correcting an earlier answer is allowed');
  for (let i = 0; i < 4; i++) await tools.flag_for_review({ id: 'pw-dob', reason: 'loop' });
  const loop = JSON.parse(await tools.fill_field({ id: 'pw-dob', value: '', display_value: '', confidence: 0.9 }));
  check(!loop.ok && loop.message.includes('has not answered yet'), 'a self-loop of tool calls stops: wait for the user');
  await session.end();
}

console.log('\n=== Typed messages (user_text): same rules as a spoken answer');
{
  const { session, convo, engine, page } = setup('fr');
  check(!session.sendText('Marie').ok, 'typing before the conversation starts → refused');
  await session.start();
  const tools = convo().opts.clientTools;
  check(!session.sendText('   ').ok && convo().typed.length === 0, 'empty text → nothing sent');
  const r = session.sendText('  Marie Dubois ');
  check(r.ok && convo().typed[0] === 'Marie Dubois', 'typed text goes to the agent as a user message');
  let caps = engine.getState().captions;
  check(caps.length === 1 && caps[0]!.role === 'user' && caps[0]!.text === 'Marie Dubois' && caps[0]!.final, 'typed text shows as the user’s caption');
  const a = JSON.parse(await tools.fill_field({ id: 'pw-first', value: 'Marie', display_value: 'Marie', confidence: 0.95 }));
  check(a.ok && page.values.get('pw-first') === 'Marie', 'the agent may fill the open question from a typed answer');
  const invented = JSON.parse(await tools.fill_field({ id: 'pw-income', value: '3000', display_value: '3000', confidence: 1 }));
  check(!invented.ok && page.fills('pw-income') === 0, 'never guess still applies to typed answers');
  convo().opts.onMessage({ source: 'user', message: 'Marie Dubois' }); // server echo of the typed text
  caps = engine.getState().captions;
  check(caps.filter((c) => c.role === 'user').length === 1, 'an echo of the typed text is not shown twice');
  convo().opts.onMessage({ source: 'user', message: 'Dubois' });
  check(engine.getState().captions.filter((c) => c.role === 'user').length === 2, 'the next spoken answer still shows');
  await session.end();
}

console.log('\n=== Transcripts + agent states from the session');
{
  const { session, convo, engine } = setup('fr');
  await session.start();
  const o = convo().opts;
  o.onConnect({});
  o.onIncomingEvent({ type: 'tentative_user_transcript', tentative_user_transcription_event: { user_transcript: 'Marie Du' } });
  o.onIncomingEvent({ type: 'tentative_user_transcript', tentative_user_transcription_event: { user_transcript: 'Marie Dubois' } });
  o.onMessage({ source: 'user', message: 'Marie Dubois' });
  let caps = engine.getState().captions;
  check(caps.length === 1 && caps[0]!.text === 'Marie Dubois' && caps[0]!.final, 'partial user captions replaced by the final line');
  check(engine.getState().agentMode === 'thinking', 'agent_state: thinking after the user spoke');
  o.onModeChange({ mode: 'speaking' });
  check(engine.getState().agentMode === 'speaking', 'agent_state: speaking');
  o.onIncomingEvent({ type: 'agent_chat_response_part', text_response_part: { type: 'start', text: '' } });
  o.onIncomingEvent({ type: 'agent_chat_response_part', text_response_part: { type: 'delta', text: 'Merci Marie. ' } });
  o.onIncomingEvent({ type: 'agent_chat_response_part', text_response_part: { type: 'delta', text: 'Votre date de naissance ?' } });
  caps = engine.getState().captions;
  check(caps.at(-1)!.text === 'Merci Marie. Votre date de naissance ?' && !caps.at(-1)!.final, 'agent caption streams in');
  o.onMessage({ source: 'ai', message: 'Merci Marie. Votre date de naissance ?' });
  caps = engine.getState().captions;
  check(caps.length === 2 && caps[1]!.final, 'agent final line replaces the streamed one');
  o.onIncomingEvent({ type: 'interruption', interruption_event: { event_id: 3 } });
  check(engine.getState().agentMode === 'listening', 'interruption → listening');
  await session.end();
}

console.log('\n=== Turn latency: user stops talking → agent starts speaking');
{
  const { session, convo } = setup('fr');
  await session.start();
  const c = convo();
  c.opts.onConnect({});
  await sleep(300); // room noise only
  c.volume = 0.8; // user talks
  await sleep(600);
  c.volume = 0.42; // user stops
  const stoppedAt = Date.now();
  await sleep(450);
  c.opts.onMessage({ source: 'user', message: 'Le quatre mars' });
  await c.opts.clientTools.fill_field({ id: 'pw-dob', value: '1958-03-04', display_value: '4 mars 1958', confidence: 0.95 });
  await sleep(300);
  c.opts.onModeChange({ mode: 'speaking' });
  const real = Date.now() - stoppedAt;
  const t = session.turns[0];
  check(session.turns.length === 1, 'one turn measured');
  check(t && Math.abs(t.totalMs - real) < 80, `latency ${t?.totalMs} ms ≈ real ${real} ms`);
  check(t && t.toTranscriptMs !== undefined && Math.abs(t.toTranscriptMs - 450) < 80, `speech end → transcript ${t?.toTranscriptMs} ms`);
  check(t && t.toolsMs >= 0 && t.toolsMs < 200, `tool time measured (${t?.toolsMs} ms)`);
  c.opts.onModeChange({ mode: 'listening' });
  c.volume = 0.85; // echo blip, too short to be speech
  await sleep(60);
  c.volume = 0.42;
  await sleep(200);
  c.opts.onModeChange({ mode: 'speaking' });
  check(session.turns.length === 1, 'a short blip is not counted as a user turn');
  const s = session.stats();
  check(s.count === 1 && s.medianMs === t!.totalMs, 'stats');
  await session.end();
}

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nALL ${passes} PASSED`);
process.exit(failures ? 1 : 0);
