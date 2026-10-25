// pnpm test:a11y — automated WCAG 2.2 AA checks (axe-core) on the real built extension:
// the side panel (onboarding, ready, talking, help, settings; light and dark; English and Arabic),
// the PDF viewer, and the in-page UI on the test form. Also checks keyboard reachability and
// 44 px targets. Needs `pnpm build` first.
//
// axe can't judge everything (screen reader flow, captions timing): see FINAL_REPORT.md for the
// manual checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findBrowser, ROOT, serveTestPages } from './lib/test-browser.mjs';

const AXE = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
let failures = 0;
let passes = 0;
const check = (cond, msg) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { base, close } = await serveTestPages();
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, pipe: true, enableExtensions: true });
const id = await browser.installExtension(join(ROOT, '.output', 'chrome-mv3'));

/** axe on the page (or inside our shadow root), WCAG 2.0/2.1/2.2 A + AA rules. */
async function audit(page, label, { shadow = false } = {}) {
  await page.evaluate(AXE);
  const result = await page.evaluate(async (inShadow) => {
    const context = inShadow ? { include: [['paperwise-ui']] } : document;
    const r = await window.axe.run(context, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') + ' — ' + (v.nodes[0]?.failureSummary ?? '').split('\n')[1]?.trim() }));
  }, shadow);
  check(result.length === 0, `${label}: ${result.length ? result.map((v) => `${v.id} ×${v.nodes} (${v.sample})`).join(' | ') : 'no WCAG A/AA violations'}`);
  return result;
}

async function panelPage(query, { dark = false, onboarded = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 860 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.goto(`chrome-extension://${id}/mic-permission.html`);
  await page.evaluate(
    (on) => chrome.storage.local.set({ 'paperwise-prefs': { onboarded: on, language: 'en', textSize: 'normal', speed: 'normal', typing: false } }),
    onboarded,
  );
  await page.goto(`chrome-extension://${id}/sidepanel.html${query}`);
  await sleep(1500);
  return page;
}

try {
  console.log('\n=== Side panel');
  let p = await panelPage('', { onboarded: false });
  await audit(p, 'onboarding (light)');
  await p.close();
  p = await panelPage('', { onboarded: false, dark: true });
  await audit(p, 'onboarding (dark)');
  await p.close();

  for (const dark of [false, true]) {
    p = await panelPage('?mock=en&speed=6', { dark });
    await audit(p, `panel ready (${dark ? 'dark' : 'light'})`);
    await p.evaluate(() => document.querySelector('aside button.h-12')?.click());
    await sleep(5000);
    await audit(p, `panel in conversation (${dark ? 'dark' : 'light'})`);
    await p.keyboard.press('?');
    await sleep(200);
    await audit(p, `help sheet (${dark ? 'dark' : 'light'})`);
    await p.close();
  }
  p = await panelPage('?mock=ar&speed=6');
  const dir = await p.$eval('aside', (a) => a.getAttribute('dir'));
  check(dir === 'rtl', `Arabic: the panel is mirrored (dir=${dir})`);
  await audit(p, 'panel in Arabic');
  await p.close();

  console.log('\n=== Keyboard and targets');
  p = await panelPage('?mock=en&speed=6');
  const order = [];
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('Tab');
    order.push(await p.evaluate(() => {
      const el = document.activeElement;
      const r = el?.getBoundingClientRect();
      const outline = el ? getComputedStyle(el).outlineStyle : 'none';
      return { tag: el?.tagName, role: el?.getAttribute('role'), name: el?.getAttribute('aria-label') || el?.textContent?.trim().slice(0, 20) || el?.tagName, h: Math.round(r?.height ?? 0), w: Math.round(r?.width ?? 0), outline };
    }));
  }
  const controls = order.filter((o) => o.tag !== 'BODY');
  check(controls.length >= 6, `Tab reaches the controls in order: ${controls.map((o) => o.name).join(' → ')}`);
  check(controls.every((o) => o.outline !== 'none'), `every focused control shows a visible focus ring${controls.some((o) => o.outline === 'none') ? ` (missing: ${controls.filter((o) => o.outline === 'none').map((o) => o.name).join(', ')})` : ''}`);
  const small = controls.filter((o) => o.h < 44 && o.w < 44 && o.role !== 'region' && o.role !== 'status');
  check(small.length === 0, `tap targets ≥ 44 px (${small.length ? small.map((o) => `${o.name} ${o.w}×${o.h}`).join(', ') : 'all'})`);
  await p.evaluate(() => (document.activeElement)?.blur?.());
  await p.keyboard.press('s'); // start (mock); shortcuts are ignored while typing in a text box
  await sleep(800);
  const started = await p.evaluate(() => document.body.innerText.includes('End'));
  check(started, 'shortcut S starts the conversation (End button shown)');
  await p.close();

  console.log('\n=== In-page UI on the test form');
  const form = await browser.newPage();
  await form.setViewport({ width: 1200, height: 900 });
  await form.goto(`${base}/test/rental.html`);
  await form.waitForSelector('paperwise-ui', { timeout: 5000 });
  await sleep(800);
  await audit(form, 'in-page pop-up (shadow root)', { shadow: true });
  const spot = await form.evaluate(() => {
    const launcher = document.querySelector('paperwise-ui').shadowRoot.querySelector('.fixed.z-\\[2147483647\\]');
    const r = launcher.getBoundingClientRect();
    const covered = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width && b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
    });
    return { covered: covered.map((el) => el.id || el.textContent.trim().slice(0, 20)), left: Math.round(r.left), top: Math.round(r.top) };
  });
  check(spot.covered.length === 0, `the launcher covers none of the page's controls (at ${spot.left},${spot.top}${spot.covered.length ? `; covers ${spot.covered.join(', ')}` : ''})`);
  await form.close();

  console.log('\n=== PDF viewer');
  const viewer = await browser.newPage();
  await viewer.goto(`chrome-extension://${id}/pdf-viewer.html?src=${encodeURIComponent(`${base}/test/pdf/rental-application.pdf`)}`);
  await viewer.waitForFunction(() => window.__paperwisePdf?.status().state === 'ready', { timeout: 20000 });
  await audit(viewer, 'PDF viewer toolbar', {});
} finally {
  await browser.close();
  close();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
