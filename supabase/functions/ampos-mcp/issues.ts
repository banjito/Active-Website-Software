// Issues & feature requests: what people send from the in-app reporter, shown on
// the Features & Fixes page (common.issue_reports + updates, comments, files).
// Read-only. Runs as the signed-in person, so row security decides what they see.

import { APP_URL, clampLimit, cleanSearch, profileNames, type Row, str } from "./lib.ts";
import type { Tool } from "./tools.ts";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const OPEN_STATUSES = ["open", "in_progress", "paused"];
const DONE_STATUSES = ["resolved", "closed", "duplicate", "wontfix"];
const ALL_STATUSES = [...OPEN_STATUSES, ...DONE_STATUSES];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
const fail = (what: string, error: any): never => {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
};

const typeLabel = (t: unknown) => (t === "feature_request" ? "feature request" : "issue");
const day = (ts: unknown) => (typeof ts === "string" ? ts.slice(0, 10) : null);
const short = (s: unknown, max: number) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
/** Page the report was sent from, without the site address. */
const pagePath = (url: unknown) => {
  const s = str(url);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.pathname + u.search;
  } catch {
    return s;
  }
};
const fileName = (path: unknown) => str(path).split("/").pop() || undefined;
const PAGE_LINK = APP_URL ? `${APP_URL}/features-fixes` : undefined;

function statusFilter(v: unknown): string[] {
  const s = str(v) || "open";
  if (s === "open") return OPEN_STATUSES;
  if (s === "done") return DONE_STATUSES;
  if (s === "all") return ALL_STATUSES;
  if (ALL_STATUSES.includes(s)) return [s];
  throw new Error(`Unknown status "${s}". Use open, done, all, or one of: ${ALL_STATUSES.join(", ")}.`);
}

