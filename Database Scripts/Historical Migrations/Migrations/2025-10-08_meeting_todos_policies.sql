-- RLS policies for neta_ops.meeting_todos
-- NEVER DROP TABLE

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

alter table if exists neta_ops.meeting_todos enable row level security;

-- Select: only owner
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_todos' and policyname='meeting_todos_select_own'
  ) then
    create policy meeting_todos_select_own on neta_ops.meeting_todos
      for select using (user_id = auth.uid());
  end if;
end $$;

-- Insert: only as self
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_todos' and policyname='meeting_todos_insert_self'
  ) then
    create policy meeting_todos_insert_self on neta_ops.meeting_todos
      for insert with check (user_id = auth.uid());
  end if;
end $$;

-- Update: only owner
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_todos' and policyname='meeting_todos_update_own'
  ) then
    create policy meeting_todos_update_own on neta_ops.meeting_todos
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- Delete: only owner
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_todos' and policyname='meeting_todos_delete_own'
  ) then
    create policy meeting_todos_delete_own on neta_ops.meeting_todos
      for delete using (user_id = auth.uid());
  end if;
end $$;


