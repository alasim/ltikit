---
title: Deep linking
description: Let instructors select content that the LMS places (and grades).
---

Deep Linking lets an instructor pick content in your UI; the LMS then places it as an activity. ltikit signs
the response; the picker UI is yours (content is app-specific).

## Flow

1. The LMS launches with `message_type = LtiDeepLinkingRequest`. `launch()` returns
   `result.deepLinking = { returnUrl, acceptTypes, data? }`.
2. Show your picker, carrying the `deepLinking` context (e.g. in a short-lived cookie).
3. On selection, sign a response and auto-submit it back to the LMS.

```ts
import { lti } from '@/lib/lti'
import { htmlResponse } from '@ltikit/next'

const response = await lti.deepLinking.signResponse({
  platform,                       // from the launch (persist it through the picker)
  settings: { returnUrl, data },  // from result.deepLinking
  contentItems: [
    {
      type: 'ltiResourceLink',
      title: 'Classroom Sim 1',
      url: `${process.env.APP_URL}/api/lti/login`, // OIDC entry; message type differs at launch
      custom: { simulation_id: 'sim-101' },
      // Declare a lineItem so the LMS provisions the gradebook column up front.
      lineItem: { scoreMaximum: 2, label: 'Classroom Sim 1' },
    },
  ],
})

return htmlResponse(lti.deepLinking.form(response)) // auto-submitting form → posts JWT to the LMS
```

## Why declare `lineItem`

With `lineItem` on the content item, the LMS creates the gradebook column at placement time, and the later
resource-link launch carries `endpoint.lineitem` — ready for [grade passback](/ltikit/guides/grade-passback/)
with no extra round trip.

## Picker UI

Core ships no picker (content is app-specific). Build your own screen that POSTs the chosen item to your
deep-link route. See `examples/next-demo` for a reference picker.
