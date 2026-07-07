# @ltikit/adapter-memory

In-memory `NonceStore` + `PlatformStore` for [LTIkit](https://github.com/alasim/ltikit) —
**dev and tests only.** State is per-process and lost on restart, so it cannot enforce single-use
nonces across serverless invocations. Do not use in production.

Requires [`@ltikit/core`](https://www.npmjs.com/package/@ltikit/core).

```bash
npm i -D @ltikit/core @ltikit/adapter-memory
```

## Usage

```ts
import { MemoryNonceStore, MemoryPlatformStore } from '@ltikit/adapter-memory'

export const lti = createLti({
  keys: staticKeyStore({ /* ... */ }),
  nonces: new MemoryNonceStore(),
  platforms: new MemoryPlatformStore([/* seed Platform[] */]),
})
```

`MemoryPlatformStore` also implements the writable `MutablePlatformStore` contract, so **Dynamic
Registration** works out of the box in dev — the platform auto-onboards via `lti.dynamicRegistration.register(...)`.

## Docs

- [Storage adapters](https://alasim.github.io/ltikit/guides/storage/)
- [Quickstart](https://alasim.github.io/ltikit/getting-started/quickstart/)
- [API reference](https://alasim.github.io/ltikit/api/adapter-memory/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
