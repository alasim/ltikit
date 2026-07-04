---
title: Gotchas
description: Field-verified cross-LMS pitfalls, baked into LTIkit or called out here.
---

Hard-won fixes from real Canvas + Moodle integrations. Most are handled for you; the rest are things only
you can set.

## AGS / grades

- **`/scores` before the query string.** Canvas line items carry `?type_id=N`; `/scores` must go in the path
  (`…/lineitem/scores?type_id=N`). Handled by `scoresUrl`.
- **Assertion `aud` = the token endpoint**, not the issuer. Handled by `getToken`.
- **`gradingProgress: 'FullyGraded'`** or the grade is stored but never surfaced. Handled by `postScore`.
- **Moodle returns `400 []` for non-students.** A grade only posts for an enrolled, gradable student — not
  the admin/teacher who installed the tool. Test as a student.
- **Request the exact scope** (score / lineitem), space-joined.

## Launch / identity

- **Canvas issuer is `https://canvas.instructure.com`** for hosted **and** most self-hosted (not the web URL).
- **No-email users** (Canvas Test Student, privacy) — identify by `sub`, not email.
- **`deployment_id` must match** the registered platform, or the launch fails validation.

## Supabase adapter

- **`service_role` needs a table GRANT.** RLS bypass ≠ table access; without the grant you get
  `permission denied` (42501) that looks like "platform not found". The shipped schema includes the grant.
- **Local Supabase CLI generates its own keys.** Don't assume the well-known demo key — read the actual
  `service_role` key from `supabase status`.

## Iframe

- **CSP `frame-ancestors` must list every LMS origin** that embeds you (`cspFrameAncestors`), or the browser
  blocks the frame. Scheme + host, no trailing slash.
- **Cookies need `SameSite=None; Secure`** to survive the cross-site iframe (`sameSiteNoneCookie` /
  `sessionRedirect`); add `Partitioned` (CHIPS) as third-party cookies are deprecated.
- **Public tunnel/host.** The LMS fetches your JWKS and posts launches server-to-server — the host must be
  reachable without auth.
