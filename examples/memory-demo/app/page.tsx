export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>ltikit memory demo</h1>
      <p>This app is launched from inside an LMS — it is not meant to be opened directly.</p>
      <p>
        <strong>Zero setup:</strong> storage is in-memory — no database, no Docker, no external
        service. The only way to register a platform is <strong>Dynamic Registration</strong>:
        point your LMS&apos;s LTI 1.3 auto-config at <code>/api/lti/register</code>.
      </p>
      <p style={{ background: '#fff3cd', padding: '0.6rem 0.8rem', borderRadius: 6, fontSize: '0.9rem' }}>
        ⚠️ In-memory means <strong>state is lost on restart</strong>. If you stop and restart the
        dev server, re-run Dynamic Registration before launching again.
      </p>
      <p>Other endpoints:</p>
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
