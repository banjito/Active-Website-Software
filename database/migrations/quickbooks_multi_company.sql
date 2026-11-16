-- QuickBooks: one shared connection PER COMPANY (AMP, Armadillo, Scavenger)
-- instead of one connection total. AMP is marked as the main company: job
-- linking, billing, change orders and A/R stay on it. "Global" KPIs add up all.
--
-- Run this BEFORE deploying quickbooks-api and quickbooks-oauth.

BEGIN;

-- One admin can now connect several companies, so drop the one-row-per-user rule
ALTER TABLE common.quickbooks_integrations
  DROP CONSTRAINT IF EXISTS quickbooks_integrations_user_id_is_active_key;

ALTER TABLE common.quickbooks_integrations
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN common.quickbooks_integrations.is_primary IS
  'The main company (AMP). Job linking, billing, change orders and A/R use it.';

-- Older logins for the same company are dead (QuickBooks keeps only the newest).
-- Remove them so each company has exactly one active row.
DELETE FROM common.quickbooks_integrations older
USING common.quickbooks_integrations newer
WHERE older.is_active
  AND newer.is_active
  AND older.realm_id = newer.realm_id
  AND older.created_at < newer.created_at;

-- Today's only company is AMP: make it the main one
UPDATE common.quickbooks_integrations
SET is_primary = true
WHERE is_active
  AND id = (
    SELECT id FROM common.quickbooks_integrations
    WHERE is_active
    ORDER BY created_at DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS quickbooks_integrations_one_per_company
  ON common.quickbooks_integrations (realm_id) WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS quickbooks_integrations_one_primary
  ON common.quickbooks_integrations ((true)) WHERE is_active AND is_primary;

COMMENT ON TABLE common.quickbooks_integrations IS
  'One shared QuickBooks connection per company (realm). Admins connect; all employees use them.';

COMMIT;
