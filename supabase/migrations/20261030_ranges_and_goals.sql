-- 장지연 워크캘린더: 연속 일정과 연간·월간 목표
-- 기존 calendar_tasks와 사용자 데이터를 유지하는 재실행 가능한 추가 마이그레이션입니다.
begin;

-- NULL은 기존 단일 날짜 일정과 호환됩니다. 종료일은 포함되는 마지막 날짜입니다.
alter table public.calendar_tasks
  add column if not exists end_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calendar_tasks'::regclass
      and conname = 'calendar_tasks_end_date_check'
  ) then
    alter table public.calendar_tasks
      add constraint calendar_tasks_end_date_check
      check (end_date is null or end_date >= task_date);
  end if;
end
$$;

create index if not exists calendar_tasks_user_end_date_idx
  on public.calendar_tasks (user_id, end_date)
  where end_date is not null;

create table if not exists public.calendar_goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  period_type text not null,
  period_key text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_goals_title_length
    check (char_length(title) between 1 and 120),
  constraint calendar_goals_period_type_check
    check (period_type in ('year', 'month')),
  constraint calendar_goals_period_key_check check (
    (period_type = 'year' and period_key ~ '^[0-9]{4}$')
    or (period_type = 'month' and period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
  )
);

create index if not exists calendar_goals_user_period_idx
  on public.calendar_goals (user_id, period_type, period_key, created_at);

create or replace function public.set_calendar_goals_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_calendar_goals_updated_at on public.calendar_goals;
create trigger set_calendar_goals_updated_at
before update on public.calendar_goals
for each row
execute function public.set_calendar_goals_updated_at();

alter table public.calendar_goals enable row level security;
revoke all on table public.calendar_goals from public, anon, authenticated;
grant select, insert, update, delete on table public.calendar_goals to authenticated;

drop policy if exists "calendar_goals_select_own" on public.calendar_goals;
create policy "calendar_goals_select_own"
on public.calendar_goals for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "calendar_goals_insert_own" on public.calendar_goals;
create policy "calendar_goals_insert_own"
on public.calendar_goals for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "calendar_goals_update_own" on public.calendar_goals;
create policy "calendar_goals_update_own"
on public.calendar_goals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "calendar_goals_delete_own" on public.calendar_goals;
create policy "calendar_goals_delete_own"
on public.calendar_goals for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.calendar_goals replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and puballtables = false
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_goals'
  ) then
    execute 'alter publication supabase_realtime add table public.calendar_goals';
  end if;
end
$$;

-- Ask PostgREST to make the new column and table available after the commit.
notify pgrst, 'reload schema';

commit;
