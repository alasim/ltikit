import { Suspense } from 'react'
import { LaunchedClient } from './launched-client'

// useSearchParams (in LaunchedClient) must sit under a Suspense boundary.
export default function LaunchedPage() {
  return (
    <main style={{ maxWidth: 520, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>Item launched</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <LaunchedClient />
      </Suspense>
    </main>
  )
}
