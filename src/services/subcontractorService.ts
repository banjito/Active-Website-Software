import { supabase } from "@/lib/supabase";

/**
 * Outside subcontractors on a job (Roles scope item 8).
 * Database: permissions_17 to _20. Invite email: supabase/functions/subcontractor-invite.
 */

export interface JobSubcontractor {
  user_id: string;
  name: string;
  email: string;
  company: string;
  added_at: string;
  last_sign_in_at: string | null;
}

export async function loadJobSubcontractors(jobId: string): Promise<JobSubcontractor[]> {
  const { data, error } = await supabase.schema("common").rpc("job_subcontractors", { p_job: jobId });
  if (error) throw error;
  return (data ?? []) as JobSubcontractor[];
}

/** Makes the account if needed, gives them the job, and emails a sign-in link. */
export async function inviteSubcontractor(input: {
  jobId: string;
  name: string;
  email: string;
  company: string;
}): Promise<{ emailed: boolean; existingUser: boolean }> {
  const { data, error } = await supabase.functions.invoke("subcontractor-invite", {
    body: { job_id: input.jobId, name: input.name, email: input.email, company: input.company },
  });
  // The function answers with { error } on a refusal; show that, not a generic failure.
  const message = (data as { error?: string } | null)?.error;
  if (message) throw new Error(message);
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error || error.message || "Could not send the invite.");
  }
  return {
    emailed: !!(data as { emailed?: boolean })?.emailed,
    existingUser: !!(data as { existingUser?: boolean })?.existingUser,
  };
}

/** Removed from their last job means they see nothing until invited again. */
export async function removeSubcontractorFromJob(jobId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .schema("common")
    .rpc("remove_subcontractor_from_job", { p_job: jobId, p_user: userId });
  if (error) throw error;
}

export interface SubcontractorJob {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  customer: string | null;
}

/** The jobs the signed-in subcontractor is invited to (the database only returns those). */
export async function loadMySubcontractorJobs(): Promise<SubcontractorJob[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("id, job_number, title, status, customer_id")
    .is("deleted_at", null)
    .order("job_number", { ascending: false });
  if (error) throw error;
  const jobs = (data ?? []) as { id: string; job_number: string | null; title: string | null; status: string | null; customer_id: string | null }[];
  const customerIds = [...new Set(jobs.map((j) => j.customer_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (customerIds.length) {
    const { data: customers } = await supabase
      .schema("common")
      .from("customers")
      .select("id, company_name, name")
      .in("id", customerIds);
    for (const c of (customers ?? []) as { id: string; company_name: string | null; name: string | null }[]) {
      names.set(c.id, c.company_name || c.name || "");
    }
  }
  return jobs.map((j) => ({
    id: j.id,
    job_number: j.job_number,
    title: j.title,
    status: j.status,
    customer: j.customer_id ? names.get(j.customer_id) ?? null : null,
  }));
}
