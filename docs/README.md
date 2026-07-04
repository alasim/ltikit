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

## Hosting (GitHub Pages)

`.github/workflows/docs.yml` builds and deploys to GitHub Pages on push to `main`. One-time setup: repo
**Settings → Pages → Source: GitHub Actions**.

Before first deploy, set the owner/repo in `astro.config.mjs`:

- `SITE` → `https://<owner>.github.io`
- `BASE` → `/<repo>` (e.g. `/ltikit`). For a user/root site or custom domain, set `BASE` to `/`.
