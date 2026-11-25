/**
 * Admin Dashboard → Hazard lists (JSA/JHA scope, item 2).
 * The starter hazards for each kind of work. Edits wait for the safety lead's approval;
 * until then JHAs keep using the approved copy. Hazards typed by hand on a job show up
 * here as suggestions.
 * Data: src/lib/safetyWorkTypes.ts, database/migrations/safety_02_job_jha.sql.
 */
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useCan } from "@/lib/permissions";
import { useUnsavedEdits } from "@/lib/unsavedEdits";
import {
  addWorkType,
  approveWorkType,
  ChangedElsewhereError,
  listOpenSuggestions,
  listWorkTypes,
  newHazardKey,
  resolveSuggestion,
  saveWorkType,
  type HazardSuggestion,
  type ListHazard,
  type SafetyWorkType,
} from "@/lib/safetyWorkTypes";
import { AutoTextarea, CARD, FIELD, GHOST, MUTED } from "./safetyUi";

type EditState = { name: string; hazards: ListHazard[] };

const day = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : "");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toEdit = (w: SafetyWorkType): EditState => ({ name: w.name, hazards: w.draft_hazards ?? w.hazards ?? [] });

const sameHazards = (a: ListHazard[], b: ListHazard[]) =>
  a.length === b.length &&
  a.every((h, i) => h.key === b[i].key && h.hazard === b[i].hazard && h.controls === b[i].controls);

