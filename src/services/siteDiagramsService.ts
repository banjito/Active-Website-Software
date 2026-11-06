import { supabase } from "@/lib/supabase";
import type { ArchiveSnapshot } from "@/lib/diagrams/archive";
import type { CustomSymbolRow, SymbolChoices } from "@/lib/diagrams/customSymbols";
import type { DiagramChanges } from "@/lib/diagrams/editing";
import type { DiagramLinkRow } from "@/lib/diagrams/links";
import { statusByAsset, type ReportStatusRow } from "@/lib/diagrams/reportStatus";
import type { VoltageColors } from "@/lib/diagrams/voltage";
import type {
  DiagramContents,
  DiagramLineRow,
  DiagramReport,
  DiagramSymbolRow,
  SiteDiagram,
} from "@/lib/types/siteDiagrams";

const DIAGRAM_COLUMNS = "id, site_id, name, sort_order, created_at, updated_at";
const ASSET_EMBED = "asset:equipment_assets(id, identifier, equipment_type, site_id, deleted_at, status)";
const SYMBOL_COLUMNS = `id, diagram_id, asset_id, symbol_key, label, label_width, x, y, width, height, ${ASSET_EMBED}`;
const LINE_COLUMNS = `id, diagram_id, from_symbol_id, to_symbol_id, from_port, to_port, asset_id, voltage_volts, voltage_kind, label, ${ASSET_EMBED}`;

/** Instances are migrated separately, so a build can reach a database without these tables. */
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * label_width arrived in a second migration (add_diagram_symbol_label_width.sql). Without it
 * diagrams still open and save, and wrapped labels just don't persist. The first failed read
 * latches this for the session, so writes never send the column either.
 */
let labelWidthAvailable = true;

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/** Archiving arrived in add_asset_status_and_diagram_archive.sql. Until then it's left out. */
let archiveAvailable = true;

export const supportsDiagramArchive = () => archiveAvailable;

/** The database's answer when a site already has a diagram with this name. */
export function isDuplicateName(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** A site's diagrams in picker order, or null when this database doesn't have them yet. */
export async function fetchSiteDiagrams(siteId: string): Promise<SiteDiagram[] | null> {
  const read = () =>
    supabase
      .schema("neta_ops")
      .from("site_diagrams")
      .select(archiveAvailable ? `${DIAGRAM_COLUMNS}, archived_at, archive_snapshot` : DIAGRAM_COLUMNS)
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");

  let result = await read();
  if (archiveAvailable && isMissingColumn(result.error)) {
    archiveAvailable = false;
    result = await read();
  }

  if (isMissingTable(result.error)) return null;
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as SiteDiagram[];
}

export async function archiveDiagram(
  diagramId: string,
  snapshot: ArchiveSnapshot,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: userId,
      archive_snapshot: snapshot,
      updated_by: userId,
    })
    .eq("id", diagramId);

  if (error) throw error;
}

