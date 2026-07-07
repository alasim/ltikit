import { describe, it, expect } from 'vitest'
import {
  nonceStoreConformance,
  platformStoreConformance,
  mutablePlatformStoreConformance,
} from '@ltikit/core/testing'
import type { Platform } from '@ltikit/core'
import { prismaNonceStore, prismaPlatformStore } from './index'
import type { PrismaLike } from './index'

type Row = Record<string, unknown>

/** Mimics Prisma's thrown shape for "record to delete does not exist" (P2025). */
class FakePrismaNotFoundError extends Error {
  readonly code = 'P2025'
}

/**
 * A tiny in-memory fake matching just enough Prisma delegate behavior for the
 * adapter: `findFirst`, `upsert` (keyed on the issuer+clientId compound), and a
 * `delete` that throws a `P2025`-coded error when the row is already gone —
 * mirroring what a real generated `PrismaClient` does.
 */
function fakePrismaClient(seed: { platforms?: Row[]; nonces?: Row[] } = {}): PrismaLike {
  const platforms: Row[] = seed.platforms ? seed.platforms.map((p) => ({ ...p })) : []
  const nonces: Row[] = seed.nonces ? seed.nonces.map((n) => ({ ...n })) : []
  let seq = platforms.length

  return {
    ltiPlatform: {
      async findFirst({ where }) {
        const match = platforms.find((p) => Object.entries(where).every(([k, v]) => p[k] === v))
        return match ? (structuredClone(match) as unknown as Awaited<ReturnType<PrismaLike['ltiPlatform']['findFirst']>>) : null
      },
      async upsert({ where, create, update }) {
        const existing = platforms.find(
          (p) =>
            p.issuer === where.issuer_clientId.issuer && p.clientId === where.issuer_clientId.clientId,
        )
        if (existing) {
          Object.assign(existing, update)
          return structuredClone(existing) as unknown as Awaited<ReturnType<PrismaLike['ltiPlatform']['upsert']>>
        }
        const row = { id: `p${++seq}`, ...create }
        platforms.push(row)
        return structuredClone(row) as unknown as Awaited<ReturnType<PrismaLike['ltiPlatform']['upsert']>>
      },
    },
    ltiNonce: {
      async create({ data }) {
        nonces.push({ ...data })
      },
      async delete({ where }) {
        const idx = nonces.findIndex((n) => n.state === where.state)
        if (idx === -1) throw new FakePrismaNotFoundError()
        const [row] = nonces.splice(idx, 1)
        return structuredClone(row) as unknown as Awaited<ReturnType<PrismaLike['ltiNonce']['delete']>>
      },
    },
  }
}

function seedRow(p: Platform): Row {
  return {
    id: p.id,
    issuer: p.issuer,
    clientId: p.clientId,
    authEndpoint: p.authEndpoint,
    tokenEndpoint: p.tokenEndpoint,
    keysetUrl: p.keysetUrl,
    deploymentId: p.deploymentId ?? null,
  }
}

nonceStoreConformance(() => prismaNonceStore(fakePrismaClient()), 'PrismaNonceStore')
platformStoreConformance(
  (seed: Platform[]) => prismaPlatformStore(fakePrismaClient({ platforms: seed.map(seedRow) })),
  'PrismaPlatformStore',
)
mutablePlatformStoreConformance(() => prismaPlatformStore(fakePrismaClient()), 'PrismaPlatformStore')

describe('@ltikit/adapter-prisma mapping', () => {
  it('maps Prisma rows to the camelCase Platform shape', async () => {
    const p: Platform = {
      id: 'p1',
      issuer: 'https://canvas.instructure.com',
      clientId: 'client-1',
      authEndpoint: 'https://canvas.instructure.com/auth',
      tokenEndpoint: 'https://canvas.instructure.com/token',
      keysetUrl: 'https://canvas.instructure.com/jwks',
      deploymentId: 'd1',
    }
    const store = prismaPlatformStore(fakePrismaClient({ platforms: [seedRow(p)] }))
    expect(await store.find(p.issuer, 'client-1')).toEqual(p)
  })

  it('round-trips the JSON data payload through create → consume', async () => {
    const store = prismaNonceStore(fakePrismaClient())
    await store.create({
      state: 's1',
      nonce: 'n1',
      platformId: 'p1',
      ttlSec: 60,
      data: { targetLinkUri: 'https://tool.example/launch' },
    })
    const rec = await store.consume('s1')
    expect(rec?.data).toEqual({ targetLinkUri: 'https://tool.example/launch' })
    // Second consume finds nothing (row was deleted) — the P2025 path.
    expect(await store.consume('s1')).toBeNull()
  })
})
