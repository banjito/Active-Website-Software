import { useCallback, useEffect, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import {
  AUTO_RULE_LABELS,
  CHECKLIST_PHASES,
  ChecklistSetupMissingError,
  describeDueRule,
  fetchChecklistItems,
  fetchChecklistJobFacts,
  fetchChecklistSteps,
  fmtChecklistDate,
  saveChecklistItem,
  summarizeJobChecklist,
  type ChecklistItem,
  type ChecklistJobFacts,
  type ChecklistStep,
  type ItemState,
  type StepDisplay,
  type StepStatus,
} from "@/services/jobChecklistService";

const BOX_STYLES: Record<StepDisplay, string> = {
  done: "border-brand bg-brand text-white",
  auto: "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
  late: "border-red-600 bg-red-50 text-red-600 dark:border-red-500 dark:bg-red-950 dark:text-red-400",
  open: "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800",
  na: "border-dashed border-neutral-300 bg-transparent text-neutral-400 dark:border-neutral-600",
};

const BOX_TITLES: Record<StepDisplay, string> = {
  done: "Done",
  auto: "Ticked itself",
  late: "Late",
  open: "Open",
  na: "Not needed",
};

/** The square used for one step, on the job tab and on the dashboard grid */
export function ChecklistBox({ display }: { display: StepDisplay }) {
  return (
    <span
      title={BOX_TITLES[display]}
      className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-none border-2 text-xs font-bold leading-none ${BOX_STYLES[display]}`}
    >
      {(display === "done" || display === "auto") && (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      )}
      {display === "late" && "!"}
      {display === "na" && "–"}
    </span>
  );
}

export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  const width = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-[60px] flex-1 rounded-none bg-neutral-200 dark:bg-neutral-700">
        <div className="h-full rounded-none bg-brand" style={{ width: `${width}%` }} />
      </div>
      <span className="whitespace-nowrap font-mono text-xs text-neutral-700 dark:text-neutral-300">
        {done}/{total}
      </span>
    </div>
  );
}

function metaLine(status: StepStatus, today: Date): string {
  const { step, item, display, due } = status;
  if (display === "done") {
    return [item?.done_by_name || "Someone", fmtChecklistDate(item?.done_at)].filter(Boolean).join(" · ");
  }
  if (display === "auto") return `Ticked itself · ${status.autoDetail}`;
  if (display === "na") {
    return ["N/A", item?.done_by_name, fmtChecklistDate(item?.done_at)].filter(Boolean).join(" · ");
  }
  if (display === "late" && due) {
    const days = differenceInCalendarDays(today, due);
    return `Due ${fmtChecklistDate(due)} · ${days} ${days === 1 ? "day" : "days"} late`;
  }
  const parts: string[] = [];
  if (due) parts.push(`Due ${fmtChecklistDate(due)}`);
  else if (step.due_anchor) parts.push(`Due ${describeDueRule(step)}`);
  if (step.auto_rule) parts.push(`Ticks itself when ${AUTO_RULE_LABELS[step.auto_rule].toLowerCase()}`);
  return parts.join(" · ");
}

interface JobChecklistProps {
  jobId: string;
}

export default function JobChecklist({ jobId }: JobChecklistProps) {
  const { user } = useAuth();
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [facts, setFacts] = useState<ChecklistJobFacts | undefined>();
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [noteStep, setNoteStep] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i, f] = await Promise.all([
        fetchChecklistSteps(),
        fetchChecklistItems([jobId]),
        fetchChecklistJobFacts([jobId]),
      ]);
      setSteps(s);
      setItems(i);
      setFacts(f[0]);
      setSetupMissing(false);
    } catch (err) {
      if (err instanceof ChecklistSetupMissingError) {
        setSetupMissing(true);
      } else {
        console.error("[JobChecklist] Load failed:", err);
        toast({
          title: "Error",
          description: `Could not load checklist: ${err instanceof Error ? err.message : String(err)}`,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
    status: StepStatus,
    patch: { state?: ItemState; note?: string | null },
  ): Promise<boolean> => {
    if (!user) return false;
    setSavingStep(status.step.id);
    try {
      const saved = await saveChecklistItem(jobId, status.step.id, status.item, patch, {
        id: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
      });
      setItems((prev) => [...prev.filter((i) => i.step_id !== saved.step_id), saved]);
      return true;
    } catch (err) {
      console.error("[JobChecklist] Save failed:", err);
      toast({
        title: "Error",
        description: `Could not save: ${err instanceof Error ? err.message : String(err)}`,
        variant: "destructive",
      });
      return false;
    } finally {
      setSavingStep(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (setupMissing) {
    return (
      <div className="p-4">
        <div className="rounded-none border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          The checklist database setup has not been run yet (database/migrations/job_checklist.sql).
        </div>
      </div>
    );
  }

  const today = new Date();
  const summary = summarizeJobChecklist(steps, items, facts, today);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="w-full max-w-sm">
          <ChecklistProgress done={summary.done} total={summary.total} />
        </div>
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {summary.done} of {summary.total} done
        </span>
        {summary.late > 0 && (
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            {summary.late} late
          </span>
        )}
      </div>

      {CHECKLIST_PHASES.map((phase) => {
        const inPhase = summary.statuses.filter((s) => s.step.phase === phase);
        if (inPhase.length === 0) return null;
        const phaseDone = inPhase.filter(
          (s) => s.display === "done" || s.display === "auto" || s.display === "na",
        ).length;
        return (
          <div
            key={phase}
            className="rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
          >
            <div className="flex justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              <span>{phase}</span>
              <span>
                {phaseDone}/{inPhase.length}
              </span>
            </div>
            {inPhase.map((status) => {
              const { step, item, display } = status;
              const busy = savingStep === step.id;
              const isDone = display === "done" || display === "auto" || display === "na";
              const editingNote = noteStep === step.id;
              return (
                <div
                  key={step.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-t border-neutral-200 px-3 py-2.5 first:border-t-0 dark:border-neutral-700"
                >
                  {display === "auto" ? (
                    <ChecklistBox display={display} />
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={display === "done"}
                      aria-label={display === "done" ? `Untick ${step.name}` : `Tick ${step.name}`}
                      onClick={() => void save(status, { state: display === "done" ? "open" : "done" })}
                      className="rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                    >
                      <ChecklistBox display={display} />
                    </button>
                  )}
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        isDone ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-neutral-100"
                      }`}
                    >
                      {step.name}
                      {step.auto_rule && (
                        <span className="ml-2 rounded-none border border-blue-600 bg-blue-50 px-1 font-mono text-[10px] text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300">
                          auto
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs ${
                        display === "late"
                          ? "text-red-600 dark:text-red-400"
                          : display === "auto"
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {metaLine(status, today)}
                    </div>
                    {editingNote ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          rows={2}
                          placeholder="Example: PO 4471-B is in Files"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            isLoading={busy}
                            onClick={async () => {
                              const ok = await save(status, { note: noteDraft.trim() || null });
                              if (ok) setNoteStep(null);
                            }}
                          >
                            Save note
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setNoteStep(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      item?.note && (
                        <div className="mt-1 whitespace-pre-wrap border-l-2 border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                          {item.note}
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex gap-3 text-xs">
                    {(display === "open" || display === "late" || display === "na") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save(status, { state: display === "na" ? "open" : "na" })}
                        className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200"
                      >
                        {display === "na" ? "Undo N/A" : "N/A"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setNoteStep(step.id);
                        setNoteDraft(item?.note ?? "");
                      }}
                      className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    >
                      {item?.note ? "Edit note" : "Note"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
