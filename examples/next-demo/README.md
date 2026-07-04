# ltikit — Next.js demo tool

A minimal LTI 1.3 tool built on `@ltikit/core` + `@ltikit/next` + `@ltikit/adapter-supabase`.
It does the full loop: **SSO launch → deep-link content selection → grade passback**.

> This app is **not a workspace member** by default (its `next`/`react`/`supabase`
> deps are heavy). To run it, re-enable `examples/*` in the repo root
> `pnpm-workspace.yaml`, then `pnpm install`.

## What each endpoint is

| Route | Purpose |
|---|---|
| `POST /api/lti/login` | OIDC third-party initiation (`oidcLogin` binding) |
| `POST /api/lti/launch` | Launch callback — verifies id_token, routes by message type (`launch` binding) |
| `POST /api/lti/deeplink` | Signs the deep-link response + auto-submits it back to the LMS |
| `POST /api/lti/grade` | Posts a completion grade via AGS (`ags.publishScore`) |
| `GET /.well-known/jwks.json` | Serves the tool's public keyset (`jwks` binding) |
| `GET /lti/select` | Reference deep-link picker (app-owned UI) |
| `GET /launched` | Student landing + "post grade" button |

## Setup

### 1. Database

**Option A — fresh local Supabase (bundled, recommended for testing).**
This example ships its own Supabase project under `supabase/` with the ltikit tables
as a migration. Ports are shifted +100 (API on `54421`) so it runs alongside another
local Supabase without clashing. Requires Docker Desktop running.

```bash
pnpm db:start      # supabase start — boots Postgres/Studio/Auth, applies migrations
pnpm db:status     # shows the local URLs + keys (API: http://127.0.0.1:54421)
pnpm db:reset      # re-apply migrations + seed.sql from scratch
```

The default local service-role key is already in `.env.example` (it's the well-known
local-dev key, not a secret). Register your LMS platform by editing `supabase/seed.sql`
(then `pnpm db:reset`), or from Studio at http://127.0.0.1:54423.

**Option B — your own Supabase project.** Apply the adapter schema:
```bash
npx @ltikit/adapter-supabase > supabase/migrations/0001_ltikit.sql   # then: supabase db push
# or paste `npx @ltikit/adapter-supabase` into the Dashboard SQL editor
```

### 2. Keypair

Generate an RS256 keypair and set `LTI_TOOL_PRIVATE_KEY` (PKCS8 PEM) + `LTI_TOOL_PUBLIC_JWK` (public JWK JSON). Quick generator:
   ```js
   // node --input-type=module
   import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
   const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
   console.log('PRIVATE_KEY:\n' + (await exportPKCS8(privateKey)))
   console.log('PUBLIC_JWK:\n' + JSON.stringify({ ...(await exportJWK(publicKey)), kid: 'ltikit-key-1', alg: 'RS256', use: 'sig' }))
   ```

### 3. Env

Copy `.env.example` → `.env.local` and fill in `APP_URL` + the keypair. With the bundled
local Supabase (Option A), the Supabase URL/key defaults are already set.

### 4. Register your LMS

- Add a `lti_platforms` row (via `supabase/seed.sql` + `pnpm db:reset`, or Studio).
- Register the tool in the LMS with these endpoints: JWKS = `/.well-known/jwks.json`,
  OIDC login = `/api/lti/login`, redirect URI = `/api/lti/launch`.

### 5. Run

`pnpm dev`, expose it over HTTPS (e.g. ngrok — LMS iframes require `Secure` cookies), then
launch from the LMS.

## Notes

- This demo **skips real user/session creation** — it stashes launch context in short-lived cookies to keep the LTI wiring front and center. In production, create your app user in the `launch` handler (see TeachSim `upsertLtiProfile`) and set a real signed session cookie.
- The deep-link content item declares a `lineItem`, so the LMS creates the gradebook column at placement time; the later resource-link launch then carries the AGS line item ready for `publishScore`.
