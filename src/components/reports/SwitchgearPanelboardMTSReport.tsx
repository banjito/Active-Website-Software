import React, { useState, useEffect, useCallback } from "react";
import { ReportHeader } from "@/components/reports/common/ReportHeader";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { navigateAfterSave } from "./ReportUtils";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { getReportName, getAssetName } from "./reportMappings";
import NameplatePrintTable from "./common/NameplatePrintTable";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Temperature conversion and correction factor lookup tables
const TCF_TABLE: { [key: string]: number } = {
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
  "71": 10.52,
  "72": 11.04,
  "73": 11.56,
  "74": 12.08,
  "75": 12.6,
  "76": 13.24,
  "77": 13.88,
  "78": 14.52,
  "79": 15.16,
  "80": 15.8,
  "81": 16.64,
  "82": 17.48,
  "83": 18.32,
  "84": 19.16,
  "85": 20,
  "86": 21.04,
  "87": 22.08,
  "88": 23.12,
  "89": 24.16,
  "90": 25.2,
  "91": 26.45,
  "92": 27.7,
  "93": 28.95,
  "94": 30.2,
  "95": 31.6,
  "96": 33.28,
  "97": 34.96,
  "98": 36.64,
  "99": 38.32,
  "100": 40,
  "101": 42.08,
  "102": 44.16,
  "103": 46.24,
  "104": 48.32,
  "105": 50.4,
  "106": 52.96,
  "107": 55.52,
  "108": 58.08,
  "109": 60.64,
  "110": 63.2,
};

const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  return TCF_TABLE[roundedCelsius.toString()] ?? 1;
};

// Dropdown Options
const VISUAL_INSPECTION_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];
const INSULATION_RESISTANCE_UNITS = ["kΩ", "MΩ", "GΩ"];
const INSULATION_RESISTANCE_TEST_VOLTAGES = [
  "250V",
  "500V",
  "1000V",
  "2500V",
  "5000V",
];
const CONTACT_RESISTANCE_UNITS = ["µΩ", "mΩ", "Ω"];
const DIELECTRIC_WITHSTAND_UNITS = ["µA", "mA"];
const DIELECTRIC_WITHSTAND_TEST_VOLTAGES = [
  "1.6 kVAC",
  "2.2 kVAC",
  "14 kVAC",
  "27 kVAC",
  "37 kVAC",
  "45 kVAC",
  "60 kVAC",
  "120 kVAC",
  "2.3 kVDC",
  "3.1 kVDC",
  "20 kVDC",
  "37.5 kVDC",
];
const EQUIPMENT_EVALUATION_RESULTS = ["PASS", "FAIL"];

interface InsulationResistanceRow {
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

interface ContactResistanceRow {
  busSection: string;
  aPhase: string;
  bPhase: string;
  cPhase: string;
  neutral: string;
  ground: string;
}

interface DielectricWithstandRow {
  busSection: string;
  ag: string;
  bg: string;
  cg: string;
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
    humidity: number;
  };
  substation: string;
  eqptLocation: string;
  status: "PASS" | "FAIL" | "LIMITED SERVICE";

  nameplate: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    series: string;
    type: string;
    systemVoltage: string;
    ratedVoltage: string;
    ratedCurrent: string;
    aicRating: string;
    phaseConfiguration: string;
  };

  visualInspectionItems: Array<{
    id: string; // NETA Section
    description: string;
    result: string;
  }>;

  measuredInsulationResistance: InsulationResistanceRow[];
  insulationResistanceUnit: string;
  insulationResistanceTestVoltage: string;

  tempCorrectedInsulationResistance: InsulationResistanceRow[];

  contactResistanceTests: ContactResistanceRow[];
  contactResistanceUnit: string;

  dielectricWithstandTests: DielectricWithstandRow[];
  dielectricWithstandUnit: string;
  dielectricWithstandTestVoltage: string;

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

const initialVisualInspectionItems = [
  {
    id: "7.1.A.1",
    description: "Inspect physical, electrical, and mechanical condition.",
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
    description: "Prior to cleaning the unit, perform as-found tests.",
    result: "Select One",
  },
  { id: "7.1.A.4", description: "Clean the unit.", result: "Select One" },
  {
    id: "7.1.A.5",
    description:
      "Verify that fuse and/or circuit breaker sizes and types correspond to drawings and coordination study as well as to the circuit breaker address for microprocessorcommunication packages.",
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
      "Use of a low-resistance ohmmeter in accordance with Section 7.1.B.1.",
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
    description: "Exercise all active components.",
    result: "Select One",
  },
  {
    id: "7.1.A.14",
    description: "Inspect mechanical indicating devices for correct operation.",
    result: "Select One",
  },
  {
    id: "7.1.A.15",
    description:
      "Verify that filters are in place, filters are clean and free from debris, and vents are clear",
    result: "Select One",
  },
];

