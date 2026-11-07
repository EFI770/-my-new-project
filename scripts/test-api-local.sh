#!/usr/bin/env bash
# Hermetic API execution tests: throwaway Postgres + dev emulator + HTTP assertions.
set -euo pipefail
PGBIN=${PGBIN:-/tmp/pgsrv/root/usr/lib/postgresql/14/bin}
DATA=/tmp/chavruta-pgdata-api
SOCK=/tmp/chavruta-pgsock-api
DB=chavruta_api_test
PORT=4591
export LD_LIBRARY_PATH="/tmp/pgsrv/root/usr/lib/postgresql/14/lib:${LD_LIBRARY_PATH:-}"

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
"$PGBIN/initdb" -D "$DATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l /tmp/chavruta-pg-api.log -w start >/dev/null
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA" "$SOCK"
}
trap cleanup EXIT

createdb -h "$SOCK" -U postgres "$DB"
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.sub', true), '')::uuid
$$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
SQL
for f in supabase/migrations/0001_initial_schema.sql supabase/migrations/0002_contact_consent_and_blocks.sql supabase/migrations/0003_private_interests_and_contact_disclosure.sql supabase/migrations/0004_gender_separation.sql supabase/migrations/0006_age_attestation.sql supabase/migrations/0010_study_availability.sql; do
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

PGSOCKET="$SOCK" PGDATABASE="$DB" PORT=$PORT node server/server.js > /tmp/chavruta-api-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 50); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.2
done
BASE="http://127.0.0.1:$PORT" PGHOST="$SOCK" PGDATABASE="$DB" node server/harness/api.execution.mjs
