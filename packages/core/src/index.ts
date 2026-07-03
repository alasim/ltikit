/**
 * @ltikit/core — runtime-agnostic LTI 1.3 (LTI Advantage) core.
 *
 * Phase 1: types, constants, crypto (JWT verify/sign), KeyStore + jwks, errors.
 * OIDC/launch/deep-linking/AGS/NRPS flows land in later phases.
 */

export const version = '0.1.0'

export * from './constants'
export * from './errors'
export * from './types'
export * from './keys'
export * from './jwt'
