import { useEffect, useRef, useState } from 'react';
import type { AgentEvent, AgentMode, Language } from '@/shared/contract';
import { createMockPlayer, type MockPlayer } from '@/shared/mock-player';

/** DEBUG: plays the mock session and prints every event. Shows the UI what to expect. */
export default function MockDemo() {
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<AgentMode>('off');
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const player = useRef<MockPlayer | null>(null);

  useEffect(() => () => player.current?.destroy(), []);

  function play() {
    player.current?.destroy();
    setEvents([]);
    const p = createMockPlayer({ language, speed: 1.5 });
    p.subscribe(onEvent);
    p.send({ type: 'start' });
    player.current = p;
  }

  function stop() {
    player.current?.send({ type: 'end' });
  }

  function onEvent(e: AgentEvent) {
    if (e.type === 'agent_state') setMode(e.mode);
    if (e.type === 'transcript') setCaption(`${e.role}: ${e.text}${e.final ? '' : ' …'}`);
    if (e.type === 'section_progress') setProgress(`${e.formDone}/${e.formTotal} done (${e.sectionTitle} ${e.done}/${e.total})`);
    // Don't print the whole form map.
    const shown = e.type === 'form_detected' ? { ...e, map: `<${e.map.fields.length} fields>` } : e;
    setEvents((list) => [JSON.stringify(shown), ...list].slice(0, 80));
  }

  return (
    <section style={{ border: '1px solid #ccc', padding: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Mock session (no AI)</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
        <select
          value={language}
          onChange={(e) => {
            const lang = e.target.value as Language;
            setLanguage(lang);
            player.current?.send({ type: 'language_selected', language: lang });
          }}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
        <button onClick={play}>Play</button>
        <button onClick={stop}>End</button>
      </div>
      <p style={{ margin: '0 0 4px' }}>
        Agent: <b>{mode}</b> {progress && <>· {progress}</>}
      </p>
      <p style={{ margin: '0 0 6px', minHeight: '1.4em' }} aria-live="polite">
        {caption}
      </p>
      <pre style={{ background: '#f4f4f4', padding: 8, maxHeight: 200, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
        {events.join('\n') || '—'}
      </pre>
    </section>
  );
}
