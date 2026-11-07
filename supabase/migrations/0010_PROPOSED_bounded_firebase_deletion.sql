-- PROPOSAL ONLY. Do not apply before policy approval and rollout review.
-- Separate table leaves legacy Neon/deletion policy untouched.
create table auth.firebase_deletion_markers (
  auth_sub text primary key,
  deleted_at timestamptz not null default now()
);
revoke all on auth.firebase_deletion_markers from public, anon, authenticated;
