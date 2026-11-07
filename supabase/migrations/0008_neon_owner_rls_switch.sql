-- Atomic vendor signup uses the binding connection, then switches DOWN to
-- authenticated before inserting the user's profile. Neon grants its owner
-- ADMIN membership with SET FALSE, so membership alone is not enough.
-- Allow only that existing membership's role switch. No new table access,
-- no RLS change, and no INHERIT or ADMIN options changed.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'neondb_owner') then
    grant authenticated to neondb_owner with inherit false, set true;
  end if;
end $$;
