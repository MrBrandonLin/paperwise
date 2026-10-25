/**
 * pnpm --dir server voice:sim [--form rental|rental-react|w9] [--lang fr|es|en] [--scenario full|switch|unsupported] [--llm <model>] [--quiet]
 *
 * A voice conversation with the REAL ElevenLabs agent, with no human: a simulated user
 * (ElevenLabs text-to-speech, streamed as real-time 16 kHz audio) fills the English form
 * /test/rental.html by voice, in their own language. It runs the same VoiceSession + FormEngine
 * code as the side panel (only the transport is swapped: WebSocket in Node instead of WebRTC in
 * the browser), against a fake rental page.
 *
 * Scenarios:
 *   full         the whole form in --lang (default fr): asks "what does gross mean?", corrects an
 *                answer, types one answer in the panel, types the SSN on the page, review
 *   switch       starts in English, then "¿podemos hablar en español?" after two answers: the agent
 *                must switch at once and keep every answer
 *   unsupported  asks for Haitian Creole (not supported): the agent must say so kindly and offer
 *                French, then carry on in French
 *   drift        starts in English, then simply answers in Russian (never asks to switch): the
 *                agent must answer in Russian from then on, and the panel follow
 * Checks: values written in English and the form's format, proper nouns (names, employer) kept
 * exactly, free text translated, safety rules; prints turn latency (median / p90).
 *
 * Needs ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID (run agent:setup first) and GEMINI_API_KEY.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAgentPrompt } from '../../src/shared/agent-prompt.ts';
import type { Language, ScanResult } from '../../src/shared/contract.ts';
import { nextField } from '../../src/shared/form-state.ts';
import { FormEngine } from '../../src/engine/engine.ts';
import { VoiceSession, type ConversationLike } from '../../src/engine/voice-session.ts';
import { FakePage, ScanPage } from '../../scripts/lib/fake-rental.ts';
import { env } from '../src/env.ts';
import { streamFormMap } from '../src/form-map.ts';
import { paths } from '../src/paths.ts';

type ScriptLang = 'en' | 'es' | 'fr' | 'ru';
const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const scenario = (opt('scenario') ?? 'full') as 'full' | 'switch' | 'unsupported' | 'drift';
/** rental = /test/rental.html · rental-react = the React form (fields appear as you answer) · w9 = the IRS W-9 PDF. */
const form = (['rental', 'rental-react', 'w9'].includes(opt('form') ?? '') ? opt('form') : 'rental') as 'rental' | 'rental-react' | 'w9';
const startLang: ScriptLang = scenario === 'full' ? ((['en', 'es', 'fr'].includes(opt('lang') ?? '') ? opt('lang') : 'fr') as ScriptLang) : 'en';
let language: ScriptLang = startLang;
const llm = opt('llm');
const quiet = args.includes('--quiet');
const MAX_MINUTES = scenario === 'full' ? 7 : 4;

if (!env.elevenlabsApiKey || !env.elevenlabsAgentId) {
  console.error('Needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in server/.env (run `pnpm --dir server agent:setup` first).');
  process.exit(1);
}
const XI = { 'xi-api-key': env.elevenlabsApiKey };
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
const log = (...a: unknown[]) => console.log(ts(), ...a);

// --- The form: real scan, real (cached) form map, fake page ------------------------------------
const rentalPage = form === 'w9' ? null : new FakePage({ reactLike: form === 'rental-react' });
const w9Page = form === 'w9' ? new ScanPage(JSON.parse(readFileSync(join(paths.scans, 'pdf-fw9.json'), 'utf8')) as ScanResult) : null;
const page = (rentalPage ?? w9Page)!;
const scan = page.scan();
// The map is built once, in the form's language (English); the agent speaks the user's.
const mapDone = await streamFormMap(scan, 'en');
log(`form map (${form}): ${mapDone.source}, ${mapDone.map.fields.length} fields, ${mapDone.ms} ms`);
const engine = new FormEngine(page, startLang as Language);
engine.setScan(scan);
engine.setMap(mapDone.map);
// React form: fields that appear later get mapped then (only the new ones), like in the panel.
engine.onMapStale = (s) => {
  log(`  🧩 new fields on the page → mapping them`);
  void streamFormMap(s, 'en').then((d) => engine.setMap(d.map));
};
const toolLog: { name: string; args: unknown; ok: boolean; message: string; ms: number }[] = [];
/** Fields the panel showed an explanation card for, and what it said. */
const explained = new Map<string, string>();
engine.subscribe(() => {
  const e = engine.getState().explanation;
  if (e) explained.set(e.fieldId, e.text);
});
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
const languageSwitches: string[] = [];

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
        case 'agent_tool_response':
        case 'agent_tool_response_full_payload': {
          const t = e.agent_tool_response_full_payload ?? e.agent_tool_response;
          if (t?.tool_name === 'language_detection') {
            languageSwitches.push(t.full_tool_result ?? '(no payload)');
            log(`🌐 language_detection → ${String(t.full_tool_result ?? '').slice(0, 120)}`);
          }
          break;
        }
      }
    };
  });
}

