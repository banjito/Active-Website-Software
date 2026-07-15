import React, { useState, useEffect } from "react";
import { ReportHeader } from "@/components/reports/common/ReportHeader";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useDemoMode } from "@/lib/DemoModeContext";
import { BRAND_COLOR } from "@/lib/companyConfig";

// Types
interface CableTestData {
  customer: string;
  address: string;
  user: string;
  date: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  eqptLocation: string;
  identifier: string;
  // Environmental data
  temperature: number;
  humidity: number;
  // Cable data
  testedFrom: string;
  manufacturer: string;
  conductorMaterial: string;
  insulationType: string;
  systemVoltage: string;
  ratedVoltage: string;
  length: string;
  // Inspections (7.3.1.A series)
  inspectionResults: Record<string, string>;
  // Test data
  testVoltage: string;
  testSets: TestSet[];
  // Equipment
  testEquipment: {
    megohmmeter: string;
    serialNumber: string;
    ampId: string;
    calDate: string;
    comments: string;
  };
}

interface TestSet {
  id: number;
  from: string;
  to: string;
  size: string;
  result: string;
  configuration: string; // Added this, might be useful later
  readings: {
    aToGround: string;
    bToGround: string;
    cToGround: string;
    nToGround: string;
    aToB: string;
    bToC: string;
    cToA: string;
    aToN: string;
    bToN: string;
    cToN: string;
    continuity: string; // Assuming continuity is a simple text field or dropdown
  };
  // Calculated values with temperature correction
  correctedReadings: {
    aToGround: string;
    bToGround: string;
    cToGround: string;
    nToGround: string;
    aToB: string;
    bToC: string;
    cToA: string;
    aToN: string;
    bToN: string;
    cToN: string;
    continuity: string; // Continuity likely doesn't need correction
  };
}

// Define a type for the customer data we expect
interface CustomerInfo {
  id: string;
  name: string | null;
  company_name: string | null;
  address: string | null;
}

// Constants (from the Excel file's Dropdowns sheet)
const INSPECTION_RESULTS_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

const INSULATION_RESISTANCE_UNITS = [
  { value: "kΩ", label: "Kilo-Ohms" },
  { value: "MΩ", label: "Mega-Ohms" },
  { value: "GΩ", label: "Giga-Ohms" },
];

const TEST_VOLTAGES = ["250V", "500V", "1000V", "2500V", "5000V"];

const CABLE_SIZES = [
  "#18",
  "#16",
  "#14",
  "#12",
  "#10",
  "#8",
  "#6",
  "#4",
  "#2",
  "#1",
  "1/0",
  "2/0",
  "3/0",
  "4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
  "600",
  "750",
  "1000",
];

const EVALUATION_RESULTS = ["PASS", "FAIL", "LIMITED SERVICE"];

// Temperature Conversion Data (from Temp Conv sheet)
// Reduced version for brevity, expand as needed
const TEMP_CONVERSION_DATA: { fahrenheit: number; celsius: number }[] = [
  // Generate a comprehensive temperature conversion table from -50°F to 230°F
  ...[...Array(281)].map((_, i) => {
    const fahrenheit = -50 + i;
    const celsius = ((fahrenheit - 32) * 5) / 9;
    return { fahrenheit, celsius: parseFloat(celsius.toFixed(1)) };
  }),
];

