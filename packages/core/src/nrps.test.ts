import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
import type { JWK } from 'jose'
import { getMembers, staticKeyStore, NrpsError, NRPS_SCOPE_MEMBERSHIP } from './index'
import type { NrpsDeps, Platform } from './index'

const KID = 'ltikit-nrps-1'
const PLATFORM: Platform = {
  id: 'p1',
  issuer: 'https://canvas.instructure.com',
  clientId: 'client-1',
  authEndpoint: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  tokenEndpoint: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
  deploymentId: 'd1',
}
const NRPS_URL = 'https://canvas.instructure.com/api/lti/courses/1/names_and_roles?type_id=2'
const NRPS_PAGE2 = 'https://canvas.instructure.com/api/lti/courses/1/names_and_roles?type_id=2&page=2'

let deps: NrpsDeps
interface Call {
  url: string
  headers: Headers
  body?: string
}
let calls: Call[]
let routes: Array<{ match: (u: string) => boolean; respond: () => Response }>

function json(data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const pem = await exportPKCS8(pair.privateKey)
  const publicJwk: JWK = await exportJWK(pair.publicKey)
  deps = { keys: staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk }) }
})

beforeEach(() => {
  calls = []
  routes = []
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : undefined,
    })
    const route = routes.find((r) => r.match(url))
    if (!route) throw new Error(`no mock route for ${url}`)
    return route.respond()
  }) as unknown as typeof fetch
})

afterEach(() => vi.restoreAllMocks())

function tokenRoute() {
  routes.push({
    match: (u) => u === PLATFORM.tokenEndpoint,
    respond: () => json({ access_token: 'tok', token_type: 'Bearer' }),
  })
}

describe('getMembers', () => {
  it('follows Link rel=next pagination and aggregates members (camelCase)', async () => {
    tokenRoute()
    routes.push({
      match: (u) => u === NRPS_URL,
      respond: () =>
        json(
          {
            context: { id: 'c1', title: 'Algebra I' },
            members: [
              { user_id: 'u1', roles: ['...#Instructor'], given_name: 'Ada', family_name: 'T', email: 'a@x' },
            ],
          },
          { Link: `<${NRPS_PAGE2}>; rel="next"` },
        ),
    })
    routes.push({
      match: (u) => u === NRPS_PAGE2,
      respond: () => json({ members: [{ user_id: 'u2', roles: ['...#Learner'] }] }),
    })

    const result = await getMembers(deps, PLATFORM, NRPS_URL)

    // token requested with the membership scope
    const tokenForm = new URLSearchParams(calls[0]!.body)
    expect(tokenForm.get('scope')).toBe(NRPS_SCOPE_MEMBERSHIP)

    expect(result.contextId).toBe('c1')
    expect(result.contextTitle).toBe('Algebra I')
    expect(result.members).toHaveLength(2)
    expect(result.members[0]).toMatchObject({ userId: 'u1', givenName: 'Ada', familyName: 'T', email: 'a@x' })
    expect(result.members[1]!.userId).toBe('u2')
    // both pages were fetched with the membership media type
    expect(calls[1]!.headers.get('Accept')).toContain('membershipcontainer')
    expect(calls.some((c) => c.url === NRPS_PAGE2)).toBe(true)
  })

  it('applies role + limit query params', async () => {
    tokenRoute()
    routes.push({ match: (u) => u.startsWith(NRPS_URL.split('?')[0]!), respond: () => json({ members: [] }) })
    await getMembers(deps, PLATFORM, NRPS_URL, { role: 'Learner', limit: 50 })
    const fetched = calls.find((c) => c.url.includes('names_and_roles'))!.url
    expect(fetched).toContain('role=Learner')
    expect(fetched).toContain('limit=50')
  })

  it('throws NrpsError on a non-2xx membership response', async () => {
    tokenRoute()
    routes.push({ match: (u) => u.includes('names_and_roles'), respond: () => new Response('no', { status: 403 }) })
    await expect(getMembers(deps, PLATFORM, NRPS_URL)).rejects.toBeInstanceOf(NrpsError)
  })
})
