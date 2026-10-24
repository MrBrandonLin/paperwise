import { useEffect, useState, useSyncExternalStore } from 'react';
import ReactDOM from 'react-dom/client';
import { ACTIVE_ATTR, FIELD_ATTR, STATUS_ATTR } from '@/shared/config';
import type { FieldStatus } from '@/shared/contract';
import { FloatingButton, HighlightLayer, type Box, type FlashBox } from '@/ui/page/PageUi';
import pageCss from '@/ui/styles/page.css?inline';
import logo from '@/ui/assets/logo.png?inline';
import { pageUi } from './page-ui-store';

/**
 * The in-page UI host: one <paperwise-ui> element with a shadow root holding the teammate's
 * floating button + field highlights (React + Tailwind). Nothing else is added to the page:
 * no stylesheet, no classes on the page's elements (highlights are drawn over the fields).
 */
export const HOST_TAG = 'paperwise-ui';

export interface PageUiHandle {
  showButton(): void;
  remove(): void;
}

export function mountPageUi(callbacks: { open: () => void; intent: () => void }): PageUiHandle {
  document.querySelectorAll(HOST_TAG).forEach((el) => el.remove()); // left by an older copy
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: 'open' });
  // A constructed stylesheet: not subject to the page's CSP for inline styles, never in its DOM.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(shadowCss(pageCss));
  shadow.adoptedStyleSheets = [sheet];
  const container = document.createElement('div');
  shadow.appendChild(container);
  document.documentElement.appendChild(host);
  void registerFonts();

  let buttonVisible = false;
  const buttonListeners = new Set<() => void>();
  const root = ReactDOM.createRoot(container);
  root.render(
    <PageUi
      callbacks={callbacks}
      buttonStore={{
        get: () => buttonVisible,
        subscribe: (fn) => {
          buttonListeners.add(fn);
          return () => buttonListeners.delete(fn);
        },
      }}
    />,
  );
  return {
    showButton() {
      buttonVisible = true;
      buttonListeners.forEach((l) => l());
    },
    remove() {
      root.unmount();
      host.remove();
    },
  };
}

function PageUi({
  callbacks,
  buttonStore,
}: {
  callbacks: { open: () => void; intent: () => void };
  buttonStore: { get: () => boolean; subscribe: (fn: () => void) => () => void };
}) {
  const ui = useSyncExternalStore(pageUi.subscribe, pageUi.get);
  const showButton = useSyncExternalStore(buttonStore.subscribe, buttonStore.get);
  const { boxes, flashes } = useTrackedFields(ui.flashes);
  return (
    <>
      <HighlightLayer boxes={boxes} flashes={flashes} language={ui.language} />
      {showButton && <FloatingButton logo={logo} progress={ui.progress} language={ui.language} onOpen={callbacks.open} onIntent={callbacks.intent} />}
    </>
  );
}

/**
 * Where the highlighted fields are on screen, every frame while something is highlighted
 * (pages scroll, resize, animate). Reads the data attributes the filler sets.
 */
function useTrackedFields(flashList: { key: number; id: string; text: string }[]): { boxes: Box[]; flashes: FlashBox[] } {
  const [frame, setFrame] = useState<{ boxes: Box[]; flashes: FlashBox[] }>({ boxes: [], flashes: [] });
  const [version, setVersion] = useState(0);

  // Highlights change → re-read the list of highlighted elements.
  useEffect(() => {
    const mo = new MutationObserver(() => setVersion((v) => v + 1));
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: [STATUS_ATTR, ACTIVE_ATTR] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(`[${STATUS_ATTR}], [${ACTIVE_ATTR}]`)];
    const flashEls = flashList.map((f) => ({ f, el: flashTarget(f.id) }));
    if (els.length === 0 && flashEls.length === 0) {
      setFrame({ boxes: [], flashes: [] });
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      const boxes: Box[] = [];
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (!el.isConnected || r.width === 0 || r.height === 0) return;
        boxes.push({
          key: `${el.getAttribute(FIELD_ATTR) ?? 'g'}-${i}`,
          status: (el.getAttribute(STATUS_ATTR) as FieldStatus | null) ?? null,
          active: el.hasAttribute(ACTIVE_ATTR),
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      });
      const flashes: FlashBox[] = [];
      for (const { f, el } of flashEls) {
        const r = el?.getBoundingClientRect();
        if (r && r.width > 0) flashes.push({ key: f.key, text: f.text, top: r.top, left: r.left, width: r.width, height: r.height });
      }
      const key = JSON.stringify([boxes, flashes]);
      if (key !== last) {
        last = key;
        setFrame({ boxes, flashes });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [version, flashList]);

  return frame;
}

function flashTarget(id: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[${FIELD_ATTR}="${CSS.escape(id)}"]`);
  if (el instanceof HTMLInputElement && el.type === 'radio') return el.closest<HTMLElement>('[role="radiogroup"], fieldset') ?? el;
  return el;
}

/**
 * Tailwind v4's CSS assumes a document, not a shadow root. Two fixes:
 *  - rem → px: rem follows the HOST page's <html> font size (a page at 10px would shrink us)
 *  - @property is ignored inside shadow roots, so Tailwind's internal variables (shadows, rings,
 *    borders…) would have no starting value: give them their initial values, in Tailwind's
 *    lowest layer so utilities still win
 */
export function shadowCss(css: string): string {
  const defaults: string[] = [];
  let out = css.replace(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g, (_m, name: string, body: string) => {
    const initial = /initial-value\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
    if (initial !== undefined) defaults.push(`${name}:${initial}`);
    return '';
  });
  out = out.replace(/(-?\d*\.?\d+)rem\b/g, (_m, n: string) => `${+(Number(n) * 16).toFixed(3)}px`);
  if (defaults.length) out = `@layer properties{:host,*,::before,::after,::backdrop{${defaults.join(';')}}}\n${out}`;
  return out;
}

/** @font-face is ignored in shadow roots: register the bundled fonts on the document instead. */
let fontsRegistered = false;
async function registerFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const faces = [
    ['Paperwise Sans', '/fonts/atkinson-hyperlegible-latin-400-normal.woff2', '400'],
    ['Paperwise Sans', '/fonts/atkinson-hyperlegible-latin-700-normal.woff2', '700'],
    ['Paperwise Display', '/fonts/fraunces-latin-400-normal.woff2', '400'],
    ['Paperwise Display', '/fonts/fraunces-latin-600-normal.woff2', '600'],
  ] as const;
  await Promise.all(
    faces.map(async ([family, path, weight]) => {
      try {
        // Loaded as bytes (not a URL), so a page's font-src policy can't block it.
        const data = await fetch(browser.runtime.getURL(path)).then((r) => r.arrayBuffer());
        const face = new FontFace(family, data, { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        // System fonts are a fine fallback.
      }
    }),
  );
}
