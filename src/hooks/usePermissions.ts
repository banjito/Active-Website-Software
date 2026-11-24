import { ADMIN_PORTAL_KEYS, useCan, type PermissionKey } from '@/lib/permissions';
import type { Portal } from '@/lib/roles';

/** Which permissions open each portal (any one listed). */
const PORTAL_PERMISSIONS: Record<Portal, PermissionKey[]> = {
  hr: ['hr.view_own'],
  sales: ['sales.view_pipeline'],
  neta: ['jobs.view_assigned', 'jobs.view_all'],
  field_tech: ['jobs.view_assigned', 'jobs.view_all'],
  office: ['billing.view_sov'],
  engineering: ['portal.engineering'],
  scavenger: ['portal.scav'],
  meetings: ['portal.meetings'],
  admin: ADMIN_PORTAL_KEYS,
};

const OLD_PERMISSIONS: Record<'canManageUsers' | 'canManageContent' | 'canViewAllData', PermissionKey> = {
  canManageUsers: 'admin.manage_users',
  canManageContent: 'admin.company_settings',
  canViewAllData: 'jobs.view_all',
};

/** Portal access, from the new permissions (Admin → People & roles → Roles). */
export function usePermissions() {
  const { can } = useCan();

  const checkPortalAccess = (portal: Portal): boolean =>
    (PORTAL_PERMISSIONS[portal] ?? []).some(can);

  const checkPermission = (permission: keyof typeof OLD_PERMISSIONS): boolean =>
    can(OLD_PERMISSIONS[permission]);

  return { checkPortalAccess, checkPermission };
}
