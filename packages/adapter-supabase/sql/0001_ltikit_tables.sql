-- ltikit — Supabase/Postgres schema for @ltikit/adapter-supabase.
-- Apply with the Supabase CLI (supabase migration new / db push) or psql, or:
--   npx @ltikit/adapter-supabase > supabase/migrations/0001_ltikit.sql
--
-- Both tables are written/read ONLY by the tool's service-role client, which
-- bypasses RLS. RLS is enabled with no policies so anon/authenticated clients
-- get zero access by default (defense in depth).
--
-- NOTE: `create table if not exists` SKIPS a table that already exists. If your
-- project already has DIFFERENT lti_platforms / lti_nonces tables (e.g. from
-- another integration), this will NOT alter them and the adapter will fail at
-- runtime against the wrong columns. In that case use custom names via the
-- adapter's { table } option and change the identifiers below to match.

begin;

-- Registered LMS platforms (the trust anchors for inbound launches).
create table if not exists public.lti_platforms (
  id             uuid primary key default gen_random_uuid(),
  issuer         text not null,
  client_id      text not null,
  auth_endpoint  text not null,   -- OIDC authorization redirect
  token_endpoint text not null,   -- OAuth2 token endpoint (AGS/NRPS assertion aud)
  keyset_url     text not null,   -- platform JWKS (verify inbound id_token)
  deployment_id  text,
  created_at     timestamptz not null default now(),
  unique (issuer, client_id)
);

-- OIDC handshake state. Short-lived, single-use (consumed = deleted).
create table if not exists public.lti_nonces (
  state       text primary key,
  nonce       text not null,
  platform_id uuid not null references public.lti_platforms(id) on delete cascade,
  data        jsonb,              -- carry-through (target_link_uri, deep-link return, …)
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Sweep expired handshakes that were never completed.
create index if not exists idx_lti_nonces_expires_at on public.lti_nonces (expires_at);

alter table public.lti_platforms enable row level security;
alter table public.lti_nonces enable row level security;

-- The service-role bypasses RLS but still needs table privileges. Grant ONLY to
-- service_role (the tool's server client); anon/authenticated get nothing.
grant select, insert, update, delete on public.lti_platforms to service_role;
grant select, insert, update, delete on public.lti_nonces to service_role;

commit;
