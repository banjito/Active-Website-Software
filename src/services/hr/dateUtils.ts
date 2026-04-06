/**
 * Date-only handling to avoid timezone shifts (e.g. "one day behind" when using UTC midnight).
 * Use for calendar dates: expiration_date, cert_date, renewal_date, etc.
 */

/**
 * Format a date-only value for display. Parses as local date so UTC midnight doesn't shift the day.
 * Accepts "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.sssZ".
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const s = iso.slice(0, 10);
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return iso;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString();
}

/**
 * For saving to the backend: ensure a date-only string is stored as the intended calendar day.
 * Sending "YYYY-MM-DD" can be interpreted as UTC midnight and end up as the previous day when stored as DATE.
 * Sending "YYYY-MM-DDT12:00:00.000Z" (noon UTC) keeps the same calendar day in all common timezones.
 */
export function toDateOnlyISO(localDateString: string | null | undefined): string | null {
  if (!localDateString || typeof localDateString !== 'string') return null;
  const s = localDateString.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T12:00:00.000Z`;
}

/** Get "YYYY-MM-DD" from a stored value (for input[type="date"].value). No shift. */
export function toInputValue(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  return iso.slice(0, 10);
}
