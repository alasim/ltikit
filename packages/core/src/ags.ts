/**
 * AGS — Assignment & Grade Services (LTI Advantage grade passback).
 *
 * Mechanics are ported verbatim from a production integration (TeachSim) that
 * posts grades to Canvas + Moodle, then adapted to the stateless core: no DB,
 * no env — the tool keypair comes from a `KeyStore`, everything else is passed
 * in. The hard-won cross-LMS gotchas are baked in and unit-tested:
 *
 *   - Assertion `aud` = the platform token endpoint, NOT the issuer.
 *   - `/scores` is inserted into the line-item PATH, before any query string
 *     (Canvas line items carry `?type_id=N`).
 *   - `gradingProgress: 'FullyGraded'` or the platform stores but never surfaces
 *     the grade.
 *   - Request exactly the scope you need; scopes are space-joined.
 *
 * No key material or signed token is ever logged.
 */
import { signJwt } from './jwt'
import type { KeyStore } from './keys'
import type { Platform } from './types'
import { AgsError } from './errors'
import {
  AGS_MEDIA_LINEITEM,
  AGS_MEDIA_LINEITEM_CONTAINER,
  AGS_MEDIA_RESULT_CONTAINER,
  AGS_MEDIA_SCORE,
  AGS_SCOPE_LINEITEM,
  AGS_SCOPE_SCORE,
  OAUTH_CLIENT_ASSERTION_TYPE,
  OAUTH_GRANT_CLIENT_CREDENTIALS,
} from './constants'

/** Every AGS call is to an external LMS; cap each so a hang can't stall the caller. */
const DEFAULT_TIMEOUT_MS = 10_000

export interface AgsDeps {
  keys: KeyStore
  /** Per-request timeout in ms (default 10000). */
  fetchTimeoutMs?: number
}

/** A score to publish to a line item (AGS Score Publish service). */
export interface Score {
  /** The `sub` of the launch id_token — the LMS user to grade. */
  userId: string
  scoreGiven: number
  scoreMaximum: number
  /** Default `'Completed'`. */
  activityProgress?: string
  /** Default `'FullyGraded'` — required for the grade to surface. */
  gradingProgress?: string
  comment?: string
  /** Default: now (ISO-8601). */
  timestamp?: string
}

/** A gradebook column (AGS Line Item). */
export interface LineItem {
  id?: string
  scoreMaximum: number
  label: string
  resourceLinkId?: string
  resourceId?: string
  tag?: string
  startDateTime?: string
  endDateTime?: string
}

/** A stored result row (AGS Result service). */
export interface Result {
  id?: string
  userId: string
  resultScore?: number
  resultMaximum?: number
  comment?: string
  scoreOf?: string
}

/** Line-item container query filter. */
export interface LineItemFilter {
  resourceLinkId?: string
  resourceId?: string
  tag?: string
}

function timeout(deps: AgsDeps): number {
  return deps.fetchTimeoutMs ?? DEFAULT_TIMEOUT_MS
}

async function ensureOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res
  const text = await res.text().catch(() => '')
  throw new AgsError(`${what} failed: ${res.status} ${text.slice(0, 200)}`, { status: res.status })
}

/**
 * OAuth2 client_credentials token, authenticated by a signed JWT client
 * assertion (`iss = sub = clientId`, `aud = tokenEndpoint`, short exp, unique
 * jti, header `kid`). Returns the bearer token + its type.
 */
export async function getToken(
  deps: AgsDeps,
  platform: Platform,
  scopes: string[],
): Promise<{ token: string; tokenType: string }> {
  const privateKey = await deps.keys.privateKey()
  const kid = await deps.keys.kid()

  const assertion = await signJwt(
    { sub: platform.clientId },
    {
      privateKey,
      kid,
      issuer: platform.clientId,
      audience: platform.tokenEndpoint,
      expiresIn: '1m',
    },
  )

  const body = new URLSearchParams({
    grant_type: OAUTH_GRANT_CLIENT_CREDENTIALS,
    client_assertion_type: OAUTH_CLIENT_ASSERTION_TYPE,
    client_assertion: assertion,
    scope: scopes.join(' '),
  })

  const res = await ensureOk(
    await fetch(platform.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(timeout(deps)),
    }),
    'AGS token request',
  )

  const json = (await res.json()) as { access_token?: string; token_type?: string }
  if (!json.access_token) throw new AgsError('AGS token response missing access_token')
  return { token: json.access_token, tokenType: json.token_type ?? 'Bearer' }
}

/**
 * Build the Scores service URL by inserting `/scores` into the line-item PATH,
 * before any query string. Naive `${url}/scores` breaks on Canvas line items
 * that carry `?type_id=N` (the segment lands inside the query and 404s).
 */
export function scoresUrl(lineItemUrl: string): string {
  const q = lineItemUrl.indexOf('?')
  if (q === -1) return `${lineItemUrl}/scores`
  return `${lineItemUrl.slice(0, q)}/scores${lineItemUrl.slice(q)}`
}

/** Publish a score to a line item. `bearer` must carry the score scope. */
export async function postScore(
  deps: AgsDeps,
  lineItemUrl: string,
  bearer: string,
  score: Score,
): Promise<void> {
  const payload = {
    userId: score.userId,
    scoreGiven: score.scoreGiven,
    scoreMaximum: score.scoreMaximum,
    activityProgress: score.activityProgress ?? 'Completed',
    gradingProgress: score.gradingProgress ?? 'FullyGraded',
    timestamp: score.timestamp ?? new Date().toISOString(),
    ...(score.comment ? { comment: score.comment } : {}),
  }

  await ensureOk(
    await fetch(scoresUrl(lineItemUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': AGS_MEDIA_SCORE },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout(deps)),
    }),
    'AGS score POST',
  )
}

