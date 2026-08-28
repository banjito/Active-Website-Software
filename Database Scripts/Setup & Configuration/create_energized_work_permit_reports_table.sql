-- ============================================================================
-- Energized Work Permit Internal Form
-- ============================================================================
-- Stores Energized Electrical Work Permits created from a job. These are
-- "internal forms" — they participate in the same review workflow as test
-- reports (via neta_ops.assets.status), but they live in their own table and
-- surface in the UI under a dedicated "Approved Internal Forms" tab once
-- approved.
--
-- Run this in the Supabase SQL Editor.
--
-- PREREQUISITE: apply database/migrations/fix_snapshot_event_trigger_object_name.sql
-- first. Without it the attach_report_snapshot_on_create event trigger aborts
-- every CREATE TABLE in neta_ops with:
--   ERROR: 42703: record "cmd" has no field "object_name"
-- ============================================================================

CREATE TABLE IF NOT EXISTS neta_ops.energized_work_permit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    -- Header plus questions 1 and 2:
    -- { project_location, project_number, circuit_equipment_description,
    --   work_description, requires_energized_exposure, justification }
    report_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Question 3:
    -- { voltage_levels: { <levelId>: bool }, other_dc_detail,
    --   limited_approach, restricted_approach, prohibited_approach }
    shock_hazard JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Question 4:
    -- { analysis_performed, arc_flash_boundary, incident_energy,
    --   hazard_risk_category, table_arc_flash_boundary }
    arc_flash JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Question 5: { selected: { <ppeItemId>: bool }, other }
    ppe JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Acknowledgement + question 6 approval:
    -- { employee, customer_representative, approving_supervisor }
    -- each { name, signature, date }
    signatures JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE neta_ops.energized_work_permit_reports IS
'Energized Electrical Work Permit internal form. Treated as an asset for the review workflow but rendered in the "Approved Internal Forms" tab once approved.';

CREATE INDEX IF NOT EXISTS idx_energized_work_permit_reports_job_id
    ON neta_ops.energized_work_permit_reports(job_id);

CREATE INDEX IF NOT EXISTS idx_energized_work_permit_reports_user_id
    ON neta_ops.energized_work_permit_reports(user_id);

ALTER TABLE neta_ops.energized_work_permit_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view energized work permits" ON neta_ops.energized_work_permit_reports;
CREATE POLICY "Authenticated users can view energized work permits" ON neta_ops.energized_work_permit_reports
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert energized work permits" ON neta_ops.energized_work_permit_reports;
CREATE POLICY "Authenticated users can insert energized work permits" ON neta_ops.energized_work_permit_reports
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update energized work permits" ON neta_ops.energized_work_permit_reports;
CREATE POLICY "Authenticated users can update energized work permits" ON neta_ops.energized_work_permit_reports
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete energized work permits" ON neta_ops.energized_work_permit_reports;
CREATE POLICY "Authenticated users can delete energized work permits" ON neta_ops.energized_work_permit_reports
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION neta_ops.update_energized_work_permit_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS energized_work_permit_reports_updated_at ON neta_ops.energized_work_permit_reports;
CREATE TRIGGER energized_work_permit_reports_updated_at
    BEFORE UPDATE ON neta_ops.energized_work_permit_reports
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_energized_work_permit_reports_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE
    ON neta_ops.energized_work_permit_reports
    TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'neta_ops' AND table_name = 'energized_work_permit_reports';
