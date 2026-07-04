/**
 * Reference deep-link picker. Content is app-specific, so ltikit ships NO picker
 * UI — this is yours to build. Each choice POSTs to /api/lti/deeplink, which
 * signs the response and auto-submits it back to the LMS.
 */
const DEMO_SIMULATIONS = [
  { id: 'sim-101', title: 'Disruptive Student' },
  { id: 'sim-102', title: 'Parent Conference' },
  { id: 'sim-103', title: 'Group Work Conflict' },
]

export default function SelectPage() {
  return (
    <main style={{ maxWidth: 520, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>Pick a simulation</h1>
      <p>Choosing one places it in your course and creates its gradebook column.</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {DEMO_SIMULATIONS.map((sim) => (
          <li key={sim.id} style={{ margin: '0.75rem 0' }}>
            <form method="POST" action="/api/lti/deeplink">
              <input type="hidden" name="simulation_id" value={sim.id} />
              <button type="submit" style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
                Add “{sim.title}”
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
