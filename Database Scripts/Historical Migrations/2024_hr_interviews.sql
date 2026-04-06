-- HR Portal - Interviews Table
-- Schema for interview scheduling and management

-- Interviews Table
CREATE TABLE IF NOT EXISTS common.interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES common.candidates(id) ON DELETE CASCADE,
    interview_type VARCHAR(20) NOT NULL CHECK (interview_type IN ('phone', 'video', 'in-person', 'panel')),
    interview_stage VARCHAR(50) NOT NULL DEFAULT 'initial_culture' CHECK (interview_stage IN ('initial_culture', 'technical', 'final')),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    location VARCHAR(255),
    video_link TEXT,
    interviewer_ids UUID[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show', 'rescheduled')),
    notes TEXT,
    feedback TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_id ON common.interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_date ON common.interviews(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON common.interviews(status);
CREATE INDEX IF NOT EXISTS idx_interviews_created_by ON common.interviews(created_by);
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_ids ON common.interviews USING GIN(interviewer_ids);

-- Disable Row Level Security - no restrictions needed (matching pattern from other HR tables)
ALTER TABLE common.interviews DISABLE ROW LEVEL SECURITY;

-- Grant explicit permissions to authenticated users
GRANT ALL ON common.interviews TO authenticated;
GRANT ALL ON common.interviews TO anon;

-- Add comment
COMMENT ON TABLE common.interviews IS 'Stores interview scheduling and management data for candidates';

-- Create trigger for updated_at (using existing function from hr_schema.sql)
DROP TRIGGER IF EXISTS update_interviews_updated_at ON common.interviews;
CREATE TRIGGER update_interviews_updated_at
    BEFORE UPDATE ON common.interviews
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();
