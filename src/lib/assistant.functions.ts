import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  assistantGenerationConfig,
  buildAssistantPrompt,
  parseAssistantResult,
  type AssistantReply,
} from '@/lib/assistant.shared';

const inputSchema = z.object({
  scenarioTitle: z.string().min(1),
  scenarioContext: z.string().min(1),
  fields: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        type: z.string().min(1),
        question: z.string(),
        explanation: z.string(),
      }),
    )
    .min(1),
  values: z.record(z.string(), z.string()),
  activeFieldId: z.string().nullable(),
  message: z.string().min(1).max(2000),
});

// Tried in order; Google's API rejects or stalls models that are unavailable
// or overloaded, so the handler falls through to the next one.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3-flash', 'gemini-2.0-flash'];

export const askPaperwiseAssistant = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<AssistantReply> => {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) throw new Error('The assistant is not configured yet.');

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildAssistantPrompt(data) }] }],
      generationConfig: assistantGenerationConfig,
    });

    let response: Response | null = null;
    for (const model of GEMINI_MODELS) {
      try {
        const attempt = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body,
            signal: AbortSignal.timeout(35000),
          },
        );
        if (attempt.ok) {
          response = attempt;
          break;
        }
        console.error(`Gemini model ${model} failed: ${attempt.status}`);
      } catch {
        console.error(`Gemini model ${model} timed out`);
      }
    }

    if (!response) {
      throw new Error('The assistant is unavailable right now. Please try again.');
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const result = parseAssistantResult(parsed, data.fields);
    if (!result) throw new Error('The assistant gave an unreadable reply. Please try again.');
    return result;
  });
