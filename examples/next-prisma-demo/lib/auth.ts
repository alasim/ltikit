/**
 * NextAuth v5 (Auth.js) config.
 *
 * `jwt.encode`/`jwt.decode` are fully overridden with a jose-based implementation
 * (same library ltikit's core uses everywhere else) instead of relying on
 * NextAuth's internal token format. This lets the LTI launch handler
 * (`signSessionToken`, used by `app/api/lti/launch/route.ts`) mint a session
 * cookie directly — via ltikit's own `sessionRedirect` helper — without going
 * through a NextAuth sign-in round-trip. Both paths produce/consume the exact
 * same token shape because they share this one encode/decode implementation.
 *
 * The `credentials` provider below is the ONLY thing that talks to NextAuth's
 * normal sign-in flow — used by the plain email/password `/login` page for
 * direct (non-LTI) visits.
 */
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

/** Must match the cookie name the LTI launch handler writes via `sessionRedirect`. */
export const SESSION_COOKIE_NAME = 'ltikit-demo-session'

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/** Sign a session token in the format `jwt.decode` below expects. */
export async function signSessionToken(payload: {
  sub: string
  email?: string | null
  name?: string | null
}): Promise<string> {
  return new SignJWT({ email: payload.email ?? undefined, name: payload.name ?? undefined })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey())
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      // Cross-site: the tool renders inside the LMS iframe.
      options: { httpOnly: true, sameSite: 'none', secure: true, path: '/' },
    },
  },
  jwt: {
    async encode({ token }) {
      return signSessionToken({
        sub: String(token?.sub ?? ''),
        email: typeof token?.email === 'string' ? token.email : undefined,
        name: typeof token?.name === 'string' ? token.name : undefined,
      })
    },
    async decode({ token }) {
      if (!token) return null
      try {
        const { payload } = await jwtVerify(token, secretKey())
        return payload
      } catch {
        return null
      }
    },
  },
  callbacks: {
    session({ session, token }) {
      if (token?.sub) session.user.id = token.sub
      return session
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null
        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
})