// Temperature Correction Factor Data (from TCF sheet)
// Reduced version for brevity, expand as needed
const TCF_DATA: { celsius: number; multiplier: number }[] = [
  { celsius: -24, multiplier: 0.054 },
  { celsius: -23, multiplier: 0.068 },
  { celsius: -22, multiplier: 0.082 },
  { celsius: -21, multiplier: 0.096 },
  { celsius: -20, multiplier: 0.11 },
  { celsius: -19, multiplier: 0.124 },
  { celsius: -18, multiplier: 0.138 },
  { celsius: -17, multiplier: 0.152 },
  { celsius: -16, multiplier: 0.166 },
  { celsius: -15, multiplier: 0.18 },
  { celsius: -14, multiplier: 0.194 },
  { celsius: -13, multiplier: 0.208 },
  { celsius: -12, multiplier: 0.222 },
  { celsius: -11, multiplier: 0.236 },
  { celsius: -10, multiplier: 0.25 },
  { celsius: -9, multiplier: 0.264 },
  { celsius: -8, multiplier: 0.278 },
  { celsius: -7, multiplier: 0.292 },
  { celsius: -6, multiplier: 0.306 },
  { celsius: -5, multiplier: 0.32 },
  { celsius: -4, multiplier: 0.336 },
  { celsius: -3, multiplier: 0.352 },
  { celsius: -2, multiplier: 0.368 },
  { celsius: -1, multiplier: 0.384 },
  { celsius: 0, multiplier: 0.4 },
  { celsius: 1, multiplier: 0.42 },
  { celsius: 2, multiplier: 0.44 },
  { celsius: 3, multiplier: 0.46 },
  { celsius: 4, multiplier: 0.48 },
  { celsius: 5, multiplier: 0.5 },
  { celsius: 6, multiplier: 0.526 },
  { celsius: 7, multiplier: 0.552 },
  { celsius: 8, multiplier: 0.578 },
  { celsius: 9, multiplier: 0.604 },
  { celsius: 10, multiplier: 0.63 },
  { celsius: 11, multiplier: 0.666 },
  { celsius: 12, multiplier: 0.702 },
  { celsius: 13, multiplier: 0.738 },
  { celsius: 14, multiplier: 0.774 },
  { celsius: 15, multiplier: 0.81 },
  { celsius: 16, multiplier: 0.848 },
  { celsius: 17, multiplier: 0.886 },
  { celsius: 18, multiplier: 0.924 },
  { celsius: 19, multiplier: 0.962 },
  { celsius: 20, multiplier: 1 },
  { celsius: 21, multiplier: 1.05 },
  { celsius: 22, multiplier: 1.1 },
  { celsius: 23, multiplier: 1.15 },
  { celsius: 24, multiplier: 1.2 },
  { celsius: 25, multiplier: 1.25 },
  { celsius: 26, multiplier: 1.316 },
  { celsius: 27, multiplier: 1.382 },
  { celsius: 28, multiplier: 1.448 },
  { celsius: 29, multiplier: 1.514 },
  { celsius: 30, multiplier: 1.58 },
  { celsius: 31, multiplier: 1.664 },
  { celsius: 32, multiplier: 1.748 },
  { celsius: 33, multiplier: 1.832 },
  { celsius: 34, multiplier: 1.872 },
  { celsius: 35, multiplier: 2 },
  { celsius: 36, multiplier: 2.1 },
  { celsius: 37, multiplier: 2.2 },
  { celsius: 38, multiplier: 2.3 },
  { celsius: 39, multiplier: 2.4 },
  { celsius: 40, multiplier: 2.5 },
  { celsius: 41, multiplier: 2.628 },
  { celsius: 42, multiplier: 2.756 },
  { celsius: 43, multiplier: 2.884 },
  { celsius: 44, multiplier: 3.012 },
  { celsius: 45, multiplier: 3.15 },
  { celsius: 46, multiplier: 3.316 },
  { celsius: 47, multiplier: 3.482 },
  { celsius: 48, multiplier: 3.648 },
  { celsius: 49, multiplier: 3.814 },
  { celsius: 50, multiplier: 3.98 },
  { celsius: 51, multiplier: 4.184 },
  { celsius: 52, multiplier: 4.388 },
  { celsius: 53, multiplier: 4.592 },
  { celsius: 54, multiplier: 4.796 },
  { celsius: 55, multiplier: 5 },
  { celsius: 56, multiplier: 5.26 },
  { celsius: 57, multiplier: 5.52 },
  { celsius: 58, multiplier: 5.78 },
  { celsius: 59, multiplier: 6.04 },
  { celsius: 60, multiplier: 6.3 },
  { celsius: 61, multiplier: 6.62 },
  { celsius: 62, multiplier: 6.94 },
  { celsius: 63, multiplier: 7.26 },
  { celsius: 64, multiplier: 7.58 },
  { celsius: 65, multiplier: 7.9 },
  { celsius: 66, multiplier: 8.32 },
  { celsius: 67, multiplier: 8.74 },
  { celsius: 68, multiplier: 9.16 },
  { celsius: 69, multiplier: 9.58 },
  { celsius: 70, multiplier: 10 },
  { celsius: 71, multiplier: 10.52 },
  { celsius: 72, multiplier: 11.04 },
  { celsius: 73, multiplier: 11.56 },
  { celsius: 74, multiplier: 12.08 },
  { celsius: 75, multiplier: 12.6 },
  { celsius: 76, multiplier: 13.24 },
  { celsius: 77, multiplier: 13.88 },
  { celsius: 78, multiplier: 14.52 },
  { celsius: 79, multiplier: 15.16 },
  { celsius: 80, multiplier: 15.8 },
  { celsius: 81, multiplier: 16.64 },
  { celsius: 82, multiplier: 17.48 },
  { celsius: 83, multiplier: 18.32 },
  { celsius: 84, multiplier: 19.16 },
  { celsius: 85, multiplier: 20 },
  { celsius: 86, multiplier: 21.04 },
  { celsius: 87, multiplier: 22.08 },
  { celsius: 88, multiplier: 23.12 },
  { celsius: 89, multiplier: 24.16 },
  { celsius: 90, multiplier: 25.2 },
  { celsius: 91, multiplier: 26.45 },
  { celsius: 92, multiplier: 27.7 },
  { celsius: 93, multiplier: 28.95 },
  { celsius: 94, multiplier: 30.2 },
  { celsius: 95, multiplier: 31.6 },
  { celsius: 96, multiplier: 33.28 },
  { celsius: 97, multiplier: 34.96 },
  { celsius: 98, multiplier: 36.64 },
  { celsius: 99, multiplier: 38.32 },
  { celsius: 100, multiplier: 40 },
  // Continue up to 130 C as in the Excel sheet
  ...[...Array(31)].map((_, i) => {
    const celsius = 100 + i;
    const multiplier = 40 + i * (i <= 10 ? 2 : i <= 20 ? 4 : 8); // Example non-linear progression
    return { celsius, multiplier: parseFloat(multiplier.toFixed(2)) };
  }),
];

const convertFahrenheitToCelsius = (fahrenheit: number): number => {
  if (fahrenheit === null || fahrenheit === undefined) return 0;
  // Find the closest fahrenheit value in the table
  const closest = TEMP_CONVERSION_DATA.reduce((prev, curr) =>
    Math.abs(curr.fahrenheit - fahrenheit) <
    Math.abs(prev.fahrenheit - fahrenheit)
      ? curr
      : prev,
  );
  return closest.celsius;
};

