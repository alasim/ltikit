import { describe, it, expect } from 'vitest'
import { nonceStoreConformance, platformStoreConformance } from '@ltikit/core/testing'
import type { Platform } from '@ltikit/core'
import { MemoryNonceStore, MemoryPlatformStore, version } from './index'

// The shared conformance kit is the real coverage: single-use, TTL, issuer match.
nonceStoreConformance(() => new MemoryNonceStore(), 'MemoryNonceStore')
platformStoreConformance((seed: Platform[]) => new MemoryPlatformStore(seed), 'MemoryPlatformStore')

describe('@ltikit/adapter-memory', () => {
  it('exports a version string', () => {
    expect(typeof version).toBe('string')
  })

  it('MemoryPlatformStore.add registers a platform after construction', async () => {
    const store = new MemoryPlatformStore()
    expect(await store.find('https://lms.example')).toBeNull()
    store.add({
      id: 'x',
      issuer: 'https://lms.example',
      clientId: 'c',
      authEndpoint: 'https://lms.example/auth',
      tokenEndpoint: 'https://lms.example/token',
      keysetUrl: 'https://lms.example/jwks',
    })
    expect(await store.find('https://lms.example')).toMatchObject({ id: 'x' })
  })
})
