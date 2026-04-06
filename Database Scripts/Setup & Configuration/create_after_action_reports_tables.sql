-- After-Action Reports Tables
-- Creates tables for Technician Progress Reports and Admin Close-out Reports
-- NEVER DROP TABLE (per rules). Use IF NOT EXISTS guards.

create schema if not exists neta_ops;

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

-- Main after-action reports table
create table if not exists neta_ops.after_action_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  report_type text not null check (report_type in ('technician_progress', 'admin_closeout')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  
  -- Section A - Project Information (Technician)
  technician_name text,
  report_date date,
  project_job_number text,
  client_site_name text,
  phase_scope_completed text,
  crew_size_roles text,
  
  -- Section A - Safety & Incidents
  safety_incident boolean default false,
  incident_description text,
  near_misses_hazards text,
  
  -- Section A - Project Notes
  delays_encountered text,
  scope_changes text,
  equipment_issues text,
  coordination_issues text,
  
  -- Section A - Time Allocation (stored as JSONB for flexibility)
  time_allocation jsonb default '[]'::jsonb,
  -- Example: [{"category": "Setup / Break Down", "hours": 2}, {"category": "Re-tests / Repairs", "hours": 1}]
  
  -- Section A - Materials & Costs (Technician-Observed)
  consumables_used text,
  materials_purchased_in_field text,
  rental_equipment_used text,
  
  -- Section A - Sign-off
  technician_sign_off_name text,
  technician_confirmed boolean default false,
  technician_submission_timestamp timestamptz,
  
  -- Section B - Work Summary (Admin)
  estimated_hours numeric(10, 2),
  total_hours_worked numeric(10, 2),
  variance_hours numeric(10, 2),
  crew_size_roles_confirmed text,
  
  -- Section B - Cost Reconciliation (Admin)
  labor_cost_total numeric(12, 2),
  materials_cost_total numeric(12, 2),
  rental_cost_total numeric(12, 2),
  finalized_project_cost numeric(12, 2),
  
  -- Section B - Administrative Notes & Approval
  adjustments_to_technician_report text,
  notes_for_project_manager text,
  admin_name text,
  admin_submission_timestamp timestamptz,
  
  -- Metadata
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text
);

-- Index for filtering by job
create index if not exists idx_after_action_reports_job on neta_ops.after_action_reports(job_id);

-- Index for filtering by report type
create index if not exists idx_after_action_reports_type on neta_ops.after_action_reports(report_type);

-- Index for filtering by status
create index if not exists idx_after_action_reports_status on neta_ops.after_action_reports(status);

-- Index for filtering by date
create index if not exists idx_after_action_reports_date on neta_ops.after_action_reports(report_date);

-- Enable RLS
alter table neta_ops.after_action_reports enable row level security;

-- Add policies for after_action_reports
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'after_action_reports' and policyname = 'allow_all_select_after_action_reports'
  ) then
    create policy allow_all_select_after_action_reports on neta_ops.after_action_reports for select using (true);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'after_action_reports' and policyname = 'allow_all_insert_after_action_reports'
  ) then
    create policy allow_all_insert_after_action_reports on neta_ops.after_action_reports for insert with check (true);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'after_action_reports' and policyname = 'allow_all_update_after_action_reports'
  ) then
    create policy allow_all_update_after_action_reports on neta_ops.after_action_reports for update using (true) with check (true);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'after_action_reports' and policyname = 'allow_all_delete_after_action_reports'
  ) then
    create policy allow_all_delete_after_action_reports on neta_ops.after_action_reports for delete using (true);
  end if;
end $$;

-- Add comments
comment on table neta_ops.after_action_reports is 'After-action reports containing Technician Progress Reports and Admin Close-out Reports for jobs';
comment on column neta_ops.after_action_reports.report_type is 'Type of report: technician_progress or admin_closeout';
comment on column neta_ops.after_action_reports.time_allocation is 'JSON array of time allocation entries with category and hours';
comment on column neta_ops.after_action_reports.status is 'Status of the report: draft, submitted, approved, rejected';

-- Re-enable event triggers
set session_replication_role = default;

