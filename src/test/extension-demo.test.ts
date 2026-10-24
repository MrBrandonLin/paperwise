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
