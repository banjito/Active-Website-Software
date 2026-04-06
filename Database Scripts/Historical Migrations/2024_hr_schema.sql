-- HR Portal Database Schema
-- Using common schema (HR schema not in allowed list)

-- Job Requisitions Table
CREATE TABLE IF NOT EXISTS common.job_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    employment_type VARCHAR(50) NOT NULL,
    salary_range_min DECIMAL(10, 2),
    salary_range_max DECIMAL(10, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'closed')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    description TEXT,
    requirements TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    posted_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Candidates Table (ATS)
CREATE TABLE IF NOT EXISTS common.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    location VARCHAR(255),
    position_applied VARCHAR(255) NOT NULL,
    requisition_id UUID REFERENCES common.job_requisitions(id),
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'screening', 'interview', 'offer', 'hired', 'rejected')),
    source VARCHAR(100) NOT NULL,
    resume_url TEXT,
    cover_letter TEXT,
    applied_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_contact_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    -- EEO Data
    eeo_gender VARCHAR(50),
    eeo_race VARCHAR(100),
    eeo_veteran BOOLEAN DEFAULT FALSE,
    eeo_disability BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_requisitions_status ON common.job_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_created_by ON common.job_requisitions(created_by);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_department ON common.job_requisitions(department);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON common.candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_position ON common.candidates(position_applied);
CREATE INDEX IF NOT EXISTS idx_candidates_requisition ON common.candidates(requisition_id);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON common.candidates(email);

-- Drop existing policies first
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can view all job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can create job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can update their own job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can delete draft job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can view all candidates" ON common.candidates;
    DROP POLICY IF EXISTS "Users can create candidates" ON common.candidates;
    DROP POLICY IF EXISTS "Users can update candidates" ON common.candidates;
    DROP POLICY IF EXISTS "Users can delete candidates" ON common.candidates;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Disable Row Level Security - no restrictions needed
ALTER TABLE common.job_requisitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.candidates DISABLE ROW LEVEL SECURITY;

-- Grant explicit permissions to authenticated users
GRANT ALL ON common.job_requisitions TO authenticated;
GRANT ALL ON common.job_requisitions TO anon;
GRANT ALL ON common.candidates TO authenticated;
GRANT ALL ON common.candidates TO anon;
GRANT USAGE ON SCHEMA common TO authenticated;
GRANT USAGE ON SCHEMA common TO anon;

-- RLS is disabled - no policies needed
-- Permissions granted via GRANT statements above

-- No need to drop hr schema functions - we're only using common schema

-- Create updated_at trigger function in common schema
CREATE OR REPLACE FUNCTION common.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist (only on common schema)
DROP TRIGGER IF EXISTS update_job_requisitions_updated_at ON common.job_requisitions;
DROP TRIGGER IF EXISTS update_candidates_updated_at ON common.candidates;

-- Create triggers for updated_at
CREATE TRIGGER update_job_requisitions_updated_at
    BEFORE UPDATE ON common.job_requisitions
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at
    BEFORE UPDATE ON common.candidates
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();
