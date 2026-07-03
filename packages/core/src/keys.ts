import { importPKCS8, createRemoteJWKSet, createLocalJWKSet } from 'jose'
import type { JWK, JSONWebKeySet, JWTVerifyGetKey, KeyLike } from 'jose'

/**
 * The tool's own keypair. The private half signs deep-link responses and AGS
 * client assertions; the public half is served at the JWKS endpoint the LMS
 * verifies against. Implement this however you like (env PEM, KMS, etc.).
 */
export interface KeyStore {
  /** Private key used to sign outbound JWTs. */
  privateKey(): Promise<KeyLike | Uint8Array>
  /** Key id — goes in the JWT header `kid`; must match a key in `publicJwks()`. */
  kid(): Promise<string>
  /** Public keyset served at your `/jwks` route (supports >1 key for rotation). */
  publicJwks(): Promise<JSONWebKeySet>
}

/** Import a PKCS8 PEM private key. Tolerates `\n`-escaped env values. */
export function importPrivateKeyPem(pem: string, alg = 'RS256'): Promise<KeyLike> {
  return importPKCS8(pem.replace(/\\n/g, '\n'), alg)
}

/** Single-key `KeyStore` for the common case (one signing key). */
export function staticKeyStore(opts: {
  privateKeyPem: string
  kid: string
  publicJwk: JWK
  alg?: string
}): KeyStore {
  const alg = opts.alg ?? 'RS256'
  let privateKeyCache: Promise<KeyLike> | undefined
  return {
    privateKey() {
      return (privateKeyCache ??= importPrivateKeyPem(opts.privateKeyPem, alg))
    },
    async kid() {
      return opts.kid
    },
    async publicJwks() {
      return { keys: [{ ...opts.publicJwk, kid: opts.kid, alg, use: 'sig' }] }
    },
  }
}

/** A resolver `jwtVerify` uses to find the right verification key. */
export type KeySet = JWTVerifyGetKey

/** Verify against a platform's live JWKS URL (cached + auto-refreshed by jose). */
export function remoteKeySet(keysetUrl: string): KeySet {
  return createRemoteJWKSet(new URL(keysetUrl))
}

/** Verify against an in-memory keyset (tests, or a keyset you already hold). */
export function localKeySet(jwks: JSONWebKeySet): KeySet {
  return createLocalJWKSet(jwks)
}

/** Build the response for your JWKS route from a `KeyStore`. */
export function jwks(keystore: KeyStore): Promise<JSONWebKeySet> {
  return keystore.publicJwks()
}
