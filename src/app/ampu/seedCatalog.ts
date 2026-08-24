/**
 * The starter catalog AMPu shipped with as a hardcoded mock.
 *
 * It is still useful in two places: as the read-only catalog when
 * common.ampu_courses does not exist yet (migration not run), and as the
 * "publish starter catalog" payload a registrar can push into an empty
 * database from the Registrar view.
 */

import type { Course } from "./types";

// A small, freely-hostable sample clip so the player actually plays.
const SAMPLE_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export const SEED_CATALOG: Course[] = [
  {
    id: "70e",
    code: "SAF 701E",
    title: "Electrical Safety in the Workplace",
    description:
      "Arc-flash hazard analysis, the hierarchy of risk controls, PPE categories, and establishing an electrically safe work condition. Required annual safety certification.",
    department: "NFPA_70E",
    thumbnail: "⚡",
    instructor: "Department of Electrical Safety",
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
    code: "MNT 701B",
    title: "Electrical Equipment Maintenance",
    description:
      "Building and running an effective electrical preventive maintenance (EPM) program: inspection intervals, infrared thermography, and condition-based maintenance.",
    department: "NFPA_70B",
    thumbnail: "🔧",
    instructor: "Department of Maintenance Engineering",
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
    id: "theory2",
    code: "EET 202",
    title: "Electrical Theory II",
    description:
      "Electrical Theory II training session recorded 07/23/2026. Continues from Electrical Theory I with deeper coverage of core electrical concepts for field technicians.",
    department: "OTHER",
    thumbnail: "🔌",
    instructor: "Department of Electrical Engineering Technology",
    estimatedDurationMinutes: 227,
    isRequired: false,
    sequentialUnlock: false,
    lessons: [
      {
        id: "theory2-l1",
        title: "Electrical Theory II Training",
        type: "VIDEO",
        durationSeconds: 13646,
        youtubeId: "QrF8sVWhYrQ",
      },
    ],
  },
  {
    id: "onboard",
    code: "ORI 101",
    title: "New Technician Orientation",
    description:
      "Company policies, timekeeping, safety culture, and field reporting basics for new AMP field technicians.",
    department: "ONBOARDING",
    thumbnail: "🎓",
    instructor: "Office of the Registrar",
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
