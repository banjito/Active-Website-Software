/**
 * Whether a piece of equipment is in service. Separate from report status, which is about
 * the paperwork rather than the equipment.
 */

export type AssetStatus = "active" | "not_in_use" | "retired";

export const ASSET_STATUS_OPTIONS: Array<{ value: AssetStatus; label: string }> = [
  { value: "active", label: "In Use" },
  { value: "not_in_use", label: "Not In Use" },
  { value: "retired", label: "Retired" },
];

export function assetStatusLabel(status: string | null | undefined): string {
  return ASSET_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "";
}

/** Retired assets stay out of the way until someone asks for them. */
export const hiddenByDefault = (status: string | null | undefined) => status === "retired";
