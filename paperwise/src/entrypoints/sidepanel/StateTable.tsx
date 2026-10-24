import type { FieldStatus, FormState } from '@/shared/contract';
import { isApplicable, nextField, progress, scannedField } from '@/shared/form-state';

const STATUS_COLOR: Record<FieldStatus, string> = {
  empty: '#999',
  filled: '#1e8e3e',
  review: '#e37400',
  needs_typing: '#1a73e8',
  skipped: '#777',
};

/** DEBUG: the form state, one row per field, in ask order. */
export default function StateTable({ state }: { state: FormState }) {
  const map = state.map;
  if (!map) return <p>No form map yet.</p>;
  const next = nextField(state);
  const p = progress(state);

  return (
    <section style={{ border: '1px solid #ccc', padding: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>
        {map.title} <span style={{ fontWeight: 400, fontSize: 12 }}>({map.language}{map.complete ? '' : ', still streaming'})</span>
      </h2>
      {map.summary && <p style={{ margin: '0 0 6px', fontSize: 12 }}>{map.summary}</p>}
      <p style={{ margin: '0 0 6px' }}>
        Phase: <b>{state.phase}</b> · Progress: <b>{p.done}/{p.total}</b> · Next: <b>{next?.id ?? '— (call start_review)'}</b>
      </p>
      {map.sections.map((section) => (
        <div key={section.id} style={{ marginBottom: 6, opacity: section.ready ? 1 : 0.55 }}>
          <div style={{ fontWeight: 600, background: state.review?.currentSectionId === section.id ? '#e8f0fe' : undefined }}>
            {section.title} {section.ready ? '' : '(preparing…)'}
          </div>
          {section.fieldIds.map((id) => {
            const f = map.fields.find((x) => x.id === id)!;
            const st = state.fields[id];
            const status = st?.status ?? 'empty';
            const applies = isApplicable(state, id);
            const scanned = scannedField(state, id);
            return (
              <div key={id} style={{ fontSize: 12, padding: '2px 0 2px 8px', borderLeft: `4px solid ${STATUS_COLOR[status]}`, margin: '2px 0', opacity: applies ? 1 : 0.5 }}>
                {next?.id === id ? '▶ ' : ''}
                {state.activeFieldId === id ? '◉ ' : ''}
                <b>{f.plainQuestion}</b> <span style={{ color: '#666' }}>{id}</span>
                <div>
                  <span style={{ color: STATUS_COLOR[status], fontWeight: 600 }}>{status}</span>
                  {st?.displayValue || st?.value ? ` · "${st.displayValue || st.value}"` : ''}
                  {st?.reviewReason ? ` · ${st.reviewReason}` : ''}
                  {f.risk !== 'none' ? ` · ${f.risk.toUpperCase()}` : ''}
                  {scanned?.required ? ' · required' : ''}
                  {!applies ? ' · does not apply now' : ''}
                  {f.groupId ? ` · group ${f.groupId}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {state.explanation && (
        <p style={{ fontSize: 12, background: '#f4f4f4', padding: 6 }}>
          Explaining {state.explanation.fieldId}: {state.explanation.text}
        </p>
      )}
    </section>
  );
}
