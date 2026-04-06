-- ============================================================================
-- Fix Employee Documents Delete RLS Policy
-- ============================================================================
-- The original delete policy only checked common.profiles for admin roles,
-- but the app stores the user role in auth user_metadata. If profiles.role
-- is out of sync, delete silently fails (0 rows affected, no error).
--
-- This migration updates the DELETE and UPDATE policies to also check the
-- JWT user_metadata role, so Admin / Super Admin users can always delete
-- regardless of whether common.profiles is up to date.
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can delete employee documents" ON common.employee_documents;
DROP POLICY IF EXISTS "Users can update employee documents" ON common.employee_documents;

-- Recreated DELETE policy: allow if uploader OR Admin/Super Admin (via profiles OR JWT metadata)
CREATE POLICY "Users can delete employee documents" ON common.employee_documents
    FOR DELETE
    USING (
        auth.uid() = uploaded_by
        OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Admin', 'Super Admin')
        OR EXISTS (
            SELECT 1 FROM common.profiles
            WHERE id = auth.uid()
            AND (role = 'Admin' OR role = 'Super Admin' OR role = 'HR')
        )
    );

-- Recreated UPDATE policy: same logic for consistency
CREATE POLICY "Users can update employee documents" ON common.employee_documents
    FOR UPDATE
    USING (
        auth.uid() = uploaded_by
        OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Admin', 'Super Admin')
        OR EXISTS (
            SELECT 1 FROM common.profiles
            WHERE id = auth.uid()
            AND (role = 'Admin' OR role = 'Super Admin' OR role = 'HR')
        )
    );
