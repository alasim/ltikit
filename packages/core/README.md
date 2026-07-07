# @ltikit/core

Runtime-agnostic **LTI 1.3 (LTI Advantage)** core for [LTIkit](https://github.com/alasim/ltikit) —
just [`jose`](https://github.com/panva/jose) + `fetch`. No framework, no database, no `Express`,
no `MongoDB`. Runs on Node, edge, Cloudflare Workers, Deno, Bun.

**Always required.** Every LTIkit tool depends on this package. See
[Which packages do I need?](https://alasim.github.io/ltikit/getting-started/how-it-fits/#which-packages-do-i-need)
if you're not sure what else to add.

```bash
npm i @ltikit/core
```

## What's in it

OIDC login + launch verification, JWKS, Assignment & Grade Services (grade passback), Names & Role
Provisioning (roster), Deep Linking, Dynamic Registration, and the identity/session seam — signature
verification, single-use nonce replay defense, and all state behind two small adapter interfaces
(`NonceStore`, `PlatformStore`) that you plug in.

```ts
import { createLti, staticKeyStore } from '@ltikit/core'
import { supabasePlatformStore, supabaseNonceStore } from '@ltikit/adapter-supabase'

export const lti = createLti({
  keys: staticKeyStore({ /* your RS256 keypair */ }),
  platforms: supabasePlatformStore(client), // or any PlatformStore
  nonces: supabaseNonceStore(client),       // or any NonceStore
})

// in a route handler:
const result = await lti.launch({ idToken, state }) // verified claims, or throws
```

Then wire routes with [`@ltikit/next`](https://www.npmjs.com/package/@ltikit/next),
[`@ltikit/hono`](https://www.npmjs.com/package/@ltikit/hono), or plain
`Request`/`Response` — the core doesn't care.

## Docs

- [How it fits together](https://alasim.github.io/ltikit/getting-started/how-it-fits/) — the required-core-vs-optional-slots map
- [Quickstart](https://alasim.github.io/ltikit/getting-started/quickstart/)
- [Capabilities](https://alasim.github.io/ltikit/reference/capabilities/) — what's implemented
- [API reference](https://alasim.github.io/ltikit/api/core/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
