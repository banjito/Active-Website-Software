/**
 * Fill-mode chrome.
 *
 * The job filler and the template preview page are the same document with
 * different persistence. This hook gives them one chrome: live controls,
 * settings bound to instance data, and the add/remove row affordances, so the
 * two can never disagree about how a form behaves under the technician's
 * hands.
 */

import React from "react";
import { Plus, Minus } from "lucide-react";
import type { CustomFormTemplate, SectionConfig } from "@/lib/types/customForms";
import {
  applyFieldChange,
  canAddRow,
  canRemoveRow,
  classifySection,
  isConditionalRowVisible,
  resolveRowCount,
  resolveSettingValues,
  withConditionalRowAdded,
  withConditionalRowRemoved,
  withContactResistanceRowAdded,
  withContactResistanceRowRemoved,
  withRowCountDelta,
  type ControlSlot,
  type FormData,
  type SectionChrome,
  type SectionRowInfo,
} from "@/lib/customForms/runtime";
import type { RowInstanceV2 } from "@/lib/customForms/instanceState";
import { createInteractiveControlRenderer } from "./InteractiveControl";

export interface FillChromeOptions {
  template: CustomFormTemplate | null;
  formData: FormData;
  /** Applies a template and form-data change together. */
  applyMutation: (
    mutate: (
      template: CustomFormTemplate,
      formData: FormData,
    ) => { template: CustomFormTemplate; formData: FormData },
  ) => void;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  /** Show a saved instance without letting anything be edited. */
  readOnly?: boolean;
  /** Shell-specific control, e.g. the filler's equipment autocomplete. */
  renderControlOverride?: (slot: ControlSlot) => React.ReactNode | null;
  /** Resolved report-context bindings, by binding id. */
  bindingValues?: Record<string, unknown>;
  /** Stable row identities from the instance state, by section id. */
  instanceRows?: Record<string, RowInstanceV2[]>;
  /** Row counts per records generator, by section id. */
  generatorCounts?: Record<string, Record<string, number>>;
}

const ADD_BUTTON =
  "flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded hover:bg-orange-50 dark:hover:bg-orange-900/20";
const REMOVE_BUTTON =
  "flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/20";

export function useFillChrome(options: FillChromeOptions): SectionChrome {
  const {
    template,
    formData,
    applyMutation,
    setFormData,
    readOnly = false,
    renderControlOverride,
    bindingValues,
    instanceRows,
    generatorCounts,
  } = options;

  const sections = template?.structure.sections ?? [];

  const onFieldChange = React.useCallback(
    (stateKey: string, fieldId: string, value: any) => {
      if (readOnly) return;
      setFormData((prev) => applyFieldChange(prev, stateKey, fieldId, value));
    },
    [readOnly, setFormData],
  );

  const interactive = React.useMemo(
    () =>
      createInteractiveControlRenderer({
        formData,
        sections,
        onFieldChange,
        readOnly,
      }),
    [formData, sections, onFieldChange, readOnly],
  );

  const renderControl = React.useCallback(
    (slot: ControlSlot) => renderControlOverride?.(slot) ?? interactive(slot),
    [renderControlOverride, interactive],
  );

  const removeContactResistanceRow = (sectionId: string, rowIndex: number) =>
    applyMutation((t, d) =>
      withContactResistanceRowRemoved(t, d, sectionId, rowIndex),
    );

  return {
    mode: readOnly ? "readonly" : "fill",
    density: "normal",
    renderControl,
    getSettingValue: (section, settingId) => formData[section.id]?.[settingId],
    // Conditions read the instance directly: a setting the user has not
    // touched still resolves through the section's declared default.
    conditionValues: () => formData,
    bindingValues: () => bindingValues ?? {},
    instanceRowsFor: (sectionId) => instanceRows?.[sectionId],
    generatorCountsFor: (sectionId) => generatorCounts?.[sectionId],
    setSettingValue: readOnly
      ? undefined
      : (section, settingId, value) =>
          onFieldChange(section.id, settingId, value),

    // Contact resistance removes a row in place, from the row itself, because
    // its rows are named sections rather than an anonymous count.
    renderCellAdornment: (slot) => {
      if (readOnly) return null;
      if (classifySection(slot.section) !== "contact-resistance") return null;
      const fieldId = slot.cell?.column.field?.id ?? slot.cell?.colId;
      if (fieldId !== "busSection") return null;
      const rowCount = resolveRowCount(slot.section);
      if (!canRemoveRow(slot.section, rowCount)) return null;
      return (
        <button
          type="button"
          onClick={() =>
            removeContactResistanceRow(slot.section.id, slot.cell!.rowIndex)
          }
          className="p-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded focus:outline-none print:hidden"
          title="Remove row"
        >
          ×
        </button>
      );
    },

    renderSectionHeader: (section, info) => {
      if (readOnly) return null;
      if (classifySection(section) !== "contact-resistance") return null;
      if (!canAddRow(section, info.rowCount)) return null;
      return (
        <div className="flex justify-end items-center mb-2">
          <button
            type="button"
            onClick={() =>
              applyMutation((t, d) =>
                withContactResistanceRowAdded(t, d, section.id),
              )
            }
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded focus:outline-none focus:ring-2 focus:ring-green-500 print:hidden"
          >
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
        </div>
      );
    },

    renderSectionFooter: (section, info) => (
      <FillSectionFooter
        section={section}
        info={info}
        formData={formData}
        readOnly={readOnly}
        applyMutation={applyMutation}
      />
    ),
  };
}