export async function retireAssets(assetIds: string[], userId: string | null): Promise<void> {
  if (assetIds.length === 0) return;
  const { error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .update({ status: "retired", updated_by: userId })
    .in("id", assetIds);

  if (error) throw error;
}

/**
 * Retires an asset and puts its replacement in its place on the active diagrams. Archives
 * keep the old asset, which is the point of them.
 */
export async function replaceAsset(
  oldAssetId: string,
  newAssetId: string,
  activeDiagramIds: string[],
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .update({ status: "retired", replaced_by_asset_id: newAssetId, updated_by: userId })
    .eq("id", oldAssetId);
  if (error) throw error;

  if (activeDiagramIds.length === 0) return;
  const { error: symbolError } = await supabase
    .schema("neta_ops")
    .from("diagram_symbols")
    .update({ asset_id: newAssetId })
    .eq("asset_id", oldAssetId)
    .in("diagram_id", activeDiagramIds);
  if (symbolError) throw symbolError;
}

export async function fetchDiagramContents(diagramId: string): Promise<DiagramContents> {
  const readSymbols = () =>
    supabase
      .schema("neta_ops")
      .from("diagram_symbols")
      .select(labelWidthAvailable ? SYMBOL_COLUMNS : SYMBOL_COLUMNS.replace(" label_width,", ""))
      .eq("diagram_id", diagramId);

  const [firstRead, lines] = await Promise.all([
    readSymbols(),
    supabase.schema("neta_ops").from("diagram_lines").select(LINE_COLUMNS).eq("diagram_id", diagramId),
  ]);

  let symbols = firstRead;
  if (labelWidthAvailable && isMissingColumn(symbols.error)) {
    labelWidthAvailable = false;
    symbols = await readSymbols();
  }

  if (symbols.error) throw symbols.error;
  if (lines.error) throw lines.error;

  return {
    symbols: ((symbols.data ?? []) as unknown as DiagramSymbolRow[]).map((row) => ({
      ...row,
      label_width: row.label_width ?? null,
    })),
    lines: (lines.data ?? []) as unknown as DiagramLineRow[],
  };
}

/**
 * The reports attached to an asset, newest first. From a job only that job's reports come
 * back, because different customers can share the same equipment. From a site, all of them.
 */
export async function fetchAssetReports(
  assetId: string,
  jobId: string | null,
): Promise<DiagramReport[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("id, name, status, file_url")
    .eq("equipment_asset_id", assetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // A separate read on purpose. job_assets has two foreign keys to assets, so asking for it
  // as an embed is refused as ambiguous.
  const { data: links, error: linksError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .select("asset_id, job_id")
    .in(
      "asset_id",
      data.map((row) => row.id),
    );

  if (linksError) throw linksError;

  const rows = data.map((row) => ({
    ...row,
    jobIds: (links ?? []).filter((link) => link.asset_id === row.id).map((link) => link.job_id),
  }));

  const shown = jobId ? rows.filter((row) => row.jobIds.includes(jobId)) : rows;

  const labels = new Map<string, string>();
  const jobIds = [...new Set(shown.flatMap((row) => row.jobIds))];
  if (!jobId && jobIds.length > 0) {
    const { data: jobs, error: jobsError } = await supabase
      .schema("neta_ops")
      .from("jobs")
      .select("id, job_number, title")
      .in("id", jobIds);
    if (jobsError) throw jobsError;
    for (const job of jobs ?? []) {
      labels.set(job.id, job.job_number ? `Job ${job.job_number}` : (job.title ?? "Job"));
    }
  }

  return shown.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    fileUrl: row.file_url,
    jobLabel: labels.get(row.jobIds[0]) ?? null,
  }));
}

/** The symbols that can link diagrams together: assets, and link symbols. */
export async function fetchDiagramLinkRows(diagramIds: string[]): Promise<DiagramLinkRow[]> {
  if (diagramIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("diagram_symbols")
    .select("id, diagram_id, asset_id, symbol_key, label, asset:equipment_assets(identifier)")
    .in("diagram_id", diagramIds)
    .or("asset_id.not.is.null,symbol_key.eq.link");

  if (error) throw error;
  return (data ?? []) as unknown as DiagramLinkRow[];
}

/** How many ids one query can safely carry in its address. */
const IN_CHUNK_SIZE = 150;

/**
 * The report status that speaks for each asset. From a job, only that job's reports count,
 * because different customers can share the same equipment.
 */
export async function fetchAssetStatuses(
  assetIds: string[],
  jobId: string | null,
): Promise<Map<string, string>> {
  const rows: Array<ReportStatusRow & { id: string }> = [];
  for (let start = 0; start < assetIds.length; start += IN_CHUNK_SIZE) {
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select("id, equipment_asset_id, status, created_at")
      .in("equipment_asset_id", assetIds.slice(start, start + IN_CHUNK_SIZE));
    if (error) throw error;
    rows.push(...((data ?? []) as Array<ReportStatusRow & { id: string }>));
  }

  if (!jobId) return statusByAsset(rows, false);

  const { data: links, error: linksError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .select("asset_id")
    .eq("job_id", jobId);
  if (linksError) throw linksError;

  const onJob = new Set((links ?? []).map((link) => link.asset_id));
  return statusByAsset(
    rows.filter((row) => onJob.has(row.id)),
    true,
  );
}

/** A site's voltage colors, or the default with no site. Null when there aren't any yet. */
export async function fetchVoltageColors(siteId: string | null): Promise<unknown | null> {
  const query = supabase.schema("neta_ops").from("diagram_voltage_colors").select("colors");
  const { data, error } = await (siteId ? query.eq("site_id", siteId) : query.is("site_id", null)).maybeSingle();

  if (isMissingTable(error)) return null;
  if (error) throw error;
  return data?.colors ?? null;
}

/** Saves a site's colors, or the default with no site. The database decides who may. */
export async function saveVoltageColors(
  siteId: string | null,
  colors: VoltageColors,
  userId: string | null,
): Promise<void> {
  const table = () => supabase.schema("neta_ops").from("diagram_voltage_colors");
  const existing = table().select("id");
  const { data, error } = await (siteId ? existing.eq("site_id", siteId) : existing.is("site_id", null)).maybeSingle();
  if (error) throw error;

  const { error: saveError } = data
    ? await table().update({ colors, updated_by: userId }).eq("id", data.id)
    : await table().insert({ site_id: siteId, colors, updated_by: userId });
  if (saveError) throw saveError;
}

const CUSTOM_SYMBOL_COLUMNS = "id, name, shapes, image_data, width, height, ports, deleted_at";

/** The whole library, deleted symbols included, because diagrams may still use them. */
export async function fetchCustomSymbols(): Promise<CustomSymbolRow[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("diagram_custom_symbols")
    .select(CUSTOM_SYMBOL_COLUMNS)
    .order("name");

  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data ?? []) as unknown as CustomSymbolRow[];
}

export async function createCustomSymbol(
  symbol: Omit<CustomSymbolRow, "id" | "deleted_at">,
  userId: string | null,
): Promise<CustomSymbolRow> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("diagram_custom_symbols")
    .insert({ ...symbol, created_by: userId })
    .select(CUSTOM_SYMBOL_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as CustomSymbolRow;
}

/** Keeps the same symbol, so every diagram using it shows the change next time it opens. */
export async function updateCustomSymbol(
  symbolId: string,
  symbol: Omit<CustomSymbolRow, "id" | "deleted_at">,
): Promise<CustomSymbolRow> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("diagram_custom_symbols")
    .update(symbol)
    .eq("id", symbolId)
    .select(CUSTOM_SYMBOL_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as CustomSymbolRow;
}

/** Only hides it from the pickers. Diagrams already using it keep drawing it. */
export async function deleteCustomSymbol(symbolId: string): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("diagram_custom_symbols")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", symbolId);

  if (error) throw error;
}

