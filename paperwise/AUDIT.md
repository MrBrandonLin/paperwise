# Paperwise audit (2026-10-24, before the finishing pass)

State audited: `main` at 9ac592a (teammate's "Form detected" pop-up merged from website-ui-starter).
Status words: **works** (real, tested), **partly** (real but incomplete), **fake** (shown but not wired),
**missing** (designed or required, not there).

## 1. What the teammate's UI shows or implies

### In-page (src/ui/page/PageUi.tsx, mounted by content/page-ui.tsx in a shadow root)
| Feature | Status | Notes |
|---|---|---|
| "Form detected" pop-up (glass guy + "Want help filling this out?", Help me / Not now / ×) | partly | Real: opens the panel, prefetches the map on hover. Problems: shows on pages that aren't forms (YouTube: search box + 2 hidden inputs count as a form); fixed bottom-right, can cover the page's own buttons; can't be moved; "Not now" only lasts until reload; no "N fields" count (his Lovable demo had it); copy only en/fr. |
| Glass pill "Paperwise 3/12" | works | Progress from the panel. Same placement issues as the pop-up. |
| Field highlights: filled / review (amber) / needs typing / active, chips | works | Drawn over fields, follow scroll. Contrast on dark sites unverified. Chips only en/fr. |
| Fill animation (value drops onto the field) | partly | Real, but no "types in" effect and no check mark at the end. |
| Talking mouth animation | works | Respects reduced motion. |

### Side panel (src/ui/panel/PaperwisePanel.tsx via ui/adapter.ts)
| Feature | Status | Notes |
|---|---|---|
| Header: logo, BETA badge, settings, close | works | Icon buttons are 36 px (< 44 px target). |
| Reception scene: receptionist poses (listening / thinking / speaking / idle), speech bubble | works | Bubble = agent's live caption. States have pose + text label; "paused" vs "off" not distinguished. |
| "Connected" chip + progress "x of y complete" | partly | Progress real. "Connected" is shown whenever a map exists, even with no voice session or backend: misleading. |
| Settings: larger text | partly | Only switches the root between text-sm / text-lg; most text uses fixed sizes (text-xs, text-[10px]), so little scales. |
| Settings: language select | partly | en / fr only; locked during a conversation. |
| Voice waveform (real mic level) | works | |
| Attention card: type-it-yourself / check this / legal / important | works | |
| Explanation card | partly | Real, but shows the field's helpText / riskReason / question, not the explanation the agent speaks. |
| Review card (section by section) | works | Questions shown in the map language; no "said → written in the form" view. |
| "What you said" (last 4 user lines) | works | Only the user's side; the agent's side is the bubble. |
| Type box (typed answers, UiEvent user_text) | partly | Only visible during a voice session: typing alone (no mic) is impossible. |
| Start / End / Start again | works | |
| "Paperwise never submits" footer | works | |
| Completion screen | partly | Bubble says "everything is answered"; no dedicated done screen, no "review the page and press submit" step, no PDF download in the panel. |
| Onboarding / first run | missing | |
| Help panel, keyboard shortcuts | missing | |
| Speaking-speed control, "repeat that" | missing | |
| Dark mode, RTL | missing | |

## 2. Engine capabilities the UI doesn't show yet
- **Captions of both sides**: the agent's lines exist (state.captions) but only the latest one is shown, in the bubble. No transcript.
- **Per-section progress** and **preparing** (map still streaming): computed, not displayed.
- **Translation**: fields have value (form language) and displayValue (user language); the panel shows only one.
- **Turn latency**: debug only (fine).
- **Errors**: voice errors and mic problems show as one red line; the session ending by itself (disconnect) isn't explained and isn't recoverable.
- **PDF**: the download button lives only in the PDF viewer; the panel doesn't know it's a PDF.
- **request_typing done**: the engine knows when the user typed (filled: true); the panel shows a small "done" state only.
- **skipped** fields: counted in progress, shown only in review.

## 3. Contract mismatches (src/shared/contract.ts)
- `Language = 'en' | 'fr'`: every copy table, the map's language, the agent prompt and the mock player are typed on it. More languages = a contract change (announce to teammate).
- `FormMap.language` = "language of every text in this map (the user's)": the map is rebuilt with a Gemini call per user language. The finishing pass wants the map once, in the form's language: contract meaning changes.
- `FormPrompt` (new) takes `language: Language` and has its own en/fr words table outside copy.ts.
- No contract type for a conversation language that differs from the panel's / map's, or for a mid-conversation language switch event.
- The explanation event carries one text; the UI can't tell "what the page says" from "what the agent said".

## 4. Known open bugs from earlier reports
| Bug | Status |
|---|---|
| "Full legal name (first, middle, last)" became "What is your first name?" (Gemini, form-map prompt) | open |
| Awkward checkbox questions ("Does checking this box mean…") | open |
| W-9's seven "pick one" checkboxes asked as seven yes/no questions | open |
| Opening a PDF reloads the panel and wipes the session without warning | open |
| Windows path bug (C:\C:\…, .env / cache not found) | **fixed** in 74d3d6d: fileURLToPath + path.join everywhere; `pnpm --dir server test:paths` runs the path code on Windows-style URLs. Not run on a real Windows machine. |
| Stray filler before explanations ("Oui, c'est ça.") | open (prompt) |
| Agent asks for the SSN twice | open (prompt / engine) |
| Agent refuses Spanish | open: the agent is configured for en + fr only, prompt says "Speak only <language>". |

## 5. Slow, confusing, ugly or inaccessible
- **Detection**: the pop-up appears on non-form pages (YouTube, search pages). Counts search boxes and hidden fields.
- **Placement**: the pop-up and the pill sit bottom-right over whatever is there (often a page's Next/Submit button). Not movable, no way to hide on a site.
- **Start**: the greeting waits for the full map. On a cold map the first words can take 2–5 s.
- **Language**: only en / fr; the map is regenerated per language (another Gemini call, 2–5 s); switching language mid-conversation is impossible.
- **Voice-only paths**: typing needs a running voice session; with a blocked mic the user is stuck.
- **Screen readers**: the bubble and user lines are aria-live, but field filled / needs review / needs typing aren't announced; settings select has no visible focus style beyond the browser default; tab order not checked.
- **Text size**: the "larger text" setting barely changes anything.
- **Contrast**: small grey text on glass (text-muted-foreground at 10 px) is likely under 4.5:1; not measured.
- **Tap targets**: icon buttons 36 px.
- **Motion**: reduced motion respected for the mouth and pop-up; other animations (orb pulse, ink-in, waveform) not checked.
- **Dark mode**: none; the panel is always light.
- **PDF viewer**: plain grey toolbar, doesn't match the glass design.
- **Unhappy states**: backend down, AI slow, connection lost, field can't be filled: mostly a red line or a generic notice, no next step.
- **Debug panel**: hidden behind Shift+D (correct).
