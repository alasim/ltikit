'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

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
  const sim = useSearchParams().get('sim') ?? '(none)'
  const [status, setStatus] = useState('')
  const [roster, setRoster] = useState<Member[] | null>(null)
  const [rosterMsg, setRosterMsg] = useState('')

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
