---
title: Capabilities
description: Which LTI 1.3 / Advantage features LTIkit supports.
---

What LTIkit implements today, and what's planned. This page grows as more of the LTI Advantage surface lands.

## LTI 1.3 / Advantage

| Capability | Status | Notes |
|---|---|---|
| OIDC third-party login + launch verification | ✅ | Signature, single-use nonce, claim validation |
| JWKS (serve tool public keys) | ✅ | `lti.jwks()` |
| Deep Linking (content selection) | ✅ | Sign response + auto-submit form; `lineItem` on items |
| AGS — line items | ✅ | list / create / get |
| AGS — scores (grade passback) | ✅ | `publishScore`, `FullyGraded`, cross-LMS gotchas baked in |
| AGS — results | ✅ | `result.list` |
| NRPS (names & roles / roster) | ✅ | `getMembers` with pagination |
| Identity helpers | ✅ | `ltiIdentity`, `isInstructor` / `isLearner` |

## Bindings & adapters

| Package | Status |
|---|---|
| `@ltikit/next` (Next.js) | ✅ |
| `@ltikit/hono` (Hono) | ✅ |
| `@ltikit/adapter-supabase` (Postgres) | ✅ |
| `@ltikit/adapter-redis` (Redis / Upstash) | ✅ nonce store |
| `@ltikit/adapter-memory` (dev/tests) | ✅ |

## Planned

| Capability | Status | Notes |
|---|---|---|
| Dynamic Registration | 🔜 | Auto tool onboarding |
| LTI Platform Storage (cookieless launches) | 🔜 | postMessage-based; future-proofs 3p-cookie deprecation |
| Access-token caching (`TokenCache` adapter) | 🔜 | Optional; for bulk AGS/NRPS |
| 1EdTech LTI Advantage certification | 🔜 | Credibility milestone |

Verified live against **Canvas** and **MoodleCloud** (SSO, deep linking, grade passback, roster).
