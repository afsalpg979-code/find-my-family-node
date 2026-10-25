-- Find My Family: account-scoped cloud contact books and chat ordering.
-- Run after migrations 001 and 002 in Supabase SQL Editor.

create table if not exists public.contact_books (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.contact_books enable row level security;
revoke all on table public.contact_books from anon, authenticated;
grant select, insert, update, delete on table public.contact_books to authenticated;

drop policy if exists "Users manage their own contact book" on public.contact_books;
create policy "Users manage their own contact book"
  on public.contact_books for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Keep chat lists ordered by the newest message.
create or replace function public.fmf_bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists fmf_message_bumps_conversation on public.messages;
create trigger fmf_message_bumps_conversation
  after insert on public.messages
  for each row execute function public.fmf_bump_conversation_last_message();
