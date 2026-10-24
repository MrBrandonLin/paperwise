import type { Language } from '@/shared/contract';

/**
 * What the in-page UI shows that the DOM doesn't already say: progress for the floating button,
 * the user's language for its labels, and "a value was just written" for the fill animation.
 * Field highlights live on the fields themselves (data-paperwise-status / -active attributes).
 * No React, no browser.*: the filler and the request handler feed it (also in test:fill).
 */
export interface Flash {
  key: number;
  id: string;
  /** Shown flowing onto the field. '' = just a check (checkboxes, sensitive fields). */
  text: string;
}

export interface PageUiState {
  progress: { done: number; total: number } | null;
  language: Language;
  flashes: Flash[];
}

let state: PageUiState = {
  progress: null,
  language: typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en',
  flashes: [],
};
const listeners = new Set<() => void>();
let nextKey = 1;

function set(next: Partial<PageUiState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const pageUi = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  setProgress(done: number, total: number, language?: Language) {
    set({ progress: { done, total }, ...(language ? { language } : {}) });
  },
  /** A value was written to the page. Sensitive values never come here (the filler passes ''). */
  flashFill(id: string, text: string) {
    const flash = { key: nextKey++, id, text };
    set({ flashes: [...state.flashes, flash].slice(-4) });
    setTimeout(() => set({ flashes: state.flashes.filter((f) => f.key !== flash.key) }), 1800);
  },
};
