/**
 * pnpm --dir server voice:sim [--llm <model>] [--lang fr|en] [--quiet]
 *
 * A full voice conversation with the REAL ElevenLabs agent, with no human: a simulated French
 * user (ElevenLabs text-to-speech, streamed as real-time 16 kHz audio) fills /test/rental.html
 * entirely by voice, asks "what does gross mean?" in the middle, and corrects an answer.
 * It runs the same VoiceSession + FormEngine code as the side panel (only the transport is
 * swapped: WebSocket in Node instead of WebRTC in the browser), against a fake rental page.
 *
 * Prints the transcript, every tool call, the final form values, and the turn latency
 * (user stops talking → first agent audio arrives) with median / p90.
 *
 * Needs ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID (run agent:setup first) and GEMINI_API_KEY.
 */
import { readFileSync } from 'node:fs';
import { buildAgentPrompt } from '../../src/shared/agent-prompt.ts';
import type { Language, ScanResult } from '../../src/shared/contract.ts';
import { nextField } from '../../src/shared/form-state.ts';
import { FormEngine } from '../../src/engine/engine.ts';
import { VoiceSession, type ConversationLike } from '../../src/engine/voice-session.ts';
import { FakePage } from '../../scripts/lib/fake-rental.ts';
import { env } from '../src/env.ts';
import { streamFormMap } from '../src/form-map.ts';

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const language: Language = opt('lang') === 'en' ? 'en' : 'fr';
const llm = opt('llm');
const quiet = args.includes('--quiet');
const MAX_MINUTES = 7;

if (!env.elevenlabsApiKey || !env.elevenlabsAgentId) {
  console.error('Needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in server/.env (run `pnpm --dir server agent:setup` first).');
  process.exit(1);
}
const XI = { 'xi-api-key': env.elevenlabsApiKey };
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
const log = (...a: unknown[]) => console.log(ts(), ...a);

// --- The form: real scan, real (cached) form map, fake page ------------------------------------
const scan = JSON.parse(readFileSync(new URL('../test-pages/scans/rental.json', import.meta.url), 'utf8')) as ScanResult;
const mapDone = await streamFormMap(scan, language);
log(`form map: ${mapDone.source}, ${mapDone.map.fields.length} fields, ${mapDone.ms} ms`);
const page = new FakePage();
const engine = new FormEngine(page, language);
engine.setScan(page.scan());
engine.setMap(mapDone.map);
const toolLog: { name: string; args: unknown; ok: boolean; message: string; ms: number }[] = [];
const origCall = engine.callTool.bind(engine);
engine.callTool = async (name, a) => {
  const started = Date.now();
  const r = await origCall(name, a);
  toolLog.push({ name, args: a, ok: r.ok, message: r.message, ms: Date.now() - started });
  if (!quiet) log(`  🔧 ${name}(${JSON.stringify(a)}) → ${r.ok ? 'ok' : 'REFUSED'}: ${r.message.slice(0, 110)}`);
  return r;
};

