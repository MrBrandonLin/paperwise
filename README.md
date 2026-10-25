# Paperwise

**Fill any form by voice, in your own language.** Paperwise is a Chrome extension for people who
face a form that isn't in their language, or is full of jargon: an immigrant with an English
rental application, an older person with a tax form. Press one button and talk (or type) in
Spanish, Arabic, Chinese… Paperwise understands the form, asks one plain question at a time,
explains anything you ask, fills the real form correctly (in the form's language), keeps private
numbers private, and stops before submitting: you always press Submit yourself.

It works on web forms and on fillable PDFs.

## How it works

| Part | Does what |
|---|---|
| **Gemini** understands | Turns the form's structure (labels, types, options; never values) into a "form map": one plain question per field, risks (legal, important, private), conditions, groups. Built once per form, in the form's own language, streamed so the first questions arrive in ~1–2 s, cached after that. |
| **ElevenLabs** talks | A voice agent (Eleven v4 Turbo voice, Claude Haiku as its brain) speaks the user's language: 11 languages, switching mid-conversation when the user asks ("¿podemos hablar en español?"). It proposes every answer through tools. |
| **The extension** acts and validates | Checks every proposal (real date, valid choice, phone length, language of free text, confidence) before touching the page, fills the real fields so React/Vue pages notice, highlights what needs checking, reads everything back before you submit, and never submits. |

Languages: English, Spanish, French, Arabic (panel mirrored), Portuguese, Mandarin Chinese,
Russian, Vietnamese, Tagalog, Hindi, Korean. The panel's own words exist in English, Spanish,
French and Arabic. Haitian Creole isn't supported by the voice service yet: the agent says so and
offers French.

## Privacy

- **Private numbers never leave the page.** Social Security, bank, card numbers and passwords are
  typed by the user into the page itself. The agent never hears them, the panel shows "typed on
  the page (hidden)", and the server and the AI never receive them.
- **Nothing you say is saved.** No answers are stored (no extension storage, no server logs of
  values). Only preferences are remembered: language, text size, speaking speed, onboarding done.
- **Only the form's structure goes to the AI** (labels and choices, never what you typed). PDFs are
  read in the browser and never uploaded.
- **Never auto-submits.** Paperwise stops at the review; you press Submit.

## Run it on a new computer

You need **Git**, **Node.js 22.12 or newer** (`node -v`; https://nodejs.org) and **Google Chrome**.

### 1. Get the code and install

```bash
git clone https://github.com/Mynoxys/paperwise.git
cd paperwise
npm install -g pnpm        # once per computer (or: corepack enable)
pnpm install               # the extension (also copies the voice + PDF files it needs)
pnpm --dir server install  # the backend
```

### 2. Add the API keys (never in Git)

The keys live in `server/.env`, which is not in the repository on purpose.

- macOS / Linux: `cp server/.env.example server/.env`
- Windows (PowerShell): `Copy-Item server\.env.example server\.env`

| Line | Where it comes from |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey (use a paid key for the demo: the free tier allows 15 requests a minute) |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `ELEVENLABS_AGENT_ID` | Team key: ask a teammate. Your own key: `pnpm --dir server agent:setup` creates the agent and prints the id. |

### 3. Start the backend

```bash
pnpm server
```

Leave it running. http://localhost:8787/health should say `"ok":true`.

### 4. Build and load the extension

```bash
pnpm build
```

Chrome → `chrome://extensions` → **Developer mode** (top right) → **Load unpacked** → the
`.output/chrome-mv3` folder inside `paperwise`. After every `pnpm build`, press the reload icon on
the extension.

### 5. Check everything

```bash
pnpm demo:check          # READY / NOT READY: keys, cached demo forms, voice agent, build, tests
pnpm demo:check --full   # + the browser test suites (~3 min)
```

Run it twice on a fresh computer: the first run builds the demo forms' maps, the second finds
them cached.

## The demo

1. Open http://localhost:8787/test/rental.html. The "Form detected" pop-up appears; press **Help me
   fill this** (or the toolbar icon). The panel opens; the first time, a short onboarding asks the
   language and explains the microphone.
2. Press **Start talking** and answer in your language. Try:
   - "¿Qué significa bruto?" → the explanation card, then the same question again
   - "Actually my phone ends in 42" → the answer is corrected
   - the Social Security number → "type it yourself" on the page; Paperwise never hears it
   - "Can we speak French?" → it switches at once and keeps every answer
3. At the end: the read-back, section by section, slowing down on what you agree to. Then
   "press Submit yourself".

Other demo forms: http://localhost:8787/test/rental-react.html (React; questions appear as you
answer) and http://localhost:8787/test/pdf/ (IRS W-9, rental PDF, PDFs that can't be filled).
For PDFs: in the panel, **Open a PDF** or drop one on it, or on a tab showing a PDF press **Fill
this PDF with Paperwise**. After the review: **Download filled PDF**.

A real website that works fully: https://httpbin.org/forms/post (pizza order). Bank sign-up with
private fields: https://parabank.parasoft.com/parabank/register.htm.

**Noisy room (demo day):** Settings → **Noisy room: hold to talk**, then hold the Talk button or Space while speaking.
**Without voice:** everything works by typing too (type in the box, or Settings → Typing only).
**Keyboard:** S start/stop, E explain, R repeat, T type, ? help, Esc close. **Debug:** Shift+D.

## If something fails

| Problem | Fix |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm`, then open a new terminal |
| `Unsupported engine` / build errors on install | Node is too old: install Node 22.12+ |
| Panel says "can't reach its server" | `pnpm server` isn't running, or port 8787 is taken |
| `EADDRINUSE :8787` | Something already uses port 8787: close the other server |
| Panel says "can't work on this page" | It's a chrome:// page or the Chrome Web Store: open a normal web page |
| Voice doesn't start | Check `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID`, restart `pnpm server`; or use typing |
| Microphone blocked | Allow it in the tab Paperwise opens, or press **Type instead** |
| Extension changes don't show | `pnpm build` again, then reload the extension in `chrome://extensions` |
| Windows | Paths are handled for Windows (`pnpm --dir server test:paths`); use PowerShell for the commands above |

## For developers

- `pnpm dev` — extension with hot reload · `pnpm check` — type-check + build (run after every change)
- Tests: `pnpm test:fill`, `test:reach`, `test:state`, `test:voice`, `test:pdf`, `test:a11y`,
  `pnpm --dir server test:form-map`, `pnpm --dir server test:paths`
- Live voice tests (real agent, simulated user): `pnpm --dir server voice:sim --lang es`,
  `--scenario switch`, `--scenario unsupported`, `--form w9`, `--form rental-react`
- See `CLAUDE.md` for architecture and conventions, `src/ui/README.md` for the UI,
  `FINAL_REPORT.md` for what's verified and known limitations.
