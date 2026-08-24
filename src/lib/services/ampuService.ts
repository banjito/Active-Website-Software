/**
 * AMPu catalog data layer — common.ampu_courses / common.ampu_lessons.
 *
 * See database/migrations/create_ampu_tables.sql. Reads are open to any
 * signed-in employee; writes are gated to the registrar (Admin / Super Admin /
 * super user) by RLS, so a non-admin who forces the UI open still gets a 403
 * from Postgres rather than a silent write.
 *
 * Learner progress is NOT stored here yet — it lives in AmpuPage component
 * state for the length of a session.
 */

import { supabase } from '../supabase';
import { describeSupabaseError, withWriteRetry } from '../supabaseRetry';
import type {
  Course,
  Department,
  Lesson,
  ProgressState,
  Quiz,
} from '@/app/ampu/types';

const SCHEMA = 'common';
const COURSES = 'ampu_courses';
const LESSONS = 'ampu_lessons';

/** Where the catalog on screen came from. */
export type CatalogSource = 'database' | 'seed';

export interface CatalogResult {
  courses: Course[];
  source: CatalogSource;
  /** Set when we fell back to the seed because the tables aren't there yet. */
  reason?: string;
}

export interface NewLessonInput {
  title: string;
  type?: 'VIDEO' | 'QUIZ';
  durationSeconds?: number;
  videoUrl?: string;
  youtubeId?: string;
  quiz?: Quiz;
}

export interface NewCourseInput {
  code: string;
  title: string;
  description: string;
  department: Department;
  thumbnail: string;
  instructor?: string;
  estimatedDurationMinutes?: number;
  isRequired: boolean;
  sequentialUnlock: boolean;
  lessons: NewLessonInput[];
}

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

interface CourseRow {
  id: string;
  course_code: string;
  title: string;
  description: string | null;
  department: Department;
  thumbnail: string | null;
  instructor: string | null;
  estimated_duration_minutes: number | null;
  is_required: boolean;
  sequential_unlock: boolean;
  sort_order: number;
}

interface LessonRow {
  id: string;
  course_id: string;
  title: string;
  lesson_type: 'VIDEO' | 'QUIZ';
  duration_seconds: number | null;
  video_url: string | null;
  youtube_id: string | null;
  quiz: Quiz | null;
  sort_order: number;
}

/**
 * True when the failure is "these tables don't exist yet" rather than a real
 * error — PostgREST reports an unknown relation as 42P01, or PGRST205 when it
 * is the schema cache that has never seen it.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST106') return true;
  return /could not find the table|relation .* does not exist/i.test(error.message ?? '');
}

function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    title: row.title,
    type: row.lesson_type,
    durationSeconds: row.duration_seconds ?? undefined,
    videoUrl: row.video_url ?? undefined,
    youtubeId: row.youtube_id ?? undefined,
    quiz: row.quiz ?? undefined,
  };
}

function toCourse(row: CourseRow, lessons: Lesson[]): Course {
  return {
    id: row.id,
    code: row.course_code,
    title: row.title,
    description: row.description ?? '',
    department: row.department,
    thumbnail: row.thumbnail || '📘',
    instructor: row.instructor ?? undefined,
    estimatedDurationMinutes: row.estimated_duration_minutes ?? 0,
    isRequired: row.is_required,
    sequentialUnlock: row.sequential_unlock,
    lessons,
  };
}

/** Minutes a unit runs, from its lessons, when the admin didn't say. */
function derivedMinutes(lessons: NewLessonInput[]): number {
  const seconds = lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0);
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Loads the published catalog. Falls back to the caller-supplied seed when the
 * migration hasn't been run, so /ampu keeps working on a fresh instance.
 */
