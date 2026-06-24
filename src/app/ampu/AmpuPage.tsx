/**
 * AMPu — Employee / Technician Training Module (STANDALONE MOCK)
 *
 * This is a self-contained, front-end-only prototype of the AMPu training
 * module described in AMPu-build-prompt.md. It is intentionally DISCONNECTED
 * from ampOS data/auth/API: all state lives in component state and all content
 * is mock/seed data. It demonstrates the full "happy path" loop:
 *
 *   Catalog -> Course detail -> Video lesson -> Quiz -> Progress / completion
 *
 * When this graduates from prototype, the MOCK_COURSES seed + the in-memory
 * `progress` state should be swapped for the real ampOS data layer (Supabase),
 * and the internal view-state navigation should move to react-router routes
 * (/ampu, /ampu/:courseId, .../lesson/:lessonId, .../quiz/:quizId).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "../../components/ui";

const BRAND = "#f26722";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Category = "NFPA_70E" | "NFPA_70B" | "ONBOARDING" | "OTHER";

type QuestionType = "SINGLE_SELECT" | "MULTI_SELECT" | "TRUE_FALSE";

interface Choice {
  id: string;
  text: string;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  choices: Choice[];
  correctChoiceIds: string[];
}

interface Quiz {
  id: string;
  title: string;
  passingScorePercent: number;
  revealAnswersOnFail: boolean;
  questions: Question[];
}

interface Lesson {
  id: string;
  title: string;
  type: "VIDEO" | "QUIZ";
  durationSeconds?: number;
  videoUrl?: string; // direct file URL (HTML5 <video>)
  youtubeId?: string; // YouTube video id (embedded via IFrame API)
  quiz?: Quiz;
}

interface Course {
  id: string;
  title: string;
  description: string;
  category: Category;
  thumbnail: string; // emoji stand-in for a thumbnail image
  estimatedDurationMinutes: number;
  isRequired: boolean;
  sequentialUnlock: boolean;
  lessons: Lesson[];
}

type LessonStatus = "not_started" | "in_progress" | "completed";

interface LessonProgress {
  status: LessonStatus;
  lastWatchedSeconds?: number;
}

interface QuizAttemptRecord {
  attemptCount: number;
  bestScore: number;
  lastScore: number;
  passed: boolean;
}

/* Single source of truth for per-user progress (mock, in-memory). */
interface ProgressState {
  lessons: Record<string, LessonProgress>;
  quizzes: Record<string, QuizAttemptRecord>;
  courseCertifiedAt: Record<string, string>; // courseId -> ISO date
}

/* ------------------------------------------------------------------ */
/* Mock / seed data                                                    */
/* ------------------------------------------------------------------ */

// A small, freely-hostable sample clip so the player actually plays.
const SAMPLE_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

