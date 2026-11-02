/**
 * The report status box follows the form's pass/fail results.
 *
 * When a template has result columns, the status is the worst result in the
 * form (any FAIL fails, then any LIMITED SERVICE, else PASS) and updates as
 * readings change. Clicking the status button takes over by hand; "Auto"
 * hands it back. A saved report whose stored status differs from its results
 * opens in manual mode, so a technician's deliberate choice is never undone.
 */

import React from "react";
import type { CustomFormStructure } from "@/lib/types/customForms";
import {
  collectFormResults,
  hasResultColumns,
  worstResult,
  type ReportStatus,
} from "@/lib/customForms/resultRules";

export function computeAutoStatus(
  structure: CustomFormStructure | undefined | null,
  formData: Record<string, Record<string, any>>,
): ReportStatus | null {
  if (!structure || !hasResultColumns(structure)) return null;
  return worstResult(collectFormResults(structure, formData));
}

export function useAutoStatus(
  structure: CustomFormStructure | undefined | null,
  formData: Record<string, Record<string, any>>,
  setStatus: (status: ReportStatus) => void,
) {
  const [manual, setManual] = React.useState(false);
  const available = !!structure && hasResultColumns(structure);
  const auto = React.useMemo(() => computeAutoStatus(structure, formData), [structure, formData]);

  React.useEffect(() => {
    if (auto && !manual) setStatus(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, manual]);

  return {
    /** The template has result columns, so the status can follow them. */
    available,
    /** The status the results give (null until a result is filled in). */
    auto,
    /** The user has set the status by hand. */
    manual,
    setManual,
  };
}
