/**
 * @ltikit/adapter-memory — in-memory `NonceStore` / `PlatformStore` for dev and
 * tests. NOT for production: state is per-process and lost on restart, so it
 * cannot enforce single-use nonces across serverless invocations.
 */
import type {
  ConsumedNonce,
  NonceRecord,
  NonceStore,
  Platform,
  PlatformStore,
} from '@ltikit/core'

interface StoredNonce {
  nonce: string
  platformId: string
  data?: Record<string, unknown>
  expiresAt: number
}

/** Single-process nonce store. `consume` deletes on read (single-use). */
export class MemoryNonceStore implements NonceStore {
  private readonly store = new Map<string, StoredNonce>()

  create(rec: NonceRecord): Promise<void> {
    this.store.set(rec.state, {
      nonce: rec.nonce,
      platformId: rec.platformId,
      data: rec.data,
      expiresAt: Date.now() + rec.ttlSec * 1000,
    })
    return Promise.resolve()
  }

  consume(state: string): Promise<ConsumedNonce | null> {
    const rec = this.store.get(state)
    if (!rec) return Promise.resolve(null)
    // Delete regardless of expiry — a used or lapsed state is never valid again.
    this.store.delete(state)
    if (Date.now() >= rec.expiresAt) return Promise.resolve(null)
    return Promise.resolve({ nonce: rec.nonce, platformId: rec.platformId, data: rec.data })
  }
}

/** Fixed-list platform registry seeded at construction. */
export class MemoryPlatformStore implements PlatformStore {
  private readonly platforms: Platform[]

  constructor(platforms: Platform[] = []) {
    this.platforms = [...platforms]
  }

  add(platform: Platform): void {
    this.platforms.push(platform)
  }

  find(iss: string, clientId?: string | null): Promise<Platform | null> {
    const byIssuer = this.platforms.filter((p) => p.issuer === iss)
    const match = clientId != null ? byIssuer.find((p) => p.clientId === clientId) : byIssuer[0]
    return Promise.resolve(match ?? null)
  }
}

export const version = '0.1.0'
