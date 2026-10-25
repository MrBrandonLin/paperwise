import { useState } from 'react';
import type { Paperwise } from './controller';

/** Speed A/B: optional per-session LLM override (the agent's own LLM if empty). */
const LLM_CHOICES = ['', 'claude-haiku-4-5', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gpt-4.1-nano', 'gpt-4.1-mini'];

/** DEBUG: the real voice conversation (shared with the real panel), with an LLM override + latency. */
export default function VoicePanel({ pw }: { pw: Paperwise }) {
  const { state, voice } = pw;
  const [llm, setLlm] = useState('');
  const active = voice.active;
  const turns = voice.turns;
  const message = voice.problem === 'mic' ? 'Allow the microphone in the tab that opened, then press Start again.' : voice.problem ? `Could not start: ${voice.problem}` : '';
  const start = () => voice.start({ llm });
  const end = () => voice.end();

  const stats = voice.stats();
  const last = turns.at(-1);
  const captions = state.captions.slice(-8);

  return (
    <section style={{ border: '2px solid #1a73e8', padding: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Voice agent</h2>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {active ? (
          <button onClick={end}>End conversation</button>
        ) : (
          <button onClick={start} disabled={!state.map}>
            Start conversation ({state.userLanguage})
          </button>
        )}
        <label htmlFor="llm" style={{ fontSize: 12 }}>
          LLM
        </label>
        <select id="llm" value={llm} onChange={(e) => setLlm(e.target.value)} disabled={active} style={{ fontSize: 12 }}>
          {LLM_CHOICES.map((m) => (
            <option key={m} value={m}>
              {m || 'agent default'}
            </option>
          ))}
        </select>
      </div>
      <p style={{ margin: '6px 0' }}>
        Agent: <b>{state.agentMode}</b>
        {stats?.count ? (
          <>
            {' '}
            · Turn latency: last <b>{stats.lastMs} ms</b>, median <b>{stats.medianMs} ms</b>, p90 {stats.p90Ms} ms ({stats.count} turns)
          </>
        ) : null}
      </p>
      {last && (
        <p style={{ margin: '0 0 6px', fontSize: 12 }}>
          Last turn: you stopped → transcript {last.toTranscriptMs ?? '—'} ms → agent speaking {last.totalMs} ms (tools {last.toolsMs} ms)
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div aria-live="polite" style={{ fontSize: 13, background: '#f8f9fa', padding: 6, minHeight: 40 }}>
        {captions.length === 0 ? '—' : captions.map((c, i) => (
          <div key={i} style={{ opacity: c.final ? 1 : 0.6 }}>
            <b>{c.role === 'agent' ? 'Agent' : 'You'}:</b> {c.text}
          </div>
        ))}
      </div>
    </section>
  );
}
