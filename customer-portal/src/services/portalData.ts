import { supabase } from "@/lib/supabase";

// NOTE on security: none of these queries filter by customer_id themselves.
// Postgres RLS + the common.customer_report_assets() SECURITY DEFINER function
// (Database Scripts/Setup & Configuration/customer_portal_*.sql) restrict every
// read to the signed-in customer's own jobs and their approved/sent report-assets.
// A client-side account filter would be redundant and must never be relied upon.

const NETA = "neta_ops";
const CUSTOMER_BRAND_BUCKET = "customer-brand-assets";

export interface Job {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  site_address: string | null;
  division: string | null;
  created_at: string | null;
  due_date: string | null;
}

/**
 * A customer-facing report. In ampOS this is a neta_ops.assets row (the report
 * deliverable) with status approved/sent, joined to its job.
 */
export interface ReportAsset {
  asset_id: string;
  asset_name: string | null;
  file_url: string | null;
  substation: string | null;
  status: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  published_pdf_path: string | null;
  job_id: string;
  job_number: string | null;
  job_title: string | null;
}

/**
 * A "Report Packet" — the customer-facing view of a delivered neta_ops.deliverables
 * row. `report_asset_ids` are the asset ids bundled into the packet; the portal
 * resolves each one against the customer's own report-assets, so a packet never
 * exposes a report the customer couldn't already open.
 */
export interface Deliverable {
  id: string;
  job_id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  delivered_at: string | null;
  created_at: string | null;
  report_asset_ids: string[] | null;
}

export interface Company {
  id: string;
  name: string | null;
  company_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  logo_url: string | null;
  brand_primary: string | null;
}

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  is_primary: boolean | null;
}

/** The signed-in customer's own company record (scoped by the DB function). */
export async function getCompany(): Promise<Company | null> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("customer_company");
  if (error) throw error;
  const rows = (data ?? []) as Company[];
  return rows[0] ?? null;
}

/** Update the four customer-editable company fields (server re-scopes to own company). */
export async function updateCompany(input: {
  company_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .rpc("customer_update_company", {
      p_company_name: input.company_name,
      p_address: input.address,
      p_phone: input.phone,
      p_email: input.email,
    });
  if (error) throw error;
}

/** Store the customer-facing logo and selected primary brand color. */
export async function updateCompanyBranding(input: {
  logo_url: string | null;
  brand_primary: string | null;
}): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .rpc("customer_update_branding", {
      p_logo_url: input.logo_url,
      p_brand_primary: input.brand_primary,
    });
  if (error) throw error;
}

/** Upload a PNG/SVG company logo to the signed-in customer's storage folder. */
export async function uploadCompanyLogo(
  file: File,
  customerId: string,
): Promise<string> {
  const extension = logoExtension(file);
  if (!extension) {
    throw new Error("Logo must be a PNG or SVG file.");
  }

  const fileName = `company-logo-${Date.now()}-${randomId()}.${extension}`;
  const path = `${customerId}/${fileName}`;
  const { error } = await supabase.storage
    .from(CUSTOMER_BRAND_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType:
        file.type || (extension === "svg" ? "image/svg+xml" : "image/png"),
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(CUSTOMER_BRAND_BUCKET)
    .getPublicUrl(path);
  if (!data.publicUrl)
    throw new Error("Logo uploaded, but no public URL was returned.");
  return data.publicUrl;
}

function logoExtension(file: File): "png" | "svg" | null {
  const name = file.name.toLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) return "png";
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  return null;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2, 10);
}

/** Contacts for the signed-in customer's company (scoped by the DB function), primary first. */
export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("customer_contacts");
  if (error) throw error;
  return (data ?? []) as Contact[];
}

/**
 * The contact record corresponding to the signed-in portal user.
 *
 * `common.customer_users` currently links auth users to customer companies, not
 * individual contacts, so the safest available link is the user's sign-in email
 * matched against their own company's RLS-scoped contacts.
 */
