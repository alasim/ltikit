# @ltikit/next

Next.js App Router route-handler bindings for [LTIkit](https://github.com/alasim/ltikit) — built on
Web-standard `Request`/`Response`, **no `next` dependency**. Works in any App Router route.

**Pick one framework binding** (this, [`@ltikit/hono`](https://www.npmjs.com/package/@ltikit/hono),
or hand-rolled). Requires [`@ltikit/core`](https://www.npmjs.com/package/@ltikit/core).

```bash
npm i @ltikit/core @ltikit/next
```

## Usage

```ts
// app/api/lti/login/route.ts
import { oidcLogin } from '@ltikit/next'
export const POST = oidcLogin(lti, { redirectUri: `${APP_URL}/api/lti/launch` })

// app/api/lti/launch/route.ts
import { launch, sessionRedirect } from '@ltikit/next'
export const POST = launch(lti, async (result) => {
  // create your session (see Auth integration), then:
  return sessionRedirect({ to: '/home', cookies: [/* your session cookie */] })
})

// app/.well-known/jwks.json/route.ts
import { jwks } from '@ltikit/next'
export const GET = jwks(lti)
```

Also exports iframe helpers — `cspFrameAncestors`, `sameSiteNoneCookie` (with CHIPS
`Partitioned` support), `sessionRedirect`, `frameResizeScript` — and a `./client` entry for **LTI
Platform Storage** (cookieless launches, survives third-party-cookie blocking):

```ts
import { platformStorage } from '@ltikit/next/client'
```

## Docs

- [Framework bindings](https://alasim.github.io/ltikit/guides/frameworks/)
- [Running in an iframe](https://alasim.github.io/ltikit/guides/iframe/)
- [Quickstart](https://alasim.github.io/ltikit/getting-started/quickstart/)
- [API reference](https://alasim.github.io/ltikit/api/next/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
