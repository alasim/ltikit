import { jwtVerify, SignJWT, errors as joseErrors } from 'jose'
import type { JWTPayload, KeyLike } from 'jose'
import type { LtiClaims } from './types'
import type { KeySet } from './keys'
import { ClaimValidationError, ExpiredError, SignatureError } from './errors'

export interface VerifyOptions {
  /** Key resolver — `remoteKeySet(platform.keysetUrl)` or `localKeySet(jwks)`. */
  keySet: KeySet
  /** Expected `iss` — the platform issuer. */
  issuer: string
  /** Expected `aud` — our tool's client_id. */
  audience: string
  /** Allowed clock skew in seconds (default 30). */
  clockToleranceSec?: number
}

/**
 * Verify an inbound LTI JWT (the launch `id_token`): checks the signature via
 * the platform JWKS and validates `iss` / `aud` / `exp` / `iat`. Throws a typed
 * error (`SignatureError` / `ExpiredError` / `ClaimValidationError`) on failure.
 */
export async function verifyLtiJwt(token: string, opts: VerifyOptions): Promise<LtiClaims> {
  try {
    const { payload } = await jwtVerify(token, opts.keySet, {
      issuer: opts.issuer,
      audience: opts.audience,
      clockTolerance: opts.clockToleranceSec ?? 30,
    })
    return payload as unknown as LtiClaims
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new ExpiredError(undefined, { cause: err })
    }
    if (
      err instanceof joseErrors.JWSSignatureVerificationFailed ||
      err instanceof joseErrors.JWKSNoMatchingKey ||
      err instanceof joseErrors.JWKSMultipleMatchingKeys
    ) {
      throw new SignatureError(undefined, { cause: err })
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      throw new ClaimValidationError(err.message, { cause: err })
    }
    throw err
  }
}

export interface SignOptions {
  privateKey: KeyLike | Uint8Array
  /** JWT header `kid` — must resolve in the tool's published JWKS. */
  kid: string
  issuer: string
  audience: string | string[]
  /** `setExpirationTime` value (default `'1m'`). */
  expiresIn?: string | number
  /** Signature algorithm (default `'RS256'`). */
  alg?: string
}

/**
 * Sign an outbound RS256 JWT. Low-level primitive used by deep-link responses
 * and AGS/NRPS client assertions (later phases). Always sets `iat`, `exp`, `jti`.
 */
export function signJwt(payload: JWTPayload, opts: SignOptions): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: opts.alg ?? 'RS256', kid: opts.kid })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1m')
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setJti(globalThis.crypto.randomUUID())
    .sign(opts.privateKey)
}
