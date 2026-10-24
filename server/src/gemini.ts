import { GoogleGenAI } from '@google/genai';
import { env } from './env.ts';
import { RateLimiter, type Priority } from './rate-limit.ts';

/**
 * One structured-JSON call to Gemini. Callers only ever pass the form STRUCTURE, never values.
 *
 * Uses models.generateContent (structured output: responseMimeType + responseJsonSchema).
 * Measured 2026-10-24 on real form parts: ~20% faster than the Interactions API
 * (median 1.0 s vs 1.2 s). The SDK's own retries are OFF: on a 429 it waited up to a minute;
 * we handle slowness ourselves (hedging, request budget, 15 s fallback).
 */

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({
    apiKey: env.geminiApiKey,
    httpOptions: {
      ...(env.geminiBaseUrl ? { baseUrl: env.geminiBaseUrl } : {}),
      retryOptions: { attempts: 1 },
    },
  });
  return client;
}

export const limiter = new RateLimiter(env.geminiRpm);

export function geminiConfigured(): boolean {
  return !!env.geminiApiKey;
}

/** Open the HTTPS connection early so the first real request skips the handshake. */
export async function warmUpGemini(): Promise<void> {
  const started = Date.now();
  try {
    await getClient().models.get({ model: env.geminiModel });
    console.log(`[gemini] connection warm (${env.geminiModel}, ${Date.now() - started} ms, budget ${env.geminiRpm} requests/min)`);
  } catch (err) {
    console.warn(`[gemini] warm-up failed: ${String(err)}`);
  }
}

export interface GeminiResult {
  raw: unknown;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Input tokens Gemini served from its implicit prompt cache (cheaper, faster). */
  cachedTokens?: number;
  /** 2 = the hedge request (sent because the first was slow) answered first. */
  attempt?: number;
}

export interface StructuredRequest {
  system: string;
  input: string;
  schema: Record<string, unknown>;
}

/** Hard ceiling for one request (it may keep running after the caller's 15 s limit). */
const MAX_REQUEST_MS = 45_000;

/** One request, inside the per-minute budget. */
export async function requestStructured(req: StructuredRequest, priority: Exclude<Priority, 'hedge'> = 'user'): Promise<GeminiResult> {
  await limiter.acquire(priority);
  return send(req);
}

async function send(req: StructuredRequest): Promise<GeminiResult> {
  const model = env.geminiModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_REQUEST_MS);
  try {
    const response = await getClient().models.generateContent({
      model,
      contents: req.input,
      config: {
        systemInstruction: req.system,
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        ...(env.geminiThinkingLevel ? { thinkingConfig: { thinkingLevel: env.geminiThinkingLevel as never } } : {}),
        abortSignal: controller.signal,
        httpOptions: { timeout: MAX_REQUEST_MS, retryOptions: { attempts: 1 } },
      },
    });
    const text = response.text;
    if (!text) throw new Error(`Gemini returned no text (finish: ${response.candidates?.[0]?.finishReason ?? '?'})`);
    const usage = response.usageMetadata;
    return {
      raw: JSON.parse(text),
      model,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      cachedTokens: usage?.cachedContentTokenCount,
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429) {
      // Quota hit anyway (other traffic on this key): back off everyone for a bit.
      const retry = /retry in ([\d.]+)s/i.exec(String(err))?.[1];
      limiter.pause(retry ? Number(retry) * 1000 : 10_000);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tail-latency cut: if the first request has not answered after `hedgeMs`, send the same
 * request again (only if the budget has a spare slot) and take whichever answers first.
 */
export function requestStructuredHedged(
  req: StructuredRequest,
  hedgeMs: number,
  priority: Exclude<Priority, 'hedge'> = 'user',
): Promise<GeminiResult> {
  return new Promise((resolve, reject) => {
    let done = false;
    let running = 0;
    let hedged = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finishWith = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    const tryHedge = (): boolean => {
      if (hedged || done || hedgeMs <= 0 || !limiter.tryAcquire('hedge')) return false;
      hedged = true;
      run(2, send(req));
      return true;
    };
    const run = (n: number, job: Promise<GeminiResult>) => {
      running++;
      job.then(
        (r) => finishWith(() => resolve({ ...r, attempt: n })),
        (err: unknown) => {
          running--;
          if (running === 0 && (hedged || !tryHedge())) finishWith(() => reject(err));
        },
      );
    };
    run(1, requestStructured(req, priority));
    if (hedgeMs > 0) timer = setTimeout(() => tryHedge(), hedgeMs);
  });
}
