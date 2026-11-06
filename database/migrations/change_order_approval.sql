-- Customer approval for Change Orders (Project Management scope, item 13).
--
-- Why: most customers approve by replying to an email, some will sign online,
-- and work often starts before approval. Each Change Order now records how it
-- was approved with proof, and when work started early. Customers can sign
-- online through a link with no login.
--
--   neta_ops.job_change_orders            approval_method, approval_note, approval_file_*,
--                                         work_started_on, work_started_note
--   neta_ops.change_order_signatures      one row per "Send for signature"
--
-- Signing runs through the change-order-signature edge function with the
-- service key. The table stores a hash of each link's secret, never the secret,
-- plus a copy of the exact letter sent and its SHA-256 fingerprint.
-- Staff can read signature rows; only the edge function writes them.
--
-- Run before deploying the app update. Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

-- ---------------------------------------------------------------------------
-- How it was approved, and work started early
-- ---------------------------------------------------------------------------

ALTER TABLE neta_ops.job_change_orders
  ADD COLUMN IF NOT EXISTS approval_method text,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approval_file_url text,
  ADD COLUMN IF NOT EXISTS approval_file_path text,
  ADD COLUMN IF NOT EXISTS work_started_on date,
  ADD COLUMN IF NOT EXISTS work_started_note text;

ALTER TABLE neta_ops.job_change_orders
  DROP CONSTRAINT IF EXISTS job_change_orders_approval_method_check;
ALTER TABLE neta_ops.job_change_orders
  ADD CONSTRAINT job_change_orders_approval_method_check
  CHECK (approval_method IS NULL OR approval_method IN ('email', 'signed_online', 'customer_form', 'signed_letter'));

COMMENT ON COLUMN neta_ops.job_change_orders.approval_method IS
  'How the customer approved: email, signed_online, customer_form or signed_letter.';
COMMENT ON COLUMN neta_ops.job_change_orders.approval_note IS
  'Pasted approval email or a note about the approval.';
COMMENT ON COLUMN neta_ops.job_change_orders.work_started_on IS
  'Work began before approval on this date. Shown as "Work started, not approved" until approved.';
COMMENT ON COLUMN neta_ops.job_change_orders.work_started_note IS
  'The email or note that OK''d starting before approval.';

-- ---------------------------------------------------------------------------
-- Online signatures
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.change_order_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES neta_ops.job_change_orders(id) ON DELETE CASCADE,
  -- SHA-256 of the link's secret. The secret itself is only ever in the email.
  token_hash text NOT NULL UNIQUE,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  -- The exact letter sent, and its fingerprint
  letter_proposal_id uuid,
  letter_html text NOT NULL,
  letter_sha256 text NOT NULL,
  amount numeric(14,2),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'signed', 'declined', 'void')),
  consent_text text,
  signed_name text,
  signature_image text CHECK (signature_image IS NULL OR char_length(signature_image) <= 300000),
  signed_ip text,
  signed_user_agent text,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE neta_ops.change_order_signatures IS
  'Change Order letters sent for online signature. Written only by the change-order-signature edge function.';

CREATE INDEX IF NOT EXISTS idx_change_order_signatures_change_order
  ON neta_ops.change_order_signatures (change_order_id, sent_at DESC);

-- Not report data: skip the automatic snapshot copies
DROP TRIGGER IF EXISTS trg_snapshot_change_order_signatures_ins ON neta_ops.change_order_signatures;
DROP TRIGGER IF EXISTS trg_snapshot_change_order_signatures_upd ON neta_ops.change_order_signatures;

ALTER TABLE neta_ops.change_order_signatures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE neta_ops.change_order_signatures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE neta_ops.change_order_signatures TO authenticated;
GRANT ALL ON TABLE neta_ops.change_order_signatures TO service_role;

DROP POLICY IF EXISTS change_order_signatures_select ON neta_ops.change_order_signatures;
CREATE POLICY change_order_signatures_select ON neta_ops.change_order_signatures
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- The edge function reads and updates these with the service key
GRANT SELECT, UPDATE ON TABLE neta_ops.job_change_orders TO service_role;
GRANT SELECT ON TABLE neta_ops.jobs TO service_role;
GRANT SELECT ON TABLE business.opportunities TO service_role;
GRANT SELECT ON TABLE business.letter_proposals TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  (SELECT count(*) = 6 FROM information_schema.columns
    WHERE table_schema = 'neta_ops' AND table_name = 'job_change_orders'
      AND column_name IN ('approval_method', 'approval_note', 'approval_file_url',
                          'approval_file_path', 'work_started_on', 'work_started_note')) AS change_order_columns,
  to_regclass('neta_ops.change_order_signatures') IS NOT NULL AS signatures_table,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('neta_ops.change_order_signatures')) AS rls_on,
  NOT has_table_privilege('anon', 'neta_ops.change_order_signatures', 'SELECT') AS public_cannot_read,
  NOT EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid = to_regclass('neta_ops.change_order_signatures')
                 AND tgname LIKE 'trg_snapshot%') AS no_snapshot_triggers;
