# ltikit — Design Doc

_A runtime-, storage-, and framework-agnostic LTI 1.3 (LTI Advantage) toolkit for JavaScript/TypeScript._
_Status: draft. Origin: extracted from TeachSim's production LTI integration (verified against MoodleCloud + Canvas)._

---

## 1. Why

The de-facto LTI library, **`ltijs`**, assumes a long-running **Express** server, **MongoDB**, and **in-process session state**. That model does not fit modern deployment targets:

- **Serverless / edge** (Vercel functions, AWS Lambda, Cloudflare Workers, Next.js route handlers) — no persistent process, no in-memory session cache, cold starts.
- **Bring-your-own database** — teams already run Postgres/Supabase/Redis/KV and don't want a second datastore (Mongo).
- **Framework freedom** — Next.js, Hono, Remix, SvelteKit, plain Workers — not just Express.

**ltikit** is the opposite by construction: a **stateless core** (only `jose` + `fetch`) with **all state pushed behind small adapter interfaces**, plus thin per-framework bindings. It runs anywhere JS runs, including the edge.

We are not starting from theory — the core logic is lifted from a **production integration that already does SSO, deep linking, and grade passback against Moodle and Canvas** (hosted + self-hosted), including the many cross-LMS edge cases that only surface in the field.

## 2. Non-goals

- Not a full LMS or an auth/session system. ltikit **verifies LTI messages and talks to LTI services**; creating your app's user/session is your job (it hands you verified claims).
- Not tied to any database, ORM, cache, or web framework.
- Not an LTI 1.1 / Basic Outcomes library (1.3 / Advantage only; 1.1 explicitly out of scope for v1).
- No opinion on UI (deep-link pickers, dashboards) beyond optional HTML form helpers.

## 3. Design principles

1. **Stateless core.** Pure functions over `jose` + `fetch`. No globals, no singletons, no in-memory session.
2. **State behind adapters.** Nonces, platform registry, and the tool keypair are injected via interfaces the consumer implements.
3. **Runtime-portable.** Only Web-standard APIs (`fetch`, Web Crypto via `jose`). No Node-only APIs in core → runs on Node, edge, Workers, Deno, Bun.
4. **Dependency-light.** Core depends on `jose` and nothing else. That minimalism *is* the pitch.
5. **Spec-faithful, gotcha-hardened.** Encode the hard-won cross-LMS correctness (see §11) so consumers never rediscover them.
6. **Primitives first, bindings thin.** Core takes primitive inputs (strings/objects); framework bindings only adapt `Request`/`Response`.
7. **Typed everything.** First-class TS types for claims, platforms, AGS/NRPS payloads, and typed error classes.

## 4. Package topology (monorepo, `@ltikit/*`)

Single git repo, pnpm workspaces, independently versioned packages published under one npm scope.

```
ltikit/
  pnpm-workspace.yaml
  package.json                 (private root)
  tsconfig.base.json
  .changeset/
  packages/
    core/                      → @ltikit/core              (jose + fetch only)
    adapter-memory/            → @ltikit/adapter-memory    (dev/test stores)
    adapter-supabase/          → @ltikit/adapter-supabase  (Postgres/Supabase stores)
    adapter-redis/             → @ltikit/adapter-redis     (Upstash/Redis nonce store)
    next/                      → @ltikit/next              (route-handler bindings)
    hono/                      → @ltikit/hono              (Hono bindings)
  examples/
    next-demo/                 (Moodle/Canvas-verified reference app)
  docs/
```

- Each package ships its own `package.json`/version; consumers `npm i @ltikit/core` (monorepo invisible to them).
- Internal deps via `workspace:*`; **Changesets** for versioning + coordinated publish.
- `@ltikit/core` has **zero framework/DB imports** — enforced by lint (no cross-package imports except types).

## 5. Architecture

