/**
 * Job files (the "job-documents" storage bucket) are private. Saved rows still
 * hold the old public-style address (.../object/public/job-documents/<path>),
 * which no longer opens by itself. These helpers turn it into a short-lived
 * signed link at the moment someone views or opens the file.
 *
 * installJobFileLinks() runs once at startup (main.tsx) and covers the app:
 * - images, PDF frames and other media pointing at a job file get a signed
 *   address swapped in;
 * - links to a job file open a fresh signed link in a new tab, and their
 *   address becomes an ampOS link (/files/job/<path>), so a copied link asks
 *   for an ampOS login instead of failing.
 * Code that opens or downloads a file itself uses openFileUrl / resolveFileUrl.
 */
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";

export const JOB_FILES_BUCKET = "job-documents";
export const JOB_FILE_ROUTE = "/files/job/";
export const SHARE_LINK_DAYS = 7;

const PUBLIC_MARKER = `/storage/v1/object/public/${JOB_FILES_BUCKET}/`;
const SIGNED_MARKER = `/storage/v1/object/sign/${JOB_FILES_BUCKET}/`;
/** In-app viewing links last an hour; reuse one until 5 minutes before it ends. */
const VIEW_SECONDS = 60 * 60;
const REUSE_MARGIN_MS = 5 * 60 * 1000;
/** After a failed signing, leave that file alone for a minute (no retry loop). */
const FAILED_PAUSE_MS = 60 * 1000;
const SIGN_BATCH = 100;

// ── Addresses ────────────────────────────────────────────────────────────

