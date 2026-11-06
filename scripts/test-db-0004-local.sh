#!/usr/bin/env bash
# Local execution tests for 0004 (same-gender learning separation).
# Same Supabase emulation as test-db-local.sh: auth.users, auth.uid() via app.sub GUC.
set -euo pipefail
PGBIN=${PGBIN:-/tmp/pgsrv/root/usr/lib/postgresql/14/bin}
DATA=/tmp/chavruta-pgdata-0004
SOCK=/tmp/chavruta-pgsock-0004
DB=chavruta_test_0004
export LD_LIBRARY_PATH="/tmp/pgsrv/root/usr/lib/postgresql/14/lib:${LD_LIBRARY_PATH:-}"

rm -rf "$DATA" "$SOCK"; mkdir -p "$DATA" "$SOCK"
"$PGBIN/initdb" -D "$DATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l /tmp/chavruta-pg-0004.log -w start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT

createdb -h "$SOCK" -U postgres "$DB"
psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q << 'SQL'
create role anon nologin;
create role authenticated nologin;
create role alice login password 'x';
create role bob login password 'x';
create role carol login password 'x';
create role dave login password 'x';
create role noam login password 'x';
grant authenticated to alice; grant authenticated to bob; grant authenticated to carol;
grant authenticated to dave; grant authenticated to noam;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.sub', true), '')::uuid
$$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
SQL
for f in supabase/migrations/0001_initial_schema.sql supabase/migrations/0002_contact_consent_and_blocks.sql supabase/migrations/0003_private_interests_and_contact_disclosure.sql supabase/migrations/0004_gender_separation.sql; do
  psql -h "$SOCK" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done

ALICE=11111111-1111-1111-1111-111111111111  # woman
BOB=22222222-2222-2222-2222-222222222222    # man
CAROL=33333333-3333-3333-3333-333333333333  # woman
DAVE=44444444-4444-4444-4444-444444444444   # man
NOAM=55555555-5555-5555-5555-555555555555   # no gender declared

run_as() { local role="$1" sub="$2" sql="$3"
  psql -h "$SOCK" -U "$role" -d "$DB" -v ON_ERROR_STOP=1 -X -qAt \
    -c "set app.sub = '$sub';" -c "$sql" 2>&1 || true; }
pass=0; fail=0
check() { if echo "$3" | grep -qF "$2"; then echo "ok - $1"; pass=$((pass+1));
  else echo "FAIL - $1"; echo "  expected: $2"; echo "  got: $3"; fail=$((fail+1)); fi; }

run_as alice "$ALICE" "insert into public.profiles (id, display_name, gender) values ('$ALICE','Alice','woman');" >/dev/null
run_as bob "$BOB" "insert into public.profiles (id, display_name, gender) values ('$BOB','Bob','man');" >/dev/null
run_as carol "$CAROL" "insert into public.profiles (id, display_name, gender) values ('$CAROL','Carol','woman');" >/dev/null
run_as dave "$DAVE" "insert into public.profiles (id, display_name, gender) values ('$DAVE','Dave','man');" >/dev/null
run_as noam "$NOAM" "insert into public.profiles (id, display_name) values ('$NOAM','Noam');" >/dev/null

# G1/G2: visibility is same-gender only
out=$(run_as alice "$ALICE" "select count(*) from public.profiles where id <> '$ALICE';")
check "G1 alice (woman) sees only carol" "1" "$out"
out=$(run_as bob "$BOB" "select count(*) from public.profiles where id <> '$BOB';")
check "G2 bob (man) sees only dave" "1" "$out"
# G3/G4: missing gender fails closed both ways
out=$(run_as noam "$NOAM" "select count(*) from public.profiles where id <> '$NOAM';")
check "G3 genderless user sees no one" "0" "$out"
out=$(run_as alice "$ALICE" "select count(*) from public.profiles where id = '$NOAM';")
check "G4 genderless user invisible to others" "0" "$out"
out=$(run_as noam "$NOAM" "select coalesce(public.my_gender()::text,'NULL');")
check "G5 my_gender() NULL when unset" "NULL" "$out"
out=$(run_as noam "$NOAM" "select count(*) from public.profiles where id = '$NOAM';")
check "G6 genderless user still reads own profile" "1" "$out"

