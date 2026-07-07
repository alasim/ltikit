# ltikit — zero-setup demo tool

The fastest way to see LTIkit run. Built on `@ltikit/core` + `@ltikit/next` + `@ltikit/adapter-memory`
— **no database, no Docker, no external service.** Does the full loop: **SSO launch → deep-link
content selection → grade passback (AGS) → roster (NRPS)**, plus a live **LTI Platform Storage**
cookieless round-trip.

> This app is part of the pnpm workspace (`examples/*`) — from the repo root, `pnpm install`
> installs its deps along with everything else.

> **Trade-off for zero setup:** storage is **in-memory** — registered platforms are lost when the
> server restarts. There's no seed data; the only way to register a platform is **Dynamic
> Registration** (below). Fine for trying LTIkit out; not for production (see
> [`@ltikit/adapter-prisma`](../../packages/adapter-prisma) or
> [`@ltikit/adapter-supabase`](../../packages/adapter-supabase) for a real deploy).

## What each endpoint is

| Route | Purpose |
|---|---|
| `POST /api/lti/login` | OIDC third-party initiation (`oidcLogin` binding) |
| `POST /api/lti/launch` | Launch callback — verifies id_token, routes by message type (`launch` binding) |
| `GET /api/lti/register` | Dynamic Registration — the only way to register a platform in this demo |
| `POST /api/lti/deeplink` | Signs the deep-link response + auto-submits it back to the LMS |
| `POST /api/lti/grade` | Posts a completion grade via AGS (`ags.publishScore`) |
| `GET /api/lti/roster` | Fetches the course roster via NRPS (`nrps.getMembers`) |
| `GET /.well-known/jwks.json` | Serves the tool's public keyset (`jwks` binding) |
| `GET /lti/select` | Reference deep-link picker (app-owned UI) |
| `GET /launched` | Student landing + "post grade" + "view roster" buttons |

## Setup

### 1. Keypair

Generate an RS256 keypair and set `LTI_TOOL_PRIVATE_KEY` (PKCS8 PEM) + `LTI_TOOL_PUBLIC_JWK` (public JWK JSON). Quick generator:

```js
// node --input-type=module
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
console.log('PRIVATE_KEY:\n' + (await exportPKCS8(privateKey)))
console.log('PUBLIC_JWK:\n' + JSON.stringify({ ...(await exportJWK(publicKey)), kid: 'ltikit-key-1', alg: 'RS256', use: 'sig' }))
```

### 2. Env

Copy `.env.example` → `.env.local` and fill in `APP_URL` + the keypair + `LTI_PLATFORM_ORIGINS`.

### 3. Run

```bash
pnpm dev
```

### 4. Register with the LMS (Dynamic Registration — the only option here)

Your tool's public base URL (`APP_URL`) must be HTTPS and publicly reachable (a dev tunnel works
for local testing). Point your LMS's LTI 1.3 auto-config at `APP_URL/api/lti/register` — Moodle:
Site administration → Plugins → External tool → configure a tool → "LTI Advantage" → paste the
registration URL. Canvas: Developer Keys → "+ App" → "Enter URL" → the same registration URL.

Restarted the dev server since registering? The platform is gone (in-memory) — just re-run
Dynamic Registration before your next launch.

## Next steps

- Want state that survives a restart? [`examples/next-prisma-demo`](../next-prisma-demo) is the
  next step up — same zero-external-service simplicity (SQLite), but persistent.
- Full production storage: [Storage adapters](https://alasim.github.io/ltikit/guides/storage/).
