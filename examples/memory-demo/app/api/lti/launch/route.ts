import { launch, sameSiteNoneCookie } from '@ltikit/next'
import { LTI_CLAIM_CUSTOM } from '@ltikit/core'
import { lti, APP_URL } from '@/lib/lti'

/**
 * Launch callback. ltikit verifies the id_token (signature + single-use nonce +
 * claims); our handler owns what happens next: create/lookup the app user, set a
 * session, and route by message type.
 *
 * This demo skips real auth and stashes just enough context in a cookie. In
 * production, create your user + a real signed session cookie here instead.
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
  const itemId = custom.item_id ?? ''

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
  // Pass the platform origin + storage-frame target to the landing page so it can
  // demo a cookieless round-trip via LTI Platform Storage. The target was
  // captured from the login params and round-tripped through the nonce.
  const storageTarget = (result.nonceData?.ltiStorageTarget as string | undefined) ?? ''
  const platformOrigin = new URL(result.platform.issuer).origin
  const landing = new URL(`${APP_URL}/launched`)
  landing.searchParams.set('item', itemId)
  landing.searchParams.set('origin', platformOrigin)
  if (storageTarget) landing.searchParams.set('storageTarget', storageTarget)
  const res = new Response(null, { status: 303, headers: { Location: landing.toString() } })
  res.headers.append('Set-Cookie', sameSiteNoneCookie('ltikit_ags', agsContext, { maxAgeSec: 3600 }))

  // Carry the NRPS (roster) context when the launch includes it (instructor + tool
  // authorized for Names & Role Provisioning). Used by /api/lti/roster.
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
