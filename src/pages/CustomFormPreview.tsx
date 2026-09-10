/**
 * Custom Form Preview page
 *
 * A loading and navigation shell around the shared runtime. It fills a
 * template out exactly as the job filler does, but saves nothing: no instance
 * row, no asset, no job link.
 */

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { ArrowLeft, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportWrapper } from "@/components/reports/ReportWrapper";
import { CustomFormTemplate } from "@/lib/types/customForms";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  seedContactResistanceRows,
  seedTemperatureDefaults,
  type FormData,
} from "@/lib/customForms/runtime";
import { DocumentBody } from "@/components/customForms/runtime/SectionFrame";
import {
  useApplyMutation,
  useFillChrome,
} from "@/components/customForms/runtime/FillChrome";
import {
  CustomFormPrintHeader,
  StatusToggleButton,
  type CustomFormStatus,
} from "@/components/customForms/runtime/PrintHeader";

export const CustomFormPreview: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<CustomFormTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<FormData>({});
  const [status, setStatus] = useState<CustomFormStatus>("PASS");

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
      seedTemperatureDefaults(template, seedContactResistanceRows(template, prev)),
    );
  }, [template]);

  const applyMutation = useApplyMutation(
    template,
    formData,
    setTemplate,
    setFormData,
  );

  const chrome = useFillChrome({
    template,
    formData,
    applyMutation,
    setFormData,
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

  return (
    <ReportWrapper>
      <CustomFormPrintHeader template={template} status={status} />

      <div className="report-body min-h-screen bg-neutral-50 dark:bg-dark-200 p-4 md:p-6 print:min-h-0 print:bg-white print:p-0">
        <div className="max-w-5xl mx-auto print:max-w-none">
          <div className="custom-form-container bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-0">
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
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 rounded-none text-white bg-neutral-600 hover:bg-neutral-700"
                  title="Print Report"
                  aria-label="Print Report"
                >
                  <Printer className="w-5 h-5" />
                </button>
                {template.structure.settings?.includePassFail !== false && (
                  <StatusToggleButton status={status} onChange={setStatus} />
                )}
              </div>
            </div>

            <DocumentBody template={template} chrome={chrome} />
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default CustomFormPreview;
