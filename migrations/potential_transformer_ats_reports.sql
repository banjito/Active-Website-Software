-- Create potential_transformer_ats_reports table
CREATE TABLE IF NOT EXISTS neta_ops.potential_transformer_ats_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  status TEXT NOT NULL DEFAULT 'PASS',

  report_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  device_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  visual_inspection JSONB NOT NULL DEFAULT '{}'::jsonb,
  fuse_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  fuse_resistance JSONB NOT NULL DEFAULT '{}'::jsonb,
  insulation_resistance JSONB NOT NULL DEFAULT '{}'::jsonb,
  insulation_corrected JSONB NOT NULL DEFAULT '{}'::jsonb,
  turns_ratio JSONB NOT NULL DEFAULT '{}'::jsonb,
  equipment_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  comments TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure RLS is enabled
ALTER TABLE neta_ops.potential_transformer_ats_reports ENABLE ROW LEVEL SECURITY;

-- Drop previous policies if they exist
DROP POLICY IF EXISTS "potential_transformer_select_anyone" ON neta_ops.potential_transformer_ats_reports;
DROP POLICY IF EXISTS "potential_transformer_insert_anyone" ON neta_ops.potential_transformer_ats_reports;
DROP POLICY IF EXISTS "potential_transformer_update_anyone" ON neta_ops.potential_transformer_ats_reports;
DROP POLICY IF EXISTS "potential_transformer_delete_anyone" ON neta_ops.potential_transformer_ats_reports;

-- Open policies for all authenticated users
CREATE POLICY "potential_transformer_select_anyone"
  ON neta_ops.potential_transformer_ats_reports
  FOR SELECT
  USING (true);

CREATE POLICY "potential_transformer_insert_anyone"
  ON neta_ops.potential_transformer_ats_reports
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "potential_transformer_update_anyone"
  ON neta_ops.potential_transformer_ats_reports
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "potential_transformer_delete_anyone"
  ON neta_ops.potential_transformer_ats_reports
  FOR DELETE
  USING (true);

-- 1) Ensure custom schema usable by client roles
GRANT USAGE ON SCHEMA neta_ops TO authenticated, anon;

-- 2) Grant CRUD on the potential transformer table to client roles
GRANT SELECT, INSERT, UPDATE, DELETE
ON neta_ops.potential_transformer_ats_reports
TO authenticated, anon;

-- 3) (Optional) Future-proof defaults for new tables in this schema
ALTER DEFAULT PRIVILEGES IN SCHEMA neta_ops
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, anon;
