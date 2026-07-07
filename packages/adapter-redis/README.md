# @ltikit/adapter-redis

Redis / Upstash **`NonceStore`** adapter for [LTIkit](https://github.com/alasim/ltikit) — ideal for
serverless, where in-memory state can't enforce single-use nonces across cold invocations. Single-use
is enforced by an atomic `GETDEL`.

Redis holds the **nonce** store only. Platforms are durable config — pair this with
[`@ltikit/adapter-supabase`](https://www.npmjs.com/package/@ltikit/adapter-supabase) (or your own)
for the `PlatformStore`. Requires [`@ltikit/core`](https://www.npmjs.com/package/@ltikit/core).

```bash
npm i @ltikit/core @ltikit/adapter-redis
```

## Usage

```ts
import { redisNonceStore, fromUpstash } from '@ltikit/adapter-redis'
import { Redis } from '@upstash/redis'

export const lti = createLti({
  keys: staticKeyStore({ /* ... */ }),
  nonces: redisNonceStore(fromUpstash(Redis.fromEnv())),
  platforms: supabasePlatformStore(client), // or your own
})
```

No hard dependency on any Redis client — `redisNonceStore` takes a structural `RedisLike`
(`set` with TTL + atomic `getdel`). Ships adapters for the common clients:

```ts
import { fromUpstash, fromIoRedis, fromNodeRedis } from '@ltikit/adapter-redis'
```

## Docs

- [Storage adapters](https://alasim.github.io/ltikit/guides/storage/)
- [API reference](https://alasim.github.io/ltikit/api/adapter-redis/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
