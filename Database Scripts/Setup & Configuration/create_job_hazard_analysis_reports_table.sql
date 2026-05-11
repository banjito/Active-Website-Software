-- ============================================================================
-- Job Hazard Analysis (JHA) Internal Form
-- ============================================================================
-- Stores Job Hazard Analysis forms created from a job. These are "internal
-- forms" — they participate in the same review workflow as test reports
-- (via neta_ops.assets.status), but they live in their own table and surface
-- in the UI under a dedicated "Approved Internal Forms" tab once approved.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS neta_ops.job_hazard_analysis_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    -- High-level header info (activity, contract number, prepared by, etc.)
    report_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Array of { jobStep, hazards, controls, rac } rows.
    job_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Each of the three lists below is a JSON array of strings (one entry
    -- per row in the corresponding section of the form).
    equipment_to_be_used JSONB NOT NULL DEFAULT '[]'::jsonb,
    training JSONB NOT NULL DEFAULT '[]'::jsonb,
    inspection_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Safety Brief Acknowledgement section data:
    -- { date, location, presented_by_name, presented_by_signature,
    --   attendees: [{ name, signature }],
    --   completed_work: [{ name, signature, tools_accounted_for }],
    --   final_inspection: [{ name, signature }, { name, signature }] }
    safety_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE neta_ops.job_hazard_analysis_reports IS
'Job Hazard Analysis (JHA) internal form. Treated as an asset for the review workflow but rendered in the "Approved Internal Forms" tab once approved.';

CREATE INDEX IF NOT EXISTS idx_jha_reports_job_id
    ON neta_ops.job_hazard_analysis_reports(job_id);

CREATE INDEX IF NOT EXISTS idx_jha_reports_user_id
    ON neta_ops.job_hazard_analysis_reports(user_id);

ALTER TABLE neta_ops.job_hazard_analysis_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view jha reports" ON neta_ops.job_hazard_analysis_reports;
CREATE POLICY "Authenticated users can view jha reports" ON neta_ops.job_hazard_analysis_reports
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert jha reports" ON neta_ops.job_hazard_analysis_reports;
CREATE POLICY "Authenticated users can insert jha reports" ON neta_ops.job_hazard_analysis_reports
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update jha reports" ON neta_ops.job_hazard_analysis_reports;
CREATE POLICY "Authenticated users can update jha reports" ON neta_ops.job_hazard_analysis_reports
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete jha reports" ON neta_ops.job_hazard_analysis_reports;
CREATE POLICY "Authenticated users can delete jha reports" ON neta_ops.job_hazard_analysis_reports
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION neta_ops.update_jha_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jha_reports_updated_at ON neta_ops.job_hazard_analysis_reports;
CREATE TRIGGER jha_reports_updated_at
    BEFORE UPDATE ON neta_ops.job_hazard_analysis_reports
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_jha_reports_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE
    ON neta_ops.job_hazard_analysis_reports
    TO authenticated;

-- ----------------------------------------------------------------------------
-- Idempotent column-type migration:
-- An earlier version of this script created equipment_to_be_used / training /
-- inspection_requirements as TEXT. They are now JSONB arrays. If the table
-- already exists with the TEXT type, convert in-place.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    col_name TEXT;
    col_type TEXT;
    cols TEXT[] := ARRAY['equipment_to_be_used', 'training', 'inspection_requirements'];
BEGIN
    FOREACH col_name IN ARRAY cols LOOP
        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_schema = 'neta_ops'
          AND table_name = 'job_hazard_analysis_reports'
          AND information_schema.columns.column_name = col_name;

        IF col_type IS NOT NULL AND col_type <> 'jsonb' THEN
            EXECUTE format(
                $f$
                    ALTER TABLE neta_ops.job_hazard_analysis_reports
                    ALTER COLUMN %I TYPE JSONB
                    USING CASE
                        WHEN %I IS NULL OR %I = '' THEN '[]'::jsonb
                        ELSE jsonb_build_array(%I)
                    END,
                    ALTER COLUMN %I SET NOT NULL,
                    ALTER COLUMN %I SET DEFAULT '[]'::jsonb
                $f$,
                col_name, col_name, col_name, col_name, col_name, col_name
            );
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'neta_ops' AND table_name = 'job_hazard_analysis_reports';
