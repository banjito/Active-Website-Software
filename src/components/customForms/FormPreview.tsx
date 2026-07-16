/**
 * Form Preview
 *
 * Shows a preview of what the custom form will look like when filled out.
 * This is a read-only view for the form builder.
 * Conditional tables have interactive dropdowns so users can test visibility.
 */

import React, { useState } from "react";
import { Plus, Minus } from "lucide-react";
import {
  CustomFormTemplate,
  SectionConfig,
  type ConditionalRowConfig,
  type ColumnConfig,
} from "@/lib/types/customForms";
import { packGroupedFieldGrid } from "@/lib/customForms/groupedFieldGrid";

function isVisibleWhen(
  visibleWhen: Record<string, string | string[]> | undefined,
  settings: Record<string, string>,
): boolean {
  if (!visibleWhen || Object.keys(visibleWhen).length === 0) return true;
  for (const [settingId, allowed] of Object.entries(visibleWhen)) {
    const current = settings[settingId] ?? "";
    const allowedList = Array.isArray(allowed) ? allowed : [allowed];
    if (!allowedList.includes(current)) return false;
  }
  return true;
}

/** Renders one conditional-table section with interactive dropdowns */
const ConditionalTablePreview: React.FC<{ section: SectionConfig }> = ({
  section,
}) => {
  const initialSettings: Record<string, string> = {};
  (section.settingFields ?? []).forEach((sf) => {
    initialSettings[sf.id] = sf.defaultValue ?? sf.options[0]?.value ?? "";
  });
  const [settings, setSettings] =
    useState<Record<string, string>>(initialSettings);

  const visibleRows = (section.conditionalRows ?? []).filter((row) =>
    isVisibleWhen(row.visibleWhen, settings),
  );
  const visibleColumns = (section.columns ?? []).filter((col) =>
    isVisibleWhen(col.visibleWhen, settings),
  );

  return (
    <div className="space-y-4 w-full">
      {/* Setting dropdowns */}
      <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-neutral-200 dark:border-neutral-600">
        {(section.settingFields ?? []).map((sf) => (
          <div key={sf.id} className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {sf.label}
            </label>
            <select
              value={settings[sf.id] ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, [sf.id]: e.target.value }))
              }
              className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:ring-1 focus:ring-brand focus:border-brand"
            >
              {sf.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Table */}
      {visibleColumns.length > 0 && visibleRows.length > 0 ? (
        <div className="overflow-x-auto w-full">
          <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 font-medium text-neutral-900 dark:text-white">
                    {row.label}
                  </td>
                  {visibleColumns.slice(1).map((col) => (
                    <td
                      key={col.id}
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      <div className="h-8 bg-neutral-100 dark:bg-dark-100 rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
          No rows/columns visible for the selected settings.
        </p>
      )}

      {(section.allowAddRows || section.allowRemoveRows) && (
        <div className="flex items-center gap-2 mt-2">
          {section.allowAddRows && (
            <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded opacity-60 cursor-default">
              <Plus className="w-3 h-3" /> Add Row
            </span>
          )}
          {section.allowRemoveRows && (
            <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded opacity-60 cursor-default">
              <Minus className="w-3 h-3" /> Remove Row
            </span>
          )}
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
};

/** Render a single section's content (exported for use in saved-components preview). */
export const SectionContent: React.FC<{ section: SectionConfig }> = ({
  section,
}) => {
  const isConditional =
    section.settingFields &&
    section.settingFields.length > 0 &&
    section.conditionalRows &&
    section.conditionalRows.length > 0 &&
    section.columns &&
    section.columns.length > 0;

  if (isConditional) {
    return <ConditionalTablePreview section={section} />;
  }

  // Contact resistance: main table + optional Value Deviation block (7.1.1 ATS 25 style)
  if (
    section.componentType === "contact-resistance" &&
    section.columns &&
    section.columns.length > 0
  ) {
    const rowCount = section.rows || 1;
    const showDeviation = section.showDeviation !== false;
    return (
      <div>
        {section.aboveTableFields && section.aboveTableFields.length > 0 && (
          <div className="flex flex-wrap items-end gap-4 gap-y-2 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-600">
            {section.aboveTableFields.map((f) => (
              <div key={f.id} className="flex flex-col gap-1 min-w-[120px]">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {f.label}
                </span>
                <div className="h-9 px-2 py-1.5 bg-neutral-100 dark:bg-dark-100 rounded border border-neutral-200 dark:border-neutral-600 text-xs text-neutral-500 dark:text-neutral-400">
                  {f.type === "select"
                    ? "[Dropdown]"
                    : f.type === "date"
                      ? "[Date]"
                      : f.type === "number"
                        ? "[Number]"
                        : "[Text]"}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
            <thead>
              <tr>
                {section.columns.map((col) => (
                  <th
                    key={col.id}
                    className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {section.columns!.map((col) => (
                    <td
                      key={col.id}
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      <div className="h-8 bg-neutral-100 dark:bg-dark-100 rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(section.allowAddRows || section.allowRemoveRows) && (
          <div className="flex items-center gap-2 mt-2">
            {section.allowAddRows && (
              <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded opacity-60 cursor-default">
                <Plus className="w-3 h-3" /> Add Row
              </span>
            )}
            {section.allowRemoveRows && (
              <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded opacity-60 cursor-default">
                <Minus className="w-3 h-3" /> Remove Row
              </span>
            )}
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {rowCount} row{rowCount !== 1 ? "s" : ""} (default)
            </span>
          </div>
        )}
        {showDeviation && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="w-full">
              <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-700 dark:text-white">
                      Value Deviation
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-center text-xs font-medium text-neutral-700 dark:text-white">
                      Criteria
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-center text-xs font-medium text-neutral-700 dark:text-white">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rowCount }).map((_, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-neutral-200 dark:border-neutral-700"
                    >
                      <td className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                        Phase: N/A
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-6 bg-neutral-100 dark:bg-dark-100 rounded" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-6 bg-neutral-100 dark:bg-dark-100 rounded" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="w-full">
              <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-700 dark:text-white">
                      Value Deviation
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-center text-xs font-medium text-neutral-700 dark:text-white">
                      Criteria
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-center text-xs font-medium text-neutral-700 dark:text-white">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {["Neutral", "Ground"].map((label) => (
                    <tr
                      key={label}
                      className="border-t border-neutral-200 dark:border-neutral-700"
                    >
                      <td className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                        {label}: N/A
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-6 bg-neutral-100 dark:bg-dark-100 rounded" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-6 bg-neutral-100 dark:bg-dark-100 rounded" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section.columns && section.columns.length > 0) {
    const rowCount = section.rows || 1;
    return (
      <div>
        {section.aboveTableFields && section.aboveTableFields.length > 0 && (
          <div className="flex flex-wrap items-end gap-4 gap-y-2 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-600">
            {section.aboveTableFields.map((f) => (
              <div key={f.id} className="flex flex-col gap-1 min-w-[120px]">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {f.label}
                </span>
                <div className="h-9 px-2 py-1.5 bg-neutral-100 dark:bg-dark-100 rounded border border-neutral-200 dark:border-neutral-600 text-xs text-neutral-500 dark:text-neutral-400">
                  {f.type === "select"
                    ? "[Dropdown]"
                    : f.type === "date"
                      ? "[Date]"
                      : f.type === "number"
                        ? "[Number]"
                        : "[Text]"}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
            <thead>
              <tr>
                {section.columns.map((col) => (
                  <th
                    key={col.id}
                    className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {section.columns!.map((col) => (
                    <td
                      key={col.id}
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      <div className="h-8 bg-neutral-100 dark:bg-dark-100 rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(section.allowAddRows || section.allowRemoveRows) && (
          <div className="flex items-center gap-2 mt-2">
            {section.allowAddRows && (
              <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded opacity-60 cursor-default">
                <Plus className="w-3 h-3" /> Add Row
              </span>
            )}
            {section.allowRemoveRows && (
              <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded opacity-60 cursor-default">
                <Minus className="w-3 h-3" /> Remove Row
              </span>
            )}
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {rowCount} row{rowCount !== 1 ? "s" : ""} (default)
            </span>
          </div>
        )}
      </div>
    );
  }

  if (section.fields && section.fields.length > 0) {
    const columns =
      section.componentType === "job-info"
        ? 5
        : section.layout === "five-column"
          ? 5
          : section.layout === "four-column"
            ? 4
            : section.layout === "three-column"
              ? 3
              : section.layout === "two-column"
                ? 2
                : 1;
    const gridRows = packGroupedFieldGrid(section.fields, columns);
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
          <tbody>
            {gridRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((slot, slotIdx) =>
                  slot.type === "empty" ? (
                    <td
                      key={`empty-${slotIdx}`}
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2"
                    />
                  ) : (
                    <td
                      key={slot.field.id}
                      colSpan={slot.colSpan > 1 ? slot.colSpan : undefined}
                      rowSpan={slot.rowSpan > 1 ? slot.rowSpan : undefined}
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 align-top"
                    >
                      <div className="text-xs font-medium text-neutral-500 dark:text-white uppercase mb-1">
                        {slot.field.label}
                        {slot.field.unit && (
                          <span className="text-neutral-400 ml-1 normal-case">
                            ({slot.field.unit})
                          </span>
                        )}
                        {slot.field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </div>
                      <div
                        className={`${slot.field.type === "textarea" ? "h-16" : "h-8"} bg-neutral-100 dark:bg-dark-100 rounded`}
                      />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (section.field) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
          <tbody>
            <tr>
              <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2">
                <div className="text-xs font-medium text-neutral-500 dark:text-white uppercase mb-1">
                  {section.field.label}
                  {section.field.unit && (
                    <span className="text-neutral-400 ml-1 normal-case">
                      ({section.field.unit})
                    </span>
                  )}
                  {section.field.required && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </div>
                <div
                  className={`${section.field.type === "textarea" ? "h-20" : "h-8"} bg-neutral-100 dark:bg-dark-100 rounded`}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (section.checklistItems && section.checklistItems.length > 0) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
          <thead>
            <tr>
              <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase w-32">
                NETA Section
              </th>
              <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase">
                Description
              </th>
              <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase w-40">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {section.checklistItems.map((item) => (
              <tr key={item.id}>
                <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                  {item.netaSection || "-"}
                </td>
                <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-700 dark:text-white">
                  {item.description}
                </td>
                <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2">
                  <div className="h-8 bg-neutral-100 dark:bg-dark-100 rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
};

interface FormPreviewProps {
  template: CustomFormTemplate;
}

export const FormPreview: React.FC<FormPreviewProps> = ({ template }) => {
  const sortedSections = [...template.structure.sections].sort(
    (a, b) => a.order - b.order,
  );

  return (
    <div className="max-w-5xl mx-auto bg-white dark:bg-dark-150 rounded-none shadow-lg p-8">
      {/* Preview Header */}
      <div className="mb-6 pb-6 border-b dark:border-neutral-700">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
              {template.name}
            </h1>
            {template.description && (
              <p className="text-neutral-600 dark:text-neutral-400">
                {template.description}
              </p>
            )}
          </div>
          {template.netaSection && (
            <div className="text-right">
              <div className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                NETA Standard
              </div>
              <div className="text-xl font-bold text-brand">
                {template.netaSection}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {sortedSections.map(
          (section) =>
            section.showInPrint && (
              <div key={section.id}>
                <div className="w-full h-1 bg-brand mb-4" />
                <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  {section.title}
                </h2>
                <SectionContent section={section} />
              </div>
            ),
        )}
      </div>

      {sortedSections.filter((s) => s.showInPrint).length === 0 && (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400">
            No sections to display in preview
          </p>
        </div>
      )}
    </div>
  );
};
