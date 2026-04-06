-- FR (Flame-Resistant) clothing sizes for employees. EEs update annually or bi-annually.
-- Visible and editable in profile in the manager-only section (profile owner + manager).

ALTER TABLE common.profiles
ADD COLUMN IF NOT EXISTS fr_shirt_size TEXT,
ADD COLUMN IF NOT EXISTS fr_pant_size TEXT,
ADD COLUMN IF NOT EXISTS fr_jacket_size TEXT,
ADD COLUMN IF NOT EXISTS fr_sizes_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN common.profiles.fr_shirt_size IS 'FR shirt/top size (e.g. M, L, XL). Updated by EE in profile.';
COMMENT ON COLUMN common.profiles.fr_pant_size IS 'FR pant size (e.g. 32x30). Updated by EE in profile.';
COMMENT ON COLUMN common.profiles.fr_jacket_size IS 'FR jacket/coat size. Updated by EE in profile.';
COMMENT ON COLUMN common.profiles.fr_sizes_updated_at IS 'When FR sizes were last updated by the employee.';
