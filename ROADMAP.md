# ltikit — Roadmap

Phased, **review-gated** delivery. We complete **one phase at a time**; at the end of each phase I present the deliverable + exit criteria, you review, and only on your **confirm** do we start the next phase. See `DESIGN.md` for architecture.

## Working agreement
- Each phase has **Deliverables** + **Exit criteria** (objective "done" checks) + a **Review gate**.
- No phase starts before the previous is confirmed.
- Every phase ends **green**: `pnpm build` + `pnpm test` pass; `@ltikit/core` stays framework/DB-free (lint-enforced).

## Locked decisions
- **Dynamic Registration → v2** (not in the 1.0 line).
- **LTI 1.1 / Basic Outcomes → out of scope.** 1.3 / Advantage only.

## Decisions to make later (detail below, decide when we reach the phase)
1. **Access-token caching** — Phase 7. 2. **Cookie/iframe helper depth** — Phase 5/7. 3. **Deep-link picker UI** — Phase 4/5. Full trade-offs in the appendix.

---

## Phase 0 — Monorepo scaffold + tooling
**Deliverables**
- `pnpm-workspace.yaml`, root `package.json` (private), `tsconfig.base.json`, ESLint (rule: `@ltikit/core` may not import framework/DB packages), Prettier.
- Changesets configured. Minimal CI (build + test + lint).
- Empty `packages/core` + `packages/adapter-memory` that build and export a version.

**Exit criteria**
- `pnpm install && pnpm build && pnpm test && pnpm lint` all green.
- `import { version } from '@ltikit/core'` resolves in a scratch script.

---

## Phase 1 — Core: types + constants + crypto
**Deliverables**
- Port `types.ts` (claims, platform, content item) + `config.ts` (LTI URN constants) → `@ltikit/core`.
- Port `jwt.ts`: `verifyLtiJwt` (RS256 via remote JWKS, iss/aud/exp/iat + clock tolerance) and the RS256 signing primitive. **Drop the debug PEM logging.**
- `KeyStore` interface + `jwks()` (build a keyset from public keys).
- Typed error classes (`SignatureError`, `NonceReplayError`, `ExpiredError`, `PlatformNotFoundError`).

**Exit criteria**
- Unit test: a **real captured Canvas + Moodle `id_token`** (fixture) verifies against a mock JWKS; a tampered token fails.
- Sign a JWT and verify it with `jwks()` output.

---

## Phase 2 — Core: adapters + OIDC login + launch verify
**Deliverables**
- `NonceStore`, `PlatformStore` interfaces + `@ltikit/adapter-memory`.
- `createLti(config)`.
- `oidc.login(params)` → persists state+nonce, returns the LMS auth redirect URL.
- `launch({ idToken, state })` → verify sig + single-use nonce + claims → typed `LaunchResult` (messageType, context, resourceLink, `ags`, `nrps`, `deepLinking`).
- **Adapter conformance test kit** (shared suite: single-use, TTL/expiry, missing state → null).

**Exit criteria**
- End-to-end handshake in a test harness (memory adapters): `oidc.login` → simulated LMS → `launch` returns verified claims.
- **Replayed `state` is rejected** (nonce consumed once).
- Memory adapter passes the conformance kit.

---

## Phase 3 — Core: AGS (grade passback)
**Deliverables**
- `ags.getToken(platform, scopes)` — client_credentials with a **signed client assertion** (`iss=sub=clientId`, `aud=tokenEndpoint`, jti/exp, `kid`).
- `scoresUrl()` (path-safe `/scores` insertion), `ags.score.submit`, `ags.lineItems.{list,create,get}`, `ags.result.list`.
- `ags.publishScore({...})` — high-level: resolve line item (or lazy-create from container), post score. Ported from TeachSim `ags.ts`.
- **Gotchas baked in + unit-tested**: `/scores` before query string; `aud=tokenEndpoint`; score scope exact; `gradingProgress:'FullyGraded'`; required payload fields.

**Exit criteria**
- Against a mock AGS server: token request body + assertion claims correct; score POST hits the right URL with the right payload.
- Tests assert each gotcha explicitly (e.g. Canvas `?type_id=` line item → correct scores URL).

---

## Phase 4 — Core: Deep Linking
**Deliverables**
- `deepLinking.signResponse({ platform, settings, contentItems })` → RS256 JWT (supports `lineItem` on items for graded content).
- `deepLinking.form(...)` → auto-submitting HTML form helper.
- **Decision point: picker UI** (see appendix) — v1 recommendation is app-side; example app carries a reference picker.

**Exit criteria**
- Signed deep-link response verifies against our `jwks()`; content item schema (incl `lineItem`) validated.
- Round-trip test: sign → decode → assert claims/message type.

---

## Phase 5 — Next binding + Supabase adapter + live example
**Deliverables**
- `@ltikit/next`: route-handler bindings (`oidcLogin`, `launch(handler)`, `jwks`) + optional iframe helpers (CSP `frame-ancestors` builder, `SameSite=None` cookie preset, `frameResize` postMessage). **Decision point: helper depth** (appendix).
- `@ltikit/adapter-supabase`: `PlatformStore` + `NonceStore` from the TeachSim `lti_platforms` / `lti_nonces` schema (+ SQL migration).
- `examples/next-demo` — a minimal tool wiring it all together.

**Exit criteria**
- Example app runs against **MoodleCloud + a Canvas sandbox**: SSO launch, deep-link content selection, and **grade posts to the gradebook** — the same proof we have in TeachSim, now via ltikit.

---

## Phase 6 — NRPS + second adapter/binding
**Deliverables**
- `nrps.getMembers(platform, url)` (names & roles) with paging.
- `@ltikit/adapter-redis` (Upstash/Redis nonce store), `@ltikit/hono` binding.
- Error-type polish + docs stubs per package.

