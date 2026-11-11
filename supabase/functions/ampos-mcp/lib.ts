// Shared lookups for tools. Everything runs through ctx.supabase (signed in as
// the person using Claude), so row security applies.

import type { ToolContext } from "./mcp.ts";
import {
  extractEvaluationResult,
  extractReportIdentifier,
  parseFileUrl,
  SLUG_FALLBACK_TABLES,
  type EvaluationResult,
} from "./reports.ts";

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;

/** Web address of the ampOS app, for links. Set APP_URL in function secrets. */
export const APP_URL = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const clampLimit = (v: unknown, fallback: number, max: number): number => {
  const n = typeof v === "number" ? Math.floor(v) : fallback;
  return Math.min(Math.max(n, 1), max);
};

/** Strip characters that break PostgREST filter strings (or(), ilike). */
export const cleanSearch = (v: unknown): string =>
  str(v).replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Shrinks report JSON for Claude: drops blank fields, replaces embedded files
 * (photos, signatures) with a note, and cuts very long text and lists.
 */
export function trimDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[file omitted, ${value.length} chars]`;
    return value.length > 2000 ? `${value.slice(0, 2000)} [cut, ${value.length} chars]` : value;
  }
  if (Array.isArray(value)) {
    const out = value.slice(0, 300).map((x) => trimDeep(x, depth + 1));
    if (value.length > 300) out.push(`[${value.length - 300} more items cut]`);
    return out;
  }
  if (value && typeof value === "object") {
    if (depth > 12) return "[nested too deep]";
    const out: Row = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = trimDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export const JOB_COLUMNS =
  "id, job_number, title, status, division, priority, start_date, due_date, completed_date, " +
  "customer_id, site_id, site_address, location, project_manager_id, fireteam_lead, end_user, description";

/** Finds one job by job_number or job_id. Throws a readable error if missing. */
export async function resolveJob(ctx: ToolContext, args: Row): Promise<Row> {
  const jobId = str(args.job_id);
  const jobNumber = str(args.job_number);
  if (!jobId && !jobNumber) throw new Error("Give a job_number (like 26103) or a job_id.");
  const base = ctx.supabase.schema("neta_ops").from("jobs").select(JOB_COLUMNS).is("deleted_at", null);
  const { data, error } = await (jobId ? base.eq("id", jobId) : base.eq("job_number", jobNumber)).limit(1);
  if (error) throw new Error(`Couldn't look up the job: ${error.message}`);
  if (!data?.length) throw new Error(`No job ${jobNumber || jobId} found, or your account can't see it.`);
  return data[0] as Row;
}

/** id -> display name. Only name/email columns: profiles also hold pay data. */
export async function profileNames(ctx: ToolContext, ids: unknown[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))];
  if (!unique.length) return {};
  const { data } = await ctx.supabase.schema("common").from("profiles").select("id, full_name, email").in("id", unique);
  return Object.fromEntries((data ?? []).map((p: Row) => [p.id, p.full_name || p.email]));
}

export async function customerNames(ctx: ToolContext, ids: unknown[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))];
  if (!unique.length) return {};
  const { data } = await ctx.supabase.schema("common").from("customers").select("id, name, company_name").in("id", unique);
  return Object.fromEntries((data ?? []).map((c: Row) => [c.id, c.company_name || c.name]));
}

export async function siteNames(ctx: ToolContext, ids: unknown[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))];
  if (!unique.length) return {};
  const { data } = await ctx.supabase.schema("common").from("sites").select("id, name").in("id", unique);
  return Object.fromEntries((data ?? []).map((s: Row) => [s.id, s.name]));
}

/** asset id -> report code like "26103-203". */
export async function reportCodes(ctx: ToolContext, assetIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ids of chunk(assetIds, 150)) {
    const { data } = await ctx.supabase
      .schema("neta_ops")
      .from("report_numbers")
      .select("asset_id, report_code")
      .in("asset_id", ids);
    for (const r of data ?? []) out[r.asset_id] = r.report_code;
  }
  return out;
}

