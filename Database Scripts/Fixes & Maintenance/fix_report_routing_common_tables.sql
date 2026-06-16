-- Fix missing common tables used by the client.
-- Also ensure the small-breaker report table has normal authenticated access.

CREATE SCHEMA IF NOT EXISTS common;

CREATE TABLE IF NOT EXISTS common.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS common.role_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_config JSONB,
  new_config JSONB,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA common TO authenticated;
GRANT SELECT, INSERT, UPDATE ON common.system_config TO authenticated;
GRANT SELECT, INSERT ON common.role_audit_logs TO authenticated;

ALTER TABLE common.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.role_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_config_select_authenticated" ON common.system_config;
CREATE POLICY "system_config_select_authenticated"
  ON common.system_config
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "system_config_insert_authenticated" ON common.system_config;
CREATE POLICY "system_config_insert_authenticated"
  ON common.system_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "system_config_update_authenticated" ON common.system_config;
CREATE POLICY "system_config_update_authenticated"
  ON common.system_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "role_audit_logs_select_authenticated" ON common.role_audit_logs;
CREATE POLICY "role_audit_logs_select_authenticated"
  ON common.role_audit_logs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "role_audit_logs_insert_authenticated" ON common.role_audit_logs;
CREATE POLICY "role_audit_logs_insert_authenticated"
  ON common.role_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT ALL ON neta_ops.low_voltage_panelboard_small_breaker_reports TO authenticated;
ALTER TABLE neta_ops.low_voltage_panelboard_small_breaker_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lv_panelboard_small_breaker_select_authenticated"
  ON neta_ops.low_voltage_panelboard_small_breaker_reports;
CREATE POLICY "lv_panelboard_small_breaker_select_authenticated"
  ON neta_ops.low_voltage_panelboard_small_breaker_reports
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "lv_panelboard_small_breaker_insert_authenticated"
  ON neta_ops.low_voltage_panelboard_small_breaker_reports;
CREATE POLICY "lv_panelboard_small_breaker_insert_authenticated"
  ON neta_ops.low_voltage_panelboard_small_breaker_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lv_panelboard_small_breaker_update_authenticated"
  ON neta_ops.low_voltage_panelboard_small_breaker_reports;
CREATE POLICY "lv_panelboard_small_breaker_update_authenticated"
  ON neta_ops.low_voltage_panelboard_small_breaker_reports
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = user_id);
