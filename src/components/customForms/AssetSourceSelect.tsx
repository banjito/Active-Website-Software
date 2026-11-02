/**
 * Builder setting: which equipment-asset value a field fills itself from
 * (identifier, manufacturer, a nameplate value such as kVA, ...).
 */

import React from "react";
import { ASSET_SOURCE_OPTIONS } from "@/lib/customForms/assetFill";

const box =
  "h-7 px-1 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

const GROUPS = Array.from(new Set(ASSET_SOURCE_OPTIONS.map((o) => o.group)));

export const AssetSourceSelect: React.FC<{
  value: string | undefined;
  onChange: (source: string | undefined) => void;
  /** For a table column: it fills the first row. */
  column?: boolean;
}> = ({ value, onChange, column = false }) => (
  <label
    className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400"
    title={`Filled from the report's equipment asset${column ? " (first row)" : ""} when the report is opened from it, or with "Fill from asset" on the form.`}
  >
    From asset
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={`${box} w-36`}>
      <option value="">(none)</option>
      {GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {ASSET_SOURCE_OPTIONS.filter((o) => o.group === g).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  </label>
);

export default AssetSourceSelect;
