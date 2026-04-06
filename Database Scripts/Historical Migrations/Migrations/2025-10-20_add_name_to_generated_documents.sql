-- Add name column to generated_documents table
-- This migration is safe to run multiple times

-- Add the name column if it doesn't exist
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'neta_ops' 
    and table_name = 'generated_documents' 
    and column_name = 'name'
  ) then
    alter table neta_ops.generated_documents add column name text;
  end if;
end $$;