const FillSectionFooter: React.FC<{
  section: SectionConfig;
  info: SectionRowInfo;
  formData: FormData;
  readOnly: boolean;
  applyMutation: FillChromeOptions["applyMutation"];
}> = ({ section, info, formData, readOnly, applyMutation }) => {
  const kind = classifySection(section);

  if (kind === "conditional-table") {
    if (!section.allowAddRows && !section.allowRemoveRows) return null;
    const settings = resolveSettingValues(
      section,
      (id) => formData[section.id]?.[id],
    );
    const visibleRows = (section.conditionalRows ?? []).filter((row) =>
      isConditionalRowVisible(row, settings),
    );
    return (
      <div className="flex items-center gap-2 mt-2 print:hidden">
        {section.allowAddRows && !readOnly && (
          <button
            type="button"
            onClick={() =>
              applyMutation((t, d) => withConditionalRowAdded(t, d, section.id))
            }
            className={ADD_BUTTON}
          >
            <Plus className="w-3 h-3" /> Add Row
          </button>
        )}
        {section.allowRemoveRows && !readOnly && visibleRows.length > 1 && (
          <button
            type="button"
            onClick={() =>
              applyMutation((t, d) =>
                withConditionalRowRemoved(
                  t,
                  d,
                  section.id,
                  visibleRows[visibleRows.length - 1].id,
                ),
              )
            }
            className={REMOVE_BUTTON}
          >
            <Minus className="w-3 h-3" /> Remove Row
          </button>
        )}
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  // Contact resistance carries its controls in the header and the rows.
  if (kind !== "table") return null;

  const showAdd = !readOnly && canAddRow(section, info.rowCount);
  const showRemove = !readOnly && canRemoveRow(section, info.rowCount);
  if (!showAdd && !showRemove) return null;

  return (
    <div className="flex items-center gap-2 mt-2 print:hidden">
      {showAdd && (
        <button
          type="button"
          onClick={() =>
            applyMutation((t, d) => withRowCountDelta(t, d, section.id, 1))
          }
          className={ADD_BUTTON}
        >
          <Plus className="w-3 h-3" /> Add Row
        </button>
      )}
      {showRemove && (
        <button
          type="button"
          onClick={() =>
            applyMutation((t, d) => withRowCountDelta(t, d, section.id, -1))
          }
          className={REMOVE_BUTTON}
        >
          <Minus className="w-3 h-3" /> Remove Row
        </button>
      )}
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {info.rowCount} row{info.rowCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
};

/**
 * Applies a template change and an instance-data change together.
 *
 * Row edits touch both halves at once. Reading the latest values from refs
 * keeps the two in step even when several edits land in one React batch.
 */
export function useApplyMutation(
  template: CustomFormTemplate | null,
  formData: FormData,
  setTemplate: React.Dispatch<React.SetStateAction<CustomFormTemplate | null>>,
  setFormData: React.Dispatch<React.SetStateAction<FormData>>,
): FillChromeOptions["applyMutation"] {
  const templateRef = React.useRef(template);
  const formDataRef = React.useRef(formData);
  templateRef.current = template;
  formDataRef.current = formData;

  return React.useCallback(
    (mutate) => {
      const current = templateRef.current;
      if (!current) return;
      const result = mutate(current, formDataRef.current);
      templateRef.current = result.template;
      formDataRef.current = result.formData;
      setTemplate(result.template);
      setFormData(result.formData);
    },
    [setTemplate, setFormData],
  );
}
