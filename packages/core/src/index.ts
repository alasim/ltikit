/**
 * @ltikit/core — runtime-agnostic LTI 1.3 (LTI Advantage) core.
 *
 * Phase 1: types, constants, crypto (JWT verify/sign), KeyStore + jwks, errors.
 * Phase 2: storage adapters, `createLti`, OIDC login, launch verification.
 * Deep-linking / AGS / NRPS flows land in later phases.
 *
 * The adapter conformance kit is a separate entry: `@ltikit/core/testing`.
 */

export const version = '0.1.0'

export * from './constants'
export * from './errors'
export * from './types'
export * from './keys'
export * from './jwt'
export * from './adapters'
export * from './oidc'
export * from './launch'
export * from './ags'
export * from './deep-linking'
export * from './identity'
export * from './lti'