# G7-G10: interest selections same-gender only
out=$(run_as alice "$ALICE" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$ALICE','$BOB',true);")
check "G7 cross-gender interest rejected" "row-level security policy" "$out"
run_as alice "$ALICE" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$ALICE','$CAROL',true);" >/dev/null
run_as carol "$CAROL" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$CAROL','$ALICE',true);" >/dev/null
out=$(run_as alice "$ALICE" "select candidate_id from public.list_my_matches();")
check "G8 same-gender mutual match works" "$CAROL" "$out"
out=$(run_as noam "$NOAM" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$NOAM','$ALICE',true);")
check "G9 genderless interest rejected" "row-level security policy" "$out"
out=$(run_as alice "$ALICE" "insert into public.interest_selections (viewer_id, candidate_id, interested) values ('$ALICE','$NOAM',true);")
check "G10 interest toward genderless rejected" "row-level security policy" "$out"

# G11-G13: connection requests same-gender only
out=$(run_as alice "$ALICE" "insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$BOB');")
check "G11 cross-gender connection rejected" "row-level security policy" "$out"
out=$(run_as bob "$BOB" "insert into public.connection_requests (requester_id, recipient_id) values ('$BOB','$CAROL');")
check "G12 cross-gender connection rejected (reverse)" "row-level security policy" "$out"
REQID=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "insert into public.connection_requests (requester_id, recipient_id) values ('$ALICE','$CAROL') returning id;")
check "G13 same-gender connection created (setup)" "" ""

# G14: full contact-disclosure happy path within same gender
run_as carol "$CAROL" "insert into public.contact_methods (user_id, kind, value, is_primary) values ('$CAROL','phone','050-0000000',true);" >/dev/null
run_as carol "$CAROL" "select public.respond_to_connection_request('$REQID','accepted');" >/dev/null
run_as alice "$ALICE" "select public.consent_to_contact('$REQID', true);" >/dev/null
run_as carol "$CAROL" "select public.consent_to_contact('$REQID', true);" >/dev/null
out=$(run_as alice "$ALICE" "select value from public.get_connection_contact('$REQID');")
check "G14 same-gender contact disclosure works" "050-0000000" "$out"

# G15/G16: study requests same-gender only
run_as alice "$ALICE" "insert into public.study_requests (owner_id, title, topic) values ('$ALICE','תנ\"ך בבוקר','תנ\"ך');" >/dev/null
out=$(run_as carol "$CAROL" "select count(*) from public.study_requests where owner_id = '$ALICE';")
check "G15 same-gender study request visible" "1" "$out"
out=$(run_as bob "$BOB" "select count(*) from public.study_requests where owner_id = '$ALICE';")
check "G16 cross-gender study request hidden" "0" "$out"
run_as noam "$NOAM" "insert into public.study_requests (owner_id, title, topic) values ('$NOAM','משנה','משנה');" >/dev/null
out=$(run_as alice "$ALICE" "select count(*) from public.study_requests where owner_id = '$NOAM';")
check "G17 genderless-owned request hidden from all" "0" "$out"
out=$(run_as noam "$NOAM" "select count(*) from public.study_requests where owner_id = '$NOAM';")
check "G18 owner still sees own request" "1" "$out"
out=$(run_as noam "$NOAM" "select count(*) from public.study_requests where owner_id <> '$NOAM';")
check "G19 genderless user sees no requests" "0" "$out"

# G20: invalid gender value rejected
out=$(run_as dave "$DAVE" "update public.profiles set gender = 'other' where id = '$DAVE';")
check "G20 invalid gender rejected by check" "violates check constraint" "$out"

# G21-G28: gender is immutable once set (provisional fail-closed policy);
# existing ties stay fully intact; first-time NULL->value set is allowed
out=$(run_as alice "$ALICE" "update public.profiles set gender = 'man' where id = '$ALICE';")
check "G21 gender change rejected" "Gender change is not permitted" "$out"
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "select gender from public.profiles where id = '$ALICE';")
check "G22 gender unchanged after rejected update" "woman" "$out"
out=$(psql -h "$SOCK" -U postgres -d "$DB" -qAt -c "select status, requester_contact_consent, recipient_contact_consent from public.connection_requests where id = '$REQID';")
check "G23 accepted connection + consents intact" "accepted|t|t" "$out"
out=$(run_as carol "$CAROL" "select candidate_id from public.list_my_matches();")
check "G24 mutual match intact" "$ALICE" "$out"
out=$(run_as alice "$ALICE" "select value from public.get_connection_contact('$REQID');")
check "G25 contact disclosure still works" "050-0000000" "$out"
out=$(run_as alice "$ALICE" "select count(*) from public.profiles where id = '$CAROL';")
check "G26 same-gender visibility intact" "1" "$out"
out=$(run_as alice "$ALICE" "update public.profiles set gender = 'woman' where id = '$ALICE'; select gender from public.profiles where id = '$ALICE';")
check "G27 same-gender no-op update allowed" "woman" "$out"
out=$(run_as noam "$NOAM" "update public.profiles set gender = 'man' where id = '$NOAM'; select count(*) from public.profiles where id in ('$BOB','$DAVE');")
check "G28 first-time gender set allowed + opens same-gender visibility" "2" "$out"
out=$(run_as noam "$NOAM" "update public.profiles set gender = 'woman' where id = '$NOAM';")
check "G29 second change also rejected" "Gender change is not permitted" "$out"

echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
