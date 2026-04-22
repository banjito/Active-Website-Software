-- Create job_pictures table for photo documentation on jobs
-- Allows users to attach photos with descriptions (walkthroughs, site conditions, progress, etc.)

-- ============================================
-- STORAGE NOTES
-- ============================================
-- Uses the existing 'job-documents' bucket under the 'job-pictures/<job_id>/' prefix.
-- If the bucket does not exist yet, create it in Supabase Dashboard > Storage:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('job-documents', 'job-documents', true);
-- Standard storage policies used by job notes will apply (authenticated upload, public read).
-- ============================================

CREATE TABLE IF NOT EXISTS neta_ops.job_pictures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    -- Image details
    image_url TEXT NOT NULL,
    storage_path TEXT,          -- path within the bucket (used to remove from storage on delete)
    storage_bucket TEXT DEFAULT 'job-documents',
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    -- User provided caption / description
    description TEXT,
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited BOOLEAN DEFAULT FALSE,
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_job_pictures_job_id ON neta_ops.job_pictures(job_id);
CREATE INDEX IF NOT EXISTS idx_job_pictures_user_id ON neta_ops.job_pictures(user_id);
CREATE INDEX IF NOT EXISTS idx_job_pictures_created_at ON neta_ops.job_pictures(created_at DESC);

-- RLS
ALTER TABLE neta_ops.job_pictures ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view non-deleted pictures
DROP POLICY IF EXISTS "Users can view job pictures" ON neta_ops.job_pictures;
CREATE POLICY "Users can view job pictures" ON neta_ops.job_pictures
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

-- Authenticated users can create pictures attributed to themselves
DROP POLICY IF EXISTS "Users can create job pictures" ON neta_ops.job_pictures;
CREATE POLICY "Users can create job pictures" ON neta_ops.job_pictures
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update only their own pictures
DROP POLICY IF EXISTS "Users can update own pictures" ON neta_ops.job_pictures;
CREATE POLICY "Users can update own pictures" ON neta_ops.job_pictures
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete (hard delete if needed) their own pictures
DROP POLICY IF EXISTS "Users can delete own pictures" ON neta_ops.job_pictures;
CREATE POLICY "Users can delete own pictures" ON neta_ops.job_pictures
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grants
GRANT ALL ON neta_ops.job_pictures TO authenticated;
GRANT ALL ON neta_ops.job_pictures TO service_role;

-- updated_at / edited trigger
CREATE OR REPLACE FUNCTION neta_ops.update_job_picture_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    -- Mark as edited if the description changed
    IF NEW.description IS DISTINCT FROM OLD.description THEN
        NEW.edited = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_pictures_updated_at ON neta_ops.job_pictures;
CREATE TRIGGER job_pictures_updated_at
    BEFORE UPDATE ON neta_ops.job_pictures
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_job_picture_updated_at();

COMMENT ON TABLE neta_ops.job_pictures IS 'Photo documentation attached to jobs (walkthroughs, site conditions, progress photos, etc.)';
