-- HR Portal - Candidate Communication Templates
-- Email/message templates with placeholders (e.g. {{first_name}}, {{position_applied}}) for candidate outreach

DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'common' AND p.proname = 'update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION common.update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $outer$;

CREATE TABLE IF NOT EXISTS common.candidate_communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  subject VARCHAR(500) NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_communication_templates_name ON common.candidate_communication_templates(name);

ALTER TABLE common.candidate_communication_templates DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.candidate_communication_templates TO authenticated;
GRANT ALL ON common.candidate_communication_templates TO anon;

DROP TRIGGER IF EXISTS update_candidate_communication_templates_updated_at ON common.candidate_communication_templates;
CREATE TRIGGER update_candidate_communication_templates_updated_at
  BEFORE UPDATE ON common.candidate_communication_templates
  FOR EACH ROW EXECUTE FUNCTION common.update_updated_at_column();

COMMENT ON TABLE common.candidate_communication_templates IS 'Email/message templates for candidate outreach; body and subject support placeholders: {{first_name}}, {{last_name}}, {{candidate_name}}, {{email}}, {{position_applied}}, {{phone}}, {{location}}';
