import type { CSSProperties } from 'react';
import type { Language } from '@/shared/contract';
import type { Paperwise } from './controller';
import FieldsDebug from './FieldsDebug';
import MicTest from './MicTest';
import MockDemo from './MockDemo';
import StateTable from './StateTable';
import ToolSimulator from './ToolSimulator';
import VoicePanel from './VoicePanel';

/**
 * DEBUG panel (Shift+D). Plain and functional on purpose: engine state, tool simulator, raw page
 * tools, latency, logs. Shares the engine and voice session with the real panel.
 */
export default function DebugPanel({ pw, onExit }: { pw: Paperwise; onExit: () => void }) {
  const state = pw.state;
  return (
    <main style={{ font: '14px system-ui, sans-serif', padding: 12 }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Paperwise (debug) <button onClick={onExit} style={{ fontSize: 12 }}>Back to the real panel (Shift+D)</button></h1>
      <p style={{ margin: '0 0 8px' }}>
        Backend: {pw.health ? 'connected' : 'not connected'} <button onClick={pw.checkBackend}>Retry</button>
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <label htmlFor="lang">Language</label>
        <select id="lang" value={state.userLanguage} onChange={(e) => pw.changeLanguage(e.target.value as Language)}>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
        <button onClick={() => pw.scanAndMap(state.userLanguage)}>Rescan page</button>
        <button onClick={pw.doToken}>Test agent token</button>
      </div>
      {pw.notice && (
        <p role="status" style={{ margin: '0 0 8px', padding: 8, border: '2px solid #b06000', fontSize: 15 }}>
          {pw.notice}
        </p>
      )}
      {pw.mapTiming && <p style={{ margin: '0 0 8px', fontSize: 12 }}>{pw.mapTiming}</p>}

      <VoicePanel pw={pw} />
      <StateTable state={state} />
      <ToolSimulator engine={pw.engine} state={state} />

      <h2 style={{ fontSize: 15 }}>Log</h2>
      <pre style={preStyle}>{pw.log.join('\n') || '—'}</pre>

      <details>
        <summary>Raw page tools (bypass the engine)</summary>
        {pw.rawScan && pw.tabId !== null && <FieldsDebug tabId={pw.tabId} scan={pw.rawScan} rescan={pw.scan} log={pw.write} />}
      </details>
      <details>
        <summary>Mic test</summary>
        <MicTest />
      </details>
      <details>
        <summary>Mock session (no AI)</summary>
        <MockDemo />
      </details>
      <details>
        <summary>Raw form map JSON</summary>
        <pre style={preStyle}>{JSON.stringify(state.map, null, 2)}</pre>
      </details>
    </main>
  );
}

const preStyle: CSSProperties = {
  background: '#f4f4f4',
  padding: 8,
  maxHeight: 260,
  overflow: 'auto',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
};
