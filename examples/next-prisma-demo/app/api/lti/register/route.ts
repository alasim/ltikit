import { dynamicRegistration } from '@ltikit/next'
import { lti, APP_URL } from '@/lib/lti'

/**
 * LTI Dynamic Registration initiation. Point your LMS's LTI 1.3 auto-config at
 * this URL — ltikit fetches the platform config, registers the tool, and
 * persists the new platform via `prismaPlatformStore` (a `MutablePlatformStore`)
 * — no manual insert needed.
 */
export const GET = dynamicRegistration(lti, {
  tool: {
    clientName: 'ltikit prisma demo',
    jwksUri: `${APP_URL}/.well-known/jwks.json`,
    initiateLoginUri: `${APP_URL}/api/lti/login`,
    redirectUris: [`${APP_URL}/api/lti/launch`],
    targetLinkUri: `${APP_URL}/api/lti/launch`,
    domain: new URL(APP_URL).host,
  },
})
