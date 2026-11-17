/**
 * "Is there a newer version of this report's form?" and the update itself.
 *
 * Reads are light (no structures) so the job's report list and the review
 * window can ask cheaply. The update goes through one database function,
 * neta_ops.upgrade_custom_form_instance_version, which refuses approved and
 * sent reports, refuses a stale copy (someone saved since), and logs the move
 * in the report history. See database/migrations/custom_form_version_upgrade.sql.
 */

import { supabase } from "@/lib/supabase";
import { isFormVersionLocked } from "./versionUpgrade";
import type { StoredInstanceData } from "./instanceState";

const SCHEMA = "neta_ops";

export interface VersionSummary {
  id: string;
  version: number;
  name: string;
  publishedAt: string | null;
  releaseNotes: string | null;
}

const SUMMARY_COLUMNS = "id, version, name, published_at, release_notes";

function toSummary(row: any): VersionSummary {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    publishedAt: row.published_at ?? null,
    releaseNotes: row.release_notes ?? null,
  };
}

/** The newest published version of a form, without its structure. */
export async function fetchLatestVersionSummary(
  templateId: string,
): Promise<VersionSummary | null> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("custom_form_template_versions")
    .select(SUMMARY_COLUMNS)
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return toSummary(data[0]);
}

/** Versions published after `afterVersion`, up to and including `upTo`, oldest first. */
export async function fetchVersionsBetween(
  templateId: string,
  afterVersion: number,
  upTo: number,
): Promise<VersionSummary[]> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("custom_form_template_versions")
    .select(SUMMARY_COLUMNS)
    .eq("template_id", templateId)
    .gt("version", afterVersion)
    .lte("version", upTo)
    .order("version", { ascending: true });
  if (error || !data) return [];
  return data.map(toSummary);
}

export function customFormFileUrl(jobId: string, templateId: string, instanceId: string) {
  return `custom-form:/jobs/${jobId}/custom-form/${templateId}/${instanceId}`;
}

/** Where the compare screen lives for one report. */
export function formVersionComparePath(jobId: string, templateId: string, instanceId: string) {
  return `/jobs/${jobId}/custom-form/${templateId}/${instanceId}/form-version`;
}