/** asset id -> first job it's attached to (number + title). */
export async function jobsForAssets(ctx: ToolContext, assetIds: string[]): Promise<Record<string, Row>> {
  const links: Row[] = [];
  for (const ids of chunk(assetIds, 150)) {
    const { data } = await ctx.supabase
      .schema("neta_ops")
      .from("job_assets")
      .select("asset_id, job_id, created_at")
      .in("asset_id", ids)
      .order("created_at", { ascending: true });
    links.push(...(data ?? []));
  }
  const jobIds = [...new Set(links.map((l) => l.job_id))];
  const jobs: Record<string, Row> = {};
  for (const ids of chunk(jobIds, 150)) {
    const { data } = await ctx.supabase.schema("neta_ops").from("jobs").select("id, job_number, title").in("id", ids);
    for (const j of data ?? []) jobs[j.id] = j;
  }
  const out: Record<string, Row> = {};
  for (const l of links) {
    if (!out[l.asset_id] && jobs[l.job_id]) {
      out[l.asset_id] = { job_number: jobs[l.job_id].job_number, job_title: jobs[l.job_id].title };
    }
  }
  return out;
}

/**
 * Loads the stored data for report documents (neta_ops.assets rows), keyed by
 * asset id. Handles built-in reports (one table per type, plus legacy fallback
 * tables) and custom forms. Uploaded PDFs have no data.
 */
export async function loadReportRows(ctx: ToolContext, assets: Row[]): Promise<Record<string, Row>> {
  const out: Record<string, Row> = {};
  const byTable = new Map<string, { assetId: string; reportId: string; slug: string }[]>();
  const customForms: { assetId: string; instanceId: string }[] = [];

  for (const a of assets) {
    const ref = parseFileUrl(a.file_url);
    if (ref?.kind === "report" && ref.table) {
      const list = byTable.get(ref.table) ?? [];
      list.push({ assetId: a.id, reportId: ref.reportId, slug: ref.slug });
      byTable.set(ref.table, list);
    } else if (ref?.kind === "custom-form") {
      customForms.push({ assetId: a.id, instanceId: ref.instanceId });
    }
  }

  const missing: { assetId: string; reportId: string; slug: string }[] = [];
  for (const [table, refs] of byTable) {
    for (const part of chunk(refs, 100)) {
      const { data } = await ctx.supabase
        .schema("neta_ops")
        .from(table)
        .select("*")
        .in("id", part.map((r) => r.reportId));
      const found = new Map((data ?? []).map((row: Row) => [row.id, row]));
      for (const r of part) {
        const row = found.get(r.reportId);
        if (row) out[r.assetId] = row;
        else missing.push(r);
      }
    }
  }

  for (const r of missing) {
    for (const table of SLUG_FALLBACK_TABLES[r.slug] ?? []) {
      const { data } = await ctx.supabase.schema("neta_ops").from(table).select("*").eq("id", r.reportId).limit(1);
      if (data?.length) {
        out[r.assetId] = data[0];
        break;
      }
    }
  }

  for (const part of chunk(customForms, 100)) {
    const { data } = await ctx.supabase
      .schema("neta_ops")
      .from("custom_form_instances")
      .select("*")
      .in("id", part.map((c) => c.instanceId));
    const found = new Map((data ?? []).map((row: Row) => [row.id, row]));
    for (const c of part) {
      const row = found.get(c.instanceId);
      if (row) out[c.assetId] = row;
    }
  }
  return out;
}

export function summarizeRow(row: Row | undefined): { result: EvaluationResult | null; identifier: string } {
  if (!row) return { result: null, identifier: "" };
  return { result: extractEvaluationResult(row), identifier: extractReportIdentifier(row) };
}

export const reportLink = (jobId: string | undefined): string | undefined =>
  APP_URL && jobId ? `${APP_URL}/jobs/${jobId}` : undefined;