// --- Simulated user voice (ElevenLabs TTS, raw 16 kHz PCM) ---------------------------------------
async function pickUserVoice(): Promise<string> {
  if (process.env.SIM_USER_VOICE_ID) return process.env.SIM_USER_VOICE_ID;
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: XI });
  const body = (await res.json()) as { voices: { voice_id: string; name: string; category?: string }[] };
  const v = body.voices.find((x) => x.category === 'premade') ?? body.voices[0];
  if (!v) throw new Error('No voice available for the simulated user');
  return v.voice_id;
}
const userVoice = await pickUserVoice();
const ttsCache = new Map<string, Buffer>();
async function speech(text: string): Promise<Buffer> {
  const hit = ttsCache.get(text);
  if (hit) return hit;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${userVoice}?output_format=pcm_16000`, {
    method: 'POST',
    headers: { ...XI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: language }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  ttsCache.set(text, buf);
  return buf;
}

// --- WebSocket transport that looks like the SDK conversation to VoiceSession -------------------
const CHUNK_MS = 50;
const CHUNK_BYTES = (16000 * 2 * CHUNK_MS) / 1000;
let userSpeaking = false;
let agentAudioBytes = 0;
let agentTurnStart = 0;
let agentLastChunk = 0;
let agentRate = 16000;
let agentSpeaking = false;
let agentLastText = '';
let finished = false;

function wsStartSession(opts: Record<string, any>): Promise<ConversationLike> {
  const url = opts.conversationToken as string; // the sim passes the signed URL here
  const ws = new WebSocket(url);
  const outQueue: Buffer[] = [];
  const send = (m: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

  // Continuous mic stream: speech when the simulated user talks, silence otherwise.
  const silence = Buffer.alloc(CHUNK_BYTES);
  const mic = setInterval(() => {
    const chunk = outQueue.shift();
    userSpeaking = !!chunk;
    send({ user_audio_chunk: (chunk ?? silence).toString('base64') });
  }, CHUNK_MS);

  // Agent playback estimate: speaking from the first audio chunk until its audio would end.
  const playback = setInterval(() => {
    if (!agentSpeaking) return;
    const playedUntil = agentTurnStart + (agentAudioBytes / (agentRate * 2)) * 1000;
    if (Date.now() > playedUntil + 150 && Date.now() - agentLastChunk > 300) {
      agentSpeaking = false;
      opts.onModeChange?.({ mode: 'listening' });
    }
  }, 50);

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      send({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: { prompt: opts.overrides.agent.prompt, first_message: opts.overrides.agent.firstMessage, language: opts.overrides.agent.language },
          asr: { keywords: opts.overrides.asr.keywords },
        },
      });
      resolve({
        endSession: async () => {
          clearInterval(mic);
          clearInterval(playback);
          ws.close();
        },
        sendContextualUpdate: (text: string) => send({ type: 'contextual_update', text }),
        sendUserMessage: (text: string) => send({ type: 'user_message', text }),
        // Loud while the simulated user talks: VoiceSession measures speech end from this.
        getInputVolume: () => (userSpeaking ? 0.85 : 0.4),
        speak: (pcm: Buffer) => {
          for (let i = 0; i < pcm.length; i += CHUNK_BYTES) {
            const c = Buffer.alloc(CHUNK_BYTES);
            pcm.copy(c, 0, i, Math.min(i + CHUNK_BYTES, pcm.length));
            outQueue.push(c);
          }
        },
      } as ConversationLike);
    };
    ws.onerror = (e) => reject(new Error(`WebSocket error: ${String((e as ErrorEvent).message ?? e)}`));
    ws.onclose = () => {
      clearInterval(mic);
      clearInterval(playback);
      finished = true;
      opts.onDisconnect?.({ reason: 'agent' });
    };
    ws.onmessage = async (msg) => {
      const e = JSON.parse(String(msg.data));
      opts.onIncomingEvent?.(e);
      switch (e.type) {
        case 'conversation_initiation_metadata': {
          const m = e.conversation_initiation_metadata_event;
          agentRate = Number(/pcm_(\d+)/.exec(m.agent_output_audio_format)?.[1] ?? 16000);
          log(`connected · conversation ${m.conversation_id} · in ${m.user_input_audio_format} · out ${m.agent_output_audio_format}`);
          opts.onConnect?.({ conversationId: m.conversation_id });
          break;
        }
        case 'audio':
          if (!agentSpeaking) {
            agentSpeaking = true;
            agentTurnStart = Date.now();
            agentAudioBytes = 0;
            opts.onModeChange?.({ mode: 'speaking' });
          }
          agentLastChunk = Date.now();
          agentAudioBytes += Buffer.from(e.audio_event.audio_base_64, 'base64').length;
          break;
        case 'agent_response':
          agentLastText = e.agent_response_event.agent_response;
          log(`🤖 ${agentLastText}`);
          opts.onMessage?.({ source: 'ai', message: agentLastText });
          break;
        case 'user_transcript':
          log(`🙂 (heard) ${e.user_transcription_event.user_transcript}`);
          opts.onMessage?.({ source: 'user', message: e.user_transcription_event.user_transcript });
          break;
        case 'client_tool_call': {
          const call = e.client_tool_call;
          const fn = opts.clientTools[call.tool_name];
          const result = fn ? await fn(call.parameters) : `Unknown tool ${call.tool_name}`;
          send({ type: 'client_tool_result', tool_call_id: call.tool_call_id, result: String(result), is_error: !fn });
          break;
        }
        case 'ping':
          setTimeout(() => send({ type: 'pong', event_id: e.ping_event.event_id }), e.ping_event.ping_ms ?? 0);
          break;
        case 'interruption':
          log('⚡ interruption');
          break;
      }
    };
  });
}

// --- The simulated user's script: answers whatever the agent is on --------------------------------
const flags = { askedGross: false, gaveIncome: false, corrected: false, typedSsn: false, typedPhone: false };
function nextUtterance(): string | null {
  const s = engine.getState();
  if (s.phase === 'review') {
    // Done when the agent hands over to the user to submit.
    return /bouton|envoyer|soumettre|submit|button/i.test(agentLastText) ? null : 'Oui, c’est bien ça.';
  }
  // The correction, once the income was given and we moved on.
  if (flags.gaveIncome && !flags.corrected && s.fields['pw-income']?.status === 'filled') {
    flags.corrected = true;
    return 'Ah pardon, je me suis trompée pour le revenu : c’est mille huit cents par mois, pas deux mille.';
  }
  const f = nextField(s);
  if (!f) return 'Oui.';
  // Confirm only when the agent actually asks for confirmation; otherwise answer the question.
  const asksConfirm = /c[’']est (bien )?(ça|correct|exact)|est-ce (bien |que c[’']est )?(ça|correct|exact)|is that (right|correct)|correct \?|exact \?/i.test(agentLastText);
  if (s.fields[f.id]?.status === 'review' && asksConfirm) return 'Oui, c’est ça.';
  switch (f.id) {
    case 'pw-first':
    case 'pw-last':
      return 'Je m’appelle Marie Dubois.';
    case 'pw-dob':
      return 'Le quatre mars mille neuf cent cinquante-huit.';
    case 'pw-email':
      return 'Non merci, je n’ai pas d’e-mail.';
    case 'pw-phone':
      return 'Cinq cinq cinq, zéro un quatre deux.';
    case 'pw-ssn':
      return null; // typed on the page, see below
    case 'pw-status':
      return 'Je suis salariée.';
    case 'pw-employer':
      return 'Je travaille à la boulangerie Martin.';
    case 'pw-income':
      if (!flags.askedGross) {
        flags.askedGross = true;
        return 'Attendez, ça veut dire quoi, brut ?';
      }
      flags.gaveIncome = true;
      return 'Environ deux mille dollars par mois.';
    case 'pw-movein':
      return 'Le premier décembre deux mille vingt-six.';
    case 'pw-pets':
      return 'Oui, j’ai un chat.';
    case 'pw-pets-desc':
      return 'Un chat, il s’appelle Minou.';
    case 'pw-cosigner':
      return 'Non, personne.';
    case 'pw-credit':
      return 'Oui, je suis d’accord.';
    case 'pw-truth':
      return 'Oui, je le confirme.';
    default:
      return 'Pardon, pouvez-vous répéter ?';
  }
}

// --- Run --------------------------------------------------------------------------------------------
const signed = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.elevenlabsAgentId)}`, { headers: XI });
if (!signed.ok) throw new Error(`signed URL: ${signed.status} ${await signed.text()}`);
const signedUrl = ((await signed.json()) as { signed_url: string }).signed_url;

