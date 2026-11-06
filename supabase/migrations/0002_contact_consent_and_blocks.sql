-- DRAFT (pending backend-vendor confirmation; Postgres/Supabase flavor).
-- 0002: bilateral contact consent + real block enforcement.
-- Blocks live behind RLS (private to the blocker), so policies must NOT
-- subquery user_blocks directly - the viewer cannot see the other side's
-- block rows and the check would silently pass. The security-definer helper
-- is_blocked_between evaluates blocks as the table owner instead.

create or replace function public.is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
       or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
  );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

alter table public.connection_requests
  add column if not exists requester_contact_consent boolean not null default false,
  add column if not exists recipient_contact_consent boolean not null default false;

-- 0001's unique (requester_id, recipient_id, study_request_id) does not stop
-- duplicates: NULL study_request_id rows are always distinct in a btree unique
-- index, and (A,B) vs (B,A) are different keys. Close both with a partial
-- unique index over the unordered pair while the request is active.
create unique index if not exists connection_requests_unique_active_pair_idx
  on public.connection_requests (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending', 'accepted');

-- Each participant sets ONLY their own consent flag, only on accepted requests.
create or replace function public.consent_to_contact(p_request_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.connection_requests
     set requester_contact_consent = p_consent, updated_at = now()
   where id = p_request_id
     and requester_id = v_user_id
     and status = 'accepted';

  if not found then
    update public.connection_requests
       set recipient_contact_consent = p_consent, updated_at = now()
     where id = p_request_id
       and recipient_id = v_user_id
       and status = 'accepted';
  end if;

  if not found then
    raise exception 'Request not found or action not permitted' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.consent_to_contact(uuid, boolean) from public, anon;
grant execute on function public.consent_to_contact(uuid, boolean) to authenticated;

-- Blocks now actually block: no new connection request in either direction
-- when a block exists between the two users.
drop policy if exists "requester creates connection requests" on public.connection_requests;
create policy "requester creates connection requests"
  on public.connection_requests for insert to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> recipient_id
    and not public.is_blocked_between(requester_id, recipient_id)
  );

-- Blocked users no longer see each other's profile cards, in both directions.
drop policy if exists "authenticated members can view profiles" on public.profiles;
create policy "authenticated members can view profiles"
  on public.profiles for select to authenticated
  using (not public.is_blocked_between(auth.uid(), id));
