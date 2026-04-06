-- Add is_published column to custom_form_templates
-- Templates will only appear in the job's "Custom Forms" dropdown when published
-- Unpublished templates are still visible in the templates management page (as drafts)

ALTER TABLE neta_ops.custom_form_templates
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Create index for filtering published templates
CREATE INDEX IF NOT EXISTS idx_custom_form_templates_published
  ON neta_ops.custom_form_templates(is_published);