let convo: (ConversationLike & { speak(p: Buffer): void }) | null = null;
const session = new VoiceSession(engine, {
  startSession: async (o) => {
    const c = (await wsStartSession(o)) as ConversationLike & { speak(p: Buffer): void };
    convo = c;
    return c;
  },
  getToken: async () => ({ ok: true, data: { conversationToken: signedUrl } }),
  llm,
});
session.onLatency = (t) => log(`⏱  turn latency ${t.totalMs} ms (speech end → transcript ${t.toTranscriptMs ?? '—'} ms, tools ${t.toolsMs} ms)`);
const started = await session.start();
if (!started.ok) throw new Error(started.error);
log(`session started · LLM ${llm ?? 'agent default'} · ${language} · prompt ${buildAgentPrompt(mapDone.map, scan, language).length} chars`);

// Turn loop: when the agent has finished speaking, the user answers.
let turns = 0;
while (!finished && Date.now() - t0 < MAX_MINUTES * 60_000) {
  await new Promise((r) => setTimeout(r, 200));
  if (agentSpeaking || userSpeaking || !agentLastText) continue;
  // Natural pause before answering, long enough that the agent has really finished (it may
  // send a second sentence after a tool call).
  if (Date.now() - agentLastChunk < 1200) continue;

  const s = engine.getState();
  // The user types the SSN when asked to, through the tool (or, if the agent asked by voice, anyway:
  // a real user would type it rather than say it).
  const ssnAsked = s.fields['pw-ssn']?.status === 'needs_typing' || (nextField(s)?.id === 'pw-ssn' && /sécurité sociale|social security/i.test(agentLastText));
  if (ssnAsked && !flags.typedSsn) {
    flags.typedSsn = true;
    log('⌨️  user types the SSN on the page (value never leaves the page)');
    page.values.set('pw-ssn', '987-65-4321');
    await engine.userEdited({ id: 'pw-ssn', value: '', filled: true, sensitive: true });
    await new Promise((r) => setTimeout(r, 600));
    await say('Voilà, c’est fait.');
    continue;
  }
  // One answer typed in the panel's text box instead of spoken (UiEvent user_text).
  if (!flags.typedPhone && nextField(s)?.id === 'pw-phone' && s.fields['pw-phone']?.status !== 'review') {
    flags.typedPhone = true;
    log('⌨️  user types the phone number in the panel: "555 0142"');
    agentLastText = '';
    const r = session.sendText('555 0142');
    if (!r.ok) log(`   typed message refused: ${r.error}`);
    await new Promise((r) => setTimeout(r, 800));
    continue;
  }
  const text = nextUtterance();
  if (text === null) {
    if (s.phase === 'review') break; // agent asked to submit: done
    continue;
  }
  await say(text);
  if (++turns > 45) break;
}

