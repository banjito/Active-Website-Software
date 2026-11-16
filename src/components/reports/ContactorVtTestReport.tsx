// Contactor VT Test Sheet: several voltage transformers (the PTs inside motor
// contactor cabinets) on one report. NETA ATS-2025 / MTS-2023 section 7.10.2:
// turns ratio, polarity and insulation resistance per VT. All pass/fail math
// lives in contactorVtCalcs.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { companyConfig } from "@/lib/companyConfig";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { EquipmentAutocomplete } from "@/components/equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { ReportWrapper } from "./ReportWrapper";
import { ReportHeader } from "./common/ReportHeader";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { useReportLocked } from "./useReportLocked";
import { useCanEditLockedJobInfo } from "./jobInfoEditAccess";
import { useAssetFormPrefill } from "./useAssetFormPrefill";
import { useReportUserAutofill } from "./useReportUserAutofill";
import { ensureReportAssetLink } from "./linkReportAsset";
import { newReportId, reportIdFromUrl } from "./common/reportIdentity";
import { reportSaveFailed, reportSaveSucceeded } from "./common/autoSaveStatus";
import { useReportScopeClass } from "./common/useReportScopeClass";
import { navigateAfterSave } from "./ReportUtils";
import { getAssetName, getReportName } from "./reportMappings";
import {
  type Application,
  type InsulationType,
  type UnitVerdict,
  type Verdict,
  evaluateVt,
  fahrenheitToCelsius,
  minInsulationMegohms,
  minTestKvdc,
  nameplateRatio,
  parseNumber,
  ratioLimitPercent,
  temperatureCorrectionFactor,
} from "./contactorVtCalcs";

const REPORT_SLUG = "contactor-vt-test";
const TABLE = "contactor_vt_test_reports";
const SCOPE_CLASS = "contactor-vt-report";

type Polarity = "" | "Agrees" | "Reversed";

interface VtUnit {
  key: string;
  vtId: string;
  serialNumber: string;
  measuredRatio: string;
  polarity: Polarity;
  irPriSec: string;
  irPriGnd: string;
  irSecGnd: string;
}

interface FuseInfo {
  manufacturer: string;
  type: string;
  size: string;
  quantity: string;
}

interface FormData {
  customer: string;
  address: string;
  user: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  eqptLocation: string;
  temperature: string; // ambient, °F
  humidity: string;

  standard: "ATS" | "MTS";
  equipmentTempC: string; // blank = use ambient
  insulationType: InsulationType;
  application: Application;

  manufacturer: string;
  catalogNumber: string;
  vtType: string;
  kva: string;
  vtClass: string;
  primaryVoltage: string;
  secondaryVoltage: string;
  otherNameplate: string;
  primaryFuse: FuseInfo;
  secondaryFuse: FuseInfo;
  phases: "" | "1 phase" | "3 phase";
  primaryConnection: "" | "Wye" | "Delta";
  secondaryConnection: "" | "Wye" | "Delta";

  priTestKvdc: string;
  secTestKvdc: string;
  units: VtUnit[];

  megohmmeter: string;
  megohmSerial: string;
  megAmpId: string;
  megCalDate: string;
  ttr: string;
  ttrSerial: string;
  ttrAmpId: string;
  ttrCalDate: string;

  comments: string;
  status: string;
}

const emptyFuse = (): FuseInfo => ({
  manufacturer: "",
  type: "",
  size: "",
  quantity: "",
});

const emptyUnit = (): VtUnit => ({
  key: newReportId(),
  vtId: "",
  serialNumber: "",
  measuredRatio: "",
  polarity: "",
  irPriSec: "",
  irPriGnd: "",
  irSecGnd: "",
});

const todayLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const initialForm = (): FormData => ({
  customer: "",
  address: "",
  user: "",
  date: todayLocal(),
  identifier: "",
  jobNumber: "",
  technicians: "",
  substation: "",
  eqptLocation: "",
  temperature: "",
  humidity: "",
  standard: "ATS",
  equipmentTempC: "",
  insulationType: "Dry",
  application: "control",
  manufacturer: "",
  catalogNumber: "",
  vtType: "",
  kva: "",
  vtClass: "",
  primaryVoltage: "",
  secondaryVoltage: "",
  otherNameplate: "",
  primaryFuse: emptyFuse(),
  secondaryFuse: emptyFuse(),
  phases: "",
  primaryConnection: "",
  secondaryConnection: "",
  priTestKvdc: "",
  secTestKvdc: "",
  units: [emptyUnit(), emptyUnit(), emptyUnit()],
  megohmmeter: "",
  megohmSerial: "",
  megAmpId: "",
  megCalDate: "",
  ttr: "",
  ttrSerial: "",
  ttrAmpId: "",
  ttrCalDate: "",
  comments: "",
  status: "PASS",
});

/** Rebuilds the form from a saved row, filling anything missing with defaults. */
function formFromRow(row: any): FormData {
  const base = initialForm();
  const data = row?.report_data ?? {};
  const info = data.report_info ?? {};
  const units: VtUnit[] = Array.isArray(data.units)
    ? data.units.map((u: any) => ({ ...emptyUnit(), ...u, key: u?.key || newReportId() }))
    : base.units;
  return {
    ...base,
    ...info,
    primaryFuse: { ...emptyFuse(), ...(info.primaryFuse ?? {}) },
    secondaryFuse: { ...emptyFuse(), ...(info.secondaryFuse ?? {}) },
    units: units.length ? units : [emptyUnit()],
    megohmmeter: data.test_equipment?.megohmmeter?.name ?? "",
    megohmSerial: data.test_equipment?.megohmmeter?.serialNumber ?? "",
    megAmpId: data.test_equipment?.megohmmeter?.ampId ?? "",
    megCalDate: data.test_equipment?.megohmmeter?.calDate ?? "",
    ttr: data.test_equipment?.ttr?.name ?? "",
    ttrSerial: data.test_equipment?.ttr?.serialNumber ?? "",
    ttrAmpId: data.test_equipment?.ttr?.ampId ?? "",
    ttrCalDate: data.test_equipment?.ttr?.calDate ?? "",
    comments: data.comments ?? "",
    status: data.status ?? info.status ?? "PASS",
  };
}

