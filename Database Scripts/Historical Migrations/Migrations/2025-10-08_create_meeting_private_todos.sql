-- Private (personal) To-Dos for Runway
-- NEVER DROP TABLE

create schema if not exists neta_ops;

create table if not exists neta_ops.meeting_private_todos (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  user_id uuid not null,
  due_date date null,
  status text not null default 'open' check (status in ('open','done','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists neta_ops.meeting_private_todos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_private_todos' and policyname='private_todos_select_own'
  ) then
    create policy private_todos_select_own on neta_ops.meeting_private_todos for select using (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_private_todos' and policyname='private_todos_insert_self'
  ) then
    create policy private_todos_insert_self on neta_ops.meeting_private_todos for insert with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_private_todos' and policyname='private_todos_update_own'
  ) then
    create policy private_todos_update_own on neta_ops.meeting_private_todos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='meeting_private_todos' and policyname='private_todos_delete_own'
  ) then
    create policy private_todos_delete_own on neta_ops.meeting_private_todos for delete using (user_id = auth.uid());
  end if;
end $$;


