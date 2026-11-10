-- Library assemblies: a library item can list other library items as its parts.
--
-- Why: "Switchgear" sometimes has 5 breakers and sometimes 25. An assembly is a
-- parent row with its sub-rows already attached; the estimator just types the
-- quantities. Parts point at real library items, so a price change in the
-- library reaches every assembly. Estimates already built keep their own copy.
--
-- One level only: an assembly can't be a part, and a part can't have parts.
-- Same access as the rest of the scope library (any signed-in user).
-- Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS business.estimating_scope_library_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL
    REFERENCES business.estimating_scope_library_items(id) ON DELETE CASCADE,
  component_id uuid NOT NULL
    REFERENCES business.estimating_scope_library_items(id) ON DELETE CASCADE,
  default_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_quantity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimating_scope_library_item_components_not_self
    CHECK (assembly_id <> component_id)
);

COMMENT ON TABLE business.estimating_scope_library_item_components IS
  'Parts of a library assembly. Picking the assembly in an estimate drops a parent row with these as sub-rows.';

CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_item_components_assembly
  ON business.estimating_scope_library_item_components (assembly_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_item_components_component
  ON business.estimating_scope_library_item_components (component_id);

-- Keep it one level deep.
CREATE OR REPLACE FUNCTION business.check_estimating_scope_library_component_depth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business.estimating_scope_library_item_components
    WHERE assembly_id = NEW.component_id
  ) THEN
    RAISE EXCEPTION 'That library item has its own parts, so it can''t be a part.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM business.estimating_scope_library_item_components
    WHERE component_id = NEW.assembly_id
  ) THEN
    RAISE EXCEPTION 'This library item is a part of another assembly, so it can''t have parts.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimating_scope_library_component_depth
  ON business.estimating_scope_library_item_components;
CREATE TRIGGER trg_estimating_scope_library_component_depth
  BEFORE INSERT OR UPDATE ON business.estimating_scope_library_item_components
  FOR EACH ROW EXECUTE FUNCTION business.check_estimating_scope_library_component_depth();

ALTER TABLE business.estimating_scope_library_item_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view scope library components"
  ON business.estimating_scope_library_item_components;
CREATE POLICY "Authenticated users can view scope library components"
  ON business.estimating_scope_library_item_components
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert scope library components"
  ON business.estimating_scope_library_item_components;
CREATE POLICY "Authenticated users can insert scope library components"
  ON business.estimating_scope_library_item_components
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update scope library components"
  ON business.estimating_scope_library_item_components;
CREATE POLICY "Authenticated users can update scope library components"
  ON business.estimating_scope_library_item_components
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete scope library components"
  ON business.estimating_scope_library_item_components;
CREATE POLICY "Authenticated users can delete scope library components"
  ON business.estimating_scope_library_item_components
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON business.estimating_scope_library_item_components TO authenticated;
GRANT ALL ON business.estimating_scope_library_item_components TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
