import { looksLikeAForm } from '@/shared/form-detect';
import type { ContentEvent, ContentRequest } from '@/shared/messages';
import { openPanel, prefetchFormMap } from './floating-button';
import { handleContentRequest } from './handler';
import { HOST_TAG, mountPageUi, type PageUiHandle } from './page-ui';
import { scanPage } from './scanner';
import { watchFieldChanges, watchUserEdits } from './watchers';

/**
 * Content script: scans fields, fills them, highlights, scrolls,
 * and reports user edits and field changes to the side panel.
 * Runs on every page; the floating button only appears when a form is found.
 * Sensitive field values never leave the page (see scanner.ts → markSensitive).
 *
 * Also injected by the side panel (chrome.scripting) into tabs that were open before the
 * extension (re)loaded. The copy left from before is dead (it can't reach the extension): WXT
 * invalidates it when this one starts, and we replace its UI.
 *
 * In-page UI (teammate's design): one <paperwise-ui> shadow root with the floating button and the
 * field highlights, mounted only when the page has a form or the panel talks to it.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    let ui: PageUiHandle | null = null;
    const ensureUi = () => (ui ??= mountPageUi({ open: openPanel, intent: prefetchFormMap }));
    ctx.onInvalidated(() => ui?.remove());

    const onMessage = (message: ContentRequest, _sender: unknown, sendResponse: (r: unknown) => void) => {
      if (message.type !== 'PING' && message.type !== 'SCAN') ensureUi(); // highlights, fills, progress
      sendResponse(handleContentRequest(message));
      return false;
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));

    /** Send to the side panel. Fine if it isn't open; silent once this copy is dead. */
    const broadcast = (event: ContentEvent) => {
      if (ctx.isInvalid) return;
      try {
        browser.runtime.sendMessage(event).catch(() => {});
      } catch {
        // Extension context invalidated.
      }
    };

    // UI left by an older copy can't open the panel any more (also the pre-UI debug button).
    document.querySelectorAll(`${HOST_TAG}, #paperwise-root`).forEach((el) => el.remove());

    // Forms are often rendered late by JS frameworks: also check whenever fields change.
    let mounted = false;
    // Only on real forms: never for a lone search box or a login.
    const maybeMount = (formLike: boolean) => {
      if (mounted || ctx.isInvalid || !formLike) return;
      ensureUi().showButton();
      mounted = true;
    };
    maybeMount(looksLikeAForm(scanPage()));

    ctx.onInvalidated(
      watchUserEdits((id, r) =>
        broadcast({ type: 'EVENT_USER_EDIT', id, value: r.value, filled: r.filled, sensitive: r.sensitive }),
      ),
    );
    ctx.onInvalidated(
      watchFieldChanges((scan) => {
        maybeMount(looksLikeAForm(scan));
        broadcast({ type: 'EVENT_FIELDS_CHANGED', scan });
      }),
    );
  },
});