const initialInsulationRow: InsulationResistanceRow = {
  busSection: "",
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

const initialContactResistanceRow: ContactResistanceRow = {
  busSection: "",
  aPhase: "",
  bPhase: "",
  cPhase: "",
  neutral: "",
  ground: "",
};

const initialDielectricWithstandRow: DielectricWithstandRow = {
  busSection: "",
  ag: "",
  bg: "",
  cg: "",
};

const defaultBusSections = [
  "Bus 1",
  "Bus 2",
  "Bus 3",
  "Bus 4",
  "Bus 5",
  "Bus 6",
];

const SwitchgearPanelboardMTSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [justSaved, setJustSaved] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);

  const waitForCreatedReportId = React.useCallback(async () => {
    if (reportIdRef.current) return reportIdRef.current;
    if (!creatingRef.current) return undefined;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (reportIdRef.current) return reportIdRef.current;
    }

    return undefined;
  }, []);

  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get("print") === "true";

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = "switchgear-panelboard-mts-report"; // This component handles the switchgear-panelboard-mts-report route
  const reportName = getReportName(reportSlug);

  const [formData, setFormData] = useState<FormData>({
    customerName: "",
    customerLocation: "",
    userName: "",
    date: new Date().toISOString().split("T")[0],
    identifier: "",
    jobNumber: "",
    technicians: "",
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50 },
    substation: "",
    eqptLocation: "",
    status: "PASS" as "PASS" | "FAIL" | "LIMITED SERVICE",
    nameplate: {
      manufacturer: "",
      catalogNumber: "",
      serialNumber: "",
      series: "",
      type: "",
      systemVoltage: "",
      ratedVoltage: "",
      ratedCurrent: "",
      aicRating: "",
      phaseConfiguration: "",
    },
    visualInspectionItems: JSON.parse(
      JSON.stringify(initialVisualInspectionItems),
    ), // Deep copy
    measuredInsulationResistance: defaultBusSections.map((bus) => ({
      ...initialInsulationRow,
      busSection: bus,
    })),
    insulationResistanceUnit: "MΩ",
    insulationResistanceTestVoltage: "1000V",
    tempCorrectedInsulationResistance: defaultBusSections.map((bus) => ({
      ...initialInsulationRow,
      busSection: bus,
    })),
    contactResistanceTests: defaultBusSections.map((bus) => ({
      ...initialContactResistanceRow,
      busSection: bus,
    })),
    contactResistanceUnit: "µΩ",
    dielectricWithstandTests: defaultBusSections.map((bus) => ({
      ...initialDielectricWithstandRow,
      busSection: bus,
    })),
    dielectricWithstandUnit: "µA",
    dielectricWithstandTestVoltage: "2.2 kVAC",
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

      if (jobData) {
        let customerName = "";
        let customerAddress = (jobData as any).site_address || "";
        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select("name, company_name, address")
            .eq("id", jobData.customer_id)
            .single();
          if (customerError) throw customerError;
          if (customerData) {
            customerName = customerData.company_name || customerData.name || "";
            if (!customerAddress) customerAddress = customerData.address || "";
          }
        }
        setFormData((prev) => ({
          ...prev,
          jobNumber: jobData.job_number || "",
          customerName: maskCustomerName(customerName),
          customerLocation: prev.customerLocation || maskCustomerAddress(customerAddress),
        }));
      }
    } catch (error) {
      console.error("Error loading job info:", error);
      alert(`Failed to load job info: ${(error as Error).message}`);
    }
  }, [jobId]);

  const loadReport = useCallback(async () => {
    // Don't reload if we just created the report via autosave
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) {
      console.log(
        "No currentReportId - setting up new report with PASS status",
      );
      setFormData((prev) => ({ ...prev, status: "PASS" }));
      setIsEditing(true);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("switchgear_panelboard_mts_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();
      if (error) {
        if (error.code === "PGRST116") {
          // Not found
          setIsEditing(true);
        } else {
          throw error;
        }
      }
      if (data) {
        // Ensure all nested structures are present even if DB returns null for some
        const loadedData = data.report_data;

        // Ensure status is valid - add debugging
        console.log("Loaded status:", loadedData.status);
        const validStatus =
          (loadedData.status as "PASS" | "FAIL" | "LIMITED SERVICE") || "PASS";
        console.log("Valid status:", validStatus);

        setFormData((prev) => ({
          ...prev, // Start with default structure
          ...loadedData, // Load all top-level fields
          status: validStatus, // Ensure status is properly set
          temperature: { ...prev.temperature, ...loadedData.temperature },
          nameplate: { ...prev.nameplate, ...loadedData.nameplate },
          visualInspectionItems:
            loadedData.visualInspectionItems ||
            JSON.parse(JSON.stringify(initialVisualInspectionItems)),
          measuredInsulationResistance:
            loadedData.measuredInsulationResistance ||
            defaultBusSections.map((bus) => ({
              ...initialInsulationRow,
              busSection: bus,
            })),
          tempCorrectedInsulationResistance:
            loadedData.tempCorrectedInsulationResistance ||
            defaultBusSections.map((bus) => ({
              ...initialInsulationRow,
              busSection: bus,
            })),
          contactResistanceTests:
            loadedData.contactResistanceTests ||
            defaultBusSections.map((bus) => ({
              ...initialContactResistanceRow,
              busSection: bus,
            })),
          dielectricWithstandTests:
            loadedData.dielectricWithstandTests ||
            defaultBusSections.map((bus) => ({
              ...initialDielectricWithstandRow,
              busSection: bus,
            })),
          testEquipment: {
            megohmmeter: {
              ...prev.testEquipment.megohmmeter,
              ...loadedData.testEquipment?.megohmmeter,
            },
            lowResistanceOhmmeter: {
              ...prev.testEquipment.lowResistanceOhmmeter,
              ...loadedData.testEquipment?.lowResistanceOhmmeter,
            },
            hipot: {
              ...prev.testEquipment.hipot,
              ...loadedData.testEquipment?.hipot,
            },
          },
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error loading report:", error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  }, [currentReportId]);

  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, currentReportId, loadJobInfo, loadReport]);

  // Debug status changes
  useEffect(() => {
    console.log("Status changed to:", formData.status);
  }, [formData.status]);

  // Add print styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif !important; }
        html, body { font-size: 9px !important; color: black !important; background: white !important; line-height: 1 !important; }

        /* Hide all navigation and header elements */
        header, nav, .navigation, [class*="nav"], [class*="header"],
        .sticky, [class*="sticky"], .print\\:hidden {
          display: none !important;
        }

        /* Hide Back to Job button and division headers specifically */
        button[class*="Back"],
        *[class*="Back to Job"],
        h2[class*="Division"],
        .mobile-nav-text,
        [class*="formatDivisionName"] {
          display: none !important;
        }

        .print\\:break-before-page { page-break-before: always; }
        .print\\:break-after-page { page-break-after: always; }
        .print\\:break-inside-avoid { page-break-inside: avoid; }
        .print\\:text-black { color: black !important; }
        .print\\:bg-white { background-color: white !important; }
        .print\\:border-black { border-color: black !important; }
        .print\\:font-bold { font-weight: bold !important; }
        .print\\:text-center { text-align: center !important; }

        /* Remove non-table borders to avoid conflicts and ensure crisp table lines */
        * { border: none !important; box-shadow: none !important; outline: none !important; }
        table { border-collapse: collapse !important; width: 100% !important; margin: 1px 0 !important; font-size: 8px !important; }
        thead { display: table-header-group !important; }
        tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        table, th, td, thead, tbody, tr { border: 1px solid black !important; }
        th, td { padding: 2px 3px !important; text-align: center !important; font-size: 8px !important; height: 12px !important; line-height: 1 !important; }
        th { background-color: #f0f0f0 !important; font-weight: bold !important; }

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

        /* Hide interactive elements */
        button:not(.print-visible) { display: none !important; }

        /* Section styling */
        section { break-inside: avoid !important; margin-bottom: 20px !important; }

        .switchgear-panelboard-mts-report-body {
          display: block !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        .switchgear-panelboard-mts-report-content {
          display: block !important;
          max-width: none !important;
          width: 100% !important;
          margin: 0 !important;
        }

        .switchgear-panelboard-mts-titlebar {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }

        .switchgear-panelboard-mts-report-body {
          break-before: avoid !important;
          page-break-before: avoid !important;
        }

        /* Ensure all text is black for maximum readability */
        * { color: black !important; }

        /* Section headings: single underline in print (orange bar hidden via print:hidden) */
        .max-w-7xl h2 {
          border-bottom: 1px solid black !important;
          padding-bottom: 2px !important;
          margin-bottom: 4px !important;
        }

        /* Visual & Mechanical table standardization like Panelboard */
        table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
        table.visual-mechanical-table thead { display: table-header-group !important; }
        table.visual-mechanical-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }
        table.visual-mechanical-table th:first-child, table.visual-mechanical-table td:first-child { width: 12% !important; text-align: left !important; }
        table.visual-mechanical-table th:nth-child(2), table.visual-mechanical-table td:nth-child(2) { width: 58% !important; text-align: left !important; }
        table.visual-mechanical-table th:nth-child(3), table.visual-mechanical-table td:nth-child(3) { width: 30% !important; text-align: center !important; }

        /* Bus-section based tables: give left Bus column and right Units narrow widths to free space for readings */
        .section-insulation-resistance table,
        .section-temp-corrected table,
        .section-contact-resistance table,
        .section-dielectric table { table-layout: fixed !important; width: 100% !important; }
        .section-insulation-resistance thead th:first-child,
        .section-temp-corrected thead th:first-child,
        .section-dielectric thead th:first-child { width: 8.5% !important; text-align: left !important; }
        .section-insulation-resistance thead th:last-child,
        .section-temp-corrected thead th:last-child,
        .section-dielectric thead th:last-child { width: 8% !important; }

        /* Contact Resistance print widths: widen Bus, slightly shrink phase columns, narrow Units */
        .section-contact-resistance thead th:first-child { width: 14% !important; text-align: left !important; }
        .section-contact-resistance thead th:last-child { width: 6% !important; }
        .section-contact-resistance thead th:nth-child(2),
        .section-contact-resistance thead th:nth-child(3),
        .section-contact-resistance thead th:nth-child(4),
        .section-contact-resistance thead th:nth-child(5),
        .section-contact-resistance thead th:nth-child(6) { width: 16% !important; }

        /* Ensure colgroup respects print widths */
        .section-contact-resistance colgroup col:nth-child(1) { width: 14% !important; }
        .section-contact-resistance colgroup col:nth-child(7) { width: 6% !important; }
        .section-contact-resistance colgroup col:nth-child(2),
        .section-contact-resistance colgroup col:nth-child(3),
        .section-contact-resistance colgroup col:nth-child(4),
        .section-contact-resistance colgroup col:nth-child(5),
        .section-contact-resistance colgroup col:nth-child(6) { width: 16% !important; }

        /* Slightly widen Bus column for other sections to avoid clipping */
        .section-insulation-resistance colgroup col:nth-child(1) { width: 8.5% !important; }
        .section-temp-corrected colgroup col:nth-child(1) { width: 8.5% !important; }
        .section-dielectric colgroup col:nth-child(1) { width: 8.5% !important; }

        /* Narrow Bus Section and Units inputs to prevent clipping */
        .section-insulation-resistance td:first-child input,
        .section-temp-corrected td:first-child input,
        .section-contact-resistance td:first-child input,
        .section-dielectric td:first-child input { width: 45px !important; max-width: 45px !important; padding: 0 2px !important; box-sizing: border-box !important; }

        .section-temp-corrected td:last-child input,
        .section-insulation-resistance td:last-child select,
        .section-contact-resistance td:last-child select,
        .section-dielectric td:last-child select { width: 45px !important; max-width: 45px !important; padding-right: 2px !important; box-sizing: border-box !important; }

        /* Compact table cells */
        .section-temp-corrected th, .section-temp-corrected td,
        .section-contact-resistance th, .section-contact-resistance td,
        .section-dielectric th, .section-dielectric td { padding: 2px 3px !important; font-size: 8px !important; }
      }

      .form-label {
        @apply block text-sm font-medium text-neutral-700 dark:text-white;
      }
      .form-input, .form-select, .form-textarea {
        @apply mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 dark:bg-dark-150 dark:text-white;
      }
      .form-input-table {
        @apply w-full p-1 border-none bg-transparent text-center dark:text-white focus:ring-0 focus:outline-none;
      }
      .table-header {
        @apply px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider;
      }

      /* Prevent comments from breaking across pages and auto-size for print */
      @media print {
        .section-comments { break-inside: avoid !important; page-break-inside: avoid !important; }
        .section-comments textarea { min-height: 120px !important; height: auto !important; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);

  useEffect(() => {
    const { celsius } = formData.temperature;
    const tcf = getTCF(celsius);

    setFormData((prev) => {
      const newTempCorrected = prev.measuredInsulationResistance.map((row) => {
        const correctedRow: InsulationResistanceRow = {
          busSection: row.busSection,
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
        (Object.keys(row) as Array<keyof InsulationResistanceRow>).forEach(
          (key) => {
            if (key !== "busSection") {
              const valStr = String(row[key] || ""); // Ensure it's a string and handle null/undefined
              const trimmedVal = valStr.trim();

              if (trimmedVal === "" || trimmedVal.toLowerCase() === "n/a") {
                correctedRow[key] = "N/A";
              } else if (
                trimmedVal.startsWith(">") ||
                trimmedVal.startsWith("<")
              ) {
                correctedRow[key] = trimmedVal;
              } else {
                const val = parseFloat(trimmedVal);
                if (!isNaN(val) && isFinite(val)) {
                  correctedRow[key] = (val * tcf).toFixed(2);
                } else {
                  correctedRow[key] = "N/A"; // Show N/A for invalid numbers
                }
              }
            }
          },
        );
        return correctedRow;
      });
      return {
        ...prev,
        temperature: { ...prev.temperature, tcf },
        tempCorrectedInsulationResistance: newTempCorrected,
      };
    });
  }, [formData.temperature.celsius, formData.measuredInsulationResistance]);

  const ensureReportAsset = useCallback(
    async (savedReportId: string) => {
      if (!jobId || !user?.id) {
        throw new Error("Missing job or user information.");
      }

      const assetName = getAssetName(
        reportSlug,
        formData.identifier || formData.eqptLocation || "",
      );
      const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;

      const { data: existingAsset, error: existingAssetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, template_type, status")
        .eq("file_url", fileUrl)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAssetError) throw existingAssetError;

      let assetId = existingAsset?.id;

      if (!assetId) {
        const { data: assetResult, error: assetError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .insert({
            name: assetName,
            file_url: fileUrl,
            user_id: user.id,
            template_type: "MTS",
            status: "in_progress",
          })
          .select("id")
          .single();

        if (assetError) throw assetError;
        assetId = assetResult.id;
      } else {
        const assetUpdate: {
          name?: string;
          template_type?: string;
          status?: string;
        } = {};

        if (existingAsset?.name !== assetName) {
          assetUpdate.name = assetName;
        }

        if (existingAsset?.template_type !== "MTS") {
          assetUpdate.template_type = "MTS";
        }

        if (!existingAsset?.status || existingAsset.status === "not started") {
          assetUpdate.status = "in_progress";
        }

        if (Object.keys(assetUpdate).length > 0) {
          const { error: assetUpdateError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .update(assetUpdate)
            .eq("id", assetId);

          if (assetUpdateError) throw assetUpdateError;
        }
      }

      const { data: existingLink, error: existingLinkError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .select("asset_id")
        .eq("job_id", jobId)
        .eq("asset_id", assetId)
        .maybeSingle();

      if (existingLinkError) throw existingLinkError;

      if (!existingLink) {
        const { error: linkError } = await supabase
          .schema("neta_ops")
          .from("job_assets")
          .insert({
            job_id: jobId,
            asset_id: assetId,
            user_id: user.id,
          });

        if (linkError) throw linkError;
      }
    },
    [jobId, user?.id, reportSlug, formData.identifier, formData.eqptLocation],
  );

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData,
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema("neta_ops")
          .from("switchgear_panelboard_mts_reports")
          .update(reportPayload)
          .eq("id", reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema("neta_ops")
            .from("switchgear_panelboard_mts_reports")
            .insert(reportPayload)
            .select()
            .single();

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;
            creatingRef.current = false;
            await ensureReportAsset(newReportId);

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
  }, [jobId, user?.id, formData, reportSlug, ensureReportAsset]);

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
    setLoading(true);

    try {
      setIsSaving(true);
      const reportPayload = {
        job_id: jobId,
        user_id: user.id,
        report_data: formData,
      };

      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema("neta_ops")
          .from("switchgear_panelboard_mts_reports")
          .update(reportPayload)
          .eq("id", reportIdRef.current)
          .select()
          .single();
      } else if (creatingRef.current) {
        const createdReportId = await waitForCreatedReportId();
        if (!createdReportId) {
          pendingSaveRef.current = true;
          return;
        }
        result = await supabase
          .schema("neta_ops")
          .from("switchgear_panelboard_mts_reports")
          .update(reportPayload)
          .eq("id", createdReportId)
          .select()
          .single();
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema("neta_ops")
            .from("switchgear_panelboard_mts_reports")
            .insert(reportPayload)
            .select()
            .single();

          if (result.data) {
            reportIdRef.current = result.data.id;
            setCurrentReportId(result.data.id);
            creatingRef.current = false;
          } else {
            creatingRef.current = false;
          }
        } catch (saveError) {
          creatingRef.current = false;
          throw saveError;
        }
      }

      if (result.error) throw result.error;
      setJustSaved(true);

      const savedReportId = result.data?.id || reportIdRef.current;
      if (savedReportId) {
        await ensureReportAsset(savedReportId);
      }

      if (!currentReportId) {
        setIsEditing(false);
        const newId = (result as any)?.data?.id || (result as any)?.id;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      }
    } catch (error) {
      console.error("Error saving report:", error);
      alert(`Failed to save report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportIdRef.current) {
      setIsEditing(false);
    }
  };

  const handleFahrenheitChange = (f: number) => {
    setJustSaved(false);
    const c = Math.round(((f - 32) * 5) / 9);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit: f, celsius: c },
    }));
  };

  const handleCelsiusChange = (c: number) => {
    setJustSaved(false);
    const f = Math.round((c * 9) / 5 + 32);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, celsius: c, fahrenheit: f },
    }));
  };

  const handleInputChange = (path: string, value: any) => {
    setFormData((prev) => {
      const keys = path.split(".");
      let current: any = prev; // Use any for intermediate steps
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {}; // Create nested object if it doesn't exist
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return { ...prev };
    });
  };

  const fillEmptyFieldsWithNA = () => {
    const newTests = formData.measuredInsulationResistance.map((row) => ({
      ...row,
      ag: row.ag && row.ag.trim() !== "" ? row.ag : "N/A",
      bg: row.bg && row.bg.trim() !== "" ? row.bg : "N/A",
      cg: row.cg && row.cg.trim() !== "" ? row.cg : "N/A",
      ab: row.ab && row.ab.trim() !== "" ? row.ab : "N/A",
      bc: row.bc && row.bc.trim() !== "" ? row.bc : "N/A",
      ca: row.ca && row.ca.trim() !== "" ? row.ca : "N/A",
      an: row.an && row.an.trim() !== "" ? row.an : "N/A",
      bn: row.bn && row.bn.trim() !== "" ? row.bn : "N/A",
      cn: row.cn && row.cn.trim() !== "" ? row.cn : "N/A",
    }));

    setFormData((prev) => ({
      ...prev,
      measuredInsulationResistance: newTests,
    }));
  };

  const handleListInputChange = (
    listName: keyof FormData,
    index: number,
    field: string,
    value: any,
  ) => {
    setFormData((prev) => {
      const list = [...(prev[listName] as any[])];
      if (list[index]) {
        // Check if element exists
        list[index] = { ...list[index], [field]: value };
      }
      return { ...prev, [listName]: list };
    });
  };

  const addRow = (
    listName: keyof Pick<
      FormData,
      | "measuredInsulationResistance"
      | "contactResistanceTests"
      | "dielectricWithstandTests"
    >,
  ) => {
    setFormData((prev) => {
      let newRow;
      if (listName === "measuredInsulationResistance")
        newRow = JSON.parse(JSON.stringify(initialInsulationRow));
      else if (listName === "contactResistanceTests")
        newRow = JSON.parse(JSON.stringify(initialContactResistanceRow));
      else if (listName === "dielectricWithstandTests")
        newRow = JSON.parse(JSON.stringify(initialDielectricWithstandRow));
      else return prev;

      // Ensure the list is initialized if it's somehow undefined
      const currentList = prev[listName] ? [...(prev[listName] as any[])] : [];
      return { ...prev, [listName]: [...currentList, newRow] };
    });
  };

  const removeRow = (
    listName: keyof Pick<
      FormData,
      | "measuredInsulationResistance"
      | "contactResistanceTests"
      | "dielectricWithstandTests"
    >,
    index: number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [listName]: (prev[listName] as any[]).filter((_, i) => i !== index),
    }));
  };

  const nextBusSectionLabel = () =>
    `Bus ${formData.measuredInsulationResistance.length + 1}`;

  const addBusSection = () => {
    const busLabel = nextBusSectionLabel();
    setFormData((prev) => ({
      ...prev,
      measuredInsulationResistance: [
        ...prev.measuredInsulationResistance,
        { ...initialInsulationRow, busSection: busLabel },
      ],
      contactResistanceTests: [
        ...prev.contactResistanceTests,
        { ...initialContactResistanceRow, busSection: busLabel },
      ],
      dielectricWithstandTests: [
        ...prev.dielectricWithstandTests,
        { ...initialDielectricWithstandRow, busSection: busLabel },
      ],
    }));
  };

  const removeBusSection = () => {
    if (formData.measuredInsulationResistance.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      measuredInsulationResistance: prev.measuredInsulationResistance.slice(
        0,
        -1,
      ),
      contactResistanceTests: prev.contactResistanceTests.slice(0, -1),
      dielectricWithstandTests: prev.dielectricWithstandTests.slice(0, -1),
    }));
  };

  if (loading && currentReportId)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6 relative switchgear-panelboard-mts-titlebar">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c" }}
        >
          NETA - MTS 7.1
          <div className="hidden print:block mt-2">
            <div
              className={`pass-fail-status-box ${getPassFailBadgeClass(formData.status)}`}
              style={{
                display: "inline-block",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "bold",
                textAlign: "center",
                width: "fit-content",
                borderRadius: "6px",

                color: "white",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
                boxSizing: "border-box",
                minWidth: "50px",
              }}
            >
              {formData.status || "PASS"}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      <div className="p-6 flex justify-center report-body switchgear-panelboard-mts-report-body">
        <div className="max-w-7xl w-full space-y-6 switchgear-panelboard-mts-report-content">
          <ReportHeader
            title={reportName}
            isAutoSaving={isAutoSaving}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={isSaving}
            status={formData.status || "PASS"}
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
          {/* Bus section row controls - same as device count in multi-device report */}
          {isEditing && (
            <div className="flex items-center gap-2 mb-4 print:hidden">
              <button
                type="button"
                onClick={addBusSection}
                className="px-3 py-1 text-sm text-white bg-green-600 hover:bg-green-700 rounded-none"
              >
                + Add Bus Section
              </button>
              <button
                type="button"
                onClick={removeBusSection}
                disabled={formData.measuredInsulationResistance.length <= 1}
                className="px-3 py-1 text-sm text-white bg-red-600 hover:bg-red-700 rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                - Remove Last Section
              </button>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                ({formData.measuredInsulationResistance.length} bus section
                {formData.measuredInsulationResistance.length !== 1 ? "s" : ""})
              </span>
            </div>
          )}

          {/* Job Information */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold section-job-info">
              Job Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
              <div>
                <label className="form-label">Customer:</label>
                <input
                  type="text"
                  value={maskCustomerName(formData.customerName)}
                  readOnly
                  className="form-input bg-neutral-100 dark:bg-dark-150 w-full"
                />
              </div>
              <div>
                <label className="form-label">Job #:</label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  readOnly
                  className="form-input bg-neutral-100 dark:bg-dark-150 w-full"
                />
              </div>
              <div>
                <label htmlFor="technicians" className="form-label">
                  Technicians:
                </label>
                <input
                  id="technicians"
                  type="text"
                  value={formData.technicians}
                  onChange={(e) =>
                    handleInputChange("technicians", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label htmlFor="date" className="form-label">
                  Date:
                </label>
                <input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label htmlFor="identifier" className="form-label">
                  Identifier:
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={formData.identifier}
                  onChange={(e) =>
                    handleInputChange("identifier", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label htmlFor="temperature.fahrenheit" className="form-label">
                  Temp:
                </label>
                <input
                  id="temperature.fahrenheit"
                  type="number"
                  value={formData.temperature.fahrenheit}
                  onChange={(e) =>
                    handleFahrenheitChange(parseFloat(e.target.value))
                  }
                  readOnly={!isEditing}
                  className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
                <span className="ml-1">°F</span>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="temperature.celsius" className="form-label">
                  Temp (°C):
                </label>
                <input
                  id="temperature.celsius"
                  type="number"
                  value={formData.temperature.celsius}
                  readOnly
                  className="form-input w-32 min-w-[7rem] bg-neutral-100 dark:bg-dark-150"
                />
              </div>
              <div>
                <label htmlFor="temperature.tcf" className="form-label">
                  TCF:
                </label>
                <input
                  id="temperature.tcf"
                  type="number"
                  value={formData.temperature.tcf.toFixed(3)}
                  readOnly
                  className="form-input bg-neutral-100 dark:bg-dark-150 w-16"
                />
              </div>
              <div>
                <label htmlFor="substation" className="form-label">
                  Substation:
                </label>
                <input
                  id="substation"
                  type="text"
                  value={formData.substation}
                  onChange={(e) =>
                    handleInputChange("substation", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label htmlFor="eqptLocation" className="form-label">
                  Eqpt. Location:
                </label>
                <input
                  id="eqptLocation"
                  type="text"
                  value={formData.eqptLocation}
                  onChange={(e) =>
                    handleInputChange("eqptLocation", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="userName" className="form-label">
                  User:
                </label>
                <input
                  id="userName"
                  type="text"
                  value={formData.userName}
                  onChange={(e) =>
                    handleInputChange("userName", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label htmlFor="humidity" className="form-label">
                  Humidity %:
                </label>
                <input
                  id="humidity"
                  type="number"
                  value={formData.temperature.humidity || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "temperature.humidity",
                      e.target.value === "" ? null : parseFloat(e.target.value),
                    )
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  placeholder="Optional"
                />
              </div>
              <div className="md:col-span-6">
                <label htmlFor="customerLocation" className="form-label">
                  Address:
                </label>
                <input
                  id="customerLocation"
                  type="text"
                  value={formData.customerLocation}
                  onChange={(e) => setFormData((prev) => ({ ...prev, customerLocation: e.target.value }))}
                  readOnly={!isEditing}
                  className={`form-input w-full dark:bg-dark-150 ${!isEditing ? "bg-neutral-100" : ""}`}
                />
              </div>
            </div>
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
                  humidity: formData.temperature.humidity,
                },
              }}
            />
          </div>

          {/* Nameplate Data */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold section-nameplate-data">
              Nameplate Data
            </h2>

            <div className="grid grid-cols-3 gap-4 print:hidden nameplate-onscreen">
              <div>
                <label className="form-label">Manufacturer:</label>
                <input
                  type="text"
                  value={formData.nameplate.manufacturer}
                  onChange={(e) =>
                    handleInputChange("nameplate.manufacturer", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">Catalog Number:</label>
                <input
                  type="text"
                  value={formData.nameplate.catalogNumber}
                  onChange={(e) =>
                    handleInputChange("nameplate.catalogNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">Serial Number:</label>
                <input
                  type="text"
                  value={formData.nameplate.serialNumber}
                  onChange={(e) =>
                    handleInputChange("nameplate.serialNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 print:hidden nameplate-onscreen">
              <div>
                <label className="form-label">Series:</label>
                <input
                  type="text"
                  value={formData.nameplate.series}
                  onChange={(e) =>
                    handleInputChange("nameplate.series", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">Type:</label>
                <input
                  type="text"
                  value={formData.nameplate.type}
                  onChange={(e) =>
                    handleInputChange("nameplate.type", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">System Voltage:</label>
                <input
                  type="text"
                  value={formData.nameplate.systemVoltage}
                  onChange={(e) =>
                    handleInputChange("nameplate.systemVoltage", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 print:hidden nameplate-onscreen">
              <div>
                <label className="form-label">Rated Voltage:</label>
                <input
                  type="text"
                  value={formData.nameplate.ratedVoltage}
                  onChange={(e) =>
                    handleInputChange("nameplate.ratedVoltage", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">Rated Current:</label>
                <input
                  type="text"
                  value={formData.nameplate.ratedCurrent}
                  onChange={(e) =>
                    handleInputChange("nameplate.ratedCurrent", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">SCCR:</label>
                <input
                  type="text"
                  value={formData.nameplate.aicRating}
                  onChange={(e) =>
                    handleInputChange("nameplate.aicRating", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 print:hidden nameplate-onscreen">
              <div>
                <label className="form-label">Phase Configuration:</label>
                <input
                  type="text"
                  value={formData.nameplate.phaseConfiguration}
                  onChange={(e) =>
                    handleInputChange(
                      "nameplate.phaseConfiguration",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
            />
          </div>

          {/* Visual and Mechanical Inspection */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold section-visual-mechanical">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "68%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      NETA Section
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-white">
                        {item.id}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-700 dark:text-white whitespace-normal break-words">
                        {item.description}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="print:hidden">
                          <select
                            value={item.result}
                            onChange={(e) =>
                              handleListInputChange(
                                "visualInspectionItems",
                                index,
                                "result",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`form-select w-full md:w-48 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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

          {/* Electrical Tests - Measured Insulation Resistance */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold flex-grow">
                Electrical Tests - Measured Insulation Resistance Values
              </h2>
              <div className="flex items-center space-x-4">
                <div className="print:hidden">
                  <button
                    onClick={fillEmptyFieldsWithNA}
                    disabled={!isEditing}
                    className={`px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${!isEditing ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    Fill Empty Fields with N/A
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-neutral-700 dark:text-white">
                    Test Voltage:
                  </span>
                  <select
                    value={formData.insulationResistanceTestVoltage}
                    onChange={(e) =>
                      handleInputChange(
                        "insulationResistanceTestVoltage",
                        e.target.value,
                      )
                    }
                    disabled={!isEditing}
                    className={`rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    <option value="">Select...</option>
                    {INSULATION_RESISTANCE_TEST_VOLTAGES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto section-insulation-resistance">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed ir-table">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider w-32">
                      Bus Section
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={9}
                    >
                      Insulation Resistance
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-B
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-C
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-A
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-N
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-N
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-N
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.measuredInsulationResistance.map((test, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <input
                            type="text"
                            value={test.busSection}
                            readOnly
                            className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                          />
                        </div>
                        <div className="hidden print:block text-left">
                          {test.busSection}
                        </div>
                      </td>
                      {[
                        "ag",
                        "bg",
                        "cg",
                        "ab",
                        "bc",
                        "ca",
                        "an",
                        "bn",
                        "cn",
                      ].map((key) => (
                        <td key={key} className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              type="text"
                              value={test[key]}
                              onChange={(e) => {
                                const newTests = [
                                  ...formData.measuredInsulationResistance,
                                ];
                                newTests[index][key] = e.target.value;
                                setFormData((prev) => ({
                                  ...prev,
                                  measuredInsulationResistance: newTests,
                                }));
                              }}
                              readOnly={!isEditing}
                              className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {test[key]}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={formData.insulationResistanceUnit}
                            onChange={(e) =>
                              handleInputChange(
                                "insulationResistanceUnit",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {INSULATION_RESISTANCE_UNITS.map((unit) => (
                              <option
                                key={unit}
                                value={unit}
                                className="dark:bg-dark-150 dark:text-white"
                              >
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.insulationResistanceUnit}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Electrical Tests - Temperature Corrected Insulation Resistance */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold">
              Temperature Corrected Values
            </h2>
            <div className="overflow-x-auto section-temp-corrected">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed ir-corrected-table">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "9.3%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider w-32">
                      Bus Section
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={9}
                    >
                      Insulation Resistance
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-B
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-C
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-A
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-N
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-N
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-N
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.tempCorrectedInsulationResistance.map(
                    (test, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              type="text"
                              value={test.busSection}
                              readOnly
                              className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {test.busSection}
                          </div>
                        </td>
                        {[
                          "ag",
                          "bg",
                          "cg",
                          "ab",
                          "bc",
                          "ca",
                          "an",
                          "bn",
                          "cn",
                        ].map((key) => (
                          <td key={key} className="px-3 py-2">
                            <div className="print:hidden">
                              <input
                                type="text"
                                value={test[key]}
                                readOnly
                                className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                              />
                            </div>
                            <div className="hidden print:block text-center">
                              {test[key]}
                            </div>
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              type="text"
                              value={formData.insulationResistanceUnit}
                              readOnly
                              className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {formData.insulationResistanceUnit}
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Electrical Tests - Contact Resistance */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold flex-grow">
                Contact Resistance
              </h2>
            </div>
            <div className="overflow-x-auto section-contact-resistance">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed contact-resistance-table">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "18.4%" }} />
                  <col style={{ width: "18.4%" }} />
                  <col style={{ width: "18.4%" }} />
                  <col style={{ width: "18.4%" }} />
                  <col style={{ width: "18.4%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider w-32">
                      Bus Section
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={5}
                    >
                      Contact Resistance
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A Phase
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B Phase
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C Phase
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      Neutral
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      Ground
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.contactResistanceTests.map((test, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <input
                            type="text"
                            value={test.busSection}
                            onChange={(e) => {
                              const newTests = [
                                ...formData.contactResistanceTests,
                              ];
                              newTests[index].busSection = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                contactResistanceTests: newTests,
                              }));
                            }}
                            readOnly={!isEditing}
                            className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </div>
                        <div className="hidden print:block text-center">
                          {test.busSection}
                        </div>
                      </td>
                      {["aPhase", "bPhase", "cPhase", "neutral", "ground"].map(
                        (key) => (
                          <td key={key} className="px-3 py-2">
                            <div className="print:hidden">
                              <input
                                type="text"
                                value={test[key]}
                                onChange={(e) => {
                                  const newTests = [
                                    ...formData.contactResistanceTests,
                                  ];
                                  newTests[index][key] = e.target.value;
                                  setFormData((prev) => ({
                                    ...prev,
                                    contactResistanceTests: newTests,
                                  }));
                                }}
                                readOnly={!isEditing}
                                className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                              />
                            </div>
                            <div className="hidden print:block text-center">
                              {test[key]}
                            </div>
                          </td>
                        ),
                      )}
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={formData.contactResistanceUnit}
                            onChange={(e) =>
                              handleInputChange(
                                "contactResistanceUnit",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {CONTACT_RESISTANCE_UNITS.map((unit) => (
                              <option
                                key={unit}
                                value={unit}
                                className="dark:bg-dark-150 dark:text-white"
                              >
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.contactResistanceUnit}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Electrical Tests - Dielectric Withstand */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold flex-grow">
                Dielectric Withstand
              </h2>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-neutral-700 dark:text-white">
                  Test Voltage:
                </span>
                <select
                  value={formData.dielectricWithstandTestVoltage}
                  onChange={(e) =>
                    handleInputChange(
                      "dielectricWithstandTestVoltage",
                      e.target.value,
                    )
                  }
                  disabled={!isEditing}
                  className={`rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                >
                  {DIELECTRIC_WITHSTAND_TEST_VOLTAGES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto section-dielectric">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed dielectric-table">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider w-32">
                      Bus Section
                    </th>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={3}
                    >
                      Dielectric Withstand
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      A-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      B-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase">
                      C-G
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.dielectricWithstandTests.map((test, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <input
                            type="text"
                            value={test.busSection}
                            readOnly
                            className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                          />
                        </div>
                        <div className="hidden print:block text-center">
                          {test.busSection}
                        </div>
                      </td>
                      {["ag", "bg", "cg"].map((key) => (
                        <td key={key} className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              type="text"
                              value={test[key]}
                              onChange={(e) => {
                                const newTests = [
                                  ...formData.dielectricWithstandTests,
                                ];
                                newTests[index][key] = e.target.value;
                                setFormData((prev) => ({
                                  ...prev,
                                  dielectricWithstandTests: newTests,
                                }));
                              }}
                              readOnly={!isEditing}
                              className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center">
                            {test[key]}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={formData.dielectricWithstandUnit}
                            onChange={(e) =>
                              handleInputChange(
                                "dielectricWithstandUnit",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {DIELECTRIC_WITHSTAND_UNITS.map((unit) => (
                              <option
                                key={unit}
                                value={unit}
                                className="dark:bg-dark-150 dark:text-white"
                              >
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.dielectricWithstandUnit}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Equipment Used */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold section-test-equipment">
              Test Equipment Used
            </h2>
            <div className="grid grid-cols-1 gap-6 print:hidden test-eqpt-onscreen">
              <div className="grid grid-cols-4 gap-4 border-b dark:border-neutral-700 pb-4">
                <div>
                  <label className="form-label">Megohmmeter:</label>
                  <EquipmentAutocomplete
                    value={formData.testEquipment.megohmmeter.name}
                    onChange={(value) =>
                      handleInputChange("testEquipment.megohmmeter.name", value)
                    }
                    onSelect={(equipment) => {
                      const formatDate = (
                        dateString: string | null,
                      ): string => {
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
                      handleInputChange(
                        "testEquipment.megohmmeter.name",
                        equipment.equipment_name,
                      );
                      handleInputChange(
                        "testEquipment.megohmmeter.serialNumber",
                        equipment.serial_number || "",
                      );
                      handleInputChange(
                        "testEquipment.megohmmeter.ampId",
                        equipment.amp_id || "",
                      );
                      handleInputChange(
                        "testEquipment.megohmmeter.calDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.megohmmeter.serialNumber}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.megohmmeter.serialNumber",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">AMP ID:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.megohmmeter.ampId}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.megohmmeter.ampId",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Cal Date:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.megohmmeter.calDate}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.megohmmeter.calDate",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 border-b dark:border-neutral-700 pb-4">
                <div>
                  <label className="form-label">Low Resistance Ohmmeter:</label>
                  <EquipmentAutocomplete
                    value={formData.testEquipment.lowResistanceOhmmeter.name}
                    onChange={(value) =>
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.name",
                        value,
                      )
                    }
                    onSelect={(equipment) => {
                      const formatDate = (
                        dateString: string | null,
                      ): string => {
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
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.name",
                        equipment.equipment_name,
                      );
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.serialNumber",
                        equipment.serial_number || "",
                      );
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.ampId",
                        equipment.amp_id || "",
                      );
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.calDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number:</label>
                  <input
                    type="text"
                    value={
                      formData.testEquipment.lowResistanceOhmmeter.serialNumber
                    }
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.serialNumber",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">AMP ID:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.lowResistanceOhmmeter.ampId}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.ampId",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Cal Date:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.lowResistanceOhmmeter.calDate}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.lowResistanceOhmmeter.calDate",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Hipot:</label>
                  <EquipmentAutocomplete
                    value={formData.testEquipment.hipot.name}
                    onChange={(value) =>
                      handleInputChange("testEquipment.hipot.name", value)
                    }
                    onSelect={(equipment) => {
                      const formatDate = (
                        dateString: string | null,
                      ): string => {
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
                      handleInputChange(
                        "testEquipment.hipot.name",
                        equipment.equipment_name,
                      );
                      handleInputChange(
                        "testEquipment.hipot.serialNumber",
                        equipment.serial_number || "",
                      );
                      handleInputChange(
                        "testEquipment.hipot.ampId",
                        equipment.amp_id || "",
                      );
                      handleInputChange(
                        "testEquipment.hipot.calDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.hipot.serialNumber}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.hipot.serialNumber",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">AMP ID:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.hipot.ampId}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.hipot.ampId",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Cal Date:</label>
                  <input
                    type="text"
                    value={formData.testEquipment.hipot.calDate}
                    onChange={(e) =>
                      handleInputChange(
                        "testEquipment.hipot.calDate",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </div>

            {/* Print-only compact Test Equipment table */}
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
                      <div className="font-semibold">Megohmmeter:</div>
                      <div className="mt-0">
                        {formData.testEquipment.megohmmeter.name || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">
                        {formData.testEquipment.megohmmeter.serialNumber || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">
                        {formData.testEquipment.megohmmeter.ampId || ""}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">
                        Low Resistance Ohmmeter:
                      </div>
                      <div className="mt-0">
                        {formData.testEquipment.lowResistanceOhmmeter.name ||
                          ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">
                        {formData.testEquipment.lowResistanceOhmmeter
                          .serialNumber || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">
                        {formData.testEquipment.lowResistanceOhmmeter.ampId ||
                          ""}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Hipot:</div>
                      <div className="mt-0">
                        {formData.testEquipment.hipot.name || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">
                        {formData.testEquipment.hipot.serialNumber || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">
                        {formData.testEquipment.hipot.ampId || ""}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Comments */}
          <section
            className={`mb-6 section-comments print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white pb-2 print:text-black print:border-b print:border-black print:font-bold section-comments">
              Comments
            </h2>
            <textarea
              value={formData.comments}
              onChange={(e) => handleInputChange("comments", e.target.value)}
              rows={4}
              readOnly={!isEditing}
              className={`form-textarea w-full resize-none ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} print:hidden`}
              placeholder="Enter comments here..."
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
          </section>
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

export default SwitchgearPanelboardMTSReport;
