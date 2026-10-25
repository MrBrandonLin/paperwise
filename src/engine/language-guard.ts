import type { FormMapField, ScannedField } from '../shared/contract';

/**
 * The form's language is what goes into fields. The agent is told to translate free-text answers
 * ("un gato que se llama Michi" → "a cat named Michi"), but live tests showed it sometimes writes
 * the user's words as they were said. This catches that, for free-text fields only: names,
 * addresses, employers, emails and numbers are never touched (proper nouns stay as said).
 */

/** Short, very common words: enough to tell the language of a sentence, never names. */
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'is', 'my', 'a', 'an', 'of', 'to', 'in', 'with', 'he', 'she', 'it', 'very', 'we', 'have', 'has', 'named', 'called', 'for', 'on'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'y', 'es', 'muy', 'se', 'llama', 'mi', 'tengo', 'con', 'que', 'del', 'por', 'para', 'pero', 'está', 'son', 'trabajo', 'gato', 'perro'],
  fr: ['le', 'la', 'les', 'un', 'une', 'et', 'est', 'très', 'il', 'elle', 'mon', 'ma', "j'ai", 'avec', 'que', 'du', 'des', 'pour', 'mais', "s'appelle", 'appelle', 'chat', 'chien'],
  pt: ['o', 'a', 'os', 'as', 'um', 'uma', 'e', 'é', 'muito', 'meu', 'minha', 'tenho', 'com', 'que', 'do', 'da', 'para', 'mas', 'chama', 'gato', 'cachorro'],
};

/** Scripts other than Latin: text in them isn't English (or French, Spanish…). */
const NON_LATIN = /[؀-ۿЀ-ӿऀ-ॿ぀-ヿ㐀-鿿가-힯]/;

/** Fields where the user's exact words belong: names, places, contact details, numbers. */
const KEEP_AS_SAID = /name|nom|nombre|address|adresse|direcci|street|rue|calle|city|ville|ciudad|state|zip|postal|country|email|e-mail|phone|tel|employer|company|entreprise|empresa|school|bank|id\b|number|numéro|número/i;

export function isFreeText(field: ScannedField, mapped: FormMapField | undefined): boolean {
  if (field.kind !== 'text' && field.kind !== 'textarea') return false;
  const text = `${field.label} ${field.name ?? ''} ${field.autocomplete ?? ''} ${mapped?.plainQuestion ?? ''}`;
  return !KEEP_AS_SAID.test(text);
}

/**
 * The language a value seems to be written in, when it isn't the form's. null = fine (the
 * form's language, or too short to tell).
 */
export function foreignLanguageOf(value: string, formLanguage: string): string | null {
  const form = formLanguage.slice(0, 2).toLowerCase();
  if (NON_LATIN.test(value) && ['en', 'es', 'fr', 'pt'].includes(form)) return 'another script';
  const words = value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
  if (words.length < 3) return null;
  const score = (lang: string) => words.filter((w) => STOPWORDS[lang]?.includes(w)).length;
  const own = score(form);
  let best: { lang: string; n: number } | null = null;
  for (const lang of Object.keys(STOPWORDS)) {
    if (lang === form) continue;
    const n = score(lang);
    if (n >= 2 && n > own && (!best || n > best.n)) best = { lang, n };
  }
  return best?.lang ?? null;
}
