-- Equipment-specific nameplate data on an asset.
--
-- Nameplate values (kVA, frame size, CT ratio, impulse BIL, ...) are the same whether we
-- are writing an ATS report, an MTS report, or just a visual inspection. Holding them on
-- the equipment instead of inside each report means they get entered once and reused by
-- every report we ever write against that asset.
--
-- Stored as JSONB rather than columns because the useful fields differ per equipment type:
-- a transformer has kVA and taps, a CT has a ratio and accuracy class, a busway has an
-- ampacity and conductor material. Which keys apply to a given asset is decided by its
-- equipment_type, using the catalog in src/lib/assetNameplateSchema.ts (whose field lists
-- were taken from the matching report forms).
--
-- The universal fields (manufacturer, model, serial_number) stay as real columns on
-- equipment_assets — every piece of equipment has those, and they are worth indexing and
-- searching. Only the type-specific extras live here.
--
-- Safe to re-run. Requires create_asset_tracking_tables.sql.

ALTER TABLE neta_ops.equipment_assets
  ADD COLUMN IF NOT EXISTS nameplate_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Lets us find, say, every 1000 kVA transformer at a site without scanning every row.
CREATE INDEX IF NOT EXISTS idx_equipment_assets_nameplate_data
  ON neta_ops.equipment_assets USING gin (nameplate_data);

COMMENT ON COLUMN neta_ops.equipment_assets.nameplate_data IS
  'Equipment-type-specific nameplate values, keyed by the field definitions in src/lib/assetNameplateSchema.ts (e.g. {"kva":"1000","impedance":"5.75"}). Universal fields (manufacturer/model/serial_number) are real columns, not keys in here. Cleared for keys that do not carry over when an asset''s equipment_type changes.';
