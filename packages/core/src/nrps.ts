/**
 * NRPS — Names & Role Provisioning Services (roster). Fetches the members of a
 * context (course) from the `namesroleservice` endpoint carried on the launch.
 *
 * Uses the same OAuth2 client_credentials token as AGS (a signed client
 * assertion), with the membership scope. Follows RFC 5988 `Link: rel="next"`
 * pagination until the roster is exhausted.
 */
import { getToken, type AgsDeps } from './ags'
import type { Platform } from './types'
import { NrpsError } from './errors'
import { NRPS_MEDIA_MEMBERSHIP, NRPS_SCOPE_MEMBERSHIP } from './constants'

const DEFAULT_TIMEOUT_MS = 10_000

/** Deps for NRPS calls — identical to AGS (tool KeyStore + timeout). */
export type NrpsDeps = AgsDeps

/** A course member (roster entry). */
export interface Member {
  /** LMS user id — matches the launch `sub`. */
  userId: string
  roles: string[]
  status?: string
  name?: string
  givenName?: string
  familyName?: string
  email?: string
  picture?: string
  lisPersonSourcedid?: string
}

export interface MembershipResult {
  contextId?: string
  contextTitle?: string
  members: Member[]
}

export interface GetMembersOptions {
  /** Filter by a role (NRPS `?role=`) — full URN or short form the LMS accepts. */
  role?: string
  /** Page-size hint (NRPS `?limit=`). */
  limit?: number
}

interface RawMember {
  user_id?: string
  roles?: string[]
  status?: string
  name?: string
  given_name?: string
  family_name?: string
  email?: string
  picture?: string
  lis_person_sourcedid?: string
}

function mapMember(m: RawMember): Member {
  return {
    userId: m.user_id ?? '',
    roles: m.roles ?? [],
    status: m.status,
    name: m.name,
    givenName: m.given_name,
    familyName: m.family_name,
    email: m.email,
    picture: m.picture,
    lisPersonSourcedid: m.lis_person_sourcedid,
  }
}

/** Extract the `rel="next"` URL from a `Link` header, if present. */
function parseNextLink(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/)
    if (m?.[1]) return m[1]
  }
  return null
}

function withQuery(base: string, opts?: GetMembersOptions): string {
  if (!opts?.role && !opts?.limit) return base
  const url = new URL(base)
  if (opts.role) url.searchParams.set('role', opts.role)
  if (opts.limit) url.searchParams.set('limit', String(opts.limit))
  return url.toString()
}

/**
 * Fetch all members of a context, following pagination. `membershipsUrl` is the
 * `context_memberships_url` from the launch's NRPS claim.
 */
export async function getMembers(
  deps: NrpsDeps,
  platform: Platform,
  membershipsUrl: string,
  opts?: GetMembersOptions,
): Promise<MembershipResult> {
  const { token } = await getToken(deps, platform, [NRPS_SCOPE_MEMBERSHIP])
  const timeout = deps.fetchTimeoutMs ?? DEFAULT_TIMEOUT_MS

  const members: Member[] = []
  let contextId: string | undefined
  let contextTitle: string | undefined
  let next: string | null = withQuery(membershipsUrl, opts)

  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${token}`, Accept: NRPS_MEDIA_MEMBERSHIP },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new NrpsError(`NRPS membership fetch failed: ${res.status} ${text.slice(0, 200)}`, {
        status: res.status,
      })
    }
    const json = (await res.json()) as {
      context?: { id?: string; title?: string }
      members?: RawMember[]
    }
    if (json.context) {
      contextId ??= json.context.id
      contextTitle ??= json.context.title
    }
    for (const m of json.members ?? []) members.push(mapMember(m))
    next = parseNextLink(res.headers.get('link'))
  }

  return { contextId, contextTitle, members }
}
