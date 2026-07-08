# @ltikit/core

## 1.0.0-rc.3

### Minor Changes

- d1e81f5: Multi-tenant platform ownership. Add optional `tenantId` to `Platform` (and thus `PlatformInput`), so a `MutablePlatformStore` can bind each registration to a tenant (e.g. an organization) and return it from `find`. Thread it through Dynamic Registration via `RegistrationParams.tenantId` and the `@ltikit/next` `dynamicRegistration(lti, { tenantId })` binder option — static or derived from the request (a throwing resolver rejects registration with a 400, so an invalid signed link never persists an unowned platform). The Supabase adapter maps it to a configurable column via `supabasePlatformStore(client, { tenantColumn })`; the memory adapter carries it in-process. Fully backward-compatible — all fields optional and default off.

## 1.0.0-rc.2

### Minor Changes

- e6c214b: Add `signCapabilityLink`/`verifyCapabilityLink` — a self-issued, self-verified short-lived token using the tool's own keypair, for no-login privileged links (e.g. a faculty review link opened from Canvas SpeedGrader). Add `canvasSubmission` to `publishScore`/`postScore` — the Canvas-only AGS score extension (`https://canvas.instructure.com/lti/submission`) that attaches a clickable review link to a posted grade.

## 1.0.0-rc.1

### Patch Changes

- Add npm package metadata (author, homepage, repository, bugs) and per-package README files so registry pages are useful. Add `@ltikit/adapter-prisma` — a Prisma-based `PlatformStore`/`NonceStore` adapter (works with any Prisma-supported DB; SQLite-compatible nonce data via a plain string column).

## 1.0.0-rc.0

### Major Changes

- Freeze public API surface for 1.0-rc. Phases 0-6 (core LTI 1.3 flow, adapters, Next/Hono bindings, NRPS) are stable and live-verified against MoodleCloud.
