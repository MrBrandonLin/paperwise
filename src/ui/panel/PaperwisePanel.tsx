/**
 * The side panel, from the teammate's "glass panel" design (Lovable: src/components/extension-demo.tsx,
 * the <aside className="paperwise-panel"> part). Markup and classes are his; the data comes from
 * our engine through ui/adapter.ts (PanelView), and actions go out through callbacks.
 * No browser APIs here.
 *
 * Changes from his version, on purpose:
 *  - no "Add to form" approval card and no PDF envelope (decided: the agent fills live)
 *  - Start/End, and "start by typing": voice is never required
 *  - cards for what our engine does that his demo didn't: type-it-yourself, amber check,
 *    legal/important notes, explanations, the review read-back ("you said → in the form")
 *  - the conversation's both sides, a done screen, designed problems with a next step
 *  - help + keyboard shortcuts, text size that scales everything, speaking speed, 11 languages
 *    (Arabic mirrored), state shown by shape + icon + text (not color alone)
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CircleHelp,
  Download,
  Ear,
  Keyboard,
  KeyRound,
  Loader2,
  Mic,
  MicOff,
  PanelRightClose,
  PartyPopper,
  Pause,
  RefreshCw,
  Repeat2,
  Scale,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import type { Language } from '@/shared/contract';
import { LANGUAGES } from '@/shared/languages';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import type { Attention, PanelView, ReviewItem } from '@/ui/adapter';
import LOGO from '@/ui/assets/logo.png';
import OFFICE from '@/ui/assets/office-arch.jpg';

export interface PanelActions {
  start: () => void;
  /** Start without a microphone: the agent answers in text. */
  startTyping: () => void;
  end: () => void;
  /** Typed answer or question (UiEvent user_text). Starts a typing-only conversation if none runs. */
  sendText: (text: string) => void;
  setLanguage: (language: Language) => void;
  setTextSize: (size: PanelPrefs['textSize']) => void;
  setSpeed: (speed: PanelPrefs['speed']) => void;
  setTyping: (typing: boolean) => void;
  close: () => void;
  /** Mic level 0..1 while the conversation runs. */
  micLevel: () => number;
  /** Notice "offline" etc.: try again. */
  retry: () => void;
  /** PDF only: save the filled PDF (enabled once the review is done). */
  downloadPdf?: () => void;
}

export interface PanelPrefs {
  textSize: 'normal' | 'large' | 'xl';
  speed: 'normal' | 'slower';
  typing: boolean;
}

/** Something went wrong, with what the user can do about it. */
export type PanelProblem = { kind: 'mic' | 'lost' | 'lostFailed' | 'startFailed' | 'noCredits'; detail?: string } | null;

const ZOOM: Record<PanelPrefs['textSize'], number> = { normal: 1, large: 1.2, xl: 1.4 };

