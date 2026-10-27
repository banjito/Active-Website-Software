import { supabase } from "@/lib/supabase";

// Engineering-division jobs belong to AMP or to the engineering company (C&E
// Design): neta_ops.jobs.engineering_company, see
// database/migrations/add_job_engineering_company.sql. C&E jobs open on the
// engineering portal's job page instead of the normal one.

/** Postgres "column does not exist": the instance has not run the migration. */
export const UNDEFINED_COLUMN = "42703";

/** Where every engineering job opens; the route picks the C&E or AMP page. */
export const engineeringJobPath = (id: string) => `/engineering/jobs/${id}`;

/**
 * Whether a job is a C&E job. null when the column doesn't exist yet, so
 * callers can hide the switch instead of breaking the page.
 */
export async function fetchEngineeringCompany(jobId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("engineering_company")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_COLUMN) return null;
    throw error;
  }
  return !!(data as any)?.engineering_company;
}

export async function setEngineeringCompany(jobId: string, value: boolean): Promise<void> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .update({ engineering_company: value, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Update not permitted or job not found (RLS).");
}
