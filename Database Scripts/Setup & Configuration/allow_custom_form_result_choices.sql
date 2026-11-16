-- Custom forms can now add their own overall result choices (beyond
-- PASS / FAIL / LIMITED SERVICE / N/A), set per template in the builder.
-- The old check only allowed the four fixed words, so saving a report with an
-- added choice would fail. Replace it with a looser check: any non-blank
-- result up to 40 characters (the builder's limit).

ALTER TABLE neta_ops.custom_form_instances
  DROP CONSTRAINT IF EXISTS custom_form_instances_status_check;

ALTER TABLE neta_ops.custom_form_instances
  ADD CONSTRAINT custom_form_instances_status_check
  CHECK (status IS NULL OR (length(btrim(status)) BETWEEN 1 AND 40));

COMMENT ON COLUMN neta_ops.custom_form_instances.status IS
  'RESULT status: PASS, FAIL, LIMITED SERVICE, N/A, or a choice the template added (settings.customResultOptions). Review state lives in workflow_status.';
