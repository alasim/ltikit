import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPair, exportPKCS8, exportJWK, decodeJwt, decodeProtectedHeader } from 'jose'
import type { JWK } from 'jose'
import {
  getToken,
  scoresUrl,
  postScore,
  publishScore,
  createLti,
  staticKeyStore,
  AgsError,
  AGS_SCOPE_SCORE,
  AGS_SCOPE_LINEITEM,
  AGS_MEDIA_SCORE,
} from './index'
import type { AgsDeps, Platform } from './index'

const KID = 'ltikit-ags-1'

const PLATFORM: Platform = {
  id: 'p1',
  issuer: 'https://canvas.instructure.com',
  clientId: 'client-1',
  authEndpoint: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  tokenEndpoint: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
  deploymentId: 'd1',
}

// Canvas line item URLs carry a query string — the gotcha scoresUrl must survive.
const CANVAS_LINE_ITEM = 'https://courses.relay.edu/api/lti/courses/1/line_items/17?type_id=2'
const CANVAS_LINE_ITEMS = 'https://courses.relay.edu/api/lti/courses/1/line_items?type_id=2'

let deps: AgsDeps

interface Call {
  url: string
  method: string
  headers: Headers
  body?: string
}
let calls: Call[]

/** Queue of responders, matched by URL substring, consumed in order per URL. */
type Responder = (call: Call) => Response
let routes: Array<{ match: (url: string) => boolean; respond: Responder }>

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const pem = await exportPKCS8(pair.privateKey)
  const publicJwk: JWK = await exportJWK(pair.publicKey)
  deps = { keys: staticKeyStore({ privateKeyPem: pem, kid: KID, publicJwk }) }
})

