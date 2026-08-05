-- Project Management, Phase 2 — the scheduling layer between an asset and its report.
--
-- Phase 1 answered "what equipment is at this site" (neta_ops.equipment_assets) and
-- "which report describes it" (neta_ops.assets.equipment_asset_id). It could not answer
-- the question a PM actually asks: "what are we testing this week, what's late, and
-- what isn't even scheduled?"
--
-- This migration adds that missing record:
--
--   neta_ops.scheduled_tests             one asset + one scope of work + one date window
--   neta_ops.scheduled_test_batches      a bulk write, so it can be undone as a unit
--   neta_ops.scheduled_test_batch_items  per-row before/after snapshot for that undo
--
-- Safe to re-run. Nothing existing is modified; every table here is new.
--
-- TWO DELIBERATE SHAPES, both different from a naive reading of the plan doc:
--
-- 1. "Work scheduled" is not a foreign key to a report_template table, because no such
--    table exists. A report form in ampOS is either a built-in route slug (the keys of
--    src/components/reports/reportMappings.ts REPORT_NAMES) or a row in
--    neta_ops.custom_form_templates. Both are carried here, alongside a free-text
--    fallback, and exactly one of the three must be set.
--
-- 2. Dates are DATE, never TIMESTAMPTZ. The customer's P6 export stamps everything
--    08:00–18:00, which are shift markers, not appointments. Storing timestamps would
--    let a tech in Atlanta and a PM one timezone over read different days off the same
--    row, and somebody would drive out on the wrong Monday.

-- ── neta_ops.scheduled_tests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS neta_ops.scheduled_tests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  site_id                 UUID        NOT NULL REFERENCES common.sites(id) ON DELETE RESTRICT,
  -- Deleting the equipment deletes what was scheduled against it: a schedule row with no
  -- asset has nothing left to describe. The asset delete guard warns with the count first.
  equipment_asset_id      UUID        NOT NULL REFERENCES neta_ops.equipment_assets(id) ON DELETE CASCADE,
  -- Which project this was scheduled under, when it was scheduled from a job's Assets
  -- tab. Nullable: the site's tracker is the source of truth and a site can be scheduled
  -- before any job exists. ON DELETE SET NULL so closing out a job never loses schedule
  -- history.
  job_id                  UUID        REFERENCES neta_ops.jobs(id) ON DELETE SET NULL,

  -- ── Work scheduled — exactly one of these three ──
  report_slug             TEXT,       -- built-in report, e.g. 'switchgear-panelboard-ats'
  custom_form_template_id UUID        REFERENCES neta_ops.custom_form_templates(id) ON DELETE SET NULL,
  work_scheduled_text     TEXT,       -- 'Other — describe' fallback

  -- ── Dates. See the header note: DATE, not TIMESTAMPTZ. ──
  start_date              DATE,
  finish_date             DATE,

  -- Physical state of the equipment. Nullable by design — blank means "nobody has said",
  -- which is different from "not installed", and the tracker filters on that difference.
  equipment_status        TEXT        CHECK (equipment_status IN (
                            'not_installed', 'ready_for_testing', 'in_service', 'out_of_service'
                          )),

  testing_status          TEXT        NOT NULL DEFAULT 'not_started'
                          CHECK (testing_status IN (
                            'not_started', 'in_progress', 'complete',
                            'on_hold', 'retest_required', 'not_required'
                          )),

  -- The report document that completed this scheduled test (neta_ops.assets = report
  -- pointers, not equipment — see create_asset_tracking_tables.sql). SET NULL rather than
  -- CASCADE: deleting a report un-completes the schedule row, it doesn't erase the plan.
  report_asset_id         UUID        REFERENCES neta_ops.assets(id) ON DELETE SET NULL,
  result                  TEXT        CHECK (result IN ('pass', 'fail', 'limited_service')),

  notes                   TEXT,

  -- ── Import provenance. Unused until the P6 importer (Phase 2.5); the columns exist now
  -- so that ships as a feature rather than as another migration. ──
  source                  TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'p6_import', 'template')),
  external_activity_id    TEXT,       -- P6 Activity ID, e.g. 'QTS-1060.EG5'
  external_batch_id       UUID,       -- which import run created this row
  -- The customer marked this date fixed (a trailing '*' in the P6 export). Shifting it
  -- is allowed but warned about, because we'd be overriding their constraint.
  has_date_constraint     BOOLEAN     NOT NULL DEFAULT FALSE,

  created_by              UUID        REFERENCES auth.users(id),
  updated_by              UUID        REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,

  -- A schedule row that doesn't say what work it covers is not a schedule row.
  CONSTRAINT scheduled_tests_work_present CHECK (
    report_slug IS NOT NULL
    OR custom_form_template_id IS NOT NULL
    OR work_scheduled_text IS NOT NULL
  ),
  -- Both dates are optional (unscheduled work is a real state, and P6 milestones carry a
  -- finish with no start), but they can't be backwards.
  CONSTRAINT scheduled_tests_finish_after_start CHECK (
    start_date IS NULL OR finish_date IS NULL OR finish_date >= start_date
  )
);

