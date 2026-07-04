'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Where a student lands after a resource-link launch. In a real tool this is the
 * activity itself; here it just shows the sim id and a button that posts a
 * completion grade back to the LMS gradebook via AGS.
 */
export function LaunchedClient() {
  const sim = useSearchParams().get('sim') ?? '(none)'
  const [status, setStatus] = useState<string>('')

  async function postGrade() {
    setStatus('Posting…')
    const res = await fetch('/api/lti/grade', { method: 'POST' })
    setStatus(res.ok ? 'Grade posted (2/2) — check the LMS gradebook.' : 'Failed to post grade.')
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
    </>
  )
}
