/**
 * @ltikit/adapter-memory — in-memory `NonceStore` / `PlatformStore` for dev and
 * tests. NOT for production: state is per-process and lost on restart, so it
 * cannot enforce single-use nonces across serverless invocations.
 */
import type {
  ConsumedNonce,
  MutablePlatformStore,
  NonceRecord,
  NonceStore,
  Platform,
  PlatformInput,
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

/**
 * In-memory platform registry (seedable at construction). Implements the
 * writable `MutablePlatformStore` so Dynamic Registration works in dev/tests.
 */
export class MemoryPlatformStore implements MutablePlatformStore {
  private readonly platforms: Platform[]
  private seq = 0

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

  /** Upsert on `(issuer, clientId)`: update endpoints in place, or insert. */
  save(input: PlatformInput): Promise<Platform> {
    const existing = this.platforms.find(
      (p) => p.issuer === input.issuer && p.clientId === input.clientId,
    )
    if (existing) {
      // Refresh endpoints; backfill deploymentId but don't clobber a known one.
      existing.authEndpoint = input.authEndpoint
      existing.tokenEndpoint = input.tokenEndpoint
      existing.keysetUrl = input.keysetUrl
      if (input.deploymentId) existing.deploymentId = input.deploymentId
      if (input.tenantId !== undefined) existing.tenantId = input.tenantId
      return Promise.resolve(existing)
    }
    const platform: Platform = { id: `mem-${++this.seq}`, ...input }
    this.platforms.push(platform)
    return Promise.resolve(platform)
  }
}

export const version = '0.1.0'