export async function getCurrentUserContact(
  email: string | null | undefined,
): Promise<Contact | null> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const contacts = await getContacts();
  return (
    contacts.find(
      (contact) => contact.email?.trim().toLowerCase() === normalizedEmail,
    ) ?? null
  );
}

/** Create (id null) or update one of the company's contacts. */
export async function upsertContact(input: {
  id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .rpc("customer_upsert_contact", {
      p_id: input.id,
      p_first_name: input.first_name,
      p_last_name: input.last_name,
      p_email: input.email,
      p_phone: input.phone,
      p_position: input.position,
      p_is_primary: input.is_primary,
    });
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .rpc("customer_delete_contact", { p_id: id });
  if (error) throw error;
}

/** All jobs the signed-in customer has given AMP (RLS-scoped). */
export async function getJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .schema(NETA)
    .from("jobs")
    .select(
      "id, job_number, title, status, site_address, division, created_at, due_date",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function getJob(jobId: string): Promise<Job | null> {
  const { data, error } = await supabase
    .schema(NETA)
    .from("jobs")
    .select(
      "id, job_number, title, status, site_address, division, created_at, due_date",
    )
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Job) ?? null;
}

/**
 * Every approved/sent report-asset for the customer, with its job info.
 * Backed by the common.customer_report_assets() SECURITY DEFINER function.
 */
export async function getReportAssets(): Promise<ReportAsset[]> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("customer_report_assets");
  if (error) throw error;
  return (data ?? []) as ReportAsset[];
}

/** Report-assets for a single job. */
export async function getReportAssetsForJob(
  jobId: string,
): Promise<ReportAsset[]> {
  const all = await getReportAssets();
  return all.filter((r) => r.job_id === jobId);
}

/**
 * Delivered report packets for the customer, with their job + bundled asset ids.
 * Backed by the common.customer_deliverables() SECURITY DEFINER function.
 */
export async function getDeliverables(): Promise<Deliverable[]> {
  const { data, error } = await supabase
    .schema("common")
    .rpc("customer_deliverables");
  if (error) throw error;
  return (data ?? []) as Deliverable[];
}

/** Report packets for a single job. */
export async function getDeliverablesForJob(
  jobId: string,
): Promise<Deliverable[]> {
  const all = await getDeliverables();
  return all.filter((d) => d.job_id === jobId);
}

/** Count report-assets per job id, for the jobs list. */
export function countAssetsByJob(
  assets: ReportAsset[],
): Record<string, number> {
  return assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.job_id] = (acc[a.job_id] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Request a short-lived signed URL for a report-asset's published PDF. The
 * customer-report-download edge function re-checks (via customer_report_assets)
 * that the asset belongs to the signed-in customer before signing; the bucket
 * stays private.
 */
export async function getReportDownloadUrl(assetId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "customer-report-download",
    {
      body: { asset_id: assetId },
    },
  );
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error) detail = b.error;
      } catch {
        /* no json body */
      }
    }
    throw new Error(detail);
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("No download URL returned.");
  return url;
}

/**
 * Flag a report-asset for review. Backed by the common.flag_report() SECURITY
 * DEFINER function, which re-checks (via customer_can_select_asset) that the
 * report belongs to the signed-in customer before recording the flag. Flagging
 * does NOT change the report's status — it stays visible in the portal. After
 * the flag is recorded, fire a best-effort notification to AMP staff.
 */
export async function flagReport(
  assetId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .rpc("flag_report", { p_asset_id: assetId, p_reason: reason });
  if (error) throw error;

  // Notify staff (fire-and-forget — never block or fail the flag on this).
  const fnUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (fnUrl && anonKey) {
    fetch(
      `${fnUrl.replace(/\/rest\/v1.*$/, "")}/functions/v1/customer-report-flag-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ assetId, reason }),
      },
    ).catch(() => {});
  }
}

/**
 * A report is openable when it has a published PDF (rendered + stored on send),
 * or its file_url is already a direct PDF link.
 */
export function isOpenable(report: ReportAsset): boolean {
  return (
    !!report.published_pdf_path ||
    (!!report.file_url && /^https?:\/\//i.test(report.file_url))
  );
}
