-- =====================================================
-- HR Portal - Job Requisitions Database Schema
-- Comprehensive schema for job requisition management
-- =====================================================

-- Use common schema for HR tables (HR schema not in allowed list)
-- CREATE SCHEMA IF NOT EXISTS hr; -- Commented out, using common schema instead

-- =====================================================
-- Job Requisitions Table
-- =====================================================
CREATE TABLE IF NOT EXISTS common.job_requisitions (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Information
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    employment_type VARCHAR(50) NOT NULL,
    
    -- Compensation
    salary_range_min DECIMAL(10, 2),
    salary_range_max DECIMAL(10, 2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    benefits TEXT,
    
    -- Status and Priority
    status VARCHAR(20) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'closed', 'cancelled')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' 
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Job Details
    description TEXT,
    requirements TEXT,
    preferred_qualifications TEXT,
    responsibilities TEXT,
    work_schedule VARCHAR(100),
    remote_work_allowed BOOLEAN DEFAULT FALSE,
    travel_required BOOLEAN DEFAULT FALSE,
    travel_percentage INTEGER CHECK (travel_percentage >= 0 AND travel_percentage <= 100),
    
    -- Hiring Information
    number_of_positions INTEGER DEFAULT 1 CHECK (number_of_positions > 0),
    hiring_manager_id UUID REFERENCES auth.users(id),
    recruiter_id UUID REFERENCES auth.users(id),
    budget_approved BOOLEAN DEFAULT FALSE,
    budget_approver_id UUID REFERENCES auth.users(id),
    budget_approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Dates
    target_start_date DATE,
    posting_start_date DATE,
    posting_end_date DATE,
    application_deadline DATE,
    
    -- Approval Workflow
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_for_approval_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    rejected_by UUID REFERENCES auth.users(id),
    rejected_at TIMESTAMP WITH TIME ZONE,
    
    -- Posting Information
    posted_at TIMESTAMP WITH TIME ZONE,
    posted_by UUID REFERENCES auth.users(id),
    external_job_board_ids TEXT[], -- Array of external job board IDs where posted
    
    -- Closing Information
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by UUID REFERENCES auth.users(id),
    closing_reason VARCHAR(100), -- 'filled', 'cancelled', 'on_hold', 'other'
    
    -- Additional Information
    notes TEXT,
    internal_notes TEXT, -- Notes only visible to HR team
    tags TEXT[], -- Array of tags for categorization
    requisition_number VARCHAR(50) UNIQUE, -- Auto-generated requisition number
    
    -- Metadata
    version INTEGER DEFAULT 1, -- For tracking revisions
    is_template BOOLEAN DEFAULT FALSE, -- If this is a template for creating new requisitions
    template_name VARCHAR(255), -- Name if it's a template
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- Add missing columns if table already exists
-- =====================================================

-- Add deleted_at column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE common.job_requisitions 
        ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN deleted_by UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add other new columns that might not exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'salary_currency'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN salary_currency VARCHAR(3) DEFAULT 'USD';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'benefits'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN benefits TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'preferred_qualifications'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN preferred_qualifications TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'responsibilities'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN responsibilities TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'work_schedule'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN work_schedule VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'remote_work_allowed'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN remote_work_allowed BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'travel_required'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN travel_required BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'travel_percentage'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN travel_percentage INTEGER;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'number_of_positions'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN number_of_positions INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'hiring_manager_id'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN hiring_manager_id UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'recruiter_id'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN recruiter_id UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'budget_approved'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN budget_approved BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'budget_approver_id'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN budget_approver_id UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'budget_approved_at'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN budget_approved_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'target_start_date'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN target_start_date DATE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'posting_start_date'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN posting_start_date DATE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'posting_end_date'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN posting_end_date DATE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'application_deadline'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN application_deadline DATE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'submitted_for_approval_at'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN submitted_for_approval_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN rejection_reason TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'rejected_by'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN rejected_by UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN rejected_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'posted_by'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN posted_by UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'external_job_board_ids'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN external_job_board_ids TEXT[];
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'closed_by'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN closed_by UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'closing_reason'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN closing_reason VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'internal_notes'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN internal_notes TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'tags'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN tags TEXT[];
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'requisition_number'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN requisition_number VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'version'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN version INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'is_template'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN is_template BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'job_requisitions' 
        AND column_name = 'template_name'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN template_name VARCHAR(255);
    END IF;
END $$;

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Status index for filtering
CREATE INDEX IF NOT EXISTS idx_job_requisitions_status 
    ON common.job_requisitions(status) 
    WHERE deleted_at IS NULL;

-- Department index for filtering
CREATE INDEX IF NOT EXISTS idx_job_requisitions_department 
    ON common.job_requisitions(department) 
    WHERE deleted_at IS NULL;

-- Created by index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_job_requisitions_created_by 
    ON common.job_requisitions(created_by) 
    WHERE deleted_at IS NULL;

-- Priority index for sorting
CREATE INDEX IF NOT EXISTS idx_job_requisitions_priority 
    ON common.job_requisitions(priority) 
    WHERE deleted_at IS NULL;

-- Created at index for sorting
CREATE INDEX IF NOT EXISTS idx_job_requisitions_created_at 
    ON common.job_requisitions(created_at DESC) 
    WHERE deleted_at IS NULL;

-- Requisition number index for quick lookups
CREATE INDEX IF NOT EXISTS idx_job_requisitions_requisition_number 
    ON common.job_requisitions(requisition_number) 
    WHERE deleted_at IS NULL AND requisition_number IS NOT NULL;

-- Full text search index on title and description
CREATE INDEX IF NOT EXISTS idx_job_requisitions_fulltext 
    ON common.job_requisitions USING gin(to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(description, '') || ' ' || 
        COALESCE(department, '') || ' ' || 
        COALESCE(location, '')
    )) 
    WHERE deleted_at IS NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_job_requisitions_status_department 
    ON common.job_requisitions(status, department) 
    WHERE deleted_at IS NULL;

