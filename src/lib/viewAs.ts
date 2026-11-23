/**
 * "View as" (Roles scope item 4): see ampOS the way a role sees it, in its own tab.
 *
 * - Started from Admin → Roles & permissions → Roles → "View as". Opens a new tab;
 *   the tab you came from (and any unsaved ticks) stays as it was.
 * - In that tab: permission checks (useCan), the old role-name checks
 *   (user_metadata.role via useAuth) and Super Admin all answer as the role.
 * - Read-only. The database refuses every save from this tab (the request header
 *   below turns on common.view_as_pre_request, permissions_09_view_as.sql). This
 *   file also refuses uploads, edge functions (emails, QuickBooks) and account
 *   changes before they leave the browser.
 * - Data still loads with your own database access: it previews screens and
 *   menus, not data rules.
 *
 * Kept free of React and of the Supabase client: supabase.ts imports this.
 */

export interface ViewAs {
  roleKey: string;
  label: string;
  /** Role name screens show (user_metadata.role). */
  legacyRole: string;
  /** Permission keys switched on for the preview (includes unsaved ticks). */
  permissions: string[];
  /** True when the preview includes ticks that weren't saved yet. */
  unsaved: boolean;
}

export const VIEW_AS_HEADER = "x-ampos-view-as";
const SESSION_KEY = "ampos.viewAs";
const HANDOFF_PREFIX = "ampos.viewAs.handoff.";
const PARAM = "view_as";
const READ_ONLY_MESSAGE = "View as is read-only. Nothing was saved.";

function readSession(): ViewAs | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ViewAs) : null;
  } catch {
    return null;
  }
}

/** A tab opened by startViewAs picks up its role from a one-time hand-off. */
function claimHandoff(): void {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(PARAM);
    if (!id) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const raw = window.localStorage.getItem(HANDOFF_PREFIX + id);
    window.localStorage.removeItem(HANDOFF_PREFIX + id);
    if (raw) window.sessionStorage.setItem(SESSION_KEY, raw);
  } catch {
    // Storage blocked: the tab opens as yourself.
  }
}

let active: ViewAs | null = null;
if (typeof window !== "undefined") {
  claimHandoff();
  active = readSession();
}

/** The role this tab is previewing, or null. Fixed for the life of the page. */
export function getViewAs(): ViewAs | null {
  return active;
}

/** Opens a new tab previewing the role. False when the browser blocked the tab. */
export function startViewAs(v: ViewAs): boolean {
  const id = crypto.randomUUID();
  try {
    window.localStorage.setItem(HANDOFF_PREFIX + id, JSON.stringify(v));
  } catch {
    return false;
  }
  const tab = window.open(`/portal?${PARAM}=${id}`, "_blank");
  if (!tab) {
    try {
      window.localStorage.removeItem(HANDOFF_PREFIX + id);
    } catch {
      /* nothing to clean */
    }
    return false;
  }
  return true;
}

/** Ends the preview: closes the tab, or reloads it as yourself if the browser won't. */
export function stopViewAs(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* page reload below still ends it if storage is blocked */
  }
  window.close();
  window.setTimeout(() => window.location.assign("/portal"), 200);
}

// ── Read-only guard for the Supabase client ───────────────────────────────

function allowed(path: string, method: string): boolean {
  const read = method === "GET" || method === "HEAD" || method === "OPTIONS";
  // Database: reads, and functions (the database itself refuses any that save).
  if (path.includes("/rest/v1/")) return read || path.includes("/rest/v1/rpc/");
  // Files: open, list and signed links only.
  if (path.includes("/storage/v1/")) return read || /\/object\/(sign|list|info)(\/|$)/.test(path);
  // Login: keep the session alive, allow sign out; nothing else.
  if (path.includes("/auth/v1/")) return read || /\/auth\/v1\/(token|logout)(\/|$|\?)/.test(path);
  // Edge functions send emails and talk to QuickBooks: none in a preview.
  if (path.includes("/functions/v1/")) return false;
  return true;
}

function refuse(): Promise<Response> {
  const body = JSON.stringify({
    message: READ_ONLY_MESSAGE,
    error: READ_ONLY_MESSAGE,
    msg: READ_ONLY_MESSAGE,
    code: "VIEW_AS_READ_ONLY",
  });
  return Promise.resolve(
    new Response(body, { status: 403, headers: { "Content-Type": "application/json" } }),
  );
}

/** fetch for the Supabase client: unchanged normally, read-only in a View as tab. */
export const viewAsFetch: typeof fetch = (input, init) => {
  if (!active) return fetch(input, init);
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  let path = url;
  try {
    path = new URL(url, window.location.origin).pathname;
  } catch {
    /* use the raw address */
  }
  if (!allowed(path, method)) return refuse();
  if (!path.includes("/rest/v1/")) return fetch(input, init);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set(VIEW_AS_HEADER, active.roleKey);
  return fetch(input, { ...init, headers });
};
