-- Add UPDATE and DELETE policies for generated_documents table
-- This allows authenticated users to update and delete generated documents

-- Add UPDATE policy
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'generated_documents' and policyname = 'allow_all_update_generated_docs'
  ) then
    create policy allow_all_update_generated_docs on neta_ops.generated_documents for update using (true) with check (true);
  end if;
end $$;

-- Add DELETE policy
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'generated_documents' and policyname = 'allow_all_delete_generated_docs'
  ) then
    create policy allow_all_delete_generated_docs on neta_ops.generated_documents for delete using (true);
  end if;
end $$;

