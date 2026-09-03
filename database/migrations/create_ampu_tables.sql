-- AMPu (the AMP University training module) — course catalog storage.
--
-- Until now /ampu ran off a hardcoded MOCK_COURSES seed in AmpuPage.tsx, so a
-- unit an admin wanted to publish meant a code change and a deploy. These two
-- tables move the catalog into the database: the registrar (Admin / super user)
-- adds a unit from the UI, every signed-in employee sees it immediately.
--
-- Learner progress is deliberately NOT here yet — it still lives in component
-- state for the length of a session. When it graduates, add ampu_lesson_progress
-- and ampu_quiz_attempts alongside these.

-- ── Registrar check ────────────────────────────────────────────────────────────
-- Mirrors the client-side gate in AmpuPage (role Admin/Super Admin, or a super
-- user email). Employees read the catalog; only the registrar writes it.
CREATE OR REPLACE FUNCTION common.is_ampu_registrar() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'common', 'public'
    AS $$
  SELECT
    auth.role() = 'authenticated'
    AND (
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
      OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
      OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
        'jack.lyons@ampqes.com'
      )
    );
$$;

-- ── Courses (a "unit" in the catalog) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS common.ampu_courses (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code                TEXT NOT NULL,               -- "SAF 701E", "ORI 101"
  title                      TEXT NOT NULL,
  description                TEXT NOT NULL DEFAULT '',
  department                 TEXT NOT NULL DEFAULT 'OTHER'
                               CHECK (department IN ('NFPA_70E', 'NFPA_70B', 'ONBOARDING', 'OTHER')),
  thumbnail                  TEXT NOT NULL DEFAULT '📘',  -- emoji stand-in for cover art
  instructor                 TEXT,                        -- "Dept. of Electrical Safety"
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 0,
  is_required                BOOLEAN NOT NULL DEFAULT false,
  sequential_unlock          BOOLEAN NOT NULL DEFAULT false,
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  sort_order                 INTEGER NOT NULL DEFAULT 0,
  created_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lessons (VIDEO / DOCUMENT; QUIZ rows carry their questions in `quiz`) ──────
CREATE TABLE IF NOT EXISTS common.ampu_lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES common.ampu_courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  lesson_type      TEXT NOT NULL DEFAULT 'VIDEO' CHECK (lesson_type IN ('VIDEO', 'QUIZ', 'DOCUMENT')),
  duration_seconds INTEGER,
  video_url        TEXT,        -- direct file URL, played by <video>
  youtube_id       TEXT,        -- YouTube id, played by the IFrame API
  document_url     TEXT,        -- public URL of an assigned PDF / Word doc
  document_name    TEXT,        -- original file name, shown on the download link
  quiz             JSONB,       -- { title, passingScorePercent, revealAnswersOnFail, questions[] }
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A video lesson needs somewhere to play from; a document lesson needs a file;
  -- a quiz lesson needs questions.
  CONSTRAINT ampu_lessons_payload_present CHECK (
    (lesson_type = 'VIDEO' AND (video_url IS NOT NULL OR youtube_id IS NOT NULL))
    OR (lesson_type = 'DOCUMENT' AND document_url IS NOT NULL)
    OR (lesson_type = 'QUIZ' AND quiz IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ampu_courses_active
  ON common.ampu_courses (is_active, sort_order);
-- Catalog numbers are unique among listed units. Withdrawn (is_active = false)
-- units keep their old number, so the index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ampu_courses_code_active
  ON common.ampu_courses (upper(course_code)) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_ampu_lessons_course
  ON common.ampu_lessons (course_id, sort_order);

-- ── updated_at maintenance ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION common.touch_ampu_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'common', 'public'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ampu_courses_updated_at ON common.ampu_courses;
CREATE TRIGGER trg_ampu_courses_updated_at
  BEFORE UPDATE ON common.ampu_courses
  FOR EACH ROW EXECUTE FUNCTION common.touch_ampu_updated_at();

DROP TRIGGER IF EXISTS trg_ampu_lessons_updated_at ON common.ampu_lessons;
CREATE TRIGGER trg_ampu_lessons_updated_at
  BEFORE UPDATE ON common.ampu_lessons
  FOR EACH ROW EXECUTE FUNCTION common.touch_ampu_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE common.ampu_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.ampu_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read the AMPu catalog" ON common.ampu_courses;
CREATE POLICY "Employees can read the AMPu catalog"
ON common.ampu_courses
FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Registrar manages AMPu courses" ON common.ampu_courses;
CREATE POLICY "Registrar manages AMPu courses"
ON common.ampu_courses
FOR ALL
USING (common.is_ampu_registrar())
WITH CHECK (common.is_ampu_registrar());

DROP POLICY IF EXISTS "Employees can read AMPu lessons" ON common.ampu_lessons;
CREATE POLICY "Employees can read AMPu lessons"
ON common.ampu_lessons
FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Registrar manages AMPu lessons" ON common.ampu_lessons;
CREATE POLICY "Registrar manages AMPu lessons"
ON common.ampu_lessons
FOR ALL
USING (common.is_ampu_registrar())
WITH CHECK (common.is_ampu_registrar());

GRANT USAGE ON SCHEMA common TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.ampu_courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.ampu_lessons TO authenticated;
GRANT EXECUTE ON FUNCTION common.is_ampu_registrar() TO authenticated;

COMMENT ON TABLE common.ampu_courses IS
  'AMPu training catalog. One row per unit/course; lessons live in common.ampu_lessons.';
COMMENT ON TABLE common.ampu_lessons IS
  'AMPu lessons. VIDEO rows carry video_url or youtube_id; DOCUMENT rows carry document_url (a PDF/Word file); QUIZ rows carry their questions in the quiz JSONB.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Learner progress + leaderboard
-- ══════════════════════════════════════════════════════════════════════════════
-- Progress used to live in React state for the length of a session. The
-- leaderboard needs everyone's standing, so it lives here now: one row per
-- (user, lesson), covering both lecture watch state and exam attempts.
--
-- Nobody reads anyone else's rows — RLS scopes the table to auth.uid(), and the
-- leaderboard is served by a SECURITY DEFINER function that only ever returns
-- aggregates.

CREATE TABLE IF NOT EXISTS common.ampu_progress (
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id           UUID NOT NULL REFERENCES common.ampu_lessons(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES common.ampu_courses(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress', 'completed')),
  last_watched_seconds INTEGER NOT NULL DEFAULT 0,
  -- Exam columns; null/zero on a lecture row.
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  best_score          INTEGER,
  last_score          INTEGER,
  passed              BOOLEAN NOT NULL DEFAULT false,
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_ampu_progress_user_course
  ON common.ampu_progress (user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_ampu_progress_completed
  ON common.ampu_progress (status) WHERE status = 'completed';

DROP TRIGGER IF EXISTS trg_ampu_progress_updated_at ON common.ampu_progress;
CREATE TRIGGER trg_ampu_progress_updated_at
  BEFORE UPDATE ON common.ampu_progress
  FOR EACH ROW EXECUTE FUNCTION common.touch_ampu_updated_at();

ALTER TABLE common.ampu_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own AMPu progress" ON common.ampu_progress;
CREATE POLICY "Users manage their own AMPu progress"
ON common.ampu_progress
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON common.ampu_progress TO authenticated;

-- ── Leaderboard ───────────────────────────────────────────────────────────────
-- Aggregates only: how many lectures/exams/units each employee has finished.
-- SECURITY DEFINER because it reads across users, which the RLS policy above
-- deliberately forbids; the employee check keeps it inside the company.
CREATE OR REPLACE FUNCTION common.ampu_leaderboard()
RETURNS TABLE (
  user_id           UUID,
  full_name         TEXT,
  lessons_completed BIGINT,
  exams_passed      BIGINT,
  units_completed   BIGINT,
  last_activity     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  WITH course_size AS (
    SELECT l.course_id, count(*) AS total
    FROM common.ampu_lessons l
    JOIN common.ampu_courses c ON c.id = l.course_id AND c.is_active
    GROUP BY l.course_id
  ),
  per_course AS (
    SELECT p.user_id, p.course_id, count(*) FILTER (WHERE p.status = 'completed') AS done
    FROM common.ampu_progress p
    JOIN common.ampu_courses c ON c.id = p.course_id AND c.is_active
    GROUP BY p.user_id, p.course_id
  ),
  totals AS (
    SELECT
      p.user_id,
      count(*) FILTER (WHERE p.status = 'completed')            AS lessons_completed,
      count(*) FILTER (WHERE p.passed)                          AS exams_passed,
      max(p.updated_at)                                         AS last_activity
    FROM common.ampu_progress p
    JOIN common.ampu_courses c ON c.id = p.course_id AND c.is_active
    GROUP BY p.user_id
  ),
  units AS (
    SELECT pc.user_id, count(*) AS units_completed
    FROM per_course pc
    JOIN course_size cs ON cs.course_id = pc.course_id
    WHERE pc.done >= cs.total AND cs.total > 0
    GROUP BY pc.user_id
  )
  SELECT
    t.user_id,
    COALESCE(NULLIF(btrim(pr.full_name), ''), split_part(COALESCE(pr.email, ''), '@', 1), 'Unknown'),
    t.lessons_completed,
    t.exams_passed,
    COALESCE(u.units_completed, 0),
    t.last_activity
  FROM totals t
  LEFT JOIN units u ON u.user_id = t.user_id
  LEFT JOIN common.profiles pr ON pr.id = t.user_id
  WHERE common.is_employee_user()
    AND COALESCE(pr.hidden, false) = false
  ORDER BY COALESCE(u.units_completed, 0) DESC, t.lessons_completed DESC, t.last_activity ASC;
$$;

GRANT EXECUTE ON FUNCTION common.ampu_leaderboard() TO authenticated;

COMMENT ON TABLE common.ampu_progress IS
  'AMPu learner progress, one row per (user, lesson). RLS scopes it to the owner; common.ampu_leaderboard() serves cross-user aggregates.';
