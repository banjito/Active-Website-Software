-- Interested parties for issue reports
-- Users who want to be notified when an issue is resolved

create table if not exists common.issue_interested_parties (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references common.issue_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(issue_id, user_id)
);

create index if not exists idx_issue_interested_parties_issue on common.issue_interested_parties(issue_id);

grant usage on schema common to service_role;
grant select, insert, delete on common.issue_interested_parties to authenticated;
grant select on common.issue_interested_parties to anon;
grant select on common.issue_interested_parties to service_role;
