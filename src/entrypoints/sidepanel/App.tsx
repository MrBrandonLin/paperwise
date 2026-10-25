import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormMap, FormState, Language, ScanResult } from '@/shared/contract';
import { createMockPlayer } from '@/shared/mock-player';
import { initialFormState, reduceFormState } from '@/shared/form-state';
import { isLanguage } from '@/shared/languages';
import { toPanelView } from '@/ui/adapter';
import { Onboarding } from '@/ui/panel/Onboarding';
import { PaperwisePanel, type PanelActions, type PanelProblem } from '@/ui/panel/PaperwisePanel';
import { PdfCard, PdfDropZone, usePdf } from '@/pdf/panel';
import { usePaperwise } from './controller';
import DebugPanel from './DebugPanel';
import { SPEEDS, usePrefs, type Prefs } from './prefs';

/**
 * Side panel: the teammate's panel (src/ui), wired to the real engine and voice session.
 * First run shows the onboarding. Shift+D toggles the debug panel (troubleshooting on stage).
 * sidepanel.html?mock=fr plays the mock session through the same UI (design review without
 * voice or a form page).
 */
export default function App() {
  const mock = new URLSearchParams(location.search).get('mock');
  if (isLanguage(mock)) return <MockApp language={mock} />;
  return <LiveApp />;
}

function LiveApp() {
  const pw = usePaperwise();
  const { prefs, update, loaded } = usePrefs();
  const [debug, setDebug] = useDebugToggle();
  const view = useMemo(() => toPanelView(pw.state, { notice: pw.notice }), [pw.state, pw.notice]);
  const pdf = usePdf({ state: pw.state, notice: view.screen === 'notice' });

  // The saved language is the conversation's from the start.
  const appliedLanguage = useRef(false);
  useEffect(() => {
    if (!loaded || appliedLanguage.current) return;
    appliedLanguage.current = true;
    if (prefs.language !== pw.state.userLanguage) pw.engine.setLanguage(prefs.language);
  }, [loaded]);
  // The agent switched language (the user asked it to): remember it for next time.
  useEffect(() => {
    if (loaded && appliedLanguage.current && pw.state.userLanguage !== prefs.language) update({ language: pw.state.userLanguage });
  }, [pw.state.userLanguage]);

  if (!loaded) return null;
  if (!prefs.onboarded && !debug) {
    return (
      <Onboarding
        language={prefs.language}
        onLanguage={(language) => {
          update({ language });
          pw.engine.setLanguage(language);
        }}
        onAllowMic={() => {
          void browser.tabs.create({ url: browser.runtime.getURL('/mic-permission.html') });
          update({ onboarded: true, typing: false });
        }}
        onTypeInstead={() => update({ onboarded: true, typing: true })}
        onSkip={() => update({ onboarded: true })}
      />
    );
  }

  const pdfCard = view.screen === 'notice' || !!pdf.pdfTab || !!pdf.error || pdf.busy || pdf.confirming ? <PdfCard pdf={pdf} language={pw.state.userLanguage} /> : null;

  if (debug)
    return (
      <>
        <PdfCard pdf={pdf} language={pw.state.userLanguage} />
        <PdfDropZone pdf={pdf} language={pw.state.userLanguage} />
        <DebugPanel pw={pw} onExit={() => setDebug(false)} />
      </>
    );

  const speed = SPEEDS[prefs.speed];
  const actions: PanelActions = {
    start: () => void pw.voice.start({ speed }),
    startTyping: () => void pw.voice.start({ speed, textOnly: true }),
    end: () => void pw.voice.end(),
    sendText: pw.voice.sendText,
    setLanguage: (language: Language) => {
      update({ language });
      pw.changeLanguage(language);
    },
    setTextSize: (textSize) => update({ textSize }),
    setSpeed: (s) => {
      update({ speed: s });
      void pw.voice.restart({ speed: SPEEDS[s] });
    },
    setTyping: (typing) => {
      update({ typing });
      if (pw.voice.active && typing !== pw.voice.textOnly) void pw.voice.restart({ textOnly: typing });
      else if (typing && pw.voice.problem === 'mic') void pw.voice.start({ speed, textOnly: true });
    },
    close: () => window.close(),
    micLevel: pw.voice.micLevel,
    retry: () => {
      void pw.checkBackend();
      void pw.scanAndMap(pw.state.userLanguage);
    },
    downloadPdf: pdf.viewerTab !== null ? pdf.download : undefined,
  };
  return (
    <>
      <PaperwisePanel
        view={view}
        actions={actions}
        prefs={prefs}
        problem={problemOf(pw.voice.problem)}
        pdf={pdf.viewerTab !== null ? { canDownload: pdf.done } : undefined}
        extra={pdfCard}
      />
      <PdfDropZone pdf={pdf} language={pw.state.userLanguage} />
    </>
  );
}

function problemOf(p: string): PanelProblem {
  if (!p) return null;
  if (p === 'mic' || p === 'lost' || p === 'lostFailed') return { kind: p };
  if (/credits used up/i.test(p)) return { kind: 'noCredits', detail: p };
  return { kind: 'startFailed', detail: p };
}

/** Shift+D anywhere except while typing in a text box. */
function useDebugToggle() {
  const [debug, setDebug] = useState(() => location.hash === '#debug');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key.toLowerCase() !== 'd' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      setDebug((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return [debug, setDebug] as const;
}

/** The mock session (no AI) through the real UI and adapter. */
function MockApp({ language }: { language: Language }) {
  const [state, setState] = useState<FormState>(() => initialFormState(language));
  const [player] = useState(() => createMockPlayer({ language, speed: Number(new URLSearchParams(location.search).get('speed') ?? 1) }));
  const [prefs, setPrefs] = useState<Prefs>({ onboarded: true, language, textSize: 'normal', speed: 'normal', typing: false });
  useEffect(() => {
    const off = player.subscribe((e) =>
      setState((s) => {
        const next = reduceFormState(s, e);
        // The mock has no page: stand in a scan with every mapped field on it.
        return (e.type === 'form_detected' || e.type === 'form_map_updated') && !next.scan
          ? reduceFormState(next, { type: 'scan_updated', scan: scanFromMap(e.map) })
          : next;
      }),
    );
    return () => {
      off();
      player.destroy();
    };
  }, [player]);
  const view = useMemo(() => toPanelView(state), [state]);
  const listening = state.agentMode === 'listening';
  const actions: PanelActions = {
    start: () => player.send({ type: 'start' }),
    startTyping: () => player.send({ type: 'start' }),
    end: () => player.send({ type: 'end' }),
    sendText: (text) => player.send({ type: 'user_text', text }),
    setLanguage: (l) => player.send({ type: 'language_selected', language: l }),
    setTextSize: (textSize) => setPrefs((p) => ({ ...p, textSize })),
    setSpeed: (speed) => setPrefs((p) => ({ ...p, speed })),
    setTyping: (typing) => setPrefs((p) => ({ ...p, typing })),
    close: () => window.close(),
    // A fake voice level while the mock "listens".
    micLevel: () => (listening ? 0.45 + 0.35 * Math.sin(performance.now() / 120) : 0.03),
    retry: () => {},
  };
  return <PaperwisePanel view={view} actions={actions} prefs={prefs} />;
}

function scanFromMap(map: FormMap): ScanResult {
  return {
    url: 'mock://rental',
    pageTitle: map.title,
    fields: map.fields.map((f) => ({
      id: f.id,
      kind: 'text',
      label: f.plainQuestion,
      required: true,
      visible: true,
      currentValue: '',
      filled: false,
      sensitive: f.risk === 'sensitive',
    })),
  };
}