function listStatus(w: SafetyWorkType): { label: string; text: string; dot: string } {
  if (!w.approved_at) return { label: "Not approved", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" };
  if (w.draft_hazards) return { label: "Changes waiting", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" };
  return { label: "Approved", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" };
}

export default function WorkTypeEditor() {
  const { can } = useCan();
  const canEdit = can("safety.manage_hazards");
  const canApprove = can("safety.approve_questions");

  const [types, setTypes] = useState<SafetyWorkType[] | null>(null);
  const [suggestions, setSuggestions] = useState<HazardSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  /** Returns the list now on screen, freshly loaded. */
  const load = useCallback(async (focusKey?: string): Promise<SafetyWorkType | null> => {
    try {
      const [rows, open] = await Promise.all([listWorkTypes(), listOpenSuggestions()]);
      const next = rows.find((r) => r.key === focusKey) ?? rows[0] ?? null;
      setTypes(rows);
      setSuggestions(open);
      setSelectedKey(next?.key ?? null);
      setEdit(next ? toEdit(next) : null);
      setDirty(false);
      setError(null);
      return next;
    } catch (e) {
      setError(message(e));
      return null;
    }
  }, []);

  useEffect(() => {
    // Opened from a job's JHA: ?list=<key> shows that list first
    void load(new URLSearchParams(window.location.search).get("list") ?? undefined);
  }, [load]);

  // Leaving the page (or Back to Dashboard) with unsaved edits asks first
  useUnsavedEdits(dirty);

  const selected = types?.find((t) => t.key === selectedKey) ?? null;

  const change = (fn: (e: EditState) => EditState) => {
    setEdit((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  };
  const changeHazard = (key: string, part: Partial<ListHazard>) =>
    change((e) => ({ ...e, hazards: e.hazards.map((h) => (h.key === key ? { ...h, ...part } : h)) }));

  /** Runs one action with its button busy, and shows what went wrong. */
  const run = async (name: string, failTitle: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(name);
    try {
      await action();
      return true;
    } catch (e) {
      toast({
        title: failTitle,
        description: message(e),
        variant: e instanceof ChangedElsewhereError ? "warning" : "destructive",
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const confirmLeave = () =>
    confirmDialog({
      title: "Throw away your changes?",
      description: "This list has changes you haven't saved.",
      confirmLabel: "Throw away",
      destructive: true,
    });

  const pick = async (key: string) => {
    if (key === selectedKey) return;
    if (dirty && !(await confirmLeave())) return;
    const next = types?.find((t) => t.key === key);
    if (!next) return;
    setSelectedKey(key);
    setEdit(toEdit(next));
    setDirty(false);
  };

  const save = async (): Promise<SafetyWorkType | null> => {
    if (!selected || !edit) return null;
    if (!edit.name.trim()) {
      toast({ title: "Give the list a name first", variant: "warning" });
      return null;
    }
    const hazards = edit.hazards
      .map((h) => ({ ...h, hazard: h.hazard.trim(), controls: h.controls.trim() }))
      .filter((h) => h.hazard || h.controls);
    // Back to exactly what's approved = nothing left to approve
    const draft = selected.hazards && sameHazards(hazards, selected.hazards) ? null : hazards;
    let fresh: SafetyWorkType | null = null;
    const ok = await run("save", "Couldn't save", async () => {
      await saveWorkType(selected, { name: edit.name.trim(), draft_hazards: draft });
      fresh = await load(selected.key);
      toast({ title: "Saved", variant: "success" });
    });
    return ok ? fresh : null;
  };

  const approve = async () => {
    if (!selected) return;
    const target = dirty ? await save() : selected;
    if (!target) return;
    if (!target.draft_hazards) {
      toast({ title: "Nothing is waiting for approval" });
      return;
    }
    const ok = await confirmDialog({
      title: `Approve the ${target.name} list?`,
      description:
        "Job JHAs will start from this list. By approving, you confirm you checked every hazard and how it's controlled. " +
        "JHAs already written keep their own copy.",
      confirmLabel: "Approve",
    });
    if (!ok) return;
    await run("approve", "Couldn't approve", async () => {
      await approveWorkType(target);
      await load(target.key);
      toast({ title: `${target.name} list approved`, variant: "success" });
    });
  };

  const dropChanges = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: "Throw away the waiting changes?",
      description: "The list goes back to the approved copy.",
      confirmLabel: "Throw away",
      destructive: true,
    });
    if (!ok) return;
    await run("drop", "Couldn't throw them away", async () => {
      await saveWorkType(selected, { draft_hazards: null });
      await load(selected.key);
    });
  };

  const archive = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: `Remove the ${selected.name} list?`,
      description: "Nobody can pick it for new JHAs. JHAs that already use it keep their copy.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    await run("archive", "Couldn't remove it", async () => {
      await saveWorkType(selected, { archived_at: new Date().toISOString() });
      await load();
      toast({ title: "List removed" });
    });
  };

  const add = async () => {
    const name = adding?.trim();
    if (!name) return;
    if (dirty && !(await confirmLeave())) return;
    await run("add", "Couldn't add it", async () => {
      const last = Math.max(0, ...(types ?? []).map((t) => t.sort_order));
      const key = await addWorkType(name, last + 10);
      setAdding(null);
      await load(key);
    });
  };

  const resolve = (s: HazardSuggestion, workTypeKey: string | null) =>
    run(`s-${s.id}`, "Couldn't sort it", async () => {
      await resolveSuggestion(s.id, workTypeKey);
      await load(workTypeKey ?? selectedKey ?? undefined);
      toast({ title: workTypeKey ? "Added. It waits for approval." : "Dismissed" });
    });

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
  if (!types) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const approvedByKey = new Map((selected?.hazards ?? []).map((h) => [h.key, h]));
  /** What the safety lead is being asked to look at, next to the approved copy. */
  const tagFor = (h: ListHazard): "New" | "Changed" | null => {
    if (!selected?.hazards) return null;
    const was = approvedByKey.get(h.key);
    if (!was) return "New";
    return was.hazard !== h.hazard || was.controls !== h.controls ? "Changed" : null;
  };
  const dropped = edit ? (selected?.hazards ?? []).filter((h) => !edit.hazards.some((x) => x.key === h.key)) : [];

  return (
    <div className="space-y-4 pb-20">
      {canEdit && suggestions.length > 0 && (
        <div className={CARD}>
          <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Suggestions from jobs ({suggestions.length})
            </h2>
            {dirty && <p className={`text-xs ${MUTED}`}>Save your changes below before sorting these.</p>}
          </div>
          <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.id}
                suggestion={s}
                types={types}
                disabled={dirty || !!busy}
                onAdd={(key) => void resolve(s, key)}
                onDismiss={() => void resolve(s, null)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)_17rem] lg:items-start">
        {/* Lists */}
        <div className={CARD}>
          {types.map((t) => {
            const st = listStatus(t);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => void pick(t.key)}
                className={`block w-full border-l-4 border-t border-t-neutral-100 px-3 py-2 text-left first:border-t-0 dark:border-t-neutral-800 ${
                  t.key === selectedKey
                    ? "border-l-brand bg-neutral-50 dark:bg-dark-200"
                    : "border-l-transparent hover:bg-neutral-50 dark:hover:bg-dark-200"
                }`}
              >
                <div className="text-sm font-medium text-neutral-900 dark:text-white">{t.name}</div>
                <div className={`mt-0.5 flex items-center gap-1.5 text-xs ${st.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-none ${st.dot}`} />
                  {st.label}
                </div>
              </button>
            );
          })}
          {canEdit && (
            <div className="border-t border-neutral-100 p-2 dark:border-neutral-800">
              {adding === null ? (
                <Button size="sm" variant="ghost" fullWidth leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding("")}>
                  Add a kind of work
                </Button>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void add();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Kind of work"
                    className={FIELD}
                    value={adding}
                    placeholder="e.g. Battery testing"
                    onChange={(e) => setAdding(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" type="submit" disabled={!adding.trim() || !!busy} isLoading={busy === "add"}>
                      Add
                    </Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => setAdding(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {selected && edit ? (
          <>
            {/* Hazards */}
            <div className={`${CARD} space-y-4 p-5`}>
              {canEdit ? (
                <input
                  aria-label="Name of this kind of work"
                  className={`${GHOST} text-lg font-semibold text-neutral-900 dark:text-white`}
                  value={edit.name}
                  onChange={(e) => change((d) => ({ ...d, name: e.target.value }))}
                />
              ) : (
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{selected.name}</h2>
              )}

              {edit.hazards.length === 0 && <p className={`text-sm ${MUTED}`}>No hazards yet.</p>}
              <ul className={canEdit ? "space-y-2" : "divide-y divide-neutral-100 dark:divide-neutral-800"}>
                {edit.hazards.map((h) => {
                  const tag = tagFor(h);
                  const chip = tag && (
                    <span className="inline-block border border-amber-300 bg-amber-50 px-1.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      {tag}
                    </span>
                  );
                  return canEdit ? (
                    <li key={h.key}>
                      {chip && <div className="mb-1">{chip}</div>}
                      <div className="flex items-start gap-1.5">
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
                          onClick={() => change((e) => ({ ...e, hazards: e.hazards.filter((x) => x.key !== h.key) }))}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li key={h.key} className="grid gap-x-4 gap-y-0.5 py-2 text-sm md:grid-cols-[2fr_3fr]">
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {h.hazard} {chip}
                      </span>
                      <span className="text-neutral-700 dark:text-neutral-300">{h.controls}</span>
                    </li>
                  );
                })}
              </ul>
              {dropped.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Removed from the approved list: {dropped.map((h) => h.hazard).join(", ")}
                </p>
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    const key = newHazardKey();
                    change((e) => ({ ...e, hazards: [...e.hazards, { key, hazard: "", controls: "" }] }));
                    setNewKey(key);
                  }}
                >
                  Add a hazard
                </Button>
              )}
            </div>

            {/* Side panel */}
            <div className="space-y-4 lg:sticky lg:top-20">
              <div className={`${CARD} p-4`}>
                <span className={`flex items-center gap-1.5 text-sm font-medium ${listStatus(selected).text}`}>
                  <span className={`h-2 w-2 rounded-none ${listStatus(selected).dot}`} />
                  {listStatus(selected).label}
                </span>
                {selected.approved_at && (
                  <p className="mt-2 flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <span>
                      Last approved by {selected.approved_by_name || "the safety lead"}, {day(selected.approved_at)}.
                      {selected.draft_hazards && " JHAs use that copy until the changes are approved."}
                    </span>
                  </p>
                )}
                {!selected.approved_at && (
                  <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                    JHAs can be planned with this list, but can't be finished until it's approved.
                  </p>
                )}
                {(selected.draft_hazards || dirty) &&
                  (canApprove ? (
                    <Button
                      className="mt-3"
                      fullWidth
                      disabled={!!busy || edit.hazards.length === 0}
                      isLoading={busy === "approve"}
                      leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => void approve()}
                    >
                      Approve this list
                    </Button>
                  ) : (
                    <p className="mt-3 border-l-2 border-amber-400 pl-2 text-xs text-amber-800 dark:text-amber-300">
                      Only the safety lead can approve.
                    </p>
                  ))}
                {canEdit && (
                  <div className="mt-3 space-y-2 text-xs font-medium">
                    {selected.approved_at && selected.draft_hazards && !dirty && (
                      <button
                        type="button"
                        disabled={!!busy}
                        className="block text-neutral-600 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-300"
                        onClick={() => void dropChanges()}
                      >
                        Go back to the approved copy
                      </button>
                    )}
                    {!dirty && (
                      <button
                        type="button"
                        disabled={!!busy}
                        className="flex items-center gap-1.5 text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400"
                        onClick={() => void archive()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove this list
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className={`px-1 text-xs ${MUTED}`}>
                Our own words. Never PPE levels or boundaries: crews copy those from the equipment label.
              </p>
            </div>
          </>
        ) : (
          <p className={`text-sm ${MUTED}`}>No hazard lists yet.</p>
        )}
      </div>

      {dirty &&
        createPortal(
          <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="flex items-center gap-3 border border-neutral-200 bg-white py-2 pl-4 pr-2 shadow-lg dark:border-neutral-700 dark:bg-dark-150">
              <span className="text-sm text-neutral-700 dark:text-neutral-200">Unsaved changes</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() => {
                  if (selected) setEdit(toEdit(selected));
                  setDirty(false);
                }}
              >
                Discard
              </Button>
              <Button size="sm" disabled={!!busy} isLoading={busy === "save"} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function SuggestionRow({
  suggestion: s,
  types,
  disabled,
  onAdd,
  onDismiss,
}: {
  suggestion: HazardSuggestion;
  types: SafetyWorkType[];
  disabled: boolean;
  onAdd: (workTypeKey: string) => void;
  onDismiss: () => void;
}) {
  const guess = s.work_types.find((w) => types.some((t) => t.key === w.key))?.key ?? types[0]?.key ?? "";
  const [target, setTarget] = useState(guess);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-72">
        <div className="text-sm font-medium text-neutral-900 dark:text-white">{s.hazard}</div>
        <div className="text-sm text-neutral-700 dark:text-neutral-300">{s.controls}</div>
        <div className={`mt-0.5 text-xs ${MUTED}`}>
          {s.suggested_by_name || "Someone"}, {day(s.created_at)} ·{" "}
          <Link className="underline underline-offset-2 hover:text-brand" to={`/jobs/${s.job_id}?tab=jha`}>
            Open the job
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Add to list" className={`${FIELD} !w-48`} value={target} onChange={(e) => setTarget(e.target.value)}>
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={disabled || !target} onClick={() => onAdd(target)}>
          Add
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}
