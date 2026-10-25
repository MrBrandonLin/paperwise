# What changed (2026-10-24, the night before the demo)

Everything below is on `main` in both repos: Mynoxys/paperwise and the `paperwise/` folder of
MrBrandonLin/website-ui-starter. The full picture (what works, how it was tested, limitations) is in
`FINAL_REPORT.md`.

## For the teammate: your repo's `paperwise/` folder just caught up

Your folder was at the Windows-paths fix. It now has the whole finishing pass:

- Your "Form detected" pop-up (`FormPrompt`, the little glass guy) was already merged into our repo
  and is kept as is. It now sits inside a wrapper (`content/page-ui.tsx` → `Launcher`) that picks a
  free corner, can be dragged or hidden, and has words in more languages. Your Lovable edit of the
  same two files ("Added form help bubble") is included in that version.
- 11 conversation languages, onboarding, help and settings, typing only, speaking speed, text size,
  dark mode, right-to-left Arabic, done screen, problem banners. All built in your style; words are in
  `ui/copy.ts`. Please review the look.
- Fillable PDFs (IRS W-9, rental PDF): open, fill by voice, download.
- Contract (`src/shared/contract.ts`): `Language` has 11 codes; `LocalizedText` = English + optional
  others; `FormMap.language` is the form's language; tool `come_back_later`, `FieldState.later`,
  event `field_later`; `FieldGroup.pick: 'one'`. Tonight's fixes changed nothing in the contract.
- Nothing outside `paperwise/` was touched.

## Tonight's fixes

1. **It follows your language even if you don't ask to switch.** Live bug: the user spoke Russian,
   the agent understood but kept answering in English. Now the agent always answers in the language
   of the user's latest words, and Paperwise checks it: if the user speaks one language and the
   agent answers in another, it tells the agent to switch. Captions and panel follow.
   Tested live twice (Russian, never asking to switch) plus unit tests.
2. **No extension files load on web pages.** The "Unsafe attempt to load URL chrome-extension://…
   fonts" errors on YouTube were old entries from an earlier build. A test (`pnpm test:reach`) now
   fails if a page ever loads extension files again. Press "Clear all" on chrome://extensions.
3. **Out of ElevenLabs credits: a clear message instead of a connect/disconnect loop.** The account
   had run out of credits (the agent hangs up at once). The server now checks the balance before
   each conversation; when it's empty, the panel says "The voice service (ElevenLabs) has run out of
   credits…" (en/es/fr/ar) with Try again. `pnpm demo:check` shows the credits left.

4. **Noisy room: hold to talk.** In a crowded room the agent picked up every voice around it.
   Settings → "Noisy room: hold to talk": the microphone sends nothing to the agent unless the user
   holds the Talk button (or the Space bar), so other people can't answer for the user or cut the
   agent off. Switchable during a conversation (no reconnect); remembered. Words in en/es/fr/ar.
   Tested: `pnpm test:voice` (mute/unmute reach the SDK) and `pnpm test:reach` (button and Space).
   No server or agent change: ElevenLabs has no setting that filters other voices.

## Before the demo: new ElevenLabs key

1. In `paperwise/server/.env`: put the new key in `ELEVENLABS_API_KEY=` and empty
   `ELEVENLABS_AGENT_ID=` (the old agent belongs to the old account).
2. `pnpm --dir server agent:setup` creates the agent on the new account and prints
   `ELEVENLABS_AGENT_ID=…`: paste it into `server/.env`.
3. Restart `pnpm server`. No extension rebuild needed for the key.
4. `pnpm demo:check` until it says READY (it shows the credits left).
5. Pulling this update: `git pull`, `pnpm build`, reload the extension in chrome://extensions.

A free ElevenLabs account has about 10,000 credits a month: enough for a few short conversations.
Don't rehearse on it for long; keep it for the demo, or add a paid plan.
