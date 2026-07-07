import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { LaunchedClient } from './launched-client'

// useSearchParams (in LaunchedClient) must sit under a Suspense boundary.
export default async function LaunchedPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <main style={{ maxWidth: 520, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>Simulation launched</h1>
      <p style={{ color: '#555' }}>Signed in as {session.user.email}</p>
      <Suspense fallback={<p>Loading…</p>}>
        <LaunchedClient />
      </Suspense>
    </main>
  )
}
