import { useEffect, useRef, useState } from "react";

/**
 * useState that survives a page reload.
 *
 * Backed by sessionStorage on purpose: list filters should still be there after a refresh
 * or a back-navigation, but shouldn't silently follow you into next week's session and
 * leave you wondering why half your assets are missing.
 *
 * A null/undefined `key` disables persistence, so a caller can opt out per instance.
 */
export function usePersistentState<T>(
  key: string | null | undefined,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = key ? `amp:${key}` : null;

  const [value, setValue] = useState<T>(() => {
    if (!storageKey || typeof window === "undefined") return initialValue;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      return raw === null ? initialValue : (JSON.parse(raw) as T);
    } catch {
      // Private-mode storage or a value written by an older shape of this state.
      return initialValue;
    }
  });

  // Re-read when the key changes (e.g. switching to another job's asset list).
  const previousKey = useRef(storageKey);
  useEffect(() => {
    if (previousKey.current === storageKey) return;
    previousKey.current = storageKey;
    if (!storageKey) return;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      setValue(raw === null ? initialValue : (JSON.parse(raw) as T));
    } catch {
      setValue(initialValue);
    }
    // initialValue is intentionally not a dependency — it's the fallback, not the source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Storage full or blocked — the state still works for this page view.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

export default usePersistentState;
