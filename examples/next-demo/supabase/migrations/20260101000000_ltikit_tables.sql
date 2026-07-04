-- ltikit demo — LTI platform registry + OIDC nonce store.
-- This is the @ltikit/adapter-supabase schema. Regenerate with:
--   npx @ltikit/adapter-supabase > supabase/migrations/<ts>_ltikit_tables.sql
--
-- Both tables are read/written ONLY by the service-role client (bypasses RLS).
-- RLS is enabled with no policies so anon/authenticated get zero access.

begin;

create table if not exists public.lti_platforms (
  id             uuid primary key default gen_random_uuid(),
  issuer         text not null,
  client_id      text not null,
  auth_endpoint  text not null,
  token_endpoint text not null,
  keyset_url     text not null,
  deployment_id  text,
  created_at     timestamptz not null default now(),
  unique (issuer, client_id)
);

create table if not exists public.lti_nonces (
  state       text primary key,
  nonce       text not null,
  platform_id uuid not null references public.lti_platforms(id) on delete cascade,
  data        jsonb,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_lti_nonces_expires_at on public.lti_nonces (expires_at);

alter table public.lti_platforms enable row level security;
alter table public.lti_nonces enable row level security;

-- service_role bypasses RLS but still needs table grants; anon/authenticated get none.
grant select, insert, update, delete on public.lti_platforms to service_role;
grant select, insert, update, delete on public.lti_nonces to service_role;

commit;
