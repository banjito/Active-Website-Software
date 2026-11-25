import React, { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  copyLineup,
  makeRenamer,
  planLineupCopy,
  suggestNextLineupName,
  type LineupCopyResult,
  type LineupSource,
} from "@/lib/reports/lineupCopy";

/**
 * "Copy this substation": every report in one lineup, copied blank into a new one.
 *
 * Nameplates and settings come along, the way the per-report "Copy nameplate" button
 * does it. Serials, readings and results start blank. The old lineup name inside each
 * equipment name is swapped for the new one, with a preview so nobody is surprised.
 */
export default function CopyLineupDialog({
  open,
  onOpenChange,
  jobId,
  userId,
  sourceLabel,
  sources,
  countInSubstation,
  onCopied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  userId: string;
  sourceLabel: string;
  sources: LineupSource[];
  /** How many reports a substation name already holds on this job. */
  countInSubstation: (label: string) => number;
  /** Runs after the copies exist, to file them into folders and reload the list. */
  onCopied: (newLabel: string, result: LineupCopyResult) => Promise<void> | void;
}) {
  const plan = useMemo(() => planLineupCopy(sources), [sources]);

  const [newName, setNewName] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [replaceEdited, setReplaceEdited] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<LineupCopyResult["failed"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = suggestNextLineupName(sourceLabel);
    setNewName(next);
    setFind(sourceLabel);
    setReplace(next);
    setReplaceEdited(false);
    setProgress(null);
    setFailed([]);
    setError("");
  }, [open, sourceLabel]);

  const [running, setRunning] = useState(false);
  const finishedWithErrors = failed.length > 0;
  const trimmed = newName.trim();
  const sameAsSource = trimmed.toLowerCase() === sourceLabel.trim().toLowerCase();
  const alreadyThere = trimmed && !sameAsSource ? countInSubstation(trimmed) : 0;
  const canCopy =
    Boolean(trimmed) && !sameAsSource && plan.copyable.length > 0 && progress === null;

  const renamer = useMemo(() => makeRenamer(find, replace), [find, replace]);
  const renamed = useMemo(
    () =>
      plan.copyable
        .map((s) => ({ from: s.name, to: renamer(s.name) }))
        .filter((r) => r.from !== r.to),
    [plan.copyable, renamer],
  );

  const onNameChange = (value: string) => {
    setNewName(value);
    if (!replaceEdited) setReplace(value);
  };

  const run = async () => {
    if (!canCopy) return;
    setError("");
    setRunning(true);
    setProgress({ done: 0, total: plan.copyable.length });
    try {
      const result = await copyLineup({
        jobId,
        userId,
        sources: plan.copyable,
        substation: trimmed,
        rename: renamer,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (result.created.size > 0) await onCopied(trimmed, result);
      if (result.failed.length > 0) {
        setFailed(result.failed);
      } else {
        onOpenChange(false);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Couldn't copy these reports. Nothing was changed.");
      setProgress(null);
    } finally {
      setRunning(false);
    }
  };

  const percent = progress && progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy {sourceLabel}</DialogTitle>
          <DialogDescription>
            Makes a blank copy of every report in this substation under a new name.
            Nameplates and settings come along. Serial numbers, readings and results
            start blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
              New substation name
            </span>
            <Input
              autoFocus
              value={newName}
              disabled={progress !== null}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
              placeholder="e.g. TADG-PMDC-009"
            />
            {sameAsSource && (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
                Pick a different name than the one you're copying.
              </span>
            )}
            {alreadyThere > 0 && (
              <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                {trimmed} already has {alreadyThere} report{alreadyThere === 1 ? "" : "s"}.
                The copies will be added next to them.
              </span>
            )}
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Change equipment names
            </span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input
                value={find}
                disabled={progress !== null}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find"
                aria-label="Find in equipment names"
              />
              <span className="text-xs text-neutral-500">to</span>
              <Input
                value={replace}
                disabled={progress !== null}
                onChange={(e) => {
                  setReplace(e.target.value);
                  setReplaceEdited(true);
                }}
                placeholder="Replace with"
                aria-label="Replace with"
              />
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              {renamed.length === 0
                ? "No names will change. Leave it that way if the names don't include the lineup."
                : `${renamed.length} of ${plan.copyable.length} names will change, e.g.`}
            </p>
            {renamed.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                {renamed.slice(0, 3).map((r) => (
                  <li key={r.from} className="truncate">
                    <span className="text-neutral-400">{r.from}</span>
                    {" → "}
                    <span className="font-medium">{r.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-none border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-dark-200">
            <p className="text-neutral-800 dark:text-neutral-200">
              {plan.copyable.length} report{plan.copyable.length === 1 ? "" : "s"} will be
              copied. Folders inside come along too.
            </p>
            {plan.skipped.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {plan.skipped.length} can't be copied yet:{" "}
                {plan.skipped
                  .slice(0, 4)
                  .map((s) => s.name)
                  .join(", ")}
                {plan.skipped.length > 4 ? `, and ${plan.skipped.length - 4} more` : ""}.
              </p>
            )}
          </div>

          {progress && !finishedWithErrors && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-none bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full bg-brand transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-neutral-500">
                {progress.done < progress.total
                  ? `Copying ${progress.done} of ${progress.total}…`
                  : "Filing into folders…"}
              </p>
            </div>
          )}

          {finishedWithErrors && (
            <div className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <p>
                {failed.length} report{failed.length === 1 ? "" : "s"} couldn't be copied.
                The rest are done.
              </p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs">
                {failed.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    {f.name}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          {finishedWithErrors ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={running}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void run()}
                disabled={!canCopy}
                leftIcon={<Copy className="h-4 w-4" />}
              >
                {running
                  ? "Copying…"
                  : `Copy ${plan.copyable.length} report${plan.copyable.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
