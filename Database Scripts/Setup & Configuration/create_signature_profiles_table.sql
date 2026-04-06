-- Create table for signature profiles (saved signatures)
-- Users can save signature profiles and select them when generating executive summaries
-- NEVER DROP TABLE (per rules). Use IF NOT EXISTS guards.

create schema if not exists neta_ops;

-- Temporarily disable event triggers to avoid conflicts
set session_replication_role = replica;

create table if not exists neta_ops.signature_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- Display name (e.g., "John Chambers", "Ethan Thoenes")
  title text, -- Job title (e.g., "Electrical Engineer", "NETA III Technician")
  email text,
  phone text,
  section_title text default 'Reviewed By', -- Which section this belongs to (e.g., "Project Manager", "Reviewed By", "Work Performed By")
  created_by uuid not null, -- User who created this profile
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for filtering by creator
create index if not exists idx_signature_profiles_created_by on neta_ops.signature_profiles(created_by);

-- Index for searching by name
create index if not exists idx_signature_profiles_name on neta_ops.signature_profiles(name);

-- Enable RLS
alter table neta_ops.signature_profiles enable row level security;

-- Add policies for signature profiles
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'signature_profiles' and policyname = 'allow_all_select_signature_profiles'
  ) then
    create policy allow_all_select_signature_profiles on neta_ops.signature_profiles for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'signature_profiles' and policyname = 'allow_all_insert_signature_profiles'
  ) then
    create policy allow_all_insert_signature_profiles on neta_ops.signature_profiles for insert with check (true);
  end if;
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'signature_profiles' and policyname = 'allow_all_update_signature_profiles'
  ) then
    create policy allow_all_update_signature_profiles on neta_ops.signature_profiles for update using (true);
  end if;
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'neta_ops' and tablename = 'signature_profiles' and policyname = 'allow_all_delete_signature_profiles'
  ) then
    create policy allow_all_delete_signature_profiles on neta_ops.signature_profiles for delete using (true);
  end if;
end $$;

-- Add comments
comment on table neta_ops.signature_profiles is 'Saved signature profiles that can be selected when generating executive summaries';
comment on column neta_ops.signature_profiles.section_title is 'Which section this signature belongs to (e.g., "Project Manager", "Reviewed By", "Work Performed By")';

-- Grant permissions for PostgREST API access
grant usage on schema neta_ops to anon, authenticated;
grant select, insert, update, delete on neta_ops.signature_profiles to authenticated;

-- Re-enable event triggers
set session_replication_role = default;
