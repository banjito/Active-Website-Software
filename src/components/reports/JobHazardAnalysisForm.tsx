import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { ReportWrapper } from "./ReportWrapper";
import { navigateAfterSave } from "./ReportUtils";
import { ReportHeader } from "./common/ReportHeader";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Slug used for routing AND for asset.file_url. Detected by JobDetail to
// classify this asset as an "Internal Form".
export const JOB_HAZARD_ANALYSIS_SLUG = "job-hazard-analysis-form";
export const JOB_HAZARD_ANALYSIS_DISPLAY_NAME = "Job Hazard Analysis Form";

// RAC is free text on the form; if the user types one of these single-letter
// codes the cell is color-coded to match the legend. Anything else is allowed
// (e.g. "E (3/4)" or notes) — it just stays uncolored.
type RAC = string;

interface JobStepRow {
  jobStep: string;
  hazards: string;
  controls: string;
  rac: RAC;
}

interface Attendee {
  name: string;
  signature: string;
}

interface CompletedWorkRow {
  name: string;
  signature: string;
  tools_accounted_for: boolean;
}

interface FinalInspectionRow {
  name: string;
  signature: string;
}

interface SafetyBrief {
  date: string;
  location: string;
  presented_by_name: string;
  presented_by_signature: string;
  attendees: Attendee[];
  completed_work: CompletedWorkRow[];
  final_inspection: FinalInspectionRow[];
}

interface FormData {
  activity: string;
  project_location: string;
  contract_number: string;
  date_prepared: string;
  prepared_by: string;
  reviewed_by: string;
  notes: string;
  overall_rac: RAC;
  job_steps: JobStepRow[];
  equipment_to_be_used: string[];
  training: string[];
  inspection_requirements: string[];
  safety_brief: SafetyBrief;
}

const emptyJobStep = (): JobStepRow => ({
  jobStep: "",
  hazards: "",
  controls: "",
  rac: "",
});
const emptyAttendee = (): Attendee => ({ name: "", signature: "" });
const emptyCompletedWork = (): CompletedWorkRow => ({
  name: "",
  signature: "",
  tools_accounted_for: false,
});
const emptyFinalInspection = (): FinalInspectionRow => ({
  name: "",
  signature: "",
});

/** Normalize a JSONB string-list column. Tolerates legacy TEXT values and nulls. */
function normalizeStringList(raw: unknown, fallbackLength = 3): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      typeof item === "string" ? item : String(item ?? ""),
    );
  }
  if (typeof raw === "string") {
    return raw ? [raw] : Array.from({ length: fallbackLength }, () => "");
  }
  return Array.from({ length: fallbackLength }, () => "");
}

const initialFormData: FormData = {
  activity: "",
  project_location: "",
  contract_number: "",
  date_prepared: new Date().toISOString().split("T")[0],
  prepared_by: "",
  reviewed_by: "",
  notes: "",
  overall_rac: "",
  job_steps: Array.from({ length: 3 }, emptyJobStep),
  equipment_to_be_used: ["", "", ""],
  training: ["", "", ""],
  inspection_requirements: ["", "", ""],
  safety_brief: {
    date: "",
    location: "",
    presented_by_name: "",
    presented_by_signature: "",
    attendees: Array.from({ length: 10 }, emptyAttendee),
    completed_work: Array.from({ length: 8 }, emptyCompletedWork),
    final_inspection: [emptyFinalInspection(), emptyFinalInspection()],
  },
};

// RAC Matrix definition: rows = Severity, columns = Probability.
// Values match the legend on the form (E/H/M/L).
const RAC_PROBABILITIES = [
  "Frequent",
  "Likely",
  "Occasional",
  "Seldom",
  "Unlikely",
] as const;
const RAC_SEVERITIES = [
  "Catastrophic",
  "Critical",
  "Marginal",
  "Negligible",
] as const;
const RAC_MATRIX: Record<
  (typeof RAC_SEVERITIES)[number],
  Record<(typeof RAC_PROBABILITIES)[number], RAC>
