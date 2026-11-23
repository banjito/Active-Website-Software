import { supabase } from "@/lib/supabase";
import { getViewAs } from "@/lib/viewAs";
import type { PermissionKey } from "@/lib/permissions";

/**
 * The signed-in person's permissions, shared by the whole app (Roles scope switch-over).
 *
 * - Loaded once per session from common.my_permissions(). RequireAuth waits for an
 *   answer before showing a page, so canNow() is right from the first render.
 * - The last answer is kept in this browser. The app opens with it at once (and
 *   offline), then swaps in the fresh answer when it arrives.
 * - A "View as" tab answers with the previewed role's ticks.
 *
 * Hides buttons only. The database checks the same permissions (common.can).
 * Kept free of React and AuthContext so roles.ts and services can import it.
 */

const STORE_PREFIX = "ampos.permissions.";
const TIMEOUT_MS = 6000;
const RETRY_AFTER_MS = 30_000;

let current: { userId: string; keys: Set<string>; fresh: boolean } | null = null;
let inflight: { userId: string; promise: Promise<void> } | null = null;
let lastFailure = 0;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  listeners.forEach((fn) => fn());
}

function readStored(userId: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + userId);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeStored(userId: string, keys: Set<string>): void {
  try {
    window.localStorage.setItem(STORE_PREFIX + userId, JSON.stringify([...keys]));
  } catch {
    // Storage blocked: the next visit just waits for the database.
  }
}

/** Start (or reuse) loading this person's permissions. Resolves once there's an answer to show. */
export function loadPermissionsFor(userId: string): Promise<void> {
  if (current?.userId === userId && current.fresh) return Promise.resolve();
  if (inflight?.userId === userId) return inflight.promise;

  const viewAs = getViewAs();
  if (viewAs) {
    current = { userId, keys: new Set(viewAs.permissions), fresh: true };
    changed();
    return Promise.resolve();
  }

  if (current?.userId !== userId) {
    const stored = readStored(userId);
    current = stored ? { userId, keys: stored, fresh: false } : null;
    changed();
  }
  // Offline or failing: don't ask again on every screen.
  if (current?.userId === userId && Date.now() - lastFailure < RETRY_AFTER_MS) return Promise.resolve();

  const request = supabase
    .schema("common")
    .rpc("my_permissions")
    .then(({ data, error }) => {
      if (error) throw error;
      const keys = new Set((data ?? []) as string[]);
      // Still the same person signed in?
      if (inflight?.userId === userId || current?.userId === userId) {
        current = { userId, keys, fresh: true };
        writeStored(userId, keys);
        changed();
      }
    });
  request.catch((err) => {
    lastFailure = Date.now();
    console.warn("Could not load permissions", err);
  });

  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, TIMEOUT_MS));
  const promise = Promise.race([request, timeout])
    .catch(() => undefined)
    .then(() => {
      // No answer at all: nothing is allowed until one arrives.
      if (current?.userId !== userId) {
        current = { userId, keys: new Set(), fresh: false };
        changed();
      }
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { userId, promise };
  return promise;
}

/** True once this person has an answer (fresh or remembered). */
export function permissionsReady(userId: string | null | undefined): boolean {
  return !!userId && current?.userId === userId;
}

/** The signed-in person has this permission. False until permissions load. */
export function canNow(key: PermissionKey): boolean {
  return !!current?.keys.has(key);
}

export function subscribePermissions(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function permissionsVersion(): number {
  return version;
}

/** Forget the loaded set, e.g. right after changing someone's own role. */
export function clearPermissionCache(): void {
  current = null;
  inflight = null;
  changed();
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") clearPermissionCache();
});