```
        ┌─────────────────────────── your app ───────────────────────────┐
        │  (Next route / Hono handler / Worker)                           │
        │        │ Request/Response                                       │
        │   ┌────▼─────────────┐   implements   ┌──────────────────────┐ │
        │   │  @ltikit/<binding>│───────────────▶│  @ltikit/core        │ │
        │   └──────────────────┘                 │  (pure logic)        │ │
        │                                        │   jose + fetch       │ │
        │   provides adapters ───────────────────▶│                      │ │
        │   ┌──────────────┐ ┌──────────────┐   │  needs: NonceStore   │ │
        │   │ PlatformStore│ │  NonceStore  │   │        PlatformStore │ │
        │   │ KeyStore     │ │ (Supabase/KV)│   │        KeyStore      │ │
        │   └──────────────┘ └──────────────┘   └──────────┬───────────┘ │
        └──────────────────────────────────────────────────┼────────────┘
                                                            │ HTTPS
                                                   ┌────────▼─────────┐
                                                   │   LMS (Canvas /  │
                                                   │   Moodle) LTI +  │
                                                   │   AGS / NRPS     │
                                                   └──────────────────┘
```

**core** = logic. **adapters** = state (you pick/implement). **bindings** = `Request`→core→`Response` glue.

## 6. Adapter contracts (the make-or-break interfaces)

```ts
// State for the OIDC handshake. MUST be single-use + TTL.
interface NonceStore {
  create(rec: {
    state: string
    nonce: string
    platformId: string
    ttlSec: number
    data?: Record<string, unknown>   // e.g. deep_link_return_url
  }): Promise<void>
  // Atomically fetch AND delete (replay protection). Return null if missing/expired.
  consume(state: string): Promise<{
    nonce: string; platformId: string; data?: Record<string, unknown>
  } | null>
}

// The registry of trusted LMS platforms (multi-tenant friendly).
interface PlatformStore {
  find(iss: string, clientId?: string | null): Promise<Platform | null>
}

// The tool's own keypair (signs deep-link responses + AGS client assertions;
// its public half is served at the JWKS endpoint the LMS verifies against).
interface KeyStore {
  privateKey(): Promise<import('jose').KeyLike | Uint8Array>
  kid(): Promise<string>
  publicJwks(): Promise<{ keys: unknown[] }>   // supports rotation (>1 key)
}

interface Platform {
  id: string
  issuer: string          // e.g. https://canvas.instructure.com
  clientId: string
  authEndpoint: string    // OIDC authorize_redirect
  tokenEndpoint: string   // OAuth2 token (AGS/NRPS) — assertion `aud`
  keysetUrl: string       // platform JWKS (verify inbound launch)
  deploymentId?: string | null
}
```

Reference adapters ship for **memory** (dev), **Supabase/Postgres**, and **Redis/KV**. TeachSim's `lti_platforms` + `lti_nonces` tables become the Supabase adapter.

## 7. Core API surface

```ts
import { createLti } from '@ltikit/core'

const lti = createLti({
  keys:      myKeyStore,
  platforms: myPlatformStore,
  nonces:    myNonceStore,
  options: { clockToleranceSec: 30, nonceTtlSec: 600 },
})
```

### OIDC third-party initiation
```ts
// Validates the platform, persists state+nonce, returns the LMS auth redirect URL.
lti.oidc.login(params: {
  iss: string; loginHint: string; targetLinkUri: string
  clientId?: string; ltiMessageHint?: string; redirectUri: string
}): Promise<{ redirectUrl: string }>
```

### Launch verification
```ts
// Verify id_token (sig via platform JWKS, iss/aud/exp/iat + clock skew) and the
// state→nonce single-use check. Returns typed, discriminated result.
lti.launch(input: { idToken: string; state: string }): Promise<LaunchResult>

type LaunchResult = {
  platform: Platform
  claims: LtiClaims                 // fully typed
  messageType: 'LtiResourceLinkRequest' | 'LtiDeepLinkingRequest'
  context?: { id: string; title?: string }
  resourceLink?: { id: string; title?: string }
  ags?: { scopes: string[]; lineItem?: string; lineItems?: string }
  nrps?: { contextMembershipsUrl: string }
  deepLinking?: { returnUrl: string; acceptTypes: string[]; data?: string }
}
```

