import { launch, sessionRedirect, sameSiteNoneCookie } from '@ltikit/next'
import { LTI_CLAIM_CUSTOM } from '@ltikit/core'
import { lti, APP_URL } from '@/lib/lti'
import { resolveLtiUser } from '@/lib/enrollment'
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'

/**
 * Launch callback. ltikit verifies the id_token (signature + single-use nonce +
 * claims); this handler resolves/creates the app user (Prisma `User` +
 * `LtiEnrollment`) and establishes a real NextAuth session — no NextAuth
 * sign-in round-trip needed, since `signSessionToken` + `sessionRedirect` mint
 * and set the exact same session cookie NextAuth's own credentials flow does
 * (see lib/auth.ts).
 */
export const POST = launch(lti, async (result) => {
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
  const user = await resolveLtiUser({
    issuer: result.platform.issuer,
    sub: result.claims.sub,
    email: result.claims.email,
    name: result.claims.name,
  })
  const sessionToken = await signSessionToken({ sub: user.id, email: user.email, name: user.name })

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

  const cookies = [
    { name: SESSION_COOKIE_NAME, value: sessionToken, maxAgeSec: 3600 },
    { name: 'ltikit_ags', value: agsContext, maxAgeSec: 3600 },
  ]

  // Carry the NRPS (roster) context when the launch includes it (instructor + tool
  // authorized for Names & Roles). Used by /api/lti/roster.
  if (result.nrps?.contextMembershipsUrl) {
    const nrpsContext = encodeURIComponent(
      JSON.stringify({ platform: result.platform, contextMembershipsUrl: result.nrps.contextMembershipsUrl }),
    )
    cookies.push({ name: 'ltikit_nrps', value: nrpsContext, maxAgeSec: 3600 })
  }

  // Pass the platform origin + storage-frame target to the landing page so it can
  // demo a cookieless round-trip via LTI Platform Storage. The target was
  // captured from the login params and round-tripped through the nonce.
  const storageTarget = (result.nonceData?.ltiStorageTarget as string | undefined) ?? ''
  const platformOrigin = new URL(result.platform.issuer).origin
  const landing = new URL(`${APP_URL}/launched`)
  landing.searchParams.set('sim', simulationId)
  landing.searchParams.set('origin', platformOrigin)
  if (storageTarget) landing.searchParams.set('storageTarget', storageTarget)

  return sessionRedirect({ to: landing.toString(), cookies })
})
