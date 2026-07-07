/**
 * @ltikit/adapter-prisma — `PlatformStore` + `NonceStore` backed by Prisma,
 * against any Prisma-supported database (SQLite, Postgres, MySQL, ...).
 *
 * Prisma has no generic `.from(table)` — each app's `PrismaClient` is uniquely
 * generated from its own `schema.prisma`. So this adapter takes the two model
 * delegates **structurally** (`PrismaLike`), the same trick `@ltikit/adapter-supabase`
 * and `@ltikit/adapter-redis` use — no hard dependency on `@prisma/client`, and
 * any client whose generated `LtiPlatform`/`LtiNonce` models match the shipped
 * `prisma/schema.example.prisma` satisfies the interface automatically.
 *
 * Single-use nonces are enforced by Prisma's per-row atomic `delete`: the first
 * `consume` deletes and returns the row; a replayed `state` hits a missing row
 * and Prisma throws `P2025`, which `consume` turns into `null`.
 */
import type {
  ConsumedNonce,
  MutablePlatformStore,
  NonceRecord,
  NonceStore,
  Platform,
  PlatformInput,
} from '@ltikit/core'

interface PlatformRow {
  id: string
  issuer: string
  clientId: string
  authEndpoint: string
  tokenEndpoint: string
  keysetUrl: string
  deploymentId: string | null
}

interface NonceRow {
  state: string
  nonce: string
  platformId: string
  /** JSON-serialized nonce payload — a plain `String` column, not `Json`; SQLite
   * has no native `Json` type, so this stays a string across every connector. */
  data: string | null
  expiresAt: Date
}

/** Exact shape the adapter passes as `create` — matches Prisma's required `LtiPlatform` fields. */
interface LtiPlatformCreateData {
  issuer: string
  clientId: string
  authEndpoint: string
  tokenEndpoint: string
  keysetUrl: string
  deploymentId?: string | null
}

/** The minimal Prisma delegate surface for the `LtiPlatform` model. */
export interface PrismaLtiPlatformDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<PlatformRow | null>
  upsert(args: {
    where: { issuer_clientId: { issuer: string; clientId: string } }
    create: LtiPlatformCreateData
    update: Record<string, unknown>
  }): Promise<PlatformRow>
}

/** The minimal Prisma delegate surface for the `LtiNonce` model. */
export interface PrismaLtiNonceDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>
  delete(args: { where: { state: string } }): Promise<NonceRow>
}

/**
 * The two Prisma model delegates this adapter needs — pass your generated
 * `PrismaClient` (it satisfies this structurally once your schema includes the
 * `LtiPlatform`/`LtiNonce` models from `prisma/schema.example.prisma`).
 */
export interface PrismaLike {
  ltiPlatform: PrismaLtiPlatformDelegate
  ltiNonce: PrismaLtiNonceDelegate
}

/** Prisma's "record to delete does not exist" error code. */
function isNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025'
}

function mapPlatform(row: PlatformRow): Platform {
  return {
    id: row.id,
    issuer: row.issuer,
    clientId: row.clientId,
    authEndpoint: row.authEndpoint,
    tokenEndpoint: row.tokenEndpoint,
    keysetUrl: row.keysetUrl,
    deploymentId: row.deploymentId,
  }
}

/**
 * Writable `PlatformStore` backed by the `LtiPlatform` model. `save` upserts on
 * the `(issuer, clientId)` unique constraint, so Dynamic Registration can
 * onboard platforms and backfill `deploymentId` at runtime.
 */
export function prismaPlatformStore(client: PrismaLike): MutablePlatformStore {
  return {
    async find(iss, clientId) {
      const where: Record<string, unknown> = { issuer: iss }
      if (clientId != null) where.clientId = clientId
      const row = await client.ltiPlatform.findFirst({ where })
      return row ? mapPlatform(row) : null
    },
    async save(input: PlatformInput) {
      const row = await client.ltiPlatform.upsert({
        where: { issuer_clientId: { issuer: input.issuer, clientId: input.clientId } },
        create: {
          issuer: input.issuer,
          clientId: input.clientId,
          authEndpoint: input.authEndpoint,
          tokenEndpoint: input.tokenEndpoint,
          keysetUrl: input.keysetUrl,
          deploymentId: input.deploymentId ?? null,
        },
        update: {
          authEndpoint: input.authEndpoint,
          tokenEndpoint: input.tokenEndpoint,
          keysetUrl: input.keysetUrl,
          // Backfill deploymentId when newly known; never clobber a known one with null.
          ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
        },
      })
      return mapPlatform(row)
    },
  }
}

/** `NonceStore` backed by the `LtiNonce` model (single-use via atomic `delete`). */
export function prismaNonceStore(client: PrismaLike): NonceStore {
  return {
    async create(rec: NonceRecord) {
      const expiresAt = new Date(Date.now() + rec.ttlSec * 1000)
      await client.ltiNonce.create({
        data: {
          state: rec.state,
          nonce: rec.nonce,
          platformId: rec.platformId,
          data: rec.data != null ? JSON.stringify(rec.data) : null,
          expiresAt,
        },
      })
    },
    async consume(state: string): Promise<ConsumedNonce | null> {
      let row: NonceRow
      try {
        row = await client.ltiNonce.delete({ where: { state } })
      } catch (err) {
        if (isNotFoundError(err)) return null
        throw err
      }
      if (row.expiresAt.getTime() <= Date.now()) return null
      return {
        nonce: row.nonce,
        platformId: row.platformId,
        data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : undefined,
      }
    },
  }
}
