import { dynamicRegistration } from '@ltikit/next'
import { lti, APP_URL } from '@/lib/lti'

/**
 * LTI Dynamic Registration initiation. An LMS admin points the platform at this
 * URL (e.g. Moodle "Tool URL" → LTI 1.3 auto-config); the platform opens it with
 * `openid_configuration` + `registration_token` query params. ltikit fetches the
 * platform config, POSTs this tool's registration, and persists the new platform
 * — no manual insert needed. This is the ONLY way to register a platform in this
 * demo (the in-memory store has no seed data).
 */
export const GET = dynamicRegistration(lti, {
  tool: {
    clientName: 'ltikit memory demo',
    jwksUri: `${APP_URL}/.well-known/jwks.json`,
    initiateLoginUri: `${APP_URL}/api/lti/login`,
    redirectUris: [`${APP_URL}/api/lti/launch`],
    targetLinkUri: `${APP_URL}/api/lti/launch`,
    domain: new URL(APP_URL).host,
  },
})
