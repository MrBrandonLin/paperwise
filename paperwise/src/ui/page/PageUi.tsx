/**
 * The in-page UI, from the teammate's design: the floating "Paperwise 2/6" pill
 * (Lovable extension-demo.tsx, the closed-panel button) and the guided-field highlight
 * (.guided-field: primary outline + halo), extended with the states our engine has:
 * filled (check), review (amber, from his /session "unclear"), needs_typing (type it yourself),
 * skipped, and the fill animation (his ink-in) when a value is written.
 *
 * Presentational only: the content script (content/page-ui.tsx) measures the fields and passes
 * boxes in. It renders inside our shadow root, so nothing here can touch the host page's styles,
 * and the boxes never take clicks (pointer-events: none) — the page stays fully usable.
 */
import type { ReactNode } from 'react';
import { Check, KeyRound, Sparkles, TriangleAlert } from 'lucide-react';
import type { FieldStatus, Language } from '@/shared/contract';

export interface Box {
  key: string;
  status: FieldStatus | null;
  active: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FlashBox {
  key: number;
  text: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const WORDS: Record<Language, { open: string; active: string; review: string; typing: string }> = {
  en: { open: 'Paperwise: help me fill this form', active: 'Paperwise', review: 'Check this', typing: 'Type it here yourself' },
  fr: { open: 'Paperwise : m’aider à remplir ce formulaire', active: 'Paperwise', review: 'À vérifier', typing: 'Tapez-le ici vous-même' },
};

export function FloatingButton({
  logo,
  progress,
  language,
  onOpen,
  onIntent,
}: {
  logo: string;
  progress: { done: number; total: number } | null;
  language: Language;
  onOpen: () => void;
  /** Hover / focus: the user is about to open it (start building the form map). */
  onIntent: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={WORDS[language].open}
      onClick={onOpen}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      className="glass-light pointer-events-auto fixed right-6 bottom-6 z-[2147483647] flex h-14 cursor-pointer items-center gap-2 rounded-full bg-card/80 pr-5 pl-2 font-sans text-base font-bold text-foreground shadow-paper transition hover:bg-card focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <img src={logo} alt="" className="size-9" />
      Paperwise
      {progress && progress.total > 0 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
          {progress.done}/{progress.total}
        </span>
      )}
    </button>
  );
}

const STATUS_STYLE: Record<FieldStatus, string> = {
  empty: '',
  filled: 'border-2 border-primary/70',
  review: 'border-3 border-warning bg-warning-soft/25 shadow-[0_0_0_6px_var(--warning-soft)]',
  needs_typing: 'border-3 border-dashed border-primary',
  skipped: 'border-2 border-dashed border-muted-foreground/50',
};

/** Space between the field and its highlight ring (his guided-field used a generous offset). */
const PAD = 6;

export function HighlightLayer({ boxes, flashes, language }: { boxes: Box[]; flashes: FlashBox[]; language: Language }) {
  const w = WORDS[language];
  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483646] overflow-hidden font-sans" aria-hidden="true">
      {boxes.map((b) => (
        <div
          key={b.key}
          data-status={b.status ?? 'none'}
          data-active={b.active || undefined}
          className={`absolute rounded-md transition-[top,left,width,height] duration-100 ${b.status ? STATUS_STYLE[b.status] : ''} ${
            b.active ? 'outline-3 outline-offset-2 outline-primary shadow-[0_0_0_10px_var(--guided-halo)]' : ''
          }`}
          style={{ top: b.top - PAD, left: b.left - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 }}
        >
          <Chip box={b} words={w} />
        </div>
      ))}
      {flashes.map((f) => (
        <div
          key={f.key}
          className="absolute flex items-center"
          style={{ top: f.top, left: f.left, width: Math.max(f.width, 40), height: f.height }}
        >
          <span className="flow-in ml-1 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-filled px-2 py-0.5 font-display text-base text-foreground shadow-paper">
            <Check className="size-4 shrink-0 text-primary" />
            {f.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function Chip({ box, words }: { box: Box; words: (typeof WORDS)[Language] }) {
  let content: ReactNode = null;
  let tone = 'bg-primary text-primary-foreground';
  if (box.status === 'review') {
    content = (
      <>
        <TriangleAlert className="size-3" /> {words.review}
      </>
    );
    tone = 'bg-warning text-warning-foreground';
  } else if (box.status === 'needs_typing') {
    content = (
      <>
        <KeyRound className="size-3" /> {words.typing}
      </>
    );
  } else if (box.active) {
    content = (
      <>
        <Sparkles className="size-3" /> {words.active}
      </>
    );
  } else if (box.status === 'filled') {
    return (
      <span className="absolute -top-2.5 -right-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
        <Check className="size-3.5" />
      </span>
    );
  }
  if (!content) return null;
  return (
    <span className={`absolute -top-3 right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap shadow ${tone}`}>{content}</span>
  );
}

const PROMPT_WORDS: Record<Language, { tag: string; title: string; yes: string; no: string; close: string }> = {
  en: { tag: 'Form detected', title: 'Want help filling this out?', yes: 'Help me fill this', no: 'Not now', close: 'Close' },
  fr: { tag: 'Formulaire détecté', title: 'Besoin d’aide pour le remplir ?', yes: 'Aidez-moi', no: 'Pas maintenant', close: 'Fermer' },
};

const GLASS =
  'linear-gradient(135deg,rgba(255,255,255,.7),rgba(60,110,190,.45) 38%,rgba(44,79,134,.75) 72%,rgba(70,160,140,.65))';
const GLASS_SHADOW =
  'inset 2px 2px 5px rgba(255,255,255,.65),inset -3px -4px 7px rgba(44,79,134,.6),0 4px 9px rgba(44,79,134,.25)';

/** The "Form detected" pop-up: the little glass guy talking next to a speech bubble. */
export function FormPrompt({
  language,
  onOpen,
  onIntent,
  onDismiss,
}: {
  language: Language;
  onOpen: () => void;
  onIntent: () => void;
  onDismiss: () => void;
}) {
  const w = PROMPT_WORDS[language];
  return (
    <div
      role="dialog"
      aria-label={w.title}
      className="pw-prompt-in pointer-events-auto fixed right-6 bottom-6 z-[2147483647] flex items-end gap-3 font-sans text-foreground"
    >
      <style>{`@keyframes pw-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes pw-talk{0%{transform:scaleY(.35) scaleX(1.1)}100%{transform:scaleY(1.5) scaleX(.85)}}
.pw-prompt-in{animation:pw-in .5s cubic-bezier(.2,.8,.2,1) both}
.pw-mouth{animation:pw-talk .38s ease-in-out infinite alternate}
@media (prefers-reduced-motion:reduce){.pw-prompt-in,.pw-mouth{animation:none}}`}</style>
      <div
        className="glass-light relative w-[270px] rounded-2xl bg-card/80 px-[18px] py-4 shadow-paper"
        onPointerEnter={onIntent}
      >
        <button
          type="button"
          aria-label={w.close}
          onClick={onDismiss}
          className="absolute top-2 right-2.5 cursor-pointer text-lg leading-none text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
        <div className="text-[10px] font-bold tracking-[.08em] text-primary uppercase">{w.tag}</div>
        <div className="mt-1 mr-6 mb-3.5 font-display text-lg leading-snug font-semibold">{w.title}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpen}
            onFocus={onIntent}
            className="flex-1 cursor-pointer rounded-[10px] bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {w.yes}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            {w.no}
          </button>
        </div>
        <span
          aria-hidden="true"
          className="absolute -right-2.5 bottom-7 border-y-8 border-l-[10px] border-y-transparent border-l-card"
        />
      </div>
      <div aria-hidden="true" className="shrink-0">
        <div
          className="relative mx-auto mb-1.5 size-10 rounded-full"
          style={{ background: GLASS, boxShadow: GLASS_SHADOW, border: '1px solid rgba(255,255,255,.75)' }}
        >
          <span className="absolute top-1.5 left-1.5 h-[7px] w-3.5 -rotate-[35deg] rounded-full bg-white/80" />
          <span className="pw-mouth absolute bottom-[9px] left-[13px] h-[7px] w-3.5 rounded-full bg-white" />
        </div>
        <div
          className="h-11 w-[54px] rounded-t-[22px] rounded-b-[3px]"
          style={{ background: GLASS, boxShadow: GLASS_SHADOW, border: '1px solid rgba(255,255,255,.75)' }}
        />
      </div>
    </div>
  );
}
