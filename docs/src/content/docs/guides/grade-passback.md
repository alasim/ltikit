---
title: Grade passback (AGS)
description: Post a score back to the LMS gradebook.
---

AGS (Assignment & Grade Services) posts a score to the gradebook. The high-level `publishScore` resolves the
line item (or lazily creates one), mints the right token, and posts a `FullyGraded` score.

## Capture AGS context at launch

A resource-link launch carries the AGS endpoint. Stash what you need when the student launches:

```ts
export const POST = launch(lti, async (result) => {
  const ags = result.ags // { scopes, lineItem?, lineItems? }
  // persist { platform: result.platform, lineItemUrl: ags?.lineItem, lineItemsUrl: ags?.lineItems,
  //           resourceLinkId: result.resourceLink?.id, userId: result.claims.sub } for later
  ...
})
```

## Post the score

```ts
await lti.ags.publishScore({
  platform,
  lineItemUrl,            // preferred (from the launch); or:
  lineItemsUrl,           // container — publishScore will find/create a line item
  resourceLinkId,         // required with lineItemsUrl
  userId,                 // the launch `sub`
  scoreGiven: 2,
  scoreMaximum: 2,
  comment: 'Nice work',   // optional
})
```

Lower-level pieces are also available: `lti.ags.getToken`, `lti.ags.score.submit`,
`lti.ags.lineItems.{list,create,get}`, `lti.ags.result.list`.

## Canvas: attach a review link (SpeedGrader)

Canvas has a vendor-only AGS extension that turns a posted score into a clickable submission in
SpeedGrader's central pane — useful for "faculty review the student's work without leaving Canvas."
Pass `canvasSubmission` alongside the score:

```ts
await lti.ags.publishScore({
  platform, lineItemUrl, userId,
  scoreGiven: 2, scoreMaximum: 2,
  canvasSubmission: {
    type: 'basic_lti_launch',       // opens `url` as an LTI launch inside SpeedGrader; or 'online_url'
    url: reviewUrl,                 // your own route — see capability links below
  },
})
```

Ignored by non-Canvas platforms — safe to always pass it if you only care about Canvas. Not part of
the IMS AGS spec; see [Canvas's Score extension docs](https://canvas.instructure.com/doc/api/score.html).

**Building `reviewUrl` without a real session:** SpeedGrader opens that link with no logged-in
faculty user. `signCapabilityLink(keys, payload)` / `verifyCapabilityLink(keys, token)` mint and
verify a short-lived token using the tool's own keypair — no LMS round-trip, no DB row, self-issued
and self-verified:

```ts
// at grade-passback time
const token = await signCapabilityLink(keys, { sessionId }, { expiresIn: '30d' })
const reviewUrl = `${APP_URL}/lti/report/${sessionId}?t=${token}`

// in the review route
const { sessionId } = await verifyCapabilityLink<{ sessionId: string }>(keys, token)
```

Keep the expiry short-lived relative to how long the link needs to stay valid — it's a bearer token,
anyone with the URL can open it.

## Baked-in gotchas

LTIkit encodes the cross-LMS AGS pitfalls so you don't rediscover them:

- **`/scores` goes in the path before the query string** (Canvas line items carry `?type_id=N`).
- **Assertion `aud` = the token endpoint**, not the issuer.
- **`gradingProgress: 'FullyGraded'`** or the grade is stored but never surfaced.
- **Request exactly the scope you need** (score / lineitem), space-joined.

## Moodle: grades only post for students

Moodle returns an empty `400 []` if the user you're grading isn't an enrolled, gradable **student**. Test by
launching as a student, not the admin/teacher who installed the tool.
