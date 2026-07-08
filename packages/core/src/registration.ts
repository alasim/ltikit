/**
 * Dynamic Registration (LTI Advantage / OpenID Connect Dynamic Client
 * Registration). An LMS admin points the platform at the tool's registration
 * URL; the platform hands us an `openid_configuration` URL + a bearer
 * `registration_token`. We:
 *
 *   1. GET the platform's openid-configuration (endpoints + capabilities).
 *   2. POST our tool configuration to the platform's `registration_endpoint`,
 *      authenticated with the one-time registration token.
 *   3. Persist the returned `client_id` + platform endpoints as a Platform.
 *
 * The tool NEVER signs anything here — registration precedes any keypair use;
 * the platform trusts the short-lived registration token, not our JWKS.
 *
 * `deployment_id` is often absent at registration time (Moodle sends it on the
 * first launch, not here). We persist it when the platform echoes it back in
 * the tool-configuration claim, and otherwise leave it null to be backfilled
 * from the first launch's claims.
 */
import { RegistrationError } from './errors'
import type { MutablePlatformStore } from './adapters'
import type { Platform } from './types'
import {
  AGS_SCOPE_LINEITEM,
  AGS_SCOPE_RESULT_READONLY,
  AGS_SCOPE_SCORE,
  LTI_TOOL_CONFIGURATION,
  MSG_DEEP_LINKING,
  MSG_RESOURCE_LINK,
  NRPS_SCOPE_MEMBERSHIP,
} from './constants'

/** Every registration call reaches an external LMS; cap it so a hang can't stall. */
const DEFAULT_TIMEOUT_MS = 10_000

/** The subset of the platform's openid-configuration we consume. */
export interface OpenIdConfiguration {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  registration_endpoint: string
  scopes_supported?: string[]
  [key: string]: unknown
}

/** An LTI message the tool advertises it can receive (registration `messages`). */
export interface ToolMessage {
  type: string
  target_link_uri?: string
  label?: string
  [key: string]: unknown
}

/** Describes the tool being registered. The consumer supplies its own URLs. */
export interface RegistrationTool {
  /** Human-readable tool name shown in the LMS. */
  clientName: string
  /** Public JWKS URL the LMS fetches to verify our signed messages. */
  jwksUri: string
  /** OIDC third-party login initiation URL (the LMS starts launches here). */
  initiateLoginUri: string
  /** Allowed launch callback URLs (must include the one used at `oidc.login`). */
  redirectUris: string[]
  /** Default landing URL for a resource-link launch. */
  targetLinkUri: string
  /** Tool domain (host, no scheme) — the LMS scopes the registration to it. */
  domain: string
  /** Optional logo shown in the LMS registration UI. */
  logoUri?: string
  /** Scopes to request. Default: AGS (line item/score/result) + NRPS. */
  scopes?: string[]
  /** Advertised LTI messages. Default: resource-link + deep-linking. */
  messages?: ToolMessage[]
  /** Identity claims to request. Default: iss, sub, name, email. */
  claims?: string[]
}

export interface RegistrationDeps {
  platforms: MutablePlatformStore
  /** Per-request timeout in ms (default 10000). */
  fetchTimeoutMs?: number
}

export interface RegistrationParams {
  /** `openid_configuration` query param from the platform's registration init. */
  openidConfiguration: string
  /** `registration_token` query param — a one-time bearer for the POST. */
  registrationToken?: string | null
  /** The tool being registered. */
  tool: RegistrationTool
  /**
   * Optional multi-tenant owner key persisted with the platform (e.g. an org
   * id). Passed straight to `MutablePlatformStore.save` as `Platform.tenantId`.
   */
  tenantId?: string | null
}

export interface RegistrationResult {
  /** The persisted platform (with its assigned id). */
  platform: Platform
  /** The platform's registered client configuration (raw response body). */
  registered: Record<string, unknown>
  /** The platform's openid-configuration we fetched. */
  openidConfiguration: OpenIdConfiguration
}

const DEFAULT_SCOPES = [
  AGS_SCOPE_LINEITEM,
  AGS_SCOPE_RESULT_READONLY,
  AGS_SCOPE_SCORE,
  NRPS_SCOPE_MEMBERSHIP,
]

