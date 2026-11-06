-- Single-line diagrams: lets a long label wrap, so labels don't run into each other.
--
-- NULL means the label stays on one line, which is every existing row. Nothing existing
-- changes. Safe to re-run.

ALTER TABLE neta_ops.diagram_symbols
  ADD COLUMN IF NOT EXISTS label_width DOUBLE PRECISION;

ALTER TABLE neta_ops.diagram_symbols
  DROP CONSTRAINT IF EXISTS diagram_symbols_label_width_positive;

ALTER TABLE neta_ops.diagram_symbols
  ADD CONSTRAINT diagram_symbols_label_width_positive
  CHECK (label_width IS NULL OR label_width > 0);

COMMENT ON COLUMN neta_ops.diagram_symbols.label_width IS
  'Width the label wraps at, in diagram units. NULL keeps the label on one line.';

NOTIFY pgrst, 'reload schema';
