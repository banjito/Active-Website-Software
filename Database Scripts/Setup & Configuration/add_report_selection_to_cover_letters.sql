-- Add report selection to generated_documents (cover letters)
-- This allows cover letters to track which reports they include

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

-- Add selected_report_ids column to generated_documents
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'selected_report_ids'
  ) then
    alter table neta_ops.generated_documents 
    add column selected_report_ids uuid[] default '{}';
  end if;
end $$;

-- Add comment
comment on column neta_ops.generated_documents.selected_report_ids is 'Array of asset IDs (reports) selected for this cover letter/document';

-- Re-enable event triggers
set session_replication_role = default;

