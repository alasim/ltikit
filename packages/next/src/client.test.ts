import { describe, it, expect, afterEach } from 'vitest'
import { platformStorage, PlatformStorageError } from './client'

const ORIGIN = 'https://canvas.instructure.com'

type Listener = (e: { origin: string; data: unknown }) => void

/**
 * A fake browser: a `window` that dispatches `message` events, and a platform
 * storage frame (`window.parent`) that echoes LTI Platform Storage responses.
 * `behavior` lets each test decide how the platform replies.
 */
function installFakeBrowser(behavior: {
  respond?: (msg: Record<string, unknown>) => Record<string, unknown> | null
  origin?: string
  namedFrame?: string
}) {
  const listeners = new Set<Listener>()
  const respondOrigin = behavior.origin ?? ORIGIN

  const storageFrame = {
    postMessage(msg: Record<string, unknown>) {
      const reply = behavior.respond ? behavior.respond(msg) : null
      if (reply === null) return // simulate no response (→ timeout)
      // Deliver asynchronously, like a real postMessage round-trip.
      setTimeout(() => {
        for (const l of listeners) l({ origin: respondOrigin, data: reply })
      }, 0)
    },
  }

  const fakeWindow = {
    parent: {
      postMessage: storageFrame.postMessage,
      frames: behavior.namedFrame ? { [behavior.namedFrame]: storageFrame } : {},
    },
    addEventListener(type: string, fn: Listener) {
      if (type === 'message') listeners.add(fn)
    },
    removeEventListener(type: string, fn: Listener) {
      if (type === 'message') listeners.delete(fn)
    },
  }
  // The parent must differ from window itself (else "not framed").
  ;(globalThis as unknown as { window: unknown }).window = fakeWindow
  return {
    restore() {
      delete (globalThis as unknown as { window?: unknown }).window
    },
  }
}

let browser: { restore(): void }
afterEach(() => browser?.restore())

describe('platformStorage', () => {
  it('putData resolves on a matching put_data.response', async () => {
    const stored: Record<string, unknown> = {}
    browser = installFakeBrowser({
      respond: (msg) => {
        stored[String(msg.key)] = msg.value
        return { subject: 'lti.put_data.response', message_id: msg.message_id, key: msg.key }
      },
    })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent' })
    await ps.putData('ltikit_ctx', 'hello')
    expect(stored.ltikit_ctx).toBe('hello')
  })

  it('getData returns the value the platform reports', async () => {
    browser = installFakeBrowser({
      respond: (msg) =>
        msg.subject === 'lti.get_data'
          ? { subject: 'lti.get_data.response', message_id: msg.message_id, key: msg.key, value: 'v1' }
          : null,
    })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent' })
    expect(await ps.getData('k')).toBe('v1')
  })

  it('getData returns null when the platform reports no value', async () => {
    browser = installFakeBrowser({
      respond: (msg) => ({ subject: 'lti.get_data.response', message_id: msg.message_id, key: msg.key }),
    })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent' })
    expect(await ps.getData('missing')).toBeNull()
  })

  it('capabilities lists supported subjects', async () => {
    browser = installFakeBrowser({
      respond: (msg) => ({
        subject: 'lti.capabilities.response',
        message_id: msg.message_id,
        supported_messages: [{ subject: 'lti.get_data' }, { subject: 'lti.put_data' }],
      }),
    })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent' })
    expect(await ps.capabilities()).toEqual(['lti.get_data', 'lti.put_data'])
  })

  it('rejects a platform error response with PlatformStorageError', async () => {
    browser = installFakeBrowser({
      respond: (msg) => ({
        subject: 'lti.put_data.response',
        message_id: msg.message_id,
        error: { code: 'storage_exceeded', message: 'quota' },
      }),
    })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent' })
    await expect(ps.putData('k', 'v')).rejects.toBeInstanceOf(PlatformStorageError)
  })

  it('ignores responses from a different origin and times out', async () => {
    browser = installFakeBrowser({
      origin: 'https://evil.example',
      respond: (msg) => ({ subject: 'lti.get_data.response', message_id: msg.message_id, value: 'x' }),
    })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent', timeoutMs: 30 })
    await expect(ps.getData('k')).rejects.toMatchObject({ code: 'timeout' })
  })

  it('times out when the platform never responds', async () => {
    browser = installFakeBrowser({ respond: () => null })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: '_parent', timeoutMs: 30 })
    await expect(ps.getData('k')).rejects.toMatchObject({ code: 'timeout' })
  })

  it('resolves a named storage frame from lti_storage_target', async () => {
    browser = installFakeBrowser({
      namedFrame: 'post_message_forwarding',
      respond: (msg) => ({ subject: 'lti.get_data.response', message_id: msg.message_id, value: 'named' }),
    })
    const ps = platformStorage({
      platformOrigin: ORIGIN,
      target: 'post_message_forwarding',
    })
    expect(ps.available).toBe(true)
    expect(await ps.getData('k')).toBe('named')
  })

  it('reports unavailable + rejects when the target frame is absent', async () => {
    browser = installFakeBrowser({ respond: () => null })
    const ps = platformStorage({ platformOrigin: ORIGIN, target: 'does_not_exist' })
    expect(ps.available).toBe(false)
    await expect(ps.getData('k')).rejects.toMatchObject({ code: 'no_target' })
  })
})
