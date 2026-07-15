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

/** Operations mailbox: default sender and legacy notification recipient. */
export const COMPANY_OPS_EMAIL = env(
  "COMPANY_OPS_EMAIL",
  "john.chambers@ampqes.com"
);

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
  "@ampqes.com"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** Brand color for email HTML headers/buttons. */
export const BRAND_COLOR = env("COMPANY_BRAND_COLOR", "#f26722");

/** Default From address when POSTMARK_FROM is not set. */
export const DEFAULT_FROM_EMAIL = env("POSTMARK_FROM", COMPANY_OPS_EMAIL);

/** True if the email belongs to an employee domain. */
export const isEmployeeEmailDomain = (email: string): boolean => {
  const lower = (email || "").toLowerCase();
  return COMPANY_EMPLOYEE_DOMAINS.some((d) => lower.endsWith(d));
};
