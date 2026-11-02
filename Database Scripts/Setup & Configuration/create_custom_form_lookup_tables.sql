-- ============================================================================
-- Custom Form Lookup Tables (shared library)
-- ============================================================================
-- Run this script in Supabase SQL Editor so the Lookup Tables page can save
-- tables (e.g. NETA Table 100.1) that every custom form formula can read with
-- lookup("table.id", {key}).
--
-- Tables ship unverified. An engineer should check every value against the
-- governing standard and tick "Engineer verified" before forms rely on them.
-- ============================================================================

CREATE TABLE IF NOT EXISTS neta_ops.custom_form_lookup_tables (
  -- The id formulas use, e.g. 'neta.table100_1'. Never renamed once in use.
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  key_type TEXT NOT NULL DEFAULT 'number' CHECK (key_type IN ('number', 'string')),
  value_type TEXT NOT NULL DEFAULT 'number' CHECK (value_type IN ('number', 'string', 'boolean')),
  -- 'exact' = key must match; 'range' = numeric "up to" rows.
  match TEXT NOT NULL DEFAULT 'exact' CHECK (match IN ('exact', 'range')),
  key_label TEXT,
  value_label TEXT,
  -- Extra value columns beyond the main value, e.g. ["minimumMegohms"].
  columns JSONB NOT NULL DEFAULT '[]',
  -- [{ "key": 250, "value": 500, "values": { "minimumMegohms": 25 } }, ...]
  entries JSONB NOT NULL DEFAULT '[]',
  fallback JSONB,
  engineering_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE neta_ops.custom_form_lookup_tables IS 'Shared lookup tables (NETA criteria etc.) that custom form formulas read with lookup()';

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.custom_form_lookup_tables TO authenticated;

ALTER TABLE neta_ops.custom_form_lookup_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_form_lookup_tables_select ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_select ON neta_ops.custom_form_lookup_tables
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS custom_form_lookup_tables_insert ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_insert ON neta_ops.custom_form_lookup_tables
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS custom_form_lookup_tables_update ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_update ON neta_ops.custom_form_lookup_tables
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS custom_form_lookup_tables_delete ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_delete ON neta_ops.custom_form_lookup_tables
  FOR DELETE TO authenticated USING (true);

-- Make the Supabase API see the new table right away.
NOTIFY pgrst, 'reload schema';
