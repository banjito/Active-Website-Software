-- AMPu — assignable documents (PDF / Word) as a lesson type.
--
-- Adds a DOCUMENT lesson kind alongside VIDEO and QUIZ. A document lesson points
-- at a file uploaded to the public `documents` storage bucket (prefix
-- `ampu-documents/`); the learner opens it, then marks it read — the same
-- completion path a lecture uses.
--
-- Safe to run on an instance that already has common.ampu_lessons; the base
-- create_ampu_tables.sql carries the same columns for fresh instances.

ALTER TABLE common.ampu_lessons
  ADD COLUMN IF NOT EXISTS document_url  TEXT,
  ADD COLUMN IF NOT EXISTS document_name TEXT;

-- Allow the new lesson_type value.
ALTER TABLE common.ampu_lessons
  DROP CONSTRAINT IF EXISTS ampu_lessons_lesson_type_check;
ALTER TABLE common.ampu_lessons
  ADD CONSTRAINT ampu_lessons_lesson_type_check
  CHECK (lesson_type IN ('VIDEO', 'QUIZ', 'DOCUMENT'));

-- A document lesson must have a file to open.
ALTER TABLE common.ampu_lessons
  DROP CONSTRAINT IF EXISTS ampu_lessons_payload_present;
ALTER TABLE common.ampu_lessons
  ADD CONSTRAINT ampu_lessons_payload_present CHECK (
    (lesson_type = 'VIDEO' AND (video_url IS NOT NULL OR youtube_id IS NOT NULL))
    OR (lesson_type = 'DOCUMENT' AND document_url IS NOT NULL)
    OR (lesson_type = 'QUIZ' AND quiz IS NOT NULL)
  );

COMMENT ON TABLE common.ampu_lessons IS
  'AMPu lessons. VIDEO rows carry video_url or youtube_id; DOCUMENT rows carry document_url (a PDF/Word file); QUIZ rows carry their questions in the quiz JSONB.';
