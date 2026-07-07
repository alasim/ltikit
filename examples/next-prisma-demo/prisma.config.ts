/**
 * Prisma CLI config (generate/migrate/studio/seed). Only used by the CLI, not
 * by the app at runtime — Next.js loads `.env.local` on its own for that.
 * Explicitly loads `.env.local` (not the dotenv default of `.env`) to match
 * this monorepo's convention (see examples/next-demo).
 */
import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

config({ path: '.env.local' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
