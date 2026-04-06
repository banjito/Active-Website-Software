-- Technician Scheduling Core Schema (neta_ops)
-- NEVER DROP TABLE

-- 1) Weekly availability per technician
create table if not exists neta_ops.technician_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  recurring boolean not null default true,
  portal_type text not null, -- e.g. 'neta', 'lab', 'scavenger'
  division text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tech_avail_user_day on neta_ops.technician_availability(user_id, day_of_week);

-- 2) Date-specific exceptions (PTO, special hours)
create table if not exists neta_ops.technician_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exception_date date not null,
  is_available boolean not null default false,
  start_time time default null,
  end_time time default null,
  reason text default null,
  portal_type text not null,
  division text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_partial_time check (
    (is_available and start_time is not null and end_time is not null)
    or
    ((not is_available) and start_time is null and end_time is null)
  )
);

create index if not exists idx_tech_exc_user_date on neta_ops.technician_exceptions(user_id, exception_date);

-- 3) Technician job assignments
create table if not exists neta_ops.technician_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references neta_ops.jobs(id) on delete cascade,
  assignment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled', -- scheduled|in-progress|completed|cancelled
  notes text default null,
  portal_type text not null,
  division text default null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tech_assign_user_date on neta_ops.technician_assignments(user_id, assignment_date);
create index if not exists idx_tech_assign_job on neta_ops.technician_assignments(job_id);

-- 4) Readable view of available technicians (joins auth.users meta where possible)
drop view if exists neta_ops.available_technicians;
create view neta_ops.available_technicians as
select 
  ua.user_id,
  coalesce((u.raw_user_meta_data->>'name'), u.email) as full_name,
  u.email,
  ua.division,
  ua.portal_type,
  ua.day_of_week,
  ua.start_time,
  ua.end_time
from neta_ops.technician_availability ua
join auth.users u on u.id = ua.user_id;

-- 5) Simple RLS enablement (read for authenticated; write via service role/UI)
alter table neta_ops.technician_availability enable row level security;
alter table neta_ops.technician_exceptions enable row level security;
alter table neta_ops.technician_assignments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='technician_assignments' and policyname='tech_assignments_select'
  ) then
    create policy tech_assignments_select on neta_ops.technician_assignments for select
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='technician_availability' and policyname='tech_availability_select'
  ) then
    create policy tech_availability_select on neta_ops.technician_availability for select
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='neta_ops' and tablename='technician_exceptions' and policyname='tech_exceptions_select'
  ) then
    create policy tech_exceptions_select on neta_ops.technician_exceptions for select
      using (true);
  end if;
end $$;

-- 6) Helper function for skill/availability matching (stub - can refine later)
create or replace function neta_ops.find_available_technicians(
  job_id uuid,
  assignment_date date,
  start_time time,
  end_time time,
  portal text
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  division text,
  skill_match_score int,
  availability_conflicts text[]
) language sql as $$
  with base as (
    select a.user_id, u.email, (u.raw_user_meta_data->>'name') as full_name, a.division
    from common.technician_availability a
    join auth.users u on u.id = a.user_id
    where a.portal_type = portal
      and a.day_of_week = extract(dow from assignment_date)
      and a.start_time <= start_time and a.end_time >= end_time
  )
  select b.user_id, b.full_name, b.email, b.division,
         100 as skill_match_score,
         array[]::text[] as availability_conflicts
  from base b;
$$;


