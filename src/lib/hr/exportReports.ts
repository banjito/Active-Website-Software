/**
 * HR report export utilities: CSV and Excel (XLSX).
 */

import * as XLSX from 'xlsx';

function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build CSV string from rows (first row = headers).
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const headerRow = headers.map(escapeCsvCell).join(',');
  const dataRows = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Trigger browser download of CSV.
 */
export function downloadCsv(csv: string, filenameBase: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Build and download Excel (.xlsx) from sheet data.
 * sheetName: name of the first (and often only) sheet.
 */
export function downloadExcel(
  headers: string[],
  rows: Record<string, unknown>[],
  filenameBase: string,
  sheetName = 'Data'
): void {
  const ws = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [headers.reduce<Record<string, string>>((acc, h) => ({ ...acc, [h]: '' }), {})]
  );
  if (!rows.length && headers.length) {
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filenameBase}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
