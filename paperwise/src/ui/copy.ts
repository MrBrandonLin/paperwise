/**
 * Every word the panel shows, in the user's language. The teammate's design was English-only;
 * the panel speaks English, Spanish, French and Arabic. Other conversation languages show the
 * English panel while the conversation itself stays in the user's language (copyFor).
 */
import type { Language } from '@/shared/contract';

export interface Copy {
  appName: string;
  demoBadge: string;
  settings: string;
  closeSettings: string;
  closePanel: string;
  preferences: string;
  largerText: string;
  textSize: string;
  textSizes: Record<'normal' | 'large' | 'xl', string>;
  speed: string;
  speeds: Record<'normal' | 'slower', string>;
  speedNote: string;
  typingOnly: string;
  language: string;
  languageNote: string;
  connected: string;
  complete: (done: number, total: number) => string;
  reading: string;
  preparing: string;
  connecting: string;
  intro: (title: string, minutes: number) => string;
  paused: string;
  allAnswered: string;
  fieldLabel: (n: number, label: string) => string;
  readingBack: (position: number, total: number) => string;
  readyToReview: string;
  start: string;
  startTyping: string;
  startAgain: string;
  end: string;
  micOn: string;
  micOff: string;
  typingMode: string;
  quiet: string;
  voiceLevel: string;
  loud: string;
  youSaid: string;
  conversation: string;
  agentName: string;
  you: string;
  typePlaceholder: string;
  typeLabel: string;
  send: string;
  typeIt: string;
  typingHelp: string;
  typedDone: string;
  checkThis: string;
  iHeard: string;
  legal: string;
  important: string;
  whatItMeans: string;
  typedOnPage: string;
  notAnswered: string;
  skipped: string;
  checked: string;
  notChecked: string;
  inTheForm: string;
  neverSubmit: string;
  thinking: string;
  states: Record<'off' | 'connecting' | 'listening' | 'thinking' | 'speaking', string>;
  /** Sent to the agent by the "explain" and "repeat" shortcuts, in the user's language. */
  explainRequest: string;
  repeatRequest: string;
  explain: string;
  repeat: string;
  help: string;
  closeHelp: string;
  helpIntro: string;
  shortcutsTitle: string;
  shortcuts: Record<'start' | 'explain' | 'repeat' | 'type' | 'help' | 'close', string>;
  doneTitle: string;
  doneText: string;
  donePdf: string;
  downloadPdf: string;
  problems: {
    mic: string;
    micAction: string;
    lost: string;
    lostFailed: string;
    startFailed: string;
    noCredits: string;
    retry: string;
  };
  announce: {
    filled: (label: string) => string;
    review: (label: string) => string;
    typing: (label: string) => string;
    skipped: (label: string) => string;
  };
  onboarding: {
    skip: string;
    next: string;
    back: string;
    step: (n: number, total: number) => string;
    welcomeTitle: string;
    welcomeText: string;
    chooseLanguage: string;
    privacyTitle: string;
    privacy: string[];
    micTitle: string;
    micText: string;
    allowMic: string;
    typeInstead: string;
  };
  micBlocked: string;
  notices: Record<'unsupported' | 'unreachable' | 'noForm' | 'offline', string>;
}

