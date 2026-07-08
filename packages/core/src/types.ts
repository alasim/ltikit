/** Public types for LTI 1.3 messages and platform registration. */

export type LtiMessageType = 'LtiResourceLinkRequest' | 'LtiDeepLinkingRequest'

/**
 * A registered LMS platform (camelCase, library-facing). Storage adapters map
 * their rows onto this shape. `id` is the adapter's own primary key.
 */
export interface Platform {
  id: string
  issuer: string
  clientId: string
  authEndpoint: string
  tokenEndpoint: string
  keysetUrl: string
  deploymentId?: string | null
  /**
   * Optional multi-tenant owner key (e.g. an organization id). The core only
   * carries it: a `MutablePlatformStore` sets it at registration and returns it
   * from `find`, so a multi-tenant tool can bind each platform to a tenant.
   * Adapters without tenancy support leave it undefined.
   */
  tenantId?: string | null
}

// --- Claim value shapes ---

export interface ResourceLinkClaim {
  id: string
  title?: string
  description?: string
}

export interface ContextClaim {
  id: string
  label?: string
  title?: string
  type?: string[]
}

export interface AgsEndpointClaim {
  scope?: string[]
  lineitem?: string
  lineitems?: string
}

export interface NrpsClaim {
  context_memberships_url: string
  service_versions?: string[]
}

export interface DeepLinkingSettingsClaim {
  deep_link_return_url: string
  accept_types: string[]
  accept_presentation_document_targets: string[]
  accept_multiple?: boolean
  auto_create?: boolean
  title?: string
  text?: string
  data?: string
}

/**
 * Verified LTI launch claims. Known keys are typed; unknown/custom claims are
 * preserved via the index signature (LMSs add vendor-specific claims).
 */
export interface LtiClaims {
  iss: string
  sub: string
  aud: string | string[]
  nonce: string
  iat: number
  exp: number
  azp?: string
  email?: string
  name?: string
  given_name?: string
  family_name?: string

  'https://purl.imsglobal.org/spec/lti/claim/message_type': string
  'https://purl.imsglobal.org/spec/lti/claim/version': string
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': string
  'https://purl.imsglobal.org/spec/lti/claim/target_link_uri'?: string
  'https://purl.imsglobal.org/spec/lti/claim/roles'?: string[]
  'https://purl.imsglobal.org/spec/lti/claim/resource_link'?: ResourceLinkClaim
  'https://purl.imsglobal.org/spec/lti/claim/context'?: ContextClaim
  'https://purl.imsglobal.org/spec/lti/claim/custom'?: Record<string, string>
  'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'?: DeepLinkingSettingsClaim
  'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'?: AgsEndpointClaim
  'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'?: NrpsClaim

  [claim: string]: unknown
}

/** A Deep Linking content item returned to the platform. */
export interface ContentItem {
  type: 'ltiResourceLink'
  title: string
  url: string
  text?: string
  custom?: Record<string, string>
  /** Declares a gradebook column so the LMS provisions the AGS line item up front. */
  lineItem?: {
    scoreMaximum: number
    label?: string
    tag?: string
    resourceId?: string
  }
}
