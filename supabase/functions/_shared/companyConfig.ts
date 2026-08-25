/**
 * Company-specific values for edge functions — the server-side counterpart of
 * src/lib/companyConfig.ts.
 *
 * Override per-instance with COMPANY_* function secrets; with none set, the
 * defaults reproduce the AMP instance exactly (including which mailbox each
 * notification falls back to).
 */

const env = (name: string, fallback: string): string => {
  const value = Deno.env.get(name)?.trim();
  return value ? value : fallback;
};

/** Short company name (email From display names like "AMP System"). */
export const COMPANY_NAME = env("COMPANY_NAME", "AMP");

/** Accounting mailbox for billing digests. */
export const COMPANY_ACCOUNTING_EMAIL = env(
  "ACCOUNTING_NOTIFICATION_EMAIL",
  env("COMPANY_ACCOUNTING_EMAIL", "accounting@ampqes.com")
);

/** Full company name used in email footers and report text. */
export const COMPANY_FULL_NAME = env(
  "COMPANY_FULL_NAME",
  "AMP Quality Energy Services"
);

/** Admin who receives report-flag / issue-resolved notifications. */
export const COMPANY_ADMIN_EMAIL = env(
  "COMPANY_ADMIN_EMAIL",
  "jack.lyons@ampqes.com"
);

/** Operations mailbox: default sender and billing-notification recipient. */
export const COMPANY_OPS_EMAIL = env(
  "COMPANY_OPS_EMAIL",
  "jack.lyons@ampqes.com"
);

/**
 * Mailbox copied on every HR approval notification, so HR keeps visibility
 * into requisitions and offers even when nobody there is in the chain.
 */
export const COMPANY_HR_EMAIL = env(
  "HR_NOTIFICATION_EMAIL",
  env("COMPANY_HR_EMAIL", COMPANY_ADMIN_EMAIL)
);

/**
 * Addresses that never receive notifications, even when they turn up as an
 * issue reporter or interested party. Departed staff go here so stale rows in
 * the database don't keep mailing them.
 */
export const COMPANY_SUPPRESSED_EMAILS = env(
  "COMPANY_SUPPRESSED_EMAILS",
  "john.chambers@ampqes.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Emails allowed to use the admin password-reset function. */
export const COMPANY_SUPERUSER_EMAILS = env(
  "COMPANY_SUPERUSER_EMAILS",
  "john.chambers@ampqes.com,jack.lyons@ampqes.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Domains whose accounts count as employees in server-side checks
 * (portal invite/revoke, report publish/unpublish).
 */
export const COMPANY_EMPLOYEE_DOMAINS = env(
  "COMPANY_EMPLOYEE_DOMAINS",
  "@ampqes.com,@cedsi.com"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/**
 * Staff roles, mirroring common.is_employee_user() in the database and the
 * canonical Role union in src/lib/roles.ts. Keep all three in sync — a role
 * missing here silently denies those users on every check that consults it.
 * "Lab Customer" is deliberately absent: that is a customer, not staff.
 */
export const COMPANY_EMPLOYEE_ROLES = new Set(
  env(
    "COMPANY_EMPLOYEE_ROLES",
    [
      // canonical roles (src/lib/roles.ts)
      "admin",
      "super admin",
      "neta technician",
      "lab technician",
      "office admin",
      "sales representative",
      "engineer",
      "operations manager",
      "hr rep",
      "scav",
      // legacy / alternate spellings kept for existing accounts
      "manager",
      "supervisor",
      "technician",
      "sales",
      "estimator",
      "engineering",
      "hr_manager",
      "hr_personnel",
    ].join(",")
  )
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
);

/** True if the role names a staff role. */
export const isEmployeeRole = (role: string): boolean =>
  COMPANY_EMPLOYEE_ROLES.has((role || "").toLowerCase());

/** Brand color for email HTML headers/buttons. */
export const BRAND_COLOR = env("COMPANY_BRAND_COLOR", "#f26722");

/**
 * Default From address for transactional email. Must be on a domain verified
 * in Resend, otherwise every send is rejected.
 */
export const DEFAULT_FROM_EMAIL = env("RESEND_FROM", COMPANY_OPS_EMAIL);

/** True if the email belongs to an employee domain. */
export const isEmployeeEmailDomain = (email: string): boolean => {
  const lower = (email || "").toLowerCase();
  return COMPANY_EMPLOYEE_DOMAINS.some((d) => lower.endsWith(d));
};
