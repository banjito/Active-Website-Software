import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getViewAs } from "@/lib/viewAs";

/**
 * Who is Super Admin, for the signed-in person (Roles scope item 5).
 *
 * Super Admin is a role, not an email list. The database answers it
 * (common.my_role_key() = 'super_admin'). Until that answer arrives, today's
 * role name stands in, so a Super Admin never sees a flash of missing menus.
 *
 * Kept free of React and AuthContext so roles.ts can import it without a cycle.
 */

let current: { userId: string; email: string; fromToday: boolean; fromRole: boolean | null } | null = null;

function prime(user: User | null): void {
  if (!user?.email) {
    current = null;
    return;
  }
  const email = user.email.toLowerCase();
  const fromToday = user.user_metadata?.role === "Super Admin";
  if (current?.userId === user.id) {
    current.fromToday = fromToday;
    return;
  }
  const entry = { userId: user.id, email, fromToday, fromRole: null as boolean | null };
  current = entry;
  // Not inside the auth callback itself: supabase-js can deadlock on calls made there.
  setTimeout(() => {
    supabase
      .schema("common")
      .rpc("my_role_key")
      .then(({ data, error }) => {
        if (current !== entry) return;
        if (error) {
          console.warn("Could not check Super Admin role", error);
          return; // keep the stand-in
        }
        entry.fromRole = data === "super_admin";
      });
  }, 0);
}

supabase.auth.onAuthStateChange((_event, session) => prime(session?.user ?? null));

/** True when this email is the signed-in person and their role is Super Admin. */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email || !current) return false;
  if (email.toLowerCase() !== current.email) return false;
  const viewAs = getViewAs();
  if (viewAs) return viewAs.roleKey === "super_admin";
  return current.fromRole ?? current.fromToday;
}
