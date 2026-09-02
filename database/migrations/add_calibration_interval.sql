-- Calibration interval, so the due date maintains itself.
--
-- calibration_due_date is typed in by hand and nothing links it to calibration_date. Enter
-- a fresh calibration and the due date keeps the old value until somebody remembers to
-- change it too. That makes the 60-day report partly a report on how well people maintain
-- a date field rather than on actual calibration status.
--
-- With an interval on the record, the app rolls the due date forward when a new
-- calibration date is entered. The column is nullable: equipment on no fixed cycle simply
-- has no interval, and its due date stays manual as before.
--
-- Safe to re-run.

ALTER TABLE neta_ops.field_equipment
  ADD COLUMN IF NOT EXISTS calibration_interval_months INTEGER;

ALTER TABLE neta_ops.field_equipment
  DROP CONSTRAINT IF EXISTS field_equipment_calibration_interval_check;
ALTER TABLE neta_ops.field_equipment
  ADD CONSTRAINT field_equipment_calibration_interval_check CHECK (
    calibration_interval_months IS NULL
    OR (calibration_interval_months >= 1 AND calibration_interval_months <= 120)
  );

COMMENT ON COLUMN neta_ops.field_equipment.calibration_interval_months IS
  'How often this item is calibrated, in months (12 is the common case). When set, saving '
  'a new calibration_date rolls calibration_due_date forward by this many months. NULL '
  'means the due date is maintained by hand.';

-- Backfill the obvious cases: where the existing pair of dates sits within a few days of a
-- whole number of months, that gap is the interval somebody was already working to. Only
-- 6, 12, 18, 24 and 36 are inferred, because those are the intervals that actually appear
-- on calibration certificates; anything else is left for a human.
-- Written as a grouped derived table rather than a LATERAL subquery: the target of an
-- UPDATE is not in scope for its own FROM clause, so `FROM LATERAL (... fe ...)` is
-- rejected. Joining a plain subquery back on id does the same job.
UPDATE neta_ops.field_equipment fe
SET    calibration_interval_months = candidate.months
FROM (
  SELECT f.id,
         min(m) AS months
  FROM   neta_ops.field_equipment f
  CROSS JOIN unnest(ARRAY[6, 12, 18, 24, 36]) AS m
  WHERE  f.calibration_date IS NOT NULL
    AND  f.calibration_due_date IS NOT NULL
    AND  f.calibration_interval_months IS NULL
    AND  abs(
           f.calibration_due_date
           - (f.calibration_date + (m || ' months')::interval)::date
         ) <= 5
  GROUP BY f.id
) AS candidate
WHERE  fe.id = candidate.id;

DO $$
DECLARE
  filled int;
  total  int;
BEGIN
  SELECT count(*) FILTER (WHERE calibration_interval_months IS NOT NULL), count(*)
    INTO filled, total
  FROM neta_ops.field_equipment
  WHERE calibration_date IS NOT NULL AND calibration_due_date IS NOT NULL;

  RAISE NOTICE 'Calibration interval inferred for % of % items with both dates set. The rest keep a manual due date until someone sets an interval.', filled, total;
END $$;
