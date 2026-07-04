// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import starlightLlmsTxt from 'starlight-llms-txt'

// GitHub Pages project site. If you fork/rename, update `site` (owner) and `base`
// (repo name). For a user/root site or custom domain, set base to '/'.
const SITE = 'https://your-org.github.io'
const BASE = '/ltikit'

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    starlight({
      title: 'LTIkit',
      description:
        'Runtime-, storage-, and framework-agnostic LTI 1.3 (LTI Advantage) toolkit — jose + fetch, bring your own DB.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/your-org/ltikit' }],
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
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
            { label: 'Concepts', slug: 'getting-started/concepts' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Auth integration', slug: 'guides/auth-integration' },
            { label: 'LMS registration', slug: 'guides/lms-registration' },
            { label: 'Running in an iframe', slug: 'guides/iframe' },
            { label: 'Deep linking', slug: 'guides/deep-linking' },
            { label: 'Grade passback (AGS)', slug: 'guides/grade-passback' },
            { label: 'Roster (NRPS)', slug: 'guides/roster' },
            { label: 'Supabase adapter', slug: 'guides/supabase-adapter' },
          ],
        },
        // Auto-generated API reference group.
        typeDocSidebarGroup,
        {
          label: 'Reference',
          items: [{ label: 'Gotchas', slug: 'gotchas' }],
        },
      ],
    }),
  ],
})
