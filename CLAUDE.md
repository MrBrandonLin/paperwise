# Paperwise — project context

## What it is
A Chrome extension that helps people fill any standard web form by voice, in their language.
User clicks a floating "Help me fill this" button → a side panel opens → an AI voice agent
interviews them in plain language, explains any field on request, translates both ways
(user speaks French, the English form gets English values), fills the REAL page fields live,
flags risky/legal fields, and stops before submit. The user always submits themselves.

Who it's for: elderly people, immigrants, people with low literacy or vision impairments,
anyone exhausted by jargon ("co-signer", "gross monthly income"), unclear stakes, or a
language that isn't theirs.

Hackathon: UI/UX track + ElevenLabs track. Judged on usability, accessibility, visual appeal.

## Product north star (from the original vision)
- The page stays visible and fills itself as the user talks. Never a black box.
- One question at a time. Unclear answers turn amber and get a confirming question, never a silent guess.
- User can interrupt anytime ("Wait, what's a guarantor?"), agent explains, then resumes.
- Review step reads back a summary in the user's language and slows down on high-stakes fields
  ("By checking this you allow the landlord to check your credit. Is that okay?").
- Accessibility: voice-first but never voice-only, captions always on, keyboard and
  screen-reader support, speaking-speed control, large-text mode, native-language interaction.
- The visual centerpiece: a spoken answer flowing onto the real field. Clear listening /
  thinking / speaking states.
- The original pitch mentioned photo/PDF upload — that is NOT this version. We work on live web forms.

