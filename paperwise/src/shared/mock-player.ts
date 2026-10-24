/**
 * Mock player: a fake session that emits realistic AgentEvents on timers,
 * so the UI can be built with no AI, backend or extension running.
 *
 * Pure TypeScript — no browser.* APIs — so it also works in Lovable or a plain React app.
 *
 *   const player = createMockPlayer({ language: 'fr' });
 *   const off = player.subscribe((event) => console.log(event));
 *   player.send({ type: 'start' });        // the conversation begins
 *   player.send({ type: 'end' });          // stops it
 *   off(); player.destroy();
 *
 * The form map mirrors server/public/test/rental.html, with the ids the real scanner
 * gives it ("pw-" + the element's id, or its name for radio groups).
 */
import type {
  AgentEvent,
  AgentMode,
  FieldStatus,
  FormMap,
  FormMapField,
  Language,
  LocalizedText,
  UiEvent,
} from './contract';

export interface MockPlayerOptions {
  /** User language for captions and display values. Default 'en'. */
  language?: Language;
  /** 2 = twice as fast. Default 1. */
  speed?: number;
  /** Start the conversation without waiting for a 'start' UiEvent. Default false. */
  autoStart?: boolean;
  /** Restart from the top when the script ends. Default false. */
  loop?: boolean;
}