const en: Copy = {
  appName: 'Paperwise',
  demoBadge: 'Beta',
  settings: 'Settings',
  closeSettings: 'Close settings',
  closePanel: 'Close Paperwise',
  preferences: 'Preferences',
  largerText: 'Larger text',
  textSize: 'Text size',
  textSizes: { normal: 'Normal', large: 'Large', xl: 'Extra large' },
  speed: 'Speaking speed',
  speeds: { normal: 'Normal', slower: 'Slower' },
  speedNote: 'Changes right away: Paperwise reconnects and continues.',
  typingOnly: 'Typing only (no microphone)',
  language: 'Language',
  languageNote: 'You can switch at any time, even in the middle of a conversation. You can also just ask: “Can we speak Spanish?”',
  connected: 'Connected to this form',
  complete: (d, t) => `${d}/${t} complete`,
  reading: 'Reading this form…',
  preparing: 'Preparing the questions…',
  connecting: 'Connecting…',
  intro: (title, minutes) => `Hi, I’m Paperwise. This is “${title}”. It takes about ${minutes} minutes. Press Start and answer in your own words — you can ask me what anything means.`,
  paused: 'Paused. Press Continue to pick up where we left off.',
  allAnswered: 'Every question is answered. Look over the page, then press Submit yourself.',
  fieldLabel: (n, label) => `Field ${n} · ${label}`,
  readingBack: (p, t) => `Reading back · ${p} of ${t}`,
  readyToReview: 'Ready to review',
  start: 'Start talking',
  startTyping: 'Start by typing',
  startAgain: 'Continue',
  end: 'End',
  micOn: 'Microphone on',
  micOff: 'Microphone off',
  typingMode: 'Typing only',
  quiet: 'Quiet',
  voiceLevel: 'Voice level',
  loud: 'Loud',
  youSaid: 'What you said',
  conversation: 'Conversation',
  agentName: 'Paperwise',
  you: 'You',
  typePlaceholder: 'Type an answer or a question…',
  typeLabel: 'Type to Paperwise',
  send: 'Send',
  typeIt: 'Please type this yourself',
  typingHelp: 'Type it in the highlighted box on the page. Paperwise never hears or sees it.',
  typedDone: 'Typed. Paperwise did not see it.',
  checkThis: 'Let’s check this one',
  iHeard: 'I heard',
  legal: 'Before you agree',
  important: 'Worth double-checking',
  whatItMeans: 'What it means',
  typedOnPage: 'Typed on the page (hidden)',
  notAnswered: 'Not answered yet',
  skipped: 'Skipped',
  checked: 'Checked',
  notChecked: 'Not checked',
  inTheForm: 'In the form',
  neverSubmit: 'Paperwise never submits. You press Submit yourself.',
  thinking: 'Paperwise is thinking…',
  states: { off: 'Ready', connecting: 'Connecting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' },
  explainRequest: 'What does this question mean?',
  repeatRequest: 'Can you repeat that, please?',
  explain: 'Explain this',
  repeat: 'Repeat',
  help: 'Help',
  closeHelp: 'Close help',
  helpIntro: 'Talk or type, in your language. Ask “what does this mean?”, “why do they need this?” or “is it safe?” at any time. To change an answer, just say so, or type on the page.',
  shortcutsTitle: 'Keyboard shortcuts',
  shortcuts: { start: 'Start or end the conversation', explain: 'Explain the current question', repeat: 'Repeat the last question', type: 'Type an answer', help: 'Show or hide this help', close: 'Close help or settings' },
  doneTitle: 'All done!',
  doneText: 'Every question is answered. Look over the page, and press Submit yourself when you’re ready.',
  donePdf: 'Download your filled PDF, check it, then send it yourself.',
  downloadPdf: 'Download filled PDF',
  problems: {
    mic: 'Paperwise can’t hear you: the microphone isn’t allowed yet. Allow it in the tab that opened, or type instead.',
    micAction: 'Type instead',
    lost: 'The connection dropped. Reconnecting…',
    lostFailed: 'The connection dropped. Press Continue: nothing is lost.',
    startFailed: 'Paperwise couldn’t start the conversation. Check your internet connection and try again.',
    noCredits: 'The voice service (ElevenLabs) has run out of credits, so Paperwise can’t talk or answer right now. Add credits to the ElevenLabs account, then press Try again.',
    retry: 'Try again',
  },
  announce: {
    filled: (l) => `Filled: ${l}`,
    review: (l) => `Needs checking: ${l}`,
    typing: (l) => `Please type it yourself: ${l}`,
    skipped: (l) => `Skipped: ${l}`,
  },
  onboarding: {
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    step: (n, t) => `Step ${n} of ${t}`,
    welcomeTitle: 'Hi, I’m Paperwise',
    welcomeText: 'I fill in forms with you, by talking or typing, in your language. I explain anything you ask, and I fill the real form as we go.',
    chooseLanguage: 'Which language do you want to use?',
    privacyTitle: 'Your information stays yours',
    privacy: ['Private numbers, like a Social Security number, are typed by you. I never hear them.', 'Nothing you tell me is saved.', 'I never press Submit. You always do.'],
    micTitle: 'Your microphone',
    micText: 'To hear you, I need your microphone. Chrome will ask you once, in a new tab. You can also type everything instead.',
    allowMic: 'Allow the microphone',
    typeInstead: 'I’ll type instead',
  },
  micBlocked: 'Allow the microphone in the tab that opened, then press Start again.',
  notices: {
    unsupported: 'Paperwise can’t work on this page. Open the page with your form, then open Paperwise again.',
    unreachable: 'Paperwise couldn’t connect to this page. Reload the page and try again.',
    noForm: 'I don’t see a form on this page. Open the page with the form, then open Paperwise again.',
    offline: 'Paperwise can’t reach its server right now. Check your internet connection, then press Try again.',
  },
};

