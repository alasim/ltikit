import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8, exportJWK, SignJWT } from 'jose'
import type { JWK, KeyLike } from 'jose'
import {
  verifyLtiJwt,
  signJwt,
  staticKeyStore,
  localKeySet,
  jwks,
  SignatureError,
  ExpiredError,
  ClaimValidationError,
  AGS_SCOPE_LINEITEM,
  AGS_SCOPE_SCORE,
  AGS_SCOPE_RESULT_READONLY,
  LTI_CLAIM_MESSAGE_TYPE,
  LTI_CLAIM_AGS_ENDPOINT,
  LTI_CLAIM_DEEP_LINKING,
} from './index'

const KID = 'ltikit-test-1'
const CANVAS_CLIENT = '215520000000000121'
const MOODLE_CLIENT = 'SbfcaGUZCd1Sq88'

let privateKey: KeyLike
let publicJwk: JWK
let keySet: ReturnType<typeof localKeySet>

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  privateKey = pair.privateKey
  publicJwk = await exportJWK(pair.publicKey)
  keySet = localKeySet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })
})

/** Sign a launch id_token with the test key. */
async function makeToken(
  claims: Record<string, unknown>,
  opts: { expSecondsFromNow?: number; kid?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? KID })
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expSecondsFromNow ?? 120))
    .sign(privateKey)
}

// Claim shapes mirror real launches captured from Canvas + Moodle.
const canvasClaims = {
  iss: 'https://canvas.instructure.com',
  aud: CANVAS_CLIENT,
  sub: 'f68df17d-6642-4b8e-93c7-16a4b0de9fa2',
  nonce: 'n-canvas',
  email: 'teacher@relay.edu',
  [LTI_CLAIM_MESSAGE_TYPE]: 'LtiResourceLinkRequest',
  'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': '3:8865aa05b4b79b64a91a86042e43af5ea8ae79eb',
  'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: '7' },
  [LTI_CLAIM_AGS_ENDPOINT]: {
    scope: [AGS_SCOPE_LINEITEM, AGS_SCOPE_RESULT_READONLY, AGS_SCOPE_SCORE],
    lineitem: 'https://courses.relay.edu/api/lti/courses/1/line_items/17?type_id=2',
    lineitems: 'https://courses.relay.edu/api/lti/courses/1/line_items?type_id=2',
  },
}

const moodleClaims = {
  iss: 'https://teachsim.moodlecloud.com',
  aud: MOODLE_CLIENT,
  sub: '5',
  nonce: 'n-moodle',
  [LTI_CLAIM_MESSAGE_TYPE]: 'LtiDeepLinkingRequest',
  'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': '1',
  [LTI_CLAIM_DEEP_LINKING]: {
    deep_link_return_url: 'https://teachsim.moodlecloud.com/mod/lti/return.php',
    accept_types: ['ltiResourceLink'],
    accept_presentation_document_targets: ['iframe', 'window'],
  },
}

describe('verifyLtiJwt', () => {
  it('verifies a Canvas resource-link launch and exposes typed AGS claims', async () => {
    const token = await makeToken(canvasClaims)
    const claims = await verifyLtiJwt(token, {
      keySet,
      issuer: 'https://canvas.instructure.com',
      audience: CANVAS_CLIENT,
    })
    expect(claims.sub).toBe('f68df17d-6642-4b8e-93c7-16a4b0de9fa2')
    expect(claims[LTI_CLAIM_MESSAGE_TYPE]).toBe('LtiResourceLinkRequest')
    expect(claims[LTI_CLAIM_AGS_ENDPOINT]?.lineitem).toContain('/line_items/17')
    expect(claims[LTI_CLAIM_AGS_ENDPOINT]?.scope).toContain(AGS_SCOPE_SCORE)
  })

  it('verifies a Moodle deep-linking launch', async () => {
    const token = await makeToken(moodleClaims)
    const claims = await verifyLtiJwt(token, {
      keySet,
      issuer: 'https://teachsim.moodlecloud.com',
      audience: MOODLE_CLIENT,
    })
    expect(claims[LTI_CLAIM_MESSAGE_TYPE]).toBe('LtiDeepLinkingRequest')
    expect(claims[LTI_CLAIM_DEEP_LINKING]?.deep_link_return_url).toContain('return.php')
  })

  it('throws SignatureError on a tampered token', async () => {
    const token = await makeToken(canvasClaims)
    // Flip a character in the signature segment.
    const parts = token.split('.')
    parts[2] = parts[2]!.slice(0, -2) + (parts[2]!.endsWith('A') ? 'BB' : 'AA')
    const tampered = parts.join('.')
    await expect(
      verifyLtiJwt(tampered, { keySet, issuer: canvasClaims.iss, audience: CANVAS_CLIENT }),
    ).rejects.toBeInstanceOf(SignatureError)
  })

  it('throws SignatureError when kid has no matching key', async () => {
    const token = await makeToken(canvasClaims, { kid: 'unknown-kid' })
    await expect(
      verifyLtiJwt(token, { keySet, issuer: canvasClaims.iss, audience: CANVAS_CLIENT }),
    ).rejects.toBeInstanceOf(SignatureError)
  })

  it('throws ExpiredError for an expired token', async () => {
    const token = await makeToken(canvasClaims, { expSecondsFromNow: -3600 })
    await expect(
      verifyLtiJwt(token, {
        keySet,
        issuer: canvasClaims.iss,
        audience: CANVAS_CLIENT,
        clockToleranceSec: 0,
      }),
    ).rejects.toBeInstanceOf(ExpiredError)
  })

  it('throws ClaimValidationError on wrong audience', async () => {
    const token = await makeToken(canvasClaims)
    await expect(
      verifyLtiJwt(token, { keySet, issuer: canvasClaims.iss, audience: 'someone-else' }),
    ).rejects.toBeInstanceOf(ClaimValidationError)
  })

  it('throws ClaimValidationError on wrong issuer', async () => {
    const token = await makeToken(canvasClaims)
    await expect(
      verifyLtiJwt(token, { keySet, issuer: 'https://evil.example', audience: CANVAS_CLIENT }),
    ).rejects.toBeInstanceOf(ClaimValidationError)
  })
})

describe('signJwt + staticKeyStore + jwks round trip', () => {
  it('signs with the keystore private key and verifies against its published jwks', async () => {
    const pem = await exportPKCS8(privateKey)
    const ks = staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk })

    const token = await signJwt(
      { hello: 'world' },
      { privateKey: await ks.privateKey(), kid: await ks.kid(), issuer: 'tool', audience: 'lms' },
    )

    const published = await jwks(ks)
    const claims = await verifyLtiJwt(token, {
      keySet: localKeySet(published),
      issuer: 'tool',
      audience: 'lms',
    })
    expect(claims.hello).toBe('world')
    expect(published.keys[0]).toMatchObject({ kid: KID, use: 'sig', alg: 'RS256' })
  })
})
