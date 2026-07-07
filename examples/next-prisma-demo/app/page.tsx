export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>ltikit prisma demo tool</h1>
      <p>
        Next.js + <strong>Prisma/SQLite</strong> + <strong>NextAuth v5</strong>. Launched from an LMS
        it establishes a real NextAuth session with no login page; visited directly it requires{' '}
        <a href="/login">signing in</a>.
      </p>
      <p>
        <strong>Dynamic Registration (easiest):</strong> point your LMS&apos;s LTI 1.3 auto-config
        at <code>/api/lti/register</code>.
      </p>
      <p>Or register these endpoints manually in your LMS (Canvas / Moodle):</p>
      <ul>
        <li>
          OIDC login: <code>/api/lti/login</code>
        </li>
        <li>
          Launch / redirect URI: <code>/api/lti/launch</code>
        </li>
        <li>
          JWKS: <code>/.well-known/jwks.json</code>
        </li>
        <li>
          Deep link: <code>/api/lti/login</code> (same OIDC entry; message type differs)
        </li>
        <li>
          Dynamic registration: <code>/api/lti/register</code>
        </li>
      </ul>
    </main>
  )
}