const fmt = (n: number | null | undefined, digits: number) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? ""
    : n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const verdictClass = (v: Verdict | UnitVerdict) =>
  v === "PASS"
    ? "text-green-700 bg-green-50 border-green-300 dark:text-green-300 dark:bg-green-900/30 dark:border-green-800"
    : v === "FAIL"
      ? "text-red-700 bg-red-50 border-red-300 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800"
      : "text-neutral-600 bg-neutral-50 border-neutral-300 dark:text-neutral-300 dark:bg-neutral-800 dark:border-neutral-700";

const VerdictBadge: React.FC<{ value: Verdict | UnitVerdict }> = ({ value }) =>
  value ? (
    <span
      className={`cvt-badge inline-block rounded-none border px-1.5 py-0.5 text-[11px] font-semibold ${verdictClass(value)}`}
      data-verdict={value}
    >
      {value}
    </span>
  ) : null;

const Section: React.FC<{
  title: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, className = "", children }) => (
  <section className={`mb-6 ${className}`}>
    <div className="w-full h-1 bg-brand mb-4" />
    <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
      {title}
    </h2>
    {children}
  </section>
);

const inputClass = (editable: boolean, extra = "") =>
  `block w-full px-2 py-1.5 text-sm rounded-none border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:border-brand focus:ring-1 focus:ring-brand ${
    editable ? "bg-white dark:bg-dark-150" : "bg-neutral-100 dark:bg-dark-150"
  } ${extra}`;

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="min-w-0">
    <label className="block text-xs font-medium text-neutral-700 dark:text-white mb-1">
      {label}
    </label>
    {children}
    {hint && (
      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{hint}</p>
    )}
  </div>
);

