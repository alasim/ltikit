---
"@ltikit/core": patch
"@ltikit/next": patch
"@ltikit/hono": patch
"@ltikit/adapter-supabase": patch
"@ltikit/adapter-redis": patch
"@ltikit/adapter-memory": patch
---

Add npm package metadata (author, homepage, repository, bugs) and per-package README files so registry pages are useful. Add `@ltikit/adapter-prisma` — a Prisma-based `PlatformStore`/`NonceStore` adapter (works with any Prisma-supported DB; SQLite-compatible nonce data via a plain string column).
