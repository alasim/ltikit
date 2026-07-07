import { oidcLogin } from '@ltikit/next'
import { lti, APP_URL } from '@/lib/lti'

// OIDC third-party initiation. The LMS POSTs here to start every launch.
export const POST = oidcLogin(lti, { redirectUri: `${APP_URL}/api/lti/launch` })
