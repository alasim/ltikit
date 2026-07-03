# ltikit

Runtime-, storage-, and framework-agnostic **LTI 1.3 (LTI Advantage)** toolkit for JavaScript/TypeScript.

Runs on serverless and edge (Next.js, Hono, Cloudflare Workers, Lambda) — no Express, no MongoDB. Bring your own database via small adapters. Extracted from a production integration verified against **Canvas** and **Moodle** (SSO, deep linking, grade passback).

> Status: early development. See [`DESIGN.md`](./DESIGN.md) and [`ROADMAP.md`](./ROADMAP.md).

## Packages

| Package | What |
|---|---|
| `@ltikit/core` | Pure LTI 1.3 logic (jose + fetch). No framework, no DB. |
| `@ltikit/adapter-memory` | In-memory stores for dev/testing. |

More adapters (Supabase, Redis) and framework bindings (Next, Hono) land per the roadmap.

## Develop

```bash
pnpm install
pnpm build      # build all packages (tsup)
pnpm test       # vitest
pnpm lint       # eslint (core stays dependency-clean)
pnpm typecheck
```

Monorepo: pnpm workspaces + Changesets. `@ltikit/core` is lint-enforced to depend only on `jose`.