/** ['jobId', 'templateId', 'instanceId'] from a custom-form:/ file url. */
export function parseCustomFormFileUrl(
  fileUrl: string | null | undefined,
): { jobId: string; templateId: string; instanceId: string } | null {
  const m = /^custom-form:\/jobs\/([^/]+)\/custom-form\/([^/]+)\/([^/?#]+)/.exec(fileUrl ?? "");
  return m ? { jobId: m[1], templateId: m[2], instanceId: m[3] } : null;
}

/** The report's status (on its asset row). Null when it has no asset yet. */
export async function fetchReportAssetStatus(
  jobId: string,
  templateId: string,
  instanceId: string,
): Promise<{ assetId: string; status: string; name: string | null } | null> {
  const exact = await supabase
    .schema(SCHEMA)
    .from("assets")
    .select("id, status, name")
    .eq("file_url", customFormFileUrl(jobId, templateId, instanceId))
    .limit(1);
  let row: any = exact.data?.[0];
  if (!row) {
    // Older assets can carry a different path for the same report.
    const bySuffix = await supabase
      .schema(SCHEMA)
      .from("assets")
      .select("id, status, name, file_url")
      .like("file_url", `custom-form:/jobs/%/${instanceId}`)
      .limit(1);
    row = bySuffix.data?.[0];
  }
  return row ? { assetId: row.id, status: String(row.status ?? ""), name: row.name ?? null } : null;
}

export interface NewerVersionInfo {
  current: number;
  latest: VersionSummary;
  locked: boolean;
  comparePath: string;
}

/**
 * For the review window: does this report have a newer form version? Null
 * when it is current, unpinned, or anything fails (it is only a hint).
 */
export async function checkFormVersionForFileUrl(
  fileUrl: string,
  reportStatus: string | null | undefined,
): Promise<NewerVersionInfo | null> {
  const parts = parseCustomFormFileUrl(fileUrl);
  if (!parts) return null;
  const { data } = await supabase
    .schema(SCHEMA)
    .from("custom_form_instances")
    .select("template_id, template_version, template_version_id")
    .eq("id", parts.instanceId)
    .maybeSingle();
  if (!data?.template_version_id || data.template_version == null) return null;
  const latest = await fetchLatestVersionSummary(data.template_id ?? parts.templateId);
  if (!latest || latest.version <= data.template_version) return null;
  return {
    current: data.template_version,
    latest,
    locked: isFormVersionLocked(reportStatus),
    comparePath: formVersionComparePath(parts.jobId, data.template_id ?? parts.templateId, parts.instanceId),
  };
}

export interface OutdatedForm {
  current: number;
  latest: number;
  locked: boolean;
  comparePath: string;
}

/**
 * For a job's report list: which custom form reports have a newer form
 * version, keyed by asset id. Two small queries, whatever the job size.
 */
export async function fetchOutdatedFormVersions(
  assets: { id: string; file_url?: string | null; status?: string | null }[],
): Promise<Record<string, OutdatedForm>> {
  const byInstance = new Map<string, { assetId: string; status?: string | null; jobId: string }>();
  for (const a of assets) {
    const parts = parseCustomFormFileUrl(a.file_url);
    if (parts) byInstance.set(parts.instanceId, { assetId: a.id, status: a.status, jobId: parts.jobId });
  }
  if (byInstance.size === 0) return {};

  const ids = Array.from(byInstance.keys());
  const instances: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .schema(SCHEMA)
      .from("custom_form_instances")
      .select("id, template_id, template_version")
      .in("id", ids.slice(i, i + 200));
    if (error) return {};
    instances.push(...(data ?? []));
  }
  const templateIds = Array.from(
    new Set(instances.filter((r) => r.template_version != null).map((r) => r.template_id)),
  );
  if (templateIds.length === 0) return {};
  const { data: templates, error } = await supabase
    .schema(SCHEMA)
    .from("custom_form_templates")
    .select("id, latest_version")
    .in("id", templateIds);
  if (error || !templates) return {};
  const latestById = new Map(templates.map((t: any) => [t.id, Number(t.latest_version ?? 0)]));

  const out: Record<string, OutdatedForm> = {};
  for (const row of instances) {
    if (row.template_version == null) continue;
    const latest = latestById.get(row.template_id) ?? 0;
    if (latest <= row.template_version) continue;
    const link = byInstance.get(row.id)!;
    out[link.assetId] = {
      current: row.template_version,
      latest,
      locked: isFormVersionLocked(link.status),
      comparePath: formVersionComparePath(link.jobId, row.template_id, row.id),
    };
  }
  return out;
}

/** Window event fired after a report moves to a newer form version. */
export const FORM_VERSION_UPDATED_EVENT = "customFormVersionUpdated";

/**
 * Move a report onto a newer version. The database re-checks that the report
 * is not approved or sent and that nobody saved it since `expectedRevision`.
 */
export async function applyFormVersionUpgrade(args: {
  instanceId: string;
  versionId: string;
  expectedRevision: number | null;
  data: StoredInstanceData;
  status: string | null;
  note: string;
}): Promise<{ revision: number | null }> {
  const { data, error } = await supabase.schema(SCHEMA).rpc("upgrade_custom_form_instance_version", {
    p_instance_id: args.instanceId,
    p_version_id: args.versionId,
    p_expected_revision: args.expectedRevision,
    p_data: args.data,
    p_status: args.status,
    p_note: args.note,
  });
  if (error) {
    if (/function .*upgrade_custom_form_instance_version|schema cache/i.test(error.message)) {
      throw new Error(
        "Form version updates are not set up yet. Run database/migrations/custom_form_version_upgrade.sql in Supabase first.",
      );
    }
    throw new Error(error.message);
  }
  window.dispatchEvent(new CustomEvent(FORM_VERSION_UPDATED_EVENT, { detail: { instanceId: args.instanceId } }));
  return { revision: typeof data === "number" ? data : null };
}
