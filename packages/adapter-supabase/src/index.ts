/**
 * @ltikit/adapter-supabase — `PlatformStore` + `NonceStore` backed by Postgres
 * via a Supabase client. Run `sql/0001_ltikit_tables.sql` (or the Supabase CLI
 * equivalent) to create the tables.
 *
 * The client is accepted structurally (a `SupabaseLike` subset), so this package
 * has NO hard dependency on `@supabase/supabase-js` — pass your existing client.
 * Use the SERVICE-ROLE client: these stores bypass RLS by design (the tool owns
 * platform registration + nonce state).
 *
 * Single-use nonces are enforced atomically with DELETE ... RETURNING: `consume`
 * deletes and returns the row in one statement, so a replayed state finds nothing.
 */
import type {
  ConsumedNonce,
  NonceRecord,
  NonceStore,
  Platform,
  PlatformStore,
} from '@ltikit/core'

/** The minimal Supabase/PostgREST surface these adapters use. */
export interface SupabaseResult {
  data: unknown
  error: unknown
}
export interface SupabaseQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): SupabaseQuery
  insert(values: Record<string, unknown>): SupabaseQuery
  delete(): SupabaseQuery
  eq(column: string, value: unknown): SupabaseQuery
  limit(count: number): SupabaseQuery
  maybeSingle(): PromiseLike<SupabaseResult>
}
export interface SupabaseLike {
  from(table: string): SupabaseQuery
}

export interface PlatformStoreOptions {
  /** Table name (default `lti_platforms`). */
  table?: string
}

interface PlatformRow {
  id: string
  issuer: string
  client_id: string
  auth_endpoint: string
  token_endpoint: string
  keyset_url: string
  deployment_id: string | null
}

function mapPlatform(row: PlatformRow): Platform {
  return {
    id: row.id,
    issuer: row.issuer,
    clientId: row.client_id,
    authEndpoint: row.auth_endpoint,
    tokenEndpoint: row.token_endpoint,
    keysetUrl: row.keyset_url,
    deploymentId: row.deployment_id,
  }
}

/** `PlatformStore` reading rows from `lti_platforms`. */
export function supabasePlatformStore(
  client: SupabaseLike,
  options: PlatformStoreOptions = {},
): PlatformStore {
  const table = options.table ?? 'lti_platforms'
  return {
    async find(iss, clientId) {
      let query = client.from(table).select('*').eq('issuer', iss)
      if (clientId != null) query = query.eq('client_id', clientId)
      const { data, error } = await query.limit(1).maybeSingle()
      if (error || !data) return null
      return mapPlatform(data as PlatformRow)
    },
  }
}

export interface NonceStoreOptions {
  /** Table name (default `lti_nonces`). */
  table?: string
}

interface NonceRow {
  nonce: string
  platform_id: string
  data: Record<string, unknown> | null
  expires_at: string
}

/** `NonceStore` backed by `lti_nonces` (single-use via DELETE ... RETURNING). */
export function supabaseNonceStore(
  client: SupabaseLike,
  options: NonceStoreOptions = {},
): NonceStore {
  const table = options.table ?? 'lti_nonces'
  return {
    async create(rec: NonceRecord) {
      const expiresAt = new Date(Date.now() + rec.ttlSec * 1000).toISOString()
      const { error } = await client.from(table).insert({
        state: rec.state,
        nonce: rec.nonce,
        platform_id: rec.platformId,
        data: rec.data ?? null,
        expires_at: expiresAt,
      })
      if (error) throw new Error(`ltikit: failed to store nonce: ${String(error)}`)
    },

    async consume(state: string): Promise<ConsumedNonce | null> {
      // Atomic fetch+delete: DELETE returns the row it removed (or nothing).
      const { data } = await client
        .from(table)
        .delete()
        .eq('state', state)
        .select('nonce, platform_id, data, expires_at')
        .maybeSingle()
      if (!data) return null
      const row = data as NonceRow
      if (new Date(row.expires_at).getTime() <= Date.now()) return null
      return {
        nonce: row.nonce,
        platformId: row.platform_id,
        data: row.data ?? undefined,
      }
    },
  }
}
