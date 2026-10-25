/**
 * pnpm test:state — phase 3: validators, the form engine's safety rail, review rules, and the
 * shared reducer (also driven by the mock player, like the teammate's UI will be).
 * Runs in Node: the page is a small fake that behaves like /test/rental.html.
 */
import type { AgentEvent, FormState, Language, ScannedField } from '../src/shared/contract';
import { looksLikeAForm } from '../src/shared/form-detect';
import { detectLanguage } from '../src/shared/languages';
import { FormEngine } from '../src/engine/engine';
import { validateValue } from '../src/engine/validate';
import { askOrder, initialFormState, nextField, progress, reduceFormState } from '../src/shared/form-state';
import { createMockPlayer } from '../src/shared/mock-player';
import { toPanelView } from '../src/ui/adapter';
import { COPY } from '../src/ui/copy';

let failures = 0;
let passes = 0;
const check = (cond: unknown, msg: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
};

import { F, FakePage, rentalMap, scan0 } from './lib/fake-rental';

// ---------------------------------------------------------------------------------------------
console.log('\n=== Validators');
const v = (id: string, value: string, lang: Language = 'en', hint?: string) =>
  validateValue(F(id), hint ? { id, plainQuestion: '', risk: 'none', order: 1, formatHint: hint } : undefined, value, lang, new Date('2026-10-24T12:00:00Z'));
const okv = (r: ReturnType<typeof v>) => (r.ok ? r.value : `ERR ${r.agent}`);
check(okv(v('pw-dob', '1958-03-04')) === '1958-03-04', 'real date ok');
check(!v('pw-dob', '04/03/1958').ok, 'date must be YYYY-MM-DD');
check(!v('pw-dob', '2026-02-30').ok, 'date that does not exist refused');
check(!v('pw-dob', '2030-01-01').ok, 'birth date in the future refused');
check(!v('pw-dob', '1880-01-01').ok, 'birth date 146 years ago refused');
check(okv(v('pw-movein', '2030-01-01')) === '2030-01-01', 'future move-in date fine');
check(okv(v('pw-income', '1,800')) === '1800', '"1,800" → 1800');
check(!v('pw-income', 'abc').ok, 'not a number refused');
check(!v('pw-income', '1800.5', 'en', 'whole number, 0 or more').ok, 'decimals refused when whole numbers only');
check(!v('pw-income', '-5').ok, 'below min 0 refused');
check(okv(v('pw-status', 'Employed')) === 'employed', 'select by label → value');
check(okv(v('pw-status', 'self-employed')) === 'self', 'select, loose match');
check(okv(v('pw-status', 'ret')) === 'retired', 'select, unique prefix');
check(!v('pw-status', 'astronaut').ok, 'unknown option refused');
const bad = v('pw-status', 'astronaut');
check(!bad.ok && bad.agent.includes('Employed (employed)'), 'refusal lists the choices for the agent');
check(okv(v('pw-pets', 'Yes')) === 'yes', 'radio by label');
check(okv(v('pw-credit', 'oui')) === 'true' && okv(v('pw-credit', 'no')) === 'false', 'checkbox yes/no, French too');
check(!v('pw-credit', 'maybe').ok, 'checkbox "maybe" refused');
check(okv(v('pw-email', 'marie@example.com')) === 'marie@example.com' && !v('pw-email', 'marie at example').ok, 'email');
check(okv(v('pw-phone', '555-0142')) === '555-0142' && !v('pw-phone', '12').ok, 'phone');
const sens = v('pw-ssn', '123-45-6789');
check(!sens.ok && sens.agent.includes('request_typing'), 'sensitive never accepted by voice');
check(!v('pw-first', '').ok && okv(v('pw-email', '')) === '', 'required empty refused, optional empty ok');
const fr = v('pw-dob', '2026-02-30', 'fr');
check(!fr.ok && fr.user === 'Cette date n’existe pas.', 'reason for the user in French');
check(!validateValue({ ...F('pw-first'), maxLength: 3 }, undefined, 'Marie', 'en').ok, 'maxLength');
check(!validateValue({ ...F('pw-phone'), pattern: '\\d{3}-\\d{4}' }, undefined, '5550142', 'en').ok, 'page pattern respected');

