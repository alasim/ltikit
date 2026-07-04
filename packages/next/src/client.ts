/**
 * @ltikit/next/client — LTI Platform Storage (client-side postMessage).
 *
 * Browser-only helpers for storing/reading data in the *platform's* storage
 * frame, so a tool embedded in an LMS iframe can persist state WITHOUT a
 * third-party cookie (which Safari ITP / Firefox TCP block outright, and Chrome
 * is deprecating). The platform's storage frame is first-party to the platform,
 * so it survives strict third-party-cookie blocking.
 *
 * ltikit's OIDC handshake is already cookieless (state lives server-side in the
 * NonceStore); this is for the *session / launch context* a tool would
 * otherwise keep in an iframe cookie.
 *
 * Protocol: LTI 1.3 client-side postMessage (`lti.put_data` / `lti.get_data` /
 * `lti.capabilities`). The platform names its storage frame via the
 * `lti_storage_target` login param (`_parent`, or a named frame in the parent).
 *
 * No dependencies, no framework — usable in any browser runtime.
 */

/** A typed Platform Storage failure (timeout, origin mismatch, platform error). */
export class PlatformStorageError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PlatformStorageError'
    this.code = code
  }
}

export interface PlatformStorageOptions {
  /**
   * The platform's origin (scheme + host, no path), e.g.
   * `https://canvas.instructure.com`. Both the outbound `targetOrigin` and the
   * accepted response origin — derive it from the launch `iss`.
   */
  platformOrigin: string
  /**
   * `lti_storage_target` from the OIDC login params: `_parent` (post to the
   * parent window) or the name of a frame inside the parent.
   */
  target: string
  /** Per-message timeout in ms (default 2000). */
  timeoutMs?: number
}

interface PlatformStorageMessage {
  subject: string
  message_id: string
  key?: string
  value?: string | null
}

interface PlatformStorageResponse {
  subject?: string
  message_id?: string
  key?: string
  value?: string | null
  supported_messages?: Array<{ subject: string } | string>
  error?: { code?: string; message?: string }
}

/** Resolve the platform's storage window from `lti_storage_target`. */
function resolveTargetWindow(target: string): Window | null {
  if (typeof window === 'undefined') return null
  const parent = window.parent
  if (!parent || parent === window) {
    // Not framed — nothing to post to. (A `_parent` target still needs a parent.)
    return null
  }
  if (target === '_parent') return parent
  try {
    // A named frame inside the parent document (LTI names its forwarding frame).
    const frames = parent.frames as unknown as Record<string, Window | undefined>
    return frames[target] ?? null
  } catch {
    // Cross-origin access to parent.frames[name] can throw; treat as not found.
    return null
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older runtimes — uniqueness only needs to hold within this page.
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

/**
 * A Platform Storage client bound to one platform origin + storage frame.
 * Each method posts a correlated message and resolves on the matching response,
 * rejecting with `PlatformStorageError` on timeout, origin mismatch, or a
 * platform-reported error.
 */
export interface PlatformStorage {
  /** Ask the platform which postMessage subjects it supports. */
  capabilities(): Promise<string[]>
  /** Store `value` under `key` in the platform's storage. */
  putData(key: string, value: string): Promise<void>
  /** Read `key` from the platform's storage (null if unset). */
  getData(key: string): Promise<string | null>
  /** True if a storage frame could be resolved from the given target. */
  readonly available: boolean
}

export function platformStorage(opts: PlatformStorageOptions): PlatformStorage {
  const timeoutMs = opts.timeoutMs ?? 2000
  const target = resolveTargetWindow(opts.target)

  function request(message: PlatformStorageMessage): Promise<PlatformStorageResponse> {
    return new Promise((resolve, reject) => {
      if (!target) {
        reject(new PlatformStorageError('no_target', 'No platform storage frame available'))
        return
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new PlatformStorageError('timeout', `Platform storage ${message.subject} timed out`))
      }, timeoutMs)

      function onMessage(event: MessageEvent) {
        // Only trust responses from the platform's own origin.
        if (event.origin !== opts.platformOrigin) return
        const data = event.data as PlatformStorageResponse | null
        if (!data || data.message_id !== message.message_id) return
        cleanup()
        if (data.error) {
          reject(
            new PlatformStorageError(
              data.error.code ?? 'platform_error',
              data.error.message ?? 'Platform storage error',
            ),
          )
          return
        }
        resolve(data)
      }
      function cleanup() {
        clearTimeout(timer)
        window.removeEventListener('message', onMessage)
      }

      window.addEventListener('message', onMessage)
      target.postMessage(message, opts.platformOrigin)
    })
  }

  return {
    available: target !== null,
    async capabilities() {
      const res = await request({ subject: 'lti.capabilities', message_id: randomId() })
      return (res.supported_messages ?? []).map((m) => (typeof m === 'string' ? m : m.subject))
    },
    async putData(key, value) {
      await request({ subject: 'lti.put_data', message_id: randomId(), key, value })
    },
    async getData(key) {
      const res = await request({ subject: 'lti.get_data', message_id: randomId(), key })
      return res.value ?? null
    },
  }
}
