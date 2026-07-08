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
  MutablePlatformStore,
  NonceRecord,
  NonceStore,
  Platform,
  PlatformInput,
} from '@ltikit/core'

/** The minimal Supabase/PostgREST surface these adapters use. */
export interface SupabaseResult {
  data: unknown
  error: unknown
}
export interface SupabaseQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): SupabaseQuery
  insert(values: Record<string, unknown>): SupabaseQuery
  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): SupabaseQuery
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
  /**
   * Column holding the multi-tenant owner key (e.g. `organization_id`). When
   * set, `find` maps it to `Platform.tenantId` and `save` writes `tenantId` to
   * it. Omit for single-tenant tools (default: no tenant column).
   */
  tenantColumn?: string
}

interface PlatformRow {
  id: string
  issuer: string
  client_id: string
  auth_endpoint: string
  token_endpoint: string
  keyset_url: string
  deployment_id: string | null
  [column: string]: unknown
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function mapPlatform(row: PlatformRow, tenantColumn?: string): Platform {
  const platform: Platform = {
    id: row.id,
    issuer: row.issuer,
    clientId: row.client_id,
    authEndpoint: row.auth_endpoint,
    tokenEndpoint: row.token_endpoint,
    keysetUrl: row.keyset_url,
    deploymentId: row.deployment_id,
  }
  if (tenantColumn) {
    const t = row[tenantColumn]
    platform.tenantId = typeof t === 'string' ? t : null
  }
  return platform
}

/**
 * Writable `PlatformStore` backed by `lti_platforms`. `save` upserts on the
 * `(issuer, client_id)` unique constraint (see the SQL migration), so Dynamic
 * Registration can onboard platforms and backfill `deployment_id` at runtime.
 */
export function supabasePlatformStore(
  client: SupabaseLike,
  options: PlatformStoreOptions = {},
): MutablePlatformStore {
  const table = options.table ?? 'lti_platforms'
  const tenantColumn = options.tenantColumn
  return {
    async find(iss, clientId) {
      let query = client.from(table).select('*').eq('issuer', iss)
      if (clientId != null) query = query.eq('client_id', clientId)
      const { data, error } = await query.limit(1).maybeSingle()
      // Surface real failures (missing table, connection, RLS misconfig) instead
      // of masking them as "platform not found". A genuine no-match is data=null.
      if (error) {
        throw new Error(`ltikit: ${table} lookup failed for iss=${iss}: ${errorMessage(error)}`)
      }
      if (!data) return null
      return mapPlatform(data as PlatformRow, tenantColumn)
    },
    async save(input: PlatformInput) {
      const row: Record<string, unknown> = {
        issuer: input.issuer,
        client_id: input.clientId,
        auth_endpoint: input.authEndpoint,
        token_endpoint: input.tokenEndpoint,
        keyset_url: input.keysetUrl,
        deployment_id: input.deploymentId ?? null,
      }
      // Persist the tenant key to the configured column so a multi-tenant tool
      // can bind each registration to its owner (e.g. organization_id).
      if (tenantColumn) row[tenantColumn] = input.tenantId ?? null
      const { data, error } = await client
        .from(table)
        .upsert(row, { onConflict: 'issuer,client_id' })
        .select('*')
        .maybeSingle()
      if (error) {
        throw new Error(`ltikit: ${table} upsert failed for iss=${input.issuer}: ${errorMessage(error)}`)
      }
      if (!data) {
        throw new Error(`ltikit: ${table} upsert returned no row for iss=${input.issuer}`)
      }
      return mapPlatform(data as PlatformRow, tenantColumn)
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
      if (error) throw new Error(`ltikit: failed to store nonce: ${errorMessage(error)}`)
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
