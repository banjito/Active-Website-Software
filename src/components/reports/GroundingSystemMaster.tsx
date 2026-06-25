import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { ReportWrapper } from "./ReportWrapper";
import { getAssetName, getReportName } from "./reportMappings";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "@/components/equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";

// Route slug and DB table placeholders
const REPORT_SLUG = "grounding-system-master";
const TABLE_NAME = "grounding_system_master_reports";

const GroundingSystemMaster: React.FC = () => {
  const {
    id: jobId,
    reportId,
    substation,
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
  // reportFormat: saved with report, used for mass print and single print. 'uncondensed' = one page per test (ULA); 'condensed' = dense layout (most customers)
  const [reportFormat, setReportFormat] = useState<"condensed" | "uncondensed">(
    "uncondensed",
  );

  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState(false);
  const [dataLoaded, setDataLoaded] = useState<boolean>(!reportId);
  const [status, setStatus] = useState<"PASS" | "FAIL">("PASS");
  const [identifier, setIdentifier] = useState<string>("");
  const [jobInfo, setJobInfo] = useState({
    customer: "",
    address: "",
    user: "",
    date: "",
    jobNumber: "",
    technicians: "",
    substation: "",
    eqptLocation: "",
    temperature: { fahrenheit: 68, celsius: 20, humidity: 0 },
  });

  // Master table rows
  const [rowCount, setRowCount] = useState<number>(50);
  const createRow = (index: number) => ({
    pointLabel: `PTP #${index + 1}`,
    location: "",
    from: "",
    to: "",
    measurement: "",
    date: "",
    technicians: "",
    status: "PASS" as "PASS" | "FAIL",
    manuf: "",
    ampId: "",
    calDate: "",
    tempC: "",
    humidity: "",
    c2: "",
    p2: "",
    lastRainfall: "",
    comments: "",
  });
  type Row = {
    pointLabel: string; // PTP #1 etc
    location: string;
    from: string;
    to: string;
    measurement: string;
    date: string;
    status: "PASS" | "FAIL";
    technicians: string;
    manuf: string;
    ampId: string;
    calDate: string;
    tempC: string;
    humidity: string;
    c2: string; // Fall-of-Potential ONLY
    p2: string; // Fall-of-Potential ONLY
    lastRainfall: string;
    comments: string;
  };
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: rowCount }, (_, i) => createRow(i)),
  );

  // Alternate report data (Visual/Mechanical results + Test Equipment) — used only for alternate print, NOT default/ULA
  const [alternateReportData, setAlternateReportData] = useState({
    visualMechanicalResults: ["", "", ""] as [string, string, string],
    testEquipment: { name: "", serialNumber: "", ampId: "", calDate: "" },
  });

  // When rowCount changes, resize rows while preserving data
  useEffect(() => {
    setRows((prev) => {
      if (rowCount === prev.length) return prev;
      if (rowCount < prev.length) {
        return prev.slice(0, rowCount).map((r, i) => ({
          ...r,
          pointLabel:
            r.pointLabel && r.pointLabel.trim()
              ? r.pointLabel
              : `PTP #${i + 1}`,
        }));
      }
      const extra = Array.from({ length: rowCount - prev.length }, (_, k) =>
        createRow(prev.length + k),
      );
      return [
        ...prev.map((r, i) => ({
          ...r,
          pointLabel:
            r.pointLabel && r.pointLabel.trim()
              ? r.pointLabel
              : `PTP #${i + 1}`,
        })),
        ...extra,
      ];
    });
  }, [rowCount]);

  // Auto-load job information (match other reports)
  useEffect(() => {
    const loadJobInfo = async () => {
      if (!jobId) return;
      try {
        const { data: jobData, error: jobError } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("title, job_number, customer_id, site_address")
          .eq("id", jobId)
          .single();
        if (jobError) throw jobError;

        let customerName = "";
        let customerAddress = "";
        const siteAddress = (jobData as any)?.site_address || "";
        if (jobData?.customer_id) {
          const { data: cust, error: custErr } = await supabase
            .schema("common")
            .from("customers")
            .select("name, company_name, address")
            .eq("id", jobData.customer_id)
            .single();
          if (!custErr && cust) {
            customerName = cust.name || cust.company_name || "";
            customerAddress = cust.address || "";
          }
        }

        setJobInfo((prev) => ({
          ...prev,
          customer: maskCustomerName(customerName) || prev.customer,
          address:
            maskCustomerAddress(siteAddress || customerAddress) || prev.address,
          jobNumber: jobData?.job_number || prev.jobNumber,
        }));
      } catch {
        // ignore
      }
    };
    loadJobInfo();
  }, [jobId]);

  const reportName = getReportName(REPORT_SLUG) || "Grounding System MASTER";
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    const el = tableWrapperRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;
    e.preventDefault();
  };

  const onHeaderMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = tableWrapperRef.current;
    if (!el) return;
    const delta = e.clientX - dragStartXRef.current;
    el.scrollLeft = Math.max(
      0,
      Math.min(
        startScrollLeftRef.current - delta,
        el.scrollWidth - el.clientWidth,
      ),
    );
  };

  const onHeaderMouseUp = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const loadExisting = async () => {
      if (!reportId) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .schema("neta_ops")
          .from(TABLE_NAME)
          .select("*")
          .eq("id", reportId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const info = (data as any).report_info || {};
          setIdentifier(String(info.identifier || ""));
          setStatus(String(info.status || "PASS") === "FAIL" ? "FAIL" : "PASS");
          setReportFormat(
            (info as any).reportFormat === "condensed"
              ? "condensed"
              : "uncondensed",
          );
          // Populate job info from saved record
          setJobInfo((prev) => ({
            ...prev,
            customer: maskCustomerName(info.customer || prev.customer),
            address: maskCustomerAddress(info.address || prev.address),
            user: info.user ?? prev.user,
            date: info.date ?? prev.date,
            jobNumber: info.jobNumber ?? prev.jobNumber,
            technicians: info.technicians ?? prev.technicians,
            substation: info.substation ?? prev.substation,
            eqptLocation: info.eqptLocation ?? prev.eqptLocation,
            temperature: {
              fahrenheit:
                info.temperature?.fahrenheit ?? prev.temperature.fahrenheit,
              celsius: info.temperature?.celsius ?? prev.temperature.celsius,
              humidity: info.temperature?.humidity ?? prev.temperature.humidity,
            },
          }));
          // Load master rows if present
          if (Array.isArray((data as any).rows)) {
            const savedRows = (data as any).rows as any[];
            setRows(
              savedRows.map((r: any, i: number) => ({
                pointLabel:
                  r.pointLabel && r.pointLabel.trim()
                    ? r.pointLabel
                    : `PTP #${i + 1}`,
                location: r.location || "",
                from: r.from || "",
                to: r.to || "",
                measurement: r.measurement || "",
                date: r.date || "",
                status: r.status === "FAIL" ? "FAIL" : "PASS",
                technicians: r.technicians || "",
                manuf: r.manuf || "",
                ampId: r.ampId || "",
                calDate: r.calDate || "",
                tempC: r.tempC || "",
                humidity: r.humidity || "",
                c2: r.c2 || "",
                p2: r.p2 || "",
                lastRainfall: r.lastRainfall || "",
                comments: r.comments || "",
              })),
            );
            setRowCount(savedRows.length || rowCount);
          }
          // Load alternate report data (visual/mechanical + test equipment)
          const alt = (info as any).alternateReportData;
          if (alt) {
            setAlternateReportData({
              visualMechanicalResults: Array.isArray(
                alt.visualMechanicalResults,
              )
                ? (alt.visualMechanicalResults as [string, string, string])
                : ["", "", ""],
              testEquipment:
                alt.testEquipment && typeof alt.testEquipment === "object"
                  ? {
                      name: alt.testEquipment.name || "",
                      serialNumber: alt.testEquipment.serialNumber || "",
                      ampId: alt.testEquipment.ampId || "",
                      calDate: alt.testEquipment.calDate || "",
                    }
                  : { name: "", serialNumber: "", ampId: "", calDate: "" },
            });
          }
          setIsEditing(false);
        }
      } catch (e) {
        // noop for blank page
      } finally {
        setLoading(false);
        // Delay setting dataLoaded to ensure React renders data to DOM first
        // This is critical for deliverable PDF extraction to capture the data
        setTimeout(() => setDataLoaded(true), 500);
      }
    };
    loadExisting();
  }, [reportId]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    const wasExistingReport = Boolean(reportId);
    try {
      setLoading(true);
      let result;
      const payload = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          ...jobInfo,
          identifier,
          status,
          title: reportName,
          reportFormat,
          alternateReportData,
        },
        rows,
      } as any;

      if (reportId) {
        result = await supabase
          .schema("neta_ops")
          .from(TABLE_NAME)
          .update(payload)
          .eq("id", reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema("neta_ops")
          .from(TABLE_NAME)
          .insert(payload)
          .select()
          .single();

        if (result.data) {
          // Create folder structure by substation.
          // Use encodeURIComponent so the original substation name (e.g. "P2(I)")
          // round-trips losslessly through the asset file_url and back into the
          // Linked Reports grouping display. The previous regex was lossy and
          // produced incorrect folder labels like "P2 i" for "P2(I)".
          const substationFolder =
            jobInfo.substation && jobInfo.substation.trim()
              ? encodeURIComponent(jobInfo.substation.trim())
              : "general";

          const assetData = {
            name: getAssetName(REPORT_SLUG, identifier || ""),
            file_url: `report:/jobs/${jobId}/${REPORT_SLUG}/${substationFolder}/${result.data.id}`,
            user_id: user.id,
          };
          const { data: assetResult } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert(assetData)
            .select()
            .single();
          if (assetResult?.id) {
            await supabase.schema("neta_ops").from("job_assets").insert({
              job_id: jobId,
              asset_id: assetResult.id,
              user_id: user.id,
            });
          }
        }
      }

      if (result?.error) throw result.error;
      setJustSaved(true);
      if (!wasExistingReport) {
        setIsEditing(false);
        const newId = result?.data?.id;
        if (newId) {
          setCurrentReportId(newId);
          navigate(`/jobs/${jobId}/${REPORT_SLUG}/${newId}`, { replace: true });
        }
      }
    } catch (e) {
      // Keep blank minimal behavior
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (currentReportId) {
      setIsEditing(false);
    }
  };

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Data-loaded marker for deliverable viewer to detect when report is ready */}
      <div
        data-report-loaded={dataLoaded ? "true" : "false"}
        className="report-data-marker"
      />

      <div className="p-6 flex justify-center print:p-0">
        <div className="max-w-7xl w-full min-w-0 space-y-6 print:space-y-0">
          {/* Global print header (hidden now in favor of per-row headers) */}
          <div className="hidden">
            <div className="relative flex items-center justify-between border-b-2 border-neutral-800 pb-4 mb-4">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                alt="AMP Logo"
                className="h-10 w-auto relative"
                style={{ maxHeight: 40, zIndex: 1 }}
              />
              <div
                className="absolute left-0 right-0 text-center"
                style={{
                  zIndex: 0,
                  pointerEvents: "none",
                  background: "transparent",
                }}
              >
                <h1 className="text-2xl font-bold text-black mb-1">
                  {reportName}
                </h1>
              </div>
              <div
                className="text-right font-extrabold text-xl relative"
                style={{ color: "#1a4e7c", zIndex: 1 }}
              >
                NETA - MTS 7.13
              </div>
            </div>
            <div className="w-full h-1 bg-[#f26722] my-4" aria-hidden />
          </div>
          <ReportHeader
            title={reportName}
            isAutoSaving={false}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={loading}
            status={status}
            hasReport={!!currentReportId}
            onStatusToggle={() => {
              if (isEditing) setStatus(status === "PASS" ? "FAIL" : "PASS");
            }}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onEdit={() => setIsEditing(true)}
            onBack={() => navigate(`/jobs/${jobId}`)}
            onPrint={() => setTimeout(() => window.print(), 100)}
            isPrintMode={isPrintMode}
          />
          <div className="mb-6 flex items-center gap-2 print:hidden">
            <label
              htmlFor="report-format"
              className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap"
            >
              Report format:
            </label>
            <select
              id="report-format"
              value={reportFormat}
              onChange={(e) =>
                setReportFormat(e.target.value as "condensed" | "uncondensed")
              }
              disabled={!isEditing}
              className={`form-select text-sm py-1.5 px-2 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150 cursor-default" : ""}`}
            >
              <option value="uncondensed">
                Uncondensed (one page per test)
              </option>
              <option value="condensed">Condensed (dense layout)</option>
            </select>
          </div>

          {/* Job Information - on-screen editable, hidden in print */}
          <section
            className={`mb-6 ${isPrintMode ? "hidden" : ""} print:hidden`}
          >
            <div className="mt-6 w-full h-1 bg-[#f26722] my-4" aria-hidden />
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
              Job Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 job-info-onscreen">
              {/* Left Column */}
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Customer
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={maskCustomerName(jobInfo.customer)}
                      onChange={(e) =>
                        setJobInfo((p) => ({ ...p, customer: e.target.value }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Site Address
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={maskCustomerAddress(jobInfo.address)}
                      onChange={(e) =>
                        setJobInfo((p) => ({ ...p, address: e.target.value }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    User
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={jobInfo.user}
                      onChange={(e) =>
                        setJobInfo((p) => ({ ...p, user: e.target.value }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Date
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="date"
                      value={jobInfo.date}
                      onChange={(e) =>
                        setJobInfo((p) => ({ ...p, date: e.target.value }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Identifier
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
              </div>
              {/* Right Column */}
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Job #
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={jobInfo.jobNumber}
                      onChange={(e) =>
                        setJobInfo((p) => ({ ...p, jobNumber: e.target.value }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Technicians
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={jobInfo.technicians}
                      onChange={(e) =>
                        setJobInfo((p) => ({
                          ...p,
                          technicians: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex items-center">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Temp.
                  </label>
                  <div className="flex-1 flex items-center">
                    <div className="w-16 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="number"
                        value={jobInfo.temperature.fahrenheit}
                        onChange={(e) =>
                          setJobInfo((p) => ({
                            ...p,
                            temperature: {
                              ...p.temperature,
                              fahrenheit: Number(e.target.value),
                              celsius: Math.round(
                                ((Number(e.target.value) - 32) * 5) / 9,
                              ),
                            },
                          }))
                        }
                        readOnly={!isEditing}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="mx-2">°F</span>
                    <span className="mx-2">{jobInfo.temperature.celsius}</span>
                    <span className="mx-2">°C</span>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Humidity
                  </label>
                  <div className="flex items-center flex-1">
                    <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="number"
                        value={jobInfo.temperature.humidity}
                        onChange={(e) =>
                          setJobInfo((p) => ({
                            ...p,
                            temperature: {
                              ...p.temperature,
                              humidity: Number(e.target.value),
                            },
                          }))
                        }
                        readOnly={!isEditing}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="ml-2">%</span>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Substation
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={jobInfo.substation}
                      onChange={(e) =>
                        setJobInfo((p) => ({
                          ...p,
                          substation: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Eqpt. Location
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={jobInfo.eqptLocation}
                      onChange={(e) =>
                        setJobInfo((p) => ({
                          ...p,
                          eqptLocation: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Visual and Mechanical Inspection — 3-column layout like other reports */}
          <section
            className={`mb-6 ${isPrintMode ? "hidden" : ""} print:hidden`}
          >
            <div className="mt-6 w-full h-1 bg-[#f26722] my-4" aria-hidden />
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "70%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      NETA Section
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Description
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                      7.13.A.1
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                      Verify ground system is in compliance with drawings,
                      specifications, and NFPA 70, National Electrical Code,
                      Article 250.
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <select
                        value={alternateReportData.visualMechanicalResults[0]}
                        onChange={(e) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            visualMechanicalResults: [
                              e.target.value,
                              p.visualMechanicalResults[1],
                              p.visualMechanicalResults[2],
                            ],
                          }))
                        }
                        disabled={!isEditing}
                        className={`w-full form-select border-neutral-300 dark:border-neutral-600 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        <option value="">— Select —</option>
                        <option value="Satisfactory">Satisfactory</option>
                        <option value="Unsatisfactory">Unsatisfactory</option>
                        <option value="Cleaned">Cleaned</option>
                        <option value="See Comments">See Comments</option>
                        <option value="Not Applicable">Not Applicable</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                      7.13.A.2
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                      Inspect physical and mechanical condition.
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <select
                        value={alternateReportData.visualMechanicalResults[1]}
                        onChange={(e) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            visualMechanicalResults: [
                              p.visualMechanicalResults[0],
                              e.target.value,
                              p.visualMechanicalResults[2],
                            ],
                          }))
                        }
                        disabled={!isEditing}
                        className={`w-full form-select border-neutral-300 dark:border-neutral-600 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        <option value="">— Select —</option>
                        <option value="Satisfactory">Satisfactory</option>
                        <option value="Unsatisfactory">Unsatisfactory</option>
                        <option value="Cleaned">Cleaned</option>
                        <option value="See Comments">See Comments</option>
                        <option value="Not Applicable">Not Applicable</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 align-top whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                      7.13.A.3
                    </td>
                    <td
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white"
                      style={{ hyphens: "none" }}
                    >
                      Inspect accessible electrical connections for high
                      resistance using one or more of the following{"\u00A0"}
                      methods:
                      <br />
                      1. Use of low-resistance ohmmeter in accordance with
                      Section 7.13.B.1.
                      <br />
                      2. Verify tightness of accessible bolted electrical
                      connections by calibrated torque-wrench method in
                      accordance with manufacturer&apos;s published data or
                      Table 100.12.
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <select
                        value={alternateReportData.visualMechanicalResults[2]}
                        onChange={(e) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            visualMechanicalResults: [
                              p.visualMechanicalResults[0],
                              p.visualMechanicalResults[1],
                              e.target.value,
                            ],
                          }))
                        }
                        disabled={!isEditing}
                        className={`w-full form-select border-neutral-300 dark:border-neutral-600 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        <option value="">— Select —</option>
                        <option value="Satisfactory">Satisfactory</option>
                        <option value="Unsatisfactory">Unsatisfactory</option>
                        <option value="Cleaned">Cleaned</option>
                        <option value="See Comments">See Comments</option>
                        <option value="Not Applicable">Not Applicable</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Master table — Electrical Tests */}
          {/* Ensure outer table borders are removed in print for master + job info */}
          <style>{`
            @media print {
              #report-container table.no-outer-border { border: 0 !important; }
              #report-container .job-info-print table { border: 0 !important; }
            }
          `}</style>
          <section
            className={`p-0 ${isPrintMode ? "hidden" : ""} print:hidden`}
          >
            <div className="mt-6 w-full h-1 bg-[#f26722] my-4" aria-hidden />
            {/* Row controls (screen only) */}
            <div
              className={`${isPrintMode ? "hidden" : ""} print:hidden flex items-center justify-between mb-3`}
            >
              <div className="text-sm font-medium">Rows</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRowCount((c) => Math.max(1, c - 10))}
                  className="px-2 py-1 text-sm bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded"
                >
                  -10
                </button>
                <button
                  onClick={() => setRowCount((c) => Math.max(1, c - 1))}
                  className="px-2 py-1 text-sm bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded"
                >
                  -1
                </button>
                <input
                  type="number"
                  className="w-20 form-input"
                  value={rowCount}
                  min={1}
                  onChange={(e) =>
                    setRowCount(Math.max(1, Number(e.target.value) || 1))
                  }
                />
                <button
                  onClick={() => setRowCount((c) => c + 1)}
                  className="px-2 py-1 text-sm bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded"
                >
                  +1
                </button>
                <button
                  onClick={() => setRowCount((c) => c + 10)}
                  className="px-2 py-1 text-sm bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded"
                >
                  +10
                </button>
              </div>
            </div>
            <div
              className="overflow-x-auto"
              ref={tableWrapperRef}
              id="gsm-scroll-wrapper"
            >
              <table className="min-w-full text-xs no-outer-border select-none">
                <thead
                  onMouseDown={onHeaderMouseDown}
                  onMouseMove={onHeaderMouseMove}
                  onMouseUp={onHeaderMouseUp}
                  onMouseLeave={onHeaderMouseUp}
                  style={{ cursor: "grab" }}
                >
                  <tr className="bg-neutral-50 dark:bg-dark-200">
                    <th className="px-2 py-2 text-left">Ground Point</th>
                    <th className="px-2 py-2 text-left">Location</th>
                    <th className="px-2 py-2 text-left">FROM</th>
                    <th className="px-2 py-2 text-left min-w-[12rem]">TO</th>
                    <th className="px-2 py-2 text-left">Measurement</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Technicians</th>
                    <th className="px-2 py-2 text-left">Test Equip. Manuf.</th>
                    <th className="px-2 py-2 text-left">Test Equip. AMP ID</th>
                    <th className="px-2 py-2 text-left">Cal Date</th>
                    <th className="px-2 py-2 text-left">Temp. Celsius</th>
                    <th className="px-2 py-2 text-left">Humidity</th>
                    <th className="px-2 py-2 text-left">C2:</th>
                    <th className="px-2 py-2 text-left">P2:</th>
                    <th className="px-2 py-2 text-left">Last Rainfall</th>
                    <th className="px-2 py-2 text-left">
                      Comments (Leave blank for "None")
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={idx}
                      className={
                        idx % 2 === 0
                          ? "bg-white dark:bg-dark-150"
                          : "bg-neutral-50 dark:bg-dark-200"
                      }
                    >
                      <td className="px-2 py-1 whitespace-nowrap">
                        <input
                          className="w-24 bg-transparent border-b border-neutral-300 dark:border-neutral-700 focus:outline-none"
                          value={r.pointLabel || `PTP #${idx + 1}`}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].pointLabel = newValue;
                              return c;
                            });
                          }}
                          onBlur={(e) => {
                            // If empty, restore default
                            if (!e.target.value.trim()) {
                              setRows((rs) => {
                                const c = [...rs];
                                c[idx].pointLabel = `PTP #${idx + 1}`;
                                return c;
                              });
                            }
                          }}
                          placeholder={`PTP #${idx + 1}`}
                          readOnly={!isEditing}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.location}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].location = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.from}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].from = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1 min-w-[12rem]">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.to}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].to = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.measurement}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].measurement = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          className="bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.date}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].date = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className={`px-2 py-1 text-xs font-bold rounded-md focus:outline-none ${r.status === "PASS" ? "bg-green-600 text-white" : "bg-neutral-200 text-neutral-700 dark:bg-dark-100 dark:text-white"}`}
                              onClick={() =>
                                setRows((rs) => {
                                  const c = [...rs];
                                  c[idx].status = "PASS";
                                  return c;
                                })
                              }
                            >
                              PASS
                            </button>
                            <button
                              type="button"
                              className={`px-2 py-1 text-xs font-bold rounded-md focus:outline-none ${r.status === "FAIL" ? "bg-red-600 text-white" : "bg-neutral-200 text-neutral-700 dark:bg-dark-100 dark:text-white"}`}
                              onClick={() =>
                                setRows((rs) => {
                                  const c = [...rs];
                                  c[idx].status = "FAIL";
                                  return c;
                                })
                              }
                            >
                              FAIL
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`inline-block px-3 py-1 text-xs font-bold rounded-md ${r.status === "PASS" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
                          >
                            {r.status}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.technicians}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].technicians = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.manuf}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].manuf = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.ampId}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].ampId = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.calDate}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].calDate = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-24 bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.tempC}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].tempC = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-20 bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.humidity}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].humidity = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-16 bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.c2}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].c2 = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-16 bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.p2}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].p2 = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-28 bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.lastRainfall}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].lastRainfall = e.target.value;
                              return c;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none"
                          value={r.comments}
                          onChange={(e) =>
                            setRows((rs) => {
                              const c = [...rs];
                              c[idx].comments = e.target.value;
                              return c;
                            })
                          }
                          placeholder="Leave blank for 'None'"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Equipment — at bottom, one row with four columns like other reports */}
          <section
            className={`mb-20 ${isPrintMode ? "hidden" : ""} print:hidden`}
          >
            <div className="mt-6 w-full h-1 bg-[#f26722] mb-4" />
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
              Test Equipment Used (Low Resistance Ohmmeter)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-dark-150">
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Model / Name
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Serial Number
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      AMP ID
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Cal Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <EquipmentAutocomplete
                        value={alternateReportData.testEquipment.name}
                        onChange={(v) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            testEquipment: { ...p.testEquipment, name: v },
                          }))
                        }
                        onSelect={(equipment) => {
                          setAlternateReportData((p) => ({
                            ...p,
                            testEquipment: {
                              name: equipment.equipment_name,
                              serialNumber: equipment.serial_number || "",
                              ampId: equipment.amp_id || "",
                              calDate: equipment.calibration_date
                                ? formatLocalDateShort(
                                    equipment.calibration_date,
                                  )
                                : "",
                            },
                          }));
                        }}
                        placeholder="Type equipment name..."
                        readOnly={!isEditing}
                        className="w-full"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={alternateReportData.testEquipment.serialNumber}
                        onChange={(e) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            testEquipment: {
                              ...p.testEquipment,
                              serialNumber: e.target.value,
                            },
                          }))
                        }
                        readOnly={!isEditing}
                        className={`w-full form-input border-0 p-0 bg-transparent focus:ring-0 ${!isEditing ? "bg-transparent" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={alternateReportData.testEquipment.ampId}
                        onChange={(e) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            testEquipment: {
                              ...p.testEquipment,
                              ampId: e.target.value,
                            },
                          }))
                        }
                        readOnly={!isEditing}
                        className={`w-full form-input border-0 p-0 bg-transparent focus:ring-0 ${!isEditing ? "bg-transparent" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={alternateReportData.testEquipment.calDate}
                        onChange={(e) =>
                          setAlternateReportData((p) => ({
                            ...p,
                            testEquipment: {
                              ...p.testEquipment,
                              calDate: e.target.value,
                            },
                          }))
                        }
                        readOnly={!isEditing}
                        placeholder="MM/DD/YYYY"
                        className={`w-full form-input border-0 p-0 bg-transparent focus:ring-0 ${!isEditing ? "bg-transparent" : ""}`}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Print-only per-row pages - fixed layout so every entry aligns in the same spot */}
          <style>{`
            @page { size: Letter portrait; margin: 0.4in; }
            @media print {
              /* Ensure per-row pages always get their own sheet */
              .gsm-page {
                page-break-before: always;
                break-before: page;
                page-break-after: always;
                break-after: page;
                page-break-inside: avoid;
                position: relative;
                min-height: 10in;
                box-sizing: border-box;
                margin: 0 !important;
                padding: 0 !important;
              }
              .gsm-page:first-child {
                page-break-before: auto;
                break-before: auto;
              }
              .gsm-content {
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible;
              }
              .gsm-content .job-info-print, .gsm-content .job-info-print table {
                margin-left: 0 !important;
                margin-right: 0 !important;
              }
              /* Remove left edge line - no left borders anywhere in print */
              #report-container:has(.gsm-page) { border-left: none !important; }
              .gsm-page, .gsm-content, .gsm-readings,
              .gsm-content .job-info-print,
              .gsm-content .job-info-print table,
              .gsm-content .job-info-print td { border-left: none !important; }
              /* Fixed-height header so logo/title/pass-fail align on every page */
              .gsm-header {
                display: flex !important;
                min-height: 1.1in !important;
                height: 1.1in !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible;
              }
              .gsm-header img { display: block !important; }
              .gsm-header .pass-fail-status-box { display: inline-block !important; }
              /* Fixed-height job info area so readings start at same spot */
              .gsm-content .job-info-print { min-height: 1.8in !important; }
              .gsm-divider {
                height: 4px !important;
                background: #f26722 !important;
                background-color: #f26722 !important;
                margin: 0.1in 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                width: 100% !important;
                display: block !important;
              }
              /* Readings: fixed left alignment, no variable padding */
              .gsm-readings {
                margin: 0 !important;
                padding: 0 !important;
                width: 7.5in !important;
                max-width: 7.5in !important;
                table-layout: fixed !important;
              }
              /* Fixed-width row layout so Location/From/To/etc align across all pages */
              .gsm-readings .gsm-row {
                display: flex !important;
                margin-bottom: 0.12in !important;
                align-items: baseline !important;
                min-height: 1.2em !important;
              }
              .gsm-readings .gsm-label {
                width: 2.5in !important;
                min-width: 2.5in !important;
                text-align: right !important;
                padding-right: 0.15in !important;
                flex-shrink: 0 !important;
              }
              .gsm-readings .gsm-value {
                width: 3.5in !important;
                min-width: 3.5in !important;
                border-bottom: 1px solid black !important;
                flex-shrink: 0 !important;
              }
              .gsm-readings .gsm-value-wide { width: 5.2in !important; min-width: 5.2in !important; }
              .gsm-readings .gsm-value-measurement { width: 1.3in !important; min-width: 1.3in !important; }
              .gsm-page table { border-collapse: collapse !important; table-layout: fixed; width: 100%; }
              .gsm-page th, .gsm-page td { border: none !important; border-bottom: 1px solid black !important; padding: 4px 6px !important; font-size: 11px; line-height: 1.3; word-break: break-word; white-space: normal; text-align: left; }
              .gsm-page thead th { background: transparent; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: normal; }
              .gsm-page tbody td { padding-top: 2px !important; padding-bottom: 6px !important; }
              .gsm-page table { border: none !important; }
              .gsm-page tr:last-child td { border-bottom: none !important; }
              /* Alternate vs ULA layout toggle */
              .print-layout-alternate .gsm-ula-pages { display: none !important; }
              .print-layout-ula .gsm-alternate-pages { display: none !important; }
              /* Alternate dense layout - compact for 1-2 pages */
              .gsm-alternate-pages .gsm-alternate-page {
                margin: 0 !important;
                padding: 0 !important;
                page-break-inside: auto;
              }
              .gsm-alternate-pages .gsm-alternate-page table {
                border-collapse: collapse !important;
              }
              .gsm-alternate-pages .gsm-header {
                min-height: 0.5in !important;
                height: auto !important;
                padding-bottom: 4px !important;
                margin-bottom: 4px !important;
              }
              .gsm-alternate-pages .gsm-header img { max-height: 36px !important; }
              .gsm-alternate-pages .gsm-header h1 { font-size: 14px !important; }
              .gsm-alternate-pages .gsm-header .font-extrabold { font-size: 10px !important; }
              .gsm-alternate-pages .pass-fail-status-box { padding: 2px 6px !important; font-size: 10px !important; margin-top: 2px !important; }
              .gsm-alternate-pages .gsm-divider {
                height: 2px !important;
                margin: 4px 0 !important;
                background: #f26722 !important;
                background-color: #f26722 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .gsm-alternate-pages .job-info-print { min-height: 0 !important; }
              .gsm-alternate-pages .job-info-print table td { padding: 2px 4px !important; font-size: 9px !important; }
              .gsm-alternate-pages .gsm-alternate-section { margin-top: 4px !important; margin-bottom: 4px !important; }
              .gsm-alternate-pages .gsm-alternate-section h2 { font-size: 10px !important; margin-bottom: 2px !important; }
              .gsm-alternate-pages .gsm-alternate-section table { font-size: 9px !important; }
              .gsm-alternate-pages .gsm-alternate-section th,
              .gsm-alternate-pages .gsm-alternate-section td { padding: 2px 4px !important; }
            }
          `}</style>
          <div
            className={`${isPrintMode ? "block" : "hidden print:block"} ${reportFormat === "uncondensed" ? "print-layout-ula" : "print-layout-alternate"}`}
          >
            {/* ULA layout: one page per point-to-point test */}
            <div className="gsm-ula-pages">
              {rows.map((r, idx) => (
                <div key={idx} className="gsm-page">
                  <div className="gsm-header relative flex items-start justify-between border-b-2 border-neutral-800 pb-2 mb-2">
                    <img
                      src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                      alt="AMP Logo"
                      className="h-12 w-auto relative"
                      style={{ maxHeight: 48, zIndex: 1 }}
                    />
                    <div
                      className="absolute left-0 right-0 text-center"
                      style={{ zIndex: 0 }}
                    >
                      <h1 className="text-2xl font-bold text-black mb-1">
                        Grounding System
                      </h1>
                      <div className="text-sm font-semibold">
                        {r.pointLabel}
                      </div>
                    </div>
                    <div
                      className="relative flex flex-col items-end"
                      style={{ zIndex: 1 }}
                    >
                      <div
                        className="font-extrabold text-xl text-right"
                        style={{ color: "#1a4e7c" }}
                      >
                        ANSI/NETA Section 7.13
                      </div>
                      <div
                        className={`pass-fail-status-box mt-2 ${getPassFailBadgeClass(r.status)}`}
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          textAlign: "center",
                          width: "fit-content",
                          borderRadius: "6px",
                          border:
                            r.status === "PASS"
                              ? "2px solid #16a34a"
                              : "2px solid #dc2626",
                          backgroundColor:
                            r.status === "PASS" ? "#22c55e" : "#ef4444",
                          color: "white",
                          WebkitPrintColorAdjust: "exact",
                          printColorAdjust: "exact",
                          minWidth: "50px",
                        }}
                      >
                        {r.status}
                      </div>
                    </div>
                  </div>
                  <div className="gsm-content">
                    <div className="gsm-divider"></div>
                    {/* Per-page job info */}
                    <JobInfoPrintTable
                      data={{
                        customer: maskCustomerName(jobInfo.customer),
                        address: maskCustomerAddress(jobInfo.address),
                        jobNumber: jobInfo.jobNumber,
                        technicians: jobInfo.technicians,
                        date: r.date || jobInfo.date,
                        identifier,
                        user: jobInfo.user,
                        substation: jobInfo.substation,
                        eqptLocation: jobInfo.eqptLocation,
                        temperature: {
                          fahrenheit: jobInfo.temperature.fahrenheit,
                          celsius: jobInfo.temperature.celsius,
                          humidity: jobInfo.temperature.humidity,
                        },
                      }}
                    />
                    <div className="gsm-divider"></div>

                    {/* Readings Section - fixed layout so every entry aligns in same spot */}
                    <div
                      className="gsm-readings"
                      style={{ fontSize: "11px", lineHeight: "1.6" }}
                    >
                      <div className="gsm-row">
                        <div className="gsm-label">Location:</div>
                        <div className="gsm-value">
                          {r.location || "\u00A0"}
                        </div>
                      </div>
                      <div className="gsm-row">
                        <div className="gsm-label">From:</div>
                        <div className="gsm-value">{r.from || "\u00A0"}</div>
                      </div>
                      <div className="gsm-row">
                        <div className="gsm-label">To:</div>
                        <div className="gsm-value">{r.to || "\u00A0"}</div>
                      </div>
                      <div className="gsm-row">
                        <div className="gsm-label">
                          Ground Resistance Measurement:
                        </div>
                        <div className="gsm-value gsm-value-measurement">
                          <span>{r.measurement || "\u00A0"}</span>
                          <span style={{ marginLeft: "0.06in" }}>Ω</span>
                        </div>
                      </div>
                      <div className="gsm-row" style={{ marginTop: "0.2in" }}>
                        <div className="gsm-label">Comments:</div>
                        <div
                          className="gsm-value gsm-value-wide"
                          style={{ minHeight: "0.8in" }}
                        >
                          {r.comments || "None"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Alternate layout: dense report with Visual/Mechanical, Electrical Tests, Test Equipment */}
            <div className="gsm-alternate-pages">
              <div className="gsm-alternate-page">
                <div className="gsm-header relative flex items-start justify-between border-b-2 border-neutral-800 pb-2 mb-2">
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                    alt="AMP Logo"
                    className="h-12 w-auto relative"
                    style={{ maxHeight: 48, zIndex: 1 }}
                  />
                  <div
                    className="absolute left-0 right-0 text-center"
                    style={{ zIndex: 0 }}
                  >
                    <h1 className="text-2xl font-bold text-black mb-1">
                      Grounding System
                    </h1>
                  </div>
                  <div
                    className="relative flex flex-col items-end"
                    style={{ zIndex: 1 }}
                  >
                    <div
                      className="font-extrabold text-xl text-right"
                      style={{ color: "#1a4e7c" }}
                    >
                      ANSI/NETA Section 7.13
                    </div>
                    <div
                      className={`pass-fail-status-box mt-2 ${getPassFailBadgeClass(status)}`}
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        textAlign: "center",
                        width: "fit-content",
                        borderRadius: "6px",
                        border:
                          status === "PASS"
                            ? "2px solid #16a34a"
                            : "2px solid #dc2626",
                        backgroundColor:
                          status === "PASS" ? "#22c55e" : "#ef4444",
                        color: "white",
                        WebkitPrintColorAdjust: "exact",
                        printColorAdjust: "exact",
                        minWidth: "50px",
                      }}
                    >
                      {status}
                    </div>
                  </div>
                </div>
                <div className="gsm-content">
                  <div className="gsm-divider"></div>
                  <JobInfoPrintTable
                    data={{
                      customer: maskCustomerName(jobInfo.customer),
                      address: maskCustomerAddress(jobInfo.address),
                      jobNumber: jobInfo.jobNumber,
                      technicians: jobInfo.technicians,
                      date: jobInfo.date,
                      identifier,
                      user: jobInfo.user,
                      substation: jobInfo.substation,
                      eqptLocation: jobInfo.eqptLocation,
                      temperature: {
                        fahrenheit: jobInfo.temperature.fahrenheit,
                        celsius: jobInfo.temperature.celsius,
                        humidity: jobInfo.temperature.humidity,
                      },
                    }}
                  />
                  <div className="gsm-divider"></div>

                  {/* Visual and Mechanical Inspection — 3-column layout like other reports */}
                  <div className="gsm-alternate-section mt-2 mb-2">
                    <h2 className="text-sm font-bold text-black mb-1">
                      Visual and Mechanical Inspection
                    </h2>
                    <table className="w-full table-fixed border-collapse border border-black text-[10px]">
                      <colgroup>
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "70%" }} />
                        <col style={{ width: "18%" }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-neutral-100">
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            NETA Section
                          </th>
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            Description
                          </th>
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            Results
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-black px-2 py-1 whitespace-nowrap">
                            7.13.A.1
                          </td>
                          <td className="border border-black px-2 py-1">
                            Verify ground system is in compliance with drawings,
                            specifications, and NFPA 70, National Electrical
                            Code, Article 250.
                          </td>
                          <td className="border border-black px-2 py-1">
                            {alternateReportData.visualMechanicalResults[0]}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black px-2 py-1 whitespace-nowrap">
                            7.13.A.2
                          </td>
                          <td className="border border-black px-2 py-1">
                            Inspect physical and mechanical condition.
                          </td>
                          <td className="border border-black px-2 py-1">
                            {alternateReportData.visualMechanicalResults[1]}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black px-2 py-1 align-top whitespace-nowrap">
                            7.13.A.3
                          </td>
                          <td
                            className="border border-black px-2 py-1 align-top"
                            style={{ hyphens: "none" }}
                          >
                            Inspect accessible electrical connections for high
                            resistance using one or more of the following
                            {"\u00A0"}methods:
                            <br />
                            1. Use of low-resistance ohmmeter in accordance with
                            Section 7.13.B.1.
                            <br />
                            2. Verify tightness of accessible bolted electrical
                            connections by calibrated torque-wrench method in
                            accordance with manufacturer&apos;s published data
                            or Table 100.12.
                          </td>
                          <td className="border border-black px-2 py-1 align-top">
                            {alternateReportData.visualMechanicalResults[2]}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="gsm-divider" />

                  {/* Electrical Tests - compiled table */}
                  <div className="gsm-alternate-section mt-2 mb-2">
                    <h2 className="text-sm font-bold text-black mb-1">
                      Electrical Tests
                    </h2>
                    <table className="w-full border-collapse border border-black text-[9px]">
                      <thead>
                        <tr className="bg-neutral-100">
                          <th
                            className="border border-black px-1 py-1 text-center font-semibold"
                            style={{ width: "36px" }}
                          >
                            Test
                          </th>
                          <th className="border border-black px-1 py-1 text-left font-semibold">
                            Location
                          </th>
                          <th className="border border-black px-1 py-1 text-left font-semibold">
                            From
                          </th>
                          <th className="border border-black px-1 py-1 text-left font-semibold">
                            To
                          </th>
                          <th
                            className="border border-black px-1 py-1 text-left font-semibold"
                            style={{ width: "70px" }}
                          >
                            Value (Ω)
                          </th>
                          <th
                            className="border border-black px-1 py-1 text-left font-semibold"
                            style={{ width: "55px" }}
                          >
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr key={idx}>
                            <td className="border border-black px-2 py-1 text-center">
                              {idx + 1}
                            </td>
                            <td className="border border-black px-2 py-1">
                              {r.location || r.pointLabel || ""}
                            </td>
                            <td className="border border-black px-2 py-1">
                              {r.from}
                            </td>
                            <td className="border border-black px-2 py-1">
                              {r.to}
                            </td>
                            <td className="border border-black px-2 py-1">
                              {r.measurement}
                            </td>
                            <td className="border border-black px-2 py-1">
                              {r.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="gsm-divider" />

                  {/* Test Equipment Used — one row, four columns like other reports */}
                  <div className="gsm-alternate-section mt-2 mb-1">
                    <h2 className="text-sm font-bold text-black mb-1">
                      Test Equipment Used
                    </h2>
                    <table className="w-full border-collapse border border-black text-[10px]">
                      <thead>
                        <tr className="bg-neutral-100">
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            Model / Name
                          </th>
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            Serial Number
                          </th>
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            AMP ID
                          </th>
                          <th className="border border-black px-2 py-1 text-left font-semibold">
                            Cal Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-black px-2 py-1">
                            {alternateReportData.testEquipment.name || "—"}
                          </td>
                          <td className="border border-black px-2 py-1">
                            {alternateReportData.testEquipment.serialNumber ||
                              "—"}
                          </td>
                          <td className="border border-black px-2 py-1">
                            {alternateReportData.testEquipment.ampId || "—"}
                          </td>
                          <td className="border border-black px-2 py-1">
                            {alternateReportData.testEquipment.calDate || "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Mark Ready to Review
          </button>
        </div>
      )}
    </ReportWrapper>
  );
};

export default GroundingSystemMaster;
