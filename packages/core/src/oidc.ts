/**
 * OIDC third-party login initiation (LTI 1.3 §5.1.1). The LMS POSTs a login
 * request; we look up the platform, mint + persist a single-use state/nonce,
 * and hand back the redirect URL to the platform's auth endpoint.
 */
import { PlatformNotFoundError } from './errors'
import type { NonceStore, PlatformStore } from './adapters'

export interface OidcLoginParams {
  /** Platform issuer from the login request (`iss`). */
  iss: string
  /** LMS-scoped user hint, echoed to the auth endpoint (`login_hint`). */
  loginHint: string
  /** Where the launch should land (`target_link_uri`); carried into `launch`. */
  targetLinkUri: string
  /** Tool client_id, when the platform sends one (disambiguates multi-tenant). */
  clientId?: string | null
  /** Opaque platform hint, echoed verbatim (`lti_message_hint`). */
  ltiMessageHint?: string | null
  /** Our launch callback URL, registered with the platform (`redirect_uri`). */
  redirectUri: string
  /** Extra values to persist and read back at launch time. */
  data?: Record<string, unknown>
}

export interface OidcLoginResult {
  /** 302/303 the browser here (the platform's authorization endpoint). */
  redirectUrl: string
  state: string
  nonce: string
}

export interface OidcDeps {
  platforms: PlatformStore
  nonces: NonceStore
  nonceTtlSec: number
}

/**
 * Validate the platform, persist state+nonce, and build the auth redirect URL.
 * Throws `PlatformNotFoundError` for an unregistered issuer.
 */
export async function oidcLogin(
  deps: OidcDeps,
  params: OidcLoginParams,
): Promise<OidcLoginResult> {
  const platform = await deps.platforms.find(params.iss, params.clientId ?? null)
  if (!platform) {
    throw new PlatformNotFoundError(`No registered platform for iss=${params.iss}`)
  }

  const state = globalThis.crypto.randomUUID()
  const nonce = globalThis.crypto.randomUUID()

  await deps.nonces.create({
    state,
    nonce,
    platformId: platform.id,
    ttlSec: deps.nonceTtlSec,
    data: { ...params.data, targetLinkUri: params.targetLinkUri },
  })

  const url = new URL(platform.authEndpoint)
  const q = url.searchParams
  q.set('scope', 'openid')
  q.set('response_type', 'id_token')
  q.set('response_mode', 'form_post')
  q.set('prompt', 'none')
  q.set('client_id', platform.clientId)
  q.set('redirect_uri', params.redirectUri)
  q.set('login_hint', params.loginHint)
  q.set('state', state)
  q.set('nonce', nonce)
  if (params.ltiMessageHint) q.set('lti_message_hint', params.ltiMessageHint)

  return { redirectUrl: url.toString(), state, nonce }
}
