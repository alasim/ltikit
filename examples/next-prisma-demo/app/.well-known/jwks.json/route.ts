import { jwks } from '@ltikit/next'
import { lti } from '@/lib/lti'

// The tool's public keyset. Register this URL as the tool JWKS in your LMS.
export const GET = jwks(lti)