async function say(text: string) {
  const pcm = await speech(text);
  log(`🙂 ${text}  (${(pcm.length / 32000).toFixed(1)} s of audio)`);
  agentLastText = '';
  convo!.speak(pcm);
  // Wait until it has been "said" (real time).
  await new Promise((r) => setTimeout(r, (pcm.length / 32000) * 1000 + CHUNK_MS * 2));
}

await new Promise((r) => setTimeout(r, 1500));
await session.end();

// --- Report -----------------------------------------------------------------------------------------
const st = engine.getState();
console.log('\n================ RESULT ================');
console.log('Page values:', Object.fromEntries([...page.values].map(([k, v]) => [k, k === 'pw-ssn' ? '(typed by the user)' : v])));
const need = (id: string, want: string) => {
  const got = page.values.get(id);
  console.log(`  ${got === want ? 'PASS' : 'FAIL'}  ${id} = ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
};
need('pw-first', 'Marie');
need('pw-last', 'Dubois');
need('pw-dob', '1958-03-04');
need('pw-status', 'employed');
need('pw-income', '1800');
need('pw-movein', '2026-12-01');
need('pw-pets', 'yes');
need('pw-credit', 'true');
need('pw-truth', 'true');
const yes = (c: boolean, m: string) => console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`);
yes(toolLog.some((t) => t.name === 'explain_field' && (t.args as { id?: string }).id === 'pw-income'), '"what does gross mean?" → explain_field(pw-income)');
yes(toolLog.filter((t) => t.name === 'fill_field' && (t.args as { id?: string }).id === 'pw-income').length >= 2, 'correction → income filled again');
yes(toolLog.some((t) => t.name === 'request_typing' && (t.args as { id?: string }).id === 'pw-ssn'), 'SSN → request_typing, never by voice');
yes(!flags.typedPhone || /0142/.test(page.values.get('pw-phone') ?? ''), `typed answer (panel text box) → phone filled (${page.values.get('pw-phone') ?? '—'})`);
yes(engine.getState().captions.filter((c) => c.role === 'user' && c.text === '555 0142').length === 1, 'typed answer shown once as the user’s caption (no echo duplicate)');
yes(!toolLog.some((t) => t.name === 'fill_field' && (t.args as { id?: string }).id === 'pw-ssn' && t.ok), 'SSN never filled by the agent');
yes(st.phase === 'review', 'review step reached');
const answered = new Set(['pw-first', 'pw-last', 'pw-dob', 'pw-email', 'pw-phone', 'pw-status', 'pw-employer', 'pw-income', 'pw-movein', 'pw-pets', 'pw-pets-desc', 'pw-cosigner', 'pw-credit', 'pw-truth']);
yes(!toolLog.some((t) => t.name === 'fill_field' && t.ok && !answered.has((t.args as { id: string }).id)), 'no field filled that the user did not answer');
const silences = session.turns.filter((t) => t.totalMs > 8000).length;
yes(silences === 0, `no long silences (agent quiet > 8 s): ${silences}`);
yes(!JSON.stringify(st).includes('4321'), 'SSN digits nowhere in the state');

const stats = session.stats();
console.log(`\nTurn latency (user stops talking → first agent audio), ${stats.count} turns:`);
console.log(`  median ${stats.medianMs} ms · p90 ${stats.p90Ms} ms`);
const tt = session.turns.map((t) => t.toTranscriptMs).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
if (tt.length) console.log(`  of which speech end → final transcript: median ${tt[Math.floor(tt.length / 2)]} ms`);
const rest = session.turns.filter((t) => t.toTranscriptMs !== undefined).map((t) => t.totalMs - t.toTranscriptMs!).sort((a, b) => a - b);
if (rest.length) console.log(`  of which final transcript → first agent audio (LLM + tools + TTS): median ${rest[Math.floor(rest.length / 2)]} ms`);
const tools = toolLog.map((t) => t.ms).sort((a, b) => a - b);
if (tools.length) console.log(`  our tools: median ${tools[Math.floor(tools.length / 2)]} ms per call (${tools.length} calls)`);
console.log(`  all turns: ${session.turns.map((t) => t.totalMs).join(', ')}`);
process.exit(0);
