-- Update generated_documents to store selected signature profile IDs instead of full signature sections
-- This allows referencing saved profiles instead of duplicating data
-- NEVER DROP TABLE (per rules). Use IF NOT EXISTS guards.

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

-- Add selected_signature_profile_ids column (array of UUIDs)
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'selected_signature_profile_ids'
  ) then
    alter table neta_ops.generated_documents 
    add column selected_signature_profile_ids uuid[];
  end if;
end $$;

-- Add comment
comment on column neta_ops.generated_documents.selected_signature_profile_ids is 
'Array of signature profile IDs selected for this document. Profiles are stored in signature_profiles table.';

-- Note: We keep signature_sections column for backward compatibility with existing documents
-- New documents should use selected_signature_profile_ids

-- Re-enable event triggers
set session_replication_role = default;
