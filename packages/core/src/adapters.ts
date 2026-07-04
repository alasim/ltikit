/**
 * Storage adapter contracts. The core is stateless; the consumer supplies these
 * (memory for dev, Supabase/Redis in prod). `KeyStore` lives in `keys.ts`.
 */
import type { Platform } from './types'

/** A pending OIDC handshake, written at `oidc.login`, consumed at `launch`. */
export interface NonceRecord {
  /** Opaque CSRF token echoed back by the LMS as `state`. */
  state: string
  /** Value that must appear as the `nonce` claim of the returned `id_token`. */
  nonce: string
  /** `Platform.id` this handshake belongs to (binds state → platform). */
  platformId: string
  /** Time-to-live in seconds; the record MUST NOT be returned after it lapses. */
  ttlSec: number
  /** Optional carry-through (e.g. deep_link_return_url, target_link_uri). */
  data?: Record<string, unknown>
}

/** What `consume` hands back — everything except the one-time `state` key. */
export interface ConsumedNonce {
  nonce: string
  platformId: string
  data?: Record<string, unknown>
}

/**
 * OIDC state/nonce store. `consume` MUST be atomic fetch-and-delete so a
 * replayed `state` can never be redeemed twice (this is the replay defense).
 */
export interface NonceStore {
  create(rec: NonceRecord): Promise<void>
  /** Atomically fetch AND delete. Return null if missing, expired, or already used. */
  consume(state: string): Promise<ConsumedNonce | null>
}

/** Registry of trusted LMS platforms (multi-tenant friendly). */
export interface PlatformStore {
  /**
   * Resolve a platform by issuer, optionally disambiguated by `clientId`
   * (for multiple tools/registrations under one issuer). Return null if none.
   */
  find(iss: string, clientId?: string | null): Promise<Platform | null>
}

/** A platform to persist — everything except the adapter-assigned `id`. */
export type PlatformInput = Omit<Platform, 'id'>

/**
 * A writable `PlatformStore`. Required for Dynamic Registration, which onboards
 * platforms at runtime (a read-only store rejects registration at config time).
 */
export interface MutablePlatformStore extends PlatformStore {
  /**
   * Upsert a platform keyed on `(issuer, clientId)`: insert a new registration,
   * or update the endpoints (and backfill `deploymentId`) of an existing one.
   * Returns the stored record with its assigned `id`.
   */
  save(platform: PlatformInput): Promise<Platform>
}

/** True if a `PlatformStore` also implements the mutable `save` contract. */
export function isMutablePlatformStore(
  store: PlatformStore,
): store is MutablePlatformStore {
  return typeof (store as MutablePlatformStore).save === 'function'
}
