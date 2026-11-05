/**
 * Contact resistance: the separate Value Deviation tables, kept only so reports
 * created before the in-line columns still show exactly what they were issued
 * with. New reports never reach this (see usesLegacyDeviation). `part` picks
 * what to draw: both side by side (the original layout), just one of them, or
 * both merged into one table (a table layout piece).
 */

import React from "react";
import {
  FieldType,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import {
  rowStateKey,
  type ControlSlot,
  type SectionChrome,
} from "@/lib/customForms/runtime";
import { resolveLegacyDeviation } from "@/lib/customForms/deviation";

/** Synthetic field for a control the runtime owns rather than the template. */
function selectField(
  id: string,
  label: string,
  options: string[],
  defaultValue?: string,
): FieldConfig {
  return {
    id,
    label,
    type: FieldType.SELECT,
    defaultValue,
    options: options.map((value) => ({ label: value, value })),
  };
}

export const LegacyValueDeviation: React.FC<{
  section: SectionConfig;
  chrome: SectionChrome;
  rowCount: number;
  part?: "both" | "phase" | "lines" | "combined";
}> = ({ section, chrome, rowCount, part = "both" }) => {
  const headerCell =
    "px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-xs font-medium text-neutral-700 dark:text-white";
  const dev = resolveLegacyDeviation(section);
  const headings = (
    <tr>
      <th className={`${headerCell} text-left`}>{dev.headers.label}</th>
      <th className={`${headerCell} text-center`}>{dev.headers.criteria}</th>
      <th className={`${headerCell} text-center`}>{dev.headers.results}</th>
    </tr>
  );

  const slot = (field: FieldConfig, stateKey: string): ControlSlot => ({
    section,
    field,
    stateKey,
    placement: "deviation-cell",
  });

  const phaseRows = Array.from({ length: rowCount }).map((_, rowIndex) => {
    const stateKey = rowStateKey(section.id, rowIndex);
    return (
      <tr
        key={rowIndex}
        className="border-t border-neutral-200 dark:border-neutral-700"
      >
        <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
          {dev.phaseLabel}
        </td>
        <td className="px-3 py-2">
          {chrome.renderControl(
            slot(
              selectField(
                "phaseCriteria",
                dev.headers.criteria,
                dev.phaseCriteriaOptions,
                dev.phaseCriteriaDefault,
              ),
              stateKey,
            ),
          )}
        </td>
        <td className="px-3 py-2">
          {chrome.renderControl(
            slot(
              selectField(
                "phaseResult",
                dev.headers.results,
                dev.phaseResultOptions,
                dev.phaseResultDefault,
              ),
              stateKey,
            ),
          )}
        </td>
      </tr>
    );
  });

  // Saved values are keyed `{id}Criteria` / `{id}Result` (neutralCriteria, ...).
  const lineRows = dev.extraRows
    .map(({ id, label }) => [label, `${id}Criteria`, `${id}Result`, id] as const)
    .map(([label, criteriaId, resultId, rowId]) => (
      <tr
        key={rowId}
        className="border-t border-neutral-200 dark:border-neutral-700"
      >
        <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
          {label}
        </td>
        <td className="px-3 py-2">
          {chrome.renderControl(
            slot(
              selectField(
                criteriaId,
                dev.headers.criteria,
                dev.extraCriteriaOptions,
                dev.extraDefault,
              ),
              section.id,
            ),
          )}
        </td>
        <td className="px-3 py-2">
          {chrome.renderControl(
            slot(
              selectField(
                resultId,
                dev.headers.results,
                dev.extraResultOptions,
                dev.extraDefault,
              ),
              section.id,
            ),
          )}
        </td>
      </tr>
    ));

  const table = (rows: React.ReactNode) => (
    <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
      <thead>{headings}</thead>
      <tbody>{rows}</tbody>
    </table>
  );

  if (part === "phase") return table(phaseRows);
  if (part === "lines") return lineRows.length ? table(lineRows) : null;
  if (part === "combined") return table([...phaseRows, ...lineRows]);

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <div className="w-full">{table(phaseRows)}</div>
      {lineRows.length > 0 && <div className="w-full">{table(lineRows)}</div>}
    </div>
  );
};
