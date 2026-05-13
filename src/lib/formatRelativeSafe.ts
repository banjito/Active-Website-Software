import { formatDistanceToNow, isValid, parseISO } from 'date-fns';

/** Safe for Realtime / partial payloads where `created_at` may be missing or invalid. */
export function formatRelativeSafe(value: string | undefined | null): string {
  if (value == null || value === '') return 'Recently';
  const d = /^\d{4}-\d{2}-\d{2}T/.test(value) ? parseISO(value) : new Date(value);
  if (!isValid(d)) return 'Recently';
  return formatDistanceToNow(d, { addSuffix: true });
}