/** A site's symbol choices, or the default with no site. Null when there aren't any. */
export async function fetchSymbolChoices(siteId: string | null): Promise<unknown | null> {
  const query = supabase.schema("neta_ops").from("diagram_symbol_choices").select("choices");
  const { data, error } = await (siteId ? query.eq("site_id", siteId) : query.is("site_id", null)).maybeSingle();

  if (isMissingTable(error)) return null;
  if (error) throw error;
  return data?.choices ?? null;
}

export async function saveSymbolChoices(
  siteId: string | null,
  choices: SymbolChoices,
  userId: string | null,
): Promise<void> {
  const table = () => supabase.schema("neta_ops").from("diagram_symbol_choices");
  const existing = table().select("id");
  const { data, error } = await (siteId ? existing.eq("site_id", siteId) : existing.is("site_id", null)).maybeSingle();
  if (error) throw error;

  const { error: saveError } = data
    ? await table().update({ choices, updated_by: userId }).eq("id", data.id)
    : await table().insert({ site_id: siteId, choices, updated_by: userId });
  if (saveError) throw saveError;
}

export interface DiagramSiteSettings {
  end_user_customer_id: string | null;
  end_user_logo: string | null;
}

/** Empty settings if none are saved, or null when this database can't hold them yet. */
export async function fetchDiagramSiteSettings(siteId: string): Promise<DiagramSiteSettings | null> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("diagram_site_settings")
    .select("end_user_customer_id, end_user_logo")
    .eq("site_id", siteId)
    .maybeSingle();

  if (isMissingTable(error)) return null;
  if (error) throw error;
  return data ?? { end_user_customer_id: null, end_user_logo: null };
}

export async function saveDiagramSiteSettings(
  siteId: string,
  endUserCustomerId: string | null,
  endUserLogo: string | null,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("diagram_site_settings")
    .upsert({
      site_id: siteId,
      end_user_customer_id: endUserCustomerId,
      end_user_logo: endUserLogo,
      updated_by: userId,
    });

  if (error) throw error;
}

export interface CustomerChoice {
  id: string;
  name: string;
}

export async function fetchCustomerChoices(): Promise<CustomerChoice[]> {
  const { data, error } = await supabase
    .schema("common")
    .from("customers")
    .select("id, name, company_name")
    .order("company_name");

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, name: row.company_name || row.name || "Unnamed" }));
}

