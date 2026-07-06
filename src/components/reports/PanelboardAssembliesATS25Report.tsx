import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import NameplatePrintTable from "./common/NameplatePrintTable";
import { getReportName, getAssetName } from "./reportMappings";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSaveIndicator } from "./common/useSaveIndicator";
import { ReportHeader } from "./common/ReportHeader";

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
const DIELECTRIC_WITHSTAND_UNITS = ["µA", "mA"];
const RATED_VOLTAGE_OPTIONS = [
  "250",
  "480",
  "600",
  "1000",
  "2500",
  "5000",
  "8000",
  "15000",
  "25000",
  "34500",
  "46000",
];

type StatusType = "PASS" | "FAIL" | "LIMITED SERVICE";

interface InsulationRowSimple {
  section: string;
  p1: string;
  p2: string;
  p3: string;
}
interface ContactRow {
  busSection: string;
  aPhase: string;
  bPhase: string;
  cPhase: string;
  neutral: string;
  ground: string;
}
interface DielectricRow {
  busSection: string;
  ag: string;
  bg: string;
  cg: string;
  result?: "PASS" | "FAIL" | "";
}

interface FormData {
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

  visualInspectionItems: Array<{
    id: string;
    description: string;
    result: string;
    comments?: string;
  }>;

  insulationMeasured: InsulationRowSimple[];
  insulationUnit: string;
  insulationTestVoltage: string;
  insulationDuration: string;
  tempCorrected: InsulationRowSimple[];
  criteriaValue: string;
  criteriaUnits: string;

  contactResistance: ContactRow[];
  contactUnit: string;
  contactEvaluation: {
    deviation: string;
    criteria: string;
    result: StatusType | "N/A";
  }[];
  contactNeutral: { criteria: string; result: StatusType | "N/A" };
  contactGround: { criteria: string; result: StatusType | "N/A" };

  dielectricWithstand: DielectricRow[];
  dielectricUnit: string;
  dielectricTestVoltage: string;
  dielectricTestDuration: string;
  torqueVerificationUsingLROhm: "Yes" | "No";

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
  };
  comments: string;
}

// Simple TCF table keyed by rounded °C (same as other reports)
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
};

const getTCF = (celsius: number): number =>
  TCF_TABLE[Math.round(celsius).toString()] ?? 1;

