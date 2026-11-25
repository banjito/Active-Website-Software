/**
 * Admin Dashboard → Safety questions (JSA/JHA scope, item 1).
 * The steps and checks every Daily JSA walks through, one version at a time.
 * Drafts are edited in place (click any text). The safety lead approves one to put it
 * in use; approved versions are frozen, so a change always means a new version.
 * Data: src/lib/safetyQuestions.ts, database/migrations/safety_01_questions.sql.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useCan } from "@/lib/permissions";
import { useUnsavedEdits } from "@/lib/unsavedEdits";
import { AutoTextarea, CARD, GHOST, GHOST_BASE, MUTED } from "./safetyUi";
import {
  approveQuestionSet,
  deleteDraft,
  listQuestionSets,
  newCheckKey,
  saveDraft,
  startDraft,
  type CheckWhen,
  type SafetyCheck,
  type SafetyQuestionSet,
  type SafetyStep,
} from "@/lib/safetyQuestions";

/** Refs are typed as one comma list, so the text box keeps what's typed until save. */
type EditStep = SafetyStep & { refsText: string };
type EditState = { edition: string; notes: string; steps: EditStep[] };
type Status = SafetyQuestionSet["status"];

const STATUS_LABEL: Record<Status, string> = { draft: "Draft", in_use: "In use", retired: "Retired" };
const STATUS_TEXT: Record<Status, string> = {
  draft: "text-amber-700 dark:text-amber-400",
  in_use: "text-emerald-700 dark:text-emerald-400",
  retired: "text-neutral-500 dark:text-neutral-400",
};
const STATUS_DOT: Record<Status, string> = {
  draft: "bg-amber-500",
  in_use: "bg-emerald-500",
  retired: "bg-neutral-400",
};

/** The power step splits its checks by which way the crew goes. */
const POWER_GROUPS: { when: CheckWhen; label: string }[] = [
  { when: "off", label: "If the power is off" },
  { when: "on", label: "If the power stays on" },
  { when: "always", label: "Every time" },
];

const day = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : "");

function toEdit(set: SafetyQuestionSet): EditState {
  return {
    edition: set.edition,
    notes: set.notes ?? "",
    steps: set.steps.map((s) => ({ ...s, refsText: s.refs.join(", ") })),
  };
}

function fromEdit(edit: EditState): Pick<SafetyQuestionSet, "edition" | "steps" | "notes"> {
  return {
    edition: edit.edition.trim(),
    notes: edit.notes.trim() || null,
    steps: edit.steps.map(({ refsText, ...s }) => ({
      ...s,
      title: s.title.trim(),
      prompt: s.prompt.trim(),
      help: s.help.trim(),
      refs: refsText.split(",").map((r) => r.trim()).filter(Boolean),
      checks: s.checks.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text),
    })),
  };
}

function GhostTextarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <AutoTextarea {...props} className={`${GHOST} ${className}`} />;
}

