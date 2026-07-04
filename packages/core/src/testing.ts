/**
 * Adapter conformance kit — import from `@ltikit/core/testing` in your adapter's
 * test file and call these with a factory. Every `NonceStore` / `PlatformStore`
 * implementation must pass, guaranteeing the guarantees the core relies on
 * (single-use nonces, TTL expiry, issuer matching). Requires `vitest`.
 */
import { describe, it, expect } from 'vitest'
import type { MutablePlatformStore, NonceStore, PlatformStore } from './adapters'
import type { Platform } from './types'

/** Assert a `NonceStore` implementation honours single-use + TTL semantics. */
export function nonceStoreConformance(makeStore: () => NonceStore, label = 'NonceStore'): void {
  describe(`${label} conformance`, () => {
    it('returns the record exactly once, then null (single-use / replay defense)', async () => {
      const store = makeStore()
      await store.create({ state: 's1', nonce: 'n1', platformId: 'p1', ttlSec: 60 })

      const first = await store.consume('s1')
      expect(first).not.toBeNull()
      expect(first?.nonce).toBe('n1')
      expect(first?.platformId).toBe('p1')

      expect(await store.consume('s1')).toBeNull()
    })

    it('returns null for an unknown state', async () => {
      const store = makeStore()
      expect(await store.consume('does-not-exist')).toBeNull()
    })

    it('does not return an expired record (ttlSec 0 = already expired)', async () => {
      const store = makeStore()
      await store.create({ state: 's2', nonce: 'n2', platformId: 'p1', ttlSec: 0 })
      expect(await store.consume('s2')).toBeNull()
    })

    it('preserves the data payload through create → consume', async () => {
      const store = makeStore()
      await store.create({
        state: 's3',
        nonce: 'n3',
        platformId: 'p1',
        ttlSec: 60,
        data: { targetLinkUri: 'https://tool.example/launch', foo: 'bar' },
      })
      const rec = await store.consume('s3')
      expect(rec?.data).toEqual({ targetLinkUri: 'https://tool.example/launch', foo: 'bar' })
    })
  })
}

const SAMPLE_PLATFORM: Platform = {
  id: 'p1',
  issuer: 'https://canvas.instructure.com',
  clientId: 'client-1',
  authEndpoint: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  tokenEndpoint: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
  deploymentId: 'd1',
}

/**
 * Assert a `PlatformStore` resolves by issuer (+ optional clientId) and returns
 * null on no match. `makeStore` receives the platforms to seed.
 */
export function platformStoreConformance(
  makeStore: (seed: Platform[]) => PlatformStore,
  label = 'PlatformStore',
): void {
  describe(`${label} conformance`, () => {
    it('finds a platform by issuer alone', async () => {
      const store = makeStore([SAMPLE_PLATFORM])
      expect(await store.find(SAMPLE_PLATFORM.issuer)).toMatchObject({ id: 'p1' })
    })

    it('finds a platform by issuer + clientId', async () => {
      const store = makeStore([SAMPLE_PLATFORM])
      expect(await store.find(SAMPLE_PLATFORM.issuer, 'client-1')).toMatchObject({ id: 'p1' })
    })

    it('returns null for an unknown issuer', async () => {
      const store = makeStore([SAMPLE_PLATFORM])
      expect(await store.find('https://evil.example')).toBeNull()
    })

    it('returns null when clientId is given but does not match', async () => {
      const store = makeStore([SAMPLE_PLATFORM])
      expect(await store.find(SAMPLE_PLATFORM.issuer, 'someone-else')).toBeNull()
    })
  })
}

/**
 * Assert a `MutablePlatformStore` upserts on `(issuer, clientId)`: a fresh save
 * inserts and is then findable; a second save for the same key updates in place
 * (no duplicate) and backfills `deploymentId`. `makeStore` starts empty.
 */
export function mutablePlatformStoreConformance(
  makeStore: () => MutablePlatformStore,
  label = 'MutablePlatformStore',
): void {
  describe(`${label} conformance`, () => {
    const input = {
      issuer: 'https://lms.example',
      clientId: 'client-9',
      authEndpoint: 'https://lms.example/auth',
      tokenEndpoint: 'https://lms.example/token',
      keysetUrl: 'https://lms.example/jwks',
      deploymentId: null,
    }

    it('saves a new platform and makes it findable', async () => {
      const store = makeStore()
      const saved = await store.save(input)
      expect(saved.id).toBeTruthy()
      expect(saved.clientId).toBe('client-9')
      const found = await store.find(input.issuer, input.clientId)
      expect(found?.id).toBe(saved.id)
    })

    it('upserts on (issuer, clientId) — no duplicate, backfills deploymentId', async () => {
      const store = makeStore()
      const first = await store.save(input)
      const second = await store.save({ ...input, deploymentId: 'dep-42' })
      expect(second.id).toBe(first.id)
      const found = await store.find(input.issuer, input.clientId)
      expect(found?.deploymentId).toBe('dep-42')
    })
  })
}
