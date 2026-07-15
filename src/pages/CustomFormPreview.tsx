/**
 * Custom Form Preview
 *
 * Test/preview a custom form template as if filling it out.
 * This does NOT save to jobs or create assets - it's just for testing.
 */

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { ArrowLeft, Eye, Printer, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportWrapper } from "@/components/reports/ReportWrapper";
import {
  CustomFormTemplate,
  SectionConfig,
  TablePrintLayout,
  type ConditionalRowConfig,
  type ColumnConfig,
} from "@/lib/types/customForms";
import { fahrenheitToCelsius, getTCF } from "@/lib/utils/temperatureCorrection";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getCellValue } from "@/lib/customForms/formCellResolution";

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

export const CustomFormPreview: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<CustomFormTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<"PASS" | "FAIL">("PASS");

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  // Initialize temperature/humidity when template loads (job info)
  useEffect(() => {
    if (!template) return;
    const jobInfoSection = template.structure.sections.find(
      (s) =>
        s.componentType === "job-info" ||
        (s as any).componentType === "job_info",
    );
    if (!jobInfoSection) return;
    let fahrenheit: number | null = null;
    let humidityDefault = 50;
    const tempField = jobInfoSection.fields?.find(
      (f) => f.id === "temperature",
    );
    const tempHumidityField = jobInfoSection.fields?.find(
      (f) => f.id === "temperatureHumidity",
    );
    if (
      tempField &&
      tempField.defaultValue !== undefined &&
      tempField.defaultValue !== ""
    ) {
      fahrenheit = parseFloat(tempField.defaultValue.toString());
    } else if (
      tempHumidityField &&
      (tempHumidityField as any).defaultTemperature != null
    ) {
      fahrenheit = Number((tempHumidityField as any).defaultTemperature) || 68;
      humidityDefault =
        Number((tempHumidityField as any).defaultHumidity) || 50;
    }
    if (fahrenheit == null || isNaN(fahrenheit)) return;
    const celsius = fahrenheitToCelsius(fahrenheit);
    const tcf = getTCF(celsius);
    setFormData((prev) => {
      if (
        prev[jobInfoSection.id]?.temperature !== undefined &&
        prev[jobInfoSection.id]?.temperature !== ""
      )
        return prev;
      return {
        ...prev,
        [jobInfoSection.id]: {
          ...(prev[jobInfoSection.id] || {}),
          temperature: fahrenheit!.toString(),
          temperatureCelsius: celsius.toFixed(2),
          tcf: tcf.toFixed(3),
          humidity:
            prev[jobInfoSection.id]?.humidity !== undefined &&
            prev[jobInfoSection.id]?.humidity !== ""
              ? prev[jobInfoSection.id].humidity
              : String(humidityDefault),
        },
      };
    });
  }, [template]);

  const loadTemplate = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;

      if (data) {
        setTemplate({
          id: data.id,
          name: data.name,
          description: data.description,
          netaSection: data.neta_section,
          structure: data.structure,
        });
      }
    } catch (error) {
      console.error("Error loading template:", error);
      toast.error("Failed to load template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (
    sectionId: string,
    fieldId: string,
    value: any,
  ) => {
    setFormData((prev) => {
      const updatedSection = {
        ...(prev[sectionId] || {}),
        [fieldId]: value,
      };
      if (fieldId === "temperature") {
        if (value === "" || value === null || value === undefined) {
          updatedSection["temperatureCelsius"] = "";
          updatedSection["tcf"] = "";
        } else if (!isNaN(parseFloat(value))) {
          const fahrenheit = parseFloat(value);
          const celsius = fahrenheitToCelsius(fahrenheit);
          const tcf = getTCF(celsius);
          updatedSection["temperatureCelsius"] = celsius.toFixed(2);
          updatedSection["tcf"] = tcf.toFixed(3);
        }
      }
      return {
        ...prev,
        [sectionId]: updatedSection,
      };
    });
  };

  const updateSectionRowCount = (sectionId: string, delta: number) => {
    setTemplate((prev) => {
      if (!prev) return prev;
      const section = prev.structure.sections.find((s) => s.id === sectionId);
      if (!section) return prev;
      const groupId = section.rowCountLinkGroupId;
      const isInGroup = (s: SectionConfig) =>
        s.id === sectionId ||
        (groupId != null && s.rowCountLinkGroupId === groupId);

      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: prev.structure.sections.map((s) => {
            if (!isInGroup(s)) return s;
            const sCurrent = s.rows ?? 1;
            const sMin = s.minRows ?? 1;
            const sMax = s.maxRows ?? 100;
            const sNext = Math.max(sMin, Math.min(sMax, sCurrent + delta));
            if (sNext === sCurrent) return s;
            if (delta > 0 && s.cellFormulas && s.columns?.length) {
              const nextCellFormulas = { ...s.cellFormulas };
              const newRowIndex = sNext - 1;
              const prevRowIndex = newRowIndex - 1;
              s.columns.forEach((col) => {
                const newKey = `row${newRowIndex}_${col.id}`;
                const prevKey = `row${prevRowIndex}_${col.id}`;
                if (nextCellFormulas[prevKey] !== undefined) {
                  nextCellFormulas[newKey] = nextCellFormulas[prevKey];
                }
              });
              return { ...s, rows: sNext, cellFormulas: nextCellFormulas };
            }
            if (delta < 0 && s.cellFormulas && s.columns?.length) {
              const nextCellFormulas = { ...s.cellFormulas };
              s.columns.forEach((col) => {
                delete nextCellFormulas[`row${sCurrent - 1}_${col.id}`];
              });
              return { ...s, rows: sNext, cellFormulas: nextCellFormulas };
            }
            return { ...s, rows: sNext };
          }),
        },
      };
    });
  };

  const addConditionalRow = (sectionId: string) => {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: prev.structure.sections.map((s) => {
            if (s.id !== sectionId || !s.conditionalRows) return s;
            const newId = `row${s.conditionalRows.length}`;
            const newRow: ConditionalRowConfig = {
              id: newId,
              label: `Row ${s.conditionalRows.length + 1}`,
              visibleWhen: {},
            };
            if (s.settingFields?.length) {
              const sf = s.settingFields[0];
              const currentVal =
                formData[sectionId]?.[sf.id] ??
                sf.defaultValue ??
                sf.options[0]?.value ??
                "";
              newRow.visibleWhen = { [sf.id]: currentVal };
            }
            return { ...s, conditionalRows: [...s.conditionalRows, newRow] };
          }),
        },
      };
    });
  };

  const removeConditionalRow = (sectionId: string, rowId: string) => {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: prev.structure.sections.map((s) => {
            if (s.id !== sectionId || !s.conditionalRows) return s;
            return {
              ...s,
              conditionalRows: s.conditionalRows.filter((r) => r.id !== rowId),
            };
          }),
        },
      };
    });
  };

  const renderField = (
    sectionId: string,
    field: any,
    cellContext?: {
      baseSectionId: string;
      rowIndex: number;
      cellFormulas?: Record<string, string>;
      colId?: string;
    },
  ) => {
    const hasCellFormula =
      cellContext?.cellFormulas && cellContext?.colId
        ? !!cellContext.cellFormulas[
            `row${cellContext.rowIndex}_${cellContext.colId}`
          ]?.trim()
        : false;
    const useCellResolution =
      cellContext &&
      (hasCellFormula ||
        field.cellBehavior === "populate" ||
        field.cellBehavior === "calculate");
    const value = useCellResolution
      ? getCellValue(
          formData,
          field,
          sectionId,
          cellContext.baseSectionId,
          cellContext.rowIndex,
          template?.structure?.sections ?? [],
          cellContext.cellFormulas,
          cellContext.colId,
        )
      : formData[sectionId]?.[field.id] !== undefined
        ? formData[sectionId][field.id]
        : field.defaultValue || "";
    const readOnly =
      field.readOnly ||
      hasCellFormula ||
      (useCellResolution &&
        (field.cellBehavior === "populate" ||
          field.cellBehavior === "calculate"));

    const commonClasses =
      "w-full px-2 py-1.5 text-sm border border-neutral-200 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand";
    const readOnlyClasses =
      "w-full px-2 py-1.5 text-sm border border-neutral-200 dark:border-neutral-600 rounded bg-neutral-50 dark:bg-dark-200 text-neutral-700 dark:text-neutral-300";

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={value}
            onChange={(e) =>
              handleFieldChange(sectionId, field.id, e.target.value)
            }
            placeholder={field.placeholder}
            rows={3}
            readOnly={readOnly}
            className={readOnly ? readOnlyClasses : commonClasses}
          />
        );

      case "select":
        return (
          <select
            value={value}
            onChange={(e) =>
              handleFieldChange(sectionId, field.id, e.target.value)
            }
            disabled={readOnly}
            className={readOnly ? readOnlyClasses : commonClasses}
          >
            <option value="">Select...</option>
            {field.options?.map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "checkbox":
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) =>
              handleFieldChange(sectionId, field.id, e.target.checked)
            }
            disabled={readOnly}
            className="w-4 h-4 text-brand border-neutral-300 rounded focus:ring-brand"
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) =>
              handleFieldChange(sectionId, field.id, e.target.value)
            }
            readOnly={readOnly}
            className={readOnly ? readOnlyClasses : commonClasses}
          />
        );

      case "number":
        return (
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) =>
              handleFieldChange(sectionId, field.id, e.target.value)
            }
            placeholder={field.placeholder}
            readOnly={readOnly}
            className={readOnly ? readOnlyClasses : commonClasses}
          />
        );

      case "temperature-humidity": {
        const tempF = formData[sectionId]?.temperature ?? "";
        const tempC = formData[sectionId]?.temperatureCelsius ?? "";
        const tcfVal = formData[sectionId]?.tcf ?? "";
        const hum = formData[sectionId]?.humidity ?? "";
        return (
          <div className="temp-humidity-one-line flex flex-wrap items-center gap-x-2 gap-y-1 text-xs border border-neutral-200 dark:border-neutral-600 rounded px-2 py-1.5 bg-white dark:bg-dark-100 w-full max-w-full min-w-0">
            <span className="shrink-0 font-medium text-neutral-600 dark:text-neutral-400">
              °F
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={tempF}
              onChange={(e) =>
                handleFieldChange(sectionId, "temperature", e.target.value)
              }
              placeholder="68"
              title="Temperature (°F) — type here"
              className="temp-humidity-f temp-humidity-input w-10 min-w-[2.5rem] max-w-full px-2 py-1 border border-neutral-300 dark:border-neutral-500 rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:ring-1 focus:ring-brand focus:border-brand text-xs"
            />
            <span className="text-neutral-400 dark:text-neutral-500 shrink-0">
              °C
            </span>
            <span
              className="temp-humidity-c min-w-[2.5rem] text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums"
              title="Calculated"
            >
              {tempC}
            </span>
            <span className="text-neutral-400 dark:text-neutral-500 shrink-0">
              TCF
            </span>
            <span
              className="temp-humidity-tcf min-w-[2rem] text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums"
              title="Calculated"
            >
              {tcfVal}
            </span>
            <span className="shrink-0 text-neutral-600 dark:text-neutral-400">
              Humidity %
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={hum}
              onChange={(e) =>
                handleFieldChange(sectionId, "humidity", e.target.value)
              }
              placeholder="50"
              title="Humidity (%) — type here"
              className="temp-humidity-hum temp-humidity-input w-10 min-w-[2.5rem] max-w-full px-2 py-1 border border-neutral-300 dark:border-neutral-500 rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:ring-1 focus:ring-brand focus:border-brand text-xs"
            />
          </div>
        );
      }

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) =>
              handleFieldChange(sectionId, field.id, e.target.value)
            }
            placeholder={field.placeholder}
            readOnly={readOnly}
            className={readOnly ? readOnlyClasses : commonClasses}
          />
        );
    }
  };

  const getTablePrintLayoutStyles = (layout?: TablePrintLayout) => {
    if (!layout)
      return {
        wrapperStyle: undefined as React.CSSProperties | undefined,
        rowStyle: undefined as React.CSSProperties | undefined,
      };
    const wrapperStyle: React.CSSProperties = {};
    if (layout.marginTop != null && layout.marginTop !== "")
      wrapperStyle.marginTop = layout.marginTop;
    if (layout.marginRight != null && layout.marginRight !== "")
      wrapperStyle.marginRight = layout.marginRight;
    if (layout.marginBottom != null && layout.marginBottom !== "")
      wrapperStyle.marginBottom = layout.marginBottom;
    if (layout.marginLeft != null && layout.marginLeft !== "")
      wrapperStyle.marginLeft = layout.marginLeft;
    const rowStyle: React.CSSProperties | undefined = layout.rowHeight
      ? { minHeight: layout.rowHeight }
      : undefined;
    return {
      wrapperStyle: Object.keys(wrapperStyle).length ? wrapperStyle : undefined,
      rowStyle,
    };
  };

  const renderSection = (section: SectionConfig) => {
    const { wrapperStyle, rowStyle } = getTablePrintLayoutStyles(
      section.printLayout,
    );

    // Grouped fields: label + input stacked in each cell (e.g. Job Details)
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
      const fieldRows: (typeof section.fields)[] = [];
      for (let i = 0; i < section.fields.length; i += columns) {
        fieldRows.push(section.fields.slice(i, i + columns));
      }
      const colWidth = `${100 / columns}%`;
      return (
        <div className="overflow-x-auto" style={wrapperStyle}>
          <table
            className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 job-details-table"
            style={{ tableLayout: "fixed", width: "100%" }}
          >
            <colgroup>
              {Array.from({ length: columns }).map((_, i) => (
                <col key={i} style={{ width: colWidth }} />
              ))}
            </colgroup>
            <tbody>
              {fieldRows.map((row, rowIdx) => (
                <tr key={rowIdx} style={rowStyle ?? {}}>
                  {row.map((field) => (
                    <td
                      key={field.id}
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 align-top"
                    >
                      <div className="text-xs font-medium text-neutral-500 dark:text-white uppercase mb-1">
                        {field.label}
                        {field.unit && (
                          <span className="text-neutral-400 ml-1 normal-case">
                            ({field.unit})
                          </span>
                        )}
                        {field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </div>
                      {renderField(section.id, field)}
                    </td>
                  ))}
                  {row.length < columns &&
                    Array.from({ length: columns - row.length }).map((_, i) => (
                      <td
                        key={`empty-${i}`}
                        className="border border-neutral-300 dark:border-neutral-600 px-3 py-2"
                      ></td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Conditional table: setting dropdowns control which rows/columns are visible
    if (
      section.settingFields &&
      section.settingFields.length > 0 &&
      section.conditionalRows &&
      section.conditionalRows.length > 0 &&
      section.columns &&
      section.columns.length > 0
    ) {
      const settings: Record<string, string> = {};
      section.settingFields.forEach((sf) => {
        const current = formData[section.id]?.[sf.id];
        settings[sf.id] =
          current !== undefined && current !== null && current !== ""
            ? String(current)
            : (sf.defaultValue ?? sf.options[0]?.value ?? "");
      });
      const visibleRows = section.conditionalRows.filter((row) =>
        isVisibleWhen(row.visibleWhen, settings),
      );
      const visibleColumns = section.columns.filter((col: ColumnConfig) =>
        isVisibleWhen(col.visibleWhen, settings),
      );
      const rowIndices = new Map(
        section.conditionalRows.map((row, i) => [row.id, i]),
      );

      return (
        <div className="space-y-4 w-full min-w-0" style={wrapperStyle}>
          <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-neutral-200 dark:border-neutral-600 print:hidden">
            {section.settingFields.map((sf) => (
              <div key={sf.id} className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                  {sf.label}
                </label>
                <select
                  value={settings[sf.id]}
                  onChange={(e) =>
                    handleFieldChange(section.id, sf.id, e.target.value)
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
          <div className="overflow-x-auto w-full min-w-0">
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600">
              <colgroup>
                {visibleColumns.map((col) => (
                  <col
                    key={col.id}
                    style={col.width ? { width: col.width } : undefined}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.id}
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-sm font-medium text-neutral-900 dark:text-white"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const rowIndex = rowIndices.get(row.id) ?? 0;
                  const rowKey = `${section.id}_row${rowIndex}`;
                  return (
                    <tr key={row.id} style={rowStyle ?? {}}>
                      {visibleColumns.map((col, colIdx) => (
                        <td
                          key={col.id}
                          className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"
                          style={col.width ? { width: col.width } : undefined}
                        >
                          {colIdx === 0 ? (
                            <span className="block w-full px-2 py-1 text-sm text-neutral-900 dark:text-white font-medium">
                              {row.label}
                            </span>
                          ) : (
                            renderField(rowKey, col.field, {
                              baseSectionId: section.id,
                              rowIndex,
                              cellFormulas: section.cellFormulas,
                              colId: col.id,
                            })
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(section.allowAddRows || section.allowRemoveRows) && (
            <div className="flex items-center gap-2 mt-2 print:hidden">
              {section.allowAddRows && (
                <Button
                  type="button"
                  onClick={() => addConditionalRow(section.id)}
                  variant="outline"
                  size="sm"
                  className="text-xs text-brand border-brand hover:bg-orange-50 dark:hover:bg-orange-900/20"
                  leftIcon={<Plus className="w-3 h-3" />}
                >
                  Add Row
                </Button>
              )}
              {section.allowRemoveRows && visibleRows.length > 1 && (
                <Button
                  type="button"
                  onClick={() =>
                    removeConditionalRow(
                      section.id,
                      visibleRows[visibleRows.length - 1].id,
                    )
                  }
                  variant="outline"
                  size="sm"
                  className="text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                  leftIcon={<Minus className="w-3 h-3" />}
                >
                  Remove Row
                </Button>
              )}
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      );
    }

    // Table-based components with column width support
    if (section.columns && section.columns.length > 0) {
      const rowCount = section.rows || 1;
      const canAdd =
        section.allowAddRows && rowCount < (section.maxRows ?? 100);
      const canRemove =
        section.allowRemoveRows && rowCount > (section.minRows ?? 1);
      return (
        <div style={wrapperStyle}>
          {section.aboveTableFields && section.aboveTableFields.length > 0 && (
            <div className="flex flex-wrap items-end gap-4 gap-y-2 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-600">
              {section.aboveTableFields.map((f: any) => (
                <div key={f.id} className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {f.label}
                  </label>
                  {renderField(section.id, f, undefined)}
                </div>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600">
              <colgroup>
                {section.columns.map((col) => (
                  <col
                    key={col.id}
                    style={col.width ? { width: col.width } : undefined}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {section.columns.map((col) => (
                    <th
                      key={col.id}
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-sm font-medium text-neutral-900 dark:text-white"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }).map((_, rowIndex) => (
                  <tr key={rowIndex} style={rowStyle ?? {}}>
                    {section.columns!.map((col) => (
                      <td
                        key={col.id}
                        className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"
                        style={col.width ? { width: col.width } : undefined}
                      >
                        {renderField(
                          `${section.id}_row${rowIndex}`,
                          col.field,
                          {
                            baseSectionId: section.id,
                            rowIndex,
                            cellFormulas: section.cellFormulas,
                            colId: col.id,
                          },
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(canAdd || canRemove) && (
            <div className="flex items-center gap-2 mt-2 print:hidden">
              {canAdd && (
                <Button
                  type="button"
                  onClick={() => updateSectionRowCount(section.id, 1)}
                  variant="outline"
                  size="sm"
                  className="text-xs text-brand border-brand hover:bg-orange-50 dark:hover:bg-orange-900/20"
                  leftIcon={<Plus className="w-3 h-3" />}
                >
                  Add Row
                </Button>
              )}
              {canRemove && (
                <Button
                  type="button"
                  onClick={() => updateSectionRowCount(section.id, -1)}
                  variant="outline"
                  size="sm"
                  className="text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                  leftIcon={<Minus className="w-3 h-3" />}
                >
                  Remove Row
                </Button>
              )}
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {rowCount} row{rowCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      );
    }

    // Single field: label + input in one cell
    if (section.field) {
      return (
        <div className="overflow-x-auto" style={wrapperStyle}>
          <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600">
            <tbody>
              <tr style={rowStyle ?? {}}>
                <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
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
                  {renderField(section.id, section.field)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    // For checklists
    if (section.checklistItems && section.checklistItems.length > 0) {
      return (
        <div className="overflow-x-auto" style={wrapperStyle}>
          <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600">
            <thead>
              <tr>
                <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-sm font-medium">
                  NETA Section
                </th>
                <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-sm font-medium">
                  Description
                </th>
                <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-sm font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {section.checklistItems.map((item) => (
                <tr key={item.id} style={rowStyle ?? {}}>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm">
                    {item.netaSection || "-"}
                  </td>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm">
                    {item.description}
                  </td>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                    <select
                      value={formData[section.id]?.[item.id] || ""}
                      onChange={(e) =>
                        handleFieldChange(section.id, item.id, e.target.value)
                      }
                      className="w-full px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-sm"
                    >
                      <option value="">Select...</option>
                      {item.resultOptions?.map((opt: string) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <div className="flex justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <p className="text-red-600">Template not found</p>
          <Button
            onClick={() => navigate("/custom-forms/templates")}
            className="mt-4"
          >
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  const sortedSections = [...template.structure.sections].sort(
    (a, b) => a.order - b.order,
  );

  return (
    <ReportWrapper>
      {/* Print Header - matches standard reports: AMP logo left, title center, NETA + PASS/FAIL right */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6">
        <div
          style={{
            width: "120px",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
            alt="AMP Logo"
            className="h-10 w-auto"
            style={{ maxHeight: 35, marginLeft: "5px", marginTop: "2px" }}
          />
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">
            {template.name}
          </h1>
        </div>
        <div
          className="text-right font-extrabold text-xl flex flex-col items-end gap-0.5 print:gap-0.5"
          style={{ color: "#1a4e7c", width: "120px" }}
        >
          {template.netaSection && (
            <span className="text-base">NETA - {template.netaSection}</span>
          )}
          <div className="hidden print:block">
            <div
              className={`pass-fail-status-box ${status.toLowerCase() === "fail" ? "fail" : "pass"}`}
              style={{
                display: "inline-block",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "bold",
                textAlign: "center",
                width: "fit-content",
                borderRadius: "6px",
                border: `2px solid ${status === "PASS" ? "#16a34a" : "#dc2626"}`,
                backgroundColor: status === "PASS" ? "#22c55e" : "#ef4444",
                color: "white",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact" as any,
                boxSizing: "border-box",
                minWidth: "50px",
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </div>

      <div className="report-body min-h-screen bg-neutral-50 dark:bg-dark-200 p-4 md:p-6 print:min-h-0 print:bg-white print:p-0">
        <div className="max-w-5xl mx-auto print:max-w-none">
          <div className="custom-form-container bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-0">
            {/* Screen-only Header */}
            <div className="print:hidden flex items-center justify-between pb-4 mb-4 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/custom-forms/templates")}
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {template.name}
                  </h1>
                  {template.netaSection && (
                    <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-brand text-white rounded">
                      {template.netaSection}
                    </span>
                  )}
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Mode - Changes are not saved</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-2 rounded-none text-white bg-neutral-600 hover:bg-neutral-700"
                  title="Print Report"
                  aria-label="Print Report"
                >
                  <Printer className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setStatus(status === "PASS" ? "FAIL" : "PASS")}
                  className={`px-4 py-2 rounded-none text-white font-medium ${
                    status === "PASS"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {status}
                </button>
              </div>
            </div>

            {/* Form Sections */}
            {sortedSections.map((section, idx) => (
              <div
                key={section.id}
                className={idx > 0 ? "mt-6 print:mt-4" : ""}
              >
                <div className="w-full h-1 bg-brand mb-3 print:mb-1"></div>
                <h2 className="text-lg font-semibold mb-3 print:mb-1 print:text-sm text-neutral-900 dark:text-white print:text-black">
                  {section.title}
                </h2>
                {renderSection(section)}
              </div>
            ))}

            {sortedSections.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-neutral-500 dark:text-neutral-400">
                  This template has no sections yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default CustomFormPreview;
