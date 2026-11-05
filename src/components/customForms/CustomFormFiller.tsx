/**
 * Custom Form Filler
 *
 * The fill and workflow shell. It loads the template and any existing
 * instance, seeds job information, saves to custom_form_instances, creates an
 * asset and links it to the job. Everything the form itself looks like comes
 * from the shared runtime.
 */

import React, { useState, useEffect, useRef } from "react";
import { reportTestDate } from "@/lib/customForms/equipment";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useJobDetails } from "@/lib/hooks/useJobDetails";
import { toast } from "@/components/ui/toast";
import { Database, History, ArrowLeft, Save, Printer, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportWrapper } from "@/components/reports/ReportWrapper";
import { ReportPhotosButton } from "@/components/reports/common/ReportPhotos";
import { ReportStatusButton } from "@/components/reports/common/ReportStatusButton";
import {
  FieldFlagsOverlay,
  FlaggedFieldsList,
  useReportFieldFlags,
} from "@/components/reports/common/fieldFlags/ReportFieldFlags";
import {
  newReportId,
  reportIdFromUrl,
} from "@/components/reports/common/reportIdentity";
import { ensureReportAssetLink } from "@/components/reports/linkReportAsset";
import { useEquipmentAssetPrefill } from "@/components/reports/useEquipmentAssetPrefill";
import { applyAssetSources } from "@/lib/customForms/assetFill";
import { copyPreviousReadings } from "@/lib/customForms/copyPrevious";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { applyAssetToCustomForm } from "@/lib/assetFormPrefill";
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
import { fahrenheitToCelsius, getRoundedTCF } from "@/lib/utils/temperatureCorrection";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  defaultSettingValue,
  seedContactResistanceRows,
  type ControlSlot,
  type FormData,
} from "@/lib/customForms/runtime";
import { DocumentBody } from "./runtime/SectionFrame";
import { useLookupTables } from "@/lib/customForms/lookupLibrary";
import { computeAutoStatus, useAutoStatus } from "./runtime/useAutoStatus";
import { EquipmentCalibrationBanner, useEquipmentControlOverride, useLiveEquipmentCalibration } from "./runtime/EquipmentControl";
import {
  clearLocalDraft,
  loadLocalDraft,
  localDraftKey,
  saveLocalDraft,
  type LocalDraft,
} from "@/lib/customForms/localDraft";
import {
  reportSaveFailed,
  reportSaveSucceeded,
  resetSaveStatus,
} from "@/components/reports/common/autoSaveStatus";
import {
  PAPER_CLASS,
  PAPER_TOOLBAR_CLASS,
  PaperViewStyles,
  PaperViewToggle,
  usePaperView,
} from "./runtime/PaperView";
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
  // Custom forms skip the app Layout, so they mount reviewer field flags here.
  const fieldFlags = useReportFieldFlags(true);
  const { user } = useAuth();
  const { jobDetails } = useJobDetails(jobId);

  const [template, setTemplate] = useState<CustomFormTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formData, setFormData] = useState<FormData>({});
  const [status, setStatus] = useState<CustomFormStatus>("PASS");

  /*
   * Autosave. Only the technician's own edits count as changes (the form also
   * fills itself in on open: job details, defaults, the asset), so opening a
   * report never writes it. editCount goes up on every edit; savedEditCount is
   * the edit a save covered. They differ while there are unsaved changes.
   */
  const [editCount, setEditCount] = useState(0);
  const [savedEditCount, setSavedEditCount] = useState(0);
  const editCountRef = useRef(0);
  editCountRef.current = editCount;
  const hasUnsavedChanges = editCount !== savedEditCount;
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingDraft, setPendingDraft] = useState<LocalDraft | null>(null);
  const draftKey = localDraftKey(jobId, templateId, instanceId);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const statusRef = useRef(status);
  statusRef.current = status;
  /** When the server copy was last written, to tell a stale browser draft from a fresh one. */
  const serverUpdatedAtRef = useRef<number | null>(null);
  const setFormDataByUser: React.Dispatch<React.SetStateAction<FormData>> = React.useCallback(
    (update) => {
      setFormData(update);
      setEditCount((n) => n + 1);
    },
    [],
  );

  // Status follows the pass/fail result columns until set by hand.
  const autoStatus = useAutoStatus(template?.structure, formData, setStatus);

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
  const jobInfoSeededRef = useRef(false);

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
    jobInfoSeededRef.current = false;
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
    // Seed once. Checking for an empty block instead lost the job details
    // whenever the asset prefill wrote the identifier into it first.
    if (jobInfoSeededRef.current) return;
    jobInfoSeededRef.current = true;

    const today = new Date().toISOString().slice(0, 10);
    const initial: Record<string, any> = {};
    const setTemperature = (fahrenheit: number, humidity?: number) => {
      const celsius = fahrenheitToCelsius(fahrenheit);
      initial.temperature = String(fahrenheit);
      initial.temperatureCelsius = celsius.toFixed(2);
      initial.tcf = getRoundedTCF(celsius).toFixed(3);
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
      // Anything already filled in the block (typed, or from the asset) stays.
      setFormData((prev) => {
        const block = { ...(prev[jobInfoSection.id] || {}) };
        for (const [key, value] of Object.entries(initial)) {
          if (block[key] == null || block[key] === "") block[key] = value;
        }
        return { ...prev, [jobInfoSection.id]: block };
      });
    }
  }, [template, jobDetails, jobId, user, existingInstanceId]);

  // Opened from an asset in the Assets tab: fill the identifier, location and nameplate
  // fields from it. The report links to the asset on first save (ensureReportAssetLink).
  const { asset: equipmentAsset, shouldPrefill: shouldPrefillAsset } =
    useEquipmentAssetPrefill(existingInstanceId ?? undefined);
  const assetPrefilledRef = useRef(false);
  useEffect(() => {
    if (!template || !equipmentAsset || !shouldPrefillAsset) return;
    if (assetPrefilledRef.current) return;
    assetPrefilledRef.current = true;
    // Test-equipment and table sections have their own serial numbers; leave them alone.
    const sections = template.structure.sections
      .filter((s) =>
        ["job-info", "nameplate-data", "extended-nameplate"].includes(s.componentType),
      )
      .map((s) => ({ id: s.id, fieldIds: (s.fields ?? []).map((f) => f.id) }));
    setFormData((prev) => {
      const byName = applyAssetToCustomForm(equipmentAsset, sections, prev);
      // Fields the builder pointed at an asset value; on a new report the asset
      // beats the form's starting defaults.
      return applyAssetSources(template.structure.sections, equipmentAsset, byName, true).form;
    });
  }, [template, equipmentAsset, shouldPrefillAsset]);

  /**
   * "Copy from last report": the most recent other report of this form on the
   * same equipment, its readings copied into fields that are still empty.
   */
  const [copyingPrevious, setCopyingPrevious] = useState(false);
  const copyFromLastReport = async () => {
    if (!template || !equipmentAsset || !templateId) return;
    setCopyingPrevious(true);
    try {
      const { data: links, error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select("file_url, created_at")
        .eq("equipment_asset_id", equipmentAsset.id)
        .like("file_url", `custom-form:/jobs/%/custom-form/${templateId}/%`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const previousId = (links ?? [])
        .map((l: any) => String(l.file_url).split("/").pop())
        .find((id) => id && id !== existingInstanceId);
      if (!previousId) {
        toast({ title: `No earlier ${template.name} on ${equipmentAsset.identifier || "this equipment"} to copy from.` });
        return;
      }
      const { data: row, error: rowError } = await supabase
        .schema("neta_ops")
        .from("custom_form_instances")
        .select("data, updated_at, created_at")
        .eq("id", previousId)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row) {
        toast({ title: "The earlier report could not be opened." });
        return;
      }
      const when = new Date(row.updated_at ?? row.created_at).toLocaleDateString();
      const ok = await confirmDialog({
        title: `Copy readings from the report of ${when}?`,
        description:
          "Only empty fields are filled. Job details, temperature, signatures and photos are not copied.",
        confirmLabel: "Copy readings",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
      const previous = projectStateToRuntime(adaptStoredData(parseStoredData(row.data), template.structure));
      const result = copyPreviousReadings(template.structure, formData, previous);
      if (!result.copied) {
        toast({ title: "Nothing to copy: those fields are already filled in." });
        return;
      }
      setFormDataByUser(result.formData);
      toast({ title: `Copied ${result.copied} value${result.copied === 1 ? "" : "s"} from ${when}`, variant: "success" });
    } catch (e: any) {
      console.error("Copy from last report failed:", e);
      toast({ title: e?.message || "Could not copy from the last report", variant: "destructive" });
    } finally {
      setCopyingPrevious(false);
    }
  };

  /** "Fill from asset": fill whatever is still empty from the linked equipment. */
  const fillFromAsset = () => {
    if (!template || !equipmentAsset) return;
    const sections = template.structure.sections
      .filter((s) =>
        ["job-info", "nameplate-data", "extended-nameplate"].includes(s.componentType),
      )
      .map((s) => ({ id: s.id, fieldIds: (s.fields ?? []).map((f) => f.id) }));
    const before = formData;
    const byName = applyAssetToCustomForm(equipmentAsset, sections, before);
    const result = applyAssetSources(template.structure.sections, equipmentAsset, byName, false);
    if (result.form === before) {
      toast({ title: "Nothing to fill: the asset's values are already in, or those fields are filled." });
      return;
    }
    setFormDataByUser(result.form);
    toast({ title: `Filled from ${equipmentAsset.identifier || "the asset"}`, variant: "success" });
  };

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
        serverUpdatedAtRef.current = instanceRow.updated_at
          ? new Date(instanceRow.updated_at).getTime()
          : null;
        setExistingInstanceId(instanceRow.id);
        setStatus((instanceRow.status as CustomFormStatus) || "PASS");
        setRevision(
          typeof instanceRow.revision === "number" ? instanceRow.revision : null,
        );
        const stored = parseStoredData(instanceRow.data);
        const state = adaptStoredData(stored, resolved.structure);
        stateRef.current = state;
        setInstanceRows(state.tableRows);
        const loaded = projectStateToRuntime(state);
        setFormData(loaded);
        // A saved status that disagrees with the results was chosen by hand: keep it.
        const fromResults = computeAutoStatus(resolved.structure, loaded);
        autoStatus.setManual(
          !!instanceRow.status && fromResults !== null && instanceRow.status !== fromResults,
        );
      }
    } catch (e) {
      console.error("Error loading template/instance:", e);
      toast({ title: e instanceof Error ? e.message : "Failed to load form", variant: "destructive" });
    } finally {
      setIsLoading(false);
      // Unsaved work left in this browser (closed tab, crash, lost signal)?
      const draft = loadLocalDraft(draftKey);
      if (draft && (!serverUpdatedAtRef.current || draft.savedAt > serverUpdatedAtRef.current)) {
        setPendingDraft(draft);
      } else if (draft) {
        // The server copy is newer (saved elsewhere since): this draft is stale.
        clearLocalDraft(draftKey);
      }
    }
  };

  const applyMutation = useApplyMutation(
    template,
    formData,
    setTemplate,
    setFormDataByUser,
  );

  /**
   * Equipment-search columns (the Test Equipment component's, and any column
   * set up as one) search the equipment catalogue, fill serial / AMP id /
   * calibration from the chosen record, and warn about expired calibration.
   */
  // Calibration from the Test Equipment table, so warnings follow the equipment's record.
  const liveCalibration = useLiveEquipmentCalibration(template?.structure, formData);
  // Calibration is judged on the report's test date, not today.
  const testDate = React.useMemo(() => reportTestDate(template?.structure, formData), [template, formData]);
  const renderControlOverride = useEquipmentControlOverride(formData, setFormDataByUser, false, liveCalibration, testDate);

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

  const paper = usePaperView();
  // Formulas may read the shared lookup tables; re-render once they load.
  useLookupTables();
  const chrome = useFillChrome({
    template,
    formData,
    applyMutation,
    setFormData: setFormDataByUser,
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

  /**
   * Save the form. `silent` is the autosave: no toasts, and a failure shows the
   * shared "not saved" banner instead (it stays until a save works).
   */
  const handleSave = async (options: { silent?: boolean } = {}) => {
    const silent = !!options.silent;
    if (!template || !jobId || !user) {
      if (!silent) {
        toast({
          title: "Missing template, job, or user",
          variant: "destructive",
        });
      }
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    // Edits made while this save is in flight still count as unsaved.
    const coveredEdit = editCountRef.current;
    if (silent) setAutoSaving(true);
    else setIsSaving(true);
    let saved = false;
    try {
      if (template.structure.expressions !== undefined && (!versioningReady || !pinnedVersion)) {
        throw new Error("Typed reports must be created from a published version. Reopen this report after publishing the template.");
      }
      // Structural validation. A draft saves with missing required fields, but
      // corrupt state is rejected rather than written over good data.
      const check = validateInstanceStructure(formData, template.structure);
      if (check.corrupt) {
        const message = check.issues[0]?.message ?? "Form data is corrupt; not saved";
        if (silent) reportSaveFailed(message);
        else toast({ title: message, variant: "destructive" });
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
          const message =
            "Someone else saved this form since you opened it. Reload before saving so their work is not overwritten.";
          // Shown either way: autosave must not keep retrying over someone's work.
          reportSaveFailed(message);
          if (!silent) toast({ title: message, variant: "destructive" });
          return;
        }
        if (updated?.[0]?.revision != null) setRevision(updated[0].revision);
        else if (revision != null) setRevision(revision + 1);

        if (!silent) toast({ title: "Form updated", variant: "success" });
        saved = true;
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
        saved = true;
        // The draft was keyed "new"; this form now has an id of its own.
        clearLocalDraft(draftKey);
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
      if (silent) {
        reportSaveFailed(e);
      } else {
        toast({
          title: e?.message || "Failed to save form",
          variant: "destructive",
        });
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
      setAutoSaving(false);
      if (saved) {
        reportSaveSucceeded();
        setSavedEditCount(coveredEdit);
        setLastSavedAt(Date.now());
        serverUpdatedAtRef.current = Date.now();
        // Nothing typed during the save: the server has it all.
        if (editCountRef.current === coveredEdit) clearLocalDraft(liveDraftKey);
      }
    }
  };

  // Once a new form is saved it has an id; its browser copy follows it.
  const liveDraftKey = localDraftKey(jobId, templateId, existingInstanceId ?? instanceId);

  // Keep a copy of unsaved work in this browser as it is typed.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const timer = window.setTimeout(() => {
      saveLocalDraft(liveDraftKey, { formData: formDataRef.current, status: statusRef.current, savedAt: Date.now() });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [editCount, hasUnsavedChanges, liveDraftKey]);

  // A report that is already saved also saves itself, a few seconds after the
  // last edit (never a locked/approved one, and never a brand-new form, which
  // is created on the first manual save).
  useEffect(() => {
    if (!hasUnsavedChanges || !existingInstanceId || pendingDraft) return;
    const timer = window.setTimeout(() => {
      const locked = document.getElementById("report-container")?.dataset.reportLocked === "true";
      if (!locked) handleSave({ silent: true });
    }, 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCount, existingInstanceId, hasUnsavedChanges, pendingDraft]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  // The shared "not saved" banner belongs to this report only.
  useEffect(() => () => resetSaveStatus(), []);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setFormData(pendingDraft.formData);
    if (pendingDraft.status) setStatus(pendingDraft.status as CustomFormStatus);
    setPendingDraft(null);
    // Restored work is unsaved work: keep it in the browser and save it as usual.
    setEditCount((n) => n + 1);
  };
  const discardDraft = () => {
    clearLocalDraft(draftKey);
    setPendingDraft(null);
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
      {paper.on && <PaperViewStyles />}

      <div
        className={`min-h-screen bg-neutral-50 dark:bg-dark-200 p-4 md:p-6 print:min-h-0 print:bg-white print:p-0 ${paper.on ? PAPER_CLASS : ""}`}
        data-ff-root=""
      >
        <div className={paper.on ? "print:max-w-none" : "max-w-5xl mx-auto print:max-w-none"}>
          {fieldFlags.showFlags && (
            <div className="print:hidden mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-none">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                Reviewer flagged an issue
              </p>
              <FlaggedFieldsList ctrl={fieldFlags} />
            </div>
          )}
          <div
            className="custom-form-container bg-white dark:bg-dark-150 rounded-none shadow-md border border-neutral-200 dark:border-neutral-700 p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-0"
            style={paper.sheetStyle}
          >
            <div className={`${PAPER_TOOLBAR_CLASS} print:hidden flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-neutral-200 dark:border-neutral-700`}>
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
                  <StatusToggleButton
                    status={status}
                    onChange={(next) => {
                      setStatus(next);
                      autoStatus.setManual(true);
                      setEditCount((n) => n + 1);
                    }}
                    autoState={
                      autoStatus.available
                        ? { manual: autoStatus.manual, onAuto: () => autoStatus.setManual(false) }
                        : undefined
                    }
                  />
                )}
                <PaperViewToggle paper={paper} />
                {equipmentAsset && (
                  <button
                    type="button"
                    onClick={fillFromAsset}
                    className="h-10 px-3 flex items-center gap-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand"
                    title={`Fill empty fields from ${equipmentAsset.identifier || "this report's equipment"} (identifier, location, nameplate…)`}
                  >
                    <Database className="w-4 h-4" />
                    Fill from asset
                  </button>
                )}
                {equipmentAsset && (
                  <button
                    type="button"
                    onClick={copyFromLastReport}
                    disabled={copyingPrevious}
                    className="h-10 px-3 flex items-center gap-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand disabled:opacity-50"
                    title="Copy readings from the last report of this form on the same equipment (empty fields only)"
                  >
                    <History className="w-4 h-4" />
                    {copyingPrevious ? "Looking…" : "Copy from last report"}
                  </button>
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
                {/* Where the work stands: saved, saving, or only on this device. */}
                <span
                  className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap"
                  aria-live="polite"
                >
                  {autoSaving
                    ? "Saving…"
                    : hasUnsavedChanges
                      ? existingInstanceId
                        ? "Unsaved changes"
                        : "Not saved yet · kept on this device"
                      : lastSavedAt
                        ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                        : ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleSave()}
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

            {paper.on && (
              <CustomFormPrintHeader template={template} status={status} onScreen />
            )}
            {pendingDraft && (
              <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 text-sm border border-brand bg-brand/5 rounded-none print:hidden">
                <span className="font-medium text-neutral-900 dark:text-white">
                  Unsaved changes from{" "}
                  {new Date(pendingDraft.savedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  were found on this device.
                </span>
                <span className="ml-auto flex gap-2">
                  <Button size="sm" onClick={restoreDraft} className="bg-brand hover:bg-brand-dark">
                    Restore them
                  </Button>
                  <Button size="sm" variant="outline" onClick={discardDraft}>
                    Discard
                  </Button>
                </span>
              </div>
            )}
            <EquipmentCalibrationBanner structure={template.structure} formData={formData} live={liveCalibration} />
            <DocumentBody template={template} chrome={chrome} />
          </div>
        </div>
      </div>
      <FieldFlagsOverlay ctrl={fieldFlags} />
    </ReportWrapper>
  );
};

export default CustomFormFiller;
