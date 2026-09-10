import { useEffect, useState } from "react";
import {
  BUILTIN_DIVISIONS,
  type Division,
  fetchDivisions,
} from "@/services/divisionsService";

/**
 * Every active division from common.divisions, shared across components so a
 * page with several dropdowns makes one request. Seeded with the built-in list
 * so the first paint is never empty.
 */

let cached: Promise<Division[]> | null = null;
let latest: Division[] | null = null;
const listeners = new Set<(divisions: Division[]) => void>();

function load(): Promise<Division[]> {
  cached = fetchDivisions().then((divisions) => {
    latest = divisions;
    return divisions;
  });
  return cached;
}

/** The shared list outside React, e.g. inside a fetch that filters by division. */
export function getDivisions(): Promise<Division[]> {
  return cached ?? load();
}

/**
 * The last list loaded, or the built-in one if none has loaded yet. For
 * synchronous code that can't wait on getDivisions().
 */
export function peekDivisions(): Division[] {
  return latest ?? BUILTIN_DIVISIONS;
}

/** Refetch after a division is added, and push the result to every mounted hook. */
export function refreshDivisionsCache(): void {
  void load().then((divisions) => listeners.forEach((fn) => fn(divisions)));
}

export function useDivisions(): Division[] {
  const [divisions, setDivisions] = useState<Division[]>(peekDivisions);

  useEffect(() => {
    let alive = true;
    void getDivisions().then((d) => alive && setDivisions(d));
    listeners.add(setDivisions);
    return () => {
      alive = false;
      listeners.delete(setDivisions);
    };
  }, []);

  return divisions;
}
