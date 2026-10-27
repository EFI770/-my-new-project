-- חברותא: initial secure schema foundation for Supabase/Postgres.
-- IMPORTANT: this migration is not wired into the current frontend. Do not invite real users until
-- the application uses these tables, RLS is tested, and production configuration is reviewed.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 1000),
  learning_topics text[] not null default '{}',
  learning_level text,
  preferred_modes text[] not null default '{}',
  available_days text[] not null default '{}',
  availability_notes text not null default '' check (char_length(availability_notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  topic text not null check (char_length(trim(topic)) between 1 and 120),
  learning_level text,
  preferred_modes text[] not null default '{}',
  available_days text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  study_request_id uuid references public.study_requests(id) on delete set null,
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_not_self check (requester_id <> recipient_id),
  constraint unique_active_connection_pair unique (requester_id, recipient_id, study_request_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint block_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  study_request_id uuid references public.study_requests(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 3 and 100),
  details text not null default '' check (char_length(details) <= 3000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint report_not_self check (reported_user_id is null or reporter_id <> reported_user_id)
);

create index if not exists study_requests_owner_idx on public.study_requests(owner_id);
create index if not exists study_requests_status_created_idx on public.study_requests(status, created_at desc);
create index if not exists connection_requests_recipient_status_idx on public.connection_requests(recipient_id, status);
create index if not exists user_reports_status_created_idx on public.user_reports(status, created_at desc);

alter table public.profiles enable row level security;
alter table public.study_requests enable row level security;
alter table public.connection_requests enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

-- Profiles are readable by authenticated members only. Users may write only their own profile.
create policy "authenticated members can view profiles"
  on public.profiles for select to authenticated using (true);
create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users delete own profile"
  on public.profiles for delete to authenticated using (auth.uid() = id);

-- Study requests are visible to authenticated members; only their owner can create/change/delete them.
create policy "authenticated members can view open study requests"
  on public.study_requests for select to authenticated using (status = 'open' or auth.uid() = owner_id);
create policy "users create own study requests"
  on public.study_requests for insert to authenticated with check (auth.uid() = owner_id);
create policy "users update own study requests"
  on public.study_requests for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "users delete own study requests"
  on public.study_requests for delete to authenticated using (auth.uid() = owner_id);

-- Connection participants can read their own requests. Requester creates; recipient may accept/decline.
create policy "participants read connection requests"
  on public.connection_requests for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
create policy "requester creates connection requests"
  on public.connection_requests for insert to authenticated
  with check (auth.uid() = requester_id and requester_id <> recipient_id);
-- No direct UPDATE policy: participants must use the checked RPC below so they cannot
-- rewrite the other participant's ID or change protected fields.
create or replace function public.respond_to_connection_request(p_request_id uuid, p_decision text)
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
  if p_decision not in ('accepted', 'declined', 'cancelled') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  if p_decision = 'cancelled' then
    update public.connection_requests
       set status = 'cancelled', updated_at = now()
     where id = p_request_id
       and requester_id = v_user_id
       and status = 'pending';
  else
    update public.connection_requests
       set status = p_decision, updated_at = now()
     where id = p_request_id
       and recipient_id = v_user_id
       and status = 'pending';
  end if;

  if not found then
    raise exception 'Request not found or action not permitted' using errcode = '42501';
  end if;
end;
$;

revoke all on function public.respond_to_connection_request(uuid, text) from public, anon;
grant execute on function public.respond_to_connection_request(uuid, text) to authenticated;
create policy "requester deletes own connection requests"
  on public.connection_requests for delete to authenticated using (auth.uid() = requester_id);

-- Users may manage only blocks they create. Block data is private to the blocker.
create policy "users read own blocks"
  on public.user_blocks for select to authenticated using (auth.uid() = blocker_id);
create policy "users create own blocks"
  on public.user_blocks for insert to authenticated with check (auth.uid() = blocker_id and blocker_id <> blocked_id);
create policy "users delete own blocks"
  on public.user_blocks for delete to authenticated using (auth.uid() = blocker_id);

-- Reports are private to the reporter. No client policy can read or update the moderation queue.
create policy "reporter can create report"
  on public.user_reports for insert to authenticated with check (auth.uid() = reporter_id);
create policy "reporter can read own reports"
  on public.user_reports for select to authenticated using (auth.uid() = reporter_id);

-- Do not grant anonymous access. Do not expose service_role keys in browser code.
revoke all on public.profiles, public.study_requests, public.connection_requests, public.user_blocks, public.user_reports from anon;