export default function QuestionSetEditor() {
  const { can } = useCan();
  const canEdit = can("safety.manage_questions");
  const canApprove = can("safety.approve_questions");

  const [sets, setSets] = useState<SafetyQuestionSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "approve" | "delete" | "copy">(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async (focusId?: string) => {
    try {
      const rows = await listQuestionSets();
      setSets(rows);
      setError(null);
      const next =
        rows.find((r) => r.id === focusId) ??
        rows.find((r) => r.status === "draft") ??
        rows.find((r) => r.status === "in_use") ??
        rows[0];
      setSelectedId(next?.id ?? null);
      setEdit(next ? toEdit(next) : null);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => sets?.find((s) => s.id === selectedId) ?? null, [sets, selectedId]);
  const inUse = sets?.find((s) => s.status === "in_use") ?? null;
  const draft = sets?.find((s) => s.status === "draft") ?? null;
  const editable = !!selected && selected.status === "draft" && canEdit;

  // Leaving the page (or Back to Dashboard) with unsaved edits asks first
  useUnsavedEdits(dirty);

  const pick = async (id: string) => {
    if (id === selectedId) return;
    if (dirty) {
      const ok = await confirmDialog({
        title: "Throw away your changes?",
        description: "This draft has changes you haven't saved.",
        confirmLabel: "Throw away",
        destructive: true,
      });
      if (!ok) return;
    }
    const set = sets?.find((s) => s.id === id);
    if (!set) return;
    setSelectedId(id);
    setEdit(toEdit(set));
    setDirty(false);
  };

  const change = (fn: (draft: EditState) => EditState) => {
    setEdit((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  };
  const changeStep = (i: number, fn: (s: EditStep) => EditStep) =>
    change((e) => ({ ...e, steps: e.steps.map((s, j) => (j === i ? fn(s) : s)) }));
  const changeCheck = (i: number, key: string, text: string) =>
    changeStep(i, (s) => ({ ...s, checks: s.checks.map((c) => (c.key === key ? { ...c, text } : c)) }));
  const removeCheck = (i: number, key: string) =>
    changeStep(i, (s) => ({ ...s, checks: s.checks.filter((c) => c.key !== key) }));
  /** Adds a blank check after `afterKey` (or at the end of its group) and puts the cursor in it. */
  const addCheck = (i: number, when: CheckWhen, afterKey?: string) => {
    const key = newCheckKey();
    changeStep(i, (s) => {
      const blank: SafetyCheck = { key, text: "", when };
      const at = afterKey
        ? s.checks.findIndex((c) => c.key === afterKey) + 1
        : s.checks.reduce((last, c, ci) => (c.when === when ? ci + 1 : last), s.checks.length);
      const checks = [...s.checks];
      checks.splice(at, 0, blank);
      return { ...s, checks };
    });
    setNewKey(key);
  };

  const save = async (): Promise<boolean> => {
    if (!selected || !edit) return false;
    if (!edit.edition.trim()) {
      toast({ title: "Add the 70E edition first", variant: "warning" });
      return false;
    }
    setBusy("save");
    try {
      await saveDraft(selected.id, fromEdit(edit));
      await load(selected.id);
      toast({ title: "Draft saved", variant: "success" });
      return true;
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const discard = () => {
    if (!selected) return;
    setEdit(toEdit(selected));
    setDirty(false);
  };

  const approve = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: `Approve version ${selected.version}?`,
      description:
        `Every crew's Daily JSA will use these questions${inUse ? `, replacing version ${inUse.version}` : ""}. ` +
        `By approving, you confirm you checked every step and every section number against the NFPA 70E ${edit?.edition || selected.edition} book. ` +
        "Approved versions can't be changed.",
      confirmLabel: "Approve and put in use",
    });
    if (!ok) return;
    if (dirty && !(await save())) return;
    setBusy("approve");
    try {
      await approveQuestionSet(selected.id);
      await load(selected.id);
      toast({ title: `Version ${selected.version} is now in use`, variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't approve", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: `Delete draft version ${selected.version}?`,
      description: "The draft and its changes go away. Approved versions stay.",
      confirmLabel: "Delete draft",
      destructive: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteDraft(selected.id);
      await load();
      toast({ title: "Draft deleted" });
    } catch (e) {
      toast({ title: "Couldn't delete", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!selected) return;
    setBusy("copy");
    try {
      const id = await startDraft(selected.id);
      await load(id);
    } catch (e) {
      toast({ title: "Couldn't start a new version", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }
  if (!sets) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (sets.length === 0 || !selected || !edit) {
    return (
      <div className={`${CARD} border-dashed p-10 text-center text-sm ${MUTED}`}>
        No versions yet. Run database/migrations/safety_01_questions.sql to add the first draft.
      </div>
    );
  }

  const unchecked = selected.status === "draft";

  return (
    <div className="space-y-4 pb-20">
      {/* Versions */}
      {sets.length > 1 && (
        <div className="flex flex-wrap" role="tablist" aria-label="Versions">
          {[...sets].reverse().map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === selectedId}
              onClick={() => void pick(s.id)}
              className={`-ml-px flex items-center gap-2 border px-3 py-1.5 text-sm first:ml-0 ${
                s.id === selectedId
                  ? "relative z-10 border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-dark-150 dark:text-neutral-300 dark:hover:bg-dark-200"
              }`}
            >
              <span className={`h-2 w-2 rounded-none ${STATUS_DOT[s.status]}`} />
              Version {s.version}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* The steps */}
        <ol className={`${CARD} divide-y divide-neutral-100 dark:divide-neutral-800`}>
          {edit.steps.map((step, i) => {
            const groups =
              step.key === "power"
                ? POWER_GROUPS.map((g) => ({ ...g, checks: step.checks.filter((c) => c.when === g.when) })).filter(
                    (g) => editable || g.checks.length > 0,
                  )
                : [{ when: "always" as CheckWhen, label: "", checks: step.checks }];

            return (
              <li key={step.key} className="flex gap-4 p-5">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-none bg-brand text-sm font-bold text-white">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-2">
                  {/* Title + 70E sections */}
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      {editable ? (
                        <input
                          aria-label={`Step ${i + 1} title`}
                          className={`${GHOST} text-base font-semibold text-neutral-900 dark:text-white`}
                          value={step.title}
                          onChange={(e) => changeStep(i, (s) => ({ ...s, title: e.target.value }))}
                        />
                      ) : (
                        <h3 className="py-0.5 text-base font-semibold text-neutral-900 dark:text-white">{step.title}</h3>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:max-w-[45%]">
                      <span className={`text-xs font-medium ${MUTED}`}>70E</span>
                      {editable ? (
                        <input
                          aria-label={`Step ${i + 1} NFPA 70E sections`}
                          className={`${GHOST_BASE} w-44 font-mono text-xs text-neutral-700 dark:text-neutral-300`}
                          value={step.refsText}
                          placeholder="Add sections"
                          title="Section numbers only, separated by commas"
                          onChange={(e) => changeStep(i, (s) => ({ ...s, refsText: e.target.value }))}
                        />
                      ) : step.refs.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {step.refs.map((r) => (
                            <span
                              key={r}
                              className="border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:bg-dark-200 dark:text-neutral-300"
                            >
                              {r}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={`text-xs ${MUTED}`}>None</span>
                      )}
                    </div>
                  </div>

                  {/* What the lead says */}
                  {editable ? (
                    <GhostTextarea
                      aria-label={`Step ${i + 1}: what the person in charge says`}
                      className="text-sm text-neutral-800 dark:text-neutral-200"
                      value={step.prompt}
                      placeholder="What the person in charge says to the crew"
                      onChange={(e) => changeStep(i, (s) => ({ ...s, prompt: e.target.value }))}
                    />
                  ) : (
                    <p className="text-sm text-neutral-800 dark:text-neutral-200">{step.prompt}</p>
                  )}

                  {/* Help */}
                  {(editable || step.help) && (
                    <div className={`flex items-start gap-1.5 text-xs ${MUTED}`}>
                      <Info className="mt-1 h-3.5 w-3.5 flex-shrink-0" />
                      {editable ? (
                        <GhostTextarea
                          aria-label={`Step ${i + 1} help`}
                          className={`text-xs ${MUTED}`}
                          value={step.help}
                          placeholder="Extra help on screen (optional)"
                          onChange={(e) => changeStep(i, (s) => ({ ...s, help: e.target.value }))}
                        />
                      ) : (
                        <p className="py-0.5">{step.help}</p>
                      )}
                    </div>
                  )}

                  {/* Checks */}
                  <div className="space-y-3 pt-2">
                    {groups.map((g) => (
                      <div key={g.when}>
                        {g.label && (
                          <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{g.label}</div>
                        )}
                        <ul className="space-y-0.5">
                          {g.checks.map((c) => (
                            <li key={c.key} className="group flex items-start gap-2">
                              <Check className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-500" />
                              {editable ? (
                                <>
                                  <input
                                    aria-label="Check"
                                    autoFocus={c.key === newKey}
                                    className={`${GHOST} text-sm text-neutral-800 dark:text-neutral-200`}
                                    value={c.text}
                                    placeholder="What the crew confirms"
                                    onChange={(e) => changeCheck(i, c.key, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        addCheck(i, c.when, c.key);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    aria-label="Remove this check"
                                    title="Remove"
                                    className="mt-0.5 flex-shrink-0 p-1 text-neutral-400 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 touch:opacity-100"
                                    onClick={() => removeCheck(i, c.key)}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <span className="py-0.5 text-sm text-neutral-800 dark:text-neutral-200">{c.text}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {editable && (
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1.5 py-1 text-xs font-medium text-neutral-500 hover:text-brand dark:text-neutral-400"
                            onClick={() => addCheck(i, g.when)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add a check
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Side panel */}
        <div className="space-y-4 lg:sticky lg:top-20">
          {/* Status + approval */}
          <div className={`${CARD} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Version {selected.version}</h2>
              <span className={`flex items-center gap-1.5 text-sm font-medium ${STATUS_TEXT[selected.status]}`}>
                <span className={`h-2 w-2 rounded-none ${STATUS_DOT[selected.status]}`} />
                {STATUS_LABEL[selected.status]}
              </span>
            </div>

            {selected.status === "in_use" && (
              <p className="mt-2 flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                Every crew's Daily JSA uses this. Approved by {selected.approved_by_name || "the safety lead"} on{" "}
                {day(selected.approved_at)}.
              </p>
            )}
            {selected.status === "retired" && (
              <p className={`mt-2 text-sm ${MUTED}`}>
                Retired {day(selected.retired_at)}. Kept so old JSAs show the questions they were asked.
              </p>
            )}
            {selected.status === "draft" && (
              <>
                <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                  {inUse
                    ? `Crews keep using version ${inUse.version} until this is approved.`
                    : "No version is approved yet, so no Daily JSA can start."}
                </p>
                <p className={`mt-2 text-xs ${MUTED}`}>
                  The safety lead checks every step and section number against the book, then approves.
                </p>
                {canApprove ? (
                  <Button
                    className="mt-3"
                    fullWidth
                    disabled={!!busy}
                    isLoading={busy === "approve"}
                    leftIcon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => void approve()}
                  >
                    Approve and put in use
                  </Button>
                ) : (
                  <p className="mt-3 border-l-2 border-amber-400 pl-2 text-xs text-amber-800 dark:text-amber-300">
                    Only the safety lead can approve. Give them "Approve safety questions" on People &amp; roles.
                  </p>
                )}
              </>
            )}

            {selected.status !== "draft" && canEdit && (
              <Button
                className="mt-3"
                fullWidth
                variant="outline"
                disabled={!!busy}
                isLoading={busy === "copy"}
                leftIcon={<Copy className="h-4 w-4" />}
                onClick={() => (draft ? void pick(draft.id) : void copy())}
              >
                {draft ? `Open the draft (version ${draft.version})` : "Start a new version from this"}
              </Button>
            )}
          </div>

          {/* Details */}
          <div className={`${CARD} space-y-3 p-4 text-sm`}>
            <div>
              <div className={`text-xs ${MUTED}`}>NFPA 70E edition</div>
              {editable ? (
                <input
                  aria-label="NFPA 70E edition"
                  className={`${GHOST} font-medium text-neutral-900 dark:text-white`}
                  value={edit.edition}
                  placeholder="2027"
                  onChange={(e) => change((d) => ({ ...d, edition: e.target.value }))}
                />
              ) : (
                <div className="py-0.5 font-medium text-neutral-900 dark:text-white">{selected.edition}</div>
              )}
            </div>
            <div>
              <div className={`text-xs ${MUTED}`}>What changed</div>
              {editable ? (
                <GhostTextarea
                  aria-label="What changed in this version"
                  className="text-neutral-800 dark:text-neutral-200"
                  value={edit.notes}
                  placeholder="Say what's different from the last version"
                  onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))}
                />
              ) : (
                <p className="whitespace-pre-wrap py-0.5 text-neutral-800 dark:text-neutral-200">{selected.notes || "Nothing noted"}</p>
              )}
            </div>
            <div className={`text-xs ${MUTED}`}>
              Started by {selected.created_by_name || "unknown"}, {day(selected.created_at)}
            </div>
            {unchecked && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                Section numbers aren't checked against the book yet.
              </p>
            )}
            {editable && (
              <button
                type="button"
                disabled={!!busy}
                className="flex items-center gap-1.5 pt-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400"
                onClick={() => void remove()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete this draft
              </button>
            )}
          </div>

          <p className={`px-1 text-xs ${MUTED}`}>
            Our own words, section numbers only, never the book's text. Approved versions never change, so old JSAs keep
            the exact questions they were asked.
          </p>
        </div>
      </div>

      {dirty &&
        createPortal(
          <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="flex items-center gap-3 border border-neutral-200 bg-white py-2 pl-4 pr-2 shadow-lg dark:border-neutral-700 dark:bg-dark-150">
              <span className="text-sm text-neutral-700 dark:text-neutral-200">Unsaved changes</span>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={discard}>
                Discard
              </Button>
              <Button size="sm" disabled={!!busy} isLoading={busy === "save"} onClick={() => void save()}>
                Save draft
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
