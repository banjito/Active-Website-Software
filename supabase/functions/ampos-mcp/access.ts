// Who can use which tools. Mirrors what the ampOS app shows each role, so the
// connector never shows someone more than the app would.
//
// MIRROR of src/lib/roles.ts: roles whose `portals` include 'sales'. Update both
// together. Superusers (COMPANY_SUPERUSER_EMAILS) always qualify, like the app.

import type { User } from "npm:@supabase/supabase-js@2.57.2";
import { COMPANY_SUPERUSER_EMAILS } from "../_shared/companyConfig.ts";

const SALES_PORTAL_ROLES = new Set(["Sales Representative", "Admin"]);

export const roleOf = (user: User): string => String(user.user_metadata?.role ?? "");

export const isSuperUser = (user: User): boolean =>
  !!user.email && COMPANY_SUPERUSER_EMAILS.includes(user.email.toLowerCase());

/** Sales portal: opportunities, quotes, estimates, RFIs, pipeline. */
export const canUseSales = (user: User): boolean => isSuperUser(user) || SALES_PORTAL_ROLES.has(roleOf(user));

/** Job Profitability tab (QuickBooks actuals): Admin or superuser, as in JobDetail.tsx. */
export const canSeeProfitability = (user: User): boolean => isSuperUser(user) || roleOf(user) === "Admin";
