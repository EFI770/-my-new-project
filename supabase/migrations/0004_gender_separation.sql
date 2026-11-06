-- DRAFT (pending backend-vendor confirmation; Postgres/Supabase flavor).
-- 0004: mandatory same-gender learning separation.
-- Community rule (product owner, 2026-11-06): men learn with men, women with
-- women. Gender is self-declared at signup (man/woman); the platform does not
-- verify identity beyond that declaration. The separation is enforced in the
-- database layer, not in the UI:
--   * profiles, open study requests, interest selections, mutual matches,
--     connection requests and contact disclosure are restricted to same-gender
--     pairs;
--   * a missing gender (NULL) fails CLOSED: the user sees no one and no one
--     sees them, except their own profile/requests;
--   * changing gender severs every pending/accepted connection request and
--     deletes interest selections in both directions, so no cross-gender
--     connection or match can survive a change (AFTER UPDATE trigger).

alter table public.profiles
  add column if not exists gender text check (gender in ('man', 'woman'));

-- Caller's own gender (NULL when unset). Security definer so policies can use
-- it without recursing into the profiles policy.
create or replace function public.my_gender()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select gender from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_gender() from public, anon;
grant execute on function public.my_gender() to authenticated;

-- True only when both users declared a gender and they match.
create or replace function public.is_same_gender(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles a
      join public.profiles b on b.id = p_user_b and b.gender is not null and b.gender = a.gender
     where a.id = p_user_a
       and a.gender is not null
  );
$$;

revoke all on function public.is_same_gender(uuid, uuid) from public, anon;
grant execute on function public.is_same_gender(uuid, uuid) to authenticated;

-- Profiles: own row always readable (so /me works before gender is set);
-- every other profile only when same gender and not blocked.
drop policy if exists "authenticated members can view profiles" on public.profiles;
create policy "authenticated members can view profiles"
  on public.profiles for select to authenticated
  using (
    not public.is_blocked_between(auth.uid(), id)
    and (auth.uid() = id or (gender is not null and gender = public.my_gender()))
  );

-- Open study requests are visible only within the same gender; the owner
-- always sees their own requests in any state.
drop policy if exists "authenticated members can view open study requests" on public.study_requests;
create policy "authenticated members can view open study requests"
  on public.study_requests for select to authenticated
  using (
    auth.uid() = owner_id
    or (status = 'open' and public.is_same_gender(auth.uid(), owner_id))
  );

-- No cross-gender connection requests.
drop policy if exists "requester creates connection requests" on public.connection_requests;
create policy "requester creates connection requests"
  on public.connection_requests for insert to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> recipient_id
    and not public.is_blocked_between(requester_id, recipient_id)
    and public.is_same_gender(requester_id, recipient_id)
  );

-- No cross-gender interest selections.
drop policy if exists "viewer creates own selections" on public.interest_selections;
create policy "viewer creates own selections"
  on public.interest_selections for insert to authenticated
  with check (
    auth.uid() = viewer_id
    and viewer_id <> candidate_id
    and not public.is_blocked_between(viewer_id, candidate_id)
    and public.is_same_gender(viewer_id, candidate_id)
  );
drop policy if exists "viewer updates own selections" on public.interest_selections;
create policy "viewer updates own selections"
  on public.interest_selections for update to authenticated
  using (auth.uid() = viewer_id)
  with check (
    auth.uid() = viewer_id
    and viewer_id <> candidate_id
    and public.is_same_gender(viewer_id, candidate_id)
  );

-- Mutual matches: same-gender only, defense in depth on top of the severing
-- trigger (a match that somehow survived a gender change must not surface).
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
     and public.is_same_gender(s.viewer_id, s.candidate_id)
   order by matched_at desc;
$$;

revoke all on function public.list_my_matches() from public, anon;
grant execute on function public.list_my_matches() to authenticated;

-- Contact disclosure: same-gender required in addition to accepted + both
-- consents + no block. Same generic error, no signal about which check failed.
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
     or public.is_blocked_between(v_uid, v_other)
     or not public.is_same_gender(v_uid, v_other) then
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

-- Gender change severs: cancel every pending/accepted connection request the
-- user is part of (clearing both consent flags) and delete interest
-- selections in both directions. Runs as owner so RLS cannot weaken it; fires
-- on ANY gender update path. Study requests the user owns stay (they become
-- visible only to the new gender); blocks and reports are gender-agnostic and
-- stay too.
create or replace function public.on_profile_gender_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.gender is distinct from new.gender then
    update public.connection_requests
       set status = 'cancelled',
           requester_contact_consent = false,
           recipient_contact_consent = false,
           updated_at = now()
     where (requester_id = new.id or recipient_id = new.id)
       and status in ('pending', 'accepted');
    delete from public.interest_selections
     where viewer_id = new.id or candidate_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_gender_change on public.profiles;
create trigger profiles_gender_change
  after update of gender on public.profiles
  for each row execute function public.on_profile_gender_change();
