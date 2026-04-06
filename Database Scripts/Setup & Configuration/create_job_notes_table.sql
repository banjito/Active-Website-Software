-- Create job_notes table for timestamped notes on jobs
-- This enables team communication and updates within jobs

-- ============================================
-- STORAGE SETUP (Run in Supabase Dashboard or SQL Editor)
-- ============================================
-- If attachments fail, ensure the 'job-documents' bucket exists and has proper policies:
-- 
-- 1. Go to Supabase Dashboard > Storage
-- 2. Check if 'job-documents' bucket exists (should already exist)
-- 3. If needed, create it with: INSERT INTO storage.buckets (id, name, public) VALUES ('job-documents', 'job-documents', true);
-- 4. Add upload policy if needed:
/*
CREATE POLICY "Authenticated users can upload job documents"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'job-documents' 
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Anyone can view job documents"  
ON storage.objects FOR SELECT
USING (bucket_id = 'job-documents');

CREATE POLICY "Users can delete their own uploads"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'job-documents' 
    AND auth.uid()::text = (storage.foldername(name))[2]
);
*/
-- ============================================

-- Create the job_notes table in neta_ops schema
CREATE TABLE IF NOT EXISTS neta_ops.job_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    -- Optional attachment support
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    attachment_size INTEGER,
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited BOOLEAN DEFAULT FALSE,
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_job_notes_job_id ON neta_ops.job_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_user_id ON neta_ops.job_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_created_at ON neta_ops.job_notes(created_at DESC);

-- Enable RLS
ALTER TABLE neta_ops.job_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to view notes for jobs they have access to
CREATE POLICY "Users can view job notes" ON neta_ops.job_notes
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

-- Allow authenticated users to insert notes
CREATE POLICY "Users can create job notes" ON neta_ops.job_notes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own notes
CREATE POLICY "Users can update own notes" ON neta_ops.job_notes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow users to soft-delete their own notes (or admins)
CREATE POLICY "Users can delete own notes" ON neta_ops.job_notes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON neta_ops.job_notes TO authenticated;
GRANT ALL ON neta_ops.job_notes TO service_role;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION neta_ops.update_job_note_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.edited = TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at
DROP TRIGGER IF EXISTS job_notes_updated_at ON neta_ops.job_notes;
CREATE TRIGGER job_notes_updated_at
    BEFORE UPDATE ON neta_ops.job_notes
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_job_note_updated_at();

-- Add comment to table
COMMENT ON TABLE neta_ops.job_notes IS 'Timestamped notes and updates for jobs - like a group chat for project communication';