const es: Copy = {
  appName: 'Paperwise',
  demoBadge: 'Beta',
  settings: 'Ajustes',
  closeSettings: 'Cerrar ajustes',
  closePanel: 'Cerrar Paperwise',
  preferences: 'Preferencias',
  largerText: 'Texto más grande',
  textSize: 'Tamaño del texto',
  textSizes: { normal: 'Normal', large: 'Grande', xl: 'Muy grande' },
  speed: 'Velocidad de la voz',
  speeds: { normal: 'Normal', slower: 'Más despacio' },
  speedNote: 'Cambia al instante: Paperwise se reconecta y continúa.',
  typingOnly: 'Solo escribir (sin micrófono)',
  language: 'Idioma',
  languageNote: 'Puede cambiar cuando quiera, incluso en medio de la conversación. También puede pedirlo: «¿Podemos hablar en inglés?»',
  connected: 'Conectado a este formulario',
  complete: (d, t) => `${d}/${t} completado${d === 1 ? '' : 's'}`,
  reading: 'Leyendo este formulario…',
  preparing: 'Preparando las preguntas…',
  connecting: 'Conectando…',
  intro: (title, minutes) => `Hola, soy Paperwise. Este es «${title}». Toma unos ${minutes} minutos. Pulse Empezar y responda con sus propias palabras; puede preguntarme qué significa cualquier cosa.`,
  paused: 'En pausa. Pulse Continuar para seguir donde lo dejamos.',
  allAnswered: 'Todas las preguntas tienen respuesta. Revise la página y luego pulse Enviar usted mismo.',
  fieldLabel: (n, label) => `Campo ${n} · ${label}`,
  readingBack: (p, t) => `Repaso · ${p} de ${t}`,
  readyToReview: 'Listo para revisar',
  start: 'Empezar a hablar',
  startTyping: 'Empezar escribiendo',
  startAgain: 'Continuar',
  end: 'Terminar',
  micOn: 'Micrófono encendido',
  micOff: 'Micrófono apagado',
  typingMode: 'Solo escribir',
  quiet: 'Bajo',
  voiceLevel: 'Nivel de voz',
  loud: 'Alto',
  youSaid: 'Lo que usted dijo',
  conversation: 'Conversación',
  agentName: 'Paperwise',
  you: 'Usted',
  typePlaceholder: 'Escriba una respuesta o una pregunta…',
  typeLabel: 'Escribir a Paperwise',
  send: 'Enviar',
  typeIt: 'Escríbalo usted mismo',
  typingHelp: 'Escríbalo en la casilla resaltada de la página. Paperwise nunca lo oye ni lo ve.',
  typedDone: 'Escrito. Paperwise no lo vio.',
  checkThis: 'Revisemos este',
  iHeard: 'Entendí',
  legal: 'Antes de aceptar',
  important: 'Vale la pena revisarlo',
  whatItMeans: 'Qué significa',
  typedOnPage: 'Escrito en la página (oculto)',
  notAnswered: 'Sin responder',
  skipped: 'Omitido',
  checked: 'Marcado',
  notChecked: 'Sin marcar',
  inTheForm: 'En el formulario',
  neverSubmit: 'Paperwise nunca envía el formulario. Usted pulsa Enviar.',
  thinking: 'Paperwise está pensando…',
  states: { off: 'Listo', connecting: 'Conectando', listening: 'Escuchando', thinking: 'Pensando', speaking: 'Hablando' },
  explainRequest: '¿Qué significa esta pregunta?',
  repeatRequest: '¿Puede repetirlo, por favor?',
  explain: 'Explicar',
  repeat: 'Repetir',
  help: 'Ayuda',
  closeHelp: 'Cerrar la ayuda',
  helpIntro: 'Hable o escriba, en su idioma. Pregunte «¿qué significa esto?», «¿por qué lo necesitan?» o «¿es seguro?» cuando quiera. Para cambiar una respuesta, dígalo o escriba en la página.',
  shortcutsTitle: 'Atajos de teclado',
  shortcuts: { start: 'Empezar o terminar la conversación', explain: 'Explicar la pregunta actual', repeat: 'Repetir la última pregunta', type: 'Escribir una respuesta', help: 'Mostrar u ocultar esta ayuda', close: 'Cerrar la ayuda o los ajustes' },
  doneTitle: '¡Listo!',
  doneText: 'Todas las preguntas tienen respuesta. Revise la página y pulse Enviar usted mismo cuando esté listo.',
  donePdf: 'Descargue su PDF lleno, revíselo y envíelo usted mismo.',
  downloadPdf: 'Descargar el PDF lleno',
  problems: {
    mic: 'Paperwise no puede oírle: el micrófono aún no está permitido. Permítalo en la pestaña que se abrió, o escriba.',
    micAction: 'Escribir en su lugar',
    lost: 'Se perdió la conexión. Reconectando…',
    lostFailed: 'Se perdió la conexión. Pulse Continuar: no se pierde nada.',
    startFailed: 'Paperwise no pudo empezar la conversación. Revise su conexión a internet e inténtelo de nuevo.',
    noCredits: 'El servicio de voz (ElevenLabs) se quedó sin créditos, así que Paperwise no puede hablar ni responder ahora. Añada créditos a la cuenta de ElevenLabs y pulse Reintentar.',
    retry: 'Reintentar',
  },
  announce: {
    filled: (l) => `Completado: ${l}`,
    review: (l) => `Hay que revisar: ${l}`,
    typing: (l) => `Escríbalo usted mismo: ${l}`,
    skipped: (l) => `Omitido: ${l}`,
  },
  onboarding: {
    skip: 'Omitir',
    next: 'Siguiente',
    back: 'Atrás',
    step: (n, t) => `Paso ${n} de ${t}`,
    welcomeTitle: 'Hola, soy Paperwise',
    welcomeText: 'Lleno formularios con usted, hablando o escribiendo, en su idioma. Le explico lo que pregunte y lleno el formulario real mientras avanzamos.',
    chooseLanguage: '¿Qué idioma quiere usar?',
    privacyTitle: 'Su información es suya',
    privacy: ['Los números privados, como el de Seguro Social, los escribe usted. Yo nunca los escucho.', 'No se guarda nada de lo que me dice.', 'Nunca pulso Enviar. Siempre lo hace usted.'],
    micTitle: 'Su micrófono',
    micText: 'Para oírle necesito su micrófono. Chrome se lo pedirá una vez, en una pestaña nueva. También puede escribirlo todo.',
    allowMic: 'Permitir el micrófono',
    typeInstead: 'Prefiero escribir',
  },
  micBlocked: 'Permita el micrófono en la pestaña que se abrió y pulse Empezar otra vez.',
  notices: {
    unsupported: 'Paperwise no puede funcionar en esta página. Abra la página de su formulario y vuelva a abrir Paperwise.',
    unreachable: 'Paperwise no pudo conectarse a esta página. Recárguela e inténtelo de nuevo.',
    noForm: 'No veo un formulario en esta página. Abra la página del formulario y vuelva a abrir Paperwise.',
    offline: 'Paperwise no puede conectarse con su servidor ahora. Revise su conexión a internet y pulse Reintentar.',
  },
};

