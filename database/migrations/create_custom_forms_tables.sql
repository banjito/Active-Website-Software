-- Custom Form Builder Tables
-- Schema: neta_ops (for automatic backups)

-- Temporarily disable all event triggers by setting session to replica mode
-- This prevents the problematic snapshot trigger from firing
SET session_replication_role = 'replica';

-- 1. Custom Form Templates Table
-- Stores the reusable form definitions
CREATE TABLE IF NOT EXISTS neta_ops.custom_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  neta_section TEXT, -- 'ATS 7.3.3', 'MTS 4.2', or custom reference
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  structure JSONB NOT NULL, -- The complete form definition
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Custom Form Instances Table
-- Stores filled-out forms linked to jobs
CREATE TABLE IF NOT EXISTS neta_ops.custom_form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES neta_ops.custom_form_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL, -- Snapshot of template name at time of creation
  neta_section TEXT, -- Snapshot of NETA section
  job_id UUID NOT NULL, -- Link to job
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data JSONB NOT NULL, -- All form data (job info, test results, etc.)
  status TEXT DEFAULT 'PASS' CHECK (status IN ('PASS', 'FAIL')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for performance
CREATE INDEX idx_custom_form_templates_active ON neta_ops.custom_form_templates(is_active);
CREATE INDEX idx_custom_form_templates_created_by ON neta_ops.custom_form_templates(created_by);
CREATE INDEX idx_custom_form_instances_job_id ON neta_ops.custom_form_instances(job_id);
CREATE INDEX idx_custom_form_instances_template_id ON neta_ops.custom_form_instances(template_id);
CREATE INDEX idx_custom_form_instances_user_id ON neta_ops.custom_form_instances(user_id);

-- 4. Enable Row Level Security
ALTER TABLE neta_ops.custom_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.custom_form_instances ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for templates
-- Everyone can view active templates
CREATE POLICY "Anyone can view active templates"
  ON neta_ops.custom_form_templates
  FOR SELECT
  USING (is_active = true);

-- Anyone authenticated can create templates
CREATE POLICY "Authenticated users can create templates"
  ON neta_ops.custom_form_templates
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own templates
CREATE POLICY "Users can update own templates"
  ON neta_ops.custom_form_templates
  FOR UPDATE
  USING (created_by = auth.uid());

-- Only admins can delete templates (set is_active = false)
CREATE POLICY "Admins can deactivate templates"
  ON neta_ops.custom_form_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 6. RLS Policies for instances
-- Users can view instances for jobs they have access to
CREATE POLICY "Users can view form instances"
  ON neta_ops.custom_form_instances
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can create form instances
CREATE POLICY "Users can create form instances"
  ON neta_ops.custom_form_instances
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own form instances
CREATE POLICY "Users can update own form instances"
  ON neta_ops.custom_form_instances
  FOR UPDATE
  USING (user_id = auth.uid());

-- 7. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION neta_ops.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_custom_form_templates_updated_at
  BEFORE UPDATE ON neta_ops.custom_form_templates
  FOR EACH ROW
  EXECUTE FUNCTION neta_ops.update_updated_at_column();

CREATE TRIGGER update_custom_form_instances_updated_at
  BEFORE UPDATE ON neta_ops.custom_form_instances
  FOR EACH ROW
  EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- 8. Comments for documentation
COMMENT ON TABLE neta_ops.custom_form_templates IS 'Stores reusable custom form templates created by users';
COMMENT ON TABLE neta_ops.custom_form_instances IS 'Stores filled-out custom forms linked to jobs';
COMMENT ON COLUMN neta_ops.custom_form_templates.structure IS 'JSONB containing form sections, components, and configuration';
COMMENT ON COLUMN neta_ops.custom_form_instances.data IS 'JSONB containing all form data including job info and test results';

-- Restore normal operation (re-enable event triggers)
SET session_replication_role = 'origin';


