# ltikit — Next.js + Prisma + NextAuth demo

A reference LTI 1.3 tool built on `@ltikit/core` + `@ltikit/next` + `@ltikit/adapter-prisma`, with
**SQLite** (zero external services) and **NextAuth v5** for real sessions. Does the full loop:
**SSO launch → deep-link content selection → grade passback (AGS) → roster (NRPS)** — plus a live
**LTI Platform Storage** cookieless round-trip, and Dynamic Registration.

## The auth design (read this first)

A launch is federated identity *pushed from* the LMS — there's no login button to hang a redirect
off. Rather than fight NextAuth's client-redirect-oriented `signIn()` from inside a Route Handler,
the launch handler (`app/api/lti/launch/route.ts`) **mints the session cookie directly**:

- `lib/auth.ts` overrides NextAuth's `jwt.encode`/`jwt.decode` with a `jose`-based implementation
  (same library ltikit's core uses everywhere else) instead of relying on NextAuth's internal token
  format.
- The launch handler calls `signSessionToken()` (same encode) and sets it via `@ltikit/next`'s
  `sessionRedirect` — the same helper the plain [`next-demo`](../next-demo) example uses.
- NextAuth's own `Credentials` provider is used **only** by the plain `/login` page, for direct
  (non-LTI) visits — a normal, safe, well-trodden client-side `signIn()` call.

Both paths produce/consume the exact same token shape, so `auth()` sees a valid session regardless
of which one created it.

## Setup

### 1. Database (SQLite — zero setup)

```bash
cp .env.example .env.local   # then fill in APP_URL, AUTH_SECRET, keypair (below)
pnpm db:migrate               # applies prisma/schema.prisma → dev.db (Prisma 7 + better-sqlite3 driver adapter)
pnpm db:seed                  # seeds the demo login: demo@ltikit.dev / ltikit-demo
```

### 2. Keypair + secret

```js
// node --input-type=module
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
console.log('LTI_TOOL_PRIVATE_KEY:\n' + (await exportPKCS8(privateKey)))
console.log('LTI_TOOL_PUBLIC_JWK:\n' + JSON.stringify({ ...(await exportJWK(publicKey)), kid: 'ltikit-key-1', alg: 'RS256', use: 'sig' }))
```

```bash
openssl rand -base64 32   # → AUTH_SECRET
```

### 3. Run

```bash
pnpm dev
```

Visit `/` directly → prompted to `/login` (demo account above). Launched from an LMS → skips
login entirely, session established by the launch handler.

### 4. Register the tool in your LMS

**Dynamic Registration (easiest):** point your LMS's LTI 1.3 auto-config at
`APP_URL/api/lti/register` — the platform auto-persists via `prismaPlatformStore`, no manual insert.

**Manual** — same URL mapping as [`next-demo`](../next-demo#4-register-the-tool-in-the-lms):

| Tool endpoint | URL |
|---|---|
| OIDC login (initiation) | `APP_URL/api/lti/login` |
| Launch / redirect target | `APP_URL/api/lti/launch` |
| Public JWKS (keyset) | `APP_URL/.well-known/jwks.json` |
| Dynamic registration | `APP_URL/api/lti/register` |

Requires a public HTTPS URL (LMS iframe + `SameSite=None; Secure` cookies need it) — a dev tunnel
works for local testing.

## What each route is

| Route | Purpose |
|---|---|
| `POST /api/lti/login` | OIDC third-party initiation |
| `POST /api/lti/launch` | Verifies id_token; resolves/creates the `User` + `LtiEnrollment`; mints a NextAuth session |
| `GET /api/lti/register` | Dynamic Registration |
| `POST /api/lti/deeplink` | Signs the deep-link response |
| `POST /api/lti/grade` | Posts a completion grade via AGS |
| `GET /api/lti/roster` | Fetches the roster via NRPS |
| `GET /.well-known/jwks.json` | Tool's public keyset |
| `* /api/auth/[...nextauth]` | NextAuth — only the `Credentials` provider (`/login`) uses this |
| `GET /login` | Direct-visit sign-in (seeded demo account) |
| `GET /launched` | Post-launch landing — grade/roster buttons + Platform Storage probe |

## Notes

- `prisma/schema.prisma` has two groups: `LtiPlatform`/`LtiNonce` (the `@ltikit/adapter-prisma`
  contract) and `User`/`LtiEnrollment` (this app's own auth — `sub` is only unique per issuer, so
  the link table keys on `(issuer, sub)`, not email).
- Session strategy is `jwt` — no NextAuth `Account`/`Session`/`VerificationToken` tables needed.
- Prisma 7 generates the client to `generated/prisma` (not `node_modules/@prisma/client`) and
  connects to SQLite via the `@prisma/adapter-better-sqlite3` driver adapter — see
  `prisma.config.ts` and `lib/prisma.ts`. `better-sqlite3` is a native module; `pnpm install` builds
  it for your platform.
