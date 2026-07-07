'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

/**
 * Direct-visit login. LTI launches never see this page — the launch handler
 * mints a session itself (see app/api/lti/launch/route.ts). This is only for
 * someone opening the app URL outside an LMS.
 */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('demo@ltikit.dev')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setPending(false)
    if (!res || res.error) {
      setError('Invalid email or password.')
      return
    }
    router.push('/launched')
  }

  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Sign in</h1>
      <p style={{ fontSize: '0.9rem', color: '#555' }}>
        Demo account (seeded via <code>pnpm db:seed</code>): <code>demo@ltikit.dev</code> /{' '}
        <code>ltikit-demo</code>
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={pending} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
