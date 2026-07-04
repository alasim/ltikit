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

1. **Database.** Apply `packages/adapter-supabase/sql/0001_ltikit_tables.sql` to your Supabase project.
2. **Keypair.** Generate an RS256 keypair and set `LTI_TOOL_PRIVATE_KEY` (PKCS8 PEM) + `LTI_TOOL_PUBLIC_JWK` (public JWK JSON). Quick generator:
   ```js
   // node --input-type=module
   import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
   const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
   console.log('PRIVATE_KEY:\n' + (await exportPKCS8(privateKey)))
   console.log('PUBLIC_JWK:\n' + JSON.stringify({ ...(await exportJWK(publicKey)), kid: 'ltikit-key-1', alg: 'RS256', use: 'sig' }))
   ```
3. **Env.** Copy `.env.example` → `.env.local` and fill it in.
4. **Register the platform.** Insert a row into `lti_platforms` with your LMS's issuer, client_id, auth/token/keyset URLs, and deployment_id.
5. **Register the tool in the LMS** with the endpoints above (JWKS = `/.well-known/jwks.json`, OIDC login = `/api/lti/login`, redirect URI = `/api/lti/launch`).
6. `pnpm dev`, expose it over HTTPS (e.g. ngrok — LMS iframes require `Secure` cookies), and launch from the LMS.

## Notes

- This demo **skips real user/session creation** — it stashes launch context in short-lived cookies to keep the LTI wiring front and center. In production, create your app user in the `launch` handler (see TeachSim `upsertLtiProfile`) and set a real signed session cookie.
- The deep-link content item declares a `lineItem`, so the LMS creates the gradebook column at placement time; the later resource-link launch then carries the AGS line item ready for `publishScore`.
