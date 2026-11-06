-- חברותא 0005 (DRAFT): Neon vendor bootstrap. Applied ONCE to the Neon dev project
-- (chavruta-dev, aws-us-east-1) with the OWNER connection - migrations are the one
-- legitimate BYPASSRLS use. Creates the least-privilege runtime role and the
-- auth_sub binding for Neon Auth (Better Auth) JWT subjects.
--
-- SECURITY SHAPE:
-- - chavruta_app: LOGIN role for user-facing API traffic. NO BYPASSRLS, no direct
--   table grants. It can only act through `set local role authenticated` inside a
--   transaction, so every query is authorized by the RLS policies from 0001-0004.
-- - auth.users.auth_sub: unique binding from a verified Neon JWT `sub` to one app
--   user id. The API sets app.sub from the VERIFIED JWT only, never from client input.

-- Supabase-compatible helper schema used by all policies (auth.uid()).
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('app.sub', true), '')::uuid
$f$;

-- Neon Auth JWT subject binding (one vendor identity = one app user, enforced).
alter table auth.users add column if not exists auth_sub text;
create unique index if not exists auth_users_auth_sub_key on auth.users(auth_sub) where auth_sub is not null;

-- Runtime roles. `authenticated` carries the RLS policies (created if the vendor
-- did not pre-create it); chavruta_app is the only login the API uses for users.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- The password is injected by the migration runner from the vault; it is never
-- stored in this repository. (gexec keeps the psql variable outside dollar-quoted
-- blocks, where substitution would not happen.)
select format('create role chavruta_app login password %L', :'chavruta_app_password')
  where not exists (select 1 from pg_roles where rolname='chavruta_app')
\gexec
select format('alter role chavruta_app with login password %L', :'chavruta_app_password')
  where exists (select 1 from pg_roles where rolname='chavruta_app')
\gexec

-- chavruta_app may switch into `authenticated` per transaction; it owns no
-- table privileges of its own, so a request that fails to SET ROLE sees nothing.
grant authenticated to chavruta_app;
revoke all on schema public from chavruta_app;
