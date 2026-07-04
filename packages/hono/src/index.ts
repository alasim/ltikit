/**
 * @ltikit/hono — Hono route bindings. Thin wrappers that read the request off the
 * Hono `Context`, call the ltikit core, and return a Web-standard `Response`.
 *
 *   const lti = createLti({ ... })
 *   app.post('/api/lti/login', oidcLogin(lti, { redirectUri: `${APP_URL}/api/lti/launch` }))
 *   app.post('/api/lti/launch', launch(lti, async (result, c) => c.redirect('/home')))
 *   app.get('/.well-known/jwks.json', jwks(lti))
 */
import type { Context } from 'hono'
import type { Lti, LaunchResult } from '@ltikit/core'

type HonoHandler = (c: Context) => Promise<Response>

function str(value: FormDataEntryValue | null | undefined): string | null {
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
  /** Launch callback URL registered with the platform. Static, or derived from the request. */
  redirectUri: string | ((c: Context) => string)
}

/** OIDC third-party login initiation. 303-redirects to the platform auth endpoint. */
export function oidcLogin(lti: Lti, options: OidcLoginBindingOptions): HonoHandler {
  return async (c) => {
    const form = await c.req.formData()
    const iss = str(form.get('iss'))
    const loginHint = str(form.get('login_hint'))
    const targetLinkUri = str(form.get('target_link_uri'))
    if (!iss || !loginHint || !targetLinkUri) {
      return errorJson('Missing required OIDC parameters: iss, login_hint, target_link_uri', 400)
    }
    const redirectUri =
      typeof options.redirectUri === 'function' ? options.redirectUri(c) : options.redirectUri

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

/** Your handler receives the verified launch + the Hono context. */
export type LaunchBindingHandler = (
  result: LaunchResult,
  c: Context,
) => Response | Promise<Response>

/** Launch verification. Verifies via core, then hands the typed result to your handler. */
export function launch(lti: Lti, handler: LaunchBindingHandler): HonoHandler {
  return async (c) => {
    const form = await c.req.formData()
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
    return handler(result, c)
  }
}

/** Serve the tool's public JWKS. */
export function jwks(lti: Lti): HonoHandler {
  return async () => {
    const keyset = await lti.jwks()
    return new Response(JSON.stringify(keyset), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    })
  }
}
