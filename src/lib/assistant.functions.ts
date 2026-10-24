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

const GEMINI_MODEL = 'gemini-2.5-flash';

export const askPaperwiseAssistant = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<AssistantReply> => {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) throw new Error('The assistant is not configured yet.');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildAssistantPrompt(data) }] }],
          generationConfig: assistantGenerationConfig,
        }),
      },
    );

    if (!response.ok) {
      console.error(`Gemini request failed: ${response.status}`);
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
