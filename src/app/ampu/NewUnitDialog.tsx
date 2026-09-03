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
import { supabase } from "@/lib/supabase";
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

/** Documents live in the public `documents` bucket under this prefix. */
const DOC_BUCKET = "documents";
const DOC_PREFIX = "ampu-documents";
const DOC_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MAX_BYTES = 25 * 1024 * 1024;

type LessonKind = "VIDEO" | "DOCUMENT";

interface LessonDraft {
  key: string;
  kind: LessonKind;
  title: string;
  source: string; // YouTube link/id or a direct media URL
  minutes: string;
  docUrl: string; // public URL once uploaded
  docName: string; // original file name
  uploading: boolean;
  uploadError: string | null;
}

const emptyLesson = (): LessonDraft => ({
  key: crypto.randomUUID(),
  kind: "VIDEO",
  title: "",
  source: "",
  minutes: "",
  docUrl: "",
  docName: "",
  uploading: false,
  uploadError: null,
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

  const uploadDocument = async (key: string, file: File) => {
    if (file.size > DOC_MAX_BYTES) {
      updateLesson(key, { uploadError: "File is larger than 25 MB." });
      return;
    }
    updateLesson(key, { uploading: true, uploadError: null });
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${DOC_PREFIX}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(DOC_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from(DOC_BUCKET).getPublicUrl(path);
      const current = lessons.find((l) => l.key === key);
      const patch: Partial<LessonDraft> = {
        docUrl: publicUrl,
        docName: file.name,
        uploading: false,
      };
      if (!current?.title.trim()) {
        patch.title = file.name.replace(/\.[^.]+$/, "");
      }
      updateLesson(key, patch);
    } catch (e) {
      updateLesson(key, {
        uploading: false,
        uploadError:
          e instanceof Error ? e.message : "Upload failed. Try again.",
      });
    }
  };

  const validLessons = (): NewLessonInput[] | string => {
    const out: NewLessonInput[] = [];
    for (const [i, draft] of lessons.entries()) {
      const hasAnything =
        draft.title.trim() || draft.source.trim() || draft.docUrl;
      if (!hasAnything) continue; // an untouched row is just left blank
      if (!draft.title.trim()) return `Lesson ${i + 1} needs a title.`;

      if (draft.kind === "DOCUMENT") {
        if (draft.uploading) return `Lesson ${i + 1} is still uploading.`;
        if (!draft.docUrl) return `Lesson ${i + 1} needs a PDF or Word file.`;
        out.push({
          title: draft.title,
          type: "DOCUMENT",
          documentUrl: draft.docUrl,
          documentName: draft.docName || undefined,
        });
        continue;
      }

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
    if (out.length === 0) return "Add at least one lecture or document.";
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
          Attach video lectures and PDF/Word documents now; the exam can be
          added later.
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
            Coursework
          </h4>
          {lessons.map((lesson, i) => (
            <div
              key={lesson.key}
              className="space-y-3 border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  {lesson.kind === "DOCUMENT" ? "Reading" : "Lecture"} {i + 1}
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex border border-neutral-300 dark:border-neutral-700">
                    {(["VIDEO", "DOCUMENT"] as LessonKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => updateLesson(lesson.key, { kind: k })}
                        className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                        style={
                          lesson.kind === k
                            ? { backgroundColor: BRAND_COLOR, color: "#fff" }
                            : undefined
                        }
                      >
                        {k === "VIDEO" ? "Video" : "Document"}
                      </button>
                    ))}
                  </div>
                  {lessons.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLessons((prev) =>
                          prev.filter((l) => l.key !== lesson.key),
                        )
                      }
                      className="text-xs text-neutral-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {lesson.kind === "DOCUMENT" ? (
                <>
                  <Field label="Reading title">
                    <input
                      value={lesson.title}
                      onChange={(e) =>
                        updateLesson(lesson.key, { title: e.target.value })
                      }
                      placeholder="NFPA 70E Article 130 — study packet"
                      className={fieldClass}
                    />
                  </Field>
                  <Field
                    label="Document"
                    hint="PDF or Word (.doc / .docx), up to 25 MB."
                  >
                    <input
                      type="file"
                      accept={DOC_ACCEPT}
                      disabled={lesson.uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadDocument(lesson.key, file);
                        e.target.value = "";
                      }}
                      className={`${fieldClass} file:mr-3 file:border-0 file:bg-neutral-100 file:px-2 file:py-1 file:text-xs dark:file:bg-neutral-800 dark:file:text-neutral-200`}
                    />
                  </Field>
                  {lesson.uploading && (
                    <p className="text-xs text-neutral-500">Uploading…</p>
                  )}
                  {lesson.docUrl && !lesson.uploading && (
                    <p className="text-xs text-green-700 dark:text-green-400">
                      ✓ {lesson.docName}
                    </p>
                  )}
                  {lesson.uploadError && (
                    <p className="text-xs text-red-600">{lesson.uploadError}</p>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLessons((prev) => [...prev, emptyLesson()])}
            >
              + Add lecture
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLessons((prev) => [
                  ...prev,
                  { ...emptyLesson(), kind: "DOCUMENT" },
                ])
              }
            >
              + Add document
            </Button>
          </div>
          <p className="text-xs text-neutral-400">
            Exams are authored separately — publish the coursework now and attach
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