beforeEach(() => {
  calls = []
  routes = []
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const body =
      init?.body === undefined
        ? undefined
        : typeof init.body === 'string'
          ? init.body
          : String(init.body)
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body,
    }
    calls.push(call)
    const route = routes.find((r) => r.match(url))
    if (!route) throw new Error(`no mock route for ${url}`)
    return route.respond(call)
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

function tokenRoute(token = 'tok-abc') {
  routes.push({
    match: (u) => u === PLATFORM.tokenEndpoint,
    respond: () => json({ access_token: token, token_type: 'Bearer' }),
  })
}

describe('getToken', () => {
  it('signs a correct client assertion and posts a client_credentials grant', async () => {
    tokenRoute('tok-xyz')
    const { token, tokenType } = await getToken(deps, PLATFORM, [AGS_SCOPE_SCORE, AGS_SCOPE_LINEITEM])

    expect(token).toBe('tok-xyz')
    expect(tokenType).toBe('Bearer')

    const call = calls[0]!
    expect(call.url).toBe(PLATFORM.tokenEndpoint)
    expect(call.method).toBe('POST')
    expect(call.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded')

    const form = new URLSearchParams(call.body)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    )
    // Scopes are space-joined.
    expect(form.get('scope')).toBe(`${AGS_SCOPE_SCORE} ${AGS_SCOPE_LINEITEM}`)

    const assertion = form.get('client_assertion')!
    const header = decodeProtectedHeader(assertion)
    expect(header.alg).toBe('RS256')
    expect(header.kid).toBe(KID)

    const claims = decodeJwt(assertion)
    // iss = sub = clientId; aud = tokenEndpoint (NOT the issuer).
    expect(claims.iss).toBe(PLATFORM.clientId)
    expect(claims.sub).toBe(PLATFORM.clientId)
    expect(claims.aud).toBe(PLATFORM.tokenEndpoint)
    expect(claims.jti).toBeTruthy()
    expect(claims.exp).toBeTruthy()
  })

  it('throws AgsError on a non-2xx token response', async () => {
    routes.push({
      match: (u) => u === PLATFORM.tokenEndpoint,
      respond: () => new Response('nope', { status: 401 }),
    })
    await expect(getToken(deps, PLATFORM, [AGS_SCOPE_SCORE])).rejects.toBeInstanceOf(AgsError)
  })

  it('throws AgsError when the token response has no access_token', async () => {
    routes.push({
      match: (u) => u === PLATFORM.tokenEndpoint,
      respond: () => json({ token_type: 'Bearer' }),
    })
    await expect(getToken(deps, PLATFORM, [AGS_SCOPE_SCORE])).rejects.toBeInstanceOf(AgsError)
  })
})

describe('scoresUrl', () => {
  it('appends /scores when there is no query string', () => {
    expect(scoresUrl('https://lms.example/line_items/5')).toBe(
      'https://lms.example/line_items/5/scores',
    )
  })

  it('inserts /scores into the PATH before a Canvas query string', () => {
    expect(scoresUrl(CANVAS_LINE_ITEM)).toBe(
      'https://courses.relay.edu/api/lti/courses/1/line_items/17/scores?type_id=2',
    )
  })
})

describe('postScore', () => {
  it('POSTs a FullyGraded score to the scores URL with the score media type', async () => {
    routes.push({ match: (u) => u.includes('/scores'), respond: () => new Response(null, { status: 200 }) })

    await postScore(deps, CANVAS_LINE_ITEM, 'bearer-1', {
      userId: 'lms-user-9',
      scoreGiven: 2,
      scoreMaximum: 2,
    })

    const call = calls[0]!
    expect(call.url).toBe(
      'https://courses.relay.edu/api/lti/courses/1/line_items/17/scores?type_id=2',
    )
    expect(call.method).toBe('POST')
    expect(call.headers.get('Authorization')).toBe('Bearer bearer-1')
    expect(call.headers.get('Content-Type')).toBe(AGS_MEDIA_SCORE)

    const payload = JSON.parse(call.body!)
    expect(payload.userId).toBe('lms-user-9')
    expect(payload.scoreGiven).toBe(2)
    expect(payload.scoreMaximum).toBe(2)
    expect(payload.activityProgress).toBe('Completed')
    expect(payload.gradingProgress).toBe('FullyGraded')
    expect(typeof payload.timestamp).toBe('string')
  })

  it('throws AgsError on a non-2xx score POST', async () => {
    routes.push({ match: (u) => u.includes('/scores'), respond: () => new Response('bad', { status: 422 }) })
    await expect(
      postScore(deps, CANVAS_LINE_ITEM, 'b', { userId: 'u', scoreGiven: 1, scoreMaximum: 2 }),
    ).rejects.toBeInstanceOf(AgsError)
  })
})

describe('publishScore', () => {
  it('with an explicit lineItemUrl: mints a score token then posts', async () => {
    tokenRoute('tok-score')
    routes.push({ match: (u) => u.includes('/scores'), respond: () => new Response(null, { status: 200 }) })

    await publishScore(deps, {
      platform: PLATFORM,
      lineItemUrl: CANVAS_LINE_ITEM,
      userId: 'lms-user-1',
      scoreGiven: 2,
      scoreMaximum: 2,
    })

    // Token request first, then the score POST.
    expect(calls[0]!.url).toBe(PLATFORM.tokenEndpoint)
    const tokenForm = new URLSearchParams(calls[0]!.body)
    expect(tokenForm.get('scope')).toBe(AGS_SCOPE_SCORE)

    const scoreCall = calls[1]!
    expect(scoreCall.url).toContain('/line_items/17/scores?type_id=2')
    expect(scoreCall.headers.get('Authorization')).toBe('Bearer tok-score')
  })

  it('lazily creates a line item from the container when none exists, then scores it', async () => {
    tokenRoute('tok-li')
    // List returns empty → triggers create.
    routes.push({
      match: (u) => u.startsWith('https://courses.relay.edu/api/lti/courses/1/line_items') && u.includes('resource_link_id'),
      respond: () => json([]),
    })
    // Create returns a new line item with an id.
    routes.push({
      match: (u) => u === CANVAS_LINE_ITEMS,
      respond: () => json({ id: 'https://courses.relay.edu/api/lti/courses/1/line_items/99?type_id=2', scoreMaximum: 2, label: 'x' }),
    })
    routes.push({ match: (u) => u.includes('/scores'), respond: () => new Response(null, { status: 200 }) })

    await publishScore(deps, {
      platform: PLATFORM,
      lineItemsUrl: CANVAS_LINE_ITEMS,
      resourceLinkId: 'rl-7',
      userId: 'lms-user-1',
      scoreGiven: 1,
      scoreMaximum: 2,
      autoCreateLabel: 'Sim 1',
    })

    // Token requested with score + lineitem scope.
    const tokenForm = new URLSearchParams(calls[0]!.body)
    expect(tokenForm.get('scope')).toBe(`${AGS_SCOPE_SCORE} ${AGS_SCOPE_LINEITEM}`)
    // A create POST happened to the container.
    const createCall = calls.find((c) => c.url === CANVAS_LINE_ITEMS && c.method === 'POST')!
    expect(createCall).toBeTruthy()
    expect(JSON.parse(createCall.body!).resourceLinkId).toBe('rl-7')
    // Score posted to the newly created line item's scores URL.
    const scoreCall = calls.find((c) => c.url.includes('/line_items/99/scores'))!
    expect(scoreCall).toBeTruthy()
  })

  it('reuses an existing line item instead of creating a duplicate', async () => {
    tokenRoute('tok-li')
    routes.push({
      match: (u) => u.includes('line_items') && u.includes('resource_link_id'),
      respond: () => json([{ id: 'https://courses.relay.edu/api/lti/courses/1/line_items/42?type_id=2', scoreMaximum: 2, label: 'existing' }]),
    })
    routes.push({ match: (u) => u.includes('/scores'), respond: () => new Response(null, { status: 200 }) })

    await publishScore(deps, {
      platform: PLATFORM,
      lineItemsUrl: CANVAS_LINE_ITEMS,
      resourceLinkId: 'rl-7',
      userId: 'lms-user-1',
      scoreGiven: 2,
      scoreMaximum: 2,
    })

    // No create POST to the container.
    expect(calls.some((c) => c.url === CANVAS_LINE_ITEMS && c.method === 'POST')).toBe(false)
    expect(calls.some((c) => c.url.includes('/line_items/42/scores'))).toBe(true)
  })

  it('throws AgsError when neither a lineItemUrl nor (lineItemsUrl + resourceLinkId) is given', async () => {
    await expect(
      publishScore(deps, {
        platform: PLATFORM,
        userId: 'u',
        scoreGiven: 1,
        scoreMaximum: 2,
      }),
    ).rejects.toBeInstanceOf(AgsError)
  })
})

describe('createLti().ags', () => {
  it('score.submit mints a score-scope token and posts', async () => {
    tokenRoute('tok-1')
    routes.push({ match: (u) => u.includes('/scores'), respond: () => new Response(null, { status: 200 }) })

    const lti = createLti({
      keys: deps.keys,
      platforms: { find: () => Promise.resolve(PLATFORM) },
      nonces: { create: () => Promise.resolve(), consume: () => Promise.resolve(null) },
    })

    await lti.ags.score.submit(PLATFORM, CANVAS_LINE_ITEM, {
      userId: 'lms-user-1',
      scoreGiven: 2,
      scoreMaximum: 2,
    })

    expect(new URLSearchParams(calls[0]!.body).get('scope')).toBe(AGS_SCOPE_SCORE)
    expect(calls[1]!.url).toContain('/line_items/17/scores?type_id=2')
  })
})
