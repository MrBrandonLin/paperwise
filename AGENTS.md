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
- Use the index route for the extension demo and preserve the standalone session route; the demo is not an installable browser extension.
- Render assistant replies in the reception speech bubble and derive avatar animation from conversation activity; keep voice states as client-side previews until voice services are connected.
