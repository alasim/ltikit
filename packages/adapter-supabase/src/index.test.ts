import { describe, it, expect } from 'vitest'
import {
  nonceStoreConformance,
  platformStoreConformance,
  mutablePlatformStoreConformance,
} from '@ltikit/core/testing'
import type { Platform } from '@ltikit/core'
import {
  supabaseNonceStore,
  supabasePlatformStore,
  type SupabaseLike,
  type SupabaseQuery,
  type SupabaseResult,
} from './index'

type Row = Record<string, unknown>

/**
 * A compact in-memory PostgREST fake with the semantics the adapters rely on:
 * `eq` filters, `insert`, `select`, `limit`, `maybeSingle`, and — critically —
 * `delete().select()` returning the deleted rows (atomic single-use).
 */
class FakeQuery implements SupabaseQuery {
  private op: 'select' | 'insert' | 'upsert' | 'delete' = 'select'
  private returning = false
  private filters: Array<[string, unknown]> = []
  private ins?: Row
  private conflictCols: string[] = []
  private lim?: number

  constructor(private rows: Row[]) {}

  select(): SupabaseQuery {
    if (this.op !== 'select') this.returning = true
    return this
  }
  insert(values: Row): SupabaseQuery {
    this.op = 'insert'
    this.ins = values
    return this
  }
  upsert(values: Row, options?: { onConflict?: string }): SupabaseQuery {
    this.op = 'upsert'
    this.ins = values
    this.conflictCols = options?.onConflict?.split(',').map((c) => c.trim()) ?? []
    return this
  }
  delete(): SupabaseQuery {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown): SupabaseQuery {
    this.filters.push([column, value])
    return this
  }
  limit(count: number): SupabaseQuery {
    this.lim = count
    return this
  }

  private matches(r: Row): boolean {
    return this.filters.every(([c, v]) => r[c] === v)
  }

  private run(): SupabaseResult {
    if (this.op === 'insert') {
      const row = { ...this.ins }
      this.rows.push(row)
      return { data: this.returning ? [{ ...row }] : null, error: null }
    }
    if (this.op === 'upsert') {
      const values = this.ins ?? {}
      const existing = this.rows.find((r) => this.conflictCols.every((c) => r[c] === values[c]))
      let row: Row
      if (existing) {
        Object.assign(existing, values)
        row = existing
      } else {
        row = { id: `row-${this.rows.length + 1}`, ...values }
        this.rows.push(row)
      }
      return { data: this.returning ? [{ ...row }] : null, error: null }
    }
    if (this.op === 'delete') {
      const removed: Row[] = []
      const kept: Row[] = []
      for (const r of this.rows) (this.matches(r) ? removed : kept).push(r)
      this.rows.splice(0, this.rows.length, ...kept)
      return { data: this.returning ? removed : null, error: null }
    }
    let res = this.rows.filter((r) => this.matches(r))
    if (this.lim != null) res = res.slice(0, this.lim)
    return { data: res, error: null }
  }

  maybeSingle(): PromiseLike<SupabaseResult> {
    const { data, error } = this.run()
    const one = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
    return Promise.resolve({ data: one, error })
  }

  then<TResult1 = SupabaseResult, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

function makeClient(seed: Record<string, Row[]> = {}): SupabaseLike {
  const tables: Record<string, Row[]> = { lti_platforms: [], lti_nonces: [] }
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }))
  return { from: (t: string) => new FakeQuery((tables[t] ??= [])) }
}

function seedRow(p: Platform): Row {
  return {
    id: p.id,
    issuer: p.issuer,
    client_id: p.clientId,
    auth_endpoint: p.authEndpoint,
    token_endpoint: p.tokenEndpoint,
    keyset_url: p.keysetUrl,
    deployment_id: p.deploymentId ?? null,
  }
}

// The shared kit is the primary coverage — same guarantees as the memory adapter.
nonceStoreConformance(() => supabaseNonceStore(makeClient()), 'SupabaseNonceStore')
platformStoreConformance(
  (seed: Platform[]) => supabasePlatformStore(makeClient({ lti_platforms: seed.map(seedRow) })),
  'SupabasePlatformStore',
)
mutablePlatformStoreConformance(() => supabasePlatformStore(makeClient()), 'SupabasePlatformStore')

describe('@ltikit/adapter-supabase mapping', () => {
  it('maps snake_case platform rows to the camelCase Platform shape', async () => {
    const p: Platform = {
      id: 'p1',
      issuer: 'https://canvas.instructure.com',
      clientId: 'client-1',
      authEndpoint: 'https://canvas.instructure.com/auth',
      tokenEndpoint: 'https://canvas.instructure.com/token',
      keysetUrl: 'https://canvas.instructure.com/jwks',
      deploymentId: 'd1',
    }
    const store = supabasePlatformStore(makeClient({ lti_platforms: [seedRow(p)] }))
    expect(await store.find(p.issuer, 'client-1')).toEqual(p)
  })

  it('surfaces a query error instead of masking it as "not found"', async () => {
    const erroringClient = {
      from: () => ({
        select() {
          return this
        },
        insert() {
          return this
        },
        delete() {
          return this
        },
        eq() {
          return this
        },
        limit() {
          return this
        },
        maybeSingle() {
          return Promise.resolve({
            data: null,
            error: { message: 'relation "lti_platforms" does not exist' },
          })
        },
        then(f: (v: SupabaseResult) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(f)
        },
      }),
    } as unknown as SupabaseLike
    await expect(supabasePlatformStore(erroringClient).find('https://x')).rejects.toThrow(
      /does not exist/,
    )
  })

  it('round-trips the jsonb data payload through create → consume', async () => {
    const store = supabaseNonceStore(makeClient())
    await store.create({
      state: 's1',
      nonce: 'n1',
      platformId: 'p1',
      ttlSec: 60,
      data: { targetLinkUri: 'https://tool.example/launch' },
    })
    const rec = await store.consume('s1')
    expect(rec?.data).toEqual({ targetLinkUri: 'https://tool.example/launch' })
    // Second consume finds nothing (row was deleted).
    expect(await store.consume('s1')).toBeNull()
  })
})
