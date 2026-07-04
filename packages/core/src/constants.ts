/** LTI 1.3 URN constants: message types, claim keys, scopes, media types. */

export const LTI_VERSION = '1.3.0'

// --- Message types ---
export const MSG_RESOURCE_LINK = 'LtiResourceLinkRequest'
export const MSG_DEEP_LINKING = 'LtiDeepLinkingRequest'
export const MSG_DEEP_LINK_RESP = 'LtiDeepLinkingResponse'

// --- Core claim keys ---
export const LTI_CLAIM_MESSAGE_TYPE = 'https://purl.imsglobal.org/spec/lti/claim/message_type'
export const LTI_CLAIM_VERSION = 'https://purl.imsglobal.org/spec/lti/claim/version'
export const LTI_CLAIM_DEPLOYMENT_ID = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id'
export const LTI_CLAIM_TARGET_LINK_URI = 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri'
export const LTI_CLAIM_RESOURCE_LINK = 'https://purl.imsglobal.org/spec/lti/claim/resource_link'
export const LTI_CLAIM_ROLES = 'https://purl.imsglobal.org/spec/lti/claim/roles'
export const LTI_CLAIM_CONTEXT = 'https://purl.imsglobal.org/spec/lti/claim/context'
export const LTI_CLAIM_CUSTOM = 'https://purl.imsglobal.org/spec/lti/claim/custom'
export const LTI_CLAIM_LAUNCH_PRESENTATION =
  'https://purl.imsglobal.org/spec/lti/claim/launch_presentation'
export const LTI_CLAIM_TOOL_PLATFORM = 'https://purl.imsglobal.org/spec/lti/claim/tool_platform'

// --- LIS roles (the `roles` claim; membership context roles) ---
export const ROLE_INSTRUCTOR = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'
export const ROLE_LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'
export const ROLE_ADMIN = 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator'

// --- Deep Linking ---
export const LTI_CLAIM_DEEP_LINKING =
  'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'
export const LTI_CLAIM_DL_CONTENT_ITEMS = 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items'
export const LTI_CLAIM_DL_DATA = 'https://purl.imsglobal.org/spec/lti-dl/claim/data'

// --- AGS (Assignment & Grade Services) ---
export const LTI_CLAIM_AGS_ENDPOINT = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'
export const AGS_SCOPE_LINEITEM = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'
export const AGS_SCOPE_LINEITEM_READONLY =
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly'
export const AGS_SCOPE_RESULT_READONLY =
  'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly'
export const AGS_SCOPE_SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score'
export const AGS_MEDIA_SCORE = 'application/vnd.ims.lis.v1.score+json'
export const AGS_MEDIA_LINEITEM = 'application/vnd.ims.lis.v2.lineitem+json'
export const AGS_MEDIA_LINEITEM_CONTAINER = 'application/vnd.ims.lis.v2.lineitemcontainer+json'
export const AGS_MEDIA_RESULT_CONTAINER = 'application/vnd.ims.lis.v2.resultcontainer+json'

// --- NRPS (Names & Role Provisioning Services) ---
export const LTI_CLAIM_NRPS = 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'
export const NRPS_SCOPE_MEMBERSHIP =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
export const NRPS_MEDIA_MEMBERSHIP = 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json'

// --- OAuth2 client-credentials (service tokens) ---
export const OAUTH_GRANT_CLIENT_CREDENTIALS = 'client_credentials'
export const OAUTH_CLIENT_ASSERTION_TYPE =
  'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
