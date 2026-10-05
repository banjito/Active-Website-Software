import { supabase } from "@/lib/supabase";
import { REPORTS } from "./reportRegistry";

/**
 * Local jobs for the offline app. They live in the same tables the online app
 * uses (neta_ops.jobs + common.customers), so every report fills its header
 * (Customer, Job #, site address) exactly as it does online, with no report
 * changes. Reports read job: title, job_number, customer_id, site_address and
 * customer: name, company_name, address.
 */

export interface OfflineJob {
  id: string;
  job_number: string;
  title: string;
  site_address: string;
  customer_id: string | null;
  customerName: string;
  created_at?: string;
}

export interface OfflineJobInput {
  job_number: string;
  title: string;
  customerName: string;
  site_address: string;
}

export interface OfflineJobReport {
  assetId: string;
  name: string;
  status: string | null;
  created_at: string | null;
  /** Hash route that opens the saved report, e.g. /jobs/<job>/<slug>/<id>. */
  route: string;
  reportTypeName: string;
}

/** Reports saved before local jobs existed were all filed under this job id. */
export const UNASSIGNED_JOB_ID = "offline";

type Row = Record<string, any>;

async function customerNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data, error } = await supabase
    .schema("common")
    .from("customers")
    .select("id, name, company_name")
    .in("id", ids);
  if (error) throw error;
  for (const c of (data ?? []) as Row[]) {
    names.set(c.id, c.company_name || c.name || "");
  }
  return names;
}

function toJob(row: Row, names: Map<string, string>): OfflineJob {
  return {
    id: row.id,
    job_number: row.job_number ?? "",
    title: row.title ?? "",
    site_address: row.site_address ?? "",
    customer_id: row.customer_id ?? null,
    customerName: (row.customer_id && names.get(row.customer_id)) || "",
    created_at: row.created_at,
  };
}

export async function listJobs(): Promise<OfflineJob[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const names = await customerNames(
    rows.map((r) => r.customer_id).filter(Boolean),
  );
  return rows.map((r) => toJob(r, names));
}

export async function getJob(id: string): Promise<OfflineJob | null> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Row;
  const names = await customerNames(row.customer_id ? [row.customer_id] : []);
  return toJob(row, names);
}

/** Another local job already using this job #, if any. */
export async function findJobByNumber(
  jobNumber: string,
  exceptId?: string,
): Promise<OfflineJob | null> {
  const wanted = jobNumber.trim().toLowerCase();
  if (!wanted) return null;
  const jobs = await listJobs();
  return (
    jobs.find(
      (j) => j.id !== exceptId && j.job_number.trim().toLowerCase() === wanted,
    ) ?? null
  );
}

/** Creates a job (no `existing`) or updates one. Returns the job id. */
export async function saveJob(
  input: OfflineJobInput,
  existing?: OfflineJob | null,
): Promise<string> {
  const customer = {
    name: input.customerName.trim(),
    company_name: input.customerName.trim(),
    address: input.site_address.trim(),
  };
  const job = {
    job_number: input.job_number.trim(),
    title: input.title.trim(),
    site_address: input.site_address.trim(),
  };

  let customerId = existing?.customer_id ?? null;
  if (customerId) {
    const { error } = await supabase
      .schema("common")
      .from("customers")
      .update(customer)
      .eq("id", customerId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .schema("common")
      .from("customers")
      .insert(customer)
      .select("id")
      .single();
    if (error) throw error;
    customerId = (data as Row).id;
  }

  if (existing) {
    const { error } = await supabase
      .schema("neta_ops")
      .from("jobs")
      .update({ ...job, customer_id: customerId })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .insert({ ...job, customer_id: customerId })
    .select("id")
    .single();
  if (error) throw error;
  return (data as Row).id;
}

/** Number of saved reports per job id. */
export async function reportCountsByJob(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .select("job_id, asset_id");
  if (error) throw error;
  const seen = new Map<string, Set<string>>();
  for (const link of (data ?? []) as Row[]) {
    if (!seen.has(link.job_id)) seen.set(link.job_id, new Set());
    seen.get(link.job_id)!.add(link.asset_id);
  }
  return new Map([...seen].map(([jobId, ids]) => [jobId, ids.size]));
}

/**
 * The job's saved reports, newest first. Every report save already writes an
 * `assets` row (file_url `report:/jobs/<job>/<slug>/<id>`) plus a `job_assets`
 * link, so this needs nothing from the reports themselves.
 */
export async function listJobReports(jobId: string): Promise<OfflineJobReport[]> {
  const { data: links, error: linkError } = await supabase
    .schema("neta_ops")
    .from("job_assets")
    .select("asset_id")
    .eq("job_id", jobId);
  if (linkError) throw linkError;
  const assetIds = [...new Set(((links ?? []) as Row[]).map((l) => l.asset_id))];
  if (!assetIds.length) return [];

  const { data: assets, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("*")
    .in("id", assetIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((assets ?? []) as Row[])
    .filter((a) => typeof a.file_url === "string" && a.file_url.startsWith("report:/jobs/"))
    .map((a) => {
      const route = a.file_url.slice("report:".length);
      const slug = route.split("/")[3] ?? "";
      return {
        assetId: a.id,
        name: a.name || "Untitled report",
        status: a.status ?? null,
        created_at: a.created_at ?? null,
        route,
        reportTypeName: REPORTS.find((r) => r.slug === slug)?.name ?? slug,
      };
    });
}
