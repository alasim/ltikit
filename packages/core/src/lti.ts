/**
 * `createLti` — the single entry point. Bundles the injected adapters with the
 * flow functions so consumers call `lti.oidc.login(...)` / `lti.launch(...)` /
 * `lti.jwks()` without threading dependencies through every call. AGS + deep
 * linking land on this object in later phases.
 */
import type { JSONWebKeySet } from 'jose'
import type { KeyStore, KeySet } from './keys'
import { jwks as buildJwks } from './keys'
import type { NonceStore, PlatformStore } from './adapters'
import type { Platform } from './types'
import { oidcLogin, type OidcLoginParams, type OidcLoginResult } from './oidc'
import { launch as runLaunch, type LaunchInput, type LaunchResult } from './launch'
import * as ags from './ags'
import type { AgsDeps, LineItem, LineItemFilter, PublishScoreArgs, Result, Score } from './ags'
import { signDeepLinkResponse, deepLinkForm } from './deep-linking'
import type { DeepLinkResponse, SignDeepLinkArgs } from './deep-linking'
import {
  AGS_SCOPE_LINEITEM,
  AGS_SCOPE_LINEITEM_READONLY,
  AGS_SCOPE_RESULT_READONLY,
  AGS_SCOPE_SCORE,
} from './constants'

export interface LtiOptions {
  /** Allowed clock skew for exp/iat, in seconds (default 30). */
  clockToleranceSec?: number
  /** Lifetime of an OIDC state/nonce record, in seconds (default 600). */
  nonceTtlSec?: number
  /** Per-request timeout for AGS/NRPS service calls, in ms (default 10000). */
  fetchTimeoutMs?: number
  /** Advanced/test hook: resolve the verification keyset yourself. */
  keySetFor?: (platform: Platform) => KeySet
}

/** AGS (grades) namespace on the `Lti` instance. Each method mints the scope it needs. */
export interface LtiAgs {
  /** Low-level: OAuth2 token via signed client assertion for the given scopes. */
  getToken(platform: Platform, scopes: string[]): Promise<{ token: string; tokenType: string }>
  score: {
    submit(platform: Platform, lineItemUrl: string, score: Score): Promise<void>
  }
  lineItems: {
    list(platform: Platform, lineItemsUrl: string, filter?: LineItemFilter): Promise<LineItem[]>
    create(platform: Platform, lineItemsUrl: string, lineItem: LineItem): Promise<LineItem>
    get(platform: Platform, lineItemUrl: string): Promise<LineItem>
  }
  result: {
    list(platform: Platform, lineItemUrl: string, filter?: { userId?: string }): Promise<Result[]>
  }
  /** High-level: resolve/lazy-create the line item, then post the score. */
  publishScore(args: PublishScoreArgs): Promise<void>
}

export interface LtiConfig {
  keys: KeyStore
  platforms: PlatformStore
  nonces: NonceStore
  options?: LtiOptions
}

/** Deep Linking (content selection) namespace on the `Lti` instance. */
export interface LtiDeepLinking {
  /** Sign an `LtiDeepLinkingResponse` for the selected content items. */
  signResponse(args: SignDeepLinkArgs): Promise<DeepLinkResponse>
  /** Auto-submitting HTML form that POSTs the response JWT back to the platform. */
  form(response: DeepLinkResponse): string
}

export interface Lti {
  oidc: { login(params: OidcLoginParams): Promise<OidcLoginResult> }
  launch(input: LaunchInput): Promise<LaunchResult>
  ags: LtiAgs
  deepLinking: LtiDeepLinking
  /** Serve from your `/jwks` route so the LMS can verify our signed messages. */
  jwks(): Promise<JSONWebKeySet>
}

export function createLti(config: LtiConfig): Lti {
  const clockToleranceSec = config.options?.clockToleranceSec ?? 30
  const nonceTtlSec = config.options?.nonceTtlSec ?? 600
  const agsDeps: AgsDeps = { keys: config.keys, fetchTimeoutMs: config.options?.fetchTimeoutMs }
  const keySetFor = config.options?.keySetFor

  return {
    oidc: {
      login: (params) =>
        oidcLogin({ platforms: config.platforms, nonces: config.nonces, nonceTtlSec }, params),
    },
    launch: (input) =>
      runLaunch(
        { platforms: config.platforms, nonces: config.nonces, clockToleranceSec, keySetFor },
        input,
      ),
    ags: {
      getToken: (platform, scopes) => ags.getToken(agsDeps, platform, scopes),
      score: {
        async submit(platform, lineItemUrl, score) {
          const { token } = await ags.getToken(agsDeps, platform, [AGS_SCOPE_SCORE])
          await ags.postScore(agsDeps, lineItemUrl, token, score)
        },
      },
      lineItems: {
        async list(platform, lineItemsUrl, filter) {
          const { token } = await ags.getToken(agsDeps, platform, [AGS_SCOPE_LINEITEM_READONLY])
          return ags.listLineItems(agsDeps, lineItemsUrl, token, filter)
        },
        async create(platform, lineItemsUrl, lineItem) {
          const { token } = await ags.getToken(agsDeps, platform, [AGS_SCOPE_LINEITEM])
          return ags.createLineItem(agsDeps, lineItemsUrl, token, lineItem)
        },
        async get(platform, lineItemUrl) {
          const { token } = await ags.getToken(agsDeps, platform, [AGS_SCOPE_LINEITEM_READONLY])
          return ags.getLineItem(agsDeps, lineItemUrl, token)
        },
      },
      result: {
        async list(platform, lineItemUrl, filter) {
          const { token } = await ags.getToken(agsDeps, platform, [AGS_SCOPE_RESULT_READONLY])
          return ags.listResults(agsDeps, lineItemUrl, token, filter)
        },
      },
      publishScore: (args) => ags.publishScore(agsDeps, args),
    },
    deepLinking: {
      signResponse: (args) => signDeepLinkResponse(config.keys, args),
      form: (response) => deepLinkForm(response),
    },
    jwks: () => buildJwks(config.keys),
  }
}
