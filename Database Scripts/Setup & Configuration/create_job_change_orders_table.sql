-- Change Orders: first-class CO tracking per job (app is source of truth; QBO push is downstream).
-- Run in Supabase SQL editor. Also migrates legacy job_contracts rows with type='change_order'
-- into this table and removes them from job_contracts, so CO dollars are not double counted.

-- ============================================
-- 1. Table
-- ============================================
CREATE TABLE IF NOT EXISTS neta_ops.job_change_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    -- Per-job sequential number (CO #1, CO #2, ...)
    co_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    -- Signed dollar impact on the contract (negative = deductive change order)
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    schedule_impact_days INTEGER,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    requested_by TEXT,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    -- Optional attachment (signed CO document etc.)
    file_url TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size INTEGER,
    -- QuickBooks: Estimate created on the linked project when the CO is approved
    qbo_estimate_id TEXT,
    qbo_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (job_id, co_number)
);

CREATE INDEX IF NOT EXISTS idx_job_change_orders_job_id ON neta_ops.job_change_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_job_change_orders_status ON neta_ops.job_change_orders(status);

-- ============================================
-- 2. RLS (same model as job_notes / job_contracts)
-- ============================================
ALTER TABLE neta_ops.job_change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view change orders" ON neta_ops.job_change_orders
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create change orders" ON neta_ops.job_change_orders
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update change orders" ON neta_ops.job_change_orders
    FOR UPDATE
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete change orders" ON neta_ops.job_change_orders
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

GRANT ALL ON neta_ops.job_change_orders TO authenticated;
GRANT ALL ON neta_ops.job_change_orders TO service_role;

-- ============================================
-- 3. updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION neta_ops.update_job_change_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_change_orders_updated_at ON neta_ops.job_change_orders;
CREATE TRIGGER job_change_orders_updated_at
    BEFORE UPDATE ON neta_ops.job_change_orders
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_job_change_order_updated_at();

-- ============================================
-- 4. Migrate legacy change orders out of job_contracts
-- ============================================
-- Legacy rows always counted toward Total Contract Value regardless of status, so
-- everything except 'cancelled' migrates as approved to keep job totals unchanged.
BEGIN;

INSERT INTO neta_ops.job_change_orders
    (job_id, user_id, co_number, title, description, amount, status,
     approved_at, file_url, file_path, file_type, file_size, created_at)
SELECT
    c.job_id,
    c.user_id,
    ROW_NUMBER() OVER (PARTITION BY c.job_id ORDER BY c.uploaded_date, c.id),
    c.name,
    c.description,
    CASE
        WHEN c.value_operation = 'subtract_from_total' THEN -ABS(COALESCE(c.value, 0))
        ELSE ABS(COALESCE(c.value, 0))
    END,
    CASE WHEN c.status = 'cancelled' THEN 'rejected' ELSE 'approved' END,
    CASE WHEN c.status = 'cancelled' THEN NULL ELSE c.uploaded_date END,
    NULLIF(c.file_url, ''),
    NULLIF(c.file_path, ''),
    c.file_type,
    c.file_size,
    c.uploaded_date
FROM neta_ops.job_contracts c
WHERE c.type = 'change_order';

DELETE FROM neta_ops.job_contracts WHERE type = 'change_order';

COMMIT;

COMMENT ON TABLE neta_ops.job_change_orders IS 'Change orders per job. App is source of truth; approved COs roll into revised contract value and are pushed to QuickBooks as Estimates on the linked project.';
