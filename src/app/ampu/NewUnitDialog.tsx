/**
 * Office of the Registrar — the New Unit form.
 *
 * Publishes a course plus its video lessons to common.ampu_courses /
 * common.ampu_lessons. Quiz authoring is deliberately not here yet; a unit can
 * be published with videos today and have its exam attached later.
 */

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { BRAND_COLOR } from "@/lib/companyConfig";
import {
  DEPARTMENT_LABEL,
  DEPARTMENT_PREFIX,
  type Course,
  type Department,
} from "./types";
import { toVideoSource } from "./videoSource";
import { createCourse, type NewLessonInput } from "@/lib/services/ampuService";

const DEPARTMENTS: Department[] = ["NFPA_70E", "NFPA_70B", "ONBOARDING", "OTHER"];

const COVER_EMOJI = ["⚡", "🔧", "🎓", "🔌", "📘", "🧰", "🛡️", "🔬", "📐", "🏗️"];

interface LessonDraft {
  key: string;
  title: string;
  source: string; // YouTube link/id or a direct media URL
  minutes: string;
}

const emptyLesson = (): LessonDraft => ({
  key: crypto.randomUUID(),
  title: "",
  source: "",
  minutes: "",
});

const fieldClass =
  "w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      )}
    </label>
  );
}

export default function NewUnitDialog({
  isOpen,
  onClose,
  onPublished,
  existingCodes,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPublished: (course: Course) => void;
  existingCodes: string[];
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState<Department>("OTHER");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("📘");
  const [instructor, setInstructor] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [sequentialUnlock, setSequentialUnlock] = useState(false);
  const [lessons, setLessons] = useState<LessonDraft[]>([emptyLesson()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCode("");
    setTitle("");
    setDepartment("OTHER");
    setDescription("");
    setThumbnail("📘");
    setInstructor("");
    setIsRequired(false);
    setSequentialUnlock(false);
    setLessons([emptyLesson()]);
    setError(null);
  };

  /** Next free catalog number in the chosen department, e.g. "SAF 301". */
  const suggestedCode = useMemo(() => {
    const prefix = DEPARTMENT_PREFIX[department];
    const used = existingCodes
      .filter((c) => c.toUpperCase().startsWith(prefix))
      .map((c) => parseInt(c.replace(/[^0-9]/g, ""), 10))
      .filter((n) => Number.isFinite(n));
    const next = used.length > 0 ? Math.max(...used) + 1 : 101;
    return `${prefix} ${next}`;
  }, [department, existingCodes]);

  const updateLesson = (key: string, patch: Partial<LessonDraft>) =>
    setLessons((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  const validLessons = (): NewLessonInput[] | string => {
    const out: NewLessonInput[] = [];
    for (const [i, draft] of lessons.entries()) {
      const hasAnything = draft.title.trim() || draft.source.trim();
      if (!hasAnything) continue; // an untouched row is just left blank
      if (!draft.title.trim()) return `Lesson ${i + 1} needs a title.`;
      const source = toVideoSource(draft.source);
      if (!source) {
        return `Lesson ${i + 1} needs a YouTube link or a direct video URL.`;
      }
      const minutes = draft.minutes.trim() ? Number(draft.minutes) : NaN;
      out.push({
        title: draft.title,
        type: "VIDEO",
        durationSeconds:
          Number.isFinite(minutes) && minutes > 0
            ? Math.round(minutes * 60)
            : undefined,
        ...source,
      });
    }
    if (out.length === 0) return "Add at least one video lesson.";
    return out;
  };

  const publish = async () => {
    setError(null);
    const finalCode = (code.trim() || suggestedCode).toUpperCase();
    if (!title.trim()) {
      setError("Give the unit a title.");
      return;
    }
    if (existingCodes.some((c) => c.toUpperCase() === finalCode)) {
      setError(`${finalCode} is already in the catalog. Pick another number.`);
      return;
    }
    const built = validLessons();
    if (typeof built === "string") {
      setError(built);
      return;
    }

    setSaving(true);
    try {
      const course = await createCourse({
        code: finalCode,
        title,
        description,
        department,
        thumbnail,
        instructor,
        isRequired,
        sequentialUnlock,
        lessons: built,
      });
      onPublished(course);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish the unit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title="Office of the Registrar — New Unit"
      size="xl"
    >
      <div className="max-h-[70vh] space-y-6 overflow-y-auto px-1">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Publishing adds the unit to the course catalog for every employee.
          Video lessons today; the exam can be attached later.
        </p>

        {/* --- Catalog entry ------------------------------------------- */}
        <section className="space-y-4">
          <h4 className="border-b border-neutral-200 pb-1 font-serif text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
            Catalog entry
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                className={fieldClass}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_LABEL[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Course number" hint={`Suggested: ${suggestedCode}`}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={suggestedCode}
                className={fieldClass}
              />
            </Field>
          </div>

          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Infrared Thermography Fundamentals"
              className={fieldClass}
            />
          </Field>

          <Field label="Course description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this unit covers and who should take it."
              className={fieldClass}
            />
          </Field>

          <Field label="Offered by">
            <input
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              placeholder="Department of Maintenance Engineering"
              className={fieldClass}
            />
          </Field>

          <Field label="Cover mark">
            <div className="flex flex-wrap gap-1">
              {COVER_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setThumbnail(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-none border text-lg"
                  style={
                    thumbnail === emoji
                      ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}1a` }
                      : { borderColor: "#d4d4d4" }
                  }
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: BRAND_COLOR }}
              />
              Required of all technicians
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={sequentialUnlock}
                onChange={(e) => setSequentialUnlock(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: BRAND_COLOR }}
              />
              Lessons unlock in order
            </label>
          </div>
        </section>

        {/* --- Lessons -------------------------------------------------- */}
        <section className="space-y-3">
          <h4 className="border-b border-neutral-200 pb-1 font-serif text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
            Lectures
          </h4>
          {lessons.map((lesson, i) => (
            <div
              key={lesson.key}
              className="space-y-3 border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Lecture {i + 1}
                </span>
                {lessons.length > 1 && (
                  <button
                    onClick={() =>
                      setLessons((prev) => prev.filter((l) => l.key !== lesson.key))
                    }
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Lecture title">
                  <input
                    value={lesson.title}
                    onChange={(e) =>
                      updateLesson(lesson.key, { title: e.target.value })
                    }
                    placeholder="Reading a thermogram"
                    className={fieldClass}
                  />
                </Field>
                <Field label="Runtime (min)">
                  <input
                    type="number"
                    min="0"
                    value={lesson.minutes}
                    onChange={(e) =>
                      updateLesson(lesson.key, { minutes: e.target.value })
                    }
                    placeholder="30"
                    className={`${fieldClass} sm:w-28`}
                  />
                </Field>
              </div>
              <Field
                label="Video"
                hint="A YouTube link or id, or a direct .mp4 URL."
              >
                <input
                  value={lesson.source}
                  onChange={(e) =>
                    updateLesson(lesson.key, { source: e.target.value })
                  }
                  placeholder="https://www.youtube.com/watch?v=…"
                  className={fieldClass}
                />
              </Field>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLessons((prev) => [...prev, emptyLesson()])}
          >
            + Add another lecture
          </Button>
          <p className="text-xs text-neutral-400">
            Exams are authored separately — publish the lectures now and attach
            the exam when it's written.
          </p>
        </section>

        {error && (
          <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={publish} isLoading={saving}>
          Publish unit
        </Button>
      </div>
    </Modal>
  );
}
