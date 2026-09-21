import React, { useEffect, useState, useCallback } from "react";
import { ReportHeader } from "@/components/reports/common/ReportHeader";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAssetFormPrefill } from "./useAssetFormPrefill";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useReportUserAutofill } from "./useReportUserAutofill";
import { ensureReportAssetLink } from "./linkReportAsset";
import { newReportId, reportIdFromUrl } from "./common/reportIdentity";
import {
  reportSaveFailed,
  reportSaveSucceeded,
} from "./common/autoSaveStatus";

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

  // Temperature data for JobInfoPrintTable
  temperature?: {
    fahrenheit: number | "";
    celsius: number | "";
    tcf: number;
    humidity: number | "";
  };

  // Device Data
  deviceData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    systemVoltage: string;
    type: string;
    icRating: string;
    ratedVoltage: string;
    ratedCurrent: string;
    phaseConfig: string;
  };

  /** Switch Data on the sheet: one row per switch position. */
  switchPositions: {
    position: string;
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    type: string;
    ratedAmperage: string;
    ratedVoltage: string;
  }[];

  // Fuse Data
  fuseData: {
    manufacturer: string;
    class: string;
    icRating: string;
    catalogNumber: string;
    ampacity: string;
    voltageRating: string;
  };

  /** Fuse Data on the sheet: one row per fuse position. */
  fusePositions: {
    position: string;
    manufacturer: string;
    catalogNumber: string;
    fuseClass: string;
    ratedAmperage: string;
    aic: string;
    ratedVoltage: string;
  }[];

  // Visual and Mechanical Inspection
  visualMechanicalInspection: {
    [key: string]: string;
  };

  // Test Results - Insulation Resistance
  insulationResistance: {
    testVoltage: string;
    pole1: {
      poleToPole: string;
      poleToFrame: string;
      lineToLoad: string;
      poleToN1: string;
    };
    pole2: {
      poleToPole: string;
      poleToFrame: string;
      lineToLoad: string;
      poleToN1: string;
    };
    pole3: {
      poleToPole: string;
      poleToFrame: string;
      lineToLoad: string;
      poleToN1: string;
    };
  };

  // Pole Resistance
  poleResistance: {
    p1AsFound: string;
    p1AsLeft: string;
    p2AsFound: string;
    p2AsLeft: string;
    p3AsFound: string;
    p3AsLeft: string;
    nAsFound: string;
    nAsLeft: string;
    switchAsFound: string;
    switchAsLeft: string;
    fuseSwitchAsFound: string;
    fuseSwitchAsLeft: string;
  };

  // Detailed Pole Resistance per device (for table rendering)
  poleResistanceDevices?: {
    switch: {
      p1AsFound: string;
      p1AsLeft: string;
      p2AsFound: string;
      p2AsLeft: string;
      p3AsFound: string;
      p3AsLeft: string;
      nAsFound: string;
      nAsLeft: string;
    };
    fuse: {
      p1AsFound: string;
      p1AsLeft: string;
      p2AsFound: string;
      p2AsLeft: string;
      p3AsFound: string;
      p3AsLeft: string;
      nAsFound: string;
      nAsLeft: string;
    };
    switchFuse: {
      p1AsFound: string;
      p1AsLeft: string;
      p2AsFound: string;
      p2AsLeft: string;
      p3AsFound: string;
      p3AsLeft: string;
      nAsFound: string;
      nAsLeft: string;
    };
  };

  /** <50% deviation check per group, as the sheet has it. */
  contactResistanceEvaluation: {
    switch: { criteria: string; result: string };
    fuse: { criteria: string; result: string };
    switchFuse: { criteria: string; result: string };
  };

  /** Table 100.1 limit, from rated voltage, with a result per test point. */
  insulationCriteria: {
    units: string;
    poleToPole: string;
    poleToFrame: string;
    lineToLoad: string;
  };

  // Test Equipment Used
  testEquipment: {
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string };
    megohmmeter: { name: string; serialNumber: string; ampId: string };
  };

  // Comments
  comments: string;
}

const getVisualInspectionDescription = (section: string): string => {
  const descriptions: Record<string, string> = {
    "7.5.1.1.A.1":
      "Inspect physical and mechanical condition.",
    "7.5.1.1.A.2":
      "Inspect anchorage, alignment, grounding, and required clearances.",
    "7.5.1.1.A.3":
      "*Prior to cleaning the unit, perform as-found tests.",
    "7.5.1.1.A.4":
      "Clean the unit.",
    "7.5.1.1.A.5":
      "Verify correct blade alignment, blade penetration, travel stops, and mechanical operation.",
    "7.5.1.1.A.6":
      "Verify that fuse sizes and types are in accordance with drawings, short-circuit study, and coordination study.",
    "7.5.1.1.A.7":
      "Verify that each fuse has adequate mechanical support and contact integrity.",
    "7.5.1.1.A.8":
      "Inspect bolted electrical connections for high resistance using a low-resistance ohmmeter in accordance with Section 7.5.1.1.B.1.",
    "7.5.1.1.A.9":
      "Verify operation and sequencing of interlocking systems.",
    "7.5.1.1.A.10":
      "Verify phase-barrier mounting is intact.",
    "7.5.1.1.A.11":
      "Verify correct operation of indicating and control devices.",
    "7.5.1.1.A.12":
      "Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.",
  };
  return descriptions[section] || "";
};

const VISUAL_INSPECTION_SECTIONS = [
  "7.5.1.1.A.1",
  "7.5.1.1.A.2",
  "7.5.1.1.A.3",
  "7.5.1.1.A.4",
  "7.5.1.1.A.5",
  "7.5.1.1.A.6",
  "7.5.1.1.A.7",
  "7.5.1.1.A.8",
  "7.5.1.1.A.9",
  "7.5.1.1.A.10",
  "7.5.1.1.A.11",
  "7.5.1.1.A.12",
];

const TEST_VOLTAGE_OPTIONS = ["250V", "500V", "1000V", "2500V", "5000V"];
const VISUAL_INSPECTION_OPTIONS = [
  "",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

/**
 * Spread across the three poles of one group, as a percentage:
 * (max - min) / min. The sheet fails a group above 50%.
 */
const calculateGroupDeviation = (
  p1: string,
  p2: string,
  p3: string,
): string => {
  const values = [p1, p2, p3]
    .map((v) => parseFloat(String(v ?? "").trim()))
    .filter((v) => !isNaN(v) && v !== 0);
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === 0) return "";
  return (((max - min) / min) * 100).toFixed(2) + "%";
};

/** PASS/FAIL for a group, against the sheet's <50% criteria. */
const evaluateGroupDeviation = (
  deviation: string,
  criteria: string,
): string => {
  if (criteria === "N/A") return "N/A";
  const value = parseFloat(deviation);
  if (isNaN(value)) return "";
  return value > 50 ? "FAIL" : "PASS";
};

