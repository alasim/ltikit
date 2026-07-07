/**
 * Reference deep-link picker. Content is app-specific, so ltikit ships NO picker
 * UI — this is yours to build. Each choice POSTs to /api/lti/deeplink, which
 * signs the response and auto-submits it back to the LMS.
 */
const DEMO_ITEMS = [
  { id: 'item-101', title: 'Reading: Chapter 1' },
  { id: 'item-102', title: 'Quiz: Basics' },
  { id: 'item-103', title: 'Video Lesson' },
]

export default function SelectPage() {
  return (
    <main style={{ maxWidth: 520, margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>Pick an item</h1>
      <p>Choosing one places it in your course and creates its gradebook column.</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {DEMO_ITEMS.map((item) => (
          <li key={item.id} style={{ margin: '0.75rem 0' }}>
            <form method="POST" action="/api/lti/deeplink">
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="item_title" value={item.title} />
              <button type="submit" style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
                Add “{item.title}”
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
