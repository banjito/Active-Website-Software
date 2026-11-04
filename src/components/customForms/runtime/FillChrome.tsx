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
import { copyAsFoundToAsLeft } from "@/lib/customForms/asFoundAsLeft";
import {
  Copy, Plus, Minus } from "lucide-react";
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
  withContactResistanceRowAdded,
  withRowCountDelta,
  withRowRemoved,
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
  /** A saved report from before the current layout rules. */
  legacyLayout?: boolean;
}

const ADD_BUTTON =
  "flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded-none hover:bg-orange-50 dark:hover:bg-orange-900/20";
const REMOVE_BUTTON =
  "flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded-none hover:bg-red-50 dark:hover:bg-red-900/20";

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
    legacyLayout,
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

  /** Can any row of this section go right now? */
  const rowsRemovable = (section: SectionConfig) => {
    const kind = classifySection(section);
    if (kind === "conditional-table") {
      if (!section.allowRemoveRows) return false;
      const settings = resolveSettingValues(section, (id) => formData[section.id]?.[id]);
      return (section.conditionalRows ?? []).filter((row) => isConditionalRowVisible(row, settings)).length > 1;
    }
    if (kind !== "table" && kind !== "contact-resistance") return false;
    // Rows authored in the grid aren't numbered rows, so they keep Remove Row.
    return !section.v2?.body && canRemoveRow(section, resolveRowCount(section));
  };

  return {
    mode: readOnly ? "readonly" : "fill",
    density: "normal",
    legacyLayout,
    renderControl,
    getSettingValue: (section, settingId) => formData[section.id]?.[settingId],
    // Conditions read the instance directly: a setting the user has not
    // touched still resolves through the section's declared default.
    conditionValues: () => formData,
    bindingValues: () => bindingValues ?? {},
    formSections: () => template?.structure.sections ?? [],
    instanceRowsFor: (sectionId) => instanceRows?.[sectionId],
    generatorCountsFor: (sectionId) => generatorCounts?.[sectionId],
    setSettingValue: readOnly
      ? undefined
      : (section, settingId, value) =>
          onFieldChange(section.id, settingId, value),

    // Every row carries its own remove button, so the exact row can go.
    renderRowAction: (section, rowIndex) => {
      if (readOnly || !rowsRemovable(section)) return null;
      return (
        <button
          type="button"
          onClick={() =>
            applyMutation((t, d) => withRowRemoved(t, d, section.id, rowIndex))
          }
          className="px-1.5 py-0.5 text-xs text-white bg-red-600 hover:bg-red-700 rounded-none focus:outline-none print:hidden"
          title="Remove row"
        >
          ×
        </button>
      );
    },

    renderSectionHeader: (section) => {
      if (readOnly) return null;
      // As Found / As Left tables: one click copies the readings across.
      if (!section.asFoundAsLeft?.pairs?.length) return null;
      return (
        <div className="flex justify-end items-center mb-2">
          <button
            type="button"
            onClick={() =>
              applyMutation((t, d) => ({ template: t, formData: copyAsFoundToAsLeft(section, d).formData }))
            }
            title="Fill every empty As Left cell with its As Found reading"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded-none hover:bg-brand/10 print:hidden"
          >
            <Copy className="w-3.5 h-3.5" /> Copy As Found → As Left
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
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  if (kind !== "table" && kind !== "contact-resistance") return null;

  // New contact resistance rows get its labels. Rows remove from the × on each
  // row; only rows authored in the grid still need this button.
  const contactResistance = kind === "contact-resistance";
  const showAdd = !readOnly && canAddRow(section, info.rowCount);
  const showRemove = !readOnly && !!section.v2?.body && canRemoveRow(section, info.rowCount);
  if (!showAdd && !showRemove) return null;

  return (
    <div className="flex items-center gap-2 mt-2 print:hidden">
      {showAdd && (
        <button
          type="button"
          onClick={() =>
            applyMutation((t, d) =>
              contactResistance
                ? withContactResistanceRowAdded(t, d, section.id)
                : withRowCountDelta(t, d, section.id, 1),
            )
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
