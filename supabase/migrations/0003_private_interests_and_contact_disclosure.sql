-- DRAFT (pending backend-vendor confirmation; Postgres/Supabase flavor).
-- 0003: private interest selections + separated contact methods + gated contact disclosure.
-- Privacy model (docs/PRIVACY_FIRST_MATCHING.md):
--  * A viewer's interest selection is private to that viewer (RLS, own rows only).
--  * A mutual match is revealed only through the security-definer list_my_matches(),
--    which returns pairs where BOTH sides selected interest. One-sided interest of
--    another user is never readable.
--  * Contact details live in a separate table readable only by their owner.
--    The only path to someone else's contact is get_connection_contact(), which
--    requires an accepted connection request, BOTH consent flags, and no block.

create table if not exists public.interest_selections (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  interested boolean not null,
  updated_at timestamptz not null default now(),
  primary key (viewer_id, candidate_id),
  constraint interest_not_self check (viewer_id <> candidate_id)
);

alter table public.interest_selections enable row level security;

-- Selections are private: a user sees and changes only their own rows.
create policy "viewer reads own selections"
  on public.interest_selections for select to authenticated
  using (auth.uid() = viewer_id);
create policy "viewer creates own selections"
  on public.interest_selections for insert to authenticated
  with check (
    auth.uid() = viewer_id
    and viewer_id <> candidate_id
    and not public.is_blocked_between(viewer_id, candidate_id)
  );
create policy "viewer updates own selections"
  on public.interest_selections for update to authenticated
  using (auth.uid() = viewer_id)
  with check (auth.uid() = viewer_id and viewer_id <> candidate_id);
create policy "viewer deletes own selections"
  on public.interest_selections for delete to authenticated
  using (auth.uid() = viewer_id);

-- Mutual matches only. Never exposes one-sided interest: a row appears in the
-- result only when the reciprocal selection exists and is positive. Blocks hide
-- the match in both directions even after it formed.
create or replace function public.list_my_matches()
returns table (candidate_id uuid, matched_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.candidate_id, greatest(s.updated_at, o.updated_at) as matched_at
    from public.interest_selections s
    join public.interest_selections o
      on o.viewer_id = s.candidate_id
     and o.candidate_id = s.viewer_id
     and o.interested
   where s.viewer_id = auth.uid()
     and s.interested
     and not public.is_blocked_between(s.viewer_id, s.candidate_id)
   order by matched_at desc;
$$;

revoke all on function public.list_my_matches() from public, anon;
grant execute on function public.list_my_matches() to authenticated;

-- Contact details are separated from the public profile and are private to their owner.
create table if not exists public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email', 'whatsapp', 'telegram')),
  value text not null check (char_length(trim(value)) between 3 and 200),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contact_methods_user_idx on public.contact_methods(user_id);

alter table public.contact_methods enable row level security;

create policy "owner reads own contact methods"
  on public.contact_methods for select to authenticated
  using (auth.uid() = user_id);
create policy "owner creates own contact methods"
  on public.contact_methods for insert to authenticated
  with check (auth.uid() = user_id);
create policy "owner updates own contact methods"
  on public.contact_methods for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner deletes own contact methods"
  on public.contact_methods for delete to authenticated
  using (auth.uid() = user_id);

-- The ONLY disclosure path for someone else's contact details.
-- Requires: caller is a participant, request accepted, BOTH consent flags set,
-- and no block in either direction. Anything else fails closed with the same
-- generic error so the response does not reveal which condition failed.
create or replace function public.get_connection_contact(p_request_id uuid)
returns table (kind text, value text, is_primary boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.connection_requests%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_req from public.connection_requests where id = p_request_id;
  if not found or (v_req.requester_id <> v_uid and v_req.recipient_id <> v_uid) then
    raise exception 'Contact not available' using errcode = '42501';
  end if;

  v_other := case when v_req.requester_id = v_uid then v_req.recipient_id else v_req.requester_id end;

  if v_req.status <> 'accepted'
     or not v_req.requester_contact_consent
     or not v_req.recipient_contact_consent
     or public.is_blocked_between(v_uid, v_other) then
    raise exception 'Contact not available' using errcode = '42501';
  end if;

  return query
    select m.kind, m.value, m.is_primary
      from public.contact_methods m
     where m.user_id = v_other
     order by m.is_primary desc, m.created_at asc;
end;
$$;

revoke all on function public.get_connection_contact(uuid) from public, anon;
grant execute on function public.get_connection_contact(uuid) to authenticated;

-- Explicit privileges for the new tables (RLS still decides row access).
revoke all on public.interest_selections, public.contact_methods from public, anon, authenticated;
grant select, insert, update, delete on public.interest_selections to authenticated;
grant select, insert, update, delete on public.contact_methods to authenticated;
