-- Fixed Manual setup script for Technical Reports and Asset Status
-- Run this in your Supabase SQL Editor
-- This version avoids foreign key constraints to auth.users to prevent permission issues

-- Step 1: Add status column to assets table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'assets' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE neta_ops.assets 
        ADD COLUMN status TEXT DEFAULT 'in_progress' 
        CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue'));
        
        -- Update existing records to have default status
        UPDATE neta_ops.assets SET status = 'in_progress' WHERE status IS NULL;
    END IF;
END $$;

-- Step 2: Create technical_reports table (without foreign key constraints to auth.users)
CREATE TABLE IF NOT EXISTS neta_ops.technical_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    report_type TEXT NOT NULL,
    submitted_by UUID NOT NULL, -- No foreign key constraint to auth.users
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'in-review', 'approved', 'rejected', 'archived')),
    review_comments TEXT,
    reviewed_by UUID, -- No foreign key constraint to auth.users
    reviewed_at TIMESTAMP WITH TIME ZONE,
    revision_history JSONB DEFAULT '[]'::jsonb,
    current_version INTEGER DEFAULT 1,
    report_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Create asset_reports linking table
CREATE TABLE IF NOT EXISTS neta_ops.asset_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES neta_ops.technical_reports(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(asset_id, report_id)
);

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_technical_reports_job_id ON neta_ops.technical_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_status ON neta_ops.technical_reports(status);
CREATE INDEX IF NOT EXISTS idx_technical_reports_submitted_by ON neta_ops.technical_reports(submitted_by);
CREATE INDEX IF NOT EXISTS idx_technical_reports_reviewed_by ON neta_ops.technical_reports(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_asset_reports_asset_id ON neta_ops.asset_reports(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_reports_report_id ON neta_ops.asset_reports(report_id);

-- Step 5: Set up RLS policies (simplified to avoid auth.users access)
ALTER TABLE neta_ops.technical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.asset_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Users can view technical reports" ON neta_ops.technical_reports;
DROP POLICY IF EXISTS "Users can create technical reports" ON neta_ops.technical_reports;
DROP POLICY IF EXISTS "Users can update their own draft reports" ON neta_ops.technical_reports;
DROP POLICY IF EXISTS "Managers can update any technical report" ON neta_ops.technical_reports;
DROP POLICY IF EXISTS "Users can view asset reports" ON neta_ops.asset_reports;
DROP POLICY IF EXISTS "Users can create asset reports" ON neta_ops.asset_reports;

-- Allow authenticated users to read technical reports
CREATE POLICY "Users can view technical reports" ON neta_ops.technical_reports
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow users to create technical reports
CREATE POLICY "Users can create technical reports" ON neta_ops.technical_reports
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update their own draft reports
CREATE POLICY "Users can update their own draft reports" ON neta_ops.technical_reports
    FOR UPDATE USING (
        auth.uid() = submitted_by AND status = 'draft'
    );

-- Allow all authenticated users to update any report (simplified for now)
-- You can make this more restrictive later if needed
CREATE POLICY "Authenticated users can update technical reports" ON neta_ops.technical_reports
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to read asset_reports
CREATE POLICY "Users can view asset reports" ON neta_ops.asset_reports
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to create asset_reports
CREATE POLICY "Users can create asset reports" ON neta_ops.asset_reports
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Step 6: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON neta_ops.technical_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON neta_ops.asset_reports TO authenticated;

-- Step 7: Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION neta_ops.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_technical_reports_updated_at ON neta_ops.technical_reports;
CREATE TRIGGER update_technical_reports_updated_at 
    BEFORE UPDATE ON neta_ops.technical_reports 
    FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- Step 8: If the table already exists with foreign key constraints, remove them
-- (Run these only if you get foreign key constraint errors)
-- ALTER TABLE neta_ops.technical_reports DROP CONSTRAINT IF EXISTS technical_reports_submitted_by_fkey;
-- ALTER TABLE neta_ops.technical_reports DROP CONSTRAINT IF EXISTS technical_reports_reviewed_by_fkey; 