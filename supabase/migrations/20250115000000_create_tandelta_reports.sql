-- Create tandelta_reports table for Tan Delta ATS reports
create table neta_ops.tandelta_reports (
  id uuid not null default extensions.uuid_generate_v4 (),
  job_id uuid not null,
  user_id uuid not null,
  report_info jsonb not null default '{}'::jsonb,
  test_data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint tandelta_reports_pkey primary key (id),
  constraint tandelta_reports_job_id_fkey foreign KEY (job_id) references neta_ops.jobs (id) on delete CASCADE,
  constraint tandelta_reports_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

-- Create index for job_id
create index IF not exists idx_tandelta_reports_job_id on neta_ops.tandelta_reports using btree (job_id) TABLESPACE pg_default;

-- Create trigger for updated_at
create trigger set_timestamp BEFORE
update on neta_ops.tandelta_reports for EACH row
execute FUNCTION neta_ops.handle_updated_at ();

-- Grant permissions
grant all on neta_ops.tandelta_reports to authenticated;
grant all on neta_ops.tandelta_reports to service_role;

