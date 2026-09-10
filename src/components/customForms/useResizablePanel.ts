/**
 * A drag-to-resize width for a right-hand panel.
 *
 * The section editor holds a grid that is wider than the default panel, so it
 * needs to be widened rather than scrolled sideways. The chosen width is kept
 * in localStorage: resizing a panel every time you open it is the kind of
 * small friction that makes a tool feel unfinished.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ResizablePanelOptions {
  /** Distinguishes one panel's remembered width from another's. */
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  /** Cap as a share of the window, so the panel can never swallow the canvas. */
  maxViewportFraction?: number;
}

function readStored(key: string, fallback: number): number {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    // Private windows and blocked site data both throw here.
    return fallback;
  }
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth = 320,
  maxViewportFraction = 0.8,
}: ResizablePanelOptions) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    setWidth(readStored(storageKey, defaultWidth));
  }, [storageKey, defaultWidth]);

  const clamp = useCallback(
    (value: number) => {
      const max = Math.max(minWidth, window.innerWidth * maxViewportFraction);
      return Math.round(Math.min(max, Math.max(minWidth, value)));
    },
    [minWidth, maxViewportFraction],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (event: PointerEvent) => {
      // The panel is on the right, so its width grows as the pointer moves left.
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() =>
        setWidth(clamp(window.innerWidth - event.clientX)),
      );
    };
    const onUp = () => setIsResizing(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // Stop the drag selecting text across the page.
    const previousSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = previousSelect;
      document.body.style.cursor = previousCursor;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [isResizing, clamp]);

  useEffect(() => {
    if (isResizing) return;
    try {
      window.localStorage.setItem(storageKey, String(width));
    } catch {
      // Not being able to remember the width is not worth an error.
    }
  }, [isResizing, width, storageKey]);

  // Keep the panel sensible when the window shrinks under it.
  useEffect(() => {
    const onResize = () => setWidth((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  /** Keyboard resizing, so the panel is not mouse-only. */
  const onHandleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 64 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidth((current) => clamp(current + step));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidth((current) => clamp(current - step));
      } else if (event.key === "Home") {
        event.preventDefault();
        setWidth(clamp(defaultWidth));
      }
    },
    [clamp, defaultWidth],
  );

  return {
    width,
    isResizing,
    startResize: () => setIsResizing(true),
    onHandleKeyDown,
    resetWidth: () => setWidth(clamp(defaultWidth)),
  };
}