// Find the Temperature Correction Factor from the table
// If the exact Celsius value is not found, interpolate
const getTCF = (celsius: number): number => {
  if (celsius === null || celsius === undefined) return 1;

  // Find exact match first
  const exactMatch = TCF_DATA.find((data) => data.celsius === celsius);
  if (exactMatch) {
    return exactMatch.multiplier; // Return exact value from table
  }

  // If no exact match, interpolate between surrounding values
  const lowerBound = TCF_DATA.filter((data) => data.celsius < celsius).pop();
  const upperBound = TCF_DATA.filter((data) => data.celsius > celsius).shift();

  if (!lowerBound && !upperBound) return 1; // Should not happen with a comprehensive table
  if (!lowerBound) return upperBound!.multiplier;
  if (!upperBound) return lowerBound.multiplier;

  // Linear interpolation
  const range = upperBound.celsius - lowerBound.celsius;
  const position = celsius - lowerBound.celsius;
  const difference = upperBound.multiplier - lowerBound.multiplier;

  const interpolatedValue =
    lowerBound.multiplier + (position / range) * difference;

  // Don't round here to maintain precision
  return interpolatedValue;
};

// Apply the TCF to a reading
const applyTCF = (reading: string, tcf: number): string => {
  const numericReading = parseFloat(reading);
  if (isNaN(numericReading) || tcf === 1) {
    return reading; // Return original if not a number or TCF is 1
  }
  const correctedValue = numericReading * tcf;

  // Format to a reasonable number of significant figures
  return correctedValue.toPrecision(4);
};

