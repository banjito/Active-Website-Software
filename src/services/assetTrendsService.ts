/** Reads everything the Trends window charts: the reports on an asset and saved field mappings. */

import { supabase } from "@/lib/supabase";
import type { CustomFormStructure } from "@/lib/types/customForms";
import { adaptStoredData, parseStoredData, projectStateToRuntime } from "@/lib/customForms/instanceState";
import { customFormReadings, trendDate } from "@/lib/customForms/assetTrends";
import { REPORT_SLUG_TO_TABLE, SLUG_FALLBACK_TABLES, parseReportRef } from "@/lib/reportEvaluations";
import { builtInReadings, builtInReportDate, reportTypeName } from "@/lib/trends/builtInReadings";
import type { TrendEntry } from "@/lib/trends/readings";
import type { MappingMember, TrendMapping } from "@/lib/trends/trendLines";
import { isMissingTable } from "@/services/siteDiagramsService";

const CHUNK = 100;

async function customFormEntries(urls: string[]): Promise<TrendEntry[]> {
  const ids = new Map<string, string>(); // instance id → template id
  for (const url of urls) {
    const m = url.match(/custom-form\/([^/]+)\/([^/?#]+)/);
    if (m && m[2] !== "new") ids.set(m[2], m[1]);
  }
  if (!ids.size) return [];

  const [{ data: rows, error: rowsError }, { data: templates, error: templatesError }] = await Promise.all([
    supabase
      .schema("neta_ops")
      .from("custom_form_instances")
      .select("id, template_id, job_id, data, status, created_at")
      .in("id", [...ids.keys()]),
    supabase
      .schema("neta_ops")
      .from("custom_form_templates")
      .select("id, name, structure")
      .in("id", [...new Set(ids.values())]),
  ]);
  if (rowsError) throw rowsError;
  if (templatesError) throw templatesError;

  const entries: TrendEntry[] = [];
  for (const row of (rows ?? []) as any[]) {
    const template = (templates ?? []).find((t: any) => t.id === row.template_id) as any;
    const structure = template?.structure as CustomFormStructure | undefined;
    if (!structure?.sections) continue;
    const data = projectStateToRuntime(adaptStoredData(parseStoredData(row.data), structure));
    const when = trendDate(structure, data, row.created_at);
    entries.push({
      id: row.id,
      reportType: `custom:${template.id}`,
      reportTypeName: template.name,
      date: when.date,
      dateFromForm: when.fromForm,
      path: `/jobs/${row.job_id}/custom-form/${template.id}/${row.id}`,
      readings: customFormReadings(structure, data),
    });
  }
  return entries;
}

/** Rows from one report table. A table this database doesn't have is skipped. */
async function reportRows(table: string, ids: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from(table)
      .select("*")
      .in("id", ids.slice(i, i + CHUNK));
    if (isMissingTable(error)) return rows;
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function builtInEntries(urls: string[]): Promise<{ entries: TrendEntry[]; unread: number }> {
  const refs = urls.flatMap((url) => {
    const ref = parseReportRef(url);
    return ref ? [{ ...ref, url }] : [];
  });

  // A report can sit in its main table or, for a few slugs, a fallback one.
  const wanted = new Map<string, Set<string>>();
  for (const ref of refs) {
    const tables = [REPORT_SLUG_TO_TABLE[ref.slug], ...(SLUG_FALLBACK_TABLES[ref.slug] ?? [])].filter(Boolean);
    for (const table of tables) {
      if (!wanted.has(table)) wanted.set(table, new Set());
      wanted.get(table)!.add(ref.reportId);
    }
  }
  const byTable = new Map<string, Map<string, any>>();
  await Promise.all(
    [...wanted].map(async ([table, ids]) => {
      const rows = await reportRows(table, [...ids]);
      byTable.set(table, new Map(rows.map((row) => [String(row.id), row])));
    }),
  );

  const entries: TrendEntry[] = [];
  let unread = 0;
  for (const ref of refs) {
    const tables = [REPORT_SLUG_TO_TABLE[ref.slug], ...(SLUG_FALLBACK_TABLES[ref.slug] ?? [])].filter(Boolean);
    const row = tables.map((table) => byTable.get(table)?.get(ref.reportId)).find(Boolean);
    if (!row) {
      unread += 1;
      continue;
    }
    const when = builtInReportDate(row);
    entries.push({
      id: ref.reportId,
      reportType: `built-in:${ref.slug}`,
      reportTypeName: reportTypeName(ref.slug),
      date: when.date,
      dateFromForm: when.fromForm,
      path: ref.url.slice("report:".length),
      readings: builtInReadings(row),
    });
  }
  return { entries, unread };
}

/**
 * Every report filed on the asset that has results. `unread` counts built-in
 * reports whose saved row couldn't be found; `empty` counts those with no results.
 */
export async function loadAssetTrendEntries(assetId: string): Promise<{ entries: TrendEntry[]; unread: number; empty: number }> {
  const { data: links, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("file_url")
    .eq("equipment_asset_id", assetId);
  if (error) throw error;

  const urls = [...new Set((links ?? []).map((link: any) => String(link.file_url ?? "")))];
  const [custom, builtIn] = await Promise.all([
    customFormEntries(urls.filter((url) => url.startsWith("custom-form:"))),
    builtInEntries(urls.filter((url) => url.startsWith("report:"))),
  ]);
  const all = [...custom, ...builtIn.entries];
  const entries = all.filter((entry) => entry.readings.length > 0);
  return { entries, unread: builtIn.unread, empty: all.length - entries.length };
}

/** Saved mappings. `available` is false until create_trend_field_mappings.sql has run. */
export async function fetchTrendMappings(): Promise<{ mappings: TrendMapping[]; available: boolean }> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("trend_field_mappings")
    .select("id, name, members")
    .order("name");
  if (isMissingTable(error)) return { mappings: [], available: false };
  if (error) throw error;
  return {
    mappings: (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      members: (row.members ?? []) as MappingMember[],
      saved: true,
    })),
    available: true,
  };
}

/** Adds a mapping, or changes the one with `id`. Admins and report reviewers only. */
export async function saveTrendMapping(mapping: { id?: string; name: string; members: MappingMember[] }): Promise<TrendMapping> {
  const values = { name: mapping.name, members: mapping.members };
  const table = supabase.schema("neta_ops").from("trend_field_mappings");
  const { data, error } = await (mapping.id ? table.update(values).eq("id", mapping.id) : table.insert(values))
    .select("id, name, members")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, members: data.members as MappingMember[], saved: true };
}

export async function deleteTrendMapping(id: string): Promise<void> {
  const { error } = await supabase.schema("neta_ops").from("trend_field_mappings").delete().eq("id", id);
  if (error) throw error;
}
