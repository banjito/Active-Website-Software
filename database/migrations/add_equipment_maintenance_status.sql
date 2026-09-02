-- Out of service, with a reason.
--
-- field_equipment already carries in_service, but nothing records *why* something is out.
-- The reason went into the general notes box or nowhere at all, so "what is actually wrong
-- with it" was unanswerable without asking the person who took it out.
--
-- Deliberately not a maintenance scheduling system. The ask is a status, a reason, and a
-- way to see everything currently out of the field.
--
-- Safe to re-run.

ALTER TABLE neta_ops.field_equipment
  ADD COLUMN IF NOT EXISTS maintenance_reason  TEXT,
  ADD COLUMN IF NOT EXISTS out_of_service_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS out_of_service_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN neta_ops.field_equipment.maintenance_reason IS
  'Why this item is out of the field. Set when in_service goes false, cleared when it '
  'returns. Separate from notes, which is general free text about the equipment itself.';
COMMENT ON COLUMN neta_ops.field_equipment.out_of_service_at IS
  'When it was taken out of service, so "how long has this been sitting" is answerable.';
COMMENT ON COLUMN neta_ops.field_equipment.out_of_service_by IS
  'Who took it out of service.';

-- Finding what is out of the field is the whole point of the column, and the list is
-- always small relative to the table.
CREATE INDEX IF NOT EXISTS idx_field_equipment_out_of_service
  ON neta_ops.field_equipment (out_of_service_at DESC)
  WHERE in_service IS FALSE;

-- Anything already flagged out of service predates this and has no timestamp. Use the last
-- update as the best available approximation rather than leaving the column empty, which
-- would read as "out of service since forever".
UPDATE neta_ops.field_equipment
SET    out_of_service_at = COALESCE(updated_at, now())
WHERE  in_service IS FALSE
  AND  out_of_service_at IS NULL;

DO $$
DECLARE
  out_count int;
BEGIN
  SELECT count(*) INTO out_count
  FROM neta_ops.field_equipment
  WHERE in_service IS FALSE;

  RAISE NOTICE '% items are currently out of service. They have a date but no reason until somebody fills one in.', out_count;
END $$;