const MOCK_COURSES: Course[] = [
  {
    id: "70e",
    title: "NFPA 70E — Electrical Safety in the Workplace",
    description:
      "Arc-flash hazard analysis, the hierarchy of risk controls, PPE categories, and establishing an electrically safe work condition. Required annual safety certification.",
    category: "NFPA_70E",
    thumbnail: "⚡",
    estimatedDurationMinutes: 45,
    isRequired: true,
    sequentialUnlock: true,
    lessons: [
      {
        id: "70e-l1",
        title: "NFPA 70E — Electrical Safety Training",
        type: "VIDEO",
        durationSeconds: 1800,
        youtubeId: "PuQ5PO-Li-Y",
      },
      {
        id: "70e-q1",
        title: "70E Certification Exam",
        type: "QUIZ",
        quiz: {
          id: "70e-quiz",
          title: "NFPA 70E Certification Exam",
          passingScorePercent: 80,
          revealAnswersOnFail: false,
          questions: [
            {
              id: "q1",
              type: "SINGLE_SELECT",
              text: "What is the FIRST step before working on electrical equipment?",
              choices: [
                { id: "a", text: "Put on arc-rated PPE" },
                { id: "b", text: "Establish an electrically safe work condition" },
                { id: "c", text: "Notify your supervisor" },
                { id: "d", text: "Test the circuit with bare hands" },
              ],
              correctChoiceIds: ["b"],
            },
            {
              id: "q2",
              type: "MULTI_SELECT",
              text: "Which of the following are part of the hierarchy of risk controls? (Select all that apply)",
              choices: [
                { id: "a", text: "Elimination" },
                { id: "b", text: "Engineering controls" },
                { id: "c", text: "Personal protective equipment" },
                { id: "d", text: "Ignoring the hazard" },
              ],
              correctChoiceIds: ["a", "b", "c"],
            },
            {
              id: "q3",
              type: "TRUE_FALSE",
              text: "An arc-flash boundary is the distance at which an incident energy of 1.2 cal/cm² is reached.",
              choices: [
                { id: "t", text: "True" },
                { id: "f", text: "False" },
              ],
              correctChoiceIds: ["t"],
            },
            {
              id: "q4",
              type: "SINGLE_SELECT",
              text: "Lockout/tagout exists primarily to:",
              choices: [
                { id: "a", text: "Speed up the job" },
                { id: "b", text: "Prevent the unexpected energization of equipment" },
                { id: "c", text: "Satisfy the customer" },
                { id: "d", text: "Replace PPE" },
              ],
              correctChoiceIds: ["b"],
            },
          ],
        },
      },
    ],
  },
  {
    id: "70b",
    title: "NFPA 70B — Electrical Equipment Maintenance",
    description:
      "Building and running an effective electrical preventive maintenance (EPM) program: inspection intervals, infrared thermography, and condition-based maintenance.",
    category: "NFPA_70B",
    thumbnail: "🔧",
    estimatedDurationMinutes: 30,
    isRequired: true,
    sequentialUnlock: true,
    lessons: [
      {
        id: "70b-l1",
        title: "Why Electrical Maintenance Matters",
        type: "VIDEO",
        durationSeconds: 60,
        videoUrl: SAMPLE_VIDEO,
      },
      {
        id: "70b-q1",
        title: "70B Knowledge Check",
        type: "QUIZ",
        quiz: {
          id: "70b-quiz",
          title: "NFPA 70B Knowledge Check",
          passingScorePercent: 70,
          revealAnswersOnFail: true,
          questions: [
            {
              id: "q1",
              type: "TRUE_FALSE",
              text: "Infrared thermography can detect loose or corroded electrical connections.",
              choices: [
                { id: "t", text: "True" },
                { id: "f", text: "False" },
              ],
              correctChoiceIds: ["t"],
            },
            {
              id: "q2",
              type: "SINGLE_SELECT",
              text: "An effective EPM program is primarily:",
              choices: [
                { id: "a", text: "Reactive — fix things when they break" },
                { id: "b", text: "Proactive — scheduled, condition-based maintenance" },
                { id: "c", text: "Optional for most facilities" },
                { id: "d", text: "Only required after a failure" },
              ],
              correctChoiceIds: ["b"],
            },
          ],
        },
      },
    ],
  },
  {
    id: "onboard",
    title: "New Technician Onboarding",
    description:
      "Company policies, timekeeping, safety culture, and field reporting basics for new AMP field technicians.",
    category: "ONBOARDING",
    thumbnail: "🎓",
    estimatedDurationMinutes: 20,
    isRequired: false,
    sequentialUnlock: false,
    lessons: [
      {
        id: "ob-l1",
        title: "Welcome to the Team",
        type: "VIDEO",
        durationSeconds: 60,
        videoUrl: SAMPLE_VIDEO,
      },
      {
        id: "ob-l2",
        title: "Field Reporting Basics",
        type: "VIDEO",
        durationSeconds: 60,
        videoUrl: SAMPLE_VIDEO,
      },
    ],
  },
];

const CATEGORY_LABEL: Record<Category, string> = {
  NFPA_70E: "NFPA 70E",
  NFPA_70B: "NFPA 70B",
  ONBOARDING: "Onboarding",
  OTHER: "Other",
};

