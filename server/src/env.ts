import { paths } from './paths.ts';

// Load server/.env (Node 20.12+ built-in). Missing file is fine: real env vars still work.
try {
  process.loadEnvFile(paths.env);
} catch {
  console.warn(`[env] no server/.env file found at ${paths.env} — using process environment only`);
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  // flash-lite: ~8 s for a whole form; gemini-3.8-flash writes slightly better text but took 30–110 s (2026-10-24).
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  /** Optional: "low" | "medium" | "high" (model default if unset; not every model accepts "minimal"). */
  geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || undefined,
  /** Testing only: point the SDK at a fake Gemini server. */
  geminiBaseUrl: process.env.GEMINI_BASE_URL || undefined,
  /** After this the user gets the keyword fallback (Gemini keeps going and fills the cache). */
  formMapTimeoutMs: Number(process.env.FORM_MAP_TIMEOUT_MS || 15_000),
  /** Your key's Gemini requests-per-minute limit (free tier flash-lite: 15). */
  geminiRpm: Number(process.env.GEMINI_RPM || 15),
  /** A form-map part not answered after this gets a second identical request (0 = off). */
  formMapHedgeMs: Number(process.env.FORM_MAP_HEDGE_MS ?? 2_500),
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenlabsAgentId: process.env.ELEVENLABS_AGENT_ID ?? '',
  /** Used by `pnpm --dir server agent:setup` only. */
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '',
  // Fastest that passed the full French voice test (voice:sim, 2026-10-24): median 0.76 s, p90 1.2 s.
  elevenlabsLlm: process.env.ELEVENLABS_LLM || 'claude-haiku-4-5',
  /** Used by agent:setup. Eleven v4 Turbo speaks all our languages from one voice. */
  elevenlabsTtsModel: process.env.ELEVENLABS_TTS_MODEL || 'eleven_v4_turbo',
  /** Can noise / the user's voice cut the agent off mid-sentence? Off by default: crowded rooms. */
  elevenlabsInterruptions: process.env.ELEVENLABS_INTERRUPTIONS === 'on',
};