const PanelboardAssembliesATS25Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const isPrintMode = searchParams.get("print") === "true";

  const reportSlug = "panelboard-assemblies-ats25";
  const reportName = getReportName(reportSlug);

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const [loading, setLoading] = useState(true);
  const { justSaved, markSaved, markEdited } = useSaveIndicator();
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);

  // Keep state aligned when the route changes. If the route changed because we just
  // created a copied report, preserve the local copied form state so the user can
  // continue editing immediately.
  useEffect(() => {
    reportIdRef.current = initialReportId;
    setCurrentReportId(initialReportId);

    if (!initialReportId) {
      setIsEditing(true);
      isAutoSaveCreatedRef.current = false;
      return;
    }

    if (isAutoSaveCreatedRef.current) {
      return;
    }

    setIsEditing(false);
    setLoading(true);
  }, [initialReportId]);

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
        id: "7.1.2.A.1",
        description: "Compare equipment nameplate data with drawings.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.2",
        description: "Inspect physical, electrical, and mechanical condition.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.3",
        description:
          "Inspect anchorage, alignment, grounding, and required area clearances.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.4",
        description:
          "Verify the unit is clean and all shipping bracing and loose parts have been removed.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.5",
        description:
          "Verify that fuse and circuit breaker sizes and types correspond to drawings and coordination study.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.6",
        description:
          "Verify that wiring connections are tight and secure to prevent damage during operation of moving parts.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.7",
        description:
          "Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method. Use manufacturer data or Table 100.12.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.8",
        description:
          "Inspect insulators for evidence of physical damage or contaminated surfaces.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.9",
        description: "Verify correct barrier installation.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.10",
        description:
          "Perform visual and mechanical inspection on surge protective devices.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.11",
        description: "Exercise all active components.",
        result: "Select One",
      },
      {
        id: "7.1.2.A.12",
        description:
          "*Perform thermographic survey in accordance with Section 9.",
        result: "Select One",
      },
    ],
    insulationMeasured: [
      { section: "Phase to Phase", p1: "", p2: "", p3: "" },
      { section: "Phase to Ground", p1: "", p2: "", p3: "" },
      { section: "Phase to Neutral", p1: "", p2: "", p3: "" },
    ],
    insulationUnit: "MΩ",
    insulationTestVoltage: "1000V",
    insulationDuration: "1 min",
    tempCorrected: [
      { section: "Phase to Phase", p1: "", p2: "", p3: "" },
      { section: "Phase to Ground", p1: "", p2: "", p3: "" },
      { section: "Phase to Neutral", p1: "", p2: "", p3: "" },
    ],
    criteriaValue: "≥ 25",
    criteriaUnits: "MΩ",
    contactResistance: [
      {
        busSection: "Panelboard",
        aPhase: "",
        bPhase: "",
        cPhase: "",
        neutral: "",
        ground: "",
      },
    ],
    contactUnit: "µΩ",
    contactEvaluation: [{ deviation: "N/A", criteria: "<50%", result: "N/A" }],
    contactNeutral: { criteria: "N/A", result: "N/A" },
    contactGround: { criteria: "N/A", result: "N/A" },
    dielectricWithstand: [
      { busSection: "Panelboard", ag: "", bg: "", cg: "", result: "" },
    ],
    dielectricUnit: "µA",
    dielectricTestVoltage: "2.3 kVDC",
    dielectricTestDuration: "1 min.",
    torqueVerificationUsingLROhm: "Yes",
    testEquipment: {
      megohmmeter: { name: "", serialNumber: "", ampId: "", calDate: "" },
      lowResistanceOhmmeter: {
        name: "",
        serialNumber: "",
        ampId: "",
        calDate: "",
      },
    },
    comments: "",
  });

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
          customerName = maskCustomerName(
            customer.company_name || customer.name || "",
          );
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

  // Load existing report (reuse switchgear table to avoid new migrations)
  const loadReport = async () => {
    // Don't reload if we just created the report via autosave
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("panelboard_assemblies_ats25_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();
      if (error) throw error;
      if (data) {
        const info = data.report_info || {};
        const vm = data.visual_mechanical?.items || [];
        const ir = data.insulation_resistance?.tests || [];
        const corr = data.insulation_resistance?.correctedTests || [];
        const cr = data.contact_resistance?.tests || [];
        const dw = data.contact_resistance?.dielectricTests || [];
        const dUnit = data.contact_resistance?.dielectricUnit || undefined;
        const dVolt =
          data.contact_resistance?.dielectricTestVoltage || undefined;
        const dDur = data.contact_resistance?.dielectricDuration || undefined;
        const te =
          (data as any).test_equipment ||
          (data as any).test_equipment_used ||
          info.testEquipment ||
          undefined;
        setFormData((prev) => ({
          ...prev,
          customerName: info.customer || prev.customerName,
          customerLocation: info.address || prev.customerLocation,
          userName: info.userName || prev.userName,
          date: info.date || prev.date,
          technicians: info.technicians || prev.technicians,
          identifier: info.identifier || prev.identifier,
          substation: info.substation || prev.substation,
          eqptLocation: info.eqptLocation || prev.eqptLocation,
          temperature: info.temperature || prev.temperature,
          status: info.status || prev.status,
          nameplate: {
            manufacturer: info.manufacturer || prev.nameplate.manufacturer,
            catalogNumber: info.catalogNumber || prev.nameplate.catalogNumber,
            serialNumber: info.serialNumber || prev.nameplate.serialNumber,
            series: info.series || prev.nameplate.series,
            type: info.type || prev.nameplate.type,
            ratedVoltage: info.ratedVoltage || prev.nameplate.ratedVoltage,
            systemVoltage: info.systemVoltage || prev.nameplate.systemVoltage,
            ratedCurrent: info.ratedCurrent || prev.nameplate.ratedCurrent,
            aicRating: info.aicRating || prev.nameplate.aicRating,
            phaseConfiguration:
              info.phaseConfiguration || prev.nameplate.phaseConfiguration,
          },
          visualInspectionItems: vm.length ? vm : prev.visualInspectionItems,
          insulationMeasured: ir.length ? ir : prev.insulationMeasured,
          tempCorrected: corr.length ? corr : prev.tempCorrected,
          insulationUnit:
            data.insulation_resistance?.unit ||
            data.insulation_resistance?.units ||
            prev.insulationUnit,
          insulationTestVoltage:
            data.insulation_resistance?.testVoltage ||
            prev.insulationTestVoltage,
          insulationDuration:
            data.insulation_resistance?.duration || prev.insulationDuration,
          criteriaValue:
            data.insulation_resistance?.criteriaValue || prev.criteriaValue,
          criteriaUnits:
            data.insulation_resistance?.criteriaUnits || prev.criteriaUnits,
          contactResistance: cr.length ? cr : prev.contactResistance,
          dielectricWithstand: dw.length ? dw : prev.dielectricWithstand,
          dielectricUnit: dUnit ?? prev.dielectricUnit,
          dielectricTestVoltage: dVolt ?? prev.dielectricTestVoltage,
          dielectricTestDuration: dDur ?? prev.dielectricTestDuration,
          torqueVerificationUsingLROhm:
            info.torqueVerificationUsingLROhm ||
            prev.torqueVerificationUsingLROhm,
          testEquipment: te ? te : prev.testEquipment,
          comments: data.comments || prev.comments,
        }));
        setIsEditing(false);
      }
    } catch (e) {
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, currentReportId]);

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
    markEdited();
    const c = Math.round(((f - 32) * 5) / 9);
    const tcf = getTCF(c);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit: f, celsius: c, tcf },
    }));
  };
  const handleC = (c: number) => {
    markEdited();
    const f = Math.round((c * 9) / 5 + 32);
    const tcf = getTCF(c);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, celsius: c, fahrenheit: f, tcf },
    }));
  };
  const handleChange = (updater: (prev: FormData) => FormData) => {
    markEdited();
    setFormData(updater);
  };
  const handleStatusToggle = () => {
    if (!isEditing) return;
    markEdited();
    setFormData((prev) => ({
      ...prev,
      status:
        prev.status === "PASS"
          ? "FAIL"
          : prev.status === "FAIL"
            ? "LIMITED SERVICE"
            : "PASS",
    }));
  };

  useEffect(() => {
    const tcf = formData.temperature.tcf || 1;
    setFormData((prev) => ({
      ...prev,
      tempCorrected: prev.insulationMeasured.map((row) => {
        const out: InsulationRowSimple = { ...row };
        (["p1", "p2", "p3"] as (keyof InsulationRowSimple)[]).forEach((k) => {
          if (k === "section") return;
          const v = String((row as any)[k] || "").trim();
          if (!v || v.toLowerCase() === "n/a") {
            (out as any)[k] = v || "N/A";
          } else {
            // Handle prefixed values like ">2200" or "<100"
            const prefixMatch = v.match(/^([><])\s*(.+)$/);
            const prefix = prefixMatch ? prefixMatch[1] : "";
            const numStr = prefixMatch ? prefixMatch[2] : v;
            const n = parseFloat(numStr);
            if (isFinite(n)) {
              const corrected = n * tcf;
              // Preserve whole number formatting if the result is a whole number
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
      return {
        ...prev,
        contactEvaluation: updated.length ? updated : prev.contactEvaluation,
      };
    });
  }, [JSON.stringify(formData.contactResistance)]);

  const neutralDeviation = computeDeviation(
    formData.contactResistance[0]?.neutral || "",
    formData.contactResistance[0]?.neutral || "",
    formData.contactResistance[0]?.neutral || "",
  );
  const groundDeviation = computeDeviation(
    formData.contactResistance[0]?.ground || "",
    formData.contactResistance[0]?.ground || "",
    formData.contactResistance[0]?.ground || "",
  );

  useEffect(() => {
    setFormData((prev) => {
      const nCrit = prev.contactNeutral.criteria || "N/A";
      const gCrit = prev.contactGround.criteria || "N/A";
      const nThr = parseCriteriaPercent(nCrit);
      const gThr = parseCriteriaPercent(gCrit);
      let nRes: StatusType | "N/A" = prev.contactNeutral.result;
      let gRes: StatusType | "N/A" = prev.contactGround.result;
      if (neutralDeviation !== "N/A" && nThr !== null) {
        const v = parseFloat(neutralDeviation.replace("%", ""));
        nRes = v <= nThr ? "PASS" : "FAIL";
      }
      if (groundDeviation !== "N/A" && gThr !== null) {
        const v = parseFloat(groundDeviation.replace("%", ""));
        gRes = v <= gThr ? "PASS" : "FAIL";
      }
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

  // Add/remove row functions (mirrors 7.11 Switchgear/Switchboard Assemblies sheet)
  const addInsulationResistanceRow = () => {
    setFormData((prev) => {
      const newRow: InsulationRowSimple = {
        section: "",
        p1: "",
        p2: "",
        p3: "",
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

  // Excel-equivalent for Table 100.1:
  // IF($AC$9="","",IF($AC$9<=250,IF(Z37="MΩ",25,0.025),IF(Z37="MΩ",100,0.1)))
  const computeCriteriaFromVoltage = (
    volts: number,
    unit: string,
  ): number | null => {
    if (!Number.isFinite(volts)) return null; // blank
    const isMega = unit === "MΩ";
    if (volts <= 250) {
      return isMega ? 25 : 0.025;
    }
    return isMega ? 100 : 0.1;
  };

  useEffect(() => {
    const vStr = formData.nameplate?.ratedVoltage || "";
    const v = parseInt(String(vStr).replace(/[^0-9]/g, ""), 10);
    const units = formData.insulationUnit;
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

  // Helpers for evaluation
  const parseNumeric = (v: string): number | null => {
    if (!v) return null;
    const trimmed = String(v).trim();
    if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
    const m = trimmed.match(/([<>]=?)?\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const num = parseFloat(m[2]);
    return Number.isFinite(num) ? num : null;
  };

  const criteriaNumber = (() => {
    const m = formData.criteriaValue.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  })();

  const evaluateRowResult = (
    row: InsulationRowSimple,
  ): "PASS" | "FAIL" | "-" => {
    if (criteriaNumber == null) return "-";
    const values = [row.p1, row.p2, row.p3]
      .map(parseNumeric)
      .filter((n): n is number => n !== null);
    if (values.length === 0) return "-";
    const allOk = values.every((v) => v >= criteriaNumber);
    return allOk ? "PASS" : "FAIL";
  };

  const buildReportPayload = React.useCallback(
    () => ({
      job_id: jobId,
      user_id: user?.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        userName: formData.userName,
        date: formData.date,
        identifier: formData.identifier,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        torqueVerificationUsingLROhm: formData.torqueVerificationUsingLROhm,
        manufacturer: formData.nameplate.manufacturer,
        catalogNumber: formData.nameplate.catalogNumber,
        serialNumber: formData.nameplate.serialNumber,
        series: formData.nameplate.series,
        type: formData.nameplate.type,
        ratedVoltage: formData.nameplate.ratedVoltage,
        systemVoltage: formData.nameplate.systemVoltage,
        ratedCurrent: formData.nameplate.ratedCurrent,
        aicRating: formData.nameplate.aicRating,
        phaseConfiguration: formData.nameplate.phaseConfiguration,
        testEquipment: formData.testEquipment,
        status: formData.status,
      },
      visual_mechanical: { items: formData.visualInspectionItems },
      insulation_resistance: {
        tests: formData.insulationMeasured,
        correctedTests: formData.tempCorrected,
        unit: formData.insulationUnit,
        units: formData.insulationUnit,
        testVoltage: formData.insulationTestVoltage,
        duration: formData.insulationDuration,
        criteriaValue: formData.criteriaValue,
        criteriaUnits: formData.criteriaUnits,
      },
      contact_resistance: {
        tests: formData.contactResistance,
        dielectricTests: formData.dielectricWithstand,
        dielectricUnit: formData.dielectricUnit,
        dielectricTestVoltage: formData.dielectricTestVoltage,
        dielectricDuration: formData.dielectricTestDuration,
      },
      comments: formData.comments,
    }),
    [jobId, user?.id, formData, maskCustomerName, maskCustomerAddress],
  );

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const payload = buildReportPayload();

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("panelboard_assemblies_ats25_reports")
          .update(payload)
          .eq("id", reportIdRef.current);
        if (error) throw error;
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema("neta_ops")
            .from("panelboard_assemblies_ats25_reports")
            .insert(payload)
            .select()
            .single();
          if (result.error) throw result.error;

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;

            const assetData = {
              name: getAssetName(
                reportSlug,
                formData.identifier || formData.eqptLocation || "",
              ),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
              user_id: user.id,
            };

            const { data: assetResult } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert(assetData)
              .select()
              .single();

            if (assetResult) {
              await supabase.schema("neta_ops").from("job_assets").insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id,
              });
            }

            setCurrentReportId(newReportId);
            isAutoSaveCreatedRef.current = true;
            window.history.replaceState(
              {},
              "",
              `/jobs/${jobId}/${reportSlug}/${newReportId}`,
            );
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (error) {
      console.error("Auto-save error:", error);
    } finally {
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, buildReportPayload, formData, reportSlug]);

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

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    const wasExistingReport = Boolean(currentReportId || reportIdRef.current);
    const payload = buildReportPayload();

    try {
      setIsSaving(true);
      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema("neta_ops")
          .from("panelboard_assemblies_ats25_reports")
          .update(payload)
          .eq("id", reportIdRef.current)
          .select()
          .single();
      } else if (creatingRef.current) {
        const deadline = Date.now() + 5000;
        while (
          creatingRef.current &&
          !reportIdRef.current &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (reportIdRef.current) {
          result = await supabase
            .schema("neta_ops")
            .from("panelboard_assemblies_ats25_reports")
            .update(payload)
            .eq("id", reportIdRef.current)
            .select()
            .single();
        }
        // If auto-save creation failed (no reportIdRef), fall through to insert below
      }
      if (!result && !reportIdRef.current) {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema("neta_ops")
            .from("panelboard_assemblies_ats25_reports")
            .insert(payload)
            .select()
            .single();

          if (result.data) {
            reportIdRef.current = result.data.id;
            setCurrentReportId(result.data.id);

            const assetData = {
              name: getAssetName(
                reportSlug,
                formData.identifier || formData.eqptLocation || "",
              ),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
              user_id: user.id,
            };
            const { data: assetResult } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert(assetData)
              .select()
              .single();
            if (assetResult) {
              await supabase.schema("neta_ops").from("job_assets").insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id,
              });
            }
          } else {
            creatingRef.current = false;
          }
        } catch (saveError) {
          creatingRef.current = false;
          throw saveError;
        }
      }

      if ((result as any)?.error) throw (result as any).error;
      if (!wasExistingReport) {
        setIsEditing(false);
        const newId =
          reportIdRef.current ||
          (result as any)?.data?.id ||
          (result as any)?.id;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      } else {
        markSaved();
      }
    } catch (e: any) {
      console.error("Save error", e?.message || e, e);
      alert(`Failed to save report: ${e?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (currentReportId) {
      setIsEditing(false);
    }
    markEdited(); // Reset the "Saved" state since we're leaving edit mode
  };

  // Save the current report and create a new panelboard report with only nameplate data copied.
  const copyNameplateDataToNewReport = React.useCallback(async () => {
    if (!jobId || !user?.id) {
      alert("Unable to create new report. Missing job or user information.");
      return;
    }

    try {
      setIsSaving(true);
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      const currentPayload = buildReportPayload();
      let savedCurrentReportId = reportIdRef.current || currentReportId;

      if (creatingRef.current && !savedCurrentReportId) {
        const deadline = Date.now() + 5000;
        while (
          creatingRef.current &&
          !reportIdRef.current &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        savedCurrentReportId = reportIdRef.current;

        if (!savedCurrentReportId) {
          throw new Error(
            "Current report is still saving. Please try again in a moment.",
          );
        }
      }

      if (savedCurrentReportId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("panelboard_assemblies_ats25_reports")
          .update(currentPayload)
          .eq("id", savedCurrentReportId);
        if (error) throw error;
      } else {
        creatingRef.current = true;
        try {
          const { data: currentReport, error: currentReportError } =
            await supabase
              .schema("neta_ops")
              .from("panelboard_assemblies_ats25_reports")
              .insert(currentPayload)
              .select()
              .single();

          if (currentReportError) throw currentReportError;
          if (!currentReport) throw new Error("Failed to save current report.");

          savedCurrentReportId = currentReport.id;
          reportIdRef.current = savedCurrentReportId;
          setCurrentReportId(savedCurrentReportId);

          const { data: assetResult, error: assetError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert({
              name: getAssetName(
                reportSlug,
                formData.identifier || formData.eqptLocation || "",
              ),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${savedCurrentReportId}`,
              user_id: user.id,
            })
            .select()
            .single();

          if (!assetError && assetResult) {
            const { error: linkError } = await supabase
              .schema("neta_ops")
              .from("job_assets")
              .insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id,
              });
            if (linkError) {
              console.warn(
                "Job asset link failed for current report (report was saved):",
                linkError,
              );
            }
          }
          if (assetError) {
            console.warn(
              "Asset creation failed for current report (report was saved):",
              assetError,
            );
          }
        } finally {
          creatingRef.current = false;
        }
      }

      const makeEmptyTestEquipment = () => ({
        name: "",
        serialNumber: "",
        ampId: "",
        calDate: "",
      });
      const defaultTemperature = {
        fahrenheit: 68,
        celsius: 20,
        tcf: 1,
        humidity: null,
      };
      const defaultInsulationMeasured: InsulationRowSimple[] = [
        { section: "Phase to Phase", p1: "", p2: "", p3: "" },
        { section: "Phase to Ground", p1: "", p2: "", p3: "" },
        { section: "Phase to Neutral", p1: "", p2: "", p3: "" },
      ];
      const defaultInsulationUnit = "MΩ";
      const copiedRatedVoltage = parseInt(
        String(formData.nameplate.ratedVoltage || "").replace(/[^0-9]/g, ""),
        10,
      );
      const computedCriteria = computeCriteriaFromVoltage(
        copiedRatedVoltage,
        defaultInsulationUnit,
      );
      const defaultCriteriaValue =
        computedCriteria === null
          ? "≥ 25"
          : `≥ ${computedCriteria % 1 === 0 ? computedCriteria.toString() : computedCriteria}`;

      const newFormData: FormData = {
        ...formData,
        userName: "",
        date: new Date().toISOString().split("T")[0],
        identifier: "",
        technicians: "",
        temperature: defaultTemperature,
        substation: "",
        eqptLocation: "",
        status: "PASS",
        nameplate: {
          ...formData.nameplate,
          serialNumber: "",
        },
        visualInspectionItems: formData.visualInspectionItems.map((item) => ({
          id: item.id,
          description: item.description,
          result: "Select One",
        })),
        insulationMeasured: defaultInsulationMeasured,
        insulationUnit: defaultInsulationUnit,
        insulationTestVoltage: "1000V",
        insulationDuration: "1 min",
        tempCorrected: defaultInsulationMeasured.map((row) => ({ ...row })),
        criteriaValue: defaultCriteriaValue,
        criteriaUnits: defaultInsulationUnit,
        contactResistance: [
          {
            busSection: "Panelboard",
            aPhase: "",
            bPhase: "",
            cPhase: "",
            neutral: "",
            ground: "",
          },
        ],
        contactUnit: "µΩ",
        contactEvaluation: [
          { deviation: "N/A", criteria: "<50%", result: "N/A" },
        ],
        contactNeutral: { criteria: "N/A", result: "N/A" },
        contactGround: { criteria: "N/A", result: "N/A" },
        dielectricWithstand: [
          { busSection: "Panelboard", ag: "", bg: "", cg: "", result: "" },
        ],
        dielectricUnit: "µA",
        dielectricTestVoltage: "2.3 kVDC",
        dielectricTestDuration: "1 min.",
        torqueVerificationUsingLROhm: "Yes",
        testEquipment: {
          megohmmeter: makeEmptyTestEquipment(),
          lowResistanceOhmmeter: makeEmptyTestEquipment(),
        },
        comments: "",
      };

      const newReportPayload = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          customer: maskCustomerName(newFormData.customerName),
          address: maskCustomerAddress(newFormData.customerLocation),
          userName: newFormData.userName,
          date: newFormData.date,
          identifier: newFormData.identifier,
          technicians: newFormData.technicians,
          substation: newFormData.substation,
          eqptLocation: newFormData.eqptLocation,
          temperature: newFormData.temperature,
          torqueVerificationUsingLROhm:
            newFormData.torqueVerificationUsingLROhm,
          manufacturer: newFormData.nameplate.manufacturer,
          catalogNumber: newFormData.nameplate.catalogNumber,
          serialNumber: newFormData.nameplate.serialNumber,
          series: newFormData.nameplate.series,
          type: newFormData.nameplate.type,
          ratedVoltage: newFormData.nameplate.ratedVoltage,
          systemVoltage: newFormData.nameplate.systemVoltage,
          ratedCurrent: newFormData.nameplate.ratedCurrent,
          aicRating: newFormData.nameplate.aicRating,
          phaseConfiguration: newFormData.nameplate.phaseConfiguration,
          testEquipment: newFormData.testEquipment,
          status: newFormData.status,
        },
        visual_mechanical: { items: newFormData.visualInspectionItems },
        insulation_resistance: {
          tests: newFormData.insulationMeasured,
          correctedTests: newFormData.tempCorrected,
          unit: newFormData.insulationUnit,
          units: newFormData.insulationUnit,
          testVoltage: newFormData.insulationTestVoltage,
          duration: newFormData.insulationDuration,
          criteriaValue: newFormData.criteriaValue,
          criteriaUnits: newFormData.criteriaUnits,
        },
        contact_resistance: {
          tests: newFormData.contactResistance,
          dielectricTests: newFormData.dielectricWithstand,
          dielectricUnit: newFormData.dielectricUnit,
          dielectricTestVoltage: newFormData.dielectricTestVoltage,
          dielectricDuration: newFormData.dielectricTestDuration,
        },
        comments: newFormData.comments,
      };

      const { data: newReport, error: newReportError } = await supabase
        .schema("neta_ops")
        .from("panelboard_assemblies_ats25_reports")
        .insert(newReportPayload)
        .select()
        .single();

      if (newReportError) throw newReportError;
      if (!newReport) throw new Error("Failed to create new report.");

      const { data: newAsset, error: newAssetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .insert({
          name: getAssetName(reportSlug, ""),
          file_url: `report:/jobs/${jobId}/${reportSlug}/${newReport.id}`,
          user_id: user.id,
        })
        .select()
        .single();

      if (!newAssetError && newAsset) {
        const { error: linkError } = await supabase
          .schema("neta_ops")
          .from("job_assets")
          .insert({
            job_id: jobId,
            asset_id: newAsset.id,
            user_id: user.id,
          });
        if (linkError) {
          console.warn(
            "Job asset link failed for new report (report was created):",
            linkError,
          );
        }
      }
      if (newAssetError) {
        console.warn(
          "Asset creation failed for new report (report was created):",
          newAssetError,
        );
      }

      reportIdRef.current = newReport.id;
      isAutoSaveCreatedRef.current = true;
      setCurrentReportId(newReport.id);
      setFormData(newFormData);
      setIsEditing(true);
      markSaved();
      navigate(`/jobs/${jobId}/${reportSlug}/${newReport.id}`, {
        replace: true,
      });
    } catch (error: any) {
      console.error("Error creating new panelboard report:", error);
      alert(
        `Failed to create new report: ${error?.message || "Unknown error"}`,
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    buildReportPayload,
    currentReportId,
    formData,
    jobId,
    markSaved,
    maskCustomerAddress,
    maskCustomerName,
    navigate,
    reportSlug,
    user?.id,
  ]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@media print { body { margin:0; padding:20px; font-family: Arial, Helvetica, sans-serif !important; } html, body { font-size:9px !important; color:black !important; background:white !important; line-height:1 !important; } header, nav, .navigation, [class*="nav"], [class*="header"], .print\\:hidden { display:none !important; } * { border:none !important; box-shadow:none !important; outline:none !important; } table { border-collapse:collapse !important; width:100% !important; margin:1px 0 !important; font-size:8px !important; } thead { display:table-header-group !important; } tr { page-break-inside: avoid !important; break-inside: avoid !important; } table, th, td, thead, tbody, tr { border:1px solid black !important; } th, td { padding:2px 3px !important; text-align:center !important; height:12px !important; line-height:1 !important; } th { background:#f0f0f0 !important; font-weight:bold !important; } input, select, textarea { background:white !important; border:1px solid black !important; color:black !important; padding:2px !important; font-size:10px !important; -webkit-appearance:none !important; appearance:none !important; } select { background-image:none !important; padding-right:8px !important; } input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none !important; margin:0 !important; } input[type="number"] { -moz-appearance:textfield !important; } button:not(.print-visible) { display:none !important; } section { break-inside: avoid !important; margin-bottom:20px !important; } * { color:black !important; }
    /* Make the Phase Value Deviation block readable in print */
    .overflow-x-auto { overflow: visible !important; }
    table.phase-deviation-table { table-layout: fixed !important; }
    table.phase-deviation-table th, table.phase-deviation-table td { height:auto !important; line-height:1.2 !important; font-size:9px !important; vertical-align:top !important; }
    table.phase-deviation-table .text-xs { font-size:9px !important; }
    table.phase-deviation-table td:first-child { text-align:left !important; }
    table.phase-deviation-table td:first-child span.text-xs:first-child { display:inline-block !important; padding-left:5ch !important; }
    }
    `;
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
            NETA - ATS 7.1.2
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
            title={reportName}
            isAutoSaving={isAutoSaving}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={isSaving}
            status={formData.status}
            hasReport={!!currentReportId}
            onStatusToggle={handleStatusToggle}
            onSave={handleSave}
            onEdit={() => setIsEditing(true)}
            onBack={() => navigate(`/jobs/${jobId}`)}
            onSaveAndClose={handleSaveAndClose}
            isPrintMode={isPrintMode}
            loading={loading}
          />

          {/* Job Information */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <div className="grid grid-cols-2 gap-6 print:hidden job-info-onscreen">
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Customer
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.customerName}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 cursor-default"
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
                      value={maskCustomerAddress(formData.customerLocation)}
                      onChange={(e) => setFormData((prev) => ({ ...prev, customerLocation: e.target.value }))}
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
                      value={formData.userName}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          userName: e.target.value,
                        }))
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
                      value={formData.date}
                      onChange={(e) =>
                        handleChange((p) => ({ ...p, date: e.target.value }))
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
                      value={formData.identifier}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          identifier: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Job #
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.jobNumber}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 cursor-default"
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
                      value={formData.technicians}
                      onChange={(e) =>
                        handleChange((p) => ({
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
                        value={formData.temperature.fahrenheit}
                        onChange={(e) => handleF(parseFloat(e.target.value))}
                        readOnly={!isEditing}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="mx-2">°F</span>
                    <span className="mx-2">{formData.temperature.celsius}</span>
                    <span className="mx-2">°C</span>
                    <span className="mx-5">TCF</span>
                    <div className="w-16 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={formData.temperature.tcf.toFixed(3)}
                        readOnly
                        className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                      />
                    </div>
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
                        value={formData.temperature.humidity || 0}
                        onChange={(e) =>
                          handleChange((p) => ({
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
                      value={formData.substation}
                      onChange={(e) =>
                        handleChange((p) => ({
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
                      value={formData.eqptLocation}
                      onChange={(e) =>
                        handleChange((p) => ({
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
            <JobInfoPrintTable
              data={{
                customer: formData.customerName,
                address: formData.customerLocation,
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
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Nameplate Data
            </h2>
            <div className="grid grid-cols-3 gap-4 print:hidden">
              <div>
                <label className="form-label">Manufacturer</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.manufacturer}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: {
                        ...p.nameplate,
                        manufacturer: e.target.value,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Catalog No.</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.catalogNumber}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: {
                        ...p.nameplate,
                        catalogNumber: e.target.value,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Serial Number</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.serialNumber}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: {
                        ...p.nameplate,
                        serialNumber: e.target.value,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Series</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.series}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: { ...p.nameplate, series: e.target.value },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Type</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.type}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: { ...p.nameplate, type: e.target.value },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">System Voltage (V)</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.systemVoltage}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: {
                        ...p.nameplate,
                        systemVoltage: e.target.value,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Rated Voltage (V)</label>
                {isEditing ? (
                  <select
                    value={formData.nameplate.ratedVoltage}
                    onChange={(e) =>
                      handleChange((p) => ({
                        ...p,
                        nameplate: {
                          ...p.nameplate,
                          ratedVoltage: e.target.value,
                        },
                      }))
                    }
                    className="form-select"
                  >
                    <option value="">Select...</option>
                    {RATED_VOLTAGE_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`form-input bg-neutral-100 dark:bg-dark-150`}
                    value={formData.nameplate.ratedVoltage}
                    readOnly
                  />
                )}
              </div>
              <div>
                <label className="form-label">Rated Current (A)</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.ratedCurrent}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: {
                        ...p.nameplate,
                        ratedCurrent: e.target.value,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">SCCR (kA)</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.aicRating}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: { ...p.nameplate, aicRating: e.target.value },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
              <div>
                <label className="form-label">Phase Configuration</label>
                <input
                  className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  value={formData.nameplate.phaseConfiguration}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      nameplate: {
                        ...p.nameplate,
                        phaseConfiguration: e.target.value,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                />
              </div>
            </div>
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
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "68%" }} />
                  <col style={{ width: "20%" }} />
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

          {/* Electrical - Insulation Resistance Tests */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
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
            <div className="flex justify-between items-start mb-2 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Temperature Correction Factor:</span>
                <span className="font-semibold">
                  {formData.temperature.tcf}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Test Voltage (V):</span>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm">Test Duration:</span>
                  <input
                    value={formData.insulationDuration}
                    onChange={(e) =>
                      handleChange((p) => ({
                        ...p,
                        insulationDuration: e.target.value,
                      }))
                    }
                    readOnly={!isEditing}
                    className={`form-input w-24 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div className="border rounded-none px-3 py-2 bg-neutral-50 dark:bg-dark-150">
                  <div className="text-xs font-semibold mb-1">
                    Table 100.1 Criteria
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">Value</span>
                    <input
                      value={formData.criteriaValue}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          criteriaValue: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`form-input w-10 h-7 py-1 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                    <span className="text-xs ml-2">Units</span>
                    <select
                      value={formData.criteriaUnits}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          criteriaUnits: e.target.value,
                        }))
                      }
                      disabled={!isEditing}
                      className={`form-select w-10 h-7 py-1 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    >
                      {INSULATION_RESISTANCE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed">
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Test Points
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"
                      colSpan={3}
                    >
                      Measured Values
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"
                      colSpan={3}
                    >
                      Temp. Corrected Values
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      Units
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"
                      colSpan={2}
                    >
                      Table 100.1 Criteria
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      Results
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                    {["P1 (P1-P2)", "P2 (P2-P3)", "P3 (P3-P1)"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium"
                      >
                        {h}
                      </th>
                    ))}
                    {["P1 (P1-P2)", "P2 (P2-P3)", "P3 (P3-P1)"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium">
                      Value
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium">
                      Units
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.insulationMeasured.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="print:hidden flex items-center gap-1">
                          <input
                            value={row.section}
                            onChange={(e) => {
                              const list = [...formData.insulationMeasured];
                              list[i] = { ...list[i], section: e.target.value };
                              handleChange((p) => ({
                                ...p,
                                insulationMeasured: list,
                              }));
                            }}
                            readOnly={!isEditing}
                            className={`block flex-1 rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                          {row.section}
                        </div>
                      </td>
                      {(["p1", "p2", "p3"] as const).map((k) => (
                        <td key={`m-${k}`} className="px-3 py-2">
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
                              className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {row[k]}
                          </div>
                        </td>
                      ))}
                      {(["p1", "p2", "p3"] as const).map((k) => (
                        <td key={`c-${k}`} className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              value={
                                (formData.tempCorrected[i] as any)?.[k] ?? ""
                              }
                              readOnly
                              className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {(formData.tempCorrected[i] as any)?.[k] ?? ""}
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
                            className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                      <td className="px-3 py-2 text-center">
                        {formData.criteriaValue}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {formData.criteriaUnits}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {formData.tempCorrected[i]
                          ? evaluateRowResult(formData.tempCorrected[i])
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Electrical - Contact Resistance Test for Torque Verification */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
                Electrical - Contact Resistance Test for Torque Verification
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  Performing Torque Verification using Low-Resistance Ohmmeter?
                </span>
                <select
                  value={formData.torqueVerificationUsingLROhm}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      torqueVerificationUsingLROhm: e.target.value as
                        "Yes" | "No",
                    }))
                  }
                  disabled={!isEditing}
                  className={`form-select !w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                >
                  {(["Yes", "No"] as const).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {isEditing && (
                  <button
                    onClick={addContactResistanceRow}
                    className="px-3 py-1 text-sm text-white bg-green-600 hover:bg-green-700 rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 print:hidden whitespace-nowrap flex-shrink-0"
                    type="button"
                  >
                    + Add Row
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              {/* Resistance Measurements */}
              <div className="md:col-span-2 overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed">
                  <colgroup>
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th
                        className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"
                        colSpan={7}
                      >
                        Resistance Measurements
                      </th>
                    </tr>
                    <tr>
                      {[
                        "Section",
                        "Pole 1",
                        "Pole 2",
                        "Pole 3",
                        "Neutral",
                        "Ground",
                        "Units",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
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
                              className={`block flex-1 rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                                  list[i] = {
                                    ...list[i],
                                    [key]: e.target.value,
                                  };
                                  handleChange((p) => ({
                                    ...p,
                                    contactResistance: list,
                                  }));
                                }}
                                readOnly={!isEditing}
                                className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                              className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
              </div>

              {/* Phase Value Deviation + Result */}
              <div className="overflow-x-auto">
                <table className="phase-deviation-table min-w-full border-collapse border border-neutral-200 dark:border-neutral-700 table-fixed">
                  <colgroup>
                    <col style={{ width: "50%" }} />
                    <col style={{ width: "50%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white">
                        Phase Value Deviation
                      </th>
                      <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.contactResistance.map((row, i) => (
                      <React.Fragment key={i}>
                        {formData.contactResistance.length > 1 && (
                          <tr>
                            <td
                              className="p-1 px-2 text-xs font-semibold bg-neutral-50 dark:bg-dark-150"
                              colSpan={2}
                            >
                              {row.busSection}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="p-2 align-top">
                            <div className="flex items-center justify-between">
                              <span className="text-xs">Measured</span>
                              <span className="text-sm font-semibold">
                                {formData.contactEvaluation[i]?.deviation ||
                                  "-"}
                              </span>
                            </div>
                          </td>
                          <td
                            className="p-2 align-middle text-center font-extrabold uppercase"
                            rowSpan={2}
                          >
                            <div className="print:hidden">
                              <select
                                value={
                                  formData.contactEvaluation[i]?.result || "N/A"
                                }
                                onChange={(e) => {
                                  const list = [...formData.contactEvaluation];
                                  list[i] = {
                                    ...(list[i] || {
                                      deviation: "N/A",
                                      criteria: "<50%",
                                    }),
                                    result: e.target.value as any,
                                  };
                                  handleChange((p) => ({
                                    ...p,
                                    contactEvaluation: list,
                                  }));
                                }}
                                disabled={!isEditing}
                                className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                            <div className="hidden print:block">
                              {formData.contactEvaluation[i]?.result || "-"}
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 align-top">
                            <div className="flex items-center justify-between">
                              <span className="text-xs">Criteria</span>
                              <div className="print:hidden">
                                <select
                                  value={
                                    formData.contactEvaluation[i]?.criteria ||
                                    "<50%"
                                  }
                                  onChange={(e) => {
                                    const list = [
                                      ...formData.contactEvaluation,
                                    ];
                                    list[i] = {
                                      ...(list[i] || {
                                        deviation: "N/A",
                                        result: "N/A",
                                      }),
                                      criteria: e.target.value,
                                    };
                                    handleChange((p) => ({
                                      ...p,
                                      contactEvaluation: list,
                                    }));
                                  }}
                                  disabled={!isEditing}
                                  className={`rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                                >
                                  {[
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
                              <span className="hidden print:block">
                                {formData.contactEvaluation[i]?.criteria ||
                                  "<50%"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Test Equipment */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
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
                    handleChange((p) => ({
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
            </div>
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print-comment-table">
                <colgroup>
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 font-semibold text-left">
                      Equipment
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
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {formData.testEquipment.lowResistanceOhmmeter.name}
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {
                        formData.testEquipment.lowResistanceOhmmeter
                          .serialNumber
                      }
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {formData.testEquipment.lowResistanceOhmmeter.ampId}
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {(() => {
                        const calDate =
                          formData.testEquipment.lowResistanceOhmmeter.calDate;
                        if (!calDate) return "";
                        // Handle YYYY-MM-DD dates (from <input type="date">) in local time to avoid off-by-one
                        if (/^\d{4}-\d{2}-\d{2}$/.test(calDate)) {
                          const [y, m, d] = calDate.split("-").map(Number);
                          const local = new Date(y, (m || 1) - 1, d || 1);
                          return isNaN(local.getTime())
                            ? calDate
                            : local.toLocaleDateString();
                        }
                        const dt = new Date(calDate);
                        return isNaN(dt.getTime())
                          ? calDate
                          : dt.toLocaleDateString();
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {formData.testEquipment.megohmmeter.name}
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {formData.testEquipment.megohmmeter.serialNumber}
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {formData.testEquipment.megohmmeter.ampId}
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      {(() => {
                        const calDate =
                          formData.testEquipment.megohmmeter.calDate;
                        if (!calDate) return "";
                        // Handle YYYY-MM-DD dates (from <input type="date">) in local time to avoid off-by-one
                        if (/^\d{4}-\d{2}-\d{2}$/.test(calDate)) {
                          const [y, m, d] = calDate.split("-").map(Number);
                          const local = new Date(y, (m || 1) - 1, d || 1);
                          return isNaN(local.getTime())
                            ? calDate
                            : local.toLocaleDateString();
                        }
                        const dt = new Date(calDate);
                        return isNaN(dt.getTime())
                          ? calDate
                          : dt.toLocaleDateString();
                      })()}
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
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
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
      </div>
      {/* Copy Nameplate Data Button */}
      {!isPrintMode && isEditing && (
        <div className="mb-4 print:hidden flex justify-center">
          <button
            onClick={copyNameplateDataToNewReport}
            disabled={isSaving}
            className="px-6 py-3 text-base font-medium text-white bg-green-600 rounded-none hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Copy Nameplate data to new report
          </button>
        </div>
      )}
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

export default PanelboardAssembliesATS25Report;
