import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { ReportWrapper } from "./ReportWrapper";
import { ReportHeader } from "./common/ReportHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { companyConfig } from "@/lib/companyConfig";

// Slug used for routing AND for asset.file_url. Detected by JobDetail to
// classify this asset as an "Internal Form".
export const ENERGIZED_WORK_PERMIT_SLUG = "energized-work-permit-form";
export const ENERGIZED_WORK_PERMIT_DISPLAY_NAME = "Energized Work Permit";

// Section 3 — "Voltage (V) Level Phase to Phase". Rendered five across, in the
// same order as the paper form.
const VOLTAGE_LEVELS = [
  { id: "less_than_120vac", label: "Less than 120VAC" },
  { id: "v_120", label: "120V" },
  { id: "v_208", label: "208V" },
  { id: "v_240", label: "240V" },
  { id: "v_277", label: "277V" },
  { id: "v_480", label: "480V" },
  { id: "greater_than_600v", label: "Greater than 600V" },
  { id: "other_dc", label: "Other (DC)" },
  { id: "single_phase", label: "Single phase" },
  { id: "three_phase", label: "3 Phase" },
] as const;

// Section 5 — PPE and safety measures. Group label = the row label on the
// paper form; items are the checkboxes on that row.
interface PpeGroup {
  label: string;
  items: { id: string; label: string }[];
}

const PPE_GROUPS: PpeGroup[] = [
  {
    label: "Body",
    items: [
      { id: "arc_rated", label: "Arc-Rated" },
      {
        id: "cotton_long_sleeve",
        label: "Cotton, Long Sleeve Shirt & Long Pants or Coveralls",
      },
      {
        id: "flash_suit_jacket_pants",
        label: "Arc-Rated Flash Suit Jacket and Pants",
      },
      {
        id: "fall_protection_harness",
        label: "Arc-Rated Fall Protection Harness",
      },
    ],
  },
  {
    label: "Eye, Face and Head",
    items: [
      { id: "safety_glasses", label: "Safety Glasses" },
      { id: "safety_goggle", label: "Safety Goggle" },
      { id: "arc_rated_face_shield", label: "Arc-Rated Face Shield" },
      { id: "arc_rated_hardhat", label: "Arc-Rated Hardhat" },
      { id: "arc_rated_balaclava", label: "Arc-Rated Balaclava" },
      { id: "hardhat_liner", label: "Hardhat Liner" },
      { id: "arc_rated_flash_hood", label: "Arc-Rated Flash Hood" },
      { id: "hearing_protection", label: "Hearing Protection" },
    ],
  },
  {
    label: "Hands and Arms",
    items: [
      { id: "heavy_duty_leather_gloves", label: "Heavy Duty Leather Gloves" },
      { id: "rubber_sleeves", label: "Rubber Sleeves" },
      { id: "rubber_insulating_gloves", label: "Rubber Insulating Gloves" },
    ],
  },
  {
    label: "Foot",
    items: [
      { id: "closed_toe_shoes", label: "Closed Toe Shoes" },
      { id: "leather_work_shoes", label: "Leather Work Shoes" },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "insulated_tools", label: "Insulated Tools" },
      { id: "meter", label: "Meter" },
      { id: "rubber_blankets", label: "Rubber Blankets" },
    ],
  },
  {
    label: "Safety Measures",
    items: [
      { id: "barricades_with_signs", label: "Barricades With Signs" },
      { id: "attendant", label: "Attendant" },
    ],
  },
];

/** Every checkbox on the form looks and behaves the same. */
const CheckboxCell: React.FC<{
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, label, disabled, onChange }) => (
  <label className="flex items-start gap-2 text-sm leading-tight">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 mt-0.5 shrink-0 accent-brand"
    />
    <span>{label}</span>
  </label>
);

/** Section header bar, matching the numbered questions on the paper form. */
const SectionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-t border-black bg-neutral-100 px-2 py-1 text-sm font-bold">
    {children}
  </div>
);

interface SignatureRow {
  name: string;
  signature: string;
  date: string;
}

interface ShockHazard {
  /** Keyed by VOLTAGE_LEVELS id */
  voltage_levels: Record<string, boolean>;
  /** Free text next to the "Other (DC)" box */
  other_dc_detail: string;
  limited_approach: string;
  restricted_approach: string;
  prohibited_approach: string;
}

interface ArcFlashHazard {
  /** "" | "yes" | "no" */
  analysis_performed: string;
  // If "Yes"
  arc_flash_boundary: string;
  incident_energy: string;
  // If "No" — NFPA 70E Hazard/Risk Category table
  hazard_risk_category: string;
  table_arc_flash_boundary: string;
}

interface Ppe {
  /** Keyed by PPE_GROUPS item id */
  selected: Record<string, boolean>;
  other: string;
}

interface Signatures {
  employee: SignatureRow;
  customer_representative: SignatureRow;
  approving_supervisor: SignatureRow;
}

interface FormData {
  project_location: string;
  project_number: string;
  circuit_equipment_description: string;
  work_description: string;
  /** Q1 — "" | "yes" | "no" */
  requires_energized_exposure: string;
  /** Q2 */
  justification: string;
  shock_hazard: ShockHazard;
  arc_flash: ArcFlashHazard;
  ppe: Ppe;
  signatures: Signatures;
}

const emptySignature = (): SignatureRow => ({
  name: "",
  signature: "",
  date: "",
});

/** Normalize a JSONB checkbox map. Unknown keys are dropped, missing keys default false. */
function normalizeCheckboxMap(raw: unknown, ids: readonly string[]) {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, boolean> = {};
  ids.forEach((id) => {
    out[id] = !!source[id];
  });
  return out;
}

function normalizeSignature(raw: unknown): SignatureRow {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    name: typeof source.name === "string" ? source.name : "",
    signature: typeof source.signature === "string" ? source.signature : "",
    date: typeof source.date === "string" ? source.date : "",
  };
}

const VOLTAGE_IDS = VOLTAGE_LEVELS.map((v) => v.id);
const PPE_IDS = PPE_GROUPS.flatMap((g) => g.items.map((i) => i.id));

const initialFormData: FormData = {
  project_location: "",
  project_number: "",
  circuit_equipment_description: "",
  work_description: "",
  requires_energized_exposure: "",
  justification: "",
  shock_hazard: {
    voltage_levels: normalizeCheckboxMap({}, VOLTAGE_IDS),
    other_dc_detail: "",
    limited_approach: "",
    restricted_approach: "",
    prohibited_approach: "",
  },
  arc_flash: {
    analysis_performed: "",
    arc_flash_boundary: "",
    incident_energy: "",
    hazard_risk_category: "",
    table_arc_flash_boundary: "",
  },
  ppe: {
    selected: normalizeCheckboxMap({}, PPE_IDS),
    other: "",
  },
  signatures: {
    employee: emptySignature(),
    customer_representative: emptySignature(),
    approving_supervisor: emptySignature(),
  },
};

