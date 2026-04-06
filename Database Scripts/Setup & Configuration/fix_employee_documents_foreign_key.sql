-- ============================================================================
-- Fix Employee Documents Foreign Key Constraint
-- ============================================================================
-- This script fixes the foreign key constraint to reference auth.users instead
-- of hr.employees, since employees are now just users.
-- Run this if you already created the tables with the old constraint.
-- ============================================================================

-- Drop the old foreign key constraint on employee_documents
ALTER TABLE common.employee_documents
DROP CONSTRAINT IF EXISTS employee_documents_employee_id_fkey;

-- Add new foreign key constraint referencing auth.users
-- Using SET NULL to preserve documents even if user is deleted
ALTER TABLE common.employee_documents
ADD CONSTRAINT employee_documents_employee_id_fkey
FOREIGN KEY (employee_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop the old foreign key constraint on employee_document_folders
ALTER TABLE common.employee_document_folders
DROP CONSTRAINT IF EXISTS employee_document_folders_employee_id_fkey;

-- Add new foreign key constraint referencing auth.users
-- Using SET NULL to preserve folders even if user is deleted
ALTER TABLE common.employee_document_folders
ADD CONSTRAINT employee_document_folders_employee_id_fkey
FOREIGN KEY (employee_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- Verification
-- ============================================================================
-- Check the constraints
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'common'
    AND tc.table_name IN ('employee_documents', 'employee_document_folders')
    AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name;
