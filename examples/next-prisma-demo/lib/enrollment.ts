import { prisma } from './prisma'

/**
 * Resolve (or create) the app `User` for a verified LTI launch. `sub` is only
 * unique per issuer, so the lookup key is `(issuer, sub)` via `LtiEnrollment`,
 * not email — the LMS may not send one.
 */
export async function resolveLtiUser(opts: {
  issuer: string
  sub: string
  email?: string | null
  name?: string | null
}) {
  const existing = await prisma.ltiEnrollment.findUnique({
    where: { issuer_ltiSub: { issuer: opts.issuer, ltiSub: opts.sub } },
    include: { user: true },
  })
  if (existing) return existing.user

  const issuerHost = new URL(opts.issuer).host
  const user = await prisma.user.create({
    data: {
      // LTI launches often omit email; fall back to an issuer-scoped placeholder
      // so two different LMSs can't collide on an identical `sub` value.
      email: opts.email ?? `${opts.sub}@${issuerHost}.lti.local`,
      name: opts.name ?? undefined,
      enrollments: { create: { issuer: opts.issuer, ltiSub: opts.sub } },
    },
  })
  return user
}