function setup(language: Language = 'en') {
  const page = new FakePage();
  const engine = new FormEngine(page, language);
  const events: AgentEvent[] = [];
  engine.onEvent((e) => events.push(e));
  engine.setScan(page.scan());
  engine.setMap(rentalMap(language));
  return { page, engine, events, st: () => engine.getState() };
}
const fill = (e: FormEngine, id: string, value: string, confidence = 0.95, display = value) =>
  e.callTool('fill_field', { id, value, display_value: display, confidence });

// ---------------------------------------------------------------------------------------------
console.log('\n=== Engine: valid proposals reach the page');
{
  const { page, engine, st } = setup();
  check(nextField(st())?.id === 'pw-first', 'first question: first name');
  const r = await fill(engine, 'pw-first', 'Marie');
  check(r.ok && st().fields['pw-first']!.status === 'filled' && page.values.get('pw-first') === 'Marie', 'filled on page + in state');
  check(r.message.includes('What is your full name?') === false && r.message.includes('pw-last'), `next: ${r.message}`);
  check(page.calls.some((c) => c.type === 'HIGHLIGHT' && c.id === 'pw-first' && c.status === 'filled'), 'page highlight green');
  const inc = await fill(engine, 'pw-income', '1,800', 0.9, '$1,800');
  check(inc.ok && page.values.get('pw-income') === '1800' && st().fields['pw-income']!.displayValue === '$1,800', 'value normalized for the page, display kept for the user');
  check(engine.getState().fields['pw-income']!.source === 'agent', 'source = agent');
}
{
  const { engine } = setup();
  const r = await engine.callTool('go_to_field', { id: 'pw-first' });
  const ctx = engine.contextForAgent();
  check(r.ok && ctx.includes('Next: pw-first'), 'context for the agent says what is next');
  const first = await fill(engine, 'pw-dob', '1958-03-04');
  check(first.ok, 'can answer out of order');
}
{
  const { engine } = setup();
  const r0 = nextField(engine.getState());
  check(r0?.groupId === 'g-name', 'name fields are grouped');
  await fill(engine, 'pw-dob', '1958-03-04');
  const r = await fill(engine, 'pw-email', 'marie@example.com');
  check(r.message.includes('What is your full name?') && r.message.includes('pw-first + pw-last'), `group question offered: ${r.message}`);
}

console.log('\n=== Engine: bad proposals turn amber, never touch the page');
{
  const { page, engine, st } = setup('fr');
  const r = await fill(engine, 'pw-dob', '2026-02-30');
  check(!r.ok && st().fields['pw-dob']!.status === 'review' && page.fills('pw-dob') === 0, 'invalid date → review, page untouched');
  check(st().fields['pw-dob']!.reviewReason === 'Cette date n’existe pas.', 'reason in the user language (fr)');
  check(page.calls.some((c) => c.type === 'HIGHLIGHT' && c.id === 'pw-dob' && c.status === 'review'), 'page highlight amber');
  check(nextField(st())?.id === 'pw-dob', 'amber field comes back first');
  const low = await fill(engine, 'pw-first', 'Mari', 0.4, 'Mari');
  check(!low.ok && low.message.includes('Read back "Mari"') && page.fills('pw-first') === 0, 'low confidence → confirm first, page untouched');
  check(st().fields['pw-first']!.value === 'Mari', 'the unsure guess is kept for the confirming question');
  const ok = await fill(engine, 'pw-first', 'Marie', 0.95);
  check(ok.ok && st().fields['pw-first']!.status === 'filled' && !st().fields['pw-first']!.reviewReason, 'confirmed → filled, reason cleared');
  const unknown = await fill(engine, 'pw-nope', 'x');
  check(!unknown.ok && unknown.message.includes('Valid ids now'), 'unknown id → list of valid ids');
  page.refuse.add('pw-phone');
  const refused = await fill(engine, 'pw-phone', '555-0142');
  check(!refused.ok && st().fields['pw-phone']!.status === 'review', 'page refusal → review');
}

console.log('\n=== Engine: optional fields can be skipped');
{
  const { page, engine, st } = setup();
  const r = await fill(engine, 'pw-email', '');
  check(r.ok && r.message.startsWith('Skipped') && st().fields['pw-email']!.status === 'skipped', 'empty answer on an optional field → skipped');
  check(page.calls.some((c) => c.type === 'HIGHLIGHT' && c.id === 'pw-email' && c.status === 'skipped'), 'page shows it skipped');
  check(nextField(st())?.id !== 'pw-email', 'next question moves past it');
  const req = await fill(engine, 'pw-phone', '');
  check(!req.ok && st().fields['pw-phone']!.status === 'review', 'a required field cannot be skipped');
}

