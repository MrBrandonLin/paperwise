/**
 * First run: what Paperwise does, the privacy promise, the microphone explained before Chrome
 * asks, and the language choice. Shown once, skippable. Same glass look as the panel.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Keyboard, Lock, Mic, ShieldCheck, Sparkles } from 'lucide-react';
import type { Language } from '@/shared/contract';
import { LANGUAGES, languageInfo } from '@/shared/languages';
import { Button } from '@/ui/components/button';
import { copyFor } from '@/ui/copy';
import LOGO from '@/ui/assets/logo.png';

export function Onboarding({
  language,
  onLanguage,
  onAllowMic,
  onTypeInstead,
  onSkip,
}: {
  language: Language;
  onLanguage: (l: Language) => void;
  onAllowMic: () => void;
  onTypeInstead: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const copy = copyFor(language);
  const o = copy.onboarding;
  const heading = useRef<HTMLHeadingElement>(null);
  // Each step announces itself: focus moves to its title.
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const total = 3;

  return (
    <section
      dir={languageInfo(language).dir}
      lang={language}
      aria-label={copy.appName}
      className="paperwise-panel glass-panel flex h-full flex-col font-sans text-foreground"
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <img src={LOGO} alt="" className="size-8 drop-shadow" />
          <span className="font-display text-lg">{copy.appName}</span>
        </div>
        <Button variant="ghost" className="h-11 rounded-xl px-4" onClick={onSkip}>
          {o.skip}
        </Button>
      </header>
      <div className="glass-hairline shrink-0" aria-hidden="true" />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">{o.step(step + 1, total)}</p>

        {step === 0 && (
          <>
            <div className="mb-4 flex items-end gap-3" aria-hidden="true">
              <div className="receptionist receptionist-speaking">
                <div className="receptionist-head">
                  <span className="receptionist-mouth" />
                </div>
                <div className="receptionist-body" />
              </div>
            </div>
            <h1 ref={heading} tabIndex={-1} className="font-display text-2xl leading-snug outline-none">
              {o.welcomeTitle}
            </h1>
            <p className="mt-2 leading-relaxed">{o.welcomeText}</p>
            <h2 className="mt-5 mb-2 font-bold">{o.chooseLanguage}</h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={o.chooseLanguage}>
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={l.code === language}
                  lang={l.code}
                  onClick={() => onLanguage(l.code)}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition active:scale-[.98] ${
                    l.code === language ? 'border-primary bg-primary text-primary-foreground' : 'glass-light border-border hover:border-primary'
                  }`}
                >
                  <span>{l.native}</span>
                  {l.code === language && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <ShieldCheck className="mb-3 size-10 text-host" aria-hidden="true" />
            <h1 ref={heading} tabIndex={-1} className="font-display text-2xl leading-snug outline-none">
              {o.privacyTitle}
            </h1>
            <ul className="mt-4 space-y-3">
              {o.privacy.map((line, i) => (
                <li key={i} className="glass-light flex items-start gap-3 rounded-xl px-4 py-3 [--glass-tint:var(--host)]">
                  {i === 0 ? <Lock className="mt-0.5 size-5 shrink-0 text-host" aria-hidden="true" /> : i === 1 ? <Sparkles className="mt-0.5 size-5 shrink-0 text-host" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 size-5 shrink-0 text-host" aria-hidden="true" />}
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <Mic className="mb-3 size-10 text-primary" aria-hidden="true" />
            <h1 ref={heading} tabIndex={-1} className="font-display text-2xl leading-snug outline-none">
              {o.micTitle}
            </h1>
            <p className="mt-2 leading-relaxed">{o.micText}</p>
            <div className="mt-5 space-y-2">
              <Button className="h-12 w-full rounded-xl text-base" onClick={onAllowMic}>
                <Mic /> {o.allowMic}
              </Button>
              <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={onTypeInstead}>
                <Keyboard /> {o.typeInstead}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 p-4">
        <Button variant="ghost" className="h-11 rounded-xl px-4" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ArrowLeft className="rtl:rotate-180" /> {o.back}
        </Button>
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-2 bg-border'}`} />
          ))}
        </div>
        {step < total - 1 ? (
          <Button className="h-11 rounded-xl px-5" onClick={() => setStep((s) => s + 1)}>
            {o.next} <ArrowRight className="rtl:rotate-180" />
          </Button>
        ) : (
          <span className="w-[88px]" />
        )}
      </div>
    </section>
  );
}
