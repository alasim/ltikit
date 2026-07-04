/**
 * @ltikit/next — App Router route-handler bindings.
 *
 * These are thin: they adapt a Web-standard `Request` into core calls and return
 * a Web-standard `Response`. Next.js route handlers receive/return exactly those,
 * so this package has NO `next` dependency and runs on any fetch-based runtime.
 *
 *   // app/api/lti/login/route.ts
 *   export const POST = oidcLogin(lti, { redirectUri: `${APP_URL}/api/lti/launch` })
 *
 *   // app/api/lti/launch/route.ts
 *   export const POST = launch(lti, async (result) => {
 *     // your app: create/lookup user, set session cookie, redirect
 *     return Response.redirect(landingUrl, 303)
 *   })
 *
 *   // app/.well-known/jwks.json/route.ts  (or /api/lti/jwks)
 *   export const GET = jwks(lti)
 */
import type { Lti, LaunchResult } from '@ltikit/core'

function str(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function errorJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}

export interface OidcLoginBindingOptions {
  /**
   * Our launch callback URL, registered with the platform as the redirect URI.
   * A function form lets you derive it from the incoming request (e.g. host).
   */
  redirectUri: string | ((req: Request) => string)
}

/**
 * OIDC third-party login initiation. Parses the platform's form POST, mints
 * state+nonce via the core, and 303-redirects to the platform auth endpoint.
 */
export function oidcLogin(lti: Lti, options: OidcLoginBindingOptions) {
  return async (req: Request): Promise<Response> => {
    const form = await req.formData()
    const iss = str(form.get('iss'))
    const loginHint = str(form.get('login_hint'))
    const targetLinkUri = str(form.get('target_link_uri'))
    if (!iss || !loginHint || !targetLinkUri) {
      return errorJson('Missing required OIDC parameters: iss, login_hint, target_link_uri', 400)
    }
    const redirectUri =
      typeof options.redirectUri === 'function' ? options.redirectUri(req) : options.redirectUri

    try {
      const { redirectUrl } = await lti.oidc.login({
        iss,
        loginHint,
        targetLinkUri,
        clientId: str(form.get('client_id')),
        ltiMessageHint: str(form.get('lti_message_hint')),
        redirectUri,
      })
      return Response.redirect(redirectUrl, 303)
    } catch (err) {
      return errorJson(errorMessage(err), 400)
    }
  }
}

/** Your handler receives the verified launch; it owns session creation + redirect. */
export type LaunchBindingHandler = (
  result: LaunchResult,
  req: Request,
) => Response | Promise<Response>

/**
 * Launch verification. Parses the id_token+state form POST, verifies via the
 * core (signature + single-use nonce + claims), then hands the typed result to
 * your handler. A verification failure returns 400 before your handler runs.
 */
export function launch(lti: Lti, handler: LaunchBindingHandler) {
  return async (req: Request): Promise<Response> => {
    const form = await req.formData()
    const idToken = str(form.get('id_token'))
    const state = str(form.get('state'))
    if (!idToken || !state) {
      return errorJson('Missing id_token or state', 400)
    }

    let result: LaunchResult
    try {
      result = await lti.launch({ idToken, state })
    } catch (err) {
      return errorJson(errorMessage(err), 400)
    }
    return handler(result, req)
  }
}

/** Serve the tool's public JWKS. Cached an hour (the LMS re-fetches on rotation). */
export function jwks(lti: Lti) {
  return async (): Promise<Response> => {
    const keyset = await lti.jwks()
    return new Response(JSON.stringify(keyset), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }
}

/** Wrap deep-link HTML (from `lti.deepLinking.form(...)`) in an HTML response. */
export function htmlResponse(html: string): Response {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// --- iframe helpers (LTI tools are embedded in an LMS iframe) ---

/**
 * Build a CSP `frame-ancestors` directive from the LMS origins allowed to embed
 * you. Set it as `Content-Security-Policy` so the tool renders inside the LMS.
 */
export function cspFrameAncestors(platformOrigins: string[]): string {
  return ['frame-ancestors', "'self'", ...platformOrigins].join(' ')
}

export interface SameSiteNoneCookieOptions {
  maxAgeSec?: number
  path?: string
  /** Default true. */
  httpOnly?: boolean
  domain?: string
}

/**
 * A `Set-Cookie` value with `SameSite=None; Secure` — required for cookies to
 * survive inside a cross-site LMS iframe.
 */
export function sameSiteNoneCookie(
  name: string,
  value: string,
  options: SameSiteNoneCookieOptions = {},
): string {
  const parts = [`${name}=${value}`, `Path=${options.path ?? '/'}`, 'SameSite=None', 'Secure']
  if (options.httpOnly ?? true) parts.push('HttpOnly')
  if (options.maxAgeSec !== undefined) parts.push(`Max-Age=${options.maxAgeSec}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  return parts.join('; ')
}

/**
 * Client-side snippet that posts the document height to the LMS parent frame so
 * the iframe auto-resizes (Canvas/Moodle listen for `lti.frameResize`). Inline it
 * in a `<script>` (allow it in your CSP). Prefer a concrete `targetOrigin` over
 * the default `'*'` when you know the LMS origin.
 */
export function frameResizeScript(targetOrigin = '*'): string {
  const origin = JSON.stringify(targetOrigin)
  return `(function(){function h(){parent.postMessage({subject:'lti.frameResize',height:document.documentElement.scrollHeight},${origin});}window.addEventListener('load',h);window.addEventListener('resize',h);})();`
}
