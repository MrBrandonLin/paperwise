// Bundled by scripts/test-fill.mjs and injected into the test pages.
// Exposes the real content-script modules + the side-panel engine (no extension APIs needed).
import type { FormMap, ScanResult } from '../src/shared/contract';
import type { ContentRequest, Result } from '../src/shared/messages';
import { FormEngine } from '../src/engine/engine';
import { handleContentRequest } from '../src/entrypoints/content/handler';
import { readField } from '../src/entrypoints/content/filler';
import { markDirty, scanCount, scanPage } from '../src/entrypoints/content/scanner';
import { pageUi } from '../src/entrypoints/content/page-ui-store';
import { watchFieldChanges, watchUserEdits } from '../src/entrypoints/content/watchers';
import { askOrder, nextField } from '../src/shared/form-state';
import { testValueFor } from '../src/lib/test-values';

/** A simple local form map (what the backend's skeleton looks like), enough to drive the engine. */
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
      formatHint: f.kind === 'number' ? 'whole number, 0 or more' : undefined,
    })),
  };
}

/** Engine wired to the real page, exactly like the side panel (minus the messaging). */
function makeEngine() {
  const engine = new FormEngine({ send: async <T,>(req: ContentRequest) => handleContentRequest(req) as Result<T> });
  const scan = scanPage();
  engine.setScan(scan);
  engine.setMap(localMap(scan));
  engine.onMapStale = (s) => engine.setMap({ ...localMap(s), fields: localMap(s).fields });
  watchUserEdits((id, r) => void engine.userEdited({ id, ...r }));
  watchFieldChanges((s) => engine.setScan(s));
  return engine;
}

(window as unknown as { __pw: unknown }).__pw = {
  handle: handleContentRequest,
  readField,
  scanPage,
  watchFieldChanges,
  watchUserEdits,
  testValueFor,
  makeEngine,
  scanCount,
  markDirty,
  pageUi,
  nextField,
  askOrder,
};
