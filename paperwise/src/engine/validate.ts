/**
 * Validators per field kind. The agent only PROPOSES a value; nothing touches the page until it
 * passes here. A failure carries two messages:
 *   agent → precise instruction for the voice agent (English; it speaks the user's language)
 *   user  → short plain reason shown on the amber field, in the user's language
 */
import type { FormMapField, Language, LocalizedText, ScannedField } from '../shared/contract';
import { tr } from '../shared/languages';

export type Validation = { ok: true; value: string } | { ok: false; agent: string; user: string };

const fail = (agent: string, user: LocalizedText, lang: Language): Validation => ({ ok: false, agent, user: tr(user, lang) });

export function validateValue(
  field: ScannedField,
  mapped: FormMapField | undefined,
  raw: string,
  lang: Language,
  now: Date = new Date(),
): Validation {
  // An optional private field the user doesn't have: skipping it (empty) is fine, no value involved.
  if (raw.trim() === '' && !field.required && (field.sensitive || mapped?.risk === 'sensitive')) return { ok: true, value: '' };
  if (field.sensitive || field.kind === 'password' || mapped?.risk === 'sensitive') {
    return fail(
      'Sensitive field: never accept it by voice. Call request_typing with this id and ask the user to type it themselves.',
      { en: 'Please type this one yourself.', es: 'Por favor, escríbalo usted mismo.', fr: 'Merci de taper celui-ci vous-même.', ar: 'من فضلك اكتب هذا بنفسك.' },
      lang,
    );
  }

  const value = raw.trim();
  if (value === '') {
    if (field.required && field.kind !== 'checkbox') {
      return fail('This field is required: an empty value is not allowed. Ask the question again.', { en: 'This one is required.', es: 'Este campo es obligatorio.', fr: 'Ce champ est obligatoire.', ar: 'هذا الحقل مطلوب.' }, lang);
    }
    return { ok: true, value: '' };
  }

  switch (field.kind) {
    case 'checkbox': {
      const b = parseBool(value);
      if (b === null) return fail(`A checkbox needs yes or no, got "${raw}". Ask a yes/no question.`, { en: 'Please answer yes or no.', es: 'Responda sí o no, por favor.', fr: 'Répondez par oui ou par non.', ar: 'من فضلك أجب بنعم أو لا.' }, lang);
      return { ok: true, value: String(b) };
    }
    case 'select':
    case 'radio': {
      const options = (field.options ?? []).filter((o) => o.value !== '');
      const match = matchOption(options, value);
      if (!match) {
        return fail(
          `"${raw}" is not one of the choices: ${options.map((o) => `${o.label} (${o.value})`).join(', ')}. Read the choices to the user and ask again.`,
          { en: 'That is not one of the choices.', es: 'Esa no es una de las opciones.', fr: 'Ce n’est pas l’un des choix proposés.', ar: 'هذا ليس من الخيارات المتاحة.' },
          lang,
        );
      }
      return { ok: true, value: match.value };
    }
    case 'date':
      return validateDate(field, value, raw, lang, now);
    case 'number': {
      const n = normalizeNumber(value);
      if (n === null) return fail(`"${raw}" is not a number. Ask for a number.`, { en: 'Please give a number.', es: 'Indique un número, por favor.', fr: 'Merci de donner un nombre.', ar: 'من فضلك أعطِ رقمًا.' }, lang);
      const num = Number(n);
      if (/whole/.test(mapped?.formatHint ?? '') && !Number.isInteger(num)) {
        return fail(`Whole numbers only, got ${n}. Ask for a whole number (round it with the user).`, { en: 'Please give a whole number.', es: 'Indique un número entero, por favor.', fr: 'Merci de donner un nombre entier.', ar: 'من فضلك أعطِ عددًا صحيحًا.' }, lang);
      }
      if (field.min !== undefined && field.min !== '' && num < Number(field.min)) {
        return fail(`Must be at least ${field.min}, got ${n}.`, { en: `It must be at least ${field.min}.`, es: `Debe ser al menos ${field.min}.`, fr: `Le minimum est ${field.min}.`, ar: `يجب ألا يقل عن ${field.min}.` }, lang);
      }
      if (field.max !== undefined && field.max !== '' && num > Number(field.max)) {
        return fail(`Must be at most ${field.max}, got ${n}.`, { en: `It must be at most ${field.max}.`, es: `Debe ser como máximo ${field.max}.`, fr: `Le maximum est ${field.max}.`, ar: `يجب ألا يزيد عن ${field.max}.` }, lang);
      }
      return { ok: true, value: n };
    }
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        return fail(`"${raw}" is not a valid email address. Ask the user to spell it.`, { en: 'That email address looks incomplete.', es: 'Ese correo electrónico parece incompleto.', fr: 'Cette adresse e-mail semble incomplète.', ar: 'يبدو أن عنوان البريد الإلكتروني غير مكتمل.' }, lang);
      }
      return checkTextRules(field, value, raw, lang);
    case 'tel': {
      const digits = value.replace(/\D/g, '');
      if (!/^[0-9+()\-.\s]+$/.test(value) || digits.length < 7 || digits.length > 15) {
        return fail(`"${raw}" is not a phone number (7 to 15 digits). Ask again, digit by digit.`, { en: 'That phone number looks wrong.', es: 'Ese número de teléfono parece incorrecto.', fr: 'Ce numéro de téléphone semble incorrect.', ar: 'يبدو أن رقم الهاتف غير صحيح.' }, lang);
      }
      return checkTextRules(field, value, raw, lang);
    }
    default:
      return checkTextRules(field, value, raw, lang);
  }
}

