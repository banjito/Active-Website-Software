-- Add status field to generated_documents for cover letter locking
-- When a deliverable is sent/approved, the cover letter should be locked

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

-- Add status column to generated_documents
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'status'
  ) then
    alter table neta_ops.generated_documents 
    add column status text not null default 'draft' 
    check (status in ('draft', 'locked'));
  end if;
end $$;

-- Add locked_at timestamp
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'locked_at'
  ) then
    alter table neta_ops.generated_documents 
    add column locked_at timestamptz;
  end if;
end $$;

-- Add locked_by user reference
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'locked_by'
  ) then
    alter table neta_ops.generated_documents 
    add column locked_by uuid;
  end if;
end $$;

-- Add comments
comment on column neta_ops.generated_documents.status is 'Status of the document: draft (editable) or locked (cannot be edited)';
comment on column neta_ops.generated_documents.locked_at is 'Timestamp when the document was locked';
comment on column neta_ops.generated_documents.locked_by is 'User who locked the document';

-- Re-enable event triggers
set session_replication_role = default;
