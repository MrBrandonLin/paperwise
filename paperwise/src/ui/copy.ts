/**
 * Every word the panel shows, in the user's language. The teammate's design was English-only;
 * French is our demo language, so the copy lives here and the adapter picks it.
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
  language: string;
  languageLocked: string;
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
  startAgain: string;
  end: string;
  micOn: string;
  micOff: string;
  quiet: string;
  voiceLevel: string;
  loud: string;
  youSaid: string;
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
  neverSubmit: string;
  thinking: string;
  states: Record<'off' | 'connecting' | 'listening' | 'thinking' | 'speaking', string>;
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
  language: 'Language',
  languageLocked: 'End the conversation to change the language.',
  connected: 'Connected to this form',
  complete: (d, t) => `${d}/${t} complete`,
  reading: 'Reading this form…',
  preparing: 'Preparing the questions…',
  connecting: 'Connecting…',
  intro: (title, minutes) => `Hi, I’m Paperwise. This is “${title}”. It takes about ${minutes} minutes. Press Start and answer in your own words — you can ask me what anything means.`,
  paused: 'Paused. Press Start to continue where we left off.',
  allAnswered: 'Every question is answered. Look over the page, then press Submit yourself.',
  fieldLabel: (n, label) => `Field ${n} · ${label}`,
  readingBack: (p, t) => `Reading back · ${p} of ${t}`,
  readyToReview: 'Ready to review',
  start: 'Start talking',
  startAgain: 'Continue',
  end: 'End',
  micOn: 'Microphone on',
  micOff: 'Microphone off',
  quiet: 'Quiet',
  voiceLevel: 'Voice level',
  loud: 'Loud',
  youSaid: 'What you said',
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
  neverSubmit: 'Paperwise never submits. You press Submit yourself.',
  thinking: 'Paperwise is thinking…',
  states: { off: 'Ready', connecting: 'Connecting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' },
  micBlocked: 'Allow the microphone in the tab that opened, then press Start again.',
  notices: {
    unsupported: 'Paperwise can’t work on this page.',
    unreachable: 'Paperwise couldn’t connect to this page. Reload the page and try again.',
    noForm: 'I don’t see a form on this page. Open the page with the form, then open Paperwise again.',
    offline: 'Paperwise can’t reach its server right now. Please try again in a moment.',
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
  language: 'Langue',
  languageLocked: 'Terminez la conversation pour changer de langue.',
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
  startAgain: 'Continuer',
  end: 'Terminer',
  micOn: 'Micro allumé',
  micOff: 'Micro éteint',
  quiet: 'Calme',
  voiceLevel: 'Niveau de voix',
  loud: 'Fort',
  youSaid: 'Ce que vous avez dit',
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
  neverSubmit: 'Paperwise n’envoie jamais le formulaire. C’est vous qui appuyez sur Envoyer.',
  thinking: 'Paperwise réfléchit…',
  states: { off: 'Prêt', connecting: 'Connexion', listening: 'J’écoute', thinking: 'Je réfléchis', speaking: 'Je parle' },
  micBlocked: 'Autorisez le micro dans l’onglet qui s’est ouvert, puis appuyez à nouveau sur Commencer.',
  notices: {
    unsupported: 'Paperwise ne peut pas fonctionner sur cette page.',
    unreachable: 'Paperwise n’arrive pas à se connecter à cette page. Rechargez la page et réessayez.',
    noForm: 'Je ne vois pas de formulaire sur cette page. Ouvrez la page du formulaire, puis rouvrez Paperwise.',
    offline: 'Paperwise n’arrive pas à joindre son serveur. Réessayez dans un instant.',
  },
};

export const COPY: Record<Language, Copy> = { en, fr };
