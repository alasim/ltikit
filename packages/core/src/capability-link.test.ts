import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose'
import type { JWK } from 'jose'
import {
  signCapabilityLink,
  verifyCapabilityLink,
  staticKeyStore,
  ExpiredError,
  SignatureError,
} from './index'
import type { KeyStore } from './index'

const KID = 'ltikit-test-1'

let keys: KeyStore
let otherKeys: KeyStore

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const pem = await exportPKCS8(pair.privateKey)
  const publicJwk: JWK = await exportJWK(pair.publicKey)
  keys = staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk })

  const otherPair = await generateKeyPair('RS256', { extractable: true })
  const otherPem = await exportPKCS8(otherPair.privateKey)
  const otherPublicJwk: JWK = await exportJWK(otherPair.publicKey)
  otherKeys = staticKeyStore({ privateKeyPem: otherPem, kid: KID, publicJwk: otherPublicJwk })
})

describe('signCapabilityLink + verifyCapabilityLink', () => {
  it('round-trips an arbitrary payload', async () => {
    const token = await signCapabilityLink(keys, { sessionId: 'sess-1', role: 'faculty' })
    const payload = await verifyCapabilityLink<{ sessionId: string; role: string }>(keys, token)
    expect(payload.sessionId).toBe('sess-1')
    expect(payload.role).toBe('faculty')
  })

  it('throws ExpiredError for an expired link', async () => {
    const token = await signCapabilityLink(keys, { x: 1 }, { expiresIn: '-1s' })
    await expect(verifyCapabilityLink(keys, token)).rejects.toBeInstanceOf(ExpiredError)
  })

  it('throws SignatureError when verified against a different keypair', async () => {
    const token = await signCapabilityLink(keys, { x: 1 })
    await expect(verifyCapabilityLink(otherKeys, token)).rejects.toBeInstanceOf(SignatureError)
  })

  it('throws SignatureError on a tampered token', async () => {
    const token = await signCapabilityLink(keys, { x: 1 })
    const parts = token.split('.')
    parts[2] = parts[2]!.slice(0, -2) + (parts[2]!.endsWith('A') ? 'BB' : 'AA')
    await expect(verifyCapabilityLink(keys, parts.join('.'))).rejects.toBeInstanceOf(SignatureError)
  })
})
