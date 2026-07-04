'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { platformStorage } from '@ltikit/next/client'

interface Member {
  userId: string
  roles: string[]
  name?: string
  email?: string
}

/**
 * Where a student lands after a resource-link launch. In a real tool this is the
 * activity itself; here it shows the sim id, a button that posts a completion
 * grade back to the LMS gradebook via AGS, and a button that fetches the course
 * roster via NRPS.
 */
export function LaunchedClient() {
  const params = useSearchParams()
  const sim = params.get('sim') ?? '(none)'
  const [status, setStatus] = useState('')
  const [roster, setRoster] = useState<Member[] | null>(null)
  const [rosterMsg, setRosterMsg] = useState('')
  const [storageMsg, setStorageMsg] = useState('Checking LTI Platform Storage…')

  // Phase 8b: prove a cookieless round-trip. Write a value into the platform's
  // storage frame and read it back — this survives even when the browser blocks
  // third-party cookies (Safari ITP / Firefox TCP), unlike an iframe cookie.
  useEffect(() => {
    const origin = params.get('origin')
    const target = params.get('storageTarget')
    if (!origin || !target) {
      setStorageMsg('Platform Storage: platform sent no lti_storage_target — falling back to cookies.')
      return
    }
    const store = platformStorage({ platformOrigin: origin, target })
    if (!store.available) {
      setStorageMsg('Platform Storage: no storage frame reachable — falling back to cookies.')
      return
    }
    const probe = `ok-${Date.now()}`
    store
      .putData('ltikit_probe', probe)
      .then(() => store.getData('ltikit_probe'))
      .then((got) => {
        setStorageMsg(
          got === probe
            ? '✅ Platform Storage round-trip OK — session can be carried cookielessly.'
            : `Platform Storage returned an unexpected value: ${String(got)}`,
        )
      })
      .catch((err: unknown) => {
        setStorageMsg(
          `Platform Storage unavailable (${err instanceof Error ? err.message : 'error'}) — falling back to cookies.`,
        )
      })
  }, [params])

  async function postGrade() {
    setStatus('Posting…')
    const res = await fetch('/api/lti/grade', { method: 'POST' })
    setStatus(res.ok ? 'Grade posted (2/2) — check the LMS gradebook.' : 'Failed to post grade.')
  }

  async function loadRoster() {
    setRosterMsg('Loading…')
    setRoster(null)
    const res = await fetch('/api/lti/roster')
    const data = await res.json()
    if (res.ok) {
      setRoster(data.members as Member[])
      setRosterMsg(`${data.members.length} member(s)${data.contextTitle ? ` in ${data.contextTitle}` : ''}`)
    } else {
      setRosterMsg(data.error ?? 'Failed to load roster.')
    }
  }

  return (
    <>
      <p>
        Simulation id: <code>{sim}</code>
      </p>

      <p style={{ background: '#f4f4f4', padding: '0.6rem 0.8rem', borderRadius: 6, fontSize: '0.9rem' }}>
        {storageMsg}
      </p>

      <button onClick={postGrade} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
        Complete &amp; post grade
      </button>
      <p>{status}</p>

      <hr style={{ margin: '1.5rem 0' }} />

      <button onClick={loadRoster} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
        View roster (NRPS)
      </button>
      <p>{rosterMsg}</p>
      {roster && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {roster.map((m) => (
            <li key={m.userId} style={{ padding: '0.25rem 0' }}>
              <strong>{m.name ?? m.userId}</strong>
              {m.email ? ` — ${m.email}` : ''}{' '}
              <small style={{ color: '#888' }}>[{m.roles.map((r) => r.split('#').pop()).join(', ')}]</small>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