/** List line items in a container, optionally filtered. `bearer` needs a lineitem scope. */
export async function listLineItems(
  deps: AgsDeps,
  lineItemsUrl: string,
  bearer: string,
  filter?: LineItemFilter,
): Promise<LineItem[]> {
  const url = new URL(lineItemsUrl)
  if (filter?.resourceLinkId) url.searchParams.set('resource_link_id', filter.resourceLinkId)
  if (filter?.resourceId) url.searchParams.set('resource_id', filter.resourceId)
  if (filter?.tag) url.searchParams.set('tag', filter.tag)

  const res = await ensureOk(
    await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearer}`, Accept: AGS_MEDIA_LINEITEM_CONTAINER },
      signal: AbortSignal.timeout(timeout(deps)),
    }),
    'AGS line item list',
  )
  const json = (await res.json().catch(() => [])) as LineItem[]
  return Array.isArray(json) ? json : []
}

/** Create a line item in a container. `bearer` needs the lineitem scope. */
export async function createLineItem(
  deps: AgsDeps,
  lineItemsUrl: string,
  bearer: string,
  lineItem: LineItem,
): Promise<LineItem> {
  const res = await ensureOk(
    await fetch(lineItemsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': AGS_MEDIA_LINEITEM },
      body: JSON.stringify(lineItem),
      signal: AbortSignal.timeout(timeout(deps)),
    }),
    'AGS line item creation',
  )
  const created = (await res.json()) as LineItem
  if (!created.id) throw new AgsError('AGS line item creation response missing id')
  return created
}

/** Read a single line item by its URL. `bearer` needs a lineitem scope. */
export async function getLineItem(
  deps: AgsDeps,
  lineItemUrl: string,
  bearer: string,
): Promise<LineItem> {
  const res = await ensureOk(
    await fetch(lineItemUrl, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: AGS_MEDIA_LINEITEM },
      signal: AbortSignal.timeout(timeout(deps)),
    }),
    'AGS line item read',
  )
  return (await res.json()) as LineItem
}

/** List results for a line item. `bearer` needs the result.readonly scope. */
export async function listResults(
  deps: AgsDeps,
  lineItemUrl: string,
  bearer: string,
  filter?: { userId?: string },
): Promise<Result[]> {
  const url = new URL(`${lineItemUrl.replace(/\?.*/, '')}/results`)
  // Preserve any query string from the line-item URL (e.g. Canvas ?type_id=N).
  const q = lineItemUrl.indexOf('?')
  if (q !== -1) {
    new URLSearchParams(lineItemUrl.slice(q + 1)).forEach((v, k) => url.searchParams.set(k, v))
  }
  if (filter?.userId) url.searchParams.set('user_id', filter.userId)

  const res = await ensureOk(
    await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearer}`, Accept: AGS_MEDIA_RESULT_CONTAINER },
      signal: AbortSignal.timeout(timeout(deps)),
    }),
    'AGS result list',
  )
  const json = (await res.json().catch(() => [])) as Result[]
  return Array.isArray(json) ? json : []
}

/**
 * Resolve a line item bound to a resource link, creating one if none exists.
 * Used when the launch carried only the `lineitems` container. `bearer` needs
 * both the lineitem scope (to list/create) — request it before calling.
 */
export async function getOrCreateLineItem(
  deps: AgsDeps,
  lineItemsUrl: string,
  bearer: string,
  resourceLinkId: string,
  label: string,
  scoreMaximum: number,
): Promise<string> {
  const existing = await listLineItems(deps, lineItemsUrl, bearer, { resourceLinkId })
  if (existing[0]?.id) return existing[0].id

  const created = await createLineItem(deps, lineItemsUrl, bearer, {
    scoreMaximum,
    label,
    resourceLinkId,
  })
  // createLineItem already throws if id is missing.
  return created.id as string
}

export interface PublishScoreArgs {
  platform: Platform
  /** A specific line item to score. If absent, resolved from the container. */
  lineItemUrl?: string
  /** Line-item container, used to lazily resolve/create a line item. */
  lineItemsUrl?: string
  /** Required (with `lineItemsUrl`) to resolve a line item lazily. */
  resourceLinkId?: string
  userId: string
  scoreGiven: number
  scoreMaximum: number
  comment?: string
  /** Label for a lazily-created line item (default `'ltikit'`). */
  autoCreateLabel?: string
}

/**
 * High-level grade passback (mirrors TeachSim `runGradePassback`, minus the
 * app/DB concerns). Resolves the line item (scoring an existing one, or lazily
 * creating one from the container), mints exactly the scope it needs, and posts
 * the score. Throws `AgsError` on any service failure.
 */
export async function publishScore(deps: AgsDeps, args: PublishScoreArgs): Promise<void> {
  let lineItemUrl = args.lineItemUrl
  let bearer: string

  if (lineItemUrl) {
    bearer = (await getToken(deps, args.platform, [AGS_SCOPE_SCORE])).token
  } else {
    if (!args.lineItemsUrl || !args.resourceLinkId) {
      throw new AgsError(
        'publishScore needs a lineItemUrl, or both lineItemsUrl and resourceLinkId to resolve one',
      )
    }
    bearer = (await getToken(deps, args.platform, [AGS_SCOPE_SCORE, AGS_SCOPE_LINEITEM])).token
    lineItemUrl = await getOrCreateLineItem(
      deps,
      args.lineItemsUrl,
      bearer,
      args.resourceLinkId,
      args.autoCreateLabel ?? 'ltikit',
      args.scoreMaximum,
    )
  }

  await postScore(deps, lineItemUrl, bearer, {
    userId: args.userId,
    scoreGiven: args.scoreGiven,
    scoreMaximum: args.scoreMaximum,
    comment: args.comment,
  })
}