console.log('\n=== Engine: legal fields need a clear yes');
{
  const { page, engine, st } = setup();
  const r = await fill(engine, 'pw-credit', 'yes', 0.8);
  check(!r.ok && r.message.includes('Because I authorize') && page.fills('pw-credit') === 0, 'legal at 0.8 → read the reason, ask again');
  const r2 = await fill(engine, 'pw-credit', 'yes', 0.95);
  check(r2.ok && page.values.get('pw-credit') === 'true' && st().fields['pw-credit']!.status === 'filled', 'legal at 0.95 → checked');
  const no = await fill(engine, 'pw-truth', 'no', 0.8);
  check(no.ok && page.values.get('pw-truth') === 'false', 'unchecking does not need the higher bar');
}

console.log('\n=== Engine: sensitive fields are typed by the user, never stored');
{
  const { page, engine, st } = setup();
  const r = await fill(engine, 'pw-ssn', '123-45-6789');
  check(!r.ok && r.message.includes('request_typing') && page.fills('pw-ssn') === 0, 'SSN by voice refused');
  const t = await engine.callTool('request_typing', { id: 'pw-ssn' });
  check(t.ok && st().fields['pw-ssn']!.status === 'needs_typing', 'request_typing → needs_typing');
  check(page.calls.some((c) => c.type === 'GO_TO' && c.id === 'pw-ssn' && c.focus === true), 'cursor put in the field');
  await engine.userEdited({ id: 'pw-ssn', value: '', filled: true, sensitive: true });
  check(st().fields['pw-ssn']!.status === 'filled' && st().fields['pw-ssn']!.value === '', 'user typed it: filled, no value kept');
  check(!JSON.stringify(st()).includes('6789'), 'no SSN digits anywhere in state');
}

console.log('\n=== Engine: conditions and hidden fields');
{
  const { engine, st } = setup();
  const hidden = await fill(engine, 'pw-employer', 'Maple Bakery');
  check(!hidden.ok && hidden.message.includes('hidden'), 'hidden employer refused');
  const r = await fill(engine, 'pw-status', 'Employed');
  check(r.ok && st().scan!.fields.find((f) => f.id === 'pw-employer')!.visible, 'answer revealed employer (page rescanned)');
  check(askOrder(st()).some((f) => f.id === 'pw-employer'), 'revealed employer is now in the ask order');
  await fill(engine, 'pw-status', 'student');
  const na = await fill(engine, 'pw-employer', 'Maple Bakery');
  check(!na.ok, 'employer refused again once status = student');
  const p1 = progress(st()).total;
  await fill(engine, 'pw-pets', 'yes');
  check(progress(st()).total === p1 + 1, 'progress counts only fields that apply');
}

console.log('\n=== Engine: user edits on the page');
{
  const { engine, st } = setup();
  await engine.userEdited({ id: 'pw-dob', value: '2026-02-30', filled: true, sensitive: false });
  check(st().fields['pw-dob']!.status === 'review', 'user typed an impossible date → review');
  await engine.userEdited({ id: 'pw-dob', value: '1958-03-04', filled: true, sensitive: false });
  check(st().fields['pw-dob']!.status === 'filled' && st().fields['pw-dob']!.source === 'user', 'user fixed it → filled, source user');
  let stale = false;
  engine.onMapStale = () => (stale = true);
  engine.setScan({ ...st().scan!, fields: [...st().scan!.fields, { ...F('pw-first'), id: 'pw-new', label: 'New' }] });
  check(stale, 'a field the map does not know → map rebuild requested');
}

