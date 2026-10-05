import { supabase } from "@/lib/supabase";
import { REPORTS } from "./reportRegistry";

/**
 * The offline app has no jobs. Reports still need a job id in their route
 * (/jobs/:id/<slug>/:reportId) because they read it from the URL, so every
 * report is filed under this fixed internal id. The tech never sees it; the
 * real job is chosen when the report is imported on the main app's job page.
 */
export const OFFLINE_JOB_ID = "offline";

export interface SavedReport {
  assetId: string;
  name: string;
  status: string | null;
  created_at: string | null;
  /** When it was last written to an export file, if ever. */
  exported_at: string | null;
  /** Route that opens the saved report, e.g. /jobs/offline/<slug>/<id>. */
  route: string;
  slug: string;
  reportTypeName: string;
}

/**
 * Every saved report, newest first. Each report save already writes an
 * `assets` row whose file_url is `report:/jobs/<job>/<slug>/<id>`, so this
 * needs nothing from the reports themselves.
 */
export async function listSavedReports(): Promise<SavedReport[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as Record<string, any>[])
    .filter((a) => typeof a.file_url === "string" && a.file_url.startsWith("report:/jobs/"))
    .map((a) => {
      const route = a.file_url.slice("report:".length);
      const slug = route.split("/")[3] ?? "";
      return {
        assetId: a.id,
        name: a.name || "Untitled report",
        status: a.status ?? null,
        created_at: a.created_at ?? null,
        exported_at: a.exported_at ?? null,
        route,
        slug,
        reportTypeName: REPORTS.find((r) => r.slug === slug)?.name ?? slug,
      };
    });
}

export interface ExportResult {
  ok: boolean;
  path?: string;
  count?: number;
  /** Names of picked reports with no saved data (left out of the file). */
  skipped?: string[];
  error?: string;
}

/**
 * Asks where to save, then writes the picked reports to one .amp-report file
 * (built in the main process, electron/main/main.cts exportReportsBundle). The
 * main app imports it from a job page ("Upload Offline Report").
 */
export async function exportReports(assetIds: string[]): Promise<ExportResult> {
  const api = (window as any).electronAPI;
  if (!api?.reports?.export) return { ok: false, error: "Export only works in the desktop app." };
  return api.reports.export(assetIds);
}