export const ISSUE_TOOLS: Tool[] = [
  {
    name: "list_issues",
    title: "List issues and feature requests",
    description:
      "Bug reports and feature requests people sent from ampOS (the Features & Fixes page). " +
      "Defaults to open ones (open, in progress, paused), newest first. Each has an id for get_issue.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["all", "issue", "feature_request"],
          default: "all",
          description: "issue = something broken; feature_request = something new wanted.",
        },
        status: {
          type: "string",
          default: "open",
          description:
            "open (open + in_progress + paused), done (resolved + closed + duplicate + wontfix), all, " +
            "or one exact status.",
        },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        search: { type: "string", description: "Words in the title or description." },
        since: { type: "string", description: "Only ones sent on or after YYYY-MM-DD." },
        limit: { type: "number", default: 50, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const statuses = statusFilter(args.status);
      const limit = clampLimit(args.limit, 50, 100);
      const type = str(args.type);
      const since = /^\d{4}-\d{2}-\d{2}$/.test(str(args.since)) ? str(args.since) : null;
      const search = cleanSearch(args.search);

      let q = ctx.supabase
        .schema("common")
        .from("issue_reports")
        .select("id, title, description, status, priority, type, reporter_id, page_url, created_at, updated_at, resolved_at", {
          count: "exact",
        })
        .in("status", statuses);
      if (type === "issue" || type === "feature_request") q = q.eq("type", type);
      if (str(args.priority)) q = q.eq("priority", str(args.priority));
      if (since) q = q.gte("created_at", since);
      if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      const { data, error, count } = await q.order("created_at", { ascending: false }).limit(limit);
      if (error) fail("Couldn't read issues", error);
      const rows = (data ?? []) as Row[];
      const ids = rows.map((r) => r.id);

      const [people, updatesRes, notesRes] = await Promise.all([
        profileNames(ctx, rows.map((r) => r.reporter_id)),
        ids.length
          ? ctx.supabase.schema("common").from("issue_updates").select("issue_id, note, new_status, created_at").in("issue_id", ids).order("created_at")
          : Promise.resolve({ data: [] as Row[] }),
        ids.length
          ? ctx.supabase.schema("common").from("issue_notes").select("issue_id").in("issue_id", ids).is("deleted_at", null)
          : Promise.resolve({ data: [] as Row[] }),
      ]);
      const lastUpdate: Record<string, Row> = {};
      for (const u of (updatesRes.data ?? []) as Row[]) lastUpdate[u.issue_id] = u;
      const comments: Record<string, number> = {};
      for (const n of (notesRes.data ?? []) as Row[]) comments[n.issue_id] = (comments[n.issue_id] ?? 0) + 1;

      return {
        total_matching: count ?? rows.length,
        showing: rows.length,
        page: PAGE_LINK,
        issues: rows.map((r) => {
          const u = lastUpdate[r.id];
          return {
            id: r.id,
            type: typeLabel(r.type),
            title: r.title,
            status: r.status,
            priority: r.priority,
            sent_by: people[r.reporter_id] ?? undefined,
            sent: day(r.created_at),
            resolved: day(r.resolved_at) ?? undefined,
            from_page: pagePath(r.page_url),
            description: short(r.description, 400),
            comments: comments[r.id] || undefined,
            last_update: u ? { date: day(u.created_at), status: u.new_status ?? undefined, note: short(u.note, 200) } : undefined,
          };
        }),
      };
    },
  },
  {
    name: "get_issue",
    title: "Get one issue or feature request",
    description:
      "Full detail on one issue or feature request: description, status history, comments, " +
      "attached file names, and who is following it. Use the id from list_issues.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Issue id from list_issues." } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const id = str(args.id);
      if (!UUID.test(id)) throw new Error("Give the issue id from list_issues.");
      const { data: issue, error } = await ctx.supabase.schema("common").from("issue_reports").select("*").eq("id", id).maybeSingle();
      if (error) fail("Couldn't read the issue", error);
      if (!issue) throw new Error("No issue with that id, or you can't see it.");

      const [updatesRes, notesRes, filesRes, followersRes] = await Promise.all([
        ctx.supabase.schema("common").from("issue_updates").select("updater_id, note, new_status, created_at").eq("issue_id", id).order("created_at"),
        ctx.supabase.schema("common").from("issue_notes").select("user_id, content, created_at").eq("issue_id", id).is("deleted_at", null).order("created_at"),
        ctx.supabase.schema("common").from("issue_attachments").select("file_path, created_at").eq("issue_id", id).order("created_at"),
        ctx.supabase.schema("common").from("issue_interested_parties").select("user_id").eq("issue_id", id),
      ]);
      const updates = (updatesRes.data ?? []) as Row[];
      const notes = (notesRes.data ?? []) as Row[];
      const followers = (followersRes.data ?? []) as Row[];
      const people = await profileNames(ctx, [
        issue.reporter_id,
        ...updates.map((u) => u.updater_id),
        ...notes.map((n) => n.user_id),
        ...followers.map((f) => f.user_id),
      ]);

      return {
        id: issue.id,
        type: typeLabel(issue.type),
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        sent_by: people[issue.reporter_id] ?? undefined,
        sent: issue.created_at,
        started: issue.started_at ?? undefined,
        resolved: issue.resolved_at ?? undefined,
        from_page: pagePath(issue.page_url),
        description: issue.description ?? undefined,
        status_history: updates.map((u) => ({
          date: u.created_at,
          by: people[u.updater_id] ?? undefined,
          status: u.new_status ?? undefined,
          note: u.note ?? undefined,
        })),
        comments: notes.map((n) => ({ date: n.created_at, by: people[n.user_id] ?? undefined, text: n.content })),
        attachments: ((filesRes.data ?? []) as Row[]).map((f) => fileName(f.file_path)).filter(Boolean),
        following: followers.map((f) => people[f.user_id]).filter(Boolean),
        page: PAGE_LINK,
      };
    },
  },
];
