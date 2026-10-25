import type { Language } from '@/shared/contract';
import type { BackgroundRequest } from '@/shared/messages';
import { toLanguage } from '@/shared/languages';
import { scanPage } from './scanner';

/** The map is built in the FORM's language (the page's), whatever the user speaks. */
function guessLanguage(): Language {
  return toLanguage(document.documentElement.lang) ?? 'en';
}

let prefetched = false;

/** Hover/focus on the button = intent: start building the form map before the click. */
export function prefetchFormMap() {
  if (prefetched) return;
  prefetched = true;
  const msg: BackgroundRequest = { type: 'API_FORM_MAP_PREFETCH', scan: scanPage(), language: guessLanguage() };
  browser.runtime.sendMessage(msg).catch(() => {});
}

/** Click: open the side panel (must stay inside the user gesture) and prefetch the map. */
export function openPanel() {
  const msg: BackgroundRequest = { type: 'OPEN_PANEL', scan: scanPage(), language: guessLanguage() };
  browser.runtime.sendMessage(msg).catch((err) => console.error('[paperwise] open panel failed', err));
}
