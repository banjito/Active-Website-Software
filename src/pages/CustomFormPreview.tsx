/**
 * Custom Form Preview page
 *
 * A loading and navigation shell around the shared runtime. It fills a
 * template out exactly as the job filler does, but saves nothing: no instance
 * row, no asset, no job link.
 */

import React, { useState, useEffect } from "react";
import { reportTestDate } from "@/lib/customForms/equipment";
import { seedReportLayout } from "@/lib/customForms/reportLayout";
import { useLookupTables } from "@/lib/customForms/lookupLibrary";
import { useAutoStatus } from "@/components/customForms/runtime/useAutoStatus";
import {
  EquipmentCalibrationBanner,
  useEquipmentControlOverride,
  useLiveEquipmentCalibration,
} from "@/components/customForms/runtime/EquipmentControl";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { ArrowLeft, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportWrapper } from "@/components/reports/ReportWrapper";
import { CustomFormTemplate } from "@/lib/types/customForms";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  seedContactResistanceRows,
  seedBlankEnvironment,
  seedJobInfoDefaults,
  type FormData,
} from "@/lib/customForms/runtime";
import { DocumentBody } from "@/components/customForms/runtime/SectionFrame";
import {
  PAPER_CLASS,
  PAPER_TOOLBAR_CLASS,
  PaperViewStyles,
  PaperViewToggle,
  usePaperView,
} from "@/components/customForms/runtime/PaperView";
import {
  useApplyMutation,
  useFillChrome,
} from "@/components/customForms/runtime/FillChrome";
import {
  CustomFormPrintHeader,
  StatusToggleButton,
  type CustomFormStatus,
} from "@/components/customForms/runtime/PrintHeader";
import { useReportCssIsolation } from "@/components/customForms/runtime/useReportCssIsolation";

export const CustomFormPreview: React.FC = () => {
  useReportCssIsolation();
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from the builder's Preview button: Back returns to that editor
  // rather than dropping you on the template list.
  const cameFromBuilder =
    (location.state as { from?: string } | null)?.from === "builder";
  const goBack = () =>
    navigate(
      cameFromBuilder && templateId
        ? `/custom-forms/builder/${templateId}`
        : "/custom-forms/templates",
    );

  const [template, setTemplate] = useState<CustomFormTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<FormData>({});
  const [status, setStatus] = useState<CustomFormStatus>("PASS");
  // Status follows the pass/fail result columns until set by hand.
  const autoStatus = useAutoStatus(template?.structure, formData, setStatus);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .select("*")
          .eq("id", templateId)
          .single();
        if (error) throw error;
        if (cancelled || !data) return;
        setTemplate({
          id: data.id,
          name: data.name,
          description: data.description,
          netaSection: data.neta_section,
          structure: data.structure,
        });
      } catch (error) {
        console.error("Error loading template:", error);
        if (!cancelled) toast.error("Failed to load template");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  // Seed the same defaults the filler seeds, so the preview starts where a
  // real form starts.
  useEffect(() => {
    if (!template) return;
    setFormData((prev) =>
      seedReportLayout(
        seedBlankEnvironment(template, seedJobInfoDefaults(template, seedContactResistanceRows(template, prev))),
      ),
    );
  }, [template]);

  const applyMutation = useApplyMutation(
    template,
    formData,
    setTemplate,
    setFormData,
  );

  const paper = usePaperView();
  // Formulas may read the shared lookup tables; re-render once they load.
  useLookupTables();
  // Equipment-search columns work in the preview too (nothing is saved).
  // Calibration from the Test Equipment table, so warnings follow the equipment's record.
  const liveCalibration = useLiveEquipmentCalibration(template?.structure, formData);
  // Calibration is judged on the report's test date, not today.
  const testDate = React.useMemo(() => reportTestDate(template?.structure, formData), [template, formData]);
  const renderControlOverride = useEquipmentControlOverride(formData, setFormData, false, liveCalibration, testDate);
  const chrome = useFillChrome({
    template,
    formData,
    applyMutation,
    setFormData,
    renderControlOverride,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">Template not found</p>
          <Button onClick={goBack} className="mt-4">
            {cameFromBuilder ? "Back to editor" : "Back to Templates"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ReportWrapper wide>
      <CustomFormPrintHeader template={template} status={status} />
      {paper.on && <PaperViewStyles />}

      <div className={`report-body min-h-screen bg-neutral-50 dark:bg-dark-200 p-4 md:p-6 print:min-h-0 print:bg-white print:p-0 ${paper.on ? PAPER_CLASS : ""}`}>
        <div className={paper.on ? "print:max-w-none" : "mx-auto print:max-w-none"}>
          <div
            className="custom-form-container bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-0"
            style={paper.sheetStyle}
          >
            <div className={`${PAPER_TOOLBAR_CLASS} print:hidden pb-4 mb-4 border-b border-neutral-200 dark:border-neutral-700`}>
              <div className="mb-3">
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {template.name}
                </h1>
                {template.netaSection && (
                  <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-brand text-white rounded-none">
                    {template.netaSection}
                  </span>
                )}
                <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Mode - Changes are not saved</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="whitespace-nowrap"
                onClick={goBack}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                {cameFromBuilder ? "Back to editor" : "Back"}
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <PaperViewToggle paper={paper} />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 rounded-none text-white bg-neutral-600 hover:bg-neutral-700"
                  title="Print Report"
                  aria-label="Print Report"
                >
                  <Printer className="w-5 h-5" />
                </button>
                {template.structure.settings?.includePassFail !== false && (
                  <StatusToggleButton
                    status={status}
                    onChange={(next) => {
                      setStatus(next);
                      autoStatus.setManual(true);
                    }}
                    autoState={
                      autoStatus.available
                        ? { manual: autoStatus.manual, onAuto: () => autoStatus.setManual(false) }
                        : undefined
                    }
                  />
                )}
              </div>
              </div>
            </div>

            {paper.on && (
              <CustomFormPrintHeader template={template} status={status} onScreen />
            )}
            <EquipmentCalibrationBanner structure={template.structure} formData={formData} live={liveCalibration} />
            <DocumentBody template={template} chrome={chrome} />
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default CustomFormPreview;
