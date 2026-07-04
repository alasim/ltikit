---
title: Introduction
description: Why ltikit exists and what it does.
---

**ltikit** is a runtime-, storage-, and framework-agnostic LTI 1.3 (LTI Advantage) toolkit for
JavaScript/TypeScript. It verifies LTI launches and talks to LTI services (grades, deep linking, roster)
with a **stateless core** — only `jose` + `fetch` — and pluggable adapters for everything stateful.

## Why not ltijs?

The de-facto library, `ltijs`, assumes a long-running **Express** server, **MongoDB**, and in-process
session state. That doesn't fit modern deployment targets:

- **Serverless / edge** — Vercel functions, AWS Lambda, Cloudflare Workers, Next.js route handlers: no
  persistent process, no in-memory cache, cold starts.
- **Bring-your-own database** — teams already run Postgres/Supabase/Redis and don't want a second datastore.
- **Framework freedom** — Next.js, Hono, Remix, SvelteKit, plain Workers.

ltikit is the opposite by construction: a stateless core with all state pushed behind small adapter
interfaces, plus thin per-framework bindings. It runs anywhere JS runs, including the edge.

## What it is not

- Not an auth/session system. ltikit verifies the launch and hands you **verified claims**; creating your
  app's user and session is your job (see [Auth integration](/ltikit/guides/auth-integration/)).
- Not tied to any database, ORM, cache, or web framework.
- Not an LTI 1.1 / Basic Outcomes library. LTI 1.3 / Advantage only.

## Packages

| Package | Purpose |
|---|---|
| `@ltikit/core` | The stateless core: JWT verify/sign, OIDC login, launch, AGS, deep linking, identity. |
| `@ltikit/next` | Next.js App Router bindings (Web-standard `Request`/`Response`) + iframe helpers. |
| `@ltikit/adapter-supabase` | `PlatformStore` + `NonceStore` on Supabase/Postgres. |
| `@ltikit/adapter-memory` | In-memory adapters for dev/tests. |

It is extracted from a production integration verified against **Canvas** and **MoodleCloud** (hosted and
self-hosted) for SSO, deep linking, and grade passback.
