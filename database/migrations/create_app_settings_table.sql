-- Generic key/value settings store in the common schema.
-- Already referenced by profitabilityService (profitability_overhead_rate)
-- and now by the admin Website Theme page (site_theme).
-- Idempotent: safe to run on instances where the table already exists.

CREATE TABLE IF NOT EXISTS common.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE common.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings: the login page needs site_theme before sign-in.
DROP POLICY IF EXISTS "app_settings_select_authenticated" ON common.app_settings;
DROP POLICY IF EXISTS "app_settings_select_all" ON common.app_settings;
CREATE POLICY "app_settings_select_all"
    ON common.app_settings FOR SELECT
    TO anon, authenticated
    USING (true);

-- Only admins can create/change settings.
DROP POLICY IF EXISTS "app_settings_write_admin" ON common.app_settings;
CREATE POLICY "app_settings_write_admin"
    ON common.app_settings FOR ALL
    TO authenticated
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Admin', 'Super Admin')
        OR common.is_superuser_email(auth.jwt() ->> 'email')
    )
    WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Admin', 'Super Admin')
        OR common.is_superuser_email(auth.jwt() ->> 'email')
    );

GRANT SELECT ON common.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON common.app_settings TO authenticated;
GRANT ALL ON common.app_settings TO service_role;
