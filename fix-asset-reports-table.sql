-- Fix asset_reports table creation and permissions
-- Run this in Supabase SQL Editor

-- First, check if the table exists and create it if not
CREATE TABLE IF NOT EXISTS neta_ops.asset_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  report_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, report_id)
);

-- Grant proper permissions
GRANT ALL ON neta_ops.asset_reports TO authenticated;
GRANT ALL ON neta_ops.asset_reports TO anon;
GRANT ALL ON neta_ops.asset_reports TO service_role;

-- Disable RLS to avoid permission issues
ALTER TABLE neta_ops.asset_reports DISABLE ROW LEVEL SECURITY;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_asset_reports_asset_id ON neta_ops.asset_reports(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_reports_report_id ON neta_ops.asset_reports(report_id);

-- Also ensure technical_reports table exists
CREATE TABLE IF NOT EXISTS neta_ops.technical_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'in-review', 'approved', 'rejected', 'archived')),
  review_comments TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  revision_history JSONB DEFAULT '[]'::jsonb,
  current_version INTEGER DEFAULT 1,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant permissions for technical_reports
GRANT ALL ON neta_ops.technical_reports TO authenticated;
GRANT ALL ON neta_ops.technical_reports TO anon;
GRANT ALL ON neta_ops.technical_reports TO service_role;

-- Disable RLS
ALTER TABLE neta_ops.technical_reports DISABLE ROW LEVEL SECURITY;

-- Verify tables exist
SELECT 
  schemaname, 
  tablename, 
  tableowner, 
  hasindexes, 
  hasrules, 
  hastriggers, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'neta_ops' 
AND tablename IN ('asset_reports', 'technical_reports');

-- Show a success message
SELECT 'asset_reports and technical_reports tables verified/created successfully!' as result; 