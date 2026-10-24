/**
 * Validators per field kind. The agent only PROPOSES a value; nothing touches the page until it
 * passes here. A failure carries two messages:
 *   agent → precise instruction for the voice agent (English; it speaks the user's language)
 *   user  → short plain reason shown on the amber field, in the user's language
 */
import type { FormMapField, Language, ScannedField } from '../shared/contract';

export type Validation = { ok: true; value: string } | { ok: false; agent: string; user: string };

type Msg = Record<Language, string>;
const fail = (agent: string, user: Msg, lang: Language): Validation => ({ ok: false, agent, user: user[lang] });

export function validateValue(
  field: ScannedField,
  mapped: FormMapField | undefined,
  raw: string,
  lang: Language,
  now: Date = new Date(),
): Validation {
  if (field.sensitive || field.kind === 'password' || mapped?.risk === 'sensitive') {
    return fail(
      'Sensitive field: never accept it by voice. Call request_typing with this id and ask the user to type it themselves.',
      { en: 'Please type this one yourself.', fr: 'Merci de taper celui-ci vous-même.' },
      lang,
    );
  }

  const value = raw.trim();
  if (value === '') {
    if (field.required && field.kind !== 'checkbox') {
      return fail('This field is required: an empty value is not allowed. Ask the question again.', { en: 'This one is required.', fr: 'Ce champ est obligatoire.' }, lang);
    }
    return { ok: true, value: '' };
  }

  switch (field.kind) {
    case 'checkbox': {
      const b = parseBool(value);
      if (b === null) return fail(`A checkbox needs yes or no, got "${raw}". Ask a yes/no question.`, { en: 'Please answer yes or no.', fr: 'Répondez par oui ou par non.' }, lang);
      return { ok: true, value: String(b) };
    }
    case 'select':
    case 'radio': {
      const options = (field.options ?? []).filter((o) => o.value !== '');
      const match = matchOption(options, value);
      if (!match) {
        return fail(
          `"${raw}" is not one of the choices: ${options.map((o) => `${o.label} (${o.value})`).join(', ')}. Read the choices to the user and ask again.`,
          { en: 'That is not one of the choices.', fr: 'Ce n’est pas l’un des choix proposés.' },
          lang,
        );
      }
      return { ok: true, value: match.value };
    }
    case 'date':
      return validateDate(field, value, raw, lang, now);
    case 'number': {
      const n = normalizeNumber(value);
      if (n === null) return fail(`"${raw}" is not a number. Ask for a number.`, { en: 'Please give a number.', fr: 'Merci de donner un nombre.' }, lang);
      const num = Number(n);
      if (/whole/.test(mapped?.formatHint ?? '') && !Number.isInteger(num)) {
        return fail(`Whole numbers only, got ${n}. Ask for a whole number (round it with the user).`, { en: 'Please give a whole number.', fr: 'Merci de donner un nombre entier.' }, lang);
      }
      if (field.min !== undefined && field.min !== '' && num < Number(field.min)) {
        return fail(`Must be at least ${field.min}, got ${n}.`, { en: `It must be at least ${field.min}.`, fr: `Le minimum est ${field.min}.` }, lang);
      }
      if (field.max !== undefined && field.max !== '' && num > Number(field.max)) {
        return fail(`Must be at most ${field.max}, got ${n}.`, { en: `It must be at most ${field.max}.`, fr: `Le maximum est ${field.max}.` }, lang);
      }
      return { ok: true, value: n };
    }
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        return fail(`"${raw}" is not a valid email address. Ask the user to spell it.`, { en: 'That email address looks incomplete.', fr: 'Cette adresse e-mail semble incomplète.' }, lang);
      }
      return checkTextRules(field, value, raw, lang);
    case 'tel': {
      const digits = value.replace(/\D/g, '');
      if (!/^[0-9+()\-.\s]+$/.test(value) || digits.length < 7 || digits.length > 15) {
        return fail(`"${raw}" is not a phone number (7 to 15 digits). Ask again, digit by digit.`, { en: 'That phone number looks wrong.', fr: 'Ce numéro de téléphone semble incorrect.' }, lang);
      }
      return checkTextRules(field, value, raw, lang);
    }
    default:
      return checkTextRules(field, value, raw, lang);
  }
}

