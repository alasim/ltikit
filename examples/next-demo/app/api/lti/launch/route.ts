import { launch, sameSiteNoneCookie } from '@ltikit/next'
import { LTI_CLAIM_CUSTOM } from '@ltikit/core'
import { lti, APP_URL } from '@/lib/lti'

/**
 * Launch callback. ltikit verifies the id_token (signature + single-use nonce +
 * claims); our handler owns what happens next: create/lookup the app user, set a
 * session, and route by message type.
 *
 * This demo skips real auth and stashes just enough context in a cookie. In
 * production, create your Supabase user here (see TeachSim `upsertLtiProfile`)
 * and set a real signed session cookie instead.
 */
export const POST = launch(lti, (result) => {
  if (result.messageType === 'LtiDeepLinkingRequest') {
    // Instructor is picking content — carry the deep-link context to the picker.
    const payload = encodeURIComponent(
      JSON.stringify({
        returnUrl: result.deepLinking?.returnUrl,
        data: result.deepLinking?.data,
        platform: result.platform,
      }),
    )
    const res = new Response(null, { status: 303, headers: { Location: `${APP_URL}/lti/select` } })
    res.headers.append('Set-Cookie', sameSiteNoneCookie('ltikit_dl', payload, { maxAgeSec: 600 }))
    return res
  }

  // Resource-link launch (a student opening a placed activity).
  const custom = (result.claims[LTI_CLAIM_CUSTOM] ?? {}) as Record<string, string>
  const simulationId = custom.simulation_id ?? ''

  // Carry the AGS context so we can post a grade when the activity completes.
  const agsContext = encodeURIComponent(
    JSON.stringify({
      platform: result.platform,
      lineItemUrl: result.ags?.lineItem,
      lineItemsUrl: result.ags?.lineItems,
      resourceLinkId: result.resourceLink?.id,
      userId: result.claims.sub,
    }),
  )
  const res = new Response(null, {
    status: 303,
    headers: { Location: `${APP_URL}/launched?sim=${encodeURIComponent(simulationId)}` },
  })
  res.headers.append('Set-Cookie', sameSiteNoneCookie('ltikit_ags', agsContext, { maxAgeSec: 3600 }))

  // Carry the NRPS (roster) context when the launch includes it (instructor + tool
  // authorized for Names & Roles). Used by /api/lti/roster.
  if (result.nrps?.contextMembershipsUrl) {
    const nrpsContext = encodeURIComponent(
      JSON.stringify({
        platform: result.platform,
        contextMembershipsUrl: result.nrps.contextMembershipsUrl,
      }),
    )
    res.headers.append('Set-Cookie', sameSiteNoneCookie('ltikit_nrps', nrpsContext, { maxAgeSec: 3600 }))
  }
  return res
})
