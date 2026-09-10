/**
 * Custom Form Templates List
 *
 * Displays all custom form templates and allows users to:
 * - Create new templates
 * - Edit existing templates
 * - Delete/deactivate templates (admin only)
 * - Use templates to create form instances
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  FileText,
  Search,
  Eye,
  Globe,
  Lock,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  listReports,
  generateTemplateFromReport,
  type ReportOption,
} from "@/lib/customForms/generateTemplateFromReport";
import { publishTemplateVersion } from "@/lib/customForms/versioning";
import { hasRegisteredConversion } from "@/lib/customForms/conversions";
import { importExcelTemplate } from "@/lib/customForms/excel/generate";
import {
  reviewAsDescription,
  summarizeExcelReview,
} from "@/lib/customForms/excel/import";

interface Template {
  id: string;
  name: string;
  description: string | null;
  neta_section: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published: boolean;
}

export const CustomFormTemplates: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // AI-assisted generation from a hard-coded report
  const [showAiModal, setShowAiModal] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const excelInputRef = React.useRef<HTMLInputElement>(null);
  // Drag events fire for every child element, so nesting is counted rather
  // than trusting a single leave to mean the pointer left the drop zone.
  const dragDepth = React.useRef(0);
  const reports = React.useMemo(() => listReports(), []);
  const filteredReports = reports.filter((r) =>
    r.fileName.toLowerCase().includes(reportSearch.toLowerCase()),
  );

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleGenerateFromReport = async (report: ReportOption) => {
    if (generatingReport) return;
    setGeneratingReport(report.path);
    const toastId = toast.loading(
      `Generating template from ${report.fileName}…`,
    );
    try {
      const template = await generateTemplateFromReport(report);

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .insert({
          name: template.name || report.fileName.replace(/\.(tsx|jsx)$/, ""),
          description: template.description || null,
          neta_section: template.netaSection || null,
          created_by: user?.id,
          structure: template.structure,
          is_active: true,
          is_published: false,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Draft template created — review it in the builder.", {
        id: toastId,
      });
      setShowAiModal(false);
      navigate(`/custom-forms/builder/${data.id}`);
    } catch (err) {
      console.error("Error generating template:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to generate template",
        { id: toastId },
      );
    } finally {
      setGeneratingReport(null);
    }
  };

  /**
   * Turn an uploaded workbook into a draft template.
   *
   * The workbook is read in this browser; only the resulting analysis is sent
   * for a layout. Formulas are translated here from the original file, and
   * whatever could not be reproduced arrives as review notes on the draft.
   */
  const handleExcelFile = async (file: File) => {
    if (importingExcel) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setExcelError(
        `${file.name} is not an .xlsx file. Open it in Excel and save a copy as .xlsx (macro-enabled .xlsm and older .xls files are not accepted).`,
      );
      return;
    }
    setExcelError(null);
    setImportingExcel(true);
    const toastId = toast.loading(`Reading ${file.name}…`);
    try {
      const draft = await importExcelTemplate(file);
      const counts = summarizeExcelReview(draft.review);

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .insert({
          name: draft.template.name || file.name.replace(/\.xlsx$/i, ""),
          description: reviewAsDescription(draft.review),
          neta_section: null,
          created_by: user?.id,
          structure: draft.template.structure,
          is_active: true,
          is_published: false,
        })
        .select()
        .single();
      if (error) throw error;

      const trouble = counts.different + counts.unsupported;
      toast.success(
        trouble
          ? `Draft created. ${trouble} calculation${trouble === 1 ? "" : "s"} need${trouble === 1 ? "s" : ""} checking — see the review notes at the end of the form.`
          : "Draft created — review it in the builder before publishing.",
        { id: toastId, duration: trouble ? 8000 : 4000 },
      );
      setShowExcelModal(false);
      navigate(`/custom-forms/builder/${data.id}`);
    } catch (err) {
      console.error("Excel import failed:", err);
      const message =
        err instanceof Error ? err.message : "Could not import that workbook";
      // The modal stays open on failure: the reader's messages say what to fix
      // in the workbook, and a toast disappears before it can be acted on.
      setExcelError(message);
      toast.error(message, { id: toastId, duration: 8000 });
    } finally {
      setImportingExcel(false);
    }
  };

  const openExcelModal = () => {
    setExcelError(null);
    setDragging(false);
    dragDepth.current = 0;
    setShowExcelModal(true);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (importingExcel) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.length) return;
    if (files.length > 1) {
      setExcelError("Drop one workbook at a time.");
      return;
    }
    void handleExcelFile(files[0]);
  };

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (
    templateId: string,
    templateName: string,
  ) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .update({ is_active: false })
        .eq("id", templateId);

      if (error) throw error;

      toast.success("Template deleted successfully");
      loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleDuplicateTemplate = async (templateId: string) => {
    try {
      // Load the template to duplicate
      const { data: originalTemplate, error: loadError } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (loadError) throw loadError;

      // Create a copy (always starts as unpublished draft)
      const { error: insertError } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .insert({
          name: `${originalTemplate.name} (Copy)`,
          description: originalTemplate.description,
          neta_section: originalTemplate.neta_section,
          created_by: user?.id,
          structure: originalTemplate.structure,
          is_active: true,
          is_published: false,
        });

      if (insertError) throw insertError;

      toast.success("Template duplicated successfully");
      loadTemplates();
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast.error("Failed to duplicate template");
    }
  };

  /**
   * Publishing compiles the draft and freezes it as a new immutable version.
   * Unpublishing only hides the template from jobs; published versions stay,
   * because filled-in forms are pinned to them.
   */
  const handleTogglePublish = async (
    templateId: string,
    currentlyPublished: boolean,
  ) => {
    if (currentlyPublished) {
      try {
        const { error } = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .update({ is_published: false })
          .eq("id", templateId);
        if (error) throw error;
        toast.success("Template unpublished");
        loadTemplates();
      } catch (error) {
        console.error("Error unpublishing template:", error);
        toast.error("Failed to update publish status");
      }
      return;
    }

    setPublishingId(templateId);
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .select("*")
        .eq("id", templateId)
        .single();
      if (error || !data) throw error ?? new Error("Template not found");

      const result = await publishTemplateVersion(
        {
          id: data.id,
          name: data.name,
          description: data.description ?? undefined,
          netaSection: data.neta_section ?? undefined,
          structure: data.structure,
        },
        { userId: user?.id },
      );

      if (!result.ok) {
        const firstError = result.report.errors[0];
        toast.error(
          result.error ??
            (firstError
              ? `Cannot publish: ${firstError.message}`
              : "Cannot publish: the template did not compile."),
        );
        return;
      }

      toast.success(
        `Published version ${result.version!.version}. It will now appear in jobs.`,
      );
      loadTemplates();
    } catch (error) {
      console.error("Error publishing template:", error);
      toast.error("Failed to update publish status");
    } finally {
      setPublishingId(null);
    }
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.neta_section?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-200 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
                Custom Form Templates
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={openExcelModal}
                variant="outline"
                title="Read an .xlsx workbook and turn it into a draft template. Calculations are translated from the workbook and checked against its saved results."
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Import Excel
              </Button>
              <Button
                onClick={() => {
                  setReportSearch("");
                  setShowAiModal(true);
                }}
                variant="outline"
                className="border-brand text-brand hover:bg-brand/10"
                leftIcon={<Sparkles className="w-4 h-4" />}
              >
                Generate with AI
              </Button>
              <Button
                onClick={() => navigate("/custom-forms/builder")}
                className="bg-brand hover:bg-brand-dark"
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create Template
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto text-neutral-400 dark:text-neutral-500 mb-4" />
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                  {searchQuery ? "No templates found" : "No templates yet"}
                </h3>
                <p className="text-neutral-500 dark:text-neutral-400 mb-6">
                  {searchQuery
                    ? "Try adjusting your search criteria"
                    : "Create your first custom form template to get started"}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={() => navigate("/custom-forms/builder")}
                    className="bg-brand hover:bg-brand-dark"
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Create Your First Template
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg truncate">
                          {template.name}
                        </CardTitle>
                        {template.is_published ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-none">
                            <Globe className="w-4 h-4" />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 rounded-none">
                            <Lock className="w-3 h-3" />
                            Draft
                          </span>
                        )}
                      </div>
                      {template.neta_section && (
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-brand text-white rounded">
                          {template.neta_section}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {template.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                    Updated {new Date(template.updated_at).toLocaleDateString()}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(`/custom-forms/preview/${template.id}`)
                        }
                        className="flex-1 bg-brand hover:bg-brand-dark"
                        leftIcon={<Eye className="w-4 h-4" />}
                      >
                        Preview
                      </Button>

                      <Button
                        size="sm"
                        onClick={() =>
                          handleTogglePublish(
                            template.id,
                            template.is_published,
                          )
                        }
                        disabled={publishingId === template.id}
                        variant={template.is_published ? "outline" : "primary"}
                        className={`flex-1 ${template.is_published ? "border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" : "bg-green-600 hover:bg-green-700 text-white"}`}
                        title={
                          template.is_published
                            ? "Unpublish — hide from jobs"
                            : "Publish — make available in jobs"
                        }
                        leftIcon={
                          template.is_published ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Globe className="w-4 h-4" />
                          )
                        }
                      >
                        {publishingId === template.id
                          ? "Publishing..."
                          : template.is_published
                            ? "Unpublish"
                            : "Publish"}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(`/custom-forms/builder/${template.id}`)
                        }
                        className="[&>span:first-child]:mr-0 border-none"
                        leftIcon={<Edit className="w-4 h-4" />}
                      ></Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDuplicateTemplate(template.id)}
                        title="Duplicate template"
                        aria-label="Duplicate template"
                        className="[&>span:first-child]:mr-0 border-none"
                        leftIcon={<Copy className="w-4 h-4" />}
                      />

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleDeleteTemplate(template.id, template.name)
                        }
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 [&>span:first-child]:mr-0 border-none"
                        title="Delete template"
                        aria-label="Delete template"
                        leftIcon={<Trash2 className="w-4 h-4" />}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Excel import modal */}
      {showExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-dark-100 rounded-lg shadow-xl">
            <div className="flex items-start justify-between p-6 pb-4">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-brand" />
                  Import an Excel workbook
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  The workbook is read in your browser and turned into a draft
                  template you can edit.
                </p>
              </div>
              <button
                onClick={() => !importingExcel && setShowExcelModal(false)}
                disabled={importingExcel}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-6">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clear first, so picking the same file twice still fires.
                  e.target.value = "";
                  if (file) void handleExcelFile(file);
                }}
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Choose or drop an .xlsx workbook"
                onClick={() => !importingExcel && excelInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!importingExcel) excelInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  dragDepth.current += 1;
                  setDragging(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (dragDepth.current === 0) setDragging(false);
                }}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-lg border-2 border-dashed text-center transition-colors ${
                  importingExcel
                    ? "cursor-wait border-neutral-300 dark:border-neutral-600"
                    : dragging
                      ? "cursor-copy border-brand bg-brand/10"
                      : "cursor-pointer border-neutral-300 dark:border-neutral-600 hover:border-brand hover:bg-brand/5"
                }`}
              >
                {importingExcel ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      Reading the workbook and building a draft…
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      This can take a moment on a large file.
                    </p>
                  </>
                ) : (
                  <>
                    <Upload
                      className={`w-8 h-8 ${dragging ? "text-brand" : "text-neutral-400"}`}
                    />
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {dragging
                        ? "Drop the workbook to import it"
                        : "Drag a workbook here, or click to choose one"}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      .xlsx only, up to 10 MB. Macro-enabled and password
                      protected files are not accepted.
                    </p>
                  </>
                )}
              </div>

              {excelError && (
                <p className="mt-3 text-sm text-red-700 dark:text-red-300">
                  {excelError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI: Generate from report modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-dark-100 rounded-lg shadow-xl">
            <div className="flex items-start justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand" />
                  Generate template from a report
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  Pick a hard-coded report. AI reads its source and creates a
                  draft template you can review and edit.
                </p>
              </div>
              <button
                onClick={() => !generatingReport && setShowAiModal(false)}
                disabled={!!generatingReport}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-5 h-5" />
                <Input
                  type="text"
                  placeholder="Search reports..."
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {filteredReports.length === 0 ? (
                <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
                  No reports match your search.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filteredReports.map((report) => {
                    const busy = generatingReport === report.path;
                    return (
                      <li
                        key={report.path}
                        className="flex items-center justify-between py-2.5"
                      >
                        <span className="flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200 truncate">
                          <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                          {report.fileName}
                          {hasRegisteredConversion(report.fileName) && (
                            <span
                              className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                              title="Uses a hand-built conversion tested against this report, not the AI. Still needs engineering and PDF review before certification."
                            >
                              Tested conversion
                            </span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => handleGenerateFromReport(report)}
                          disabled={!!generatingReport}
                          className="bg-brand hover:bg-brand-dark shrink-0"
                        >
                          {busy ? "Generating…" : "Generate"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomFormTemplates;
