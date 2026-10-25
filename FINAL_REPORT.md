# Paperwise: final report (finishing pass, 2026-10-24)

Everything below was run on this machine tonight, against the real ElevenLabs agent and real
Gemini unless it says otherwise. `AUDIT.md` lists the starting point.

## 1. What works end to end, and how it was verified

| Journey | Verified with |
|---|---|
| Rental form (`/test/rental.html`), whole conversation by voice, in **English, Spanish and French**: greeting, every question, "what does gross mean?", a correction, a typed answer, SSN typed on the page, legal boxes after a clear yes, review read-back, "press Submit yourself" | `voice:sim --lang en/es/fr` — the real agent + a simulated user (ElevenLabs text-to-speech streamed as microphone audio) driving the real engine. All three pass every check. |
| React form (`/test/rental-react.html`): questions that appear as you answer get mapped mid-conversation | `voice:sim --form rental-react --lang fr` — passes |
| IRS W-9 PDF by voice: the 7 "pick one" boxes asked as one question, the 3 SSN boxes typed by the user, name / street kept as said, review | `voice:sim --form w9 --lang en / fr` — pass (after two fixes: exact digits, pick-one boxes labelled); `--lang es` — one speech-recognition miss, see section 2 |
| Switch language mid-conversation ("¿podemos hablar en español?"): the agent switches at once, answers kept, the panel follows | `voice:sim --scenario switch` — passes |
| Switching WITHOUT asking (the user just starts answering in Russian): the agent answers in Russian from then on, the panel follows (live bug, fixed: prompt + panel detection + a correction if the agent replies in the wrong language) | `voice:sim --scenario drift` — 2 runs: the switch works in both; one run had a long pause from ElevenLabs speech recognition on a phone number spoken in Russian |
| Unsupported language (Haitian Creole): "I'm sorry, I don't speak Haitian Creole yet. But I can speak French, which is close." | `voice:sim --scenario unsupported` — passes |
| Typing only (no microphone): the same agent answers in text, no audio | ElevenLabs text-only session tested live (2 replies, 0 audio chunks); panel: "Start by typing", "Type instead", or typing in the box starts it |
| Fill engine on both test forms (native setter, React-controlled, conditions, user edits, our own fills not echoed, a widget that resets our value is reported) | `pnpm test:fill` — 148 |
| Safety rail, validators, review rules, come back later, pick-one, translation guard, form detection | `pnpm test:state` — 111 |
| Voice session wiring (tools, never-guess, explanation capture, typed answers, language switch) | `pnpm test:voice` — 58 |
| PDFs: labels from tooltips / page text, viewer, friendly errors, download after review (button and panel done screen), pdf-lib export read back by pdf-lib, pdf.js and Apple PDFKit | `pnpm test:pdf` — 120 |
| Extension in Chromium: auto-inject, in-page UI in a shadow root, onboarding, Shift+D, mock session | `pnpm test:reach` — 35 |
| Accessibility (axe-core WCAG 2.2 A/AA, keyboard, focus, targets, RTL, launcher placement) | `pnpm test:a11y` — 17 |
| Form maps (streaming, cache, fallback, merge), Windows paths | `test:form-map` — 74, `test:paths` |
| Everything ready for the demo | `pnpm demo:check` → READY |

## 2. Languages and latency

Conversation languages: **English, Spanish, French, Arabic, Portuguese, Mandarin Chinese, Russian,
Vietnamese, Tagalog, Hindi, Korean** (ElevenLabs Eleven v4 Turbo voice + `language_detection`, a
preset per language). The panel's own words: English, Spanish, French, Arabic (mirrored); other
languages show the English panel while the conversation stays in theirs. **Haitian Creole**: not
supported by ElevenLabs speech recognition or voices (checked in their docs); the agent says so and
offers French.

Two languages kept apart: the conversation (what the user hears and reads in captions) and the form
(what is written). The map is built once, in the form's language: switching language costs no
Gemini call. Verified live: Spanish free text "Un gato, se llama Michi" → "A cat, his name is Michi
and he is very calm."; "Panadería La Esperanza", "Ana López", "Maple Street" kept as said.

Turn latency = the user stops talking → the agent's voice starts (median / p90, one run each,
`voice:sim`, Claude Haiku 4.5 + Eleven v4 Turbo):

