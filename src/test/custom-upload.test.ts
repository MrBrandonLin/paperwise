import { describe, expect, it } from 'vitest';
import { scenarioFromFile } from '@/lib/custom-upload';

describe('Uploaded form parsing', () => {
  it('turns label lines in a text form into guided fields', async () => {
    const file = new File(['Name: ____\nEmail address:\nIntro paragraph here.'], 'job.txt', { type: 'text/plain' });
    const { scenario, detected } = await scenarioFromFile(file);
    expect(detected).toBe(true);
    expect(scenario.fields.map(f => f.label)).toEqual(['Name', 'Email address']);
    expect(scenario.fields[1]!.type).toBe('email');
  });
  it('falls back to a practice form when no fields are found', async () => {
    const { detected, scenario } = await scenarioFromFile(new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(detected).toBe(false);
    expect(scenario.fields.length).toBe(5);
  });
});
