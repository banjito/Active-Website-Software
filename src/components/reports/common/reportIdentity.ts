/**
 * Which row a report writes to.
 *
 * Auto-save creates the report row the first time it fires, then updates that
 * row forever after. The id it learned lived only in a ref, and the URL it
 * wrote with `history.replaceState` is invisible to react-router's `useParams`.
 * So anything that lost that ref -- a re-mount, a stale closure, two auto-saves
 * racing -- came up with "no report yet" and inserted a *second* copy of the
 * same panel. Technicians saw one report they had filled in appear on the job
 * five and six times over.
 *
 * Two rules keep a report to one row:
 *
 *  1. `reportIdFromUrl()` -- recover the id from the address bar, which is the
 *     one place it is always written down.
 *  2. `newReportId()` -- when there really is no report yet, mint the id on the
 *     client *before* the request goes out and `upsert` on it. Whoever gets
 *     there second overwrites the same row instead of adding one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The report id in the current address bar, if there is one. Report routes end
 * in `/<uuid>`; the "new report" route ends in the slug and returns undefined.
 */
export function reportIdFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const last = window.location.pathname.split("/").filter(Boolean).pop() || "";
  return UUID.test(last) ? last : undefined;
}

/** A fresh report id, claimed client-side so a save can be idempotent. */
export function newReportId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();

  // Older WebViews (some jobsite tablets) have getRandomValues but not
  // randomUUID. Same v4 layout, built by hand.
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default reportIdFromUrl;
