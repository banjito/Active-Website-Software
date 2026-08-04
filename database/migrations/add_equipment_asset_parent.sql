-- Sub-assets: one layer of nesting under a parent asset.
--
-- A medium voltage switchgear lineup is one asset identifier, but the work under it is
-- many reports against many devices — switches, CTs, relays, breakers, CPTs, VTs. Those
-- devices are assets in their own right (they get their own reports), they just belong
-- to a parent.
--
-- Deliberately ONE layer only: a parent cannot itself have a parent. Deeper trees make
-- the asset list harder to read than the flat list they replace, which defeats the point.
-- The trigger below is what enforces that — the app also checks, but the database is
-- where the rule has to hold.
--
-- Safe to re-run.

ALTER TABLE neta_ops.equipment_assets
  ADD COLUMN IF NOT EXISTS parent_asset_id UUID
    REFERENCES neta_ops.equipment_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN neta_ops.equipment_assets.parent_asset_id IS
  'Parent equipment this asset is a component of. One layer only — a row with a parent cannot itself be a parent.';

-- Children of a parent, for the grouped asset list.
CREATE INDEX IF NOT EXISTS idx_equipment_assets_parent
  ON neta_ops.equipment_assets (parent_asset_id)
  WHERE deleted_at IS NULL AND parent_asset_id IS NOT NULL;

-- ── The one-layer rule ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION neta_ops.enforce_single_asset_nesting()
RETURNS TRIGGER AS $$
DECLARE
  parent_of_parent UUID;
  child_count      INTEGER;
BEGIN
  IF NEW.parent_asset_id IS NOT NULL THEN
    IF NEW.parent_asset_id = NEW.id THEN
      RAISE EXCEPTION 'An asset cannot be its own parent';
    END IF;

    -- The chosen parent must be a top-level asset.
    SELECT parent_asset_id INTO parent_of_parent
      FROM neta_ops.equipment_assets
      WHERE id = NEW.parent_asset_id;

    IF parent_of_parent IS NOT NULL THEN
      RAISE EXCEPTION 'Sub-assets are limited to one layer: % is already a sub-asset and cannot be a parent', NEW.parent_asset_id;
    END IF;

    -- ...and this asset must not already have children of its own.
    SELECT COUNT(*) INTO child_count
      FROM neta_ops.equipment_assets
      WHERE parent_asset_id = NEW.id AND deleted_at IS NULL;

    IF child_count > 0 THEN
      RAISE EXCEPTION 'Sub-assets are limited to one layer: this asset has % sub-asset(s) and cannot itself become one', child_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_assets_single_nesting ON neta_ops.equipment_assets;
CREATE TRIGGER trg_equipment_assets_single_nesting
  BEFORE INSERT OR UPDATE OF parent_asset_id ON neta_ops.equipment_assets
  FOR EACH ROW EXECUTE FUNCTION neta_ops.enforce_single_asset_nesting();
