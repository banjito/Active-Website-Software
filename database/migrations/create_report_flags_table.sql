-- Report flags: customers flag a delivered report-asset from the ampOS ACCESS portal.
-- Flagging does NOT change the report's status (it stays approved/sent and visible to
-- the customer). Each flag has an open/resolved lifecycle; staff resolve them from the
-- internal report approval screen. Multiple flags per report are allowed (full history).

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS common.report_flags (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           UUID NOT NULL REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  customer_id        UUID NOT NULL,
  flagged_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by        UUID,
  resolved_at        TIMESTAMPTZ,
  resolution_comment TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_flags_asset_id ON common.report_flags(asset_id);
CREATE INDEX IF NOT EXISTS idx_report_flags_open
  ON common.report_flags(asset_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_report_flags_created_at ON common.report_flags(created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE common.report_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage report flags" ON common.report_flags;
DROP POLICY IF EXISTS "Customers can view own report flags" ON common.report_flags;

-- Staff (and service_role via bypass) read all flags and resolve them.
CREATE POLICY "Employees can manage report flags"
ON common.report_flags
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

-- Customers can read their own flags. Inserts go through common.flag_report() below
-- (SECURITY DEFINER), so no broad customer INSERT policy is granted.
CREATE POLICY "Customers can view own report flags"
ON common.report_flags
FOR SELECT
USING (auth.uid() = flagged_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON common.report_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.report_flags TO service_role;

-- ── RPC: customer flags a report ────────────────────────────────────────────────
-- Re-checks that the asset is one the signed-in customer may actually see
-- (approved/sent + belongs to their job) via common.customer_can_select_asset().
CREATE OR REPLACE FUNCTION common.flag_report(p_asset_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
DECLARE
  v_customer_id uuid;
  v_flag_id uuid;
BEGIN
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to flag a report.';
  END IF;

  IF NOT common.customer_can_select_asset(p_asset_id) THEN
    RAISE EXCEPTION 'Not authorized to flag this report.';
  END IF;

  v_customer_id := common.current_customer_id();

  INSERT INTO common.report_flags (asset_id, customer_id, flagged_by, reason)
  VALUES (p_asset_id, v_customer_id, auth.uid(), btrim(p_reason))
  RETURNING id INTO v_flag_id;

  RETURN v_flag_id;
END;
$$;

-- ── RPC: staff resolve a flag ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION common.resolve_report_flag(p_flag_id uuid, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized to resolve report flags.';
  END IF;

  UPDATE common.report_flags
  SET status = 'resolved',
      resolved_by = auth.uid(),
      resolved_at = NOW(),
      resolution_comment = p_comment
  WHERE id = p_flag_id;
END;
$$;

GRANT EXECUTE ON FUNCTION common.flag_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.resolve_report_flag(uuid, text) TO authenticated;

COMMENT ON TABLE common.report_flags IS 'Customer-raised flags on delivered report-assets from the ampOS ACCESS portal; open/resolved lifecycle, multiple per report.';
