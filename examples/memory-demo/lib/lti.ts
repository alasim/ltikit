import { createLti, staticKeyStore } from '@ltikit/core'
import { MemoryNonceStore, MemoryPlatformStore } from '@ltikit/adapter-memory'

/**
 * The single shared ltikit instance for this app.
 *
 * - Storage: in-memory — zero setup, but per-process. Restarting the server
 *   forgets every registered platform; re-register via Dynamic Registration
 *   (see /api/lti/register) each time you restart `next dev`.
 * - Keys: a static RS256 keypair from env. The public JWK is served at
 *   /.well-known/jwks.json so the LMS can verify our signed messages.
 *
 * No seed platforms — this demo relies entirely on Dynamic Registration, so
 * there's nothing to hand-configure beyond pointing your LMS at /api/lti/register.
 */
export const APP_URL = process.env.APP_URL!

export const lti = createLti({
  keys: staticKeyStore({
    privateKeyPem: process.env.LTI_TOOL_PRIVATE_KEY!,
    kid: process.env.LTI_TOOL_KEY_ID ?? 'ltikit-key-1',
    publicJwk: JSON.parse(process.env.LTI_TOOL_PUBLIC_JWK!),
  }),
  platforms: new MemoryPlatformStore(),
  nonces: new MemoryNonceStore(),
})
