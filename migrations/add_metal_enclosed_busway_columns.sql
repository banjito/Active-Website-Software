-- Add columns to existing metal_enclosed_busway_reports table
ALTER TABLE neta_ops.metal_enclosed_busway_reports 
ADD COLUMN IF NOT EXISTS report_info JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS visual_mechanical_inspection JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS bus_resistance JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS insulation_resistance JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS test_equipment JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS comments TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PASS';

-- Update existing rows to have default values
UPDATE neta_ops.metal_enclosed_busway_reports 
SET 
  report_info = COALESCE(report_info, '{}'::JSONB),
  visual_mechanical_inspection = COALESCE(visual_mechanical_inspection, '[]'::JSONB),
  bus_resistance = COALESCE(bus_resistance, '{}'::JSONB),
  insulation_resistance = COALESCE(insulation_resistance, '{}'::JSONB),
  test_equipment = COALESCE(test_equipment, '{}'::JSONB),
  comments = COALESCE(comments, ''),
  status = COALESCE(status, 'PASS')
WHERE report_info IS NULL 
   OR visual_mechanical_inspection IS NULL 
   OR bus_resistance IS NULL 
   OR insulation_resistance IS NULL 
   OR test_equipment IS NULL 
   OR comments IS NULL 
   OR status IS NULL;

