// Tools Claude can call. Each one is a fixed, read-only question: never raw SQL.
// Every query uses ctx.supabase, which is signed in as the person using Claude,
// so row security limits results exactly like the app does.
//
// Add a tool: append an object to TOOLS. Keep descriptions plain and specific;
// Claude reads them to decide when to call the tool.
//
// Never select pay/HR columns from common.profiles (use profileNames in lib.ts),
// and keep money (budget, QuickBooks) out of this field pack.

import type { ToolContext } from "./mcp.ts";
import {
  APP_URL,
  clampLimit,
  cleanSearch,
  customerNames,
  jobsForAssets,
  loadReportRows,
  profileNames,
  reportCodes,
  reportLink,
  resolveJob,
  type Row,
  siteNames,
  str,
  summarizeRow,
  trimDeep,
} from "./lib.ts";
import { parseFileUrl, splitReportName } from "./reports.ts";

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  run: (args: Row, ctx: ToolContext) => Promise<Record<string, unknown>>;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const JOB_REF_PROPS = {
  job_number: { type: "string", description: "Job number as shown in ampOS, like 26103." },
  job_id: { type: "string", description: "Job UUID, if known instead of the number." },
};

const STANDARD_ENUM = { type: "string", enum: ["ats-2025", "mts-2023"] };

const OPEN_ACTION_STATUSES = ["unaddressed", "formally_notified"];

// deno-lint-ignore no-explicit-any
const fail = (what: string, error: any): never => {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
};

