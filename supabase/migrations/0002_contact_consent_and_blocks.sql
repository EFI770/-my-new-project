-- DRAFT (pending backend-vendor confirmation; Postgres/Supabase flavor).
-- 0002: bilateral contact consent + block enforcement.
-- Builds on 0001 patterns: checked security-definer RPCs, RLS, no contact
-- details stored in the database. Consent flags can only be set by the
-- participant they belong to, only after mutual acceptance.

alter table public.connection_requests
  add column if not exists requester_contact_consent boolean not null default false,
  add column if not exists recipient_contact_consent boolean not null default false;

-- Each participant sets ONLY their own consent flag, only on accepted requests.
create or replace function public.consent_to_contact(p_request_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $
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
$;

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
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = recipient_id and b.blocked_id = requester_id)
         or (b.blocker_id = requester_id and b.blocked_id = recipient_id)
    )
  );

-- A user who blocked someone no longer sees that person's profile card,
-- and their own profile is hidden from the person they blocked.
drop policy if exists "authenticated members can view profiles" on public.profiles;
create policy "authenticated members can view profiles"
  on public.profiles for select to authenticated
  using (
    not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
         or (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
    )
  );