| Run | Median | p90 |
|---|---|---|
| Rental, Spanish | 0.81–0.85 s | 1.0–1.5 s |
| Rental, French | 0.86–0.90 s | 1.09–1.13 s |
| Rental, English | 1.00–1.17 s | 1.9–2.1 s |
| React form, French / Spanish | 0.93 s / 1.32 s | 1.21 s / 2.03 s |
| W-9, Spanish | 0.82 s | 1.05 s |
| W-9, French | 0.98–1.07 s | 1.17 s |
| W-9, English | 1.57–1.83 s | 2.0–2.1 s |
| Switch en → es (the switching turn is the slow one) | 1.39 s | 4.55 s |

Spanish and French meet the 1 s median target; English is around 1.0–1.2 s on the rental form
and slower on the W-9. About 1 s of every turn is ElevenLabs deciding the user has finished
speaking (before our code runs); we kept "normal" turn-taking so slow speakers aren't cut off.
The agent's first words come ~0.3–0.6 s after connecting (the greeting needs no AI turn).
Form maps: instant from the cache for the demo forms (`demo:check`), 1.5–2.2 s cold for a new form,
with the local skeleton shown at once.

Speech-recognition misses seen in the W-9 runs (not agent errors): "Doce Maple Street" heard as
"2 Maple Street" (written as heard, read back in the review for the user to correct); "6 2 7 0 4"
heard as "6274", which the agent completed to "62741" — fixed: the agent now writes exactly the
digits it heard and asks again when a ZIP has the wrong length.

## 3. Every designed feature: real or hidden

