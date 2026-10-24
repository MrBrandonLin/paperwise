/**
 * The side panel, from the teammate's "glass panel" design (Lovable: src/components/extension-demo.tsx,
 * the <aside className="paperwise-panel"> part). Markup and classes are his; the data comes from
 * our engine through ui/adapter.ts (PanelView), and actions go out through callbacks.
 * No browser APIs here.
 *
 * Changes from his version, on purpose:
 *  - no "Add to form" approval card and no PDF envelope (decided: the agent fills live)
 *  - a Start/End button (his mic was "always on" in a demo), a real mic level for the waveform
 *  - cards for what our engine does that his demo didn't: type-it-yourself, amber check,
 *    legal/important notes, explanations, the review read-back
 *  - copy in the user's language (copy.ts)
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, BookOpen, Check, Ear, KeyRound, Mic, MicOff, PanelRightClose, Scale, Send, Settings, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Language } from '@/shared/contract';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import type { Attention, PanelView, ReviewItem } from '@/ui/adapter';
import LOGO from '@/ui/assets/logo.png';
import OFFICE from '@/ui/assets/office-arch.jpg';

export interface PanelActions {
  start: () => void;
  end: () => void;
  /** Typed answer or question (UiEvent user_text). */
  sendText: (text: string) => void;
  setLanguage: (language: Language) => void;
  close: () => void;
  /** Mic level 0..1 while the conversation runs. */
  micLevel: () => number;
}

