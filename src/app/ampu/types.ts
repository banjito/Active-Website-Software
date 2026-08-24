/**
 * AMPu domain types.
 *
 * These mirror common.ampu_courses / common.ampu_lessons (see
 * database/migrations/create_ampu_tables.sql) in the camelCase shape the UI
 * works in. The service layer does the translation.
 */

/** Academic department a unit is offered by. Stored as the column value. */
export type Department = "NFPA_70E" | "NFPA_70B" | "ONBOARDING" | "OTHER";

export type QuestionType = "SINGLE_SELECT" | "MULTI_SELECT" | "TRUE_FALSE";

export interface Choice {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  choices: Choice[];
  correctChoiceIds: string[];
}

export interface Quiz {
  id: string;
  title: string;
  passingScorePercent: number;
  revealAnswersOnFail: boolean;
  questions: Question[];
}

export interface Lesson {
  id: string;
  title: string;
  type: "VIDEO" | "QUIZ";
  durationSeconds?: number;
  videoUrl?: string; // direct file URL (HTML5 <video>)
  youtubeId?: string; // YouTube video id (embedded via IFrame API)
  quiz?: Quiz;
}

/** A unit in the catalog: course code, department, and its ordered lessons. */
export interface Course {
  id: string;
  code: string; // "SAF 701E" — catalog number
  title: string;
  description: string;
  department: Department;
  thumbnail: string; // emoji stand-in for cover art
  instructor?: string;
  estimatedDurationMinutes: number;
  isRequired: boolean;
  sequentialUnlock: boolean;
  lessons: Lesson[];
}

export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface LessonProgress {
  status: LessonStatus;
  lastWatchedSeconds?: number;
}

export interface QuizAttemptRecord {
  attemptCount: number;
  bestScore: number;
  lastScore: number;
  passed: boolean;
}

/** Single source of truth for per-user progress (still in-memory, per session). */
export interface ProgressState {
  lessons: Record<string, LessonProgress>;
  quizzes: Record<string, QuizAttemptRecord>;
  courseCertifiedAt: Record<string, string>; // courseId -> ISO date
}

export const DEPARTMENT_LABEL: Record<Department, string> = {
  NFPA_70E: "Electrical Safety",
  NFPA_70B: "Maintenance Engineering",
  ONBOARDING: "Professional Studies",
  OTHER: "General Studies",
};

/** Short form used on badges and catalog rows. */
export const DEPARTMENT_SHORT: Record<Department, string> = {
  NFPA_70E: "NFPA 70E",
  NFPA_70B: "NFPA 70B",
  ONBOARDING: "Onboarding",
  OTHER: "Electives",
};

/** Catalog-number prefix suggested for each department. */
export const DEPARTMENT_PREFIX: Record<Department, string> = {
  NFPA_70E: "SAF",
  NFPA_70B: "MNT",
  ONBOARDING: "ORI",
  OTHER: "EET",
};

export const VIDEO_COMPLETE_THRESHOLD = 0.9; // 90% watched completes a video lesson
