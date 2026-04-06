-- Create table for 7.22.1 Emergency Systems, Engine Generator Test Sheet ATS 25
-- Run this script in Supabase SQL Editor
-- Schema: neta_ops.emergency_systems_engine_generator_ats25

CREATE TABLE IF NOT EXISTS neta_ops.emergency_systems_engine_generator_ats25 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    report_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emergency_systems_engine_generator_ats25_job_id
    ON neta_ops.emergency_systems_engine_generator_ats25(job_id);
CREATE INDEX IF NOT EXISTS idx_emergency_systems_engine_generator_ats25_user_id
    ON neta_ops.emergency_systems_engine_generator_ats25(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_systems_engine_generator_ats25_created_at
    ON neta_ops.emergency_systems_engine_generator_ats25(created_at);

-- Permissions
GRANT ALL ON neta_ops.emergency_systems_engine_generator_ats25 TO authenticated;

-- RLS
ALTER TABLE neta_ops.emergency_systems_engine_generator_ats25 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all reports" ON neta_ops.emergency_systems_engine_generator_ats25;
DROP POLICY IF EXISTS "Authenticated users can insert reports" ON neta_ops.emergency_systems_engine_generator_ats25;
DROP POLICY IF EXISTS "Authenticated users can update all reports" ON neta_ops.emergency_systems_engine_generator_ats25;
DROP POLICY IF EXISTS "Authenticated users can delete all reports" ON neta_ops.emergency_systems_engine_generator_ats25;

CREATE POLICY "Authenticated users can view all reports"
    ON neta_ops.emergency_systems_engine_generator_ats25 FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert reports"
    ON neta_ops.emergency_systems_engine_generator_ats25 FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update all reports"
    ON neta_ops.emergency_systems_engine_generator_ats25 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete all reports"
    ON neta_ops.emergency_systems_engine_generator_ats25 FOR DELETE TO authenticated USING (true);

-- updated_at trigger
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'common')) THEN
        EXECUTE 'CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON neta_ops.emergency_systems_engine_generator_ats25
            FOR EACH ROW EXECUTE FUNCTION common.set_updated_at()';
    ELSE
        CREATE OR REPLACE FUNCTION neta_ops.emergency_systems_engine_generator_ats25_set_updated_at()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS set_updated_at ON neta_ops.emergency_systems_engine_generator_ats25;
        CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON neta_ops.emergency_systems_engine_generator_ats25
            FOR EACH ROW EXECUTE FUNCTION neta_ops.emergency_systems_engine_generator_ats25_set_updated_at();
    END IF;
END $$;