-- =====================================================
-- Row Level Security (RLS) - Disabled for open access
-- =====================================================

-- Drop all existing policies first
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can view all job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can view job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can create job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can update their own job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can update job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can delete draft job requisitions" ON common.job_requisitions;
    DROP POLICY IF EXISTS "Users can delete job requisitions" ON common.job_requisitions;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Disable RLS entirely - no restrictions needed
ALTER TABLE common.job_requisitions DISABLE ROW LEVEL SECURITY;

-- Grant explicit permissions to authenticated users
GRANT ALL ON common.job_requisitions TO authenticated;
GRANT ALL ON common.job_requisitions TO anon;
GRANT USAGE ON SCHEMA common TO authenticated;
GRANT USAGE ON SCHEMA common TO anon;

-- =====================================================
-- Functions and Triggers
-- =====================================================

-- No need to drop hr schema functions - we're only using common schema

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION common.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_job_requisitions_updated_at ON common.job_requisitions;
DROP TRIGGER IF EXISTS generate_job_requisition_number ON common.job_requisitions;
DROP TRIGGER IF EXISTS handle_job_requisition_status_change ON common.job_requisitions;

-- Trigger for updated_at
CREATE TRIGGER update_job_requisitions_updated_at
    BEFORE UPDATE ON common.job_requisitions
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

-- Function to generate requisition number
CREATE OR REPLACE FUNCTION common.generate_requisition_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    sequence_num INTEGER;
    new_number VARCHAR(50);
