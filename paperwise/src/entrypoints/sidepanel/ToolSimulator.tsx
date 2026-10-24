import { useState } from 'react';
import type { AgentToolName, FormState, ToolResult } from '@/shared/contract';
import { nextField } from '@/shared/form-state';
import type { FormEngine } from '@/engine/engine';

const TOOLS: AgentToolName[] = ['fill_field', 'flag_for_review', 'go_to_field', 'explain_field', 'request_typing', 'start_review'];

/** DEBUG: call the agent's tools by hand, exactly as the voice agent will, and see the result. */
export default function ToolSimulator({ engine, state }: { engine: FormEngine; state: FormState }) {
  const [tool, setTool] = useState<AgentToolName>('fill_field');
  const [id, setId] = useState('');
  const [value, setValue] = useState('');
  const [display, setDisplay] = useState('');
  const [confidence, setConfidence] = useState('0.95');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ToolResult | null>(null);

  const fieldId = id || nextField(state)?.id || '';
  const ids = state.map?.fields.map((f) => f.id) ?? [];

  async function run() {
    const args =
      tool === 'fill_field'
        ? { id: fieldId, value, display_value: display || value, confidence: Number(confidence) }
        : tool === 'flag_for_review'
          ? { id: fieldId, reason }
          : tool === 'start_review'
            ? {}
            : { id: fieldId };
    setResult(await engine.callTool(tool, args));
  }

  return (
    <section style={{ border: '1px solid #ccc', padding: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Agent tool simulator</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4, alignItems: 'center' }}>
        <label htmlFor="tool">Tool</label>
        <select id="tool" value={tool} onChange={(e) => setTool(e.target.value as AgentToolName)}>
          {TOOLS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {tool !== 'start_review' && (
          <>
            <label htmlFor="fid">Field</label>
            <select id="fid" value={fieldId} onChange={(e) => setId(e.target.value)}>
              {ids.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </>
        )}
        {tool === 'fill_field' && (
          <>
            <label htmlFor="val">value</label>
            <input id="val" value={value} onChange={(e) => setValue(e.target.value)} placeholder="in the form's language/format" />
            <label htmlFor="disp">display_value</label>
            <input id="disp" value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="in the user's language" />
            <label htmlFor="conf">confidence</label>
            <input id="conf" value={confidence} onChange={(e) => setConfidence(e.target.value)} />
          </>
        )}
        {tool === 'flag_for_review' && (
          <>
            <label htmlFor="reason">reason</label>
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </>
        )}
      </div>
      <button onClick={run} style={{ marginTop: 6 }} disabled={!state.map}>
        Call {tool}
      </button>
      {result && (
        <pre style={{ background: result.ok ? '#e6f4ea' : '#fce8e6', padding: 6, fontSize: 11, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      <details>
        <summary style={{ fontSize: 12 }}>What the agent would be told now</summary>
        <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{engine.contextForAgent()}</pre>
      </details>
    </section>
  );
}
