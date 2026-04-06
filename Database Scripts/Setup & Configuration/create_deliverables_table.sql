-- Create table for job deliverables
-- NEVER DROP TABLE (per rules). Use IF NOT EXISTS guards.

create schema if not exists neta_ops;

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

create table if not exists neta_ops.deliverables (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'rejected', 'delivered')),
  cover_letter_id uuid not null, -- Reference to generated_documents table - REQUIRED
  executive_summary_id uuid, -- Reference to generated_documents table (optional)
  combined_pdf_url text, -- URL to the final combined PDF
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  delivered_at timestamptz
);

-- Index for filtering by job
create index if not exists idx_deliverables_job on neta_ops.deliverables(job_id);

-- Index for filtering by status
create index if not exists idx_deliverables_status on neta_ops.deliverables(status);

-- Enable RLS
alter table neta_ops.deliverables enable row level security;

-- Add policies for deliverables
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'deliverables' and policyname = 'allow_all_select_deliverables'
  ) then
    create policy allow_all_select_deliverables on neta_ops.deliverables for select using (true);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'deliverables' and policyname = 'allow_all_insert_deliverables'
  ) then
    create policy allow_all_insert_deliverables on neta_ops.deliverables for insert with check (true);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'deliverables' and policyname = 'allow_all_update_deliverables'
  ) then
    create policy allow_all_update_deliverables on neta_ops.deliverables for update using (true) with check (true);
  end if;
  
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'deliverables' and policyname = 'allow_all_delete_deliverables'
  ) then
    create policy allow_all_delete_deliverables on neta_ops.deliverables for delete using (true);
  end if;
end $$;

-- Add comments
comment on table neta_ops.deliverables is 'Deliverables link to cover letters which contain report selections';
comment on column neta_ops.deliverables.cover_letter_id is 'Required reference to cover letter in generated_documents - the cover letter contains the report selections';
comment on column neta_ops.deliverables.status is 'Status of the deliverable: draft, in_review, approved, rejected, delivered';

-- Re-enable event triggers
set session_replication_role = default;