const ThreeLowVoltageCableATSForm: React.FC = () => {
  const { id: jobId, reportId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();

  // Add print styles and hide navigation/scrollbar
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      /* Hide navigation bar and scrollbar */
      nav, header, .navigation, [class*="nav"], [class*="header"] {
        display: none !important;
      }

      /* Hide scrollbar */
      ::-webkit-scrollbar {
        display: none;
      }

      html {
        height: 100%;
      }

      body {
        overflow-x: hidden;
        min-height: 100vh;
        padding-bottom: 100px;
      }

      /* Ensure comments section is visible */
      textarea {
        min-height: 200px !important;
      }

      /* Section headers with orange dividers for fillable report */
      h2 {
        border-top: 2px solid ${BRAND_COLOR} !important;
        padding-top: 8px !important;
        margin-top: 16px !important;
      }

      @media print {
        * { color: black !important; background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif !important; font-size: 9px !important; background: white !important; line-height: 1 !important; }
        @page { size: 8.5in 11in; margin: 0.2in; }
        .print\\:hidden { display: none !important; }
        .flex.justify-between.items-center.mb-6 { display: none !important; }
        .flex.items-center.gap-4 { display: none !important; }
        button { display: none !important; }
        h2 { font-size: 9px !important; font-weight: bold !important; margin: 0 !important; margin-top: 0 !important; padding: 1px 0 !important; background-color: transparent !important; color: black !important; text-transform: none !important; border: none !important; border-bottom: 1px solid black !important; line-height: 1.2 !important; padding-bottom: 2px !important; padding-top: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; position: relative !important; }
        h2::before { display: none !important; }
        .mb-6 { margin-top: 12px !important; border-top: 2px solid ${BRAND_COLOR} !important; padding-top: 8px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .mb-6:first-of-type { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
        table { margin-bottom: 8px !important; }
        .status-pass { background-color: #22c55e !important; border: 2px solid #16a34a !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .status-fail { background-color: #ef4444 !important; border: 2px solid #dc2626 !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .bg-white, .dark\\:bg-dark-150, .rounded-none, .shadow { background: white !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; margin-bottom: 3px !important; border: none !important; }
        section { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; margin-bottom: 2px !important; }
        div[class*="border"], div[class*="shadow"], div[class*="rounded"] { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
        div[class*="p-"], div[class*="px-"], div[class*="py-"], div[class*="pt-"], div[class*="pb-"], div[class*="pl-"], div[class*="pr-"] { padding: 0 !important; }
        * { border: none !important; box-shadow: none !important; outline: none !important; }
        .print\\:border { border: none !important; }
        .print\\:border-black { border: none !important; }
        div.bg-white, div[class*='bg-white'] { border: none !important; box-shadow: none !important; background: transparent !important; }
        div[class*='shadow'], div[class*='rounded'] { border: none !important; box-shadow: none !important; background: transparent !important; border-radius: 0 !important; }
        .max-w-7xl > div { border: none !important; box-shadow: none !important; background: transparent !important; }
        div:not(:has(table)) { border: none !important; box-shadow: none !important; background: transparent !important; }
        table, th, td, thead, tbody, tr { border: 0.5px solid black !important; }
        input, select, textarea { border-bottom: 1px solid black !important; }
        textarea { border: 1px solid black !important; }
        .grid { display: grid !important; gap: 1px !important; margin-bottom: 2px !important; }
        .grid-cols-1.md\\:grid-cols-2 { grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; }
        label { font-size: 8px !important; font-weight: normal !important; margin: 0 !important; display: inline-block !important; margin-right: 2px !important; }
        input, select, textarea { width: auto !important; border: none !important; border-bottom: 1px solid black !important; background: transparent !important; padding: 0 1px !important; margin: 0 !important; font-size: 8px !important; height: 12px !important; display: inline-block !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; }
        input[type="text"], input[type="number"] { width: 80px !important; }
        table input[type="text"] { width: 50px !important; max-width: 50px !important; }
        input[type="date"] { width: 70px !important; }
        textarea { width: 100% !important; height: auto !important; min-height: 20px !important; border: 1px solid black !important; display: block !important; margin-top: 1px !important; font-size: 8px !important; padding: 2px !important; }
        table { width: 100% !important; border-collapse: collapse !important; margin: 1px 0 !important; font-size: 8px !important; page-break-inside: avoid !important; margin-bottom: 16px !important; }
        th, td { border: 0.5px solid black !important; padding: 0px 1px !important; text-align: center !important; font-size: 8px !important; height: 12px !important; line-height: 1 !important; }
        th { background-color: #f0f0f0 !important; font-weight: bold !important; }
        table input, table select { border: none !important; border-bottom: none !important; padding: 0 !important; margin: 0 !important; height: 10px !important; text-align: center !important; width: 100% !important; font-size: 8px !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; }
        td input, td select, td textarea { border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; outline: none !important; }
        .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
        .mb-4 { margin-bottom: 2px !important; }
        .mb-6 { margin-bottom: 3px !important; }
        .mb-8 { margin-bottom: 3px !important; }
        .p-6 { padding: 0 !important; }
        .bg-green-600, .bg-red-600 { background-color: transparent !important; color: black !important; border: 1px solid black !important; padding: 0px 2px !important; font-weight: bold !important; font-size: 9px !important; }
        .text-green-600 { color: green !important; }
        .text-red-600 { color: red !important; }
        .min-h-[250px] { min-height: 20px !important; }
        .text-xs { font-size: 7px !important; }
        .flex.items-center { display: inline-flex !important; margin-right: 10px !important; }
        section { page-break-inside: avoid !important; }
        .max-w-7xl { max-width: 100% !important; }
        .border-b.dark\\:border-neutral-700 { border: none !important; margin: 0 !important; padding: 0 !important; }
        section { margin-bottom: 2px !important; padding: 0 !important; }
        .print\\:flex { margin-bottom: 3px !important; }
        div[class*='print:border'] { border: none !important; box-shadow: none !important; background: transparent !important; }
        div[class*='print:border-black'] { border: none !important; box-shadow: none !important; background: transparent !important; }

        /* Completely remove input borders in tables - highest specificity */
        table td input, table td select, table td textarea { border: none !important; border-top: none !important; border-bottom: none !important; border-left: none !important; border-right: none !important; outline: none !important; box-shadow: none !important; }
        tbody td input, tbody td select { border: none !important; outline: none !important; }

        /* Nuclear option - remove ALL styling from inputs in print */
        input, select, textarea { border: none !important; outline: none !important; box-shadow: none !important; background: transparent !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; color: black !important; }
        input[type="text"], input[type="number"], select option { border: none !important; outline: none !important; color: black !important; }

        /* Remove any unwanted lines from input elements */
        input:focus, select:focus, textarea:focus { border: none !important; outline: none !important; }
        input::before, input::after, select::before, select::after { display: none !important; }

        /* Ensure no bottom borders on inputs that might create lines */
        input { border-bottom: none !important; text-decoration: none !important; color: black !important; }
        td input { border-bottom: none !important; border-top: none !important; color: black !important; }

        /* Hide select elements completely in print and show values as text */
        select { display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; }

        /* Show print-only spans that contain the selected values */
        .print\\:inline-block { display: inline-block !important; color: black !important; font-size: 8px !important; text-align: center !important; width: 100% !important; }

        /* Page break controls */
        .page-break-before { page-break-before: always !important; }
        .page-break-after { page-break-after: always !important; }
        .page-break-inside-avoid { page-break-inside: avoid !important; }

        /* Orange dividers - must come after universal border removal */
        div.mb-6 { border-top: 2px solid ${BRAND_COLOR} !important; margin-top: 12px !important; padding-top: 8px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        div.mb-6:first-of-type { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [formData, setFormData] = useState<CableTestData>({
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split("T")[0],
    jobNumber: "",
    technicians: "",
    substation: "",
    eqptLocation: "",
    identifier: "",
    temperature: 70,
    humidity: 50,
    testedFrom: "",
    manufacturer: "",
    conductorMaterial: "",
    insulationType: "",
    systemVoltage: "",
    ratedVoltage: "",
    length: "",
    inspectionResults: {
      "7.3.1.A.1": "Select One",
      "7.3.1.A.2": "Select One",
      "7.3.1.A.3": "Select One",
      "7.3.1.A.4": "Select One",
      "7.3.1.A.5": "Select One",
      "7.3.1.A.6": "Select One",
      "7.3.1.A.7": "Select One",
      "7.3.1.A.8": "Select One",
    },
    testVoltage: "1000V",
    testSets: Array.from({ length: 3 }, (_, i) => ({
      // Changed to 3 sets
      id: i,
      from: "",
      to: "",
      size: "",
      result: "PASS",
      configuration: "",
      readings: {
        aToGround: "",
        bToGround: "",
        cToGround: "",
        nToGround: "",
        aToB: "",
        bToC: "",
        cToA: "",
        aToN: "",
        bToN: "",
        cToN: "",
        continuity: "",
      },
      correctedReadings: {
        aToGround: "",
        bToGround: "",
        cToGround: "",
        nToGround: "",
        aToB: "",
        bToC: "",
        cToA: "",
        aToN: "",
        bToN: "",
        cToN: "",
        continuity: "",
      },
    })),
    testEquipment: {
      megohmmeter: "",
      serialNumber: "",
      ampId: "",
      calDate: "",
      comments: "",
    },
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(!reportId);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState(false);
  const [status, setStatus] = useState<"PASS" | "FAIL">("PASS");
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    reportId,
  );
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(reportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);
  // Mutex shared between autoSave and handleSave so they cannot both insert
  // concurrently. Without this, a manual Save click during the auto-save
  // debounce window can create a duplicate report row + orphaned asset.
  const savingInFlightRef = React.useRef(false);

  const waitForCreatedReportId = React.useCallback(async () => {
    if (reportIdRef.current) return reportIdRef.current;
    if (!creatingRef.current) return undefined;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (reportIdRef.current) return reportIdRef.current;
    }

    return undefined;
  }, []);

  const reportSlug = "low-voltage-cable-test-3sets-ats"; // New ATS slug

  // Keep currentReportId in sync if URL param changes
  useEffect(() => {
    setCurrentReportId(reportId);
    reportIdRef.current = reportId;
    isAutoSaveCreatedRef.current = false;
  }, [reportId]);

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
      setLoading(true);
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
        .single();

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
            .single();

          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || "";
            if (!customerAddress) customerAddress = customerData.address || "";
          }
        }

        setFormData((prev) => ({
          ...prev,
          jobNumber: jobData.job_number || "",
          customer: maskCustomerName(customerName),
          address: prev.address || maskCustomerAddress(customerAddress),
        }));
      }
    } catch (error) {
      console.error("Error loading job info:", error);
      setError(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      // setLoading(false);
    }
  };

  // Add loadReport function to load existing report data
  const loadReport = async () => {
    // Skip load if auto-save just created this report - data is already in state
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) {
      setLoading(false); // No report to load, finish loading
      return;
    }

    try {
      // Keep loading true while fetching report
      console.log(`Loading report with ID: ${currentReportId}`);

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("low_voltage_cable_test_3sets") // Using the same table for ATS
        .select("*")
        .eq("id", currentReportId);

      if (error) {
        console.error("Error loading report:", error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error(
          "Error loading report: No report found with this ID in this table.",
        );
        throw new Error(
          "No report found with this ID. The link may be incorrect.",
        );
      }

      if (data.length > 1) {
        console.error(
          "Error loading report: Multiple reports found with this ID.",
        );
        throw new Error(
          "Multiple reports found with this ID. Please contact support.",
        );
      }

      const reportData = data[0];

      if (reportData && reportData.data) {
        console.log("Report data loaded successfully:", reportData.data);
        // Merge loaded data with existing data (like job info)
        setFormData((prevData) => ({
          ...prevData,
          ...reportData.data,
          temperature: reportData.data.temperature ?? prevData.temperature,
          humidity: reportData.data.humidity ?? prevData.humidity,
          testSets: reportData.data.testSets ?? prevData.testSets,
          testEquipment:
            reportData.data.testEquipment ?? prevData.testEquipment,
          jobNumber: prevData.jobNumber,
          customer: prevData.customer,
          address: prevData.address,
          user: reportData.data.user ?? prevData.user,
        }));

        if (reportData.data.status) {
          setStatus(reportData.data.status);
        }
        setIsEditMode(false); // Existing report loaded, start in view mode
      } else {
        console.warn("No data found for report ID:", currentReportId);
      }
    } catch (error) {
      console.error("Error in loadReport:", error);
      setError(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false); // Finish loading after report fetch attempt
    }
  };

  // Combined effect for loading job and report data
  useEffect(() => {
    if (jobId && user) {
      loadJobInfo().then(() => {
        if (currentReportId) {
          loadReport();
        } else {
          setLoading(false);
          setIsEditMode(true);
        }
      });
    } else if (!jobId) {
      setError("Job ID is missing.");
      setLoading(false);
    } else if (!user) {
      setError("User not authenticated.");
      setLoading(false);
    }
  }, [jobId, currentReportId, user]);

  // Derived values
  const celsiusTemperature = convertFahrenheitToCelsius(formData.temperature);
  const tcf = getTCF(celsiusTemperature);

  // Recalculate corrected readings
  useEffect(() => {
    const updatedTestSets = formData.testSets.map((set) => {
      const correctedReadings = {
        aToGround: applyTCF(set.readings.aToGround, tcf),
        bToGround: applyTCF(set.readings.bToGround, tcf),
        cToGround: applyTCF(set.readings.cToGround, tcf),
        nToGround: applyTCF(set.readings.nToGround, tcf),
        aToB: applyTCF(set.readings.aToB, tcf),
        bToC: applyTCF(set.readings.bToC, tcf),
        cToA: applyTCF(set.readings.cToA, tcf),
        aToN: applyTCF(set.readings.aToN, tcf),
        bToN: applyTCF(set.readings.bToN, tcf),
        cToN: applyTCF(set.readings.cToN, tcf),
        continuity: set.readings.continuity,
      };

      if (
        JSON.stringify(set.correctedReadings) !==
        JSON.stringify(correctedReadings)
      ) {
        return { ...set, correctedReadings };
      }
      return set;
    });

    if (JSON.stringify(formData.testSets) !== JSON.stringify(updatedTestSets)) {
      setFormData((prev) => ({ ...prev, testSets: updatedTestSets }));
    }
  }, [
    formData.temperature,
    JSON.stringify(formData.testSets.map((s) => s.readings)),
    tcf,
  ]);

  // Handle form field changes
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setJustSaved(false);
    const { name, value } = e.target;

    if (name.startsWith("testEquipment.")) {
      const field = name.split(".")[1] as keyof typeof formData.testEquipment;
      setFormData((prev) => ({
        ...prev,
        testEquipment: { ...prev.testEquipment, [field]: value },
      }));
    } else {
      const targetValue =
        (e.target as HTMLInputElement).type === "number"
          ? value === ""
            ? ""
            : parseFloat(value)
          : value;
      setFormData((prev) => ({ ...prev, [name]: targetValue }));
    }
  };

  const handleReadingChange = (
    setId: number,
    field: keyof TestSet["readings"],
    value: string,
  ) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      testSets: prev.testSets.map((set) =>
        set.id === setId
          ? { ...set, readings: { ...set.readings, [field]: value } }
          : set,
      ),
    }));
  };

  const handleTestSetChange = (
    setId: number,
    field: keyof Pick<TestSet, "from" | "to" | "size" | "result">,
    value: string,
  ) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      testSets: prev.testSets.map((set) =>
        set.id === setId ? { ...set, [field]: value } : set,
      ),
    }));
  };

  const handleInspectionChange = (section: string, value: string) => {
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      inspectionResults: {
        ...prev.inspectionResults,
        [section]: value,
      },
    }));
  };

  // Auto-save: silently persists in-progress data so users don't lose work
  // if they close the tab, lose connectivity, etc.
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    if (savingInFlightRef.current) return;

    savingInFlightRef.current = true;
    setIsAutoSaving(true);

    try {
      const reportDataToSave = { ...formData, status };
      const payload = {
        job_id: jobId,
        user_id: user.id,
        data: reportDataToSave,
        updated_at: new Date().toISOString(),
      };

      if (reportIdRef.current) {
        const { error: updateError } = await supabase
          .schema("neta_ops")
          .from("low_voltage_cable_test_3sets")
          .update(payload)
          .eq("id", reportIdRef.current);
        if (updateError) throw updateError;
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const insertPayload = {
            ...payload,
            created_at: new Date().toISOString(),
          };
          const { data: insertData, error: insertError } = await supabase
            .schema("neta_ops")
            .from("low_voltage_cable_test_3sets")
            .insert(insertPayload)
            .select("id")
            .single();
          if (insertError) {
            creatingRef.current = false;
            throw insertError;
          }
          if (insertData) {
            const newId = insertData.id as string;
            reportIdRef.current = newId;
            isAutoSaveCreatedRef.current = true;
            setCurrentReportId(newId);

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || ""),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${newId}`,
              user_id: user.id,
              created_at: new Date().toISOString(),
            };
            const { data: assetResult, error: assetError } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert(assetData)
              .select("id")
              .single();
            if (assetError) {
              console.error("Auto-save asset insert failed:", assetError);
            } else if (assetResult) {
              const { error: linkError } = await supabase
                .schema("neta_ops")
                .from("job_assets")
                .insert({
                  job_id: jobId,
                  asset_id: assetResult.id,
                  user_id: user.id,
                });
              if (linkError)
                console.error("Auto-save job_assets link failed:", linkError);
            }

            window.history.replaceState(
              null,
              "",
              `/jobs/${jobId}/${reportSlug}/${newId}`,
            );
            creatingRef.current = false;
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (err) {
      console.error("Auto-save error:", err);
    } finally {
      savingInFlightRef.current = false;
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, isEditMode, formData, status, reportSlug]);

  // Debounced auto-save trigger when form data, status, or edit mode changes
  useEffect(() => {
    if (!isEditMode || loading) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => autoSave(), 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData, status, isEditMode, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    setIsSaving(true);
    setError(null);

    // Cancel any pending auto-save so it cannot fire mid-save and create a duplicate row
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Wait briefly if an auto-save is already in flight; up to ~5 seconds
    let waited = 0;
    while (savingInFlightRef.current && waited < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waited += 100;
    }
    if (savingInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    const activeReportId = reportIdRef.current || currentReportId;
    const wasExistingReport = Boolean(activeReportId);

    savingInFlightRef.current = true;
    try {
      console.log(
        "Attempting to save to schema: neta_ops, table: low_voltage_cable_test_3sets",
      );

      const reportDataToSave = { ...formData, status: status };

      const reportPayload = {
        job_id: jobId,
        user_id: user.id,
        data: reportDataToSave,
        updated_at: new Date().toISOString(),
      };

      console.log("Payload:", reportPayload);

      let savedReportId = activeReportId;
      let operation: "update" | "insert" = "insert";

      if (activeReportId) {
        operation = "update";
        const { error: updateError } = await supabase
          .schema("neta_ops")
          .from("low_voltage_cable_test_3sets")
          .update(reportPayload)
          .eq("id", activeReportId);

        if (updateError) {
          console.error("Update error details:", updateError);
          throw updateError;
        }
        console.log("Report updated successfully");
      } else {
        operation = "insert";
        const insertPayload = {
          ...reportPayload,
          created_at: new Date().toISOString(),
        };
        console.log("Insert Payload:", insertPayload);

        const { data: insertData, error: insertError } = await supabase
          .schema("neta_ops")
          .from("low_voltage_cable_test_3sets")
          .insert(insertPayload)
          .select("id")
          .single();

        if (insertError) {
          console.error("Insert error details:", insertError);
          throw insertError;
        }
        savedReportId = insertData.id;
        reportIdRef.current = savedReportId;
        setCurrentReportId(savedReportId);
        isAutoSaveCreatedRef.current = true;
        console.log("Report created successfully with ID:", savedReportId);

        const assetData = {
          name: getAssetName(reportSlug, formData.identifier || ""),
          file_url: `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`,
          user_id: user.id,
          created_at: new Date().toISOString(),
        };

        console.log("Creating asset entry:", assetData);
        const { data: assetResult, error: assetError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .insert(assetData)
          .select("id")
          .single();

        if (assetError) {
          console.error("Error creating asset record:", assetError);
          alert("Report saved, but failed to create asset link.");
        } else if (assetResult) {
          console.log("Asset created with ID:", assetResult.id);

          const jobAssetData = {
            job_id: jobId,
            asset_id: assetResult.id,
            user_id: user.id,
          };

          console.log("Linking asset to job:", jobAssetData);
          const { error: jobAssetError } = await supabase
            .schema("neta_ops")
            .from("job_assets")
            .insert(jobAssetData);

          if (jobAssetError) {
            console.error("Error linking asset to job:", jobAssetError);
            alert(
              "Report saved and asset created, but failed to link asset to job.",
            );
          } else {
            console.log("Asset successfully linked to job");
          }
        }
      }

      setJustSaved(true);
      if (!wasExistingReport) {
        setIsEditMode(false);
        // Quietly update URL with new report ID
        const newId = savedReportId;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      }
    } catch (err: any) {
      console.error("Error saving report:", err);
      setError(`Failed to save report: ${err.message || "Unknown error"}`);
      alert(`Error saving report: ${err.message || "Unknown error"}`);
    } finally {
      savingInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportIdRef.current) {
      setIsEditMode(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    currentPos: { row: number; col: number },
  ) => {
    const { row, col } = currentPos;
    const TOTAL_COLS = 15;
    const TOTAL_ROWS = 3; // 3 sets for this component

    if (
      e.target instanceof HTMLSelectElement &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
    }

    switch (e.key) {
      case "ArrowRight":
        if (col < TOTAL_COLS - 1) {
          e.preventDefault();
          const nextElement = document.querySelector(
            `[data-position="${row}-${col + 1}"]`,
          ) as HTMLElement;
          nextElement?.focus();
        }
        break;
      case "ArrowLeft":
        if (col > 0) {
          e.preventDefault();
          const prevElement = document.querySelector(
            `[data-position="${row}-${col - 1}"]`,
          ) as HTMLElement;
          prevElement?.focus();
        }
        break;
      case "ArrowDown":
        if (row < TOTAL_ROWS - 1) {
          e.preventDefault();
          const nextElement = document.querySelector(
            `[data-position="${row + 1}-${col}"]`,
          ) as HTMLElement;
          nextElement?.focus();
        }
        break;
      case "ArrowUp":
        if (row > 0) {
          e.preventDefault();
          const prevElement = document.querySelector(
            `[data-position="${row - 1}-${col}"]`,
          ) as HTMLElement;
          prevElement?.focus();
        }
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div
      className="w-full overflow-visible"
      style={{ minHeight: "calc(100vh + 300px)", paddingBottom: "200px" }}
    >
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 35, marginLeft: "5px", marginTop: "2px" }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">
            3-Set Low Voltage Cable Test Report (ATS)
          </h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c", width: "120px" }}
        >
          NETA - ATS 7.2.1.1
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        <ReportHeader
          title="3-Set Low Voltage Cable Test Report (ATS)"
          isAutoSaving={isAutoSaving}
          isEditing={isEditMode}
          justSaved={justSaved}
          isSaving={isSaving}
          status={status}
          hasReport={!!currentReportId}
          onStatusToggle={() => {
            if (isEditMode) setStatus(status === "PASS" ? "FAIL" : "PASS");
          }}
          onSave={handleSave}
          onSaveAndClose={handleSaveAndClose}
          onEdit={() => setIsEditMode(true)}
          onBack={() => navigate(`/jobs/${jobId}`)}
          onPrint={() => window.print()}
        />

        {/* Job Information Section */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Job Information
          </h2>
          {/* PASS/FAIL Status - Print Only, positioned to the right */}
          <div
            className="hidden print:block"
            style={{
              position: "absolute",
              right: "90px",
              top: "85px",
              zIndex: 10,
            }}
          >
            <div
              className={status === "PASS" ? "status-pass" : "status-fail"}
              style={{
                display: "inline-block",
                padding: "6px 16px",
                fontSize: "14px",
                fontWeight: "bold",
                textAlign: "center",
                minWidth: "80px",
                borderRadius: "4px",
              }}
            >
              {status || "PASS"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-8 print:hidden">
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
                  value={maskCustomerName(formData.customer)}
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
                    value={maskCustomerAddress(formData.address)}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    readOnly={!isEditMode}
                    rows={3}
                    className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditMode ? "bg-neutral-50" : ""}`}
                  />
                </div>
                <div className="hidden print:flex print:items-baseline">
                  <label
                    style={{
                      fontSize: "8px",
                      marginRight: "4px",
                      display: "inline-block",
                      width: "50px",
                    }}
                  >
                    Address
                  </label>
                  <span
                    style={{
                      fontSize: "8px",
                      borderBottom: "1px solid black",
                      display: "inline-block",
                      minWidth: "150px",
                      paddingBottom: "1px",
                    }}
                  >
                    {maskCustomerAddress(formData.address)}
                  </span>
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
                    setFormData((prev) => ({
                      ...prev,
                      identifier: e.target.value,
                    }))
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                    setFormData((prev) => ({
                      ...prev,
                      technicians: e.target.value,
                    }))
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                    setFormData((prev) => ({
                      ...prev,
                      substation: e.target.value,
                    }))
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                    setFormData((prev) => ({
                      ...prev,
                      eqptLocation: e.target.value,
                    }))
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, date: e.target.value }))
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  User
                </label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, user: e.target.value }))
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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
                    value={formData.temperature}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        temperature: Number(e.target.value),
                      }))
                    }
                    readOnly={!isEditMode}
                    className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    °C
                  </label>
                  <input
                    type="number"
                    value={celsiusTemperature}
                    readOnly
                    className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    TCF
                  </label>
                  <input
                    type="number"
                    value={tcf}
                    readOnly
                    className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
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
              temperature: {
                fahrenheit: formData.temperature,
                celsius: celsiusTemperature,
                tcf: tcf,
                humidity: formData.humidity,
              },
            }}
          />
        </div>

        {/* Placeholder for additional sections - to be completed */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Cable Information
          </h2>
          <div className="text-neutral-500 dark:text-white p-4 border border-neutral-300 dark:border-neutral-600 rounded">
            Cable information section - to be implemented
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Test Results
          </h2>
          <div className="text-neutral-500 dark:text-white p-4 border border-neutral-300 dark:border-neutral-600 rounded">
            Test results section - to be implemented
          </div>
        </div>

        <div className="mb-6 page-break-before">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Test Equipment Used
          </h2>
          <div className="grid grid-cols-3 gap-4 print:hidden test-eqpt-onscreen">
            <div>
              <label
                htmlFor="megohmmeter"
                className="form-label inline-block w-32"
              >
                Megohmmeter:
              </label>
              <EquipmentAutocomplete
                value={formData.testEquipment.megohmmeter}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      megohmmeter: value,
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
                      megohmmeter: equipment.equipment_name,
                      serialNumber: equipment.serial_number || "",
                      ampId: equipment.amp_id || "",
                      calDate: formatLocalDateShort(equipment.calibration_date),
                    },
                  }));
                }}
                readOnly={!isEditMode}
                className="form-input"
              />
            </div>
            <div>
              <label
                htmlFor="serialNumber"
                className="form-label inline-block w-32"
              >
                Serial Number:
              </label>
              <input
                id="serialNumber"
                name="testEquipment.serialNumber"
                type="text"
                value={formData.testEquipment.serialNumber}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      serialNumber: e.target.value,
                    },
                  }))
                }
                className={`form-input ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                readOnly={!isEditMode}
              />
            </div>
            <div>
              <label htmlFor="ampId" className="form-label inline-block w-32">
                AMP ID:
              </label>
              <input
                id="ampId"
                name="testEquipment.ampId"
                type="text"
                value={formData.testEquipment.ampId}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      ampId: e.target.value,
                    },
                  }))
                }
                className={`form-input ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                readOnly={!isEditMode}
              />
            </div>
            <div>
              <label htmlFor="calDate" className="form-label inline-block w-32">
                Cal Date:
              </label>
              <input
                id="calDate"
                name="testEquipment.calDate"
                type="text"
                value={formData.testEquipment.calDate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      calDate: e.target.value,
                    },
                  }))
                }
                className={`form-input ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                readOnly={!isEditMode}
              />
            </div>
          </div>
          {/* Print-only compact Test Equipment table (3 boxes wide, 1 row) */}
          <div className="hidden print:block">
            <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print:border text-[0.85rem] test-eqpt-print">
              <colgroup>
                <col style={{ width: "33.33%" }} />
                <col style={{ width: "33.33%" }} />
                <col style={{ width: "33.33%" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                    <div className="font-semibold">Megohmmeter:</div>
                    <div className="mt-0">
                      {formData.testEquipment.megohmmeter || ""}
                    </div>
                  </td>
                  <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                    <div className="font-semibold">Serial Number:</div>
                    <div className="mt-0">
                      {formData.testEquipment.serialNumber || ""}
                    </div>
                  </td>
                  <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                    <div className="font-semibold">AMP ID:</div>
                    <div className="mt-0">
                      {formData.testEquipment.ampId || ""}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          className={`mb-6 comments-section print:break-inside-avoid ${!formData.testEquipment.comments?.trim() ? "print:hidden" : ""}`}
        >
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
            Comments
          </h2>
          <textarea
            value={formData.testEquipment.comments}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                testEquipment: {
                  ...prev.testEquipment,
                  comments: e.target.value,
                },
              }))
            }
            readOnly={!isEditMode}
            rows={6}
            className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
            placeholder="Enter comments here..."
          />
          {formData.testEquipment.comments?.trim() && (
            <div className="hidden print:block whitespace-pre-wrap break-words">
              {formData.testEquipment.comments}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreeLowVoltageCableATSForm;
