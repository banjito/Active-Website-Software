import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

/**
 * Roles & Permissions item 1: the one list of permissions.
 *
 * Keys are permanent. They mirror common.permissions
 * (database/migrations/permissions_01_list.sql): add a key in both places,
 * never rename one. Labels and descriptions live in the database.
 *
 * The database check is common.can('key'). This file's useCan() reads the
 * same answer, loaded once per session via common.my_permissions().
 */
export const PERMISSION_KEYS = [
  // Sales
  "sales.view_pipeline",
  "sales.edit_opportunities",
  "sales.log_interactions",
  "sales.manage_customers",
  // Estimates
  "estimates.view_prices",
  "estimates.edit",
  "estimates.manage_library",
  "estimates.send_proposal",
  "estimates.rfis",
  // Jobs
  "jobs.view_assigned",
  "jobs.view_all",
  "jobs.create",
  "jobs.edit_locked_info",
  "jobs.view_money",
  "jobs.documents",
  "jobs.change_orders",
  // Reports
  "reports.fill",
  "reports.review",
  "reports.export",
  "reports.publish",
  "reports.custom_forms",
  "reports.delete",
  // Billing
  "billing.view_sov",
  "billing.edit_sov",
  "billing.approve_month",
  "billing.send_invoice",
  "billing.lien_waivers",
  "billing.company_money",
  // Scheduling
  "schedule.view",
  "schedule.edit",
  "schedule.equipment",
  "schedule.approve_time",
  // HR
  "hr.view_own",
  "hr.view_all",
  "hr.payroll",
  "hr.send_documents",
  "hr.talent_pool",
  // Admin
  "admin.manage_users",
  "admin.manage_roles",
  "admin.make_super_admin",
  "admin.integrations",
  "admin.company_settings",
  "admin.view_logs",
  // Other portals
  "portal.lab",
  "portal.engineering",
  "portal.meetings",
  "portal.scav",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const KNOWN = new Set<string>(PERMISSION_KEYS);

// One load per signed-in user per session. A role change shows after a reload.
let cache: { userId: string; keys: Set<PermissionKey> } | null = null;
let inflight: { userId: string; promise: Promise<Set<PermissionKey>> } | null = null;

function loadPermissions(userId: string): Promise<Set<PermissionKey>> {
  if (cache?.userId === userId) return Promise.resolve(cache.keys);
  if (inflight?.userId === userId) return inflight.promise;

  const promise = (async () => {
    const { data, error } = await supabase.schema("common").rpc("my_permissions");
    if (error) throw error;
    const keys = new Set(
      ((data ?? []) as string[]).filter((k): k is PermissionKey => KNOWN.has(k)),
    );
    cache = { userId, keys };
    return keys;
  })();

  inflight = { userId, promise };
  promise.then(
    () => { if (inflight?.promise === promise) inflight = null; },
    () => { if (inflight?.promise === promise) inflight = null; },
  );
  return promise;
}

/** Forget the loaded set, e.g. right after changing someone's own role. */
export function clearPermissionCache(): void {
  cache = null;
  inflight = null;
}

/**
 * const { can, loading } = useCan();
 * if (can("billing.edit_sov")) ...
 *
 * Fails closed: while loading, signed out, or on error, can() is false.
 * This hides buttons only. The database must also check common.can() (item 7).
 */
export function useCan(): { can: (key: PermissionKey) => boolean; loading: boolean } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [keys, setKeys] = useState<Set<PermissionKey> | null>(() =>
    userId && cache?.userId === userId ? cache.keys : null,
  );

  useEffect(() => {
    if (!userId) {
      setKeys(new Set());
      return;
    }
    if (cache?.userId !== userId) setKeys(null);
    let live = true;
    loadPermissions(userId)
      .then((k) => { if (live) setKeys(k); })
      .catch((err) => {
        console.warn("Could not load permissions", err);
        if (live) setKeys(new Set());
      });
    return () => { live = false; };
  }, [userId]);

  const can = useCallback((key: PermissionKey) => !!keys?.has(key), [keys]);
  return { can, loading: keys === null };
}