> = {
  Catastrophic: {
    Frequent: "E",
    Likely: "E",
    Occasional: "H",
    Seldom: "H",
    Unlikely: "M",
  },
  Critical: {
    Frequent: "E",
    Likely: "H",
    Occasional: "H",
    Seldom: "M",
    Unlikely: "L",
  },
  Marginal: {
    Frequent: "H",
    Likely: "M",
    Occasional: "M",
    Seldom: "L",
    Unlikely: "L",
  },
  Negligible: {
    Frequent: "M",
    Likely: "L",
    Occasional: "L",
    Seldom: "L",
    Unlikely: "L",
  },
};

const racBg = (r: RAC): string => {
  switch (r.trim().toUpperCase()) {
    case "E":
      return "bg-red-500 text-white";
    case "H":
      return "bg-orange-400 text-black";
    case "M":
      return "bg-yellow-300 text-black";
    case "L":
      return "bg-green-500 text-white";
    default:
      return "bg-white text-black";
  }
};

const racCellBg = (r: RAC): string => {
  switch (r.trim().toUpperCase()) {
    case "E":
      return "bg-red-500 text-white font-bold";
    case "H":
      return "bg-orange-400 text-black font-bold";
    case "M":
      return "bg-yellow-300 text-black font-bold";
    case "L":
      return "bg-green-500 text-white font-bold";
    default:
      return "";
  }
};

