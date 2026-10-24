import type { ContentRequest, Result } from '@/shared/messages';
import { clearHighlights, fillField, goToField, highlightField } from './filler';
import { pageUi } from './page-ui-store';
import { scanPage } from './scanner';

/**
 * Everything the content script answers to the side panel goes through here.
 * No browser.* calls, so test:fill can check exactly what leaves the page.
 */
export function handleContentRequest(message: ContentRequest): Result<unknown> {
  try {
    switch (message.type) {
      case 'PING':
        return { ok: true, data: 'pong' };
      case 'SCAN':
        return { ok: true, data: scanPage() };
      case 'FILL':
        return fillField(message.id, message.value);
      case 'HIGHLIGHT':
        return highlightField(message.id, message.status);
      case 'GO_TO':
        return goToField(message.id, message.focus);
      case 'CLEAR_HIGHLIGHTS':
        return clearHighlights();
      case 'PROGRESS':
        pageUi.setProgress(message.done, message.total, message.language);
        return { ok: true, data: null };
      default:
        return { ok: false, error: 'Unknown message' };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
