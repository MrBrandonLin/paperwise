/**
 * pnpm --dir server agent:setup [--dry-run]
 *
 * Creates (or updates) the Paperwise agent in ElevenLabs through the API, so nothing has to be
 * clicked by hand and the tool names can't drift from the code:
 *   1. the six client tools from src/shared/agent-tools.ts ("wait for response" on)
 *   2. the agent: LLM, voice, multilingual TTS (Eleven v4 Turbo), turn-taking, 11 languages with
 *      ElevenLabs' language_detection tool (switch mid-conversation), client events, allowed
 *      overrides (prompt, LLM, first message, language, ASR keywords, TTS speed, text-only), auth on
 * Needs ELEVENLABS_API_KEY. With ELEVENLABS_AGENT_ID set, the agent is updated in place;
 * otherwise a new one is created and its id printed (put it in server/.env).
 */
import { AGENT_BASE_PROMPT } from '../../src/shared/agent-prompt.ts';
import { AGENT_TOOLS } from '../../src/shared/agent-tools.ts';
import { LANGUAGES } from '../../src/shared/languages.ts';
import { env } from '../src/env.ts';

const API = 'https://api.elevenlabs.io/v1/convai';
const dryRun = process.argv.includes('--dry-run');

/** Speed-first choices. See CLAUDE.md "ElevenLabs agent" for the why. */
export const AGENT_SETTINGS = {
  name: 'Paperwise',
  conversation_config: {
    agent: {
      first_message: '', // sent per session (welcome + first question of this form)
      language: 'en',
      prompt: {
        prompt: AGENT_BASE_PROMPT, // replaced per session with the form map baked in
        // Switch voice + speech recognition when the user speaks or asks for another language.
        built_in_tools: {
          language_detection: {
            type: 'system',
            name: 'language_detection',
            description: '',
            params: { system_tool_type: 'language_detection', only_at_conversation_start: false },
          },
        },
        llm: env.elevenlabsLlm,
        temperature: 0.2,
        // No thinking: it delays every turn.
        thinking_budget: 0,
      },
    },
    tts: {
      // Eleven v4 Turbo: 90+ languages from one voice, ~100 ms (docs, 2026-10-24). Flash v2 was
      // English-only. Plain delivery: no expressive audio tags in captions.
      model_id: env.elevenlabsTtsModel,
      expressive_mode: false,
      ...(env.elevenlabsVoiceId ? { voice_id: env.elevenlabsVoiceId } : {}),
      speed: 0.95, // a touch slower: many users are elderly or not native speakers
    },
    asr: { quality: 'high', provider: 'scribe_realtime', user_input_audio_format: 'pcm_16000' },
    turn: {
      turn_eagerness: 'normal',
      // Start the LLM during the pause, before the turn is certain: cuts perceived latency.
      speculative_turn: true,
      turn_timeout: 10,
    },
    conversation: {
      client_events: [
        'conversation_initiation_metadata',
        'audio',
        'interruption',
        'user_transcript',
        'tentative_user_transcript',
        'agent_response',
        'agent_response_correction',
        'agent_chat_response_part',
        'client_tool_call',
        // language_detection switched the language: the panel follows (captions, words, RTL).
        'agent_tool_response',
        'agent_tool_response_full_payload', // carries the tool's result: which language
        'vad_score',
        'ping',
      ],
    },
    // Every language the agent may switch to (language_detection picks among these).
    language_presets: Object.fromEntries(
      LANGUAGES.filter((l) => l.code !== 'en').map((l) => [l.elevenlabs, { overrides: { agent: { language: l.elevenlabs } } }]),
    ),
  },
  platform_settings: {
    overrides: {
      conversation_config_override: {
        agent: { first_message: true, language: true, prompt: { prompt: true, llm: true } },
        asr: { keywords: true },
        tts: { speed: true }, // the panel's "slower" speaking speed
        conversation: { text_only: true }, // typing only, no microphone
      },
    },
    auth: { enable_auth: true },
  },
};

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': env.elevenlabsApiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function toolConfig(t: (typeof AGENT_TOOLS)[number]) {
  return {
    type: 'client',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    expects_response: true, // "Wait for response": the agent reads our result
    response_timeout_secs: 10,
    execution_mode: 'immediate',
  };
}

async function upsertTools(): Promise<string[]> {
  const existing = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await api<{ tools: { id: string; tool_config: { name: string } }[]; has_more?: boolean; next_cursor?: string }>(
      'GET',
      `/tools?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    for (const t of page.tools) existing.set(t.tool_config.name, t.id);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const ids: string[] = [];
  for (const t of AGENT_TOOLS) {
    const id = existing.get(t.name);
    if (id) {
      try {
        await api('PATCH', `/tools/${id}`, { tool_config: toolConfig(t) });
        console.log(`  updated tool ${t.name} (${id})`);
        ids.push(id);
        continue;
      } catch (err) {
        console.warn(`  could not update ${t.name} (${String(err).slice(0, 120)}), creating a new one`);
      }
    }
    const created = await api<{ id: string }>('POST', '/tools', { tool_config: toolConfig(t) });
    console.log(`  created tool ${t.name} (${created.id})`);
    ids.push(created.id);
  }
  return ids;
}

if (dryRun) {
  console.log('Tools:', JSON.stringify(AGENT_TOOLS.map(toolConfig), null, 2));
  console.log('Agent:', JSON.stringify(AGENT_SETTINGS, null, 2));
  process.exit(0);
}
if (!env.elevenlabsApiKey) {
  console.error('ELEVENLABS_API_KEY is missing in server/.env');
  process.exit(1);
}

console.log('Tools:');
const toolIds = await upsertTools();
const body = structuredClone(AGENT_SETTINGS) as typeof AGENT_SETTINGS & {
  conversation_config: { agent: { prompt: { tool_ids?: string[] } } };
};
body.conversation_config.agent.prompt.tool_ids = toolIds;

if (env.elevenlabsAgentId) {
  await api('PATCH', `/agents/${env.elevenlabsAgentId}`, body);
  console.log(`\nUpdated agent ${env.elevenlabsAgentId}.`);
} else {
  const created = await api<{ agent_id: string }>('POST', '/agents/create', body);
  console.log(`\nCreated agent ${created.agent_id}.\nAdd this line to server/.env, then restart the server:\n  ELEVENLABS_AGENT_ID=${created.agent_id}`);
}
console.log(`LLM: ${env.elevenlabsLlm} · TTS: ${env.elevenlabsTtsModel} · languages: ${LANGUAGES.map((l) => l.code).join(', ')} + language_detection · auth on`);
