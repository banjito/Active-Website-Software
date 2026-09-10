/**
 * Custom Form Filler
 *
 * The fill and workflow shell. It loads the template and any existing
 * instance, seeds job information, saves to custom_form_instances, creates an
 * asset and links it to the job. Everything the form itself looks like comes
 * from the shared runtime.
 */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useJobDetails } from "@/lib/hooks/useJobDetails";
import { toast } from "@/components/ui/toast";
import { ArrowLeft, Save, Printer, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportWrapper } from "@/components/reports/ReportWrapper";
import { ReportPhotosButton } from "@/components/reports/common/ReportPhotos";
import { ReportStatusButton } from "@/components/reports/common/ReportStatusButton";
import {
  newReportId,
  reportIdFromUrl,
} from "@/components/reports/common/reportIdentity";
import { ensureReportAssetLink } from "@/components/reports/linkReportAsset";
import {
  CustomFormTemplate,
  CustomFormTemplateVersion,
} from "@/lib/types/customForms";
import {
  resolveRenderStructure,
  getActiveTemplateVersion,
} from "@/lib/customForms/versioning";
import { resolveAllBindings } from "@/lib/customForms/v2/bindings";
import { companyConfig } from "@/lib/companyConfig";
import {
  adaptStoredData,
  buildStoredData,
  emptyInstanceState,
  mergeRuntimeIntoState,
  parseStoredData,
  projectStateToRuntime,
  type CustomFormInstanceStateV2,
  type RowInstanceV2,
} from "@/lib/customForms/instanceState";
import { validateInstanceStructure } from "@/lib/customForms/compile";
import { fahrenheitToCelsius, getTCF } from "@/lib/utils/temperatureCorrection";
import { EquipmentAutocomplete } from "@/components/equipment/EquipmentAutocomplete";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  defaultSettingValue,
  seedContactResistanceRows,
  type ControlSlot,
  type FormData,
} from "@/lib/customForms/runtime";
import { DocumentBody } from "./runtime/SectionFrame";
import { useApplyMutation, useFillChrome } from "./runtime/FillChrome";
import {
  CustomFormPrintHeader,
  StatusToggleButton,
  type CustomFormStatus,
} from "./runtime/PrintHeader";
import { useReportCssIsolation } from "./runtime/useReportCssIsolation";

