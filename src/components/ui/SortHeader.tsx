import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc";

interface SortHeaderProps<T extends string> {
  label: React.ReactNode;
  field: T;
  sortField: T | null | undefined;
  sortDirection: SortDirection | null | undefined;
  onSort: (field: T, direction: SortDirection) => void;
  // Direction used when this column is first clicked. Defaults to "asc".
  defaultDirection?: SortDirection;
  className?: string;
}

// Clickable column title. Click to sort by that column; click again to flip
// the direction. Drives the same field/direction state as the page's sort
// menu, so both stay in sync. Put it inside the existing <th>/<TableHead>.
export function SortHeader<T extends string>({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  defaultDirection = "asc",
  className = "",
}: SortHeaderProps<T>) {
  const active = sortField === field && !!sortDirection;
  const Icon = active
    ? sortDirection === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() =>
        onSort(
          field,
          active
            ? sortDirection === "asc"
              ? "desc"
              : "asc"
            : defaultDirection,
        )
      }
      title={
        active
          ? `Sorted ${sortDirection === "asc" ? "ascending" : "descending"}. Click to flip.`
          : "Click to sort"
      }
      className={`inline-flex items-center gap-1 rounded-none [text-transform:inherit] hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active ? "text-brand" : ""
      } ${className}`}
    >
      <span>{label}</span>
      <Icon
        className={`h-3.5 w-3.5 shrink-0 print:hidden ${active ? "" : "opacity-40"}`}
      />
    </button>
  );
}

// Generic comparer for client-side sorting. Numbers and dates compare by
// value, everything else as case-insensitive text. Blanks always go last.
export function compareSortValues(
  a: unknown,
  b: unknown,
  direction: SortDirection,
): number {
  const aBlank = a === null || a === undefined || a === "";
  const bBlank = b === null || b === undefined || b === "";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  const dir = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  if (a instanceof Date && b instanceof Date)
    return (a.getTime() - b.getTime()) * dir;
  return (
    String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * dir
  );
}

export default SortHeader;
