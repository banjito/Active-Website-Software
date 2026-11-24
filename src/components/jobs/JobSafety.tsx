/**
 * Job → Safety tab (JSA/JHA scope, items 2 and 8). For now it holds the job's JHA, the
 * written safety plan. Drafts save as you type. Finishing locks a version; a change
 * means a new version, and the panel shows what's different.
 * Data: src/lib/jobJha.ts, database/migrations/safety_02_job_jha.sql.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Copy, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useCan } from "@/lib/permissions";
import { AutoTextarea, CARD, FIELD, MUTED } from "@/app/safety/safetyUi";
import { listWorkTypes, newHazardKey, type SafetyWorkType } from "@/lib/safetyWorkTypes";
import {
  changesBetween,
  contentOf,
  deleteJhaDraft,
  EMERGENCY_FIELDS,
  finishJobJha,
  JhaDraftSaver,
  jobHasSite,
  listJobJhas,
  missingForFinish,
  startJobJha,
  withoutWorkType,
  withWorkType,
  type JhaContent,
  type JhaHazard,
  type JhaSaveState,
  type JobJha,
} from "@/lib/jobJha";

/** Saves still running from a tab that just closed, so reopening it loads the newest copy. */
const leavingSaves = new Map<string, Promise<unknown>>();

const day = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : "");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function JobSafety({ jobId }: { jobId: string }) {
  const { can } = useCan();
  const canEdit = can("safety.edit_jha");

  const [jhas, setJhas] = useState<JobJha[] | null>(null);
  const [workTypes, setWorkTypes] = useState<SafetyWorkType[]>([]);
  const [hasSite, setHasSite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<JhaContent | null>(null);
  const [saveState, setSaveState] = useState<JhaSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "start" | "finish" | "delete">(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const saverRef = useRef<JhaDraftSaver | null>(null);
  const loadRef = useRef(0);
  const contentRef = useRef<JhaContent | null>(null);

  const load = useCallback(
    async (focusId?: string) => {
      const run = ++loadRef.current;
      try {
        await leavingSaves.get(jobId);
        const [rows, types, site] = await Promise.all([listJobJhas(jobId), listWorkTypes(), jobHasSite(jobId)]);
        if (run !== loadRef.current) return;
        const draft = rows.find((r) => r.status === "draft");
        const final = rows.find((r) => r.status === "final");
        const next = rows.find((r) => r.id === focusId) ?? (canEdit ? draft : undefined) ?? final ?? draft ?? null;

        saverRef.current = null;
        if (next?.status === "draft" && canEdit) {
          const saver: JhaDraftSaver = new JhaDraftSaver(next.id, next.updated_at, (state, msg) => {
            if (saverRef.current !== saver) return;
            setSaveState(state);
            setSaveError(msg ?? null);
          });
          saverRef.current = saver;
        }
        setJhas(rows);
        setWorkTypes(types);
        setHasSite(site);
        setSelectedId(next?.id ?? null);
        contentRef.current = next ? contentOf(next) : null;
        setContent(contentRef.current);
        setSaveState("saved");
        setSaveError(null);
        setError(null);
      } catch (e) {
        if (run === loadRef.current) setError(message(e));
      }
    },
    [jobId, canEdit],
  );

  useEffect(() => {
    void load();
    return () => {
      // Leaving the tab or the job: finish saving in the background
      loadRef.current++;
      const saver = saverRef.current;
      saverRef.current = null;
      if (!saver) return;
      const flushing: Promise<boolean> = saver.flush().finally(() => {
        if (leavingSaves.get(jobId) === flushing) leavingSaves.delete(jobId);
      });
      leavingSaves.set(jobId, flushing);
    };
  }, [load, jobId]);

  // Closing the browser before the last save lands
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const selected = useMemo(() => jhas?.find((j) => j.id === selectedId) ?? null, [jhas, selectedId]);
  const draft = jhas?.find((j) => j.status === "draft") ?? null;
  const current = jhas?.find((j) => j.status === "final") ?? null;
  const editable =
    !!selected && selected.status === "draft" && canEdit && saveState !== "conflict" && busy !== "finish";

  const change = (fn: (c: JhaContent) => JhaContent) => {
    if (!contentRef.current || !editable) return;
    const next = fn(contentRef.current);
    contentRef.current = next;
    setContent(next);
    saverRef.current?.queue(next);
  };
  const changeHazard = (key: string, part: Partial<JhaHazard>) =>
    change((c) => ({ ...c, hazards: c.hazards.map((h) => (h.key === key ? { ...h, ...part } : h)) }));
  const addHazard = () => {
    const key = newHazardKey();
    change((c) => ({ ...c, hazards: [...c.hazards, { key, hazard: "", controls: "", from: null }] }));
    setNewKey(key);
  };

  const pick = async (id: string) => {
    if (id === selectedId) return;
    if (saverRef.current && !(await saverRef.current.flush())) {
      const ok = await confirmDialog({
        title: "Leave without saving?",
        description: "Your last changes to this draft didn't save.",
        confirmLabel: "Leave",
        destructive: true,
      });
      if (!ok) return;
    }
    await load(id);
  };

  const start = async () => {
    setBusy("start");
    try {
      await load(await startJobJha(jobId));
    } catch (e) {
      toast({ title: "Couldn't start the JHA", description: message(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    const saver = saverRef.current;
    if (!selected || !saver) return;
    const ok = await confirmDialog({
      title: `Finish version ${selected.version}?`,
      description:
        "By finishing, you confirm you're qualified to plan this work and you checked every hazard, control and the emergency plan. " +
        "It locks for good. To change it later, start a new version.",
      confirmLabel: "Finish and lock",
    });
    if (!ok) return;
    setBusy("finish");
    try {
      if (!(await saver.flush())) {
        toast({ title: "Not finished", description: "Your last changes didn't save. Try again.", variant: "destructive" });
        return;
      }
      await finishJobJha(selected.id, saver.updatedAt);
      await load(selected.id);
      toast({ title: `JHA version ${selected.version} finished`, variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't finish", description: message(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: `Delete draft version ${selected.version}?`,
      description: "The draft goes away. Finished versions stay.",
      confirmLabel: "Delete draft",
      destructive: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await saverRef.current?.flush();
      await deleteJhaDraft(selected.id);
      await load();
      toast({ title: "Draft deleted" });
    } catch (e) {
      toast({ title: "Couldn't delete", description: message(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggleWorkType = async (w: { key: string; name: string }) => {
    if (!content) return;
    if (!content.work_types.some((t) => t.key === w.key)) {
      const full = workTypes.find((t) => t.key === w.key);
      if (full) change((c) => withWorkType(c, full));
      return;
    }
    const count = content.hazards.filter((h) => h.from === w.key).length;
    if (count > 0) {
      const ok = await confirmDialog({
        title: `Remove ${w.name}?`,
        description: `Its ${count} hazard${count === 1 ? "" : "s"} on this JHA go too, with any edits you made to them.`,
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!ok) return;
    }
    change((c) => withoutWorkType(c, w.key));
  };

  const takeNewerList = async (w: SafetyWorkType) => {
    const ok = await confirmDialog({
      title: `Use the approved ${w.name} list?`,
      description: "It replaces this JHA's copy, with any edits you made to it. Hazards you added by hand stay.",
      confirmLabel: "Use it",
    });
    if (ok) change((c) => withWorkType(c, w));
  };

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <div className="text-sm text-red-700 dark:text-red-300">
          <p>{error}</p>
          <button type="button" className="mt-1 font-medium underline underline-offset-2" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!jhas) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (!selected || !content) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 p-10 text-center`}>
        <ClipboardList className="h-8 w-8 text-neutral-400" />
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">No JHA on this job yet</h2>
          <p className={`mt-1 max-w-md text-sm ${MUTED}`}>
            The JHA is the written safety plan for the whole job: the work, the hazards and how we control them, and the
            emergency plan.{!canEdit && " The PM or lead writes it."}
          </p>
        </div>
        {canEdit && (
          <Button isLoading={busy === "start"} disabled={!!busy} leftIcon={<Plus className="h-4 w-4" />} onClick={() => void start()}>
            Start the JHA
          </Button>
        )}
      </div>
    );
  }

  const missing = missingForFinish(content);
  const unapproved = content.work_types.filter((t) => !t.approved_at);
  const previous = jhas.find((j) => j.status === "final" && j.version < selected.version) ?? null;
  const changes = previous ? changesBetween(contentOf(previous), content) : [];
  const chips = [
    ...workTypes.map((w) => ({ key: w.key, name: w.name })),
    ...content.work_types.filter((t) => !workTypes.some((w) => w.key === t.key)),
  ];
  const hazardGroups = [
    ...content.work_types.map((t) => ({ key: t.key, label: t.name, rows: content.hazards.filter((h) => h.from === t.key) })),
    {
      key: "by-hand",
      label: content.work_types.length > 0 ? "Added for this job" : "",
      rows: content.hazards.filter((h) => !content.work_types.some((t) => t.key === h.from)),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {jhas.length > 1 && (
        <div className="flex flex-wrap" role="tablist" aria-label="JHA versions">
          {[...jhas].reverse().map((j) => (
            <button
              key={j.id}
              type="button"
              role="tab"
              aria-selected={j.id === selectedId}
              onClick={() => void pick(j.id)}
              className={`-ml-px flex items-center gap-2 border px-3 py-1.5 text-sm first:ml-0 touch:py-2.5 ${
                j.id === selectedId
                  ? "relative z-10 border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-dark-150 dark:text-neutral-300 dark:hover:bg-dark-200"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-none ${
                  j.status === "draft" ? "bg-amber-500" : j.id === current?.id ? "bg-emerald-500" : "bg-neutral-400"
                }`}
              />
              Version {j.version}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className={`${CARD} divide-y divide-neutral-100 dark:divide-neutral-800`}>
          {/* 1. The work */}
          <Section n={1} title="The work">
            {editable ? (
              <AutoTextarea
                aria-label="Describe the work"
                className={FIELD}
                value={content.work_summary}
                placeholder="What we're doing, where, and on which gear"
                onChange={(e) => change((c) => ({ ...c, work_summary: e.target.value }))}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                {content.work_summary || "Not described yet"}
              </p>
            )}

            {editable && chips.length > 0 && (
              <div>
                <div className={`mb-1.5 text-xs ${MUTED}`}>Kind of work. Picking one fills in its hazards.</div>
                <div className="flex flex-wrap gap-2">
                  {chips.map((w) => {
                    const on = content.work_types.some((t) => t.key === w.key);
                    return (
                      <button
                        key={w.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => void toggleWorkType(w)}
                        className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-sm touch:py-2.5 ${
                          on
                            ? "border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white"
                            : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 dark:border-neutral-600 dark:bg-dark-150 dark:text-neutral-300"
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5 text-brand" />}
                        {w.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!editable && content.work_types.length > 0 && (
              <p className={`text-sm ${MUTED}`}>{content.work_types.map((t) => t.name).join(", ")}</p>
            )}

            {editable &&
              content.work_types.map((t) => {
                const live = workTypes.find((w) => w.key === t.key);
                const newer = live?.approved_at && live.approved_at !== t.approved_at;
                if (!newer && t.approved_at) return null;
                return (
                  <div key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      {newer
                        ? `The safety lead approved a newer ${t.name} list.`
                        : `The safety lead hasn't approved the ${t.name} list yet.`}
                    </span>
                    {newer && live && (
                      <button
                        type="button"
                        className="font-medium text-brand underline underline-offset-2"
                        onClick={() => void takeNewerList(live)}
                      >
                        Use the approved list
                      </button>
                    )}
                  </div>
                );
              })}
          </Section>

          {/* 2. Hazards */}
          <Section n={2} title="Hazards and controls">
            {hazardGroups.length === 0 && (
              <p className={`text-sm ${MUTED}`}>
                {editable ? "Pick a kind of work above, or add hazards by hand." : "None listed yet"}
              </p>
            )}
            {hazardGroups.map((g) => (
              <div key={g.key}>
                {g.label && <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{g.label}</div>}
                <ul className={editable ? "space-y-2" : "divide-y divide-neutral-100 dark:divide-neutral-800"}>
                  {g.rows.map((h) =>
                    editable ? (
                      <li key={h.key} className="flex items-start gap-1.5">
                        <div className="grid min-w-0 flex-1 gap-1.5 md:grid-cols-[2fr_3fr]">
                          <AutoTextarea
                            aria-label="Hazard"
                            autoFocus={h.key === newKey}
                            className={`${FIELD} font-medium`}
                            value={h.hazard}
                            placeholder="Hazard"
                            onChange={(e) => changeHazard(h.key, { hazard: e.target.value })}
                          />
                          <AutoTextarea
                            aria-label="How we control it"
                            className={FIELD}
                            value={h.controls}
                            placeholder="How we control it"
                            onChange={(e) => changeHazard(h.key, { controls: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${h.hazard || "this hazard"}`}
                          title="Remove"
                          className="flex-shrink-0 p-2 text-neutral-400 hover:text-red-600"
                          onClick={() => change((c) => ({ ...c, hazards: c.hazards.filter((x) => x.key !== h.key) }))}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ) : (
                      <li key={h.key} className="grid gap-x-4 gap-y-0.5 py-2 text-sm md:grid-cols-[2fr_3fr]">
                        <span className="font-medium text-neutral-900 dark:text-white">{h.hazard}</span>
                        <span className="text-neutral-700 dark:text-neutral-300">{h.controls}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
            {editable && (
              <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addHazard}>
                Add a hazard
              </Button>
            )}
          </Section>

          {/* 3. Energized work */}
          <Section n={3} title="Is energized work expected?">
            {editable ? (
              <>
                <div className="flex" role="radiogroup" aria-label="Is energized work expected?">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={content.energized_expected === v}
                      onClick={() => change((c) => ({ ...c, energized_expected: v }))}
                      className={`-ml-px min-w-[5rem] rounded-none border px-4 py-1.5 text-sm first:ml-0 touch:py-2.5 ${
                        content.energized_expected === v
                          ? "relative z-10 border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white"
                          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-dark-150 dark:text-neutral-300"
                      }`}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
                {content.energized_expected && (
                  <>
                    <AutoTextarea
                      aria-label="What will be energized, and why it can't be off"
                      className={FIELD}
                      value={content.energized_notes}
                      placeholder="What will be energized, and why it can't be off"
                      onChange={(e) => change((c) => ({ ...c, energized_notes: e.target.value }))}
                    />
                    <p className={`text-xs ${MUTED}`}>This doesn't replace the Energized Work Permit.</p>
                  </>
                )}
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                {content.energized_expected === null
                  ? "Not answered yet"
                  : content.energized_expected
                    ? `Yes. ${content.energized_notes}`
                    : "No"}
              </p>
            )}
          </Section>

          {/* 4. Emergency plan */}
          <Section n={4} title="Emergency plan">
            {editable && (
              <p className={`text-xs ${MUTED}`}>
                {hasSite
                  ? "Saved on the site when you finish, so the next job here starts with it. Check anything already filled in."
                  : "This job has no site picked, so the plan stays on this JHA."}
              </p>
            )}
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
              {EMERGENCY_FIELDS.map((f) => {
                const value = content.emergency_plan[f.key] ?? "";
                if (!editable && !value.trim() && !f.required) return null;
                return (
                  <label key={f.key} className="block">
                    <span className={`mb-1 block text-xs ${MUTED}`}>
                      {f.label}
                      {editable && !f.required && " (optional)"}
                    </span>
                    {editable ? (
                      <AutoTextarea
                        className={FIELD}
                        value={value}
                        placeholder={f.hint}
                        onChange={(e) =>
                          change((c) => ({ ...c, emergency_plan: { ...c.emergency_plan, [f.key]: e.target.value } }))
                        }
                      />
                    ) : (
                      <span className="block whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                        {value || "Not filled in yet"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </Section>
        </div>

        {/* Side panel */}
        <div className="space-y-4 lg:sticky lg:top-20">
          <div className={`${CARD} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">JHA version {selected.version}</h2>
              <span
                className={`text-sm font-medium ${
                  selected.status === "draft"
                    ? "text-amber-700 dark:text-amber-400"
                    : selected.id === current?.id
                      ? "text-emerald-700 dark:text-emerald-400"
                      : MUTED
                }`}
              >
                {selected.status === "draft" ? "Draft" : selected.id === current?.id ? "Current" : "Replaced"}
              </span>
            </div>

            {selected.status === "final" && (
              <>
                <p className="mt-2 flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <span>
                    Finished by {selected.finalized_by_name || "unknown"}, {day(selected.finalized_at)}.
                    {current && selected.id !== current.id && ` Version ${current.version} replaced it.`}
                  </span>
                </p>
                {canEdit && (
                  <Button
                    className="mt-3"
                    fullWidth
                    variant="outline"
                    disabled={!!busy}
                    isLoading={busy === "start"}
                    leftIcon={<Copy className="h-4 w-4" />}
                    onClick={() => void (draft ? pick(draft.id) : start())}
                  >
                    {draft ? `Open the draft (version ${draft.version})` : "Make a change (new version)"}
                  </Button>
                )}
              </>
            )}

            {selected.status === "draft" && !canEdit && (
              <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                {selected.prepared_by_name || "Someone"} is working on this. Don't use it until it's finished.
              </p>
            )}

            {selected.status === "draft" && canEdit && (
              <>
                {saveState === "conflict" ? (
                  <div className="mt-2 border-l-2 border-red-500 pl-2 text-sm text-red-700 dark:text-red-400">
                    Someone else changed this JHA. Your last changes didn't save.
                    <button
                      type="button"
                      className="mt-1 block font-medium underline underline-offset-2"
                      onClick={() => void load(selected.id)}
                    >
                      Reload theirs
                    </button>
                  </div>
                ) : saveState === "error" ? (
                  <div className="mt-2 border-l-2 border-red-500 pl-2 text-sm text-red-700 dark:text-red-400">
                    Couldn't save. {saveError}
                    <button
                      type="button"
                      className="mt-1 block font-medium underline underline-offset-2"
                      onClick={() => void saverRef.current?.flush()}
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <p className={`mt-1 text-xs ${MUTED}`}>{saveState === "saved" ? "All changes saved" : "Saving..."}</p>
                )}

                {missing.length > 0 || unapproved.length > 0 ? (
                  <div className="mt-3">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>Before you can finish</div>
                    <ul className="mt-1 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                      {missing.map((m) => (
                        <li key={m} className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-none border border-neutral-400" />
                          {m}
                        </li>
                      ))}
                      {unapproved.map((t) => (
                        <li key={t.key} className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-none bg-amber-500" />
                          {t.name} list needs the safety lead's approval
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Ready to finish
                  </p>
                )}
                <Button
                  className="mt-3"
                  fullWidth
                  disabled={!!busy || missing.length > 0 || unapproved.length > 0 || saveState === "conflict"}
                  isLoading={busy === "finish"}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={() => void finish()}
                >
                  Finish and lock
                </Button>
              </>
            )}
          </div>

          {previous && (
            <div className={`${CARD} p-4`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                Changed since version {previous.version}
              </div>
              {changes.length === 0 ? (
                <p className={`mt-1 text-sm ${MUTED}`}>Nothing yet</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                  {changes.map((c, i) => (
                    <li key={`${i}-${c}`}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={`flex flex-wrap items-center justify-between gap-2 px-1 text-xs ${MUTED}`}>
            <span>
              Started by {selected.prepared_by_name || "unknown"}, {day(selected.created_at)}
            </span>
            {selected.status === "draft" && canEdit && (
              <button
                type="button"
                disabled={!!busy}
                className="flex items-center gap-1.5 font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400"
                onClick={() => void remove()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete draft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-4 p-5 max-sm:gap-3 max-sm:p-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-none bg-brand text-sm font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="py-0.5 text-base font-semibold text-neutral-900 dark:text-white">{title}</h3>
        {children}
      </div>
    </section>
  );
}
