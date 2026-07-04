---
title: Auth integration
description: Turn a verified LTI launch into a real logged-in session — with any auth stack.
---

LTIkit is **auth-agnostic**. It verifies the launch and hands you verified claims; **you** create the
user and session with whatever you already use. This guide shows the seam and four concrete recipes.

## The seam

Everything happens in your launch handler. It receives a verified `LaunchResult`; you:

1. normalize claims with `ltiIdentity()`,
2. find-or-create your user (your DB) — **keyed on `sub`**, not email,
3. start a session with **your** auth library,
4. set the session cookie **iframe-safe** and redirect.

```ts
import { launch, sessionRedirect } from '@ltikit/next'
import { ltiIdentity } from '@ltikit/core'
import { lti } from '@/lib/lti'

export const POST = launch(lti, async (result) => {
  const id = ltiIdentity(result.claims)
  const user = await upsertUserByLtiSub(id)          // your DB (Prisma/Drizzle/Supabase)
  const sessionValue = await createSession(user)     // your auth lib's server API
  return sessionRedirect({
    to: `${process.env.APP_URL}/home`,
    cookies: [{ name: 'session', value: sessionValue, maxAgeSec: 60 * 60 * 8 }],
  })
})
```

### Three constraints (LTI-iframe realities, not per-library)

- **`SameSite=None; Secure`** — the tool runs in a cross-site LMS iframe, so the session cookie must be
  `SameSite=None; Secure` (increasingly also `Partitioned`/CHIPS). `sessionRedirect` / `sameSiteNoneCookie`
  handle this.
- **Set it in the launch response** — the first request is a cross-site POST, so establish the session in
  that response (redirect + `Set-Cookie`), not on a later navigation.
- **Identify by `sub` (+ issuer)** — `email` may be absent (Canvas Test Student, privacy). Synthesize a
  placeholder only if your user store needs one.

`ltiIdentity(claims)` gives you `{ sub, issuer, email?, name?, givenName?, familyName?, roles, isInstructor,
isLearner, contextId?, contextTitle?, resourceLinkId? }`.

---

## Recipe: Supabase Auth

Mint a magic link server-side and redirect through your confirm route to set SSR cookies. Identity is keyed
on the LTI `sub`; synthesize an email when the LMS omits one.

```ts
export const POST = launch(lti, async (result) => {
  const id = ltiIdentity(result.claims)
  const email =
    id.email ?? `lti-${id.sub}@${new URL(id.issuer).host}.lti.local` // stable placeholder

  // find-or-create by (issuer, sub); fall back to email only for a real email
  const userId = await upsertProfileByLtiSub(id, email)

  const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const url = new URL(`${process.env.APP_URL}/auth/confirm`)
  url.searchParams.set('token_hash', data!.properties!.hashed_token)
  url.searchParams.set('type', 'magiclink')
  url.searchParams.set('next', '/home')
  return Response.redirect(url.toString(), 303)
})
```

Your `/auth/confirm` route calls `supabase.auth.verifyOtp({ token_hash, type })` and sets the SSR cookies.
Ensure the Supabase auth cookies are `SameSite=None; Secure` for the iframe. This mirrors the battle-tested
TeachSim `upsertLtiProfile` pattern.

---

## Recipe: NextAuth / Auth.js

Two options:

**A. Credentials provider** — sign in with the verified `sub` (trusted, since LTIkit already verified it):

```ts
// in the launch handler, after upserting the user:
// redirect into an internal route that calls signIn('lti', { sub: id.sub, redirect: false })
// then redirect to /home. The Credentials `authorize` looks the user up by sub.
```

**B. Mint the session directly** — encode the Auth.js session JWT and set its cookie via `sessionRedirect`.

Either way, configure the Auth.js session cookie for the iframe:

```ts
// auth config
cookies: {
  sessionToken: {
    name: 'next-auth.session-token',
    options: { httpOnly: true, sameSite: 'none', secure: true, path: '/' },
  },
}
```

---

## Recipe: better-auth

Create a session with better-auth's server API, then set its cookie iframe-safe.

```ts
export const POST = launch(lti, async (result) => {
  const id = ltiIdentity(result.claims)
  const user = await upsertUserByLtiSub(id)
  const { token } = await auth.api.createSession({ userId: user.id }) // server API
  return sessionRedirect({
    to: `${process.env.APP_URL}/home`,
    cookies: [{ name: 'better-auth.session_token', value: token, maxAgeSec: 60 * 60 * 24 * 7 }],
  })
})
```

Confirm better-auth's cookie attributes are `SameSite=None; Secure` (or set them via `sessionRedirect` as
above).

---

## Recipe: Custom JWT

No framework — sign your own session token from the identity and set the cookie.

```ts
import { SignJWT } from 'jose'

export const POST = launch(lti, async (result) => {
  const id = ltiIdentity(result.claims)
  const user = await upsertUserByLtiSub(id)
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET!)
  const jwt = await new SignJWT({ uid: user.id, roles: id.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret)

  return sessionRedirect({
    to: `${process.env.APP_URL}/home`,
    cookies: [{ name: 'session', value: jwt, maxAgeSec: 60 * 60 * 8, partitioned: true }],
  })
})
```

Verify the JWT in your middleware on subsequent requests.

---

## Gotchas

- Cookie without `SameSite=None; Secure` → silently dropped inside the LMS iframe → user looks logged out.
- Relying on `email` → breaks for no-email users. Key on `sub`.
- Setting the session on a later page instead of the launch response → the cross-site POST has no session yet.
- Third-party cookie deprecation → add `Partitioned` (CHIPS); the long-term fix is the LTI Platform Storage
  (cookieless) spec, on the LTIkit roadmap.
