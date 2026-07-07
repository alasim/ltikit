/**
 * Seeds one demo user for the /login page. Run via `pnpm db:seed` (or
 * automatically after `pnpm db:reset`).
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

const DEMO_EMAIL = 'demo@ltikit.dev'
const DEMO_PASSWORD = 'ltikit-demo'

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, passwordHash, name: 'Demo User' },
    update: { passwordHash },
  })
  console.log(`Seeded demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
