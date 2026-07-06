import React, { useState, useEffect } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import _ from "lodash";
import { useReportLocked } from "./useReportLocked";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import NameplatePrintTable from "./common/NameplatePrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";

// Temperature conversion and correction factor lookup tables
const tcfTable: { [key: string]: number } = {
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

// Helper function to get TCF based on rounded Celsius
const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString(); // Use string key for lookup
  return tcfTable[key] !== undefined ? tcfTable[key] : 1; // Default to 1 if not found
};

// Dropdown options
const visualInspectionOptions = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
  // Legacy/result variants to ensure existing data renders
  "Y",
  "N",
  "N/A",
  "Yes",
  "No",
];

const insulationResistanceUnits = [
  { symbol: "kΩ", name: "Kilo-Ohms" },
  { symbol: "MΩ", name: "Mega-Ohms" },
  { symbol: "GΩ", name: "Giga-Ohms" },
];

const contactResistanceUnits = [
  { symbol: "µΩ", name: "Micro-Ohms" },
  { symbol: "mΩ", name: "Milli-Ohms" },
  { symbol: "Ω", name: "Ohms" },
];

interface FormData {
  // Job Information
  jobNumber: string;
  customerName: string;
  customerLocation: string;
  date: string;
  technicians: string;
  jobTitle: string;
  substation: string;
  eqptLocation: string;
  temperature: {
    celsius: number;
    fahrenheit: number;
    humidity: number;
    tcf: number;
  };

  // Nameplate Data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  systemVoltage: string;
  ratedVoltage: string;
  ratedCurrent: string;
  phaseConfiguration: string;

  // Visual and Mechanical Inspection
  visualInspectionItems: {
    id: string;
    description: string;
    result: string;
    comments: string;
  }[];

  // Electrical Tests
  insulationResistanceTests: {
    values: {
      ag: string;
      bg: string;
      cg: string;
      ab: string;
      bc: string;
      ca: string;
      an: string;
      bn: string;
      cn: string;
    };
    testVoltage: string;
    unit: string;
  }[];

  // Temperature Corrected Values
  temperatureCorrectedTests: {
    values: {
      ag: string;
      bg: string;
      cg: string;
      ab: string;
      bc: string;
      ca: string;
      an: string;
      bn: string;
      cn: string;
    };
  }[];

  // Contact Resistance Tests
  contactResistanceTests: {
    busSection: string;
    values: {
      aPhase: string;
      bPhase: string;
      cPhase: string;
      neutral: string;
      ground: string;
    };
    testVoltage: string;
    unit: string;
  }[];

  // Test Equipment Used
  testEquipment: {
    megohmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
    // Added low resistance ohmmeter for contact resistance checks
    // Keeping as optional in type to avoid breaking legacy saves
    lowResistanceOhmmeter?: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
  };

  comments: string;
  status: string;

  // Additional fields
  identifier: string;
  userName: string;
  testEquipmentLocation: string;
}

const PanelboardReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress, maskJobTitle } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
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

  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get("print") === "true";
  const { locked } = useReportLocked(
    currentReportId,
    jobId,
    "panelboard-report",
  );

  // Add print styles and hide navigation/scrollbar
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      /* Hide navigation bar and scrollbar */
      nav, header, .navigation, [class*="nav"], [class*="header"] {
        display: none !important;
      }
      html { height: 100%; }
      body { overflow-x: hidden; min-height: 100vh; padding-bottom: 100px; }
      textarea { min-height: 200px !important; }

      /* Section headers with orange dividers for fillable report */
      h2 {
        border-top: 2px solid #f26722 !important;
        padding-top: 8px !important;
        margin-top: 16px !important;
      }

      @media print {
        /* Center text in Test Equipment print boxes */
        .test-eqpt-print td,
        .test-eqpt-print td > div {
          text-align: center !important;
        }
        .test-eqpt-print td {
          vertical-align: middle !important;
        }
        /* Hide on-screen job info grid entirely in print */
        .job-info-onscreen, .job-info-onscreen * { display: none !important; }
        /* Hide on-screen nameplate grid in print */
        .nameplate-onscreen, .nameplate-onscreen * { display: none !important; }
        /* Hide on-screen test equipment grid in print */
        .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
        /* Spread IR/Corrected tables and push Units far right */
        .ir-table th, .ir-table td, .ir-corrected-table th, .ir-corrected-table td { padding: 2px 3px !important; font-size: 8px !important; }
        .ir-table colgroup col:last-child, .ir-corrected-table colgroup col:last-child { width: 7.75% !important; }
        .ir-table colgroup col:not(:last-child), .ir-corrected-table colgroup col:not(:last-child) { width: 10.25% !important; }

        /* Contact Resistance: give more room to value columns */
        .contact-resistance-table th, .contact-resistance-table td { padding: 2px 3px !important; font-size: 8px !important; }
        .contact-resistance-table colgroup col:nth-child(1) { width: 6% !important; }
        .contact-resistance-table colgroup col:nth-child(2),
        .contact-resistance-table colgroup col:nth-child(3),
        .contact-resistance-table colgroup col:nth-child(4),
        .contact-resistance-table colgroup col:nth-child(5),
        .contact-resistance-table colgroup col:nth-child(6) { width: 17% !important; }
        .contact-resistance-table colgroup col:nth-child(7) { width: 9% !important; }

        /* Print-only: hide unused first column (blank before A Phase) */
        .contact-resistance-table colgroup col:first-child { display: none !important; }
        .contact-resistance-table thead tr > th:first-child,
        .contact-resistance-table tbody tr > td:first-child { display: none !important; }

        /* Keep Comments header and textarea together on one page */
        .comments-section { page-break-inside: avoid !important; break-inside: avoid !important; }
        .comments-section h2 { page-break-after: avoid !important; }
        .comments-section textarea { page-break-inside: avoid !important; }
        /* Visual & Mechanical table widths for readability */
        table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
        table.visual-mechanical-table thead { display: table-header-group !important; }
        table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
        table.visual-mechanical-table th { text-align: center !important; }
        table.visual-mechanical-table colgroup col:nth-child(1) { width: 12% !important; }
        table.visual-mechanical-table colgroup col:nth-child(2) { width: 68% !important; }
        table.visual-mechanical-table colgroup col:nth-child(3) { width: 20% !important; }
        table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }
        /* Hide empty list items that cause extra bullets in print */
        li:empty { display: none !important; }
        ul:empty { display: none !important; }

        /* Insulation tables: allow multi-page flow, repeat headers, avoid row splits */
        .section-insulation-resistance table { page-break-inside: auto !important; break-inside: auto !important; table-layout: fixed !important; }
        .section-insulation-resistance thead { display: table-header-group !important; }
        .section-insulation-resistance tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        .ir-table th, .ir-corrected-table th { text-align: center !important; }
        .ir-table td, .ir-corrected-table td { text-align: center !important; }
        * {
          color: black !important;
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif !important;
          font-size: 9px !important;
          background: white !important;
          line-height: 1 !important;
        }

        /* Standard portrait page size with minimal margins */
        @page {
          size: 8.5in 11in;
          margin: 0.2in;
        }

        /* Hide all non-print elements */
        .print\\:hidden { display: none !important; }

        /* Hide second title and back button in print only */
        .flex.justify-between.items-center.mb-6 { display: none !important; }
        .flex.items-center.gap-4 { display: none !important; }
        button { display: none !important; }

        /* Section headers with orange line above - ultra compact */
        h2 {
          font-size: 9px !important;
          font-weight: bold !important;
          margin: 0 !important;
          margin-top: 0 !important;
          padding: 1px 0 !important;
          background-color: transparent !important;
          color: black !important;
          text-transform: none !important;
          border: none !important;
          border-bottom: 1px solid black !important;
          line-height: 1.2 !important;
          padding-bottom: 2px !important;
          padding-top: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          position: relative !important;
        }

        /* Remove pseudo-element - not working properly */
        h2::before {
          display: none !important;
        }

        /* Create actual section dividers */
        .mb-6 {
          margin-top: 12px !important;
          border-top: 1px solid #f26722 !important;
          padding-top: 8px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* First section shouldn't have top border */
        .mb-6:first-of-type {
          border-top: none !important;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }

        /* Add extra spacing after tables to prevent overlap */
        table {
          margin-bottom: 8px !important;
        }

        /* Force PASS/FAIL colors to print */
        .status-pass {
          background-color: #22c55e !important;
          border: 2px solid #16a34a !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .status-fail {
          background-color: #ef4444 !important;
          border: 2px solid #dc2626 !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Specific class for PASS/FAIL status box */
        .pass-fail-status-box {
        -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          display: inline-block !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: bold !important;
          text-align: center !important;
          width: fit-content !important;
          border-radius: 6px !important;
          box-sizing: border-box !important;
          min-width: 50px !important;
        }
      .pass-fail-status-box.pass {
        background-color: #22c55e !important;
        border-color: #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.fail {
        background-color: #ef4444 !important;
        border-color: #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.limited {
        background-color: #eab308 !important;
        border-color: #ca8a04 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

        /* Remove all card styling and shadows */
        .bg-white, .dark\\:bg-dark-150, .rounded-none, .shadow {
          background: white !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin-bottom: 3px !important;
          border: none !important;
        }

        /* Remove ALL section styling - no boxes */
        section {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
          margin-bottom: 2px !important;
        }

        /* Remove any div that might create boxes */
        div[class*="border"], div[class*="shadow"], div[class*="rounded"] {
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }

        /* Ensure no padding on any containers */
        div[class*="p-"], div[class*="px-"], div[class*="py-"], div[class*="pt-"], div[class*="pb-"], div[class*="pl-"], div[class*="pr-"] {
          padding: 0 !important;
        }

        /* FORCE remove all borders and boxes from everything except tables */
        * {
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
        }

        /* Enforce print utility borders */
        .print\\:border {
          border: 1px solid black !important;
        }

        .print\\:border-black {
          border: 1px solid black !important;
        }

        /* Remove borders from divs with these specific classes */
        div.bg-white, div.dark\\:bg-dark-150, div.print\\:border, div.print\\:border-black {
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }

        /* Only allow borders on table elements */
        table, th, td, thead, tbody, tr {
          border: 1px solid black !important;
        }

        /* Allow borders on inputs */
        input, select, textarea {
          border-bottom: 1px solid black !important;
        }

        textarea {
          border: 1px solid black !important;
        }

        /* Form grid layout - ultra compact */
        .grid {
          display: grid !important;
          gap: 1px !important;
          margin-bottom: 2px !important;
        }

        /* Job info section - single line layout */
        .grid-cols-1.md\\:grid-cols-2 {
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 8px !important;
        }

        /* Labels and inputs - ultra compact */
        label {
          font-size: 8px !important;
          font-weight: normal !important;
          margin: 0 !important;
          display: inline-block !important;
          margin-right: 2px !important;
        }

        input, select, textarea {
          width: auto !important;
          border: none !important;
          border-bottom: 1px solid black !important;
          background: transparent !important;
          padding: 0 1px !important;
          margin: 0 !important;
          font-size: 8px !important;
          height: 12px !important;
          display: inline-block !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }

        /* Specific width for common inputs */
        input[type="text"], input[type="number"] {
          width: 80px !important;
        }

        /* Narrower inputs in Temperature Corrected Values table */
        table input[type="text"] {
          width: 50px !important;
          max-width: 50px !important;
        }

        input[type="date"] {
          width: 70px !important;
        }



        textarea {
          width: 100% !important;
          height: auto !important;
          min-height: 20px !important;
          border: 1px solid black !important;
          display: block !important;
          margin-top: 1px !important;
          font-size: 8px !important;
          padding: 2px !important;
        }

        /* Table styles - ultra compact */
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 1px 0 !important;
          font-size: 8px !important;
          page-break-inside: avoid !important;
          margin-bottom: 16px !important;
        }

        th, td {
          border: 0.5px solid black !important;
          padding: 0px 1px !important;
          text-align: center !important;
          font-size: 8px !important;
          height: 12px !important;
          line-height: 1 !important;
        }

        th {
          background-color: #f0f0f0 !important;
          font-weight: bold !important;
        }

        /* Specific input styling in tables */
        table input, table select {
          border: none !important;
          border-bottom: none !important;
          padding: 0 !important;
          margin: 0 !important;
          height: 10px !important;
          text-align: center !important;
          width: 100% !important;
          font-size: 8px !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }

        /* Force table cell inputs to not interfere with table borders */
        td input, td select, td textarea {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          outline: none !important;
        }

        /* Remove all spacing classes */
        .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
        .mb-4 { margin-bottom: 2px !important; }
        .mb-6 { margin-bottom: 3px !important; }
        .mb-8 { margin-bottom: 3px !important; }
        .p-6 { padding: 0 !important; }

        /* PASS/FAIL status badge */
        .bg-green-600, .bg-red-600 {
          background-color: transparent !important;
          color: black !important;
          border: 1px solid black !important;
          padding: 0px 2px !important;
          font-weight: bold !important;
          font-size: 9px !important;
        }

        /* Status in header */
        .text-green-600 { color: green !important; }
        .text-red-600 { color: red !important; }

        /* Comments section */
        .min-h-[250px] {
          min-height: 20px !important;
        }

        /* Footer text */
        .text-xs {
          font-size: 7px !important;
        }

        /* Force single-line layout for form fields */
        .flex.items-center {
          display: inline-flex !important;
          margin-right: 10px !important;
        }

        /* Nameplate data specific styling */
        div:has(> label:contains("Manufacturer")) {
          display: grid !important;
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 5px !important;
        }

        /* Page break control */
        section { page-break-inside: avoid !important; }

        /* Ensure everything fits on one page */
        .max-w-7xl { max-width: 100% !important; }

        /* Orange header bar for sections */
        .border-b.dark\\:border-neutral-700 {
          border: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* Specific section spacing */
        section {
          margin-bottom: 2px !important;
          padding: 0 !important;
        }

        /* Print header specific */
        .print\\:flex {
          margin-bottom: 3px !important;
        }

        /* SUPER-SPECIFIC OVERRIDES - Must be last to override Tailwind */
        div[class*='print:border'] {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        div[class*='print:border-black'] {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        div.bg-white, div[class*='bg-white'] {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        div[class*='shadow'], div[class*='rounded'] {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
          border-radius: 0 !important;
        }

        /* Remove border from all direct children of .max-w-7xl in print */
        .max-w-7xl > div {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        /* Nuclear option - remove borders from all divs except those containing tables */
        div:not(:has(table)) {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = "panelboard-report"; // This component handles the panelboard-report route
  const reportName = getReportName(reportSlug);
  const [formData, setFormData] = useState<FormData>({
    customerName: "",
    customerLocation: "",
    date: new Date().toISOString().split("T")[0],
    technicians: "",
    jobTitle: "",
    jobNumber: "",
    status: "PASS",
    substation: "",
    eqptLocation: "",
    temperature: {
      fahrenheit: 68,
      celsius: 20,
      humidity: 0,
      tcf: 1,
    },
    manufacturer: "",
    catalogNumber: "",
    serialNumber: "",
    type: "",
    systemVoltage: "",
    ratedVoltage: "",
    ratedCurrent: "",
    phaseConfiguration: "",
    visualInspectionItems: [
      {
        id: "7.1.A.1",
        description:
          "Compare equipment nameplate data with drawings and specifications.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.2",
        description:
          "Inspect physical, electrical, and mechanical condition of cords and connectors.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.3",
        description:
          "Inspect anchorage, alignment, grounding, and required area clearances.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.4",
        description:
          "Verify the unit is clean and all shipping bracing, loose parts, and documentation shipped inside cubicles have been removed.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.5",
        description:
          "Verify that fuse and circuit breaker sizes and types correspond to drawings and coordination study as well as to the circuit breaker address for microprocessor-communication packages.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.6",
        description:
          "Verify that current and voltage transformer ratios correspond to drawings.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.7",
        description:
          "Verify that wiring connections are tight and that wiring is secure to prevent damage during routine operation of moving parts.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.8.1",
        description:
          "Use of a low-resistance ohmmeter in accordance with Section 7.1.B.1.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.9",
        description:
          "Confirm correct operation and sequencing of electrical and mechanical interlock systems.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.10",
        description:
          "Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.11",
        description:
          "Inspect insulators for evidence of physical damage or contaminated surfaces.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.12",
        description:
          "Verify correct barrier and shutter installation and operation.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.13",
        description: "Exercise all active components.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.14",
        description:
          "Inspect mechanical indicating devices for correct operation.",
        result: "",
        comments: "",
      },
      {
        id: "7.1.A.15",
        description: "Verify that filters are in place and vents are clear.",
        result: "",
        comments: "",
      },
    ],
    insulationResistanceTests: [
      {
        values: {
          ag: "",
          bg: "",
          cg: "",
          ab: "",
          bc: "",
          ca: "",
          an: "",
          bn: "",
          cn: "",
        },
        testVoltage: "",
        unit: "MΩ",
      },
    ],
    temperatureCorrectedTests: [
      {
        values: {
          ag: "",
          bg: "",
          cg: "",
          ab: "",
          bc: "",
          ca: "",
          an: "",
          bn: "",
          cn: "",
        },
      },
    ],
    contactResistanceTests: [
      {
        busSection: "",
        values: { aPhase: "", bPhase: "", cPhase: "", neutral: "", ground: "" },
        testVoltage: "",
        unit: "µΩ",
      },
    ],
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
    identifier: "",
    userName: "",
    testEquipmentLocation: "",
  });

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
      // First fetch job data from neta_ops schema
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select(
          `
          title,
          job_number,
          customer_id,
          site_address
        `,
        )
        .eq("id", jobId)
        .maybeSingle();

      if (jobError) throw jobError;

      if (jobData) {
        // Then fetch customer data from common schema
        let customerName = "";
        let customerAddress = (jobData as any).site_address || "";

        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select(
              `
              name,
              company_name,
              address
            `,
            )
            .eq("id", jobData.customer_id)
            .maybeSingle();

          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || "";
            if (!customerAddress) customerAddress = customerData.address || "";
          }
        }

        setFormData((prev) => ({
          ...prev,
          jobNumber: jobData.job_number || "",
          customerName: maskCustomerName(customerName),
          customerLocation: prev.customerLocation || maskCustomerAddress(customerAddress),
          jobTitle: maskJobTitle(jobData.title || ""),
        }));
      }
    } catch (error) {
      console.warn("Unable to load optional job info:", error);
    } finally {
      if (!currentReportId) {
        setLoading(false);
      }
    }
  };

  // Load existing report
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
        .from("panelboard_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          console.warn(
            `Report with ID ${currentReportId} not found. Starting new report.`,
          );
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (data) {
        setFormData((prev) => ({
          ...prev,
          ...data.report_info,
          customerName: data.report_info?.customer || prev.customerName,
          customerLocation: data.report_info?.address || prev.customerLocation,
          identifier: data.report_info?.identifier || "",
          userName:
            data.report_info?.userName ||
            data.report_info?.user ||
            prev.userName,
          testEquipmentLocation: data.report_info?.testEquipmentLocation || "",
          // Normalize visual/mechanical inspection results into our array shape by id
          visualInspectionItems: (() => {
            const vm = data.visual_mechanical;
            const vmi = (data as any).visual_mechanical_inspection;
            const vi = (data as any).visualInspection;
            const itemsSource =
              (Array.isArray(vm?.items) && vm.items) ||
              (Array.isArray(vmi?.items) && vmi.items) ||
              (Array.isArray(vmi) && vmi) ||
              (Array.isArray(vm) && vm) ||
              prev.visualInspectionItems;

            // Some legacy saves might store a map keyed by id and/or use different field names
            const legacyMap =
              (vm && (vm.results || vm.map)) ||
              (vmi && ((vmi as any).results || (vmi as any).map)) ||
              vi ||
              undefined;
            if (legacyMap && !Array.isArray(legacyMap)) {
              return prev.visualInspectionItems.map((item) => ({
                ...item,
                result:
                  legacyMap[item.id]?.result ??
                  legacyMap[item.id] ??
                  item.result,
                comments: legacyMap[item.id]?.comments ?? item.comments,
              }));
            }
            // If items array exists, ensure we merge by id keeping descriptions
            if (Array.isArray(itemsSource)) {
              const byId: Record<string, any> = {};
              itemsSource.forEach((it: any) => {
                if (it && typeof it.id === "string") byId[it.id] = it;
              });
              return prev.visualInspectionItems.map((item) => ({
                ...item,
                result: byId[item.id]?.result ?? item.result ?? "Select One",
                comments: byId[item.id]?.comments ?? item.comments ?? "",
              }));
            }
            return prev.visualInspectionItems;
          })(),
          insulationResistanceTests: (() => {
            const loadedTests = data.insulation_resistance?.tests;
            if (Array.isArray(loadedTests) && loadedTests.length > 0) {
              // Ensure each test has the proper structure with values
              return loadedTests.map((test) => ({
                values: {
                  ag: test.values?.ag || "",
                  bg: test.values?.bg || "",
                  cg: test.values?.cg || "",
                  ab: test.values?.ab || "",
                  bc: test.values?.bc || "",
                  ca: test.values?.ca || "",
                  an: test.values?.an || "",
                  bn: test.values?.bn || "",
                  cn: test.values?.cn || "",
                },
                testVoltage: test.testVoltage || "",
                unit: test.unit || "MΩ",
              }));
            }
            return prev.insulationResistanceTests;
          })(),
          temperatureCorrectedTests: (() => {
            const loadedTests = data.insulation_resistance?.correctedTests;
            if (Array.isArray(loadedTests) && loadedTests.length > 0) {
              // Ensure each test has the proper structure with values
              return loadedTests.map((test) => ({
                values: {
                  ag: test.values?.ag || "",
                  bg: test.values?.bg || "",
                  cg: test.values?.cg || "",
                  ab: test.values?.ab || "",
                  bc: test.values?.bc || "",
                  ca: test.values?.ca || "",
                  an: test.values?.an || "",
                  bn: test.values?.bn || "",
                  cn: test.values?.cn || "",
                },
              }));
            }
            return prev.temperatureCorrectedTests;
          })(),
          contactResistanceTests: (() => {
            const loadedTests = data.contact_resistance?.tests;
            if (Array.isArray(loadedTests) && loadedTests.length > 0) {
              // Ensure each test has the proper structure with values
              return loadedTests.map((test) => ({
                busSection: test.busSection || "",
                values: {
                  aPhase: test.values?.aPhase || "",
                  bPhase: test.values?.bPhase || "",
                  cPhase: test.values?.cPhase || "",
                  neutral: test.values?.neutral || "",
                  ground: test.values?.ground || "",
                },
                testVoltage: test.testVoltage || "",
                unit: test.unit || "µΩ",
              }));
            }
            return prev.contactResistanceTests;
          })(),
          comments: data.comments || "",
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
  };

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const reportData = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        date: formData.date,
        technicians: formData.technicians,
        jobNumber: formData.jobNumber,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        manufacturer: formData.manufacturer,
        catalogNumber: formData.catalogNumber,
        serialNumber: formData.serialNumber,
        type: formData.type,
        systemVoltage: formData.systemVoltage,
        ratedVoltage: formData.ratedVoltage,
        ratedCurrent: formData.ratedCurrent,
        phaseConfiguration: formData.phaseConfiguration,
        testEquipment: formData.testEquipment,
        identifier: formData.identifier,
        userName: formData.userName,
        testEquipmentLocation: formData.testEquipmentLocation,
        status: formData.status,
      },
      visual_mechanical: {
        items: formData.visualInspectionItems,
      },
      insulation_resistance: {
        tests: formData.insulationResistanceTests,
        correctedTests: formData.temperatureCorrectedTests,
      },
      contact_resistance: {
        tests: formData.contactResistanceTests,
      },
      comments: formData.comments,
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema("neta_ops")
          .from("panelboard_reports")
          .update(reportData)
          .eq("id", reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema("neta_ops")
            .from("panelboard_reports")
            .insert(reportData)
            .select()
            .single();

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
            creatingRef.current = false;
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
  }, [jobId, user?.id, formData]);

  // Save report
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    const wasExistingReport = Boolean(reportIdRef.current || currentReportId);

    const reportData = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        date: formData.date,
        technicians: formData.technicians,
        jobNumber: formData.jobNumber,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        manufacturer: formData.manufacturer,
        catalogNumber: formData.catalogNumber,
        serialNumber: formData.serialNumber,
        type: formData.type,
        systemVoltage: formData.systemVoltage,
        ratedVoltage: formData.ratedVoltage,
        ratedCurrent: formData.ratedCurrent,
        phaseConfiguration: formData.phaseConfiguration,
        testEquipment: formData.testEquipment,
        identifier: formData.identifier,
        userName: formData.userName,
        testEquipmentLocation: formData.testEquipmentLocation,
        status: formData.status,
      },
      visual_mechanical: {
        items: formData.visualInspectionItems,
      },
      insulation_resistance: {
        tests: formData.insulationResistanceTests,
        correctedTests: formData.temperatureCorrectedTests,
      },
      contact_resistance: {
        tests: formData.contactResistanceTests,
      },
      comments: formData.comments,
    };

    try {
      setIsSaving(true);
      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema("neta_ops")
          .from("panelboard_reports")
          .update(reportData)
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
          .from("panelboard_reports")
          .update(reportData)
          .eq("id", createdReportId)
          .select()
          .single();
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema("neta_ops")
            .from("panelboard_reports")
            .insert(reportData)
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
              file_url: `report:/jobs/${jobId}/panelboard-report/${result.data.id}`,
              user_id: user.id,
            };

            const { data: assetResult, error: assetError } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert(assetData)
              .select()
              .single();

            if (assetError) throw assetError;

            // Link asset to job
            await supabase.schema("neta_ops").from("job_assets").insert({
              job_id: jobId,
              asset_id: assetResult.id,
              user_id: user.id,
            });
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

      if (!wasExistingReport) {
        setIsEditing(false);
        const newId =
          reportIdRef.current ||
          (result as any)?.data?.id ||
          (result as any)?.id;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      }
    } catch (error: any) {
      console.error("Error saving report:", error);
      alert(`Failed to save report: ${error?.message || "Unknown error"}`);
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

  // Load data on component mount
  useEffect(() => {
    if (jobId) {
      loadJobInfo();
    }
    if (currentReportId) {
      loadReport();
    }
  }, [jobId, currentReportId]);

  // Auto-save effect with debounce
  useEffect(() => {
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
  }, [formData, autoSave]);

  // Ensure data structure is always properly initialized
  useEffect(() => {
    setFormData((prev) => {
      const updated = { ...prev };

      // Ensure insulationResistanceTests has proper structure
      if (
        !updated.insulationResistanceTests ||
        updated.insulationResistanceTests.length === 0
      ) {
        updated.insulationResistanceTests = [
          {
            values: {
              ag: "",
              bg: "",
              cg: "",
              ab: "",
              bc: "",
              ca: "",
              an: "",
              bn: "",
              cn: "",
            },
            testVoltage: "",
            unit: "MΩ",
          },
        ];
      } else {
        updated.insulationResistanceTests =
          updated.insulationResistanceTests.map((test) => ({
            values: {
              ag: test.values?.ag || "",
              bg: test.values?.bg || "",
              cg: test.values?.cg || "",
              ab: test.values?.ab || "",
              bc: test.values?.bc || "",
              ca: test.values?.ca || "",
              an: test.values?.an || "",
              bn: test.values?.bn || "",
              cn: test.values?.cn || "",
            },
            testVoltage: test.testVoltage || "",
            unit: test.unit || "MΩ",
          }));
      }

      // Ensure temperatureCorrectedTests has proper structure
      if (
        !updated.temperatureCorrectedTests ||
        updated.temperatureCorrectedTests.length === 0
      ) {
        updated.temperatureCorrectedTests = [
          {
            values: {
              ag: "",
              bg: "",
              cg: "",
              ab: "",
              bc: "",
              ca: "",
              an: "",
              bn: "",
              cn: "",
            },
          },
        ];
      } else {
        updated.temperatureCorrectedTests =
          updated.temperatureCorrectedTests.map((test) => ({
            values: {
              ag: test.values?.ag || "",
              bg: test.values?.bg || "",
              cg: test.values?.cg || "",
              ab: test.values?.ab || "",
              bc: test.values?.bc || "",
              ca: test.values?.ca || "",
              an: test.values?.an || "",
              bn: test.values?.bn || "",
              cn: test.values?.cn || "",
            },
          }));
      }

      // Ensure contactResistanceTests has proper structure
      if (
        !updated.contactResistanceTests ||
        updated.contactResistanceTests.length === 0
      ) {
        updated.contactResistanceTests = [
          {
            busSection: "",
            values: {
              aPhase: "",
              bPhase: "",
              cPhase: "",
              neutral: "",
              ground: "",
            },
            testVoltage: "",
            unit: "µΩ",
          },
        ];
      } else {
        updated.contactResistanceTests = updated.contactResistanceTests.map(
          (test) => ({
            busSection: test.busSection || "",
            values: {
              aPhase: test.values?.aPhase || "",
              bPhase: test.values?.bPhase || "",
              cPhase: test.values?.cPhase || "",
              neutral: test.values?.neutral || "",
              ground: test.values?.ground || "",
            },
            testVoltage: test.testVoltage || "",
            unit: test.unit || "µΩ",
          }),
        );
      }

      return updated;
    });
  }, []); // Run once on mount - formData changes are handled by autosave

  // Handle temperature changes with new logic
  const handleFahrenheitChange = (fahrenheit: number) => {
    setJustSaved(false);
    const calculatedCelsius = ((fahrenheit - 32) * 5) / 9;
    const roundedCelsius = Math.round(calculatedCelsius);
    const tcf = getTCF(roundedCelsius); // Use helper function with rounded Celsius

    setFormData((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius: roundedCelsius, // Store rounded Celsius
        tcf,
      },
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    setJustSaved(false);
    const roundedCelsius = Math.round(celsius); // Round input Celsius for consistency and lookup
    const calculatedFahrenheit = (roundedCelsius * 9) / 5 + 32;
    const roundedFahrenheit = Math.round(calculatedFahrenheit);
    const tcf = getTCF(roundedCelsius); // Use helper function with rounded Celsius

    setFormData((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        celsius: roundedCelsius, // Store rounded Celsius
        fahrenheit: roundedFahrenheit, // Store rounded Fahrenheit
        tcf,
      },
    }));
  };

  // Calculate temperature corrected values
  const calculateCorrectedValue = (value: string) => {
    // Pass through comparison or explicit NA values unchanged
    if (
      typeof value === "string" &&
      (value.includes(">") ||
        value.includes("<") ||
        value.toUpperCase() === "N/A")
    ) {
      return value;
    }
    if (value === "" || value === null || value === undefined) {
      return "";
    }
    const trimmed = String(value).trim();
    // Only calculate for plain numeric strings; otherwise echo back
    const isPlainNumber = /^-?\d+(?:\.\d+)?$/.test(trimmed);
    if (!isPlainNumber) {
      return value;
    }
    const numeric = parseFloat(trimmed);
    if (!isFinite(numeric)) {
      return value;
    }
    return (numeric * formData.temperature.tcf).toFixed(2);
  };

  // Handle form field changes
  const handleChange = (section: string | null, field: string, value: any) => {
    setJustSaved(false);
    setFormData((prev) => {
      if (section) {
        return {
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value,
          },
        };
      } else {
        return {
          ...prev,
          [field]: value,
        };
      }
    });
  };

  const handleNestedChange = (
    section: string,
    subsection: string,
    field: string,
    value: any,
  ) => {
    setFormData((prev) => {
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [subsection]: {
            ...prev[section][subsection],
            [field]: value,
          },
        },
      };
    });
  };

  const handleAddBusSection = () => {
    setFormData((prev) => ({
      ...prev,
      insulationResistanceTests: [
        ...prev.insulationResistanceTests,
        {
          values: {
            ag: "",
            bg: "",
            cg: "",
            ab: "",
            bc: "",
            ca: "",
            an: "",
            bn: "",
            cn: "",
          },
          testVoltage: prev.insulationResistanceTests[0]?.testVoltage || "",
          unit: "MΩ",
        },
      ],
    }));
  };

  const handleRemoveBusSection = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      insulationResistanceTests: prev.insulationResistanceTests.filter(
        (_, i) => i !== index,
      ),
    }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-visible"
      style={{ minHeight: "calc(100vh + 300px)", paddingBottom: "200px" }}
    >
      <ReportWrapper isPrintMode={isPrintMode}>
        {/* Print Header - Only visible when printing */}
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
            NETA - ATS 7.1
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
        <ReportHeader
          title={reportName}
          isAutoSaving={isAutoSaving}
          isEditing={isEditing}
          justSaved={justSaved}
          isSaving={isSaving}
          status={formData.status || "PASS"}
          hasReport={!!currentReportId && !locked}
          onStatusToggle={() => {
            if (isEditing) {
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
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Job Information
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-8 print:hidden job-info-onscreen">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Job #
                </label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  readOnly={true}
                  className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Customer
                </label>
                <input
                  type="text"
                  value={maskCustomerName(formData.customerName)}
                  readOnly={true}
                  className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white"
                />
              </div>
              <div>
                <div className="print:hidden">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    Address
                  </label>
                  <textarea
                    value={maskCustomerAddress(formData.customerLocation)}
                    onChange={(e) => setFormData((prev) => ({ ...prev, customerLocation: e.target.value }))}
                    readOnly={!isEditing}
                    rows={3}
                    className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-50" : ""}`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Identifier
                </label>
                <input
                  type="text"
                  value={formData.identifier}
                  onChange={(e) =>
                    handleChange(null, "identifier", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  placeholder="Enter Identifier"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Technicians
                </label>
                <input
                  type="text"
                  value={formData.technicians}
                  onChange={(e) =>
                    handleChange(null, "technicians", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Substation
                </label>
                <input
                  type="text"
                  value={formData.substation}
                  onChange={(e) =>
                    handleChange(null, "substation", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Equipment Location
                </label>
                <input
                  type="text"
                  value={formData.eqptLocation}
                  onChange={(e) =>
                    handleChange(null, "eqptLocation", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange(null, "date", e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  User
                </label>
                <input
                  type="text"
                  value={formData.userName}
                  onChange={(e) =>
                    handleChange(null, "userName", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  placeholder="Enter User Name"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    Temp. °F
                  </label>
                  <input
                    type="number"
                    value={formData.temperature.fahrenheit}
                    onChange={(e) =>
                      handleFahrenheitChange(Number(e.target.value))
                    }
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    °C
                  </label>
                  <input
                    type="number"
                    value={formData.temperature.celsius}
                    onChange={(e) =>
                      handleCelsiusChange(Number(e.target.value))
                    }
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    TCF
                  </label>
                  <input
                    type="number"
                    value={formData.temperature.tcf}
                    readOnly
                    className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white"
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
              temperature: { ...formData.temperature },
            }}
          />
        </div>
        {/* Nameplate Data */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Nameplate Data
          </h2>
          <div className="grid grid-cols-2 gap-4 print:hidden nameplate-onscreen">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Manufacturer
                </label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) =>
                    handleChange(null, "manufacturer", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Catalog No.
                </label>
                <input
                  type="text"
                  value={formData.catalogNumber}
                  onChange={(e) =>
                    handleChange(null, "catalogNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.serialNumber}
                  onChange={(e) =>
                    handleChange(null, "serialNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Type
                </label>
                <input
                  type="text"
                  value={formData.type}
                  onChange={(e) => handleChange(null, "type", e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  System Voltage (V)
                </label>
                <input
                  type="text"
                  value={formData.systemVoltage}
                  onChange={(e) =>
                    handleChange(null, "systemVoltage", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Rated Voltage (V)
                </label>
                <input
                  type="text"
                  value={formData.ratedVoltage}
                  onChange={(e) =>
                    handleChange(null, "ratedVoltage", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Rated Current (A)
                </label>
                <input
                  type="text"
                  value={formData.ratedCurrent}
                  onChange={(e) =>
                    handleChange(null, "ratedCurrent", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Phase Configuration
                </label>
                <input
                  type="text"
                  value={formData.phaseConfiguration}
                  onChange={(e) =>
                    handleChange(null, "phaseConfiguration", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
          </div>
          <NameplatePrintTable
            data={{
              manufacturer: formData.manufacturer,
              catalogNumber: formData.catalogNumber,
              serialNumber: formData.serialNumber,
              type: formData.type,
              systemVoltage: formData.systemVoltage,
              ratedVoltage: formData.ratedVoltage,
              ratedCurrent: formData.ratedCurrent,
              phaseConfiguration: formData.phaseConfiguration,
            }}
          />
        </div>
        {/* Visual and Mechanical Inspection */}
        <div className="mb-6">
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
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                    ID
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
                {formData.visualInspectionItems.map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900 dark:text-white text-center">
                      {item.id}
                    </td>
                    <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white whitespace-normal break-words">
                      {item.description}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="print:hidden">
                        <select
                          value={item.result ?? ""}
                          onChange={(e) => {
                            const newItems = [
                              ...formData.visualInspectionItems,
                            ];
                            newItems[index].result = e.target.value;
                            setFormData({
                              ...formData,
                              visualInspectionItems: newItems,
                            });
                          }}
                          disabled={!isEditing}
                          className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {visualInspectionOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-center">
                        {item.result ?? ""}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Electrical Tests - Insulation Resistance */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Electrical Tests - Insulation Resistance
          </h2>
          <div className="flex justify-end mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-white">
                Test Voltage:
              </span>
              <select
                value={formData.insulationResistanceTests[0]?.testVoltage || ""}
                onChange={(e) => {
                  const newTests = formData.insulationResistanceTests.map(
                    (test) => ({
                      ...test,
                      testVoltage: e.target.value,
                    }),
                  );
                  setFormData({
                    ...formData,
                    insulationResistanceTests: newTests,
                  });
                }}
                disabled={!isEditing}
                className={`rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                <option value="">Select...</option>
                <option value="250V">250V</option>
                <option value="500V">500V</option>
                <option value="1000V">1000V</option>
                <option value="2500V">2500V</option>
                <option value="5000V">5000V</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed ir-table">
              <colgroup>
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "7.75%" }} />
              </colgroup>
              <thead>
                <tr>
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
                <tr>
                  {["ag", "bg", "cg", "ab", "bc", "ca", "an", "bn", "cn"].map(
                    (key) => (
                      <td key={key} className="px-3 py-2">
                        <div className="print:hidden">
                          <input
                            type="text"
                            value={
                              formData.insulationResistanceTests?.[0]?.values?.[
                                key
                              ] || ""
                            }
                            onChange={(e) => {
                              const newTests = [
                                ...(formData.insulationResistanceTests || []),
                              ];
                              // Ensure we have at least one test
                              if (newTests.length === 0) {
                                newTests.push({
                                  values: {
                                    ag: "",
                                    bg: "",
                                    cg: "",
                                    ab: "",
                                    bc: "",
                                    ca: "",
                                    an: "",
                                    bn: "",
                                    cn: "",
                                  },
                                  testVoltage: "",
                                  unit: "MΩ",
                                });
                              }
                              // Ensure the values object exists
                              if (!newTests[0].values) {
                                newTests[0].values = {
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
                              }
                              newTests[0].values[key] = e.target.value;
                              setFormData({
                                ...formData,
                                insulationResistanceTests: newTests,
                              });
                            }}
                            readOnly={!isEditing}
                            className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.insulationResistanceTests?.[0]?.values?.[
                            key
                          ] || ""}
                        </div>
                      </td>
                    ),
                  )}
                  <td className="px-3 py-2">
                    <div className="print:hidden">
                      <select
                        value={
                          formData.insulationResistanceTests[0]?.unit || "MΩ"
                        }
                        onChange={(e) => {
                          const newTests = [
                            ...formData.insulationResistanceTests,
                          ];
                          newTests[0].unit = e.target.value;
                          setFormData({
                            ...formData,
                            insulationResistanceTests: newTests,
                          });
                        }}
                        disabled={!isEditing}
                        className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnits.map((unit) => (
                          <option key={unit.symbol} value={unit.symbol}>
                            {unit.symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="hidden print:block text-center">
                      {formData.insulationResistanceTests[0]?.unit || "MΩ"}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {/* Temperature Corrected Values */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Temperature Corrected Values
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed ir-corrected-table">
              <colgroup>
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "10.25%" }} />
                <col style={{ width: "7.75%" }} />
              </colgroup>
              <thead>
                <tr>
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
                <tr>
                  {["ag", "bg", "cg", "ab", "bc", "ca", "an", "bn", "cn"].map(
                    (key) => (
                      <td key={key} className="px-3 py-2">
                        <div className="print:hidden">
                          <input
                            type="text"
                            value={calculateCorrectedValue(
                              formData.insulationResistanceTests?.[0]?.values?.[
                                key
                              ] || "",
                            )}
                            readOnly
                            className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                          />
                        </div>
                        <div className="hidden print:block text-center">
                          {calculateCorrectedValue(
                            formData.insulationResistanceTests?.[0]?.values?.[
                              key
                            ] || "",
                          )}
                        </div>
                      </td>
                    ),
                  )}
                  <td className="px-3 py-2">
                    <div className="print:hidden">
                      <input
                        type="text"
                        value={
                          formData.insulationResistanceTests[0]?.unit || "MΩ"
                        }
                        readOnly
                        className="block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                      />
                    </div>
                    <div className="hidden print:block text-center">
                      {formData.insulationResistanceTests[0]?.unit || "MΩ"}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {/* Contact Resistance */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Contact Resistance
          </h2>
          <div className="flex justify-end mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-white">
                Test Amperage:
              </span>
              <select
                value={formData.contactResistanceTests[0]?.testVoltage || ""}
                onChange={(e) => {
                  const newTests = formData.contactResistanceTests.map(
                    (test) => ({
                      ...test,
                      testVoltage: e.target.value,
                    }),
                  );
                  setFormData((prev) => ({
                    ...prev,
                    contactResistanceTests: newTests,
                  }));
                }}
                disabled={!isEditing}
                className={`rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                <option value="">Select...</option>
                <option value="1 mA">1 mA</option>
                <option value="10 mA">10 mA</option>
                <option value="100 mA">100 mA</option>
                <option value="500 mA">500 mA</option>
                <option value="1 A">1 A</option>
                <option value="2 A">2 A</option>
                <option value="5 A">5 A</option>
                <option value="8 A">8 A</option>
                <option value="10 A">10 A</option>
                <option value="12 A">12 A</option>
                <option value="15 A">15 A</option>
                <option value="20 A">20 A</option>
                <option value="25 A">25 A</option>
                <option value="30 A">30 A</option>
                <option value="40 A">40 A</option>
                <option value="50 A">50 A</option>
                <option value="60 A">60 A</option>
                <option value="75 A">75 A</option>
                <option value="80 A">80 A</option>
                <option value="100 A">100 A</option>
                <option value="105 A">105 A</option>
                <option value="120 A">120 A</option>
                <option value="150 A">150 A</option>
                <option value="200 A">200 A</option>
                <option value="220 A">220 A</option>
                <option value="240 A">240 A</option>
                <option value="300 A">300 A</option>
                <option value="400 A">400 A</option>
                <option value="500 A">500 A</option>
                <option value="600 A">600 A</option>
                <option value="1000 A">1000 A</option>
                <option value="2000 A">2000 A</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed contact-resistance-table">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
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
                    <td className="px-3 py-2"></td>
                    {["aPhase", "bPhase", "cPhase", "neutral", "ground"].map(
                      (key) => (
                        <td key={key} className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              type="text"
                              value={test.values[key]}
                              onChange={(e) => {
                                const newTests = [
                                  ...(formData.contactResistanceTests || []),
                                ];
                                // Ensure we have enough tests
                                while (newTests.length <= index) {
                                  newTests.push({
                                    busSection: "",
                                    values: {
                                      aPhase: "",
                                      bPhase: "",
                                      cPhase: "",
                                      neutral: "",
                                      ground: "",
                                    },
                                    testVoltage: "",
                                    unit: "µΩ",
                                  });
                                }
                                // Ensure the values object exists
                                if (!newTests[index].values) {
                                  newTests[index].values = {
                                    aPhase: "",
                                    bPhase: "",
                                    cPhase: "",
                                    neutral: "",
                                    ground: "",
                                  };
                                }
                                newTests[index].values[key] = e.target.value;
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
                            {test.values[key]}
                          </div>
                        </td>
                      ),
                    )}
                    <td className="px-3 py-2">
                      <div className="print:hidden">
                        <select
                          value={test.unit}
                          onChange={(e) => {
                            const newTests = [
                              ...formData.contactResistanceTests,
                            ];
                            newTests[index].unit = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              contactResistanceTests: newTests,
                            }));
                          }}
                          disabled={!isEditing}
                          className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {contactResistanceUnits.map((unit) => (
                            <option
                              key={unit.symbol}
                              value={unit.symbol}
                              className="dark:bg-dark-150 dark:text-white"
                            >
                              {unit.symbol}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-center">
                        {test.unit}
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
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Test Equipment Used
          </h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden test-eqpt-onscreen">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Megohmmeter
                </label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={(value) =>
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "name",
                      value,
                    )
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
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "name",
                      equipment.equipment_name,
                    );
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "serialNumber",
                      equipment.serial_number || "",
                    );
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "ampId",
                      equipment.amp_id || "",
                    );
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "calDate",
                      formatLocalDateShort(equipment.calibration_date),
                    );
                  }}
                  readOnly={!isEditing}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.serialNumber}
                  onChange={(e) =>
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "serialNumber",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  placeholder="Enter Serial Number"
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  AMP ID
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.ampId}
                  onChange={(e) =>
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "ampId",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  placeholder="Enter AMP ID"
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Cal Date
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.calDate}
                  onChange={(e) =>
                    handleNestedChange(
                      "testEquipment",
                      "megohmmeter",
                      "calDate",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  placeholder="Enter Cal Date"
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden test-eqpt-onscreen mt-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Low-Resistance Ohmmeter
                </label>
                <EquipmentAutocomplete
                  value={
                    (formData.testEquipment as any).lowResistanceOhmmeter
                      ?.name || ""
                  }
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      testEquipment: {
                        ...prev.testEquipment,
                        lowResistanceOhmmeter: {
                          ...((prev.testEquipment as any)
                            .lowResistanceOhmmeter || {
                            serialNumber: "",
                            ampId: "",
                            calDate: "",
                          }),
                          name: value,
                        } as any,
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
                    setFormData((prev) => ({
                      ...prev,
                      testEquipment: {
                        ...prev.testEquipment,
                        lowResistanceOhmmeter: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || "",
                          ampId: equipment.amp_id || "",
                          calDate: formatLocalDateShort(
                            equipment.calibration_date,
                          ),
                        } as any,
                      },
                    }));
                  }}
                  readOnly={!isEditing}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={
                    (formData.testEquipment as any).lowResistanceOhmmeter
                      ?.serialNumber || ""
                  }
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      testEquipment: {
                        ...prev.testEquipment,
                        lowResistanceOhmmeter: {
                          ...((prev.testEquipment as any)
                            .lowResistanceOhmmeter || {
                            name: "",
                            ampId: "",
                            calDate: "",
                          }),
                          serialNumber: e.target.value,
                        } as any,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                  placeholder="Enter Serial Number"
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  AMP ID
                </label>
                <input
                  type="text"
                  value={
                    (formData.testEquipment as any).lowResistanceOhmmeter
                      ?.ampId || ""
                  }
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      testEquipment: {
                        ...prev.testEquipment,
                        lowResistanceOhmmeter: {
                          ...((prev.testEquipment as any)
                            .lowResistanceOhmmeter || {
                            name: "",
                            serialNumber: "",
                            calDate: "",
                          }),
                          ampId: e.target.value,
                        } as any,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                  placeholder="Enter AMP ID"
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                  Cal Date
                </label>
                <input
                  type="text"
                  value={
                    (formData.testEquipment as any).lowResistanceOhmmeter
                      ?.calDate || ""
                  }
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      testEquipment: {
                        ...prev.testEquipment,
                        lowResistanceOhmmeter: {
                          ...((prev.testEquipment as any)
                            .lowResistanceOhmmeter || {
                            name: "",
                            serialNumber: "",
                            ampId: "",
                          }),
                          calDate: e.target.value,
                        } as any,
                      },
                    }))
                  }
                  readOnly={!isEditing}
                  placeholder="Enter Cal Date"
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            {/* Print-only compact Test Equipment table (4 boxes wide) */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print:border text-[0.85rem] test-eqpt-print">
                <colgroup>
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">
                        Megohmmeter:
                      </div>
                      <div className="mt-0 text-center">
                        {formData.testEquipment.megohmmeter.name || ""}
                      </div>
                    </td>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">
                        Serial Number:
                      </div>
                      <div className="mt-0 text-center">
                        {formData.testEquipment.megohmmeter.serialNumber || ""}
                      </div>
                    </td>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">AMP ID:</div>
                      <div className="mt-0 text-center">
                        {formData.testEquipment.megohmmeter.ampId || ""}
                      </div>
                    </td>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">Cal Date:</div>
                      <div className="mt-0 text-center">
                        {formData.testEquipment.megohmmeter.calDate || ""}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">
                        Low-Resistance Ohmmeter:
                      </div>
                      <div className="mt-0 text-center">
                        {(formData.testEquipment as any).lowResistanceOhmmeter
                          ?.name || ""}
                      </div>
                    </td>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">
                        Serial Number:
                      </div>
                      <div className="mt-0 text-center">
                        {(formData.testEquipment as any).lowResistanceOhmmeter
                          ?.serialNumber || ""}
                      </div>
                    </td>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">AMP ID:</div>
                      <div className="mt-0 text-center">
                        {(formData.testEquipment as any).lowResistanceOhmmeter
                          ?.ampId || ""}
                      </div>
                    </td>
                    <td className="p-2 align-middle border border-neutral-300 print:border-black print:border text-center">
                      <div className="font-semibold text-center">Cal Date:</div>
                      <div className="mt-0 text-center">
                        {(formData.testEquipment as any).lowResistanceOhmmeter
                          ?.calDate || ""}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Comments */}
        <div
          className={`mb-32 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          style={{ marginBottom: "150px" }}
        >
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Comments
          </h2>
          <div className="space-y-4">
            <textarea
              value={formData.comments}
              onChange={(e) => handleChange(null, "comments", e.target.value)}
              readOnly={!isEditing}
              rows={10}
              placeholder="Enter any additional comments, observations, or notes about the inspection..."
              className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white resize-vertical min-h-[250px] ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} print:hidden`}
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
                    currentReportId ||
                    window.location.pathname.split("/").pop();
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
    </div>
  );
};

export default PanelboardReport;
