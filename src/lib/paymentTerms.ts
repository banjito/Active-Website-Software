/**
 * Per-customer payment terms guardrails.
 *
 * Some customers may only be offered certain terms (e.g. Lawson Electric is NET 90
 * only, because of paid-when-paid contracts). That lives on `common.customers`
 * (`allowed_payment_terms`, `payment_terms_note`) and is surfaced to estimators on
 * the estimate sheet and when generating a letter proposal.
 *
 * NULL / empty `allowed_payment_terms` means no restriction.
 */

export const PAYMENT_TERM_OPTIONS = [
  { value: "net30", label: "NET 30" },
  { value: "net60", label: "NET 60" },
  { value: "net90", label: "NET 90" },
] as const;

export type PaymentTermValue = (typeof PAYMENT_TERM_OPTIONS)[number]["value"];

export interface CustomerPaymentTerms {
  allowed_payment_terms?: string[] | null;
  payment_terms_note?: string | null;
}

const VALID_TERMS = PAYMENT_TERM_OPTIONS.map((o) => o.value) as readonly string[];

/** Drop unknown values and de-dupe, keeping NET 30 -> 60 -> 90 order. */
export function normalizeAllowedTerms(
  terms: string[] | null | undefined,
): PaymentTermValue[] {
  if (!terms || terms.length === 0) return [];
  return PAYMENT_TERM_OPTIONS.map((o) => o.value).filter((v) =>
    terms.includes(v),
  ) as PaymentTermValue[];
}

/**
 * True when the customer is limited to fewer than all three terms. A customer with
 * all three selected is treated the same as "no restriction" — nothing to warn about.
 */
export function hasPaymentTermRestriction(
  customer: CustomerPaymentTerms | null | undefined,
): boolean {
  if (!customer) return false;
  const allowed = normalizeAllowedTerms(customer.allowed_payment_terms);
  return allowed.length > 0 && allowed.length < PAYMENT_TERM_OPTIONS.length;
}

export function paymentTermLabel(term: string): string {
  return (
    PAYMENT_TERM_OPTIONS.find((o) => o.value === term)?.label ??
    term.toUpperCase()
  );
}

/** "NET 90" / "NET 60 or NET 90" / "NET 30, NET 60 or NET 90" */
export function formatAllowedTerms(
  terms: string[] | null | undefined,
): string {
  const labels = normalizeAllowedTerms(terms).map(paymentTermLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** Is this specific term allowed for the customer? Unrestricted customers allow everything. */
export function isTermAllowed(
  customer: CustomerPaymentTerms | null | undefined,
  term: string,
): boolean {
  if (!hasPaymentTermRestriction(customer)) return true;
  return normalizeAllowedTerms(customer?.allowed_payment_terms).includes(
    term as PaymentTermValue,
  );
}

export { VALID_TERMS };
