---
title: LMS registration
description: Register the tool in Moodle / Canvas and map URLs to fields.
---

Your tool's public base URL (`APP_URL`) drives every endpoint. It **must be HTTPS and publicly reachable
without auth**, so the LMS can fetch your JWKS and post launches server-to-server.

| Tool endpoint | Path |
|---|---|
| OIDC login (initiation) | `/api/lti/login` |
| Launch / redirect target | `/api/lti/launch` |
| Deep-link (content selection) | `/api/lti/launch` |
| Public JWKS | `/.well-known/jwks.json` |

The same `/api/lti/launch` handles resource-link **and** deep-link launches (it branches on `message_type`),
so the launch URL, redirect URI, and content-selection URL are all `/api/lti/launch`.

## Moodle (LTI 1.3)

_Site administration → Plugins → Activity modules → External tool → Manage tools → configure manually._

| Moodle field | Value |
|---|---|
| Tool URL | `APP_URL`/api/lti/launch |
| LTI version | LTI 1.3 |
| Public key type | Keyset URL |
| Public keyset | `APP_URL`/.well-known/jwks.json |
| Initiate login URL | `APP_URL`/api/lti/login |
| Redirection URI(s) | `APP_URL`/api/lti/launch |
| Supports Deep Linking | enabled |
| Content Selection URL | `APP_URL`/api/lti/launch |
| IMS AGS | Use this service for grade sync and column management |

Then open the tool → **View configuration details** and copy the values into a `lti_platforms` row:

| `lti_platforms` column | Moodle field |
|---|---|
| `issuer` | Platform ID (your Moodle base URL) |
| `client_id` | Client ID |
| `auth_endpoint` | Authentication request URL |
| `token_endpoint` | Access token URL |
| `keyset_url` | Public keyset URL |
| `deployment_id` | Deployment ID (appears after activation; must match) |

## Canvas

Same mapping, different field names: **Redirect URIs** = `/api/lti/launch`, **OpenID Connect Initiation Url**
= `/api/lti/login`, **JWK Method = Public JWK URL** = `/.well-known/jwks.json`, **Target Link URI** =
`/api/lti/launch`. Canvas issuer is `https://canvas.instructure.com` (hosted **and** most self-hosted).
