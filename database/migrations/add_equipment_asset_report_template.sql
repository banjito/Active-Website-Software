-- The report form an asset is meant to be tested with, and that form's own field values.
--
-- add_equipment_asset_nameplate_data.sql kept a separate, hand-made list of nameplate fields
-- per equipment type. Its keys never lined up exactly with the report forms ("type" vs
-- "breakerType", no zone interlock, ...), so values were lost or mistranslated in both
-- directions. An asset now names its intended report instead, and its values are stored
-- under that report's own field paths ("breakerType", "nameplate.series"), so prefill and
-- "Save to asset" are straight copies. ATS and MTS versions of the same equipment share
-- field paths, which is what lets one asset serve acceptance and maintenance testing.
--
-- Manufacturer, model and serial number stay in their real columns and are mapped onto the
-- report's fields in code (src/lib/reportAssetProfiles.ts). Only the other equipment-level
-- values live in report_data. Per-visit values (date, technicians, temperature) never do.
--
-- nameplate_data is kept: assets without a report form still use it, and it is converted
-- into report_data the moment someone picks a form for the asset.
--
-- Safe to re-run. Requires create_asset_tracking_tables.sql.

ALTER TABLE neta_ops.equipment_assets
  ADD COLUMN IF NOT EXISTS report_template_slug TEXT,
  ADD COLUMN IF NOT EXISTS report_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_equipment_assets_report_template_slug
  ON neta_ops.equipment_assets (report_template_slug)
  WHERE report_template_slug IS NOT NULL;

COMMENT ON COLUMN neta_ops.equipment_assets.report_template_slug IS
  'Route slug of the built-in report this asset is meant to be tested with (a key of REPORT_NAMES in src/components/reports/reportMappings.ts). Decides which job information and nameplate fields the asset editor shows. Null = not chosen yet.';

COMMENT ON COLUMN neta_ops.equipment_assets.report_data IS
  'Equipment-level report field values keyed by the report''s own form path, e.g. {"breakerType":"molded case","nameplate.series":"PRL1"}. Manufacturer/model/serial_number are real columns, not keys in here.';
