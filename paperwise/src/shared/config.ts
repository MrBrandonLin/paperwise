/** Backend base URL. Must also be listed in host_permissions in wxt.config.ts. */
export const BACKEND_URL = 'http://localhost:8787';

/** Proposals below this confidence go to "review" instead of the page. */
export const CONFIDENCE_THRESHOLD = 0.7;

/** Attribute the content script writes on every field it tracks. */
export const FIELD_ATTR = 'data-paperwise-id';

/** Show the floating button only when a page has at least this many fields. */
export const MIN_FIELDS_FOR_BUTTON = 2;

/** Set by the scanner on fields whose values must never leave the page (SSN, card, bank, password). */
export const SENSITIVE_ATTR = 'data-paperwise-sensitive';

/** Highlight state of a field on the page (FieldStatus), drawn by the in-page UI. */
export const STATUS_ATTR = 'data-paperwise-status';

/** The field the conversation is on. */
export const ACTIVE_ATTR = 'data-paperwise-active';
