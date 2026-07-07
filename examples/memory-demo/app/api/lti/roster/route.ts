import { cookies } from 'next/headers'
import { lti } from '@/lib/lti'

/**
 * Fetch the course roster via NRPS. Reads the NRPS context stashed at launch and
 * calls `nrps.getMembers` (which follows pagination). Requires the launch to have
 * carried a Names & Roles endpoint — i.e. an instructor launch with the tool
 * authorized for Names & Role Provisioning in the LMS.
 */
export async function GET(): Promise<Response> {
  const raw = (await cookies()).get('ltikit_nrps')?.value
  if (!raw) {
    return Response.json(
      { error: 'No NRPS context. Launch as an instructor with Names & Roles enabled for the tool.' },
      { status: 400 },
    )
  }

  const ctx = JSON.parse(decodeURIComponent(raw)) as {
    platform: Parameters<typeof lti.nrps.getMembers>[0]
    contextMembershipsUrl: string
  }

  try {
    const result = await lti.nrps.getMembers(ctx.platform, ctx.contextMembershipsUrl)
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'roster failed' }, { status: 502 })
  }
}
