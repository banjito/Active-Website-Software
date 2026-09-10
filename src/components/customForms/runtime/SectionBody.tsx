/**
 * Section runtime entry point.
 *
 * Callers still hand this a V1 `SectionConfig`, which is what every shell and
 * the saved-component library hold. It adapts that to a V2 section and renders
 * through `SectionBodyV2`, so there is one renderer and V1 templates reach it
 * through the adapter rather than through a second code path.
 *
 * The contact-resistance value-deviation block is the one thing V2 does not
 * model as part of the table: it is a pair of side tables the component owns
 * rather than something the template describes. It stays here until the
 * component library is re-authored as V2 sections.
 */

import React from "react";
import {
  FieldType,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import {
  classifySection,
  resolveRowCount,
  rowStateKey,
  tablePrintStyles,
  type ControlSlot,
  type SectionChrome,
} from "@/lib/customForms/runtime";
import { sectionFromV1 } from "@/lib/customForms/v2/fromV1";
import {
  conditionScopeValues,
  type ConditionScope,
} from "@/lib/customForms/v2/conditions";
import { SectionBodyV2 } from "./SectionBodyV2";

const CONTACT_RESISTANCE_PHASE_CRITERIA = [
  "<10%",
  "<25%",
  "<50%",
  "<75%",
  "<100%",
];
const CONTACT_RESISTANCE_PHASE_RESULTS = [
  "PASS",
  "FAIL",
  "LIMITED SERVICE",
  "N/A",
];
const CONTACT_RESISTANCE_NG_CRITERIA = [
  "N/A",
  ...CONTACT_RESISTANCE_PHASE_CRITERIA,
];
const CONTACT_RESISTANCE_NG_RESULTS = [
  "N/A",
  "PASS",
  "FAIL",
  "LIMITED SERVICE",
];

export interface SectionBodyProps {
  section: SectionConfig;
  chrome: SectionChrome;
}

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

/** Contact resistance: the paired Value Deviation tables under the table. */
const ValueDeviation: React.FC<{
  section: SectionConfig;
  chrome: SectionChrome;
  rowCount: number;
}> = ({ section, chrome, rowCount }) => {
  const headerCell =
    "px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-xs font-medium text-neutral-700 dark:text-white";

  const slot = (field: FieldConfig, stateKey: string): ControlSlot => ({
    section,
    field,
    stateKey,
    placement: "deviation-cell",
  });

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <div className="w-full">
        <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
          <thead>
            <tr>
              <th className={`${headerCell} text-left`}>Value Deviation</th>
              <th className={`${headerCell} text-center`}>Criteria</th>
              <th className={`${headerCell} text-center`}>Results</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, rowIndex) => {
              const stateKey = rowStateKey(section.id, rowIndex);
              return (
                <tr
                  key={rowIndex}
                  className="border-t border-neutral-200 dark:border-neutral-700"
                >
                  <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
                    Phase: N/A
                  </td>
                  <td className="px-3 py-2">
                    {chrome.renderControl(
                      slot(
                        selectField(
                          "phaseCriteria",
                          "Criteria",
                          CONTACT_RESISTANCE_PHASE_CRITERIA,
                          "<50%",
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
                          "Results",
                          CONTACT_RESISTANCE_PHASE_RESULTS,
                          "N/A",
                        ),
                        stateKey,
                      ),
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="w-full">
        <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
          <thead>
            <tr>
              <th className={`${headerCell} text-left`}>Value Deviation</th>
              <th className={`${headerCell} text-center`}>Criteria</th>
              <th className={`${headerCell} text-center`}>Results</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Neutral", "neutralCriteria", "neutralResult"],
                ["Ground", "groundCriteria", "groundResult"],
              ] as const
            ).map(([label, criteriaId, resultId]) => (
              <tr
                key={label}
                className="border-t border-neutral-200 dark:border-neutral-700"
              >
                <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
                  {label}: N/A
                </td>
                <td className="px-3 py-2">
                  {chrome.renderControl(
                    slot(
                      selectField(
                        criteriaId,
                        "Criteria",
                        CONTACT_RESISTANCE_NG_CRITERIA,
                        "N/A",
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
                        "Results",
                        CONTACT_RESISTANCE_NG_RESULTS,
                        "N/A",
                      ),
                      section.id,
                    ),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SectionBody: React.FC<SectionBodyProps> = ({
  section,
  chrome,
}) => {
  const v2Section = React.useMemo(() => sectionFromV1(section), [section]);
  const { wrapperStyle, rowStyle } = tablePrintStyles(section.printLayout);

  // Conditions read instance values through the chrome, so builder modes with
  // local settings and the filler with saved data resolve the same way.
  const scope: ConditionScope = React.useMemo(
    () => ({
      // Setting defaults are folded in first. Without that, a form nobody has
      // touched has no setting values at all, and every conditional row
      // evaluates to hidden.
      values: conditionScopeValues([section], chrome.conditionValues?.() ?? {}),
      bindings: chrome.bindingValues?.(),
      rowStateKey: (_tableId, row) =>
        row.index != null ? rowStateKey(section.id, row.index) : undefined,
    }),
    [chrome, section],
  );

  const kind = classifySection(section);
  const showDeviation =
    kind === "contact-resistance" && section.showDeviation !== false;
  const deviationRowCount = Math.min(
    resolveRowCount(section),
    chrome.maxBodyRows ?? Number.POSITIVE_INFINITY,
  );

  if (kind === "empty") return null;

  return (
    <>
      <SectionBodyV2
        v1Section={section}
        section={v2Section}
        chrome={chrome}
        scope={scope}
        wrapperStyle={wrapperStyle}
        rowStyle={rowStyle}
      />
      {showDeviation && (
        <ValueDeviation
          section={section}
          chrome={chrome}
          rowCount={deviationRowCount}
        />
      )}
    </>
  );
};
