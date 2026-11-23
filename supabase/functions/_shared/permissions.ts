// The new permissions (Admin → People & roles → Roles), for edge functions.
// Same answer as common.can() in the database, for any person.

/**
 * Does this person have the permission? `client` must be a service-role
 * Supabase client (common.user_can is not open to the app).
 */
// deno-lint-ignore no-explicit-any
export async function userCan(client: any, userId: string | null | undefined, key: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await client.schema("common").rpc("user_can", { p_user: userId, p_key: key });
  if (error) {
    console.error("user_can failed", error);
    return false;
  }
  return data === true;
}
