-- Migration: Add 'sent' status to technical_reports table
-- Date: 2024-12-19
-- Description: Adds 'sent' as a valid status for technical reports

-- Drop the existing constraint
ALTER TABLE neta_ops.technical_reports 
DROP CONSTRAINT IF EXISTS technical_reports_status_check;

-- Add the new constraint with 'sent' status
ALTER TABLE neta_ops.technical_reports 
ADD CONSTRAINT technical_reports_status_check 
CHECK (status IN ('draft', 'submitted', 'in-review', 'approved', 'rejected', 'archived', 'sent'));

-- Also update the assets table if it has a similar constraint
ALTER TABLE neta_ops.assets 
DROP CONSTRAINT IF EXISTS assets_status_check;

ALTER TABLE neta_ops.assets 
ADD CONSTRAINT assets_status_check 
CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue', 'sent'));