BEGIN
    -- Only generate if not already set
    IF NEW.requisition_number IS NULL THEN
        year_prefix := TO_CHAR(NOW(), 'YYYY');
        
        -- Get the next sequence number for this year
        SELECT COALESCE(MAX(CAST(SUBSTRING(requisition_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
        INTO sequence_num
        FROM common.job_requisitions
        WHERE requisition_number LIKE 'REQ-' || year_prefix || '-%';
        
        -- Format: REQ-YYYY-XXXXX
        new_number := 'REQ-' || year_prefix || '-' || LPAD(sequence_num::TEXT, 5, '0');
        NEW.requisition_number := new_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate requisition number
CREATE TRIGGER generate_job_requisition_number
    BEFORE INSERT ON common.job_requisitions
    FOR EACH ROW
    EXECUTE FUNCTION common.generate_requisition_number();

-- Function to handle status transitions and timestamps
CREATE OR REPLACE FUNCTION common.handle_job_requisition_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Set timestamps based on status changes
    IF NEW.status = 'pending_approval' AND OLD.status != 'pending_approval' THEN
        NEW.submitted_for_approval_at = NOW();
    END IF;
    
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        NEW.approved_at = NOW();
        NEW.approved_by = COALESCE(NEW.approved_by, auth.uid());
    END IF;
    
    IF NEW.status = 'posted' AND OLD.status != 'posted' THEN
        NEW.posted_at = NOW();
        NEW.posted_by = COALESCE(NEW.posted_by, auth.uid());
    END IF;
    
    IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
        NEW.closed_at = NOW();
        NEW.closed_by = COALESCE(NEW.closed_by, auth.uid());
    END IF;
    
    -- Increment version on status change or significant update
    IF NEW.status != OLD.status OR 
       NEW.title != OLD.title OR 
       NEW.department != OLD.department OR
       NEW.salary_range_min != OLD.salary_range_min OR
       NEW.salary_range_max != OLD.salary_range_max THEN
        NEW.version = OLD.version + 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for status change handling
CREATE TRIGGER handle_job_requisition_status_change
    BEFORE UPDATE ON common.job_requisitions
    FOR EACH ROW
    EXECUTE FUNCTION common.handle_job_requisition_status_change();

-- =====================================================
-- Views for Common Queries
-- =====================================================

-- View for active requisitions (not deleted, not closed)
CREATE OR REPLACE VIEW common.v_active_job_requisitions AS
SELECT 
    id,
    title,
    department,
    location,
    employment_type,
    salary_range_min,
    salary_range_max,
    status,
    priority,
    requisition_number,
    created_at,
    updated_at,
    created_by,
    number_of_positions
FROM common.job_requisitions
WHERE deleted_at IS NULL 
    AND status NOT IN ('closed', 'cancelled');

-- View for pending approvals
CREATE OR REPLACE VIEW common.v_pending_approval_requisitions AS
SELECT 
    id,
    title,
    department,
    location,
    employment_type,
    priority,
    requisition_number,
    created_by,
    submitted_for_approval_at,
    created_at
FROM common.job_requisitions
WHERE deleted_at IS NULL 
    AND status = 'pending_approval'
ORDER BY submitted_for_approval_at DESC, priority DESC;

-- View for posted requisitions (for career page)
CREATE OR REPLACE VIEW common.v_posted_job_requisitions AS
SELECT 
    id,
    title,
    department,
    location,
    employment_type,
    salary_range_min,
    salary_range_max,
    description,
    requirements,
    requisition_number,
    posted_at,
    application_deadline,
    posting_end_date
FROM common.job_requisitions
WHERE deleted_at IS NULL 
    AND status = 'posted'
    AND (posting_end_date IS NULL OR posting_end_date >= CURRENT_DATE)
ORDER BY posted_at DESC;

-- =====================================================
-- Comments for Documentation
-- =====================================================

COMMENT ON TABLE common.job_requisitions IS 'Stores job requisition information for the HR portal';
COMMENT ON COLUMN common.job_requisitions.requisition_number IS 'Auto-generated unique requisition number (format: REQ-YYYY-XXXXX)';
COMMENT ON COLUMN common.job_requisitions.version IS 'Tracks number of revisions made to the requisition';
COMMENT ON COLUMN common.job_requisitions.internal_notes IS 'HR-only notes not visible to hiring managers';
COMMENT ON COLUMN common.job_requisitions.closing_reason IS 'Reason for closing: filled, cancelled, on_hold, or other';
