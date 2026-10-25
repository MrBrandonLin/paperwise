// pnpm test:fill — end-to-end check of the fill engine on the real test forms, in headless Chromium.
//
// Injects the real content-script modules (scanner, filler, watchers, request handler) into
// /test/rental.html and /test/rental-react.html, fills every field like the debug panel's
// "Fill everything", submits with a real click and checks the submitted values. Also checks:
// error handling, conditional fields, highlights, user-edit sync, and that sensitive values
// (an SSN typed on the page) never appear in anything the content script sends out.
//
// Needs a Chromium browser. Set CHROME_PATH to override the auto-detected one.
// Serves server/public itself, so `pnpm server` does not need to be running.
import puppeteer from 'puppeteer-core';
import { bundleContentModules, findBrowser, serveTestPages } from './lib/test-browser.mjs';

const executablePath = findBrowser();
const { base: BASE, close: closeServer } = await serveTestPages();
const bundle = await bundleContentModules();

// --- Checks -------------------------------------------------------------------
let failures = 0;
let passes = 0;
const check = (cond, msg) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath, headless: true });
console.log(`Browser: ${executablePath}`);

try {
  for (const [name, path, react] of [
    ['plain', '/test/rental.html', false],
    ['react', '/test/rental-react.html', true],
  ]) {
    console.log(`\n=== ${name} form (${path})`);
    const page = await browser.newPage();
    const external = [];
    page.on('pageerror', (e) => console.log('  page error:', e.message));
    page.on('request', (r) => {
      // data: URLs are the browser's own icons (e.g. the date picker), not network requests.
      if (/^https?:/.test(r.url()) && !r.url().startsWith(BASE)) external.push(r.url());
    });
    await page.goto(BASE + path, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#rental');
    check(external.length === 0, `no internet needed${external.length ? ` (external: ${external.join(', ')})` : ''}`);
    await page.addScriptTag({ content: bundle });

    // ON OPEN: the button check, the watcher, our own button/styles, the panel and the prefetch
    // all want a scan within a second. One real scan must serve them all.
    const open = await page.evaluate(async () => {
      const pw = window.__pw;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const c0 = pw.scanCount();
      const first = pw.scanPage(); // floating button check
      const stop = pw.watchFieldChanges(() => {}); // watcher's first scan
      const root = document.createElement('div');
      root.id = 'paperwise-root';
      document.documentElement.appendChild(root); // our button
      const style = document.createElement('style');
      style.id = 'paperwise-styles';
      document.head.appendChild(style); // our highlight styles
      pw.handle({ type: 'SCAN' }); // side panel
      pw.handle({ type: 'SCAN' }); // prefetch on click
      await sleep(700); // past the watcher's rescan throttle
      const onOpen = pw.scanCount() - c0;
      pw.handle({ type: 'FILL', id: 'pw-cosigner', value: 'X' });
      const afterFill = pw.handle({ type: 'SCAN' }).data.fields.find((f) => f.id === 'pw-cosigner').currentValue;
      const fresh = pw.scanCount() - c0;
      pw.handle({ type: 'FILL', id: 'pw-cosigner', value: '' });
      stop();
      root.remove();
      style.remove();
      return { onOpen, fresh, afterFill, petsLabel: first.fields.find((f) => f.id === 'pw-pets')?.label };
    });
    check(open.onOpen === 1, `one real scan on open (got ${open.onOpen})`);
    check(open.fresh === 2 && open.afterFill === 'X', 'after a fill the next scan is fresh (sees the new value)');
    check(open.petsLabel === 'Do you have pets?', `radio group labelled by its own question: "${open.petsLabel}"`);

    // Start the watchers and record everything they would send to the side panel.
    // Then fill everything, in page order, rescanning after each fill (like the debug panel).
    const fill = await page.evaluate(async () => {
      const pw = window.__pw;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__out = []; // everything that would leave the page
      window.__events = [];
      pw.watchUserEdits((id, r) => {
        const msg = { type: 'EVENT_USER_EDIT', id, ...r };
        __events.push(msg);
        __out.push(msg);
      });
      pw.watchFieldChanges((scan) => {
        const msg = { type: 'EVENT_FIELDS_CHANGED', scan };
        __events.push(msg);
        __out.push(msg);
      });
      const send = (req) => {
        const res = pw.handle(req);
        __out.push(res);
        return res;
      };
      const initial = send({ type: 'SCAN' }).data.fields;
      const initialIds = initial.map((f) => f.id);
      const initialHidden = initial.filter((f) => !f.visible).map((f) => f.id);
      const hiddenFill = pw.handle({ type: 'FILL', id: 'pw-employer', value: 'x' });
      const filled = {};
      for (let i = 0; i < 80; i++) {
        // Visible fields only: hidden ones are filled once their condition reveals them.
        const next = send({ type: 'SCAN' }).data.fields.find((f) => f.visible && !(f.id in filled));
        if (!next) break;
        const requested = pw.testValueFor(next);
        filled[next.id] = {
          name: next.name,
          kind: next.kind,
          sensitive: next.sensitive,
          requested,
          result: send({ type: 'FILL', id: next.id, value: requested }),
        };
        await sleep(150);
      }
      await sleep(800);
      return { initialIds, initialHidden, hiddenFill, filled, events: [...__events] };
    });

    console.log('  initial ids:', fill.initialIds.join(' '), '· hidden:', fill.initialHidden.join(' ') || '—');
    for (const [id, f] of Object.entries(fill.filled)) {
      const shown = f.result.ok ? (f.sensitive ? `(hidden, filled: ${f.result.data.filled})` : `"${f.result.data.value}"`) : f.result.error;
      check(f.result.ok, `fill ${id} (${f.kind}${f.sensitive ? ', sensitive' : ''}) "${f.requested}" → ${shown}`);
    }
    check(!fill.events.some((e) => e.type === 'EVENT_USER_EDIT'), `our own fills are not reported as user edits ${fill.events.filter((e) => e.type === 'EVENT_USER_EDIT').map((e) => `${e.id}=${e.value}`).join(', ')}`);
    if (!react) {
      // Plain form: conditional fields are in the page but hidden → scanned with visible: false.
      check(
        fill.initialHidden.join(',') === 'pw-employer,pw-pets-desc',
        `hidden conditional fields scanned from the start (visible: false): ${fill.initialHidden.join(', ')}`,
      );
      check(!fill.hiddenFill.ok, `filling a hidden field is refused: ${fill.hiddenFill.error}`);
      check(
        fill.events.some((e) => e.type === 'EVENT_FIELDS_CHANGED' && e.scan.fields.find((f) => f.id === 'pw-employer')?.visible),
        'field-change event when the hidden employer field became visible',
      );
    }
    if (react) {
      check(!fill.initialIds.includes('pw-employer') && !fill.initialIds.includes('pw-pets-desc'), 'conditional fields not in the page at start');
      check('pw-employer' in fill.filled && 'pw-pets-desc' in fill.filled, 'conditional fields appeared and got filled');
      check(
        fill.events.some((e) => e.type === 'EVENT_FIELDS_CHANGED' && e.scan.fields.some((f) => f.id === 'pw-pets-desc')),
        'field-change event fired when pets description appeared',
      );
    }

    // Submit with a real click and compare with what was filled.
    await page.click('button[type=submit]');
    await sleep(400);
    const submitted = JSON.parse(await page.$eval('#submitted', (el) => el.textContent));
    for (const [id, f] of Object.entries(fill.filled)) {
      if (!f.result.ok || !f.name) continue;
      let expected = f.result.data.value;
      if (f.kind === 'checkbox') expected = react ? f.result.data.value === 'true' : 'on';
      if (f.sensitive) expected = f.requested; // we never read it back; the page must still have it
      check(submitted[f.name] === expected, `submitted ${f.name} = ${JSON.stringify(submitted[f.name])} (expected ${JSON.stringify(expected)})`);
    }
    check(submitted.gross_monthly_income === '1800', '"1,800" was submitted as 1800');
    check(submitted.employment_status === 'employed' && submitted.pets === 'yes', 'select + radio matched by label');

    // Bad values are refused (old value kept), loose matches accepted, React state in sync.
    const edge = await page.evaluate(async () => {
      const pw = window.__pw;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const r = (id, value) => {
        const x = pw.handle({ type: 'FILL', id, value });
        return x.ok ? `ok:${x.data.value}` : `err:${x.error}`;
      };
      const out = {
        badDate: r('pw-dob', 'next tuesday'),
        fakeDate: r('pw-dob', '2026-02-30'),
        badOption: r('pw-status', 'Astronaut'),
        badNumber: r('pw-income', 'abc'),
        badBool: r('pw-credit', 'maybe'),
        radioUpper: r('pw-pets', 'NO'),
        frenchDecimal: r('pw-income', '1 800,50'),
        negative: r('pw-income', '-5'),
        badEmail: r('pw-email', 'marie at example'),
        uncheck: r('pw-truth', 'no'),
      };
      // Hide then show the employer field: React re-creates it; the id must stay the same.
      out.student = r('pw-status', 'student');
      await sleep(200);
      out.employerGone = !pw.scanPage().fields.some((f) => f.id === 'pw-employer');
      out.selfEmployed = r('pw-status', 'Self-employed');
      await sleep(200);
      out.employerBack = r('pw-employer', 'Own business');
      out.dobAfterErrors = pw.readField('pw-dob').value;
      // Highlight + go to + clear.
      pw.handle({ type: 'HIGHLIGHT', id: 'pw-first', status: 'review' });
      pw.handle({ type: 'HIGHLIGHT', id: 'pw-pets', status: 'filled' });
      pw.handle({ type: 'GO_TO', id: 'pw-pets' });
      out.reviewStatus = document.getElementById('first').getAttribute('data-paperwise-status');
      // The page's own look is untouched: no stylesheet of ours, no outline on its field.
      out.pageStyles = document.querySelectorAll('#paperwise-styles, style[data-paperwise], link[href*="chrome-extension"]').length;
      out.fieldOutline = getComputedStyle(document.getElementById('first')).outlineStyle;
      out.flashes = pw.pageUi.get().flashes.map((f) => `${f.id}=${f.text}`);
      const group = document.querySelector('[role=radiogroup]');
      out.radioGroupHighlighted = group.getAttribute('data-paperwise-status');
      out.activeSet = group.hasAttribute('data-paperwise-active');
      pw.handle({ type: 'CLEAR_HIGHLIGHTS' });
      out.leftAfterClear = document.querySelectorAll('[data-paperwise-status],[data-paperwise-active]').length;
      return out;
    });
    check(edge.badDate.startsWith('err'), `refuses "next tuesday": ${edge.badDate}`);
    check(edge.fakeDate.startsWith('err'), `refuses 2026-02-30: ${edge.fakeDate}`);
    check(edge.badOption.startsWith('err'), `refuses unknown option: ${edge.badOption}`);
    check(edge.badNumber.startsWith('err'), `refuses "abc" for a number: ${edge.badNumber}`);
    check(edge.badBool.startsWith('err'), `refuses "maybe" for a checkbox: ${edge.badBool}`);
    check(edge.radioUpper === 'ok:no', `radio "NO" → ${edge.radioUpper}`);
    check(edge.frenchDecimal.includes('whole number'), `"1 800,50" refused (whole numbers only): ${edge.frenchDecimal}`);
    check(edge.negative.includes('at least 0'), `-5 refused (min 0): ${edge.negative}`);
    check(edge.badEmail.includes('email'), `bad email refused: ${edge.badEmail}`);
    check(edge.uncheck === 'ok:false', `uncheck checkbox → ${edge.uncheck}`);
    check(edge.dobAfterErrors === '1958-03-04', `bad dates left the old date in place (${edge.dobAfterErrors})`);
    if (react) {
      check(edge.employerGone, 'employer field removed when status = student');
      check(edge.employerBack === 'ok:Own business', `re-created employer keeps id pw-employer: ${edge.employerBack}`);
    }
    check(edge.reviewStatus === 'review', `review state set on the field (${edge.reviewStatus}); the in-page UI draws it amber`);
    check(edge.pageStyles === 0 && edge.fieldOutline === 'none', `no styles injected into the page (stylesheets: ${edge.pageStyles}, field outline: ${edge.fieldOutline})`);
    check(edge.flashes.some((f) => f === 'pw-employer=Own business'), `fill animation gets the written value (${edge.flashes.join(', ')})`);
    check(edge.radioGroupHighlighted === 'filled' && edge.activeSet, 'radio group highlighted + marked active as one box');
    check(edge.leftAfterClear === 0, 'clear removes all highlights');

    // Submit again: the page has the new values.
    await page.evaluate(() => window.__pw.handle({ type: 'FILL', id: 'pw-truth', value: 'yes' }));
    await page.click('button[type=submit]');
    await sleep(400);
    const second = JSON.parse(await page.$eval('#submitted', (el) => el.textContent));
    check(
      second.employment_status === 'self' &&
        second.pets === 'no' &&
        second.gross_monthly_income === '1800' &&
        second.email === 'marie.dubois@example.com' &&
        (react ? second.employer === 'Own business' : true),
      `second submit has the new values (status=${second.employment_status}, pets=${second.pets}, income=${second.gross_monthly_income}${react ? `, employer=${second.employer}` : ''})`,
    );

    // Real user typing + clicking is reported.
    await page.evaluate(() => (window.__events.length = 0));
    await page.click('#cosigner');
    await page.$eval('#cosigner', (el) => el.select());
    await page.keyboard.type('Paul Martin');
    await page.click('#credit');
    await sleep(900);
    let edits = await page.evaluate(() => window.__events.filter((e) => e.type === 'EVENT_USER_EDIT'));
    const cosigner = edits.filter((e) => e.id === 'pw-cosigner');
    check(cosigner.length === 1 && cosigner[0].value === 'Paul Martin', `typing reported once, debounced: ${JSON.stringify(cosigner)}`);
    check(edits.some((e) => e.id === 'pw-credit' && e.value === 'false'), 'checkbox click reported');

    // A widget that takes our value, then puts its own back (React date pickers): reported, not a silent success.
    if (!react) {
      const reverted = await page.evaluate(async () => {
        window.__events.length = 0;
        const input = document.querySelector('#cosigner');
        const keep = 'Kept by the widget';
        const reset = () => setTimeout(() => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, keep);
        }, 100);
        input.addEventListener('input', reset);
        const r = window.__pw.handle({ type: 'FILL', id: 'pw-cosigner', value: 'Ana Lopez' });
        await new Promise((res) => setTimeout(res, 900));
        input.removeEventListener('input', reset);
        return { fillOk: r.ok, events: window.__events.filter((e) => e.type === 'EVENT_USER_EDIT' && e.id === 'pw-cosigner').map((e) => e.value) };
      });
      check(reverted.fillOk && reverted.events.includes('Kept by the widget'), `a widget that resets our value is reported (${JSON.stringify(reverted.events)})`);
    }

    // SENSITIVE: the user types an SSN on the page. It must never reach anything we send out.
    const SSN = '987-65-4321';
    await page.evaluate(() => (window.__events.length = 0));
    await page.click('#ssn');
    await page.$eval('#ssn', (el) => el.select());
    await page.keyboard.type(SSN);
    await sleep(900);
    edits = await page.evaluate(() => window.__events.filter((e) => e.type === 'EVENT_USER_EDIT' && e.id === 'pw-ssn'));
    check(
      edits.length === 1 && edits[0].value === '' && edits[0].filled === true && edits[0].sensitive === true,
      `SSN edit reported as filled only: ${JSON.stringify(edits)}`,
    );
    const outAfter = await page.evaluate(() => {
      const pw = window.__pw;
      // Everything the panel could ask for afterwards.
      __out.push(pw.handle({ type: 'SCAN' }));
      __out.push(pw.handle({ type: 'FILL', id: 'pw-ssn', value: '987-65-4321' }));
      __out.push(pw.readField('pw-ssn'));
      __out.push(pw.pageUi.get()); // the in-page UI's data (fill animation)
      return JSON.stringify(__out);
    });
    const leaks = ['987-65-4321', '987654321', '4321', '123-45-6789', '6789'].filter((s) => outAfter.includes(s));
    check(outAfter.includes('"id":"pw-ssn","text":""'), 'SSN fill animation shows a check only, no value');
    check(leaks.length === 0, `no SSN digits in anything sent out of the page or shown by our UI (${(outAfter.length / 1024).toFixed(0)} KB checked${leaks.length ? `, found: ${leaks}` : ''})`);
    await page.click('#credit'); // re-check the required box the user unchecked above
    await page.click('button[type=submit]');
    await sleep(400);
    const third = JSON.parse(await page.$eval('#submitted', (el) => el.textContent));
    check(third.ssn === SSN, 'the page itself still submits the SSN the user typed');

    // Radio group labels on other layouts (plain page only).
    if (!react) {
      const labels = await page.evaluate(() => {
        const box = document.createElement('div');
        box.innerHTML = `
          <fieldset><legend>Habits</legend>
            <label for="q1">Your town</label><input id="q1">
            <p>Do you smoke?</p><div><input type="radio" name="smoke" id="s-y" value="y"><label for="s-y">Yes</label><input type="radio" name="smoke" id="s-n" value="n"><label for="s-n">No</label></div>
          </fieldset>
          <fieldset><legend>Preferred contact</legend>
            <input type="radio" name="contact" id="c-e" value="email"><label for="c-e">Email</label>
            <input type="radio" name="contact" id="c-p" value="phone"><label for="c-p">Phone</label>
          </fieldset>`;
        document.body.appendChild(box);
        window.__pw.markDirty();
        const fields = window.__pw.scanPage().fields;
        box.remove();
        window.__pw.markDirty();
        return { smoke: fields.find((f) => f.id === 'pw-smoke')?.label, contact: fields.find((f) => f.id === 'pw-contact')?.label };
      });
      check(labels.smoke === 'Do you smoke?', `radio group: text just before it, not the section legend ("${labels.smoke}")`);
      check(labels.contact === 'Preferred contact', `radio group alone in a fieldset: the legend ("${labels.contact}")`);
    }

    // Sensitive detection on other kinds of labels (plain page only).
    if (!react) {
      const detected = await page.evaluate(() => {
        const box = document.createElement('div');
        box.innerHTML = `
          <label for="t1">Bank account number</label><input id="t1">
          <label for="t2">IBAN</label><input id="t2">
          <label for="t3">Card number</label><input id="t3">
          <label for="t4">Numéro de sécurité sociale</label><input id="t4">
          <input id="t5" name="applicant_ssn" aria-label="Applicant">
          <input id="accountNumber" aria-label="Your number">
          <input id="t7" autocomplete="cc-csc" aria-label="Code">
          <input id="t8" type="password" aria-label="Choose one">
          <label for="t9">Routing number</label><input id="t9">
          <label for="n1">Account name</label><input id="n1">
          <label for="n2">Shipping address</label><input id="n2">
          <label for="n3">Pinterest profile</label><input id="n3">
          <label for="n4">Company</label><input id="n4">`;
        document.body.appendChild(box);
        window.__pw.markDirty();
        const fields = window.__pw.scanPage().fields;
        box.remove();
        window.__pw.markDirty();
        return Object.fromEntries(fields.filter((f) => /^pw-(t\d|n\d|accountNumber)$/.test(f.id)).map((f) => [f.id, f.sensitive]));
      });
      const want = ['pw-t1', 'pw-t2', 'pw-t3', 'pw-t4', 'pw-t5', 'pw-accountNumber', 'pw-t7', 'pw-t8', 'pw-t9'];
      const notWant = ['pw-n1', 'pw-n2', 'pw-n3', 'pw-n4'];
      check(want.every((id) => detected[id] === true), `sensitive detected: ${want.filter((id) => !detected[id]).join(', ') || 'all 9'}`);
      check(notWant.every((id) => detected[id] === false), `not sensitive: ${notWant.filter((id) => detected[id]).join(', ') || 'all 4 correct'}`);
    }
    await page.close();

    // ENGINE end to end: the side-panel engine drives the real page through the safety rail.
    console.log(`  --- engine on the real ${name} page`);
    const ep = await browser.newPage();
    ep.on('pageerror', (e) => console.log('  page error:', e.message));
    await ep.goto(BASE + path, { waitUntil: 'networkidle0' });
    await ep.waitForSelector('#rental');
    await ep.addScriptTag({ content: bundle });
    const runEngine = () =>
      ep.evaluate(async () => {
        const pw = window.__pw;
        window.__eng ??= pw.makeEngine();
        const eng = window.__eng;
        const out = window.__engOut ?? (window.__engOut = { calls: [], badDate: null, lowLegal: null });
        if (!out.badDate) {
          out.badDate = await eng.callTool('fill_field', { id: 'pw-dob', value: '2026-02-30', display_value: '30 Feb', confidence: 0.95 });
          out.dobAfterBad = document.getElementById('dob').value;
          out.dobStatus = eng.getState().fields['pw-dob'].status;
        }
        for (let i = 0; i < 40; i++) {
          const n = pw.nextField(eng.getState());
          if (!n) return { done: true, out };
          if (n.risk === 'sensitive') {
            if (eng.getState().fields[n.id]?.status === 'needs_typing') return { typing: n.id, out };
            await eng.callTool('request_typing', { id: n.id });
            return { typing: n.id, out };
          }
          const scanned = eng.getState().scan.fields.find((f) => f.id === n.id);
          const value = pw.testValueFor(scanned);
          if (n.risk === 'legal' && !out.lowLegal) {
            out.lowLegal = await eng.callTool('fill_field', { id: n.id, value, display_value: value, confidence: 0.8 });
          }
          const r = await eng.callTool('fill_field', { id: n.id, value, display_value: value, confidence: 0.95 });
          out.calls.push({ id: n.id, ok: r.ok, message: r.message });
          if (!r.ok) return { stuck: n.id, out };
          await new Promise((res) => setTimeout(res, 120));
        }
        return { loop: true, out };
      });
    let step = await runEngine();
    if (step.typing) {
      await ep.click('#ssn');
      await ep.keyboard.type('987-65-4321');
      await sleep(900);
      step = await runEngine();
    }
    const o = step.out;
    check(!o.badDate.ok && o.dobAfterBad === '' && o.dobStatus === 'review', 'engine: impossible date refused, page untouched, field amber');
    check(o.lowLegal && !o.lowLegal.ok, 'engine: legal box at 0.8 confidence refused');
    check(step.done === true, `engine: every applicable question answered (${o.calls.length} fills${step.stuck ? `, stuck on ${step.stuck}` : ''})`);
    check(o.calls.every((c) => c.ok), `engine: all fills ok${o.calls.filter((c) => !c.ok).map((c) => ` · ${c.id}: ${c.message}`).join('')}`);
    if (react) check(o.calls.some((c) => c.id === 'pw-employer') && o.calls.some((c) => c.id === 'pw-pets-desc'), 'engine: asked the fields the answers revealed');
    const review = await ep.evaluate(async () => {
      const r = await window.__eng.callTool('start_review', {});
      return { ok: r.ok, message: r.message, phase: window.__eng.getState().phase, state: JSON.stringify(window.__eng.getState()) };
    });
    check(review.ok && review.phase === 'review', `engine: review starts once everything is answered${review.ok ? '' : ` (${review.message})`}`);
    check(!review.state.includes('4321'), 'engine: the typed SSN is nowhere in the engine state');
    await ep.click('button[type=submit]');
    await sleep(400);
    const sub = JSON.parse(await ep.$eval('#submitted', (el) => el.textContent));
    check(sub.ssn === '987-65-4321' && sub.employment_status === 'employed' && sub.gross_monthly_income === '1800', 'engine: the page submits what the engine filled (and the typed SSN)');
    await ep.close();
  }
} finally {
  await browser.close();
  closeServer();
}

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nALL ${passes} PASSED`);
process.exit(failures ? 1 : 0);
