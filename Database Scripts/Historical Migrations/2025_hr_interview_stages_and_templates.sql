-- HR Portal - Interview Stages and Question Templates
-- Allows configurable interview stages and custom question templates per stage

-- Ensure common schema and trigger function exist (used by other HR migrations)
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

-- Interview stages (add/remove stages; order and default duration)
CREATE TABLE IF NOT EXISTS common.interview_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  default_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (default_duration_minutes > 0),
  is_final_stage BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Question template per stage (custom questions for feedback form)
CREATE TABLE IF NOT EXISTS common.interview_stage_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES common.interview_stages(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  question_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (question_type IN ('text', 'checkbox')),
  display_order INTEGER NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_stage_questions_stage_id ON common.interview_stage_questions(stage_id);

ALTER TABLE common.interview_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.interview_stage_questions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.interview_stages TO authenticated;
GRANT ALL ON common.interview_stages TO anon;
GRANT ALL ON common.interview_stage_questions TO authenticated;
GRANT ALL ON common.interview_stage_questions TO anon;

DROP TRIGGER IF EXISTS update_interview_stages_updated_at ON common.interview_stages;
CREATE TRIGGER update_interview_stages_updated_at
  BEFORE UPDATE ON common.interview_stages
  FOR EACH ROW EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_interview_stage_questions_updated_at ON common.interview_stage_questions;
CREATE TRIGGER update_interview_stage_questions_updated_at
  BEFORE UPDATE ON common.interview_stage_questions
  FOR EACH ROW EXECUTE FUNCTION common.update_updated_at_column();

-- Drop rigid CHECK on interviews.interview_stage so any stage slug from interview_stages is valid
ALTER TABLE common.interviews DROP CONSTRAINT IF EXISTS interviews_interview_stage_check;

-- Seed default stages (match existing: initial_culture, technical, final)
INSERT INTO common.interview_stages (name, slug, display_order, default_duration_minutes, is_final_stage)
VALUES
  ('Initial/Culture Interview', 'initial_culture', 1, 30, FALSE),
  ('Technical Interview', 'technical', 2, 60, FALSE),
  ('Final Interview', 'final', 3, 60, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Seed ALL default questions for initial_culture (insert each only if not already present by label)
INSERT INTO common.interview_stage_questions (stage_id, label, question_type, display_order, required)
SELECT s.id, v.label, v.question_type::VARCHAR(20), v.display_order, v.required
FROM common.interview_stages s
CROSS JOIN (VALUES
  ('Getting to know candidate', 'text', 1, FALSE),
  ('Why are they applying to AMP?', 'checkbox', 2, FALSE),
  ('What do they love about their job?', 'checkbox', 3, FALSE),
  ('What do they not love about their job?', 'checkbox', 4, FALSE),
  ('Do they fit and can they get excited about the culture?', 'text', 5, FALSE)
) AS v(label, question_type, display_order, required)
WHERE s.slug = 'initial_culture'
AND NOT EXISTS (SELECT 1 FROM common.interview_stage_questions q WHERE q.stage_id = s.id AND q.label = v.label);

-- Seed ALL default questions for technical (insert each only if not already present by label)
INSERT INTO common.interview_stage_questions (stage_id, label, question_type, display_order, required)
SELECT s.id, v.label, v.question_type::VARCHAR(20), v.display_order, v.required
FROM common.interview_stages s
CROSS JOIN (VALUES
  ('Focus on work experience', 'text', 1, FALSE),
  ('How do they react in situations?', 'text', 2, FALSE)
) AS v(label, question_type, display_order, required)
WHERE s.slug = 'technical'
AND NOT EXISTS (SELECT 1 FROM common.interview_stage_questions q WHERE q.stage_id = s.id AND q.label = v.label);

-- Final stage has no feedback questions (approve/deny only) - no rows needed

COMMENT ON TABLE common.interview_stages IS 'Configurable interview stages; slug is stored on common.interviews.interview_stage';
COMMENT ON TABLE common.interview_stage_questions IS 'Custom question template per interview stage for feedback forms';
