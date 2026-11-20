import { supabase } from "@/lib/supabase";

/**
 * Data for the Roles & permissions screen (Roles scope item 3).
 * Reads tables from permissions_01_list.sql; saves go through the checked
 * functions in permissions_03_screen.sql. Nothing here changes today's access.
 */

export interface PermissionRow {
  key: string;
  area: string;
  label: string;
  description: string;
  sort_order: number;
}

export interface RoleRow {
  key: string;
  label: string;
  is_system: boolean;
  copied_from: string | null;
  legacy_names: string[];
  sort_order: number;
}

export interface PersonRow {
  id: string;
  email: string;
  name: string;
  today_role: string | null;
  new_role: string | null;
  new_role_picked: boolean;
  is_active: boolean;
  last_sign_in_at: string | null;
}

export interface AccessChange {
  id: number;
  changed_at: string;
  changed_by: string | null;
  action: "person_role" | "role_ticks" | "person_extra" | "role_copied" | "role_deleted";
  role_key: string | null;
  user_id: string | null;
  permission_key: string | null;
  detail: Record<string, any>;
}

export interface Catalog {
  permissions: PermissionRow[];
  roles: RoleRow[];
  /** role key -> its ticked permission keys */
  ticks: Map<string, Set<string>>;
}

export const SUPER_ADMIN = "super_admin";

const common = () => supabase.schema("common");

/** Turn a database error into one plain sentence. */
export function plainError(err: unknown): string {
  const msg = (err as { message?: string })?.message || String(err);
  if (/does not exist|could not find the function|schema cache/i.test(msg)) {
    return "The database step for this screen hasn't been run yet.";
  }
  if (/failed to fetch|network/i.test(msg)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return msg;
}

export async function loadCatalog(): Promise<Catalog> {
  const [p, r, rp] = await Promise.all([
    common().from("permissions").select("key, area, label, description, sort_order").order("sort_order"),
    common().from("roles").select("key, label, is_system, copied_from, legacy_names, sort_order").order("sort_order"),
    common().from("role_permissions").select("role_key, permission_key"),
  ]);
  const error = p.error || r.error || rp.error;
  if (error) throw error;

  const ticks = new Map<string, Set<string>>();
  for (const role of (r.data ?? []) as RoleRow[]) ticks.set(role.key, new Set());
  for (const row of (rp.data ?? []) as { role_key: string; permission_key: string }[]) {
    if (!ticks.has(row.role_key)) ticks.set(row.role_key, new Set());
    ticks.get(row.role_key)!.add(row.permission_key);
  }
  return {
    permissions: (p.data ?? []) as PermissionRow[],
    roles: (r.data ?? []) as RoleRow[],
    ticks,
  };
}

export async function loadPeople(): Promise<PersonRow[]> {
  const { data, error } = await common().rpc("roles_people");
  if (error) throw error;
  return (data ?? []) as PersonRow[];
}

export async function loadHistory(limit = 200): Promise<AccessChange[]> {
  const { data, error } = await common()
    .from("access_changes")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AccessChange[];
}

/** role null = clear the pick so the new role follows today's role again. */
export async function setPeopleRole(userIds: string[], role: string | null): Promise<void> {
  const { error } = await common().rpc("set_people_role", { p_user_ids: userIds, p_role: role });
  if (error) throw error;
  // Email the Super Admins (item 5). Never blocks or fails the change itself.
  supabase.functions
    .invoke("role-change-notify", { body: { user_ids: userIds } })
    .then(({ error: notifyError }) => {
      if (notifyError) console.warn("Role change email not sent", notifyError);
    })
    .catch((err) => console.warn("Role change email not sent", err));
}

export async function saveRoleTicks(
  changes: { role: string; permission: string; on: boolean }[],
): Promise<void> {
  const { error } = await common().rpc("save_role_ticks", { p_changes: changes });
  if (error) throw error;
}

export async function copyRole(from: string, label: string): Promise<string> {
  const { data, error } = await common().rpc("copy_role", { p_from: from, p_label: label });
  if (error) throw error;
  return data as string;
}

export async function deleteRole(key: string): Promise<void> {
  const { error } = await common().rpc("delete_role", { p_key: key });
  if (error) throw error;
}

/** One person's extras: permission key -> true (added) / false (taken away). */
export async function loadPersonExtras(userId: string): Promise<Map<string, boolean>> {
  const { data, error } = await common()
    .from("user_permission_overrides")
    .select("permission_key, granted")
    .eq("user_id", userId);
  if (error) throw error;
  return new Map(((data ?? []) as { permission_key: string; granted: boolean }[]).map((r) => [r.permission_key, r.granted]));
}

/** One person's picked new role, or null when it still follows today's role. */
export async function loadPickedRole(userId: string): Promise<string | null> {
  const { data, error } = await common().from("user_roles").select("role_key").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as { role_key: string } | null)?.role_key ?? null;
}

/** granted null = back to what the role says. */
export async function setPersonExtra(userId: string, permission: string, granted: boolean | null): Promise<void> {
  const { error } = await common().rpc("set_person_extra", {
    p_user: userId,
    p_permission: permission,
    p_granted: granted,
  });
  if (error) throw error;
}

/** Today's role name -> new role key, the same mapping the database uses. */
export function roleFromToday(roles: RoleRow[], todayRole: string | null | undefined): string | null {
  if (!todayRole) return null;
  const hit = roles.find((r) => r.legacy_names.includes(todayRole));
  return hit?.key ?? null;
}

/** Areas in list order, each with its permissions. */
export function groupByArea(permissions: PermissionRow[]): { area: string; items: PermissionRow[] }[] {
  const out: { area: string; items: PermissionRow[] }[] = [];
  for (const p of permissions) {
    const last = out[out.length - 1];
    if (last && last.area === p.area) last.items.push(p);
    else out.push({ area: p.area, items: [p] });
  }
  return out;
}