const DEFAULT_CLAIMS = ['iss', 'sub', 'name', 'email']

/**
 * Build the OpenID Client Registration request body (with the embedded LTI
 * tool-configuration claim) that we POST to the platform's registration
 * endpoint. Exposed so consumers can inspect/extend it before registering.
 */
export function buildToolRegistration(tool: RegistrationTool): Record<string, unknown> {
  const messages = tool.messages ?? [
    { type: MSG_RESOURCE_LINK, target_link_uri: tool.targetLinkUri },
    { type: MSG_DEEP_LINKING, target_link_uri: tool.targetLinkUri },
  ]
  const scopes = tool.scopes ?? DEFAULT_SCOPES

  return {
    application_type: 'web',
    response_types: ['id_token'],
    grant_types: ['client_credentials', 'implicit'],
    initiate_login_uri: tool.initiateLoginUri,
    redirect_uris: tool.redirectUris,
    client_name: tool.clientName,
    jwks_uri: tool.jwksUri,
    token_endpoint_auth_method: 'private_key_jwt',
    scope: scopes.join(' '),
    ...(tool.logoUri ? { logo_uri: tool.logoUri } : {}),
    [LTI_TOOL_CONFIGURATION]: {
      domain: tool.domain,
      target_link_uri: tool.targetLinkUri,
      claims: tool.claims ?? DEFAULT_CLAIMS,
      messages,
    },
  }
}

function timeout(deps: RegistrationDeps): number {
  return deps.fetchTimeoutMs ?? DEFAULT_TIMEOUT_MS
}

/** Read `deployment_id` from the returned tool-configuration claim, if present. */
function deploymentIdOf(registered: Record<string, unknown>): string | null {
  const toolConfig = registered[LTI_TOOL_CONFIGURATION]
  if (toolConfig && typeof toolConfig === 'object') {
    const id = (toolConfig as { deployment_id?: unknown }).deployment_id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

/**
 * Run the dynamic-registration handshake and persist the new platform.
 * Throws `RegistrationError` on any HTTP failure or malformed response.
 */
export async function dynamicRegister(
  deps: RegistrationDeps,
  params: RegistrationParams,
): Promise<RegistrationResult> {
  // 1. Fetch the platform's openid-configuration.
  const configRes = await fetch(params.openidConfiguration, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout(deps)),
  }).catch((err: unknown) => {
    throw new RegistrationError('Failed to fetch platform openid-configuration', { cause: err })
  })
  if (!configRes.ok) {
    const text = await configRes.text().catch(() => '')
    throw new RegistrationError(
      `Platform openid-configuration fetch failed: ${configRes.status} ${text.slice(0, 200)}`,
      { status: configRes.status },
    )
  }
  const config = (await configRes.json()) as OpenIdConfiguration
  if (!config.registration_endpoint || !config.issuer) {
    throw new RegistrationError('Platform openid-configuration is missing required fields')
  }

  // 2. POST our tool configuration, authenticated by the one-time reg token.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (params.registrationToken) {
    headers.Authorization = `Bearer ${params.registrationToken}`
  }
  const regRes = await fetch(config.registration_endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildToolRegistration(params.tool)),
    signal: AbortSignal.timeout(timeout(deps)),
  }).catch((err: unknown) => {
    throw new RegistrationError('Failed to POST tool registration', { cause: err })
  })
  if (!regRes.ok) {
    const text = await regRes.text().catch(() => '')
    throw new RegistrationError(
      `Tool registration failed: ${regRes.status} ${text.slice(0, 200)}`,
      { status: regRes.status },
    )
  }
  const registered = (await regRes.json()) as Record<string, unknown>
  const clientId = registered.client_id
  if (typeof clientId !== 'string' || clientId.length === 0) {
    throw new RegistrationError('Registration response is missing client_id')
  }

  // 3. Persist the platform (deployment_id backfills on first launch if absent).
  const platform = await deps.platforms.save({
    issuer: config.issuer,
    clientId,
    authEndpoint: config.authorization_endpoint,
    tokenEndpoint: config.token_endpoint,
    keysetUrl: config.jwks_uri,
    deploymentId: deploymentIdOf(registered),
    tenantId: params.tenantId ?? null,
  })

  return { platform, registered, openidConfiguration: config }
}