/** Print-only table of label/value pairs, four pairs per row. */
const PrintPairs: React.FC<{ pairs: [string, string][] }> = ({ pairs }) => {
  const rows: [string, string][][] = [];
  for (let i = 0; i < pairs.length; i += 4) rows.push(pairs.slice(i, i + 4));
  return (
    <table className="cvt-print-pairs hidden print:table w-full">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map(([label, value]) => (
              <React.Fragment key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </React.Fragment>
            ))}
            {Array.from({ length: 4 - row.length }).map((_, j) => (
              <React.Fragment key={`pad-${j}`}>
                <th />
                <td />
              </React.Fragment>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | undefined): v is string => !!v && UUID_RE.test(v);

const ContactorVtTestReport: React.FC = () => {
  const params = useParams<{ id: string; reportId: string }>();
  // A typed-in link like /jobs/:id/... must never reach the database.
  const badLink = !isUuid(params.id) || (params.reportId !== undefined && !isUuid(params.reportId));
  const jobId = badLink ? undefined : params.id;
  const reportId = badLink ? undefined : params.reportId;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  useReportScopeClass(SCOPE_CLASS);

  const reportName = getReportName(REPORT_SLUG);
  const isPrintMode = searchParams.get("print") === "true";
  const { locked } = useReportLocked(reportId, jobId, REPORT_SLUG);
  const canEditLockedJobInfo = useCanEditLockedJobInfo();

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(reportId);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(!reportId);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialForm);

  // Which row this report writes to, decided before any request leaves the
  // browser so two saves racing each other land on the same row.
  const reportIdRef = useRef<string | undefined>(reportId || reportIdFromUrl());
  // The asset name the job list was last told; re-sent when the identifier
  // changes, since auto-save creates the asset before anything is typed.
  const linkedAssetNameRef = useRef<string | undefined>(reportId ? "" : undefined);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    setCurrentReportId(reportId);
    if (reportId) reportIdRef.current = reportId;
  }, [reportId]);

  // Started from an asset in the Assets tab: fill its identity and nameplate.
  useAssetFormPrefill(reportId, setFormData);
  // Autofill the "User" header field (new reports only).
  useReportUserAutofill(setFormData, reportId, "user");

  const editable = isEditing && !isPrintMode;

  // ---- Derived values -------------------------------------------------------
  const ambientC = useMemo(() => {
    const f = parseNumber(formData.temperature);
    return f === null ? null : fahrenheitToCelsius(f);
  }, [formData.temperature]);

  const equipmentC = parseNumber(formData.equipmentTempC);
  const correctionTempC = equipmentC ?? ambientC;
  const tcf =
    correctionTempC === null
      ? null
      : temperatureCorrectionFactor(correctionTempC, formData.insulationType);

  const primaryVolts = parseNumber(formData.primaryVoltage);
  const secondaryVolts = parseNumber(formData.secondaryVoltage);
  const ratio = nameplateRatio(primaryVolts, secondaryVolts);
  const limit = ratioLimitPercent(formData.application);
  const minPriMeg = primaryVolts ? minInsulationMegohms(primaryVolts, formData.insulationType) : null;
  const minSecMeg = secondaryVolts
    ? minInsulationMegohms(secondaryVolts, formData.insulationType)
    : null;
  const minPriKv = primaryVolts ? minTestKvdc(primaryVolts) : null;
  const minSecKv = secondaryVolts ? minTestKvdc(secondaryVolts) : null;
  const priKv = parseNumber(formData.priTestKvdc);
  const secKv = parseNumber(formData.secTestKvdc);
  const lowTestVoltage =
    (priKv !== null && minPriKv !== null && priKv < minPriKv) ||
    (secKv !== null && minSecKv !== null && secKv < minSecKv);

  const results = useMemo(
    () =>
      formData.units.map((u) =>
        evaluateVt(u, {
          primaryVolts,
          secondaryVolts,
          tcf,
          insulation: formData.insulationType,
          application: formData.application,
        }),
      ),
    [formData.units, primaryVolts, secondaryVolts, tcf, formData.insulationType, formData.application],
  );

  const tested = results.filter((r) => r.overall);
  const failed = results.filter((r) => r.overall === "FAIL").length;
  const incomplete = results.filter((r) => r.overall === "INCOMPLETE").length;
  const passed = results.filter((r) => r.overall === "PASS").length;

  // ---- Updates ----------------------------------------------------------------
  const update = useCallback((patch: Partial<FormData>) => {
    setJustSaved(false);
    setFormData((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateFuse = (which: "primaryFuse" | "secondaryFuse", patch: Partial<FuseInfo>) => {
    setJustSaved(false);
    setFormData((prev) => ({ ...prev, [which]: { ...prev[which], ...patch } }));
  };

  const updateUnit = (key: string, patch: Partial<VtUnit>) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      units: prev.units.map((u) => (u.key === key ? { ...u, ...patch } : u)),
    }));
  };

  const addUnit = () => {
    setJustSaved(false);
    setFormData((prev) => ({ ...prev, units: [...prev.units, emptyUnit()] }));
  };

  const removeUnit = (key: string) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      units: prev.units.length > 1 ? prev.units.filter((u) => u.key !== key) : prev.units,
    }));
  };

  // ---- Load -------------------------------------------------------------------
  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;
    const { data: job, error } = await supabase
      .schema("neta_ops")
      .from("jobs")
      .select("job_number, customer_id, site_address")
      .eq("id", jobId)
      .single();
    if (error || !job) {
      console.error("Error loading job info:", error);
      return;
    }
    let customerName = "";
    let customerAddress = (job as any).site_address || "";
    if (job.customer_id) {
      const { data: customer } = await supabase
        .schema("common")
        .from("customers")
        .select("name, address")
        .eq("id", job.customer_id)
        .single();
      if (customer) {
        customerName = customer.name || "";
        customerAddress = customer.address || customerAddress;
      }
    }
    setFormData((prev) => ({
      ...prev,
      jobNumber: job.job_number || "",
      customer: maskCustomerName(customerName),
      address: maskCustomerAddress(customerAddress),
    }));
  }, [jobId, maskCustomerName, maskCustomerAddress]);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setIsEditing(true);
      return;
    }
    const { data, error } = await supabase
      .schema("neta_ops")
      .from(TABLE)
      .select("*")
      .eq("id", reportId)
      .maybeSingle();
    if (error || !data) {
      console.warn(`Contactor VT report ${reportId} not found.`, error);
      setNotFound(true);
      return;
    }
    const loaded = formFromRow(data);
    // Job number, customer and address come from the job, not the saved copy.
    setFormData((prev) => ({
      ...loaded,
      jobNumber: prev.jobNumber || loaded.jobNumber,
      customer: prev.customer || loaded.customer,
      address: prev.address || loaded.address,
    }));
    setIsEditing(false);
  }, [reportId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadReport();
      await loadJobInfo();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Save -------------------------------------------------------------------
  const persistReport = useCallback(async (): Promise<string> => {
    if (!jobId || !user?.id) throw new Error("Missing job or user");
    const f = formDataRef.current;

    const {
      units,
      comments,
      status,
      megohmmeter,
      megohmSerial,
      megAmpId,
      megCalDate,
      ttr,
      ttrSerial,
      ttrAmpId,
      ttrCalDate,
      ...info
    } = f;

    const payload = {
      report_data: {
        report_info: { ...info, status },
        units,
        test_equipment: {
          megohmmeter: { name: megohmmeter, serialNumber: megohmSerial, ampId: megAmpId, calDate: megCalDate },
          ttr: { name: ttr, serialNumber: ttrSerial, ampId: ttrAmpId, calDate: ttrCalDate },
        },
        comments,
        status,
      },
    };

    const isNewReport = !reportIdRef.current;
    if (isNewReport) reportIdRef.current = newReportId();
    const saveId = reportIdRef.current as string;
    const now = new Date().toISOString();

    // Existing rows stay a plain update so the original author is never
    // overwritten; new rows upsert on the pre-claimed id so a double save
    // lands on the same row.
    const result = isNewReport
      ? await supabase
          .schema("neta_ops")
          .from(TABLE)
          .upsert(
            { id: saveId, job_id: jobId, user_id: user.id, ...payload, created_at: now, updated_at: now },
            { onConflict: "id" },
          )
          .select("id")
          .single()
      : await supabase
          .schema("neta_ops")
          .from(TABLE)
          .update({ ...payload, updated_at: now })
          .eq("id", saveId)
          .select("id")
          .single();
    if (result.error) throw result.error;

    const savedId = (result.data?.id as string | undefined) || saveId;
    const assetName = getAssetName(REPORT_SLUG, f.identifier || f.eqptLocation || "");
    if (linkedAssetNameRef.current !== assetName) {
      await ensureReportAssetLink(
        jobId,
        {
          name: assetName,
          file_url: `report:/jobs/${jobId}/${REPORT_SLUG}/${savedId}`,
          user_id: user.id,
        },
        user.id,
      );
      linkedAssetNameRef.current = assetName;
    }

    if (isNewReport) {
      setCurrentReportId(savedId);
      window.history.replaceState({}, "", `/jobs/${jobId}/${REPORT_SLUG}/${savedId}`);
    }
    return savedId;
  }, [jobId, user?.id]);

  const autoSave = useCallback(async () => {
    if (!jobId || !user?.id) return;
    // One save at a time; anything typed meanwhile is picked up by the
    // follow-up pass, which reads the form fresh.
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      setIsAutoSaving(true);
      do {
        saveAgainRef.current = false;
        await persistReport();
      } while (saveAgainRef.current);
      reportSaveSucceeded();
    } catch (error) {
      console.error("Auto-save error:", error);
      reportSaveFailed(error);
    } finally {
      savingRef.current = false;
      saveAgainRef.current = false;
      setIsAutoSaving(false);
    }
  }, [jobId, user?.id, persistReport]);

  useEffect(() => {
    if (!isEditing || loading || locked) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(autoSave, 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData, isEditing, loading, locked, autoSave]);

  const handleSave = async (options?: {
    closeAfterSave?: boolean;
    skipAlertAndNavigation?: boolean;
  }): Promise<string | null> => {
    if (!jobId || !user?.id) {
      alert("Error: Missing required information. Please try again.");
      return null;
    }
    try {
      setIsSaving(true);
      const wasExisting = Boolean(reportIdRef.current);
      const savedId = await persistReport();
      reportSaveSucceeded();
      setJustSaved(true);
      if (options?.closeAfterSave) setIsEditing(false);
      if (!options?.skipAlertAndNavigation && !wasExisting) {
        navigate(`/jobs/${jobId}/${REPORT_SLUG}/${savedId}`, { replace: true });
      }
      return savedId;
    } catch (error) {
      console.error("Error saving report:", error);
      reportSaveFailed(error);
      alert("Error saving report. Please try again.");
      setIsEditing(true);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const savedId = await handleSave({ closeAfterSave: true });
    if (savedId || currentReportId) setIsEditing(false);
  };

  const markReadyForReview = async () => {
    if (!jobId || !user?.id) return;
    try {
      const savedId = await handleSave({ skipAlertAndNavigation: true });
      if (!savedId) throw new Error("Failed to save report");
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({ status: "ready_for_review", submitted_at: new Date().toISOString() })
        .eq("file_url", `report:/jobs/${jobId}/${REPORT_SLUG}/${savedId}`);
      if (error) throw error;
      alert("Report marked as ready for review!");
      if (!reportId) navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error("Error marking report as ready:", error);
      alert(`Failed to mark as ready: ${error?.message || "Unknown error"}`);
    }
  };

  // ---- Render -----------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (badLink) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-2 text-neutral-900 dark:text-white">
          Open this report from a job
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          This link is missing a real job. Go to a job, click Add report, and pick
          &quot;7.10.2 Contactor VT Test Sheet (Multi-Unit)&quot;.
        </p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-2 text-neutral-900 dark:text-white">
          Report not found
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          This Contactor VT report may have been deleted, or you may not have access.
        </p>
      </div>
    );
  }

  const netaRef = formData.standard === "MTS" ? "NETA MTS 7.10.2" : "NETA ATS 7.10.2";
  const fuseText = (f: FuseInfo) =>
    [f.manufacturer, f.type, f.size, f.quantity ? `qty ${f.quantity}` : ""]
      .filter(Boolean)
      .join(", ");
  const tempLabel =
    correctionTempC === null
      ? "Enter a temperature"
      : `${fmt(correctionTempC, 1)} °C${equipmentC === null ? " (ambient)" : ""}`;

  const select = (
    value: string,
    onChange: (v: string) => void,
    options: [string, string][],
    id: string,
  ) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!editable}
      className={inputClass(editable)}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );

  const text = (
    value: string,
    onChange: (v: string) => void,
    id: string,
    opts: { numeric?: boolean; placeholder?: string; type?: string } = {},
  ) => (
    <input
      id={id}
      type={opts.type ?? "text"}
      inputMode={opts.numeric ? "decimal" : undefined}
      value={value}
      placeholder={editable ? opts.placeholder : undefined}
      onChange={(e) => onChange(e.target.value)}
      readOnly={!editable}
      className={inputClass(editable, opts.numeric ? "text-right tabular-nums" : "")}
    />
  );

  return (
    <ReportWrapper isPrintMode={isPrintMode} isEditing={isEditing} wide>
      <style>{PRINT_CSS}</style>

      {/* Print header */}
      <div className="hidden print:flex items-center justify-between border-b-2 border-black pb-3 mb-4">
        <img
          src={companyConfig.reportLogoPath}
          alt={companyConfig.name}
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-black">{reportName}</h1>
        </div>
        <div className="text-right">
          <div className="font-extrabold text-lg text-black">{netaRef}</div>
          <div
            className={`pass-fail-status-box ${getPassFailBadgeClass(formData.status)} cvt-status-print`}
            data-status={formData.status || "PASS"}
          >
            {formData.status || "PASS"}
          </div>
        </div>
      </div>

      <div className="p-6 flex justify-center print:p-0">
        <div className="w-full space-y-6">
          <div className="print:hidden">
            <ReportHeader
              title={reportName}
              isAutoSaving={isAutoSaving}
              isEditing={isEditing}
              justSaved={justSaved}
              isSaving={isSaving}
              status={formData.status}
              hasReport={!!currentReportId && (!locked || canEditLockedJobInfo)}
              onStatusToggle={() => {
                if (!isEditing) return;
                update({
                  status:
                    formData.status === "PASS"
                      ? "FAIL"
                      : formData.status === "FAIL"
                        ? "LIMITED SERVICE"
                        : "PASS",
                });
              }}
              onSave={handleSave}
              onSaveAndClose={handleSaveAndClose}
              onEdit={() => setIsEditing(true)}
              onBack={() => navigate(`/jobs/${jobId}`)}
              onPrint={() => window.print()}
              isPrintMode={isPrintMode}
            />
          </div>

          {/* Job information */}
          <Section title="Job Information">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
              <Field label="Job #">{text(formData.jobNumber, (v) => update({ jobNumber: v }), "cvt-job")}</Field>
              <Field label="Customer">{text(formData.customer, (v) => update({ customer: v }), "cvt-customer")}</Field>
              <Field label="Identifier">
                {text(formData.identifier, (v) => update({ identifier: v }), "cvt-identifier", {
                  placeholder: "e.g. MCC 3B Contactor PTs",
                })}
              </Field>
              <Field label="Date">{text(formData.date, (v) => update({ date: v }), "cvt-date", { type: "date" })}</Field>
              <Field label="Location">
                {text(maskCustomerAddress(formData.address), (v) => update({ address: v }), "cvt-address")}
              </Field>
              <Field label="Substation">{text(formData.substation, (v) => update({ substation: v }), "cvt-substation")}</Field>
              <Field label="Equipment location">
                {text(formData.eqptLocation, (v) => update({ eqptLocation: v }), "cvt-eqpt-location")}
              </Field>
              <Field label="Technicians">{text(formData.technicians, (v) => update({ technicians: v }), "cvt-techs")}</Field>
              <Field label="User">{text(formData.user, (v) => update({ user: v }), "cvt-user")}</Field>
              <Field label="Ambient temp (°F)" hint={ambientC === null ? undefined : `${fmt(ambientC, 1)} °C`}>
                {text(formData.temperature, (v) => update({ temperature: v }), "cvt-temp", { numeric: true })}
              </Field>
              <Field label="Humidity (%)">
                {text(formData.humidity, (v) => update({ humidity: v }), "cvt-humidity", { numeric: true })}
              </Field>
              <Field label="NETA standard">
                {select(formData.standard, (v) => update({ standard: v as FormData["standard"] }), [
                  ["ATS", "ATS 2025 (acceptance)"],
                  ["MTS", "MTS 2023 (maintenance)"],
                ], "cvt-standard")}
              </Field>
            </div>
            <div className="hidden print:block">
              <JobInfoPrintTable
                data={{
                  customer: formData.customer,
                  address: formData.address,
                  jobNumber: formData.jobNumber,
                  technicians: formData.technicians,
                  date: formData.date,
                  identifier: formData.identifier,
                  user: formData.user,
                  substation: formData.substation,
                  eqptLocation: formData.eqptLocation,
                  temperature: {
                    fahrenheit: parseNumber(formData.temperature) ?? undefined,
                    celsius: ambientC === null ? undefined : Number(ambientC.toFixed(1)),
                    tcf: tcf === null ? undefined : Number(tcf.toFixed(3)),
                    humidity: parseNumber(formData.humidity) ?? undefined,
                  },
                }}
              />
            </div>
          </Section>

          {/* Nameplate */}
          <Section title="Nameplate Data">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
              <Field label="Manufacturer">{text(formData.manufacturer, (v) => update({ manufacturer: v }), "cvt-mfr")}</Field>
              <Field label="Catalog no.">{text(formData.catalogNumber, (v) => update({ catalogNumber: v }), "cvt-catalog")}</Field>
              <Field label="Type">{text(formData.vtType, (v) => update({ vtType: v }), "cvt-type")}</Field>
              <Field label="kVA">{text(formData.kva, (v) => update({ kva: v }), "cvt-kva")}</Field>
              <Field label="Primary voltage (V)">
                {text(formData.primaryVoltage, (v) => update({ primaryVoltage: v }), "cvt-pri-v", { numeric: true })}
              </Field>
              <Field label="Secondary voltage (V)">
                {text(formData.secondaryVoltage, (v) => update({ secondaryVoltage: v }), "cvt-sec-v", { numeric: true })}
              </Field>
              <Field label="Nameplate ratio" hint="Primary ÷ secondary">
                <div className={inputClass(false, "text-right tabular-nums")}>
                  {ratio === null ? " " : `${fmt(ratio, 2)} : 1`}
                </div>
              </Field>
              <Field label="Class">{text(formData.vtClass, (v) => update({ vtClass: v }), "cvt-class")}</Field>
              <Field label="Insulation">
                {select(formData.insulationType, (v) => update({ insulationType: v as InsulationType }), [
                  ["Dry", "Dry (solid)"],
                  ["Liquid filled", "Liquid filled"],
                ], "cvt-insulation")}
              </Field>
              <Field label="Use">
                {select(formData.application, (v) => update({ application: v as Application }), [
                  ["control", "Control / relaying (±1.2%)"],
                  ["revenue", "Revenue metering (±0.1%)"],
                ], "cvt-application")}
              </Field>
              <Field label="Connection">
                {select(formData.phases, (v) => update({ phases: v as FormData["phases"] }), [
                  ["", "Select"],
                  ["1 phase", "1 phase"],
                  ["3 phase", "3 phase"],
                ], "cvt-phases")}
              </Field>
              <div className="grid grid-cols-2 gap-2 min-w-0">
                <Field label="Primary">
                  {select(formData.primaryConnection, (v) => update({ primaryConnection: v as FormData["primaryConnection"] }), [
                    ["", "Select"],
                    ["Wye", "Wye"],
                    ["Delta", "Delta"],
                  ], "cvt-pri-conn")}
                </Field>
                <Field label="Secondary">
                  {select(formData.secondaryConnection, (v) => update({ secondaryConnection: v as FormData["secondaryConnection"] }), [
                    ["", "Select"],
                    ["Wye", "Wye"],
                    ["Delta", "Delta"],
                  ], "cvt-sec-conn")}
                </Field>
              </div>
              {(["primaryFuse", "secondaryFuse"] as const).map((which) => (
                <div key={which} className="md:col-span-2 grid grid-cols-4 gap-2 min-w-0">
                  {(["manufacturer", "type", "size", "quantity"] as const).map((k) => (
                    <Field
                      key={k}
                      label={`${which === "primaryFuse" ? "Primary" : "Secondary"} fuse ${k === "quantity" ? "qty" : k}`}
                    >
                      {text(formData[which][k], (v) => updateFuse(which, { [k]: v } as Partial<FuseInfo>), `cvt-${which}-${k}`)}
                    </Field>
                  ))}
                </div>
              ))}
              <div className="col-span-2 md:col-span-4">
                <Field label="Other">{text(formData.otherNameplate, (v) => update({ otherNameplate: v }), "cvt-other")}</Field>
              </div>
            </div>
            <PrintPairs
              pairs={[
                ["Manufacturer", formData.manufacturer],
                ["Catalog no.", formData.catalogNumber],
                ["Type", formData.vtType],
                ["kVA", formData.kva],
                ["Primary V", formData.primaryVoltage],
                ["Secondary V", formData.secondaryVoltage],
                ["Ratio", ratio === null ? "" : `${fmt(ratio, 2)} : 1`],
                ["Class", formData.vtClass],
                ["Insulation", formData.insulationType],
                ["Use", formData.application === "revenue" ? "Revenue metering" : "Control / relaying"],
                ["Connection", formData.phases],
                ["Pri / Sec", [formData.primaryConnection, formData.secondaryConnection].filter(Boolean).join(" / ")],
                ["Primary fuse", fuseText(formData.primaryFuse)],
                ["Secondary fuse", fuseText(formData.secondaryFuse)],
                ["Other", formData.otherNameplate],
              ]}
            />
          </Section>

          {/* Test settings */}
          <Section title="Test Settings">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
              <Field
                label="Equipment temp (°C)"
                hint={equipmentC === null && ambientC !== null ? "Blank uses ambient" : undefined}
              >
                {text(formData.equipmentTempC, (v) => update({ equipmentTempC: v }), "cvt-eqpt-temp", {
                  numeric: true,
                  placeholder: ambientC === null ? "" : fmt(ambientC, 1),
                })}
              </Field>
              <Field label="TCF to 20 °C" hint={tempLabel}>
                <div className={inputClass(false, "text-right tabular-nums")}>
                  {tcf === null ? " " : fmt(tcf, 3)}
                </div>
              </Field>
              <Field
                label="Primary test (kVDC)"
                hint={minPriKv === null ? undefined : `NETA minimum ${minPriKv} kVDC`}
              >
                {text(formData.priTestKvdc, (v) => update({ priTestKvdc: v }), "cvt-pri-kv", { numeric: true })}
              </Field>
              <Field
                label="Secondary test (kVDC)"
                hint={minSecKv === null ? undefined : `NETA minimum ${minSecKv} kVDC`}
              >
                {text(formData.secTestKvdc, (v) => update({ secTestKvdc: v }), "cvt-sec-kv", { numeric: true })}
              </Field>
            </div>
            <PrintPairs
              pairs={[
                ["Equipment temp", correctionTempC === null ? "" : `${fmt(correctionTempC, 1)} °C`],
                ["TCF to 20 °C", tcf === null ? "" : fmt(tcf, 3)],
                ["Primary test", formData.priTestKvdc ? `${formData.priTestKvdc} kVDC` : ""],
                ["Secondary test", formData.secTestKvdc ? `${formData.secTestKvdc} kVDC` : ""],
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600 dark:text-neutral-300 print:text-black print:text-[8pt]">
              <span>Ratio limit ±{limit}%</span>
              <span>
                Min insulation: primary {minPriMeg === null ? "n/a" : `${fmt(minPriMeg, 0)} MΩ`}, secondary{" "}
                {minSecMeg === null ? "n/a" : `${fmt(minSecMeg, 0)} MΩ`} (Table 100.5)
              </span>
              <span>Readings corrected to 20 °C (Table 100.14.1)</span>
            </div>
            {lowTestVoltage && (
              <p className="mt-2 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 rounded-none dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200 print:hidden">
                A test voltage is below the NETA minimum for that winding.
              </p>
            )}
          </Section>

          {/* Results */}
          <Section title="Voltage Transformer Results">
            <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
              <span className="text-sm text-neutral-700 dark:text-neutral-200">
                {tested.length === 0
                  ? "No readings yet."
                  : `${passed} pass, ${failed} fail${incomplete ? `, ${incomplete} incomplete` : ""}`}
              </span>
              {failed > 0 && formData.status === "PASS" && (
                <span className="border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 rounded-none dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  {failed} VT{failed === 1 ? "" : "s"} failed. Report status is still PASS.
                </span>
              )}
              {ratio === null && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Enter primary and secondary voltage to grade ratios.
                </span>
              )}
            </div>

            <div className="cvt-scroll overflow-x-auto">
              <table className="cvt-table w-full min-w-[1150px] border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2}>VT ID</th>
                    <th rowSpan={2}>Serial #</th>
                    <th colSpan={3}>Turns ratio</th>
                    <th rowSpan={2}>Polarity</th>
                    <th colSpan={3}>Insulation, MΩ (as read)</th>
                    <th colSpan={3}>Corrected to 20 °C, MΩ</th>
                    <th rowSpan={2}>Insulation</th>
                    <th rowSpan={2}>Result</th>
                    <th rowSpan={2} className="print:hidden" aria-label="Remove" />
                  </tr>
                  <tr>
                    <th>Measured</th>
                    <th>Error</th>
                    <th>Result</th>
                    <th>Pri-Sec</th>
                    <th>Pri-Gnd</th>
                    <th>Sec-Gnd</th>
                    <th>Pri-Sec</th>
                    <th>Pri-Gnd</th>
                    <th>Sec-Gnd</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.units.map((u, i) => {
                    const r = results[i];
                    const cell = (
                      field: "vtId" | "serialNumber" | "measuredRatio" | "irPriSec" | "irPriGnd" | "irSecGnd",
                      numeric = false,
                    ) => (
                      <td className={numeric ? "text-right" : ""}>
                        <input
                          id={`cvt-${u.key}-${field}`}
                          type="text"
                          inputMode={numeric ? "decimal" : undefined}
                          value={u[field]}
                          readOnly={!editable}
                          onChange={(e) => updateUnit(u.key, { [field]: e.target.value } as Partial<VtUnit>)}
                          aria-label={`${field} for VT ${i + 1}`}
                          className={`cvt-cell-input print:hidden ${numeric ? "text-right tabular-nums" : ""} ${
                            editable ? "bg-white dark:bg-dark-150" : "bg-transparent"
                          }`}
                        />
                        <span className="hidden print:inline">{u[field]}</span>
                      </td>
                    );
                    return (
                      <tr key={u.key}>
                        {cell("vtId")}
                        {cell("serialNumber")}
                        {cell("measuredRatio", true)}
                        <td className="text-right tabular-nums cvt-calc">
                          {r.ratioErrorPercent === null ? "" : `${fmt(r.ratioErrorPercent, 2)}%`}
                        </td>
                        <td className="text-center"><VerdictBadge value={r.ratioResult} /></td>
                        <td>
                          <select
                            id={`cvt-${u.key}-polarity`}
                            value={u.polarity}
                            disabled={!editable}
                            onChange={(e) => updateUnit(u.key, { polarity: e.target.value as Polarity })}
                            aria-label={`Polarity for VT ${i + 1}`}
                            className={`cvt-cell-input print:hidden ${editable ? "bg-white dark:bg-dark-150" : "bg-transparent"}`}
                          >
                            <option value="">Select</option>
                            <option value="Agrees">Agrees</option>
                            <option value="Reversed">Reversed</option>
                          </select>
                          <span className="hidden print:inline">{u.polarity}</span>
                        </td>
                        {cell("irPriSec", true)}
                        {cell("irPriGnd", true)}
                        {cell("irSecGnd", true)}
                        <td className="text-right tabular-nums cvt-calc">{fmt(r.corrected.priSec, 1)}</td>
                        <td className="text-right tabular-nums cvt-calc">{fmt(r.corrected.priGnd, 1)}</td>
                        <td className="text-right tabular-nums cvt-calc">{fmt(r.corrected.secGnd, 1)}</td>
                        <td className="text-center"><VerdictBadge value={r.insulationResult} /></td>
                        <td className="text-center"><VerdictBadge value={r.overall} /></td>
                        <td className="print:hidden text-center">
                          {editable && formData.units.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove VT ${i + 1}`}
                              title="Remove this VT"
                              onClick={() => removeUnit(u.key)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="mt-3 print:hidden">
                <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addUnit}>
                  Add VT
                </Button>
              </div>
            )}
          </Section>

          {/* Test equipment */}
          <Section title="Test Equipment Used">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
              {(
                [
                  ["Megohmmeter", "megohmmeter", "megohmSerial", "megAmpId", "megCalDate"],
                  ["Turns ratio tester", "ttr", "ttrSerial", "ttrAmpId", "ttrCalDate"],
                ] as const
              ).map(([label, nameKey, serialKey, ampKey, calKey]) => (
                <div key={nameKey} className="grid grid-cols-2 gap-3 min-w-0">
                  <div className="col-span-2">
                    <Field label={label}>
                      <EquipmentAutocomplete
                        value={formData[nameKey]}
                        onChange={(value) => update({ [nameKey]: value } as Partial<FormData>)}
                        onSelect={(eq) =>
                          update({
                            [nameKey]: eq.equipment_name,
                            [serialKey]: eq.serial_number || "",
                            [ampKey]: eq.amp_id || "",
                            [calKey]: formatLocalDateShort(eq.calibration_date),
                          } as Partial<FormData>)
                        }
                        readOnly={!editable}
                        className="w-full"
                      />
                    </Field>
                  </div>
                  <Field label="Serial #">{text(formData[serialKey], (v) => update({ [serialKey]: v } as Partial<FormData>), `cvt-${serialKey}`)}</Field>
                  <Field label="AMP ID">{text(formData[ampKey], (v) => update({ [ampKey]: v } as Partial<FormData>), `cvt-${ampKey}`)}</Field>
                  <Field label="Cal date">{text(formData[calKey], (v) => update({ [calKey]: v } as Partial<FormData>), `cvt-${calKey}`)}</Field>
                </div>
              ))}
            </div>
            <table className="cvt-table hidden print:table w-full">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Name</th>
                  <th>Serial #</th>
                  <th>AMP ID</th>
                  <th>Cal date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Megohmmeter</td>
                  <td>{formData.megohmmeter}</td>
                  <td>{formData.megohmSerial}</td>
                  <td>{formData.megAmpId}</td>
                  <td>{formData.megCalDate}</td>
                </tr>
                <tr>
                  <td>Turns ratio tester</td>
                  <td>{formData.ttr}</td>
                  <td>{formData.ttrSerial}</td>
                  <td>{formData.ttrAmpId}</td>
                  <td>{formData.ttrCalDate}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Comments */}
          <Section title="Comments" className={formData.comments.trim() ? "" : "print:hidden"}>
            <textarea
              id="cvt-comments"
              value={formData.comments}
              onChange={(e) => update({ comments: e.target.value })}
              readOnly={!editable}
              rows={4}
              className={`${inputClass(editable)} print:hidden`}
            />
            <div className="hidden print:block whitespace-pre-wrap break-words border border-black p-2 text-[9pt]">
              {formData.comments}
            </div>
          </Section>
        </div>
      </div>

      {!isPrintMode && isEditing && (
        <div className="mb-6 print:hidden flex justify-center">
          <button
            type="button"
            onClick={markReadyForReview}
            className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-none hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Mark Ready to Review
          </button>
        </div>
      )}
    </ReportWrapper>
  );
};

// Rendered inside the component, so it leaves the page with the report.
// Every rule is scoped to html.contactor-vt-report as a second guard.
const PRINT_CSS = `
html.${SCOPE_CLASS} .cvt-table th,
html.${SCOPE_CLASS} .cvt-table td {
  border: 1px solid rgb(212 212 212);
  padding: 4px 6px;
  vertical-align: middle;
}
html.${SCOPE_CLASS} .dark .cvt-table th,
html.${SCOPE_CLASS} .dark .cvt-table td,
html.dark.${SCOPE_CLASS} .cvt-table th,
html.dark.${SCOPE_CLASS} .cvt-table td {
  border-color: rgb(64 64 64);
}
html.${SCOPE_CLASS} .cvt-table th {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  background: rgb(245 245 245);
  color: rgb(38 38 38);
}
html.dark.${SCOPE_CLASS} .cvt-table th {
  background: rgb(38 38 38);
  color: white;
}
html.${SCOPE_CLASS} .cvt-cell-input {
  width: 100%;
  border: 0;
  border-radius: 0;
  padding: 2px 4px;
  font-size: 13px;
  color: inherit;
  outline: none;
}
html.${SCOPE_CLASS} .cvt-cell-input:focus {
  box-shadow: inset 0 0 0 1px var(--brand);
}
html.${SCOPE_CLASS} .cvt-calc {
  color: rgb(82 82 82);
}
html.dark.${SCOPE_CLASS} .cvt-calc {
  color: rgb(212 212 212);
}

@media print {
  html.${SCOPE_CLASS} body { background: white !important; }
  html.${SCOPE_CLASS} select,
  html.${SCOPE_CLASS} input,
  html.${SCOPE_CLASS} textarea {
    -webkit-appearance: none !important;
    -moz-appearance: none !important;
    appearance: none !important;
    background-image: none !important;
  }
  html.${SCOPE_CLASS} input::-webkit-outer-spin-button,
  html.${SCOPE_CLASS} input::-webkit-inner-spin-button {
    -webkit-appearance: none !important;
    margin: 0 !important;
  }
  html.${SCOPE_CLASS} .cvt-scroll { overflow: visible !important; }
  html.${SCOPE_CLASS} .cvt-table {
    min-width: 0 !important;
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    font-size: 7.5pt !important;
  }
  html.${SCOPE_CLASS} .cvt-table thead { display: table-header-group !important; }
  html.${SCOPE_CLASS} .cvt-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }
  html.${SCOPE_CLASS} .cvt-table th,
  html.${SCOPE_CLASS} .cvt-table td {
    border: 1px solid black !important;
    padding: 2px 3px !important;
    font-size: 7.5pt !important;
    color: black !important;
    background: white !important;
    overflow-wrap: anywhere !important;
  }
  html.${SCOPE_CLASS} .cvt-table th { background: rgb(240 240 240) !important; font-weight: 700 !important; }
  html.${SCOPE_CLASS} .cvt-badge {
    border: 0 !important;
    background: none !important;
    padding: 0 !important;
    font-size: 7.5pt !important;
  }
  html.${SCOPE_CLASS} .cvt-badge[data-verdict="PASS"] { color: rgb(21 128 61) !important; }
  html.${SCOPE_CLASS} .cvt-badge[data-verdict="FAIL"] { color: rgb(185 28 28) !important; }
  html.${SCOPE_CLASS} .cvt-badge[data-verdict="INCOMPLETE"] { color: rgb(82 82 82) !important; }
  html.${SCOPE_CLASS} .cvt-badge,
  html.${SCOPE_CLASS} .cvt-status-print {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html.${SCOPE_CLASS} .cvt-status-print {
    display: inline-block !important;
    margin-top: 4px !important;
    padding: 3px 10px !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    border-radius: 0 !important;
    color: white !important;
    background: rgb(34 197 94) !important;
  }
  html.${SCOPE_CLASS} .cvt-status-print[data-status="FAIL"] { background: rgb(239 68 68) !important; }
  html.${SCOPE_CLASS} .cvt-status-print[data-status="LIMITED SERVICE"] { background: rgb(234 179 8) !important; }
  html.${SCOPE_CLASS} .cvt-print-pairs {
    width: 100% !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
  }
  html.${SCOPE_CLASS} .cvt-print-pairs th,
  html.${SCOPE_CLASS} .cvt-print-pairs td {
    border: 1px solid black !important;
    padding: 2px 4px !important;
    font-size: 8pt !important;
    color: black !important;
    text-align: left !important;
    overflow-wrap: anywhere !important;
  }
  html.${SCOPE_CLASS} .cvt-print-pairs th {
    width: 11% !important;
    background: rgb(240 240 240) !important;
    font-weight: 700 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html.${SCOPE_CLASS} section { break-inside: avoid-page; }
}
`;

export default ContactorVtTestReport;
