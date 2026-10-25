import type { Language, LocalizedText } from './contract';

/**
 * Every language Paperwise can talk in. One place for names, writing direction, the ElevenLabs
 * language code, and whether the panel itself is translated (otherwise it shows English while
 * the conversation stays in the user's language).
 */
export interface LanguageInfo {
  code: Language;
  /** English name (prompts, logs). */
  name: string;
  /** Name in the language itself (pickers). */
  native: string;
  dir: 'ltr' | 'rtl';
  /** ElevenLabs Agents language code. */
  elevenlabs: string;
  /** The panel's words exist in this language (copy.ts). */
  panel: boolean;
  /** How the agent addresses the user, when the language has a formal "you". */
  register?: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr', elevenlabs: 'en', panel: true },
  { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr', elevenlabs: 'es', panel: true, register: 'usted' },
  { code: 'fr', name: 'French', native: 'Français', dir: 'ltr', elevenlabs: 'fr', panel: true, register: 'vous' },
  { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', elevenlabs: 'ar', panel: true },
  { code: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr', elevenlabs: 'pt', panel: false, register: 'você' },
  { code: 'zh', name: 'Mandarin Chinese', native: '中文', dir: 'ltr', elevenlabs: 'zh', panel: false },
  { code: 'ru', name: 'Russian', native: 'Русский', dir: 'ltr', elevenlabs: 'ru', panel: false, register: 'вы' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', dir: 'ltr', elevenlabs: 'vi', panel: false },
  { code: 'tl', name: 'Tagalog (Filipino)', native: 'Tagalog', dir: 'ltr', elevenlabs: 'fil', panel: false },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', elevenlabs: 'hi', panel: false, register: 'आप' },
  { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr', elevenlabs: 'ko', panel: false },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export function languageInfo(code: Language): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

export function isLanguage(code: unknown): code is Language {
  return typeof code === 'string' && LANGUAGE_CODES.includes(code as Language);
}

/** "fr-CA", "es_419", "zh-Hans" → our code, or null. */
export function toLanguage(tag: string | null | undefined): Language | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  if (base === 'fil') return 'tl';
  return isLanguage(base) ? base : null;
}

/** ElevenLabs code → our code. */
export function fromElevenLabs(code: string | null | undefined): Language | null {
  if (!code) return null;
  return LANGUAGES.find((l) => l.elevenlabs === code)?.code ?? toLanguage(code);
}

/**
 * Languages people ask for that we can't speak yet, and the closest one we offer instead.
 * (Kept in one place so the agent prompt and tests agree.)
 */
export const UNSUPPORTED_FALLBACK: Record<string, { name: string; closest: Language }> = {
  ht: { name: 'Haitian Creole', closest: 'fr' },
};

/** The text in this language, else English. */
export function tr(text: LocalizedText, language: Language): string {
  return text[language] ?? text.en;
}

/**
 * The language of something the user said, when it's clear. Scripts first (Cyrillic → Russian,
 * Arabic, Han → Chinese, Devanagari → Hindi, Hangul → Korean, Vietnamese tone marks), then common
 * short words for the Latin-script languages. null when unsure (short answers like "ok", names).
 */
export function detectLanguage(text: string): Language | null {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return null;
  const share = (re: RegExp) => (letters.match(re)?.length ?? 0) / letters.length;
  if (share(/[\u0400-\u04ff]/g) > 0.5) return 'ru';
  if (share(/[\u0600-\u06ff]/g) > 0.5) return 'ar';
  if (share(/[\u4e00-\u9fff]/g) > 0.5) return 'zh';
  if (share(/[\u0900-\u097f]/g) > 0.5) return 'hi';
  if (share(/[\uac00-\ud7af\u1100-\u11ff]/g) > 0.5) return 'ko';
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text) && /[đơư]|[ạảấầậắằặẹẻẽếềệịọỏốồộớờợụủứừựỳỵỷỹ]/i.test(text)) return 'vi';
  const words = text.toLowerCase().replace(/[’']/g, "'").split(/[^\p{L}']+/u).filter(Boolean);
  if (words.length < 3) return null;
  const COMMON: Partial<Record<Language, string[]>> = {
    en: ['the', 'and', 'is', 'my', 'i', "i'm", 'it', 'yes', 'no', 'you', 'a', 'of', 'to', 'have', 'name', 'what', 'that', 'do', 'please', 'thank'],
    es: ['el', 'la', 'los', 'las', 'y', 'es', 'mi', 'yo', 'sí', 'no', 'que', 'de', 'tengo', 'me', 'llamo', 'por', 'favor', 'gracias', 'un', 'una', 'en', 'con', 'soy', 'estoy'],
    fr: ['le', 'la', 'les', 'et', 'est', 'je', 'oui', 'non', 'de', 'des', 'du', 'un', 'une', "j'ai", "je", "c'est", 'mon', 'ma', 'merci', 'pour', 'suis', 'pas', 'avec', "m'appelle"],
    pt: ['o', 'os', 'as', 'e', 'é', 'eu', 'sim', 'não', 'de', 'do', 'da', 'um', 'uma', 'meu', 'minha', 'tenho', 'obrigado', 'obrigada', 'com', 'sou', 'estou', 'chamo'],
    tl: ['ang', 'ng', 'mga', 'ako', 'ko', 'po', 'opo', 'hindi', 'oo', 'sa', 'ay', 'na', 'ko', 'ikaw', 'pangalan', 'salamat'],
  };
  let best: { lang: Language; n: number } | null = null;
  let second = 0;
  for (const [lang, list] of Object.entries(COMMON) as [Language, string[]][]) {
    const n = words.filter((w) => list.includes(w)).length;
    if (!best || n > best.n) {
      second = best?.n ?? 0;
      best = { lang, n };
    } else if (n > second) second = n;
  }
  return best && best.n >= 2 && best.n > second ? best.lang : null;
}
