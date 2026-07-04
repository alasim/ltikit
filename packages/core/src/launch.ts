/**
 * Launch verification (LTI 1.3 §5.1.3). Consumes the single-use `state`, then
 * verifies the `id_token` signature + core claims and returns a typed result.
 *
 * Order matters for security:
 *   1. consume(state)        → replay defense (atomic fetch+delete)
 *   2. locate platform       → from the token's iss (still UNVERIFIED here)
 *   3. bind state ↔ platform → the login and the launch must agree
 *   4. verify signature      → only now do we trust anything in the token
 *   5. nonce claim === issued nonce
 *   6. required LTI claims (message_type, deployment_id, azp)
 */
import { decodeJwt } from 'jose'
import { verifyLtiJwt } from './jwt'
import { remoteKeySet } from './keys'
import type { KeySet } from './keys'
import { ClaimValidationError, NonceReplayError, PlatformNotFoundError } from './errors'
import type { NonceStore, PlatformStore } from './adapters'
import type { LtiClaims, LtiMessageType, Platform } from './types'
import {
  LTI_CLAIM_AGS_ENDPOINT,
  LTI_CLAIM_CONTEXT,
  LTI_CLAIM_DEEP_LINKING,
  LTI_CLAIM_DEPLOYMENT_ID,
  LTI_CLAIM_MESSAGE_TYPE,
  LTI_CLAIM_NRPS,
  LTI_CLAIM_RESOURCE_LINK,
  MSG_DEEP_LINKING,
  MSG_RESOURCE_LINK,
} from './constants'

export interface LaunchInput {
  /** The `id_token` the LMS POSTed to our redirect_uri. */
  idToken: string
  /** The `state` the LMS echoed back (must match a live nonce record). */
  state: string
}

export interface LaunchResult {
  platform: Platform
  claims: LtiClaims
  messageType: LtiMessageType
  deploymentId: string
  /** The `data` persisted at `oidc.login` (targetLinkUri, deep-link return, …). */
  nonceData?: Record<string, unknown>
  context?: { id: string; label?: string; title?: string }
  resourceLink?: { id: string; title?: string; description?: string }
  ags?: { scopes: string[]; lineItem?: string; lineItems?: string }
  nrps?: { contextMembershipsUrl: string }
  deepLinking?: { returnUrl: string; acceptTypes: string[]; data?: string }
}

export interface LaunchDeps {
  platforms: PlatformStore
  nonces: NonceStore
  clockToleranceSec: number
  /** Override key resolution (tests inject a local keyset). Default: platform JWKS URL. */
  keySetFor?: (platform: Platform) => KeySet
}

export async function launch(deps: LaunchDeps, input: LaunchInput): Promise<LaunchResult> {
  // 1. Single-use state. Missing / expired / replayed → reject before touching the token.
  const consumed = await deps.nonces.consume(input.state)
  if (!consumed) {
    throw new NonceReplayError('Unknown, expired, or already-used state')
  }

  // 2. Peek iss/aud UNVERIFIED (do not trust yet) only to locate the platform.
  let peek: { iss?: string; aud?: unknown }
  try {
    peek = decodeJwt(input.idToken)
  } catch (err) {
    throw new ClaimValidationError('id_token is not a decodable JWT', { cause: err })
  }
  if (!peek.iss) throw new ClaimValidationError('id_token is missing iss')
  // Only pass a clientId hint when aud is a single string; with an array we let
  // the store match by issuer and rely on signature `audience` verification below.
  const clientIdHint = typeof peek.aud === 'string' ? peek.aud : null
  const platform = await deps.platforms.find(peek.iss, clientIdHint)
  if (!platform) throw new PlatformNotFoundError(`No registered platform for iss=${peek.iss}`)

  // 3. Bind: the login `state` must belong to the platform this token claims.
  if (consumed.platformId !== platform.id) {
    throw new NonceReplayError('state does not belong to the launching platform')
  }

  // 4. Verify signature + iss/aud/exp/iat. Everything below this line is trusted.
  const keySet = deps.keySetFor ? deps.keySetFor(platform) : remoteKeySet(platform.keysetUrl)
  const claims = await verifyLtiJwt(input.idToken, {
    keySet,
    issuer: platform.issuer,
    audience: platform.clientId,
    clockToleranceSec: deps.clockToleranceSec,
  })

  // 5. Nonce claim must equal the nonce we issued at login.
  if (claims.nonce !== consumed.nonce) {
    throw new ClaimValidationError('nonce claim does not match the issued nonce')
  }

  // 6a. When aud is an array, azp MUST identify our client_id (OIDC core §2).
  if (Array.isArray(claims.aud) && claims.azp && claims.azp !== platform.clientId) {
    throw new ClaimValidationError('azp does not match the tool client_id')
  }

  // 6b. Message type must be one we support.
  const messageType = claims[LTI_CLAIM_MESSAGE_TYPE]
  if (messageType !== MSG_RESOURCE_LINK && messageType !== MSG_DEEP_LINKING) {
    throw new ClaimValidationError(`Unsupported LTI message_type: ${String(messageType)}`)
  }

  // 6c. deployment_id is required; if the platform pins one, it must match.
  const deploymentId = claims[LTI_CLAIM_DEPLOYMENT_ID]
  if (!deploymentId) throw new ClaimValidationError('id_token is missing deployment_id')
  if (platform.deploymentId && platform.deploymentId !== deploymentId) {
    throw new ClaimValidationError('deployment_id does not match the registered platform')
  }

  const result: LaunchResult = {
    platform,
    claims,
    messageType,
    deploymentId,
    nonceData: consumed.data,
  }

  const context = claims[LTI_CLAIM_CONTEXT]
  if (context?.id) {
    result.context = { id: context.id, label: context.label, title: context.title }
  }

  const resourceLink = claims[LTI_CLAIM_RESOURCE_LINK]
  if (resourceLink?.id) {
    result.resourceLink = {
      id: resourceLink.id,
      title: resourceLink.title,
      description: resourceLink.description,
    }
  }

  const ags = claims[LTI_CLAIM_AGS_ENDPOINT]
  if (ags) {
    result.ags = { scopes: ags.scope ?? [], lineItem: ags.lineitem, lineItems: ags.lineitems }
  }

  const nrps = claims[LTI_CLAIM_NRPS]
  if (nrps?.context_memberships_url) {
    result.nrps = { contextMembershipsUrl: nrps.context_memberships_url }
  }

  const dl = claims[LTI_CLAIM_DEEP_LINKING]
  if (dl?.deep_link_return_url) {
    result.deepLinking = {
      returnUrl: dl.deep_link_return_url,
      acceptTypes: dl.accept_types ?? [],
      data: dl.data,
    }
  }

  return result
}
