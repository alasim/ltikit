import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import type { JWK, KeyLike } from 'jose'
import { createLti } from './lti'
import { localKeySet, staticKeyStore } from './keys'
import { NonceReplayError, ClaimValidationError, PlatformNotFoundError } from './errors'
import type { NonceStore, PlatformStore, ConsumedNonce, NonceRecord } from './adapters'
import type { Platform } from './types'
import {
  LTI_CLAIM_MESSAGE_TYPE,
  LTI_CLAIM_VERSION,
  LTI_CLAIM_DEPLOYMENT_ID,
  LTI_CLAIM_AGS_ENDPOINT,
  AGS_SCOPE_SCORE,
  MSG_RESOURCE_LINK,
} from './constants'

const KID = 'ltikit-test-1'

const PLATFORM: Platform = {
  id: 'p1',
  issuer: 'https://canvas.instructure.com',
  clientId: 'client-1',
  authEndpoint: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  tokenEndpoint: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
  deploymentId: 'd1',
}

// Minimal in-test stores (the real ones live in @ltikit/adapter-memory).
class TestNonceStore implements NonceStore {
  map = new Map<string, { rec: ConsumedNonce; expiresAt: number }>()
  create(rec: NonceRecord): Promise<void> {
    this.map.set(rec.state, {
      rec: { nonce: rec.nonce, platformId: rec.platformId, data: rec.data },
      expiresAt: Date.now() + rec.ttlSec * 1000,
    })
    return Promise.resolve()
  }
  consume(state: string): Promise<ConsumedNonce | null> {
    const hit = this.map.get(state)
    if (!hit) return Promise.resolve(null)
    this.map.delete(state)
    if (Date.now() >= hit.expiresAt) return Promise.resolve(null)
    return Promise.resolve(hit.rec)
  }
}

const platformStore: PlatformStore = {
  find(iss, clientId) {
    if (iss !== PLATFORM.issuer) return Promise.resolve(null)
    if (clientId != null && clientId !== PLATFORM.clientId) return Promise.resolve(null)
    return Promise.resolve(PLATFORM)
  },
}

let privateKey: KeyLike
let publicJwk: JWK
let keySet: ReturnType<typeof localKeySet>

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  privateKey = pair.privateKey
  publicJwk = await exportJWK(pair.publicKey)
  keySet = localKeySet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })
})

/** Sign a launch id_token as the platform would. */
function signIdToken(claims: Record<string, unknown>, expSecondsFromNow = 120): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt(now)
    .setExpirationTime(now + expSecondsFromNow)
    .sign(privateKey)
}

function baseClaims(nonce: string): Record<string, unknown> {
  return {
    iss: PLATFORM.issuer,
    aud: PLATFORM.clientId,
    sub: 'user-42',
    nonce,
    [LTI_CLAIM_MESSAGE_TYPE]: MSG_RESOURCE_LINK,
    [LTI_CLAIM_VERSION]: '1.3.0',
    [LTI_CLAIM_DEPLOYMENT_ID]: 'd1',
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'c1', title: 'Algebra I' },
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: 'rl1', title: 'Sim 1' },
    [LTI_CLAIM_AGS_ENDPOINT]: {
      scope: [AGS_SCOPE_SCORE],
      lineitem: 'https://courses.relay.edu/api/lti/courses/1/line_items/17?type_id=2',
      lineitems: 'https://courses.relay.edu/api/lti/courses/1/line_items?type_id=2',
    },
  }
}

function makeLti(nonces: NonceStore) {
  const keys = staticKeyStore({
    privateKeyPem: '', // unused in these tests (we don't sign outbound here)
    kid: KID,
    publicJwk,
  })
  return createLti({
    keys,
    platforms: platformStore,
    nonces,
    options: { keySetFor: () => keySet, nonceTtlSec: 600, clockToleranceSec: 30 },
  })
}

describe('createLti — OIDC login', () => {
  it('persists state+nonce and builds the auth redirect URL', async () => {
    const nonces = new TestNonceStore()
    const lti = makeLti(nonces)
    const { redirectUrl, state, nonce } = await lti.oidc.login({
      iss: PLATFORM.issuer,
      loginHint: 'lms-user-1',
      targetLinkUri: 'https://tool.example/launch',
      redirectUri: 'https://tool.example/api/lti/launch',
      ltiMessageHint: 'hint-abc',
    })

    const url = new URL(redirectUrl)
    expect(url.origin + url.pathname).toBe(PLATFORM.authEndpoint)
    expect(url.searchParams.get('scope')).toBe('openid')
    expect(url.searchParams.get('response_type')).toBe('id_token')
    expect(url.searchParams.get('response_mode')).toBe('form_post')
    expect(url.searchParams.get('client_id')).toBe(PLATFORM.clientId)
    expect(url.searchParams.get('login_hint')).toBe('lms-user-1')
    expect(url.searchParams.get('lti_message_hint')).toBe('hint-abc')
    expect(url.searchParams.get('state')).toBe(state)
    expect(url.searchParams.get('nonce')).toBe(nonce)
    // The record is live for a subsequent launch.
    expect(nonces.map.has(state)).toBe(true)
  })

  it('rejects an unregistered issuer', async () => {
    const lti = makeLti(new TestNonceStore())
    await expect(
      lti.oidc.login({
        iss: 'https://unknown.example',
        loginHint: 'x',
        targetLinkUri: 'https://tool.example/launch',
        redirectUri: 'https://tool.example/api/lti/launch',
      }),
    ).rejects.toBeInstanceOf(PlatformNotFoundError)
  })
})

