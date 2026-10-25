/**
 * Internal message protocol between content script, background and side panel.
 * Not part of the UI contract — the UI never sends these directly.
 */
import type { FieldStatus, FormMap, Language, ScanResult } from './contract';

/** Every request gets one of these back. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Side panel → content script (sent with tabs.sendMessage). */
export type ContentRequest =
  | { type: 'PING' }
  | { type: 'SCAN' }
  | { type: 'FILL'; id: string; value: string }
  | { type: 'HIGHLIGHT'; id: string; status: FieldStatus }
  /** focus: also put the cursor in the field (for fields the user must type). */
  | { type: 'GO_TO'; id: string; focus?: boolean }
  | { type: 'CLEAR_HIGHLIGHTS' }
  /** Form progress for the floating button ("3/12"): done = filled + skipped, applicable only. */
  | { type: 'PROGRESS'; done: number; total: number; language: Language };

/** Anything → background (sent with runtime.sendMessage). */
export type BackgroundRequest =
  /** scan + language (optional): start the form map while the panel opens. */
  | { type: 'OPEN_PANEL'; scan?: ScanResult; language?: Language }
  | { type: 'API_HEALTH' }
  /** Streams EVENT_FORM_MAP broadcasts while building; answers with the FormMapDone. */
  | { type: 'API_FORM_MAP'; scan: ScanResult; language: Language; requestId: string }
  /** Start building early (hover on the floating button) so the panel finds it ready. */
  | { type: 'API_FORM_MAP_PREFETCH'; scan: ScanResult; language: Language }
  | { type: 'API_AGENT_TOKEN' }
  /** The in-page UI's fonts, as bytes (pages never load extension URLs themselves). */
  | { type: 'GET_FONTS' };

/** One bundled font file (GET_FONTS answer). */
export interface FontFile {
  family: string;
  weight: string;
  base64: string;
}

/** Content script → side panel broadcast events (runtime.sendMessage). */
export type ContentEvent =
  /**
   * The user changed a field on the page. The panel turns it into a UiEvent user_edited_field.
   * Sensitive fields: value is '' and only `filled` is meaningful.
   */
  | { type: 'EVENT_USER_EDIT'; id: string; value: string; filled: boolean; sensitive: boolean }
  /** Background → side panel: one more line of a form-map stream. */
  | { type: 'EVENT_FORM_MAP'; requestId: string; line: FormMapStreamLine }
  /** Fields appeared, disappeared or changed options (e.g. a conditional section opened). */
  | { type: 'EVENT_FIELDS_CHANGED'; scan: ScanResult }
  | { type: 'EVENT_PAGE_CHANGED'; url: string }
  /** PDF viewer: every page and field is on screen, scanning works now. */
  | { type: 'EVENT_PDF_READY'; fields: number }
  /** PDF viewer: this PDF can't be filled (the code picks the friendly message). */
  | { type: 'EVENT_PDF_FAILED'; code: PdfErrorCode };

/** Why a PDF can't be filled. The viewer and the panel show a friendly sentence for each. */
export type PdfErrorCode = 'noFields' | 'xfa' | 'password' | 'corrupted' | 'fileAccess' | 'expired' | 'unreadable' | 'notPdf';

/** Side panel → PDF viewer tab (tabs.sendMessage), besides the ContentRequests. */
export type PdfViewerRequest =
  | { type: 'PDF_STATUS' }
  /** The review is done: the viewer's "Download filled PDF" button turns on. */
  | { type: 'PDF_REVIEW_DONE'; done: boolean }
  /** The panel's done screen: save the filled PDF (only once the review is done). */
  | { type: 'PDF_DOWNLOAD' };

export interface PdfStatus {
  state: 'loading' | 'ready' | 'error';
  code?: PdfErrorCode;
  fields: number;
  name: string;
}

/** Mic permission tab → side panel broadcast. */
export type MicEvent = { type: 'EVENT_MIC_GRANTED' };

/** Every broadcast event the side panel may receive. */
export type ExtensionEvent = ContentEvent | MicEvent;

// Response payloads
export interface HealthResponse {
  ok: true;
  gemini: boolean;
  elevenlabs: boolean;
}
// ---------------------------------------------------------------------------
// Form map stream. POST /form-map { scan, language } answers NDJSON: FormMapUpdate lines as
// more of the map is ready (first one at once), then one FormMapDone line.
// ---------------------------------------------------------------------------

export interface FormMapRequestBody {
  scan: ScanResult;
  language: Language;
}

/** Which path built the map. mixed = some parts by Gemini, some by the label fallback. */
export type FormMapSource = 'gemini' | 'cache' | 'fallback' | 'mixed';

export interface FormMapUpdate {
  type: 'update';
  /** skeleton = local map, instant · section = a part's questions · title = title/summary · late = after the 15 s limit */
  stage: 'skeleton' | 'cache' | 'section' | 'title' | 'late';
  map: FormMap;
  readySectionId?: string;
  /** Since the request started. */
  ms: number;
}

export interface FormMapPartTiming {
  id: string;
  fields: number;
  /** When it landed, since the build started. */
  ms: number;
  ok: boolean;
  late?: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface FormMapDone {
  type: 'done';
  map: FormMap;
  source: FormMapSource;
  /** full = the whole form was mapped; new-fields = only fields that appeared later, merged in. */
  mode: 'full' | 'new-fields';
  newFieldIds?: string[];
  /** Until everything settled, late answers included. */
  ms: number;
  /** First section with Gemini questions. */
  firstSectionMs?: number;
  /** map.complete became true (every section ready, at most the 15 s limit). */
  completeMs?: number;
  parts: FormMapPartTiming[];
  fallbackReason?: string;
}

export type FormMapStreamLine = FormMapUpdate | FormMapDone;
/** WebRTC token (default) or WebSocket signed URL (?transport=websocket). */
export interface AgentTokenResponse {
  conversationToken?: string;
  signedUrl?: string;
}