function appRouteRest(url: string): string | null {
  if (url.startsWith(JOB_FILE_ROUTE)) return url.slice(JOB_FILE_ROUTE.length);
  const prefix = window.location.origin + JOB_FILE_ROUTE;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/** The file's path inside the bucket, or null when the address isn't a job file. */
export function jobFilePath(url: string | null | undefined): string | null {
  if (!url) return null;
  let rest = appRouteRest(url);
  if (rest === null) {
    const marker = url.includes(PUBLIC_MARKER)
      ? PUBLIC_MARKER
      : url.includes(SIGNED_MARKER)
        ? SIGNED_MARKER
        : null;
    if (!marker) return null;
    rest = url.slice(url.indexOf(marker) + marker.length);
  }
  rest = rest.split(/[?#]/)[0];
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** ampOS address for a job file: opens after login, for staff only. */
export function jobFileAppLink(path: string): string {
  return (
    window.location.origin +
    JOB_FILE_ROUTE +
    path.split("/").map(encodeURIComponent).join("/")
  );
}

// ── Signing (batched, cached) ────────────────────────────────────────────

type Waiter = (url: string | null) => void;
const cache = new Map<string, { url: string; expiresAt: number }>();
const failedAt = new Map<string, number>();
let queue = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function cachedLink(path: string): string | null {
  const hit = cache.get(path);
  return hit && hit.expiresAt - Date.now() > REUSE_MARGIN_MS ? hit.url : null;
}

function recentlyFailed(path: string): boolean {
  const at = failedAt.get(path);
  return at !== undefined && Date.now() - at < FAILED_PAUSE_MS;
}

/** Signed viewing link for a path in the bucket; null if the user can't open it. */
export function signJobFile(path: string): Promise<string | null> {
  const hit = cachedLink(path);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const waiters = queue.get(path);
    if (waiters) waiters.push(resolve);
    else queue.set(path, [resolve]);
    // A short wait lets a page full of photos go out as one request.
    if (!flushTimer) flushTimer = setTimeout(flush, 15);
  });
}

async function flush() {
  const batch = queue;
  queue = new Map();
  flushTimer = null;
  const paths = [...batch.keys()];
  for (let i = 0; i < paths.length; i += SIGN_BATCH) {
    const chunk = paths.slice(i, i + SIGN_BATCH);
    let rows: Array<{
      path?: string | null;
      signedUrl?: string | null;
      error?: string | null;
    }> = [];
    try {
      const { data, error } = await supabase.storage
        .from(JOB_FILES_BUCKET)
        .createSignedUrls(chunk, VIEW_SECONDS);
      if (error) console.warn("Could not make job file links:", error.message);
      rows = data ?? [];
    } catch (err) {
      console.warn("Could not make job file links:", err);
    }
    const expiresAt = Date.now() + VIEW_SECONDS * 1000;
    chunk.forEach((path, idx) => {
      const row = rows.find((r) => r.path === path) ?? rows[idx];
      const url = row && !row.error && row.signedUrl ? row.signedUrl : null;
      if (url) {
        cache.set(path, { url, expiresAt });
        failedAt.delete(path);
      } else {
        failedAt.set(path, Date.now());
      }
      batch.get(path)?.forEach((resolve) => resolve(url));
    });
  }
}

/** Any stored address → one that loads now. Non-job-file addresses come back unchanged. */
export async function resolveFileUrl(url: string): Promise<string> {
  const path = jobFilePath(url);
  if (!path) return url;
  return (await signJobFile(path)) ?? url;
}

function cantOpen() {
  toast({
    title: "Couldn't open this file",
    description: "You may not have access to it, or it was deleted.",
    variant: "destructive",
  });
}

/** Open a stored file address in a new tab (signs job files first). */
export function openFileUrl(url: string | null | undefined): void {
  if (!url) return;
  const path = jobFilePath(url);
  if (!path) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const ready = cachedLink(path);
  if (ready) {
    window.open(ready, "_blank", "noopener");
    return;
  }
  // Open the tab during the click so pop-up blockers allow it, then point it at the file.
  const tab = window.open("", "_blank");
  void signJobFile(path).then((signed) => {
    if (!signed) {
      tab?.close();
      cantOpen();
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = signed;
    } else {
      window.open(signed, "_blank", "noopener");
    }
  });
}

// ── Share link for people outside ampOS ──────────────────────────────────

/** Make a 7-day link to a job file, log who made it, and copy it. */
export async function copyJobFileShareLink(
  url: string,
  opts: { jobId?: string | null; name?: string | null } = {},
): Promise<void> {
  try {
    const path = jobFilePath(url);
    if (!path) throw new Error("This file can't be shared with a link.");
    const seconds = SHARE_LINK_DAYS * 24 * 60 * 60;
    const { data, error } = await supabase.storage
      .from(JOB_FILES_BUCKET)
      .createSignedUrl(path, seconds);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Could not make a share link.");
    }
    const { error: logError } = await supabase
      .schema("common")
      .from("file_share_links")
      .insert({
        bucket: JOB_FILES_BUCKET,
        path,
        file_name: opts.name ?? null,
        job_id: opts.jobId ?? null,
        expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
      });
    if (logError) {
      throw new Error(`Could not record the share link: ${logError.message}`);
    }

    let copied = false;
    try {
      await navigator.clipboard.writeText(data.signedUrl);
      copied = true;
    } catch {
      /* some browsers block copying after a wait; show the link instead */
    }
    toast({
      title: copied ? "Share link copied" : "Share link ready",
      description: copied
        ? `Anyone with it can open this file for ${SHARE_LINK_DAYS} days.`
        : `Copy it from here. Works for ${SHARE_LINK_DAYS} days: ${data.signedUrl}`,
      variant: "success",
      persistent: !copied,
    });
  } catch (err) {
    toast({
      title: "Couldn't make a share link",
      description: err instanceof Error ? err.message : String(err),
      variant: "destructive",
    });
  }
}

// ── App-wide coverage ────────────────────────────────────────────────────

const BLANK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const MEDIA_ATTR: Record<string, string> = {
  IMG: "src",
  IFRAME: "src",
  EMBED: "src",
  VIDEO: "src",
  AUDIO: "src",
  SOURCE: "src",
  OBJECT: "data",
};
const WATCHED =
  "a[href],img[src],iframe[src],embed[src],video[src],audio[src],source[src],object[data]";

function fixElement(el: Element) {
  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    if (!href || !href.includes(PUBLIC_MARKER)) return;
    const path = jobFilePath(href);
    if (path) el.setAttribute("href", jobFileAppLink(path));
    return;
  }
  const attr = MEDIA_ATTR[el.tagName];
  if (!attr) return;
  const value = el.getAttribute(attr);
  if (!value || !value.includes(PUBLIC_MARKER)) return;
  const path = jobFilePath(value);
  if (!path || recentlyFailed(path)) return;
  const ready = cachedLink(path);
  if (ready) {
    el.setAttribute(attr, ready);
    return;
  }
  // Hold a blank in place so the browser doesn't try the old public address
  // (and fire "broken image" handlers) while the link is made.
  const holder =
    el.tagName === "IMG" ? BLANK_IMAGE : el.tagName === "IFRAME" ? "about:blank" : null;
  if (holder) el.setAttribute(attr, holder);
  void signJobFile(path).then((signed) => {
    const now = el.getAttribute(attr);
    // The page pointed this element somewhere else meanwhile: leave it.
    if (now !== value && now !== holder) return;
    el.setAttribute(attr, signed ?? value);
  });
}

function onLinkClick(e: MouseEvent) {
  if (e.button > 1) return;
  const target = e.target as Element | null;
  const link = target?.closest?.("a[href]");
  if (!link) return;
  const href = link.getAttribute("href");
  if (!jobFilePath(href)) return;
  e.preventDefault();
  openFileUrl(href);
}

let installed = false;

export function installJobFileLinks(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const scan = (root: ParentNode) =>
    root.querySelectorAll(WATCHED).forEach(fixElement);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes") {
        fixElement(m.target as Element);
        continue;
      }
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as Element;
        if (el.matches(WATCHED)) fixElement(el);
        if (el.firstElementChild) scan(el);
      });
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "href", "data"],
  });
  scan(document);
  document.addEventListener("click", onLinkClick, true);
  document.addEventListener("auxclick", onLinkClick, true);
}
