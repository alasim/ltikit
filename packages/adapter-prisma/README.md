# @ltikit/adapter-prisma

Prisma `PlatformStore` + `NonceStore` for [LTIkit](https://github.com/alasim/ltikit) — works against
**any Prisma-supported database** (SQLite, Postgres, MySQL, ...). Bring your own Prisma schema; this
adds two small models and maps them to the core stores.

Requires [`@ltikit/core`](https://www.npmjs.com/package/@ltikit/core).

```bash
npm i @ltikit/core @ltikit/adapter-prisma
```

## 1. Add the models

Copy the two models from [`prisma/schema.example.prisma`](./prisma/schema.example.prisma) into your
own `schema.prisma`, then migrate:

```bash
npx prisma migrate dev --name add_ltikit
```

## 2. Wire the stores

```ts
import { PrismaClient } from '@prisma/client'
import { createLti, staticKeyStore } from '@ltikit/core'
import { prismaPlatformStore, prismaNonceStore } from '@ltikit/adapter-prisma'

const prisma = new PrismaClient()

export const lti = createLti({
  keys: staticKeyStore({ /* ...your tool keypair... */ }),
  platforms: prismaPlatformStore(prisma),
  nonces: prismaNonceStore(prisma),
})
```

No hard dependency on `@prisma/client`: the client is accepted structurally (`PrismaLike` — just the
`ltiPlatform` / `ltiNonce` delegates), so any generated `PrismaClient` whose schema matches the two
models above satisfies it automatically.

## Notes

- **Single-use nonces** are enforced by Prisma's per-row atomic `delete` — a replayed `state` hits a
  missing row (Prisma's `P2025`), which `consume` turns into `null`.
- Also implements the writable `MutablePlatformStore` contract, so **Dynamic Registration**
  auto-persists new platforms with no manual insert.
- Different model names? Pass an object matching `PrismaLike` that aliases your own delegates:
  `prismaPlatformStore({ ltiPlatform: prisma.myModel, ltiNonce: prisma.myOtherModel })`.

## Docs

- [Storage adapters](https://alasim.github.io/ltikit/guides/storage/)
- [API reference](https://alasim.github.io/ltikit/api/adapter-prisma/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