describe('createLti — end-to-end login → launch', () => {
  it('verifies a launch and returns typed claims (context, resourceLink, ags)', async () => {
    const nonces = new TestNonceStore()
    const lti = makeLti(nonces)
    const { state, nonce } = await lti.oidc.login({
      iss: PLATFORM.issuer,
      loginHint: 'lms-user-1',
      targetLinkUri: 'https://tool.example/launch',
      redirectUri: 'https://tool.example/api/lti/launch',
    })

    const idToken = await signIdToken(baseClaims(nonce))
    const result = await lti.launch({ idToken, state })

    expect(result.platform.id).toBe('p1')
    expect(result.messageType).toBe(MSG_RESOURCE_LINK)
    expect(result.deploymentId).toBe('d1')
    expect(result.context).toEqual({ id: 'c1', label: undefined, title: 'Algebra I' })
    expect(result.resourceLink?.id).toBe('rl1')
    expect(result.ags?.scopes).toContain(AGS_SCOPE_SCORE)
    expect(result.ags?.lineItem).toContain('/line_items/17')
    expect(result.nonceData?.targetLinkUri).toBe('https://tool.example/launch')
  })

  it('rejects a REPLAYED state (nonce consumed once)', async () => {
    const nonces = new TestNonceStore()
    const lti = makeLti(nonces)
    const { state, nonce } = await lti.oidc.login({
      iss: PLATFORM.issuer,
      loginHint: 'lms-user-1',
      targetLinkUri: 'https://tool.example/launch',
      redirectUri: 'https://tool.example/api/lti/launch',
    })
    const idToken = await signIdToken(baseClaims(nonce))

    await lti.launch({ idToken, state }) // first use OK
    await expect(lti.launch({ idToken, state })).rejects.toBeInstanceOf(NonceReplayError)
  })

  it('rejects an unknown state', async () => {
    const lti = makeLti(new TestNonceStore())
    const idToken = await signIdToken(baseClaims('n'))
    await expect(lti.launch({ idToken, state: 'never-issued' })).rejects.toBeInstanceOf(
      NonceReplayError,
    )
  })

  it('rejects a token whose nonce claim does not match the issued nonce', async () => {
    const nonces = new TestNonceStore()
    const lti = makeLti(nonces)
    const { state } = await lti.oidc.login({
      iss: PLATFORM.issuer,
      loginHint: 'lms-user-1',
      targetLinkUri: 'https://tool.example/launch',
      redirectUri: 'https://tool.example/api/lti/launch',
    })
    const idToken = await signIdToken(baseClaims('a-different-nonce'))
    await expect(lti.launch({ idToken, state })).rejects.toBeInstanceOf(ClaimValidationError)
  })

  it('rejects an unsupported message_type', async () => {
    const nonces = new TestNonceStore()
    const lti = makeLti(nonces)
    const { state, nonce } = await lti.oidc.login({
      iss: PLATFORM.issuer,
      loginHint: 'lms-user-1',
      targetLinkUri: 'https://tool.example/launch',
      redirectUri: 'https://tool.example/api/lti/launch',
    })
    const claims = baseClaims(nonce)
    claims[LTI_CLAIM_MESSAGE_TYPE] = 'SomethingElse'
    const idToken = await signIdToken(claims)
    await expect(lti.launch({ idToken, state })).rejects.toBeInstanceOf(ClaimValidationError)
  })

  it('rejects a deployment_id that does not match the pinned platform', async () => {
    const nonces = new TestNonceStore()
    const lti = makeLti(nonces)
    const { state, nonce } = await lti.oidc.login({
      iss: PLATFORM.issuer,
      loginHint: 'lms-user-1',
      targetLinkUri: 'https://tool.example/launch',
      redirectUri: 'https://tool.example/api/lti/launch',
    })
    const claims = baseClaims(nonce)
    claims[LTI_CLAIM_DEPLOYMENT_ID] = 'wrong-deployment'
    const idToken = await signIdToken(claims)
    await expect(lti.launch({ idToken, state })).rejects.toBeInstanceOf(ClaimValidationError)
  })
})
