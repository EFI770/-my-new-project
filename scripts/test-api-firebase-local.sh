#!/usr/bin/env bash
# Hermetic Firebase-mode execution tests: throwaway Postgres + AUTH_MODE=firebase
# + a LOCAL JWKS server (started by the harness) + HTTP assertions. No Neon, no
# Firebase, no calls to any vendor - all ID tokens are locally signed RS256 test
# doubles verified through the same jose code path production uses.
set -euo pipefail
PGBIN=${PGBIN:-/tmp/pgsrv/root/usr/lib/postgresql/14/bin}
DATA=/tmp/chavruta-pgdata-fbapi
SOCK=/tmp/chavruta-pgsock-fbapi
DB=chavruta_fb_api_test
PORT=${PORT:-4594}
JWKS_PORT=${JWKS_PORT:-4595}
export LD_LIBRARY_PATH="/tmp/pgsrv/root/usr/lib/postgresql/14/lib:${LD_LIBRARY_PATH:-}"

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
"$PGBIN/initdb" -D "$DATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l /tmp/chavruta-pg-fbapi.log -w start >/dev/null
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
-- Vendor subject binding (from 0005 vendor bootstrap): one verified vendor
-- identity = one app user, enforced by the database.
alter table auth.users add column auth_sub text;
create unique index auth_users_auth_sub_key on auth.users(auth_sub) where auth_sub is not null;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
SQL
for f in supabase/migrations/0001_initial_schema.sql supabase/migrations/0002_contact_consent_and_blocks.sql supabase/migrations/0003_private_interests_and_contact_disclosure.sql supabase/migrations/0004_gender_separation.sql supabase/migrations/0006_age_attestation.sql supabase/migrations/0007_vendor_deletion_tombstones.sql supabase/migrations/0010_study_availability.sql; do
  psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done

if [ "${FIREBASE_DELETION_POLICY:-}" = 'bounded-v1' ]; then
  psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/migrations/0011_bounded_firebase_deletion.sql
fi

CHAVRUTA_AUTH_MODE=firebase \
CHAVRUTA_FIREBASE_TEST=hermetic \
FIREBASE_PROJECT_ID=chavruta-hermetic-test \
FIREBASE_JWKS_URL="http://127.0.0.1:$JWKS_PORT/jwks.json" \
FIREBASE_SIGNIN_ENABLED=true \
FIREBASE_API_KEY="test-only-synthetic-api-key" \
FIREBASE_APP_ID="1:000000000000:web:test" \
PGSOCKET="$SOCK" PGDATABASE="$DB" PORT=$PORT node server/server.js > /tmp/chavruta-fbapi-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 50); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.2
done
PGHOST="$SOCK" PGDATABASE="$DB" BASE="http://127.0.0.1:$PORT" JWKS_PORT="$JWKS_PORT" node server/harness/api-firebase.mjs
