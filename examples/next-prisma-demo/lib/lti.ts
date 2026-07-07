import { createLti, staticKeyStore } from '@ltikit/core'
import { prismaPlatformStore, prismaNonceStore } from '@ltikit/adapter-prisma'
import { prisma } from './prisma'

/**
 * The single shared ltikit instance for this app.
 *
 * - Storage: Prisma/SQLite (`prisma/schema.prisma` — `LtiPlatform` + `LtiNonce`).
 * - Keys: a static RS256 keypair from env. The public JWK is served at
 *   /.well-known/jwks.json so the LMS can verify our signed messages.
 * - Dynamic Registration works out of the box — `prismaPlatformStore` is a
 *   `MutablePlatformStore` (upserts on `(issuer, clientId)`).
 */
export const APP_URL = process.env.APP_URL!

export const lti = createLti({
  keys: staticKeyStore({
    privateKeyPem: process.env.LTI_TOOL_PRIVATE_KEY!,
    kid: process.env.LTI_TOOL_KEY_ID ?? 'ltikit-key-1',
    publicJwk: JSON.parse(process.env.LTI_TOOL_PUBLIC_JWK!),
  }),
  platforms: prismaPlatformStore(prisma),
  nonces: prismaNonceStore(prisma),
})