## Team split
- Mahamane (this repo's owner): extension skeleton, content script (scan + fill), background
  worker, backend, Gemini, ElevenLabs agent, validation.
- Teammate: all visual UI, built in Lovable as React components (side panel screens, floating
  button, in-page highlight styles). Dropped into `src/ui/` later.
- **Never design final UI here.** His design lives in `src/ui` (merged 2026-10-24 from
  github.com/MrBrandonLin/website-ui-starter). Wire data to it through `src/ui/adapter.ts`; don't
  restyle it. Debug UI stays plain and functional (Shift+D).

## Stack
- WXT (Chrome extension framework), React, TypeScript, Manifest V3, Chrome `sidePanel` API
- Backend: small Node + TypeScript server (Hono), API keys in `server/.env`, never in the extension
- Gemini via the official `@google/genai` SDK, structured JSON output
- ElevenLabs Agents via the official JS SDK (`@elevenlabs/client`), using client tools; the agent's LLM =
  claude-haiku-4-5 (fastest that passed the voice test; Gemini still does the form map)
- Package manager: pnpm (v12 blocks dependency install scripts; allowed ones are listed in
  `server/pnpm-workspace.yaml` → `allowBuilds`)
- **ALWAYS check current official docs for SDK APIs before writing integration code.** Do not rely
  on memory for package names, method names, or model names.

## Repo layout
```
CLAUDE.md
wxt.config.ts            manifest config (permissions, host_permissions), srcDir = src
src/
  shared/contract.ts     ★ UI contract with the teammate — see "Shared contract"
  shared/messages.ts     internal message protocol (content ↔ background ↔ panel)
  shared/mock-player.ts  fake session emitting AgentEvents on timers (UI work without AI)
  shared/form-state.ts   ★ reducer: AgentEvent → FormState, + nextField/progress/isApplicable (UI + engine)
  engine/engine.ts       FormEngine: FORM STATE + agent tools + safety rail (no browser APIs)
  engine/validate.ts     validators per field kind (agent message + user-language reason)
  engine/voice-session.ts  ElevenLabs session ↔ engine: tools, contextual updates, events, turn latency
  shared/agent-prompt.ts ★ voice agent system prompt + first message (form map baked in per session)
  shared/agent-tools.ts  the six client tools (single source: setup script + session)
  shared/config.ts       BACKEND_URL, confidence threshold, constants
  lib/messaging.ts       toBackground(), toContent() (auto-injects the content script if the tab has none),
                         getActiveTabId(), isScriptableUrl()
  lib/mic.ts             mic permission state + live volume meter
  lib/test-values.ts     test value per field for the debug "fill" buttons
  entrypoints/
    background.ts        opens side panel, proxies backend calls
    content/index.ts     message handler, mounts floating button when a form is found; stops on WXT ctx invalidation
    content/scanner.ts   DOM → ScannedField[], tags data-paperwise-id; 1 s scan cache (markDirty on change)
    content/filler.ts    fill / highlight / scroll / clear; reads back + checks browser validity
    content/watchers.ts  user-edit sync + rescan when fields appear/disappear (MutationObserver)
    content/handler.ts   answers every panel request (no browser.* — tested by test:fill)
    content/floating-button.ts  the button's actions (prefetch on hover, open the panel)
    content/page-ui.tsx  in-page UI host: <paperwise-ui> shadow root (his button + highlights), CSS adapted
                         for shadow DOM (rem→px, @property defaults), fonts via FontFace; nothing added to the page
    content/page-ui-store.ts  progress / language / fill-animation data for the in-page UI (no React)
    sidepanel/App.tsx    his panel (src/ui) by default · Shift+D = debug panel · ?mock=fr = mock session
    sidepanel/controller.ts  scan → map → engine → voice session, shared by both panels
    sidepanel/DebugPanel.tsx  debug UI: state table, tool simulator, raw page tools, latency, logs
    mic-permission/      one-time tab to grant the mic (side panels can't show the prompt)
  ui/                    teammate's design (see src/ui/README.md): adapter.ts (FormState → his props),
                         copy.ts (en/fr), panel/, page/, components/ (shadcn), styles/ (Tailwind v4 + his theme)
server/
  src/index.ts           Hono app: /health, /form-map, /agent-token, /test/* static
  src/env.ts             loads server/.env
  src/paths.ts           every file path the server uses (.env, cache, scans, public), Windows-safe
  src/app.ts             Hono routes; POST /form-map streams NDJSON (skeleton → sections → done)
  src/form-map.ts        streamed form map: local skeleton, parallel parts, merge, cache, fallback
  src/form-map-cache.ts  memory + disk cache (server/.cache, structure only, gitignored)
  src/gemini.ts          generateContent + structured JSON, hedging, no SDK retries
  src/rate-limit.ts      requests-per-minute budget (users first, background/hedges on spare)
  src/prompts/form-map.ts  ★ the form-map prompt + JSON schema — iterate here
  src/form-structure.ts  scan → structure sent to Gemini (allow-list: never values, no query string)
  scripts/               form-map:print, test:form-map, agent:setup (creates the ElevenLabs agent), voice:sim
  test-pages/            React test form source + saved scans (scans/*.json)
  public/test/           test forms: rental.html (plain), rental-react.html (React-controlled,
                         conditional fields; bundled locally, no internet)
```

## Commands
- `pnpm install` (root) and `pnpm --dir server install`
- `pnpm dev` — extension dev mode (opens Chrome with the extension, hot reload)
- `pnpm build` — production build to `.output/chrome-mv3/` (load unpacked from there)
- `pnpm server` — backend on http://localhost:8787 (watch mode)
- `pnpm check` — type-check extension + server, then build. **Run after every change.**
- `pnpm test:fill` — fill engine end to end on both test forms in headless Chromium (incl. the
  "SSN never leaves the page" check). Set `CHROME_PATH` if no Chrome/Brave/Chromium is found.
- `pnpm test:reach` — real built extension in Chromium (needs `pnpm build`): tabs open before the extension
  (re)loaded get the content script injected (one copy, one button, no duplicate events); chrome:// → friendly
  message; the teammate's UI: in-page shadow root (his styles + font, amber review, Tailwind shadows, nothing
  added to the page, page font size can't shrink it), side panel notice, Shift+D, mock session.
- `pnpm --dir server test:form-map` — form-map pipeline against a fake Gemini (no key needed).
- `pnpm --dir server test:paths` — server file paths on Windows-style URLs (.env, cache, scans, test pages) +
  fails if any script builds a path from `new URL(..., import.meta.url)`.
- `pnpm test:state` — validators, engine safety rail, review rules, reducer + mock player.
- `pnpm test:voice` — voice session wiring with a fake ElevenLabs SDK.
- `pnpm --dir server agent:setup [--dry-run]` — create/update the ElevenLabs agent + 6 tools via API.
- `pnpm --dir server voice:sim [--llm <model>]` — full French voice conversation with the REAL agent
  (simulated user via TTS), prints transcript, tool calls, final values, turn latency.
- `pnpm --dir server form-map:print [rental|rental-react|rental-react-expanded] [--lang en|fr|both] [--json] [--warm]` —
  real Gemini on saved scans, prints arrival timings + the map (needs `GEMINI_API_KEY`). Cold by default.
- `pnpm scan:test-forms` — refresh those saved scans after changing the scanner or test forms.
- `pnpm build:test-pages` — rebundle the React test form (with React, no internet) after editing
  `server/test-pages/rental-react.jsx`.

## Architecture
- **Content script**: scans DOM fields, tags each with `data-paperwise-id`, fills fields,
  highlights, scrolls. Filling must use the native value setter + dispatch `input`/`change`
  events (bubbling) so React/Vue-controlled inputs register the change.
- **Reaching the page**: tabs open before the extension (re)loaded have a dead content script.
  `toContent()` injects it with `chrome.scripting` and retries once (needs host permission `<all_urls>`:
  content-script matches don't count). The new copy replaces the dead button; WXT invalidates older
  live copies. chrome://, Web Store, PDF viewer, error pages → "Paperwise can't work on this page."
- **Background worker**: message routing; opens the side panel; the only place that calls the backend.
- **Side panel**: runs the ElevenLabs conversation, holds FORM STATE (single source of truth).
  Talks to the content script with `tabs.sendMessage`.
- **Backend**: `POST /form-map` (ScanResult → Gemini → FormMap), `GET /agent-token`
  (ElevenLabs signed URL), `GET /health`.

## The brain
1. **Form understanding** (once, on detection): Gemini turns scanned fields into a FORM MAP:
   per field → plainQuestion, explanation, risk (none | important | legal | sensitive),
   ask order, grouping (e.g. full name → first + last), conditional logic.
2. **Conversation**: ElevenLabs agent gets form map + current state + user language, asks one
   question at a time, calls client tools.
3. **Speech → value**: done inside the agent's tool call (formatted + translated + confidence).
   No extra LLM call in the hot path; voice turns must stay under ~1.5 s.

## Tools the agent can call
`fill_field(id, value, display_value, confidence)`, `flag_for_review(id, reason)`,
`go_to_field(id)`, `explain_field(id)`, `request_typing(id)` (sensitive fields — never accept
SSN / bank / passwords by voice), `start_review()`.
Names and params must match the client tools configured in the ElevenLabs dashboard
(case-sensitive) and the types in `contract.ts`. Tools that return data need "Wait for response" on.

## Sensitive fields
SSN, bank/account/card numbers, passwords: the value NEVER leaves the page. The scanner marks them
(`data-paperwise-sensitive`, `ScannedField.sensitive`); scans, fill results and user-edit events
carry only `filled: true/false`. The form map's risk can only raise this, never lower it.

## ElevenLabs agent (phase 4)
- Configured by `agent:setup` through the API (no clicking): client tools (wait for response),
  LLM `ELEVENLABS_LLM` (default claude-haiku-4-5, thinking 0, temp 0.2), TTS eleven_flash_v2
  (required for an English-primary agent; French gets the multilingual flash), turn eagerness normal + speculative_turn, en + fr, client events
  (tentative transcripts, chat response parts, tool calls), overrides allowed (prompt, llm,
  first message, language, ASR keywords), auth on. Voice: ELEVENLABS_VOICE_ID.
- Per session (code): prompt = rules + this form's map, first message = welcome + first question,
  language, ASR keywords, optional LLM override (A/B). Connection: WebRTC, token from
  `GET /agent-token` (server calls /v1/convai/conversation/token).
- Extension CSP blocks the SDK's blob:/data: worklets → served from public/elevenlabs/ (copied on
  postinstall) via `workletPaths` + `libsampleratePath`.
- State for the agent: every tool result carries `state` (contextForAgent()). Separate
  `[state]` contextual updates only for changes the agent didn't make (user edits on the page, map
  updates), and only while it listens. Live tests: updates mid-turn cancelled replies (10 s silence);
  updates after its own actions made it repeat itself.