function checkTextRules(field: ScannedField, value: string, raw: string, lang: Language): Validation {
  if (field.maxLength && value.length > field.maxLength) {
    return fail(`Too long: at most ${field.maxLength} characters, got ${value.length}.`, { en: `It must be ${field.maxLength} characters or fewer.`, es: `Máximo ${field.maxLength} caracteres.`, fr: `Maximum ${field.maxLength} caractères.`, ar: `الحد الأقصى ${field.maxLength} حرفًا.` }, lang);
  }
  if (field.pattern) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(`^(?:${field.pattern})$`, 'u');
    } catch {
      re = null; // the page's own pattern is broken: don't block on it
    }
    if (re && !re.test(value)) {
      return fail(`"${raw}" does not match the format the form expects (pattern ${field.pattern}).`, { en: 'That is not in the format the form expects.', es: 'No tiene el formato que pide el formulario.', fr: 'Ce n’est pas au format attendu.', ar: 'هذا ليس بالصيغة التي يطلبها النموذج.' }, lang);
    }
  }
  return { ok: true, value };
}

function validateDate(field: ScannedField, value: string, raw: string, lang: Language, now: Date): Validation {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return fail(`Dates must be YYYY-MM-DD, got "${raw}". Convert what the user said (e.g. 4 March 1958 → 1958-03-04).`, { en: 'I need the full date.', es: 'Necesito la fecha completa.', fr: 'J’ai besoin de la date complète.', ar: 'أحتاج إلى التاريخ كاملًا.' }, lang);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return fail(`${value} is not a real date. Ask again.`, { en: 'That date does not exist.', es: 'Esa fecha no existe.', fr: 'Cette date n’existe pas.', ar: 'هذا التاريخ غير موجود.' }, lang);
  }
  if (field.min && value < field.min) return fail(`Must be on or after ${field.min}.`, { en: `It must be on or after ${field.min}.`, es: `Debe ser el ${field.min} o después.`, fr: `Au plus tôt le ${field.min}.`, ar: `يجب أن يكون في ${field.min} أو بعده.` }, lang);
  if (field.max && value > field.max) return fail(`Must be on or before ${field.max}.`, { en: `It must be on or before ${field.max}.`, es: `Debe ser el ${field.max} o antes.`, fr: `Au plus tard le ${field.max}.`, ar: `يجب أن يكون في ${field.max} أو قبله.` }, lang);

  const today = now.toISOString().slice(0, 10);
  const text = `${field.label} ${field.name ?? ''} ${field.autocomplete ?? ''}`.toLowerCase();
  if (/birth|dob|bday|naissance/.test(text)) {
    const age = now.getUTCFullYear() - y;
    if (value > today) return fail(`A date of birth cannot be in the future (${value}). Ask again.`, { en: 'A birth date can’t be in the future.', es: 'Una fecha de nacimiento no puede estar en el futuro.', fr: 'Une date de naissance ne peut pas être dans le futur.', ar: 'لا يمكن أن يكون تاريخ الميلاد في المستقبل.' }, lang);
    if (age > 120) return fail(`${value} means age ${age}: check the year with the user.`, { en: 'Please check the year.', es: 'Revise el año, por favor.', fr: 'Merci de vérifier l’année.', ar: 'من فضلك تحقق من السنة.' }, lang);
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
