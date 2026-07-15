/**
 * Custom Form Filler
 *
 * Fill out a custom form template in the context of a job. Saves to
 * custom_form_instances, creates an asset, and links to the job via job_assets.
 */

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useJobDetails } from "@/lib/hooks/useJobDetails";
import { toast } from "@/components/ui/toast";
import { ArrowLeft, Save, Printer, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportWrapper } from "@/components/reports/ReportWrapper";
import {
  CustomFormTemplate,
  SectionConfig,
  TablePrintLayout,
  type ConditionalRowConfig,
} from "@/lib/types/customForms";
import { fahrenheitToCelsius, getTCF } from "@/lib/utils/temperatureCorrection";
import { getCellValue } from "@/lib/customForms/formCellResolution";
import { EquipmentAutocomplete } from "@/components/equipment/EquipmentAutocomplete";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/** Visible when every setting in visibleWhen matches current settings (used for rows and columns) */
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

function isConditionalRowVisible(
  row: ConditionalRowConfig,
  settings: Record<string, string>,
): boolean {
  return isVisibleWhen(row.visibleWhen, settings);
}

export const CustomFormFiller: React.FC = () => {
  const { jobId, templateId, instanceId } = useParams<{
    jobId: string;
    templateId: string;
    instanceId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobDetails } = useJobDetails(jobId);

  const [template, setTemplate] = useState<CustomFormTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<"PASS" | "FAIL">("PASS");
  const [existingInstanceId, setExistingInstanceId] = useState<string | null>(
    instanceId && instanceId !== "new" ? instanceId : null,
  );

  // Load template and optionally existing instance
  useEffect(() => {
    if (templateId) {
      loadTemplateAndInstance();
    }
  }, [templateId, instanceId]);

  // Auto-populate job info when we have template + job and formData is empty (new form)
  useEffect(() => {
    if (
      !template ||
      !jobDetails ||
      existingInstanceId != null ||
      Object.keys(formData).length > 0
    ) {
      return;
    }
    const jobInfoSection = template.structure.sections.find(
      (s) => s.componentType === "job-info",
    );
    if (!jobInfoSection?.fields?.length) return;

    const today = new Date().toISOString().slice(0, 10);
    const initial: Record<string, any> = {};
    jobInfoSection.fields.forEach((f) => {
      if (f.id === "customer") {
        initial[f.id] =
          jobDetails.customer?.company_name ||
          jobDetails.formattedCustomerName ||
          jobDetails.customer?.name ||
          "";
      } else if (f.id === "siteAddress") {
        initial[f.id] =
          jobDetails.site_address || jobDetails.customer?.address || "";
      } else if (f.id === "jobNumber") {
        initial[f.id] =
          jobDetails.job_number || `JOB-${jobId?.slice(0, 8)}` || "";
      } else if (f.id === "date") {
        initial[f.id] = jobDetails.start_date?.slice(0, 10) || today;
      } else if (f.id === "user") {
        initial[f.id] = user?.email || user?.user_metadata?.full_name || "";
      } else if (f.id === "temperature") {
        const defaultF = 68;
        initial[f.id] = String(defaultF);
        initial["temperatureCelsius"] =
          fahrenheitToCelsius(defaultF).toFixed(2);
        initial["tcf"] = getTCF(fahrenheitToCelsius(defaultF)).toFixed(3);
      } else if (f.id === "humidity") {
        initial[f.id] = "50";
      } else if (
        f.id === "temperatureHumidity" &&
        (f as any).defaultTemperature != null
      ) {
        const defaultF = (f as any).defaultTemperature ?? 68;
        const defaultH = (f as any).defaultHumidity ?? 50;
        initial["temperature"] = String(defaultF);
        initial["temperatureCelsius"] =
          fahrenheitToCelsius(defaultF).toFixed(2);
        initial["tcf"] = getTCF(fahrenheitToCelsius(defaultF)).toFixed(3);
        initial["humidity"] = String(defaultH);
      }
    });
    if (Object.keys(initial).length > 0) {
      setFormData((prev) => ({
        ...prev,
        [jobInfoSection.id]: { ...(prev[jobInfoSection.id] || {}), ...initial },
      }));
    }
  }, [template, jobDetails, jobId, user, existingInstanceId]);

  // Seed contact-resistance sections with default row labels when template loads (new form)
  useEffect(() => {
    if (!template || existingInstanceId != null) return;
    const contactSections = template.structure.sections.filter(
      (s) => s.componentType === "contact-resistance" && s.columns?.length,
    );
    if (contactSections.length === 0) return;
    setFormData((prev) => {
      let next = { ...prev };
      for (const section of contactSections) {
        const labels = section.defaultRowLabels ?? [
          "Section 1",
          "Section 2",
          "Section 3",
          "Section 4",
          "Section 5",
        ];
        const rowCount = section.rows ?? 5;
        const firstRowKey = `${section.id}_row0`;
        if (prev[firstRowKey] != null) continue;
        for (let i = 0; i < rowCount; i++) {
          const rowKey = `${section.id}_row${i}`;
          const rowData: Record<string, any> = {};
          section.columns!.forEach((col) => {
            const fid = col.field?.id ?? col.id;
            if (fid === "busSection")
              rowData[fid] = labels[i] ?? `Section ${i + 1}`;
            else if (fid === "unit")
              rowData[fid] = col.field?.defaultValue ?? "μΩ";
            else rowData[fid] = "";
          });
          rowData.phaseCriteria = "<50%";
          rowData.phaseResult = "N/A";
          next[rowKey] = rowData;
        }
        next[section.id] = {
          ...(next[section.id] || {}),
          neutralCriteria: "N/A",
          neutralResult: "N/A",
          groundCriteria: "N/A",
          groundResult: "N/A",
        };
      }
      return next;
    });
  }, [template, existingInstanceId]);

  // Initialize temperature when template loads (default 68°F if not already set)
  useEffect(() => {
    if (!template || existingInstanceId != null) return;
    const jobInfoSection = template.structure.sections.find(
      (s) => s.componentType === "job-info",
    );
    if (!jobInfoSection) return;
    const tempField = jobInfoSection.fields?.find(
      (f) => f.id === "temperature",
    );
    const tempHumidityField = jobInfoSection.fields?.find(
      (f) => f.id === "temperatureHumidity",
    );
    let fahrenheit: number | null = null;
    let humidityDefault = 50;
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
    setFormData((prev) => {
      const sectionData = prev[jobInfoSection.id] || {};
      if (
        sectionData.temperature !== undefined &&
        sectionData.temperature !== ""
      )
        return prev;
      const celsius = fahrenheitToCelsius(fahrenheit);
      const tcf = getTCF(celsius);
      return {
        ...prev,
        [jobInfoSection.id]: {
          ...sectionData,
          temperature: fahrenheit.toString(),
          temperatureCelsius: celsius.toFixed(2),
          tcf: tcf.toFixed(3),
          humidity:
            sectionData.humidity !== undefined && sectionData.humidity !== ""
              ? sectionData.humidity
              : String(humidityDefault),
        },
      };
    });
  }, [template, existingInstanceId]);

  const loadTemplateAndInstance = async () => {
    if (!templateId) return;
    setIsLoading(true);
    try {
      const { data: templateRow, error: templateError } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (templateError || !templateRow) {
        toast({ title: "Template not found", variant: "destructive" });
        return;
      }

      setTemplate({
        id: templateRow.id,
        name: templateRow.name,
        description: templateRow.description,
        netaSection: templateRow.neta_section,
        structure: templateRow.structure,
      });

      const isNew = !instanceId || instanceId === "new";
      if (!isNew && instanceId) {
        const { data: instanceRow, error: instanceError } = await supabase
          .schema("neta_ops")
          .from("custom_form_instances")
          .select("*")
          .eq("id", instanceId)
          .eq("job_id", jobId)
          .single();

        if (!instanceError && instanceRow) {
          const rowData = instanceRow.data;
          const payload =
            typeof rowData === "string"
              ? (() => {
                  try {
                    return JSON.parse(rowData);
                  } catch {
                    return null;
                  }
                })()
              : rowData;
          setExistingInstanceId(instanceRow.id);
          setStatus((instanceRow.status as "PASS" | "FAIL") || "PASS");
          const sections = payload?.sections;
          if (sections && typeof sections === "object") {
            setFormData(sections);
          }
        }
      }
    } catch (e) {
      console.error("Error loading template/instance:", e);
      toast({ title: "Failed to load form", variant: "destructive" });
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
        if (value === "" || value == null) {
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
      return { ...prev, [sectionId]: updatedSection };
    });
  };

  const updateSectionRowCountRef = React.useRef<CustomFormTemplate | null>(
    null,
  );
  updateSectionRowCountRef.current = template;

  const updateSectionRowCount = (sectionId: string, delta: number) => {
    const tpl = updateSectionRowCountRef.current;
    if (!tpl) return;
    const section = tpl.structure.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const groupId = section.rowCountLinkGroupId;

    const isInGroup = (s: SectionConfig) =>
      s.id === sectionId ||
      (groupId != null && s.rowCountLinkGroupId === groupId);

    const linkedSections = tpl.structure.sections.filter(isInGroup);

    if (delta > 0) {
      setTemplate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          structure: {
            ...prev.structure,
            sections: prev.structure.sections.map((s) => {
              if (!isInGroup(s)) return s;
              const sCurrent = s.rows ?? 1;
              const sMax = s.maxRows ?? 100;
              const sNext = Math.min(sMax, sCurrent + 1);
              if (sNext === sCurrent) return s;
              const newRowIndex = sNext - 1;
              const prevRowIndex = newRowIndex - 1;
              if (!s.cellFormulas || !s.columns?.length)
                return { ...s, rows: sNext };
              const nextCellFormulas = { ...s.cellFormulas };
              s.columns.forEach((col) => {
                const newKey = `row${newRowIndex}_${col.id}`;
                const prevKey = `row${prevRowIndex}_${col.id}`;
                if (nextCellFormulas[prevKey] !== undefined)
                  nextCellFormulas[newKey] = nextCellFormulas[prevKey];
              });
              return { ...s, rows: sNext, cellFormulas: nextCellFormulas };
            }),
          },
        };
      });
      setFormData((prev) => {
        const nextData = { ...prev };
        linkedSections.forEach((s) => {
          if (s.id === sectionId) return;
          const sCurrent = s.rows ?? 1;
          const newRowKey = `${s.id}_row${sCurrent}`;
          const prevRowKey = `${s.id}_row${sCurrent - 1}`;
          if (prev[prevRowKey] && typeof prev[prevRowKey] === "object") {
            nextData[newRowKey] = { ...prev[prevRowKey] };
          } else {
            nextData[newRowKey] = {};
          }
        });
        return nextData;
      });
    } else {
      setTemplate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          structure: {
            ...prev.structure,
            sections: prev.structure.sections.map((s) => {
              if (!isInGroup(s)) return s;
              const sCurrent = s.rows ?? 1;
              const sMin = s.minRows ?? 1;
              const sNext = Math.max(sMin, sCurrent - 1);
              if (sNext === sCurrent) return s;
              const removedRowIndex = sCurrent - 1;
              if (!s.cellFormulas || !s.columns?.length)
                return { ...s, rows: sNext };
              const nextCellFormulas = { ...s.cellFormulas };
              s.columns?.forEach((col) => {
                delete nextCellFormulas[`row${removedRowIndex}_${col.id}`];
              });
              return { ...s, rows: sNext, cellFormulas: nextCellFormulas };
            }),
          },
        };
      });
      setFormData((prev) => {
        const nextData = { ...prev };
        linkedSections.forEach((s) => {
          const sCurrent = s.rows ?? 1;
          if (sCurrent > 1) {
            delete nextData[`${s.id}_row${sCurrent - 1}`];
          }
        });
        return nextData;
      });
    }
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

  const addContactResistanceRow = (sectionId: string) => {
    const section = template?.structure.sections.find(
      (s) => s.id === sectionId,
    );
    if (
      !section ||
      section.componentType !== "contact-resistance" ||
      !section.columns?.length
    )
      return;
    const rowCount = section.rows ?? 5;
    const labels = section.defaultRowLabels ?? [
      "Section 1",
      "Section 2",
      "Section 3",
      "Section 4",
      "Section 5",
    ];
    const newIndex = rowCount;
    updateSectionRowCount(sectionId, 1);
    setFormData((prev) => {
      const rowKey = `${sectionId}_row${newIndex}`;
      const rowData: Record<string, any> = {};
      section.columns!.forEach((col) => {
        const fid = col.field?.id ?? col.id;
        if (fid === "busSection")
          rowData[fid] = labels[newIndex] ?? `Section ${newIndex + 1}`;
        else if (fid === "unit") rowData[fid] = col.field?.defaultValue ?? "μΩ";
        else rowData[fid] = "";
      });
      rowData.phaseCriteria = "<50%";
      rowData.phaseResult = "N/A";
      return { ...prev, [rowKey]: rowData };
    });
  };

  const removeContactResistanceRow = (sectionId: string, rowIndex: number) => {
    const section = template?.structure.sections.find(
      (s) => s.id === sectionId,
    );
    if (!section || section.componentType !== "contact-resistance") return;
    const rowCount = section.rows ?? 5;
    if (rowCount <= 1) return;
    updateSectionRowCount(sectionId, -1);
    setFormData((prev) => {
      const next = { ...prev };
      // Shift rows after removed index down
      for (let i = rowIndex; i < rowCount - 1; i++) {
        const fromKey = `${sectionId}_row${i + 1}`;
        const toKey = `${sectionId}_row${i}`;
        next[toKey] = prev[fromKey] ?? {};
      }
      delete next[`${sectionId}_row${rowCount - 1}`];
      return next;
    });
  };

  const buildInstanceData = () => {
    let sections = formData;
    if (template?.structure?.sections) {
      const withDefaults = { ...formData };
      for (const section of template.structure.sections) {
        if (section.settingFields?.length) {
          const sid = section.id;
          const current = withDefaults[sid] ?? {};
          let updated = false;
          const next = { ...current };
          for (const sf of section.settingFields) {
            if (
              current[sf.id] === undefined ||
              current[sf.id] === null ||
              current[sf.id] === ""
            ) {
              next[sf.id] = sf.defaultValue ?? sf.options[0]?.value ?? "";
              updated = true;
            }
          }
          if (updated) withDefaults[sid] = next;
        }
      }
      sections = withDefaults;
    }
    return {
      sections,
      status,
      templateName: template?.name,
      templateId: template?.id,
    };
  };

  const handleSave = async () => {
    if (!template || !jobId || !user) {
      toast({
        title: "Missing template, job, or user",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        template_id: template.id,
        template_name: template.name,
        neta_section: template.netaSection || null,
        job_id: jobId,
        user_id: user.id,
        data: buildInstanceData(),
        status,
      };

      if (existingInstanceId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("custom_form_instances")
          .update({
            data: payload.data,
            status: payload.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInstanceId)
          .eq("job_id", jobId);

        if (error) throw error;
        toast({ title: "Form updated", variant: "success" });
      } else {
        const { data: inserted, error } = await supabase
          .schema("neta_ops")
          .from("custom_form_instances")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        const newInstanceId = inserted.id;

        const assetName = `${template.name} – ${new Date().toLocaleDateString()}`;
        const fileUrl = `custom-form:/jobs/${jobId}/custom-form/${templateId}/${newInstanceId}`;

        const { data: assetRow, error: assetError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .insert({
            name: assetName,
            file_url: fileUrl,
            status: "in_progress",
          })
          .select("id")
          .single();

        if (assetError) throw assetError;

        await supabase.schema("neta_ops").from("job_assets").insert({
          job_id: jobId,
          asset_id: assetRow.id,
          user_id: user.id,
        });

        setExistingInstanceId(newInstanceId);
        toast({ title: "Form saved and linked to job", variant: "success" });
      }

      navigate(`/jobs/${jobId}?tab=assets`, { replace: true });
    } catch (e: any) {
      console.error("Save error:", e);
      toast({
        title: e?.message || "Failed to save form",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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
    const rawValue = useCellResolution
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
        : (field.defaultValue ?? "");
    const value = rawValue !== undefined && rawValue !== null ? rawValue : "";
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
            {field.options?.map((opt: any, idx: number) => {
              const optionValue = opt?.value ?? opt?.label ?? "";
              const optionLabel = opt?.label ?? opt?.value ?? "";
              return (
                <option
                  key={`${field.id}-${idx}-${optionValue}`}
                  value={optionValue}
                >
                  {optionLabel}
                </option>
              );
            })}
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

  /** Build inline styles for table print layout (preview + print/PDF) */
  const getTablePrintLayoutStyles = (layout?: TablePrintLayout) => {
    if (!layout) return { wrapperStyle: undefined, rowStyle: undefined };
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
                <tr key={rowIdx} style={rowStyle}>
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
    // Contact resistance (bus-section layout + optional Value Deviation) – 7.1.1 Switchgear ATS 25 style
    if (
      section.componentType === "contact-resistance" &&
      section.columns &&
      section.columns.length > 0
    ) {
      const rowCount = section.rows ?? 5;
      const labels = section.defaultRowLabels ?? [
        "Section 1",
        "Section 2",
        "Section 3",
        "Section 4",
        "Section 5",
      ];
      const showDeviation = section.showDeviation !== false;
      const canAdd =
        section.allowAddRows && rowCount < (section.maxRows ?? 100);
      const canRemove =
        section.allowRemoveRows && rowCount > (section.minRows ?? 1);
      const phaseCriteriaOptions = ["<10%", "<25%", "<50%", "<75%", "<100%"];
      const phaseResultOptions = ["PASS", "FAIL", "LIMITED SERVICE", "N/A"];
      const neutralGroundCriteriaOptions = [
        "N/A",
        "<10%",
        "<25%",
        "<50%",
        "<75%",
        "<100%",
      ];
      const neutralGroundResultOptions = [
        "N/A",
        "PASS",
        "FAIL",
        "LIMITED SERVICE",
      ];
      return (
        <div style={wrapperStyle}>
          {section.aboveTableFields && section.aboveTableFields.length > 0 && (
            <div className="flex flex-wrap items-end gap-4 gap-y-2 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-600">
              {section.aboveTableFields.map((f) => (
                <div key={f.id} className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {f.label}
                  </label>
                  {renderField(section.id, f, undefined)}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300" />
            {canAdd && (
              <button
                type="button"
                onClick={() => addContactResistanceRow(section.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded focus:outline-none focus:ring-2 focus:ring-green-500 print:hidden"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            )}
          </div>
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
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 bg-neutral-50 dark:bg-dark-200 text-left text-xs font-medium text-neutral-900 dark:text-white uppercase tracking-wider"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }).map((_, rowIndex) => {
                  const rowKey = `${section.id}_row${rowIndex}`;
                  return (
                    <tr key={rowIndex} style={rowStyle}>
                      {section.columns!.map((col) => {
                        const fid = col.field?.id ?? col.id;
                        const isBusSection = fid === "busSection";
                        return (
                          <td
                            key={col.id}
                            className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"
                            style={col.width ? { width: col.width } : undefined}
                          >
                            {isBusSection ? (
                              <div className="flex items-center gap-1">
                                {renderField(rowKey, col.field, {
                                  baseSectionId: section.id,
                                  rowIndex,
                                  cellFormulas: section.cellFormulas,
                                  colId: col.id,
                                })}
                                {canRemove && rowCount > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeContactResistanceRow(
                                        section.id,
                                        rowIndex,
                                      )
                                    }
                                    className="p-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded focus:outline-none print:hidden"
                                    title="Remove row"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ) : (
                              renderField(rowKey, col.field, {
                                baseSectionId: section.id,
                                rowIndex,
                                cellFormulas: section.cellFormulas,
                                colId: col.id,
                              })
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showDeviation && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
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
                    {Array.from({ length: rowCount }).map((_, idx) => {
                      const rowKey = `${section.id}_row${idx}`;
                      const rowData = formData[rowKey] || {};
                      const criteria = rowData.phaseCriteria ?? "<50%";
                      const result = rowData.phaseResult ?? "N/A";
                      return (
                        <tr
                          key={idx}
                          className="border-t border-neutral-200 dark:border-neutral-700"
                        >
                          <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
                            Phase: N/A
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={criteria}
                              onChange={(e) =>
                                handleFieldChange(
                                  rowKey,
                                  "phaseCriteria",
                                  e.target.value,
                                )
                              }
                              className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                            >
                              {phaseCriteriaOptions.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={result}
                              onChange={(e) =>
                                handleFieldChange(
                                  rowKey,
                                  "phaseResult",
                                  e.target.value,
                                )
                              }
                              className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                            >
                              {phaseResultOptions.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
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
                    {["Neutral", "Ground"].map((label, i) => {
                      const sid = section.id;
                      const criteriaKey =
                        i === 0 ? "neutralCriteria" : "groundCriteria";
                      const resultKey =
                        i === 0 ? "neutralResult" : "groundResult";
                      const criteria = (formData[sid]?.[criteriaKey] ??
                        "N/A") as string;
                      const result = (formData[sid]?.[resultKey] ??
                        "N/A") as string;
                      return (
                        <tr
                          key={label}
                          className="border-t border-neutral-200 dark:border-neutral-700"
                        >
                          <td className="px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
                            {label}: N/A
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={criteria}
                              onChange={(e) =>
                                handleFieldChange(
                                  sid,
                                  criteriaKey,
                                  e.target.value,
                                )
                              }
                              className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                            >
                              {neutralGroundCriteriaOptions.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={result}
                              onChange={(e) =>
                                handleFieldChange(
                                  sid,
                                  resultKey,
                                  e.target.value,
                                )
                              }
                              className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                            >
                              {neutralGroundResultOptions.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }
    // Conditional table: setting dropdowns control which rows are visible (e.g. Primary=4 rows, Secondary=2)
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
        isConditionalRowVisible(row, settings),
      );
      const visibleColumns = section.columns.filter((col) =>
        isVisibleWhen(col.visibleWhen, settings),
      );
      const rowIndices = new Map(
        section.conditionalRows.map((row, i) => [row.id, i]),
      );

      return (
        <div className="space-y-4 w-full min-w-0" style={wrapperStyle}>
          <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-neutral-200 dark:border-neutral-600">
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
                    <tr key={row.id} {...(rowStyle ? { style: rowStyle } : {})}>
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
                <button
                  type="button"
                  onClick={() => addConditionalRow(section.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  <Plus className="w-3 h-3" /> Add Row
                </button>
              )}
              {section.allowRemoveRows && visibleRows.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    removeConditionalRow(
                      section.id,
                      visibleRows[visibleRows.length - 1].id,
                    )
                  }
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Minus className="w-3 h-3" /> Remove Row
                </button>
              )}
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      );
    }
    // Table-based components (custom table, etc.) with column width support
    if (section.columns && section.columns.length > 0) {
      const rowCount = section.rows ?? 1;
      const canAdd =
        section.allowAddRows && rowCount < (section.maxRows ?? 100);
      const canRemove =
        section.allowRemoveRows && rowCount > (section.minRows ?? 1);
      return (
        <div style={wrapperStyle}>
          {section.aboveTableFields && section.aboveTableFields.length > 0 && (
            <div className="flex flex-wrap items-end gap-4 gap-y-2 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-600">
              {section.aboveTableFields.map((f) => (
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
                  <tr key={rowIndex} style={rowStyle}>
                    {section.columns!.map((col) => {
                      const cellRowKey = `${section.id}_row${rowIndex}`;
                      const isEquipmentCell =
                        section.componentType === "test-equipment" &&
                        col.id === "equipment";
                      return (
                        <td
                          key={col.id}
                          className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"
                          style={col.width ? { width: col.width } : undefined}
                        >
                          {isEquipmentCell ? (
                            <EquipmentAutocomplete
                              value={formData[cellRowKey]?.equipment ?? ""}
                              onChange={(v) =>
                                handleFieldChange(cellRowKey, "equipment", v)
                              }
                              onSelect={(equipment) => {
                                const calDate = equipment.calibration_date
                                  ? (typeof equipment.calibration_date ===
                                    "string"
                                      ? equipment.calibration_date
                                      : ((equipment.calibration_date as Date)
                                          .toISOString?.()
                                          ?.slice(0, 10) ?? "")
                                    ).slice(0, 10)
                                  : "";
                                setFormData((prev) => ({
                                  ...prev,
                                  [cellRowKey]: {
                                    ...(prev[cellRowKey] || {}),
                                    equipment: equipment.equipment_name,
                                    serialNumber: equipment.serial_number ?? "",
                                    ampId: equipment.amp_id ?? "",
                                    calibrationDate: calDate,
                                  },
                                }));
                              }}
                              placeholder="Search equipment..."
                              className="w-full px-2 py-1.5 text-sm border border-neutral-200 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                            />
                          ) : (
                            renderField(cellRowKey, col.field, {
                              baseSectionId: section.id,
                              rowIndex,
                              cellFormulas: section.cellFormulas,
                              colId: col.id,
                            })
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(canAdd || canRemove) && (
            <div className="flex items-center gap-2 mt-2 print:hidden">
              {canAdd && (
                <button
                  type="button"
                  onClick={() => updateSectionRowCount(section.id, 1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  <Plus className="w-3 h-3" /> Add Row
                </button>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={() => updateSectionRowCount(section.id, -1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Minus className="w-3 h-3" /> Remove Row
                </button>
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
              <tr style={rowStyle}>
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
                <tr key={item.id} style={rowStyle}>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm">
                    {item.netaSection ?? "-"}
                  </td>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm">
                    {item.description}
                  </td>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                    <select
                      value={formData[section.id]?.[item.id] ?? ""}
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
          <div className="spinner mb-4" />
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
          <p className="text-red-600 dark:text-red-400">Template not found</p>
          <Button
            onClick={() => navigate(`/jobs/${jobId}?tab=assets`)}
            className="mt-4"
          >
            Back to Job
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

      <div className="min-h-screen bg-neutral-50 dark:bg-dark-200 p-4 md:p-6 print:min-h-0 print:bg-white print:p-0">
        <div className="max-w-5xl mx-auto print:max-w-none">
          <div className="custom-form-container bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-0">
            {/* Screen-only Header with controls */}
            <div className="print:hidden flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/jobs/${jobId}?tab=assets`)}
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back to Job
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
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 text-sm text-white bg-neutral-600 hover:bg-neutral-700 rounded-none flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStatus((s) => (s === "PASS" ? "FAIL" : "PASS"))
                  }
                  className={`px-4 py-2 rounded-none text-white font-medium ${
                    status === "PASS"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {status}
                </button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
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

export default CustomFormFiller;