const VIDEO_COMPLETE_THRESHOLD = 0.9; // 90% watched marks a video lesson complete

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function CategoryTag({ category }: { category: Category }) {
  return (
    <Badge variant="outline" className="border-neutral-300 dark:border-neutral-700">
      {CATEGORY_LABEL[category]}
    </Badge>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.round(percent)}%`, backgroundColor: BRAND }}
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
        stroke={BRAND}
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

/* ------------------------------------------------------------------ */
/* Progress derivation helpers                                         */
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
    (l) => lessonStatus(progress, l) === "completed"
  ).length;
  return total === 0 ? 0 : (done / total) * 100;
}

/** A lesson is unlocked if the course allows free nav OR every prior lesson is complete. */
function lessonUnlocked(
  progress: ProgressState,
  course: Course,
  index: number
): boolean {
  if (!course.sequentialUnlock) return true;
  for (let i = 0; i < index; i++) {
    if (lessonStatus(progress, course.lessons[i]) !== "completed") return false;
  }
  return true;
}

function nextIncompleteIndex(progress: ProgressState, course: Course): number {
  const i = course.lessons.findIndex(
    (l) => lessonStatus(progress, l) !== "completed"
  );
  return i === -1 ? course.lessons.length - 1 : i;
}

/* ------------------------------------------------------------------ */
/* Navigation view-state (replaces router for this standalone build)   */
/* ------------------------------------------------------------------ */

type View =
  | { name: "catalog" }
  | { name: "myProgress" }
  | { name: "course"; courseId: string }
  | { name: "lesson"; courseId: string; lessonId: string };

/* ================================================================== */
/* Root page                                                           */
/* ================================================================== */

export default function AmpuPage() {
  const [progress, setProgress] = useState<ProgressState>({
    lessons: {},
    quizzes: {},
    courseCertifiedAt: {},
  });
  const [view, setView] = useState<View>({ name: "catalog" });

  const findCourse = (id: string) => MOCK_COURSES.find((c) => c.id === id)!;

  /* --- progress mutations ------------------------------------------ */

  const setVideoProgress = (lessonId: string, seconds: number, duration: number) => {
    setProgress((prev) => {
      const completedByWatch = duration > 0 && seconds / duration >= VIDEO_COMPLETE_THRESHOLD;
      const prevLesson = prev.lessons[lessonId];
      const status: LessonStatus =
        prevLesson?.status === "completed" || completedByWatch
          ? "completed"
          : "in_progress";
      return {
        ...prev,
        lessons: {
          ...prev.lessons,
          [lessonId]: { status, lastWatchedSeconds: seconds },
        },
      };
    });
  };

  const markLessonComplete = (lessonId: string) => {
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

  const recordQuizAttempt = (quizId: string, courseId: string, score: number, passed: boolean) => {
    setProgress((prev) => {
      const prevA = prev.quizzes[quizId];
      const next: QuizAttemptRecord = {
        attemptCount: (prevA?.attemptCount ?? 0) + 1,
        bestScore: Math.max(prevA?.bestScore ?? 0, score),
        lastScore: score,
        passed: prevA?.passed || passed,
      };
      const quizzes = { ...prev.quizzes, [quizId]: next };

      // If this pass completes the course, stamp a certification date.
      const course = MOCK_COURSES.find((c) => c.id === courseId)!;
      const updated: ProgressState = { ...prev, quizzes };
      const nowComplete = course.lessons.every((l) =>
        l.type === "QUIZ"
          ? quizzes[l.quiz!.id]?.passed
          : prev.lessons[l.id]?.status === "completed"
      );
      if (nowComplete && !prev.courseCertifiedAt[courseId]) {
        updated.courseCertifiedAt = {
          ...prev.courseCertifiedAt,
          [courseId]: new Date().toISOString(),
        };
      }
      return updated;
    });
  };

  /* --- render ------------------------------------------------------- */

  return (
    <div className="min-h-full bg-neutral-50 dark:bg-neutral-950">
      <AmpuHeader
        onHome={() => setView({ name: "catalog" })}
        onProgress={() => setView({ name: "myProgress" })}
        active={view.name}
      />

      <div className="mx-auto max-w-6xl px-4 py-8">
        {view.name === "catalog" && (
          <Catalog
            progress={progress}
            onOpen={(courseId) => setView({ name: "course", courseId })}
          />
        )}

        {view.name === "myProgress" && (
          <MyProgress
            progress={progress}
            onOpen={(courseId) => setView({ name: "course", courseId })}
          />
        )}

        {view.name === "course" && (
          <CourseDetail
            course={findCourse(view.courseId)}
            progress={progress}
            onBack={() => setView({ name: "catalog" })}
            onOpenLesson={(lessonId) =>
              setView({ name: "lesson", courseId: view.courseId, lessonId })
            }
          />
        )}

        {view.name === "lesson" && (
          <LessonView
            course={findCourse(view.courseId)}
            lessonId={view.lessonId}
            progress={progress}
            onBackToCourse={() =>
              setView({ name: "course", courseId: view.courseId })
            }
            onOpenLesson={(lessonId) =>
              setView({ name: "lesson", courseId: view.courseId, lessonId })
            }
            onVideoProgress={setVideoProgress}
            onMarkComplete={markLessonComplete}
            onQuizSubmit={recordQuizAttempt}
          />
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Header                                                              */
/* ================================================================== */

function AmpuHeader({
  onHome,
  onProgress,
  active,
}: {
  onHome: () => void;
  onProgress: () => void;
  active: View["name"];
}) {
  return (
    <div className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <button onClick={onHome} className="flex items-center gap-2 text-left">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold text-white"
            style={{ backgroundColor: BRAND }}
          >
            u
          </span>
          <div>
            <div className="text-lg font-bold leading-none text-neutral-900 dark:text-white">
              AMP<span style={{ color: BRAND }}>u</span>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Technician Training
            </div>
          </div>
        </button>
        <nav className="flex items-center gap-1">
          <Button
            variant={active === "catalog" || active === "course" || active === "lesson" ? "secondary" : "ghost"}
            size="sm"
            onClick={onHome}
          >
            Catalog
          </Button>
          <Button
            variant={active === "myProgress" ? "secondary" : "ghost"}
            size="sm"
            onClick={onProgress}
          >
            My Training
          </Button>
        </nav>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Catalog                                                             */
/* ================================================================== */

function Catalog({
  progress,
  onOpen,
}: {
  progress: ProgressState;
  onOpen: (courseId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "not_started" | "in_progress" | "completed"
  >("ALL");

  const filtered = useMemo(() => {
    return MOCK_COURSES.filter((c) => {
      if (category !== "ALL" && c.category !== category) return false;
      if (search && !c.title.toLowerCase().includes(search.toLowerCase()))
        return false;
      const pct = courseCompletion(progress, c);
      const status =
        pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started";
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      return true;
    });
  }, [search, category, statusFilter, progress]);

  const categories: (Category | "ALL")[] = [
    "ALL",
    "NFPA_70E",
    "NFPA_70B",
    "ONBOARDING",
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900 dark:text-white">
        Training Catalog
      </h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Browse required and optional training courses.
      </p>

      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search courses…"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#f26722] dark:border-neutral-700 dark:bg-neutral-900 dark:text-white sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === c
                  ? "text-white"
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
              style={category === c ? { backgroundColor: BRAND } : undefined}
            >
              {c === "ALL" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        >
          <option value="ALL">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((course) => {
          const pct = courseCompletion(progress, course);
          return (
            <Card
              key={course.id}
              className="flex cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md"
              onClick={() => onOpen(course.id)}
            >
              <div
                className="flex h-28 items-center justify-center text-5xl"
                style={{ backgroundColor: `${BRAND}1a` }}
              >
                {course.thumbnail}
              </div>
              <CardContent className="flex flex-1 flex-col gap-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <CategoryTag category={course.category} />
                  {course.isRequired && (
                    <Badge style={{ backgroundColor: BRAND }} className="text-white">
                      Required
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold leading-snug text-neutral-900 dark:text-white">
                  {course.title}
                </h3>
                <p className="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {course.description}
                </p>
                <div className="mt-auto pt-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{course.estimatedDurationMinutes} min</span>
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
            No courses match your filters.
          </p>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Course detail                                                       */
/* ================================================================== */

function CourseDetail({
  course,
  progress,
  onBack,
  onOpenLesson,
}: {
  course: Course;
  progress: ProgressState;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  const pct = courseCompletion(progress, course);
  const isComplete = pct >= 100;
  const certifiedAt = progress.courseCertifiedAt[course.id];
  const continueIndex = nextIncompleteIndex(progress, course);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        ← Back to catalog
      </Button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <CategoryTag category={course.category} />
            {course.isRequired && (
              <Badge style={{ backgroundColor: BRAND }} className="text-white">
                Required
              </Badge>
            )}
          </div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-white">
            {course.title}
          </h1>
          <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            {course.description}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {course.lessons.length} lessons · {course.estimatedDurationMinutes} min ·{" "}
            {course.sequentialUnlock ? "Sequential" : "Free navigation"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ProgressRing percent={pct} />
          <Button
            onClick={() => onOpenLesson(course.lessons[continueIndex].id)}
            disabled={isComplete}
          >
            {isComplete ? "Completed" : pct > 0 ? "Continue" : "Start course"}
          </Button>
        </div>
      </div>

      {isComplete && (
        <Card className="mb-6 border-2" style={{ borderColor: BRAND }}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="text-4xl">🏅</div>
            <div className="flex-1">
              <p className="font-semibold text-neutral-900 dark:text-white">
                Course complete — Certified
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Certified on{" "}
                {certifiedAt
                  ? new Date(certifiedAt).toLocaleDateString()
                  : new Date().toLocaleDateString()}
                . Renewal due in 12 months.
              </p>
            </div>
            {/* PDF generation is out of scope for this pass — stubbed. */}
            <Button variant="outline" size="sm" disabled title="PDF generation coming soon">
              Download certificate
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lessons</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
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
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm dark:bg-neutral-800">
                      {status === "completed"
                        ? "✅"
                        : !unlocked
                        ? "🔒"
                        : lesson.type === "QUIZ"
                        ? "📝"
                        : "▶️"}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">
                        {lesson.title}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {lesson.type === "QUIZ"
                          ? `Quiz · ${lesson.quiz?.questions.length} questions · pass ${lesson.quiz?.passingScorePercent}%`
                          : `Video · ${Math.round((lesson.durationSeconds ?? 0) / 60) || 1} min`}
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
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* Lesson view (video OR quiz) + sidebar                               */
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

  // Guard against direct navigation into a locked lesson (URL-bypass protection).
  if (!lessonUnlocked(progress, course, index)) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="mb-3 text-4xl">🔒</div>
          <p className="mb-1 font-semibold text-neutral-900 dark:text-white">
            Lesson locked
          </p>
          <p className="mb-4 text-sm text-neutral-500">
            Complete the previous lessons before opening this one.
          </p>
          <Button onClick={onBackToCourse}>Back to course</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <Button variant="ghost" size="sm" onClick={onBackToCourse} className="mb-3">
          ← {course.title}
        </Button>
        {lesson.type === "VIDEO" ? (
          <VideoLesson
            key={lesson.id}
            lesson={lesson}
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
        ) : (
          <QuizLesson
            key={lesson.id}
            quiz={lesson.quiz!}
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

      {/* Lesson nav sidebar */}
      <aside>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Course content</CardTitle>
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
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
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
                          : "▶️"}
                      </span>
                      <span className="flex-1 text-neutral-700 dark:text-neutral-200">
                        {l.title}
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

/* ---------------------------- Video ------------------------------- */

function VideoLesson({
  lesson,
  startAt,
  completed,
  onProgress,
  onMarkComplete,
  onNext,
}: {
  lesson: Lesson;
  startAt: number;
  completed: boolean;
  onProgress: (seconds: number, duration: number) => void;
  onMarkComplete: () => void;
  onNext: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [watchPct, setWatchPct] = useState(0);
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
        <h2 className="mb-3 text-xl font-bold text-neutral-900 dark:text-white">
          {lesson.title}
        </h2>
        <div className="overflow-hidden rounded-lg bg-black">
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
            <span>Watch progress</span>
            <span>{Math.round(watchPct)}%</span>
          </div>
          <ProgressBar percent={watchPct} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            {thresholdHit
              ? "✅ Watch requirement met"
              : `Watch ${Math.round(VIDEO_COMPLETE_THRESHOLD * 100)}% to complete this lesson`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onMarkComplete}
              disabled={!thresholdHit || completed}
              title={
                thresholdHit
                  ? "Mark this lesson complete"
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

/* ---------------------------- Quiz -------------------------------- */

function QuizLesson({
  quiz,
  existing,
  onSubmit,
  onNext,
}: {
  quiz: Quiz;
  existing?: QuizAttemptRecord;
  onSubmit: (score: number, passed: boolean) => void;
  onNext: () => void;
}) {
  // If the quiz was already passed, don't allow re-submission to game retake counts.
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
          <h2 className="mb-1 text-xl font-bold text-neutral-900 dark:text-white">
            {quiz.title}
          </h2>
          <p className="mb-1 text-sm text-neutral-600 dark:text-neutral-400">
            You've already passed this exam.
          </p>
          <p className="mb-4 text-xs text-neutral-500">
            Best score {existing?.bestScore}% · {existing?.attemptCount} attempt
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
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {result.passed ? "Passed" : "Not passed"}
            </h2>
            <p
              className="mt-1 text-3xl font-bold"
              style={{ color: result.passed ? BRAND : "#dc2626" }}
            >
              {result.score}%
            </p>
            <p className="text-xs text-neutral-500">
              Passing score: {quiz.passingScorePercent}% ·{" "}
              {existing?.attemptCount ?? 1} attempt
              {(existing?.attemptCount ?? 1) > 1 ? "s" : ""}
            </p>
          </div>

          <div className="space-y-2">
            {quiz.questions.map((q, i) => {
              const ok = result.perQuestion[q.id];
              // On a fail, only reveal correct answers if the quiz allows it.
              const reveal = result.passed || quiz.revealAnswersOnFail;
              return (
                <div
                  key={q.id}
                  className="flex items-start gap-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
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
              Correct answers are hidden on certification exams. Review the
              material and retake.
            </p>
          )}

          <div className="mt-6 flex justify-center gap-2">
            {result.passed ? (
              <Button onClick={onNext}>Continue →</Button>
            ) : (
              <Button onClick={retake}>Retake quiz</Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  /* --- taking the quiz --------------------------------------------- */
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-1 text-xl font-bold text-neutral-900 dark:text-white">
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
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "bg-[#f26722]/10"
                            : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                        }`}
                        style={selected ? { borderColor: BRAND } : undefined}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                            multi ? "rounded" : "rounded-full"
                          }`}
                          style={
                            selected
                              ? { backgroundColor: BRAND, borderColor: BRAND }
                              : { borderColor: "#a3a3a3" }
                          }
                        >
                          {selected && (
                            <span className="text-[10px] text-white">✓</span>
                          )}
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
/* My Training (progress overview)                                     */
/* ================================================================== */

function MyProgress({
  progress,
  onOpen,
}: {
  progress: ProgressState;
  onOpen: (courseId: string) => void;
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900 dark:text-white">
        My Training
      </h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Your required and enrolled courses, and where you stand on each.
      </p>

      <div className="space-y-3">
        {MOCK_COURSES.map((course) => {
          const pct = courseCompletion(progress, course);
          const certifiedAt = progress.courseCertifiedAt[course.id];
          const status =
            pct >= 100 ? "Completed" : pct > 0 ? "In progress" : "Not started";
          return (
            <Card
              key={course.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => onOpen(course.id)}
            >
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="text-3xl">{course.thumbnail}</div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <CategoryTag category={course.category} />
                    {course.isRequired && (
                      <Badge
                        style={{ backgroundColor: BRAND }}
                        className="text-white"
                      >
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className="font-semibold text-neutral-900 dark:text-white">
                    {course.title}
                  </p>
                  <div className="mt-2 max-w-md">
                    <ProgressBar percent={pct} />
                  </div>
                  {certifiedAt && (
                    <p className="mt-1 text-xs" style={{ color: BRAND }}>
                      Certified {new Date(certifiedAt).toLocaleDateString()} ·
                      renews in 12 months
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {Math.round(pct)}%
                  </p>
                  <p className="text-xs text-neutral-500">{status}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
