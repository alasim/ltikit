---
title: Running in an iframe
description: CSP and cookies for a tool embedded in the LMS.
---

LTI tools render inside the LMS in an iframe. Two things must be right or the tool shows a blank
"refused to connect" box or a user who looks logged out.

## 1. Allow the LMS to frame you (CSP)

Send a `Content-Security-Policy` with `frame-ancestors` listing every LMS origin that embeds you. Missing an
origin → the browser blocks the frame.

```ts
import { cspFrameAncestors } from '@ltikit/next'

// e.g. "frame-ancestors 'self' https://canvas.instructure.com https://your.moodlecloud.com"
const csp = cspFrameAncestors([
  'https://canvas.instructure.com',
  'https://your.moodlecloud.com',
])
```

In Next.js, set it in `next.config` `headers()` (values are scheme + host, **no trailing slash**). Do **not**
send `X-Frame-Options` — it can't express an allowlist and will block framing.

## 2. Make cookies survive the cross-site iframe

Session and any LTI cookies must be `SameSite=None; Secure` (so HTTPS is mandatory). Use the helpers:

```ts
import { sameSiteNoneCookie, sessionRedirect } from '@ltikit/next'

sameSiteNoneCookie('session', value, { maxAgeSec: 3600, partitioned: true })

sessionRedirect({ to: '/home', cookies: [{ name: 'session', value, partitioned: true }] })
```

`partitioned: true` emits `; Partitioned` (CHIPS) to future-proof against third-party-cookie deprecation.

## 3. Auto-resize the iframe (optional)

```ts
import { frameResizeScript } from '@ltikit/next'
// inline in a <script> — posts document height to the LMS parent (Canvas/Moodle listen for lti.frameResize)
```

Prefer a concrete `targetOrigin` over the default `'*'` when you know the LMS origin, and allow the inline
script in your CSP.
