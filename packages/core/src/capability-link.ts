/**
 * Capability links — a short-lived, self-issued and self-verified token using
 * the tool's OWN keypair. No LMS involved on either end.
 *
 * For granting a privileged, no-login link derived from an LTI context — e.g.
 * a faculty "review this student's work" URL opened from Canvas SpeedGrader
 * (via an AGS score `submission` pointing at it — see `ags.ts`). The tool
 * mints the link at grade-passback time and verifies it later when opened;
 * nothing is stored, so there's no session/DB coupling.
 *
 * Ported from a production pattern (TeachSim's signed faculty-report links).
 */
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'
import type { JWTPayload } from 'jose'
import type { KeyStore } from './keys'
import { localKeySet } from './keys'
import { ExpiredError, SignatureError } from './errors'

/** Fixed self-issuer/audience — this token never leaves the tool's own control. */
const CAPABILITY_LINK_ISS = 'ltikit:capability-link'

export interface CapabilityLinkOptions {
  /** `setExpirationTime` value (default `'1h'`). Keep this short — it's a bearer link. */
  expiresIn?: string | number
}

/**
 * Sign a capability link token. Put whatever the receiving route needs to
 * render (e.g. `{ sessionId, resourceLinkId }`) in `payload` — it round-trips
 * through `verifyCapabilityLink` unchanged.
 */
export async function signCapabilityLink(
  keys: KeyStore,
  payload: JWTPayload,
  opts: CapabilityLinkOptions = {},
): Promise<string> {
  const [privateKey, kid] = await Promise.all([keys.privateKey(), keys.kid()])
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .setIssuer(CAPABILITY_LINK_ISS)
    .setAudience(CAPABILITY_LINK_ISS)
    .setJti(globalThis.crypto.randomUUID())
    .sign(privateKey)
}

/**
 * Verify a token minted by `signCapabilityLink` against the same `KeyStore`.
 * Throws `ExpiredError` / `SignatureError` on failure (same error types
 * `verifyLtiJwt` uses, so callers can handle both the same way).
 */
export async function verifyCapabilityLink<T extends JWTPayload = JWTPayload>(
  keys: KeyStore,
  token: string,
): Promise<T> {
  const jwks = await keys.publicJwks()
  try {
    const { payload } = await jwtVerify(token, localKeySet(jwks), {
      issuer: CAPABILITY_LINK_ISS,
      audience: CAPABILITY_LINK_ISS,
    })
    return payload as T
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new ExpiredError('Capability link has expired', { cause: err })
    }
    if (
      err instanceof joseErrors.JWSSignatureVerificationFailed ||
      err instanceof joseErrors.JWKSNoMatchingKey ||
      err instanceof joseErrors.JWKSMultipleMatchingKeys
    ) {
      throw new SignatureError('Capability link signature verification failed', { cause: err })
    }
    throw err
  }
}