function checkTextRules(field: ScannedField, value: string, raw: string, lang: Language): Validation {
  if (field.maxLength && value.length > field.maxLength) {
    return fail(`Too long: at most ${field.maxLength} characters, got ${value.length}.`, { en: `It must be ${field.maxLength} characters or fewer.`, fr: `Maximum ${field.maxLength} caractères.` }, lang);
  }
  if (field.pattern) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(`^(?:${field.pattern})$`, 'u');
    } catch {
      re = null; // the page's own pattern is broken: don't block on it
    }
    if (re && !re.test(value)) {
      return fail(`"${raw}" does not match the format the form expects (pattern ${field.pattern}).`, { en: 'That is not in the format the form expects.', fr: 'Ce n’est pas au format attendu.' }, lang);
    }
  }
  return { ok: true, value };
}

function validateDate(field: ScannedField, value: string, raw: string, lang: Language, now: Date): Validation {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return fail(`Dates must be YYYY-MM-DD, got "${raw}". Convert what the user said (e.g. 4 March 1958 → 1958-03-04).`, { en: 'I need the full date.', fr: 'J’ai besoin de la date complète.' }, lang);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return fail(`${value} is not a real date. Ask again.`, { en: 'That date does not exist.', fr: 'Cette date n’existe pas.' }, lang);
  }
  if (field.min && value < field.min) return fail(`Must be on or after ${field.min}.`, { en: `It must be on or after ${field.min}.`, fr: `Au plus tôt le ${field.min}.` }, lang);
  if (field.max && value > field.max) return fail(`Must be on or before ${field.max}.`, { en: `It must be on or before ${field.max}.`, fr: `Au plus tard le ${field.max}.` }, lang);

  const today = now.toISOString().slice(0, 10);
  const text = `${field.label} ${field.name ?? ''} ${field.autocomplete ?? ''}`.toLowerCase();
  if (/birth|dob|bday|naissance/.test(text)) {
    const age = now.getUTCFullYear() - y;
    if (value > today) return fail(`A date of birth cannot be in the future (${value}). Ask again.`, { en: 'A birth date can’t be in the future.', fr: 'Une date de naissance ne peut pas être dans le futur.' }, lang);
    if (age > 120) return fail(`${value} means age ${age}: check the year with the user.`, { en: 'Please check the year.', fr: 'Merci de vérifier l’année.' }, lang);
  }
  return { ok: true, value };
}

export function parseBool(raw: string): boolean | null {
  const v = loose(raw);
  if (['true', 'yes', 'y', 'on', '1', 'checked', 'oui', 'x', 'agree', 'i agree'].includes(v)) return true;
  if (['false', 'no', 'n', 'off', '0', 'unchecked', 'non'].includes(v)) return false;
  return null;
}

/** Exact value, then label, then loose (case/accents/punctuation), then a unique prefix. */
export function matchOption<T extends { value: string; label: string }>(options: T[], raw: string): T | null {
  const exact = options.find((o) => o.value === raw);
  if (exact) return exact;
  const want = loose(raw);
  if (!want) return null;
  const byLabel = options.find((o) => loose(o.label) === want) ?? options.find((o) => loose(o.value) === want);
  if (byLabel) return byLabel;
  const prefix = options.filter((o) => loose(o.label).startsWith(want));
  return prefix.length === 1 ? prefix[0]! : null;
}

function loose(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "1,800" → "1800", "1 800,50" → "1800.50", "$2,000.5" → "2000.5". Null if not a number. */
export function normalizeNumber(raw: string): string | null {
  let s = raw.replace(/[\s  $€£]/g, '');
  if (s === '') return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}
