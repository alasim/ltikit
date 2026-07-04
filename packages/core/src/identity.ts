/**
 * Identity helpers — normalize verified launch claims into the shape apps need
 * to create their own user/session. Pure functions over `LtiClaims`; no framework
 * or storage. This is the starting point for every auth-integration recipe:
 * `ltiIdentity(result.claims)` → find/create your user → start your session.
 */
import type { LtiClaims } from './types'
import {
  LTI_CLAIM_CONTEXT,
  LTI_CLAIM_RESOURCE_LINK,
  LTI_CLAIM_ROLES,
  ROLE_INSTRUCTOR,
  ROLE_LEARNER,
} from './constants'

/** Normalized, app-facing view of who launched and from where. */
export interface LtiIdentity {
  /** Stable per-user id within the issuer — the identity key (NOT email). */
  sub: string
  /** Platform issuer. Together with `sub`, uniquely identifies the user. */
  issuer: string
  /** May be absent (Canvas Test Student, privacy) — fall back to `sub`. */
  email?: string
  name?: string
  givenName?: string
  familyName?: string
  roles: string[]
  isInstructor: boolean
  isLearner: boolean
  contextId?: string
  contextTitle?: string
  resourceLinkId?: string
}

/** The `roles` claim as a string array (empty when absent). */
export function getRoles(claims: LtiClaims): string[] {
  const roles = claims[LTI_CLAIM_ROLES]
  return Array.isArray(roles) ? roles : []
}

// LMSs send roles as either the short form ("Instructor") or a full URN
// (".../membership#Instructor"); match both.
function matchesRole(roles: string[], short: string, urn: string): boolean {
  return roles.some((r) => r === short || r === urn || r.endsWith(`#${short}`))
}

export function isInstructor(claims: LtiClaims): boolean {
  return matchesRole(getRoles(claims), 'Instructor', ROLE_INSTRUCTOR)
}

export function isLearner(claims: LtiClaims): boolean {
  return matchesRole(getRoles(claims), 'Learner', ROLE_LEARNER)
}

/** Normalize verified claims into an `LtiIdentity`. */
export function ltiIdentity(claims: LtiClaims): LtiIdentity {
  const roles = getRoles(claims)
  const context = claims[LTI_CLAIM_CONTEXT]
  const resourceLink = claims[LTI_CLAIM_RESOURCE_LINK]
  return {
    sub: claims.sub,
    issuer: claims.iss,
    email: claims.email,
    name: claims.name,
    givenName: claims.given_name,
    familyName: claims.family_name,
    roles,
    isInstructor: matchesRole(roles, 'Instructor', ROLE_INSTRUCTOR),
    isLearner: matchesRole(roles, 'Learner', ROLE_LEARNER),
    contextId: context?.id,
    contextTitle: context?.title,
    resourceLinkId: resourceLink?.id,
  }
}