const EnergizedWorkPermitForm: React.FC = () => {
  const { id: jobId, reportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isEditing, setIsEditing] = useState(!reportId);
  const [currentReportId, setCurrentReportId] = useState<string | null>(
    reportId || null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [assetStatus, setAssetStatus] = useState<string | null>(null);

  const isLocked = assetStatus === "approved" || assetStatus === "sent";

  const loadReport = useCallback(async () => {
    if (!currentReportId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("energized_work_permit_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) throw error;

      if (data) {
        const info = data.report_info || {};
        const shock = data.shock_hazard || {};
        const arc = data.arc_flash || {};
        const ppe = data.ppe || {};
        const sig = data.signatures || {};

        setFormData({
          project_location: info.project_location || "",
          project_number: info.project_number || "",
          circuit_equipment_description:
            info.circuit_equipment_description || "",
          work_description: info.work_description || "",
          requires_energized_exposure: info.requires_energized_exposure || "",
          justification: info.justification || "",
          shock_hazard: {
            voltage_levels: normalizeCheckboxMap(
              shock.voltage_levels,
              VOLTAGE_IDS,
            ),
            other_dc_detail: shock.other_dc_detail || "",
            limited_approach: shock.limited_approach || "",
            restricted_approach: shock.restricted_approach || "",
            prohibited_approach: shock.prohibited_approach || "",
          },
          arc_flash: {
            analysis_performed: arc.analysis_performed || "",
            arc_flash_boundary: arc.arc_flash_boundary || "",
            incident_energy: arc.incident_energy || "",
            hazard_risk_category: arc.hazard_risk_category || "",
            table_arc_flash_boundary: arc.table_arc_flash_boundary || "",
          },
          ppe: {
            selected: normalizeCheckboxMap(ppe.selected, PPE_IDS),
            other: ppe.other || "",
          },
          signatures: {
            employee: normalizeSignature(sig.employee),
            customer_representative: normalizeSignature(
              sig.customer_representative,
            ),
            approving_supervisor: normalizeSignature(sig.approving_supervisor),
          },
        });

        // Read asset status (for locking)
        try {
          const { data: assetRow } = await supabase
            .schema("neta_ops")
            .from("assets")
            .select("status")
            .eq(
              "file_url",
              `report:/jobs/${jobId}/${ENERGIZED_WORK_PERMIT_SLUG}/${currentReportId}`,
            )
            .maybeSingle();
          setAssetStatus((assetRow as any)?.status || null);
        } catch {
          /* ignore */
        }

        // Once we have a saved report, viewing mode by default
        setIsEditing(false);
      }
    } catch (err) {
      console.error("Error loading Energized Work Permit:", err);
      alert("Failed to load Energized Work Permit.");
    } finally {
      setLoading(false);
    }
  }, [currentReportId, jobId]);

  useEffect(() => {
    if (reportId) {
      setCurrentReportId(reportId);
    }
  }, [reportId]);

  useEffect(() => {
    if (currentReportId) loadReport();
  }, [currentReportId, loadReport]);

  // Save handler — creates or updates the report row and the linked asset.
  const handleSave = useCallback(async (): Promise<string | null> => {
    if (!jobId || !user?.id) return null;
    if (isLocked) return currentReportId;

    setSaving(true);
    try {
      const payload = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          project_location: formData.project_location,
          project_number: formData.project_number,
          circuit_equipment_description: formData.circuit_equipment_description,
          work_description: formData.work_description,
          requires_energized_exposure: formData.requires_energized_exposure,
          justification: formData.justification,
        },
        shock_hazard: formData.shock_hazard,
        arc_flash: formData.arc_flash,
        ppe: formData.ppe,
        signatures: formData.signatures,
      };

      let savedId = currentReportId;

      if (currentReportId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("energized_work_permit_reports")
          .update(payload)
          .eq("id", currentReportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("energized_work_permit_reports")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedId = data?.id || null;

        if (savedId) {
          const baseName = ENERGIZED_WORK_PERMIT_DISPLAY_NAME;
          const suffix = (
            formData.circuit_equipment_description ||
            formData.project_location ||
            ""
          ).trim();
          const assetName = suffix ? `${baseName} - ${suffix}` : baseName;
          const fileUrl = `report:/jobs/${jobId}/${ENERGIZED_WORK_PERMIT_SLUG}/${savedId}`;

          const { data: assetRow, error: assetError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert({
              name: assetName,
              file_url: fileUrl,
              user_id: user.id,
            })
            .select("id")
            .single();
          if (assetError) throw assetError;

          await supabase.schema("neta_ops").from("job_assets").insert({
            job_id: jobId,
            asset_id: assetRow!.id,
            user_id: user.id,
          });

          setCurrentReportId(savedId);
          // Update URL so subsequent saves update the existing report.
          navigate(
            `/jobs/${jobId}/${ENERGIZED_WORK_PERMIT_SLUG}/${savedId}${location.search || ""}`,
            { replace: true },
          );
        }
      }

      return savedId;
    } catch (err: any) {
      console.error("Error saving Energized Work Permit:", err);
      alert(
        `Failed to save Energized Work Permit: ${err?.message || "Unknown error"}`,
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    jobId,
    user,
    formData,
    currentReportId,
    isLocked,
    navigate,
    location.search,
  ]);

  // Wrapper for ReportHeader's onSave (returns void)
  const onSave = useCallback(() => {
    handleSave().then((id) => {
      if (id) setJustSaved(true);
    });
  }, [handleSave]);

  const handleSaveAndClose = async () => {
    const id = await handleSave();
    if (id) {
      setIsEditing(false);
    }
  };

  const handleMarkReadyForReview = async () => {
    if (!jobId || !user?.id) return;
    const id = await handleSave();
    if (!id) return;

    const fileUrl = `report:/jobs/${jobId}/${ENERGIZED_WORK_PERMIT_SLUG}/${id}`;
    const { error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .update({
        status: "ready_for_review",
        submitted_at: new Date().toISOString(),
      })
      .eq("file_url", fileUrl);

    if (error) {
      alert(`Failed to mark as ready for review: ${error.message}`);
      return;
    }
    setAssetStatus("ready_for_review");
    alert("Energized Work Permit marked as ready for review!");
  };

  // Mutation helpers
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const updateShockHazard = (patch: Partial<ShockHazard>) =>
    setFormData((prev) => ({
      ...prev,
      shock_hazard: { ...prev.shock_hazard, ...patch },
    }));

  const toggleVoltage = (id: string, checked: boolean) =>
    setFormData((prev) => ({
      ...prev,
      shock_hazard: {
        ...prev.shock_hazard,
        voltage_levels: { ...prev.shock_hazard.voltage_levels, [id]: checked },
      },
    }));

  const updateArcFlash = (patch: Partial<ArcFlashHazard>) =>
    setFormData((prev) => ({
      ...prev,
      arc_flash: { ...prev.arc_flash, ...patch },
    }));

  const togglePpe = (id: string, checked: boolean) =>
    setFormData((prev) => ({
      ...prev,
      ppe: { ...prev.ppe, selected: { ...prev.ppe.selected, [id]: checked } },
    }));

  const updateSignature = (
    which: keyof Signatures,
    patch: Partial<SignatureRow>,
  ) =>
    setFormData((prev) => ({
      ...prev,
      signatures: {
        ...prev.signatures,
        [which]: { ...prev.signatures[which], ...patch },
      },
    }));

  const readOnly = !isEditing || isLocked;

  const inputClass = `w-full border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white rounded-none ${
    readOnly ? "bg-neutral-50 dark:bg-dark-200 cursor-default" : ""
  }`;
  const textareaClass = `w-full border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white rounded-none resize-y ${
    readOnly ? "bg-neutral-50 dark:bg-dark-200 cursor-default" : ""
  }`;
  const selectClass = `border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white rounded-none ${
    readOnly ? "bg-neutral-50 dark:bg-dark-200 cursor-default" : ""
  }`;

  const signatureBlock = (
    which: keyof Signatures,
    nameLabel: string,
    signatureLabel: string,
  ) => {
    const row = formData.signatures[which];
    return (
      <tr>
        <td className="border border-black p-1 align-middle w-[20%] font-medium">
          {nameLabel}
        </td>
        <td className="border border-black p-1 align-middle w-[25%]">
          <input
            type="text"
            value={row.name}
            onChange={(e) => updateSignature(which, { name: e.target.value })}
            readOnly={readOnly}
            className={inputClass}
          />
        </td>
        <td className="border border-black p-1 align-middle w-[20%] font-medium">
          {signatureLabel}
        </td>
        <td className="border border-black p-1 align-middle w-[20%]">
          <input
            type="text"
            value={row.signature}
            onChange={(e) =>
              updateSignature(which, { signature: e.target.value })
            }
            readOnly={readOnly}
            className={inputClass}
          />
        </td>
        <td className="border border-black p-1 align-middle w-[5%] font-medium">
          Date
        </td>
        <td className="border border-black p-1 align-middle w-[10%]">
          <input
            type="date"
            value={row.date}
            onChange={(e) => updateSignature(which, { date: e.target.value })}
            readOnly={readOnly}
            className={inputClass}
          />
        </td>
      </tr>
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-neutral-600 dark:text-neutral-300">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <ReportWrapper isPrintMode={false} disablePreview>
      <div className="space-y-4">
        {/* Top toolbar (does not print) */}
        <ReportHeader
          title={ENERGIZED_WORK_PERMIT_DISPLAY_NAME}
          isAutoSaving={false}
          isEditing={isEditing}
          justSaved={justSaved}
          isSaving={saving}
          status={
            formData.signatures.approving_supervisor.signature.trim()
              ? "APPROVED"
              : "PENDING"
          }
          hasReport={!!currentReportId}
          onStatusToggle={() => {}}
          onSave={onSave}
          onSaveAndClose={handleSaveAndClose}
          onEdit={() => setIsEditing(true)}
          onBack={() => navigate(`/jobs/${jobId}?tab=assets`)}
          onPrint={() => window.print()}
          isPrintMode={false}
          loading={loading}
        />
        {!isLocked && isEditing && (
          <div className="print:hidden flex justify-end gap-2 mb-2">
            <button
              type="button"
              onClick={handleMarkReadyForReview}
              disabled={saving}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-none hover:bg-blue-700 disabled:opacity-60"
            >
              Mark Ready for Review
            </button>
          </div>
        )}
        {assetStatus && (
          <div className="print:hidden flex justify-end mb-2">
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded ${
                assetStatus === "approved" || assetStatus === "sent"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                  : assetStatus === "ready_for_review"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                    : "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
              }`}
            >
              {assetStatus.replace(/_/g, " ")}
            </span>
          </div>
        )}

        <div className="border border-black bg-white text-black">
          {/* Title bar */}
          <div className="grid grid-cols-[120px_1fr_120px] items-center border-b border-black">
            <div className="flex items-center justify-center p-2">
              <img
                src={companyConfig.reportLogoPath}
                alt={`${companyConfig.name} logo`}
                className="h-10 w-auto"
                style={{ maxHeight: 40 }}
              />
            </div>
            <div className="text-center py-2">
              <div className="text-base font-bold leading-tight">
                {companyConfig.fullName}
              </div>
              <div className="text-lg font-bold leading-tight">
                Energized Electrical Work Permit
              </div>
            </div>
            <div />
          </div>

          {/* Header info */}
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="border border-black p-1 align-middle w-[20%] font-medium">
                  Project Location:
                </td>
                <td className="border border-black p-1 align-middle w-[35%]">
                  <input
                    type="text"
                    value={formData.project_location}
                    onChange={(e) =>
                      updateField("project_location", e.target.value)
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
                <td className="border border-black p-1 align-middle w-[20%] font-medium">
                  Project Number:
                </td>
                <td className="border border-black p-1 align-middle w-[25%]">
                  <input
                    type="text"
                    value={formData.project_number}
                    onChange={(e) =>
                      updateField("project_number", e.target.value)
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
              </tr>
              <tr>
                <td className="border border-black p-1 align-middle font-medium">
                  Description of Circuit/Equipment:
                </td>
                <td className="border border-black p-1 align-middle" colSpan={3}>
                  <input
                    type="text"
                    value={formData.circuit_equipment_description}
                    onChange={(e) =>
                      updateField(
                        "circuit_equipment_description",
                        e.target.value,
                      )
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
              </tr>
              <tr>
                <td className="border border-black p-1 align-top font-medium">
                  Description of work to be performed:
                </td>
                <td className="border border-black p-1 align-top" colSpan={3}>
                  <textarea
                    rows={2}
                    value={formData.work_description}
                    onChange={(e) =>
                      updateField("work_description", e.target.value)
                    }
                    readOnly={readOnly}
                    className={textareaClass}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* ===============================================================
               1. Energized exposure
              =============================================================== */}
          <SectionBar>
            <div className="flex items-start gap-3">
              <span className="flex-1">
                1. Will this job or task require exposure to energized
                electrical conductors or circuit parts and/or work within an
                arc flash boundary?
              </span>
              <select
                value={formData.requires_energized_exposure}
                onChange={(e) =>
                  updateField("requires_energized_exposure", e.target.value)
                }
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </SectionBar>

          {/* ===============================================================
               2. Justification
              =============================================================== */}
          <SectionBar>
            2. Justification of why the circuit/equipment cannot be
            de-energized or the work deferred until the next scheduled outage:
          </SectionBar>
          <div className="border-t border-black p-2">
            <textarea
              rows={3}
              value={formData.justification}
              onChange={(e) => updateField("justification", e.target.value)}
              readOnly={readOnly}
              className={textareaClass}
            />
          </div>

          {/* ===============================================================
               3. Shock hazard analysis
              =============================================================== */}
          <SectionBar>3. Shock Hazard Analysis:</SectionBar>
          <div className="border-t border-black p-2 space-y-3">
            <div className="text-sm font-medium">
              Voltage (V) Level Phase to Phase
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2">
              {VOLTAGE_LEVELS.map((v) => (
                <CheckboxCell
                  key={v.id}
                  checked={!!formData.shock_hazard.voltage_levels[v.id]}
                  label={v.label}
                  disabled={readOnly}
                  onChange={(checked) => toggleVoltage(v.id, checked)}
                />
              ))}
            </div>
            {formData.shock_hazard.voltage_levels.other_dc && (
              <div className="flex items-center gap-2 max-w-md">
                <span className="text-sm whitespace-nowrap">
                  Other (DC) detail:
                </span>
                <input
                  type="text"
                  value={formData.shock_hazard.other_dc_detail}
                  onChange={(e) =>
                    updateShockHazard({ other_dc_detail: e.target.value })
                  }
                  readOnly={readOnly}
                  className={inputClass}
                />
              </div>
            )}

            <div className="text-sm font-medium pt-1">Approach Boundaries</div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr>
                  <td className="border border-black p-1 w-[12%] font-medium">
                    Limited:
                  </td>
                  <td className="border border-black p-1 w-[15%]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formData.shock_hazard.limited_approach}
                      onChange={(e) =>
                        updateShockHazard({ limited_approach: e.target.value })
                      }
                      readOnly={readOnly}
                      className={inputClass}
                    />
                  </td>
                  <td className="border border-black p-1 w-[6%]">inches</td>
                  <td className="border border-black p-1 w-[12%] font-medium">
                    Restricted:
                  </td>
                  <td className="border border-black p-1 w-[15%]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formData.shock_hazard.restricted_approach}
                      onChange={(e) =>
                        updateShockHazard({
                          restricted_approach: e.target.value,
                        })
                      }
                      readOnly={readOnly}
                      className={inputClass}
                    />
                  </td>
                  <td className="border border-black p-1 w-[6%]">inches</td>
                  <td className="border border-black p-1 w-[12%] font-medium">
                    Prohibited:
                  </td>
                  <td className="border border-black p-1 w-[15%]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formData.shock_hazard.prohibited_approach}
                      onChange={(e) =>
                        updateShockHazard({
                          prohibited_approach: e.target.value,
                        })
                      }
                      readOnly={readOnly}
                      className={inputClass}
                    />
                  </td>
                  <td className="border border-black p-1 w-[7%]">inches</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===============================================================
               4. Arc flash hazard
              =============================================================== */}
          <SectionBar>4. Arc Flash Hazard:</SectionBar>
          <div className="border-t border-black p-2 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="flex-1">
                Has an arc flash analysis been performed on this equipment?
              </span>
              <select
                value={formData.arc_flash.analysis_performed}
                onChange={(e) =>
                  updateArcFlash({ analysis_performed: e.target.value })
                }
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div className="pl-4 space-y-2">
              <div className="text-sm font-medium">If "Yes", what is:</div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-black p-1 w-[45%]">
                      The Arc Flash Boundary?
                    </td>
                    <td className="border border-black p-1 w-[20%]">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.arc_flash.arc_flash_boundary}
                        onChange={(e) =>
                          updateArcFlash({ arc_flash_boundary: e.target.value })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">inches</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-1">
                      Incident Energy at Working Distance?
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.arc_flash.incident_energy}
                        onChange={(e) =>
                          updateArcFlash({ incident_energy: e.target.value })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">cal/cm²</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="pl-4 space-y-2">
              <div className="text-sm font-medium">
                If "No", using NFPA 70E Hazard/Risk Category Table, what is:
              </div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-black p-1 w-[45%]">
                      The Hazard Risk Category for the task?
                    </td>
                    <td className="border border-black p-1 w-[20%]">
                      <input
                        type="text"
                        value={formData.arc_flash.hazard_risk_category}
                        onChange={(e) =>
                          updateArcFlash({
                            hazard_risk_category: e.target.value,
                          })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1" />
                  </tr>
                  <tr>
                    <td className="border border-black p-1">
                      The Arc Flash Boundary?
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.arc_flash.table_arc_flash_boundary}
                        onChange={(e) =>
                          updateArcFlash({
                            table_arc_flash_boundary: e.target.value,
                          })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">inches</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ===============================================================
               5. PPE and safety measures
              =============================================================== */}
          <SectionBar>
            5. What personal protective equipment (PPE) and safety measures
            will be used (check all that apply)?
          </SectionBar>
          <table className="w-full border-collapse text-sm border-t border-black">
            <tbody>
              {PPE_GROUPS.map((group) => (
                <tr key={group.label}>
                  <td className="border border-black p-1 align-top w-[18%] font-medium">
                    {group.label}
                  </td>
                  <td className="border border-black p-2 align-top">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                      {group.items.map((item) => (
                        <CheckboxCell
                          key={item.id}
                          checked={!!formData.ppe.selected[item.id]}
                          label={item.label}
                          disabled={readOnly}
                          onChange={(checked) => togglePpe(item.id, checked)}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="border border-black p-1 align-top font-medium">
                  Other
                </td>
                <td className="border border-black p-1 align-top">
                  <textarea
                    rows={2}
                    value={formData.ppe.other}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        ppe: { ...prev.ppe, other: e.target.value },
                      }))
                    }
                    readOnly={readOnly}
                    className={textareaClass}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* ===============================================================
               Acknowledgement signatures
              =============================================================== */}
          <table className="w-full border-collapse text-sm border-t border-black">
            <tbody>
              {signatureBlock(
                "employee",
                "Employee Name (Print)",
                "Employee Signature",
              )}
              {signatureBlock(
                "customer_representative",
                "Customer Representative Name (Print)",
                "Customer Representative Signature",
              )}
            </tbody>
          </table>

          {/* ===============================================================
               6. Approval
              =============================================================== */}
          <SectionBar>
            6. Approval to Perform Work While Electrically Energized
          </SectionBar>
          <table className="w-full border-collapse text-sm border-t border-black">
            <tbody>
              {signatureBlock(
                "approving_supervisor",
                "Approving Supervisor Name",
                "Approving Supervisor Signature",
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default EnergizedWorkPermitForm;
