---
"@ltikit/core": patch
"@ltikit/next": patch
"@ltikit/adapter-supabase": patch
---

Republish (rc.4). The rc.3 `@ltikit/next` tarball on npm was corrupted by a double-publish — the registry metadata integrity did not match the served tarball, so installs failed with `ERR_PNPM_TARBALL_INTEGRITY`. No source changes; clean rebuild + republish to supersede the bad rc.3.
