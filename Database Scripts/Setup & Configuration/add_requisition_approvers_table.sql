-- =====================================================
-- Requisition Approvers Table
-- Sequential approval chain for job requisitions (1-3 approvers)
-- =====================================================

CREATE TABLE IF NOT EXISTS common.requisition_approvers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES common.job_requisitions(id) ON DELETE CASCADE,
    approver_user_id UUID NOT NULL REFERENCES auth.users(id),
    step_order INTEGER NOT NULL CHECK (step_order >= 1 AND step_order <= 3),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (requisition_id, step_order),
    UNIQUE (requisition_id, approver_user_id)
);

CREATE INDEX IF NOT EXISTS idx_req_approvers_requisition ON common.requisition_approvers(requisition_id);
CREATE INDEX IF NOT EXISTS idx_req_approvers_user ON common.requisition_approvers(approver_user_id);
CREATE INDEX IF NOT EXISTS idx_req_approvers_status ON common.requisition_approvers(status);

-- Add current_approval_step to job_requisitions to track which step we're on
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'common'
        AND table_name = 'job_requisitions'
        AND column_name = 'current_approval_step'
    ) THEN
        ALTER TABLE common.job_requisitions ADD COLUMN current_approval_step INTEGER DEFAULT 0;
    END IF;
END $$;

-- RLS
ALTER TABLE common.requisition_approvers DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.requisition_approvers TO authenticated;
GRANT ALL ON common.requisition_approvers TO anon;