export const CustomFormFiller: React.FC = () => {
  useReportCssIsolation();
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
  const [justSaved, setJustSaved] = useState(false);
  const [formData, setFormData] = useState<FormData>({});
  const [status, setStatus] = useState<CustomFormStatus>("PASS");

  // Which row this form writes to. After the first save the id is in the
  // address bar, put there with replaceState -- which useParams cannot see, so
  // a re-mount comes back on the /new route. Read the address bar instead.
  const urlInstanceId =
    instanceId && instanceId !== "new" ? instanceId : reportIdFromUrl();
  const [existingInstanceId, setExistingInstanceId] = useState<string | null>(
    urlInstanceId ?? null,
  );
  // The id minted for a form that has not been saved yet, kept stable so a
  // retried save overwrites its own row instead of creating a second one.
  const draftInstanceIdRef = useRef<string | null>(null);

  // The version this form renders from and is pinned to.
  const [pinnedVersion, setPinnedVersion] =
    useState<CustomFormTemplateVersion | null>(null);
  const [renderSource, setRenderSource] = useState<
    "pinned" | "active" | "draft"
  >("draft");
  // False until the versioning migration has been applied to this database.
  const [versioningReady, setVersioningReady] = useState(false);
  // Last revision we read. A save that does not match it lost a race.
  const [revision, setRevision] = useState<number | null>(null);
  // Durable V2 state. The renderer works on the flat projection of it, and
  // reads the row identities so a row keeps its identity across a save.
  const stateRef = useRef<CustomFormInstanceStateV2>(emptyInstanceState());
  const [instanceRows, setInstanceRows] = useState<
    Record<string, RowInstanceV2[]>
  >({});

  useEffect(() => {
    if (templateId) loadTemplateAndInstance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, instanceId]);

  // Auto-populate job info from the job record when a new form opens.
  useEffect(() => {
    if (!template || !jobDetails || existingInstanceId != null) return;
    const jobInfoSection = template.structure.sections.find(
      (s) => s.componentType === "job-info",
    );
    if (!jobInfoSection?.fields?.length) return;
    // Only seed a job-info block nobody has filled in. Checking the whole form
    // instead used to lose job details whenever another section seeded first.
    if (Object.keys(formData[jobInfoSection.id] ?? {}).length > 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const initial: Record<string, any> = {};
    const setTemperature = (fahrenheit: number, humidity?: number) => {
      const celsius = fahrenheitToCelsius(fahrenheit);
      initial.temperature = String(fahrenheit);
      initial.temperatureCelsius = celsius.toFixed(2);
      initial.tcf = getTCF(celsius).toFixed(3);
      if (humidity != null) initial.humidity = String(humidity);
    };

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
        setTemperature(68);
      } else if (f.id === "humidity") {
        initial[f.id] = "50";
      } else if (
        f.id === "temperatureHumidity" &&
        f.defaultTemperature != null
      ) {
        setTemperature(f.defaultTemperature ?? 68, f.defaultHumidity ?? 50);
      }
    });

    if (Object.keys(initial).length > 0) {
      setFormData((prev) => ({
        ...prev,
        [jobInfoSection.id]: { ...(prev[jobInfoSection.id] || {}), ...initial },
      }));
    }
  }, [template, jobDetails, jobId, user, existingInstanceId, formData]);

  // Contact-resistance sections open with their named rows already in place.
  useEffect(() => {
    if (!template || existingInstanceId != null) return;
    setFormData((prev) => seedContactResistanceRows(template, prev));
  }, [template, existingInstanceId]);

  /**
   * Load the form.
   *
   * The structure comes from the pinned template VERSION, not the template
   * draft, so editing a template in the builder cannot change a report that
   * has already been filled in. A form opened before the versioning migration
   * ran, or one whose version row is gone, falls back to the draft, which is
   * the pre-versioning behaviour.
   */
  const loadTemplateAndInstance = async () => {
    if (!templateId) return;
    setIsLoading(true);
    setTemplate(null);
    setPinnedVersion(null);
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

      // The migration adds these columns. Until it runs, save the legacy shape
      // rather than failing on columns the database does not have.
      const ready = "active_version_id" in templateRow;
      setVersioningReady(ready);

      const draft: CustomFormTemplate = {
        id: templateRow.id,
        name: templateRow.name,
        description: templateRow.description,
        netaSection: templateRow.neta_section,
        structure: templateRow.structure,
      };

      let instanceRow: any = null;
      if (urlInstanceId) {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("custom_form_instances")
          .select("*")
          .eq("id", urlInstanceId)
          .eq("job_id", jobId)
          .single();
        if (error || !data) throw new Error("The saved report could not be loaded. No new report was substituted.");
        if (data.template_id && data.template_id !== templateId) throw new Error("This saved report belongs to a different template.");
        instanceRow = data;
      }

      if (!ready && (instanceRow?.template_version_id || draft.structure.expressions !== undefined)) {
        throw new Error("This report requires template versioning. Check the database migration before opening it.");
      }
      const resolved = ready
        ? await resolveRenderStructure({
            templateId: templateRow.id,
            templateVersionId: instanceRow?.template_version_id ?? null,
            existingInstance: !!instanceRow,
            draft,
          })
        : { structure: draft.structure, version: null, source: "draft" as const };

      setPinnedVersion(resolved.version);
      setRenderSource(resolved.source);
      setTemplate({
        ...draft,
        name: resolved.version?.name ?? draft.name,
        description: resolved.version ? resolved.version.description : draft.description,
        netaSection: resolved.version ? resolved.version.netaSection : draft.netaSection,
        structure: resolved.structure,
      });

      if (instanceRow) {
        setExistingInstanceId(instanceRow.id);
        setStatus((instanceRow.status as CustomFormStatus) || "PASS");
        setRevision(
          typeof instanceRow.revision === "number" ? instanceRow.revision : null,
        );
        const stored = parseStoredData(instanceRow.data);
        const state = adaptStoredData(stored, resolved.structure);
        stateRef.current = state;
        setInstanceRows(state.tableRows);
        setFormData(projectStateToRuntime(state));
      }
    } catch (e) {
      console.error("Error loading template/instance:", e);
      toast({ title: e instanceof Error ? e.message : "Failed to load form", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const applyMutation = useApplyMutation(
    template,
    formData,
    setTemplate,
    setFormData,
  );

  /**
   * Test-equipment rows search the equipment catalogue and fill the serial
   * number, AMP id and calibration date from the chosen record.
   */
  const renderControlOverride = React.useCallback(
    (slot: ControlSlot): React.ReactNode | null => {
      if (slot.section.componentType !== "test-equipment") return null;
      if (slot.cell?.colId !== "equipment") return null;
      const stateKey = slot.stateKey;
      return (
        <EquipmentAutocomplete
          value={formData[stateKey]?.equipment ?? ""}
          onChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              [stateKey]: { ...(prev[stateKey] || {}), equipment: v },
            }))
          }
          onSelect={(equipment) => {
            const raw = equipment.calibration_date;
            const calibrationDate = raw
              ? (typeof raw === "string"
                  ? raw
                  : ((raw as Date).toISOString?.() ?? "")
                ).slice(0, 10)
              : "";
            setFormData((prev) => ({
              ...prev,
              [stateKey]: {
                ...(prev[stateKey] || {}),
                equipment: equipment.equipment_name,
                serialNumber: equipment.serial_number ?? "",
                ampId: equipment.amp_id ?? "",
                calibrationDate,
              },
            }));
          }}
          placeholder="Search equipment..."
          // Sizing only: this class lands on the autocomplete's wrapper, and
          // the full control styling here gave the cell a second border and a
          // second helping of padding.
          className="w-full min-w-0"
        />
      );
    },
    [formData],
  );

  /** Report context the template's declarative bindings resolve against. */
  const bindingValues = React.useMemo(
    () =>
      resolveAllBindings({
        job: {
          number: jobDetails?.job_number,
          title: jobDetails?.title,
          startDate: jobDetails?.start_date?.slice(0, 10),
        },
        customer: {
          name:
            jobDetails?.customer?.company_name ??
            jobDetails?.formattedCustomerName ??
            jobDetails?.customer?.name,
          address: jobDetails?.customer?.address,
        },
        site: { address: jobDetails?.site_address },
        technician: {
          name: user?.user_metadata?.full_name ?? user?.email,
          email: user?.email,
        },
        company: { name: companyConfig.name },
      }),
    [jobDetails, user],
  );

  const chrome = useFillChrome({
    template,
    formData,
    applyMutation,
    setFormData,
    renderControlOverride,
    bindingValues,
    instanceRows,
  });

  /**
   * The flat runtime map with conditional-table settings written out, so a
   * form saved without touching a dropdown reopens showing the same rows.
   */
  const runtimeWithSettingDefaults = () => {
    if (!template?.structure?.sections) return formData;
    const withDefaults = { ...formData };
    for (const section of template.structure.sections) {
      if (!section.settingFields?.length) continue;
      const current = withDefaults[section.id] ?? {};
      const next = { ...current };
      let updated = false;
      for (const setting of section.settingFields) {
        const value = current[setting.id];
        if (value === undefined || value === null || value === "") {
          next[setting.id] = defaultSettingValue(setting);
          updated = true;
        }
      }
      if (updated) withDefaults[section.id] = next;
    }
    return withDefaults;
  };

  /**
   * Instance payload. Written as V2 durable state plus the flat projection
   * every existing reader still understands. Row ids already in the state are
   * preserved; only genuinely new rows get new ones.
   */
  const buildInstanceData = (versionId?: string | null) => {
    const runtime = runtimeWithSettingDefaults();
    if (!template?.structure) {
      return { sections: runtime, status, templateName: template?.name };
    }
    const state = mergeRuntimeIntoState(
      stateRef.current,
      runtime,
      template.structure,
    );
    stateRef.current = state;
    setInstanceRows(state.tableRows);
    return buildStoredData(state, {
      status,
      templateName: template.name,
      templateId: template.id,
      templateVersionId: versionId ?? pinnedVersion?.id,
    });
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
      if (template.structure.expressions !== undefined && (!versioningReady || !pinnedVersion)) {
        throw new Error("Typed reports must be created from a published version. Reopen this report after publishing the template.");
      }
      // Structural validation. A draft saves with missing required fields, but
      // corrupt state is rejected rather than written over good data.
      const check = validateInstanceStructure(formData, template.structure);
      if (check.corrupt) {
        toast({
          title: check.issues[0]?.message ?? "Form data is corrupt; not saved",
          variant: "destructive",
        });
        return;
      }

      // A new form pins to the template's current published version.
      let versionId = pinnedVersion?.id ?? null;
      if (!existingInstanceId && versioningReady && !versionId && template.id) {
        const active = await getActiveTemplateVersion(template.id);
        if (active) {
          setPinnedVersion(active);
          setRenderSource("active");
          versionId = active.id;
        }
      }

      const versionColumns =
        versioningReady && versionId
          ? {
              template_version_id: versionId,
              template_version:
                pinnedVersion?.version ?? undefined,
              schema_version: 2,
              template_checksum: pinnedVersion?.checksum ?? null,
            }
          : {};

      const payload = {
        template_id: template.id,
        template_name: template.name,
        neta_section: template.netaSection || null,
        job_id: jobId,
        user_id: user.id,
        data: buildInstanceData(versionId),
        status,
        ...versionColumns,
      };

      if (existingInstanceId) {
        // Optimistic concurrency: the update only matches while the row still
        // carries the revision we read. A database trigger bumps it on write.
        let query = supabase
          .schema("neta_ops")
          .from("custom_form_instances")
          .update({
            data: payload.data,
            status: payload.status,
            ...versionColumns,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInstanceId)
          .eq("job_id", jobId);
        if (versioningReady && revision != null) {
          query = query.eq("revision", revision);
        }

        const { data: updated, error } = await query.select("revision");
        if (error) throw error;

        if (versioningReady && revision != null && !updated?.length) {
          toast({
            title:
              "Someone else saved this form since you opened it. Reload before saving so their work is not overwritten.",
            variant: "destructive",
          });
          return;
        }
        if (updated?.[0]?.revision != null) setRevision(updated[0].revision);
        else if (revision != null) setRevision(revision + 1);

        toast({ title: "Form updated", variant: "success" });
      } else {
        // Claim the id before the request goes out and upsert on it, so a save
        // that runs twice overwrites the same row instead of creating a copy.
        if (!draftInstanceIdRef.current) {
          draftInstanceIdRef.current = newReportId();
        }
        const newInstanceId = draftInstanceIdRef.current;

        const { error } = await supabase
          .schema("neta_ops")
          .from("custom_form_instances")
          .upsert({ ...payload, id: newInstanceId }, { onConflict: "id" });

        if (error) throw error;

        const assetName = `${template.name} – ${new Date().toLocaleDateString()}`;
        const fileUrl = `custom-form:/jobs/${jobId}/custom-form/${templateId}/${newInstanceId}`;

        // Idempotent on file_url, which carries the instance id, so a retried
        // save repairs the link rather than adding a second copy on the job.
        await ensureReportAssetLink(
          jobId,
          {
            name: assetName,
            file_url: fileUrl,
            user_id: user.id,
            status: "in_progress",
          },
          user.id,
        );

        setExistingInstanceId(newInstanceId);
        setRevision(1);
        toast({ title: "Form saved and linked to job", variant: "success" });
        // Stay on the report: swap the /new URL for the saved instance URL
        // without a router navigation (which would remount and reload the
        // form). Also lets the photos button attach to the saved instance.
        window.history.replaceState(
          window.history.state,
          "",
          `/jobs/${jobId}/custom-form/${templateId}/${newInstanceId}`,
        );
      }

      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
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
            onClick={() => navigate(`/jobs/${jobId}?tab=assets`)}
            className="mt-4"
          >
            Back to Job
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ReportWrapper>
      <CustomFormPrintHeader template={template} status={status} />

      <div className="min-h-screen bg-neutral-50 dark:bg-dark-200 p-4 md:p-6 print:min-h-0 print:bg-white print:p-0">
        <div className="max-w-5xl mx-auto print:max-w-none">
          <div className="custom-form-container bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-0">
            <div className="print:hidden flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/jobs/${jobId}?tab=assets`)}
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back to Job
                </Button>
                {/* Report status (renders nothing on unsaved instances) */}
                <ReportStatusButton />
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {template.name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    {template.netaSection && (
                      <span className="inline-block px-2 py-1 text-xs font-medium bg-brand text-white rounded">
                        {template.netaSection}
                      </span>
                    )}
                    {pinnedVersion ? (
                      <span
                        className="text-xs text-neutral-500 dark:text-neutral-400"
                        title={
                          renderSource === "pinned"
                            ? "This form is pinned to this template version. Later edits to the template will not change it."
                            : "New form, using the template's current published version."
                        }
                      >
                        Template v{pinnedVersion.version}
                        {pinnedVersion.origin === "imported" && " (imported)"}
                      </span>
                    ) : (
                      <span
                        className="text-xs text-amber-700 dark:text-amber-300"
                        title="No published version, so this form follows the editable draft. Publish the template to pin new forms to a fixed version."
                      >
                        Unversioned draft
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {template.structure.settings?.includePassFail !== false && (
                  <StatusToggleButton status={status} onChange={setStatus} />
                )}
                {/* Report Photos (renders nothing on unsaved instances) */}
                <ReportPhotosButton />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2 py-2 text-sm rounded-none text-white bg-neutral-600 border border-neutral-600 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500"
                  title="Print Report"
                  aria-label="Print Report"
                >
                  <Printer className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`flex h-10 w-10 items-center justify-center rounded-none text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    justSaved
                      ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                      : "bg-brand hover:bg-brand/90 focus:ring-brand"
                  }`}
                  title={justSaved ? "Saved" : "Save"}
                  aria-label={justSaved ? "Saved" : "Save"}
                >
                  {isSaving ? (
                    <LoadingSpinner size="xs" variant="light" />
                  ) : justSaved ? (
                    <Check className="h-6 w-6" />
                  ) : (
                    <Save className="h-6 w-6" />
                  )}
                </button>
              </div>
            </div>

            <DocumentBody template={template} chrome={chrome} />
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default CustomFormFiller;
