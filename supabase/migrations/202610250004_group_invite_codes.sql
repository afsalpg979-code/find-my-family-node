-- Find My Family: Supabase-native group invitation codes.
-- Run after migrations 001, 002, and 003.

create table if not exists public.conversation_invites (
  invite_code text primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists fmf_conversation_invites_conversation_idx
  on public.conversation_invites(conversation_id, active, expires_at);

alter table public.conversation_invites enable row level security;
revoke all on table public.conversation_invites from anon, authenticated;

create or replace function public.fmf_create_group_invite(p_conversation_id uuid)
returns table(invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  generated_code text;
  expiry timestamptz := now() + interval '7 days';
begin
  if actor is null then raise exception 'Sign in is required'; end if;
  if not exists (
    select 1 from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = p_conversation_id and c.is_group = true and cm.user_id = actor
  ) then
    raise exception 'Only members of a group chat can create an invite';
  end if;

  loop
    generated_code := 'FMF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.conversation_invites i where i.invite_code = generated_code);
  end loop;

  insert into public.conversation_invites(invite_code, conversation_id, created_by, expires_at, active)
  values (generated_code, p_conversation_id, actor, expiry, true);
  return query select generated_code, expiry;
end;
$$;

create or replace function public.fmf_join_group_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  found_conversation uuid;
begin
  if actor is null then raise exception 'Sign in is required'; end if;
  select i.conversation_id into found_conversation
  from public.conversation_invites i
  join public.conversations c on c.id = i.conversation_id
  where upper(trim(i.invite_code)) = upper(trim(p_invite_code))
    and i.active = true and i.expires_at > now()
    and c.is_group = true
  limit 1;

  if found_conversation is null then raise exception 'Invite code is invalid or expired'; end if;

  insert into public.conversation_members(conversation_id, user_id, role)
  values (found_conversation, actor, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return found_conversation;
end;
$$;

revoke all on function public.fmf_create_group_invite(uuid) from public;
revoke all on function public.fmf_join_group_by_code(text) from public;
grant execute on function public.fmf_create_group_invite(uuid) to authenticated;
grant execute on function public.fmf_join_group_by_code(text) to authenticated;

-- A group may contain the creator plus one invited member (two people total).
create or replace function public.fmf_create_conversation(
  p_title text,
  p_is_group boolean,
  p_member_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  new_conversation_id uuid;
  requested_ids uuid[];
  member_count integer;
begin
  if actor is null then raise exception 'Sign in is required'; end if;
  select array_agg(distinct ids.user_id) into requested_ids
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as ids(user_id)
  where ids.user_id is not null and ids.user_id <> actor;
  requested_ids := coalesce(requested_ids, array[]::uuid[]);
  member_count := coalesce(array_length(requested_ids, 1), 0);
  if p_is_group and member_count < 1 then raise exception 'A group chat needs at least one other member'; end if;
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
  ) returning id into new_conversation_id;

  insert into public.conversation_members(conversation_id, user_id, role)
  values (new_conversation_id, actor, 'admin');
  insert into public.conversation_members(conversation_id, user_id, role)
  select new_conversation_id, member_id, 'member' from unnest(requested_ids) member_id;
  return new_conversation_id;
end;
$$;
revoke all on function public.fmf_create_conversation(text, boolean, uuid[]) from public;
grant execute on function public.fmf_create_conversation(text, boolean, uuid[]) to authenticated;
