/**
 * The six client tools the voice agent can call. Single source of truth:
 *  - server/scripts/agent-setup.ts creates them in ElevenLabs from this list
 *  - the side panel registers a handler for each name (VoiceSession)
 * Names and parameters are case-sensitive and must match the dashboard (the setup script
 * guarantees it). Every tool "waits for response": the agent reads our result.
 */
import type { AgentToolName } from './contract';

export interface AgentToolDefinition {
  name: AgentToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: 'string' | 'number'; description: string }>;
    required: string[];
  };
}

const id = { type: 'string' as const, description: 'The field id from the form map, e.g. "pw-dob". Never read ids aloud.' };

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'fill_field',
    description:
      'Write the user’s answer into a form field. Call it after every answer (and again when the user corrects one). ' +
      'The page is only changed if the value passes validation; read the result and follow its message.',
    parameters: {
      type: 'object',
      properties: {
        id,
        value: { type: 'string', description: 'The answer in the FORM’s language and format (see the field’s format), e.g. "1958-03-04", "1800", "employed", "true". Empty "" skips an optional field.' },
        display_value: { type: 'string', description: 'The same answer as you would say it to the user, in the user’s language, e.g. "4 mars 1958".' },
        confidence: { type: 'number', description: 'How sure you are that you understood the answer, 0 to 1. Be honest: below 0.7 the field is kept for confirmation.' },
      },
      required: ['id', 'value', 'display_value', 'confidence'],
    },
  },
  {
    name: 'flag_for_review',
    description: 'Mark a field as unclear (amber) when you are not sure what the user meant. Then ask a confirming question. Never guess.',
    parameters: {
      type: 'object',
      properties: { id, reason: { type: 'string', description: 'Why it is unclear, one short sentence in the user’s language.' } },
      required: ['id', 'reason'],
    },
  },
  {
    name: 'go_to_field',
    description: 'Scroll the page to a field and mark it as the current one. Use it when you move to a new question, and on each section during the review.',
    parameters: { type: 'object', properties: { id }, required: ['id'] },
  },
  {
    name: 'explain_field',
    description: 'Get what is known about a field (label, help text, choices, risk) when the user asks what it means. Then explain in 1–2 plain sentences and ask the question again.',
    parameters: { type: 'object', properties: { id }, required: ['id'] },
  },
  {
    name: 'request_typing',
    description: 'For sensitive fields (ID numbers, bank, card, password): highlight the field so the user types it themselves. Never ask them to say it.',
    parameters: { type: 'object', properties: { id }, required: ['id'] },
  },
  {
    name: 'start_review',
    description: 'When every question is answered: get the answers to read back section by section. If it refuses, handle the fields it lists first.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];
