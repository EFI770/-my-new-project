#!/usr/bin/env bash
# Boot a local Postgres for the dev emulator: applies migrations + dev-auth schema.
# Usage: scripts/dev-db.sh [data-dir]  (default /tmp/chavruta-pgdata-dev)
set -euo pipefail
PGBIN=${PGBIN:-/tmp/pgsrv/root/usr/lib/postgresql/14/bin}
DATA=${1:-/tmp/chavruta-pgdata-dev}
SOCK=/tmp/chavruta-pgsock-dev
DB=chavruta_dev
export LD_LIBRARY_PATH="/tmp/pgsrv/root/usr/lib/postgresql/14/lib:${LD_LIBRARY_PATH:-}"

if [ ! -s "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA"
  "$PGBIN/initdb" -D "$DATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
fi
mkdir -p "$SOCK"
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l /tmp/chavruta-pg-dev.log -w start >/dev/null
psql -h "$SOCK" -U postgres -d postgres -qAtc "select 1 from pg_database where datname='$DB'" | grep -q 1 || createdb -h "$SOCK" -U postgres "$DB"
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('app.sub', true), '')::uuid
$f$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
SQL
for f in supabase/migrations/0001_initial_schema.sql supabase/migrations/0002_contact_consent_and_blocks.sql supabase/migrations/0003_private_interests_and_contact_disclosure.sql; do
  psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists dev_auth;
create table if not exists dev_auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists dev_auth.sessions (
  token text primary key,
  user_id uuid not null references dev_auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
SQL
echo "dev db ready: socket=$SOCK db=$DB"
