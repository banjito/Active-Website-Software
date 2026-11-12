// Office pack: Change Orders, sales pipeline, quotes, RFIs, schedule.
// Read-only. Sales tools carry `allowed`, so people without the app's Sales
// portal never see them (see access.ts). Estimates live in estimates.ts.
//
// Prices: use opportunities.quoted_amount (what the app recorded as quoted).
// Estimate JSON totals (grandTotal etc.) are NOT the price; estimates.ts prices
// estimates with the app's own math (_shared/estimateMath.ts).

import { canUseSales } from "./access.ts";
import {
  clampLimit,
  cleanSearch,
  customerNames,
  profileNames,
  resolveJob,
  type Row,
  str,
  trimDeep,
} from "./lib.ts";
import type { Tool } from "./tools.ts";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const salesOnly = (ctx: { user: Parameters<typeof canUseSales>[0] }) => canUseSales(ctx.user);

const OPEN_SALES_STATUSES = ["awareness", "quote", "decision", "decision - forecasted win"];

// deno-lint-ignore no-explicit-any
const fail = (what: string, error: any): never => {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
};

const isoDate = (v: unknown): string | null => {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const addDays = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export async function resolveOpportunity(ctx: Parameters<Tool["run"]>[1], args: Row): Promise<Row> {
  const id = str(args.opportunity_id);
  const quote = str(args.quote_number);
  if (!id && !quote) throw new Error("Give a quote_number or an opportunity_id.");
  const base = ctx.supabase.schema("business").from("opportunities").select("*");
  const { data, error } = await (id ? base.eq("id", id) : base.eq("quote_number", quote)).limit(1);
  if (error) fail("Couldn't look up the opportunity", error);
  if (!data?.length) throw new Error(`No opportunity ${quote || id} found, or your account can't see it.`);
  return data[0] as Row;
}

const OPP_SUMMARY_COLUMNS =
  "id, quote_number, title, status, customer_id, quoted_amount, expected_value, probability, sales_person, " +
  "amp_division, opportunity_type, proposal_due_date, awarded_date, lost_reason_category, lost_reason, lost_at, " +
  "job_id, created_at, updated_at";

export const OFFICE_TOOLS: Tool[] = [
  // ---------------------------------------------------------- change orders
  {
    name: "list_change_orders",
    title: "List Change Orders",
    description:
      "Change Orders on a job (or across jobs): number, title, amount, status, who requested and " +
      "approved it, schedule impact. Approved Change Orders add to the contract; pending ones don't " +
      "count yet. Always say 'Change Order', not 'CO'.",
    inputSchema: {
      type: "object",
      properties: {
        job_number: { type: "string" },
        job_id: { type: "string" },
        status: { type: "string", description: "Optional status filter, like approved or pending." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      let q = ctx.supabase
        .schema("neta_ops")
        .from("job_change_orders")
        .select(
          "job_id, co_number, title, description, amount, status, requested_by, requested_date, approved_date, " +
            "approved_by_name, approval_method, schedule_impact_days, outside_contract, work_started_on, created_at",
        );
      let job: Row | null = null;
      if (str(args.job_number) || str(args.job_id)) {
        job = await resolveJob(ctx, args);
        q = q.eq("job_id", job.id);
      }
      if (str(args.status)) q = q.eq("status", str(args.status));
      const { data, error } = await q.order("created_at", { ascending: false }).limit(clampLimit(args.limit, 50, 100));
      if (error) fail("Couldn't read Change Orders", error);
      const rows = (data ?? []) as Row[];
      const jobNums: Record<string, string> = {};
      if (!job && rows.length) {
        const { data: jobs } = await ctx.supabase
          .schema("neta_ops")
          .from("jobs")
          .select("id, job_number")
          .in("id", [...new Set(rows.map((r) => r.job_id))]);
        for (const j of jobs ?? []) jobNums[j.id] = j.job_number;
      }
      const sum = (s: string) => rows.filter((r) => r.status === s).reduce((t, r) => t + Number(r.amount ?? 0), 0);
      return {
        ...(job ? { job_number: job.job_number, job_title: job.title } : {}),
        count: rows.length,
        approved_total: sum("approved"),
        pending_total: sum("pending"),
        change_orders: rows.map((r) => ({
          job_number: job ? job.job_number : jobNums[r.job_id] ?? null,
          number: r.co_number,
          ...(trimDeep({ ...r, job_id: undefined, co_number: undefined }) as Row),
        })),
      };
    },
  },

  // ------------------------------------------------------------------ sales
  {
    name: "find_opportunities",
    title: "Find sales opportunities and quotes",
    description:
      "Searches sales opportunities (quotes) by title or quote number, customer, salesperson, status, " +
      "or proposals due soon. Statuses: awareness, quote, decision, decision - forecasted win, awarded, " +
      "lost, no quote. quoted_amount is the price we quoted.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words from the title, or a quote number." },
        customer: { type: "string", description: "Words from the customer name." },
        sales_person: { type: "string", description: "Salesperson name (partial match)." },
        status: { type: "string", description: "One status, or 'open' for awareness/quote/decision." },
        proposal_due_within_days: { type: "integer", minimum: 0, maximum: 365, description: "Only proposals due from today through this many days out." },
        since: { type: "string", description: "Only opportunities created on or after this date (YYYY-MM-DD)." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    allowed: salesOnly,
    async run(args, ctx) {
      let q = ctx.supabase.schema("business").from("opportunities").select(OPP_SUMMARY_COLUMNS);
      const text = cleanSearch(args.query);
      if (text) q = q.or(`title.ilike.%${text}%,quote_number.ilike.%${text}%`);
      const customer = cleanSearch(args.customer);
      if (customer) {
        const { data: cs } = await ctx.supabase
          .schema("common")
          .from("customers")
          .select("id")
          .or(`name.ilike.%${customer}%,company_name.ilike.%${customer}%`)
          .limit(50);
        const ids = (cs ?? []).map((c: Row) => c.id);
        if (!ids.length) return { count: 0, opportunities: [], note: `No customer matching "${customer}".` };
        q = q.in("customer_id", ids);
      }
      const person = cleanSearch(args.sales_person);
      if (person) q = q.ilike("sales_person", `%${person}%`);
      const status = str(args.status);
      if (status === "open") q = q.in("status", OPEN_SALES_STATUSES);
      else if (status) q = q.eq("status", status);
      if (typeof args.proposal_due_within_days === "number") {
        q = q.gte("proposal_due_date", addDays(0)).lte("proposal_due_date", addDays(args.proposal_due_within_days));
      }
      const since = isoDate(args.since);
      if (since) q = q.gte("created_at", since);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(clampLimit(args.limit, 25, 100));
      if (error) fail("Opportunity search failed", error);
      const rows = (data ?? []) as Row[];
      const customers = await customerNames(ctx, rows.map((r) => r.customer_id));
      return {
        count: rows.length,
        opportunities: rows.map((r) => ({
          customer: customers[r.customer_id] ?? null,
          ...(trimDeep({ ...r, customer_id: undefined }) as Row),
        })),
      };
    },
  },
  {
    name: "get_opportunity",
    title: "Opportunity details",
    description:
      "One opportunity (quote) in full: customer, amounts, dates, status and lost reason, plus its " +
      "notes, RFIs, estimates, and linked job. Look up by quote_number or opportunity_id.",
    inputSchema: {
      type: "object",
      properties: {
        quote_number: { type: "string" },
        opportunity_id: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    allowed: salesOnly,
    async run(args, ctx) {
      const opp = await resolveOpportunity(ctx, args);
      const [notesRes, rfisRes, estRes, customers, job] = await Promise.all([
        ctx.supabase
          .schema("business")
          .from("opportunity_notes")
          .select("content, user_id, created_at, attachment_name")
          .eq("opportunity_id", opp.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(30),
        ctx.supabase
          .schema("business")
          .from("opportunity_rfis")
          .select("number, question, spec_ref, response, date_added, date_answered, created_by_name")
          .eq("opportunity_id", opp.id)
          .order("number"),
        ctx.supabase
          .schema("business")
          .from("estimates")
          .select("id, quote_number, status, created_at, updated_at")
          .eq("opportunity_id", opp.id)
          .order("updated_at", { ascending: false }),
        customerNames(ctx, [opp.customer_id]),
        opp.job_id
          ? ctx.supabase.schema("neta_ops").from("jobs").select("job_number, title, status").eq("id", opp.job_id).limit(1)
          : Promise.resolve({ data: null }),
      ]);
      const notes = (notesRes.data ?? []) as Row[];
      const people = await profileNames(ctx, [...notes.map((n) => n.user_id), opp.lost_by]);
      const { subcontractor_agreements: _s, ...rest } = opp;
      return {
        ...(trimDeep({ ...rest, customer_id: undefined, lost_by: undefined, user_id: undefined }) as Row),
        customer: customers[opp.customer_id] ?? null,
        ...(opp.lost_by ? { lost_by: people[opp.lost_by] ?? null } : {}),
        job: (job as { data: Row[] | null }).data?.[0] ?? null,
        notes: notes.map((n) => ({ by: people[n.user_id] ?? null, at: n.created_at, text: n.content, attachment: n.attachment_name ?? undefined })),
        rfis: rfisRes.data ?? [],
        estimates: estRes.data ?? [],
      };
    },
  },
  {
    name: "sales_pipeline",
    title: "Sales pipeline summary",
    description:
      "Totals for the sales pipeline: count and quoted dollars by status, open pipeline total, win rate, " +
      "and lost reasons. Optionally since a date, for one salesperson, or one division.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "Only opportunities created on or after this date (YYYY-MM-DD)." },
        sales_person: { type: "string" },
        division: { type: "string", description: "amp_division value." },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    allowed: salesOnly,
    async run(args, ctx) {
      const rows: Row[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        let q = ctx.supabase
          .schema("business")
          .from("opportunities")
          .select("status, quoted_amount, lost_reason_category, exclude_from_quoted_total")
          .range(from, from + 999);
        const since = isoDate(args.since);
        if (since) q = q.gte("created_at", since);
        const person = cleanSearch(args.sales_person);
        if (person) q = q.ilike("sales_person", `%${person}%`);
        if (str(args.division)) q = q.eq("amp_division", str(args.division));
        const { data, error } = await q;
        if (error) fail("Couldn't read the pipeline", error);
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const byStatus: Record<string, { count: number; quoted: number }> = {};
      const lost: Record<string, number> = {};
      for (const r of rows) {
        const s = r.status ?? "unknown";
        byStatus[s] ??= { count: 0, quoted: 0 };
        byStatus[s].count += 1;
        if (!r.exclude_from_quoted_total) byStatus[s].quoted += Number(r.quoted_amount ?? 0);
        if (s === "lost") lost[r.lost_reason_category ?? "not given"] = (lost[r.lost_reason_category ?? "not given"] ?? 0) + 1;
      }
      const won = byStatus.awarded?.count ?? 0;
      const lostCount = byStatus.lost?.count ?? 0;
      const open = OPEN_SALES_STATUSES.reduce(
        (t, s) => ({ count: t.count + (byStatus[s]?.count ?? 0), quoted: t.quoted + (byStatus[s]?.quoted ?? 0) }),
        { count: 0, quoted: 0 },
      );
      return {
        opportunities: rows.length,
        by_status: byStatus,
        open_pipeline: open,
        win_rate_awarded_vs_lost: won + lostCount ? Math.round((won / (won + lostCount)) * 1000) / 10 : null,
        lost_reasons: lost,
        note: "Dollar totals use quoted_amount and skip opportunities marked exclude_from_quoted_total.",
      };
    },
  },
  {
    name: "list_rfis",
    title: "List RFIs on an opportunity",
    description: "RFIs (questions to the customer during bidding) on one opportunity, with answers if any.",
    inputSchema: {
      type: "object",
      properties: {
        quote_number: { type: "string" },
        opportunity_id: { type: "string" },
        open_only: { type: "boolean", default: false, description: "Only RFIs with no answer yet." },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    allowed: salesOnly,
    async run(args, ctx) {
      const opp = await resolveOpportunity(ctx, args);
      let q = ctx.supabase
        .schema("business")
        .from("opportunity_rfis")
        .select("number, question, spec_ref, response, date_added, date_answered, source, created_by_name")
        .eq("opportunity_id", opp.id);
      if (args.open_only === true) q = q.is("date_answered", null);
      const { data, error } = await q.order("number");
      if (error) fail("Couldn't read RFIs", error);
      return { quote_number: opp.quote_number, title: opp.title, count: (data ?? []).length, rfis: data ?? [] };
    },
  },
  // --------------------------------------------------------------- schedule
  {
    name: "get_schedule",
    title: "Technician schedule",
    description:
      "Who is scheduled where: technician assignments by date range, person, or job. Defaults to the " +
      "next 14 days.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD, default today." },
        end_date: { type: "string", description: "YYYY-MM-DD, default 14 days out." },
        person: { type: "string", description: "Part of the person's name." },
        job_number: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const start = isoDate(args.start_date) ?? addDays(0);
      const end = isoDate(args.end_date) ?? addDays(14);
      let q = ctx.supabase
        .schema("common")
        .from("technician_assignments")
        .select("user_id, job_id, assignment_date, start_time, end_time, status, notes, division")
        .gte("assignment_date", start)
        .lte("assignment_date", end);
      if (str(args.job_number)) q = q.eq("job_id", (await resolveJob(ctx, args)).id);
      const person = cleanSearch(args.person);
      if (person) {
        const { data: ps } = await ctx.supabase.schema("common").from("profiles").select("id").ilike("full_name", `%${person}%`).limit(20);
        const ids = (ps ?? []).map((p: Row) => p.id);
        if (!ids.length) return { count: 0, assignments: [], note: `No person matching "${person}".` };
        q = q.in("user_id", ids);
      }
      const { data, error } = await q.order("assignment_date").order("start_time").limit(500);
      if (error) fail("Couldn't read the schedule", error);
      const rows = (data ?? []) as Row[];
      const [people, jobsRes] = await Promise.all([
        profileNames(ctx, rows.map((r) => r.user_id)),
        rows.length
          ? ctx.supabase.schema("neta_ops").from("jobs").select("id, job_number, title").in("id", [...new Set(rows.map((r) => r.job_id).filter(Boolean))])
          : Promise.resolve({ data: [] as Row[] }),
      ]);
      const jobs = Object.fromEntries(((jobsRes.data ?? []) as Row[]).map((j) => [j.id, `${j.job_number ?? ""} ${j.title ?? ""}`.trim()]));
      return {
        from: start,
        to: end,
        count: rows.length,
        assignments: rows.map((r) => ({
          date: r.assignment_date,
          person: people[r.user_id] ?? null,
          job: jobs[r.job_id] ?? null,
          start: r.start_time,
          end: r.end_time,
          status: r.status,
          division: r.division,
          notes: r.notes || undefined,
        })),
      };
    },
  },
];
