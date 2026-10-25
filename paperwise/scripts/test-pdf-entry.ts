// Bundled by scripts/test-pdf.ts into an extension page (stands in for the side panel): the real
// engine + the panel's real messaging, driving the PDF viewer tab.
import type { FormMap, ScanResult } from '../src/shared/contract';
import { FormEngine } from '../src/engine/engine';
import { toContent } from '../src/lib/messaging';

/** A local form map (what the backend's skeleton looks like), enough to drive the engine. */
function localMap(scan: ScanResult): FormMap {
  const sections = [...new Set(scan.fields.map((f) => f.sectionHint ?? ''))];
  return {
    language: 'en',
    title: scan.pageTitle,
    summary: '',
    estimatedMinutes: 5,
    formLanguage: 'en',
    complete: true,
    groups: [],
    sections: sections.map((t, i) => ({ id: `s${i + 1}`, title: t, ready: true, fieldIds: scan.fields.filter((f) => (f.sectionHint ?? '') === t).map((f) => f.id) })),
    fields: scan.fields.map((f, i) => ({
      id: f.id,
      plainQuestion: f.label,
      risk: f.sensitive ? 'sensitive' : f.kind === 'checkbox' ? 'legal' : 'none',
      riskReason: f.kind === 'checkbox' ? 'Legal.' : undefined,
      order: i + 1,
    })),
  };
}

async function makeEngine(tabId: number) {
  const engine = new FormEngine({ send: (req) => toContent(tabId, req) });
  const scan = await toContent<ScanResult>(tabId, { type: 'SCAN' });
  if (!scan.ok) throw new Error(scan.error);
  engine.setScan(scan.data);
  engine.setMap(localMap(scan.data));
  return engine;
}

(window as unknown as { __t: unknown }).__t = { makeEngine, toContent, engines: [] as FormEngine[] };
