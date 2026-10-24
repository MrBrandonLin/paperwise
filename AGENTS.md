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

- Keep the independent sample form at `/demo`; the in-page companion is explicitly a preview, while installable Manifest V3 sources live in `extension/` and the downloadable ZIP in `public/`, so browser capabilities are not confused with the website simulation.
- The extension reads ordinary HTML fields only after user action using `activeTab` and `scripting`; exclude sensitive/unsupported controls and require explicit confirmation for each write, so it never silently fills credentials or grants consent.
