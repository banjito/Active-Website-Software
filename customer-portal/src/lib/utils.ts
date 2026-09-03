import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * A lowercased bag of the common ways someone types a date, for free-text
 * search: "Sep 3, 2026", "Sept. 3, 2026", "September 3 2026", "9/3/26",
 * "9/3/2026", "09/03/2026", "2026-09-03", plus the bare month and month+year.
 */
export function dateSearchText(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const yy = String(y).slice(-2);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const long = d.toLocaleDateString('en-US', { month: 'long' }); // September
  const short = d.toLocaleDateString('en-US', { month: 'short' }); // Sep
  const abbr = long.slice(0, 4); // Sept / Octo / etc. — covers the "Sept." habit
  return [
    formatDate(value), // locale short, e.g. "Sep 3, 2026"
    `${long} ${day}, ${y}`,
    `${long} ${day} ${y}`,
    `${short} ${day} ${y}`,
    `${short}. ${day}, ${y}`,
    `${abbr}. ${day}, ${y}`,
    `${abbr} ${day} ${y}`,
    `${m}/${day}/${y}`,
    `${m}/${day}/${yy}`,
    `${pad(m)}/${pad(day)}/${y}`,
    `${pad(m)}/${pad(day)}/${yy}`,
    `${y}-${pad(m)}-${pad(day)}`,
    long,
    `${long} ${y}`,
    String(y),
  ]
    .join(' ')
    .toLowerCase();
}
