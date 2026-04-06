-- Add all workflow timestamp and tracking columns to assets table
-- This ensures the full report lifecycle is tracked: submit → review → approve → send
-- Run this in Supabase SQL Editor

-- Add submitted_at column if it doesn't exist
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
COMMENT ON COLUMN neta_ops.assets.submitted_at IS 'Timestamp when the asset/report was submitted for review';

-- Add approved_at column if it doesn't exist (may already exist from add-submittal-tracking.sql)
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
COMMENT ON COLUMN neta_ops.assets.approved_at IS 'Timestamp when the asset/report was approved';

-- Add sent_at column if it doesn't exist (may already exist from add-submittal-tracking.sql)
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
COMMENT ON COLUMN neta_ops.assets.sent_at IS 'Timestamp when the asset/report was sent to customer';

-- Add reviewed_at column if it doesn't exist (may already exist from add-review-comments-to-assets.sql)
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
COMMENT ON COLUMN neta_ops.assets.reviewed_at IS 'Timestamp when the asset/report was reviewed (approved or rejected)';

-- Add reviewed_by column if it doesn't exist (may already exist from add-review-comments-to-assets.sql)
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS reviewed_by UUID;
COMMENT ON COLUMN neta_ops.assets.reviewed_by IS 'UUID of the user who reviewed the asset';

-- Add review_comments column if it doesn't exist (may already exist from add-review-comments-to-assets.sql)
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS review_comments TEXT;
COMMENT ON COLUMN neta_ops.assets.review_comments IS 'Comments from reviewer when approving or rejecting an asset';

-- Create indexes for performance on timestamp queries
CREATE INDEX IF NOT EXISTS idx_assets_submitted_at ON neta_ops.assets(submitted_at) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_approved_at ON neta_ops.assets(approved_at) WHERE approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_sent_at ON neta_ops.assets(sent_at) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_reviewed_at ON neta_ops.assets(reviewed_at) WHERE reviewed_at IS NOT NULL;

-- Backfill submitted_at for assets already in ready_for_review/approved/sent status that are missing it
UPDATE neta_ops.assets
SET submitted_at = COALESCE(reviewed_at, approved_at, created_at)
WHERE submitted_at IS NULL
  AND status IN ('ready_for_review', 'approved', 'sent')
  AND file_url LIKE 'report:%';

-- Backfill approved_at for approved/sent assets missing it
UPDATE neta_ops.assets
SET approved_at = COALESCE(reviewed_at, created_at)
WHERE approved_at IS NULL
  AND status IN ('approved', 'sent')
  AND file_url LIKE 'report:%';

-- Backfill sent_at for sent assets missing it
UPDATE neta_ops.assets
SET sent_at = created_at
WHERE sent_at IS NULL
  AND status = 'sent'
  AND file_url LIKE 'report:%';

-- Verification query
SELECT 
    status,
    COUNT(*) as total,
    COUNT(submitted_at) as has_submitted_at,
    COUNT(approved_at) as has_approved_at,
    COUNT(sent_at) as has_sent_at,
    COUNT(reviewed_at) as has_reviewed_at
FROM neta_ops.assets
WHERE file_url LIKE 'report:%'
GROUP BY status
ORDER BY status;
