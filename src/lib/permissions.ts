import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  canNow,
  isSubcontractorNow,
  loadPermissionsFor,
  permissionsReady,
  permissionsVersion,
  subscribePermissions,
} from "@/lib/permissionStore";

/**
 * Roles & Permissions item 1: the one list of permissions.
 *
 * Keys are permanent. They mirror common.permissions
 * (database/migrations/permissions_01_list.sql): add a key in both places,
 * never rename one. Labels and descriptions live in the database.
 *
 * The database check is common.can('key'). This file's useCan() reads the
 * same answer, loaded once per session via common.my_permissions().
 * Every screen asks these, never the old role name (switch-over, Nov 23).
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
  "jobs.invite_subcontractors",
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

// The loader and cache live in permissionStore.ts (no React), so plain functions
// (roles.ts, services) can ask too: canNow("reports.review").
export { canNow, clearPermissionCache } from "@/lib/permissionStore";

/**
 * const { can, loading } = useCan();
 * if (can("billing.edit_sov")) ...
 *
 * Fails closed: while loading, signed out, or on error, can() is false.
 * RequireAuth waits for permissions, so inside the app they're already loaded.
 * This hides buttons only. The database checks common.can() too.
 */
export function useCan(): { can: (key: PermissionKey) => boolean; loading: boolean } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const version = useSyncExternalStore(subscribePermissions, permissionsVersion, permissionsVersion);

  useEffect(() => {
    if (userId) void loadPermissionsFor(userId);
  }, [userId]);

  const ready = permissionsReady(userId);
  // version: a new answer from the database makes a new can(), so screens refresh
  const can = useCallback((key: PermissionKey) => ready && canNow(key), [ready, version]);
  return { can, loading: !ready };
}

/** An invited outside subcontractor: the app shows them only their jobs and reports. */
export function useIsSubcontractor(): boolean {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useSyncExternalStore(subscribePermissions, permissionsVersion, permissionsVersion);
  return permissionsReady(userId) && isSubcontractorNow();
}

/**
 * Admin dashboard pages and the permissions that open each one (any one listed).
 * The dashboard itself opens for anyone who can open at least one page.
 */
export const ADMIN_PAGE_PERMISSIONS: Record<string, PermissionKey[]> = {
  "/admin-dashboard/people": ["admin.manage_users", "admin.manage_roles"],
  "/admin-dashboard/in-progress": ["jobs.view_money"],
  "/admin-dashboard/report-time": ["admin.view_logs"],
  "/admin-dashboard/quickbooks": ["admin.integrations"],
  "/custom-forms/templates": ["reports.custom_forms"],
  "/admin-dashboard/system-health": ["admin.view_logs"],
  "/admin-dashboard/system-logs": ["admin.view_logs"],
  "/admin-dashboard/integrations": ["admin.integrations"],
  "/admin-dashboard/notification-controls": ["admin.company_settings"],
  "/admin-dashboard/calibration-recipients": ["admin.company_settings"],
  "/admin-dashboard/site-theme": ["admin.company_settings"],
};

export const ADMIN_PORTAL_KEYS: PermissionKey[] = [
  ...new Set(Object.values(ADMIN_PAGE_PERMISSIONS).flat()),
];

/** Can open the Admin dashboard (at least one of its pages). */
export function canOpenAdminPortal(can: (key: PermissionKey) => boolean = canNow): boolean {
  return ADMIN_PORTAL_KEYS.some(can);
}
