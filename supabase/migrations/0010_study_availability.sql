-- Optional preferences, no times invented for existing profiles/requests.
create or replace function public.valid_study_windows(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)<>'array' then false
 else jsonb_array_length(v)<=4 and not exists(
 select 1 from jsonb_array_elements(v) w where jsonb_typeof(w)<>'object'
 or coalesce(w->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or coalesce(w->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or w->>'start'=w->>'end') end;
$$;
alter table public.profiles add column available_windows jsonb not null default '[]'::jsonb check(public.valid_study_windows(available_windows));
alter table public.profiles add column study_duration_minutes integer check(study_duration_minutes in(15,30,45,60,90,120));
alter table public.study_requests add column available_windows jsonb not null default '[]'::jsonb check(public.valid_study_windows(available_windows));
alter table public.study_requests add column study_duration_minutes integer check(study_duration_minutes in(15,30,45,60,90,120));
-- All wall-clock windows use the community's Asia/Jerusalem time, including DST.
-- If end<start, window ends next day. Selected weekdays name the starting day.
