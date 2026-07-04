/**
 * Deep Linking (LTI DL 2.0) — content selection response.
 *
 * The platform launches us with an `LtiDeepLinkingRequest` (carrying
 * `deep_linking_settings`). The instructor picks content in your UI, then we
 * sign an `LtiDeepLinkingResponse` JWT and POST it back to the platform's
 * `deep_link_return_url` (an auto-submitting form does the POST).
 *
 * Response JWT directions mirror the security model: WE sign it (tool KeyStore),
 * the platform verifies it against our `jwks()`. So `iss = tool clientId`,
 * `aud = platform issuer`.
 *
 * A content item may declare a `lineItem` so the platform provisions the
 * gradebook column up front; the later resource-link launch then carries an AGS
 * `endpoint.lineitem` ready to score.
 */
import { signJwt } from './jwt'
import type { KeyStore } from './keys'
import type { ContentItem, Platform } from './types'
import {
  LTI_CLAIM_DEPLOYMENT_ID,
  LTI_CLAIM_DL_CONTENT_ITEMS,
  LTI_CLAIM_DL_DATA,
  LTI_CLAIM_MESSAGE_TYPE,
  LTI_CLAIM_VERSION,
  LTI_VERSION,
  MSG_DEEP_LINK_RESP,
} from './constants'

/** The `deep_linking_settings` we need to answer (subset from `LaunchResult`). */
export interface DeepLinkSettings {
  /** Where to POST the signed response (`deep_link_return_url`). */
  returnUrl: string
  acceptTypes?: string[]
  /** Opaque platform value — MUST be echoed back in the response `data` claim. */
  data?: string
}

export interface SignDeepLinkArgs {
  platform: Platform
  settings: DeepLinkSettings
  contentItems: ContentItem[]
}

export interface DeepLinkResponse {
  /** The signed `LtiDeepLinkingResponse` JWT. */
  jwt: string
  /** Where to POST it (echoed from the request settings). */
  returnUrl: string
}

function validateContentItems(items: ContentItem[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('deep link response requires at least one content item')
  }
  for (const item of items) {
    if (item.type !== 'ltiResourceLink') {
      throw new Error(`unsupported content item type: ${String(item.type)}`)
    }
    if (!item.url) throw new Error('ltiResourceLink content item requires a url')
    if (!item.title) throw new Error('ltiResourceLink content item requires a title')
    if (
      item.lineItem &&
      !(typeof item.lineItem.scoreMaximum === 'number' && item.lineItem.scoreMaximum > 0)
    ) {
      throw new Error('content item lineItem.scoreMaximum must be a positive number')
    }
  }
}

/**
 * Sign an `LtiDeepLinkingResponse` for the selected content items. Returns the
 * JWT plus the return URL to POST it to (see `deepLinkForm`).
 */
export async function signDeepLinkResponse(
  keys: KeyStore,
  args: SignDeepLinkArgs,
): Promise<DeepLinkResponse> {
  validateContentItems(args.contentItems)

  const privateKey = await keys.privateKey()
  const kid = await keys.kid()

  const payload: Record<string, unknown> = {
    [LTI_CLAIM_DL_CONTENT_ITEMS]: args.contentItems,
    [LTI_CLAIM_DEPLOYMENT_ID]: args.platform.deploymentId ?? '',
    [LTI_CLAIM_MESSAGE_TYPE]: MSG_DEEP_LINK_RESP,
    [LTI_CLAIM_VERSION]: LTI_VERSION,
  }
  // The platform's opaque `data` MUST round-trip when present (DL 2.0 §3.2).
  if (args.settings.data !== undefined) payload[LTI_CLAIM_DL_DATA] = args.settings.data

  const jwt = await signJwt(payload, {
    privateKey,
    kid,
    issuer: args.platform.clientId,
    audience: args.platform.issuer,
    // Signed at selection time and posted immediately; 5m absorbs clock skew.
    expiresIn: '5m',
  })

  return { jwt, returnUrl: args.settings.returnUrl }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build an auto-submitting HTML form that POSTs the deep-link response JWT back
 * to the platform. Serve it as `text/html` from your deep-link route. Values are
 * HTML-escaped. Note: the inline submit script requires your CSP to allow it
 * (or drop the script and rely on the `<noscript>` button).
 */
export function deepLinkForm(response: DeepLinkResponse): string {
  const action = escapeHtml(response.returnUrl)
  const jwt = escapeHtml(response.jwt)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<form id="ltikit_dl" method="POST" action="${action}">
<input type="hidden" name="JWT" value="${jwt}">
<noscript><button type="submit">Continue</button></noscript>
</form>
<script>document.getElementById('ltikit_dl').submit()</script>
</body>
</html>`
}
