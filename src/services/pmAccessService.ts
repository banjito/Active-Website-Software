import { supabase } from "@/lib/supabase";
import { isSuperUser } from "@/lib/roles";
import type { DivisionLeads } from "@/services/divisionLeadsService";

/**
 * Who gets the PM Dashboard ("My Jobs" in the Field Tech menu).
 *
 * Two kinds of PM:
 *   - Full access: the roles below, super users, and division leads. They can see any
 *     location. Mirrors common.is_pm_or_admin().
 *   - A job's own PM (neta_ops.jobs.project_manager_id). They see only their jobs.
 *     Mirrors common.is_job_pm().
 *
 * Kept small on purpose: the sidebar imports it on every page.
 */

/** Jobs still being worked or billed. Finished, billed, and cancelled jobs drop off. */
export const ACTIVE_JOB_STATUSES = [
  "pending",
  "in_progress",
  "progress_billing",
  "ready_to_bill",
  "on_hold",
];

/** Roles with full PM Dashboard access. Keep in step with common.is_pm_or_admin(). */
export const PM_DASHBOARD_ROLES = [
  "Admin",
  "Super Admin",
  "Operations Manager",
  "Project Manager",
];

type PmUser =
  | { id?: string; email?: string | null; user_metadata?: { role?: string } }
  | null
  | undefined;

/** Full access: the roles above, super users, or anyone named as a division lead. */
export function canOpenPmDashboard(user: PmUser, leads: DivisionLeads): boolean {
  if (!user) return false;
  return (
    isSuperUser(user.email) ||
    PM_DASHBOARD_ROLES.includes(user.user_metadata?.role ?? "") ||
    Object.values(leads).some((lead) => lead?.id === user.id)
  );
}

// One lookup per person per page load. The sidebar re-mounts on every route, so without
// this each click would ask the database again. A new assignment shows after a reload.
const managesCache = new Map<string, Promise<boolean>>();

/** True when the person is the PM on at least one active job. */
export function managesActiveJobs(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return Promise.resolve(false);
  const cached = managesCache.get(userId);
  if (cached) return cached;

  const lookup = (async () => {
    const { count, error } = await supabase
      .schema("neta_ops")
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_manager_id", userId)
      .in("status", ACTIVE_JOB_STATUSES)
      .is("deleted_at", null);
    if (error) {
      // Try again next time instead of hiding the link for the whole session.
      managesCache.delete(userId);
      console.error("[PM access] Job PM lookup failed:", error);
      return false;
    }
    return (count ?? 0) > 0;
  })();

  managesCache.set(userId, lookup);
  return lookup;
}
