/**
 * @ltikit/adapter-redis — a `NonceStore` backed by Redis / Upstash. Ideal for
 * serverless, where an in-memory store can't enforce single-use across cold
 * invocations. (Platforms are durable config — keep them in Postgres/Supabase,
 * not Redis.)
 *
 * The client is accepted structurally as `RedisLike` (a `set` with TTL + an
 * atomic `getdel`), so this package has no hard dependency on any Redis client.
 * Use the `fromIoRedis` / `fromUpstash` / `fromNodeRedis` helpers to adapt a
 * concrete client. Single-use is enforced by `GETDEL` (atomic get-and-delete),
 * and expiry by the key TTL.
 */
import type { ConsumedNonce, NonceRecord, NonceStore } from '@ltikit/core'

/** Minimal Redis surface the nonce store needs. */
export interface RedisLike {
  /** SET key = value with a TTL in **seconds**. */
  set(key: string, value: string, ttlSec: number): Promise<unknown>
  /** Atomic GET+DEL — returns the value and removes the key, or null if absent. */
  getdel(key: string): Promise<string | null>
}

export interface RedisNonceStoreOptions {
  /** Key prefix (default `ltikit:nonce:`). */
  prefix?: string
}

export function redisNonceStore(client: RedisLike, options: RedisNonceStoreOptions = {}): NonceStore {
  const prefix = options.prefix ?? 'ltikit:nonce:'
  return {
    async create(rec: NonceRecord) {
      // ttlSec <= 0 means already-expired — nothing to store (Redis EX must be >= 1).
      if (rec.ttlSec <= 0) return
      const value = JSON.stringify({
        nonce: rec.nonce,
        platformId: rec.platformId,
        data: rec.data ?? null,
      })
      await client.set(prefix + rec.state, value, rec.ttlSec)
    },
    async consume(state: string): Promise<ConsumedNonce | null> {
      const raw = await client.getdel(prefix + state)
      if (!raw) return null
      const p = JSON.parse(raw) as {
        nonce: string
        platformId: string
        data: Record<string, unknown> | null
      }
      return { nonce: p.nonce, platformId: p.platformId, data: p.data ?? undefined }
    },
  }
}

// --- Adapters for concrete clients (map their API onto RedisLike) ---

/** ioredis: `set(key, val, 'EX', ttl)` + `getdel(key)`. */
export function fromIoRedis(client: {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>
  getdel(key: string): Promise<string | null>
}): RedisLike {
  return {
    set: (k, v, ttl) => client.set(k, v, 'EX', ttl),
    getdel: (k) => client.getdel(k),
  }
}

/** @upstash/redis: `set(key, val, { ex: ttl })` + `getdel(key)`. */
export function fromUpstash(client: {
  set(key: string, value: string, opts: { ex: number }): Promise<unknown>
  getdel(key: string): Promise<string | null>
}): RedisLike {
  return {
    set: (k, v, ttl) => client.set(k, v, { ex: ttl }),
    getdel: (k) => client.getdel(k),
  }
}

/** node-redis v4: `set(key, val, { EX: ttl })` + `getDel(key)`. */
export function fromNodeRedis(client: {
  set(key: string, value: string, opts: { EX: number }): Promise<unknown>
  getDel(key: string): Promise<string | null>
}): RedisLike {
  return {
    set: (k, v, ttl) => client.set(k, v, { EX: ttl }),
    getdel: (k) => client.getDel(k),
  }
}

export const version = '0.1.0'
