import React, { useEffect, useState } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import NameplatePrintTable from "./common/NameplatePrintTable";
import { ReportHeader } from "./common/ReportHeader";
import {
  ReportJobInfoFields,
  ReportNameplateFields,
} from "./common/ReportAssetSections";
import SaveToAssetButton from "./SaveToAssetButton";
import { useReportAssetProfile } from "./useReportAssetProfile";
import { setReportAssetEquipmentLink } from "@/services/reportAssets";
import { setPath } from "@/lib/reportAssetProfiles";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useReportUserAutofill } from "./useReportUserAutofill";
import { ensureReportAssetLink } from "./linkReportAsset";
import { newReportId, reportIdFromUrl } from "./common/reportIdentity";
import {
  reportSaveFailed,
  reportSaveSucceeded,
} from "./common/autoSaveStatus";

// Dropdown options
const VISUAL_INSPECTION_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

const INSULATION_RESISTANCE_TEST_VOLTAGES = [
  "250V",
  "500V",
  "1000V",
  "2500V",
  "5000V",
];
const INSULATION_RESISTANCE_UNITS = ["kΩ", "MΩ", "GΩ"];
const CONTACT_RESISTANCE_UNITS = ["µΩ", "mΩ", "Ω"];
const DIELECTRIC_WITHSTAND_UNITS = ["mA", "µA", "nA"];

type StatusType = "PASS" | "FAIL" | "LIMITED SERVICE";

interface InsulationRow {
  busSection: string;
  ag: string;
  bg: string;
  cg: string;
  ab: string;
  bc: string;
  ca: string;
  an: string;
  bn: string;
  cn: string;
}
interface ContactRow {
  busSection: string;
  aPhase: string;
  bPhase: string;
  cPhase: string;
  neutral: string;
  ground: string;
}

interface FormData {
  // Job info
  customerName: string;
  customerLocation: string;
  userName: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
    humidity: number | null;
  };
  substation: string;
  eqptLocation: string;
  status: StatusType;

  // Nameplate
  nameplate: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    series: string;
    type: string;
    ratedVoltage: string;
    systemVoltage: string;
    ratedCurrent: string;
    aicRating: string;
    phaseConfiguration: string;
  };

  // Visual & Mechanical (7.1.1.A.x)
  visualInspectionItems: Array<{
    id: string;
    description: string;
    result: string;
    comments?: string;
  }>;

  // Electrical
  insulationMeasured: InsulationRow[];
  insulationUnit: string;
  insulationTestVoltage: string;
  tempCorrected: InsulationRow[];
  criteriaValue: string; // Table 100.1 criteria (e.g., ">= 25")
  criteriaUnits: string; // e.g., "MΩ"

  contactResistance: ContactRow[];
  contactUnit: string;
  contactEvaluation: {
    deviation: string;
    criteria: string;
    result: StatusType | "N/A";
  }[];
  contactNeutral: { criteria: string; result: StatusType | "N/A" };
  contactGround: { criteria: string; result: StatusType | "N/A" };


  // Equipment
  testEquipment: {
    megohmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
    lowResistanceOhmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
    hipot: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
  };
  comments: string;
}

// Simple TCF table (matches other reports) keyed by rounded °C
const TCF_TABLE: { [k: string]: number } = {
  "-24": 0.054,
  "-23": 0.068,
  "-22": 0.082,
  "-21": 0.096,
  "-20": 0.11,
  "-19": 0.124,
  "-18": 0.138,
  "-17": 0.152,
  "-16": 0.166,
  "-15": 0.18,
  "-14": 0.194,
  "-13": 0.208,
  "-12": 0.222,
  "-11": 0.236,
  "-10": 0.25,
  "-9": 0.264,
  "-8": 0.278,
  "-7": 0.292,
  "-6": 0.306,
  "-5": 0.32,
  "-4": 0.336,
  "-3": 0.352,
  "-2": 0.368,
  "-1": 0.384,
  "0": 0.4,
  "1": 0.42,
  "2": 0.44,
  "3": 0.46,
  "4": 0.48,
  "5": 0.5,
  "6": 0.526,
  "7": 0.552,
  "8": 0.578,
  "9": 0.604,
  "10": 0.63,
  "11": 0.666,
  "12": 0.702,
  "13": 0.738,
  "14": 0.774,
  "15": 0.81,
  "16": 0.848,
  "17": 0.886,
  "18": 0.924,
  "19": 0.962,
  "20": 1,
  "21": 1.05,
  "22": 1.1,
  "23": 1.15,
  "24": 1.2,
  "25": 1.25,
  "26": 1.316,
  "27": 1.382,
  "28": 1.448,
  "29": 1.514,
  "30": 1.58,
  "31": 1.664,
  "32": 1.748,
  "33": 1.832,
  "34": 1.872,
  "35": 2,
  "36": 2.1,
  "37": 2.2,
  "38": 2.3,
  "39": 2.4,
  "40": 2.5,
  "41": 2.628,
  "42": 2.756,
  "43": 2.884,
  "44": 3.012,
  "45": 3.15,
  "46": 3.316,
  "47": 3.482,
  "48": 3.648,
  "49": 3.814,
  "50": 3.98,
  "51": 4.184,
  "52": 4.388,
  "53": 4.592,
  "54": 4.796,
  "55": 5,
  "56": 5.26,
  "57": 5.52,
  "58": 5.78,
  "59": 6.04,
  "60": 6.3,
  "61": 6.62,
  "62": 6.94,
  "63": 7.26,
  "64": 7.58,
  "65": 7.9,
  "66": 8.32,
  "67": 8.74,
  "68": 9.16,
  "69": 9.58,
  "70": 10,
};

const getTCF = (celsius: number): number =>
  TCF_TABLE[Math.round(celsius).toString()] ?? 1;

const defaultBus = [
  "Section 1",
  "Section 2",
  "Section 3",
  "Section 4",
  "Section 5",
];

