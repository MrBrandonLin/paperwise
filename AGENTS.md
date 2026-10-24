<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the extension demo client-side, with shared field definitions driving both the host form and assistant so answers stay synchronized without submitting personal data.
- The index route is a demo gallery; each demo context is a scenario config in src/lib/extension-demo.ts rendered at /demos/$scenarioId by one shared ExtensionDemo component. Preserve the standalone session route; demos are not an installable browser extension.
- Render assistant replies in the reception speech bubble and derive avatar animation from conversation activity; keep voice states as client-side previews until voice services are connected.
- The installable Chrome extension source lives in extension/ (MV3, plain JS); after editing it, re-zip into public/paperwise-extension.zip so the gallery download stays current.
- Uploaded forms are parsed in the browser (src/lib/custom-upload.ts) and handed to /demos/custom via sessionStorage; files are never sent anywhere.
- Each sample host site gets its own look through a scoped .theme-<scenarioId> class; the Paperwise panel keeps the app's own style.
