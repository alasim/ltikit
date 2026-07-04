export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>ltikit demo tool</h1>
      <p>This app is launched from inside an LMS — it is not meant to be opened directly.</p>
      <p>
        <strong>Dynamic Registration (easiest):</strong> point your LMS&apos;s LTI 1.3 auto-config
        at <code>/api/lti/register</code> — it onboards the platform automatically, no manual setup.
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
      <p style={{ fontSize: '0.9rem', color: '#555' }}>
        After a launch, the landing page runs an <strong>LTI Platform Storage</strong> round-trip —
        proving the session can be carried without a third-party cookie (works in Safari / Firefox,
        where iframe cookies are blocked). Falls back to <code>Partitioned</code> cookies when the
        platform sends no storage target.
      </p>
    </main>
  )
}
