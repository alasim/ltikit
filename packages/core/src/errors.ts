/** Typed error hierarchy. Every failure is an `LtikitError` with a stable `code`. */

export interface LtikitErrorOptions {
  cause?: unknown
}

export class LtikitError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: LtikitErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.code = code
    // new.target.name → the concrete subclass name (SignatureError, etc.)
    this.name = new.target.name
  }
}

/** JWT signature did not verify against the platform's keys. */
export class SignatureError extends LtikitError {
  constructor(message = 'JWT signature verification failed', options?: LtikitErrorOptions) {
    super('SIGNATURE_INVALID', message, options)
  }
}

/** JWT `exp` is in the past (beyond clock tolerance). */
export class ExpiredError extends LtikitError {
  constructor(message = 'JWT has expired', options?: LtikitErrorOptions) {
    super('TOKEN_EXPIRED', message, options)
  }
}

/** A required claim was missing or did not match (iss / aud / nonce / …). */
export class ClaimValidationError extends LtikitError {
  constructor(message = 'JWT claim validation failed', options?: LtikitErrorOptions) {
    super('CLAIM_INVALID', message, options)
  }
}

/** No registered platform matched the (issuer, clientId) of the request. */
export class PlatformNotFoundError extends LtikitError {
  constructor(message = 'Unknown LTI platform', options?: LtikitErrorOptions) {
    super('PLATFORM_NOT_FOUND', message, options)
  }
}

/** OIDC state/nonce was missing, expired, or already consumed (replay). */
export class NonceReplayError extends LtikitError {
  constructor(message = 'Invalid or already-consumed state/nonce', options?: LtikitErrorOptions) {
    super('NONCE_REPLAY', message, options)
  }
}
