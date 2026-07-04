import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  dynamicRegister,
  buildToolRegistration,
  createLti,
  RegistrationError,
  staticKeyStore,
  LTI_TOOL_CONFIGURATION,
  MSG_RESOURCE_LINK,
  MSG_DEEP_LINKING,
} from './index'
import type { MutablePlatformStore, PlatformStore, RegistrationTool, Platform } from './index'

const OPENID_CONFIG_URL = 'https://lms.example/.well-known/openid-configuration?reg=1'
const REGISTRATION_ENDPOINT = 'https://lms.example/lti/register'

const OPENID_CONFIG = {
  issuer: 'https://lms.example',
  authorization_endpoint: 'https://lms.example/auth',
  token_endpoint: 'https://lms.example/token',
  jwks_uri: 'https://lms.example/jwks',
  registration_endpoint: REGISTRATION_ENDPOINT,
}

const TOOL: RegistrationTool = {
  clientName: 'TeachSim',
  jwksUri: 'https://tool.example/jwks',
  initiateLoginUri: 'https://tool.example/login',
  redirectUris: ['https://tool.example/launch'],
  targetLinkUri: 'https://tool.example/launch',
  domain: 'tool.example',
}

interface Call {
  url: string
  method: string
  headers: Headers
  body?: string
}
let calls: Call[]
let routes: Array<{ match: (u: string) => boolean; respond: () => Response }>

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function memoryMutableStore(): MutablePlatformStore {
  const platforms: Platform[] = []
  let seq = 0
  return {
    find(iss, clientId) {
      const match = platforms.find(
        (p) => p.issuer === iss && (clientId == null || p.clientId === clientId),
      )
      return Promise.resolve(match ?? null)
    },
    save(input) {
      const existing = platforms.find((p) => p.issuer === input.issuer && p.clientId === input.clientId)
      if (existing) {
        Object.assign(existing, input)
        return Promise.resolve(existing)
      }
      const p: Platform = { id: `p${++seq}`, ...input }
      platforms.push(p)
      return Promise.resolve(p)
    },
  }
}

beforeEach(() => {
  calls = []
  routes = []
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    const route = routes.find((r) => r.match(url))
    if (!route) throw new Error(`no mock route for ${url}`)
    return route.respond()
  }) as unknown as typeof fetch
})

afterEach(() => vi.restoreAllMocks())

function configRoute() {
  routes.push({ match: (u) => u === OPENID_CONFIG_URL, respond: () => json(OPENID_CONFIG) })
}

describe('buildToolRegistration', () => {
  it('builds the OIDC client-registration body with the LTI tool-config claim', () => {
    const body = buildToolRegistration(TOOL)
    expect(body.application_type).toBe('web')
    expect(body.token_endpoint_auth_method).toBe('private_key_jwt')
    expect(body.jwks_uri).toBe(TOOL.jwksUri)
    expect(body.initiate_login_uri).toBe(TOOL.initiateLoginUri)
    expect(body.redirect_uris).toEqual(TOOL.redirectUris)

    const toolConfig = body[LTI_TOOL_CONFIGURATION] as { messages: Array<{ type: string }> }
    const types = toolConfig.messages.map((m) => m.type)
    expect(types).toContain(MSG_RESOURCE_LINK)
    expect(types).toContain(MSG_DEEP_LINKING)
    // default scopes include AGS score + NRPS membership
    expect(String(body.scope)).toContain('score')
    expect(String(body.scope)).toContain('contextmembership')
  })
})

describe('dynamicRegister', () => {
  it('fetches config, POSTs tool config with the bearer, and persists the platform', async () => {
    configRoute()
    routes.push({
      match: (u) => u === REGISTRATION_ENDPOINT,
      respond: () =>
        json({
          client_id: 'assigned-client-123',
          [LTI_TOOL_CONFIGURATION]: { deployment_id: 'dep-1' },
        }),
    })
    const store = memoryMutableStore()

    const result = await dynamicRegister({ platforms: store }, {
      openidConfiguration: OPENID_CONFIG_URL,
      registrationToken: 'reg-token-xyz',
      tool: TOOL,
    })

    // GET config first, then POST registration
    expect(calls[0]!.method).toBe('GET')
    expect(calls[0]!.url).toBe(OPENID_CONFIG_URL)
    const post = calls[1]!
    expect(post.method).toBe('POST')
    expect(post.url).toBe(REGISTRATION_ENDPOINT)
    expect(post.headers.get('Authorization')).toBe('Bearer reg-token-xyz')
    const sent = JSON.parse(post.body!) as Record<string, unknown>
    expect(sent.client_name).toBe('TeachSim')

    // platform persisted with the assigned client_id + config endpoints
    expect(result.platform.clientId).toBe('assigned-client-123')
    expect(result.platform.issuer).toBe('https://lms.example')
    expect(result.platform.tokenEndpoint).toBe('https://lms.example/token')
    expect(result.platform.keysetUrl).toBe('https://lms.example/jwks')
    expect(result.platform.deploymentId).toBe('dep-1')

    // findable afterwards
    const found = await store.find('https://lms.example', 'assigned-client-123')
    expect(found?.id).toBe(result.platform.id)
  })

  it('persists deploymentId as null when the platform omits it (backfill later)', async () => {
    configRoute()
    routes.push({
      match: (u) => u === REGISTRATION_ENDPOINT,
      respond: () => json({ client_id: 'c-no-dep' }),
    })
    const result = await dynamicRegister({ platforms: memoryMutableStore() }, {
      openidConfiguration: OPENID_CONFIG_URL,
      registrationToken: 't',
      tool: TOOL,
    })
    expect(result.platform.deploymentId).toBeNull()
  })

  it('throws RegistrationError on a non-2xx registration response and does not persist', async () => {
    configRoute()
    routes.push({
      match: (u) => u === REGISTRATION_ENDPOINT,
      respond: () => new Response('bad token', { status: 401 }),
    })
    const store = memoryMutableStore()
    await expect(
      dynamicRegister({ platforms: store }, {
        openidConfiguration: OPENID_CONFIG_URL,
        registrationToken: 'expired',
        tool: TOOL,
      }),
    ).rejects.toBeInstanceOf(RegistrationError)
    expect(await store.find('https://lms.example')).toBeNull()
  })

  it('throws RegistrationError when the response is missing client_id', async () => {
    configRoute()
    routes.push({ match: (u) => u === REGISTRATION_ENDPOINT, respond: () => json({ ok: true }) })
    await expect(
      dynamicRegister({ platforms: memoryMutableStore() }, {
        openidConfiguration: OPENID_CONFIG_URL,
        tool: TOOL,
      }),
    ).rejects.toBeInstanceOf(RegistrationError)
  })
})

describe('createLti dynamicRegistration guard', () => {
  it('throws RegistrationError when the PlatformStore is read-only', async () => {
    const readOnly: PlatformStore = { find: () => Promise.resolve(null) }
    const keys = staticKeyStore({
      privateKeyPem: '', // unused — guard fires before any key access
      kid: 'k',
      publicJwk: { kty: 'RSA' },
    })
    const lti = createLti({
      keys,
      platforms: readOnly,
      nonces: { create: async () => {}, consume: async () => null },
    })
    await expect(
      lti.dynamicRegistration.register({
        openidConfiguration: OPENID_CONFIG_URL,
        tool: TOOL,
      }),
    ).rejects.toBeInstanceOf(RegistrationError)
  })
})