| Feature | Status |
|---|---|
| His "Form detected" pop-up with the glass guy, then the pill | Real. Shows only on real forms (not search boxes or logins), never over the page's controls (free corner, else the small pill), draggable, hideable, above ads (browser top layer). |
| Field highlights, chips, fill animation | Real. The value types in, then a check mark pops; a white ring keeps them visible on dark pages. |
| Glass panel, receptionist, bubble, waveform (real mic level) | Real |
| Agent states | Real: pill with icon + word + pose (not colour alone) |
| Progress | Real (bar + "x/y complete"; "preparing the questions…" while the map streams) |
| Settings: language (11), text size (scales everything), speaking speed, typing only | Real (speed changes reconnect and continue) |
| Help + keyboard shortcuts | Real (S E R T ? Esc) |
| Onboarding (once, skippable) | Real (language, privacy, microphone explained before Chrome asks) |
| Explanation card | Real: shows the agent's spoken explanation |
| Review card ("you said → in the form") | Real |
| Conversation transcript (both sides) | Real, screen-reader live region |
| Done screen (+ Download filled PDF for PDFs) | Real |
| Problems: microphone blocked (→ type), backend down (→ try again), connection lost (auto-reconnect, resume), start failed, no form, page extensions can't use, PDF problems | Real |
| Dark mode, RTL | Real (panel and PDF viewer; the in-page UI stays light on other sites on purpose) |
| His Lovable demo's "Add to form" approval card, PDF envelope | Removed earlier on purpose (agent fills live; PDFs are now real) |
| Hidden / not built | "Form detected · N fields" count (his demo had it; not shown); keyboard-only moving of the launcher (drag only); speed change takes effect after a 1–2 s reconnect (ElevenLabs can't change speed mid-session) |

## 4. Accessibility checks

- `pnpm test:a11y` (axe-core, WCAG 2.0/2.1/2.2 A + AA): onboarding, panel ready / in conversation /
  help, light and dark, Arabic, in-page pop-up, PDF viewer → **0 violations**. Keyboard: Tab reaches
  every control in order, every focused control shows a visible ring, targets ≥ 44 px, shortcut S
  starts the conversation. Contrast: muted text darkened to ≥ 4.5:1 (axe colour-contrast passes).
- Screen readers: captions and the transcript are live regions; field filled / needs checking /
  needs typing are announced; every control has a label; the onboarding moves focus to each step's
  title. **Not done: a manual VoiceOver walk-through** (I can't drive VoiceOver from here). Worth
  10 minutes before the demo: Cmd+F5, then Tab through the panel.
- Reduced motion respected (pop-up, mouth, waveform, fill animation, launcher glide).
- Voice is optional at every step (typing only works end to end).

## 5. Real websites (10 tested, frozen build, nothing submitted)

| Site | Result |
|---|---|
| **httpbin.org/forms/post** (pizza order) | **Works fully** — every field kind fills; clean questions. Best live "works anywhere" moment. Say the time as "19:30". |
| parabank.parasoft.com register | Works after tonight's fixes: sidebar login left out, SSN + passwords "type it yourself". Strong second (shows privacy). |
| selenium.dev web-form | Partly: test-page labels ("Text input") make bland questions |
| demoqa practice form | Partly: React date picker / autocomplete inputs reset our value (now detected and reported, not silent); labels are ids |
| formy | Partly: radios without a `name` aren't scanned |
| globalsqa sample page | Works after fixes (search box left out, launcher above the ad) |
| roboform filling test | Works after fixes (card number + CVC now private) |
| 3 others (eviltester, automationtesting.in, expandtesting) | Fill correctly; not demo-worthy (missing labels / tiny) |

Full notes: `docs/real-sites.md`.

## 6. Known limitations (honest, for the judges)

- Single-page forms only; no multi-step wizards, file uploads, CAPTCHAs or signatures.
- Some custom widgets (React date pickers, autocomplete dropdowns) refuse programmatic input. We
  notice and tell the user to pick that one themselves; we don't fake success.
- Speech recognition can mishear numbers and names. Never silently: the agent confirms when unsure,
  and reads everything back before you submit.
- Haitian Creole isn't available in the voice service yet; we offer French.
- The panel's own words are in 4 languages; the conversation works in 11.
- Gemini's plain-language rewording can still miss a nuance on long legal labels (seen once on the
  W-9: "name or business name" where the IRS says "owner's name"); the review read-back and the
  "never submits" rule are the safety net.
- English turns are ~1–1.2 s median (Spanish / French ~0.85 s).
- Fillable PDFs only (no scanned/photographed PDFs); XFA-only PDFs aren't supported.

## 7. For the teammate

- Your "Form detected" pop-up (`FormPrompt`) is merged into our repo. Placement now lives in a
  wrapper (`content/page-ui.tsx` → `Launcher`): your components no longer carry `fixed right-6
  bottom-6`; the wrapper picks a free corner, lets people drag or hide it, and puts it above ads.
- The panel was extended in your style: onboarding (`ui/panel/Onboarding.tsx`), help + settings
  sheets, transcript, done card, problem banners, state pill, 44 px buttons, dark tokens in
  `theme.css`, RTL rules. Please review the look; all words are in `ui/copy.ts` (en/es/fr/ar).
- Contract changes (`src/shared/contract.ts`): `Language` has 11 codes; `LocalizedText` = English
  + optional others; `FormMap.language` is now the form's language; tool `come_back_later`,
  `FieldState.later`, AgentEvent `field_later`; `FieldGroup.pick: 'one'`.
- Your repo's `paperwise/` folder is up to date with ours (see `CHANGES.md`). Later updates, from a clone of your repo:
  `git subtree pull --prefix=paperwise https://github.com/Mynoxys/paperwise.git main --squash`.
- Your Lovable `extension/` folder (detect.js, prompt.css) is a separate demo; the real extension
  is `paperwise/`.

## 8. Run the demo tomorrow morning (fresh start)

1. `git pull` (in `paperwise`), then `pnpm install` and `pnpm --dir server install`.
2. Check `server/.env` has the 3 keys (a **paid** Gemini key is safest).
3. `pnpm server` (leave it running; it pre-builds the demo forms' maps).
4. `pnpm build`, then `chrome://extensions` → reload Paperwise (or Load unpacked → `.output/chrome-mv3`).
5. `pnpm demo:check` until it says **READY** (run it twice on a fresh machine).
6. Chrome: allow the microphone once (the onboarding opens the tab), close other noisy tabs, turn
   the volume up.
7. Open http://localhost:8787/test/rental.html → "Help me fill this" → pick Español in the onboarding
   (or start in English and say "¿podemos hablar en español?") → Start talking.
8. Live "works anywhere": https://httpbin.org/forms/post. PDF: http://localhost:8787/test/pdf/ →
   fw9.pdf → "Fill this PDF with Paperwise".
9. If voice fails on stage: Settings → Typing only (same agent, text replies). If the backend fails:
   restart `pnpm server`; the cached maps come back instantly.
