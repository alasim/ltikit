import { cookies } from 'next/headers'
import { lti } from '@/lib/lti'

/**
 * Post a completion grade for the current launch. Reads the AGS context stashed
 * at launch and calls the high-level `publishScore` (which resolves or lazily
 * creates the line item, then posts a FullyGraded score).
 *
 * Demo grade: a flat 2/2. A real app computes this from the student's work.
 */
export async function POST(): Promise<Response> {
  const raw = (await cookies()).get('ltikit_ags')?.value
  if (!raw) return Response.json({ error: 'No AGS context (was this an LTI launch?)' }, { status: 400 })

  const ctx = JSON.parse(decodeURIComponent(raw)) as {
    platform: Parameters<typeof lti.ags.publishScore>[0]['platform']
    lineItemUrl?: string
    lineItemsUrl?: string
    resourceLinkId?: string
    userId: string
  }

  try {
    await lti.ags.publishScore({
      platform: ctx.platform,
      lineItemUrl: ctx.lineItemUrl,
      lineItemsUrl: ctx.lineItemsUrl,
      resourceLinkId: ctx.resourceLinkId,
      userId: ctx.userId,
      scoreGiven: 2,
      scoreMaximum: 2,
      autoCreateLabel: 'ltikit prisma demo',
    })
  } catch (e) {
    console.error('[grade] AGS failed', {
      lineItemUrl: ctx.lineItemUrl,
      lineItemsUrl: ctx.lineItemsUrl,
      resourceLinkId: ctx.resourceLinkId,
      userId: ctx.userId,
      message: e instanceof Error ? e.message : String(e),
    })
    return Response.json(
      { error: e instanceof Error ? e.message : 'grade failed' },
      { status: 502 },
    )
  }

  return Response.json({ ok: true })
}
