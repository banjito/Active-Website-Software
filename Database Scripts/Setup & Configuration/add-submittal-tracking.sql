-- Add submittal tracking fields to jobs table
-- This enables tracking of report submission timelines for KPI monitoring

DO $$
BEGIN
    -- Add job_type field to distinguish between standard and data center jobs
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'jobs' 
        AND column_name = 'submittal_job_type'
    ) THEN
        ALTER TABLE neta_ops.jobs 
        ADD COLUMN submittal_job_type TEXT DEFAULT 'standard' 
        CHECK (submittal_job_type IN ('standard', 'data_center'));
        
        COMMENT ON COLUMN neta_ops.jobs.submittal_job_type IS 'Type of job for submittal tracking: standard (7 days) or data_center (48-72 hours)';
    END IF;

    -- Add submittal_window_hours field for custom tracking windows
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'jobs' 
        AND column_name = 'submittal_window_hours'
    ) THEN
        ALTER TABLE neta_ops.jobs 
        ADD COLUMN submittal_window_hours INTEGER DEFAULT 168;
        
        COMMENT ON COLUMN neta_ops.jobs.submittal_window_hours IS 'Number of hours allowed between approval and sending reports. Default: 168 hours (7 days for standard), 48 or 72 for data center';
    END IF;
END $$;

-- Create index for faster filtering by submittal job type
CREATE INDEX IF NOT EXISTS idx_jobs_submittal_job_type ON neta_ops.jobs(submittal_job_type);

-- Update existing data center jobs to have appropriate submittal windows
-- This is a one-time update for existing records
UPDATE neta_ops.jobs 
SET submittal_job_type = 'data_center',
    submittal_window_hours = 72
WHERE LOWER(title) LIKE '%data center%' 
   OR LOWER(description) LIKE '%data center%'
   OR LOWER(notes) LIKE '%data center%';

-- Add timestamp fields to assets table for tracking report lifecycle
DO $$
BEGIN
    -- Add approved_at timestamp
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'assets' 
        AND column_name = 'approved_at'
    ) THEN
        ALTER TABLE neta_ops.assets 
        ADD COLUMN approved_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN neta_ops.assets.approved_at IS 'Timestamp when the asset/report was approved';
    END IF;

    -- Add sent_at timestamp
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'assets' 
        AND column_name = 'sent_at'
    ) THEN
        ALTER TABLE neta_ops.assets 
        ADD COLUMN sent_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN neta_ops.assets.sent_at IS 'Timestamp when the asset/report was sent to customer';
    END IF;
END $$;

-- Create indexes for performance on timestamp queries
CREATE INDEX IF NOT EXISTS idx_assets_approved_at ON neta_ops.assets(approved_at) WHERE approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_sent_at ON neta_ops.assets(sent_at) WHERE sent_at IS NOT NULL;

-- Backfill timestamps for existing approved and sent assets
-- First try to get timestamps from linked technical_reports, then fall back to created_at
DO $$
DECLARE
    updated_from_reports INT;
    updated_from_created INT;
BEGIN
    -- Step 1: Update assets that are linked to technical_reports
    -- Copy approved_at and sent_at from technical_reports
    WITH report_timestamps AS (
        SELECT 
            ar.asset_id,
            tr.approved_at,
            tr.sent_at
        FROM neta_ops.asset_reports ar
        JOIN neta_ops.technical_reports tr ON ar.report_id = tr.id
        WHERE tr.approved_at IS NOT NULL OR tr.sent_at IS NOT NULL
    )
    UPDATE neta_ops.assets a
    SET 
        approved_at = COALESCE(a.approved_at, rt.approved_at),
        sent_at = COALESCE(a.sent_at, rt.sent_at)
    FROM report_timestamps rt
    WHERE a.id = rt.asset_id
      AND (a.approved_at IS NULL OR a.sent_at IS NULL);
    
    GET DIAGNOSTICS updated_from_reports = ROW_COUNT;
    RAISE NOTICE 'Backfilled % assets from technical_reports timestamps', updated_from_reports;

    -- Step 2: For approved assets not linked to technical_reports, use created_at
    UPDATE neta_ops.assets
    SET approved_at = created_at
    WHERE status IN ('approved', 'sent')
      AND approved_at IS NULL
      AND file_url LIKE 'report:%';
    
    GET DIAGNOSTICS updated_from_created = ROW_COUNT;
    RAISE NOTICE 'Backfilled % approved assets using created_at', updated_from_created;

    -- Step 3: For sent assets, use created_at if no sent_at exists
    UPDATE neta_ops.assets
    SET sent_at = created_at
    WHERE status = 'sent'
      AND sent_at IS NULL
      AND file_url LIKE 'report:%';
    
    GET DIAGNOSTICS updated_from_created = ROW_COUNT;
    RAISE NOTICE 'Backfilled % sent assets using created_at', updated_from_created;
END $$;

-- Verification query (optional - comment out if not needed)
-- SELECT 
--     status,
--     COUNT(*) as count,
--     COUNT(approved_at) as with_approved_at,
--     COUNT(sent_at) as with_sent_at
-- FROM neta_ops.assets
-- WHERE file_url LIKE 'report:%'
-- GROUP BY status
-- ORDER BY status;

