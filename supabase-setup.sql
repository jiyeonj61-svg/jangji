-- 장지연 워크캘린더: Supabase 데이터베이스·보안·Realtime 설정
-- Supabase Dashboard → SQL Editor → New query에 전체를 붙여넣고 Run을 누르세요.

create table if not exists public.calendar_tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  task_date date not null,
  category text not null default 'work',
  memo text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_tasks_title_length check (char_length(title) between 1 and 80),
  constraint calendar_tasks_memo_length check (char_length(memo) <= 500),
  constraint calendar_tasks_category_check check (category in ('work', 'meeting', 'deadline', 'personal'))
);

create index if not exists calendar_tasks_user_date_idx
  on public.calendar_tasks (user_id, task_date, created_at);

create or replace function public.set_calendar_tasks_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_calendar_tasks_updated_at on public.calendar_tasks;
create trigger set_calendar_tasks_updated_at
before update on public.calendar_tasks
for each row
execute function public.set_calendar_tasks_updated_at();

alter table public.calendar_tasks enable row level security;
revoke all on table public.calendar_tasks from anon;
grant select, insert, update, delete on table public.calendar_tasks to authenticated;

drop policy if exists "calendar_tasks_select_own" on public.calendar_tasks;
create policy "calendar_tasks_select_own"
on public.calendar_tasks for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "calendar_tasks_insert_own" on public.calendar_tasks;
create policy "calendar_tasks_insert_own"
on public.calendar_tasks for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "calendar_tasks_update_own" on public.calendar_tasks;
create policy "calendar_tasks_update_own"
on public.calendar_tasks for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "calendar_tasks_delete_own" on public.calendar_tasks;
create policy "calendar_tasks_delete_own"
on public.calendar_tasks for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.calendar_tasks replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and puballtables = false
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.calendar_tasks';
  end if;
end
$$;
