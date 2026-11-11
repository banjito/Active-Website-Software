/**
 * Small CSV helpers for "Export CSV" buttons on list pages.
 * Kept separate from hr/exportReports so list pages don't pull in the xlsx library.
 */

function escapeCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

/** Downloads as <filenameBase>-YYYY-MM-DD.csv. The BOM makes Excel read accents correctly. */
export function downloadCsv(csv: string, filenameBase: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Supabase returns at most 1000 rows per request. This keeps asking for the
 * next 1000 until a short page comes back. The query must have a stable order.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < size) return all;
  }
}