### Deep Linking (content selection)
```ts
lti.deepLinking.signResponse(args: {
  platform: Platform
  settings: LaunchResult['deepLinking']
  contentItems: ContentItem[]       // incl. optional lineItem for graded items
}): Promise<{ jwt: string; returnUrl: string }>

lti.deepLinking.form(args): Promise<string>  // auto-submitting HTML (binding helper)
```

### AGS (grades)
```ts
lti.ags.getToken(platform: Platform, scopes: string[]): Promise<{ token: string; type: string }>
lti.ags.lineItems.list(platform, url, filter?): Promise<LineItem[]>
lti.ags.lineItems.create(platform, containerUrl, lineItem): Promise<LineItem>
lti.ags.score.submit(platform, lineItemUrl, score: Score): Promise<void>
lti.ags.result.list(platform, lineItemUrl, filter?): Promise<Result[]>
// High-level convenience (mirrors TeachSim runGradePassback):
lti.ags.publishScore(args: {
  platform; lineItemUrl?; lineItemsUrl?; resourceLinkId?
  userId; scoreGiven; scoreMaximum; comment?
  autoCreateLabel?    // lazily create a line item if only the container exists
}): Promise<void>
```

### NRPS (names & roles)
```ts
lti.nrps.getMembers(platform: Platform, contextMembershipsUrl: string): Promise<Member[]>
```

### JWKS (serve the tool's public key)
```ts
lti.jwks(): Promise<{ keys: unknown[] }>   // return from your /jwks route
```

### Bindings (thin)
```ts
// @ltikit/next
export const POST = lti.next.oidcLogin()
export const POST = lti.next.launch(async ({ claims, messageType, ags }, req) => {
  // your app: create/lookup user, set session, redirect
  return Response.redirect(...)
})
export const GET  = lti.next.jwks()
```

## 8. Flows (mapped to the API)

```
OIDC init:   LMS ──POST──▶ oidcLogin()  ──303──▶ platform.authEndpoint
Launch:      LMS ──POST id_token,state──▶ launch()  → verified LaunchResult
Deep link:   launch()(msg=DeepLinking) → your picker → deepLinking.signResponse() → auto-submit form → LMS
AGS score:   ags.publishScore()  →  getToken (client_credentials + signed assertion)  →  POST {lineItem}/scores
NRPS:        nrps.getMembers()   →  getToken  →  GET contextMembershipsUrl
JWKS:        LMS ──GET──▶ jwks()  (verifies our signed assertions/deep-link responses)
```

## 9. Security model

Two JWT directions — the central concept:

| | Signer | Verifier | `aud` |
|---|---|---|---|
| Inbound launch (`id_token`) | LMS | ltikit (via `platform.keysetUrl`) | tool `clientId` |
| Outbound assertion (AGS/NRPS token) | ltikit (`KeyStore` private key) | LMS (via our `jwks()`) | `platform.tokenEndpoint` |

- **Nonce**: single-use via `NonceStore.consume` (atomic fetch+delete) → replay protection. TTL bounded.
- **Clock skew**: `jose` `clockTolerance` (default 30s) on `exp`/`iat`.
- **Client assertion**: `iss = sub = clientId`, `aud = tokenEndpoint`, short `exp`, unique `jti`, header `kid`.
- **No secrets in logs** (a real bug we fixed — never log PEM/tokens).

## 10. Runtime portability

- `jose` runs on Node's `crypto` **and** Web Crypto → Node, edge, Workers, Deno, Bun.
- Only `fetch` for I/O; no `axios`/`got`/Node `http`.
- No `Buffer`/`fs`/`process`-only assumptions in core (config passed in, not read from `process.env`).
- Edge caveat documented: some adapters (Postgres over TCP) don't run on Workers → pair Workers with an HTTP/KV adapter.

## 11. Hard-won correctness (built into the library — the real value)

These are field-verified fixes from the TeachSim integration; a newcomer loses days to each:

