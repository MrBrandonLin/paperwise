import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { X } from 'lucide-react';
import ReactDOM from 'react-dom/client';
import { ACTIVE_ATTR, FIELD_ATTR, STATUS_ATTR } from '@/shared/config';
import type { FieldStatus } from '@/shared/contract';
import { FloatingButton, FormPrompt, HighlightLayer, type Box, type FlashBox } from '@/ui/page/PageUi';
import pageCss from '@/ui/styles/page.css?inline';
import logo from '@/ui/assets/logo.png?inline';
import type { BackgroundRequest, FontFile, Result } from '@/shared/messages';
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
  // The browser's top layer: above every z-index on the page (ads, sticky headers, chat widgets).
  // The host covers the screen but takes no clicks; only our own buttons do.
  host.setAttribute(
    'style',
    'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;pointer-events:none!important;max-width:none!important;max-height:none!important;color-scheme:normal!important',
  );
  try {
    host.popover = 'manual';
    host.showPopover();
  } catch {
    // No popover support: the max z-index inside still applies.
  }
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
  // First appearance on a page: the pop-up. Opened or dismissed → the compact pill.
  const [prompting, setPrompting] = useState(true);
  const open = () => {
    setPrompting(false);
    callbacks.open();
  };
  // "Hide for now": until the page reloads (the toolbar icon still opens Paperwise).
  const [hidden, setHidden] = useState(false);
  return (
    <>
      <HighlightLayer boxes={boxes} flashes={flashes} language={ui.language} />
      {showButton && !hidden && (
        <Launcher
          key={prompting ? 'prompt' : 'pill'}
          hideLabel={HIDE[ui.language] ?? HIDE.en}
          onHide={prompting ? undefined : () => setHidden(true)}
          // No free corner for the big pop-up: the small pill instead, never over the page.
          onCrowded={prompting ? () => setPrompting(false) : undefined}
        >
          {prompting ? (
            <FormPrompt language={ui.language} onOpen={open} onIntent={callbacks.intent} onDismiss={() => setPrompting(false)} />
          ) : (
            <FloatingButton logo={logo} progress={ui.progress} language={ui.language} onOpen={callbacks.open} onIntent={callbacks.intent} />
          )}
        </Launcher>
      )}
    </>
  );
}

const HIDE: Partial<Record<string, string>> & { en: string } = {
  en: 'Hide Paperwise on this page',
  es: 'Ocultar Paperwise en esta página',
  fr: 'Masquer Paperwise sur cette page',
  ar: 'إخفاء Paperwise في هذه الصفحة',
};

const MARGIN = 20;
const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [contenteditable="true"]';

/**
 * Where the launcher sits: a screen corner where nothing of the page's own (buttons, links,
 * fields) is underneath it. Re-checked after scrolling and resizing; glides there. The user
 * can also drag it anywhere (then it stays put) or hide it.
 */
function Launcher({ children, onHide, onCrowded, hideLabel }: { children: ReactNode; onHide?: () => void; onCrowded?: () => void; hideLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragged = useRef(false);

  useLayoutEffect(() => {
    const place = () => {
      if (dragged.current || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const spot = freeSpot(r.width, r.height, ref.current);
      if (spot.covered > 0 && onCrowded) {
        onCrowded();
        return;
      }
      setPos({ left: spot.left, top: spot.top });
    };
    place();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(place, 350);
    };
    window.addEventListener('scroll', later, { passive: true, capture: true });
    window.addEventListener('resize', later);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', later);
    };
  }, []);

  // Drag to move (pointer). A drag is not a click: the click that ends it is swallowed.
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !pos) return;
    drag.current = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) ref.current.setPointerCapture(e.pointerId);
    d.moved = true;
    dragged.current = true;
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(window.innerWidth - r.width - 4, Math.max(4, d.left + dx)),
      top: Math.min(window.innerHeight - r.height - 4, Math.max(4, d.top + dy)),
    });
  };
  const onPointerUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    if (moved) {
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      ref.current?.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => ref.current?.removeEventListener('click', swallow, { capture: true }), 0);
    }
  };

  return (
    <div
      ref={ref}
      className={`pointer-events-auto fixed z-[2147483647] flex items-center gap-1.5 ${dragged.current ? '' : 'launcher-glide'}`}
      style={pos ? { left: pos.left, top: pos.top } : { right: 24, bottom: 24, visibility: 'hidden' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
      {onHide && (
        <button
          type="button"
          aria-label={hideLabel}
          title={hideLabel}
          onClick={onHide}
          className="glass-light flex size-11 cursor-pointer items-center justify-center rounded-full bg-card/80 text-muted-foreground shadow-paper hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  );
}

/**
 * The screen corner covering the least of the page's own controls (buttons, links, fields):
 * none, on most pages. Checks every control's box against the launcher's box at each corner.
 */
function freeSpot(w: number, h: number, self: Element): { left: number; top: number; covered: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates = [
    { left: vw - w - MARGIN, top: vh - h - MARGIN }, // bottom right (his design)
    { left: MARGIN, top: vh - h - MARGIN }, // bottom left
    { left: vw - w - MARGIN, top: Math.round(vh / 2 - h / 2) }, // middle right
    { left: MARGIN, top: Math.round(vh / 2 - h / 2) }, // middle left
    { left: vw - w - MARGIN, top: MARGIN + 64 }, // top right, below a typical header
    { left: MARGIN, top: MARGIN + 64 }, // top left
  ];
  const root = self.getRootNode();
  const host = root instanceof ShadowRoot ? root.host : null;
  const PAD = 8;
  const controls: DOMRect[] = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (el === host) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) controls.push(r);
  }
  const covered = (c: { left: number; top: number }) => {
    let area = 0;
    for (const r of controls) {
      const x = Math.min(r.right, c.left + w + PAD) - Math.max(r.left, c.left - PAD);
      const y = Math.min(r.bottom, c.top + h + PAD) - Math.max(r.top, c.top - PAD);
      if (x > 0 && y > 0) area += x * y;
    }
    return area;
  };
  let best = candidates[0]!;
  let bestArea = Infinity;
  for (const c of candidates) {
    const a = covered(c);
    if (a === 0) return { ...c, covered: 0 };
    if (a < bestArea) {
      best = c;
      bestArea = a;
    }
  }
  return { ...best, covered: bestArea };
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
  // The background reads the font files and sends their bytes: the page never loads an extension
  // URL (after an extension reload Chrome logs "Unsafe attempt to load URL chrome-extension://…" for
  // those on every page), and bytes can't be blocked by a page's font-src policy.
  let fonts: FontFile[] = [];
  try {
    const res = (await browser.runtime.sendMessage({ type: 'GET_FONTS' } satisfies BackgroundRequest)) as Result<FontFile[]> | undefined;
    if (res?.ok) fonts = res.data;
  } catch {
    return; // extension reloaded: system fonts are a fine fallback
  }
  await Promise.all(
    fonts.map(async ({ family, weight, base64 }) => {
      try {
        const face = new FontFace(family, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        // System fonts are a fine fallback.
      }
    }),
  );
}
