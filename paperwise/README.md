# Paperwise

Fill any web form by voice, in your language. Chrome extension + small Node backend.

## Run it on a new computer

You need **Git**, **Node.js 22.12 or newer** (check with `node -v`; get it from https://nodejs.org)
and **Google Chrome**.

### 1. Get the code and install

```bash
git clone https://github.com/Mynoxys/paperwise.git
cd paperwise
npm install -g pnpm        # once per computer (or: corepack enable)
pnpm install               # the extension
pnpm --dir server install  # the backend
```

### 2. Add the API keys (never in Git)

The keys live in `server/.env`, which is not in the repository on purpose.

- macOS / Linux: `cp server/.env.example server/.env`
- Windows (PowerShell): `Copy-Item server\.env.example server\.env`

Open `server/.env` and fill in:

| Line | Where it comes from |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `ELEVENLABS_AGENT_ID` | Using the team's ElevenLabs key: ask a teammate for the agent id. Using your own key: run `pnpm --dir server agent:setup` once, it creates the agent and prints the id. |

Easiest for a teammate: get the team's `server/.env` file sent privately (never by Git, chat
history or email in plain text).

### 3. Start the backend

```bash
pnpm server
```

Leave it running. Check: http://localhost:8787/health should say `"ok":true`.

### 4. Build and load the extension

```bash
pnpm build
```

In Chrome: open `chrome://extensions` → turn on **Developer mode** (top right) → **Load unpacked** →
pick the `.output/chrome-mv3` folder inside `paperwise`.

### 5. Try it

1. Open http://localhost:8787/test/rental.html
2. Click the **Paperwise** button (bottom right). The side panel opens.
3. The first time, a tab asks for the microphone: allow it, then press **Start** in the panel.
4. Answer the questions out loud (English or French — change it in the panel's settings).

Tips: **Shift+D** in the panel shows the debug panel. `sidepanel.html?mock=fr` plays a fake session
(no microphone, no keys needed) to look at the design.

### If something fails

| Problem | Fix |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm`, then open a new terminal |
| `Unsupported engine` / build errors on install | Node is too old: install Node 22.12+ |
| Panel says "can't reach its server" | `pnpm server` isn't running, or port 8787 is taken |
| `EADDRINUSE :8787` | Something already uses port 8787: close the other server |
| Panel says "can't work on this page" | It's a chrome:// page or the Chrome Web Store: open a normal web page |
| Voice doesn't start | Check `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` in `server/.env`, restart `pnpm server` |
| Extension changes don't show | `pnpm build` again, then the reload icon on the extension in `chrome://extensions` |

## For developers

- `pnpm dev` — extension with hot reload · `pnpm check` — type-check + build (run after every change)
- Tests: `pnpm test:fill`, `pnpm test:reach`, `pnpm test:state`, `pnpm test:voice`, `pnpm --dir server test:form-map`
- See `CLAUDE.md` for architecture, the shared contract and the phase plan; `src/ui/README.md` for the UI.