/** The logo to print for a customer, if they have one. */
export async function fetchCustomerLogo(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("common")
    .from("customers")
    .select("logo_url")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data?.logo_url ?? null;
}

export async function fetchJobCustomerId(jobId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("customer_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw error;
  return data?.customer_id ?? null;
}

export interface DiagramExportState {
  id: string;
  revision: number;
  export_hash: string | null;
}

/** Null when this database can't track revisions yet, and the sheet prints without one. */
export async function fetchExportStates(diagramIds: string[]): Promise<DiagramExportState[] | null> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .select("id, revision, export_hash")
    .in("id", diagramIds);

  if (isMissingColumn(error)) return null;
  if (error) throw error;
  return (data ?? []) as DiagramExportState[];
}

export async function recordExport(diagramId: string, revision: number, exportHash: string): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .update({ revision, export_hash: exportHash })
    .eq("id", diagramId);

  if (error) throw error;
}

async function allowedTo(check: string, args?: Record<string, string>): Promise<boolean> {
  const { data, error } = await supabase.schema("neta_ops").rpc(check, args);
  if (error) {
    // Most often the migration hasn't run, and then there's nothing to edit anyway.
    console.error(`Failed to check ${check}:`, error);
    return false;
  }
  return data === true;
}

/** Admins and report reviewers. */
export const canEditDiagramDefaults = () => allowedTo("can_edit_diagram_defaults");

/** Those same people, plus this site's project managers and location project managers. */
export const canEditSiteDiagramSettings = (siteId: string) =>
  allowedTo("can_edit_site_diagram_settings", { p_site_id: siteId });

export async function createDiagram(
  siteId: string,
  name: string,
  sortOrder: number,
  userId: string | null,
): Promise<SiteDiagram> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .insert({
      site_id: siteId,
      name: name.trim(),
      sort_order: sortOrder,
      created_by: userId,
      updated_by: userId,
    })
    .select(DIAGRAM_COLUMNS)
    .single();

  if (error) throw error;
  return data as SiteDiagram;
}

export async function renameDiagram(
  diagramId: string,
  name: string,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .update({ name: name.trim(), updated_by: userId })
    .eq("id", diagramId);

  if (error) throw error;
}

/** A soft delete, so its symbols and lines can be restored. */
export async function deleteDiagram(diagramId: string, userId: string | null): Promise<void> {
  const { error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .update({ deleted_at: new Date().toISOString(), updated_by: userId })
    .eq("id", diagramId);

  if (error) throw error;
}

const symbolValues = ({ asset: _asset, label_width, ...row }: DiagramSymbolRow) =>
  labelWidthAvailable ? { ...row, label_width } : row;
const lineValues = ({ asset: _asset, ...row }: DiagramLineRow) => row;

async function deleteRows(table: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.schema("neta_ops").from(table).delete().in("id", ids);
  if (error) throw error;
}

async function upsertRows(table: string, rows: object[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.schema("neta_ops").from(table).upsert(rows);
  if (error) throw error;
}

/**
 * Writes one batch of edits. Every step can safely run twice, so a batch that fails partway
 * is simply sent again.
 *
 * The order matters. Deletes go first so an asset removed and placed again doesn't hit the
 * one-per-diagram rule, and symbols go before the lines that attach to them.
 *
 * The final update stamps the diagram itself, so it's always known when it last changed.
 */
export async function saveDiagramChanges(
  diagramId: string,
  changes: DiagramChanges,
  userId: string | null,
): Promise<void> {
  await deleteRows("diagram_lines", changes.removedLineIds);
  await deleteRows("diagram_symbols", changes.removedSymbolIds);

  await upsertRows(
    "diagram_symbols",
    changes.addedSymbols.map((row) => ({ ...symbolValues(row), created_by: userId })),
  );
  await upsertRows("diagram_symbols", changes.changedSymbols.map(symbolValues));

  await upsertRows(
    "diagram_lines",
    changes.addedLines.map((row) => ({ ...lineValues(row), created_by: userId })),
  );
  await upsertRows("diagram_lines", changes.changedLines.map(lineValues));

  const { error } = await supabase
    .schema("neta_ops")
    .from("site_diagrams")
    .update({ updated_by: userId })
    .eq("id", diagramId);

  if (error) throw error;
}
