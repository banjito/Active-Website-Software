-- Asset status, replacing assets, and archiving diagrams.
--
-- ASSET STATUS
--   active      shown in the app as In Use
--   not_in_use  still on site but out of service. Dimmed on diagrams.
--   retired     removed or replaced. Hidden from the asset list unless filtered.
-- This is separate from report status. `status` has been on the table since it was created,
-- but nothing in the app has used it. Every existing row is 'active', and no database
-- function reads it. 'removed' becomes 'retired', in case any row was ever set by hand.
--
-- REPLACING AN ASSET
-- The old asset keeps everything and points at its replacement. The link is for reference
-- only: trends stay with their own asset.
--
-- ARCHIVING A DIAGRAM
-- An archive is a diagram that stopped changing. It keeps its symbols and lines, plus a
-- snapshot of the site's colors and symbols, so later site changes can't alter it. Its name
-- is freed up, so a new diagram can take over the same name.
--
-- Safe to re-run.

UPDATE neta_ops.equipment_assets SET status = 'retired' WHERE status = 'removed';

ALTER TABLE neta_ops.equipment_assets
  DROP CONSTRAINT IF EXISTS equipment_assets_status_check;

ALTER TABLE neta_ops.equipment_assets
  ADD CONSTRAINT equipment_assets_status_check
  CHECK (status IN ('active', 'not_in_use', 'retired'));

ALTER TABLE neta_ops.equipment_assets
  ADD COLUMN IF NOT EXISTS replaced_by_asset_id UUID
    REFERENCES neta_ops.equipment_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN neta_ops.equipment_assets.status IS
  'active (shown as In Use), not_in_use or retired. Separate from report status.';
COMMENT ON COLUMN neta_ops.equipment_assets.replaced_by_asset_id IS
  'The asset that took this one''s place. For reference only: trends stay with their own asset.';

ALTER TABLE neta_ops.site_diagrams
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archive_snapshot JSONB;

COMMENT ON COLUMN neta_ops.site_diagrams.archived_at IS
  'Set when a diagram is archived. It becomes read-only, and its name is free to reuse.';
COMMENT ON COLUMN neta_ops.site_diagrams.archive_snapshot IS
  'The voltage colors, symbol choices and custom symbols in use when it was archived.';

-- Archives no longer hold their name.
DROP INDEX IF EXISTS neta_ops.idx_site_diagrams_site_name;
CREATE UNIQUE INDEX idx_site_diagrams_site_name
  ON neta_ops.site_diagrams (site_id, lower(name))
  WHERE deleted_at IS NULL AND archived_at IS NULL;

NOTIFY pgrst, 'reload schema';
