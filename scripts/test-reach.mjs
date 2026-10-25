// pnpm test:reach — the side panel reaches the page even when the tab was open before the
// extension (re)loaded, in real Chromium with the real built extension (.output/chrome-mv3).
//
//   1. Open the test form → the content script runs, the panel's SCAN works.
//   2. Reinstall the extension (as a reload does) → the tab keeps a dead copy (the "Cannot reach this page" bug).
//   3. The panel's toContent() injects the script once and retries: SCAN and FILL work, there is
//      one live button, user edits reach the extension.
//   4. Injected twice into a live tab → the older copy stops (no duplicate events, one button).
//   Also a tab opened before the extension existed (no copy at all).
//   5. chrome:// pages → "Paperwise can't work on this page."
//   6. The teammate's UI: in-page shadow root (his styles, nothing added to the page) and the
//      side panel (friendly notices, Shift+D debug, mock session).
//
// Needs `pnpm build` first (pnpm check does it). Set CHROME_PATH to override the browser.
import * as esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findBrowser, ROOT, serveTestPages } from './lib/test-browser.mjs';

const EXT = join(ROOT, '.output/chrome-mv3');
if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error('No build found: run `pnpm build` first.');
  process.exit(2);
}

let failures = 0;
let passes = 0;
const check = (cond, msg) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The panel's real messaging module, runnable inside an extension page.
const { outputFiles } = await esbuild.build({
  stdin: {
    contents: `globalThis.browser ??= chrome; import * as m from './src/lib/messaging.ts'; window.__reach = m;`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  write: false,
  plugins: [
    {
      name: 'alias',
      setup(b) {
        b.onResolve({ filter: /^@\// }, (a) => ({ path: join(ROOT, 'src', a.path.slice(2)) + '.ts' }));
        b.onResolve({ filter: /^wxt\// }, (a) => ({ path: a.path, external: true })); // type-only
      },
    },
  ],
});
const reachBundle = outputFiles[0].text;

const { base: BASE, close: closeServer } = await serveTestPages();
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, pipe: true, enableExtensions: true });

/** An extension page with the panel's messaging module loaded. */
async function extensionPage(extId) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extId}/mic-permission.html`);
  await page.evaluate(reachBundle);
  // Collect content-script events, like the panel does.
  await page.evaluate(() => {
    window.__events = [];
    chrome.runtime.onMessage.addListener((m) => void window.__events.push(m));
  });
  return page;
}

try {
  const early = await browser.newPage();
  await early.goto(`${BASE}/test/rental-react.html`);
  await early.waitForSelector('#rental');
  const extId = await browser.installExtension(EXT);
  console.log(`Extension ${extId} from ${EXT}`);

  // --- 1. Normal case ----------------------------------------------------------------------
  console.log('\n=== Tab opened after the extension loaded');
  const form = await browser.newPage();
  // Live bug report: "Unsafe attempt to load URL chrome-extension://…/fonts/… from frame https://www.youtube.com".
  // The page must never load extension files itself: fonts arrive as bytes from the background.
  const extensionLoads = [];
  form.on('request', (r) => r.url().startsWith('chrome-extension://') && extensionLoads.push(r.url()));
  form.on('console', (m) => /Unsafe attempt to load URL chrome-extension/.test(m.text()) && extensionLoads.push(m.text()));
  await form.setViewport({ width: 1440, height: 900 }); // a laptop: room for the pop-up beside the form
  await form.goto(`${BASE}/test/rental.html`);
  await form.waitForSelector('paperwise-ui', { timeout: 5000 });
  // Count buttons mounted from now on (each content-script copy mounts its own).
  await form.evaluate(() => {
    window.__mounts = 0;
    new MutationObserver((rs) => {
      for (const r of rs) for (const n of r.addedNodes) if (n.tagName === 'PAPERWISE-UI') window.__mounts++;
    }).observe(document.documentElement, { childList: true });
  });
  let ext = await extensionPage(extId);
  const tabId = await ext.evaluate(async (url) => (await chrome.tabs.query({ url: `${url}*` }))[0]?.id, `${BASE}/test/rental.html`);
  let scan = await ext.evaluate((id) => window.__reach.toContent(id, { type: 'SCAN' }), tabId);
  check(scan.ok && scan.data.fields.length > 10, `SCAN works (${scan.ok ? scan.data.fields.length + ' fields' : scan.error})`);
  check((await form.evaluate(() => window.__mounts)) === 0, 'live content script: nothing injected');

  // --- 2. Reload the extension: the tab now holds a dead copy -----------------------------
  console.log('\n=== Extension reinstalled while the tab was open');
  await browser.uninstallExtension(extId);
  check((await browser.installExtension(EXT)) === extId, 'reinstalled with the same id');
  ext = await extensionPage(extId);
  const direct = await ext.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'SCAN' }).then(() => 'reached', (e) => String(e)), tabId);
  check(direct !== 'reached', `the old copy is unreachable (the bug: ${direct.slice(0, 70)})`);

  // Two requests at once, like the panel on open: one injection serves both.
  const [a, b] = await ext.evaluate(
    (id) => Promise.all([window.__reach.toContent(id, { type: 'SCAN' }), window.__reach.toContent(id, { type: 'SCAN' })]),
    tabId,
  );
  check(a.ok && b.ok && a.data.fields.length === scan.data.fields.length, `SCAN works after auto-inject (${a.ok ? a.data.fields.length : a.error} / ${b.ok ? b.data.fields.length : b.error} fields)`);
  check((await form.evaluate(() => window.__mounts)) === 1, `injected once for two requests (buttons mounted: ${await form.evaluate(() => window.__mounts)})`);
  check((await form.$$('paperwise-ui')).length === 1, 'one floating button (the dead one replaced)');

  const fill = await ext.evaluate((id) => window.__reach.toContent(id, { type: 'FILL', id: 'pw-first', value: 'Amina' }), tabId);
  check(fill.ok && (await form.$eval('#first', (e) => e.value)) === 'Amina', `FILL works after auto-inject (${fill.ok ? 'filled' : fill.error})`);

  await form.bringToFront();
  await form.click('#last');
  await form.keyboard.type('Diallo');
  await sleep(900); // typing debounce
  let edits = await ext.evaluate(() => window.__events.filter((e) => e.type === 'EVENT_USER_EDIT'));
  check(edits.length === 1 && edits[0].value === 'Diallo', `user edits reach the panel from the new copy (${edits.length} event(s))`);

  console.log('\n=== Tab opened before the extension was installed');
  const earlyTab = await ext.evaluate(async (url) => (await chrome.tabs.query({ url: `${url}*` }))[0]?.id, `${BASE}/test/rental-react.html`);
  const e = await ext.evaluate((id) => window.__reach.toContent(id, { type: 'SCAN' }), earlyTab);
  check(e.ok && e.data.fields.length > 5, `SCAN works (${e.ok ? e.data.fields.length + ' fields' : e.error})`);
  check((await early.$$('paperwise-ui')).length === 1, 'floating button appears');

  // --- 3. Injected again into a live tab: the older copy must stop ------------------------
  console.log('\n=== Injected twice into a live tab');
  await ext.evaluate(async (id) => {
    const files = chrome.runtime.getManifest().content_scripts[0].js;
    await chrome.scripting.executeScript({ target: { tabId: id }, files });
    window.__events.length = 0;
  }, tabId);
  await form.click('#phone');
  await form.keyboard.type('5550142');
  await sleep(900);
  // (Leaving #last fires its real change event too; only the phone edit counts here.)
  edits = await ext.evaluate(() => window.__events.filter((e) => e.type === 'EVENT_USER_EDIT' && e.id === 'pw-phone'));
  check(edits.length === 1, `one event per edit, not one per copy (${edits.map((e) => `${e.id}=${e.value}`).join(", ")})`);
  check((await form.$$('paperwise-ui')).length === 1, 'still one floating button');
  scan = await ext.evaluate((id) => window.__reach.toContent(id, { type: 'SCAN' }), tabId);
  check(scan.ok, 'SCAN still works');

  // --- In-page UI (teammate's design) ------------------------------------------------------
  console.log("\n=== In-page UI: his styles in a shadow root, nothing added to the page");
  const send = (m) => ext.evaluate((id, m) => window.__reach.toContent(id, m), tabId, m);
  await send({ type: 'PROGRESS', done: 4, total: 13, language: 'fr' });
  await send({ type: 'HIGHLIGHT', id: 'pw-dob', status: 'review' });
  await send({ type: 'HIGHLIGHT', id: 'pw-ssn', status: 'needs_typing' });
  await send({ type: 'GO_TO', id: 'pw-email' });
  await send({ type: 'FILL', id: 'pw-movein', value: '2026-12-01' });
  await sleep(300);
  // His "Form detected" pop-up comes first; "Not now" turns it into the compact pill.
  const prompt = await form.evaluate(() => {
    const root = document.querySelector('paperwise-ui')?.shadowRoot;
    const dialog = root?.querySelector('[role="dialog"]');
    const notNow = [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Pas maintenant');
    notNow?.click();
    return { title: dialog?.getAttribute('aria-label'), dismissed: !!notNow };
  });
  check(prompt.title === 'Besoin d’aide pour le remplir ?' && prompt.dismissed, `"Form detected" pop-up first, in French (${prompt.title})`);
  await sleep(100);
  const ui = await form.evaluate(async () => {
    const host = document.querySelector('paperwise-ui');
    const root = host?.shadowRoot;
    const btn = root?.querySelector('button');
    await document.fonts.ready;
    const cs = btn && getComputedStyle(btn);
    const review = root?.querySelector('[data-status="review"]');
    return {
      shadow: !!root,
      label: btn?.getAttribute('aria-label'),
      text: btn?.textContent,
      font: cs?.fontFamily,
      fontLoaded: document.fonts.check('16px "Paperwise Sans"'),
      height: btn?.getBoundingClientRect().height,
      bg: cs?.backgroundColor,
      // The amber halo is a Tailwind shadow utility: built from --tw-* variables that only have a
      // starting value thanks to the @property fix (shadow roots ignore @property).
      shadow: review && getComputedStyle(review).boxShadow,
      reviewBorder: review && getComputedStyle(review).borderTopColor,
      typing: !!root?.querySelector('[data-status="needs_typing"]'),
      active: !!root?.querySelector('[data-active]'),
      flash: root?.textContent?.includes('2026-12-01'),
      pageStyles: [...document.querySelectorAll('style, link[rel=stylesheet]')].filter((e) => /paperwise|tailwind/i.test(`${e.textContent}${e.href ?? ''}`)).length,
      adopted: document.adoptedStyleSheets.length,
      fieldOutline: getComputedStyle(document.getElementById('dob')).outlineStyle,
    };
  });
  check(ui.shadow && ui.label?.startsWith('Paperwise :'), `floating button in our shadow root, French label (${ui.label})`);
  check(ui.text?.includes('4/13'), `progress from the panel shown on the button (${ui.text})`);
  check(ui.font?.startsWith('"Paperwise Sans"') && ui.fontLoaded, `his font (Atkinson Hyperlegible, bundled) is used and loaded (${ui.font})`);
  check(ui.bg && ui.bg !== 'rgba(0, 0, 0, 0)', `Tailwind styles apply inside the shadow root (background ${ui.bg})`);
  check(ui.height === 56, `button is h-14 = 56 px (${ui.height})`);
  check(ui.shadow && ui.shadow !== 'none', `Tailwind shadow utilities work in the shadow root (@property fix): ${ui.shadow?.slice(0, 60)}`);
  check(/^oklch\(0\.(78 0\.11|8 0\.12) 80/.test(ui.reviewBorder ?? ''), `review field drawn amber, light or dark theme (${ui.reviewBorder})`);
  check(ui.typing && ui.active, 'type-it-yourself and active-field highlights drawn');
  check(ui.flash, 'fill animation shows the written value');
  check(extensionLoads.length === 0, `the page loads no extension files (fonts come as bytes, no "Unsafe attempt to load URL"): ${extensionLoads.length ? extensionLoads.join(', ') : 'none'}`);
  check(ui.pageStyles === 0 && ui.adopted === 0 && ui.fieldOutline === 'none', `nothing added to the page's styles (style tags: ${ui.pageStyles}, adopted: ${ui.adopted}, field outline: ${ui.fieldOutline})`);
  const scaled = await form.evaluate(() => {
    document.documentElement.style.fontSize = '10px'; // a page with a small root font
    return document.querySelector('paperwise-ui').shadowRoot.querySelector('button').getBoundingClientRect().height;
  });
  check(scaled === 56, `the page's root font size doesn't shrink our UI (${scaled} px at html 10px)`);

  // --- Side panel (teammate's design) --------------------------------------------------------
  console.log("\n=== Side panel: his UI, wired to the engine; debug behind Shift+D");
  // First run shows the onboarding: covered below; the rest of the checks start after it.
  const firstRun = await browser.newPage();
  await firstRun.goto(`chrome-extension://${extId}/sidepanel.html`);
  const onboarding = await firstRun.waitForFunction(() => document.body.innerText.includes('Which language do you want to use?'), { timeout: 5000 }).then(() => true, () => false);
  check(onboarding, 'first run: onboarding (what Paperwise does, language choice)');
  await firstRun.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Skip')?.click());
  await firstRun.waitForSelector('aside[aria-label="Paperwise"]', { timeout: 5000 });
  check(true, 'skipping the onboarding opens the panel (and it is not shown again)');
  await firstRun.close();
  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('aside[aria-label="Paperwise"]', { timeout: 5000 });
  await sleep(500);
  // The panel's own tab is the active one: an extension page, so the friendly notice.
  let panelText = await panel.$eval('aside', (el) => el.textContent);
  check(panelText.includes('can’t work on this page'), 'his panel renders, with the friendly "can’t work on this page"');
  check(!/Cannot reach|scan error/.test(panelText), 'no technical error shown to the user');
  await panel.keyboard.down('Shift');
  await panel.keyboard.press('KeyD');
  await panel.keyboard.up('Shift');
  const debugShown = await panel.evaluate(() => document.querySelector('h1')?.textContent ?? '');
  check(debugShown.includes('Paperwise (debug)'), 'Shift+D opens the debug panel');
  await panel.keyboard.down('Shift');
  await panel.keyboard.press('KeyD');
  await panel.keyboard.up('Shift');
  check(!!(await panel.$('aside[aria-label="Paperwise"]')), 'Shift+D again: back to the real panel');
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?mock=en&speed=4`);
  await panel.waitForSelector('aside button.h-12', { timeout: 5000 });
  await panel.click('aside button.h-12');
  await sleep(4000);
  panelText = await panel.$eval('aside', (el) => el.textContent);
  check(panelText.includes('Conversation') && /\d+\/\d+ complete/.test(panelText), 'mock session through his panel: conversation captions + progress');
  // Noisy room: Settings → hold to talk. The talk button listens only while held (mouse or Space).
  await panel.click('aside button[aria-label="Settings"]');
  await panel.evaluate(() => [...document.querySelectorAll('aside label')].find((l) => l.textContent.includes('hold to talk'))?.querySelector('input')?.click());
  await panel.click('aside button[aria-label="Settings"]');
  const holdBtn = await panel.waitForSelector('aside button.h-16[aria-pressed]', { timeout: 3000 }).catch(() => null);
  const pressed = async () => panel.$eval('aside button.h-16[aria-pressed]', (b) => b.getAttribute('aria-pressed') + '|' + b.textContent.trim());
  const idle = holdBtn ? await pressed() : '';
  const box = holdBtn ? await holdBtn.boundingBox() : null;
  if (box) {
    await panel.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await panel.mouse.down();
  }
  const down = holdBtn ? await pressed() : '';
  if (box) await panel.mouse.up();
  const up = holdBtn ? await pressed() : '';
  await panel.evaluate(() => document.activeElement?.blur());
  await panel.keyboard.down('Space');
  const space = holdBtn ? await pressed() : '';
  await panel.keyboard.up('Space');
  const spaceUp = holdBtn ? await pressed() : '';
  check(
    idle.startsWith('false|Hold to talk') && down.startsWith('true|Listening') && up.startsWith('false') && space.startsWith('true') && spaceUp.startsWith('false'),
    `hold to talk: idle "${idle}", held "${down}", let go "${up}", Space "${space}" → "${spaceUp}"`,
  );

  // --- 4. Pages extensions can't touch -----------------------------------------------------
  console.log("\n=== Pages where extensions can't run");
  const chromePage = await browser.newPage();
  await chromePage.goto('chrome://version');
  const chromeTab = await ext.evaluate(async () => (await chrome.tabs.query({ url: 'chrome://version/*' }))[0]?.id);
  const res = await ext.evaluate((id) => window.__reach.toContent(id, { type: 'SCAN' }), chromeTab);
  check(!res.ok && res.error === "Paperwise can't work on this page.", `chrome://version → "${res.ok ? 'ok?!' : res.error}"`);
  const urls = await ext.evaluate(() =>
    [
      'https://chromewebstore.google.com/detail/abc',
      'https://chrome.google.com/webstore/detail/abc',
      'chrome://extensions',
      'about:blank',
      'view-source:https://example.com',
      'chrome-extension://abc/page.html',
      'https://example.com/apply',
      'http://localhost:8787/test/rental.html',
    ].map((u) => [u, window.__reach.isScriptableUrl(u)]),
  );
  const expected = [false, false, false, false, false, false, true, true];
  check(urls.every(([, ok], i) => ok === expected[i]), `URL rules: ${urls.map(([u, ok]) => `${ok ? '✓' : '✗'} ${u}`).join(', ')}`);
} finally {
  await browser.close();
  closeServer();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
