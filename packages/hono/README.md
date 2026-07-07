# @ltikit/hono

[Hono](https://hono.dev) route bindings for [LTIkit](https://github.com/alasim/ltikit) — for edge
runtimes (Cloudflare Workers, Deno, Bun) or any Hono app.

**Pick one framework binding** (this, [`@ltikit/next`](https://www.npmjs.com/package/@ltikit/next),
or hand-rolled). Requires [`@ltikit/core`](https://www.npmjs.com/package/@ltikit/core) and
`hono` (peer dependency).

```bash
npm i @ltikit/core @ltikit/hono hono
```

## Usage

```ts
import { oidcLogin, launch, jwks } from '@ltikit/hono'

app.post('/api/lti/login', oidcLogin(lti, { redirectUri: `${APP_URL}/api/lti/launch` }))
app.post('/api/lti/launch', launch(lti, async (result, c) => c.redirect('/home')))
app.get('/.well-known/jwks.json', jwks(lti))
```

## Docs

- [Framework bindings](https://alasim.github.io/ltikit/guides/frameworks/)
- [Quickstart](https://alasim.github.io/ltikit/getting-started/quickstart/)
- [API reference](https://alasim.github.io/ltikit/api/hono/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