**Exit criteria**
- Roster fetch works against a live LMS in the example.
- Redis adapter passes the conformance kit; Hono binding passes a handler smoke test.

---

## Phase 7 — Docs, hardening, 1.0-rc
**Deliverables**
- Docs site / README set: quickstart, adapter guide, Canvas/Moodle setup, the "gotchas" reference, migration-from-ltijs note.
- **Implement the deferred decisions**: `TokenCache` adapter (if chosen), iframe helper set (final depth).
- Semver freeze of the public surface; `0.x → 1.0-rc`.

**Exit criteria**
- Docs cover every exported API; a new user can integrate from docs alone.
- CI publishes canaries via Changesets.

---

## Phase 8 — v2 track (post-1.0)
**Deliverables**
- **Dynamic Registration** (auto platform onboarding).
- **LTI Platform Storage** (postMessage, **cookieless** launches — future-proofs against third-party-cookie deprecation; Canvas already sends `lti_storage_target`).
- **1EdTech LTI Advantage certification.**

**Exit criteria**
- Dynamic registration completes against a supporting LMS.
- Cookieless launch works with 3p cookies blocked.
- Certification passed → **1.0 GA**.

---

## Appendix — the 3 deferred decisions (detail)

### A. Access-token caching (Phase 7)
**Problem.** AGS/NRPS need an OAuth token via client_credentials. Tokens are short-lived (Canvas ~1h). Today every call mints a fresh one = a JWT sign + a POST to the LMS token endpoint (~200–500ms). For bulk work (roster sync, many scores) that's slow and risks LMS **token-endpoint rate limits**.
**Serverless nuance.** An in-memory cache is useless across cold invocations — real caching needs a **shared store** (Redis/KV). So "caching" = another adapter, not a core feature.
**Options.** (a) No cache — consumer wraps if needed (simplest core). (b) Optional `TokenCache` adapter — core uses it when provided; key by `(platform, scopes)` with TTL from the token response; ship memory + Redis.
**Recommendation.** **Optional `TokenCache` adapter, off by default.** Core mints per call unless a cache is injected. Non-blocking; lands in Phase 7. *Decide: do any target consumers do bulk AGS/NRPS at launch? If yes, prioritize the Redis cache.*

### B. Cookie / iframe helper depth (Phase 5/7)
**Problem.** Tools in an LMS iframe hit third-party-cookie limits (the `SameSite=None; Secure` story; localStorage partitioning; Private Network Access). This is partly an **app/session concern**, not pure LTI — a generic lib can't own your session.
**What's safe to ship (framework-agnostic).** CSP `frame-ancestors` builder from a platform allowlist; `SameSite=None; Secure` cookie-attribute presets; LTI iframe `postMessage` helpers (`frameResize`).
**The big one.** There's an official **LTI Platform Storage** spec (postMessage-based) for **cookieless** launches — Canvas supports it (we saw `lti_storage_target` in the launch POST). With Chrome deprecating 3p cookies, this is strategically valuable but non-trivial.
**Recommendation.** **v1: docs-first + a small `@ltikit/next` util set** (CSP builder, cookie preset, frameResize). **Platform Storage (cookieless) → Phase 8 (v2)** as a headline feature. *Decide: how important is cookieless now vs docs being enough for launch?*

### C. Deep-link picker UI (Phase 4/5)
**Problem.** Deep linking needs an instructor-facing "select content" screen. The content is **app-specific** (sims, courses, resources) → a generic styled component has little value and fights every design system.
**Options.** (a) App-side only — core signs the response; app builds the picker (max flexibility, matches "core has no UI"). (b) Ship a **headless** helper (state/handlers, no styling) or a reference picker in the example app.
**Recommendation.** **App-side only in core; reference picker in `examples/next-demo`.** Optionally a headless hook later if there's demand. Keeps the "no UI in core" principle. *Decide: do we want a headless `useDeepLinkPicker` helper, or is the example enough?*

<!-- ingnore the below part -->

Model + effort per phase. Set before each.

Model: Opus 4.8 (you on it) = best for security/correctness phases. Sonnet 5 ok for scaffold/docs/wiring to save cost. Don't drop below Opus for crypto/verify.

Effort levels: low / medium / high / xhigh / max. Higher = better reasoning, slower/costlier.

Phase	Model	Effort	Why
0 scaffold	Sonnet or Opus	medium	mechanical config/boilerplate
1 crypto/jwt/types	Opus	high	JWT verify = security-critical, get wrong = broken/insecure
2 adapters + OIDC + launch verify	Opus	high (xhigh for nonce single-use logic)	replay protection + atomicity + claim validation
3 AGS grades	Opus	high	cross-LMS gotchas, money-path (grades)
4 deep linking	Opus	high	signed response correctness
5 next binding + supabase + live test	Opus/Sonnet	medium	wiring, proven logic
6 NRPS + redis/hono	Opus/Sonnet	medium	more of same
7 docs + hardening	Sonnet (docs), Opus (harden)	low docs / medium harden	prose cheap, hardening needs care
8 v2 (dynreg, platform storage, cert)	Opus	high	new spec surfaces
Default: Opus + high for core (1–4). medium for scaffold/wiring/docs (0,5,6,7). Bump xhigh/max only if a specific bug fights back (e.g. JWT edge case, nonce race).

1M context = keep it — both teachsim + ltikit in workspace, I port real code across repos.

/fast = Opus faster output, no quality drop → fine for phase 0/5/6/docs.

Set Opus + medium for Phase 0 now. Confirm → I scaffold.