- **Score URL**: insert `/scores` into the line-item **path before** the query string (Canvas line items carry `?type_id=N`).
- **Assertion `aud`** = `tokenEndpoint`, **not** the issuer.
- **AGS `scope` claim is an array**; request exactly the scope you need (`.../scope/score`).
- **`gradingProgress: "FullyGraded"`** or the grade won't surface.
- **Canvas issuer** = `https://canvas.instructure.com` for hosted **and** most self-hosted (not the web URL).
- **No-email users** (Canvas Test Student / privacy): identify by `sub`, don't require `email`.
- **Line item may be absent** (only the container) → lazy create.
- **Deep-link content item `lineItem`** provisions the gradebook column up front.
- **Cookie/iframe** helper (optional): `SameSite=None; Secure` guidance for tools embedded in an LMS iframe.

## 12. Extraction map (from TeachSim → ltikit)

| TeachSim | → ltikit |
|---|---|
| `lib/lti/jwt.ts` (verify, sign) | `@ltikit/core` crypto (drop the debug logs) |
| `lib/lti/config.ts` (URN constants) | `@ltikit/core` constants |
| `lib/lti/types.ts` | `@ltikit/core` types |
| `lib/lti/ags.ts` (token, scoresUrl, postScore, getOrCreateLineItem, runGradePassback) | `@ltikit/core` `ags.*` |
| `lib/lti/platform.ts` `lookupPlatform` | `PlatformStore` contract + Supabase adapter |
| `lti_platforms` / `lti_nonces` tables + queries | `@ltikit/adapter-supabase` |
| `app/api/lti/{oidc-login,launch,deeplink,jwks}` | `@ltikit/next` bindings + example app |
| `upsertLtiProfile`, magic-link, cookies | **stays in the app** (not the library) |
| `lib/lti/fullscreen.ts` | optional `@ltikit/next` iframe helpers (or example only) |

## 13. Testing & conformance

- **Unit**: core logic with mocked JWKS/token endpoints (fixtures from real Canvas/Moodle payloads we already have).
- **Adapter conformance suite**: one shared test kit every `NonceStore`/`PlatformStore` must pass (esp. single-use + TTL).
- **Integration**: the `examples/next-demo` app run against MoodleCloud + a Canvas sandbox.
- **1EdTech LTI Advantage certification** as the credibility milestone (post-MVP) — the differentiator `ltijs` has.

## 14. Versioning & release

- **Changesets**: per-package semver, generated changelogs, `changeset publish` in CI.
- `@ltikit/core` is the stability anchor; bindings/adapters can move faster (0.x) early.
- Public API frozen behind a documented surface; internal helpers not exported.

## 15. MVP roadmap

**M1 — core walking skeleton**
`@ltikit/core`: `oidc.login`, `launch` (verify), `jwks`; `NonceStore`/`PlatformStore`/`KeyStore` interfaces; `@ltikit/adapter-memory`.

**M2 — grades + deep linking**
`ags.*` (token + publishScore + lazy line item), `deepLinking.*`. Port TeachSim AGS verbatim (it's proven).

**M3 — bindings + real adapter**
`@ltikit/next`, `@ltikit/adapter-supabase`. Stand up `examples/next-demo`; re-run the Moodle/Canvas verification.

**M4 — parity + polish**
`nrps.getMembers`, `@ltikit/hono`/`@ltikit/adapter-redis`, dynamic registration, docs site, typed errors.

**M5 — certification**
1EdTech conformance; publish 1.0.

## 16. Open questions

1. **Dynamic Registration** (auto platform onboarding) in v1 or v2? (`ltijs` has it; it's a strong selling point.)
2. Ship the **cookie/iframe** helper in core-adjacent land, or docs-only?
3. Include **LTI 1.1 Basic Outcomes** as a legacy adapter, or stay 1.3-only? (We saw Moodle emit `lti-bo` when AGS was off.)
4. Access-token **caching** across invocations — an optional `TokenCache` adapter, or leave to the consumer?
5. Bundle a **Deep Linking picker** UI component, or keep UI entirely app-side?

---

### Appendix — the one-paragraph pitch
> `@ltikit/core` is an LTI 1.3 (LTI Advantage) toolkit with a stateless core (just `jose` + `fetch`) and pluggable storage. It runs on serverless and edge — Next.js, Hono, Cloudflare Workers, Lambda — with no Express and no MongoDB. Bring your own database via small adapters. Battle-tested against Canvas and Moodle for SSO, deep linking, and grade passback.
