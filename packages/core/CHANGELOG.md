# @ltikit/core

## 1.0.0-rc.2

### Minor Changes

- e6c214b: Add `signCapabilityLink`/`verifyCapabilityLink` — a self-issued, self-verified short-lived token using the tool's own keypair, for no-login privileged links (e.g. a faculty review link opened from Canvas SpeedGrader). Add `canvasSubmission` to `publishScore`/`postScore` — the Canvas-only AGS score extension (`https://canvas.instructure.com/lti/submission`) that attaches a clickable review link to a posted grade.

## 1.0.0-rc.1

### Patch Changes

- Add npm package metadata (author, homepage, repository, bugs) and per-package README files so registry pages are useful. Add `@ltikit/adapter-prisma` — a Prisma-based `PlatformStore`/`NonceStore` adapter (works with any Prisma-supported DB; SQLite-compatible nonce data via a plain string column).

## 1.0.0-rc.0

### Major Changes

- Freeze public API surface for 1.0-rc. Phases 0-6 (core LTI 1.3 flow, adapters, Next/Hono bindings, NRPS) are stable and live-verified against MoodleCloud.
