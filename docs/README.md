# @ltikit/docs

The LTIkit documentation site — [Astro Starlight](https://starlight.astro.build/). Includes an
auto-generated API reference (TypeDoc from each package's TSDoc) and LLM-friendly output
(`/llms.txt`, `/llms-full.txt`).

## Develop

```bash
pnpm --filter @ltikit/docs dev      # local dev server
pnpm build                          # build packages first (API reference resolves cross-package types)
pnpm --filter @ltikit/docs build    # build the site → docs/dist
```

The API reference under `src/content/docs/api/` is generated on build and gitignored — edit TSDoc comments
in the packages, not those files.

## Structure conventions (keep it scalable)

The IA separates **required core** from **pick-one slots** so newcomers aren't overwhelmed. When adding docs,
keep to the categories:

- **New LTI feature/service** (stack-agnostic, e.g. a new Advantage service) → a page under **LTI features**.
- **New storage adapter** → a tab in `guides/storage.mdx`; **new framework binding** → a tab in
  `guides/frameworks.mdx`; **new auth recipe** → a tab in `guides/auth-integration.mdx`. Use
  `<Tabs syncKey="storage|framework|auth">` so readers see only their choice.
- Mark optional pages with an `<Aside type="tip">` ("one option, not a requirement").
- Update `reference/capabilities.md` (the support matrix) whenever a capability lands.
- Diagrams: fenced ` ```mermaid ` blocks (theme-aware via `astro-mermaid`).

## Hosting (GitHub Pages)

`.github/workflows/docs.yml` builds and deploys to GitHub Pages on push to `main`. One-time setup: repo
**Settings → Pages → Source: GitHub Actions**.

Before first deploy, set the owner/repo in `astro.config.mjs`:

- `SITE` → `https://<owner>.github.io`
- `BASE` → `/<repo>` (e.g. `/ltikit`). For a user/root site or custom domain, set `BASE` to `/`.
