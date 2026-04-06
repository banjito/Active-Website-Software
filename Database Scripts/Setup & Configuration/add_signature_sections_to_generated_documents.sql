-- Add signature_sections JSONB column to generated_documents table
-- This allows storing configurable signature sections with multiple people per section
-- Structure: [{ title: string, people: [{ name, title, email, phone }] }]
-- NEVER DROP TABLE (per rules). Use IF NOT EXISTS guards.

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

-- Add signature_sections JSONB column
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'signature_sections'
  ) then
    alter table neta_ops.generated_documents 
    add column signature_sections jsonb;
  end if;
end $$;

-- Add comment
comment on column neta_ops.generated_documents.signature_sections is 
'JSONB array of signature sections. Each section has a title and array of people with name, title, email, phone. Example: [{"title": "Project Manager", "people": [{"name": "John Doe", "title": "PM", "email": "john@ampqes.com", "phone": "(256) 123-4567"}]}]';

-- Re-enable event triggers
set session_replication_role = default;
