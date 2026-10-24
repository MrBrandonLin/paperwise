import type { DemoField } from '@/lib/extension-demo';

export type AssistantReply = {
  reply: string;
  /** Set only when the user's message contains an answer for a form field. */
  proposal: { fieldId: string; value: string } | null;
};

export type AssistantRequest = {
  scenarioTitle: string;
  scenarioContext: string;
  fields: Pick<DemoField, 'id' | 'label' | 'type' | 'question' | 'explanation'>[];
  values: Record<string, string>;
  activeFieldId: string | null;
  message: string;
};

export function buildAssistantPrompt(request: AssistantRequest): string {
  const fieldList = request.fields
    .map(field => {
      const answered = request.values[field.id]?.trim();
      return `- id: "${field.id}" | label: "${field.label}" | type: ${field.type} | guidance: ${field.explanation} | current answer: ${answered ? `"${answered}"` : '(empty)'}`;
    })
    .join('\n');
  return [
    `You are Paperwise, a warm, plain-language assistant helping someone fill out a form titled "${request.scenarioTitle}" (${request.scenarioContext}).`,
    `The form fields are:\n${fieldList}`,
    request.activeFieldId ? `The assistant is currently guiding the user through field "${request.activeFieldId}".` : 'All fields are already filled.',
    `The user just said: "${request.message}"`,
    'Respond with strict JSON only, no markdown: {"reply": string, "fieldId": string | null, "value": string | null}.',
    'Rules:',
    '- "reply" is what you say back to the user: short (1-3 sentences), friendly, plain language.',
    '- If the user is answering a form field (or clearly providing personal details for one), set "fieldId" to that field\'s id and "value" to a clean, correctly formatted value for it. Your reply should confirm what you understood, e.g. "Got it — I have your phone number as (555) 123-4567. Want me to add it?"',
    '- If the user is asking a question about the form, a field, or anything else, answer it helpfully in "reply" and set both "fieldId" and "value" to null.',
    '- Never invent personal data. Only extract values the user actually stated.',
    '- Format values to match the field type: emails as emails, numbers as plain digits, phone numbers tidily.',
  ].join('\n');
}

const replyShape = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    fieldId: { type: 'string', nullable: true },
    value: { type: 'string', nullable: true },
  },
  required: ['reply'],
} as const;

export const assistantGenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: replyShape,
};

/**
 * Validates and normalizes raw model output. Returns null when the model
 * response is unusable so the caller can fall back gracefully.
 */
export function parseAssistantResult(raw: unknown, fields: Pick<DemoField, 'id'>[]): AssistantReply | null {
  if (raw == null || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.reply !== 'string' || !candidate.reply.trim()) return null;
  const reply = candidate.reply.trim();
  const fieldId = typeof candidate.fieldId === 'string' ? candidate.fieldId : null;
  const value = typeof candidate.value === 'string' ? candidate.value.trim() : '';
  if (fieldId && value && fields.some(field => field.id === fieldId)) {
    return { reply, proposal: { fieldId, value } };
  }
  return { reply, proposal: null };
}