export function PaperwisePanel({ view, actions, message }: { view: PanelView; actions: PanelActions; message?: string }) {
  const [settings, setSettings] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const { copy } = view;

  return (
    <aside aria-label="Paperwise" className={`paperwise-panel glass-panel flex h-full flex-col font-sans text-foreground ${largeText ? 'text-lg' : 'text-sm'}`}>
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <img src={LOGO} alt="" className="size-8 drop-shadow" />
          <span className="font-display text-lg">{copy.appName}</span>
          <span className="glass-light rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{copy.demoBadge}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={copy.settings} title={copy.settings} aria-expanded={settings} onClick={() => setSettings(!settings)}>
            <Settings />
          </Button>
          <Button variant="ghost" size="icon" aria-label={copy.closePanel} title={copy.closePanel} onClick={actions.close}>
            <PanelRightClose />
          </Button>
        </div>
      </header>
      <div className="glass-hairline shrink-0" aria-hidden="true" />

      <ReceptionScene view={view} largeText={largeText} />

      {view.screen !== 'notice' && view.screen !== 'loading' && (
        <div className="glass-light mx-4 mt-3 flex shrink-0 items-center justify-between rounded-xl px-4 py-2.5 text-xs [--glass-tint:var(--host)]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-host" /> {copy.connected}
          </span>
          <span className="font-bold text-primary">{copy.complete(view.progress.done, view.progress.total)}</span>
        </div>
      )}

      {settings && (
        <div className="glass-light mx-4 mt-2 rounded-xl px-4 py-3 [--glass-tint:var(--primary)]">
          <div className="mb-3 flex items-center justify-between font-bold">
            {copy.preferences}
            <Button variant="ghost" size="icon" aria-label={copy.closeSettings} onClick={() => setSettings(false)}>
              <X />
            </Button>
          </div>
          <label className="flex items-center justify-between">
            {copy.largerText}
            <input type="checkbox" checked={largeText} onChange={(e) => setLargeText(e.target.checked)} className="size-4 accent-primary" />
          </label>
          <label className="mt-3 flex items-center justify-between gap-2">
            {copy.language}
            <select
              value={view.language}
              disabled={view.inConversation}
              onChange={(e) => actions.setLanguage(e.target.value as Language)}
              className="rounded-md border border-input bg-paper px-2 py-1"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          {view.inConversation && <p className="mt-2 text-xs text-muted-foreground">{copy.languageLocked}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        {view.screen !== 'notice' && view.screen !== 'loading' && <VoiceDisplay view={view} micLevel={actions.micLevel} />}
        {view.attention && <AttentionCard attention={view.attention} />}
        {view.explanation && (
          <section className="glass-light mb-3 rounded-xl px-4 py-3 [--glass-tint:var(--primary)]" aria-label={copy.whatItMeans}>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <BookOpen className="size-3.5" /> {copy.whatItMeans}
            </p>
            {view.explanation.question && <p className="font-bold">{view.explanation.question}</p>}
            <p className="mt-1 leading-relaxed">{view.explanation.text}</p>
          </section>
        )}
        {view.review && <ReviewCard review={view.review} />}
        {view.userLines.length > 0 && <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">{copy.youSaid}</p>}
        <div aria-live="polite">
          {view.userLines.map((line, i) => (
            <div key={i} className={`mb-3 ml-9 break-words rounded-xl glass-light px-3 py-2 [--glass-tint:var(--primary)] ${line.final ? '' : 'opacity-60'}`}>
              {line.text}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 p-4">
        <div className="glass-hairline mb-3" aria-hidden="true" />
        {view.activity === 'thinking' && (
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Sparkles className="size-3.5 animate-pulse text-primary" /> {copy.thinking}
          </p>
        )}
        {message && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {message}
          </p>
        )}
        {view.inConversation ? <TypeBox view={view} onSend={actions.sendText} /> : null}
        <StartEnd view={view} actions={actions} />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3 shrink-0" /> {copy.neverSubmit}
        </p>
      </div>
    </aside>
  );
}

function ReceptionScene({ view, largeText }: { view: PanelView; largeText: boolean }) {
  const activity = view.activity;
  const pose = activity === 'connecting' ? 'thinking' : activity;
  return (
    <div className="reception-scene relative shrink-0 overflow-hidden">
      <img src={OFFICE} alt="" className="absolute inset-0 size-full object-cover object-[50%_42%]" />
      <div className="absolute inset-0 bg-primary/10" />
      <div className="absolute inset-x-0 bottom-0 h-12 border-t border-card/70 bg-card/50 backdrop-blur-md" />
      <div className={`receptionist receptionist-${pose} absolute bottom-8 right-6`} role="img" aria-label={`Paperwise · ${view.copy.states[activity]}`}>
        <div className="receptionist-head">
          {pose === 'speaking' && <span className="receptionist-mouth" />}
          {pose === 'listening' && <Ear className="receptionist-ear" />}
          {pose === 'thinking' && (
            <span className="receptionist-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
        <div className="receptionist-body" />
      </div>
      <div className="reception-bubble glass-light absolute rounded-xl">
        <div className="reception-bubble-content px-4 py-3" role="status" aria-live="polite">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-primary">{view.bubble.label}</span>
          <p className={`leading-relaxed ${largeText ? 'text-lg' : 'text-sm'} ${view.bubble.live ? 'opacity-90' : ''}`}>{view.bubble.text}</p>
        </div>
      </div>
      <span className="absolute bottom-3 left-5 font-display text-sm text-primary">{view.copy.appName}</span>
      <span className="absolute bottom-3 right-5 text-[10px] text-muted-foreground">{view.copy.states[activity]}</span>
    </div>
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
          {on ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          <span className={`size-1.5 rounded-full ${on ? 'bg-host' : 'bg-muted-foreground'}`} />
          {on ? copy.micOn : copy.micOff}
        </span>
      </div>
      <div ref={ref} className="voice-waveform" data-off={!on} role="img" aria-label={copy.voiceLevel}>
        {Array.from({ length: 35 }, (_, i) => (
          <span key={i} className="voice-wave-bar" />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{copy.quiet}</span>
        <span>{copy.voiceLevel}</span>
        <span>{copy.loud}</span>
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
      <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${s.tone}`}>
        <Icon className="size-3.5" /> {attention.title}
      </p>
      {attention.heard && (
        <p className="mt-1 font-display text-lg">
          <span className="ink-in inline-block">{attention.heard}</span>
        </p>
      )}
      {attention.text && <p className="mt-1 leading-relaxed">{attention.text}</p>}
    </section>
  );
}

function ReviewCard({ review }: { review: NonNullable<PanelView['review']> }) {
  return (
    <section className="glass-light mb-3 rounded-xl px-4 py-3 [--glass-tint:var(--host)]" aria-label={review.title}>
      <p className="mb-2 font-display text-base">{review.title}</p>
      <ul className="space-y-2">
        {review.items.map((item) => (
          <ReviewRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ReviewRow({ item }: { item: ReviewItem }) {
  const amber = item.status === 'review';
  return (
    <li className={`rounded-lg p-2 ${amber ? 'bg-warning-soft' : item.status === 'filled' ? 'bg-filled/60' : 'bg-muted/60'}`}>
      <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
        <span>{item.question}</span>
        {item.status === 'filled' && <Check className="size-3.5 shrink-0 text-primary" />}
        {amber && <AlertTriangle className="size-3.5 shrink-0 text-warning-foreground" />}
      </div>
      <p className="font-bold break-words">{item.answer}</p>
      {(item.risk === 'legal' || item.risk === 'important') && item.riskReason && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-foreground">
          <AlertTriangle className="size-3 shrink-0" /> {item.riskReason}
        </p>
      )}
    </li>
  );
}

function TypeBox({ view, onSend }: { view: PanelView; onSend: (text: string) => void }) {
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
    <form onSubmit={submit} className="glass-light mb-3 flex items-center gap-2 rounded-xl p-2 [--glass-tint:var(--primary)]">
      <label htmlFor="paperwise-type" className="sr-only">
        {copy.typeLabel}
      </label>
      <Input
        id="paperwise-type"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={copy.typePlaceholder}
        autoComplete="off"
        className="h-10 min-w-0 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="icon" aria-label={copy.send} disabled={!text.trim()} className="shrink-0">
        <Send />
      </Button>
    </form>
  );
}

function StartEnd({ view, actions }: { view: PanelView; actions: PanelActions }) {
  const { copy } = view;
  if (view.inConversation) {
    return (
      <Button variant="outline" className="h-11 w-full rounded-xl" onClick={actions.end}>
        <MicOff /> {copy.end}
      </Button>
    );
  }
  if (!view.canStart || view.screen === 'notice' || view.screen === 'loading') return null;
  const resume = view.userLines.length > 0;
  return (
    <Button className="relative h-12 w-full rounded-xl text-base" onClick={actions.start}>
      <span className="orb-pulse absolute inset-0 rounded-xl bg-primary" aria-hidden="true" />
      <Mic className="relative" /> <span className="relative">{resume ? copy.startAgain : copy.start}</span>
    </Button>
  );
}