export const TOOLS: Tool[] = [
  // ---------------------------------------------------------------- account
  {
    name: "whoami",
    title: "Who am I in ampOS",
    description:
      "Shows which ampOS account Claude is signed in as (name, email, role) and how many " +
      "jobs that account can see. Use it to check the connection works.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    async run(_args, ctx) {
      const meta = (ctx.user.user_metadata ?? {}) as Row;
      const { count, error } = await ctx.supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id", { count: "exact", head: true });
      return {
        name: meta.name ?? null,
        email: ctx.user.email ?? null,
        role: meta.role ?? null,
        jobs_visible: error ? null : count,
        ...(error ? { jobs_error: error.message } : {}),
      };
    },
  },

  // ------------------------------------------------------------- standards
  {
    name: "search_standards",
    title: "Search NETA standards",
    description:
      "Full-text search of the NETA standards loaded in ampOS: ATS-2025 (acceptance testing) and " +
      "MTS-2023 (maintenance testing). Returns matching sections and tables with snippets. Use for " +
      "test procedures, acceptance values, and table lookups (e.g. 'insulation resistance molded case'). " +
      "Then call get_standard_section for the full text. Quote section/table numbers when answering.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to search for." },
        standard: { ...STANDARD_ENUM, description: "Limit to one standard. Omit to search both." },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const query = str(args.query);
      if (!query) throw new Error("Give a search query.");
      const { data, error } = await ctx.supabase.schema("common").rpc("search_standard_sections", {
        p_query: query,
        p_standard: str(args.standard) || null,
        p_limit: clampLimit(args.limit, 10, 30),
      });
      if (error) fail("Standards search failed", error);
      return {
        results: (data ?? []).map((r: Row) => ({
          standard: r.standard,
          number: r.section_number,
          kind: r.kind,
          title: r.title,
          snippet: r.snippet,
          ...(APP_URL ? { link: `${APP_URL}/standards/${r.standard}/${r.section_number}` } : {}),
        })),
      };
    },
  },
  {
    name: "get_standard_section",
    title: "Read a NETA standard section or table",
    description:
      "Full text of one NETA section or table, e.g. standard 'ats-2025', number '7.6.1.1' or '100.1'. " +
      "If that exact number isn't stored on its own, returns the nearest parent section that contains it.",
    inputSchema: {
      type: "object",
      properties: {
        standard: STANDARD_ENUM,
        number: { type: "string", description: "Section or table number, like 7.6.1.1 or 100.1." },
      },
      required: ["standard", "number"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const standard = str(args.standard);
      let number = str(args.number).replace(/^(table|section)\s+/i, "");
      if (!standard || !number) throw new Error("Give a standard and a section or table number.");
      const asked = number;
      while (number) {
        const { data, error } = await ctx.supabase
          .schema("common")
          .from("standard_sections")
          .select("standard, section_number, kind, title, group_title, body, book_page")
          .eq("standard", standard)
          .eq("section_number", number)
          .limit(1);
        if (error) fail("Couldn't read the standard", error);
        if (data?.length) {
          const s = data[0] as Row;
          return {
            ...(number !== asked ? { note: `${asked} isn't stored separately; showing ${number}, which contains it.` } : {}),
            standard: s.standard,
            number: s.section_number,
            kind: s.kind,
            title: s.title,
            group: s.group_title,
            book_page: s.book_page,
            text: s.body,
            ...(APP_URL ? { link: `${APP_URL}/standards/${s.standard}/${s.section_number}` } : {}),
          };
        }
        number = number.includes(".") ? number.slice(0, number.lastIndexOf(".")) : "";
      }
      throw new Error(`${asked} wasn't found in ${standard}. Try search_standards.`);
    },
  },

  // -------------------------------------------------------- device catalog
  {
    name: "search_device_catalog",
    title: "Search the protective device catalog",
    description:
      "Searches ampOS's catalog of ~11,000 protective devices (breakers, trip units, fuses, relays, " +
      "ground fault) from all major manufacturers. Match on model, series, frame, or rating. " +
      "Use get_device for full details of one result.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Model, series, frame, catalog number, or description." },
        manufacturer: { type: "string", description: "Optional manufacturer filter, like 'Square D'." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 15 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const query = str(args.query);
      if (!query) throw new Error("Give a search query.");
      const { data, error } = await ctx.supabase.schema("common").rpc("search_device_catalog", {
        p_query: query,
        p_manufacturer: str(args.manufacturer) || null,
        p_limit: clampLimit(args.limit, 15, 50),
      });
      if (error) fail("Device search failed", error);
      return { results: data ?? [] };
    },
  },
  {
    name: "get_device",
    title: "Device catalog details",
    description: "All stored details for one device from search_device_catalog (by its id).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Device id from search_device_catalog." } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const { data, error } = await ctx.supabase
        .schema("common")
        .from("device_catalog")
        .select("id, device_class, manufacturer, display_name, rating, series, model_code, notes, ptw_category, raw_fields")
        .eq("id", str(args.id))
        .limit(1);
      if (error) fail("Couldn't read the device", error);
      if (!data?.length) throw new Error("No device with that id.");
      return trimDeep(data[0]) as Row;
    },
  },

  // ------------------------------------------------------------------ jobs
  {
    name: "find_jobs",
    title: "Find jobs",
    description:
      "Finds jobs by job number or title words, optionally by status. Statuses used: pending, " +
      "in_progress, completed, ready_to_bill, progress_billing, billed, cancelled. Newest first.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Job number or words from the title." },
        status: { type: "string", description: "Optional job status filter." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const q = cleanSearch(args.query);
      let query = ctx.supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id, job_number, title, status, division, start_date, due_date, customer_id, site_id, project_manager_id")
        .is("deleted_at", null);
      if (q) query = query.or(`job_number.ilike.%${q}%,title.ilike.%${q}%`);
      if (str(args.status)) query = query.eq("status", str(args.status));
      const { data, error } = await query
        .order("job_number_numeric", { ascending: false, nullsFirst: false })
        .limit(clampLimit(args.limit, 20, 50));
      if (error) fail("Job search failed", error);
      const jobs = (data ?? []) as Row[];
      const [customers, sites, people] = await Promise.all([
        customerNames(ctx, jobs.map((j) => j.customer_id)),
        siteNames(ctx, jobs.map((j) => j.site_id)),
        profileNames(ctx, jobs.map((j) => j.project_manager_id)),
      ]);
      return {
        jobs: jobs.map((j) => ({
          job_number: j.job_number,
          title: j.title,
          status: j.status,
          division: j.division,
          customer: customers[j.customer_id] ?? null,
          site: sites[j.site_id] ?? null,
          project_manager: people[j.project_manager_id] ?? null,
          start_date: j.start_date,
          due_date: j.due_date,
          job_id: j.id,
        })),
      };
    },
  },
  {
    name: "get_job",
    title: "Job overview",
    description:
      "One job's overview: customer, site, project manager, dates, report counts by status, and " +
      "open action item count. Does not include money.",
    inputSchema: { type: "object", properties: JOB_REF_PROPS, additionalProperties: false },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const job = await resolveJob(ctx, args);
      const [{ data: links }, { count: openItems }] = await Promise.all([
        ctx.supabase.schema("neta_ops").from("job_assets").select("asset_id").eq("job_id", job.id),
        ctx.supabase
          .schema("neta_ops")
          .from("report_action_items")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job.id)
          .in("status", OPEN_ACTION_STATUSES),
      ]);
      const assetIds = (links ?? []).map((l: Row) => l.asset_id);
      const counts: Record<string, number> = {};
      for (let i = 0; i < assetIds.length; i += 150) {
        const { data } = await ctx.supabase
          .schema("neta_ops")
          .from("assets")
          .select("status")
          .in("id", assetIds.slice(i, i + 150));
        for (const a of data ?? []) counts[a.status ?? "unknown"] = (counts[a.status ?? "unknown"] ?? 0) + 1;
      }
      const [customers, sites, people] = await Promise.all([
        customerNames(ctx, [job.customer_id]),
        siteNames(ctx, [job.site_id]),
        profileNames(ctx, [job.project_manager_id]),
      ]);
      return {
        job_number: job.job_number,
        title: job.title,
        status: job.status,
        division: job.division,
        priority: job.priority,
        customer: customers[job.customer_id] ?? null,
        end_user: job.end_user,
        site: sites[job.site_id] ?? null,
        site_address: job.site_address,
        location: job.location,
        project_manager: people[job.project_manager_id] ?? null,
        fireteam_lead: job.fireteam_lead,
        start_date: job.start_date,
        due_date: job.due_date,
        completed_date: job.completed_date,
        description: job.description,
        reports_total: assetIds.length,
        reports_by_status: counts,
        open_action_items: openItems ?? 0,
        job_id: job.id,
        ...(reportLink(job.id) ? { link: reportLink(job.id) } : {}),
      };
    },
  },

  // --------------------------------------------------------------- reports
  {
    name: "list_job_reports",
    title: "List a job's reports",
    description:
      "Lists the test reports on a job: report code (like 26103-203), report type, equipment, and " +
      "workflow status (not started, in_progress, ready_for_review, issue, approved, sent, archived). " +
      "Set include_results to also read each report's PASS / FAIL / LIMITED SERVICE result " +
      "(slower on big jobs), or only_problems to return just FAIL and LIMITED SERVICE reports.",
    inputSchema: {
      type: "object",
      properties: {
        ...JOB_REF_PROPS,
        status: { type: "string", description: "Optional workflow status filter." },
        include_results: { type: "boolean", default: false },
        only_problems: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const job = await resolveJob(ctx, args);
      const { data: links, error: linkErr } = await ctx.supabase
        .schema("neta_ops")
        .from("job_assets")
        .select("asset_id")
        .eq("job_id", job.id);
      if (linkErr) fail("Couldn't list the job's reports", linkErr);
      const ids = [...new Set((links ?? []).map((l: Row) => l.asset_id as string))];

      const assets: Row[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        let q = ctx.supabase
          .schema("neta_ops")
          .from("assets")
          .select("id, name, status, file_url, submitted_at, approved_at, sent_at, updated_at, review_comments")
          .in("id", ids.slice(i, i + 150));
        if (str(args.status)) q = q.eq("status", str(args.status));
        const { data, error } = await q;
        if (error) fail("Couldn't read reports", error);
        assets.push(...(data ?? []));
      }

      const wantResults = args.include_results === true || args.only_problems === true;
      const MAX_RESULTS = 400;
      const [codes, rows] = await Promise.all([
        reportCodes(ctx, assets.map((a) => a.id)),
        wantResults ? loadReportRows(ctx, assets.slice(0, MAX_RESULTS)) : Promise.resolve({} as Record<string, Row>),
      ]);

      let reports = assets
        .map((a) => {
          const { report_type, equipment } = splitReportName(a.name);
          const ref = parseFileUrl(a.file_url);
          const summary = wantResults ? summarizeRow(rows[a.id]) : null;
          return {
            report_id: a.id,
            code: codes[a.id] ?? null,
            report_type,
            equipment: summary?.identifier || equipment,
            status: a.status,
            ...(wantResults ? { result: summary?.result ?? null } : {}),
            ...(ref?.kind === "file" ? { uploaded_file: true } : {}),
            ...(a.review_comments && ["issue", "rejected"].includes(a.status)
              ? { review_comments: a.review_comments }
              : {}),
            submitted_at: a.submitted_at,
            approved_at: a.approved_at,
            sent_at: a.sent_at,
          };
        })
        .sort((x, y) => String(x.code ?? x.report_type).localeCompare(String(y.code ?? y.report_type), undefined, { numeric: true }));

      if (args.only_problems === true) {
        reports = reports.filter((r) => r.result === "FAIL" || r.result === "LIMITED SERVICE");
      }
      return {
        job_number: job.job_number,
        job_title: job.title,
        count: reports.length,
        ...(wantResults && assets.length > MAX_RESULTS
          ? { note: `Results read for the first ${MAX_RESULTS} of ${assets.length} reports only.` }
          : {}),
        reports,
      };
    },
  },
  {
    name: "get_report",
    title: "Read one test report",
    description:
      "Full stored data of one test report: nameplate, test readings, results, comments. Look it up " +
      "by report_id (from list_job_reports) or report code (like 26103-203). Blank fields and " +
      "embedded photos are left out. Uploaded PDF reports have no readable data.",
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "report_id from list_job_reports." },
        code: { type: "string", description: "Report code like 26103-203." },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      let assetId = str(args.report_id);
      if (!assetId && str(args.code)) {
        const { data } = await ctx.supabase
          .schema("neta_ops")
          .from("report_numbers")
          .select("asset_id")
          .eq("report_code", str(args.code))
          .limit(1);
        assetId = data?.[0]?.asset_id ?? "";
        if (!assetId) throw new Error(`No report with code ${str(args.code)}, or your account can't see it.`);
      }
      if (!assetId) throw new Error("Give a report_id or a report code.");

      const { data: found, error } = await ctx.supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, status, file_url, submitted_at, approved_at, sent_at, review_comments, reviewed_at, equipment_asset_id")
        .eq("id", assetId)
        .limit(1);
      if (error) fail("Couldn't read the report", error);
      if (!found?.length) throw new Error("No report with that id, or your account can't see it.");
      const asset = found[0] as Row;

      const [codes, jobs, rows] = await Promise.all([
        reportCodes(ctx, [asset.id]),
        jobsForAssets(ctx, [asset.id]),
        loadReportRows(ctx, [asset]),
      ]);
      const row = rows[asset.id];
      const { report_type, equipment } = splitReportName(asset.name);
      const summary = summarizeRow(row);
      const ref = parseFileUrl(asset.file_url);

      let data: unknown = row ? trimDeep(row) : null;
      const size = data ? JSON.stringify(data).length : 0;
      if (size > 100_000) data = { note: "Report too large to return whole; first part only.", partial: JSON.stringify(data).slice(0, 100_000) };

      return {
        report_id: asset.id,
        code: codes[asset.id] ?? null,
        report_type,
        equipment: summary.identifier || equipment,
        status: asset.status,
        result: summary.result,
        job: jobs[asset.id] ?? null,
        submitted_at: asset.submitted_at,
        approved_at: asset.approved_at,
        sent_at: asset.sent_at,
        ...(asset.review_comments ? { review_comments: asset.review_comments } : {}),
        equipment_asset_id: asset.equipment_asset_id,
        ...(ref?.kind === "file" ? { note: "Uploaded file; contents not readable here." } : {}),
        ...(!row && ref?.kind !== "file" ? { note: "Report data not found." } : {}),
        data,
      };
    },
  },
  {
    name: "review_queue",
    title: "Reports waiting for review",
    description:
      "Reports waiting for office review (status ready_for_review), oldest first, with job and who " +
      "submitted them. Set status to 'issue' for reports sent back to the tech.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ready_for_review", "issue"], default: "ready_for_review" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const status = str(args.status) || "ready_for_review";
      const { data, error } = await ctx.supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, status, submitted_at, submitted_by, updated_at, review_comments")
        .eq("status", status)
        .order("submitted_at", { ascending: true, nullsFirst: false })
        .limit(clampLimit(args.limit, 50, 100));
      if (error) fail("Couldn't read the review queue", error);
      const assets = (data ?? []) as Row[];
      const ids = assets.map((a) => a.id);
      const [codes, jobs, people] = await Promise.all([
        reportCodes(ctx, ids),
        jobsForAssets(ctx, ids),
        profileNames(ctx, assets.map((a) => a.submitted_by)),
      ]);
      return {
        status,
        count: assets.length,
        reports: assets.map((a) => {
          const { report_type, equipment } = splitReportName(a.name);
          return {
            report_id: a.id,
            code: codes[a.id] ?? null,
            report_type,
            equipment,
            job: jobs[a.id] ?? null,
            submitted_by: people[a.submitted_by] ?? null,
            submitted_at: a.submitted_at ?? a.updated_at,
            ...(status === "issue" && a.review_comments ? { review_comments: a.review_comments } : {}),
          };
        }),
      };
    },
  },

  // ----------------------------------------------------------- action items
  {
    name: "list_action_items",
    title: "List action items",
    description:
      "Report action items (deficiencies to fix, IDs like 26103-203-2). Filter by job, or leave the " +
      "job out for all jobs. status 'open' (default) = unaddressed + formally_notified.",
    inputSchema: {
      type: "object",
      properties: {
        ...JOB_REF_PROPS,
        status: { type: "string", enum: ["open", "unaddressed", "formally_notified", "closed", "archived", "all"], default: "open" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const status = str(args.status) || "open";
      let q = ctx.supabase
        .schema("neta_ops")
        .from("report_action_items")
        .select("id, asset_id, job_id, item_code, title, description, category, priority, status, created_by, created_at, updated_at");
      if (str(args.job_number) || str(args.job_id)) q = q.eq("job_id", (await resolveJob(ctx, args)).id);
      if (status === "open") q = q.in("status", OPEN_ACTION_STATUSES);
      else if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(clampLimit(args.limit, 50, 100));
      if (error) fail("Couldn't read action items", error);
      const items = (data ?? []) as Row[];
      const [people, jobs] = await Promise.all([
        profileNames(ctx, items.map((i) => i.created_by)),
        jobsForAssets(ctx, [...new Set(items.map((i) => i.asset_id as string))]),
      ]);
      return {
        count: items.length,
        items: items.map((i) => ({
          code: i.item_code,
          title: i.title,
          description: i.description,
          category: i.category,
          priority: i.priority,
          status: i.status,
          job: jobs[i.asset_id] ?? null,
          report_id: i.asset_id,
          created_by: people[i.created_by] ?? null,
          created_at: i.created_at,
          updated_at: i.updated_at,
        })),
      };
    },
  },

  // ---------------------------------------------------------------- assets
  {
    name: "search_assets",
    title: "Find equipment assets",
    description:
      "Searches the equipment registry (breakers, transformers, switchgear at customer sites). " +
      "Match on identifier, location, type, manufacturer, model, or serial, and/or a site name. " +
      "Use get_asset_history for one asset's test history.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Identifier, location, type, manufacturer, model, or serial." },
        site: { type: "string", description: "Words from the site name, like 'ATL2'." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const q = cleanSearch(args.query);
      const siteQ = cleanSearch(args.site);
      if (!q && !siteQ) throw new Error("Give a search query, a site, or both.");
      let siteIds: string[] | null = null;
      if (siteQ) {
        const { data } = await ctx.supabase.schema("common").from("sites").select("id").ilike("name", `%${siteQ}%`).limit(50);
        siteIds = (data ?? []).map((s: Row) => s.id);
        if (!siteIds.length) return { count: 0, assets: [], note: `No site matching "${siteQ}".` };
      }
      let query = ctx.supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .select("id, site_id, building_area, substation, identifier, equipment_location, equipment_type, manufacturer, model, serial_number, status, report_template_slug")
        .is("deleted_at", null);
      if (siteIds) query = query.in("site_id", siteIds);
      if (q) {
        const cols = ["identifier", "equipment_location", "equipment_type", "manufacturer", "model", "serial_number", "substation", "building_area"];
        query = query.or(cols.map((c) => `${c}.ilike.%${q}%`).join(","));
      }
      const { data, error } = await query.order("identifier").limit(clampLimit(args.limit, 30, 100));
      if (error) fail("Asset search failed", error);
      const assets = (data ?? []) as Row[];
      const sites = await siteNames(ctx, assets.map((a) => a.site_id));
      return {
        count: assets.length,
        assets: assets.map((a) => ({ asset_id: a.id, site: sites[a.site_id] ?? null, ...trimDeep({ ...a, id: undefined, site_id: undefined }) as Row })),
      };
    },
  },
  {
    name: "get_asset_history",
    title: "Equipment asset history",
    description:
      "One equipment asset's details plus every test report linked to it (newest first) with " +
      "PASS / FAIL / LIMITED SERVICE results. Answers 'when was this last tested' and 'how has it trended'.",
    inputSchema: {
      type: "object",
      properties: { asset_id: { type: "string", description: "asset_id from search_assets." } },
      required: ["asset_id"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    async run(args, ctx) {
      const { data, error } = await ctx.supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .select("*")
        .eq("id", str(args.asset_id))
        .is("deleted_at", null)
        .limit(1);
      if (error) fail("Couldn't read the asset", error);
      if (!data?.length) throw new Error("No asset with that id, or your account can't see it.");
      const asset = data[0] as Row;

      const { data: docs, error: docErr } = await ctx.supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, status, file_url, submitted_at, approved_at, sent_at, created_at")
        .eq("equipment_asset_id", asset.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (docErr) fail("Couldn't read the asset's reports", docErr);
      const reportsRaw = (docs ?? []) as Row[];
      const ids = reportsRaw.map((r) => r.id);
      const [sites, codes, jobs, rows] = await Promise.all([
        siteNames(ctx, [asset.site_id]),
        reportCodes(ctx, ids),
        jobsForAssets(ctx, ids),
        loadReportRows(ctx, reportsRaw),
      ]);

      const { created_by: _c, updated_by: _u, ...assetInfo } = asset;
      return {
        asset: { ...(trimDeep(assetInfo) as Row), site: sites[asset.site_id] ?? null },
        reports: reportsRaw.map((r) => ({
          report_id: r.id,
          code: codes[r.id] ?? null,
          report_type: splitReportName(r.name).report_type,
          status: r.status,
          result: summarizeRow(rows[r.id]).result,
          job: jobs[r.id] ?? null,
          tested_or_created: r.submitted_at ?? r.created_at,
          approved_at: r.approved_at,
        })),
      };
    },
  },
];
