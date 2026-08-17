import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import Button from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";
import { useReportUserAutofill } from "./useReportUserAutofill";
import { ensureReportAssetLink } from "./linkReportAsset";

/** I²t options, matching the LV breaker ATS/MTS reports. */
const i2tOptions = ["", "On", "Off", "In", "Out", "N/A"];

/** Per-phase ground fault readings: pick-up current and trip time. */
interface PhaseReading {
  pickup: string; // amperes
  tripTime: string; // seconds
}

interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string;
  date: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  eqptLocation: string;
  identifier: string;

  // Nameplate Data (same set as the LV Breaker ATS/MTS reports)
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  frameSize: string;
  icRating: string;
  tripUnitType: string;
  ratingPlug: string;
  curveNo: string;
  chargeMotorVoltage: string;
  operation: string;
  mounting: string;
  zoneInterlock: string;
  thermalMemory: string;

  // Electrical Tests - Primary Injection (ground fault functions only)
  primaryInjection: {
    testedSettings: {
      groundFault: { setting: string; delay: string; i2t: string };
    };
    results: {
      groundFault: {
        ratedAmperes1: string;
        multiplier: string;
        testAmperes1: string;
        toleranceMin1: string;
        toleranceMax1: string;
        toleranceMin: string;
        toleranceMax: string;
        testAmperes2: string;
        toleranceMin2: string;
        toleranceMax2: string;
        phaseA: PhaseReading;
        phaseB: PhaseReading;
        phaseC: PhaseReading;
      };
    };
  };

  // Free-form narrative that lives inside the test results section
  setupDescription: string;

  // Test Equipment
  testEquipment: {
    model: string;
    serialNumber: string;
    ampId: string;
    calDate: string;
  };

  // Comments
  comments: string;

  // Pass/Fail Status
  status: "PASS" | "FAIL" | "LIMITED SERVICE";
}

const REPORT_SLUG = "gfi-trip-test-report";
const TABLE_NAME = "gfi_trip_test_reports";

const emptyPhaseReading = (): PhaseReading => ({ pickup: "", tripTime: "" });

const emptyPrimaryInjection = (): FormData["primaryInjection"] => ({
  testedSettings: {
    groundFault: { setting: "", delay: "", i2t: "" },
  },
  results: {
    groundFault: {
      ratedAmperes1: "",
      multiplier: "",
      testAmperes1: "",
      toleranceMin1: "",
      toleranceMax1: "",
      toleranceMin: "",
      toleranceMax: "",
      testAmperes2: "",
      toleranceMin2: "",
      toleranceMax2: "",
      phaseA: emptyPhaseReading(),
      phaseB: emptyPhaseReading(),
      phaseC: emptyPhaseReading(),
    },
  },
});

/** Parse a percent string such as "-15%" or "15" into a decimal (-0.15, 0.15). */
const parsePercent = (val?: string): number => {
  if (!val) return 0;
  const num = Number(`${val}`.replace(/%/g, "").trim());
  return isFinite(num) ? num / 100 : 0;
};

/**
 * Recompute the bottom-row tolerance min/max from the measured test amperes and
 * the tolerance percentages. Mirrors the LV breaker ATS primary injection math
 * (ground fault defaults to ±15%).
 */
const recomputeBottomTolerance = (gf: any) => {
  if (!gf) return;
  const test2 = Number(`${gf.testAmperes2 ?? ""}`.trim());
  // A non-numeric override such as "N/A" is left exactly as the tech typed it.
  if (!isFinite(test2) || `${gf.testAmperes2 ?? ""}`.trim() === "") return;
  gf.toleranceMin2 = (test2 * (1 + parsePercent(gf.toleranceMin))).toFixed(1);
  gf.toleranceMax2 = (test2 * (1 + parsePercent(gf.toleranceMax))).toFixed(1);
};

/**
 * Seed the derived cells when a rated amperes value is entered, using the same
 * ground fault defaults as the LV breaker ATS report: 110% test current, ±15%
 * tolerance.
 */
const applyRatedAmperesDefaults = (gf: any) => {
  const rated = Number(`${gf.ratedAmperes1 ?? ""}`.trim());
  if (!isFinite(rated) || `${gf.ratedAmperes1 ?? ""}`.trim() === "") return;
  gf.testAmperes1 = (rated * 1.1).toFixed(1);
  gf.testAmperes2 = rated.toString();
  gf.toleranceMin2 = (rated * 0.85).toFixed(1);
  gf.toleranceMax2 = (rated * 1.15).toFixed(1);
};

/** Recompute the top-row test amperes from rated amperes and the multiplier. */
const recomputeTopFromMultiplier = (gf: any) => {
  if (!gf) return;
  const ratedRaw = `${gf.ratedAmperes1 ?? ""}`.trim();
  const rated = Number(ratedRaw);
  if (ratedRaw !== "" && !isFinite(rated)) return;
  const multPct = parsePercent(gf.multiplier);
  if (!isFinite(rated) || multPct === 0) {
    gf.testAmperes1 = "";
    return;
  }
  gf.testAmperes1 = (rated * multPct).toFixed(1);
};