export async function fetchCatalog(seed: Course[]): Promise<CatalogResult> {
  const { data: courseRows, error: courseError } = await supabase
    .schema(SCHEMA)
    .from(COURSES)
    .select(
      'id, course_code, title, description, department, thumbnail, instructor, estimated_duration_minutes, is_required, sequential_unlock, sort_order',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('course_code', { ascending: true });

  if (courseError) {
    if (isMissingTable(courseError)) {
      return {
        courses: seed,
        source: 'seed',
        reason:
          'The AMPu catalog tables have not been created yet. Run database/migrations/create_ampu_tables.sql to publish units.',
      };
    }
    throw new Error(describeSupabaseError(courseError));
  }

  const courses = (courseRows ?? []) as CourseRow[];
  if (courses.length === 0) return { courses: [], source: 'database' };

  const { data: lessonRows, error: lessonError } = await supabase
    .schema(SCHEMA)
    .from(LESSONS)
    .select('id, course_id, title, lesson_type, duration_seconds, video_url, youtube_id, quiz, sort_order')
    .in('course_id', courses.map((c) => c.id))
    .order('sort_order', { ascending: true });

  if (lessonError) throw new Error(describeSupabaseError(lessonError));

  const byCourse = new Map<string, Lesson[]>();
  for (const row of (lessonRows ?? []) as LessonRow[]) {
    const list = byCourse.get(row.course_id) ?? [];
    list.push(toLesson(row));
    byCourse.set(row.course_id, list);
  }

  return {
    courses: courses.map((row) => toCourse(row, byCourse.get(row.id) ?? [])),
    source: 'database',
  };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Publishes a new unit and its lessons.
 *
 * Both ids are minted client-side so the insert is an idempotent upsert: a
 * retried write after a dropped connection lands on the same rows instead of
 * creating a second copy of the unit.
 */
export async function createCourse(input: NewCourseInput): Promise<Course> {
  const courseId = crypto.randomUUID();
  const { data: session } = await supabase.auth.getUser();

  const coursePayload = {
    id: courseId,
    course_code: input.code.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    department: input.department,
    thumbnail: input.thumbnail || '📘',
    instructor: input.instructor?.trim() || null,
    estimated_duration_minutes:
      input.estimatedDurationMinutes ?? derivedMinutes(input.lessons),
    is_required: input.isRequired,
    sequential_unlock: input.sequentialUnlock,
    is_active: true,
    sort_order: 0,
    created_by: session?.user?.id ?? null,
  };

  const { error: courseError } = await withWriteRetry(
    () => supabase.schema(SCHEMA).from(COURSES).upsert(coursePayload),
    { label: 'ampu createCourse' },
  );
  if (courseError) throw new Error(describeSupabaseError(courseError));

  const lessons = input.lessons.map((lesson, index) => ({
    id: crypto.randomUUID(),
    course_id: courseId,
    title: lesson.title.trim(),
    lesson_type: lesson.type ?? 'VIDEO',
    duration_seconds: lesson.durationSeconds ?? null,
    video_url: lesson.videoUrl ?? null,
    youtube_id: lesson.youtubeId ?? null,
    quiz: lesson.quiz ?? null,
    sort_order: index,
  }));

  if (lessons.length > 0) {
    const { error: lessonError } = await withWriteRetry(
      () => supabase.schema(SCHEMA).from(LESSONS).upsert(lessons),
      { label: 'ampu createCourse lessons' },
    );
    if (lessonError) {
      // Don't leave a unit with no way in: drop the shell we just wrote.
      await supabase.schema(SCHEMA).from(COURSES).delete().eq('id', courseId);
      throw new Error(describeSupabaseError(lessonError));
    }
  }

  return {
    id: courseId,
    code: coursePayload.course_code,
    title: coursePayload.title,
    description: coursePayload.description,
    department: input.department,
    thumbnail: coursePayload.thumbnail,
    instructor: coursePayload.instructor ?? undefined,
    estimatedDurationMinutes: coursePayload.estimated_duration_minutes,
    isRequired: coursePayload.is_required,
    sequentialUnlock: coursePayload.sequential_unlock,
    lessons: lessons.map((l) =>
      toLesson({ ...l, quiz: l.quiz as Quiz | null } as LessonRow),
    ),
  };
}

/** Appends a lesson to an existing unit. */
export async function addLesson(
  courseId: string,
  input: NewLessonInput,
): Promise<Lesson> {
  const { data: existing, error: countError } = await supabase
    .schema(SCHEMA)
    .from(LESSONS)
    .select('sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (countError) throw new Error(describeSupabaseError(countError));

  const row = {
    id: crypto.randomUUID(),
    course_id: courseId,
    title: input.title.trim(),
    lesson_type: input.type ?? 'VIDEO',
    duration_seconds: input.durationSeconds ?? null,
    video_url: input.videoUrl ?? null,
    youtube_id: input.youtubeId ?? null,
    quiz: input.quiz ?? null,
    sort_order: ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1,
  };

  const { error } = await withWriteRetry(
    () => supabase.schema(SCHEMA).from(LESSONS).upsert(row),
    { label: 'ampu addLesson' },
  );
  if (error) throw new Error(describeSupabaseError(error));

  return toLesson({ ...row, quiz: row.quiz as Quiz | null } as LessonRow);
}

/** Pulls a unit out of the catalog without destroying attempt history. */
export async function archiveCourse(courseId: string): Promise<void> {
  const { error } = await withWriteRetry(
    () =>
      supabase
        .schema(SCHEMA)
        .from(COURSES)
        .update({ is_active: false })
        .eq('id', courseId),
    { label: 'ampu archiveCourse' },
  );
  if (error) throw new Error(describeSupabaseError(error));
}

/**
 * One-shot helper for a brand-new instance: writes the built-in starter units
 * into an empty catalog so the registrar has something to edit rather than a
 * blank page.
 */
export async function publishSeedCatalog(seed: Course[]): Promise<Course[]> {
  const published: Course[] = [];
  for (const course of seed) {
    published.push(
      await createCourse({
        code: course.code,
        title: course.title,
        description: course.description,
        department: course.department,
        thumbnail: course.thumbnail,
        instructor: course.instructor,
        estimatedDurationMinutes: course.estimatedDurationMinutes,
        isRequired: course.isRequired,
        sequentialUnlock: course.sequentialUnlock,
        lessons: course.lessons.map((lesson) => ({
          title: lesson.title,
          type: lesson.type,
          durationSeconds: lesson.durationSeconds,
          videoUrl: lesson.videoUrl,
          youtubeId: lesson.youtubeId,
          quiz: lesson.quiz,
        })),
      }),
    );
  }
  return published;
}

/* ------------------------------------------------------------------ */
/* Learner progress                                                    */
/* ------------------------------------------------------------------ */

const PROGRESS = 'ampu_progress';

interface ProgressRow {
  lesson_id: string;
  course_id: string;
  status: 'in_progress' | 'completed';
  last_watched_seconds: number;
  attempt_count: number;
  best_score: number | null;
  last_score: number | null;
  passed: boolean;
  completed_at: string | null;
}

/** Message shown when common.ampu_progress hasn't been created yet. */
export const PROGRESS_UNAVAILABLE =
  'Progress is not being saved: the AMPu progress table does not exist yet. Run database/migrations/create_ampu_tables.sql.';

export interface MyProgressResult {
  progress: ProgressState;
  /** False when the progress table is missing, so nothing can be saved. */
  available: boolean;
}

/**
 * Loads the signed-in user's progress, keyed the way the UI holds it.
 *
 * Quiz records are keyed by quiz id rather than lesson id, so the caller passes
 * the catalog to map one to the other. Reports `available: false` rather than
 * throwing when the table isn't there yet, so /ampu still runs and the UI can
 * say plainly that nothing is being recorded.
 */
export async function fetchMyProgress(courses: Course[]): Promise<MyProgressResult> {
  const empty: ProgressState = { lessons: {}, quizzes: {}, courseCertifiedAt: {} };

  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return { progress: empty, available: true };

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(PROGRESS)
    .select(
      'lesson_id, course_id, status, last_watched_seconds, attempt_count, best_score, last_score, passed, completed_at',
    )
    .eq('user_id', userId);

  if (error) {
    if (isMissingTable(error)) return { progress: empty, available: false };
    throw new Error(describeSupabaseError(error));
  }

  // lesson id -> quiz id, for the rows that represent an exam.
  const quizIdByLesson = new Map<string, string>();
  for (const course of courses) {
    for (const lesson of course.lessons) {
      if (lesson.type === 'QUIZ' && lesson.quiz) {
        quizIdByLesson.set(lesson.id, lesson.quiz.id);
      }
    }
  }

  const state: ProgressState = { lessons: {}, quizzes: {}, courseCertifiedAt: {} };
  for (const row of (data ?? []) as ProgressRow[]) {
    const quizId = quizIdByLesson.get(row.lesson_id);
    if (quizId) {
      state.quizzes[quizId] = {
        attemptCount: row.attempt_count,
        bestScore: row.best_score ?? 0,
        lastScore: row.last_score ?? 0,
        passed: row.passed,
      };
    } else {
      state.lessons[row.lesson_id] = {
        status: row.status,
        lastWatchedSeconds: row.last_watched_seconds,
      };
    }
  }

  // A unit is certified as of the moment its last lesson was completed.
  for (const course of courses) {
    if (course.lessons.length === 0) continue;
    const stamps = course.lessons.map((lesson) => {
      const row = (data ?? []).find(
        (r: ProgressRow) => r.lesson_id === lesson.id && r.status === 'completed',
      ) as ProgressRow | undefined;
      return row?.completed_at ?? null;
    });
    if (stamps.every((s): s is string => Boolean(s))) {
      state.courseCertifiedAt[course.id] = stamps.reduce((a, b) => (a > b ? a : b));
    }
  }

  return { progress: state, available: true };
}

interface LessonProgressWrite {
  lessonId: string;
  courseId: string;
  status: 'in_progress' | 'completed';
  lastWatchedSeconds?: number;
}

/**
 * Records where someone got to in a lecture.
 *
 * Keyed on (user_id, lesson_id), so this is a true upsert — a retry after a
 * dropped connection overwrites the same row rather than adding another.
 */
export async function saveLessonProgress(write: LessonProgressWrite): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return;

  const { error } = await withWriteRetry(
    () =>
      supabase
        .schema(SCHEMA)
        .from(PROGRESS)
        .upsert(
          {
            user_id: userId,
            lesson_id: write.lessonId,
            course_id: write.courseId,
            status: write.status,
            last_watched_seconds: Math.round(write.lastWatchedSeconds ?? 0),
            completed_at: write.status === 'completed' ? new Date().toISOString() : null,
          },
          { onConflict: 'user_id,lesson_id' },
        ),
    { label: 'ampu saveLessonProgress' },
  );
  if (error) {
    throw new Error(
      isMissingTable(error) ? PROGRESS_UNAVAILABLE : describeSupabaseError(error),
    );
  }
}

interface QuizAttemptWrite {
  lessonId: string;
  courseId: string;
  attemptCount: number;
  bestScore: number;
  lastScore: number;
  passed: boolean;
}

/** Records an exam sitting. A passed exam completes its lesson. */
export async function saveQuizAttempt(write: QuizAttemptWrite): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return;

  const { error } = await withWriteRetry(
    () =>
      supabase
        .schema(SCHEMA)
        .from(PROGRESS)
        .upsert(
          {
            user_id: userId,
            lesson_id: write.lessonId,
            course_id: write.courseId,
            status: write.passed ? 'completed' : 'in_progress',
            attempt_count: write.attemptCount,
            best_score: write.bestScore,
            last_score: write.lastScore,
            passed: write.passed,
            completed_at: write.passed ? new Date().toISOString() : null,
          },
          { onConflict: 'user_id,lesson_id' },
        ),
    { label: 'ampu saveQuizAttempt' },
  );
  if (error) {
    throw new Error(
      isMissingTable(error) ? PROGRESS_UNAVAILABLE : describeSupabaseError(error),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export interface LeaderboardRow {
  userId: string;
  name: string;
  lessonsCompleted: number;
  examsPassed: number;
  unitsCompleted: number;
  lastActivity: string | null;
}

/**
 * Standings across the company, from common.ampu_leaderboard(). The function
 * returns aggregates only — never another employee's individual progress.
 * Returns an empty board when the tables aren't there yet.
 */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.schema(SCHEMA).rpc('ampu_leaderboard');

  if (error) {
    if (isMissingTable(error) || error.code === 'PGRST202') return [];
    throw new Error(describeSupabaseError(error));
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    userId: String(row.user_id),
    name: String(row.full_name ?? 'Unknown'),
    lessonsCompleted: Number(row.lessons_completed ?? 0),
    examsPassed: Number(row.exams_passed ?? 0),
    unitsCompleted: Number(row.units_completed ?? 0),
    lastActivity: (row.last_activity as string | null) ?? null,
  }));
}
