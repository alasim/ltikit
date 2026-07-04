---
title: Quickstart
description: Stand up an LTI 1.3 tool with ltikit.
---

## Install

```bash
npm i @ltikit/core @ltikit/next @ltikit/adapter-supabase
```

## 1. Create the ltikit instance

```ts
// lib/lti.ts
import { createClient } from '@supabase/supabase-js'
import { createLti, staticKeyStore } from '@ltikit/core'
import { supabasePlatformStore, supabaseNonceStore, type SupabaseLike } from '@ltikit/adapter-supabase'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const client = admin as unknown as SupabaseLike

export const lti = createLti({
  keys: staticKeyStore({
    privateKeyPem: process.env.LTI_TOOL_PRIVATE_KEY!, // PKCS8 PEM
    kid: process.env.LTI_TOOL_KEY_ID ?? 'ltikit-key-1',
    publicJwk: JSON.parse(process.env.LTI_TOOL_PUBLIC_JWK!),
  }),
  platforms: supabasePlatformStore(client),
  nonces: supabaseNonceStore(client),
})
```

## 2. Wire the routes (Next.js App Router)

```ts
// app/api/lti/login/route.ts
import { oidcLogin } from '@ltikit/next'
import { lti } from '@/lib/lti'
export const POST = oidcLogin(lti, { redirectUri: `${process.env.APP_URL}/api/lti/launch` })
```

```ts
// app/api/lti/launch/route.ts
import { launch, sessionRedirect } from '@ltikit/next'
import { ltiIdentity } from '@ltikit/core'
import { lti } from '@/lib/lti'

export const POST = launch(lti, async (result) => {
  const id = ltiIdentity(result.claims)       // sub, email?, roles, isInstructor, context…
  // TODO: find/create your user + start your session (see the Auth integration guide)
  return sessionRedirect({ to: `${process.env.APP_URL}/home`, cookies: [/* your session cookie */] })
})
```

```ts
// app/.well-known/jwks.json/route.ts
import { jwks } from '@ltikit/next'
import { lti } from '@/lib/lti'
export const GET = jwks(lti)
```

## 3. Database + keypair

- Apply the adapter schema: `npx @ltikit/adapter-supabase > supabase/migrations/0001_ltikit.sql` (see
  [Supabase adapter](/ltikit/guides/supabase-adapter/)).
- Generate an RS256 keypair for `LTI_TOOL_PRIVATE_KEY` / `LTI_TOOL_PUBLIC_JWK`.

## 4. Register with the LMS

Point your LMS at the routes above (JWKS = `/.well-known/jwks.json`, OIDC login = `/api/lti/login`,
redirect URI = `/api/lti/launch`) and add a platform row. See
[LMS registration](/ltikit/guides/lms-registration/).

## Next steps

- [Concepts](/ltikit/getting-started/concepts/) — how the flows fit together.
- [Auth integration](/ltikit/guides/auth-integration/) — turn the verified launch into a real session.
- [Running in an iframe](/ltikit/guides/iframe/) — CSP + cookies for LMS embedding.
