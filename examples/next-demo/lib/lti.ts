import { createLti, staticKeyStore } from '@ltikit/core'
import { supabasePlatformStore, supabaseNonceStore, type SupabaseLike } from '@ltikit/adapter-supabase'
import { createClient } from '@supabase/supabase-js'

/**
 * The single shared ltikit instance for this app.
 *
 * - Storage: Supabase (service-role client — bypasses RLS; keep it server-only).
 * - Keys: a static RS256 keypair from env. The public JWK is served at
 *   /.well-known/jwks.json so the LMS can verify our signed messages.
 *
 * Register your tool in the `lti_platforms` table (see the adapter's SQL), and
 * run `sql/0001_ltikit_tables.sql` from @ltikit/adapter-supabase first.
 */
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// The real Supabase client is structurally compatible with SupabaseLike.
const client = admin as unknown as SupabaseLike

export const APP_URL = process.env.APP_URL!

export const lti = createLti({
  keys: staticKeyStore({
    privateKeyPem: process.env.LTI_TOOL_PRIVATE_KEY!,
    kid: process.env.LTI_TOOL_KEY_ID ?? 'ltikit-key-1',
    publicJwk: JSON.parse(process.env.LTI_TOOL_PUBLIC_JWK!),
  }),
  platforms: supabasePlatformStore(client),
  nonces: supabaseNonceStore(client),
})
