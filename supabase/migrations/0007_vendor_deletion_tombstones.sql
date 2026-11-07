-- חברותא 0007: vendor deletion tombstones. When a user deletes their account in
-- a vendor auth mode (Firebase/Neon), the vendor ID token can stay valid for up
-- to its expiry (~1h for Firebase) even after all app data is gone. Without a
-- tombstone, that still-valid token could immediately re-register the same
-- vendor subject, silently recreating an account the user just deleted.
-- Policy: a deleted vendor subject is tombstoned and CANNOT re-register while
-- the tombstone stands. A returning user asks the operator to clear the row
-- (pilot scale: a handful of users; the operator is reachable). Fail-closed.
create table if not exists auth.deleted_subs (
  auth_sub text primary key,
  deleted_at timestamptz not null default now()
);
-- No end-user access: RLS roles get nothing; the least-privilege runtime role
-- (where the vendor bootstrap 0005 ran) gets exactly what the API needs.
revoke all on auth.deleted_subs from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='chavruta_app') then
    grant select, insert on auth.deleted_subs to chavruta_app;
  end if;
end $$;
