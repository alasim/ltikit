import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8, exportJWK, SignJWT } from 'jose'
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
  LTI_CLAIM_MESSAGE_TYPE,
  LTI_CLAIM_VERSION,
  LTI_CLAIM_DEPLOYMENT_ID,
  MSG_RESOURCE_LINK,
} from '@ltikit/core'
import {
  oidcLogin,
  launch,
  jwks,
  cspFrameAncestors,
  sameSiteNoneCookie,
  frameResizeScript,
  sessionRedirect,
} from './index'

const KID = 'ltikit-next-1'

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
    if (Date.now() >= hit.expiresAt) return Promise.resolve(null)
    return Promise.resolve(hit.rec)
  }
}

const platforms: PlatformStore = { find: () => Promise.resolve(PLATFORM) }

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let publicJwk: JWK
let lti: Lti

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  privateKey = pair.privateKey
  publicJwk = await exportJWK(pair.publicKey)
  const pem = await exportPKCS8(pair.privateKey)
  const keys = staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk })
  const keySet = localKeySet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })
  lti = createLti({
    keys,
    platforms,
    nonces: new MemNonceStore(),
    options: { keySetFor: () => keySet },
  })
})

function formRequest(url: string, fields: Record<string, string>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return new Request(url, { method: 'POST', body: form })
}

describe('oidcLogin binding', () => {
  it('303-redirects to the platform auth endpoint with state+nonce', async () => {
    const handler = oidcLogin(lti, { redirectUri: 'https://tool.example/api/lti/launch' })
    const res = await handler(
      formRequest('https://tool.example/api/lti/login', {
        iss: PLATFORM.issuer,
        login_hint: 'user-1',
        target_link_uri: 'https://tool.example/launch',
        client_id: PLATFORM.clientId,
      }),
    )
    expect(res.status).toBe(303)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe(PLATFORM.authEndpoint)
    expect(loc.searchParams.get('state')).toBeTruthy()
    expect(loc.searchParams.get('nonce')).toBeTruthy()
    expect(loc.searchParams.get('client_id')).toBe(PLATFORM.clientId)
  })

  it('derives redirectUri from the request when given a function', async () => {
    const handler = oidcLogin(lti, {
      redirectUri: (req) => `${new URL(req.url).origin}/api/lti/launch`,
    })
    const res = await handler(
      formRequest('https://tool.example/api/lti/login', {
        iss: PLATFORM.issuer,
        login_hint: 'user-1',
        target_link_uri: 'https://tool.example/launch',
      }),
    )
    const loc = new URL(res.headers.get('location')!)
    expect(loc.searchParams.get('redirect_uri')).toBe('https://tool.example/api/lti/launch')
  })

  it('400s on missing OIDC params', async () => {
    const handler = oidcLogin(lti, { redirectUri: 'https://tool.example/api/lti/launch' })
    const res = await handler(formRequest('https://tool.example/api/lti/login', { iss: PLATFORM.issuer }))
    expect(res.status).toBe(400)
  })
})

describe('launch binding', () => {
  it('end-to-end: login → sign id_token → launch handler receives verified result', async () => {
    // 1. Login to mint a live state + nonce (read both from the redirect).
    const login = oidcLogin(lti, { redirectUri: 'https://tool.example/api/lti/launch' })
    const loginRes = await login(
      formRequest('https://tool.example/api/lti/login', {
        iss: PLATFORM.issuer,
        login_hint: 'user-1',
        target_link_uri: 'https://tool.example/launch',
      }),
    )
    const loc = new URL(loginRes.headers.get('location')!)
    const state = loc.searchParams.get('state')!
    const nonce = loc.searchParams.get('nonce')!

    // 2. Platform signs an id_token carrying that nonce.
    const now = Math.floor(Date.now() / 1000)
    const idToken = await new SignJWT({
      iss: PLATFORM.issuer,
      aud: PLATFORM.clientId,
      sub: 'user-1',
      nonce,
      [LTI_CLAIM_MESSAGE_TYPE]: MSG_RESOURCE_LINK,
      [LTI_CLAIM_VERSION]: '1.3.0',
      [LTI_CLAIM_DEPLOYMENT_ID]: 'd1',
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(privateKey)

    // 3. Launch binding verifies and calls our handler.
    let seen: string | undefined
    const handler = launch(lti, (result) => {
      seen = result.claims.sub
      return Response.redirect('https://tool.example/home', 303)
    })
    const res = await handler(
      formRequest('https://tool.example/api/lti/launch', { id_token: idToken, state }),
    )

    expect(seen).toBe('user-1')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://tool.example/home')
  })

  it('400s a bad/expired state before the handler runs', async () => {
    let ran = false
    const handler = launch(lti, () => {
      ran = true
      return new Response('ok')
    })
    const res = await handler(
      formRequest('https://tool.example/api/lti/launch', {
        id_token: 'x.y.z',
        state: 'never-issued',
      }),
    )
    expect(res.status).toBe(400)
    expect(ran).toBe(false)
  })

  it('400s on missing id_token/state', async () => {
    const handler = launch(lti, () => new Response('ok'))
    const res = await handler(formRequest('https://tool.example/api/lti/launch', {}))
    expect(res.status).toBe(400)
  })
})

describe('jwks binding', () => {
  it('serves the tool public keyset', async () => {
    const res = await jwks(lti)()
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = (await res.json()) as { keys: Array<{ kid?: string }> }
    expect(body.keys[0]?.kid).toBe(KID)
  })
})

describe('iframe helpers', () => {
  it('cspFrameAncestors lists self + platform origins', () => {
    expect(cspFrameAncestors(['https://canvas.instructure.com'])).toBe(
      "frame-ancestors 'self' https://canvas.instructure.com",
    )
  })

  it('sameSiteNoneCookie sets SameSite=None; Secure', () => {
    const c = sameSiteNoneCookie('sid', 'abc', { maxAgeSec: 600 })
    expect(c).toContain('sid=abc')
    expect(c).toContain('SameSite=None')
    expect(c).toContain('Secure')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('Max-Age=600')
  })

  it('frameResizeScript embeds the target origin', () => {
    expect(frameResizeScript('https://canvas.instructure.com')).toContain(
      '"https://canvas.instructure.com"',
    )
    expect(frameResizeScript()).toContain('lti.frameResize')
  })

  it('sameSiteNoneCookie can emit Partitioned', () => {
    expect(sameSiteNoneCookie('s', 'v', { partitioned: true })).toContain('Partitioned')
    expect(sameSiteNoneCookie('s', 'v')).not.toContain('Partitioned')
  })
})

describe('sessionRedirect', () => {
  it('303-redirects and sets each session cookie iframe-safe', () => {
    const res = sessionRedirect({
      to: 'https://tool.example/home',
      cookies: [
        { name: 'session', value: 'abc', maxAgeSec: 3600 },
        { name: 'refresh', value: 'xyz', partitioned: true },
      ],
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://tool.example/home')
    const setCookies = res.headers.getSetCookie()
    expect(setCookies).toHaveLength(2)
    expect(setCookies[0]).toContain('session=abc')
    expect(setCookies[0]).toContain('SameSite=None')
    expect(setCookies[0]).toContain('Secure')
    expect(setCookies[0]).toContain('Max-Age=3600')
    expect(setCookies[1]).toContain('refresh=xyz')
    expect(setCookies[1]).toContain('Partitioned')
  })

  it('works with no cookies (plain redirect)', () => {
    const res = sessionRedirect({ to: 'https://tool.example/x', status: 302 })
    expect(res.status).toBe(302)
    expect(res.headers.getSetCookie()).toHaveLength(0)
  })
})
