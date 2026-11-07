-- Owner-approved bounded Firebase deletion policy,2026-11-07.
-- Separate table leaves legacy Neon/deletion policy untouched.
create table auth.firebase_deletion_markers (
  auth_sub text primary key,
  deleted_at timestamptz not null default now()
);
revoke all on auth.firebase_deletion_markers from public, anon, authenticated;
