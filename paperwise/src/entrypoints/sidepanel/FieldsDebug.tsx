import { useState } from 'react';
import type { FieldStatus, ScannedField, ScanResult } from '@/shared/contract';
import type { Result } from '@/shared/messages';
import { toContent } from '@/lib/messaging';
import { testValueFor } from '@/lib/test-values';

interface FillOutcome {
  value: string;
  filled: boolean;
}

interface Props {
  tabId: number;
  scan: ScanResult;
  /** Rescan the page; returns the fresh scan. */
  rescan: () => Promise<ScanResult | null>;
  log: (line: string) => void;
}

const STATUSES: FieldStatus[] = ['empty', 'filled', 'review', 'needs_typing', 'skipped'];

/** DEBUG: one row per field with fill / go-to / highlight buttons, plus "fill everything". */
export default function FieldsDebug({ tabId, scan, rescan, log }: Props) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const setResult = (id: string, text: string) => setResults((r) => ({ ...r, [id]: text }));

  async function fillOne(field: ScannedField, value = testValueFor(field)) {
    await toContent(tabId, { type: 'GO_TO', id: field.id });
    const res = await toContent<FillOutcome>(tabId, { type: 'FILL', id: field.id, value });
    await toContent(tabId, { type: 'HIGHLIGHT', id: field.id, status: res.ok ? 'filled' : 'review' });
    const onPage = field.sensitive ? `(hidden, filled: ${res.ok && res.data.filled})` : `"${res.ok ? res.data.value : ''}"`;
    const text = res.ok ? `✓ "${value}" → page has ${onPage}` : `✗ ${res.error}`;
    setResult(field.id, text);
    log(`fill ${field.id}: ${text}`);
    return res;
  }

  /** Fill every field in page order. Rescans after each fill: new fields may appear. */
  async function fillEverything() {
    setBusy(true);
    const done = new Set<string>();
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < 80; i++) {
      const fresh = await rescan();
      // Only visible fields: hidden ones (conditions not met) are skipped until they appear.
      const next = fresh?.fields.find((f) => f.visible && !done.has(f.id));
      if (!next) break;
      done.add(next.id);
      const res: Result<FillOutcome> = await fillOne(next);
      if (res.ok) ok++;
      else failed++;
      await sleep(250); // let the page re-render (conditional fields) and show the fill
    }
    log(`fill everything: ${ok} filled, ${failed} failed`);
    setBusy(false);
  }

  async function clearAll() {
    await toContent(tabId, { type: 'CLEAR_HIGHLIGHTS' });
    setResults({});
  }

  return (
    <section style={{ border: '1px solid #ccc', padding: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Fields ({scan.fields.length})</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={fillEverything} disabled={busy}>
          {busy ? 'Filling…' : 'Fill everything'}
        </button>
        <button onClick={clearAll}>Clear highlights</button>
      </div>

      {scan.fields.map((f) => (
        <div key={f.id} style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
          <div>
            <b>{f.label}</b>{' '}
            <span style={{ color: '#666', fontSize: 12 }}>
              {f.kind} · {f.id}
              {f.required ? ' · required' : ''}
              {f.sensitive ? ' · SENSITIVE' : ''}
              {f.visible ? '' : ' · HIDDEN'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#444' }}>
            On page: {f.sensitive ? (f.filled ? '(hidden, filled)' : '(hidden, empty)') : f.currentValue === '' ? '—' : `"${f.currentValue}"`}{' '}
            · Test value: "{testValueFor(f)}"
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            <button onClick={() => fillOne(f)} disabled={busy}>
              Fill test value
            </button>
            <button onClick={() => toContent(tabId, { type: 'GO_TO', id: f.id, focus: true })}>Go to</button>
            <select
              aria-label={`Highlight ${f.label}`}
              defaultValue=""
              onChange={async (e) => {
                const status = e.target.value as FieldStatus;
                const res = await toContent(tabId, { type: 'HIGHLIGHT', id: f.id, status });
                if (!res.ok) log(`highlight ${f.id}: ${res.error}`);
              }}
            >
              <option value="" disabled>
                Highlight…
              </option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {results[f.id] && (
            <div style={{ fontSize: 12, marginTop: 2, color: results[f.id]!.startsWith('✓') ? '#1e6e2e' : '#b3261e' }}>
              {results[f.id]}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
