/**
 * Form-map prompts for Gemini. Edit freely to tune the questions.
 * Try changes with:  pnpm --dir server form-map:print [--lang fr]
 *
 * Built for speed: output tokens are what make Gemini slow, so the model writes as little as
 * possible:
 *  - one language only (the user's), no explanations (generated on demand later)
 *  - short JSON keys, optional keys omitted when empty
 *  - the form is split into small parts mapped IN PARALLEL (one call per part)
 *  - things we can decide locally are never asked: order, format hints, the risk of sensitive
 *    fields (SSN, bank, card, password: always "sensitive"; only their label is sent, never a value)
 *  - a part that is slow gets a second identical request after ~2.5 s; the first answer wins
 * The system prompt is the same for every call (only the user prompt changes), so Gemini's
 * implicit prompt caching can reuse it.
 *
 * Gemini only ever sees the form's STRUCTURE (labels, types, options, nearby text), never values.
 */
import type { Language } from '../../../src/shared/contract.ts';
import type { FieldStructure } from '../form-structure.ts';

export const PART_SYSTEM_PROMPT = `
You write the questions a friendly voice assistant asks to help someone fill a web form.
Users are often elderly, immigrants, or people who read with difficulty. Be warm and plain.

ACCURACY FIRST: plain words must never change the meaning, above all for legal and money fields.
- Keep who does what to whom, and what the person agrees to, gives, or owes.
- Legal / consent fields: say exactly what the person agrees to and who gets permission, from the
  person's side: "Do you allow the landlord to check your credit report?" — never "Can we check
  your credit report?" (that softens a legal consent and speaks as the landlord).
- Never speak as the organization ("we", "us"). You speak for the person filling the form.
- Keep roles exact: a co-signer is someone who agrees to pay your rent if you can't (not a
  "sponsor", "helper" or "reference"). A guarantor, a dependent, a beneficiary: same care.
- Keep amounts, periods and conditions exact: monthly vs yearly, before vs after taxes, "if any".
- Simpler is good only when it is still exactly true.

For each field, return:
- q: the question to say out loud. Short (12 words or fewer), warm, one idea, "you".
  No jargon: if the label uses a hard word (gross, co-signer, guarantor, dependent, certify…),
  say it in plain words. Optional field: say so gently ("If you like, …").
  Checkbox: a yes/no question that says what checking the box means ("checking this box",
  never "signing"). Select or radio: you may list the choices in plain words.
- r: only for risky fields. "legal" = consent, authorization, agreement, certifying something is
  true. "important" = a mistake has real consequences: money, income, date of birth, dates that
  start a contract, someone else taking responsibility. Omit r for everything else.
- w: only when r is set: one short plain sentence on what could happen. For legal fields: what
  the person gives permission for, to whom.
- s: only when the page makes a condition clear ("If yes, …", "if any", an employer name after an
  employment-status choice, a hidden field that an earlier answer reveals):
  {"id": the field it depends on, "v": the option VALUES that make it relevant}. Checkbox: "true"/"false".
- g: the group question, only for the parts of ONE answer (first + last name; street, city, zip; a date split in
  day/month/year): one question that fills them all, the SAME g on each of those fields. Each of
  them still gets its own q. Never group two different questions (date of birth + phone: no g).
- Fields marked sensitive (ID numbers, bank, card, password): q asks the person to type it
  themselves in the highlighted box, never to say it. Omit r and w.
Give each section a short friendly title (t).
Never invent facts: no addresses, numbers, names or rules that are not in the form.
Use only the ids given.
`.trim();


const LANGUAGE_LINE: Record<Language, string> = {
  en: 'Write every text in simple English.',
  fr: 'Write every text in simple, natural French: polite "vous", everyday words, not a word-for-word translation. Optional field: "Si vous le souhaitez, …".',
};

export interface PartSection {
  id: string;
  /** Section heading on the page, if any. */
  pageTitle: string;
  fields: FieldStructure[];
}

/**
 * One part of the form: its sections, plus earlier fields that conditions may point to.
 * `whole` (first part only): also write the form's title + summary, from this outline.
 */
export function buildPartPrompt(opts: {
  language: Language;
  pageTitle: string;
  sections: PartSection[];
  earlier: FieldStructure[];
  whole?: { sectionTitles: string[]; labels: string[] };
}): string {
  const lines = [LANGUAGE_LINE[opts.language], `Form: ${JSON.stringify(opts.pageTitle)}`];
  if (opts.whole) {
    lines.push(
      'Also return "title" (short friendly name of the whole form, e.g. "Rental application") and "summary" (1–2 plain sentences: what the form is for).',
      `Whole form outline: ${JSON.stringify({ sections: opts.whole.sectionTitles, fields: opts.whole.labels.slice(0, 40) })}`,
    );
  }
  if (opts.earlier.length) {
    // Only what a condition can refer to: id, label, and option values.
    const ref = opts.earlier.map((f) => compactField(f, true));
    lines.push(`Earlier fields (already handled; conditions may point to them): ${JSON.stringify(ref)}`);
  }
  const sections = opts.sections.map((s) => ({
    id: s.id,
    ...(s.pageTitle ? { page: s.pageTitle } : {}),
    fields: s.fields.map((f) => compactField(f, false)),
  }));
  lines.push(`Sections to write: ${JSON.stringify(sections)}`);
  return lines.join('\n');
}

/** Short keys, only what helps write the question. No values, ever. */
function compactField(f: FieldStructure, refOnly: boolean): Record<string, unknown> {
  const options = f.options?.filter((o) => o.value !== '').map((o) => (o.value === o.label ? o.value : [o.value, o.label]));
  if (refOnly) {
    return { id: f.id, label: f.label, ...(options?.length ? { options } : {}), ...(f.kind === 'checkbox' ? { kind: 'checkbox' } : {}) };
  }
  return {
    id: f.id,
    kind: f.kind,
    label: f.label,
    ...(f.required ? { required: true } : {}),
    ...(f.visible ? {} : { hidden: true }),
    ...(f.sensitive ? { sensitive: true } : {}),
    ...(options?.length ? { options } : {}),
    ...(f.helpText ? { help: f.helpText } : {}),
    ...(f.placeholder && f.placeholder !== f.label ? { placeholder: f.placeholder } : {}),
  };
}

// ---------------------------------------------------------------------------
// JSON schemas (Gemini structured output). Short keys = fewer output tokens.
// ---------------------------------------------------------------------------

/**
 * One part. `ids` = fields to write; `sectionIds` = its sections; `refIds` = fields s.id may
 * point to; `withMeta` (first part) = also title + summary of the whole form.
 */
export function partSchema(ids: string[], sectionIds: string[], refIds: string[], withMeta = false) {
  return {
    type: 'object',
    properties: {
      ...(withMeta ? { title: { type: 'string' }, summary: { type: 'string' } } : {}),
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string', enum: sectionIds }, t: { type: 'string' } },
          required: ['id', 't'],
        },
      },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ids },
            q: { type: 'string' },
            g: {
              type: 'string',
              description: 'The ONE question that fills every field of the group, e.g. "What is your full name?". Same text on each field of the group.',
            },
            r: { type: 'string', enum: ['important', 'legal'] },
            w: { type: 'string' },
            s: {
              type: 'object',
              properties: {
                id: { type: 'string', enum: refIds },
                v: { type: 'array', items: { type: 'string' } },
              },
              required: ['id', 'v'],
            },
          },
          required: ['id', 'q'],
        },
      },
    },
    required: [...(withMeta ? ['title', 'summary'] : []), 'sections', 'fields'],
  };
}