const fr: Copy = {
  appName: 'Paperwise',
  demoBadge: 'Bêta',
  settings: 'Réglages',
  closeSettings: 'Fermer les réglages',
  closePanel: 'Fermer Paperwise',
  preferences: 'Préférences',
  largerText: 'Texte plus grand',
  textSize: 'Taille du texte',
  textSizes: { normal: 'Normale', large: 'Grande', xl: 'Très grande' },
  speed: 'Vitesse de la voix',
  speeds: { normal: 'Normale', slower: 'Plus lente' },
  speedNote: 'Change tout de suite : Paperwise se reconnecte et continue.',
  typingOnly: 'Écrire seulement (sans micro)',
  language: 'Langue',
  languageNote: 'Vous pouvez changer à tout moment, même en pleine conversation. Vous pouvez aussi demander : « On peut parler en espagnol ? »',
  connected: 'Connecté à ce formulaire',
  complete: (d, t) => `${d}/${t} rempli${d > 1 ? 's' : ''}`,
  reading: 'Je lis ce formulaire…',
  preparing: 'Je prépare les questions…',
  connecting: 'Connexion…',
  intro: (title, minutes) => `Bonjour, je suis Paperwise. Voici « ${title} ». Cela prend environ ${minutes} minutes. Appuyez sur Commencer et répondez avec vos mots — vous pouvez me demander ce que veut dire un mot.`,
  paused: 'En pause. Appuyez sur Continuer pour reprendre.',
  allAnswered: 'Toutes les questions ont une réponse. Relisez la page, puis appuyez vous-même sur Envoyer.',
  fieldLabel: (n, label) => `Champ ${n} · ${label}`,
  readingBack: (p, t) => `Relecture · ${p} sur ${t}`,
  readyToReview: 'Prêt à relire',
  start: 'Commencer',
  startTyping: 'Commencer en écrivant',
  startAgain: 'Continuer',
  end: 'Terminer',
  micOn: 'Micro allumé',
  micOff: 'Micro éteint',
  typingMode: 'Écrire seulement',
  quiet: 'Calme',
  voiceLevel: 'Niveau de voix',
  loud: 'Fort',
  youSaid: 'Ce que vous avez dit',
  conversation: 'Conversation',
  agentName: 'Paperwise',
  you: 'Vous',
  typePlaceholder: 'Écrivez une réponse ou une question…',
  typeLabel: 'Écrire à Paperwise',
  send: 'Envoyer',
  typeIt: 'Tapez-le vous-même',
  typingHelp: 'Tapez-le dans la case en surbrillance sur la page. Paperwise ne l’entend pas et ne le voit pas.',
  typedDone: 'C’est tapé. Paperwise ne l’a pas vu.',
  checkThis: 'Vérifions celui-ci',
  iHeard: 'J’ai entendu',
  legal: 'Avant d’accepter',
  important: 'À bien vérifier',
  whatItMeans: 'Ce que ça veut dire',
  typedOnPage: 'Tapé sur la page (caché)',
  notAnswered: 'Pas encore répondu',
  skipped: 'Passé',
  checked: 'Coché',
  notChecked: 'Non coché',
  inTheForm: 'Dans le formulaire',
  neverSubmit: 'Paperwise n’envoie jamais le formulaire. C’est vous qui appuyez sur Envoyer.',
  thinking: 'Paperwise réfléchit…',
  states: { off: 'Prêt', connecting: 'Connexion', listening: 'J’écoute', thinking: 'Je réfléchis', speaking: 'Je parle' },
  explainRequest: 'Qu’est-ce que cette question veut dire ?',
  repeatRequest: 'Vous pouvez répéter, s’il vous plaît ?',
  explain: 'Expliquer',
  repeat: 'Répéter',
  help: 'Aide',
  closeHelp: 'Fermer l’aide',
  helpIntro: 'Parlez ou écrivez, dans votre langue. Demandez « ça veut dire quoi ? », « pourquoi ils en ont besoin ? » ou « c’est sûr ? » quand vous voulez. Pour changer une réponse, dites-le, ou tapez sur la page.',
  shortcutsTitle: 'Raccourcis clavier',
  shortcuts: { start: 'Commencer ou terminer la conversation', explain: 'Expliquer la question en cours', repeat: 'Répéter la dernière question', type: 'Écrire une réponse', help: 'Afficher ou masquer cette aide', close: 'Fermer l’aide ou les réglages' },
  doneTitle: 'C’est fini !',
  doneText: 'Toutes les questions ont une réponse. Relisez la page, et appuyez vous-même sur Envoyer quand vous êtes prêt.',
  donePdf: 'Téléchargez votre PDF rempli, vérifiez-le, puis envoyez-le vous-même.',
  downloadPdf: 'Télécharger le PDF rempli',
  problems: {
    mic: 'Paperwise ne vous entend pas : le micro n’est pas encore autorisé. Autorisez-le dans l’onglet qui s’est ouvert, ou écrivez.',
    micAction: 'Écrire à la place',
    lost: 'La connexion a coupé. Reconnexion…',
    lostFailed: 'La connexion a coupé. Appuyez sur Continuer : rien n’est perdu.',
    startFailed: 'Paperwise n’a pas pu démarrer la conversation. Vérifiez votre connexion internet et réessayez.',
    noCredits: 'Le service vocal (ElevenLabs) n’a plus de crédits : Paperwise ne peut pas parler ni répondre pour le moment. Ajoutez des crédits au compte ElevenLabs, puis appuyez sur Réessayer.',
    retry: 'Réessayer',
  },
  announce: {
    filled: (l) => `Rempli : ${l}`,
    review: (l) => `À vérifier : ${l}`,
    typing: (l) => `Tapez-le vous-même : ${l}`,
    skipped: (l) => `Passé : ${l}`,
  },
  onboarding: {
    skip: 'Passer',
    next: 'Suivant',
    back: 'Retour',
    step: (n, t) => `Étape ${n} sur ${t}`,
    welcomeTitle: 'Bonjour, je suis Paperwise',
    welcomeText: 'Je remplis les formulaires avec vous, en parlant ou en écrivant, dans votre langue. Je vous explique tout ce que vous demandez, et je remplis le vrai formulaire au fur et à mesure.',
    chooseLanguage: 'Dans quelle langue voulez-vous parler ?',
    privacyTitle: 'Vos informations restent à vous',
    privacy: ['Les numéros privés, comme un numéro de sécurité sociale, c’est vous qui les tapez. Je ne les entends jamais.', 'Rien de ce que vous me dites n’est enregistré.', 'Je n’appuie jamais sur Envoyer. C’est toujours vous.'],
    micTitle: 'Votre micro',
    micText: 'Pour vous entendre, j’ai besoin de votre micro. Chrome vous le demandera une fois, dans un nouvel onglet. Vous pouvez aussi tout écrire.',
    allowMic: 'Autoriser le micro',
    typeInstead: 'Je préfère écrire',
  },
  micBlocked: 'Autorisez le micro dans l’onglet qui s’est ouvert, puis appuyez à nouveau sur Commencer.',
  notices: {
    unsupported: 'Paperwise ne peut pas fonctionner sur cette page. Ouvrez la page de votre formulaire, puis rouvrez Paperwise.',
    unreachable: 'Paperwise n’arrive pas à se connecter à cette page. Rechargez la page et réessayez.',
    noForm: 'Je ne vois pas de formulaire sur cette page. Ouvrez la page du formulaire, puis rouvrez Paperwise.',
    offline: 'Paperwise n’arrive pas à joindre son serveur. Vérifiez votre connexion internet, puis appuyez sur Réessayer.',
  },
};

