/** Backend base URL. Must also be listed in host_permissions in wxt.config.ts. */
export const BACKEND_URL = 'http://localhost:8787';

/** Proposals below this confidence go to "review" instead of the page. */
export const CONFIDENCE_THRESHOLD = 0.7;

/** Attribute the content script writes on every field it tracks. */
export const FIELD_ATTR = 'data-paperwise-id';


/** Set by the scanner on fields whose values must never leave the page (SSN, card, bank, password). */
export const SENSITIVE_ATTR = 'data-paperwise-sensitive';

/** Highlight state of a field on the page (FieldStatus), drawn by the in-page UI. */
export const STATUS_ATTR = 'data-paperwise-status';

/** The field the conversation is on. */
export const ACTIVE_ATTR = 'data-paperwise-active';

/**
 * A radio group's question, set by pages we render ourselves (the PDF viewer): PDF radio buttons
 * have no fieldset or radiogroup around them. Web pages never carry it.
 */
export const GROUP_QUESTION_ATTR = 'data-paperwise-question';

/**
 * Set on <html> by pages we render ourselves (the PDF viewer): the document's identity and title
 * for the scan, instead of the page's URL and title. Every PDF opens in the same viewer page, so
 * without this the server would take two PDFs for one form. Web pages never carry them.
 */
export const DOCUMENT_URL_ATTR = 'data-paperwise-document';
export const DOCUMENT_TITLE_ATTR = 'data-paperwise-title';

/** Dispatched on document by the filler: "look at this field again, the page changed it". */
export const RECHECK_EVENT = 'paperwise:recheck';