const sectionDividerStyle: React.CSSProperties = {
  width: "100%",
  height: "4px",
  backgroundColor: "var(--brand)",
  marginBottom: "1rem",
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

const GFITripTestReport: React.FC = () => {
  const {
    id: jobId,
    reportId,
    substation: urlSubstation,
  } = useParams<{ id: string; reportId?: string; substation?: string }>();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    reportId,
  );

  useEffect(() => {
    setCurrentReportId(reportId);
  }, [reportId]);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const isPrintMode = searchParams.get("print") === "true";

  // Debug: Log URL params on mount
  console.log("[GFIReport] Component mounted with params:", {
    jobId,
    reportId,
    urlSubstation,
    fromApproval: searchParams.get("fromApproval"),
  });

  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(!!reportId);
  const [saving, setSaving] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState(false);
  const [dataLoaded, setDataLoaded] = useState<boolean>(false);

  const [formData, setFormData] = useState<FormData>({
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split("T")[0],
    jobNumber: "",
    technicians: "",
    substation: "",
    eqptLocation: "",
    identifier: "",
    manufacturer: "",
    catalogNumber: "",
    serialNumber: "",
    type: "",
    frameSize: "",
    icRating: "",
    tripUnitType: "",
    ratingPlug: "",
    curveNo: "",
    chargeMotorVoltage: "",
    operation: "",
    mounting: "",
    zoneInterlock: "",
    thermalMemory: "",
    primaryInjection: emptyPrimaryInjection(),
    setupDescription: "",
    testEquipment: {
      model: "",
      serialNumber: "",
      ampId: "",
      calDate: "",
    },
    comments: "",
    status: "PASS",
  });

  // Autofill the "User" header field with the signed-in employee's name (new reports only).
  useReportUserAutofill(setFormData, reportId, "user");

  // Load job info
  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;

    try {
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("title, job_number, customer_id, site_address")
        .eq("id", jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema("common")
          .from("customers")
          .select("name, company_name, address")
          .eq("id", jobData.customer_id)
          .single();

        if (!customerError && customerData) {
          setFormData((prev) => ({
            ...prev,
            customer: customerData.company_name || customerData.name || "",
            address: jobData.site_address || customerData.address || "",
            jobNumber: jobData.job_number || "",
          }));
        }
      }

    } catch (error) {
      console.error("Error loading job info:", error);
    }
  }, [jobId]);

  // Load existing report
  const loadReport = useCallback(async () => {
    console.log("[GFIReport] loadReport called, reportId:", reportId);

    if (!reportId) {
      console.log("[GFIReport] No reportId, setting to edit mode");
      setLoading(false);
      setIsEditing(true);
      setDataLoaded(true);
      return;
    }

    try {
      setLoading(true);
      console.log(
        "[GFIReport] Fetching from",
        TABLE_NAME,
        "with id:",
        reportId,
      );

      const { data, error } = await supabase
        .schema("neta_ops")
        .from(TABLE_NAME)
        .select("*")
        .eq("id", reportId)
        .single();

      console.log("[GFIReport] Query result - data:", data, "error:", error);

      if (error) throw error;

      if (data) {
        console.log("[GFIReport] Setting form data from loaded report");

        const nameplate = data.nameplate_data || {};
        const savedInjection = data.primary_injection || {};
        const defaults = emptyPrimaryInjection();
        const primaryInjection: FormData["primaryInjection"] = {
          testedSettings: {
            groundFault: {
              ...defaults.testedSettings.groundFault,
              ...(savedInjection.testedSettings?.groundFault || {}),
            },
          },
          results: {
            groundFault: {
              ...defaults.results.groundFault,
              ...(savedInjection.results?.groundFault || {}),
              phaseA: {
                ...emptyPhaseReading(),
                ...(savedInjection.results?.groundFault?.phaseA || {}),
              },
              phaseB: {
                ...emptyPhaseReading(),
                ...(savedInjection.results?.groundFault?.phaseB || {}),
              },
              phaseC: {
                ...emptyPhaseReading(),
                ...(savedInjection.results?.groundFault?.phaseC || {}),
              },
            },
          },
        };

        // Reports saved before the primary-injection rewrite kept these as flat
        // columns; surface those values instead of showing empty fields.
        if (!data.primary_injection) {
          primaryInjection.results.groundFault.ratedAmperes1 =
            data.rated_current || "";
          primaryInjection.testedSettings.groundFault.setting =
            data.ground_fault_setting || "";
        }
        recomputeBottomTolerance(primaryInjection.results.groundFault);

        const legacyNarrative = [
          data.results || "",
          data.ground_fault_trip
            ? `Ground Fault Trip (legacy field): ${data.ground_fault_trip}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        setFormData({
          customer: data.customer || "",
          address: data.address || "",
          user: data.user_name || "",
          date: data.date || new Date().toISOString().split("T")[0],
          jobNumber: data.job_number || "",
          technicians: data.technicians || "",
          substation: data.substation || "",
          eqptLocation: data.eqpt_location || "",
          identifier: data.identifier || "",
          manufacturer: nameplate.manufacturer ?? data.manufacturer ?? "",
          catalogNumber: nameplate.catalogNumber || "",
          serialNumber: nameplate.serialNumber || "",
          type: nameplate.type || "",
          frameSize: nameplate.frameSize || "",
          icRating: nameplate.icRating || "",
          tripUnitType: nameplate.tripUnitType || "",
          ratingPlug: nameplate.ratingPlug || "",
          curveNo: nameplate.curveNo || "",
          chargeMotorVoltage: nameplate.chargeMotorVoltage || "",
          operation: nameplate.operation || "",
          mounting: nameplate.mounting || "",
          zoneInterlock: nameplate.zoneInterlock || "",
          thermalMemory: nameplate.thermalMemory || "",
          primaryInjection,
          setupDescription: data.setup_description ?? legacyNarrative,
          testEquipment: data.test_equipment || {
            model: "",
            serialNumber: "",
            ampId: "",
            calDate: "",
          },
          comments: data.comments || "",
          status: data.status || "PASS",
        });
        setIsEditing(false);
        // Delay setting dataLoaded to ensure React renders form data to DOM first
        // This is critical for deliverable PDF extraction to capture the data
        setTimeout(() => setDataLoaded(true), 500);
      } else {
        console.log("[GFIReport] No data returned from query");
        setTimeout(() => setDataLoaded(true), 500); // Mark as loaded even if no data (new report)
      }
    } catch (error) {
      console.error("[GFIReport] Error loading report:", error);
      toast.error("Failed to load report");
      setTimeout(() => setDataLoaded(true), 500); // Mark as loaded on error too
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    const init = async () => {
      try {
        await loadJobInfo();
      } catch (e) {
        console.error("Error loading job info:", e);
      }
      try {
        await loadReport();
      } catch (e) {
        console.error("Error loading report:", e);
        setLoading(false);
      }
    };
    init();
  }, [jobId, reportId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (field: string, value: string) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /** Update a nested ground-fault field and re-run the dependent calculations. */
  const handleInjectionChange = (path: string, value: string) => {
    setJustSaved(false);
    setFormData((prev) => {
      const next = {
        ...prev,
        primaryInjection: {
          testedSettings: {
            groundFault: { ...prev.primaryInjection.testedSettings.groundFault },
          },
          results: {
            groundFault: {
              ...prev.primaryInjection.results.groundFault,
              phaseA: { ...prev.primaryInjection.results.groundFault.phaseA },
              phaseB: { ...prev.primaryInjection.results.groundFault.phaseB },
              phaseC: { ...prev.primaryInjection.results.groundFault.phaseC },
            },
          },
        },
      };

      const keys = path.split(".");
      let level: any = next.primaryInjection;
      for (let i = 0; i < keys.length - 1; i++) {
        level = level[keys[i]];
      }
      level[keys[keys.length - 1]] = value;

      const gf = next.primaryInjection.results.groundFault;
      if (path.endsWith("ratedAmperes1")) {
        applyRatedAmperesDefaults(gf);
        recomputeBottomTolerance(gf);
        // Only let the multiplier override the 110% default once one is set,
        // otherwise the default test amperes would be wiped straight away.
        if (parsePercent(gf.multiplier) !== 0) recomputeTopFromMultiplier(gf);
      } else if (path.endsWith("multiplier")) {
        recomputeTopFromMultiplier(gf);
      } else if (
        path.endsWith("testAmperes2") ||
        path.endsWith("toleranceMin") ||
        path.endsWith("toleranceMax")
      ) {
        recomputeBottomTolerance(gf);
      }

      return next;
    });
  };

  /** Strip everything but a number from a percent input, then store it with "%". */
  const handlePercentChange = (path: string, raw: string) => {
    const v = `${raw}`.replace(/[^0-9.-]/g, "");
    handleInjectionChange(path, v ? `${v}%` : "");
  };

  const handleTestEquipmentChange = (
    field: keyof FormData["testEquipment"],
    value: string,
  ) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      testEquipment: {
        ...prev.testEquipment,
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    try {
      setSaving(true);

      const reportData = {
        job_id: jobId,
        user_id: user.id,
        customer: maskCustomerName(formData.customer),
        address: maskCustomerAddress(formData.address),
        user_name: formData.user,
        date: formData.date,
        job_number: formData.jobNumber,
        technicians: formData.technicians,
        substation: formData.substation,
        eqpt_location: formData.eqptLocation,
        identifier: formData.identifier,
        nameplate_data: {
          manufacturer: formData.manufacturer,
          catalogNumber: formData.catalogNumber,
          serialNumber: formData.serialNumber,
          type: formData.type,
          frameSize: formData.frameSize,
          icRating: formData.icRating,
          tripUnitType: formData.tripUnitType,
          ratingPlug: formData.ratingPlug,
          curveNo: formData.curveNo,
          chargeMotorVoltage: formData.chargeMotorVoltage,
          operation: formData.operation,
          mounting: formData.mounting,
          zoneInterlock: formData.zoneInterlock,
          thermalMemory: formData.thermalMemory,
        },
        // Kept in sync so the long-standing flat column stays usable for any
        // reporting/exports that already read it.
        manufacturer: formData.manufacturer,
        primary_injection: formData.primaryInjection,
        setup_description: formData.setupDescription,
        test_equipment: formData.testEquipment,
        comments: formData.comments,
        status: formData.status,
      };

      let result;
      if (reportId) {
        result = await supabase
          .schema("neta_ops")
          .from(TABLE_NAME)
          .update(reportData)
          .eq("id", reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema("neta_ops")
          .from(TABLE_NAME)
          .insert(reportData)
          .select()
          .single();

        if (result.data) {
          // Create folder structure by substation.
          // Use encodeURIComponent so the original substation name (e.g. "P2(I)")
          // round-trips losslessly through the asset file_url and back into the
          // Linked Reports grouping display.
          const substationFolder =
            formData.substation && formData.substation.trim()
              ? encodeURIComponent(formData.substation.trim())
              : "general";

          const assetName = getAssetName(REPORT_SLUG, formData.identifier);
          const assetData = {
            name: assetName,
            file_url: `report:/jobs/${jobId}/${REPORT_SLUG}/${substationFolder}/${result.data.id}`,
            user_id: user.id,
          };

          await ensureReportAssetLink(jobId, assetData, user.id);
        }
      }

      if (result.error) throw result.error;

      setJustSaved(true);
      if (!reportId) {
        setIsEditing(false);
        const newId = (result as any)?.data?.id || (result as any)?.id;
        if (newId) {
          setCurrentReportId(newId);
          navigate(`/jobs/${jobId}/${REPORT_SLUG}/${newId}`, { replace: true });
        }
      }
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast.error(
        `Failed to save report: ${error?.message || "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportId) {
      setIsEditing(false);
    }
  };

  if (loading) {
    return (
      <ReportWrapper isPrintMode={isPrintMode}>
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="xl" />
        </div>{" "}
        {/* Mark Ready to Review Button */}
        {!isPrintMode && isEditing && (
          <div className="mb-6 print:hidden flex justify-center">
            <button
              onClick={async () => {
                if (!jobId || !user?.id) return;

                try {
                  // Save the report first
                  await handleSave();
                  await new Promise((resolve) => setTimeout(resolve, 500));

                  // Get the report ID (may have been created by save)
                  const savedReportId =
                    reportId || window.location.pathname.split("/").pop();
                  if (!savedReportId) throw new Error("Failed to save report");

                  // Update asset status to ready_for_review.
                  // The asset's file_url includes a substation folder
                  // (report:/jobs/<jobId>/<slug>/<substation>/<reportId>), so
                  // match on the unique reportId suffix rather than an exactly
                  // reconstructed URL — otherwise the update silently affects
                  // zero rows and the report never enters the approval queue.
                  const { data: updatedAssets, error } = await supabase
                    .schema("neta_ops")
                    .from("assets")
                    .update({
                      status: "ready_for_review",
                      submitted_at: new Date().toISOString(),
                    })
                    .like("file_url", `%/${savedReportId}`)
                    .select("id");

                  if (error) throw error;
                  if (!updatedAssets || updatedAssets.length === 0) {
                    throw new Error(
                      "Could not find the saved report's asset to submit for review. Please save the report and try again.",
                    );
                  }

                  alert("Report marked as ready for review!");
                } catch (error: any) {
                  console.error("Error marking report as ready:", error);
                  alert(
                    `Failed to mark as ready: ${error?.message || "Unknown error"}`,
                  );
                }
              }}
              className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-none hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Mark Ready to Review
            </button>
          </div>
        )}
      </ReportWrapper>
    );
  }

  const groundFault = formData.primaryInjection.results.groundFault;
  const groundFaultSettings = formData.primaryInjection.testedSettings.groundFault;

  const screenOnly = `${isPrintMode ? "hidden" : ""} print:hidden`;
  const printOnly = isPrintMode ? "block" : "hidden print:block";

  const cellClass =
    "border border-neutral-300 dark:border-neutral-600 print:border-black px-2 py-2 text-sm text-neutral-900 dark:text-white";
  const headerCellClass =
    "border border-neutral-300 dark:border-neutral-600 print:border-black px-2 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white print:text-black bg-neutral-50 dark:bg-dark-150 print:bg-neutral-100";
  const inputClass = `w-full p-1 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`;

  /**
   * A single editable/static value cell. The deliverable PDF pipeline
   * serializes the report with innerHTML, which drops React-controlled input
   * values, so every table is rendered twice: inputs on screen, plain text for
   * print.
   */
  const valueCell = (
    print: boolean,
    path: string,
    raw: string,
    opts: { unit?: string; percent?: boolean; narrow?: boolean } = {},
  ) => {
    const { unit, percent, narrow } = opts;
    const value = raw || "";

    if (print) {
      return (
        <td className={`${cellClass} text-center`}>
          <div className="text-center">
            {value}
            {value && unit && unit !== "%" ? ` ${unit}` : ""}
          </div>
        </td>
      );
    }

    const input = (
      <input
        type="text"
        value={percent ? value.replace(/%/g, "") : value}
        onChange={(e) =>
          percent
            ? handlePercentChange(path, e.target.value)
            : handleInjectionChange(path, e.target.value)
        }
        readOnly={!isEditing}
        className={`${inputClass}${narrow || unit ? " w-20" : ""}`}
      />
    );

    return (
      <td className={`${cellClass} text-center`}>
        {unit ? (
          <div className="flex items-center justify-center">
            {input}
            <span className="ml-1 whitespace-nowrap">{unit}</span>
          </div>
        ) : (
          input
        )}
      </td>
    );
  };

  /** Tested Settings + primary injection results + per-phase readings. */
  const renderInjectionTables = (print: boolean) => (
    <>
      {/* Tested Settings */}
      <div className="mb-4">
        <h3 className="text-lg font-medium mb-2 text-center text-neutral-900 dark:text-white print:text-black">
          Tested Settings
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600 print:border-black">
            <thead>
              <tr>
                <th className={`${headerCellClass} text-left`}></th>
                <th className={headerCellClass}>Setting</th>
                <th className={headerCellClass}>Delay</th>
                <th className={headerCellClass}>I²t</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150">
              <tr>
                <td className={cellClass}>Ground Fault</td>
                {valueCell(
                  print,
                  "testedSettings.groundFault.setting",
                  groundFaultSettings.setting,
                )}
                {valueCell(
                  print,
                  "testedSettings.groundFault.delay",
                  groundFaultSettings.delay,
                )}
                {print ? (
                  <td className={`${cellClass} text-center`}>
                    {groundFaultSettings.i2t || ""}
                  </td>
                ) : (
                  <td className={`${cellClass} text-center`}>
                    <select
                      value={groundFaultSettings.i2t || ""}
                      onChange={(e) =>
                        handleInjectionChange(
                          "testedSettings.groundFault.i2t",
                          e.target.value,
                        )
                      }
                      disabled={!isEditing}
                      className={inputClass}
                    >
                      {i2tOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Primary injection - ground fault pick-up */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600 print:border-black">
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={headerCellClass} rowSpan={2}>
                Function
              </th>
              <th className={headerCellClass} rowSpan={2}>
                Rated Amperes
              </th>
              <th className={headerCellClass} colSpan={2} rowSpan={2}>
                Multiplier %
              </th>
              <th className={headerCellClass} rowSpan={2}>
                Test Amperes
              </th>
              <th className={headerCellClass} colSpan={2}>
                Tolerance
              </th>
            </tr>
            <tr>
              <th className={headerCellClass}>Min</th>
              <th className={headerCellClass}>Max</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-dark-150">
            <tr>
              <td className={cellClass} rowSpan={2}>
                Ground Fault
              </td>
              {valueCell(
                print,
                "results.groundFault.ratedAmperes1",
                groundFault.ratedAmperes1,
              )}
              {print ? (
                <td className={`${cellClass} text-center`} colSpan={2}>
                  {groundFault.multiplier || ""}
                </td>
              ) : (
                <td className={`${cellClass} text-center`} colSpan={2}>
                  <div className="flex items-center justify-center">
                    <input
                      type="text"
                      value={(groundFault.multiplier || "").replace(/%/g, "")}
                      onChange={(e) =>
                        handlePercentChange(
                          "results.groundFault.multiplier",
                          e.target.value,
                        )
                      }
                      readOnly={!isEditing}
                      className={`${inputClass} w-20`}
                    />
                    <span className="ml-1">%</span>
                  </div>
                </td>
              )}
              {valueCell(
                print,
                "results.groundFault.testAmperes1",
                groundFault.testAmperes1,
              )}
              {valueCell(
                print,
                "results.groundFault.toleranceMin1",
                groundFault.toleranceMin1,
              )}
              {valueCell(
                print,
                "results.groundFault.toleranceMax1",
                groundFault.toleranceMax1,
              )}
            </tr>
            <tr>
              <td className={cellClass}>GFPU</td>
              {valueCell(
                print,
                "results.groundFault.toleranceMin",
                groundFault.toleranceMin,
                { unit: "%", percent: true },
              )}
              {valueCell(
                print,
                "results.groundFault.toleranceMax",
                groundFault.toleranceMax,
                { unit: "%", percent: true },
              )}
              {valueCell(
                print,
                "results.groundFault.testAmperes2",
                groundFault.testAmperes2,
              )}
              {valueCell(
                print,
                "results.groundFault.toleranceMin2",
                groundFault.toleranceMin2,
              )}
              {valueCell(
                print,
                "results.groundFault.toleranceMax2",
                groundFault.toleranceMax2,
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-phase ground fault readings */}
      <div className="mt-4 overflow-x-auto">
        <h3 className="text-base font-semibold mb-2 text-neutral-900 dark:text-white print:text-black">
          Ground fault readings by phase
        </h3>
        <table className="w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600 print:border-black">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "21.33%" }} />
            <col style={{ width: "21.33%" }} />
            <col style={{ width: "21.34%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={headerCellClass}>Function</th>
              <th className={headerCellClass}>Row</th>
              <th className={headerCellClass}>A Phase</th>
              <th className={headerCellClass}>B Phase</th>
              <th className={headerCellClass}>C Phase</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-dark-150">
            {(
              [
                ["GFPU (Pick-Up)", "pickup", "A"],
                ["GFD (Trip Time)", "tripTime", "sec."],
              ] as [string, keyof PhaseReading, string][]
            ).map(([label, key, unit]) => (
              <tr key={key}>
                <td className={cellClass}>Ground Fault</td>
                <td className={`${cellClass} text-center`}>{label}</td>
                {(["phaseA", "phaseB", "phaseC"] as const).map((phase) => (
                  <React.Fragment key={phase}>
                    {valueCell(
                      print,
                      `results.groundFault.${phase}.${key}`,
                      groundFault[phase][key],
                      { unit },
                    )}
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Data-loaded marker for deliverable viewer to detect when report is ready */}
      <div
        data-report-loaded={dataLoaded ? "true" : "false"}
        data-has-customer={formData.customer ? "true" : "false"}
        data-customer={formData.customer}
        className="report-data-marker"
      />

      {/* Print Header - standard AMP layout: logo | title | PASS/FAIL */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6 mt-4">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">
            Ground Fault Trip Test Report
          </h1>
        </div>
        <div className="text-right" style={{ minWidth: 150 }}>
          <div
            className={`mt-1 inline-block pass-fail-status-box ${getPassFailBadgeClass(formData.status)}`}
            style={{
              padding: "4px 16px",
              fontSize: "12px",
              fontWeight: 800,
              textAlign: "center",
              borderRadius: "6px",
              border:
                formData.status === "PASS"
                  ? "2px solid #16a34a"
                  : formData.status === "LIMITED SERVICE"
                    ? "2px solid #d97706"
                    : "2px solid #dc2626",
              backgroundColor:
                formData.status === "PASS"
                  ? "#22c55e"
                  : formData.status === "LIMITED SERVICE"
                    ? "#f59e0b"
                    : "#ef4444",
              color: "white",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
              minWidth: 60,
            }}
          >
            {formData.status}
          </div>
        </div>
      </div>

      {/* Debug info - shows what data is loaded (visible when isPrintMode for debugging) */}
      {isPrintMode && (
        <div
          className="bg-yellow-100 border border-yellow-500 p-2 text-xs mb-4"
          style={{ display: "none" }}
        >
          <div>reportId: {reportId || "NONE"}</div>
          <div>jobId: {jobId || "NONE"}</div>
          <div>dataLoaded: {dataLoaded ? "YES" : "NO"}</div>
          <div>loading: {loading ? "YES" : "NO"}</div>
          <div>customer: "{maskCustomerName(formData.customer)}"</div>
          <div>jobNumber: "{formData.jobNumber}"</div>
        </div>
      )}

      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          <ReportHeader
            title="Ground Fault Trip Test Report"
            isAutoSaving={false}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={saving}
            status={formData.status}
            hasReport={!!currentReportId}
            onStatusToggle={() => {
              if (isEditing) {
                setJustSaved(false);
                setFormData((prev) => ({
                  ...prev,
                  status: prev.status === "PASS" ? "FAIL" : prev.status === "FAIL" ? "LIMITED SERVICE" : "PASS",
                }));
              }
            }}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onEdit={() => setIsEditing(true)}
            onBack={() => navigate(`/jobs/${jobId}`)}
            onPrint={() => window.print()}
            isPrintMode={isPrintMode}
          />

          {/* Job Information */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4" style={sectionDividerStyle}></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 ${screenOnly}`}
            >
              <div>
                <label className="form-label inline-block w-32">
                  Customer:
                </label>
                <input
                  type="text"
                  value={formData.customer}
                  onChange={(e) => handleChange("customer", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">Job #:</label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  onChange={(e) => handleChange("jobNumber", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">Address:</label>
                <input
                  type="text"
                  value={maskCustomerAddress(formData.address)}
                  onChange={(e) => handleChange("address", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">
                  Identifier:
                </label>
                <input
                  type="text"
                  value={formData.identifier}
                  onChange={(e) => handleChange("identifier", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">
                  Technicians:
                </label>
                <input
                  type="text"
                  value={formData.technicians}
                  onChange={(e) => handleChange("technicians", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">
                  Substation:
                </label>
                <input
                  type="text"
                  value={formData.substation}
                  onChange={(e) => handleChange("substation", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">Date:</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange("date", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-32">
                  Eqpt. Location:
                </label>
                <input
                  type="text"
                  value={formData.eqptLocation}
                  onChange={(e) => handleChange("eqptLocation", e.target.value)}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
            </div>
            {/* Custom Print-only Job Information table (8 fields: no Temp/TCF/Humidity/User) */}
            <div className={`${printOnly} job-info-print`}>
              <table
                className="w-full border-collapse border border-neutral-300 print:border-black print:border"
                style={{ marginLeft: 0 }}
              >
                <tbody>
                  <tr className="allow-row-break">
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">Customer:</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.customer || ""}
                      </div>
                    </td>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">Job #:</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.jobNumber || ""}
                      </div>
                    </td>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">
                        Technicians:
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.technicians || ""}
                      </div>
                    </td>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">Date:</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.date
                          ? new Date(
                              formData.date + "T00:00:00",
                            ).toLocaleDateString()
                          : ""}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">Address:</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {maskCustomerAddress(formData.address || "")}
                      </div>
                    </td>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">
                        Identifier:
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.identifier || ""}
                      </div>
                    </td>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">
                        Substation:
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.substation || ""}
                      </div>
                    </td>
                    <td className="p-3 align-middle text-center border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold text-center">
                        Eqpt. Location:
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-center">
                        {formData.eqptLocation || ""}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Nameplate Data */}
          <section className="mb-6">
            {/* Screen view - editable grid */}
            <div className={`nameplate-onscreen ${screenOnly}`}>
              <div className="w-full h-1 bg-brand mb-4" style={sectionDividerStyle}></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Nameplate Data
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(
                  [
                    ["manufacturer", "Manufacturer:"],
                    ["catalogNumber", "Catalog Number:"],
                    ["serialNumber", "Serial Number:"],
                    ["type", "Type:"],
                    ["frameSize", "Frame Size (A):"],
                    ["icRating", "I.C. Rating (kA):"],
                    ["tripUnitType", "Trip Unit Type:"],
                    ["ratingPlug", "Rating Plug (A):"],
                    ["curveNo", "Curve No.:"],
                    ["chargeMotorVoltage", "Charge Motor V:"],
                    ["operation", "Operation:"],
                    ["mounting", "Mounting:"],
                    ["zoneInterlock", "Zone Interlock:"],
                    ["thermalMemory", "Thermal Memory:"],
                  ] as [keyof FormData, string][]
                ).map(([field, label]) => (
                  <div key={field as string}>
                    <label htmlFor={field as string} className="form-label">
                      {label}
                    </label>
                    <input
                      id={field as string}
                      type="text"
                      value={(formData[field] as string) || ""}
                      onChange={(e) =>
                        handleChange(field as string, e.target.value)
                      }
                      readOnly={!isEditing}
                      className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Print view - compact 7-column table */}
            <div className={`${printOnly} nameplate-print`}>
              <h2 className="text-xl font-semibold mb-2 text-black border-b border-black pb-2 font-bold">
                Nameplate Data
              </h2>
              <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print:border text-[0.85rem] nameplate-print-table">
                <colgroup>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <col key={i} style={{ width: "14.2857%" }} />
                  ))}
                </colgroup>
                <tbody>
                  {[
                    [
                      ["Manufacturer:", formData.manufacturer],
                      ["Catalog No.:", formData.catalogNumber],
                      ["Serial Number:", formData.serialNumber],
                      ["Type:", formData.type],
                      ["Frame Size (A):", formData.frameSize],
                      ["I.C. Rating (kA):", formData.icRating],
                      ["Trip Unit Type:", formData.tripUnitType],
                    ],
                    [
                      ["Rating Plug (A):", formData.ratingPlug],
                      ["Curve No.:", formData.curveNo],
                      ["Charge Motor V:", formData.chargeMotorVoltage],
                      ["Operation:", formData.operation],
                      ["Mounting:", formData.mounting],
                      ["Zone Interlock:", formData.zoneInterlock],
                      ["Thermal Memory:", formData.thermalMemory],
                    ],
                  ].map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map(([label, value]) => (
                        <td
                          key={label}
                          className="p-2 align-top border border-neutral-300 print:border-black print:border"
                        >
                          <div className="font-semibold">{label}</div>
                          <div className="mt-0 whitespace-pre-wrap break-words">
                            {value || ""}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Primary Injection (ground fault functions only) */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4" style={sectionDividerStyle}></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Primary Injection
            </h2>

            {/* Screen view - editable tables */}
            <div className={`injection-onscreen ${screenOnly}`}>
              {renderInjectionTables(false)}
            </div>

            {/* Print view - static tables */}
            <div className={`${printOnly} overview-print`}>
              {renderInjectionTables(true)}
            </div>

            {/* Description of Set-up and Results */}
            <div className="mt-6">
              <h3 className="text-base font-semibold mb-2 text-neutral-900 dark:text-white print:text-black">
                Description of Set-up and Results
              </h3>
              <div className={screenOnly}>
                <textarea
                  value={formData.setupDescription}
                  onChange={(e) =>
                    handleChange("setupDescription", e.target.value)
                  }
                  readOnly={!isEditing}
                  rows={8}
                  className={`form-textarea w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  placeholder="Describe the test set-up, how the recorded results were achieved, and any additional results..."
                />
              </div>
              <div className={printOnly}>
                <table className="w-full border-collapse border border-neutral-300 print:border-black">
                  <tbody>
                    <tr>
                      <td
                        className="border border-neutral-300 print:border-black px-4 py-8 text-sm align-top"
                        style={{
                          minHeight: "150px",
                          height: "150px",
                          whiteSpace: "pre-wrap",
                          wordWrap: "break-word",
                          overflowWrap: "break-word",
                        }}
                      >
                        {formData.setupDescription || ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Test Equipment */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4" style={sectionDividerStyle}></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>

            {/* Screen view - form inputs */}
            <div
              className={`grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4 test-eqpt-onscreen ${screenOnly}`}
            >
              <div>
                <label className="form-label inline-block w-24">Model:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.model}
                  onChange={(value) =>
                    handleTestEquipmentChange("model", value)
                  }
                  onSelect={(equipment) => {
                    handleTestEquipmentChange(
                      "model",
                      equipment.equipment_name,
                    );
                    handleTestEquipmentChange(
                      "serialNumber",
                      equipment.serial_number || "",
                    );
                    handleTestEquipmentChange("ampId", equipment.amp_id || "");
                    handleTestEquipmentChange(
                      "calDate",
                      formatLocalDateShort(equipment.calibration_date),
                    );
                  }}
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-24">
                  Serial #:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.serialNumber}
                  onChange={(e) =>
                    handleTestEquipmentChange("serialNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-24">AMP ID:</label>
                <input
                  type="text"
                  value={formData.testEquipment.ampId}
                  onChange={(e) =>
                    handleTestEquipmentChange("ampId", e.target.value)
                  }
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label inline-block w-24">
                  Cal Date:
                </label>
                <input
                  type="date"
                  value={formData.testEquipment.calDate}
                  onChange={(e) =>
                    handleTestEquipmentChange("calDate", e.target.value)
                  }
                  readOnly={!isEditing}
                  className="form-input"
                />
              </div>
            </div>

            {/* Print view - table structure */}
            <div className={`${printOnly} test-eqpt-print`}>
              <table className="w-full border-collapse border border-neutral-300 print:border-black">
                <thead>
                  <tr>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left">
                      Model
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left">
                      Serial Number
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left">
                      AMP ID
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left">
                      Cal Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.testEquipment.model || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.testEquipment.serialNumber || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.testEquipment.ampId || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.testEquipment.calDate
                        ? new Date(
                            formData.testEquipment.calDate + "T00:00:00",
                          ).toLocaleDateString()
                        : ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Comments */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4" style={sectionDividerStyle}></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments
            </h2>
            <div className={screenOnly}>
              <textarea
                value={formData.comments}
                onChange={(e) => handleChange("comments", e.target.value)}
                readOnly={!isEditing}
                rows={6}
                className={`form-textarea w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            <div className={printOnly}>
              <table className="w-full border-collapse border border-neutral-300 print:border-black">
                <tbody>
                  <tr>
                    <td
                      className="border border-neutral-300 print:border-black px-4 py-8 text-sm align-top"
                      style={{
                        minHeight: "150px",
                        height: "150px",
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
                      {formData.comments || ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Back Button */}
          <div className="print:hidden">
            <Button
              variant="ghost"
              onClick={() => navigate(`/jobs/${jobId}`)}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              className="text-neutral-600 dark:text-neutral-300 hover:text-neutral-800 dark:hover:text-white"
            >
              Back to Job
            </Button>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export { GFITripTestReport };
export default GFITripTestReport;
