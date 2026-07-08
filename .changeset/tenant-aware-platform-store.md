---
"@ltikit/core": minor
"@ltikit/next": minor
"@ltikit/adapter-supabase": minor
"@ltikit/adapter-memory": minor
---

Multi-tenant platform ownership. Add optional `tenantId` to `Platform` (and thus `PlatformInput`), so a `MutablePlatformStore` can bind each registration to a tenant (e.g. an organization) and return it from `find`. Thread it through Dynamic Registration via `RegistrationParams.tenantId` and the `@ltikit/next` `dynamicRegistration(lti, { tenantId })` binder option — static or derived from the request (a throwing resolver rejects registration with a 400, so an invalid signed link never persists an unowned platform). The Supabase adapter maps it to a configurable column via `supabasePlatformStore(client, { tenantColumn })`; the memory adapter carries it in-process. Fully backward-compatible — all fields optional and default off.