const SwitchgearSwitchboardMTS23Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const isPrintMode = searchParams.get("print") === "true";

  const reportSlug = "switchgear-switchboard-mts23";
  const reportName = getReportName(reportSlug);

  // Auto-save rewrites the URL with history.replaceState once it has created
  // the report, and react-router's params never see that. Fall back to the
  // address bar so a re-render or re-mount recognises the report already on
  // screen instead of creating another one.
  const openReportId = initialReportId ?? reportIdFromUrl();

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    openReportId,
  );
  const [loading, setLoading] = useState(true);
  const [justSaved, setJustSaved] = useState(false);

  // Centralized form change handler that resets justSaved
  const handleChange = (updater: (prev: FormData) => FormData) => {
    setJustSaved(false);
    setFormData(updater);
  };
  const [isEditing, setIsEditing] = useState(!openReportId);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(openReportId);
  /** A save is in flight; a second one must not start alongside it. */
  const savingRef = React.useRef(false);
  /** Something changed mid-save; run once more when the current save lands. */
  const saveAgainRef = React.useRef(false);
  /** The asset row + job link have been confirmed for this report. */
  const assetLinkedRef = React.useRef(false);
  /** An existing report failed to load; the form on screen is not its data. */
  const loadFailedRef = React.useRef(false);

  const [formData, setFormData] = useState<FormData>({
    customerName: "",
    customerLocation: "",
    userName: "",
    date: new Date().toISOString().split("T")[0],
    identifier: "",
    jobNumber: "",
    technicians: "",
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: null },
    substation: "",
    eqptLocation: "",
    status: "PASS",
    nameplate: {
      manufacturer: "",
      catalogNumber: "",
      serialNumber: "",
      series: "",
      type: "",
      ratedVoltage: "",
      systemVoltage: "",
      ratedCurrent: "",
      aicRating: "",
      phaseConfiguration: "",
    },
    visualInspectionItems: [
      {
        id: "7.1.A.1",
        description:
          "Inspect physical, electrical, and mechanical condition.",
        result: "Select One",
      },
      {
        id: "7.1.A.2",
        description:
          "Inspect anchorage, alignment, grounding, and required area clearances.",
        result: "Select One",
      },
      {
        id: "7.1.A.3",
        description:
          "*Prior to cleaning the unit, perform as-found tests.",
        result: "Select One",
      },
      {
        id: "7.1.A.4",
        description:
          "Clean the unit.",
        result: "Select One",
      },
      {
        id: "7.1.A.5",
        description:
          "Verify that fuse and/or circuit breaker sizes and types correspond to drawings and coordination study as well as to the circuit breaker address for microprocessor communication packages.",
        result: "Select One",
      },
      {
        id: "7.1.A.6",
        description:
          "Verify that current and voltage transformer ratios correspond to drawings.",
        result: "Select One",
      },
      {
        id: "7.1.A.7",
        description:
          "Verify that wiring connections are tight and that wiring is secure to prevent damage during routine operation of moving parts.",
        result: "Select One",
      },
      {
        id: "7.1.A.8.1",
        description:
          "Inspect bolted electrical connections for high resistance using a low-resistance ohmmeter in accordance with Section 7.1.B.1.",
        result: "Select One",
      },
      {
        id: "7.1.A.9",
        description:
          "Confirm correct operation and sequencing of electrical and mechanical interlock systems.",
        result: "Select One",
      },
      {
        id: "7.1.A.10",
        description:
          "Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.",
        result: "Select One",
      },
      {
        id: "7.1.A.11",
        description:
          "Inspect insulators for evidence of physical damage or contaminated surfaces.",
        result: "Select One",
      },
      {
        id: "7.1.A.12",
        description:
          "Verify correct barrier and shutter installation and operation.",
        result: "Select One",
      },
      {
        id: "7.1.A.13",
        description:
          "Exercise all active components.",
        result: "Select One",
      },
      {
        id: "7.1.A.14",
        description:
          "Inspect mechanical indicating devices for correct operation.",
        result: "Select One",
      },
    ],
    insulationMeasured: defaultBus.map((b) => ({
      busSection: b,
      ag: "",
      bg: "",
      cg: "",
      ab: "",
      bc: "",
      ca: "",
      an: "",
      bn: "",
      cn: "",
    })),
    insulationUnit: "MΩ",
    insulationTestVoltage: "1000V",
    tempCorrected: defaultBus.map((b) => ({
      busSection: b,
      ag: "",
      bg: "",
      cg: "",
      ab: "",
      bc: "",
      ca: "",
      an: "",
      bn: "",
      cn: "",
    })),
    criteriaValue: "≥ 25",
    criteriaUnits: "MΩ",
    contactResistance: [
      "Section 1",
      "Section 2",
      "Section 3",
      "Section 4",
      "Section 5",
    ].map((b) => ({
      busSection: b,
      aPhase: "",
      bPhase: "",
      cPhase: "",
      neutral: "",
      ground: "",
    })),
    contactUnit: "µΩ",
    contactEvaluation: defaultBus.map(() => ({
      deviation: "N/A",
      criteria: "<50%",
      result: "N/A",
    })),
    contactNeutral: { criteria: "N/A", result: "N/A" },
    contactGround: { criteria: "N/A", result: "N/A" },
    testEquipment: {
      megohmmeter: { name: "", serialNumber: "", ampId: "", calDate: "" },
      lowResistanceOhmmeter: {
        name: "",
        serialNumber: "",
        ampId: "",
        calDate: "",
      },
      hipot: { name: "", serialNumber: "", ampId: "", calDate: "" },
    },
    comments: "",
  });

  // Autofill the "User" header field with the signed-in employee's name (new reports only).
  useReportUserAutofill(setFormData, initialReportId, "userName");

  // Load job info
  const loadJobInfo = async () => {
    if (!jobId) return;
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("job_number, customer_id, site_address")
        .eq("id", jobId)
        .single();
      if (jobError) throw jobError;
      let customerName = "";
      let customerAddress = (jobData as any)?.site_address || "";
      if (jobData?.customer_id) {
        const { data: customer, error: custErr } = await supabase
          .schema("common")
          .from("customers")
          .select("name, company_name, address")
          .eq("id", jobData.customer_id)
          .single();
        if (!custErr && customer) {
          customerName = customer.company_name || customer.name || "";
          if (!customerAddress) customerAddress = customer.address || "";
        }
      }
      setFormData((prev) => ({
        ...prev,
        jobNumber: jobData?.job_number || "",
        customerName: maskCustomerName(customerName),
        customerLocation: prev.customerLocation || maskCustomerAddress(customerAddress),
      }));
    } catch (e) {
      /* noop */
    }
  };

  // Load existing report (reuse switchgear_reports table to avoid new migrations)
  const loadReport = async () => {
    if (!currentReportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    // Don't reload if we just created the report via autosave
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("switchgear_switchboard_mts23_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();
      if (error) throw error;
      if (data) {
        // One jsonb blob: the form's own shape, so a sheet change needs no migration.
        const reportData = (data.report_data || {}) as Partial<FormData>;
        setFormData((prev) => ({
          ...prev,
          ...reportData,
          customerName: reportData.customerName || prev.customerName,
          customerLocation: reportData.customerLocation || prev.customerLocation,
          nameplate: { ...prev.nameplate, ...(reportData.nameplate || {}) },
          temperature: { ...prev.temperature, ...(reportData.temperature || {}) },
          visualInspectionItems: reportData.visualInspectionItems?.length
            ? reportData.visualInspectionItems
            : prev.visualInspectionItems,
          insulationMeasured: reportData.insulationMeasured?.length
            ? reportData.insulationMeasured
            : prev.insulationMeasured,
          tempCorrected: reportData.tempCorrected?.length
            ? reportData.tempCorrected
            : prev.tempCorrected,
          contactResistance: reportData.contactResistance?.length
            ? reportData.contactResistance
            : prev.contactResistance,
          testEquipment: { ...prev.testEquipment, ...(reportData.testEquipment || {}) },
        }));
        setIsEditing(false);
      }
      loadFailedRef.current = false;
    } catch (e) {
      // The form is showing defaults, not this report. Auto-save must not push
      // those defaults over the readings that are still in the database.
      loadFailedRef.current = true;
      reportSaveFailed(
        new Error(
          "This report could not be loaded, so it is not being saved. Reload the page before entering results.",
        ),
      );
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, currentReportId]);

  // Keep document title in sync so PDF filename includes identifier
  useEffect(() => {
    const prev = document.title;
    const title = getAssetName(
      reportSlug,
      formData.identifier || formData.eqptLocation || "",
    );
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [formData.identifier, formData.eqptLocation]);

  // Temperature conversions and correction
  const handleF = (f: number) => {
    setJustSaved(false);
    const c = Math.round(((f - 32) * 5) / 9);
    const tcf = getTCF(c);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit: f, celsius: c, tcf },
    }));
  };
  const handleC = (c: number) => {
    setJustSaved(false);
    const f = Math.round((c * 9) / 5 + 32);
    const tcf = getTCF(c);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, celsius: c, fahrenheit: f, tcf },
    }));
  };

  useEffect(() => {
    const tcf = formData.temperature.tcf || 1;
    setFormData((prev) => ({
      ...prev,
      tempCorrected: prev.insulationMeasured.map((row) => {
        const out: InsulationRow = { ...row };
        (
          [
            "ag",
            "bg",
            "cg",
            "ab",
            "bc",
            "ca",
            "an",
            "bn",
            "cn",
          ] as (keyof InsulationRow)[]
        ).forEach((k) => {
          const v = String(row[k] || "").trim();
          if (!v || v.toLowerCase() === "n/a") {
            (out as any)[k] = v || "N/A";
          } else {
            // Handle prefixed values like ">2200", "≥2200", ">=2200", or "<100"
            const prefixMatch = v.match(/^([><]=?|≥|≤)\s*(.+)$/);
            const prefix = prefixMatch ? prefixMatch[1] : "";
            const numStr = prefixMatch ? prefixMatch[2] : v;
            const n = parseFloat(numStr);
            if (isFinite(n)) {
              const corrected = n * tcf;
              const formatted =
                corrected % 1 === 0
                  ? corrected.toString()
                  : corrected.toFixed(2);
              (out as any)[k] = prefix ? `${prefix}${formatted}` : formatted;
            } else {
              (out as any)[k] = "N/A";
            }
          }
        });
        return out;
      }),
    }));
  }, [formData.temperature.tcf, JSON.stringify(formData.insulationMeasured)]);

  const fillNA = () => {
    setFormData((prev) => ({
      ...prev,
      insulationMeasured: prev.insulationMeasured.map((r) => ({
        ...r,
        ag: r.ag?.trim() ? r.ag : "N/A",
        bg: r.bg?.trim() ? r.bg : "N/A",
        cg: r.cg?.trim() ? r.cg : "N/A",
        ab: r.ab?.trim() ? r.ab : "N/A",
        bc: r.bc?.trim() ? r.bc : "N/A",
        ca: r.ca?.trim() ? r.ca : "N/A",
        an: r.an?.trim() ? r.an : "N/A",
        bn: r.bn?.trim() ? r.bn : "N/A",
        cn: r.cn?.trim() ? r.cn : "N/A",
      })),
    }));
  };

  // Contact Resistance: compute deviation per row and auto-evaluate against criteria
  const computeDeviation = (a: string, b: string, c: string): string => {
    const nums = [a, b, c]
      .map((v) => parseFloat(String(v).trim()))
      .filter((n) => !isNaN(n) && isFinite(n));
    if (nums.length < 2) return "N/A";
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (min === 0) return "N/A";
    const dev = ((max - min) / min) * 100;
    return `${dev.toFixed(2)}%`;
  };

  const parseCriteriaPercent = (c: string): number | null => {
    if (!c) return null;
    const m = c.match(/(\d+(?:\.\d+)?)%/);
    return m ? parseFloat(m[1]) : null;
  };

  useEffect(() => {
    setFormData((prev) => {
      const updated = prev.contactResistance.map((r, idx) => {
        const deviation = computeDeviation(r.aPhase, r.bPhase, r.cPhase);
        const criteria = prev.contactEvaluation[idx]?.criteria || "<50%";
        const threshold = parseCriteriaPercent(criteria);
        let result: StatusType | "N/A" = "N/A";
        if (deviation !== "N/A" && threshold !== null) {
          const v = parseFloat(deviation.replace("%", ""));
          result = v <= threshold ? "PASS" : "FAIL";
        }
        return { deviation, criteria, result };
      });
      // Ensure contactEvaluation array matches contactResistance length
      while (updated.length < prev.contactResistance.length) {
        updated.push({ deviation: "N/A", criteria: "<50%", result: "N/A" });
      }
      return { ...prev, contactEvaluation: updated };
    });
  }, [JSON.stringify(formData.contactResistance)]);

  // Add row functions
  const addContactResistanceRow = () => {
    setFormData((prev) => {
      const newIndex = prev.contactResistance.length + 1;
      const newRow: ContactRow = {
        busSection: `Section ${newIndex}`,
        aPhase: "",
        bPhase: "",
        cPhase: "",
        neutral: "",
        ground: "",
      };
      return {
        ...prev,
        contactResistance: [...prev.contactResistance, newRow],
        contactEvaluation: [
          ...prev.contactEvaluation,
          { deviation: "N/A", criteria: "<50%", result: "N/A" },
        ],
      };
    });
  };

  const removeContactResistanceRow = (index: number) => {
    if (formData.contactResistance.length <= 1) {
      alert("At least one row is required.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to remove this row? Any data in this row will be deleted.",
    );
    if (!confirmed) return;
    setFormData((prev) => ({
      ...prev,
      contactResistance: prev.contactResistance.filter((_, i) => i !== index),
      contactEvaluation: prev.contactEvaluation.filter((_, i) => i !== index),
    }));
  };


  const addInsulationResistanceRow = () => {
    setFormData((prev) => {
      const newIndex = prev.insulationMeasured.length + 1;
      const newRow: InsulationRow = {
        busSection: `Section ${newIndex}`,
        ag: "",
        bg: "",
        cg: "",
        ab: "",
        bc: "",
        ca: "",
        an: "",
        bn: "",
        cn: "",
      };
      return {
        ...prev,
        insulationMeasured: [...prev.insulationMeasured, newRow],
        tempCorrected: [...prev.tempCorrected, { ...newRow }],
      };
    });
  };

  const removeInsulationResistanceRow = (index: number) => {
    if (formData.insulationMeasured.length <= 1) {
      alert("At least one row is required.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to remove this row? Any data in this row will be deleted.",
    );
    if (!confirmed) return;
    setFormData((prev) => ({
      ...prev,
      insulationMeasured: prev.insulationMeasured.filter((_, i) => i !== index),
      tempCorrected: prev.tempCorrected.filter((_, i) => i !== index),
    }));
  };

  // Compute Neutral/Ground deviation across all rows (ignore 0/non-numeric)
  const computeColumnDeviation = (key: "neutral" | "ground"): string => {
    const values = formData.contactResistance
      .map((r) => parseFloat(String((r as any)[key] ?? "").trim()))
      .filter((n) => !isNaN(n) && isFinite(n) && n > 0);
    if (values.length < 2) return "N/A";
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === 0) return "N/A";
    const dev = (max / min - 1) * 100;
    return `${dev.toFixed(2)}%`;
  };

  const neutralDeviation = computeColumnDeviation("neutral");
  const groundDeviation = computeColumnDeviation("ground");

  // Auto-evaluate Neutral/Ground based on criteria
  useEffect(() => {
    setFormData((prev) => {
      const nCrit = prev.contactNeutral.criteria || "N/A";
      const gCrit = prev.contactGround.criteria || "N/A";
      const nd = neutralDeviation;
      const gd = groundDeviation;
      let nRes: StatusType | "N/A" = prev.contactNeutral.result;
      let gRes: StatusType | "N/A" = prev.contactGround.result;
      const nThr = parseCriteriaPercent(nCrit);
      const gThr = parseCriteriaPercent(gCrit);
      if (nd !== "N/A" && nThr !== null) {
        const v = parseFloat(nd.replace("%", ""));
        nRes = v <= nThr ? "PASS" : "FAIL";
      }
      if (gd !== "N/A" && gThr !== null) {
        const v = parseFloat(gd.replace("%", ""));
        gRes = v <= gThr ? "PASS" : "FAIL";
      }
      if (
        nRes === prev.contactNeutral.result &&
        gRes === prev.contactGround.result
      )
        return prev;
      return {
        ...prev,
        contactNeutral: { ...prev.contactNeutral, result: nRes },
        contactGround: { ...prev.contactGround, result: gRes },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    neutralDeviation,
    groundDeviation,
    formData.contactNeutral.criteria,
    formData.contactGround.criteria,
  ]);

  // Table 100.1 Criteria auto-calculation based on test voltage and unit (MΩ/GΩ)
  const computeCriteriaFromVoltage = (
    volts: number,
    unit: string,
  ): number | null => {
    if (!Number.isFinite(volts) || !unit) return null;
    const isGiga = unit === "GΩ";
    // Map ranges to base MΩ values, then convert if needed
    let base: number | null = null; // in MΩ
    if (volts <= 250) base = 25;
    else if (volts <= 1000) base = 100;
    else if (volts <= 2500) base = 500;
    else if (volts <= 5000) base = 1500;
    else if (volts <= 8000) base = 2500;
    else if (volts <= 15000) base = 5000;
    else if (volts <= 25000) base = 10000;
    else base = 100000;
    if (base === null) return null;
    return isGiga ? base / 1000 : base; // convert MΩ→GΩ if needed
  };

  useEffect(() => {
    // Use Nameplate Rated Voltage dropdown as the source of truth
    const vStr = formData.nameplate?.ratedVoltage || "";
    const v = parseInt(String(vStr).replace(/[^0-9]/g, ""), 10);
    const units = formData.insulationUnit; // keep using selected units (MΩ/GΩ)
    const val = computeCriteriaFromVoltage(v, units);
    if (val !== null) {
      const formatted = Number.isFinite(val)
        ? val % 1 === 0
          ? val.toString()
          : val.toString()
        : "";
      const next = `≥ ${formatted}`;
      if (formData.criteriaValue !== next || formData.criteriaUnits !== units) {
        setFormData((prev) => ({
          ...prev,
          criteriaValue: next,
          criteriaUnits: units,
        }));
      }
    }
  }, [formData.nameplate.ratedVoltage, formData.insulationUnit]);

  // Auto-save function
  // Saves must send what is on screen *now*, not what was on screen when the
  // save was queued. A queued save carrying an older snapshot used to land after
  // a newer one and put a half-typed equipment name back on the report.
  const formDataRef = React.useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Opened from an asset: start from its identity and nameplate, and link the report to it
  // on first save.
  const {
    profile: assetProfile,
    equipmentAssetIdRef,
    linkedAsset,
    setLinkedAsset,
  } = useReportAssetProfile<FormData>(reportSlug, openReportId, setFormData);

  /**
   * Writes the report and returns its id. Every save -- auto-save and the Save
   * button -- goes through here, and they all write to one row.
   *
   * The row's id is decided *before* the request leaves the browser and kept in
   * `reportIdRef`, so a save that starts while another is still in flight, or
   * one retried after a failure, upserts over the same row. This used to be an
   * insert guarded by a "am I already creating?" flag, and every way that flag
   * could be lost -- a failed request, a re-mount, a stale closure -- put
   * another copy of the same assembly on the job.
   */
  const persistReport = React.useCallback(async () => {
    if (!jobId || !user?.id) return undefined;
    if (loadFailedRef.current) {
      throw new Error(
        "This report could not be loaded, so it was not saved. Reload the page and try again.",
      );
    }

    const formData = formDataRef.current;
    const isNewReport = !reportIdRef.current;
    if (isNewReport) {
      // Claimed synchronously: nothing else can now decide to create a row.
      reportIdRef.current = newReportId();
    }
    const reportId = reportIdRef.current as string;

    const { error } = await supabase
      .schema("neta_ops")
      .from("switchgear_switchboard_mts23_reports")
      .upsert(
        {
          id: reportId,
          job_id: jobId,
          user_id: user.id,
          // Comments ride along inside the blob; the table has no separate column.
          report_data: {
            ...formData,
            customerName: maskCustomerName(formData.customerName),
            customerLocation: maskCustomerAddress(formData.customerLocation),
          },
        },
        { onConflict: "id" },
      );
    if (error) throw error;

    if (!assetLinkedRef.current) {
      const reportAssetId = await ensureReportAssetLink(
        jobId,
        {
          name: getAssetName(
            reportSlug,
            formData.identifier ||
              formData.eqptLocation ||
              "",
          ),
          file_url: `report:/jobs/${jobId}/${reportSlug}/${reportId}`,
          user_id: user.id,
        },
        user.id,
      );
      if (equipmentAssetIdRef.current) {
        await setReportAssetEquipmentLink(reportAssetId, equipmentAssetIdRef.current);
      }
      assetLinkedRef.current = true;
    }

    if (isNewReport) {
      setCurrentReportId(reportId);
      isAutoSaveCreatedRef.current = true;
      window.history.replaceState(
        {},
        "",
        `/jobs/${jobId}/${reportSlug}/${reportId}`,
      );
    }

    return reportId;
  }, [jobId, user?.id, maskCustomerName, maskCustomerAddress, reportSlug]);

  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    // One save at a time. Anything typed while this one is in flight is picked
    // up by the follow-up pass below, which reads the form fresh.
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

  // Auto-save effect with debounce (placed after autoSave function definition)
  useEffect(() => {
    if (!isEditing || loading) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500); // 500ms debounce

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, isEditing, loading, autoSave]);

  // Save
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    const wasExistingReport = Boolean(reportIdRef.current);

    try {
      setIsSaving(true);
      const savedId = await persistReport();
      reportSaveSucceeded();
      setJustSaved(true);

      if (!wasExistingReport && savedId) {
        setIsEditing(false);
        navigate(`/jobs/${jobId}/${reportSlug}/${savedId}`, { replace: true });
      }
    } catch (e: any) {
      reportSaveFailed(e);
      console.error("Save error", e);
      alert(`Failed to save report: ${e?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportIdRef.current) {
      setIsEditing(false);
    }
  };

  // Print/util styles (reuse standard)
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@media print { body { margin:0; padding:20px; font-family: Arial, Helvetica, sans-serif !important; } html, body { font-size:9px !important; color:black !important; background:white !important; line-height:1 !important; } header, nav, .navigation, [class*="nav"], [class*="header"], .print\\:hidden { display:none !important; } * { border:none !important; box-shadow:none !important; outline:none !important; } table { border-collapse:collapse !important; width:100% !important; margin:1px 0 !important; font-size:8px !important; } thead { display:table-header-group !important; } tr { page-break-inside: avoid !important; break-inside: avoid !important; } table, th, td, thead, tbody, tr { border:1px solid black !important; } th, td { padding:2px 3px !important; text-align:center !important; height:12px !important; line-height:1 !important; } th { background:#f0f0f0 !important; font-weight:bold !important; } input, select, textarea { background:white !important; border:1px solid black !important; color:black !important; padding:2px !important; font-size:10px !important; -webkit-appearance:none !important; appearance:none !important; } select { background-image:none !important; padding-right:8px !important; } input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none !important; margin:0 !important; } input[type="number"] { -moz-appearance:textfield !important; } button:not(.print-visible) { display:none !important; } section { break-inside: avoid !important; margin-bottom:20px !important; } * { color:black !important; } table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; } table.visual-mechanical-table th:first-child, table.visual-mechanical-table td:first-child { width:12% !important; text-align:left !important; } table.visual-mechanical-table th:nth-child(2), table.visual-mechanical-table td:nth-child(2) { width:58% !important; text-align:left !important; } table.visual-mechanical-table th:nth-child(3), table.visual-mechanical-table td:nth-child(3) { width:15% !important; text-align:center !important; } table.visual-mechanical-table th:nth-child(4), table.visual-mechanical-table td:nth-child(4) { width:15% !important; text-align:center !important; } }`;
    // Tagged so custom-form pages can switch this sheet off; it is global and never removed.
    style.setAttribute("data-report-print", "");
    document.head.appendChild(style);
    return () => {
      try {
        document.head.removeChild(style);
      } catch {
        /* ignore */
      }
    };
  }, []);

  if (loading && currentReportId)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right" style={{ minWidth: 150 }}>
          <div className="font-extrabold text-xl" style={{ color: "#1a4e7c" }}>
            NETA - ATS 7.1.1
          </div>
          <div
            className={`mt-1 inline-block pass-fail-status-box ${getPassFailBadgeClass(formData.status)}`}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 800,
              textAlign: "center",
              borderRadius: "6px",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
              minWidth: 60,
            }}
          >
            {formData.status}
          </div>
        </div>
      </div>
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          <ReportHeader
            extraActions={
              <SaveToAssetButton
                asset={linkedAsset}
                userId={user?.id}
                profile={assetProfile}
                form={formData}
                onSaved={setLinkedAsset}
              />
            }
            title={reportName}
            isAutoSaving={isAutoSaving}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={isSaving}
            status={formData.status}
            hasReport={!!currentReportId}
            onStatusToggle={() => {
              if (isEditing) {
                setFormData((prev) => ({
                  ...prev,
                  status:
                    prev.status === "PASS"
                      ? "FAIL"
                      : prev.status === "FAIL"
                        ? "LIMITED SERVICE"
                        : "PASS",
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
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <ReportJobInfoFields
              profile={assetProfile}
              values={formData}
              onChange={(path, value) => handleChange((p) => setPath(p, path, value))}
              isEditing={isEditing}
              displayValues={{
                customerName: maskCustomerName(formData.customerName),
              }}
              onFahrenheitChange={(e) => handleF(parseFloat(e.target.value))}
            />
            <JobInfoPrintTable
              data={{
                customer: maskCustomerName(formData.customerName),
                address: maskCustomerAddress(formData.customerLocation),
                jobNumber: formData.jobNumber,
                technicians: formData.technicians,
                date: formData.date,
                identifier: formData.identifier,
                user: formData.userName,
                substation: formData.substation,
                eqptLocation: formData.eqptLocation,
                temperature: {
                  fahrenheit: formData.temperature.fahrenheit,
                  celsius: formData.temperature.celsius,
                  tcf: formData.temperature.tcf,
                  humidity: formData.temperature.humidity ?? undefined,
                },
              }}
            />
          </div>

          {/* Nameplate */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Nameplate Data
            </h2>
            <ReportNameplateFields
              profile={assetProfile}
              values={formData}
              onChange={(path, value) => handleChange((p) => setPath(p, path, value))}
              isEditing={isEditing}
            />
            <NameplatePrintTable
              data={{
                manufacturer: formData.nameplate.manufacturer,
                catalogNumber: formData.nameplate.catalogNumber,
                serialNumber: formData.nameplate.serialNumber,
                type: formData.nameplate.type,
                systemVoltage: formData.nameplate.systemVoltage,
                ratedVoltage: formData.nameplate.ratedVoltage,
                ratedCurrent: formData.nameplate.ratedCurrent,
                phaseConfiguration: formData.nameplate.phaseConfiguration,
                aicRating: formData.nameplate.aicRating,
                series: formData.nameplate.series,
              }}
              mode="5x2"
            />
          </div>

          {/* Visual & Mechanical Inspection */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "63%" }} />
                  <col style={{ width: "26%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      NETA Section
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.visualInspectionItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                        {item.id}
                      </td>
                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white whitespace-normal break-words">
                        {item.description}
                      </td>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={item.result}
                            onChange={(e) => {
                              const list = [...formData.visualInspectionItems];
                              list[idx].result = e.target.value;
                              handleChange((p) => ({
                                ...p,
                                visualInspectionItems: list,
                              }));
                            }}
                            disabled={!isEditing}
                            className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {VISUAL_INSPECTION_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {item.result}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Electrical - Contact Resistance */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
                Electrical - Contact Resistance Tests
              </h2>
              {isEditing && (
                <button
                  onClick={addContactResistanceRow}
                  className="px-3 py-1 text-sm text-white bg-green-600 hover:bg-green-700 rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 print:hidden"
                  type="button"
                >
                  + Add Row
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              {/* Measured table */}
              <table className="min-w-[720px] divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "17.6%" }} />
                  <col style={{ width: "17.6%" }} />
                  <col style={{ width: "17.6%" }} />
                  <col style={{ width: "17.6%" }} />
                  <col style={{ width: "17.6%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Bus Section
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      A-Phase
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      B-Phase
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      C-Phase
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Neutral
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Ground
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.contactResistance.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="print:hidden flex items-center gap-1">
                          <input
                            value={row.busSection}
                            onChange={(e) => {
                              const list = [...formData.contactResistance];
                              list[i] = {
                                ...list[i],
                                busSection: e.target.value,
                              };
                              handleChange((p) => ({
                                ...p,
                                contactResistance: list,
                              }));
                            }}
                            readOnly={!isEditing}
                            className={`block flex-1 rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                          {isEditing &&
                            formData.contactResistance.length > 1 && (
                              <button
                                onClick={() => removeContactResistanceRow(i)}
                                className="px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                type="button"
                                title="Remove row"
                              >
                                ×
                              </button>
                            )}
                        </div>
                        <div className="hidden print:block text-center">
                          {row.busSection}
                        </div>
                      </td>
                      {(
                        [
                          "aPhase",
                          "bPhase",
                          "cPhase",
                          "neutral",
                          "ground",
                        ] as const
                      ).map((key) => (
                        <td key={key} className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              value={row[key]}
                              onChange={(e) => {
                                const list = [...formData.contactResistance];
                                list[i] = { ...list[i], [key]: e.target.value };
                                handleChange((p) => ({
                                  ...p,
                                  contactResistance: list,
                                }));
                              }}
                              readOnly={!isEditing}
                              className={`block w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {row[key]}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={formData.contactUnit}
                            onChange={(e) =>
                              handleChange((p) => ({
                                ...p,
                                contactUnit: e.target.value,
                              }))
                            }
                            disabled={!isEditing}
                            className={`block w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {CONTACT_RESISTANCE_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.contactUnit}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Side-by-side evaluation and neutral/ground tables with table styling */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start max-w-[100%]">
                {/* Phases evaluation table */}
                <div className="w-full">
                  <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
                    <colgroup>
                      <col style={{ width: "40%" }} />
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "30%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-700 dark:text-white">
                          Value Deviation
                        </th>
                        <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white">
                          Criteria
                        </th>
                        <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white">
                          Results
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.contactEvaluation.map((ev, idx) => (
                        <tr
                          key={idx}
                          className="border-t border-neutral-200 dark:border-neutral-700"
                        >
                          <td className="px-3 py-2">Phase: {ev.deviation}</td>
                          <td className="px-3 py-2">
                            <div className="print:hidden">
                              <select
                                value={ev.criteria}
                                onChange={(e) => {
                                  const list = [...formData.contactEvaluation];
                                  list[idx] = {
                                    ...list[idx],
                                    criteria: e.target.value,
                                  };
                                  handleChange((p) => ({
                                    ...p,
                                    contactEvaluation: list,
                                  }));
                                }}
                                disabled={!isEditing}
                                className={`w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                              >
                                {["<10%", "<25%", "<50%", "<75%", "<100%"].map(
                                  (c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                            <div className="hidden print:block text-center">
                              {ev.criteria}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="print:hidden">
                              <select
                                value={ev.result}
                                onChange={(e) => {
                                  const list = [...formData.contactEvaluation];
                                  list[idx] = {
                                    ...list[idx],
                                    result: e.target.value as any,
                                  };
                                  handleChange((p) => ({
                                    ...p,
                                    contactEvaluation: list,
                                  }));
                                }}
                                disabled={!isEditing}
                                className={`w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                              >
                                {(
                                  [
                                    "PASS",
                                    "FAIL",
                                    "LIMITED SERVICE",
                                    "N/A",
                                  ] as const
                                ).map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="hidden print:block text-center">
                              {ev.result}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Neutral/Ground evaluation table */}
                <div className="w-full">
                  <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
                    <colgroup>
                      <col style={{ width: "40%" }} />
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "30%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-700 dark:text-white">
                          Value Deviation
                        </th>
                        <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white">
                          Criteria
                        </th>
                        <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white">
                          Results
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["Neutral", "Ground"] as const).map((label, i) => (
                        <tr
                          key={label}
                          className="border-t border-neutral-200 dark:border-neutral-700"
                        >
                          <td className="px-3 py-2">
                            {label} :{" "}
                            {i === 0 ? neutralDeviation : groundDeviation}
                          </td>
                          <td className="px-3 py-2">
                            <div className="print:hidden">
                              <select
                                value={
                                  i === 0
                                    ? formData.contactNeutral.criteria
                                    : formData.contactGround.criteria
                                }
                                onChange={(e) =>
                                  handleChange((p) =>
                                    i === 0
                                      ? {
                                          ...p,
                                          contactNeutral: {
                                            ...p.contactNeutral,
                                            criteria: e.target.value,
                                          },
                                        }
                                      : {
                                          ...p,
                                          contactGround: {
                                            ...p.contactGround,
                                            criteria: e.target.value,
                                          },
                                        },
                                  )
                                }
                                disabled={!isEditing}
                                className={`w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                              >
                                {[
                                  "N/A",
                                  "<10%",
                                  "<25%",
                                  "<50%",
                                  "<75%",
                                  "<100%",
                                ].map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="hidden print:block text-center">
                              {i === 0
                                ? formData.contactNeutral.criteria
                                : formData.contactGround.criteria}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="print:hidden">
                              <select
                                value={
                                  i === 0
                                    ? formData.contactNeutral.result
                                    : formData.contactGround.result
                                }
                                onChange={(e) =>
                                  handleChange((p) =>
                                    i === 0
                                      ? {
                                          ...p,
                                          contactNeutral: {
                                            ...p.contactNeutral,
                                            result: e.target.value as any,
                                          },
                                        }
                                      : {
                                          ...p,
                                          contactGround: {
                                            ...p.contactGround,
                                            result: e.target.value as any,
                                          },
                                        },
                                  )
                                }
                                disabled={!isEditing}
                                className={`w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                              >
                                {(
                                  [
                                    "N/A",
                                    "PASS",
                                    "FAIL",
                                    "LIMITED SERVICE",
                                  ] as const
                                ).map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="hidden print:block text-center">
                              {i === 0
                                ? formData.contactNeutral.result
                                : formData.contactGround.result}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Electrical - Insulation Resistance Tests */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
                Electrical - Insulation Resistance Tests
              </h2>
              {isEditing && (
                <button
                  onClick={addInsulationResistanceRow}
                  className="px-3 py-1 text-sm text-white bg-green-600 hover:bg-green-700 rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 print:hidden"
                  type="button"
                >
                  + Add Row
                </button>
              )}
            </div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">Insulation Temperature (°F):</span>
                <input
                  type="number"
                  value={formData.temperature.fahrenheit}
                  onChange={(e) => handleF(parseFloat(e.target.value))}
                  readOnly={!isEditing}
                  className={`form-input w-24 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
                <span className="ml-3">Temp. Correction Factor:</span>
                <span className="font-semibold">
                  {formData.temperature.tcf}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Test Voltage:</span>
                <select
                  value={formData.insulationTestVoltage}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      insulationTestVoltage: e.target.value,
                    }))
                  }
                  disabled={!isEditing}
                  className={`form-select ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                >
                  {INSULATION_RESISTANCE_TEST_VOLTAGES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed">
                <colgroup>
                  <col style={{ width: "10%" }} />
                  {Array.from({ length: 9 }).map((_, i) => (
                    <col key={i} style={{ width: "9%" }} />
                  ))}
                  <col style={{ width: "9%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Bus Section
                    </th>
                    {[
                      "A-G",
                      "B-G",
                      "C-G",
                      "A-B",
                      "B-C",
                      "C-A",
                      "A-N",
                      "B-N",
                      "C-N",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.insulationMeasured.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="print:hidden flex items-center gap-1">
                          <input
                            value={row.busSection}
                            onChange={(e) => {
                              const list = [...formData.insulationMeasured];
                              list[i] = {
                                ...list[i],
                                busSection: e.target.value,
                              };
                              const correctedList = [...formData.tempCorrected];
                              correctedList[i] = {
                                ...correctedList[i],
                                busSection: e.target.value,
                              };
                              handleChange((p) => ({
                                ...p,
                                insulationMeasured: list,
                                tempCorrected: correctedList,
                              }));
                            }}
                            readOnly={!isEditing}
                            className={`block flex-1 rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                          {isEditing &&
                            formData.insulationMeasured.length > 1 && (
                              <button
                                onClick={() => removeInsulationResistanceRow(i)}
                                className="px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                type="button"
                                title="Remove row"
                              >
                                ×
                              </button>
                            )}
                        </div>
                        <div className="hidden print:block text-center">
                          {row.busSection}
                        </div>
                      </td>
                      {(
                        [
                          "ag",
                          "bg",
                          "cg",
                          "ab",
                          "bc",
                          "ca",
                          "an",
                          "bn",
                          "cn",
                        ] as const
                      ).map((k) => (
                        <td key={k} className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              value={row[k]}
                              onChange={(e) => {
                                const list = [...formData.insulationMeasured];
                                (list[i] as any)[k] = e.target.value;
                                handleChange((p) => ({
                                  ...p,
                                  insulationMeasured: list,
                                }));
                              }}
                              readOnly={!isEditing}
                              className={`block w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {row[k]}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={formData.insulationUnit}
                            onChange={(e) =>
                              handleChange((p) => ({
                                ...p,
                                insulationUnit: e.target.value,
                              }))
                            }
                            disabled={!isEditing}
                            className={`block w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {INSULATION_RESISTANCE_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.insulationUnit}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Temperature Corrected Values */}
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
                Temperature Corrected Values
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed">
                  <colgroup>
                    <col style={{ width: "10%" }} />
                    {Array.from({ length: 9 }).map((_, i) => (
                      <col key={i} style={{ width: "9%" }} />
                    ))}
                    <col style={{ width: "9%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                        Bus Section
                      </th>
                      {[
                        "A-G",
                        "B-G",
                        "C-G",
                        "A-B",
                        "B-C",
                        "C-A",
                        "A-N",
                        "B-N",
                        "C-N",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                        Units
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                    {formData.tempCorrected.map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              value={row.busSection}
                              onChange={(e) => {
                                const list = [...formData.tempCorrected];
                                list[i] = {
                                  ...list[i],
                                  busSection: e.target.value,
                                };
                                handleChange((p) => ({
                                  ...p,
                                  tempCorrected: list,
                                }));
                              }}
                              readOnly={!isEditing}
                              className={`block w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {row.busSection}
                          </div>
                        </td>
                        {(
                          [
                            "ag",
                            "bg",
                            "cg",
                            "ab",
                            "bc",
                            "ca",
                            "an",
                            "bn",
                            "cn",
                          ] as const
                        ).map((k) => (
                          <td key={k} className="px-3 py-2">
                            <div className="print:hidden">
                              <input
                                value={(row as any)[k]}
                                readOnly
                                className="block w-full rounded-none border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                              />
                            </div>
                            <div className="hidden print:block text-center">
                              {(row as any)[k]}
                            </div>
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <div className="print:hidden">
                            <select
                              value={formData.insulationUnit}
                              onChange={(e) =>
                                handleChange((p) => ({
                                  ...p,
                                  insulationUnit: e.target.value,
                                }))
                              }
                              disabled={!isEditing}
                              className={`block w-full rounded-none border border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            >
                              {INSULATION_RESISTANCE_UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="hidden print:block text-center">
                            {formData.insulationUnit}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Criteria and Overall Result */}
            <div className="flex items-center gap-3 mt-3">
              <span className="text-sm">Table 100.1 Criteria:</span>
              <input
                value={formData.criteriaValue}
                onChange={(e) =>
                  handleChange((p) => ({ ...p, criteriaValue: e.target.value }))
                }
                readOnly={!isEditing}
                className={`form-input w-24 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
              <select
                value={formData.criteriaUnits}
                onChange={(e) =>
                  handleChange((p) => ({ ...p, criteriaUnits: e.target.value }))
                }
                disabled={!isEditing}
                className={`form-select w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                {INSULATION_RESISTANCE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <span className="ml-4">Overall Result:</span>
              <select
                value={formData.status}
                onChange={(e) => {
                  if (isEditing) {
                    setJustSaved(false);
                    setFormData((p) => ({
                      ...p,
                      status: e.target.value as StatusType,
                    }));
                  }
                }}
                disabled={!isEditing}
                className={`form-select w-36 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                {(["PASS", "FAIL", "LIMITED SERVICE"] as StatusType[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          {/* Test Equipment — same piece of equipment may be used for multiple roles (e.g. Megohmmeter and Hipot). */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 print:hidden">
              The same piece of equipment may be used for more than one function
              (e.g. resistance and insulation resistance, or megohmmeter and
              hipot).
            </p>
            <div className="grid grid-cols-4 gap-4 print:hidden">
              <div>
                <label className="form-label">Low Resistance Ohmmeter:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.lowResistanceOhmmeter.name}
                  onChange={(value) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        lowResistanceOhmmeter: {
                          ...p.testEquipment.lowResistanceOhmmeter,
                          name: value,
                        },
                      },
                    }))
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
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        lowResistanceOhmmeter: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || "",
                          ampId: equipment.amp_id || "",
                          calDate: formatLocalDateShort(
                            equipment.calibration_date,
                          ),
                        },
                      },
                    }));
                  }}
                  readOnly={!isEditing}
                  className="w-full"
                />
              </div>
              <div>
                <label className="form-label">Serial Number:</label>
                <input
                  className="form-input"
                  value={
                    formData.testEquipment.lowResistanceOhmmeter.serialNumber
                  }
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        lowResistanceOhmmeter: {
                          ...p.testEquipment.lowResistanceOhmmeter,
                          serialNumber: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">AMP ID:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.lowResistanceOhmmeter.ampId}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        lowResistanceOhmmeter: {
                          ...p.testEquipment.lowResistanceOhmmeter,
                          ampId: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Cal Date:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.lowResistanceOhmmeter.calDate}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        lowResistanceOhmmeter: {
                          ...p.testEquipment.lowResistanceOhmmeter,
                          calDate: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Megohmmeter:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={(value) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        megohmmeter: {
                          ...p.testEquipment.megohmmeter,
                          name: value,
                        },
                      },
                    }))
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
                    setJustSaved(false);
                    setFormData((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        megohmmeter: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || "",
                          ampId: equipment.amp_id || "",
                          calDate: formatLocalDateShort(
                            equipment.calibration_date,
                          ),
                        },
                      },
                    }));
                  }}
                  readOnly={!isEditing}
                  className="w-full"
                />
              </div>
              <div>
                <label className="form-label">Serial Number:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.megohmmeter.serialNumber}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        megohmmeter: {
                          ...p.testEquipment.megohmmeter,
                          serialNumber: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">AMP ID:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.megohmmeter.ampId}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        megohmmeter: {
                          ...p.testEquipment.megohmmeter,
                          ampId: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Cal Date:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.megohmmeter.calDate}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        megohmmeter: {
                          ...p.testEquipment.megohmmeter,
                          calDate: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Hipot:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.hipot.name}
                  onChange={(value) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        hipot: { ...p.testEquipment.hipot, name: value },
                      },
                    }))
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
                    setJustSaved(false);
                    setFormData((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        hipot: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || "",
                          ampId: equipment.amp_id || "",
                          calDate: formatLocalDateShort(
                            equipment.calibration_date,
                          ),
                        },
                      },
                    }));
                  }}
                  readOnly={!isEditing}
                  className="w-full"
                />
              </div>
              <div>
                <label className="form-label">Serial Number:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.hipot.serialNumber}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        hipot: {
                          ...p.testEquipment.hipot,
                          serialNumber: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">AMP ID:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.hipot.ampId}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        hipot: {
                          ...p.testEquipment.hipot,
                          ampId: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Cal Date:</label>
                <input
                  className="form-input"
                  value={formData.testEquipment.hipot.calDate}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        hipot: {
                          ...p.testEquipment.hipot,
                          calDate: e.target.value,
                        },
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
            </div>
            {/* Print-only compact table */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print-comment-table">
                <colgroup>
                  <col style={{ width: "33.33%" }} />
                  <col style={{ width: "33.33%" }} />
                  <col style={{ width: "33.33%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">
                        Low Resistance Ohmmeter:
                      </div>
                      <div>
                        {formData.testEquipment.lowResistanceOhmmeter.name}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div>
                        {
                          formData.testEquipment.lowResistanceOhmmeter
                            .serialNumber
                        }
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div>
                        {formData.testEquipment.lowResistanceOhmmeter.ampId}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Megohmmeter:</div>
                      <div>{formData.testEquipment.megohmmeter.name}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div>
                        {formData.testEquipment.megohmmeter.serialNumber}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div>{formData.testEquipment.megohmmeter.ampId}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Hipot:</div>
                      <div>{formData.testEquipment.hipot.name}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div>{formData.testEquipment.hipot.serialNumber}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div>{formData.testEquipment.hipot.ampId}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Comments */}
          <div
            className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments
            </h2>
            <textarea
              value={formData.comments}
              onChange={(e) =>
                handleChange((p) => ({ ...p, comments: e.target.value }))
              }
              rows={4}
              readOnly={!isEditing}
              className={`form-textarea w-full resize-none ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} print:hidden`}
            />
            {formData.comments?.trim() && (
              <div className="hidden print:block">
                <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print-comment-table">
                  <tbody>
                    <tr>
                      <td className="p-2 align-top border border-neutral-300 print:border-black">
                        <div className="mt-0 whitespace-pre-wrap break-words">
                          {formData.comments}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
                  currentReportId || window.location.pathname.split("/").pop();
                if (!savedReportId) throw new Error("Failed to save report");

                // Update asset status to ready_for_review
                const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;
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
            className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-none hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Mark Ready to Review
          </button>
        </div>
      )}
    </ReportWrapper>
  );
};

export default SwitchgearSwitchboardMTS23Report;
