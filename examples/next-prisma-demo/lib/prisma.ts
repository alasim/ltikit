import { config } from 'dotenv'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

// Load explicitly so this module works whether invoked from the Next.js app
// (which already loads .env.local on its own) or a standalone script (e.g.
// prisma/seed.ts, run outside Next.js). dotenv never overrides an already-set
// process.env value, so this is a no-op when Next.js got there first.
config({ path: '.env.local' })

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

// Standard Next.js dev-mode singleton — avoids exhausting SQLite connections
// across hot-reloads.
export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
