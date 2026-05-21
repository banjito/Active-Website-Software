-- Issue Tracking Schema (Features & Fixes)
-- NOTE: NEVER DROP TABLES. Safe-create only.

-- Schema: common
create schema if not exists common;

-- Issue Reports
create table if not exists common.issue_reports (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed','duplicate','wontfix')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  page_url text,
  reporter_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Issue Updates / Timeline notes
create table if not exists common.issue_updates (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references common.issue_reports(id) on delete cascade,
  updater_id uuid references auth.users(id) on delete set null,
  note text,
  new_status text check (new_status in ('open','in_progress','resolved','closed','duplicate','wontfix')),
  created_at timestamptz not null default now()
);

-- Attachments
create table if not exists common.issue_attachments (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references common.issue_reports(id) on delete cascade,
  file_path text not null,
  file_url text,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_issue_reports_status on common.issue_reports(status);
create index if not exists idx_issue_reports_created_at on common.issue_reports(created_at desc);
create index if not exists idx_issue_updates_issue_id on common.issue_updates(issue_id, created_at);

-- Grants (No RLS). Allow authenticated users to read/write without policies
grant usage on schema common to authenticated, anon;
grant select, insert, update on common.issue_reports to authenticated;
grant select on common.issue_reports to anon;
grant select, insert on common.issue_updates to authenticated;
grant select on common.issue_updates to anon;
grant select, insert on common.issue_attachments to authenticated;
grant select on common.issue_attachments to anon;

-- Trigger to keep updated_at current
create or replace function common.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_issue_reports_updated_at on common.issue_reports;
create trigger trg_issue_reports_updated_at
before update on common.issue_reports
for each row execute procedure common.set_updated_at();

-- Business rule trigger: restrict who can mark complete and who can change priority
-- Only superusers (john.chambers@ampqes.com, jack.lyons@ampqes.com) may set status to resolved/closed
-- Admins may change priority
create or replace function common.enforce_issue_report_permissions()
returns trigger as $$
declare
  jwt jsonb;
  email text;
  role_claim text;
begin
  -- Extract jwt claims
  begin
    jwt := auth.jwt();
  exception when others then
    jwt := '{}'::jsonb;
  end;
  email := coalesce(jwt ->> 'email', '');
  role_claim := coalesce(jwt ->> 'role', '');

  -- If status is changing to a completed state, restrict to John
  if new.status is distinct from old.status and new.status in ('resolved','closed') then
    if not common.is_superuser_email(email) then
      raise exception 'Only authorized administrators can mark issues as complete';
    end if;
    -- Set resolved_at when moving to complete if not supplied
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;

  -- If priority changed, require Admin role
  if new.priority is distinct from old.priority then
    if role_claim <> 'Admin' then
      raise exception 'Only Admins can change priority';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_issue_reports_permission_check on common.issue_reports;
create trigger trg_issue_reports_permission_check
before update on common.issue_reports
for each row execute procedure common.enforce_issue_report_permissions();

-- RLS (optional; enable if desired)
-- alter table common.issue_reports enable row level security;
-- alter table common.issue_updates enable row level security;
-- alter table common.issue_attachments enable row level security;
--
-- Example simple policies (uncomment and adjust as needed):
-- create policy issue_reports_read for select on common.issue_reports using (true);
-- create policy issue_reports_insert for insert on common.issue_reports with check (auth.role() = 'authenticated');
-- create policy issue_updates_read for select on common.issue_updates using (true);
-- create policy issue_updates_insert for insert on common.issue_updates with check (auth.role() = 'authenticated');
-- create policy issue_attachments_read for select on common.issue_attachments using (true);
-- create policy issue_attachments_insert for insert on common.issue_attachments with check (auth.role() = 'authenticated');

-- Storage bucket expectation: use existing 'documents' bucket under path 'issues/{issue_id}/...'


