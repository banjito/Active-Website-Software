/**
 * AMPu — the AMP training college.
 *
 * The catalog lives in the database (common.ampu_courses /
 * common.ampu_lessons, see src/lib/services/ampuService.ts): an admin publishes
 * units with the New Unit button on the catalog and every employee sees them.
 * When those tables don't exist yet the page falls back to the built-in seed
 * catalog so /ampu still works on a fresh instance.
 *
 * Routes (mounted under /ampu/* in App.tsx):
 *   /ampu                                        course catalog
 *   /ampu/transcript                             the signed-in user's record
 *   /ampu/course/:courseId                       syllabus
 *   /ampu/course/:courseId/lesson/:lessonId      a lecture or an exam
 *   /ampu/leaderboard                            company-wide standings
 *
 * Learner progress is persisted per user in common.ampu_progress. It is held in
 * `progress` state here (loaded once, on the first catalog that arrives) and
 * written through on change; a playing video's position is throttled to
 * PROGRESS_WRITE_INTERVAL_MS. The leaderboard reads aggregates across users via
 * the common.ampu_leaderboard() function — RLS keeps raw rows private to their
 * owner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "../../components/ui";
import { BRAND_COLOR, companyConfig } from "@/lib/companyConfig";
import { useAuth } from "@/lib/AuthContext";
import { isSuperUser } from "@/lib/roles";
import {
  archiveCourse,
  fetchCatalog,
  fetchLeaderboard,
  fetchMyProgress,
  publishSeedCatalog,
  PROGRESS_UNAVAILABLE,
  saveLessonProgress,
  saveQuizAttempt,
  type CatalogSource,
  type LeaderboardRow,
} from "@/lib/services/ampuService";
import NewUnitDialog from "./NewUnitDialog";
import { SEED_CATALOG } from "./seedCatalog";
import { formatRuntime } from "./videoSource";
import {
  DEPARTMENT_LABEL,
  DEPARTMENT_SHORT,
  VIDEO_COMPLETE_THRESHOLD,
  type Course,
  type Department,
  type Lesson,
  type LessonStatus,
  type ProgressState,
  type Quiz,
  type QuizAttemptRecord,
} from "./types";

/** How often a playing video's position is written back, at most. */
const PROGRESS_WRITE_INTERVAL_MS = 15_000;

/* ------------------------------------------------------------------ */
/* Academic helpers                                                    */
/* ------------------------------------------------------------------ */

const GRADE_POINTS: Record<string, number> = {
  A: 4,
  "A−": 3.7,
  "B+": 3.3,
  B: 3,
  "B−": 2.7,
  "C+": 2.3,
  C: 2,
  "C−": 1.7,
  D: 1,
  F: 0,
};

function letterFor(score: number): string {
  if (score >= 93) return "A";
  if (score >= 90) return "A−";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B−";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C−";
  if (score >= 60) return "D";
  return "F";
}

interface CourseGrade {
  /** Letter for an examined unit, "P" for a pass/fail unit, "IP" in progress. */
  mark: string;
  /** Exam average, when the unit is examined and every exam has been sat. */
  score?: number;
  graded: boolean;
}

/**
 * A unit's mark. Examined units average their exam best-scores into a letter;
 * lecture-only units are pass/fail, which is how they're reported on the
 * transcript.
 */
function courseGrade(progress: ProgressState, course: Course): CourseGrade {
  const exams = course.lessons.filter((l) => l.type === "QUIZ" && l.quiz);
  const sat = exams.filter((l) => progress.quizzes[l.quiz!.id]);
  const pct = courseCompletion(progress, course);

  if (exams.length > 0 && sat.length === exams.length) {
    const avg =
      sat.reduce((sum, l) => sum + progress.quizzes[l.quiz!.id].bestScore, 0) /
      sat.length;
    return { mark: letterFor(avg), score: Math.round(avg), graded: true };
  }
  if (pct >= 100) return { mark: "P", graded: false };
  if (pct > 0) return { mark: "IP", graded: false };
  return { mark: "—", graded: false };
}

/* ------------------------------------------------------------------ */
/* Progress derivation                                                 */
/* ------------------------------------------------------------------ */

function lessonStatus(progress: ProgressState, lesson: Lesson): LessonStatus {
  if (lesson.type === "QUIZ") {
    const a = lesson.quiz ? progress.quizzes[lesson.quiz.id] : undefined;
    if (a?.passed) return "completed";
    if (a) return "in_progress";
    return "not_started";
  }
  return progress.lessons[lesson.id]?.status ?? "not_started";
}

function courseCompletion(progress: ProgressState, course: Course): number {
  const total = course.lessons.length;
  const done = course.lessons.filter(
    (l) => lessonStatus(progress, l) === "completed",
  ).length;
  return total === 0 ? 0 : (done / total) * 100;
}

/** A lesson is unlocked if the course allows free nav OR every prior one is done. */
function lessonUnlocked(
  progress: ProgressState,
  course: Course,
  index: number,
): boolean {
  if (!course.sequentialUnlock) return true;
  for (let i = 0; i < index; i++) {
    if (lessonStatus(progress, course.lessons[i]) !== "completed") return false;
  }
  return true;
}

function nextIncompleteIndex(progress: ProgressState, course: Course): number {
  const i = course.lessons.findIndex(
    (l) => lessonStatus(progress, l) !== "completed",
  );
  return i === -1 ? course.lessons.length - 1 : i;
}

/** Lectures and readings are numbered; exams are named for what they are. */
function lessonLabel(course: Course, index: number): string {
  const lesson = course.lessons[index];
  if (lesson.type === "QUIZ") {
    return course.isRequired ? "Certification Exam" : "Final Examination";
  }
  if (lesson.type === "DOCUMENT") {
    const readingNumber = course.lessons
      .slice(0, index + 1)
      .filter((l) => l.type === "DOCUMENT").length;
    return `Reading ${readingNumber}`;
  }
  const lectureNumber =
    course.lessons.slice(0, index + 1).filter((l) => l.type === "VIDEO").length;
  return `Lecture ${lectureNumber}`;
}

/* ------------------------------------------------------------------ */
/* Collegiate chrome                                                   */
/* ------------------------------------------------------------------ */

/**
 * The ampU emblem (public/img/ampU.svg) — a varsity U with the AMP banner
 * across it.
 *
 * It stands free on a light page, but its brown fills go muddy against a dark
 * one, so in dark mode it sits on a cream tile that keeps the ink readable.
 * The file declares width/height as 100%, so the box is sized explicitly from
 * its viewBox ratio rather than left to `w-auto`.
 */
const EMBLEM_RATIO = 2434.62 / 2013.85;

