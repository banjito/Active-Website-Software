-- Custom Forms: immutable template versions, version-pinned instances,
-- optimistic concurrency, and a result status that accepts LIMITED SERVICE.
--
-- Phase 0 of documentation/Custom Reports/CUSTOM_FORMS_PARITY_PLAN.md.
--
-- Additive and idempotent. It creates the version store, backfills one legacy
-- version per template, and pins every existing instance to it. Nothing is
-- deleted and no instance payload is rewritten.
--
-- KNOWN LIMITATION, recorded deliberately: the backfilled version carries the
-- template's CURRENT draft structure. Templates edited in place before this
-- migration ran cannot have their historical state reconstructed, so instances
-- created before today are pinned to a snapshot that may differ from the form
-- their author actually filled in. From this migration forward, a published
-- version can no longer change under an instance.

SET session_replication_role = 'replica';

-- ---------------------------------------------------------------------------
-- 1. Result status: allow LIMITED SERVICE
-- ---------------------------------------------------------------------------
-- The original constraint allowed only PASS and FAIL, so every attempt to save
-- a limited-service result failed at the database.

ALTER TABLE neta_ops.custom_form_instances
  DROP CONSTRAINT IF EXISTS custom_form_instances_status_check;

ALTER TABLE neta_ops.custom_form_instances
  ADD CONSTRAINT custom_form_instances_status_check
  CHECK (status IN ('PASS', 'FAIL', 'LIMITED SERVICE', 'N/A'));

-- ---------------------------------------------------------------------------
-- 2. Immutable template versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.custom_form_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL
    REFERENCES neta_ops.custom_form_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  -- 1 = the original flat structure, 2 = the document schema added in phase 2.
  schema_version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  neta_section TEXT,
  -- The compiled structure: sections plus settings, defaults normalised.
  structure JSONB NOT NULL,
  -- sha256 over canonical JSON, written by the application when it publishes.
  -- Null on rows the backfill imported: Postgres cannot reproduce the
  -- application's canonical form, and a checksum nobody can recompute is worse
  -- than none. Verification skips versions with no checksum.
  checksum TEXT,
  release_notes TEXT,
  -- 'imported' marks a version the backfill created from a mutable draft.
  origin TEXT NOT NULL DEFAULT 'published'
    CHECK (origin IN ('published', 'imported')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_custom_form_template_versions_template
  ON neta_ops.custom_form_template_versions(template_id, version DESC);

COMMENT ON TABLE neta_ops.custom_form_template_versions IS
  'Immutable published snapshots of a custom form template. Instances render from these, never from the mutable draft on custom_form_templates.';
COMMENT ON COLUMN neta_ops.custom_form_template_versions.origin IS
  'published = compiled from a draft by the builder. imported = created by the phase 0 backfill from a draft that had already been edited in place.';

-- Published payloads never change. Only release notes may be corrected.
CREATE OR REPLACE FUNCTION neta_ops.custom_form_version_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'custom_form_template_versions rows are immutable; instances are pinned to them';
  END IF;

  IF NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
     OR NEW.structure::text IS DISTINCT FROM OLD.structure::text
     OR NEW.checksum IS DISTINCT FROM OLD.checksum
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.neta_section IS DISTINCT FROM OLD.neta_section
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
  THEN
    RAISE EXCEPTION
      'custom_form_template_versions payload is immutable (version % of template %)',
      OLD.version, OLD.template_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS custom_form_versions_immutable
  ON neta_ops.custom_form_template_versions;
CREATE TRIGGER custom_form_versions_immutable
  BEFORE UPDATE OR DELETE ON neta_ops.custom_form_template_versions
  FOR EACH ROW
  EXECUTE FUNCTION neta_ops.custom_form_version_is_immutable();

ALTER TABLE neta_ops.custom_form_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view template versions"
  ON neta_ops.custom_form_template_versions;
CREATE POLICY "Authenticated users can view template versions"
  ON neta_ops.custom_form_template_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can publish template versions"
  ON neta_ops.custom_form_template_versions;
CREATE POLICY "Authenticated users can publish template versions"
  ON neta_ops.custom_form_template_versions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- No UPDATE or DELETE policy: publication is append-only at the policy layer
-- as well as the trigger layer.

-- ---------------------------------------------------------------------------
-- 3. Template identity: which version is live
-- ---------------------------------------------------------------------------

ALTER TABLE neta_ops.custom_form_templates
  ADD COLUMN IF NOT EXISTS active_version_id UUID
    REFERENCES neta_ops.custom_form_template_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latest_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN neta_ops.custom_form_templates.structure IS
  'The editable DRAFT structure. Filled-in forms never read this; they read the version they are pinned to.';
COMMENT ON COLUMN neta_ops.custom_form_templates.active_version_id IS
  'The published version new instances are created against.';

-- ---------------------------------------------------------------------------
-- 4. Version-pinned instances with optimistic concurrency
-- ---------------------------------------------------------------------------

ALTER TABLE neta_ops.custom_form_instances
  ADD COLUMN IF NOT EXISTS template_version_id UUID
    REFERENCES neta_ops.custom_form_template_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS template_version INTEGER,
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_checksum TEXT,
  -- Workflow is not a result. `status` stays as the result column so existing
  -- readers keep working; workflow_status carries review state from phase 5.
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (workflow_status IN
      ('draft', 'ready_for_review', 'in_review', 'changes_requested', 'approved'));

CREATE INDEX IF NOT EXISTS idx_custom_form_instances_version
  ON neta_ops.custom_form_instances(template_version_id);

COMMENT ON COLUMN neta_ops.custom_form_instances.status IS
  'RESULT status: PASS, FAIL, LIMITED SERVICE or N/A. Review state lives in workflow_status.';
COMMENT ON COLUMN neta_ops.custom_form_instances.revision IS
  'Bumped on every save. A save that sends a stale revision is rejected by save_custom_form_instance.';
COMMENT ON COLUMN neta_ops.custom_form_instances.schema_version IS
  '1 = flat sections map. 2 = durable state with stable row instance ids.';

-- Every save bumps the revision, so a concurrent writer can detect the clash.
CREATE OR REPLACE FUNCTION neta_ops.custom_form_instance_bump_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.revision = OLD.revision THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS custom_form_instances_bump_revision
  ON neta_ops.custom_form_instances;
CREATE TRIGGER custom_form_instances_bump_revision
  BEFORE UPDATE ON neta_ops.custom_form_instances
  FOR EACH ROW
  EXECUTE FUNCTION neta_ops.custom_form_instance_bump_revision();

-- ---------------------------------------------------------------------------
-- 5. Backfill: one imported version per template, then pin the instances
-- ---------------------------------------------------------------------------

INSERT INTO neta_ops.custom_form_template_versions (
  template_id, version, schema_version, name, description, neta_section,
  structure, checksum, origin, release_notes, created_by, published_by,
  published_at, created_at
)
SELECT
  t.id,
  1,
  1,
  t.name,
  t.description,
  t.neta_section,
  t.structure,
  NULL,
  'imported',
  'Imported by the phase 0 versioning migration from the template draft as it stood at migration time.',
  t.created_by,
  t.created_by,
  COALESCE(t.updated_at, t.created_at, NOW()),
  COALESCE(t.created_at, NOW())
FROM neta_ops.custom_form_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM neta_ops.custom_form_template_versions v
  WHERE v.template_id = t.id
);

