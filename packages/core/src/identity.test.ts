import { describe, it, expect } from 'vitest'
import { ltiIdentity, getRoles, isInstructor, isLearner } from './index'
import type { LtiClaims } from './index'
import {
  LTI_CLAIM_ROLES,
  LTI_CLAIM_CONTEXT,
  LTI_CLAIM_RESOURCE_LINK,
  ROLE_INSTRUCTOR,
  ROLE_LEARNER,
} from './index'

function claims(overrides: Partial<LtiClaims> & Record<string, unknown>): LtiClaims {
  return {
    iss: 'https://canvas.instructure.com',
    sub: 'user-1',
    aud: 'client-1',
    nonce: 'n',
    iat: 0,
    exp: 0,
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'd1',
    ...overrides,
  } as LtiClaims
}

describe('ltiIdentity', () => {
  it('normalizes a Canvas instructor launch', () => {
    const id = ltiIdentity(
      claims({
        email: 'teacher@relay.edu',
        name: 'Ada Teacher',
        given_name: 'Ada',
        family_name: 'Teacher',
        [LTI_CLAIM_ROLES]: [ROLE_INSTRUCTOR],
        [LTI_CLAIM_CONTEXT]: { id: 'c1', title: 'Algebra I' },
        [LTI_CLAIM_RESOURCE_LINK]: { id: 'rl1' },
      }),
    )
    expect(id.sub).toBe('user-1')
    expect(id.issuer).toBe('https://canvas.instructure.com')
    expect(id.email).toBe('teacher@relay.edu')
    expect(id.isInstructor).toBe(true)
    expect(id.isLearner).toBe(false)
    expect(id.contextId).toBe('c1')
    expect(id.contextTitle).toBe('Algebra I')
    expect(id.resourceLinkId).toBe('rl1')
  })

  it('recognizes a learner via the short role form', () => {
    const c = claims({ [LTI_CLAIM_ROLES]: ['Learner'] })
    expect(isLearner(c)).toBe(true)
    expect(isInstructor(c)).toBe(false)
    expect(ltiIdentity(c).isLearner).toBe(true)
  })

  it('recognizes a learner via the full membership URN', () => {
    expect(isLearner(claims({ [LTI_CLAIM_ROLES]: [ROLE_LEARNER] }))).toBe(true)
  })

  it('handles a no-email user (email undefined, identity keyed on sub)', () => {
    const id = ltiIdentity(claims({ sub: 'test-student-9' }))
    expect(id.email).toBeUndefined()
    expect(id.sub).toBe('test-student-9')
  })

  it('returns empty roles when the claim is absent', () => {
    expect(getRoles(claims({}))).toEqual([])
    expect(ltiIdentity(claims({})).isInstructor).toBe(false)
  })
})
