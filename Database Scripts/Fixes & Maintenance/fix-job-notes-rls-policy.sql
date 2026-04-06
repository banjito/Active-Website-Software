-- Fix job_notes RLS policy for soft delete functionality
-- Issue: "new row violates row-level security policy for table 'job_notes'" error when deleting notes
-- 
-- RUN THIS SCRIPT IN ONE GO - it drops and recreates all policies

-- ============================================
-- STEP 1: DROP ALL EXISTING POLICIES (run this block first if you get "already exists" errors)
-- ============================================

DO $$ 
BEGIN
    -- Drop all policies on job_notes table
    DROP POLICY IF EXISTS "Users can view job notes" ON neta_ops.job_notes;
    DROP POLICY IF EXISTS "Users can create job notes" ON neta_ops.job_notes;
    DROP POLICY IF EXISTS "Users can update own notes" ON neta_ops.job_notes;
    DROP POLICY IF EXISTS "Users can delete own notes" ON neta_ops.job_notes;
    
    -- Also try dropping any other potential policy names
    DROP POLICY IF EXISTS "job_notes_select_policy" ON neta_ops.job_notes;
    DROP POLICY IF EXISTS "job_notes_insert_policy" ON neta_ops.job_notes;
    DROP POLICY IF EXISTS "job_notes_update_policy" ON neta_ops.job_notes;
    DROP POLICY IF EXISTS "job_notes_delete_policy" ON neta_ops.job_notes;
    
    RAISE NOTICE 'All existing policies dropped successfully';
EXCEPTION 
    WHEN undefined_object THEN 
        RAISE NOTICE 'Some policies did not exist, continuing...';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error dropping policies: %', SQLERRM;
END $$;

-- ============================================
-- STEP 2: CREATE NEW POLICIES
-- ============================================

-- SELECT: Allow authenticated users to view non-deleted notes
CREATE POLICY "Users can view job notes" ON neta_ops.job_notes
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

-- INSERT: Allow authenticated users to insert notes (user_id must match their auth.uid())
CREATE POLICY "Users can create job notes" ON neta_ops.job_notes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Allow users to update their own notes (including soft delete via deleted_at)
CREATE POLICY "Users can update own notes" ON neta_ops.job_notes
    FOR UPDATE
    USING (auth.uid() = user_id);

-- DELETE: Allow users to hard delete their own notes
CREATE POLICY "Users can delete own notes" ON neta_ops.job_notes
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- STEP 3: Ensure RLS is enabled and permissions granted
-- ============================================

ALTER TABLE neta_ops.job_notes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON neta_ops.job_notes TO authenticated;
GRANT ALL ON neta_ops.job_notes TO service_role;

-- ============================================
-- STEP 4: Verify the new policies
-- ============================================

SELECT 
    policyname, 
    cmd, 
    qual as using_clause, 
    with_check
FROM pg_policies 
WHERE tablename = 'job_notes'
AND schemaname = 'neta_ops';