function Emblem({
  height = 44,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center dark:bg-[#fbf7f0] dark:p-1.5 dark:ring-1 dark:ring-white/10 ${className}`}
    >
      <img
        src="/img/ampU.svg"
        alt="AMPu"
        width={Math.round(height * EMBLEM_RATIO)}
        height={height}
      />
    </span>
  );
}

/** Small-caps section rule, the way a course bulletin sets headings. */
function BulletinHeading({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b-4 border-double border-neutral-300 pb-2 dark:border-neutral-700">
      <h2 className="font-serif text-lg font-semibold tracking-wide text-neutral-900 dark:text-white">
        {children}
      </h2>
      {right}
    </div>
  );
}

function CourseNumber({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span
      className={`font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}
      style={{ color: BRAND_COLOR }}
    >
      {code}
    </span>
  );
}

function DepartmentTag({ department }: { department: Department }) {
  return (
    <Badge
      variant="outline"
      className="border-neutral-300 font-normal uppercase tracking-[0.1em] dark:border-neutral-700"
    >
      {DEPARTMENT_SHORT[department]}
    </Badge>
  );
}

function RequiredSeal() {
  return (
    <Badge style={{ backgroundColor: BRAND_COLOR }} className="text-white uppercase tracking-[0.1em]">
      Required
    </Badge>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-none bg-neutral-200 dark:bg-neutral-800">
      <div
        className="h-full rounded-none transition-all"
        style={{ width: `${Math.round(percent)}%`, backgroundColor: BRAND_COLOR }}
      />
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 56;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-neutral-200 dark:stroke-neutral-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        stroke={BRAND_COLOR}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.4s" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-neutral-700 dark:fill-neutral-200 text-[11px] font-semibold"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

/** One figure from the bulletin's summary strip. */
function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="font-serif text-2xl font-semibold text-neutral-900 dark:text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
    </div>
  );
}

/* ================================================================== */
/* Root page                                                           */
/* ================================================================== */

export default function AmpuPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /* Admins and super users may publish and withdraw units. RLS enforces the
     same rule server-side, so hiding the controls is a courtesy, not the gate. */
  const canManage =
    user?.user_metadata?.role === "Admin" ||
    user?.user_metadata?.role === "Super Admin" ||
    isSuperUser(user?.email);

  const [courses, setCourses] = useState<Course[]>([]);
  const [source, setSource] = useState<CatalogSource>("database");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [progress, setProgress] = useState<ProgressState>({
    lessons: {},
    quizzes: {},
    courseCertifiedAt: {},
  });
  const [newUnitOpen, setNewUnitOpen] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* Set false when the progress table is missing: keeps a playing video from
     firing a doomed write every interval once we know it cannot land. */
  const canPersistRef = useRef(true);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchCatalog(SEED_CATALOG);
      setCourses(result.courses);
      setSource(result.source);
      setNotice(result.reason ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the catalog.");
      setCourses(SEED_CATALOG);
      setSource("seed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  /* Progress is loaded once, on the first catalog that comes back. Re-running it
     whenever `courses` changes (a newly published unit, say) would let a stale
     read overwrite progress the user has made since. */
  const progressLoadedRef = useRef(false);
  useEffect(() => {
    if (progressLoadedRef.current || loading) return;
    progressLoadedRef.current = true;

    if (courses.length === 0) {
      setProgressLoaded(true);
      return;
    }

    /* Deliberately no cancel-on-cleanup flag. The ref guard above already means
       this fetch happens once, and StrictMode runs the cleanup before re-running
       the effect — a cancel flag would kill the only request in flight, and the
       guard would stop a replacement from ever starting. */
    fetchMyProgress(courses)
      .then((saved) => {
        setProgress(saved.progress);
        canPersistRef.current = saved.available;
        if (!saved.available) setSaveError(PROGRESS_UNAVAILABLE);
      })
      .catch((e) => {
        console.warn("[ampu] could not load saved progress", e);
        setSaveError(
          e instanceof Error ? e.message : "Progress could not be loaded.",
        );
      })
      .finally(() => setProgressLoaded(true));
  }, [courses, loading]);

  /* Which unit a lesson belongs to — the progress rows are keyed by both. */
  const courseIdForLesson = useCallback(
    (lessonId: string) =>
      courses.find((c) => c.lessons.some((l) => l.id === lessonId))?.id,
    [courses],
  );
  const lessonIdForQuiz = useCallback(
    (quizId: string) =>
      courses
        .flatMap((c) => c.lessons)
        .find((l) => l.quiz?.id === quizId)?.id,
    [courses],
  );

  /* A playing video reports every second; only persist on completion or every
     PROGRESS_WRITE_INTERVAL_MS, so resuming works without hammering the table. */
  const lastWriteRef = useRef<Record<string, number>>({});

  /* Mirrors `progress` so the write-through handlers below can read the current
     value synchronously. Reading it inside a setProgress updater does not work:
     React invokes the updater during the next render, long after the handler
     has returned. */
  const progressRef = useRef(progress);
  progressRef.current = progress;

  /**
   * Fires a progress write and surfaces the first failure. Writes are
   * fire-and-forget by design — a dropped save must never interrupt a lecture —
   * but a silent one is worse, so the failure becomes a banner.
   */
  const persist = useCallback((write: Promise<void>) => {
    if (!canPersistRef.current) return;
    write.catch((e: unknown) => {
      console.warn("[ampu] progress write failed", e);
      const message =
        e instanceof Error ? e.message : "Progress could not be saved.";
      if (message === PROGRESS_UNAVAILABLE) canPersistRef.current = false;
      setSaveError(message);
    });
  }, []);

  /* --- progress mutations ------------------------------------------ */

  const setVideoProgress = (lessonId: string, seconds: number, duration: number) => {
    const prevLesson = progressRef.current.lessons[lessonId];
    const completedByWatch =
      duration > 0 && seconds / duration >= VIDEO_COMPLETE_THRESHOLD;
    const status: LessonStatus =
      prevLesson?.status === "completed" || completedByWatch
        ? "completed"
        : "in_progress";

    setProgress((prev) => ({
      ...prev,
      lessons: {
        ...prev.lessons,
        [lessonId]: { status, lastWatchedSeconds: seconds },
      },
    }));

    // Persist on completion, otherwise no more than once per interval.
    const justCompleted =
      status === "completed" && prevLesson?.status !== "completed";
    const last = lastWriteRef.current[lessonId] ?? 0;
    if (!justCompleted && Date.now() - last < PROGRESS_WRITE_INTERVAL_MS) return;

    const courseId = courseIdForLesson(lessonId);
    if (!courseId) return;
    lastWriteRef.current[lessonId] = Date.now();
    void persist(
      saveLessonProgress({
        lessonId,
        courseId,
        status,
        lastWatchedSeconds: seconds,
      }),
    );
  };

  const markLessonComplete = (lessonId: string) => {
    const courseId = courseIdForLesson(lessonId);
    if (courseId) {
      lastWriteRef.current[lessonId] = Date.now();
      void persist(
        saveLessonProgress({
          lessonId,
          courseId,
          status: "completed",
          lastWatchedSeconds:
            progressRef.current.lessons[lessonId]?.lastWatchedSeconds ?? 0,
        }),
      );
    }
    setProgress((prev) => ({
      ...prev,
      lessons: {
        ...prev.lessons,
        [lessonId]: {
          status: "completed",
          lastWatchedSeconds: prev.lessons[lessonId]?.lastWatchedSeconds,
        },
      },
    }));
  };

  const recordQuizAttempt = (
    quizId: string,
    courseId: string,
    score: number,
    passed: boolean,
  ) => {
    const prevA = progressRef.current.quizzes[quizId];
    const next: QuizAttemptRecord = {
      attemptCount: (prevA?.attemptCount ?? 0) + 1,
      bestScore: Math.max(prevA?.bestScore ?? 0, score),
      lastScore: score,
      passed: prevA?.passed || passed,
    };

    setProgress((prev) => {
      const quizzes = { ...prev.quizzes, [quizId]: next };

      // If this pass completes the unit, stamp a conferral date.
      const course = courses.find((c) => c.id === courseId);
      const updated: ProgressState = { ...prev, quizzes };
      if (!course) return updated;
      const nowComplete = course.lessons.every((l) =>
        l.type === "QUIZ"
          ? quizzes[l.quiz!.id]?.passed
          : prev.lessons[l.id]?.status === "completed",
      );
      if (nowComplete && !prev.courseCertifiedAt[courseId]) {
        updated.courseCertifiedAt = {
          ...prev.courseCertifiedAt,
          [courseId]: new Date().toISOString(),
        };
      }
      return updated;
    });

    const lessonId = lessonIdForQuiz(quizId);
    if (lessonId) {
      void persist(
        saveQuizAttempt({
          lessonId,
          courseId,
          attemptCount: next.attemptCount,
          bestScore: next.bestScore,
          lastScore: next.lastScore,
          passed: next.passed,
        }),
      );
    }
  };

  /* --- catalog mutations (admin) ------------------------------------ */

  const withdrawCourse = async (course: Course) => {
    await archiveCourse(course.id);
    setCourses((prev) => prev.filter((c) => c.id !== course.id));
    navigate(CATALOG_PATH);
  };

  const seedTheCatalog = async () => {
    await publishSeedCatalog(SEED_CATALOG);
    await loadCatalog();
  };

  /* --- render ------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Masthead pathname={location.pathname} />

      <div className="mx-auto max-w-6xl px-4 py-8">
        {notice && canManage && (
          <p
            className="mb-6 border-l-4 bg-white px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
            style={{ borderColor: BRAND_COLOR }}
          >
            {notice}
          </p>
        )}
        {loadError && (
          <p className="mb-6 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {loadError} Showing the built-in catalog instead.
          </p>
        )}

        {saveError && (
          <p className="mb-6 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {saveError}
          </p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            Opening the bulletin…
          </p>
        ) : (
          <Routes>
            <Route
              index
              element={
                <Catalog
                  courses={courses}
                  progress={progress}
                  canManage={canManage}
                  canPublish={source === "database"}
                  onNewUnit={() => setNewUnitOpen(true)}
                  onSeedCatalog={seedTheCatalog}
                />
              }
            />
            <Route
              path="transcript"
              element={<Transcript courses={courses} progress={progress} />}
            />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route
              path="course/:courseId"
              element={
                <CourseRoute
                  courses={courses}
                  progress={progress}
                  canManage={canManage && source === "database"}
                  onWithdraw={withdrawCourse}
                />
              }
            />
            <Route
              path="course/:courseId/lesson/:lessonId"
              element={
                <LessonRoute
                  courses={courses}
                  progress={progress}
                  progressLoaded={progressLoaded}
                  onVideoProgress={setVideoProgress}
                  onMarkComplete={markLessonComplete}
                  onQuizSubmit={recordQuizAttempt}
                />
              }
            />
            <Route path="*" element={<Navigate to={CATALOG_PATH} replace />} />
          </Routes>
        )}
      </div>

      {canManage && (
        <NewUnitDialog
          isOpen={newUnitOpen}
          onClose={() => setNewUnitOpen(false)}
          existingCodes={courses.map((c) => c.code)}
          onPublished={(course) =>
            setCourses((prev) =>
              [...prev, course].sort((a, b) => a.code.localeCompare(b.code)),
            )
          }
        />
      )}
    </div>
  );
}

/* ------------------------- Route wrappers ------------------------- */

const CATALOG_PATH = "/ampu";
const TRANSCRIPT_PATH = "/ampu/transcript";
const LEADERBOARD_PATH = "/ampu/leaderboard";
const coursePath = (courseId: string) => `/ampu/course/${courseId}`;
const lessonPath = (courseId: string, lessonId: string) =>
  `/ampu/course/${courseId}/lesson/${lessonId}`;

function CourseRoute({
  courses,
  progress,
  canManage,
  onWithdraw,
}: {
  courses: Course[];
  progress: ProgressState;
  canManage: boolean;
  onWithdraw: (course: Course) => Promise<void>;
}) {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const course = courses.find((c) => c.id === courseId);

  if (!course) return <MissingCourse onBack={() => navigate(CATALOG_PATH)} />;

  return (
    <CourseDetail
      course={course}
      progress={progress}
      canManage={canManage}
      onWithdraw={onWithdraw}
      onBack={() => navigate(CATALOG_PATH)}
      onOpenLesson={(lessonId) => navigate(lessonPath(course.id, lessonId))}
    />
  );
}

function LessonRoute({
  courses,
  progress,
  progressLoaded,
  onVideoProgress,
  onMarkComplete,
  onQuizSubmit,
}: {
  courses: Course[];
  progress: ProgressState;
  progressLoaded: boolean;
  onVideoProgress: (lessonId: string, seconds: number, duration: number) => void;
  onMarkComplete: (lessonId: string) => void;
  onQuizSubmit: (quizId: string, courseId: string, score: number, passed: boolean) => void;
}) {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const navigate = useNavigate();
  const course = courses.find((c) => c.id === courseId);

  if (!course || !lessonId) {
    return <MissingCourse onBack={() => navigate(CATALOG_PATH)} />;
  }

  /* The player reads its resume position once, when it mounts, so wait for
     saved progress before building it. */
  if (!progressLoaded) {
    return (
      <p className="py-16 text-center text-sm text-neutral-500">
        Finding your place…
      </p>
    );
  }

  return (
    <LessonView
      course={course}
      lessonId={lessonId}
      progress={progress}
      onBackToCourse={() => navigate(coursePath(course.id))}
      onOpenLesson={(next) => navigate(lessonPath(course.id, next))}
      onVideoProgress={onVideoProgress}
      onMarkComplete={onMarkComplete}
      onQuizSubmit={onQuizSubmit}
    />
  );
}

function MissingCourse({ onBack }: { onBack: () => void }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="pt-6 text-center">
        <p className="mb-1 font-serif text-lg font-semibold text-neutral-900 dark:text-white">
          Unit not in the catalog
        </p>
        <p className="mb-4 text-sm text-neutral-500">
          It may have been withdrawn from the catalog.
        </p>
        <Button onClick={onBack}>Back to the catalog</Button>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Masthead                                                            */
/* ================================================================== */

function Masthead({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const inTranscript = pathname.startsWith(TRANSCRIPT_PATH);
  const inLeaderboard = pathname.startsWith(LEADERBOARD_PATH);
  const inCatalog = !inTranscript && !inLeaderboard;
  return (
    <div className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <button
          onClick={() => navigate(CATALOG_PATH)}
          className="group flex items-center gap-4 text-left"
        >
          <Emblem height={46} className="transition-transform group-hover:scale-105" />
          <span className="hidden h-10 w-px bg-neutral-200 dark:bg-neutral-700 sm:block" />
          <span className="hidden font-serif text-sm uppercase leading-tight tracking-[0.22em] text-neutral-600 dark:text-neutral-300 sm:block">
            Six volts to
            <br />
            Lightning
          </span>
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant={inCatalog ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(CATALOG_PATH)}
          >
            Course Catalog
          </Button>
          <Button
            variant={inTranscript ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(TRANSCRIPT_PATH)}
          >
            My Transcript
          </Button>
          <Button
            variant={inLeaderboard ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(LEADERBOARD_PATH)}
          >
            Leaderboard
          </Button>

          {/* AMPu renders outside the app <Layout>, so this link is the only
              way back to the rest of ampOS. */}
          <span className="mx-1 hidden h-6 w-px bg-neutral-200 dark:bg-neutral-700 sm:block" />
          <Link
            to="/portal"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to {companyConfig.name}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Course catalog (the bulletin)                                       */
/* ================================================================== */

function Catalog({
  courses,
  progress,
  canManage,
  canPublish,
  onNewUnit,
  onSeedCatalog,
}: {
  courses: Course[];
  progress: ProgressState;
  canManage: boolean;
  canPublish: boolean;
  onNewUnit: () => void;
  onSeedCatalog: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<Department | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "not_started" | "in_progress" | "completed"
  >("ALL");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (department !== "ALL" && c.department !== department) return false;
      if (
        needle &&
        !`${c.code} ${c.title} ${c.description}`.toLowerCase().includes(needle)
      )
        return false;
      const pct = courseCompletion(progress, c);
      const status =
        pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started";
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      return true;
    });
  }, [courses, search, department, statusFilter, progress]);

  const departments: (Department | "ALL")[] = [
    "ALL",
    "NFPA_70E",
    "NFPA_70B",
    "ONBOARDING",
    "OTHER",
  ];

  const requiredOutstanding = courses.filter(
    (c) => c.isRequired && courseCompletion(progress, c) < 100,
  ).length;

  return (
    <div>
      {/* Bulletin masthead */}
      <div className="mb-6 border-y-4 border-double border-neutral-300 py-5 text-center dark:border-neutral-700">
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-wide text-neutral-900 dark:text-white">
          Course Catalog
        </h1>
      </div>

      {/* Summary strip */}
      <div className="mb-6 flex flex-wrap items-center justify-center divide-x divide-neutral-200 border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        <Stat value={courses.length} label="Units offered" />
        <Stat value={requiredOutstanding} label="Required outstanding" />
        <Stat
          value={
            courses.filter((c) => courseCompletion(progress, c) >= 100).length
          }
          label="Units completed" />
      </div>

      <BulletinHeading
        right={
          canManage && (
            <Button size="sm" onClick={onNewUnit} disabled={!canPublish}
              title={canPublish ? undefined : "Run the AMPu migration to publish units"}>
              + New Unit
            </Button>
          )
        }
      >
        Listings
      </BulletinHeading>

      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by number or title…"
          className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setDepartment(d)}
              className={`rounded-none px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] transition-colors ${
                department === d
                  ? "text-white"
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
              style={department === d ? { backgroundColor: BRAND_COLOR } : undefined}
            >
              {d === "ALL" ? "All" : DEPARTMENT_SHORT[d]}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        >
          <option value="ALL">Any progress</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {courses.length === 0 ? (
        <EmptyCatalog
          canManage={canManage}
          canPublish={canPublish}
          onNewUnit={onNewUnit}
          onSeedCatalog={onSeedCatalog}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => {
            const pct = courseCompletion(progress, course);
            return (
              <Card
                key={course.id}
                className="flex cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md"
                onClick={() => navigate(coursePath(course.id))}
              >
                <div
                  className="flex h-28 items-center justify-center border-b-4 border-double text-5xl"
                  style={{
                    backgroundColor: `${BRAND_COLOR}1a`,
                    borderColor: `${BRAND_COLOR}59`,
                  }}
                >
                  {course.thumbnail}
                </div>
                <CardContent className="flex flex-1 flex-col gap-2 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <CourseNumber code={course.code} />
                    {course.isRequired && <RequiredSeal />}
                  </div>
                  <h3 className="font-serif text-base font-semibold leading-snug text-neutral-900 dark:text-white">
                    {course.title}
                  </h3>
                  <p className="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {course.description}
                  </p>
                  <div className="mt-auto pt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                      <span>
                        {course.estimatedDurationMinutes} min
                      </span>
                      <span>{Math.round(pct)}%</span>
                    </div>
                    <ProgressBar percent={pct} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-neutral-500">
              No units match your filters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyCatalog({
  canManage,
  canPublish,
  onNewUnit,
  onSeedCatalog,
}: {
  canManage: boolean;
  canPublish: boolean;
  onNewUnit: () => void;
  onSeedCatalog: () => Promise<void>;
}) {
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seed = async () => {
    setError(null);
    setSeeding(true);
    try {
      await onSeedCatalog();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not publish the starter catalog.",
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="mb-6 flex justify-center">
          <Emblem height={52} className="opacity-50" />
        </div>
        <p className="font-serif text-lg font-semibold text-neutral-900 dark:text-white">
          Nothing published yet
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
          {canManage
            ? "Publish the first unit, or start from the built-in catalog and edit from there."
            : "No training units have been published yet."}
        </p>
        {canManage && canPublish && (
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={seed} isLoading={seeding}>
              Publish starter catalog
            </Button>
            <Button onClick={onNewUnit}>+ New Unit</Button>
          </div>
        )}
        {error && (
          <p className="mx-auto mt-4 max-w-sm text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Course detail (the syllabus)                                        */
/* ================================================================== */

function CourseDetail({
  course,
  progress,
  canManage,
  onWithdraw,
  onBack,
  onOpenLesson,
}: {
  course: Course;
  progress: ProgressState;
  canManage: boolean;
  onWithdraw: (course: Course) => Promise<void>;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const pct = courseCompletion(progress, course);
  const isComplete = pct >= 100;
  const certifiedAt = progress.courseCertifiedAt[course.id];
  const continueIndex = nextIncompleteIndex(progress, course);
  const lectures = course.lessons.filter((l) => l.type === "VIDEO").length;
  const readings = course.lessons.filter((l) => l.type === "DOCUMENT").length;
  const exams = course.lessons.filter((l) => l.type === "QUIZ").length;

  const withdraw = async () => {
    if (
      !window.confirm(
        `Withdraw ${course.code} — ${course.title} from the catalog? Employees will no longer see it.`,
      )
    )
      return;
    setWithdrawError(null);
    setWithdrawing(true);
    try {
      await onWithdraw(course);
    } catch (e) {
      setWithdrawError(
        e instanceof Error ? e.message : "Could not withdraw the unit.",
      );
      setWithdrawing(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Course catalog
        </Button>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={withdraw}
            isLoading={withdrawing}
            className="text-red-600 hover:text-red-700"
          >
            Withdraw unit
          </Button>
        )}
      </div>
      {withdrawError && (
        <p className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {withdrawError}
        </p>
      )}

      <div className="mb-6 border-y-4 border-double border-neutral-300 py-5 dark:border-neutral-700">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CourseNumber code={course.code} />
              <DepartmentTag department={course.department} />
              {course.isRequired && <RequiredSeal />}
            </div>
            <h1 className="mb-2 font-serif text-3xl font-bold tracking-wide text-neutral-900 dark:text-white">
              {course.title}
            </h1>
            <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              {course.description}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs">
              <CourseFact term="Offered by" value={course.instructor ?? DEPARTMENT_LABEL[course.department]} />
              <CourseFact
                term="Format"
                value={`${lectures} lecture${lectures === 1 ? "" : "s"}${
                  readings > 0
                    ? ` · ${readings} reading${readings === 1 ? "" : "s"}`
                    : ""
                }${
                  exams > 0 ? ` · ${exams} exam${exams === 1 ? "" : "s"}` : ""
                }`}
              />
              <CourseFact
                term="Pacing"
                value={course.sequentialUnlock ? "In order" : "Any order"}
              />
            </dl>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing percent={pct} />
            <Button
              onClick={() => onOpenLesson(course.lessons[continueIndex].id)}
              disabled={isComplete || course.lessons.length === 0}
            >
              {isComplete ? "Completed" : pct > 0 ? "Resume" : "Start"}
            </Button>
          </div>
        </div>
      </div>

      {isComplete && <Diploma course={course} certifiedAt={certifiedAt} />}

      <BulletinHeading>Syllabus</BulletinHeading>
      <Card>
        <CardContent className="pt-6">
          {course.lessons.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              No lectures have been posted for this unit yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {course.lessons.map((lesson, i) => {
                const status = lessonStatus(progress, lesson);
                const unlocked = lessonUnlocked(progress, course, i);
                return (
                  <li key={lesson.id}>
                    <button
                      disabled={!unlocked}
                      onClick={() => onOpenLesson(lesson.id)}
                      className="flex w-full items-center gap-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-neutral-100 text-sm dark:bg-neutral-800">
                        {status === "completed"
                          ? "✅"
                          : !unlocked
                            ? "🔒"
                            : lesson.type === "QUIZ"
                              ? "📝"
                              : lesson.type === "DOCUMENT"
                                ? "📄"
                                : "▶️"}
                      </span>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                          {lessonLabel(course, i)}
                        </p>
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">
                          {lesson.title}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {lesson.type === "QUIZ"
                            ? `${lesson.quiz?.questions.length} questions · pass at ${lesson.quiz?.passingScorePercent}%`
                            : lesson.type === "DOCUMENT"
                              ? `Document${lesson.documentName ? ` · ${lesson.documentName}` : ""}`
                              : `Video · ${formatRuntime(lesson.durationSeconds)}`}
                        </p>
                      </div>
                      <span className="text-xs font-medium capitalize text-neutral-400">
                        {!unlocked ? "Locked" : status.replace("_", " ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CourseFact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">
        {term}
      </dt>
      <dd className="text-neutral-700 dark:text-neutral-300">{value}</dd>
    </div>
  );
}

/** The conferral card shown once every requirement of a unit is met. */
function Diploma({
  course,
  certifiedAt,
}: {
  course: Course;
  certifiedAt?: string;
}) {
  const date = certifiedAt ? new Date(certifiedAt) : new Date();
  return (
    <Card className="mb-6 border-2" style={{ borderColor: BRAND_COLOR }}>
      <CardContent className="flex flex-col items-center gap-5 py-8 text-center sm:flex-row sm:text-left">
        <Emblem height={64} />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
            Six Volts to Lightning
          </p>
          <p className="mt-1 font-serif text-xl font-bold text-neutral-900 dark:text-white">
            {course.code} conferred with all rights and privileges
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Completed {date.toLocaleDateString()}
            {course.isRequired ? " · renews in 12 months" : ""}
          </p>
        </div>
        {/* PDF generation is out of scope for this pass — stubbed. */}
        <Button variant="outline" size="sm" disabled title="PDF generation coming soon">
          Print certificate
        </Button>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Lesson view (lecture OR examination) + syllabus rail                */
/* ================================================================== */

function LessonView({
  course,
  lessonId,
  progress,
  onBackToCourse,
  onOpenLesson,
  onVideoProgress,
  onMarkComplete,
  onQuizSubmit,
}: {
  course: Course;
  lessonId: string;
  progress: ProgressState;
  onBackToCourse: () => void;
  onOpenLesson: (lessonId: string) => void;
  onVideoProgress: (lessonId: string, seconds: number, duration: number) => void;
  onMarkComplete: (lessonId: string) => void;
  onQuizSubmit: (quizId: string, courseId: string, score: number, passed: boolean) => void;
}) {
  const index = course.lessons.findIndex((l) => l.id === lessonId);
  const lesson = course.lessons[index];

  if (!lesson) return <MissingCourse onBack={onBackToCourse} />;

  // Guard against direct navigation into a locked lesson (URL-bypass protection).
  if (!lessonUnlocked(progress, course, index)) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="mb-3 text-4xl">🔒</div>
          <p className="mb-1 font-serif text-lg font-semibold text-neutral-900 dark:text-white">
            Prerequisite not met
          </p>
          <p className="mb-4 text-sm text-neutral-500">
            Complete the earlier lectures in {course.code} before opening this one.
          </p>
          <Button onClick={onBackToCourse}>Back to the syllabus</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <Button variant="ghost" size="sm" onClick={onBackToCourse} className="mb-3">
          ← {course.code} · {course.title}
        </Button>
        {lesson.type === "VIDEO" ? (
          <VideoLesson
            key={lesson.id}
            lesson={lesson}
            eyebrow={lessonLabel(course, index)}
            startAt={progress.lessons[lesson.id]?.lastWatchedSeconds ?? 0}
            completed={lessonStatus(progress, lesson) === "completed"}
            onProgress={(s, d) => onVideoProgress(lesson.id, s, d)}
            onMarkComplete={() => onMarkComplete(lesson.id)}
            onNext={
              index < course.lessons.length - 1
                ? () => onOpenLesson(course.lessons[index + 1].id)
                : onBackToCourse
            }
          />
        ) : lesson.type === "DOCUMENT" ? (
          <DocumentLesson
            key={lesson.id}
            lesson={lesson}
            eyebrow={lessonLabel(course, index)}
            completed={lessonStatus(progress, lesson) === "completed"}
            onMarkComplete={() => onMarkComplete(lesson.id)}
            onNext={
              index < course.lessons.length - 1
                ? () => onOpenLesson(course.lessons[index + 1].id)
                : onBackToCourse
            }
          />
        ) : (
          <QuizLesson
            key={lesson.id}
            quiz={lesson.quiz!}
            eyebrow={lessonLabel(course, index)}
            existing={progress.quizzes[lesson.quiz!.id]}
            onSubmit={(score, passed) =>
              onQuizSubmit(lesson.quiz!.id, course.id, score, passed)
            }
            onNext={
              index < course.lessons.length - 1
                ? () => onOpenLesson(course.lessons[index + 1].id)
                : onBackToCourse
            }
          />
        )}
      </div>

      {/* Syllabus rail */}
      <aside>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-sm uppercase tracking-[0.14em]">
              Syllabus
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-1">
              {course.lessons.map((l, i) => {
                const status = lessonStatus(progress, l);
                const unlocked = lessonUnlocked(progress, course, i);
                const isCurrent = l.id === lessonId;
                return (
                  <li key={l.id}>
                    <button
                      disabled={!unlocked}
                      onClick={() => onOpenLesson(l.id)}
                      className={`flex w-full items-start gap-2 rounded-none px-2 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                        isCurrent
                          ? "bg-neutral-100 font-medium dark:bg-neutral-800"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      }`}
                    >
                      <span>
                        {status === "completed"
                          ? "✅"
                          : !unlocked
                            ? "🔒"
                            : l.type === "QUIZ"
                              ? "📝"
                              : l.type === "DOCUMENT"
                                ? "📄"
                                : "▶️"}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[10px] uppercase tracking-[0.12em] text-neutral-400">
                          {lessonLabel(course, i)}
                        </span>
                        <span className="block text-neutral-700 dark:text-neutral-200">
                          {l.title}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

/* ----------------------- Assigned document ------------------------ */

/**
 * A reading assignment: a PDF or Word document the registrar attached to the
 * unit. PDFs preview inline; Word files (which browsers can't render) show a
 * download card. Either way the learner opens it and marks it read — there's no
 * scroll tracking, so completion is on the honor system, the same as a lecture's
 * "I've finished this".
 */
function DocumentLesson({
  lesson,
  eyebrow,
  completed,
  onMarkComplete,
  onNext,
}: {
  lesson: Lesson;
  eyebrow: string;
  completed: boolean;
  onMarkComplete: () => void;
  onNext: () => void;
}) {
  const url = lesson.documentUrl ?? "";
  const name = lesson.documentName ?? "document";
  const isPdf = /\.pdf($|\?)/i.test(url) || /\.pdf$/i.test(name);
  const [opened, setOpened] = useState(completed);

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
          {eyebrow}
        </p>
        <h2 className="mb-3 font-serif text-2xl font-bold text-neutral-900 dark:text-white">
          {lesson.title}
        </h2>

        {isPdf ? (
          <iframe
            title={lesson.title}
            src={url}
            className="h-[70vh] w-full rounded-none border border-neutral-200 bg-white dark:border-neutral-800"
            onLoad={() => setOpened(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 border border-neutral-200 bg-neutral-50 px-6 py-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-4xl">📄</div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {name}
            </p>
            <p className="text-xs text-neutral-500">
              This document opens in a new tab.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            className="text-xs font-medium text-brand hover:underline"
          >
            Open {name} in a new tab ↗
          </a>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onMarkComplete}
              disabled={(!opened && !completed) || completed}
              title={
                opened || completed
                  ? "Mark this reading complete"
                  : "Open the document first"
              }
            >
              {completed ? "Completed ✓" : "I've read this"}
            </Button>
            <Button onClick={onNext} disabled={!opened && !completed}>
              Next →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------- YouTube player --------------------------- */

/**
 * Embeds a YouTube video via the IFrame Player API so we can still track
 * real watch progress (needed for the 90% completion threshold on
 * compliance-sensitive courses). The API script is loaded once and shared.
 */
function YouTubePlayer({
  videoId,
  startAt,
  onProgress,
}: {
  videoId: string;
  startAt: number;
  onProgress: (seconds: number, duration: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  // Keep the latest callback without re-creating the player.
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        const p = playerRef.current;
        if (!p?.getDuration) return;
        const dur = p.getDuration();
        const cur = p.getCurrentTime();
        if (dur > 0) progressRef.current(cur, dur);
      }, 1000);
    };
    const stopPolling = () => {
      if (poll) {
        clearInterval(poll);
        poll = undefined;
      }
    };

    const createPlayer = () => {
      if (cancelled || !hostRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
        events: {
          onReady: (e: any) => {
            if (startAt > 0) e.target.seekTo(startAt, true);
          },
          onStateChange: (e: any) => {
            // YT.PlayerState.PLAYING === 1
            if (e.data === 1) startPolling();
            else stopPolling();
            // Report final position on pause/end so progress persists.
            const p = playerRef.current;
            if (p?.getDuration && p.getDuration() > 0) {
              progressRef.current(p.getCurrentTime(), p.getDuration());
            }
          },
        },
      });
    };

    const w = window as any;
    if (w.YT && w.YT.Player) {
      createPlayer();
    } else {
      if (!document.getElementById("yt-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
      }
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      stopPolling();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* no-op */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="aspect-video w-full">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}

/* --------------------------- Lecture ------------------------------ */

function VideoLesson({
  lesson,
  eyebrow,
  startAt,
  completed,
  onProgress,
  onMarkComplete,
  onNext,
}: {
  lesson: Lesson;
  eyebrow: string;
  startAt: number;
  completed: boolean;
  onProgress: (seconds: number, duration: number) => void;
  onMarkComplete: () => void;
  onNext: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  /* Seed the bar from where they left off, so a resumed lecture doesn't read 0%
     until the first playback tick. Falls back to 0 when the unit has no runtime
     on file — the first tick corrects it either way. */
  const [watchPct, setWatchPct] = useState(() =>
    startAt > 0 && lesson.durationSeconds
      ? Math.min(100, (startAt / lesson.durationSeconds) * 100)
      : 0,
  );
  const seeded = useRef(false);

  const thresholdHit = watchPct >= VIDEO_COMPLETE_THRESHOLD * 100 || completed;

  // Shared progress handler for both the HTML5 player and the YouTube player.
  const handleProgress = (seconds: number, duration: number) => {
    if (duration > 0) {
      setWatchPct((seconds / duration) * 100);
      onProgress(seconds, duration);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
          {eyebrow}
        </p>
        <h2 className="mb-3 font-serif text-2xl font-bold text-neutral-900 dark:text-white">
          {lesson.title}
        </h2>
        <div className="overflow-hidden rounded-none bg-black">
          {lesson.youtubeId ? (
            <YouTubePlayer
              videoId={lesson.youtubeId}
              startAt={startAt}
              onProgress={handleProgress}
            />
          ) : (
            <video
              ref={ref}
              src={lesson.videoUrl}
              controls
              className="aspect-video w-full"
              onLoadedMetadata={(e) => {
                // Resume near where they left off.
                if (!seeded.current && startAt > 0) {
                  e.currentTarget.currentTime = startAt;
                  seeded.current = true;
                }
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                handleProgress(v.currentTime, v.duration);
              }}
            />
          )}
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>Attendance</span>
            <span>{Math.round(watchPct)}%</span>
          </div>
          <ProgressBar percent={watchPct} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            {thresholdHit
              ? "✅ Attendance requirement met"
              : `Watch ${Math.round(VIDEO_COMPLETE_THRESHOLD * 100)}% to complete this lecture`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onMarkComplete}
              disabled={!thresholdHit || completed}
              title={
                thresholdHit
                  ? "Mark this lecture complete"
                  : "Available once you've watched enough"
              }
            >
              {completed ? "Completed ✓" : "I've finished this"}
            </Button>
            <Button onClick={onNext} disabled={!thresholdHit && !completed}>
              Next →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------- Examination ---------------------------- */

function QuizLesson({
  quiz,
  eyebrow,
  existing,
  onSubmit,
  onNext,
}: {
  quiz: Quiz;
  eyebrow: string;
  existing?: QuizAttemptRecord;
  onSubmit: (score: number, passed: boolean) => void;
  onNext: () => void;
}) {
  // If the exam was already passed, don't allow re-submission to game retake counts.
  const alreadyPassed = existing?.passed ?? false;

  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    perQuestion: Record<string, boolean>;
  } | null>(null);

  const toggle = (qId: string, choiceId: string, multi: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qId] ?? [];
      if (multi) {
        return {
          ...prev,
          [qId]: cur.includes(choiceId)
            ? cur.filter((c) => c !== choiceId)
            : [...cur, choiceId],
        };
      }
      return { ...prev, [qId]: [choiceId] };
    });
  };

  const allAnswered = quiz.questions.every((q) => (answers[q.id]?.length ?? 0) > 0);

  const grade = () => {
    const perQuestion: Record<string, boolean> = {};
    let correct = 0;
    for (const q of quiz.questions) {
      const given = [...(answers[q.id] ?? [])].sort();
      const want = [...q.correctChoiceIds].sort();
      const ok = given.length === want.length && given.every((v, i) => v === want[i]);
      perQuestion[q.id] = ok;
      if (ok) correct++;
    }
    const score = Math.round((correct / quiz.questions.length) * 100);
    const passed = score >= quiz.passingScorePercent;
    setResult({ score, passed, perQuestion });
    onSubmit(score, passed);
  };

  const retake = () => {
    setAnswers({});
    setResult(null);
  };

  /* --- already-passed gate (prevents stale re-entry / re-submit) --- */
  if (alreadyPassed && !result) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="mb-3 text-4xl">🏅</div>
          <h2 className="mb-1 font-serif text-2xl font-bold text-neutral-900 dark:text-white">
            {quiz.title}
          </h2>
          <p className="mb-1 text-sm text-neutral-600 dark:text-neutral-400">
            You've already sat and passed this examination.
          </p>
          <p className="mb-4 text-xs text-neutral-500">
            Best mark {letterFor(existing?.bestScore ?? 0)} ({existing?.bestScore}%) ·{" "}
            {existing?.attemptCount} sitting
            {existing && existing.attemptCount > 1 ? "s" : ""}
          </p>
          <Button onClick={onNext}>Continue →</Button>
        </CardContent>
      </Card>
    );
  }

  /* --- result screen ----------------------------------------------- */
  if (result) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 text-center">
            <div className="mb-2 text-5xl">{result.passed ? "🎉" : "📋"}</div>
            <h2 className="font-serif text-2xl font-bold text-neutral-900 dark:text-white">
              {result.passed ? "Passed" : "Not passed"}
            </h2>
            <p
              className="mt-1 font-serif text-4xl font-bold"
              style={{ color: result.passed ? BRAND_COLOR : "#dc2626" }}
            >
              {letterFor(result.score)}
            </p>
            <p className="text-sm text-neutral-500">{result.score}%</p>
            <p className="mt-1 text-xs text-neutral-500">
              Passing mark: {quiz.passingScorePercent}% ·{" "}
              {existing?.attemptCount ?? 1} sitting
              {(existing?.attemptCount ?? 1) > 1 ? "s" : ""}
            </p>
          </div>

          <div className="space-y-2">
            {quiz.questions.map((q, i) => {
              const ok = result.perQuestion[q.id];
              // On a fail, only reveal correct answers if the exam allows it.
              const reveal = result.passed || quiz.revealAnswersOnFail;
              return (
                <div
                  key={q.id}
                  className="flex items-start gap-2 rounded-none border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <span>{ok ? "✅" : "❌"}</span>
                  <div className="flex-1">
                    <p className="text-neutral-800 dark:text-neutral-200">
                      {i + 1}. {q.text}
                    </p>
                    {reveal && !ok && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Correct:{" "}
                        {q.correctChoiceIds
                          .map((id) => q.choices.find((c) => c.id === id)?.text)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!result.passed && !quiz.revealAnswersOnFail && (
            <p className="mt-3 text-center text-xs text-neutral-400">
              Answers are withheld on certification examinations. Review the
              material and sit the exam again.
            </p>
          )}

          <div className="mt-6 flex justify-center gap-2">
            {result.passed ? (
              <Button onClick={onNext}>Continue →</Button>
            ) : (
              <Button onClick={retake}>Sit the exam again</Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  /* --- sitting the exam -------------------------------------------- */
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
          {eyebrow}
        </p>
        <h2 className="mb-1 font-serif text-2xl font-bold text-neutral-900 dark:text-white">
          {quiz.title}
        </h2>
        <p className="mb-6 text-xs text-neutral-500">
          {quiz.questions.length} questions · pass at {quiz.passingScorePercent}%
        </p>

        <div className="space-y-6">
          {quiz.questions.map((q, i) => {
            const multi = q.type === "MULTI_SELECT";
            return (
              <div key={q.id}>
                <p className="mb-2 font-medium text-neutral-900 dark:text-white">
                  {i + 1}. {q.text}
                  {multi && (
                    <span className="ml-2 text-xs font-normal text-neutral-400">
                      (select all that apply)
                    </span>
                  )}
                </p>
                <div className="space-y-2">
                  {q.choices.map((choice) => {
                    const selected = (answers[q.id] ?? []).includes(choice.id);
                    return (
                      <button
                        key={choice.id}
                        onClick={() => toggle(q.id, choice.id, multi)}
                        className={`flex w-full items-center gap-3 rounded-none border px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "bg-brand/10"
                            : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                        }`}
                        style={selected ? { borderColor: BRAND_COLOR } : undefined}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                            multi ? "rounded" : "rounded-none"
                          }`}
                          style={
                            selected
                              ? { backgroundColor: BRAND_COLOR, borderColor: BRAND_COLOR }
                              : { borderColor: "#a3a3a3" }
                          }
                        >
                          {selected && <span className="text-[10px] text-white">✓</span>}
                        </span>
                        <span className="text-neutral-800 dark:text-neutral-200">
                          {choice.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-neutral-400">
            {allAnswered
              ? "All questions answered"
              : "Answer all questions to submit"}
          </p>
          <Button onClick={grade} disabled={!allAnswered}>
            Submit exam
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* My Transcript                                                       */
/* ================================================================== */

function Transcript({
  courses,
  progress,
}: {
  courses: Course[];
  progress: ProgressState;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const studentName =
    user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "Student";

  const rows = courses.map((course) => ({
    course,
    pct: courseCompletion(progress, course),
    grade: courseGrade(progress, course),
    certifiedAt: progress.courseCertifiedAt[course.id],
  }));

  const unitsCompleted = rows.filter((r) => r.pct >= 100).length;

  const gradedRows = rows.filter((r) => r.grade.graded && r.pct >= 100);
  const gpa =
    gradedRows.length > 0
      ? gradedRows.reduce((sum, r) => sum + (GRADE_POINTS[r.grade.mark] ?? 0), 0) /
        gradedRows.length
      : null;

  const requiredOutstanding = rows.filter(
    (r) => r.course.isRequired && r.pct < 100,
  ).length;
  const deansList = gpa !== null && gpa >= 3.7 && requiredOutstanding === 0;

  return (
    <div>
      <div className="mb-6 border-y-4 border-double border-neutral-300 py-5 text-center dark:border-neutral-700">
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-wide text-neutral-900 dark:text-white">
          Academic Transcript
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{studentName}</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-center divide-x divide-neutral-200 border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        <Stat value={`${unitsCompleted}/${rows.length}`} label="Units completed" />
        <Stat value={gpa === null ? "—" : gpa.toFixed(2)} label="Grade point average" />
        <Stat value={requiredOutstanding} label="Required outstanding" />
      </div>

      {deansList && (
        <div
          className="mb-6 flex items-center gap-3 border-2 bg-white px-4 py-3 dark:bg-neutral-900"
          style={{ borderColor: BRAND_COLOR }}
        >
          <span className="text-2xl">🏛️</span>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-serif font-semibold text-neutral-900 dark:text-white">
              Dean's List.
            </span>{" "}
            Every required unit complete with a {gpa?.toFixed(2)} average.
          </p>
        </div>
      )}

      <BulletinHeading>Course record</BulletinHeading>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-neutral-500">
            Nothing on your record yet — no units have been published.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b-2 border-neutral-300 text-left text-[10px] uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  <th className="px-4 py-3 font-semibold">Number</th>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Progress</th>
                  <th className="px-4 py-3 text-right font-semibold">Mark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {rows.map(({ course, pct, grade, certifiedAt }) => (
                  <tr
                    key={course.id}
                    onClick={() => navigate(coursePath(course.id))}
                    className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <CourseNumber code={course.code} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {course.title}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {DEPARTMENT_LABEL[course.department]}
                        {course.isRequired ? " · required" : ""}
                      </p>
                      {certifiedAt && (
                        <p className="mt-0.5 text-xs" style={{ color: BRAND_COLOR }}>
                          Conferred {new Date(certifiedAt).toLocaleDateString()} · renews in 12 months
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="w-32">
                        <ProgressBar percent={pct} />
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">{Math.round(pct)}%</p>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <span className="font-serif text-lg font-semibold text-neutral-900 dark:text-white">
                        {grade.mark}
                      </span>
                      {grade.score !== undefined && (
                        <p className="text-xs text-neutral-500">{grade.score}%</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

/* ================================================================== */
/* Leaderboard                                                         */
/* ================================================================== */

/** Initials for the rank avatar: "Jack Lyons" -> "JL". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const RANK_MARK = ["🥇", "🥈", "🥉"];

function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load the leaderboard.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const leader = rows[0];

  return (
    <div>
      <div className="mb-6 border-y-4 border-double border-neutral-300 py-5 text-center dark:border-neutral-700">
        <h1 className="font-serif text-3xl font-bold tracking-wide text-neutral-900 dark:text-white">
          Leaderboard
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
          Who has finished the most. Ranked by units completed, then lectures.
        </p>
      </div>

      {error && (
        <p className="mb-6 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-neutral-500">
          Tallying the standings…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mb-6 flex justify-center">
              <Emblem height={52} className="opacity-50" />
            </div>
            <p className="font-serif text-lg font-semibold text-neutral-900 dark:text-white">
              Nobody on the board yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
              Finish a lecture and you'll be the one at the top of it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {leader && (
            <Card className="mb-6 border-2" style={{ borderColor: BRAND_COLOR }}>
              <CardContent className="flex items-center gap-4 py-6">
                <span className="text-4xl">🥇</span>
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                    Leading the college
                  </p>
                  <p className="mt-1 font-serif text-2xl font-bold text-neutral-900 dark:text-white">
                    {leader.name}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {leader.unitsCompleted} unit
                    {leader.unitsCompleted === 1 ? "" : "s"} ·{" "}
                    {leader.lessonsCompleted} lecture
                    {leader.lessonsCompleted === 1 ? "" : "s"} ·{" "}
                    {leader.examsPassed} exam
                    {leader.examsPassed === 1 ? "" : "s"} passed
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <BulletinHeading>Standings</BulletinHeading>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b-2 border-neutral-300 text-left text-[10px] uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 text-right font-semibold">Units</th>
                    <th className="px-4 py-3 text-right font-semibold">Lectures</th>
                    <th className="px-4 py-3 text-right font-semibold">Exams</th>
                    <th className="px-4 py-3 text-right font-semibold">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rows.map((row, i) => {
                    const isYou = row.userId === user?.id;
                    return (
                      <tr
                        key={row.userId}
                        style={
                          isYou ? { backgroundColor: `${BRAND_COLOR}12` } : undefined
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-serif text-lg font-semibold text-neutral-900 dark:text-white">
                            {RANK_MARK[i] ?? i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center text-[11px] font-semibold text-white"
                              style={{ backgroundColor: BRAND_COLOR }}
                            >
                              {initialsOf(row.name)}
                            </span>
                            <span className="font-medium text-neutral-900 dark:text-white">
                              {row.name}
                              {isYou && (
                                <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-neutral-400">
                                  you
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-serif text-lg font-semibold text-neutral-900 dark:text-white">
                          {row.unitsCompleted}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                          {row.lessonsCompleted}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                          {row.examsPassed}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-neutral-500">
                          {row.lastActivity
                            ? new Date(row.lastActivity).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