- Never guess (VoiceSession): fill_field / flag_for_review only for the question that was open when
  the user last spoke (or a correction). Live tests: the agent asked "income?" and filled 3000 itself.
- LLM comparison (voice:sim, French, 2026-10-24, one run each): claude-haiku-4-5 17/17, median
  0.76 s, p90 1.2 s · gemini-3.1-flash-lite 17/17, 1.5 s / 2.1 s · gemini-3.5-flash-lite 15/17
  (SSN by voice, 10 s silences) · gpt-4.1-nano 16/17 (SSN by voice), 2.1 s · gpt-4.1-mini failed.
- English-primary agents must use TTS `eleven_flash_v2` (API rejects v2_5); French uses the
  multilingual flash automatically.
- Optional fields are skipped with fill_field(value "") → status skipped (else "Next" never moves).

## Accuracy rule (both prompts)
Plain language must never change the meaning, above all legal and financial meaning. Legal
questions state what the user agrees to and who gets permission, from the user's side ("Do you
allow the landlord to check your credit report?", never "Can we…"). Never speak as the
organization. Roles stay exact (co-signer = agrees to pay if you can't).

## Speed rules (form map)
- Output tokens are the cost: never ask Gemini for what we can compute (order, format hints, sensitive risk).
- One language per map (the user's). Explanations are on demand (explain_field), not upfront.
- Free-tier key = 15 requests/min (GEMINI_RPM). A form costs ~4. Use a paid key for the demo.

## Safety rail
The agent only PROPOSES. The extension validates every proposal (type, real date, option exists,
confidence ≥ threshold) before touching the page. Failed validation → field goes `review`
(amber) and the agent is told to re-ask. After every change, the agent receives a state update
(`sendContextualUpdate`). User edits on the page sync back into state and are sent to the agent.

## Scope
IN: Chrome, single-page standard HTML forms; text / number / date / select / checkbox / radio;
English + French; explain, translate, fill, risk flags, review step.
OUT: auto-submit (never), multi-page forms, file uploads, CAPTCHAs, signatures, PDFs, accounts,
storing user data (nothing is persisted — no chrome.storage of answers, no server logs of values).

## Shared contract
Types live in `src/shared/contract.ts`. This file is the contract with the teammate's UI.
**Never change it silently — tell Mahamane whenever a change is needed**, and say exactly what changes.
`src/shared/messages.ts` is internal and can change freely.

Contract changes so far (announced): `request_typing`, `review_started`, `review_section` events;
`UiEvent { type: 'user_text'; text }` (2026-10-24: typed answers/questions, same rules as speech).

## Phase plan
- [x] **0. Skeleton** — extension builds, floating button opens side panel, SCAN round-trip,
      backend /health, fallback /form-map, /agent-token, test form.
      Plus: AgentEvent/UiEvent types in contract, mock player, side-panel mic test + permission tab.
- [x] **1. Fill engine** — native-setter fill for all kinds, highlight by status, scroll to field,
      user-edit sync events. Add a React-controlled test form.
      Field ids are `pw-` + element id (or name for radio groups), so they survive re-renders.
- [x] **2. Gemini form map** — structured output, schema matches `FormMap`, fallback on error/timeout.
      Hidden conditional fields are scanned (visible: false) and mapped up front; showing them = no call.
      Fields rendered later (React) → Gemini maps ONLY the new ones, merged in; existing never re-mapped.
      Real Gemini (2026-10-24): flash-lite ~8 s whole form, ~2.6 s for 2 new fields; 3.8-flash 30–110 s.
- [x] **2b. Speed** — one language per map, no upfront explanations, parallel parts streamed as NDJSON,
      local skeleton at 0 ms, hedged requests, RPM budget, disk cache, prefetch on button hover, prewarm.
      Measured 2026-10-24 (flash-lite, cold): first section 0.9–2.6 s, complete 1.2–4.5 s (was 7–22 s); cache 0 ms.
- [x] **3. Form state + validation** — state store in side panel, validators per kind, review rules.
- [x] **4. ElevenLabs agent** — dashboard config (prompt, tools, Gemini LLM, EN/FR), session in
      side panel, client tools wired to validation + fill, contextual state updates, captions.
      Agent created 2026-10-24 via agent:setup. voice:sim passes the full French test plan.
- [ ] **5. Review + risk** — start_review flow, legal/sensitive handling, request_typing.
- [ ] **6. Integrate teammate UI + demo hardening** — DONE: his glass panel + in-page UI wired to the
      engine (adapter), typed answers (UiEvent user_text), debug behind Shift+D, fonts bundled.
      TODO: rehearse on stage forms, dark mode (he has none yet), speaking-speed control.

## Doc notes (verified 2026-10-23 — re-check before relying on them)
- WXT 0.21: entrypoints in `src/entrypoints`; `defineBackground`, `defineContentScript` are auto-imported;
  `browser` global is Chrome's API. Runtime code must live inside `main()`.
- `sidePanel.open({ tabId })` must be called directly in response to a user gesture (no await before it).
- Side panels can't display the microphone permission prompt → `mic-permission.html` tab grants it once.
- ElevenLabs (@elevenlabs/client 1.30, checked 2026-10-24): voice sessions default to WebRTC
  (`conversationToken` from `GET /v1/convai/conversation/token?agent_id=`); client tools return a string
  (objects are JSON-stringified); callbacks incl. onModeChange, onMessage({source,message}), onIncomingEvent
  (raw events: tentative_user_transcript, agent_chat_response_part…). Some events must be enabled in the
  agent's client_events. Agent API: POST /v1/convai/agents/create, PATCH /v1/convai/agents/{id},
  POST/GET /v1/convai/tools. Older notes:
- ElevenLabs: signed URL = `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…`
  with header `xi-api-key`; expires in 15 min; agent must have auth enabled. Client:
  `Conversation.startSession({ signedUrl, clientTools, onMessage, onModeChange, … })`. WebRTC uses a
  `conversationToken` instead — check docs if we switch.
- Gemini: we use `models.generateContent` (config: systemInstruction, responseMimeType, responseJsonSchema,
  httpOptions.retryOptions { attempts: 1 }) — ~20% faster than Interactions in our test; SDK default retries
  wait up to 60 s on a 429, so they are off. Interactions API (verified 2026-10-24, SDK 2.31): `client.interactions.create({ model,
  system_instruction, input, response_format: { type: 'text', mime_type: 'application/json', schema },
  generation_config: { thinking_level } }, { timeout_ms, fetch_options: { signal } })` → `output_text`,
  `usage.total_output_tokens`. Schema subset: no minLength/maxLength; nullable = `type: [x, 'null']`.
  Models: `gemini-3.5-flash-lite` (default: fast enough for 15 s), `gemini-3.8-flash` (nicer text, very slow
  on 2026-10-24, even 29 s for "Say OK"). `thinking_level: 'minimal'` is rejected by 3.8-flash. `GEMINI_MODEL` in `.env`.
  `fetch_options.signal` did not stop a request; we cap total time with Promise.race instead.
  SDK retries 5xx on its own (counts against our 15 s).

## Working rules
- Build in small phases. After each phase, give exact steps to test it by hand.
- Prefer boring, reliable code over clever code. Hackathon: it must work on stage.
- File paths: `fileURLToPath` + `path.join` (server: `server/src/paths.ts`), never
  `new URL(..., import.meta.url).pathname` — on Windows it becomes `C:\C:\…` (teammate's machine, 2026-10-24).
- Run `pnpm check` after every change and fix errors before reporting done.
- Don't commit unless asked.
