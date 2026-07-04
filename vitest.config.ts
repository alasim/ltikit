import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve @ltikit/core to source so tests always run the latest code without a
// build step (the published package resolves to dist via its exports map).
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ltikit\/core\/testing$/, replacement: src('./packages/core/src/testing.ts') },
      { find: /^@ltikit\/core$/, replacement: src('./packages/core/src/index.ts') },
    ],
  },
})
