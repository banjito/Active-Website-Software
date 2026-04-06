-- Allow 'no_quote' as an estimate status (grayed-out in UI)
-- Run in Supabase SQL Editor after 2025-01-XX_add_status_to_estimates.sql

-- Drop existing check constraint (name may be estimates_status_check or auto-generated)
ALTER TABLE business.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE business.estimates DROP CONSTRAINT IF EXISTS estimates_status_check1;

-- Re-add with no_quote allowed
ALTER TABLE business.estimates
ADD CONSTRAINT estimates_status_check
CHECK (status IN ('in_progress', 'ready_for_review', 'approved_to_send', 'sent', 'no_quote') OR status IS NULL);
