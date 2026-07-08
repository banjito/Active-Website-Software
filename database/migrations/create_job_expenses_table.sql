-- T&M Job Expenses: line-item expenses entered per job to support billing close-out
-- for Time & Material projects. Each row captures a date, category, description,
-- optional quantity/unit, unit price, computed total, and a billable flag.

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS neta_ops.job_expenses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID        NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  expense_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  category      TEXT        NOT NULL CHECK (category IN ('labor','materials','equipment','subcontractor','travel','other')),
  description   TEXT        NOT NULL,
  quantity      NUMERIC(10,3),
  unit          TEXT,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  billable      BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_expenses_job_id     ON neta_ops.job_expenses(job_id);
CREATE INDEX IF NOT EXISTS idx_job_expenses_date       ON neta_ops.job_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_expenses_created_at ON neta_ops.job_expenses(created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE neta_ops.job_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage job expenses" ON neta_ops.job_expenses;

CREATE POLICY "Employees can manage job expenses"
ON neta_ops.job_expenses
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.job_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.job_expenses TO service_role;

COMMENT ON TABLE neta_ops.job_expenses IS 'Line-item expenses for T&M jobs; used to track billable/non-billable costs during a project for billing close-out.';
