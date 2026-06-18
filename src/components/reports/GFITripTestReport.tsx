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

  // Test Equipment
  testEquipment: {
    model: string;
    serialNumber: string;
    ampId: string;
    calDate: string;
  };

  // GFI Data
  manufacturer: string;
  ratedCurrent: string;
  groundFaultSetting: string;
  groundFaultTrip: string;

  // Results
  results: string;

  // Pass/Fail Status
  status: "PASS" | "FAIL";
}

const REPORT_SLUG = "gfi-trip-test-report";
const TABLE_NAME = "gfi_trip_test_reports";

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
    testEquipment: {
      model: "",
      serialNumber: "",
      ampId: "",
      calDate: "",
    },
    manufacturer: "",
    ratedCurrent: "",
    groundFaultSetting: "",
    groundFaultTrip: "",
    results: "",
    status: "PASS",
  });

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

      if (user) {
        setFormData((prev) => ({
          ...prev,
          user: user.full_name || user.email || "",
        }));
      }
    } catch (error) {
      console.error("Error loading job info:", error);
    }
  }, [jobId, user]);

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
          testEquipment: data.test_equipment || {
            model: "",
            serialNumber: "",
            ampId: "",
            calDate: "",
          },
          manufacturer: data.manufacturer || "",
          ratedCurrent: data.rated_current || "",
          groundFaultSetting: data.ground_fault_setting || "",
          groundFaultTrip: data.ground_fault_trip || "",
          results: data.results || "",
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
        test_equipment: formData.testEquipment,
        manufacturer: formData.manufacturer,
        rated_current: formData.ratedCurrent,
        ground_fault_setting: formData.groundFaultSetting,
        ground_fault_trip: formData.groundFaultTrip,
        results: formData.results,
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

          const { data: assetResult, error: assetError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;

          await supabase.schema("neta_ops").from("job_assets").insert({
            job_id: jobId,
            asset_id: assetResult.id,
            user_id: user.id,
          });
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

                  // Update asset status to ready_for_review
                  const fileUrl = `report:/jobs/${jobId}/${REPORT_SLUG}/${savedReportId}`;
                  const { error } = await supabase
                    .schema("neta_ops")
                    .from("assets")
                    .update({
                      status: "ready_for_review",
                      submitted_at: new Date().toISOString(),
                    })
                    .eq("file_url", fileUrl);

                  if (error) throw error;

                  alert("Report marked as ready for review!");
                } catch (error: any) {
                  console.error("Error marking report as ready:", error);
                  alert(
                    `Failed to mark as ready: ${error?.message || "Unknown error"}`,
                  );
                }
              }}
              className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Mark Ready to Review
            </button>
          </div>
        )}
      </ReportWrapper>
    );
  }

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
                  : "2px solid #dc2626",
              backgroundColor:
                formData.status === "PASS" ? "#22c55e" : "#ef4444",
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
                  status: prev.status === "PASS" ? "FAIL" : "PASS",
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
            <div
              className="w-full h-1 bg-[#f26722] mb-4"
              style={{
                width: "100%",
                height: "4px",
                backgroundColor: "#f26722",
                marginBottom: "1rem",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
              }}
            ></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 ${isPrintMode ? "hidden" : ""} print:hidden`}
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
            <div
              className={`${isPrintMode ? "block" : "hidden print:block"} job-info-print`}
            >
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

          {/* Test Equipment */}
          <section className="mb-6">
            <div
              className="w-full h-1 bg-[#f26722] mb-4"
              style={{
                width: "100%",
                height: "4px",
                backgroundColor: "#f26722",
                marginBottom: "1rem",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
              }}
            ></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment
            </h2>

            {/* Screen view - form inputs */}
            <div
              className={`grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4 ${isPrintMode ? "hidden" : ""} print:hidden`}
            >
              <div>
                <label className="form-label inline-block w-24">Model:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.model}
                  onChange={(value) =>
                    handleTestEquipmentChange("model", value)
                  }
                  onSelect={(equipment) => {
                    const formatDate = (dateString: string | null): string => {
                      if (!dateString) return "";
                      try {
                        const date = new Date(dateString);
                        return date.toLocaleDateString("en-US", {
                          month: "2-digit",
                          day: "2-digit",
                          year: "numeric",
                        });
                      } catch {
                        return dateString;
                      }
                    };
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
            <div className={`${isPrintMode ? "block" : "hidden print:block"}`}>
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

          {/* GFI Trip Test Data - Overview Table */}
          <section className="mb-6">
            <div
              className="w-full h-1 bg-[#f26722] mb-4"
              style={{
                width: "100%",
                height: "4px",
                backgroundColor: "#f26722",
                marginBottom: "1rem",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
              }}
            ></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Overview
            </h2>

            {/* Screen view - with input fields */}
            <div
              className={`overflow-x-auto ${isPrintMode ? "hidden" : ""} print:hidden`}
            >
              <table className="min-w-full border-collapse border border-neutral-200 dark:border-neutral-700">
                <thead>
                  <tr>
                    <th
                      className="border border-neutral-200 dark:border-neutral-700 p-2 bg-neutral-50 dark:bg-dark-150 font-semibold text-left text-neutral-900 dark:text-white"
                      colSpan={2}
                    >
                      Data
                    </th>
                    <th className="border border-neutral-200 dark:border-neutral-700 p-2 bg-neutral-50 dark:bg-dark-150 font-semibold text-left text-neutral-900 dark:text-white">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300 w-40">
                      Manufacturer
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2 w-48">
                      <input
                        type="text"
                        value={formData.manufacturer}
                        onChange={(e) =>
                          handleChange("manufacturer", e.target.value)
                        }
                        readOnly={!isEditing}
                        className="form-input w-full"
                        placeholder="e.g., Eaton"
                      />
                    </td>
                    <td
                      className="border border-neutral-200 dark:border-neutral-700 px-4 py-2 align-top"
                      rowSpan={4}
                    >
                      <textarea
                        value={formData.results}
                        onChange={(e) =>
                          handleChange("results", e.target.value)
                        }
                        readOnly={!isEditing}
                        rows={8}
                        className="form-input w-full resize-none"
                        placeholder="Enter test results and observations..."
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Rated Current
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2">
                      <input
                        type="text"
                        value={formData.ratedCurrent}
                        onChange={(e) =>
                          handleChange("ratedCurrent", e.target.value)
                        }
                        readOnly={!isEditing}
                        className="form-input w-full"
                        placeholder="e.g., 3000 A"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Ground Fault Setting
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2">
                      <input
                        type="text"
                        value={formData.groundFaultSetting}
                        onChange={(e) =>
                          handleChange("groundFaultSetting", e.target.value)
                        }
                        readOnly={!isEditing}
                        className="form-input w-full"
                        placeholder="e.g., 750 A"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Ground Fault Trip
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 px-4 py-2">
                      <input
                        type="text"
                        value={formData.groundFaultTrip}
                        onChange={(e) =>
                          handleChange("groundFaultTrip", e.target.value)
                        }
                        readOnly={!isEditing}
                        className="form-input w-full"
                        placeholder="e.g., 750 A"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Print view - static text output */}
            <div
              className={`${isPrintMode ? "block" : "hidden print:block"} overview-print`}
            >
              <table className="w-full border-collapse border border-neutral-300 print:border-black">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "50%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th
                      className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left"
                      colSpan={2}
                    >
                      Data
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="allow-row-break">
                    <td className="p-2 border border-neutral-300 print:border-black font-medium w-40">
                      Manufacturer
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black w-48">
                      {formData.manufacturer || ""}
                    </td>
                    <td
                      className="p-2 border border-neutral-300 print:border-black align-top"
                      rowSpan={4}
                    >
                      <div
                        className="whitespace-pre-wrap text-sm"
                        style={{
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                          maxWidth: "100%",
                        }}
                      >
                        {formData.results || ""}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black font-medium">
                      Rated Current
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.ratedCurrent || ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black font-medium">
                      Ground Fault Setting
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.groundFaultSetting || ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black font-medium">
                      Ground Fault Trip
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.groundFaultTrip || ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Back Button */}
          <div className="print:hidden">
            <button
              onClick={() => navigate(`/jobs/${jobId}`)}
              className="text-neutral-600 dark:text-neutral-300 hover:text-neutral-800 dark:hover:text-white"
            >
              ← Back to Job
            </button>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export { GFITripTestReport };
export default GFITripTestReport;
