-- Keep known acceptance fixtures and their relationships intact but isolated
-- from real members. New accounts are real unless privately marked otherwise.
create table if not exists auth.synthetic_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on auth.synthetic_members from public, anon, authenticated;

create or replace function public.same_population(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=a)
     and exists(select 1 from public.profiles where id=b)
     and (exists(select 1 from auth.synthetic_members where user_id=a)
          = exists(select 1 from auth.synthetic_members where user_id=b));
$$;
revoke all on function public.same_population(uuid,uuid) from public, anon;
grant execute on function public.same_population(uuid,uuid) to authenticated;

create policy "isolate fixture profiles" on public.profiles as restrictive
  for select to authenticated using (public.same_population(auth.uid(),id));
create policy "isolate fixture study requests" on public.study_requests as restrictive
  for select to authenticated using (public.same_population(auth.uid(),owner_id));
create policy "isolate fixture interests" on public.interest_selections as restrictive
  for all to authenticated using (public.same_population(viewer_id,candidate_id))
  with check (public.same_population(viewer_id,candidate_id));
create policy "isolate fixture connections" on public.connection_requests as restrictive
  for all to authenticated using (public.same_population(requester_id,recipient_id))
  with check (public.same_population(requester_id,recipient_id));

-- Security-definer respond/consent RPCs bypass RLS, so guard their writes too.
create or replace function public.guard_connection_population()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.same_population(new.requester_id,new.recipient_id) then
    raise exception 'Action not permitted' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger connection_population_guard before insert or update on public.connection_requests
  for each row execute function public.guard_connection_population();

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
     and public.same_population(s.viewer_id, s.candidate_id)
   order by matched_at desc;
$$;

revoke all on function public.list_my_matches() from public, anon;
grant execute on function public.list_my_matches() to authenticated;


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
     or not public.is_same_gender(v_uid, v_other)
     or not public.same_population(v_uid, v_other) then
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

