import { useState, useCallback } from "react";

/**
 * Shared hook for the "Save" → "Saved" button pattern.
 *
 * Usage:
 *   const { justSaved, markSaved, markEdited } = useSaveIndicator();
 *
 *   // In change handlers: markEdited();
 *   // In handleSave after success: markSaved();
 *   // Button: {justSaved ? "Saved" : "Save"}
 */
export function useSaveIndicator() {
  const [justSaved, setJustSaved] = useState(false);

  const markSaved = useCallback(() => setJustSaved(true), []);
  const markEdited = useCallback(() => setJustSaved(false), []);

  return { justSaved, markSaved, markEdited };
}