export function PaperwisePanel({
  view,
  actions,
  prefs,
  problem = null,
  pdf,
  extra,
}: {
  view: PanelView;
  actions: PanelActions;
  prefs: PanelPrefs;
  problem?: PanelProblem;
  /** The page is a PDF in Paperwise's viewer: the done screen offers the download. */
  pdf?: { canDownload: boolean };
  /** More cards at the top of the scroll area (PDF: open a PDF, fill this PDF). */
  extra?: ReactNode;
}) {
  const [overlay, setOverlay] = useState<'settings' | 'help' | null>(null);
  const { copy } = view;
  const typeRef = useRef<HTMLInputElement>(null);
  const announcement = useAnnouncements(view);
  const typingMode = prefs.typing;

  // Keyboard shortcuts (not while typing in a text box): listed in the help sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlay) {
        setOverlay(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === '?' || key === 'h') setOverlay((o) => (o === 'help' ? null : 'help'));
      else if (key === 's' && view.screen !== 'notice' && view.screen !== 'loading') (view.inConversation ? actions.end : typingMode ? actions.startTyping : actions.start)();
      else if (key === 'e' && view.inConversation) actions.sendText(copy.explainRequest);
      else if (key === 'r' && view.inConversation) actions.sendText(copy.repeatRequest);
      else if (key === 't') typeRef.current?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, view.screen, view.inConversation, typingMode, copy, actions]);

  const ready = view.screen !== 'notice' && view.screen !== 'loading';

  return (
    <aside
      aria-label="Paperwise"
      dir={view.dir}
      lang={view.language}
      style={{ zoom: ZOOM[prefs.textSize] }}
      className="paperwise-panel glass-panel flex h-full flex-col font-sans text-sm text-foreground"
    >
      <header className="flex h-14 shrink-0 items-center justify-between ps-5 pe-2">
        <div className="flex items-center gap-2">
          <img src={LOGO} alt="" className="size-8 drop-shadow" />
          <span className="font-display text-lg">{copy.appName}</span>
          <span className="glass-light rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{copy.demoBadge}</span>
        </div>
        <div className="flex">
          <IconButton label={copy.help} pressed={overlay === 'help'} onClick={() => setOverlay((o) => (o === 'help' ? null : 'help'))}>
            <CircleHelp />
          </IconButton>
          <IconButton label={copy.settings} pressed={overlay === 'settings'} onClick={() => setOverlay((o) => (o === 'settings' ? null : 'settings'))}>
            <Settings />
          </IconButton>
          <IconButton label={copy.closePanel} onClick={actions.close}>
            <PanelRightClose className="rtl:-scale-x-100" />
          </IconButton>
        </div>
      </header>
      <div className="glass-hairline shrink-0" aria-hidden="true" />

      <ReceptionScene view={view} />

      {ready && <ProgressStrip view={view} typing={typingMode} />}

      {overlay === 'settings' && <SettingsSheet view={view} prefs={prefs} actions={actions} onClose={() => setOverlay(null)} />}
      {overlay === 'help' && <HelpSheet view={view} onClose={() => setOverlay(null)} />}

      {/* Scrollable: focusable so keyboard users can scroll it too (WCAG 2.1.1). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2" tabIndex={0} role="region" aria-label={copy.conversation}>
        {view.screen === 'notice' && <NoticeCard view={view} onRetry={actions.retry} />}
        {extra}
        {view.done && <DoneCard view={view} pdf={pdf} onDownload={actions.downloadPdf} />}
        {ready && !view.done && !typingMode && <VoiceDisplay view={view} micLevel={actions.micLevel} />}
        {view.attention && <AttentionCard attention={view.attention} />}
        {view.explanation && (
          <section className="glass-light mb-3 rounded-xl px-4 py-3 [--glass-tint:var(--primary)]" aria-label={copy.whatItMeans}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <BookOpen className="size-4" aria-hidden="true" /> {copy.whatItMeans}
            </p>
            {view.explanation.title && <p className="font-bold" dir="auto">{view.explanation.title}</p>}
            <p className="mt-1 leading-relaxed" dir="auto">
              {view.explanation.text}
            </p>
          </section>
        )}
        {view.review && <ReviewCard review={view.review} view={view} />}
        <Transcript view={view} />
      </div>

      <div className="shrink-0 p-4 pt-2">
        <div className="glass-hairline mb-3" aria-hidden="true" />
        <ProblemBanner view={view} problem={problem} onType={() => actions.setTyping(true)} onRetry={view.inConversation ? undefined : typingMode ? actions.startTyping : actions.start} />
        {view.inConversation && (
          <div className="mb-2 flex gap-2">
            <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => actions.sendText(copy.explainRequest)}>
              <BookOpen aria-hidden="true" /> {copy.explain}
            </Button>
            <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => actions.sendText(copy.repeatRequest)}>
              <Repeat2 aria-hidden="true" /> {copy.repeat}
            </Button>
          </div>
        )}
        {ready && !view.done && <TypeBox view={view} onSend={actions.sendText} inputRef={typeRef} />}
        <StartEnd view={view} actions={actions} typing={typingMode} />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" /> {copy.neverSubmit}
        </p>
      </div>
      {/* Field filled / needs checking / needs typing, for screen readers. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </aside>
  );
}

function IconButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} className="size-11 rounded-xl [&_svg]:size-5">
      {children}
    </Button>
  );
}

/** Speaks the field changes (filled, needs checking, needs typing) once each. */
function useAnnouncements(view: PanelView): string {
  const last = useRef(new Map<string, string>());
  const [text, setText] = useState('');
  useEffect(() => {
    const changes: string[] = [];
    for (const s of view.statuses) {
      const before = last.current.get(s.id);
      if (before !== undefined && before !== s.status) {
        if (s.status === 'filled') changes.push(view.copy.announce.filled(s.label));
        else if (s.status === 'review') changes.push(view.copy.announce.review(s.label));
        else if (s.status === 'needs_typing') changes.push(view.copy.announce.typing(s.label));
        else if (s.status === 'skipped') changes.push(view.copy.announce.skipped(s.label));
      }
      last.current.set(s.id, s.status);
    }
    if (changes.length) setText(changes.join('. '));
  }, [view.statuses, view.copy]);
  return text;
}

const STATE_ICON = { off: Pause, connecting: Loader2, listening: Ear, thinking: Sparkles, speaking: Volume2 } as const;

function ReceptionScene({ view }: { view: PanelView }) {
  const activity = view.activity;
  const pose = activity === 'connecting' ? 'thinking' : activity;
  const Icon = STATE_ICON[activity];
  return (
    <div className="reception-scene relative shrink-0 overflow-hidden">
      <img src={OFFICE} alt="" className="absolute inset-0 size-full object-cover object-[50%_42%]" />
      <div className="absolute inset-0 bg-primary/10" />
      <div className="absolute inset-x-0 bottom-0 h-12 border-t border-card/70 bg-card/50 backdrop-blur-md" />
      <div className={`receptionist receptionist-${pose} absolute bottom-8 end-6`} aria-hidden="true">
        <div className="receptionist-head">
          {pose === 'speaking' && <span className="receptionist-mouth" />}
          {pose === 'listening' && <Ear className="receptionist-ear" />}
          {pose === 'thinking' && (
            <span className="receptionist-dots">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
        <div className="receptionist-body" />
      </div>
      <div className="reception-bubble glass-light absolute rounded-xl">
        <div className="reception-bubble-content px-4 py-3" role="status" aria-live="polite" tabIndex={0}>
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-primary" dir="auto">
            {view.bubble.label}
          </span>
          <p className={`text-[15px] leading-relaxed ${view.bubble.live ? 'opacity-90' : ''}`} dir="auto">
            {view.bubble.text}
          </p>
        </div>
      </div>
      <span className="absolute bottom-3 start-5 font-display text-sm text-primary">{view.copy.appName}</span>
      {/* The agent's state: shape (pill) + icon + word, not color alone. */}
      <span
        className={`absolute bottom-2.5 end-4 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
          activity === 'listening' ? 'border-host bg-host text-host-foreground' : activity === 'speaking' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
        }`}
      >
        <Icon className={`size-3.5 ${activity === 'connecting' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        {view.copy.states[activity]}
      </span>
    </div>
  );
}

function ProgressStrip({ view, typing }: { view: PanelView; typing: boolean }) {
  const { copy, progress } = view;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="glass-light mx-4 mt-3 shrink-0 rounded-xl px-4 py-2.5 text-xs [--glass-tint:var(--host)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {view.preparing ? (
            <>
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {copy.preparing}
            </>
          ) : typing ? (
            <>
              <Keyboard className="size-3.5" aria-hidden="true" /> {copy.typingMode}
            </>
          ) : (
            <>
              <Check className="size-3.5" aria-hidden="true" /> {copy.connected}
            </>
          )}
        </span>
        <span className="font-bold text-primary">{copy.complete(progress.done, progress.total)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={copy.complete(progress.done, progress.total)}>
        <div className="h-full rounded-full bg-host transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SettingsSheet({ view, prefs, actions, onClose }: { view: PanelView; prefs: PanelPrefs; actions: PanelActions; onClose: () => void }) {
  const { copy } = view;
  return (
    <section className="glass-light mx-4 mt-2 max-h-[55%] overflow-y-auto rounded-xl px-4 py-3 [--glass-tint:var(--primary)]" aria-label={copy.preferences}>
      <div className="mb-2 flex items-center justify-between font-bold">
        {copy.preferences}
        <IconButton label={copy.closeSettings} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{copy.language}</span>
        <select
          value={view.language}
          onChange={(e) => actions.setLanguage(e.target.value as Language)}
          className="h-11 rounded-lg border border-input bg-paper px-2"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.native}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{copy.languageNote}</span>
      </label>
      <Segmented
        label={copy.textSize}
        value={prefs.textSize}
        options={(['normal', 'large', 'xl'] as const).map((v) => ({ value: v, label: copy.textSizes[v] }))}
        onChange={actions.setTextSize}
      />
      <Segmented label={copy.speed} value={prefs.speed} options={(['normal', 'slower'] as const).map((v) => ({ value: v, label: copy.speeds[v] }))} onChange={actions.setSpeed} />
      <p className="mt-1 text-xs text-muted-foreground">{copy.speedNote}</p>
      <label className="mt-3 flex min-h-11 items-center justify-between gap-2">
        <span className="font-bold">{copy.typingOnly}</span>
        <input type="checkbox" checked={prefs.typing} onChange={(e) => actions.setTyping(e.target.checked)} className="size-5 accent-primary" />
      </label>
    </section>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="mt-3">
      <legend className="mb-1 font-bold">{label}</legend>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-bold transition active:scale-[.97] ${o.value === value ? 'bg-card text-primary shadow' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function HelpSheet({ view, onClose }: { view: PanelView; onClose: () => void }) {
  const { copy } = view;
  const rows: [string, string][] = [
    ['S', copy.shortcuts.start],
    ['E', copy.shortcuts.explain],
    ['R', copy.shortcuts.repeat],
    ['T', copy.shortcuts.type],
    ['?', copy.shortcuts.help],
    ['Esc', copy.shortcuts.close],
  ];
  return (
    <section className="glass-light mx-4 mt-2 max-h-[55%] overflow-y-auto rounded-xl px-4 py-3 [--glass-tint:var(--primary)]" aria-label={copy.help}>
      <div className="mb-2 flex items-center justify-between font-bold">
        {copy.help}
        <IconButton label={copy.closeHelp} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <p className="leading-relaxed">{copy.helpIntro}</p>
      <h3 className="mt-3 mb-1 font-bold">{copy.shortcutsTitle}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([key, text]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="inline-flex min-w-8 justify-center rounded-md border border-border bg-paper px-1.5 py-0.5 font-sans text-xs font-bold shadow-sm">{key}</kbd>
            </dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** His "Mic always on" waveform, now driven by the real microphone level. */
function VoiceDisplay({ view, micLevel }: { view: PanelView; micLevel: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = view.inConversation;
  useEffect(() => {
    if (!on) {
      ref.current?.style.setProperty('--level', '0');
      return;
    }
    let raf = 0;
    const tick = () => {
      ref.current?.style.setProperty('--level', String(Math.min(1, Math.max(0, micLevel())).toFixed(3)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, micLevel]);
  const { copy } = view;
  return (
    <section className="voice-display glass-light my-3 rounded-2xl px-4 py-3 [--glass-tint:var(--primary)]" aria-label={on ? copy.micOn : copy.micOff}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-bold text-primary">
          {on ? <Mic className="size-4" aria-hidden="true" /> : <MicOff className="size-4" aria-hidden="true" />}
          {on ? copy.micOn : copy.micOff}
        </span>
      </div>
      <div ref={ref} className="voice-waveform" data-off={!on} aria-hidden="true">
        {Array.from({ length: 35 }, (_, i) => (
          <span key={i} className="voice-wave-bar" />
        ))}
      </div>
    </section>
  );
}

const ATTENTION_STYLE: Record<Attention['kind'], { box: string; icon: typeof KeyRound; tone: string }> = {
  typing: { box: 'border-2 border-dashed border-primary bg-paper/80', icon: KeyRound, tone: 'text-primary' },
  review: { box: 'border-2 border-warning bg-warning-soft', icon: AlertTriangle, tone: 'text-warning-foreground' },
  legal: { box: 'border border-warning bg-warning-soft/70', icon: Scale, tone: 'text-warning-foreground' },
  important: { box: 'border border-warning/60 bg-warning-soft/50', icon: AlertTriangle, tone: 'text-warning-foreground' },
};

/** Amber "unclear" and "stakes" from his /session design, plus the type-it-yourself state. */
function AttentionCard({ attention }: { attention: Attention }) {
  const s = ATTENTION_STYLE[attention.kind];
  const Icon = attention.done ? Check : s.icon;
  return (
    <section className={`mb-3 rounded-xl px-4 py-3 ${s.box}`} role="status" aria-live="polite">
      <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${s.tone}`}>
        <Icon className="size-4" aria-hidden="true" /> {attention.title}
      </p>
      {attention.heard && (
        <p className="mt-1 font-display text-lg" dir="auto">
          <span className="ink-in inline-block">{attention.heard}</span>
        </p>
      )}
      {attention.text && (
        <p className="mt-1 leading-relaxed" dir="auto">
          {attention.text}
        </p>
      )}
    </section>
  );
}

function ReviewCard({ review, view }: { review: NonNullable<PanelView['review']>; view: PanelView }) {
  return (
    <section className="glass-light mb-3 rounded-xl px-4 py-3 [--glass-tint:var(--host)]" aria-label={review.title}>
      <p className="text-xs font-bold uppercase tracking-wider text-primary">{view.copy.readingBack(review.position, review.total)}</p>
      <p className="mb-2 font-display text-base" dir="auto">
        {review.title}
      </p>
      <ul className="space-y-2">
        {review.items.map((item) => (
          <ReviewRow key={item.id} item={item} view={view} />
        ))}
      </ul>
    </section>
  );
}

function ReviewRow({ item, view }: { item: ReviewItem; view: PanelView }) {
  const amber = item.status === 'review';
  return (
    <li className={`rounded-lg p-2 ${amber ? 'bg-warning-soft' : item.status === 'filled' ? 'bg-filled/60' : 'bg-muted/60'}`}>
      <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
        <span dir="auto">{item.question}</span>
        {item.status === 'filled' && <Check className="size-4 shrink-0 text-primary" aria-label={view.copy.checked} />}
        {amber && <AlertTriangle className="size-4 shrink-0 text-warning-foreground" aria-label={view.copy.checkThis} />}
      </div>
      <p className="font-bold break-words" dir="auto">
        {item.answer}
      </p>
      {item.written && (
        <p className="mt-0.5 text-xs text-muted-foreground" dir="auto">
          {view.copy.inTheForm}: <span className="font-bold text-foreground">{item.written}</span>
        </p>
      )}
      {(item.risk === 'legal' || item.risk === 'important') && item.riskReason && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-foreground" dir="auto">
          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> {item.riskReason}
        </p>
      )}
    </li>
  );
}

/** Both sides of the conversation (captions), most recent last. */
function Transcript({ view }: { view: PanelView }) {
  const end = useRef<HTMLDivElement>(null);
  const lines = view.transcript.slice(0, -1); // the latest agent line is in the bubble already
  const last = view.transcript.at(-1);
  const shown = last && last.role === 'user' ? [...lines, last] : lines;
  // Braces matter: Chrome's scrollIntoView now returns a Promise, and an effect must return nothing.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [view.transcript.length]);
  if (!shown.length) return null;
  return (
    <section aria-label={view.copy.conversation} className="mt-1">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{view.copy.conversation}</p>
      <ol className="space-y-2" aria-live="polite" aria-relevant="additions">
        {shown.map((line, i) => (
          <li
            key={i}
            dir="auto"
            className={`max-w-[88%] break-words rounded-xl px-3 py-2 ${
              line.role === 'user' ? 'glass-light ms-auto [--glass-tint:var(--primary)]' : 'bg-card/70 text-foreground'
            } ${line.final ? '' : 'opacity-60'}`}
          >
            <span className="sr-only">{line.role === 'user' ? view.copy.you : view.copy.agentName}: </span>
            {line.text}
          </li>
        ))}
      </ol>
      <div ref={end} />
    </section>
  );
}

function NoticeCard({ view, onRetry }: { view: PanelView; onRetry: () => void }) {
  const offline = view.notice === view.copy.notices.offline;
  return (
    <section className="glass-light my-3 rounded-xl px-4 py-4 [--glass-tint:var(--warning)]" role="alert">
      <p className="flex items-start gap-2 leading-relaxed">
        {offline ? <WifiOff className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden="true" />}
        <span>{view.notice}</span>
      </p>
      <Button variant="outline" className="mt-3 h-11 w-full rounded-xl" onClick={onRetry}>
        <RefreshCw aria-hidden="true" /> {view.copy.problems.retry}
      </Button>
    </section>
  );
}

function DoneCard({ view, pdf, onDownload }: { view: PanelView; pdf?: { canDownload: boolean }; onDownload?: () => void }) {
  return (
    <section className="glass-light my-3 rounded-2xl px-5 py-5 text-center [--glass-tint:var(--host)]" role="status">
      <PartyPopper className="mx-auto mb-2 size-10 text-host" aria-hidden="true" />
      <h2 className="font-display text-2xl">{view.copy.doneTitle}</h2>
      <p className="mt-2 leading-relaxed">{pdf ? view.copy.donePdf : view.copy.doneText}</p>
      {pdf && onDownload && (
        <Button className="mt-4 h-12 w-full rounded-xl text-base" disabled={!pdf.canDownload} onClick={onDownload}>
          <Download aria-hidden="true" /> {view.copy.downloadPdf}
        </Button>
      )}
    </section>
  );
}

function ProblemBanner({ view, problem, onType, onRetry }: { view: PanelView; problem: PanelProblem; onType: () => void; onRetry?: () => void }) {
  const { copy } = view;
  if (!problem) {
    return view.activity === 'thinking' ? (
      <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <Sparkles className="size-4 animate-pulse text-primary motion-reduce:animate-none" aria-hidden="true" /> {copy.thinking}
      </p>
    ) : null;
  }
  const text = problem.kind === 'mic' ? copy.problems.mic : problem.kind === 'lost' ? copy.problems.lost : problem.kind === 'lostFailed' ? copy.problems.lostFailed : problem.kind === 'noCredits' ? copy.problems.noCredits : copy.problems.startFailed;
  return (
    <div className="mb-2 rounded-xl border-2 border-warning bg-warning-soft px-3 py-2 text-warning-foreground" role="alert">
      <p className="flex items-start gap-2 leading-snug">
        {problem.kind === 'mic' ? <MicOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <span>{text}</span>
      </p>
      {problem.kind === 'mic' && (
        <Button variant="outline" className="mt-2 h-11 w-full rounded-xl bg-card" onClick={onType}>
          <Keyboard aria-hidden="true" /> {copy.problems.micAction}
        </Button>
      )}
      {(problem.kind === 'startFailed' || problem.kind === 'noCredits') && onRetry && (
        <Button variant="outline" className="mt-2 h-11 w-full rounded-xl bg-card" onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> {copy.problems.retry}
        </Button>
      )}
    </div>
  );
}

function TypeBox({ view, onSend, inputRef }: { view: PanelView; onSend: (text: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [text, setText] = useState('');
  const { copy } = view;
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }
  return (
    <form onSubmit={submit} className="glass-light mb-3 flex items-center gap-2 rounded-xl p-1.5 [--glass-tint:var(--primary)] focus-within:ring-2 focus-within:ring-ring">
      <label htmlFor="paperwise-type" className="sr-only">
        {copy.typeLabel}
      </label>
      <Input
        id="paperwise-type"
        ref={inputRef}
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={copy.typePlaceholder}
        autoComplete="off"
        className="h-11 min-w-0 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="icon" aria-label={copy.send} disabled={!text.trim()} className="size-11 shrink-0 rounded-lg">
        <Send className="rtl:-scale-x-100" aria-hidden="true" />
      </Button>
    </form>
  );
}

function StartEnd({ view, actions, typing }: { view: PanelView; actions: PanelActions; typing: boolean }) {
  const { copy } = view;
  if (view.inConversation) {
    return (
      <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={actions.end}>
        <MicOff aria-hidden="true" /> {copy.end}
      </Button>
    );
  }
  if (!view.canStart || view.screen === 'notice' || view.screen === 'loading' || view.done) return null;
  const resume = view.transcript.some((l) => l.role === 'user');
  if (typing) {
    return (
      <Button className="h-12 w-full rounded-xl text-base" onClick={actions.startTyping}>
        <Keyboard aria-hidden="true" /> {resume ? copy.startAgain : copy.startTyping}
      </Button>
    );
  }
  return (
    <Button className="relative h-12 w-full rounded-xl text-base active:scale-[.98]" onClick={actions.start}>
      <span className="orb-pulse absolute inset-0 rounded-xl bg-primary" aria-hidden="true" />
      <Mic className="relative" aria-hidden="true" /> <span className="relative">{resume ? copy.startAgain : copy.start}</span>
    </Button>
  );
}
