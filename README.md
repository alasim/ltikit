<p align="center">
  <img src="docs/src/assets/ltikit-banner.png" alt="LTIkit — runtime-, storage-, and framework-agnostic LTI 1.3 toolkit for JS/TS" width="720">
</p>

# LTIkit

Runtime-, storage-, and framework-agnostic **LTI 1.3 (LTI Advantage)** toolkit for JavaScript/TypeScript.

Runs on serverless and edge (Next.js, Hono, Cloudflare Workers, Lambda) — no Express, no MongoDB. Bring your own database via small adapters. Verified live against **Canvas** and **MoodleCloud**: SSO, deep linking, grade passback (AGS), and roster (NRPS).

> **Status:** Phases 0–6 complete; live-verified on MoodleCloud. Full LTI Advantage surface (launch, deep linking, AGS, NRPS) + auth-agnostic session seam. See [`ROADMAP.md`](./ROADMAP.md) and [`DESIGN.md`](./DESIGN.md).

## Why

`ltijs` assumes Express + MongoDB + in-process state. LTIkit is the opposite: a **stateless core** (only `jose` + `fetch`) with all state behind small adapter interfaces, plus thin per-framework bindings. It runs anywhere JS runs, including the edge.

A small **required core** + **swappable slots** (storage, framework binding, auth) — you keep your stack and plug it in.

## Packages

| Package | What |
|---|---|
| `@ltikit/core` | LTI 1.3 logic: JWT verify/sign, OIDC login, launch, AGS, NRPS, deep linking, identity. jose only. |
| `@ltikit/next` | Next.js App Router bindings (Web `Request`/`Response`) + iframe helpers. |
| `@ltikit/hono` | Hono route bindings. |
| `@ltikit/adapter-supabase` | `PlatformStore` + `NonceStore` on Supabase/Postgres. |
| `@ltikit/adapter-redis` | `NonceStore` on Redis / Upstash (serverless-friendly). |
| `@ltikit/adapter-memory` | In-memory stores for dev/tests. |

## Quick look

```ts
import { createLti, staticKeyStore } from '@ltikit/core'
import { supabasePlatformStore, supabaseNonceStore } from '@ltikit/adapter-supabase'
import { launch, sessionRedirect } from '@ltikit/next'
import { ltiIdentity } from '@ltikit/core'

export const lti = createLti({ keys, platforms: supabasePlatformStore(db), nonces: supabaseNonceStore(db) })

// app/api/lti/launch/route.ts
export const POST = launch(lti, async (result) => {
  const id = ltiIdentity(result.claims)   // sub, email?, roles, isInstructor…
  // create your user + session with your auth lib, then:
  return sessionRedirect({ to: '/home', cookies: [/* your session cookie */] })
})
```

**Docs:** guides, API reference, and the "how it fits together" map live in [`docs/`](./docs) (Astro Starlight).

## Develop

```bash
pnpm install
pnpm build      # build all packages (tsup)
pnpm test       # vitest
pnpm lint       # eslint (core stays dependency-clean)
pnpm typecheck
```

Monorepo: pnpm workspaces + Changesets. `@ltikit/core` is lint-enforced to depend only on `jose`.
