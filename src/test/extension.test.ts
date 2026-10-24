import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

describe('Paperwise extension field access', () => {
  let listener: (message: Record<string, unknown>, sender: object, respond: (value: any) => void) => void;
  beforeEach(() => {
    document.body.innerHTML = '<label for="name">Full name</label><input id="name"><input type="password"><input type="file"><input type="hidden"><input disabled><label for="consent">Consent</label><input id="consent" type="checkbox">';
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    (globalThis as any).__paperwiseInstalled = false;
    (globalThis as any).chrome = { runtime: { onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } } };
    new Function(readFileSync('extension/content.js', 'utf8'))();
  });
  const dispatch = (message: Record<string, unknown>) => {
    let result: any;
    listener(message, {}, value => { result = value; });
    return result;
  };
  it('scans ordinary fields without exposing password, hidden, disabled, or file controls', () => {
    const result = dispatch({ type: 'scan' });
    expect(result.fields.map((field: any) => field.label)).toEqual(['Full name', 'Consent']);
  });
  it('fills the original field and sends input events', () => {
    dispatch({ type: 'scan' });
    const onInput = vi.fn(); document.querySelector('#name')?.addEventListener('input', onInput);
    expect(dispatch({ type: 'fill', id: '0', value: 'Brandon Lin' }).ok).toBe(true);
    expect((document.querySelector('#name') as HTMLInputElement).value).toBe('Brandon Lin');
    expect(onInput).toHaveBeenCalledOnce();
  });
  it('never grants consent without an explicit boolean choice', () => {
    dispatch({ type: 'scan' });
    expect(dispatch({ type: 'fill', id: '1', value: 'yes' }).error).toBeTruthy();
    expect((document.querySelector('#consent') as HTMLInputElement).checked).toBe(false);
    dispatch({ type: 'fill', id: '1', value: true });
    expect((document.querySelector('#consent') as HTMLInputElement).checked).toBe(true);
  });
});