UPDATE neta_ops.custom_form_templates t
SET active_version_id = v.id,
    latest_version = GREATEST(t.latest_version, v.version)
FROM neta_ops.custom_form_template_versions v
WHERE v.template_id = t.id
  AND v.version = 1
  AND t.active_version_id IS NULL;

UPDATE neta_ops.custom_form_instances i
SET template_version_id = v.id,
    template_version = v.version
FROM neta_ops.custom_form_template_versions v
WHERE i.template_id = v.template_id
  AND v.version = 1
  AND i.template_version_id IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Require a version on new instances, once the backfill has succeeded
-- ---------------------------------------------------------------------------
-- Instances whose template row was already deleted (template_id is null) keep
-- their data and stay unpinned; nothing can be reconstructed for them.

DO $$
DECLARE
  unpinned INTEGER;
BEGIN
  SELECT COUNT(*) INTO unpinned
  FROM neta_ops.custom_form_instances
  WHERE template_version_id IS NULL
    AND template_id IS NOT NULL;

  IF unpinned > 0 THEN
    RAISE WARNING
      'custom_form_instances: % rows still unpinned; version requirement not enforced',
      unpinned;
  ELSE
    ALTER TABLE neta_ops.custom_form_instances
      DROP CONSTRAINT IF EXISTS custom_form_instances_version_required;
    ALTER TABLE neta_ops.custom_form_instances
      ADD CONSTRAINT custom_form_instances_version_required
      CHECK (template_id IS NULL OR template_version_id IS NOT NULL)
      NOT VALID;
    -- NOT VALID leaves pre-existing rows alone and enforces the rule on every
    -- insert and update from here on.
  END IF;
END $$;

SET session_replication_role = 'origin';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) FILTER (WHERE template_version_id IS NULL) AS unpinned,
--        COUNT(*) AS total
-- FROM neta_ops.custom_form_instances;
--
-- SELECT t.name, t.latest_version, v.version, v.origin, v.checksum
-- FROM neta_ops.custom_form_templates t
-- LEFT JOIN neta_ops.custom_form_template_versions v
--   ON v.id = t.active_version_id
-- ORDER BY t.name;
