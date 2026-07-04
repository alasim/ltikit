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

## Baked-in gotchas

ltikit encodes the cross-LMS AGS pitfalls so you don't rediscover them:

- **`/scores` goes in the path before the query string** (Canvas line items carry `?type_id=N`).
- **Assertion `aud` = the token endpoint**, not the issuer.
- **`gradingProgress: 'FullyGraded'`** or the grade is stored but never surfaced.
- **Request exactly the scope you need** (score / lineitem), space-joined.

## Moodle: grades only post for students

Moodle returns an empty `400 []` if the user you're grading isn't an enrolled, gradable **student**. Test by
launching as a student, not the admin/teacher who installed the tool.