// --- The simulated user's script: answers whatever the agent is on --------------------------------
interface Script {
  start: string;
  name: string;
  dob: string;
  email: string;
  status: string;
  employer: string;
  askGross: string;
  income: string;
  correction: string;
  movein: string;
  pets: string;
  petsDesc: string;
  cosigner: string;
  credit: string;
  truth: string;
  confirm: string;
  reviewOk: string;
  typedDone: string;
  repeat: string;
}
const SCRIPTS: Record<ScriptLang, Script> = {
  ru: {
    start: 'Да, давайте начнём.',
    name: 'Меня зовут Мэри Джонсон.',
    dob: 'Четвёртое марта тысяча девятьсот пятьдесят восьмого года.',
    email: 'Нет, спасибо, у меня нет электронной почты.',
    status: 'Я работаю по найму.',
    employer: 'Я работаю в пекарне Мартина.',
    askGross: 'Подождите, что значит «брутто»?',
    income: 'Около двух тысяч долларов в месяц.',
    correction: 'Извините, я ошиблась: тысяча восемьсот в месяц.',
    movein: 'Первое декабря две тысячи двадцать шестого года.',
    pets: 'Да, у меня есть кошка.',
    petsDesc: 'Кошка, её зовут Мурка.',
    cosigner: 'Нет, никого.',
    credit: 'Да, я согласна.',
    truth: 'Да, подтверждаю.',
    confirm: 'Да, всё верно.',
    reviewOk: 'Да, всё правильно.',
    typedDone: 'Готово.',
    repeat: 'Извините, повторите, пожалуйста.',
  },
  en: {
    start: 'Yes, let’s start.',
    name: 'My name is Mary Johnson.',
    dob: 'March fourth, nineteen fifty-eight.',
    email: 'No thanks, I don’t have an email.',
    status: 'I’m employed.',
    employer: 'I work at Martin’s Bakery.',
    askGross: 'Wait, what does gross mean?',
    income: 'About two thousand dollars a month.',
    correction: 'Sorry, I got the income wrong: it’s eighteen hundred a month, not two thousand.',
    movein: 'December first, twenty twenty-six.',
    pets: 'Yes, I have a cat.',
    petsDesc: 'A cat called Whiskers.',
    cosigner: 'No, nobody.',
    credit: 'Yes, I agree.',
    truth: 'Yes, I confirm.',
    confirm: 'Yes, that’s right.',
    reviewOk: 'Yes, that’s all correct.',
    typedDone: 'Okay, done.',
    repeat: 'Sorry, can you repeat that?',
  },
  es: {
    start: 'Sí, empecemos.',
    name: 'Me llamo Ana López.',
    dob: 'El tres de marzo de mil novecientos noventa.',
    email: 'No, gracias, no tengo correo electrónico.',
    status: 'Trabajo, soy empleada.',
    employer: 'Trabajo en la Panadería La Esperanza.',
    askGross: 'Espere, ¿qué significa bruto?',
    income: 'Unos dos mil dólares al mes.',
    correction: 'Perdón, me equivoqué con el ingreso: son mil ochocientos al mes, no dos mil.',
    movein: 'El primero de diciembre de dos mil veintiséis.',
    pets: 'Sí, tengo un gato.',
    petsDesc: 'Un gato, se llama Michi, y es muy tranquilo.',
    cosigner: 'No, nadie.',
    credit: 'Sí, estoy de acuerdo.',
    truth: 'Sí, lo confirmo.',
    confirm: 'Sí, así es.',
    reviewOk: 'Sí, todo está bien.',
    typedDone: 'Listo, ya está.',
    repeat: 'Perdón, ¿puede repetir?',
  },
  fr: {
    start: 'Oui, allons-y.',
    name: 'Je m’appelle Marie Dubois.',
    dob: 'Le quatre mars mille neuf cent cinquante-huit.',
    email: 'Non merci, je n’ai pas d’e-mail.',
    status: 'Je suis salariée.',
    employer: 'Je travaille à la boulangerie Martin.',
    askGross: 'Attendez, ça veut dire quoi, brut ?',
    income: 'Environ deux mille dollars par mois.',
    correction: 'Ah pardon, je me suis trompée pour le revenu : c’est mille huit cents par mois, pas deux mille.',
    movein: 'Le premier décembre deux mille vingt-six.',
    pets: 'Oui, j’ai un chat.',
    petsDesc: 'Un chat, il s’appelle Minou.',
    cosigner: 'Non, personne.',
    credit: 'Oui, je suis d’accord.',
    truth: 'Oui, je le confirme.',
    confirm: 'Oui, c’est ça.',
    reviewOk: 'Oui, c’est bien ça.',
    typedDone: 'Voilà, c’est fait.',
    repeat: 'Pardon, pouvez-vous répéter ?',
  },
};
/** Who the simulated user is in each run (names stay as said, whatever the language). */
const PERSON: Record<ScriptLang, { first: string; last: string; dob: string; employer: RegExp }> = {
  ru: { first: 'Mary', last: 'Johnson', dob: '1958-03-04', employer: /Martin/ },
  en: { first: 'Mary', last: 'Johnson', dob: '1958-03-04', employer: /^Martin[’']s Bakery$/ },
  // The business name, never translated ("Hope Bakery" would be wrong).
  es: { first: 'Ana', last: 'López', dob: '1990-03-03', employer: /^(Panadería )?La Esperanza$/i },
  fr: { first: 'Marie', last: 'Dubois', dob: '1958-03-04', employer: /^(la )?boulangerie Martin$/i },
};

const flags = { started: false, askedGross: false, gaveIncome: false, corrected: false, typedSsn: false, typedPhone: false, switched: false, askedCreole: false, acceptedFrench: false };
const CONFIRM = /c[’']est (bien )?(ça|correct|exact)|est-ce (bien |que c[’']est )?(ça|correct|exact)|is that (right|correct)|correct\s?\?|exact\s?\?|¿es (correcto|así)|¿(está|es) bien|¿correcto\?|right\?/i;

/** The IRS W-9, as an individual (sole proprietor) with no business name. */
const W = 'pw-Page1-';
const W9_SSN = [`${W}f1_11`, `${W}f1_12`, `${W}f1_13`];
const W9: Partial<Record<ScriptLang, { individual: string; notApplicable: string; no: string; address: string; city: string }>> = {
  en: { individual: 'I’m an individual, a sole proprietor.', notApplicable: 'No, that doesn’t apply to me.', no: 'No.', address: '12 Maple Street, apartment 4.', city: 'Springfield, Illinois, 6 2 7 0 4.' },
  es: { individual: 'Soy una persona individual, trabajo por mi cuenta.', notApplicable: 'No, eso no se aplica a mí.', no: 'No.', address: 'Doce Maple Street, apartamento cuatro.', city: 'Springfield, Illinois, código postal seis dos siete cero cuatro.' },
  fr: { individual: 'Je suis un particulier, je travaille à mon compte.', notApplicable: 'Non, ça ne me concerne pas.', no: 'Non.', address: 'Douze Maple Street, appartement quatre.', city: 'Springfield, Illinois, code postal six deux sept zéro quatre.' },
};
function w9Utterance(id: string): string {
  const say = SCRIPTS[language];
  const w = W9[language] ?? W9.en!;
  if (id === `${W}f1_01`) return say.name;
  if (id.includes('c1_1')) return w.individual;
  if (id.includes('c1_2')) return w.no;
  if (id.endsWith('f1_07')) return w.address;
  if (id.endsWith('f1_08')) return w.city;
  return w.notApplicable;
}

function nextUtterance(): string | null {
  const s = engine.getState();
  const say = SCRIPTS[language];
  if (!flags.started) {
    flags.started = true;
    if (scenario === 'unsupported') {
      flags.askedCreole = true;
      return 'Before we start: can we speak Haitian Creole? Kreyòl ayisyen?';
    }
    return say.start;
  }
  if (scenario === 'unsupported' && flags.askedCreole && !flags.acceptedFrench) {
    flags.acceptedFrench = true;
    language = 'fr';
    return 'D’accord, en français alors. On peut commencer.';
  }
  if (s.phase === 'review') {
    return /bouton|envoyer|soumettre|submit|button|enviar|botón/i.test(agentLastText) ? null : say.reviewOk;
  }
  // Drift: after the name, the user just carries on in Russian (no request to switch).
  if (scenario === 'drift' && language === 'en' && s.fields['pw-first']?.status === 'filled') language = 'ru';
  // Mid-conversation switch: after two answers, in English, ask for Spanish.
  if (scenario === 'switch' && !flags.switched && s.fields['pw-dob']?.status === 'filled') {
    flags.switched = true;
    language = 'es';
    return 'Perdón, ¿podemos hablar en español, por favor?';
  }
  if (scenario !== 'full' && s.fields['pw-phone']?.status === 'filled') return null; // enough for these scenarios
  if (form === 'w9') {
    const f = nextField(s);
    if (!f) return say.confirm;
    if (s.fields[f.id]?.status === 'review' && CONFIRM.test(agentLastText)) return say.confirm;
    return w9Utterance(f.id);
  }
  if (flags.gaveIncome && !flags.corrected && s.fields['pw-income']?.status === 'filled') {
    flags.corrected = true;
    return say.correction;
  }
  const f = nextField(s);
  if (!f) return say.confirm;
  if (s.fields[f.id]?.status === 'review' && CONFIRM.test(agentLastText)) return say.confirm;
  switch (f.id) {
    case 'pw-first':
    case 'pw-last':
      return say.name;
    case 'pw-dob':
      return say.dob;
    case 'pw-email':
      return say.email;
    case 'pw-phone':
      return scenario === 'full' ? say.repeat : '555 0142';
    case 'pw-ssn':
      return null; // typed on the page, see below
    case 'pw-status':
      return say.status;
    case 'pw-employer':
      return say.employer;
    case 'pw-income':
      if (!flags.askedGross) {
        flags.askedGross = true;
        return say.askGross;
      }
      flags.gaveIncome = true;
      return say.income;
    case 'pw-movein':
      return say.movein;
    case 'pw-pets':
      return say.pets;
    case 'pw-pets-desc':
      return say.petsDesc;
    case 'pw-cosigner':
      return say.cosigner;
    case 'pw-credit':
      return say.credit;
    case 'pw-truth':
      return say.truth;
    default:
      return say.repeat;
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
log(`session started · ${scenario} · LLM ${llm ?? 'agent default'} · ${startLang} · prompt ${buildAgentPrompt(mapDone.map, scan, startLang as Language).length} chars`);

// Turn loop: when the agent has finished speaking, the user answers.
let turns = 0;
while (!finished && Date.now() - t0 < MAX_MINUTES * 60_000) {
  await new Promise((r) => setTimeout(r, 200));
  // Wait for the agent's audio to have started at least once (its first message comes as text first).
  if (agentSpeaking || userSpeaking || !agentLastText || agentLastChunk === 0) continue;
  // Natural pause before answering, long enough that the agent has really finished (it may
  // send a second sentence after a tool call).
  if (Date.now() - agentLastChunk < 1200) continue;

  const s = engine.getState();
  // The user types the SSN when asked to, through the tool (or, if the agent asked by voice, anyway:
  // a real user would type it rather than say it).
  const ssnIds = form === 'w9' ? W9_SSN : ['pw-ssn'];
  const ssnAsked = ssnIds.some((id) => s.fields[id]?.status === 'needs_typing') || (ssnIds.includes(nextField(s)?.id ?? '') && /sécurité sociale|social security|seguro social/i.test(agentLastText));
  if (ssnAsked && !flags.typedSsn) {
    flags.typedSsn = true;
    log('⌨️  user types the SSN on the page (value never leaves the page)');
    const parts = form === 'w9' ? ['987', '65', '4321'] : ['987-65-4321'];
    for (const [i, id] of ssnIds.entries()) {
      page.values.set(id, parts[i]!);
      await engine.userEdited({ id, value: '', filled: true, sensitive: true });
    }
    await new Promise((r) => setTimeout(r, 600));
    await say(SCRIPTS[language].typedDone);
    continue;
  }
  // One answer typed in the panel's text box instead of spoken (UiEvent user_text).
  if (form !== 'w9' && scenario === 'full' && flags.started && !flags.typedPhone && nextField(s)?.id === 'pw-phone' && s.fields['pw-phone']?.status !== 'review') {
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
    if (s.phase === 'review' || scenario !== 'full') break; // done
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
console.log(`\n================ RESULT (${scenario}, ${startLang}${language !== startLang ? ` → ${language}` : ''}) ================`);
console.log('Page values:', Object.fromEntries([...page.values].map(([k, v]) => [k, k === 'pw-ssn' || W9_SSN.includes(k) ? '(typed by the user)' : v])));
let failed = 0;
const yes = (c: boolean, m: string) => {
  if (!c) failed++;
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`);
};
const value = (id: string) => page.values.get(id);
// The unsupported-language user gives their details in French, after switching.
const person = PERSON[scenario === 'unsupported' ? 'fr' : startLang];
const ssnIds = form === 'w9' ? W9_SSN : ['pw-ssn'];
if (form === 'w9') {
  const name = value(`${W}f1_01`) ?? '';
  yes(name.includes(person.first) && name.includes(person.last), `name kept exactly as said (${name})`);
  const boxes = Object.keys(engine.getState().fields).filter((id) => id.includes('c1_1'));
  const ticked = boxes.filter((id) => value(id) === 'true');
  yes(ticked.length === 1 && ticked[0] === `${W}Boxes3a-b_ReadOrder-c1_1`, `pick one: only "Individual/sole proprietor" checked (${ticked.join(', ') || 'none'})`);
  yes(toolLog.filter((t) => t.name === 'fill_field' && String((t.args as { id?: string }).id).includes('c1_1')).length <= 2, 'the seven boxes asked as one question (no yes/no per box)');
  const address = value(`${W}Address_ReadOrder-f1_07`) ?? '';
  yes(/\b12\b/.test(address) && /Maple Street/.test(address), `street name kept, number as digits (${address})`);
  const city = value(`${W}Address_ReadOrder-f1_08`) ?? '';
  yes(/Springfield/.test(city) && /62704/.test(city), `city and ZIP (${city})`);
  yes(engine.getState().phase === 'review', 'review step reached');
} else {
  yes(value('pw-first') === person.first && value('pw-last') === person.last, `name kept exactly as said, never translated (${value('pw-first')} ${value('pw-last')})`);
  yes(value('pw-dob') === person.dob, `date written in the form's format (${value('pw-dob')})`);
}
yes(!toolLog.some((t) => t.name === 'fill_field' && ssnIds.includes(String((t.args as { id?: string }).id)) && t.ok), 'SSN never filled by the agent');
yes(!JSON.stringify(st).includes('4321'), 'SSN digits nowhere in the state');
const agentLines = st.captions.filter((c) => c.role === 'agent' && c.final).map((c) => c.text);
const silences = session.turns.filter((t) => t.totalMs > 8000).length;
yes(silences === 0, `no long silences (agent quiet > 8 s): ${silences}`);

if (scenario === 'full' && form !== 'w9') {
  yes(value('pw-status') === 'employed', `choice → its value (${value('pw-status')})`);
  yes(person.employer.test(value('pw-employer') ?? ''), `employer (a name) kept as said (${value('pw-employer')})`);
  yes(value('pw-income') === '1800', `income corrected to 1800 (${value('pw-income')})`);
  yes(value('pw-movein') === '2026-12-01', `move-in date (${value('pw-movein')})`);
  yes(value('pw-pets') === 'yes', `pets (${value('pw-pets')})`);
  const desc = value('pw-pets-desc') ?? '';
  yes(/\bcat\b/i.test(desc) && /(Whiskers|Michi|Min[oe]u)/.test(desc) && (startLang === 'en' || !/\b(gato|chat|il s'appelle|se llama)\b/i.test(desc)), `free text in English, the pet's name kept (${desc})`);
  yes(value('pw-credit') === 'true' && value('pw-truth') === 'true', 'legal boxes checked after a clear yes');
  yes(explained.has('pw-income'), `"what does gross mean?" → explanation card on the panel ("${(explained.get('pw-income') ?? '').slice(0, 70)}")`);
  yes(!/^(yes|exactly|that'?s right|oui|exactement|c'est ça|sí|exacto|eso es)\b/i.test(explained.get('pw-income') ?? ''), 'the explanation starts with the answer, no filler ("Oui, c\'est ça.")');
  yes(toolLog.filter((t) => t.name === 'fill_field' && (t.args as { id?: string }).id === 'pw-income').length >= 2, 'correction → income filled again');
  yes(toolLog.some((t) => t.name === 'request_typing' && (t.args as { id?: string }).id === 'pw-ssn'), 'SSN → request_typing, never by voice');
  yes(toolLog.filter((t) => t.name === 'request_typing' && (t.args as { id?: string }).id === 'pw-ssn').length <= 1, 'SSN asked for once');
  yes(!flags.typedPhone || /0142/.test(value('pw-phone') ?? ''), `typed answer (panel text box) → phone filled (${value('pw-phone') ?? '—'})`);
  yes(st.captions.filter((c) => c.role === 'user' && c.text === '555 0142').length === 1, 'typed answer shown once as the user’s caption (no echo duplicate)');
  yes(st.phase === 'review', 'review step reached');
  const answered = new Set(['pw-first', 'pw-last', 'pw-dob', 'pw-email', 'pw-phone', 'pw-status', 'pw-employer', 'pw-income', 'pw-movein', 'pw-pets', 'pw-pets-desc', 'pw-cosigner', 'pw-credit', 'pw-truth']);
  yes(!toolLog.some((t) => t.name === 'fill_field' && t.ok && !answered.has((t.args as { id: string }).id)), 'no field filled that the user did not answer');
  if (startLang !== 'en') yes(agentLines.slice(1).every((l) => !/^(okay|great|thanks|what is your|now,)/i.test(l)), `the agent spoke ${startLang} throughout`);
}
if (scenario === 'switch') {
  yes(languageSwitches.length > 0, `language_detection called (${languageSwitches.length}): ${languageSwitches[0]?.slice(0, 80) ?? '—'}`);
  yes(st.userLanguage === 'es', `the panel follows: conversation language now ${st.userLanguage}`);
  const after = agentLines.slice(-3).join(' ');
  yes(/[¿¡ñáéíóú]|\b(usted|su|qué|cuál|gracias|teléfono|correo)\b/i.test(after), `the agent carries on in Spanish ("${after.slice(0, 80)}")`);
  yes(value('pw-first') === 'Mary' && value('pw-dob') === '1958-03-04', 'answers given in English kept after the switch');
}
if (scenario === 'drift') {
  const afterRussian = agentLines.slice(-3).join(' ');
  yes(/[а-яё]/i.test(afterRussian) && !/\b(what|your|please|thank you)\b/i.test(afterRussian), `the agent answers in Russian once the user speaks Russian ("${afterRussian.slice(0, 90)}")`);
  yes(st.userLanguage === 'ru', `the panel follows: conversation language now ${st.userLanguage}`);
  yes(value('pw-dob') === '1958-03-04', `the Russian answer is written in the form's format (${value('pw-dob')})`);
}
if (scenario === 'unsupported') {
  const reply = agentLines.slice(1, 3).join(' ');
  yes(/fran[cç]ais|french/i.test(reply), `the agent offers French ("${reply.slice(0, 100)}")`);
  yes(!/\b(can(no|')t help|unable to help|not able to help)\b/i.test(reply), 'no flat refusal');
  yes(st.userLanguage === 'fr' || languageSwitches.length > 0, `then carries on in French (conversation language ${st.userLanguage})`);
}

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
console.log(`\nLATENCY ${form} ${scenario} ${startLang}: median ${stats.medianMs} ms, p90 ${stats.p90Ms} ms, ${stats.count} turns`);
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