const ar: Copy = {
  appName: 'Paperwise',
  demoBadge: 'تجريبي',
  settings: 'الإعدادات',
  closeSettings: 'إغلاق الإعدادات',
  closePanel: 'إغلاق Paperwise',
  preferences: 'التفضيلات',
  largerText: 'نص أكبر',
  textSize: 'حجم النص',
  textSizes: { normal: 'عادي', large: 'كبير', xl: 'كبير جدًا' },
  speed: 'سرعة الكلام',
  speeds: { normal: 'عادية', slower: 'أبطأ' },
  speedNote: 'يتغير فورًا: يعيد Paperwise الاتصال ويكمل.',
  typingOnly: 'الكتابة فقط (بدون ميكروفون)',
  language: 'اللغة',
  languageNote: 'يمكنك التغيير في أي وقت، حتى في منتصف المحادثة. ويمكنك أن تطلب ذلك ببساطة: «هل يمكننا التحدث بالإنجليزية؟»',
  connected: 'متصل بهذا النموذج',
  complete: (d, t) => `اكتمل ${d} من ${t}`,
  reading: 'جارٍ قراءة هذا النموذج…',
  preparing: 'جارٍ تحضير الأسئلة…',
  connecting: 'جارٍ الاتصال…',
  intro: (title, minutes) => `مرحبًا، أنا Paperwise. هذا النموذج هو «${title}». يستغرق حوالي ${minutes} دقائق. اضغط ابدأ وأجب بكلماتك، ويمكنك أن تسألني عن معنى أي شيء.`,
  paused: 'متوقف مؤقتًا. اضغط متابعة لنكمل من حيث توقفنا.',
  allAnswered: 'تمت الإجابة عن كل الأسئلة. راجع الصفحة ثم اضغط إرسال بنفسك.',
  fieldLabel: (n, label) => `الحقل ${n} · ${label}`,
  readingBack: (p, t) => `المراجعة · ${p} من ${t}`,
  readyToReview: 'جاهز للمراجعة',
  start: 'ابدأ الحديث',
  startTyping: 'ابدأ بالكتابة',
  startAgain: 'متابعة',
  end: 'إنهاء',
  micOn: 'الميكروفون يعمل',
  micOff: 'الميكروفون متوقف',
  typingMode: 'الكتابة فقط',
  quiet: 'منخفض',
  voiceLevel: 'مستوى الصوت',
  loud: 'مرتفع',
  youSaid: 'ما قلته',
  conversation: 'المحادثة',
  agentName: 'Paperwise',
  you: 'أنت',
  typePlaceholder: 'اكتب إجابة أو سؤالًا…',
  typeLabel: 'اكتب إلى Paperwise',
  send: 'إرسال',
  typeIt: 'اكتبه بنفسك من فضلك',
  typingHelp: 'اكتبه في المربع المميز على الصفحة. لا يسمعه Paperwise ولا يراه أبدًا.',
  typedDone: 'تمت الكتابة. لم يره Paperwise.',
  checkThis: 'لنتحقق من هذا',
  iHeard: 'سمعت',
  legal: 'قبل أن توافق',
  important: 'يستحق التحقق',
  whatItMeans: 'ماذا يعني',
  typedOnPage: 'مكتوب في الصفحة (مخفي)',
  notAnswered: 'لم تتم الإجابة بعد',
  skipped: 'تم التخطي',
  checked: 'محدد',
  notChecked: 'غير محدد',
  inTheForm: 'في النموذج',
  neverSubmit: 'Paperwise لا يرسل النموذج أبدًا. أنت من يضغط إرسال.',
  thinking: 'Paperwise يفكر…',
  states: { off: 'جاهز', connecting: 'جارٍ الاتصال', listening: 'أستمع', thinking: 'أفكر', speaking: 'أتحدث' },
  explainRequest: 'ماذا يعني هذا السؤال؟',
  repeatRequest: 'هل يمكنك أن تعيد ذلك من فضلك؟',
  explain: 'اشرح',
  repeat: 'أعد',
  help: 'مساعدة',
  closeHelp: 'إغلاق المساعدة',
  helpIntro: 'تحدث أو اكتب بلغتك. اسأل «ماذا يعني هذا؟» أو «لماذا يحتاجون هذا؟» أو «هل هو آمن؟» في أي وقت. لتغيير إجابة، قل ذلك ببساطة أو اكتب في الصفحة.',
  shortcutsTitle: 'اختصارات لوحة المفاتيح',
  shortcuts: { start: 'بدء المحادثة أو إنهاؤها', explain: 'شرح السؤال الحالي', repeat: 'إعادة السؤال الأخير', type: 'كتابة إجابة', help: 'إظهار هذه المساعدة أو إخفاؤها', close: 'إغلاق المساعدة أو الإعدادات' },
  doneTitle: 'انتهينا!',
  doneText: 'تمت الإجابة عن كل الأسئلة. راجع الصفحة، واضغط إرسال بنفسك عندما تكون مستعدًا.',
  donePdf: 'نزّل ملف PDF المعبأ، وتحقق منه، ثم أرسله بنفسك.',
  downloadPdf: 'تنزيل ملف PDF المعبأ',
  problems: {
    mic: 'لا يستطيع Paperwise سماعك: لم يُسمح بالميكروفون بعد. اسمح به في الصفحة التي فُتحت، أو اكتب بدلًا من ذلك.',
    micAction: 'اكتب بدلًا من ذلك',
    lost: 'انقطع الاتصال. جارٍ إعادة الاتصال…',
    lostFailed: 'انقطع الاتصال. اضغط متابعة: لم يضع شيء.',
    startFailed: 'تعذّر على Paperwise بدء المحادثة. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    noCredits: 'نفدت أرصدة خدمة الصوت (ElevenLabs)، لذلك لا يستطيع Paperwise التحدث أو الرد الآن. أضف أرصدة إلى حساب ElevenLabs ثم اضغط إعادة المحاولة.',
    retry: 'حاول مرة أخرى',
  },
  announce: {
    filled: (l) => `تم الملء: ${l}`,
    review: (l) => `يحتاج إلى تحقق: ${l}`,
    typing: (l) => `اكتبه بنفسك: ${l}`,
    skipped: (l) => `تم التخطي: ${l}`,
  },
  onboarding: {
    skip: 'تخطٍّ',
    next: 'التالي',
    back: 'رجوع',
    step: (n, t) => `الخطوة ${n} من ${t}`,
    welcomeTitle: 'مرحبًا، أنا Paperwise',
    welcomeText: 'أملأ النماذج معك، بالكلام أو الكتابة، بلغتك. أشرح لك كل ما تسأل عنه، وأملأ النموذج الحقيقي ونحن نتقدم.',
    chooseLanguage: 'بأي لغة تريد التحدث؟',
    privacyTitle: 'معلوماتك تبقى لك',
    privacy: ['الأرقام الخاصة، مثل رقم الضمان الاجتماعي، تكتبها أنت. أنا لا أسمعها أبدًا.', 'لا يُحفظ شيء مما تقوله لي.', 'أنا لا أضغط إرسال أبدًا. أنت من يفعل ذلك دائمًا.'],
    micTitle: 'الميكروفون',
    micText: 'لكي أسمعك أحتاج إلى الميكروفون. سيسألك Chrome مرة واحدة في صفحة جديدة. ويمكنك أيضًا كتابة كل شيء بدلًا من ذلك.',
    allowMic: 'السماح بالميكروفون',
    typeInstead: 'أفضّل الكتابة',
  },
  micBlocked: 'اسمح باستخدام الميكروفون في الصفحة التي فُتحت، ثم اضغط ابدأ مرة أخرى.',
  notices: {
    unsupported: 'لا يمكن لـ Paperwise العمل على هذه الصفحة. افتح صفحة النموذج ثم افتح Paperwise مرة أخرى.',
    unreachable: 'تعذّر على Paperwise الاتصال بهذه الصفحة. أعد تحميل الصفحة وحاول مرة أخرى.',
    noForm: 'لا أرى نموذجًا في هذه الصفحة. افتح صفحة النموذج ثم افتح Paperwise مرة أخرى.',
    offline: 'لا يستطيع Paperwise الوصول إلى خادمه الآن. تحقق من اتصالك بالإنترنت، ثم اضغط حاول مرة أخرى.',
  },
};

/** Panel words per language. Languages without their own table show English (the talk stays in theirs). */
export const COPY: { en: Copy } & Partial<Record<Language, Copy>> = { en, es, fr, ar };

export function copyFor(language: Language): Copy {
  return COPY[language] ?? COPY.en;
}