export interface MockPlayer {
  /** Listen to events. Returns an unsubscribe function. */
  subscribe(listener: (event: AgentEvent) => void): () => void;
  /** Send a UI event: start, end, language_selected, user_edited_field. */
  send(event: UiEvent): void;
  /** Stop all timers for good. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Hardcoded form map (what Gemini would return for the rental test form)
// ---------------------------------------------------------------------------

/** Bilingual source of the mock map; mockFormMap(lang) gives the single-language FormMap. */
interface MockSource {
  title: LocalizedText;
  summary: LocalizedText;
  estimatedMinutes: number;
  formLanguage: string;
  sections: { id: string; title: LocalizedText; fieldIds: string[] }[];
  groups: { id: string; plainQuestion: LocalizedText; fieldIds: string[] }[];
  fields: (Omit<FormMapField, 'plainQuestion' | 'explanation' | 'riskReason'> & {
    plainQuestion: LocalizedText;
    explanation: LocalizedText;
    riskReason?: LocalizedText;
  })[];
}

const SOURCE: MockSource = {
  title: { en: 'Rental application', fr: 'Demande de location' },
  summary: {
    en: 'An application to rent an apartment at Maple Street Apartments. The landlord uses it to decide if they will rent to you.',
    fr: 'Une demande pour louer un appartement à Maple Street Apartments. Le propriétaire s’en sert pour décider s’il vous loue le logement.',
  },
  estimatedMinutes: 6,
  formLanguage: 'en',
  sections: [
    { id: 's1', title: { en: 'About you', fr: 'À propos de vous' }, fieldIds: ['pw-first', 'pw-last', 'pw-dob', 'pw-email', 'pw-phone', 'pw-ssn'] },
    { id: 's2', title: { en: 'Work and income', fr: 'Travail et revenus' }, fieldIds: ['pw-status', 'pw-employer', 'pw-income'] },
    { id: 's3', title: { en: 'Your move', fr: 'Votre emménagement' }, fieldIds: ['pw-movein', 'pw-pets', 'pw-pets-desc', 'pw-cosigner'] },
    { id: 's4', title: { en: 'Permissions', fr: 'Autorisations' }, fieldIds: ['pw-credit', 'pw-truth'] },
  ],
  groups: [
    {
      id: 'g-name',
      plainQuestion: { en: 'What is your full name?', fr: 'Quel est votre nom complet ?' },
      fieldIds: ['pw-first', 'pw-last'],
    },
  ],
  fields: [
    {
      id: 'pw-first', order: 1, groupId: 'g-name', risk: 'none',
      plainQuestion: { en: 'What is your first name?', fr: 'Quel est votre prénom ?' },
      explanation: { en: 'The name people call you by, like "Marie".', fr: 'Le prénom qu’on utilise pour vous appeler, comme « Marie ».' },
    },
    {
      id: 'pw-last', order: 2, groupId: 'g-name', risk: 'none',
      plainQuestion: { en: 'What is your last name?', fr: 'Quel est votre nom de famille ?' },
      explanation: { en: 'Your family name, like "Dubois".', fr: 'Votre nom de famille, comme « Dubois ».' },
    },
    {
      id: 'pw-dob', order: 3, risk: 'important', formatHint: 'YYYY-MM-DD',
      plainQuestion: { en: 'When were you born?', fr: 'Quelle est votre date de naissance ?' },
      explanation: { en: 'Your date of birth. The landlord uses it to check who you are.', fr: 'Votre date de naissance. Le propriétaire s’en sert pour vérifier votre identité.' },
      riskReason: { en: 'It must match your ID.', fr: 'Elle doit correspondre à votre pièce d’identité.' },
    },
    {
      id: 'pw-email', order: 4, risk: 'none',
      plainQuestion: { en: 'Would you like to give an email address?', fr: 'Voulez-vous donner une adresse e-mail ?' },
      explanation: { en: 'Optional. The landlord may use it to send you news about your application.', fr: 'Facultatif. Le propriétaire peut s’en servir pour vous donner des nouvelles de votre demande.' },
    },
    {
      id: 'pw-phone', order: 5, risk: 'none', formatHint: 'digits, e.g. 555-0142',
      plainQuestion: { en: 'What phone number can they call you on?', fr: 'À quel numéro peut-on vous appeler ?' },
      explanation: { en: 'A number where the landlord can reach you about the apartment.', fr: 'Un numéro où le propriétaire peut vous joindre au sujet de l’appartement.' },
    },
    {
      id: 'pw-ssn', order: 6, risk: 'sensitive', formatHint: '123-45-6789',
      plainQuestion: { en: 'Please type your Social Security Number yourself.', fr: 'Merci de taper vous-même votre numéro de sécurité sociale.' },
      explanation: { en: 'A 9-digit US identity number. Landlords use it to check your credit history.', fr: 'Un numéro d’identité américain à 9 chiffres. Les propriétaires s’en servent pour vérifier votre historique de crédit.' },
      riskReason: { en: 'Someone could use it to steal your identity, so never say it out loud.', fr: 'Quelqu’un pourrait s’en servir pour usurper votre identité : ne le dites jamais à voix haute.' },
    },
    {
      id: 'pw-status', order: 7, risk: 'none',
      plainQuestion: { en: 'Do you work right now?', fr: 'Travaillez-vous en ce moment ?' },
      explanation: { en: 'Are you employed, self-employed, a student, unemployed or retired? This helps the landlord understand your income.', fr: 'Êtes-vous salarié, à votre compte, étudiant, sans emploi ou retraité ? Cela aide le propriétaire à comprendre vos revenus.' },
    },
    {
      id: 'pw-employer', order: 8, risk: 'none', showIf: { fieldId: 'pw-status', oneOf: ['employed', 'self'] },
      plainQuestion: { en: 'Who do you work for?', fr: 'Pour qui travaillez-vous ?' },
      explanation: { en: 'The name of the company or person who pays you.', fr: 'Le nom de l’entreprise ou de la personne qui vous paie.' },
    },
    {
      id: 'pw-income', order: 9, risk: 'important', formatHint: 'whole number in USD',
      plainQuestion: { en: 'How much money do you get each month, before taxes?', fr: 'Combien d’argent recevez-vous chaque mois, avant impôts ?' },
      explanation: { en: '"Gross" means before taxes and deductions. If your pension is $2,000 before anything is taken out, the answer is 2000.', fr: '« Brut » veut dire avant impôts et retenues. Si votre retraite est de 2 000 $ avant retenues, la réponse est 2000.' },
      riskReason: { en: 'A wrong amount can get your application refused.', fr: 'Un montant faux peut faire refuser votre demande.' },
    },
    {
      id: 'pw-movein', order: 10, risk: 'important', formatHint: 'YYYY-MM-DD',
      plainQuestion: { en: 'When would you like to move in?', fr: 'Quand aimeriez-vous emménager ?' },
      explanation: { en: 'The first day you want to live in the apartment.', fr: 'Le premier jour où vous voulez habiter dans l’appartement.' },
      riskReason: { en: 'Rent may start on this date.', fr: 'Le loyer peut commencer à cette date.' },
    },
    {
      id: 'pw-pets', order: 11, risk: 'none',
      plainQuestion: { en: 'Do you have any pets?', fr: 'Avez-vous des animaux ?' },
      explanation: { en: 'Animals that will live with you. Some buildings have rules about pets.', fr: 'Les animaux qui vivront avec vous. Certains immeubles ont des règles sur les animaux.' },
    },
    {
      id: 'pw-pets-desc', order: 12, risk: 'none', showIf: { fieldId: 'pw-pets', oneOf: ['yes'] },
      plainQuestion: { en: 'What pets do you have?', fr: 'Quels animaux avez-vous ?' },
      explanation: { en: 'The kind and how many, like "one cat".', fr: 'Le type et combien, par exemple « un chat ».' },
    },
    {
      id: 'pw-cosigner', order: 13, risk: 'important',
      plainQuestion: { en: 'Will someone co-sign for you?', fr: 'Quelqu’un se porte-t-il garant pour vous ?' },
      explanation: { en: 'A co-signer is a person who promises to pay your rent if you cannot. Leave it empty if nobody.', fr: 'Un garant est une personne qui promet de payer votre loyer si vous ne pouvez pas. Laissez vide si personne.' },
      riskReason: { en: 'That person becomes responsible for your rent.', fr: 'Cette personne devient responsable de votre loyer.' },
    },
    {
      id: 'pw-credit', order: 14, risk: 'legal',
      plainQuestion: { en: 'Do you allow the landlord to check your credit?', fr: 'Autorisez-vous le propriétaire à vérifier votre crédit ?' },
      explanation: { en: 'The landlord will look at your history of paying bills and loans.', fr: 'Le propriétaire consultera votre historique de paiement de factures et de prêts.' },
      riskReason: { en: 'You give the landlord permission to see your credit report.', fr: 'Vous donnez au propriétaire le droit de voir votre dossier de crédit.' },
    },
    {
      id: 'pw-truth', order: 15, risk: 'legal',
      plainQuestion: { en: 'Do you confirm everything you said is true?', fr: 'Confirmez-vous que tout ce que vous avez dit est vrai ?' },
      explanation: { en: 'You promise the information is correct. False answers can cancel the lease.', fr: 'Vous promettez que les informations sont exactes. De fausses réponses peuvent annuler le bail.' },
      riskReason: { en: 'This is a legal statement.', fr: 'C’est une déclaration officielle.' },
    },
  ],
};

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

/** Text in both languages. */
type T = Record<Language, string>;

interface Step {
  /** Wait this long (ms, at speed 1) after the previous step. */
  after: number;
  make: (lang: Language) => AgentEvent;
}

function buildScript(): Step[] {
  const steps: Step[] = [];
  let pending = 0;

  const wait = (ms: number) => {
    pending += ms;
  };
  const emit = (make: Step['make']) => {
    steps.push({ after: pending, make });
    pending = 0;
  };
  const mode = (m: AgentMode) => emit(() => ({ type: 'agent_state', mode: m }));
  const transcript = (role: 'agent' | 'user', text: (lang: Language) => string, final: boolean) =>
    emit((lang) => ({ type: 'transcript', role, text: text(lang), final, at: Date.now() }));

  /** Agent speaks, then listens. Speech time grows with the text. */
  const agentSays = (t: T) => {
    wait(150);
    mode('speaking');
    transcript('agent', (l) => t[l], true);
    wait(Math.min(9000, 900 + Math.max(t.en.length, t.fr.length) * 45));
    mode('listening');
    wait(900);
  };

  /** User speaks: partial captions, then final, then the agent thinks. */
  const userSays = (t: T) => {
    for (const fraction of [0.35, 0.7]) {
      transcript('user', (l) => cut(t[l], fraction), false);
      wait(450);
    }
    transcript('user', (l) => t[l], true);
    wait(250);
    mode('thinking');
    wait(700);
  };

  const focus = (id: string) => {
    emit(() => ({ type: 'go_to_field', id }));
    emit(() => ({ type: 'scroll_to_field', id }));
  };
  const highlight = (id: string, status: FieldStatus) => emit(() => ({ type: 'highlight_field', id, status }));
  const fill = (id: string, value: string, display: T | string, confidence = 0.95) => {
    emit((l) => ({
      type: 'fill_field',
      id,
      value,
      displayValue: typeof display === 'string' ? display : display[l],
      confidence,
      source: 'agent',
    }));
    highlight(id, 'filled');
    wait(250);
  };
  const flag = (id: string, reason: T, value?: string, display?: T) => {
    emit((l) => ({ type: 'flag_for_review', id, reason: reason[l], value, displayValue: display?.[l] }));
    highlight(id, 'review');
  };

  // --- Intro + name (one question fills two fields) ---
  mode('connecting');
  wait(1200);
  focus('pw-first');
  agentSays({
    en: "Hi! I'll help you fill this rental application. It takes about 6 minutes, and you can stop me anytime to ask a question. Let's start: what is your full name?",
    fr: "Bonjour ! Je vais vous aider à remplir cette demande de location. Cela prend environ 6 minutes, et vous pouvez m'interrompre à tout moment pour poser une question. Commençons : quel est votre nom complet ?",
  });
  userSays({ en: 'Marie Dubois', fr: 'Marie Dubois' });
  fill('pw-first', 'Marie', 'Marie');
  fill('pw-last', 'Dubois', 'Dubois');

  // --- Date of birth (translated + formatted) ---
  focus('pw-dob');
  agentSays({ en: 'Thank you, Marie. When were you born?', fr: 'Merci, Marie. Quelle est votre date de naissance ?' });
  userSays({ en: 'March fourth, nineteen fifty-eight', fr: 'Le quatre mars mille neuf cent cinquante-huit' });
  fill('pw-dob', '1958-03-04', { en: 'March 4, 1958', fr: '4 mars 1958' });

  // --- Optional email → skipped ---
  focus('pw-email');
  agentSays({
    en: 'Would you like to give an email address? It is optional.',
    fr: 'Voulez-vous donner une adresse e-mail ? Ce n’est pas obligatoire.',
  });
  userSays({ en: 'No, thank you.', fr: 'Non, merci.' });
  highlight('pw-email', 'skipped');

  // --- Phone: unclear answer → amber → confirm ---
  focus('pw-phone');
  agentSays({ en: 'What phone number can the landlord call you on?', fr: 'À quel numéro le propriétaire peut-il vous appeler ?' });
  userSays({ en: 'Five five five… zero one… four two', fr: 'Cinq cinq cinq… zéro un… quarante-deux' });
  flag(
    'pw-phone',
    { en: "I'm not sure I heard every digit.", fr: 'Je ne suis pas sûr d’avoir entendu tous les chiffres.' },
    '555-0142',
    { en: '555-0142', fr: '555-0142' },
  );
  agentSays({
    en: 'I heard 5 5 5, 0 1 4 2. Is that right?',
    fr: 'J’ai entendu 5 5 5, 0 1 4 2. C’est bien ça ?',
  });
  userSays({ en: 'Yes, that’s right.', fr: 'Oui, c’est ça.' });
  fill('pw-phone', '555-0142', '555-0142', 0.98);

  // --- SSN: sensitive → the user types it ---
  focus('pw-ssn');
  emit((l) => ({
    type: 'request_typing',
    id: 'pw-ssn',
    reason: l === 'fr' ? 'Numéro sensible : tapez-le vous-même.' : 'Sensitive number: please type it yourself.',
  }));
  agentSays({
    en: 'Next is your Social Security Number. For your safety, please don’t say it out loud. Type it yourself in the highlighted box, and tell me when you are done.',
    fr: 'Ensuite, votre numéro de sécurité sociale. Pour votre sécurité, ne le dites pas à voix haute. Tapez-le vous-même dans la case en surbrillance, puis dites-moi quand c’est fait.',
  });
  wait(3500);
  // Sensitive: the value never leaves the page. We only learn that it is filled.
  highlight('pw-ssn', 'filled');
  userSays({ en: 'Okay, done.', fr: 'Voilà, c’est fait.' });

  // --- Employment → employer skipped by condition ---
  focus('pw-status');
  agentSays({
    en: 'Now about work. Are you employed, self-employed, a student, unemployed, or retired?',
    fr: 'Parlons du travail. Êtes-vous salariée, à votre compte, étudiante, sans emploi ou à la retraite ?',
  });
  userSays({ en: "I'm retired.", fr: 'Je suis à la retraite.' });
  fill('pw-status', 'retired', { en: 'Retired', fr: 'Retraitée' });
  highlight('pw-employer', 'skipped');

  // --- Income: the user interrupts to ask what "gross" means ---
  focus('pw-income');
  wait(150);
  mode('speaking');
  transcript('agent', (l) => (l === 'fr' ? 'Quel est votre revenu mensuel brut, c’est-à-dire…' : 'What is your gross monthly income, meaning…'), true);
  wait(1600);
  mode('listening');
  userSays({ en: 'Wait, what does "gross" mean?', fr: 'Attendez, ça veut dire quoi « brut » ?' });
  emit((l) => ({ type: 'explain_field', id: 'pw-income', explanation: explanationOf('pw-income')[l] }));
  agentSays({
    en: 'Good question. "Gross" means before taxes and anything else is taken out. For example, if your pension is 2,000 dollars before deductions, you say 2,000. So, how much do you get each month before taxes?',
    fr: 'Bonne question. « Brut » veut dire avant les impôts et les autres retenues. Par exemple, si votre retraite est de 2 000 dollars avant retenues, vous dites 2 000. Alors, combien recevez-vous par mois avant impôts ?',
  });
  userSays({ en: 'About eighteen hundred.', fr: 'Environ mille huit cents.' });
  fill('pw-income', '1800', { en: '$1,800', fr: '1 800 $' }, 0.82);

  // --- Move-in date ---
  focus('pw-movein');
  agentSays({ en: 'When would you like to move in?', fr: 'Quand aimeriez-vous emménager ?' });
  userSays({ en: 'The first of December.', fr: 'Le premier décembre.' });
  fill('pw-movein', '2026-12-01', { en: 'December 1, 2026', fr: '1er décembre 2026' });

  // --- Pets: one answer fills a radio + the conditional textarea ---
  focus('pw-pets');
  agentSays({ en: 'Do you have any pets?', fr: 'Avez-vous des animaux ?' });
  userSays({ en: 'Yes, one cat.', fr: 'Oui, un chat.' });
  fill('pw-pets', 'yes', { en: 'Yes', fr: 'Oui' });
  fill('pw-pets-desc', 'One cat', { en: 'One cat', fr: 'Un chat' });

  // --- Co-signer, explained up front ---
  focus('pw-cosigner');
  agentSays({
    en: 'Will someone co-sign for you? That is a person who promises to pay your rent if you cannot.',
    fr: 'Quelqu’un se porte-t-il garant pour vous ? C’est une personne qui promet de payer votre loyer si vous ne pouvez pas.',
  });
  userSays({ en: 'No, nobody.', fr: 'Non, personne.' });
  highlight('pw-cosigner', 'skipped');

  // --- Legal checkboxes: slow down, confirm ---
  focus('pw-credit');
  flag('pw-credit', { en: 'Legal: you give permission to check your credit.', fr: 'Juridique : vous autorisez la vérification de votre crédit.' });
  agentSays({
    en: 'This one is important. By checking this box, you allow the landlord to look at your credit history and check what you told them. Is that okay?',
    fr: 'Celle-ci est importante. En cochant cette case, vous autorisez le propriétaire à consulter votre historique de crédit et à vérifier vos réponses. Êtes-vous d’accord ?',
  });
  userSays({ en: 'Yes, that’s fine.', fr: 'Oui, ça me va.' });
  fill('pw-credit', 'true', { en: 'Yes, I allow it', fr: 'Oui, j’autorise' }, 1);

  focus('pw-truth');
  agentSays({
    en: 'Last one: you confirm that everything you said is true. Do you confirm?',
    fr: 'Dernière question : vous confirmez que tout ce que vous avez dit est vrai. Vous confirmez ?',
  });
  userSays({ en: 'Yes, I confirm.', fr: 'Oui, je confirme.' });
  fill('pw-truth', 'true', { en: 'Yes, I confirm', fr: 'Oui, je confirme' }, 1);

  // --- Review: read back each section, slow down on the legal one ---
  agentSays({
    en: 'Thank you. Before you submit, I will read everything back, one part at a time. Stop me if something is wrong.',
    fr: 'Merci. Avant d’envoyer, je vais tout relire, partie par partie. Arrêtez-moi si quelque chose ne va pas.',
  });
  const sections = SOURCE.sections;
  emit(() => ({ type: 'review_started', sectionIds: sections.map((s) => s.id) }));
  const readBack: Record<string, T> = {
    s1: {
      en: 'Your name is Marie Dubois, born March 4, 1958. No email. Phone 555-0142. You typed your Social Security Number yourself.',
      fr: 'Vous vous appelez Marie Dubois, née le 4 mars 1958. Pas d’e-mail. Téléphone 555-0142. Vous avez tapé vous-même votre numéro de sécurité sociale.',
    },
    s2: {
      en: 'You are retired, with a gross monthly income of 1,800 dollars.',
      fr: 'Vous êtes à la retraite, avec un revenu mensuel brut de 1 800 dollars.',
    },
    s3: {
      en: 'You would like to move in on December 1, 2026, with one cat. No co-signer.',
      fr: 'Vous souhaitez emménager le 1er décembre 2026, avec un chat. Pas de garant.',
    },
    s4: {
      en: 'Last part, and it matters. One: you allow the landlord to check your credit. Two: you confirm everything you said is true. Is all of that correct?',
      fr: 'Dernière partie, elle est importante. Un : vous autorisez le propriétaire à vérifier votre crédit. Deux : vous confirmez que tout est vrai. Tout est correct ?',
    },
  };
  sections.forEach((section, i) => {
    emit((l) => ({
      type: 'review_section',
      sectionId: section.id,
      sectionTitle: section.title[l],
      position: i + 1,
      total: sections.length,
    }));
    emit(() => ({ type: 'scroll_to_field', id: section.fieldIds[0]! }));
    agentSays(readBack[section.id]!);
  });
  userSays({ en: 'Yes, all good.', fr: 'Oui, tout est bon.' });

  // --- Wrap up. The user submits, never the agent. ---
  agentSays({
    en: 'That’s everything! Please look over the form, then press Submit yourself when you are ready.',
    fr: 'C’est terminé ! Relisez le formulaire, puis appuyez vous-même sur Envoyer quand vous êtes prête.',
  });

  return steps;
}

/**
 * The mock map in one language. readySections: how many sections are ready (streaming);
 * fields of sections not ready yet carry the page label as a stand-in question.
 */
export function mockFormMap(lang: Language, readySections = SOURCE.sections.length): FormMap {
  const ready = new Set(SOURCE.sections.slice(0, readySections).flatMap((s) => s.fieldIds));
  const complete = readySections >= SOURCE.sections.length;
  return {
    language: lang,
    title: complete ? SOURCE.title[lang] : 'Rental Application – Maple Street Apartments',
    summary: complete ? SOURCE.summary[lang] : '',
    estimatedMinutes: SOURCE.estimatedMinutes,
    formLanguage: SOURCE.formLanguage,
    sections: SOURCE.sections.map((s, i) => ({ id: s.id, title: s.title[lang], fieldIds: s.fieldIds, ready: i < readySections })),
    groups: SOURCE.groups.map((g) => ({ id: g.id, plainQuestion: g.plainQuestion[lang], fieldIds: g.fieldIds })),
    fields: SOURCE.fields.map(({ explanation: _explanation, ...f }) => ({
      ...f,
      plainQuestion: ready.has(f.id) ? f.plainQuestion[lang] : f.plainQuestion.en,
      riskReason: f.riskReason?.[lang],
    })),
    complete,
  };
}

function explanationOf(id: string): LocalizedText {
  return SOURCE.fields.find((f) => f.id === id)?.explanation ?? { en: '', fr: '' };
}

/** First part of a sentence, cut on a word boundary. */
function cut(text: string, fraction: number): string {
  const words = text.split(' ');
  return words.slice(0, Math.max(1, Math.round(words.length * fraction))).join(' ');
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

export function createMockPlayer(options: MockPlayerOptions = {}): MockPlayer {
  const speed = options.speed && options.speed > 0 ? options.speed : 1;
  const script = buildScript();
  const listeners = new Set<(event: AgentEvent) => void>();

  let language: Language = options.language ?? 'en';
  let index = 0;
  let running = false;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let statuses = new Map<string, FieldStatus>();
  let lastDone = new Map<string, number>();
  let lastPartial = '';

  const emit = (event: AgentEvent) => {
    for (const l of listeners) {
      try {
        l(event);
      } catch (err) {
        console.error('[mock-player] listener error', err);
      }
    }
    trackProgress(event);
  };

  /** Emit section_progress whenever a section's done count changes. */
  const trackProgress = (event: AgentEvent) => {
    let status: FieldStatus | undefined;
    if (event.type === 'fill_field') status = 'filled';
    else if (event.type === 'flag_for_review') status = 'review';
    else if (event.type === 'request_typing') status = 'needs_typing';
    else if (event.type === 'highlight_field') status = event.status;
    if (!status || !('id' in event)) return;

    statuses.set(event.id, status);
    const section = SOURCE.sections.find((s) => s.fieldIds.includes(event.id));
    if (!section) return;

    const isDone = (id: string) => ['filled', 'skipped'].includes(statuses.get(id) ?? '');
    const done = section.fieldIds.filter(isDone).length;
    if ((lastDone.get(section.id) ?? 0) === done) return;
    lastDone.set(section.id, done);

    emit({
      type: 'section_progress',
      sectionId: section.id,
      sectionTitle: section.title[language],
      done,
      total: section.fieldIds.length,
      formDone: SOURCE.fields.filter((f) => isDone(f.id)).length,
      formTotal: SOURCE.fields.length,
    });
  };

  const scheduleNext = () => {
    if (!running || destroyed) return;
    if (index >= script.length) {
      if (!options.loop) {
        running = false;
        return;
      }
      reset();
      timer = setTimeout(() => {
        emitFormDetected();
        running = true;
        scheduleNext();
      }, 3000 / speed);
      return;
    }
    const step = script[index]!;
    timer = setTimeout(() => {
      index++;
      const event = step.make(language);
      // Short answers make identical partial captions: send each one once.
      const isRepeat = event.type === 'transcript' && !event.final && event.text === lastPartial;
      if (event.type === 'transcript') lastPartial = event.final ? '' : event.text;
      if (!isRepeat) emit(event);
      scheduleNext();
    }, step.after / speed);
  };

  const reset = () => {
    clearTimeout(timer);
    index = 0;
    statuses = new Map();
    lastDone = new Map();
  };

  // Like the real backend: the map arrives in stages (skeleton → one section at a time → title).
  let mapTimers: ReturnType<typeof setTimeout>[] = [];
  const streamMap = (lang: Language) => {
    mapTimers.forEach(clearTimeout);
    mapTimers = SOURCE.sections.map((section, i) =>
      setTimeout(
        () => emit({ type: 'form_map_updated', map: mockFormMap(lang, i + 1), readySectionId: section.id }),
        ((i + 1) * 350) / speed,
      ),
    );
  };
  const emitFormDetected = () => {
    emit({
      type: 'form_detected',
      url: 'http://localhost:8787/test/rental.html',
      pageTitle: 'Rental Application – Maple Street Apartments',
      fieldCount: SOURCE.fields.length,
      map: mockFormMap(language, 0),
    });
    streamMap(language);
  };

  const start = () => {
    if (running || destroyed) return;
    if (index >= script.length) reset(); // finished before: play again
    running = true;
    scheduleNext();
  };

  // Like the real extension: the form is detected before the user presses start.
  timer = setTimeout(() => {
    emitFormDetected();
    if (options.autoStart) start();
  }, 300 / speed);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(event) {
      if (destroyed) return;
      switch (event.type) {
        case 'start':
          start();
          break;
        case 'end':
          running = false;
          reset();
          emit({ type: 'agent_state', mode: 'off' });
          break;
        case 'language_selected':
          // Captions switch from the next line on; the map is rebuilt in the new language.
          language = event.language;
          streamMap(language);
          break;
        case 'user_text':
          // The scripted session doesn't react to it; show it like a spoken answer.
          emit({ type: 'transcript', role: 'user', text: event.text, final: true, at: Date.now() });
          break;
        case 'user_edited_field':
          if (!event.sensitive) {
            emit({ type: 'fill_field', id: event.id, value: event.value, displayValue: event.value, confidence: 1, source: 'user' });
          }
          emit({ type: 'highlight_field', id: event.id, status: event.filled ? 'filled' : 'empty' });
          break;
      }
    },
    destroy() {
      destroyed = true;
      running = false;
      clearTimeout(timer);
      mapTimers.forEach(clearTimeout);
      listeners.clear();
    },
  };
}
