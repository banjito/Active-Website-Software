import { supabase } from "../supabase";
import { employeeEmailRegex } from "../companyConfig";

export interface RosterEmployee {
  id: string;
  email: string;
  name: string;
  division: string;
}

/**
 * Load the full employee roster for audience/assignment pickers.
 *
 * Reads ALL users via the `admin_get_users` RPC (which includes people who
 * exist in auth but have no `profiles` row yet — e.g. C&E folks) and merges
 * profile data on top. Falls back to the `profiles` table alone when the RPC
 * is unavailable (non-Admin callers). Mirrors the logic in EmployeeProfiles.
 */
export async function fetchEmployeeRoster(): Promise<RosterEmployee[]> {
  let allUsers: any[] = [];
  let usersError: any = null;

  const { data: usersData, error: usersErr } = await supabase
    .schema("common")
    .rpc("admin_get_users");
  if (usersErr) {
    const fallback = await supabase.rpc("admin_get_users");
    if (fallback.error) usersError = usersErr;
    else allUsers = fallback.data || [];
  } else {
    allUsers = usersData || [];
  }

  const { data: profilesData } = await supabase
    .schema("common")
    .from("profiles")
    .select("*");

  const profilesMap: Record<string, any> = {};
  (profilesData || []).forEach((p: any) => {
    profilesMap[p.id] = p;
  });

  // Non-Admin callers can't use the RPC — build the roster from profiles alone
  if (usersError || !allUsers || allUsers.length === 0) {
    allUsers = (profilesData || []).map((p: any) => ({
      id: p.id,
      email: p.email || "",
      raw_user_meta_data: p.user_metadata || {},
      user_metadata: p.user_metadata || {},
    }));
  }

  return allUsers
    .filter((u: any) => employeeEmailRegex.test((u.email || "").toLowerCase()))
    .map((u: any) => {
      const profile = profilesMap[u.id];
      return {
        id: u.id,
        email: u.email || "",
        name:
          profile?.full_name ||
          u.raw_user_meta_data?.name ||
          u.user_metadata?.name ||
          (u.email || "").split("@")[0] ||
          "Unknown",
        division:
          profile?.division ||
          u.raw_user_meta_data?.division ||
          u.user_metadata?.division ||
          "",
        employment_status: profile?.employment_status || "active",
      };
    })
    .filter((e: any) => e.employment_status === "active")
    .map(({ id, email, name, division }: any) => ({
      id,
      email,
      name,
      division,
    }))
    .sort((a: RosterEmployee, b: RosterEmployee) =>
      a.name.localeCompare(b.name),
    );
}
