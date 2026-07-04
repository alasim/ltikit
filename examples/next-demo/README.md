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

### 4. Register the tool in the LMS

Your tool's public base URL (`APP_URL`) drives every endpoint. Example below uses a dev
tunnel — replace it with yours (it MUST be HTTPS and **publicly reachable without auth**, so
the LMS can fetch your JWKS and post launches server-to-server):

```
APP_URL = https://8p8jtvqs-3000.asse.devtunnels.ms
```

| Tool endpoint | URL |
|---|---|
| OIDC login (initiation) | `APP_URL` + `/api/lti/login` |
| Launch / redirect target | `APP_URL` + `/api/lti/launch` |
| Deep-link (content selection) | `APP_URL` + `/api/lti/launch` |
| Public JWKS (keyset) | `APP_URL` + `/.well-known/jwks.json` |

> This demo routes **both** resource-link and deep-link launches through the same OIDC entry
> and the same `/api/lti/launch` handler (it branches on `message_type`). So the launch URL,
> the redirect URI, and the content-selection URL are all `/api/lti/launch`.

#### Moodle — "Configure a tool manually" (LTI 1.3)

_Site administration → Plugins → Activity modules → External tool → Manage tools → configure a tool manually._

| Moodle field | Value |
|---|---|
| Tool name | ltikit demo |
| Tool URL | `APP_URL`/api/lti/launch |
| LTI version | LTI 1.3 |
| Public key type | Keyset URL |
| Public keyset | `APP_URL`/.well-known/jwks.json |
| Initiate login URL | `APP_URL`/api/lti/login |
| Redirection URI(s) | `APP_URL`/api/lti/launch |
| Supports Deep Linking (Content-Item Message) | ✅ enabled |
| Content Selection URL | `APP_URL`/api/lti/launch |
| Default launch container | Embed / New window (your choice) |

Services / Privacy on the same form:

| Setting | Value |
|---|---|
| IMS LTI Assignment and Grade Services | **Use this service for grade sync and column management** (full AGS → enables grade passback) |
| IMS LTI Names and Role Provisioning | Do not use (NRPS lands in a later ltikit phase) |
| Share launcher's name / email | As needed (Yes to identify users) |
| Accept grades from the tool | Yes |

#### Copy Moodle's values back into `lti_platforms`

After saving, open the tool card → **View configuration details** (the tool details icon). Map
those values into your platform row:

| `lti_platforms` column | Moodle "Tool configuration details" field |
|---|---|
| `issuer` | Platform ID (your Moodle base URL, e.g. `https://yoursite.moodlecloud.com`) |
| `client_id` | Client ID |
| `auth_endpoint` | Authentication request URL |
| `token_endpoint` | Access token URL |
| `keyset_url` | Public keyset URL |
| `deployment_id` | Deployment ID |

```sql
insert into public.lti_platforms
  (issuer, client_id, auth_endpoint, token_endpoint, keyset_url, deployment_id)
values (
  'https://yoursite.moodlecloud.com',                       -- Platform ID
  'PASTE_CLIENT_ID',                                        -- Client ID
  'https://yoursite.moodlecloud.com/mod/lti/auth.php',      -- Authentication request URL
  'https://yoursite.moodlecloud.com/mod/lti/token.php',     -- Access token URL
  'https://yoursite.moodlecloud.com/mod/lti/certs.php',     -- Public keyset URL
  'PASTE_DEPLOYMENT_ID'                                     -- Deployment ID
)
on conflict (issuer, client_id) do update set
  auth_endpoint  = excluded.auth_endpoint,
  token_endpoint = excluded.token_endpoint,
  keyset_url     = excluded.keyset_url,
  deployment_id  = excluded.deployment_id;
```

> **Deployment ID** appears only after the tool is activated (Moodle shows it in the tool
> configuration details once available). You can insert the row first and update
> `deployment_id` after. If you leave it null, the launch still verifies — ltikit only
> enforces a match when the column is set.

#### Canvas (quick note)

Same URL mapping, different field names: **Redirect URIs** = `/api/lti/launch`, **OpenID
Connect Initiation Url** = `/api/lti/login`, **JWK Method = Public JWK URL** =
`/.well-known/jwks.json`, **Target Link URI** = `/api/lti/launch`. Canvas issuer is
`https://canvas.instructure.com` (hosted **and** most self-hosted).

### 5. Run

`pnpm dev`, make sure `APP_URL` matches your public HTTPS tunnel, then launch from the LMS.
LMS iframes require `SameSite=None; Secure` cookies — HTTPS is mandatory.

## Notes

- This demo **skips real user/session creation** — it stashes launch context in short-lived cookies to keep the LTI wiring front and center. In production, create your app user in the `launch` handler (see TeachSim `upsertLtiProfile`) and set a real signed session cookie.
- The deep-link content item declares a `lineItem`, so the LMS creates the gradebook column at placement time; the later resource-link launch then carries the AGS line item ready for `publishScore`.
