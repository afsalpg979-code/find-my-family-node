-- Find My Family: secure, expiring live-location links
-- Run this file in Supabase Dashboard > SQL Editor before using live sharing.

create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique,
  person_name text not null default 'Family member',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  active boolean not null default true,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.location_shares enable row level security;
revoke all on table public.location_shares from anon, authenticated;
grant select, insert, update, delete on table public.location_shares to authenticated;

drop policy if exists "Owners manage their own location shares" on public.location_shares;
create policy "Owners manage their own location shares"
  on public.location_shares for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create index if not exists location_shares_owner_id_idx
  on public.location_shares(owner_id);
create index if not exists location_shares_token_active_idx
  on public.location_shares(share_token, active, expires_at);

-- The token is a bearer secret: anyone holding it can view only that active share.
-- Keep this function's search_path empty and qualify every object name.
create or replace function public.get_shared_location(p_token text)
returns table (
  person_name text,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  updated_at timestamptz,
  expires_at timestamptz,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.person_name, s.latitude, s.longitude, s.accuracy_m,
         s.updated_at, s.expires_at, s.active
  from public.location_shares as s
  where s.share_token = p_token
    and s.active = true
    and s.expires_at > now()
  limit 1;
$$;

revoke execute on function public.get_shared_location(text) from public;
grant execute on function public.get_shared_location(text) to anon, authenticated;
