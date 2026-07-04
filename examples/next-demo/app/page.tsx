export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>ltikit demo tool</h1>
      <p>This app is launched from inside an LMS — it is not meant to be opened directly.</p>
      <p>Register these endpoints in your LMS (Canvas / Moodle):</p>
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
      </ul>
    </main>
  )
}
