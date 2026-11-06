import { useCallback, useEffect, useRef, useState } from "react";
import { diffContents, hasChanges, type DiagramChanges } from "@/lib/diagrams/editing";
import type { DiagramAsset, DiagramContents } from "@/lib/types/siteDiagrams";

/** Long enough that a burst of edits saves once, short enough that little is ever at risk. */
const SAVE_DELAY_MS = 600;
const HISTORY_LIMIT = 100;

export type SaveStatus = "saved" | "saving" | "failed";

/**
 * Holds one diagram while it's being edited.
 *
 * Saving works from versions, not actions: it writes whatever differs between the last
 * version that reached the database and the newest one. That makes undo free, keeps a
 * burst of edits to one write, and means a failed save is simply retried in full.
 */
export function useDiagramEditor(
  initial: DiagramContents,
  save: (changes: DiagramChanges) => Promise<void>,
) {
  const [contents, setContents] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  const latest = useRef(initial);
  const saved = useRef(initial);
  const past = useRef<DiagramContents[]>([]);
  const future = useRef<DiagramContents[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  /** Saves until the database matches the newest version, or a write fails. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (running.current) return running.current;

    const run = async () => {
      while (saved.current !== latest.current) {
        const target = latest.current;
        const changes = diffContents(saved.current, target);
        if (hasChanges(changes)) {
          setStatus("saving");
          try {
            await saveRef.current(changes);
          } catch (error) {
            console.error("Failed to save diagram:", error);
            setStatus("failed");
            return;
          }
        }
        saved.current = target;
      }
      setStatus("saved");
    };

    running.current = run().finally(() => {
      running.current = null;
    });
    return running.current;
  }, []);

  const show = useCallback(
    (next: DiagramContents) => {
      latest.current = next;
      setContents(next);
      setHistory({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  /** Applies one edit. An edit that returns the same version changes nothing. */
  const apply = useCallback(
    (edit: (current: DiagramContents) => DiagramContents) => {
      const current = latest.current;
      const next = edit(current);
      if (next === current) return;
      past.current = [...past.current, current].slice(-HISTORY_LIMIT);
      future.current = [];
      show(next);
    },
    [show],
  );

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, latest.current];
    show(previous);
  }, [show]);

  const redo = useCallback(() => {
    const next = future.current[future.current.length - 1];
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, latest.current];
    show(next);
  }, [show]);

  /**
   * Shows an asset's latest name and type. It isn't an edit to the diagram, so it adds no
   * undo step and saves nothing, but undoing must not bring the old name back either.
   */
  const refreshAsset = useCallback((asset: DiagramAsset) => {
    const update = (version: DiagramContents): DiagramContents => ({
      ...version,
      symbols: version.symbols.map((symbol) =>
        symbol.asset_id === asset.id ? { ...symbol, asset } : symbol,
      ),
    });
    const wasSaved = saved.current === latest.current;
    past.current = past.current.map(update);
    future.current = future.current.map(update);
    latest.current = update(latest.current);
    saved.current = wasSaved ? latest.current : update(saved.current);
    setContents(latest.current);
  }, []);

  /**
   * Shows one asset in place of another after a replacement. The database has already made
   * the change, so like a rename this saves nothing and isn't an undo step.
   */
  const swapAsset = useCallback((oldAssetId: string, asset: DiagramAsset) => {
    const update = (version: DiagramContents): DiagramContents => ({
      ...version,
      symbols: version.symbols.map((symbol) =>
        symbol.asset_id === oldAssetId ? { ...symbol, asset_id: asset.id, asset } : symbol,
      ),
    });
    const wasSaved = saved.current === latest.current;
    past.current = past.current.map(update);
    future.current = future.current.map(update);
    latest.current = update(latest.current);
    saved.current = wasSaved ? latest.current : update(saved.current);
    setContents(latest.current);
  }, []);

  // Leaving this diagram for another one must not lose the last edit.
  useEffect(() => () => void flush(), [flush]);

  // Closing the tab can't wait for a save, so the browser asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saved.current !== latest.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const getContents = useCallback(() => latest.current, []);

  return {
    contents,
    status,
    ...history,
    apply,
    undo,
    redo,
    flush,
    refreshAsset,
    swapAsset,
    getContents,
  };
}
