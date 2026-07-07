// @ts-check
import { defineConfig } from 'astro/config'
import mermaid from 'astro-mermaid'
import starlight from '@astrojs/starlight'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import starlightLlmsTxt from 'starlight-llms-txt'

// GitHub Pages project site. If you fork/rename, update `site` (owner) and `base`
// (repo name). For a user/root site or custom domain, set base to '/'.
const SITE = 'https://alasim.github.io'
const BASE = '/ltikit'

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    // Render ```mermaid code blocks (theme-aware). Must run before Starlight.
    mermaid({ theme: 'default', autoTheme: true }),
    starlight({
      title: 'LTIkit',
      description:
        'Runtime-, storage-, and framework-agnostic LTI 1.3 (LTI Advantage) toolkit — jose + fetch, bring your own DB.',
      // The square mark works on both themes; the title text ("LTIkit") renders beside it.
      logo: { src: './src/assets/ltikit-mark.png', alt: 'LTIkit' },
      favicon: '/favicon.png',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `${SITE}${BASE}/og.png` } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${SITE}${BASE}/og.png` } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/alasim/ltikit' }],
      plugins: [
        // Generates /llms.txt + /llms-full.txt for LLM-friendly consumption.
        starlightLlmsTxt(),
        // Auto API reference from TSDoc across the workspace packages.
        starlightTypeDoc({
          entryPoints: [
            '../packages/core/src/index.ts',
            '../packages/next/src/index.ts',
            '../packages/hono/src/index.ts',
            '../packages/adapter-supabase/src/index.ts',
            '../packages/adapter-memory/src/index.ts',
            '../packages/adapter-redis/src/index.ts',
            '../packages/adapter-prisma/src/index.ts',
          ],
          tsconfig: '../tsconfig.base.json',
          typeDoc: { skipErrorChecking: true },
        }),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'introduction' },
            { label: 'How it fits together', slug: 'getting-started/how-it-fits' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
            { label: 'Concepts', slug: 'getting-started/concepts' },
          ],
        },
        // Standalone top-level item — the public feature roadmap.
        { label: 'Roadmap', slug: 'roadmap' },
        {
          label: 'LTI features',
          collapsed: false,
          items: [
            { label: 'LMS registration', slug: 'guides/lms-registration' },
            { label: 'Deep linking', slug: 'guides/deep-linking' },
            { label: 'Grade passback (AGS)', slug: 'guides/grade-passback' },
            { label: 'Roster (NRPS)', slug: 'guides/roster' },
            { label: 'Running in an iframe', slug: 'guides/iframe' },
          ],
        },
        {
          label: 'Your stack (pick one each)',
          items: [
            { label: 'Storage adapters', slug: 'guides/storage' },
            { label: 'Framework bindings', slug: 'guides/frameworks' },
            { label: 'Auth integration', slug: 'guides/auth-integration' },
            { label: 'Supabase adapter (setup)', slug: 'guides/supabase-adapter' },
          ],
        },
        // Auto-generated API reference group.
        typeDocSidebarGroup,
        {
          label: 'Reference',
          items: [
            { label: 'Capabilities', slug: 'reference/capabilities' },
            { label: 'Gotchas', slug: 'gotchas' },
          ],
        },
        // Standalone top-level item — paid support + contact.
        { label: 'Need help?', slug: 'support' },
      ],
    }),
  ],
})
