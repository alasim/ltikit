import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
import type { JWK } from 'jose'
import {
  createLti,
  staticKeyStore,
  localKeySet,
  type Lti,
  type NonceStore,
  type NonceRecord,
  type ConsumedNonce,
  type Platform,
  type PlatformStore,
} from '@ltikit/core'
import { oidcLogin, launch, jwks } from './index'

const KID = 'ltikit-hono-1'
const PLATFORM: Platform = {
  id: 'p1',
  issuer: 'https://canvas.instructure.com',
  clientId: 'client-1',
  authEndpoint: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  tokenEndpoint: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
  deploymentId: 'd1',
}

class MemNonceStore implements NonceStore {
  private m = new Map<string, { rec: ConsumedNonce; expiresAt: number }>()
  create(rec: NonceRecord): Promise<void> {
    this.m.set(rec.state, {
      rec: { nonce: rec.nonce, platformId: rec.platformId, data: rec.data },
      expiresAt: Date.now() + rec.ttlSec * 1000,
    })
    return Promise.resolve()
  }
  consume(state: string): Promise<ConsumedNonce | null> {
    const hit = this.m.get(state)
    if (!hit) return Promise.resolve(null)
    this.m.delete(state)
    return Promise.resolve(hit.rec)
  }
}

const platforms: PlatformStore = { find: () => Promise.resolve(PLATFORM) }
let lti: Lti
let app: Hono

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const publicJwk: JWK = await exportJWK(pair.publicKey)
  const pem = await exportPKCS8(pair.privateKey)
  const keySet = localKeySet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })
  lti = createLti({
    keys: staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk }),
    platforms,
    nonces: new MemNonceStore(),
    options: { keySetFor: () => keySet },
  })

  app = new Hono()
  app.post('/login', oidcLogin(lti, { redirectUri: 'https://tool.example/api/lti/launch' }))
  app.post('/launch', launch(lti, () => Response.redirect('https://tool.example/home', 303)))
  app.get('/jwks', jwks(lti))
})

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('@ltikit/hono bindings', () => {
  it('oidcLogin 303-redirects to the platform auth endpoint', async () => {
    const res = await app.request('/login', {
      method: 'POST',
      body: form({
        iss: PLATFORM.issuer,
        login_hint: 'u1',
        target_link_uri: 'https://tool.example/launch',
        client_id: PLATFORM.clientId,
      }),
    })
    expect(res.status).toBe(303)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe(PLATFORM.authEndpoint)
    expect(loc.searchParams.get('state')).toBeTruthy()
  })

  it('oidcLogin 400s on missing params', async () => {
    const res = await app.request('/login', { method: 'POST', body: form({ iss: PLATFORM.issuer }) })
    expect(res.status).toBe(400)
  })

  it('launch 400s on missing id_token/state', async () => {
    const res = await app.request('/launch', { method: 'POST', body: form({}) })
    expect(res.status).toBe(400)
  })

  it('jwks serves the tool keyset', async () => {
    const res = await app.request('/jwks')
    const body = (await res.json()) as { keys: Array<{ kid?: string }> }
    expect(body.keys[0]?.kid).toBe(KID)
  })
})