const JobHazardAnalysisForm: React.FC = () => {
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
        .from("job_hazard_analysis_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) throw error;

      if (data) {
        const info = data.report_info || {};
        const sb = data.safety_brief || {};
        setFormData({
          activity: info.activity || "",
          project_location: info.project_location || "",
          contract_number: info.contract_number || "",
          date_prepared: info.date_prepared || "",
          prepared_by: info.prepared_by || "",
          reviewed_by: info.reviewed_by || "",
          notes: info.notes || "",
          overall_rac: info.overall_rac || "",
          job_steps:
            Array.isArray(data.job_steps) && data.job_steps.length > 0
              ? data.job_steps.map(
                  (s: any): JobStepRow => ({
                    jobStep: s.jobStep || "",
                    hazards: s.hazards || "",
                    controls: s.controls || "",
                    rac: typeof s.rac === "string" ? s.rac : "",
                  }),
                )
              : Array.from({ length: 3 }, emptyJobStep),
          equipment_to_be_used: normalizeStringList(data.equipment_to_be_used),
          training: normalizeStringList(data.training),
          inspection_requirements: normalizeStringList(
            data.inspection_requirements,
          ),
          safety_brief: {
            date: sb.date || "",
            location: sb.location || "",
            presented_by_name: sb.presented_by_name || "",
            presented_by_signature: sb.presented_by_signature || "",
            attendees:
              Array.isArray(sb.attendees) && sb.attendees.length > 0
                ? sb.attendees.map(
                    (a: any): Attendee => ({
                      name: a.name || "",
                      signature: a.signature || "",
                    }),
                  )
                : Array.from({ length: 10 }, emptyAttendee),
            completed_work:
              Array.isArray(sb.completed_work) && sb.completed_work.length > 0
                ? sb.completed_work.map(
                    (c: any): CompletedWorkRow => ({
                      name: c.name || "",
                      signature: c.signature || "",
                      tools_accounted_for: !!c.tools_accounted_for,
                    }),
                  )
                : Array.from({ length: 8 }, emptyCompletedWork),
            final_inspection:
              Array.isArray(sb.final_inspection) &&
              sb.final_inspection.length > 0
                ? sb.final_inspection.map(
                    (f: any): FinalInspectionRow => ({
                      name: f.name || "",
                      signature: f.signature || "",
                    }),
                  )
                : [emptyFinalInspection(), emptyFinalInspection()],
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
              `report:/jobs/${jobId}/${JOB_HAZARD_ANALYSIS_SLUG}/${currentReportId}`,
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
      console.error("Error loading JHA report:", err);
      alert("Failed to load Job Hazard Analysis form.");
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
          activity: formData.activity,
          project_location: formData.project_location,
          contract_number: formData.contract_number,
          date_prepared: formData.date_prepared,
          prepared_by: formData.prepared_by,
          reviewed_by: formData.reviewed_by,
          notes: formData.notes,
          overall_rac: formData.overall_rac,
        },
        job_steps: formData.job_steps,
        equipment_to_be_used: formData.equipment_to_be_used,
        training: formData.training,
        inspection_requirements: formData.inspection_requirements,
        safety_brief: formData.safety_brief,
      };

      let savedId = currentReportId;

      if (currentReportId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("job_hazard_analysis_reports")
          .update(payload)
          .eq("id", currentReportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("job_hazard_analysis_reports")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedId = data?.id || null;

        if (savedId) {
          const baseName = JOB_HAZARD_ANALYSIS_DISPLAY_NAME;
          const suffix = (
            formData.activity ||
            formData.project_location ||
            ""
          ).trim();
          const assetName = suffix ? `${baseName} - ${suffix}` : baseName;
          const fileUrl = `report:/jobs/${jobId}/${JOB_HAZARD_ANALYSIS_SLUG}/${savedId}`;

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
            `/jobs/${jobId}/${JOB_HAZARD_ANALYSIS_SLUG}/${savedId}${location.search || ""}`,
            { replace: true },
          );
        }
      }

      return savedId;
    } catch (err: any) {
      console.error("Error saving JHA:", err);
      alert(
        `Failed to save Job Hazard Analysis: ${err?.message || "Unknown error"}`,
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

    const fileUrl = `report:/jobs/${jobId}/${JOB_HAZARD_ANALYSIS_SLUG}/${id}`;
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
    alert("Job Hazard Analysis form marked as ready for review!");
  };

  // Mutation helpers
  const updateJobStep = (index: number, patch: Partial<JobStepRow>) => {
    setFormData((prev) => ({
      ...prev,
      job_steps: prev.job_steps.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };
  const addJobStep = () =>
    setFormData((prev) => ({
      ...prev,
      job_steps: [...prev.job_steps, emptyJobStep()],
    }));
  const removeJobStep = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      job_steps:
        prev.job_steps.length > 1
          ? prev.job_steps.filter((_, i) => i !== index)
          : prev.job_steps,
    }));

  type EtiField =
    | "equipment_to_be_used"
    | "training"
    | "inspection_requirements";
  const ETI_FIELDS: EtiField[] = [
    "equipment_to_be_used",
    "training",
    "inspection_requirements",
  ];

  // The three lists are rendered as a single shared table (one row spans all
  // three columns), so they must stay in lockstep on add/remove.
  const etiRowCount = Math.max(
    formData.equipment_to_be_used.length,
    formData.training.length,
    formData.inspection_requirements.length,
    1,
  );
  const updateEtiCell = (field: EtiField, index: number, value: string) => {
    setFormData((prev) => {
      const next = [...prev[field]];
      while (next.length <= index) next.push("");
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };
  const addEtiRow = () => {
    setFormData((prev) => ({
      ...prev,
      equipment_to_be_used: [...prev.equipment_to_be_used, ""],
      training: [...prev.training, ""],
      inspection_requirements: [...prev.inspection_requirements, ""],
    }));
  };
  const removeEtiRow = (index: number) => {
    setFormData((prev) => {
      if (etiRowCount <= 1) return prev;
      const pop = (arr: string[]) =>
        arr.length > index ? arr.filter((_, i) => i !== index) : arr;
      return {
        ...prev,
        equipment_to_be_used: pop(prev.equipment_to_be_used),
        training: pop(prev.training),
        inspection_requirements: pop(prev.inspection_requirements),
      };
    });
  };

  const updateAttendee = (index: number, patch: Partial<Attendee>) => {
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        attendees: prev.safety_brief.attendees.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      },
    }));
  };
  const addAttendee = () =>
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        attendees: [...prev.safety_brief.attendees, emptyAttendee()],
      },
    }));
  const removeAttendee = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        attendees:
          prev.safety_brief.attendees.length > 1
            ? prev.safety_brief.attendees.filter((_, i) => i !== index)
            : prev.safety_brief.attendees,
      },
    }));

  const updateCompletedWork = (
    index: number,
    patch: Partial<CompletedWorkRow>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        completed_work: prev.safety_brief.completed_work.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      },
    }));
  };
  const addCompletedWork = () =>
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        completed_work: [
          ...prev.safety_brief.completed_work,
          emptyCompletedWork(),
        ],
      },
    }));
  const removeCompletedWork = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        completed_work:
          prev.safety_brief.completed_work.length > 1
            ? prev.safety_brief.completed_work.filter((_, i) => i !== index)
            : prev.safety_brief.completed_work,
      },
    }));

  const updateFinalInspection = (
    index: number,
    patch: Partial<FinalInspectionRow>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      safety_brief: {
        ...prev.safety_brief,
        final_inspection: prev.safety_brief.final_inspection.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      },
    }));
  };

  const readOnly = !isEditing || isLocked;

  const inputClass = `w-full border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white rounded-sm ${
    readOnly ? "bg-neutral-50 dark:bg-dark-200 cursor-default" : ""
  }`;
  const textareaClass = `w-full border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white rounded-sm resize-y ${
    readOnly ? "bg-neutral-50 dark:bg-dark-200 cursor-default" : ""
  }`;
  const selectClass = `w-full border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white rounded-sm ${
    readOnly ? "bg-neutral-50 dark:bg-dark-200 cursor-default" : ""
  }`;

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
          title={JOB_HAZARD_ANALYSIS_DISPLAY_NAME}
          isAutoSaving={false}
          isEditing={isEditing}
          justSaved={justSaved}
          isSaving={saving}
          status={formData.overall_rac || "N/A"}
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
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60"
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

        {/* ===================================================================
             PAGE 1 – Header / explanation (must match screenshot 1 closely)
            =================================================================== */}
        <div className="border border-black bg-white text-black">
          {/* Title bar */}
          <div className="grid grid-cols-[120px_1fr_120px] items-center border-b border-black">
            <div className="flex items-center justify-center p-2">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                alt="AMP Logo"
                className="h-10 w-auto"
                style={{ maxHeight: 40 }}
              />
            </div>
            <div className="text-center py-2">
              <div className="text-base font-bold leading-tight">
                AMP Quality Energy Services
              </div>
              <div className="text-lg font-bold leading-tight">
                Job Hazard Analysis
              </div>
            </div>
            <div />
          </div>

          {/* Header info table */}
          <table className="w-full border-collapse text-sm">
            <tbody>
              {/* Row 1: Activity / Overall RAC */}
              <tr>
                <td className="border border-black p-1 align-middle w-[20%]">
                  Activity/Work Task:
                </td>
                <td className="border border-black p-1 align-middle w-[30%]">
                  <input
                    type="text"
                    value={formData.activity}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        activity: e.target.value,
                      }))
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
                <td
                  className="border border-black p-1 align-middle text-center font-semibold w-[40%]"
                  colSpan={5}
                >
                  Overall Risk Assessment Code (RAC) (Use Highest Code)
                </td>
                <td
                  className={`border border-black p-1 align-middle text-center w-[10%] ${racCellBg(formData.overall_rac)}`}
                >
                  <input
                    type="text"
                    value={formData.overall_rac}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        overall_rac: e.target.value,
                      }))
                    }
                    readOnly={readOnly}
                    placeholder="E / H / M / L"
                    className={`w-full bg-transparent text-center font-bold border-none focus:outline-none placeholder:font-normal placeholder:text-neutral-500`}
                  />
                </td>
              </tr>
              {/* Row 2: Project Location / RAC Matrix header */}
              <tr>
                <td className="border border-black p-1 align-middle">
                  Project Location:
                </td>
                <td className="border border-black p-1 align-middle">
                  <input
                    type="text"
                    value={formData.project_location}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        project_location: e.target.value,
                      }))
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
                <td
                  className="border border-black p-1 text-center font-bold"
                  colSpan={6}
                >
                  Risk Assessment Code (RAC) Matrix
                </td>
              </tr>
              {/* Row 3: Contract Number / Severity + Probability column headers */}
              <tr>
                <td className="border border-black p-1 align-middle">
                  Contract Number:
                </td>
                <td className="border border-black p-1 align-middle">
                  <input
                    type="text"
                    value={formData.contract_number}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        contract_number: e.target.value,
                      }))
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
                <td
                  className="border border-black p-1 text-center font-semibold align-middle"
                  rowSpan={2}
                >
                  Severity
                </td>
                <td
                  className="border border-black p-1 text-center font-semibold"
                  colSpan={5}
                >
                  Probability
                </td>
              </tr>
              {/* Row 4: Date Prepared / Probability column labels */}
              <tr>
                <td className="border border-black p-1 align-middle">
                  Date Prepared:
                </td>
                <td className="border border-black p-1 align-middle">
                  <input
                    type="date"
                    value={formData.date_prepared}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        date_prepared: e.target.value,
                      }))
                    }
                    readOnly={readOnly}
                    className={inputClass}
                  />
                </td>
                {RAC_PROBABILITIES.map((p) => (
                  <td
                    key={p}
                    className="border border-black p-1 text-center text-xs font-semibold"
                  >
                    {p}
                  </td>
                ))}
              </tr>
              {/* Severity rows (Catastrophic, Critical, Marginal, Negligible) interleaved
                  with the remaining header fields (Prepared By, Reviewed By, Notes). */}
              {RAC_SEVERITIES.map((sev, sIdx) => {
                // Pair severity rows with header info rows.
                const headerCells: React.ReactNode[] = [];
                if (sIdx === 0) {
                  headerCells.push(
                    <td
                      key="lbl"
                      className="border border-black p-1 align-middle"
                    >
                      Prepared By:
                    </td>,
                    <td
                      key="val"
                      className="border border-black p-1 align-middle"
                    >
                      <input
                        type="text"
                        value={formData.prepared_by}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            prepared_by: e.target.value,
                          }))
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>,
                  );
                } else if (sIdx === 1) {
                  headerCells.push(
                    <td
                      key="lbl"
                      className="border border-black p-1 align-middle"
                    >
                      Reviewed By:
                    </td>,
                    <td
                      key="val"
                      className="border border-black p-1 align-middle"
                    >
                      <input
                        type="text"
                        value={formData.reviewed_by}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            reviewed_by: e.target.value,
                          }))
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>,
                  );
                } else if (sIdx === 2) {
                  headerCells.push(
                    <td
                      key="lbl"
                      className="border border-black p-1 align-top"
                      rowSpan={2}
                    >
                      Notes (Field Notes, Review Comments, etc.)
                    </td>,
                    <td
                      key="val"
                      className="border border-black p-1 align-top"
                      rowSpan={2}
                    >
                      <textarea
                        rows={3}
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        readOnly={readOnly}
                        className={textareaClass}
                      />
                    </td>,
                  );
                }
                return (
                  <tr key={sev}>
                    {headerCells}
                    <td className="border border-black p-1 text-center text-xs font-semibold">
                      {sev}
                    </td>
                    {RAC_PROBABILITIES.map((p) => {
                      const v = RAC_MATRIX[sev][p];
                      return (
                        <td
                          key={p}
                          className={`border border-black p-1 text-center text-sm font-bold ${racBg(v)}`}
                        >
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Instructions block + RAC Chart legend */}
              <tr>
                <td className="border border-black p-1 align-top" colSpan={2}>
                  <div className="font-semibold mb-1">
                    Step 1: Review each "Hazard" with identified safety
                    "Controls" and determine RAC (See Above)
                  </div>
                  <div className="mb-1">
                    <span className="font-semibold">"Probability"</span> is the
                    likelihood to cause an incident, near miss, or accident and
                    identified as: Frequent, Likely, Occasional, Seldom, or
                    Unlikely.
                  </div>
                  <div className="mb-1">
                    <span className="font-semibold">"Severity"</span> is the
                    outcome/degree if an incident, near miss, or accident did
                    occur and identified as: Catastrophic, Critical, Marginal,
                    or Negligible.
                  </div>
                  <div>
                    <span className="font-semibold">"Step 2":</span> Identify
                    the RAC (Probability/Severity) as E, H, M, or L for each
                    "Hazard" on JHA. Annotate the overall highest RAC at the top
                    of JHA.
                  </div>
                </td>
                <td className="border border-black p-0 align-top" colSpan={6}>
                  <div className="text-center font-bold py-1 border-b border-black">
                    RAC Chart
                  </div>
                  <div className="bg-red-500 text-white text-center font-bold py-1 border-b border-black">
                    E = Extremely High Risk
                  </div>
                  <div className="bg-orange-400 text-black text-center font-bold py-1 border-b border-black">
                    H = High Risk
                  </div>
                  <div className="bg-yellow-300 text-black text-center font-bold py-1 border-b border-black">
                    M = Moderate Risk
                  </div>
                  <div className="bg-green-500 text-white text-center font-bold py-1">
                    L = Low Risk
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ===================================================================
             Job Steps / Hazards / Controls / RAC table
            =================================================================== */}
        <div className="border border-black bg-white text-black">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-black p-1 w-[15%] text-left">
                  Job Steps
                </th>
                <th className="border border-black p-1 w-[20%] text-left">
                  Hazards
                </th>
                <th className="border border-black p-1 text-left">Controls</th>
                <th className="border border-black p-1 w-[8%] text-center">
                  RAC
                </th>
                {!readOnly && (
                  <th className="border border-black p-1 w-[4%] print:hidden" />
                )}
              </tr>
            </thead>
            <tbody>
              {formData.job_steps.map((row, idx) => (
                <tr key={idx}>
                  <td className="border border-black p-1 align-top">
                    <textarea
                      rows={2}
                      value={row.jobStep}
                      onChange={(e) =>
                        updateJobStep(idx, { jobStep: e.target.value })
                      }
                      readOnly={readOnly}
                      className={textareaClass}
                    />
                  </td>
                  <td className="border border-black p-1 align-top">
                    <textarea
                      rows={2}
                      value={row.hazards}
                      onChange={(e) =>
                        updateJobStep(idx, { hazards: e.target.value })
                      }
                      readOnly={readOnly}
                      className={textareaClass}
                    />
                  </td>
                  <td className="border border-black p-1 align-top">
                    <textarea
                      rows={2}
                      value={row.controls}
                      onChange={(e) =>
                        updateJobStep(idx, { controls: e.target.value })
                      }
                      readOnly={readOnly}
                      className={textareaClass}
                    />
                  </td>
                  <td
                    className={`border border-black p-1 align-middle text-center ${racCellBg(row.rac)}`}
                  >
                    <input
                      type="text"
                      value={row.rac}
                      onChange={(e) =>
                        updateJobStep(idx, { rac: e.target.value })
                      }
                      readOnly={readOnly}
                      placeholder="E / H / M / L"
                      className="w-full bg-transparent text-center font-bold border-none focus:outline-none placeholder:font-normal placeholder:text-neutral-500"
                    />
                  </td>
                  {!readOnly && (
                    <td className="border border-black p-1 align-middle text-center print:hidden">
                      <button
                        type="button"
                        onClick={() => removeJobStep(idx)}
                        title="Remove row"
                        className="text-red-600 hover:text-red-800 disabled:opacity-30"
                        disabled={formData.job_steps.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="p-2 print:hidden flex justify-end">
              <button
                type="button"
                onClick={addJobStep}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-white bg-[#f26722] rounded-md hover:bg-[#e55611]"
              >
                <Plus className="h-4 w-4" /> Add Row
              </button>
            </div>
          )}
        </div>

        {/* ===================================================================
             Equipment / Training / Inspection Requirements
            =================================================================== */}
        <div className="border border-black bg-white text-black">
          <table className="w-full border-collapse text-sm table-fixed">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-black p-1 text-left">
                  Equipment to be Used
                </th>
                <th className="border border-black p-1 text-left">Training</th>
                <th className="border border-black p-1 text-left">
                  Inspection Requirements
                </th>
                {!readOnly && (
                  <th className="border border-black p-1 text-center w-10 print:hidden">
                    &nbsp;
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: etiRowCount }).map((_, idx) => (
                <tr key={idx}>
                  {ETI_FIELDS.map((field) => (
                    <td
                      key={field}
                      className="border border-black p-1 align-top"
                    >
                      <textarea
                        rows={2}
                        value={formData[field][idx] ?? ""}
                        onChange={(e) =>
                          updateEtiCell(field, idx, e.target.value)
                        }
                        readOnly={readOnly}
                        className={textareaClass}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="border border-black p-1 align-middle text-center print:hidden">
                      <button
                        type="button"
                        onClick={() => removeEtiRow(idx)}
                        title="Remove row"
                        className="text-red-600 hover:text-red-800 disabled:opacity-30"
                        disabled={etiRowCount <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="p-2 print:hidden flex justify-end">
              <button
                type="button"
                onClick={addEtiRow}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-neutral-300 rounded hover:bg-neutral-100"
              >
                <Plus className="h-4 w-4" /> Add row
              </button>
            </div>
          )}
        </div>

        {/* ===================================================================
             Safety Brief Acknowledgement Form
            =================================================================== */}
        <div className="border border-black bg-white text-black p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
              alt="AMP Logo"
              className="h-10 w-auto"
              style={{ maxHeight: 40 }}
            />
            <div className="text-center flex-1">
              <div className="text-base font-bold leading-tight">
                AMP Quality Energy Services
              </div>
              <div className="text-base font-bold leading-tight">
                Safety Brief Acknowledgement Form
              </div>
            </div>
            <div className="w-12" />
          </div>

          <div className="text-sm">
            This safety brief was presented:
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div className="flex items-center gap-2">
                <span className="font-medium whitespace-nowrap">On</span>
                <input
                  type="date"
                  value={formData.safety_brief.date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      safety_brief: {
                        ...prev.safety_brief,
                        date: e.target.value,
                      },
                    }))
                  }
                  readOnly={readOnly}
                  className={inputClass + " max-w-xs"}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium whitespace-nowrap">at</span>
                <input
                  type="text"
                  placeholder="Location"
                  value={formData.safety_brief.location}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      safety_brief: {
                        ...prev.safety_brief,
                        location: e.target.value,
                      },
                    }))
                  }
                  readOnly={readOnly}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium whitespace-nowrap">
                  By (Print Name)
                </span>
                <input
                  type="text"
                  value={formData.safety_brief.presented_by_name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      safety_brief: {
                        ...prev.safety_brief,
                        presented_by_name: e.target.value,
                      },
                    }))
                  }
                  readOnly={readOnly}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium whitespace-nowrap">Signature</span>
                <input
                  type="text"
                  placeholder="Signature"
                  value={formData.safety_brief.presented_by_signature}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      safety_brief: {
                        ...prev.safety_brief,
                        presented_by_signature: e.target.value,
                      },
                    }))
                  }
                  readOnly={readOnly}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Attendees */}
          <div>
            <div className="text-sm font-medium mb-1">
              The below listed employees attended this safety brief:
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="border border-black p-1 w-[8%] text-center">
                    #
                  </th>
                  <th className="border border-black p-1 text-left">
                    Print Name
                  </th>
                  <th className="border border-black p-1 text-left">
                    Signature
                  </th>
                  {!readOnly && (
                    <th className="border border-black p-1 w-[4%] print:hidden" />
                  )}
                </tr>
              </thead>
              <tbody>
                {formData.safety_brief.attendees.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-black p-1 text-center">
                      {idx + 1}
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          updateAttendee(idx, { name: e.target.value })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.signature}
                        onChange={(e) =>
                          updateAttendee(idx, { signature: e.target.value })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    {!readOnly && (
                      <td className="border border-black p-1 text-center print:hidden">
                        <button
                          type="button"
                          onClick={() => removeAttendee(idx)}
                          title="Remove row"
                          className="text-red-600 hover:text-red-800 disabled:opacity-30"
                          disabled={formData.safety_brief.attendees.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <div className="mt-2 print:hidden flex justify-end">
                <button
                  type="button"
                  onClick={addAttendee}
                  className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-white bg-[#f26722] rounded-md hover:bg-[#e55611]"
                >
                  <Plus className="h-4 w-4" /> Add Attendee
                </button>
              </div>
            )}
          </div>

          {/* Completed work + tools accounted for */}
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
              <div className="text-sm font-medium">
                The below listed employees completed the work to be performed:
              </div>
              <div className="text-xs italic text-neutral-600">
                Check box to acknowledge that all tools used are accounted for.
              </div>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="border border-black p-1 w-[8%] text-center">
                    #
                  </th>
                  <th className="border border-black p-1 text-left">
                    Print Name
                  </th>
                  <th className="border border-black p-1 text-left">
                    Signature
                  </th>
                  <th className="border border-black p-1 w-[8%] text-center">
                    Tools
                  </th>
                  {!readOnly && (
                    <th className="border border-black p-1 w-[4%] print:hidden" />
                  )}
                </tr>
              </thead>
              <tbody>
                {formData.safety_brief.completed_work.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-black p-1 text-center">
                      {idx + 1}
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          updateCompletedWork(idx, { name: e.target.value })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.signature}
                        onChange={(e) =>
                          updateCompletedWork(idx, {
                            signature: e.target.value,
                          })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1 text-center">
                      <input
                        type="checkbox"
                        checked={row.tools_accounted_for}
                        onChange={(e) =>
                          updateCompletedWork(idx, {
                            tools_accounted_for: e.target.checked,
                          })
                        }
                        disabled={readOnly}
                        className="h-4 w-4 accent-[#f26722]"
                      />
                    </td>
                    {!readOnly && (
                      <td className="border border-black p-1 text-center print:hidden">
                        <button
                          type="button"
                          onClick={() => removeCompletedWork(idx)}
                          title="Remove row"
                          className="text-red-600 hover:text-red-800 disabled:opacity-30"
                          disabled={
                            formData.safety_brief.completed_work.length <= 1
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <div className="mt-2 print:hidden flex justify-end">
                <button
                  type="button"
                  onClick={addCompletedWork}
                  className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-white bg-[#f26722] rounded-md hover:bg-[#e55611]"
                >
                  <Plus className="h-4 w-4" /> Add Row
                </button>
              </div>
            )}
          </div>

          {/* Final inspection */}
          <div>
            <div className="text-sm font-medium mb-1">
              Final Inspection (two signatures required before re-energization)
            </div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {formData.safety_brief.final_inspection.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-black p-1 w-[15%] font-medium">
                      Print Name:
                    </td>
                    <td className="border border-black p-1 w-[35%]">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          updateFinalInspection(idx, { name: e.target.value })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1 w-[15%] font-medium">
                      Signature:
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.signature}
                        onChange={(e) =>
                          updateFinalInspection(idx, {
                            signature: e.target.value,
                          })
                        }
                        readOnly={readOnly}
                        className={inputClass}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default JobHazardAnalysisForm;
