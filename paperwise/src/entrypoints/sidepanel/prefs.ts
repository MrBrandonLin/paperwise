import { useEffect, useState } from 'react';
import type { Language } from '@/shared/contract';
import { isLanguage, toLanguage } from '@/shared/languages';

/**
 * The user's preferences: shown-once onboarding, language, text size, speaking speed, voice or
 * typing. Kept in chrome.storage.local so the panel remembers them. Never answers or form data:
 * "nothing is persisted" is about what the user tells Paperwise, and this holds none of it.
 */
export interface Prefs {
  onboarded: boolean;
  language: Language;
  textSize: 'normal' | 'large' | 'xl';
  speed: 'normal' | 'slower';
  /** Typing only (no microphone). */
  typing: boolean;
  /** Noisy room: the microphone listens only while the user holds the talk button or Space. */
  holdToTalk: boolean;
}

const KEY = 'paperwise-prefs';

export const DEFAULT_PREFS: Prefs = {
  onboarded: false,
  language: (typeof navigator !== 'undefined' && toLanguage(navigator.language)) || 'en',
  textSize: 'normal',
  speed: 'normal',
  typing: false,
  holdToTalk: false,
};

/** Speaking speed sent to ElevenLabs (0.7–1.2). */
export const SPEEDS: Record<Prefs['speed'], number> = { normal: 0.95, slower: 0.8 };

/** Panel zoom per text size: everything scales (icons, spacing, text), not just some words. */
export const TEXT_ZOOM: Record<Prefs['textSize'], number> = { normal: 1, large: 1.2, xl: 1.4 };

export function usePrefs() {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<Prefs> | undefined;
        if (stored) {
          setState({
            ...DEFAULT_PREFS,
            ...stored,
            language: isLanguage(stored.language) ? stored.language : DEFAULT_PREFS.language,
          });
        }
      } catch {
        // storage unavailable (tests): defaults
      }
      setLoaded(true);
    })();
  }, []);
  function update(patch: Partial<Prefs>) {
    setState((p) => {
      const next = { ...p, ...patch };
      void browser.storage.local.set({ [KEY]: next }).catch(() => {});
      return next;
    });
  }
  return { prefs, update, loaded };
}
