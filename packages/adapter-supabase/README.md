# @ltikit/adapter-supabase

Supabase/Postgres `PlatformStore` + `NonceStore` for [LTIkit](https://github.com/alasim/ltikit).
Bring your own Supabase project; this adds two small tables and maps them to the core stores.

Requires [`@ltikit/core`](https://www.npmjs.com/package/@ltikit/core).

```bash
npm i @ltikit/core @ltikit/adapter-supabase
```

## 1. Create the tables

The adapter needs two tables: `lti_platforms` (registered LMSs) and `lti_nonces` (OIDC
handshake state). Pick **one** way to apply the schema:

**Supabase CLI (recommended — versioned migration):**
```bash
npx @ltikit/adapter-supabase > supabase/migrations/0001_ltikit.sql
supabase db push
```

**Supabase Dashboard:** open **SQL Editor**, paste the output of
`npx @ltikit/adapter-supabase`, and run it.

**Any Postgres (psql):**
```bash
npx @ltikit/adapter-supabase | psql "$DATABASE_URL"
```

The script just prints the packaged schema (`sql/0001_ltikit_tables.sql`) to stdout, so you can
review or edit it before applying. It uses `create table if not exists` and is safe to re-run.

## 2. Wire the stores

Use the **service-role** client — these stores are server-only and bypass RLS by design.

```ts
import { createClient } from '@supabase/supabase-js'
import { createLti, staticKeyStore } from '@ltikit/core'
import { supabasePlatformStore, supabaseNonceStore, type SupabaseLike } from '@ltikit/adapter-supabase'

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const client = admin as unknown as SupabaseLike // structurally compatible

export const lti = createLti({
  keys: staticKeyStore({ /* ...your tool keypair... */ }),
  platforms: supabasePlatformStore(client),
  nonces: supabaseNonceStore(client),
})
```

## 3. Register a platform

The adapter only *reads* platforms — you insert the row (once per LMS registration):

```sql
insert into lti_platforms (issuer, client_id, auth_endpoint, token_endpoint, keyset_url, deployment_id)
values (
  'https://canvas.instructure.com',
  'YOUR_CLIENT_ID',
  'https://canvas.instructure.com/api/lti/authorize_redirect',
  'https://canvas.instructure.com/login/oauth2/token',
  'https://canvas.instructure.com/api/lti/security/jwks',
  'YOUR_DEPLOYMENT_ID'
);
```

## Coexisting with existing tables

Already have tables named `lti_platforms` / `lti_nonces` (e.g. another integration)? Don't let
this schema collide — use custom names:

```ts
supabasePlatformStore(client, { table: 'ltikit_platforms' })
supabaseNonceStore(client, { table: 'ltikit_nonces' })
```

…and change the identifiers in the generated SQL to match before applying. (`create table if
not exists` will otherwise silently skip a differently-shaped existing table, and the adapter
will fail against the wrong columns.)

## Notes

- **Single-use nonces** are enforced atomically with `delete ... returning` — a replayed `state`
  finds nothing. Nonce carry-through (`data`) is stored as `jsonb`.
- No hard dependency on `@supabase/supabase-js`: the client is accepted structurally
  (`SupabaseLike`), so any compatible client works and the package stays lightweight.
- Also implements the writable `MutablePlatformStore` contract, so **Dynamic Registration**
  auto-persists new platforms with no manual insert.

## Docs

- [Supabase adapter setup](https://alasim.github.io/ltikit/guides/supabase-adapter/)
- [Storage adapters](https://alasim.github.io/ltikit/guides/storage/)
- [API reference](https://alasim.github.io/ltikit/api/adapter-supabase/src/)

## Links

[Repository](https://github.com/alasim/ltikit) ·
[Issues](https://github.com/alasim/ltikit/issues) ·
[Need help?](https://alasim.github.io/ltikit/support/) — paid setup/integration help available.

MIT
