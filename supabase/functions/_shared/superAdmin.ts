/**
 * Super Admin is a role, not an email list (Roles scope item 5,
 * database/migrations/permissions_04_super_admin.sql).
 */

/**
 * The real answer, from the database: is this email's account a Super Admin?
 * `client` must be a service-role Supabase client.
 */
// deno-lint-ignore no-explicit-any
export async function isSuperAdmin(client: any, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await client.schema("common").rpc("is_superuser_email", { p_email: email });
  if (error) {
    console.error("is_superuser_email failed", error);
    return false;
  }
  return data === true;
}

/**
 * Quick check from the login token alone, for code that can't wait on the
 * database. Uses today's role name, so a picked-but-not-live Super Admin
 * shows up only after switch-over. Those people are Admins today anyway.
 */
export const isSuperAdminByRoleName = (user: { user_metadata?: Record<string, unknown> } | null | undefined): boolean =>
  String(user?.user_metadata?.role ?? "") === "Super Admin";
