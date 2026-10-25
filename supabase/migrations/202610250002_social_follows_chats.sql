-- Find My Family: logged-in user directory, follows, direct/group chats.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Signed-in users can view member profiles" on public.profiles;
create policy "Signed-in users can view member profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, update on public.profiles to authenticated;

create or replace function public.handle_new_fmf_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                          nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Member');
  insert into public.profiles(user_id, display_name)
  values (new.id, chosen_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_fmf_profile on auth.users;
create trigger on_auth_user_created_fmf_profile
  after insert on auth.users for each row execute function public.handle_new_fmf_user();

insert into public.profiles(user_id, display_name)
select u.id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
                      nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Member')
from auth.users u
on conflict (user_id) do nothing;

create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(user_id) on delete cascade,
  followed_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint user_follows_not_self check (follower_id <> followed_id)
);
alter table public.user_follows enable row level security;
drop policy if exists "Users view follow relationships involving them" on public.user_follows;
create policy "Users view follow relationships involving them" on public.user_follows
  for select to authenticated using ((select auth.uid()) = follower_id or (select auth.uid()) = followed_id);
drop policy if exists "Users follow from their own account" on public.user_follows;
create policy "Users follow from their own account" on public.user_follows
  for insert to authenticated with check ((select auth.uid()) = follower_id and follower_id <> followed_id);
drop policy if exists "Users unfollow from their own account" on public.user_follows;
create policy "Users unfollow from their own account" on public.user_follows
  for delete to authenticated using ((select auth.uid()) = follower_id);
grant select, insert, delete on public.user_follows to authenticated;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists fmf_messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists fmf_members_user_idx on public.conversation_members(user_id);
create index if not exists fmf_conversations_last_message_idx on public.conversations(last_message_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create or replace function public.fmf_is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
  );
$$;
revoke all on function public.fmf_is_conversation_member(uuid) from public;
grant execute on function public.fmf_is_conversation_member(uuid) to authenticated;

drop policy if exists "Members can view their conversations" on public.conversations;
create policy "Members can view their conversations" on public.conversations
  for select to authenticated using (public.fmf_is_conversation_member(id));
drop policy if exists "Members can view conversation membership" on public.conversation_members;
create policy "Members can view conversation membership" on public.conversation_members
  for select to authenticated using (public.fmf_is_conversation_member(conversation_id));
drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
  for select to authenticated using (public.fmf_is_conversation_member(conversation_id));
drop policy if exists "Members can send their own messages" on public.messages;
create policy "Members can send their own messages" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and public.fmf_is_conversation_member(conversation_id)
  );
grant select on public.conversations, public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

create or replace function public.fmf_create_conversation(
  p_title text,
  p_is_group boolean,
  p_member_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  conversation_id uuid;
  requested_ids uuid[];
  member_count integer;
begin
  if actor is null then raise exception 'Sign in is required'; end if;
  select array_agg(distinct ids.user_id) into requested_ids
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as ids(user_id)
  where ids.user_id is not null and ids.user_id <> actor;
  requested_ids := coalesce(requested_ids, array[]::uuid[]);
  member_count := coalesce(array_length(requested_ids, 1), 0);
  if p_is_group and member_count < 2 then raise exception 'A group chat needs at least two other members'; end if;
  if not p_is_group and member_count <> 1 then raise exception 'A direct chat needs exactly one other member'; end if;
  if exists (
    select 1 from unnest(requested_ids) requested(user_id)
    where not exists (select 1 from public.profiles p where p.user_id = requested.user_id)
  ) then raise exception 'One or more selected members are not registered'; end if;

  insert into public.conversations(title, is_group, created_by)
  values (
    case when p_is_group then coalesce(nullif(trim(p_title), ''), 'New group') else null end,
    p_is_group,
    actor
  ) returning id into conversation_id;

  insert into public.conversation_members(conversation_id, user_id, role)
  values (conversation_id, actor, 'admin');
  insert into public.conversation_members(conversation_id, user_id, role)
  select conversation_id, member_id, 'member' from unnest(requested_ids) member_id;
  return conversation_id;
end;
$$;
revoke all on function public.fmf_create_conversation(text, boolean, uuid[]) from public;
grant execute on function public.fmf_create_conversation(text, boolean, uuid[]) to authenticated;

-- Allow Supabase Realtime subscriptions for new chat messages if Realtime is enabled.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
