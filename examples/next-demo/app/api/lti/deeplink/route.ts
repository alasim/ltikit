import { cookies } from 'next/headers'
import { htmlResponse } from '@ltikit/next'
import { lti, APP_URL } from '@/lib/lti'

/**
 * Deep-link submit. The picker POSTs the chosen content here; we sign an
 * LtiDeepLinkingResponse and return an auto-submitting form that posts it back
 * to the LMS. The content item declares a `lineItem` so the LMS provisions the
 * gradebook column up front — the later resource-link launch then carries the
 * AGS line item ready to score.
 */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData()
  const simulationId = String(form.get('simulation_id') ?? '')

  const raw = (await cookies()).get('ltikit_dl')?.value
  if (!raw) return new Response('Missing deep-link context', { status: 400 })
  const dl = JSON.parse(decodeURIComponent(raw)) as {
    returnUrl: string
    data?: string
    platform: Parameters<typeof lti.deepLinking.signResponse>[0]['platform']
  }

  const response = await lti.deepLinking.signResponse({
    platform: dl.platform,
    settings: { returnUrl: dl.returnUrl, data: dl.data },
    contentItems: [
      {
        type: 'ltiResourceLink',
        title: `Simulation ${simulationId}`,
        url: `${APP_URL}/api/lti/login`,
        custom: { simulation_id: simulationId },
        lineItem: { scoreMaximum: 2, label: `Simulation ${simulationId}` },
      },
    ],
  })

  return htmlResponse(lti.deepLinking.form(response))
}
