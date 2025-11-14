-- Create meeting_todos table for Runway (EOS) To-Dos
-- NEVER DROP TABLE

create schema if not exists neta_ops;

create table if not exists neta_ops.meeting_todos (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid null,
  meeting_id uuid null,
  title text not null,
  owner_id uuid null,
  due_date date null,
  status text not null default 'open' check (status in ('open','done','blocked')),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Simple updated_at trigger
create or replace function neta_ops.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_meeting_todos_set_updated_at'
  ) then
    create trigger trg_meeting_todos_set_updated_at
    before update on neta_ops.meeting_todos
    for each row execute function neta_ops.set_updated_at();
  end if;
end $$;


