import { describe, it, expect, vi } from 'vitest'
import { nonceStoreConformance } from '@ltikit/core/testing'
import { redisNonceStore, fromUpstash, type RedisLike } from './index'

/** In-memory RedisLike with TTL + atomic getdel (mimics GETDEL). */
function fakeRedis(): RedisLike {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    set(key, value, ttlSec) {
      store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
      return Promise.resolve('OK')
    },
    getdel(key) {
      const rec = store.get(key)
      if (!rec) return Promise.resolve(null)
      store.delete(key)
      if (Date.now() >= rec.expiresAt) return Promise.resolve(null)
      return Promise.resolve(rec.value)
    },
  }
}

// The shared kit: single-use, TTL, data payload, unknown-state.
nonceStoreConformance(() => redisNonceStore(fakeRedis()), 'RedisNonceStore')

describe('@ltikit/adapter-redis', () => {
  it('prefixes keys and round-trips the data payload', async () => {
    const redis = fakeRedis()
    const spy = vi.spyOn(redis, 'set')
    const store = redisNonceStore(redis, { prefix: 'x:' })
    await store.create({ state: 's1', nonce: 'n1', platformId: 'p1', ttlSec: 60, data: { a: 1 } })
    expect(spy).toHaveBeenCalledWith('x:s1', expect.any(String), 60)
    const rec = await store.consume('s1')
    expect(rec).toEqual({ nonce: 'n1', platformId: 'p1', data: { a: 1 } })
  })

  it('fromUpstash maps set(ttl) → set({ ex }) and getdel', async () => {
    const calls: unknown[] = []
    const upstash = {
      set: (k: string, v: string, o: { ex: number }) => {
        calls.push(['set', k, v, o])
        return Promise.resolve('OK')
      },
      getdel: (k: string) => {
        calls.push(['getdel', k])
        return Promise.resolve(null)
      },
    }
    const client = fromUpstash(upstash)
    await client.set('k', 'v', 42)
    await client.getdel('k')
    expect(calls[0]).toEqual(['set', 'k', 'v', { ex: 42 }])
    expect(calls[1]).toEqual(['getdel', 'k'])
  })
})
