import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8, exportJWK, decodeProtectedHeader } from 'jose'
import type { JWK } from 'jose'
import {
  signDeepLinkResponse,
  deepLinkForm,
  createLti,
  staticKeyStore,
  jwks as buildJwks,
  localKeySet,
  verifyLtiJwt,
  LTI_CLAIM_DL_CONTENT_ITEMS,
  LTI_CLAIM_DL_DATA,
  LTI_CLAIM_DEPLOYMENT_ID,
  LTI_CLAIM_MESSAGE_TYPE,
  MSG_DEEP_LINK_RESP,
} from './index'
import type { ContentItem, KeyStore, Platform } from './index'

const KID = 'ltikit-dl-1'

const PLATFORM: Platform = {
  id: 'p1',
  issuer: 'https://teachsim.moodlecloud.com',
  clientId: 'tool-client-1',
  authEndpoint: 'https://teachsim.moodlecloud.com/mod/lti/auth.php',
  tokenEndpoint: 'https://teachsim.moodlecloud.com/mod/lti/token.php',
  keysetUrl: 'https://teachsim.moodlecloud.com/mod/lti/certs.php',
  deploymentId: 'dep-9',
}

const RETURN_URL = 'https://teachsim.moodlecloud.com/mod/lti/return.php'

const ITEM: ContentItem = {
  type: 'ltiResourceLink',
  title: 'Classroom Sim 1',
  url: 'https://tool.example/api/lti/oidc-login',
  custom: { simulation_id: 'sim-123' },
  lineItem: { scoreMaximum: 2, label: 'Classroom Sim 1' },
}

let keys: KeyStore
let publicJwk: JWK

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const pem = await exportPKCS8(pair.privateKey)
  publicJwk = await exportJWK(pair.publicKey)
  keys = staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk })
})

describe('signDeepLinkResponse', () => {
  it('signs a response that verifies against our published jwks (round trip)', async () => {
    const { jwt, returnUrl } = await signDeepLinkResponse(keys, {
      platform: PLATFORM,
      settings: { returnUrl: RETURN_URL, data: 'opaque-123' },
      contentItems: [ITEM],
    })

    expect(returnUrl).toBe(RETURN_URL)
    expect(decodeProtectedHeader(jwt).kid).toBe(KID)

    const published = await buildJwks(keys)
    // Platform verifies: iss = tool clientId, aud = platform issuer.
    const claims = await verifyLtiJwt(jwt, {
      keySet: localKeySet(published),
      issuer: PLATFORM.clientId,
      audience: PLATFORM.issuer,
    })

    expect(claims[LTI_CLAIM_MESSAGE_TYPE]).toBe(MSG_DEEP_LINK_RESP)
    expect(claims[LTI_CLAIM_DEPLOYMENT_ID]).toBe('dep-9')
    expect(claims[LTI_CLAIM_DL_DATA]).toBe('opaque-123')

    const items = claims[LTI_CLAIM_DL_CONTENT_ITEMS] as ContentItem[]
    expect(items).toHaveLength(1)
    expect(items[0]?.url).toBe(ITEM.url)
    expect(items[0]?.lineItem?.scoreMaximum).toBe(2)
    expect(items[0]?.custom?.simulation_id).toBe('sim-123')
  })

  it('omits the data claim when the request had no data', async () => {
    const { jwt } = await signDeepLinkResponse(keys, {
      platform: PLATFORM,
      settings: { returnUrl: RETURN_URL },
      contentItems: [ITEM],
    })
    const published = await buildJwks(keys)
    const claims = await verifyLtiJwt(jwt, {
      keySet: localKeySet(published),
      issuer: PLATFORM.clientId,
      audience: PLATFORM.issuer,
    })
    expect(claims[LTI_CLAIM_DL_DATA]).toBeUndefined()
  })

  it('rejects an empty content-item list', async () => {
    await expect(
      signDeepLinkResponse(keys, { platform: PLATFORM, settings: { returnUrl: RETURN_URL }, contentItems: [] }),
    ).rejects.toThrow(/at least one content item/)
  })

  it('rejects a content item without a url', async () => {
    await expect(
      signDeepLinkResponse(keys, {
        platform: PLATFORM,
        settings: { returnUrl: RETURN_URL },
        contentItems: [{ type: 'ltiResourceLink', title: 'x', url: '' }],
      }),
    ).rejects.toThrow(/requires a url/)
  })

  it('rejects a lineItem with a non-positive scoreMaximum', async () => {
    await expect(
      signDeepLinkResponse(keys, {
        platform: PLATFORM,
        settings: { returnUrl: RETURN_URL },
        contentItems: [
          { type: 'ltiResourceLink', title: 'x', url: 'https://t/x', lineItem: { scoreMaximum: 0 } },
        ],
      }),
    ).rejects.toThrow(/scoreMaximum/)
  })
})

describe('deepLinkForm', () => {
  it('builds an auto-submitting form pointing at the return URL with the JWT', () => {
    const html = deepLinkForm({ jwt: 'header.body.sig', returnUrl: RETURN_URL })
    expect(html).toContain(`action="${RETURN_URL}"`)
    expect(html).toContain('name="JWT"')
    expect(html).toContain('value="header.body.sig"')
    expect(html).toContain('.submit()')
  })

  it('HTML-escapes the values (no attribute breakout)', () => {
    const html = deepLinkForm({
      jwt: 'a"b<c',
      returnUrl: 'https://lms.example/return?x="1"&y=<2>',
    })
    expect(html).toContain('value="a&quot;b&lt;c"')
    expect(html).toContain('&quot;1&quot;')
    expect(html).not.toContain('value="a"b<c"')
  })
})

describe('createLti().deepLinking', () => {
  it('signResponse round-trips through jwks and form embeds the jwt', async () => {
    const lti = createLti({
      keys,
      platforms: { find: () => Promise.resolve(PLATFORM) },
      nonces: { create: () => Promise.resolve(), consume: () => Promise.resolve(null) },
    })

    const resp = await lti.deepLinking.signResponse({
      platform: PLATFORM,
      settings: { returnUrl: RETURN_URL, data: 'd' },
      contentItems: [ITEM],
    })
    const claims = await verifyLtiJwt(resp.jwt, {
      keySet: localKeySet(await lti.jwks()),
      issuer: PLATFORM.clientId,
      audience: PLATFORM.issuer,
    })
    expect(claims[LTI_CLAIM_MESSAGE_TYPE]).toBe(MSG_DEEP_LINK_RESP)

    const html = lti.deepLinking.form(resp)
    expect(html).toContain(resp.jwt.replace(/&/g, '&amp;'))
    expect(html).toContain(`action="${RETURN_URL}"`)
  })
})
