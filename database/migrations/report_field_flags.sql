-- Field flags: a reviewer clicks the exact fields (or section titles) that are
-- wrong or blank when sending a report back as an Issue. The tech sees those
-- fields outlined in red while fixing the report.
--
-- Most report pages have no field names, so a flag stores where the field sits
-- on the page (field_index), its readable label (context, e.g.
-- "Insulation Resistance › SW-2 › P2-P3") and the value when it was flagged.
-- The app finds the field again from those; see
-- src/components/reports/common/fieldFlags/fieldLocator.ts.
--
-- Flags are never deleted. A reviewer removing one sets status 'removed'.
-- Approving a report doesn't touch this table: the app hides flags made before
-- the report's approved_at, so no trigger is needed on the busy assets table.

-- The foreign key below locks the busy assets table briefly. Give up after
-- 5 seconds instead of making report saves wait; if it stops with "lock
-- timeout", nothing was changed, so run it again a bit later.
SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS neta_ops.report_field_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  target_kind text NOT NULL DEFAULT 'field' CHECK (target_kind IN ('field', 'section')),
  field_index integer NOT NULL,
  field_key text,
  context text NOT NULL DEFAULT '',
  locator jsonb NOT NULL DEFAULT '{}'::jsonb,
  value_at_flag text,
  reason text CHECK (reason IN (
    'blank', 'wrong_value', 'check_units', 'out_of_tolerance', 'missing_photo'
  )),
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'resolved')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_report_field_flags_open
  ON neta_ops.report_field_flags (asset_id) WHERE status = 'open';

-- New neta_ops tables get report snapshot triggers automatically. Flags aren't
-- report data, so don't copy every flag into backup_reports.
DROP TRIGGER IF EXISTS trg_snapshot_report_field_flags_ins ON neta_ops.report_field_flags;
DROP TRIGGER IF EXISTS trg_snapshot_report_field_flags_upd ON neta_ops.report_field_flags;

DROP TRIGGER IF EXISTS trg_report_field_flags_updated_at ON neta_ops.report_field_flags;
CREATE TRIGGER trg_report_field_flags_updated_at
  BEFORE UPDATE ON neta_ops.report_field_flags
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

REVOKE ALL ON TABLE neta_ops.report_field_flags FROM anon;
GRANT SELECT, INSERT ON TABLE neta_ops.report_field_flags TO authenticated;
GRANT UPDATE (reason, note, status, closed_by, closed_at) ON TABLE neta_ops.report_field_flags TO authenticated;
GRANT ALL ON TABLE neta_ops.report_field_flags TO service_role;

ALTER TABLE neta_ops.report_field_flags ENABLE ROW LEVEL SECURITY;

-- Staff only: flags are internal review notes, customers never see them
DROP POLICY IF EXISTS "report_field_flags_select" ON neta_ops.report_field_flags;
CREATE POLICY "report_field_flags_select"
  ON neta_ops.report_field_flags FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

DROP POLICY IF EXISTS "report_field_flags_insert" ON neta_ops.report_field_flags;
CREATE POLICY "report_field_flags_insert"
  ON neta_ops.report_field_flags FOR INSERT
  TO authenticated
  WITH CHECK (common.is_employee_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS "report_field_flags_update" ON neta_ops.report_field_flags;
CREATE POLICY "report_field_flags_update"
  ON neta_ops.report_field_flags FOR UPDATE
  TO authenticated
  USING (common.is_employee_user())
  WITH CHECK (common.is_employee_user());

COMMIT;
