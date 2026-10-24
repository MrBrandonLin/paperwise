import { useEffect, useMemo, useState } from 'react';
import type { FormMap, FormState, Language, ScanResult } from '@/shared/contract';
import { createMockPlayer } from '@/shared/mock-player';
import { initialFormState, reduceFormState } from '@/shared/form-state';
import { toPanelView } from '@/ui/adapter';
import { COPY } from '@/ui/copy';
import { PaperwisePanel, type PanelActions } from '@/ui/panel/PaperwisePanel';
import { usePaperwise } from './controller';
import DebugPanel from './DebugPanel';

/**
 * Side panel: the teammate's panel (src/ui), wired to the real engine and voice session.
 * Shift+D toggles the debug panel (troubleshooting on stage). sidepanel.html?mock=fr plays the
 * mock session through the same UI (design review without voice or a form page).
 */
export default function App() {
  const mock = new URLSearchParams(location.search).get('mock');
  if (mock === 'en' || mock === 'fr') return <MockApp language={mock} />;
  return <LiveApp />;
}

function LiveApp() {
  const pw = usePaperwise();
  const [debug, setDebug] = useDebugToggle();
  const view = useMemo(() => toPanelView(pw.state, { notice: pw.notice }), [pw.state, pw.notice]);
  const copy = COPY[pw.state.userLanguage];

  if (debug) return <DebugPanel pw={pw} onExit={() => setDebug(false)} />;

  const actions: PanelActions = {
    start: () => void pw.voice.start(),
    end: () => void pw.voice.end(),
    sendText: pw.voice.sendText,
    setLanguage: pw.changeLanguage,
    close: () => window.close(),
    micLevel: pw.voice.micLevel,
  };
  const message = pw.voice.problem === 'mic' ? copy.micBlocked : pw.voice.problem;
  return <PaperwisePanel view={view} actions={actions} message={message} />;
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
    end: () => player.send({ type: 'end' }),
    sendText: (text) => player.send({ type: 'user_text', text }),
    setLanguage: (l) => player.send({ type: 'language_selected', language: l }),
    close: () => window.close(),
    // A fake voice level while the mock "listens".
    micLevel: () => (listening ? 0.45 + 0.35 * Math.sin(performance.now() / 120) : 0.03),
  };
  return <PaperwisePanel view={view} actions={actions} />;
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
