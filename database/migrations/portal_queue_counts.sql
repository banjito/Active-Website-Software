-- Tab counts for the home page work queue (/portal2, PortalWorkQueue.tsx).
--
-- One request instead of loading all four lists just to count them. Each
-- number is a count of JOBS (not reports), using the same rules as the lists
-- in src/components/shortcuts/*Shortcuts.tsx:
--   review   = jobs with a report in status 'ready_for_review'
--   issue    = jobs with a report in status 'issue'
--   approved = jobs with a report in status 'approved'
--   action   = jobs with an action item in status 'unaddressed'
-- Deleted jobs are skipped. Runs with the caller's own permissions
-- (security invoker), same as the lists themselves.
--
-- Safe to re-run. Creating a function does not lock any tables.

create or replace function neta_ops.get_portal_queue_counts()
returns table (
  review_jobs   integer,
  issue_jobs    integer,
  action_jobs   integer,
  approved_jobs integer
)
language sql
stable
security invoker
set search_path = neta_ops, pg_temp
as $$
  with status_jobs as (
    select a.status::text as status, count(distinct ja.job_id)::integer as jobs
    from neta_ops.assets a
    join neta_ops.job_assets ja on ja.asset_id = a.id
    join neta_ops.jobs j on j.id = ja.job_id and j.deleted_at is null
    where a.status::text in ('ready_for_review', 'issue', 'approved')
    group by a.status::text
  )
  select
    coalesce((select jobs from status_jobs where status = 'ready_for_review'), 0),
    coalesce((select jobs from status_jobs where status = 'issue'), 0),
    (
      select count(distinct ai.job_id)::integer
      from neta_ops.report_action_items ai
      join neta_ops.jobs j on j.id = ai.job_id and j.deleted_at is null
      where ai.status::text = 'unaddressed'
    ),
    coalesce((select jobs from status_jobs where status = 'approved'), 0);
$$;

revoke all on function neta_ops.get_portal_queue_counts() from public, anon;
grant execute on function neta_ops.get_portal_queue_counts() to authenticated;