-- The tracker's default landing view is "what's due or late at this site", which is a
-- site + date-window scan. Partial on deleted_at so soft-deleted rows never widen it.
CREATE INDEX IF NOT EXISTS idx_scheduled_tests_site_dates
  ON neta_ops.scheduled_tests (site_id, finish_date, start_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_tests_asset
  ON neta_ops.scheduled_tests (equipment_asset_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_tests_job
  ON neta_ops.scheduled_tests (job_id) WHERE job_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_tests_testing_status
  ON neta_ops.scheduled_tests (site_id, testing_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_tests_report
  ON neta_ops.scheduled_tests (report_asset_id) WHERE report_asset_id IS NOT NULL;

-- What makes a second P6 import update rows instead of duplicating them: the same
-- activity re-imported at the same site is the same schedule row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_tests_external_activity
  ON neta_ops.scheduled_tests (site_id, external_activity_id)
  WHERE external_activity_id IS NOT NULL AND deleted_at IS NULL;

-- ── Bulk-write batches, so a bad shift can be reversed ────────────────────────
-- Shifting the wrong 47 rows is easy and the damage isn't visible until someone shows up
-- on the wrong day. Every bulk write records what each row looked like before, which is
-- what the Undo toast and the permanent per-batch revert both read.
CREATE TABLE IF NOT EXISTS neta_ops.scheduled_test_batches (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID        NOT NULL REFERENCES common.sites(id) ON DELETE CASCADE,
  -- 'create' | 'set_start' | 'set_finish' | 'shift' | 'set_status' | 'delete'
  action      TEXT        NOT NULL,
  -- Human-readable summary for the audit log: 'Shifted 47 items 5 working days later'.
  description TEXT,
  item_count  INTEGER     NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at   TIMESTAMPTZ,
  undone_by   UUID        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_test_batches_site
  ON neta_ops.scheduled_test_batches (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS neta_ops.scheduled_test_batch_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID        NOT NULL REFERENCES neta_ops.scheduled_test_batches(id) ON DELETE CASCADE,
  scheduled_test_id UUID        NOT NULL,
  -- Only the columns the batch touched, not the whole row. Undo writes these back
  -- verbatim; NULL before_data means the batch created the row, so undo deletes it.
  before_data       JSONB,
  after_data        JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_test_batch_items_batch
  ON neta_ops.scheduled_test_batch_items (batch_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_scheduled_tests ON neta_ops.scheduled_tests;
CREATE TRIGGER set_updated_at_scheduled_tests
  BEFORE UPDATE ON neta_ops.scheduled_tests
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Employee-only, same as the Phase 1 registry. A site is shared across customers, so the
-- schedule must never reach the customer portal without per-customer scoping first.
ALTER TABLE neta_ops.scheduled_tests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.scheduled_test_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.scheduled_test_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage scheduled tests" ON neta_ops.scheduled_tests;
CREATE POLICY "Employees can manage scheduled tests"
ON neta_ops.scheduled_tests FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage scheduled test batches" ON neta_ops.scheduled_test_batches;
CREATE POLICY "Employees can manage scheduled test batches"
ON neta_ops.scheduled_test_batches FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage scheduled test batch items" ON neta_ops.scheduled_test_batch_items;
CREATE POLICY "Employees can manage scheduled test batch items"
ON neta_ops.scheduled_test_batch_items FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.scheduled_tests            TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.scheduled_test_batches     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.scheduled_test_batch_items TO authenticated, service_role;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE  neta_ops.scheduled_tests IS 'One equipment asset + one scope of work + one date window + status. The row behind the Project Tracker. Sits between the asset (Phase 1 registry) and the report that completes it.';
COMMENT ON COLUMN neta_ops.scheduled_tests.report_slug IS 'Built-in report form, keyed by the route slug in src/components/reports/reportMappings.ts. Mutually exclusive with custom_form_template_id and work_scheduled_text.';
COMMENT ON COLUMN neta_ops.scheduled_tests.work_scheduled_text IS 'Free-text scope, for work with no report form yet. The "Other — describe" option.';
COMMENT ON COLUMN neta_ops.scheduled_tests.start_date IS 'DATE, not a timestamp — a schedule is discussed in days, and timezone drift here puts a crew onsite on the wrong day. Nullable: unscheduled work and finish-only milestones are both real.';
COMMENT ON COLUMN neta_ops.scheduled_tests.equipment_status IS 'Physical state of the equipment. Nullable on purpose: blank means nobody has said yet, which the tracker treats differently from Not Installed.';
COMMENT ON COLUMN neta_ops.scheduled_tests.result IS 'PASS / FAIL / LIMITED SERVICE. Cached here rather than joined through report_asset_id because the tracker sorts and filters on it across hundreds of rows.';
COMMENT ON COLUMN neta_ops.scheduled_tests.has_date_constraint IS 'The customer fixed this date (a trailing "*" in their P6 export). Bulk shifts warn before overriding it.';
COMMENT ON TABLE  neta_ops.scheduled_test_batches IS 'One bulk write (shift dates, set status, batch schedule), so it can be undone as a unit and shows in the audit log as a single action.';
COMMENT ON TABLE  neta_ops.scheduled_test_batch_items IS 'Per-row before/after snapshot for a batch. NULL before_data means the batch created the row, so undoing it deletes the row.';
