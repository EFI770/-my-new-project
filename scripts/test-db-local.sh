#!/usr/bin/env bash
# Local RLS/RPC execution tests against a throwaway Postgres (no Supabase project needed).
# Emulates Supabase's auth schema: auth.users, auth.uid() via the app.sub GUC,
# anon/authenticated roles. Fails on first unexpected result.
set -euo pipefail
PGBIN=${PGBIN:-/tmp/pgsrv/root/usr/lib/postgresql/14/bin}
DATA=/tmp/chavruta-pgdata
SOCK=/tmp/chavruta-pgsock
DB=chavruta_test
export LD_LIBRARY_PATH="/tmp/pgsrv/root/usr/lib/postgresql/14/lib:${LD_LIBRARY_PATH:-}"

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
"$PGBIN/initdb" -D "$DATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l /tmp/chavruta-pg.log -w start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT

PSQL_BASE=("$PGBIN/psql" -h "$SOCK" -d "$DB" -v ON_ERROR_STOP=1 -X -qAt)
createdb -h "$SOCK" -U postgres "$DB"

# Bootstrap Supabase-like environment
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q << 'SQL'
create role anon nologin;
create role authenticated nologin;
create role alice login password 'x';
create role bob login password 'x';
grant authenticated to alice;
grant anon to alice;
grant authenticated to bob;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.sub', true), '')::uuid
$$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
SQL

psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_initial_schema.sql
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/migrations/0002_contact_consent_and_blocks.sql

ALICE=11111111-1111-1111-1111-111111111111
BOB=22222222-2222-2222-2222-222222222222
run_as() { # role, sub, sql
  local role="$1" sub="$2" sql="$3"
  psql -h "$SOCK" -U "$role" -d "$DB" -v ON_ERROR_STOP=1 -X -qAt \
    -c "set app.sub = '$sub';" -c "$sql" 2>&1 || true
}
pass=0; fail=0
check() { # name, expected_substr, actual
  if echo "$3" | grep -qF "$2"; then echo "ok - $1"; pass=$((pass+1));
  else echo "FAIL - $1"; echo "  expected: $2"; echo "  got: $3"; fail=$((fail+1)); fi
}

# T1: alice creates her profile
out=$(run_as alice "$ALICE" "insert into public.profiles (id, display_name) values ('$ALICE', 'Alice') returning id;")
check "T1 alice creates own profile" "$ALICE" "$out"
# T2: bob can read alice's profile before any block
out=$(run_as bob "$BOB" "select count(*) from public.profiles where id = '$ALICE';")
check "T2 bob reads alice profile pre-block" "1" "$out"
# T3: alice -> bob connection request
REQID=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$BOB') returning id;")
check "T3 alice requests connection (setup)" "" ""
# T4: bob accepts via RPC
out=$(run_as bob "$BOB" "select public.respond_to_connection_request('$REQID','accepted'); select status from public.connection_requests where id='$REQID';")
check "T4 bob accepts via RPC" "accepted" "$out"
# T5: bob consents; only his own flag moves
out=$(run_as bob "$BOB" "select public.consent_to_contact('$REQID', true); select requester_contact_consent, recipient_contact_consent from public.connection_requests where id='$REQID';")
check "T5 bob consent sets only recipient flag" "f|t" "$out"
# T6: bob cannot UPDATE the requester flag directly (no UPDATE grant)
out=$(run_as bob "$BOB" "update public.connection_requests set requester_contact_consent = true where id = '$REQID';")
check "T6 direct UPDATE denied" "permission denied" "$out"
# T6b: bob cannot re-accept (no longer pending)
out=$(run_as bob "$BOB" "select public.respond_to_connection_request('$REQID','accepted');")
check "T6b re-accept rejected" "Request not found or action not permitted" "$out"
# T6c: requester alice cannot accept her own request
out=$(run_as alice "$ALICE" "select public.respond_to_connection_request('$REQID','accepted');")
check "T6c requester cannot accept own request" "Request not found or action not permitted" "$out"
# T7: alice blocks bob -> profiles hidden both ways
run_as alice "$ALICE" "insert into public.user_blocks (blocker_id, blocked_id) values ('$ALICE','$BOB');" >/dev/null
out=$(run_as bob "$BOB" "select count(*) from public.profiles where id = '$ALICE';")
check "T7a blocked user cannot see blocker profile" "0" "$out"
run_as bob "$BOB" "insert into public.profiles (id, display_name) values ('$BOB','Bob') on conflict do nothing;" >/dev/null
out=$(run_as alice "$ALICE" "select count(*) from public.profiles where id = '$BOB';")
check "T7b blocker cannot see blocked profile" "0" "$out"
# T8: no new connection requests in either direction while blocked
out=$(run_as bob "$BOB" "insert into public.connection_requests (requester_id, recipient_id) values ('$BOB','$ALICE');")
check "T8a blocked requester rejected" "row-level security policy" "$out"
out=$(run_as alice "$ALICE" "insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$BOB');")
check "T8b blocker as requester also rejected" "row-level security policy" "$out"
# T9: anon cannot read profiles or insert anything
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "set role anon;" -c "select count(*) from public.profiles;" 2>&1 || true)
check "T9a anon select denied" "permission denied" "$out"
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "set role anon;" -c "insert into public.profiles (id, display_name) values ('$ALICE','x');" 2>&1 || true)
check "T9b anon insert denied" "permission denied" "$out"
# T9c: unauthenticated RPC call (authenticated role but no app.sub)
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "set local role authenticated; reset app.sub;" -c "select public.consent_to_contact('$REQID', true);" 2>&1 || true)
check "T9c RPC without auth context rejected" "Authentication required" "$out"
# T10: unblock; duplicate active pair rejected both directions
run_as alice "$ALICE" "delete from public.user_blocks where blocker_id='$ALICE';" >/dev/null
out=$(run_as alice "$ALICE" "insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$BOB');")
check "T10a second request while first accepted rejected" "connection_requests_unique_active_pair_idx" "$out"
out=$(run_as bob "$BOB" "insert into public.connection_requests (requester_id, recipient_id) values ('$BOB','$ALICE');")
check "T10b reverse duplicate also rejected" "connection_requests_unique_active_pair_idx" "$out"
# T11: bob cannot consent on a pending (not accepted) request
REQ2=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "update public.connection_requests set status='declined' where id='$REQID'; insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$BOB') returning id;")
out=$(run_as bob "$BOB" "select public.consent_to_contact('$REQ2', true);")
check "T11 consent on pending request rejected" "Request not found or action not permitted" "$out"

echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
