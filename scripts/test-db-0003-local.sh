#!/usr/bin/env bash
# Local execution tests for 0003 (private interests + gated contact disclosure).
# Same Supabase emulation as test-db-local.sh: auth.users, auth.uid() via app.sub GUC.
set -euo pipefail
PGBIN=${PGBIN:-/tmp/pgsrv/root/usr/lib/postgresql/14/bin}
DATA=/tmp/chavruta-pgdata-0003
SOCK=/tmp/chavruta-pgsock-0003
DB=chavruta_test_0003
export LD_LIBRARY_PATH="/tmp/pgsrv/root/usr/lib/postgresql/14/lib:${LD_LIBRARY_PATH:-}"

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
"$PGBIN/initdb" -D "$DATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l /tmp/chavruta-pg-0003.log -w start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT

createdb -h "$SOCK" -U postgres "$DB"
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q << 'SQL'
create role anon nologin;
create role authenticated nologin;
create role alice login password 'x';
create role bob login password 'x';
grant authenticated to alice; grant anon to alice; grant authenticated to bob;
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
for f in supabase/migrations/0001_initial_schema.sql supabase/migrations/0002_contact_consent_and_blocks.sql supabase/migrations/0003_private_interests_and_contact_disclosure.sql supabase/migrations/0004_gender_separation.sql; do
  psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done

ALICE=11111111-1111-1111-1111-111111111111
BOB=22222222-2222-2222-2222-222222222222
run_as() { local role="$1" sub="$2" sql="$3"
  psql -h "$SOCK" -U "$role" -d "$DB" -v ON_ERROR_STOP=1 -X -qAt \
    -c "set app.sub = '$sub';" -c "$sql" 2>&1 || true; }
pass=0; fail=0
check() { if echo "$3" | grep -qF "$2"; then echo "ok - $1"; pass=$((pass+1));
  else echo "FAIL - $1"; echo "  expected: $2"; echo "  got: $3"; fail=$((fail+1)); fi; }

run_as alice "$ALICE" "insert into public.profiles (id, display_name, gender) values ('$ALICE','Alice','man');" >/dev/null
run_as bob "$BOB" "insert into public.profiles (id, display_name, gender) values ('$BOB','Bob','man');" >/dev/null

# U1: one-sided interest is invisible to the other side
run_as alice "$ALICE" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$ALICE','$BOB',true);" >/dev/null
out=$(run_as bob "$BOB" "select count(*) from public.interest_selections;")
check "U1 bob cannot read alice's selection" "0" "$out"
out=$(run_as bob "$BOB" "select count(*) from public.list_my_matches();")
check "U2 one-sided interest yields no match" "0" "$out"

# U3: mutual interest produces a match for both
run_as bob "$BOB" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$BOB','$ALICE',true);" >/dev/null
out=$(run_as alice "$ALICE" "select candidate_id from public.list_my_matches();")
check "U3a alice sees mutual match" "$BOB" "$out"
out=$(run_as bob "$BOB" "select candidate_id from public.list_my_matches();")
check "U3b bob sees mutual match" "$ALICE" "$out"

# U4: negative selection never matches
run_as bob "$BOB" "update public.interest_selections set interested=false where viewer_id='$BOB';"
out=$(run_as alice "$ALICE" "select count(*) from public.list_my_matches();")
check "U4 bob's withdrawal removes the match" "0" "$out"
run_as bob "$BOB" "update public.interest_selections set interested=true where viewer_id='$BOB';" >/dev/null

# U5: contact methods private to owner
run_as bob "$BOB" "insert into public.contact_methods (user_id, kind, value, is_primary) values ('$BOB','phone','0501234567',true);" >/dev/null
out=$(run_as alice "$ALICE" "select count(*) from public.contact_methods;")
check "U5 alice cannot read bob's contact methods" "0" "$out"

# U6: contact disclosure gate - full happy path via accepted request + both consents
REQID=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$BOB') returning id;")
out=$(run_as alice "$ALICE" "select kind, value from public.get_connection_contact('$REQID');")
check "U6a contact denied while pending" "Contact not available" "$out"
run_as bob "$BOB" "select public.respond_to_connection_request('$REQID','accepted');" >/dev/null
run_as bob "$BOB" "select public.consent_to_contact('$REQID', true);" >/dev/null
out=$(run_as alice "$ALICE" "select kind, value from public.get_connection_contact('$REQID');")
check "U6b contact denied with only one consent" "Contact not available" "$out"
run_as alice "$ALICE" "select public.consent_to_contact('$REQID', true);" >/dev/null
out=$(run_as alice "$ALICE" "select value from public.get_connection_contact('$REQID');")
check "U6c contact revealed after mutual consent" "0501234567" "$out"
out=$(run_as bob "$BOB" "select count(*) from public.get_connection_contact('$REQID');")
check "U6d other side sees zero rows when requester has no methods" "0" "$out"

# U7: consent revocation closes disclosure again
run_as bob "$BOB" "select public.consent_to_contact('$REQID', false);" >/dev/null
out=$(run_as alice "$ALICE" "select kind, value from public.get_connection_contact('$REQID');")
check "U7 revoked consent re-blocks contact" "Contact not available" "$out"
run_as bob "$BOB" "select public.consent_to_contact('$REQID', true);" >/dev/null

# U8: block closes everything, even after full consent
run_as bob "$BOB" "insert into public.user_blocks (blocker_id, blocked_id) values ('$BOB','$ALICE');" >/dev/null
out=$(run_as alice "$ALICE" "select kind, value from public.get_connection_contact('$REQID');")
check "U8a block re-blocks contact despite consents" "Contact not available" "$out"
out=$(run_as alice "$ALICE" "select count(*) from public.list_my_matches();")
check "U8b block hides existing match" "0" "$out"
out=$(run_as alice "$ALICE" "update public.interest_selections set interested=false where viewer_id='$ALICE'; select count(*) from public.interest_selections where viewer_id='$ALICE';")
check "U8c viewer can still withdraw own selection while blocked" "1" "$out"
run_as bob "$BOB" "delete from public.user_blocks where blocker_id='$BOB';" >/dev/null

# U9: interest insert blocked against a blocker
run_as bob "$BOB" "insert into public.user_blocks (blocker_id, blocked_id) values ('$BOB','$ALICE');" >/dev/null
run_as alice "$ALICE" "delete from public.interest_selections where viewer_id='$ALICE';" >/dev/null
out=$(run_as alice "$ALICE" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$ALICE','$BOB',true);")
check "U9 interest insert rejected when blocked" "row-level security policy" "$out"
run_as bob "$BOB" "delete from public.user_blocks where blocker_id='$BOB';" >/dev/null

# U10: third party / anon paths
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "set role anon;" -c "select count(*) from public.interest_selections;" 2>&1 || true)
check "U10a anon reads no selections" "permission denied" "$out"
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "set role anon;" -c "select * from public.get_connection_contact('$REQID');" 2>&1 || true)
check "U10b anon contact RPC denied" "permission denied" "$out"
out=$(run_as alice "" "select * from public.get_connection_contact('$REQID');")
check "U10c no auth context rejected" "Authentication required" "$out"

echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
