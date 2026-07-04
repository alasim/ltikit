---
title: Roster (NRPS)
description: Fetch a course roster with Names & Role Provisioning Services.
---

NRPS returns the members of a context (course). The endpoint comes on the launch as the
`namesroleservice` claim, surfaced as `result.nrps.contextMembershipsUrl`.

## Fetch members

```ts
import { lti } from '@/lib/lti'

const { members, contextId, contextTitle } = await lti.nrps.getMembers(
  platform,
  contextMembershipsUrl, // result.nrps.contextMembershipsUrl from the launch
  { role: 'Learner' },   // optional: filter; { limit } is also supported
)

for (const m of members) {
  m.userId       // matches the launch `sub`
  m.roles        // string[]
  m.name         // may be absent depending on LMS privacy settings
  m.email
}
```

- Uses the same signed client-credentials token as AGS, with the membership scope.
- **Pagination is automatic** — `getMembers` follows `Link: rel="next"` until the roster is exhausted.
- Fields are normalized to camelCase (`user_id` → `userId`, `given_name` → `givenName`, …).
- Throws `NrpsError` (with the HTTP `status`) on a non-2xx response.

## Privacy

What the LMS returns depends on its privacy settings and the roles/consent configured for your tool. Names
and emails may be omitted; `userId` (the `sub`) is always the stable key.
