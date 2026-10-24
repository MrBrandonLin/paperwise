# src/ui — the teammate's design, wired to our engine

Merged 2026-10-24 from his Lovable project (github.com/MrBrandonLin/website-ui-starter): the glass
side panel (receptionist + speech bubble), the floating "Paperwise 3/12" pill, the guided-field
highlight, his theme (oklch tokens, glass utilities, animations) and shadcn Button/Input.
Not taken: his app shell (TanStack routing, server functions, Lovable config), the fake host
websites, his Gemini chat (it sent answers to Gemini), the "Add to form" approval card and the PDF
envelope (decided: the agent fills live; PDFs out of scope), his separate plain-JS extension.

```
adapter.ts        ★ the ONE adapter: FormState → PanelView (all mismatches listed at the top)
copy.ts           every UI word, English + French
panel/            PaperwisePanel (side panel), props = PanelView + PanelActions
page/             FloatingButton + HighlightLayer (rendered in the content script's shadow root)
components/       shadcn button, input (his copies)
lib/utils.ts      cn()
styles/theme.css  his tokens + glass/receptionist/voice-meter styles (:root and :host)
styles/panel.css  Tailwind v4 for the side panel (+ bundled fonts)
styles/page.css   Tailwind v4 for the in-page shadow root
assets/           logo (his extension icon), office backdrop
```

Rules:
- Components are presentational: data in as props (from the adapter), actions out as callbacks.
  No `browser.*`, no backend calls.
- Sensitive fields never show a value — the adapter only ever says "typed on the page (hidden)".
- No validation in the UI: the engine is the safety rail.
- In-page UI lives in a shadow root and never adds styles or classes to the host page.
- Preview without voice or a form: open `sidepanel.html?mock=fr` (or `?mock=en&speed=2`).
- Need new data? Add it to the adapter. Need a contract change? Ask first — it's shared.

## Mock player
`src/shared/mock-player.ts` plays a full fake session (rental form, EN or FR) and emits the same
`AgentEvent`s as the real engine; `reduceFormState` + `toPanelView` turn them into the panel.
