---
title: Capabilities
description: Which LTI 1.3 / Advantage features LTIkit supports today.
---

The per-feature status grid. For milestones and the path ahead, see the [Roadmap](../../roadmap/).

**Legend:** ✅ full · ◑ partial · 🔜 next (v1.0 GA) · 🔲 future (v1.x / v2.x) · 🚫 out of scope

## LTI 1.3 core

| Capability | Status | Notes |
|---|---|---|
| OIDC third-party login + launch verification | ✅ | RS256 signature, single-use nonce (replay defense), `iss`/`aud`/`exp`/`nonce`/`azp`/`deployment_id` |
| JWKS (serve tool public keys) | ✅ | `lti.jwks()` |
| Identity helpers | ✅ | `ltiIdentity`, roles, `isInstructor` / `isLearner` |
| Launch claims: context, resource link | ✅ | Surfaced on `LaunchResult` |
| Launch claims: `custom`, `launch_presentation`, `tool_platform` | 🔜 | Present in the raw claims bag; typed on `LaunchResult` at 1.0 GA |

## LTI Advantage services

| Capability | Status | Notes |
|---|---|---|
| Deep Linking — response signing + auto-submit form | ✅ | `deepLinking.signResponse`, `deepLinking.form`; `data` echo |
| Deep Linking — content types | ◑ | `ltiResourceLink` only (with `lineItem` for graded content); `link` / `html` / `file` / `image` + `iframe`/`window` presentation → 🔜 |
| AGS — line items | ◑ | list / create / get ✅; update / delete → 🔜 |
| AGS — scores (grade passback) | ✅ | `publishScore`, `FullyGraded`, cross-LMS gotchas baked in |
| AGS — score `submission` object | 🔜 | For submission timestamps / review |
| AGS — results | ✅ | `result.list` |
| NRPS (names & roles / roster) | ◑ | context-level `getMembers` + `Link rel=next` pagination + `role`/`limit` ✅; resource-link `rlid` + `differences` → 🔜 |
| Submission Review (`LtiSubmissionReviewRequest`) | 🔲 | Faculty review a submission from the LMS (v1.x) |

## Advantage extensions

| Capability | Status | Notes |
|---|---|---|
| Dynamic Registration | ✅ | OpenID Connect Dynamic Client Registration; auto tool onboarding |
| LTI Platform Storage (cookieless launches) | ✅ | `@ltikit/next/client` postMessage; survives 3p-cookie blocking |
| iframe `postMessage` — `frameResize` | ✅ | `frameResizeScript` |
| iframe `postMessage` — `get_page_content` / `scrollToTop` / `showAlert` | 🔲 | v1.x |
| Access-token caching (`TokenCache` adapter) | 🔲 | Optional, off by default; for bulk AGS/NRPS (v1.x) |
| 1EdTech LTI Advantage certification | 🔜 | Credibility milestone → tags 1.0 GA |

## Bindings & adapters

| Package | Status | Notes |
|---|---|---|
| `@ltikit/next` (Next.js) | ✅ | Route bindings + iframe helpers + `/client` Platform Storage |
| `@ltikit/hono` (Hono) | ✅ | Route bindings |
| Express / SvelteKit / Remix bindings | 🔲 | v1.x (edge / Workers / Deno / Bun already work via the web-standard core) |
| `@ltikit/adapter-supabase` (Postgres) | ✅ | `PlatformStore` + `NonceStore` |
| `@ltikit/adapter-redis` (Redis / Upstash) | ◑ | `NonceStore` ✅; `PlatformStore` → 🔲 |
| `@ltikit/adapter-memory` (dev/tests) | ✅ | `PlatformStore` + `NonceStore` |
| `@ltikit/adapter-prisma` (any Prisma DB) | ✅ | `PlatformStore` + `NonceStore`; SQLite/Postgres/MySQL |
| Drizzle / DynamoDB / Mongo adapters | 🔲 | v1.x |

## Advanced services (future)

| Capability | Status | Notes |
|---|---|---|
| Course Groups service | 🔲 | v2.x |
| Proctoring & Assessment (ACS) | 🔲 | v2.x |
| Assets service / Asset Processor | 🔲 | v2.x |
| Caliper Analytics / xAPI | 🔲 | v2.x |
| LTI 1.1 / Basic Outcomes | 🚫 | Out of scope — 1.3 / Advantage only |

Verified live against **Canvas** and **MoodleCloud** (SSO, deep linking, grade passback, roster, dynamic registration).
