-- Create table for generated cover letters / executive summaries
-- NEVER DROP TABLE (per rules). Use IF NOT EXISTS guards.

create schema if not exists neta_ops;

create table if not exists neta_ops.generated_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  doc_type text not null check (doc_type in ('cover','summary','both')),
  name text, -- custom name for the document
  html text not null,
  created_at timestamptz not null default now(),
  created_by uuid null
);

-- Optional index for filtering by job
create index if not exists idx_generated_documents_job on neta_ops.generated_documents(job_id);

-- Basic RLS setup: enable and allow job users to insert/select
alter table neta_ops.generated_documents enable row level security;

-- Allow all authenticated users to read/write for now (tighten later if needed)
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'generated_documents' and policyname = 'allow_all_select_generated_docs'
  ) then
    create policy allow_all_select_generated_docs on neta_ops.generated_documents for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'generated_documents' and policyname = 'allow_all_insert_generated_docs'
  ) then
    create policy allow_all_insert_generated_docs on neta_ops.generated_documents for insert with check (true);
  end if;
end $$;


