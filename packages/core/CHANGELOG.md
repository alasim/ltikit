# @ltikit/core

## 1.0.0-rc.1

### Patch Changes

- Add npm package metadata (author, homepage, repository, bugs) and per-package README files so registry pages are useful. Add `@ltikit/adapter-prisma` — a Prisma-based `PlatformStore`/`NonceStore` adapter (works with any Prisma-supported DB; SQLite-compatible nonce data via a plain string column).

## 1.0.0-rc.0

### Major Changes

- Freeze public API surface for 1.0-rc. Phases 0-6 (core LTI 1.3 flow, adapters, Next/Hono bindings, NRPS) are stable and live-verified against MoodleCloud.