/**
 * Table 100.1 minimum for a low-voltage switch: 25 MΩ at 250 V and below,
 * 100 MΩ above it.
 */
const insulationMinimum = (ratedVoltage: string, units: string): string => {
  const volts = parseFloat(String(ratedVoltage ?? "").replace(/[^\d.]/g, ""));
  if (isNaN(volts) || volts === 0) return "";
  const megohms = volts <= 250 ? 25 : 100;
  if (units === "GΩ") return String(megohms / 1000);
  if (units === "kΩ") return String(megohms * 1000);
  return String(megohms);
};

/** Every corrected reading in a row must clear the minimum. */
const evaluateInsulationRow = (
  readings: string[],
  minimum: string,
): string => {
  const limit = parseFloat(minimum);
  if (isNaN(limit)) return "";
  const values = readings
    .map((v) => parseFloat(String(v ?? "").replace(/^[<>]/, "")))
    .filter((v) => !isNaN(v));
  if (values.length === 0) return "";
  return values.every((v) => v >= limit) ? "PASS" : "FAIL";
};

// Temperature Correction Factor utilities (aligned with Medium Voltage Cable ATS)
const calculateCorrectedValue = (value: string, tcf: number): string => {
  if (value === "" || value === null || value === undefined) return "";
  const trimmed = String(value).trim();
  const numeric = parseFloat(trimmed);
  if (isNaN(numeric) || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return trimmed;
  if (!tcf || tcf === 0) return numeric.toFixed(2);
  return (numeric * tcf).toFixed(2);
};

const getTCF = (celsius: number): number => {
  const tempFactors = [
    { temp: -24, factor: 0.054 },
    { temp: -23, factor: 0.068 },
    { temp: -22, factor: 0.082 },
    { temp: -21, factor: 0.096 },
    { temp: -20, factor: 0.11 },
    { temp: -19, factor: 0.124 },
    { temp: -18, factor: 0.138 },
    { temp: -17, factor: 0.152 },
    { temp: -16, factor: 0.166 },
    { temp: -15, factor: 0.18 },
    { temp: -14, factor: 0.194 },
    { temp: -13, factor: 0.208 },
    { temp: -12, factor: 0.222 },
    { temp: -11, factor: 0.236 },
    { temp: -10, factor: 0.25 },
    { temp: -9, factor: 0.264 },
    { temp: -8, factor: 0.278 },
    { temp: -7, factor: 0.292 },
    { temp: -6, factor: 0.306 },
    { temp: -5, factor: 0.32 },
    { temp: -4, factor: 0.336 },
    { temp: -3, factor: 0.352 },
    { temp: -2, factor: 0.368 },
    { temp: -1, factor: 0.384 },
    { temp: 0, factor: 0.4 },
    { temp: 1, factor: 0.42 },
    { temp: 2, factor: 0.44 },
    { temp: 3, factor: 0.46 },
    { temp: 4, factor: 0.48 },
    { temp: 5, factor: 0.5 },
    { temp: 6, factor: 0.526 },
    { temp: 7, factor: 0.552 },
    { temp: 8, factor: 0.578 },
    { temp: 9, factor: 0.604 },
    { temp: 10, factor: 0.63 },
    { temp: 11, factor: 0.666 },
    { temp: 12, factor: 0.702 },
    { temp: 13, factor: 0.738 },
    { temp: 14, factor: 0.774 },
    { temp: 15, factor: 0.81 },
    { temp: 16, factor: 0.848 },
    { temp: 17, factor: 0.886 },
    { temp: 18, factor: 0.924 },
    { temp: 19, factor: 0.962 },
    { temp: 20, factor: 1.0 },
    { temp: 21, factor: 1.05 },
    { temp: 22, factor: 1.1 },
    { temp: 23, factor: 1.15 },
    { temp: 24, factor: 1.2 },
    { temp: 25, factor: 1.25 },
    { temp: 26, factor: 1.316 },
    { temp: 27, factor: 1.382 },
    { temp: 28, factor: 1.448 },
    { temp: 29, factor: 1.514 },
    { temp: 30, factor: 1.58 },
    { temp: 31, factor: 1.664 },
    { temp: 32, factor: 1.748 },
    { temp: 33, factor: 1.832 },
    { temp: 34, factor: 1.872 },
    { temp: 35, factor: 2.0 },
    { temp: 36, factor: 2.1 },
    { temp: 37, factor: 2.2 },
    { temp: 38, factor: 2.3 },
    { temp: 39, factor: 2.4 },
    { temp: 40, factor: 2.5 },
    { temp: 41, factor: 2.628 },
    { temp: 42, factor: 2.756 },
    { temp: 43, factor: 2.884 },
    { temp: 44, factor: 3.012 },
    { temp: 45, factor: 3.15 },
    { temp: 46, factor: 3.316 },
    { temp: 47, factor: 3.482 },
    { temp: 48, factor: 3.648 },
    { temp: 49, factor: 3.814 },
    { temp: 50, factor: 3.98 },
    { temp: 51, factor: 4.184 },
    { temp: 52, factor: 4.388 },
    { temp: 53, factor: 4.592 },
    { temp: 54, factor: 4.796 },
    { temp: 55, factor: 5.0 },
    { temp: 56, factor: 5.26 },
    { temp: 57, factor: 5.52 },
    { temp: 58, factor: 5.78 },
    { temp: 59, factor: 6.04 },
    { temp: 60, factor: 6.3 },
  ];
  const exactMatch = tempFactors.find((tf) => tf.temp === celsius);
  if (exactMatch) return exactMatch.factor;
  const lowerFactor = tempFactors.filter((tf) => tf.temp < celsius).pop();
  const upperFactor = tempFactors.find((tf) => tf.temp > celsius);
  if (!lowerFactor || !upperFactor) {
    return tempFactors.reduce((prev, curr) =>
      Math.abs(curr.temp - celsius) < Math.abs(prev.temp - celsius)
        ? curr
        : prev,
    ).factor;
  }
  const range = upperFactor.temp - lowerFactor.temp;
  const ratio = (celsius - lowerFactor.temp) / range;
  return lowerFactor.factor + ratio * (upperFactor.factor - lowerFactor.factor);
};

const LowVoltageAirSwitchMTS23Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  // Auto-save rewrites the URL with history.replaceState once it has created the
  // report, and react-router's params never see that. Fall back to the address
  // bar so a re-render or re-mount recognises the report already on screen
  // instead of creating another one.
  const openReportId = initialReportId ?? reportIdFromUrl();

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    openReportId,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState<boolean>(!openReportId);
  const [status, setStatus] = useState<"PASS" | "FAIL" | "LIMITED SERVICE">("PASS");
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
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

  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get("print") === "true";

  const reportSlug = "low-voltage-air-switch-mts23";
  const reportName = getReportName(reportSlug);

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

    temperature: {
      fahrenheit: 68,
      celsius: 20,
      tcf: 1,
      humidity: 50,
    },

    deviceData: {
      manufacturer: "",
      catalogNumber: "",
      serialNumber: "",
      systemVoltage: "",
      type: "",
      icRating: "",
      ratedVoltage: "",
      ratedCurrent: "",
      phaseConfig: "",
    },

    switchPositions: Array.from({ length: 3 }, () => ({
      position: "",
      manufacturer: "",
      catalogNumber: "",
      serialNumber: "",
      type: "",
      ratedAmperage: "",
      ratedVoltage: "",
    })),

    fusePositions: Array.from({ length: 3 }, () => ({
      position: "",
      manufacturer: "",
      catalogNumber: "",
      fuseClass: "",
      ratedAmperage: "",
      aic: "",
      ratedVoltage: "",
    })),

    contactResistanceEvaluation: {
      switch: { criteria: "<50%", result: "" },
      fuse: { criteria: "<50%", result: "" },
      switchFuse: { criteria: "<50%", result: "" },
    },

    insulationCriteria: {
      units: "MΩ",
      poleToPole: "",
      poleToFrame: "",
      lineToLoad: "",
    },

    testEquipment: {
      lowResistanceOhmmeter: { name: "", serialNumber: "", ampId: "" },
      megohmmeter: { name: "", serialNumber: "", ampId: "" },
    },

    fuseData: {
      manufacturer: "",
      class: "",
      icRating: "",
      catalogNumber: "",
      ampacity: "",
      voltageRating: "",
    },

    visualMechanicalInspection: VISUAL_INSPECTION_SECTIONS.reduce(
      (acc, section) => {
        acc[section] = "";
        return acc;
      },
      {} as { [key: string]: string },
    ),

    insulationResistance: {
      testVoltage: "1000VDC",
      pole1: {
        poleToPole: "",
        poleToFrame: "",
        lineToLoad: "",
        poleToN1: "",
      },
      pole2: {
        poleToPole: "",
        poleToFrame: "",
        lineToLoad: "",
        poleToN1: "",
      },
      pole3: {
        poleToPole: "",
        poleToFrame: "",
        lineToLoad: "",
        poleToN1: "",
      },
    },

    poleResistance: {
      p1AsFound: "",
      p1AsLeft: "",
      p2AsFound: "",
      p2AsLeft: "",
      p3AsFound: "",
      p3AsLeft: "",
      nAsFound: "",
      nAsLeft: "",
      switchAsFound: "",
      switchAsLeft: "",
      fuseSwitchAsFound: "",
      fuseSwitchAsLeft: "",
    },

    poleResistanceDevices: {
      switch: {
        p1AsFound: "",
        p1AsLeft: "",
        p2AsFound: "",
        p2AsLeft: "",
        p3AsFound: "",
        p3AsLeft: "",
        nAsFound: "",
        nAsLeft: "",
      },
      fuse: {
        p1AsFound: "",
        p1AsLeft: "",
        p2AsFound: "",
        p2AsLeft: "",
        p3AsFound: "",
        p3AsLeft: "",
        nAsFound: "",
        nAsLeft: "",
      },
      switchFuse: {
        p1AsFound: "",
        p1AsLeft: "",
        p2AsFound: "",
        p2AsLeft: "",
        p3AsFound: "",
        p3AsLeft: "",
        nAsFound: "",
        nAsLeft: "",
      },
    },

    comments: "",
  });

  // Started from an asset in the Assets tab: fill its identity and nameplate.
  useAssetFormPrefill(openReportId, setFormData);

  // Autofill the "User" header field with the signed-in employee's name (new reports only).
  useReportUserAutofill(setFormData, initialReportId, "user");

  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;

    try {
      setLoading(true);
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select(`title, job_number, customer_id, site_address`)
        .eq("id", jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData) {
        let customerName = "";
        let customerAddress = (jobData as any).site_address || "";

        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select(`name, company_name, address`)
            .eq("id", jobData.customer_id)
            .single();

          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || "";
            if (!customerAddress) customerAddress = customerData.address || "";
          }
        }

        setFormData((prev) => ({
          ...prev,
          customer: maskCustomerName(customerName),
          address: customerAddress,
          jobNumber: jobData.job_number || "",
        }));
      }
    } catch (error) {
      console.error("Error loading job info:", error);
      toast.error(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  const loadReport = useCallback(async () => {
    // CRITICAL: Check this FIRST before checking !currentReportId
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) {
      setLoading(false);
      setIsEditMode(true);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("low_voltage_air_switch_mts23_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) throw error;

      if (data && data.report_data) {
        setFormData((prev) => ({
          ...prev,
          ...data.report_data,
        }));

        if (data.report_data.status) {
          setStatus(data.report_data.status);
        }

        setIsEditMode(false);
      }
      loadFailedRef.current = false;
    } catch (error) {
      // The form is showing defaults, not this report. Auto-save must not push
      // those defaults over the readings that are still in the database.
      loadFailedRef.current = true;
      console.error("Error loading report:", error);
      toast.error(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [currentReportId]);

  useEffect(() => {
    // For new reports, preload job info. For existing reports, do not override
    // fields that will be loaded from the saved report.
    if (!currentReportId) {
      loadJobInfo();
    }
  }, [loadJobInfo, currentReportId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Add print styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; }
        * { color: black !important; }

        /* Form elements - hide interactive indicators */
        input, select, textarea {
          background-color: white !important;
          border: 1px solid black !important;
          color: black !important;
          padding: 2px !important;
          font-size: 10px !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }

        /* Hide dropdown arrows and form control indicators */
        select {
          background-image: none !important;
          padding-right: 8px !important;
        }

        /* Hide spin buttons on number inputs */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        input[type="number"] {
          -moz-appearance: textfield !important;
        }

        /* Table styling */
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid black !important; padding: 4px !important; }
        th { background-color: #f0f0f0 !important; font-weight: bold !important; }

        /* Hide interactive elements */
        button:not(.print-visible) { display: none !important; }

        /* Section styling */
        section { break-inside: avoid !important; margin-bottom: 20px !important; }

        /* Print utility classes */
        .print\\:break-before-page { page-break-before: always; }
        .print\\:break-after-page { page-break-after: always; }
        .print\\:break-inside-avoid { page-break-inside: avoid; }
        .print\\:text-black { color: black !important; }
        .print\\:bg-white { background-color: white !important; }
        .print\\:border-black { border-color: black !important; }
        .print\\:font-bold { font-weight: bold !important; }
        .print\\:text-center { text-align: center !important; }
      }
    `;
    // Tagged so custom-form pages can switch this sheet off; it is global and never removed.
    style.setAttribute("data-report-print", "");
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleChange = (field: string, value: any) => {
    setJustSaved(false);
    if (field.startsWith("deviceData.")) {
      const subField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        deviceData: {
          ...prev.deviceData,
          [subField]: value,
        },
      }));
    } else if (field.startsWith("fuseData.")) {
      const subField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        fuseData: {
          ...prev.fuseData,
          [subField]: value,
        },
      }));
    } else if (field.startsWith("insulationResistance.")) {
      const parts = field.split(".");
      if (parts.length === 2) {
        setFormData((prev) => ({
          ...prev,
          insulationResistance: {
            ...prev.insulationResistance,
            [parts[1]]: value,
          },
        }));
      } else if (parts.length === 3) {
        const pole = parts[1];
        const measurement = parts[2];
        setFormData((prev) => ({
          ...prev,
          insulationResistance: {
            ...prev.insulationResistance,
            [pole]: {
              ...(prev.insulationResistance as any)[pole],
              [measurement]: value,
            },
          },
        }));
      }
    } else if (field.startsWith("poleResistance.")) {
      const subField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        poleResistance: {
          ...prev.poleResistance,
          [subField]: value,
        },
      }));
    } else if (field.startsWith("visualMechanicalInspection.")) {
      const prefix = "visualMechanicalInspection.";
      const sectionKey = field.slice(prefix.length); // preserve full section like 7.5.1.1.A.1
      setFormData((prev) => ({
        ...prev,
        visualMechanicalInspection: {
          ...prev.visualMechanicalInspection,
          [sectionKey]: value,
        },
      }));
    } else if (field.includes(".")) {
      // Any other dotted path: walk it. Writing it flat left the real field
      // untouched, which reads as an input that refuses to accept input.
      const parts = field.split(".");
      setFormData((prev) => {
        const next: any = { ...prev };
        let cursor: any = next;
        for (let i = 0; i < parts.length - 1; i++) {
          cursor[parts[i]] = { ...(cursor[parts[i]] ?? {}) };
          cursor = cursor[parts[i]];
        }
        cursor[parts[parts.length - 1]] = value;
        return next;
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  // Saves must send what is on screen *now*, not what was on screen when the
  // save was queued. A queued save carrying an older snapshot used to land after
  // a newer one and put a half-typed equipment name back on the report.
  const reportDataRef = React.useRef({ formData, status });
  useEffect(() => {
    reportDataRef.current = { formData, status };
  }, [formData, status]);

  /**
   * Writes the report and returns its id. Every save -- auto-save and the Save
   * button -- goes through here, and they all write to one row.
   *
   * The row's id is decided *before* the request leaves the browser and kept in
   * `reportIdRef`, so a save that starts while another is still in flight, or
   * one retried after a failure, upserts over the same row. This used to be an
   * insert guarded by a "am I already creating?" flag, and every way that flag
   * could be lost -- a failed request, a re-mount, a stale closure -- put
   * another copy of the same switch on the job.
   */
  const persistReport = React.useCallback(async () => {
    if (!jobId || !user?.id) return undefined;
    if (loadFailedRef.current) {
      throw new Error(
        "This report could not be loaded, so it was not saved. Reload the page and try again.",
      );
    }

    const { formData, status } = reportDataRef.current;
    const isNewReport = !reportIdRef.current;
    if (isNewReport) {
      // Claimed synchronously: nothing else can now decide to create a row.
      reportIdRef.current = newReportId();
    }
    const reportId = reportIdRef.current as string;

    const { error } = await supabase
      .schema("neta_ops")
      .from("low_voltage_air_switch_mts23_reports")
      .upsert(
        {
          id: reportId,
          job_id: jobId,
          user_id: user.id,
          report_data: { ...formData, status },
          // Only stamped when the row is created; an update must not rewrite it.
          ...(isNewReport ? { created_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (error) throw error;

    if (!assetLinkedRef.current) {
      await ensureReportAssetLink(
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
  }, [jobId, user?.id, reportSlug]);

  // Auto-save function
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

  // Auto-save effect with debounce (MUST be placed AFTER autoSave function definition)
  useEffect(() => {
    if (!isEditMode || loading) return;

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
  }, [formData, status, isEditMode, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    const wasExistingReport = Boolean(reportIdRef.current);

    try {
      setSaving(true);
      const savedId = await persistReport();
      reportSaveSucceeded();
      setJustSaved(true);

      if (!wasExistingReport && savedId) {
        setIsEditMode(false);
        navigate(`/jobs/${jobId}/${reportSlug}/${savedId}`, { replace: true });
      }
    } catch (error: any) {
      reportSaveFailed(error);
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
    if (reportIdRef.current) {
      setIsEditMode(false);
    }
  };

  const renderHeader = () => (
    <ReportHeader
      title={reportName}
      isAutoSaving={isAutoSaving}
      isEditing={isEditMode}
      justSaved={justSaved}
      isSaving={saving}
      status={status}
      hasReport={!!currentReportId}
      onStatusToggle={() => {
        if (isEditMode) {
          setStatus(status === "PASS" ? "FAIL" : status === "FAIL" ? "LIMITED SERVICE" : "PASS");
        }
      }}
      onSave={handleSave}
      onSaveAndClose={handleSaveAndClose}
      onEdit={() => setIsEditMode(true)}
      onBack={() => navigate(`/jobs/${jobId}`)}
      onPrint={() => window.print()}
      isPrintMode={isPrintMode}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - visible only in print */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6">
        <div
          style={{
            width: "120px",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
            alt="AMP Logo"
            className="h-10 w-auto"
            style={{ maxHeight: 35, marginLeft: "5px", marginTop: "2px" }}
          />
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c", width: "120px" }}
        >
          NETA ATS/MTS 7.5.1.1.6
          <div className="hidden print:block mt-2">
            <div
              className={`pass-fail-status-box ${getPassFailBadgeClass(status)}`}
              style={{
                display: "inline-block",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "bold",
                textAlign: "center",
                width: "fit-content",
                borderRadius: "6px",
                border: `2px solid ${status === "PASS" ? "#16a34a" : status === "LIMITED SERVICE" ? "#d97706" : "#dc2626"}`,
                backgroundColor: status === "PASS" ? "#22c55e" : status === "LIMITED SERVICE" ? "#f59e0b" : "#ef4444",
                color: "white",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
                boxSizing: "border-box",
                minWidth: "50px",
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </div>
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {renderHeader()}

          {/* Job Information */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <JobInfoPrintTable
              data={{
                customer: maskCustomerName(formData.customer),
                address: maskCustomerAddress(formData.address),
                jobNumber: formData.jobNumber,
                technicians: formData.technicians,
                date: formData.date,
                identifier: formData.identifier,
                user: formData.user,
                substation: formData.substation,
                eqptLocation: formData.eqptLocation,
                temperature:
                  typeof formData.temperature === "number"
                    ? formData.temperature
                    : {
                        fahrenheit:
                          formData.temperature?.fahrenheit === ""
                            ? undefined
                            : (formData.temperature?.fahrenheit as
                                | number
                                | undefined),
                        celsius:
                          formData.temperature?.celsius === ""
                            ? undefined
                            : (formData.temperature?.celsius as
                                | number
                                | undefined),
                        tcf: formData.temperature?.tcf,
                        humidity:
                          formData.temperature?.humidity === ""
                            ? undefined
                            : (formData.temperature?.humidity as
                                | number
                                | undefined),
                      },
              }}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 print:hidden">
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Customer</label>
                <input
                  type="text"
                  value={maskCustomerName(formData.customer)}
                  onChange={(e) => handleChange("customer", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Job #</label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  onChange={(e) => handleChange("jobNumber", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Site Address
                </label>
                <input
                  type="text"
                  value={maskCustomerAddress(formData.address)}
                  onChange={(e) => handleChange("address", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Technicians
                </label>
                <input
                  type="text"
                  value={formData.technicians}
                  onChange={(e) => handleChange("technicians", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">User</label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) => handleChange("user", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Temp.</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={
                      formData.temperature?.fahrenheit === ""
                        ? ""
                        : formData.temperature?.fahrenheit || 68
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setFormData((prev) => ({
                          ...prev,
                          temperature: {
                            fahrenheit: "",
                            celsius: "",
                            tcf: prev.temperature?.tcf ?? 1,
                            humidity: prev.temperature?.humidity ?? "",
                          },
                        }));
                        return;
                      }
                      const fahrenheit = Number(raw);
                      const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
                      const tcf = getTCF(celsius);
                      setFormData((prev) => ({
                        ...prev,
                        temperature: {
                          fahrenheit,
                          celsius,
                          tcf,
                          humidity: prev.temperature?.humidity ?? "",
                        },
                      }));
                    }}
                    readOnly={!isEditMode}
                    className={`form-input w-24 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                  />
                  <span>°F</span>
                  <span>
                    {formData.temperature?.celsius === ""
                      ? ""
                      : formData.temperature?.celsius || 20}
                  </span>
                  <span>°C</span>
                  <span className="ml-4">TCF</span>
                  <input
                    type="text"
                    value={(formData.temperature?.tcf ?? 1).toFixed(3)}
                    readOnly
                    className="form-input w-20 bg-neutral-100 dark:bg-dark-200"
                  />
                </div>
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange("date", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Humidity</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={
                      formData.temperature?.humidity === ""
                        ? ""
                        : (formData.temperature?.humidity ?? "")
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        temperature: {
                          fahrenheit:
                            prev.temperature?.fahrenheit === ""
                              ? ""
                              : (prev.temperature?.fahrenheit ?? 68),
                          celsius:
                            prev.temperature?.celsius === ""
                              ? ""
                              : (prev.temperature?.celsius ?? 20),
                          tcf: prev.temperature?.tcf ?? 1,
                          humidity:
                            e.target.value === "" ? "" : Number(e.target.value),
                        },
                      }))
                    }
                    readOnly={!isEditMode}
                    className={`form-input w-24 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Identifier
                </label>
                <input
                  type="text"
                  value={formData.identifier}
                  onChange={(e) => handleChange("identifier", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Substation
                </label>
                <input
                  type="text"
                  value={formData.substation}
                  onChange={(e) => handleChange("substation", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Eqpt. Location
                </label>
                <input
                  type="text"
                  value={formData.eqptLocation}
                  onChange={(e) => handleChange("eqptLocation", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
            </div>
          </section>

          {/* Device Data */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Device Data
            </h2>
            {/* On-screen grid */}
            <div className="grid grid-cols-2 gap-4 print:hidden">
              <div className="flex items-center">
                <label
                  htmlFor="deviceManufacturer"
                  className="form-label inline-block w-32"
                >
                  Manufacturer:
                </label>
                <input
                  id="deviceManufacturer"
                  type="text"
                  value={formData.deviceData.manufacturer}
                  onChange={(e) =>
                    handleChange("deviceData.manufacturer", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceType"
                  className="form-label inline-block w-32"
                >
                  Type:
                </label>
                <input
                  id="deviceType"
                  type="text"
                  value={formData.deviceData.type}
                  onChange={(e) =>
                    handleChange("deviceData.type", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceCatalogNumber"
                  className="form-label inline-block w-32"
                >
                  Catalog Number:
                </label>
                <input
                  id="deviceCatalogNumber"
                  type="text"
                  value={formData.deviceData.catalogNumber}
                  onChange={(e) =>
                    handleChange("deviceData.catalogNumber", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceIcRating"
                  className="form-label inline-block w-32"
                >
                  I.C. Rating:
                </label>
                <input
                  id="deviceIcRating"
                  type="text"
                  value={formData.deviceData.icRating}
                  onChange={(e) =>
                    handleChange("deviceData.icRating", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceSerialNumber"
                  className="form-label inline-block w-32"
                >
                  Serial Number:
                </label>
                <input
                  id="deviceSerialNumber"
                  type="text"
                  value={formData.deviceData.serialNumber}
                  onChange={(e) =>
                    handleChange("deviceData.serialNumber", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceRatedVoltage"
                  className="form-label inline-block w-32"
                >
                  Rated Voltage:
                </label>
                <input
                  id="deviceRatedVoltage"
                  type="text"
                  value={formData.deviceData.ratedVoltage}
                  onChange={(e) =>
                    handleChange("deviceData.ratedVoltage", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceSystemVoltage"
                  className="form-label inline-block w-32"
                >
                  System Voltage:
                </label>
                <input
                  id="deviceSystemVoltage"
                  type="text"
                  value={formData.deviceData.systemVoltage}
                  onChange={(e) =>
                    handleChange("deviceData.systemVoltage", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceRatedCurrent"
                  className="form-label inline-block w-32"
                >
                  Rated Current (A):
                </label>
                <input
                  id="deviceRatedCurrent"
                  type="text"
                  value={formData.deviceData.ratedCurrent}
                  onChange={(e) =>
                    handleChange("deviceData.ratedCurrent", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="devicePhaseConfig"
                  className="form-label inline-block w-32"
                >
                  Phase Config.:
                </label>
                <input
                  id="devicePhaseConfig"
                  type="text"
                  value={formData.deviceData.phaseConfig}
                  onChange={(e) =>
                    handleChange("deviceData.phaseConfig", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
            </div>
            {/* Print-only device table */}
            <div className="hidden print:block">
              <table className="w-full border-collapse border border-black">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">
                        {formData.deviceData.manufacturer}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Type:</div>
                      <div className="mt-1">{formData.deviceData.type}</div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Catalog Number:</div>
                      <div className="mt-1">
                        {formData.deviceData.catalogNumber}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">I.C. Rating:</div>
                      <div className="mt-1">{formData.deviceData.icRating}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-1">
                        {formData.deviceData.serialNumber}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Rated Voltage:</div>
                      <div className="mt-1">
                        {formData.deviceData.ratedVoltage}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">System Voltage:</div>
                      <div className="mt-1">
                        {formData.deviceData.systemVoltage}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Phase Config.:</div>
                      <div className="mt-1">
                        {formData.deviceData.phaseConfig}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Fuse Data */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Fuse Data
            </h2>
            {/* On-screen grid */}
            <div className="grid grid-cols-2 gap-4 print:hidden">
              <div className="flex items-center">
                <label
                  htmlFor="fuseManufacturer"
                  className="form-label inline-block w-32"
                >
                  Manufacturer:
                </label>
                <input
                  id="fuseManufacturer"
                  type="text"
                  value={formData.fuseData.manufacturer}
                  onChange={(e) =>
                    handleChange("fuseData.manufacturer", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseCatalogNumber"
                  className="form-label inline-block w-32"
                >
                  Catalog Number:
                </label>
                <input
                  id="fuseCatalogNumber"
                  type="text"
                  value={formData.fuseData.catalogNumber}
                  onChange={(e) =>
                    handleChange("fuseData.catalogNumber", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseClass"
                  className="form-label inline-block w-32"
                >
                  Class:
                </label>
                <input
                  id="fuseClass"
                  type="text"
                  value={formData.fuseData.class}
                  onChange={(e) =>
                    handleChange("fuseData.class", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseAmpacity"
                  className="form-label inline-block w-32"
                >
                  Ampacity:
                </label>
                <input
                  id="fuseAmpacity"
                  type="text"
                  value={formData.fuseData.ampacity}
                  onChange={(e) =>
                    handleChange("fuseData.ampacity", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseIcRating"
                  className="form-label inline-block w-32"
                >
                  I.C. Rating:
                </label>
                <input
                  id="fuseIcRating"
                  type="text"
                  value={formData.fuseData.icRating}
                  onChange={(e) =>
                    handleChange("fuseData.icRating", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseVoltageRating"
                  className="form-label inline-block w-32"
                >
                  Voltage Rating:
                </label>
                <input
                  id="fuseVoltageRating"
                  type="text"
                  value={formData.fuseData.voltageRating}
                  onChange={(e) =>
                    handleChange("fuseData.voltageRating", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                />
              </div>
            </div>
            {/* Print-only fuse table */}
            <div className="hidden print:block">
              <table className="w-full border-collapse border border-black">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">
                        {formData.fuseData.manufacturer}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Catalog Number:</div>
                      <div className="mt-1">
                        {formData.fuseData.catalogNumber}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Class:</div>
                      <div className="mt-1">{formData.fuseData.class}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Voltage Rating:</div>
                      <div className="mt-1">
                        {formData.fuseData.voltageRating}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Ampacity:</div>
                      <div className="mt-1">{formData.fuseData.ampacity}</div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">I.C. Rating:</div>
                      <div className="mt-1">{formData.fuseData.icRating}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Switch Data: one row per position, as the sheet has it */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Switch Data
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Position / Identifier
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Manufacturer
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Catalog No.
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Serial No.
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Type
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Rated Amperage
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Rated Voltage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.switchPositions.map((row, index) => (
                    <tr key={`switchPositions-${index}`}>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.position}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], position: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.manufacturer}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], manufacturer: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.catalogNumber}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], catalogNumber: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.serialNumber}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], serialNumber: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.type}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], type: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.ratedAmperage}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], ratedAmperage: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.ratedVoltage}
                          onChange={(e) => {
                            const rows = [...formData.switchPositions];
                            rows[index] = { ...rows[index], ratedVoltage: e.target.value };
                            setFormData((prev) => ({ ...prev, switchPositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isEditMode && (
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    switchPositions: [
                      ...prev.switchPositions,
                      { position: "", manufacturer: "", catalogNumber: "", serialNumber: "", type: "", ratedAmperage: "", ratedVoltage: "" },
                    ],
                  }))
                }
                className="mt-2 px-3 py-1 text-sm border border-neutral-300 dark:border-neutral-600 print:hidden"
              >
                Add position
              </button>
            )}
          </div>

          {/* Fuse Data (by position): one row per position, as the sheet has it */}
          <div className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Fuse Data (by position)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Position / Identifier
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Manufacturer
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Catalog No.
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Class
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Rated Amperage
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      AIC
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Rated Voltage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.fusePositions.map((row, index) => (
                    <tr key={`fusePositions-${index}`}>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.position}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], position: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.manufacturer}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], manufacturer: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.catalogNumber}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], catalogNumber: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.fuseClass}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], fuseClass: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.ratedAmperage}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], ratedAmperage: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.aic}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], aic: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-1">
                        <input
                          type="text"
                          value={row.ratedVoltage}
                          onChange={(e) => {
                            const rows = [...formData.fusePositions];
                            rows[index] = { ...rows[index], ratedVoltage: e.target.value };
                            setFormData((prev) => ({ ...prev, fusePositions: rows }));
                          }}
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isEditMode && (
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    fusePositions: [
                      ...prev.fusePositions,
                      { position: "", manufacturer: "", catalogNumber: "", fuseClass: "", ratedAmperage: "", aic: "", ratedVoltage: "" },
                    ],
                  }))
                }
                className="mt-2 px-3 py-1 text-sm border border-neutral-300 dark:border-neutral-600 print:hidden"
              >
                Add position
              </button>
            )}
          </div>

          {/* Visual and Mechanical Inspection */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "65%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-neutral-50 dark:bg-dark-200">
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-left text-neutral-900 dark:text-white w-40">
                      Section
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-left text-neutral-900 dark:text-white">
                      Description
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white w-48">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {VISUAL_INSPECTION_SECTIONS.map((sectionCode) => (
                    <tr key={sectionCode}>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        {sectionCode}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        {getVisualInspectionDescription(sectionCode)}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center">
                        <div className="print:hidden">
                          <select
                            value={
                              formData.visualMechanicalInspection[
                                sectionCode
                              ] || ""
                            }
                            onChange={(e) =>
                              handleChange(
                                `visualMechanicalInspection.${sectionCode}`,
                                e.target.value,
                              )
                            }
                            disabled={!isEditMode}
                            className={`form-select w-full text-center ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                          >
                            {VISUAL_INSPECTION_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.visualMechanicalInspection[sectionCode] ||
                            ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Results */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Results
            </h2>

            {/* Insulation Resistance */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-neutral-900 dark:text-white">
                Insulation Resistance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                  <thead>
                    <tr className="bg-neutral-50 dark:bg-dark-200">
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        Insulation Resistance
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        Pole 1 MΩ
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        Pole 2 MΩ
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        Pole 3 MΩ
                      </th>
                    </tr>
                    <tr className="bg-neutral-50 dark:bg-dark-200">
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"></th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"></th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Reading
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        20°C
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Reading
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        20°C
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Reading
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        20°C
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Test Voltage
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <select
                          value={formData.insulationResistance.testVoltage}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.testVoltage",
                              e.target.value,
                            )
                          }
                          disabled={!isEditMode}
                          className={`form-select w-full min-w-[6.5rem] ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        >
                          {TEST_VOLTAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className="border border-neutral-300 dark:border-neutral-600 p-2"
                        colSpan={6}
                      ></td>
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Pole to Pole
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Closed
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole1.poleToPole}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.poleToPole",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.poleToPole,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole2.poleToPole}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.poleToPole",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.poleToPole,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole3.poleToPole}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.poleToPole",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.poleToPole,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Pole to Frame
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Closed
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.insulationResistance.pole1.poleToFrame
                          }
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.poleToFrame",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.poleToFrame,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.insulationResistance.pole2.poleToFrame
                          }
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.poleToFrame",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.poleToFrame,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.insulationResistance.pole3.poleToFrame
                          }
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.poleToFrame",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.poleToFrame,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Line to Load
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Open
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole1.lineToLoad}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.lineToLoad",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.lineToLoad,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole2.lineToLoad}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.lineToLoad",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.lineToLoad,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole3.lineToLoad}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.lineToLoad",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.lineToLoad,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 100.1 minimum, from the device's rated voltage */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-neutral-900 dark:text-white">
                Table 100.1 Criteria
              </h3>
              {(() => {
                const minimum = insulationMinimum(
                  formData.deviceData.ratedVoltage,
                  formData.insulationCriteria.units,
                );
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                      <thead className="bg-neutral-50 dark:bg-dark-200">
                        <tr>
                          <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                            Test Points
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                            Minimum
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                            Units
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Pole to Pole
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        ≥ {minimum || "—"}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        {formData.insulationCriteria.units}
                      </td>
                      {(() => {
                        const result = evaluateInsulationRow(
                          [
                            calculateCorrectedValue(
                              formData.insulationResistance.pole1.poleToPole,
                              formData.temperature?.tcf ?? 1,
                            ),
                            calculateCorrectedValue(
                              formData.insulationResistance.pole2.poleToPole,
                              formData.temperature?.tcf ?? 1,
                            ),
                            calculateCorrectedValue(
                              formData.insulationResistance.pole3.poleToPole,
                              formData.temperature?.tcf ?? 1,
                            ),
                          ],
                          minimum,
                        );
                        return (
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 p-2 text-center font-medium ${result === "PASS" ? "text-green-600 dark:text-green-400" : result === "FAIL" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}
                          >
                            {result}
                          </td>
                        );
                      })()}
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Pole to Frame
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        ≥ {minimum || "—"}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        {formData.insulationCriteria.units}
                      </td>
                      {(() => {
                        const result = evaluateInsulationRow(
                          [
                            calculateCorrectedValue(
                              formData.insulationResistance.pole1.poleToFrame,
                              formData.temperature?.tcf ?? 1,
                            ),
                            calculateCorrectedValue(
                              formData.insulationResistance.pole2.poleToFrame,
                              formData.temperature?.tcf ?? 1,
                            ),
                            calculateCorrectedValue(
                              formData.insulationResistance.pole3.poleToFrame,
                              formData.temperature?.tcf ?? 1,
                            ),
                          ],
                          minimum,
                        );
                        return (
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 p-2 text-center font-medium ${result === "PASS" ? "text-green-600 dark:text-green-400" : result === "FAIL" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}
                          >
                            {result}
                          </td>
                        );
                      })()}
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Line to Load
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        ≥ {minimum || "—"}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        {formData.insulationCriteria.units}
                      </td>
                      {(() => {
                        const result = evaluateInsulationRow(
                          [
                            calculateCorrectedValue(
                              formData.insulationResistance.pole1.lineToLoad,
                              formData.temperature?.tcf ?? 1,
                            ),
                            calculateCorrectedValue(
                              formData.insulationResistance.pole2.lineToLoad,
                              formData.temperature?.tcf ?? 1,
                            ),
                            calculateCorrectedValue(
                              formData.insulationResistance.pole3.lineToLoad,
                              formData.temperature?.tcf ?? 1,
                            ),
                          ],
                          minimum,
                        );
                        return (
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 p-2 text-center font-medium ${result === "PASS" ? "text-green-600 dark:text-green-400" : result === "FAIL" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}
                          >
                            {result}
                          </td>
                        );
                      })()}
                    </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 print:hidden">
                25 MΩ at 250 V and below, 100 MΩ above, taken from Rated Voltage
                in Device Data. Compared against the temperature-corrected values.
              </p>
            </div>

            {/* Pole Resistance */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-neutral-900 dark:text-white">
                Pole Resistance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                  <thead>
                    <tr className="bg-neutral-50 dark:bg-dark-200">
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        rowSpan={2}
                      >
                        Pole Resistance
                        <div className="text-sm font-normal">
                          Resistance in Micro-ohms
                        </div>
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        P1
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        P2
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        P3
                      </th>
                      <th
                        className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white"
                        colSpan={2}
                      >
                        N
                      </th>
                    </tr>
                    <tr className="bg-neutral-50 dark:bg-dark-200">
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Left
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Left
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Left
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        As Left
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Switch
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p1AsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p1AsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p1AsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p1AsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p2AsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p2AsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p2AsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p2AsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p3AsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p3AsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p3AsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p3AsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.nAsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.nAsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.nAsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.nAsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Fuse
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p1AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p1AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p1AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p1AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p2AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p2AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p2AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p2AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p3AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p3AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p3AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p3AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.nAsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  nAsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.nAsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  nAsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Switch + Fuse
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p1AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p1AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p1AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p1AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p2AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p2AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p2AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p2AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p3AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p3AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p3AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p3AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .nAsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  nAsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .nAsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  nAsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Contact resistance deviation, per the sheet's <50% criteria */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Contact Resistance Evaluation
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Group
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Measured Deviation
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Criteria
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Switch
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        {calculateGroupDeviation(
                          formData.poleResistance.p1AsLeft ||
                            formData.poleResistance.p1AsFound ||
                            "",
                          formData.poleResistance.p2AsLeft ||
                            formData.poleResistance.p2AsFound ||
                            "",
                          formData.poleResistance.p3AsLeft ||
                            formData.poleResistance.p3AsFound ||
                            "",
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <select
                          value={formData.contactResistanceEvaluation.switch.criteria}
                          onChange={(e) =>
                            handleChange(
                              "contactResistanceEvaluation.switch.criteria",
                              e.target.value,
                            )
                          }
                          disabled={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        >
                          {["<50%", "N/A"].map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(() => {
                        const result = evaluateGroupDeviation(
                          calculateGroupDeviation(
                            formData.poleResistance.p1AsLeft ||
                              formData.poleResistance.p1AsFound ||
                              "",
                            formData.poleResistance.p2AsLeft ||
                              formData.poleResistance.p2AsFound ||
                              "",
                            formData.poleResistance.p3AsLeft ||
                              formData.poleResistance.p3AsFound ||
                              "",
                          ),
                          formData.contactResistanceEvaluation.switch.criteria,
                        );
                        return (
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 p-2 text-center font-medium ${result === "PASS" ? "text-green-600 dark:text-green-400" : result === "FAIL" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}
                          >
                            {result}
                          </td>
                        );
                      })()}
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Fuse
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        {calculateGroupDeviation(
                          formData.poleResistanceDevices?.fuse.p1AsLeft ||
                            formData.poleResistanceDevices?.fuse.p1AsFound ||
                            "",
                          formData.poleResistanceDevices?.fuse.p2AsLeft ||
                            formData.poleResistanceDevices?.fuse.p2AsFound ||
                            "",
                          formData.poleResistanceDevices?.fuse.p3AsLeft ||
                            formData.poleResistanceDevices?.fuse.p3AsFound ||
                            "",
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <select
                          value={formData.contactResistanceEvaluation.fuse.criteria}
                          onChange={(e) =>
                            handleChange(
                              "contactResistanceEvaluation.fuse.criteria",
                              e.target.value,
                            )
                          }
                          disabled={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        >
                          {["<50%", "N/A"].map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(() => {
                        const result = evaluateGroupDeviation(
                          calculateGroupDeviation(
                            formData.poleResistanceDevices?.fuse.p1AsLeft ||
                              formData.poleResistanceDevices?.fuse.p1AsFound ||
                              "",
                            formData.poleResistanceDevices?.fuse.p2AsLeft ||
                              formData.poleResistanceDevices?.fuse.p2AsFound ||
                              "",
                            formData.poleResistanceDevices?.fuse.p3AsLeft ||
                              formData.poleResistanceDevices?.fuse.p3AsFound ||
                              "",
                          ),
                          formData.contactResistanceEvaluation.fuse.criteria,
                        );
                        return (
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 p-2 text-center font-medium ${result === "PASS" ? "text-green-600 dark:text-green-400" : result === "FAIL" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}
                          >
                            {result}
                          </td>
                        );
                      })()}
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-neutral-900 dark:text-white">
                        Switch + Fuse
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-center text-neutral-900 dark:text-white">
                        {calculateGroupDeviation(
                          formData.poleResistanceDevices?.switchFuse.p1AsLeft ||
                            formData.poleResistanceDevices?.switchFuse.p1AsFound ||
                            "",
                          formData.poleResistanceDevices?.switchFuse.p2AsLeft ||
                            formData.poleResistanceDevices?.switchFuse.p2AsFound ||
                            "",
                          formData.poleResistanceDevices?.switchFuse.p3AsLeft ||
                            formData.poleResistanceDevices?.switchFuse.p3AsFound ||
                            "",
                        )}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2">
                        <select
                          value={formData.contactResistanceEvaluation.switchFuse.criteria}
                          onChange={(e) =>
                            handleChange(
                              "contactResistanceEvaluation.switchFuse.criteria",
                              e.target.value,
                            )
                          }
                          disabled={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                        >
                          {["<50%", "N/A"].map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(() => {
                        const result = evaluateGroupDeviation(
                          calculateGroupDeviation(
                            formData.poleResistanceDevices?.switchFuse.p1AsLeft ||
                              formData.poleResistanceDevices?.switchFuse.p1AsFound ||
                              "",
                            formData.poleResistanceDevices?.switchFuse.p2AsLeft ||
                              formData.poleResistanceDevices?.switchFuse.p2AsFound ||
                              "",
                            formData.poleResistanceDevices?.switchFuse.p3AsLeft ||
                              formData.poleResistanceDevices?.switchFuse.p3AsFound ||
                              "",
                          ),
                          formData.contactResistanceEvaluation.switchFuse.criteria,
                        );
                        return (
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 p-2 text-center font-medium ${result === "PASS" ? "text-green-600 dark:text-green-400" : result === "FAIL" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-white"}`}
                          >
                            {result}
                          </td>
                        );
                      })()}
                    </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 print:hidden">
              Deviation uses the as-left readings where present, otherwise as-found.
            </p>
          </section>

          {/* Test Equipment Used */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white w-1/3">
                      Equipment
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Name / Model
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      Serial Number
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 p-2 text-xs font-medium text-neutral-700 dark:text-white">
                      AMP ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["lowResistanceOhmmeter", "Low Resistance Ohmmeter"],
                      ["megohmmeter", "Megohmmeter"],
                    ] as const
                  ).map(([key, label]) => (
                    <tr key={key}>
                      <td className="border border-neutral-300 dark:border-neutral-600 p-2 text-sm text-neutral-900 dark:text-white">
                        {label}
                      </td>
                      {(
                        [
                          ["name", "name"],
                          ["serialNumber", "serialNumber"],
                          ["ampId", "ampId"],
                        ] as const
                      ).map(([field]) => (
                        <td
                          key={field}
                          className="border border-neutral-300 dark:border-neutral-600 p-1"
                        >
                          <input
                            type="text"
                            value={formData.testEquipment[key][field]}
                            onChange={(e) =>
                              handleChange(
                                `testEquipment.${key}.${field}`,
                                e.target.value,
                              )
                            }
                            readOnly={!isEditMode}
                            className={`form-input w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Comments */}
          <section
            className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments:
            </h2>
            <div className="print:hidden">
              <textarea
                value={formData.comments}
                onChange={(e) => handleChange("comments", e.target.value)}
                readOnly={!isEditMode}
                rows={6}
                className={`form-textarea w-full ${!isEditMode ? "bg-neutral-100 dark:bg-dark-200" : ""}`}
              />
            </div>
            {formData.comments?.trim() && (
              <div className="hidden print:block">
                <table className="min-w-full border-collapse border border-black">
                  <thead>
                    <tr>
                      <th className="px-3 py-1 bg-neutral-50 text-center text-xs font-semibold text-black border border-black">
                        Comments
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-black text-black text-sm min-h-[80px] align-top">
                        {formData.comments}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>{" "}
      {/* Mark Ready to Review Button */}
      {!isPrintMode && isEditMode && (
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

export default LowVoltageAirSwitchMTS23Report;