console.log('\n=== Review rules');
{
  const { engine, events, st } = setup();
  const early = await engine.callTool('start_review', {});
  check(!early.ok && early.message.includes('pw-first'), 'review refused while required fields are missing');
  const answers: [string, string, number?][] = [
    ['pw-first', 'Marie'], ['pw-last', 'Dubois'], ['pw-dob', '1958-03-04'], ['pw-phone', '555-0142'],
    ['pw-status', 'retired'], ['pw-income', '1800'], ['pw-movein', '2026-12-01'], ['pw-pets', 'no'],
    ['pw-credit', 'yes', 0.95], ['pw-truth', 'yes', 0.95],
  ];
  for (const [id, value, c] of answers) await fill(engine, id, value, c ?? 0.95);
  const stillSsn = await engine.callTool('start_review', {});
  check(!stillSsn.ok && stillSsn.message.includes('pw-ssn'), 'still missing the SSN (typed by the user)');
  await engine.userEdited({ id: 'pw-ssn', value: '', filled: true, sensitive: true });
  await fill(engine, 'pw-income', '1800.5'); // amber again
  const amber = await engine.callTool('start_review', {});
  check(!amber.ok && amber.message.includes('pw-income'), 'review refused while a field is amber');
  await fill(engine, 'pw-income', '1800');
  const r = await engine.callTool('start_review', {});
  const data = r.data as { sections: { id: string; items: { id: string; answer: string; confirm: boolean }[] }[] };
  check(r.ok && st().phase === 'review' && st().review?.sectionIds.length === data.sections.length, 'review started');
  const items = data.sections.flatMap((s) => s.items);
  check(items.find((i) => i.id === 'pw-ssn')?.answer === 'typed by you (hidden)', 'SSN read back as "typed by you"');
  check(items.find((i) => i.id === 'pw-credit')?.confirm === true && items.find((i) => i.id === 'pw-first')?.confirm === false, 'legal/important items marked to slow down');
  check(!items.some((i) => i.id === 'pw-employer'), 'fields that do not apply are not read back');
  check(r.message.includes('Never submit'), 'agent told never to submit');
  await engine.callTool('go_to_field', { id: 'pw-status' });
  const rs = events.filter((e) => e.type === 'review_section');
  check(rs.length === 1 && st().review?.currentSectionId === rs[0]!.sectionId, 'going to a field during review highlights its section');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== Shared reducer driven by the mock player (what the teammate\'s UI does)');
{
  let now = 0;
  const q: [number, () => void][] = [];
  const realSet = globalThis.setTimeout;
  (globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms: number) => {
    q.push([now + ms, fn]);
    return q.length;
  };
  (globalThis as unknown as { clearTimeout: unknown }).clearTimeout = () => {};
  let state: FormState = initialFormState('fr');
  const player = createMockPlayer({ language: 'fr' });
  player.subscribe((e) => (state = reduceFormState(state, e)));
  player.send({ type: 'start' });
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [t, fn] = q.shift()!;
    now = t;
    fn();
  }
  (globalThis as unknown as { setTimeout: unknown }).setTimeout = realSet;
  const statuses = Object.values(state.fields).map((f) => f.status);
  check(state.map?.complete && state.map.language === 'fr', 'map streamed in, French');
  check(statuses.every((s) => s === 'filled' || s === 'skipped'), `every field filled or skipped (${statuses.length})`);
  check(state.phase === 'review' && state.review?.currentSectionId === 's4', 'review reached the last section');
  check(state.captions.every((c) => c.final) && state.captions.length > 20, `captions final, partials replaced (${state.captions.length} lines)`);
  check(state.fields['pw-ssn']!.value === '', 'mock SSN carries no value');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== UI adapter: our FormState → the teammate\'s panel');
{
  const fr = COPY.fr;
  const empty = new FormEngine(new FakePage(), 'fr');
  let view = toPanelView(empty.getState());
  check(view.screen === 'loading' && view.bubble.text === fr.reading && !view.canStart, 'no map yet → "reading this form", no start button');
  view = toPanelView(empty.getState(), { notice: 'unsupported' });
  check(view.screen === 'notice' && view.bubble.text === fr.notices.unsupported, `unsupported page → "${view.bubble.text}"`);

  const page = new FakePage();
  const engine = new FormEngine(page, 'fr');
  engine.setScan(page.scan());
  engine.setMap(rentalMap('fr'));
  view = toPanelView(engine.getState());
  check(view.screen === 'ready' && view.canStart && view.bubble.text.includes('Rental application') && view.bubble.text.includes('6 minutes'), 'map ready → intro with title + minutes, start button');
  check(view.progress.total === 13 && view.progress.done === 0, `progress counts applicable fields only (${view.progress.done}/${view.progress.total}: 2 conditional fields hidden)`);

  engine.emitEvent({ type: 'agent_state', mode: 'speaking' });
  engine.emitEvent({ type: 'transcript', role: 'agent', text: 'Bonjour ! Quel est votre nom', final: false, at: 1 });
  view = toPanelView(engine.getState());
  check(view.screen === 'talking' && view.activity === 'speaking' && view.bubble.text === 'Bonjour ! Quel est votre nom' && view.bubble.live, 'agent speaking → live caption in the bubble');
  check(view.bubble.label === 'Champ 1 · First name', `bubble label = the page's own label (${view.bubble.label})`);
  check(view.inConversation && !view.canStart, 'in conversation: typing box + End, no Start');

  engine.emitEvent({ type: 'transcript', role: 'user', text: 'Marie Du', final: false, at: 2 });
  view = toPanelView(engine.getState());
  check(view.userLines.length === 1 && !view.userLines[0]!.final, 'the user\'s words appear while still being heard');

  await engine.callTool('flag_for_review', { id: 'pw-first', reason: 'Je ne suis pas sûr du prénom.' });
  engine.emitEvent({ type: 'flag_for_review', id: 'pw-first', reason: 'Je ne suis pas sûr du prénom.', value: 'Mari', displayValue: 'Mari' });
  await engine.callTool('go_to_field', { id: 'pw-first' });
  view = toPanelView(engine.getState());
  check(view.attention?.kind === 'review' && view.attention.heard === 'Mari' && view.attention.text.includes('pas sûr'), 'unclear answer → amber card with what was heard + why');

  await engine.callTool('request_typing', { id: 'pw-ssn' });
  view = toPanelView(engine.getState());
  check(view.attention?.kind === 'typing' && !view.attention.done && view.attention.title === fr.typeIt, 'SSN → "type it yourself" card');
  await engine.userEdited({ id: 'pw-ssn', value: '', filled: true, sensitive: true });
  view = toPanelView(engine.getState());
  check(view.attention?.kind === 'typing' && view.attention.done, 'SSN typed → card says typed, value never shown');

  await engine.callTool('go_to_field', { id: 'pw-credit' });
  view = toPanelView(engine.getState());
  check(view.attention?.kind === 'legal' && view.attention.text.startsWith('Because I authorize the landlord'), `legal field → "before you agree" note (${view.attention?.text})`);

  await engine.callTool('explain_field', { id: 'pw-income' });
  engine.emitEvent({ type: 'explain_field', id: 'pw-income', explanation: 'Brut = avant impôts.' });
  view = toPanelView(engine.getState());
  check(view.explanation?.text === 'Brut = avant impôts.' && view.explanation.question === 'Q Gross monthly income (USD)', 'explanation card');

  // Fill everything the agent can, then the review read-back.
  const vals: Record<string, string> = { 'pw-first': 'Marie', 'pw-last': 'Dubois', 'pw-dob': '1958-03-04', 'pw-email': '', 'pw-phone': '555-0142', 'pw-status': 'retired', 'pw-income': '1800', 'pw-movein': '2026-12-01', 'pw-pets': 'no', 'pw-cosigner': '', 'pw-credit': 'true', 'pw-truth': 'true' };
  for (const [id, value] of Object.entries(vals)) {
    const r = await engine.callTool('fill_field', { id, value, display_value: value || '', confidence: 0.95 });
    if (!r.ok) console.log('    fill', id, r.message);
  }
  const started = await engine.callTool('start_review', {});
  if (!started.ok) console.log('    start_review:', started.message);
  view = toPanelView(engine.getState());
  check(view.screen === 'review' && view.review?.position === 1 && view.review.items.length > 0, `review → read-back card, section ${view.review?.position} of ${view.review?.total}`);
  const firstSection = view.review!.items;
  const ssn = firstSection.find((i) => i.id === 'pw-ssn');
  check(ssn?.answer === fr.typedOnPage, `review shows the SSN as "${ssn?.answer}", never a value`);
  check(JSON.stringify(view).match(/\d{3}-\d{2}-\d{4}/) === null, 'no SSN-shaped value anywhere in the panel view');
  check(view.progress.done === view.progress.total, `progress complete (${view.progress.done}/${view.progress.total})`);

  engine.emitEvent({ type: 'agent_state', mode: 'off' });
  engine.setPhase('interview');
  view = toPanelView(engine.getState());
  check(view.screen === 'finished' && view.bubble.text === fr.allAnswered, 'all answered + conversation over → "press Submit yourself"');
  const en = toPanelView({ ...engine.getState(), userLanguage: 'en' });
  check(en.bubble.text === COPY.en.allAnswered && en.copy.neverSubmit.includes('never submits'), 'English copy when the user language is English');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== Smarter brain: "come back later", pick-one sets, translation guard');
{
  const { engine, page, st } = setup('en');
  const first = 'pw-dob';
  const r = await engine.callTool('come_back_later', { id: first });
  check(r.ok && st().fields[first]?.later && nextField(st())?.id !== first, `come_back_later: "${first}" moves to the end (next: ${nextField(st())?.id})`);
  const ctx = engine.contextForAgent();
  check(ctx.includes(`Come back to before the review: ${first}`), 'the agent is reminded to come back to it');
  // Answer everything else: the deferred one comes back before the review.
  for (const f of askOrder(st())) if (f.id !== first) st().fields[f.id]!.status = 'filled';
  check(nextField(st())?.id === first, `once the rest is answered, the deferred question comes back (next: ${nextField(st())?.id})`);
  const refused = await engine.callTool('start_review', {});
  check(!refused.ok, 'review waits for it (required)');
  await fill(engine, first, '1958-03-04');
  check(!st().fields[first]?.later, 'answering it clears the mark');

  // Pick one: three checkboxes, one choice.
  const { engine: e2, page: p2, st: s2 } = setup('en');
  const map = s2().map!;
  const boxes = ['pw-credit', 'pw-truth'];
  e2.setMap({ ...map, groups: [...map.groups, { id: 'g-pick', plainQuestion: 'Which one applies?', fieldIds: boxes, pick: 'one' }] });
  p2.values.set('pw-truth', 'true');
  e2.setScan(p2.scan());
  const picked = await fill(e2, 'pw-credit', 'true', 0.95);
  check(picked.ok && p2.values.get('pw-truth') === 'false' && s2().fields['pw-truth']?.status === 'skipped', 'pick one: checking one unchecks and skips the others');

  // Free text must be in the form's language; names never touched.
  const { engine: e3 } = setup('es');
  await fill(e3, 'pw-pets', 'yes'); // reveals "describe your pets"
  const es = await fill(e3, 'pw-pets-desc', 'Un gato que se llama Michi y es muy tranquilo');
  check(!es.ok && /form's language/.test(es.message), 'free text in Spanish on an English form → "translate it" (not written)');
  const en = await fill(e3, 'pw-pets-desc', 'A cat named Michi, very calm');
  check(en.ok, 'the translated text is accepted');
  const name = await fill(e3, 'pw-first', 'José María');
  check(name.ok, 'names are never checked for language (kept as said)');
  void page;
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== When the launcher pops up (real forms only)');
{
  const base = { url: 'https://x.com', pageTitle: 'x' };
  const f = (id: string, kind: ScannedField['kind'], label: string, extra: Partial<ScannedField> = {}): ScannedField => ({ id, kind, label, required: false, visible: true, currentValue: '', filled: false, sensitive: false, ...extra });
  check(looksLikeAForm(scan0), 'the rental application → yes');
  check(!looksLikeAForm({ ...base, fields: [f('q', 'text', 'Search', { name: 'search_query' }), f('h1', 'text', '', { visible: false }), f('h2', 'checkbox', '', { visible: false })] }), 'YouTube-like page (a search box) → no');
  check(!looksLikeAForm({ ...base, fields: [f('u', 'email', 'Email'), f('p', 'password', 'Password'), f('r', 'checkbox', 'Remember me')] }), 'a login → no');
  check(looksLikeAForm({ ...base, fields: [f('n', 'text', 'Name'), f('c', 'select', 'Country')] }), 'name + a choice → yes');
  check(!looksLikeAForm({ ...base, fields: [f('n', 'text', 'Name'), f('e', 'email', 'Email')] }), 'a two-field newsletter box → no');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== Which language the user is speaking (the panel follows without being asked)');
{
  const cases: [string, Language | null][] = [
    ['Четвёртое марта тысяча девятьсот пятьдесят восьмого года.', 'ru'],
    ['اسمي أحمد وأنا أعمل في مخبز', 'ar'],
    ['我叫王伟，我在面包店工作', 'zh'],
    ['मेरा नाम आशा है', 'hi'],
    ['제 이름은 김민준입니다', 'ko'],
    ['Tôi làm việc ở một tiệm bánh', 'vi'],
    ['Me llamo Ana y trabajo en una panadería', 'es'],
    ["Je m'appelle Marie et je suis retraitée", 'fr'],
    ['Eu sou o João e tenho um gato', 'pt'],
    ['Ako po si Maria, salamat po', 'tl'],
    ['My name is Mary and I have a cat', 'en'],
    ['OK', null],
    ['Ana López', null],
    ['555 0142', null],
  ];
  for (const [text, want] of cases) check(detectLanguage(text) === want, `"${text}" → ${detectLanguage(text)} (want ${want})`);
}

console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nALL ${passes} PASSED`);
process.exit(failures ? 1 : 0);
