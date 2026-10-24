import { describe, expect, it } from 'vitest';
import { demoFields, nextEmptyField } from '@/lib/extension-demo';

describe('Guided website form', () => {
  it('guides the user to the next unanswered website field', () => {
    expect(nextEmptyField({ name: 'Alex Morgan' })).toBe(1);
    expect(nextEmptyField({ name: 'Alex Morgan', email: '   ' })).toBe(1);
  });

  it('finishes guidance only after every demo field has an answer', () => {
    const values = Object.fromEntries(demoFields.map(field => [field.id, 'Answered']));
    expect(nextEmptyField(values)).toBe(-1);
    delete values['income'];
    expect(nextEmptyField(values)).toBe(5);
  });
});
import { demoScenarios, getScenario } from '@/lib/extension-demo';
describe('Demo gallery', () => {
  it('offers rental, clinic, grant, and license demos', () => {
    expect(demoScenarios.map(s => s.id)).toEqual(['rental', 'clinic', 'grant', 'license']);
    expect(getScenario('nope')).toBeUndefined();
  });
});

import { buildAssistantPrompt, parseAssistantResult } from '@/lib/assistant.shared';
describe('Gemini assistant', () => {
  it('only proposes values for fields that exist on the form', () => {
    const fields = [{ id: 'name' }, { id: 'email' }];
    expect(parseAssistantResult({ reply: 'Got it.', fieldId: 'email', value: 'a@b.com' }, fields))
      .toEqual({ reply: 'Got it.', proposal: { fieldId: 'email', value: 'a@b.com' } });
    expect(parseAssistantResult({ reply: 'Got it.', fieldId: 'invented', value: 'x' }, fields)?.proposal).toBeNull();
    expect(parseAssistantResult({ reply: 'Got it.', fieldId: 'name', value: '' }, fields)?.proposal).toBeNull();
  });

  it('rejects replies with no usable text', () => {
    expect(parseAssistantResult({ fieldId: 'name', value: 'Alex' }, [{ id: 'name' }])).toBeNull();
    expect(parseAssistantResult('not json', [{ id: 'name' }])).toBeNull();
  });

  it('never asks the model to invent personal data', () => {
    const prompt = buildAssistantPrompt({
      scenarioTitle: 'Rental application', scenarioContext: 'Housing',
      fields: [{ id: 'name', label: 'Full legal name', type: 'text', question: '', explanation: '' }],
      values: {}, activeFieldId: 'name', message: 'hi',
    });
    expect(prompt).toContain('Never invent personal data');
    expect(prompt).toContain('"hi"');
  });
});
