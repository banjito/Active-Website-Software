import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

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
  // Test configuration
  numberOfCables: number;
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
    comments: string;
  };
}

interface TestSet {
  id: number;
  from: string;
  to: string;
  size: string;
  config: string; // Configuration dropdown
  result: string;
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
    continuity: string;
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
  "Not Applicable"
];

const INSULATION_RESISTANCE_UNITS = [
  { value: "kΩ", label: "Kilo-Ohms" },
  { value: "MΩ", label: "Mega-Ohms" },
  { value: "GΩ", label: "Giga-Ohms" }
];

const TEST_VOLTAGES = ["250V", "500V", "1000V", "2500V", "5000V"];

const CABLE_SIZES = [
  "#18", "#16", "#12", "#10", "#8", "#6", "#4", "#2", "#1",
  "1/0", "2/0", "3/0", "4/0", "250", "300", "350", "400", "500", "600", "750", "1000"
];

const EVALUATION_RESULTS = ["PASS", "FAIL", "LIMITED SERVICE"];

const CONFIGURATION_OPTIONS = [
  "Select One",
  "3 wire",
  "4 wire"
];

// Temperature Conversion Data (from Temp Conv sheet)
// Reduced version for brevity, expand as needed
const TEMP_CONVERSION_DATA: { fahrenheit: number; celsius: number }[] = [
  // Generate a comprehensive temperature conversion table from -50°F to 230°F
  ...[...Array(281)].map((_, i) => {
    const fahrenheit = -50 + i;
    const celsius = (fahrenheit - 32) * 5 / 9;
    return { fahrenheit, celsius: parseFloat(celsius.toFixed(1)) };
  })
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
  { celsius: 101, multiplier: 42.08 },
  { celsius: 102, multiplier: 44.16 },
  { celsius: 103, multiplier: 46.24 },
  { celsius: 104, multiplier: 48.32 },
  { celsius: 105, multiplier: 50.4 },
  { celsius: 106, multiplier: 52.96 },
  { celsius: 107, multiplier: 55.52 },
  { celsius: 108, multiplier: 58.08 },
  { celsius: 109, multiplier: 60.64 },
  { celsius: 110, multiplier: 63.2 }
];

// Utility functions with Linear Interpolation for better accuracy between table points
const convertFahrenheitToCelsius = (fahrenheit: number): number => {
  if (TEMP_CONVERSION_DATA.length === 0) return NaN; // Handle empty data case

  // Check boundaries
  if (fahrenheit <= TEMP_CONVERSION_DATA[0].fahrenheit) {
    return TEMP_CONVERSION_DATA[0].celsius;
  }
  if (fahrenheit >= TEMP_CONVERSION_DATA[TEMP_CONVERSION_DATA.length - 1].fahrenheit) {
    return TEMP_CONVERSION_DATA[TEMP_CONVERSION_DATA.length - 1].celsius;
  }

  // Find the bracket
  for (let i = 0; i < TEMP_CONVERSION_DATA.length - 1; i++) {
    const lower = TEMP_CONVERSION_DATA[i];
    const upper = TEMP_CONVERSION_DATA[i + 1];
    if (fahrenheit >= lower.fahrenheit && fahrenheit < upper.fahrenheit) {
      // Linear interpolation
      const proportion = (fahrenheit - lower.fahrenheit) / (upper.fahrenheit - lower.fahrenheit);
      const celsius = lower.celsius + proportion * (upper.celsius - lower.celsius);
      return parseFloat(celsius.toFixed(1)); // Return with one decimal place
    }
  }
  
  // Should not be reached if boundaries are checked, but fallback
  return TEMP_CONVERSION_DATA[TEMP_CONVERSION_DATA.length - 1].celsius; 
};

const getTCF = (celsius: number): number => {
   if (TCF_DATA.length === 0) return 1.0; // Handle empty data case

  // Check boundaries
  if (celsius <= TCF_DATA[0].celsius) {
    return TCF_DATA[0].multiplier;
  }
  if (celsius >= TCF_DATA[TCF_DATA.length - 1].celsius) {
    return TCF_DATA[TCF_DATA.length - 1].multiplier;
  }

  // Find the exact match first
  const exactMatch = TCF_DATA.find(data => data.celsius === celsius);
  if (exactMatch) {
    return exactMatch.multiplier; // Return exact value from table
  }

  // If no exact match, find the bracket
  for (let i = 0; i < TCF_DATA.length - 1; i++) {
    const lower = TCF_DATA[i];
    const upper = TCF_DATA[i + 1];
    if (celsius > lower.celsius && celsius < upper.celsius) {
      // Linear interpolation for TCF
      const proportion = (celsius - lower.celsius) / (upper.celsius - lower.celsius);
      const multiplier = lower.multiplier + proportion * (upper.multiplier - lower.multiplier);
      return multiplier; // Return without rounding
    }
  }
  
  // Fallback
  return TCF_DATA[TCF_DATA.length - 1].multiplier; 
};

const applyTCF = (reading: string, tcf: number): string => {
  // Replicates the formula from the Excel: 
  // IF(reading=">2200",">2200", IF(reading="N/A","N/A", IF(reading="","", reading*TCF)))
  const trimmedReading = reading.trim();
  if (trimmedReading === ">2200") return ">2200";
  if (trimmedReading.toUpperCase() === "N/A") return "N/A";
  if (trimmedReading === "") return "";
  
  const numericReading = parseFloat(trimmedReading);
  if (isNaN(numericReading)) return trimmedReading; // Keep non-numeric strings as is
  
  // Format to 2 decimal places, similar to Excel formatting
  return (numericReading * tcf).toFixed(2); 
};

// Main component
const TwelveSetsLowVoltageCableTestForm: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string, reportId?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL' | 'LIMITED SERVICE'>('PASS');
  const [isEditMode, setIsEditMode] = useState<boolean>(!reportId); // Edit mode enabled by default for new reports

  // Function to generate test sets based on number of cables
  const generateTestSets = (numberOfCables: number): TestSet[] => {
    return Array(numberOfCables).fill(null).map((_, index) => ({
      id: index + 1,
      from: "",
      to: "",
      size: "",
      config: "RDG",
      result: "",
      readings: {
        aToGround: "", bToGround: "", cToGround: "", nToGround: "",
        aToB: "", bToC: "", cToA: "",
        aToN: "", bToN: "", cToN: "",
        continuity: "",
      },
      correctedReadings: {
        aToGround: "", bToGround: "", cToGround: "", nToGround: "",
        aToB: "", bToC: "", cToA: "",
        aToN: "", bToN: "", cToN: "",
        continuity: "",
      }
    }));
  };

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'low-voltage-cable-test-12sets'; // This component handles the low-voltage-cable-test-12sets route
  const reportName = getReportName(reportSlug);

  const [formData, setFormData] = useState<CableTestData>({
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split('T')[0],
    jobNumber: "",
    technicians: "",
    substation: "",
    eqptLocation: "",
    identifier: "",
    temperature: 76,
    humidity: 0,
    testedFrom: "",
    manufacturer: "",
    conductorMaterial: "",
    insulationType: "",
    systemVoltage: "",
    ratedVoltage: "",
    length: "",
    numberOfCables: 12,
    inspectionResults: {
      "7.3.1.A.1": "Select One",
      "7.3.1.A.2": "Select One",
      "7.3.1.A.3.1": "Select One",
      "7.3.1.A.4": "Select One",
      "7.3.1.A.5": "Select One",
      "7.3.1.A.6": "Select One",
    },
    testVoltage: "1000V",
    testSets: [],
    testEquipment: {
      megohmmeter: "",
      serialNumber: "",
      ampId: "",
      comments: ""
    },
  });

  // Initialize test sets when component mounts
  useEffect(() => {
    if (formData.testSets.length === 0) {
      setFormData(prev => ({
        ...prev,
        testSets: generateTestSets(prev.numberOfCables)
      }));
    }
  }, []);

  // Add print styles and hide navigation/scrollbar
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide navigation bar and scrollbar */
      nav, header, .navigation, [class*="nav"], [class*="header"] {
        display: none !important;
      }
      ::-webkit-scrollbar { display: none; }
      html { -ms-overflow-style: none; scrollbar-width: none; height: 100%; }
      body { overflow-x: hidden; min-height: 100vh; padding-bottom: 100px; }
      textarea { min-height: 200px !important; }

      /* Section headers with orange dividers for fillable report */
      h2 {
        border-top: 2px solid #f26722 !important;
        padding-top: 8px !important;
        margin-top: 16px !important;
      }

      @media print {
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
        
        /* Add orange dividers for all section containers */
        div:has(> h2) {
          margin-top: 12px !important;
          border-top: 1px solid #f26722 !important;
          padding-top: 8px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* First section container shouldn't have top border */
        div:has(> h2):first-of-type {
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
        
        /* Remove all card styling and shadows */
        .bg-white, .dark\\:bg-dark-150, .rounded-lg, .shadow {
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
        
        /* Specifically target and remove print borders */
        .print\\:border {
          border: none !important;
        }
        
        .print\\:border-black {
          border: none !important;
        }
        
        /* Remove borders from divs with these specific classes */
        div.bg-white, div.dark\\:bg-dark-150, div.print\\:border, div.print\\:border-black {
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        
        /* Only allow borders on table elements */
        table, th, td, thead, tbody, tr {
          border: 0.5px solid black !important;
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
          border: 1.5px solid black !important;
        }
        
        th, td {
          border: 1.5px solid black !important;
          padding: 0px 1px !important;
          text-align: center !important;
          font-size: 8px !important;
          height: 12px !important;
          line-height: 1 !important;
        }
        
        /* Ensure table headers have proper borders */
        thead th {
          border: 1.5px solid black !important;
          background-color: #f0f0f0 !important;
          font-weight: bold !important;
        }
        
        /* Ensure table body cells have proper borders */
        tbody td {
          border: 1.5px solid black !important;
        }
        
        /* Ensure table rows have proper borders */
        tr {
          border: 1.5px solid black !important;
        }
        
        th {
          background-color: #f0f0f0 !important;
          font-weight: bold !important;
        }
        
        /* Force all table elements to have proper borders */
        table, table *, table th, table td, table thead, table tbody, table tr {
          border: 1.5px solid black !important;
        }
        
        /* Ensure table headers are properly styled */
        table thead th {
          background-color: #f0f0f0 !important;
          font-weight: bold !important;
          text-align: center !important;
          font-size: 8px !important;
          padding: 0px 1px !important;
          height: 12px !important;
          line-height: 1 !important;
        }
        
        /* Ensure table body cells are properly styled */
        table tbody td {
          text-align: center !important;
          font-size: 8px !important;
          padding: 0px 1px !important;
          height: 12px !important;
          line-height: 1 !important;
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
        
        /* Ensure all table inputs are properly styled */
        table input, table select, table textarea {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          outline: none !important;
          padding: 0 !important;
          margin: 0 !important;
          height: 10px !important;
          text-align: center !important;
          width: 100% !important;
          font-size: 8px !important;
        }
        
        /* Remove any dropdown arrows from table selects */
        table select {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background-image: none !important;
          padding-right: 0 !important;
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
        
        /* Page break control */
        section { page-break-inside: avoid !important; }
        
        /* Ensure everything fits on one page */
        .max-w-7xl { max-width: 100% !important; width: 100% !important; }
        
        /* Orange header bar for sections */
        .border-b.dark\\:border-gray-700 {
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
        /* Compact job info temperature fields and TCF value; mirror 3-LowVoltageCableMTS */
        .grid .temp-input-f { width: 60px !important; min-width: 60px !important; text-align: center !important; }
        .grid .tcf-label { font-size: 9px !important; margin-left: 12px !important; margin-right: 4px !important; }
        .grid .tcf-value { display: inline-block !important; min-width: 32px !important; font-size: 9px !important; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        input[type="number"] { -moz-appearance: textfield !important; appearance: textfield !important; }

        /* Electrical tests table alignment identical to 3-LowVoltageCableMTS */
        table.electrical-tests-table { border-collapse: collapse !important; border: none !important; outline: none !important; box-shadow: none !important; table-layout: fixed !important; border-spacing: 0 !important; }
        table.electrical-tests-table th, table.electrical-tests-table td { border-width: 1.5px !important; border-style: solid !important; border-color: black !important; box-sizing: border-box !important; padding: 0 !important; height: 14px !important; vertical-align: middle !important; text-align: center !important; font-size: 9px !important; line-height: 1.1 !important; }
        /* Fit inputs exactly within cells; no bleed */
        table.electrical-tests-table td { position: relative !important; box-sizing: border-box !important; overflow: hidden !important; }
        table.electrical-tests-table td > input,
        table.electrical-tests-table td > select {
          position: absolute !important;
          top: 50.5% !important;
          left: -10px !important; /* match MTS left bias exactly */
          right: 0 !important;
          transform: translateY(-50%) !important;
          width: auto !important;
          height: auto !important;
          border: none !important;
          outline: none !important;
          margin: 0 !important;
          padding: 0 1px 0 0 !important;
          display: block !important;
          font-size: 9px !important;
          line-height: 1.1 !important;
          background: transparent !important;
          box-sizing: border-box !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background-image: none !important;
          text-align: left !important;
        }
        /* Center Size/Config (colspan=2) */
        table.electrical-tests-table tbody tr:first-child td[colspan="2"] > select,
        table.electrical-tests-table tbody tr:first-child td[colspan="2"] > input,
        table.electrical-tests-table tbody tr + tr td[colspan="2"] > select,
        table.electrical-tests-table tbody tr + tr td[colspan="2"] > input {
          left: 0 !important; right: 0 !important; text-align: center !important;
        }
        /* Center Continuity and Results (rowSpan at end) */
        table.electrical-tests-table tbody tr td[rowspan="2"]:nth-last-child(2) > select,
        table.electrical-tests-table tbody tr td[rowspan="2"]:nth-last-child(2) > input,
        table.electrical-tests-table tbody tr td[rowspan="2"]:last-child > select,
        table.electrical-tests-table tbody tr td[rowspan="2"]:last-child > input {
          left: 0 !important; right: 0 !important; text-align: center !important;
        }
        table.electrical-tests-table select { background-image: none !important; }
        table.electrical-tests-table colgroup col:nth-child(1) { width: 6.5% !important; }
        table.electrical-tests-table colgroup col:nth-child(2) { width: 6.5% !important; }
        table.electrical-tests-table colgroup col:nth-child(3) { width: 5% !important; }
        table.electrical-tests-table colgroup col:nth-child(4) { width: 5% !important; }
        table.electrical-tests-table colgroup col:nth-child(5) { width: 4% !important; }
        table.electrical-tests-table colgroup col:nth-child(n+6):nth-child(-n+14) { width: 5.85% !important; }
        table.electrical-tests-table colgroup col:nth-child(15) { width: 5.6% !important; }
        table.electrical-tests-table colgroup col:nth-child(16) { width: 5.2% !important; }
        table.electrical-tests-table colgroup col:nth-child(17) { width: 7.7% !important; }
        table.electrical-tests-table td:nth-child(15) input { margin-right: 1px !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Handler for changing number of cables
  const handleNumberOfCablesChange = (newNumber: number) => {
    if (newNumber >= 1 && newNumber <= 60) {
      setFormData(prev => ({
        ...prev,
        numberOfCables: newNumber,
        testSets: generateTestSets(newNumber)
      }));
    }
  };

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;
    
    try {
      setLoading(true);
      // First fetch job data from neta_ops schema
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`
          title,
          job_number,
          customer_id
        `)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData) {
        // Then fetch customer data from common schema
        let customerName = '';
        let customerAddress = '';
        
        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select(`
              name,
              company_name,
              address
            `)
            .eq('id', jobData.customer_id)
            .single();
            
          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || '';
            customerAddress = customerData.address || '';
          }
        }

        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: customerName,
          address: customerAddress,
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      setError(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!reportId) {
        setLoading(false);
      }
    }
  };

  // Add loadReport function to load existing report data
  const loadReport = async () => {
    if (!reportId) return;
    
    try {
      setLoading(true);
      console.log(`Loading report with ID: ${reportId}`);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_cable_test_12sets')
        .select('*')
        .eq('id', reportId);
      
      if (error) {
        console.error('Error loading report:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.error('Error loading report: No report found with this ID in this table.');
        throw new Error('No report found with this ID. The link may be incorrect.');
      }

      if (data.length > 1) {
        console.error('Error loading report: Multiple reports found with this ID.');
        throw new Error('Multiple reports found with this ID. Please contact support.');
      }

      const reportData = data[0];
      
      console.log('Raw report data loaded:', reportData);
      console.log('Report data.data:', reportData.data);
      console.log('Report data.report_data:', reportData.report_data);
      
      if (reportData && reportData.data) {
        console.log('Report data loaded successfully:', reportData.data);
        setFormData(prevData => ({
          ...prevData,
          ...reportData.data,
          temperature: reportData.data.temperature ?? prevData.temperature,
          humidity: reportData.data.humidity ?? prevData.humidity,
          testSets: reportData.data.testSets ?? prevData.testSets,
          testEquipment: reportData.data.testEquipment ?? prevData.testEquipment,
        }));
        
        if (reportData.data.status) {
          setStatus(reportData.data.status);
        }
        setIsEditMode(false);
      } else if (reportData && reportData.report_data) {
        console.log('Report data found in report_data column:', reportData.report_data);
        setFormData(prevData => ({
          ...prevData,
          ...reportData.report_data,
          temperature: reportData.report_data.temperature ?? prevData.temperature,
          humidity: reportData.report_data.humidity ?? prevData.humidity,
          testSets: reportData.report_data.testSets ?? prevData.testSets,
          testEquipment: reportData.report_data.testEquipment ?? prevData.testEquipment,
        }));
        
        if (reportData.report_data.status) {
          setStatus(reportData.report_data.status);
        }
        setIsEditMode(false);
      } else {
        console.warn('No data found for report ID:', reportId);
        console.warn('Available columns:', Object.keys(reportData));
      }
    } catch (error) {
      console.error('Error in loadReport:', error);
      setError(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load job information when component mounts
  useEffect(() => {
    if (jobId && user) {
      loadJobInfo();
    }
  }, [jobId, user]);
  
  // Load report data when reportId is available
  useEffect(() => {
    if (reportId && user) {
      loadReport();
    }
  }, [reportId, user]);

  // Derived values (calculations that follow the Excel formulas)
  const celsiusTemperature = convertFahrenheitToCelsius(formData.temperature);
  const tcf = getTCF(celsiusTemperature);

  // Add print styles - replace the existing useEffect with print styles
  useEffect(() => {
    const style = document.createElement('style');
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
        -ms-overflow-style: none;
        scrollbar-width: none;
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
        border-top: 2px solid #f26722 !important;
        padding-top: 8px !important;
        margin-top: 16px !important;
      }
      @media print {
        /* Layout, page size, and utility print CSS only */
        .max-w-7xl, .p-6, .mx-auto {
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body, html {
          margin: 0 !important;
          padding: 0 !important;
          width: 100vw !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
        /* Prevent blank pages in print */
        @page {
          size: auto;
          margin: 0.5in;
        }
        /* Prevent orphaned content and blank pages */
        body, html {
          page-break-after: avoid !important;
          page-break-before: avoid !important;
        }
        /* Ensure sections don't create unnecessary page breaks */
        .mb-6, section {
          page-break-inside: avoid !important;
          page-break-after: auto !important;
        }
        /* Prevent blank pages by allowing more flexible page breaks */
        .mb-6, section {
          page-break-inside: auto !important;
          page-break-after: auto !important;
          page-break-before: auto !important;
        }
        /* Allow the Test Equipment section to flow with previous content */
        h2:contains('Test Equipment Used'),
        h2:contains('Test Equipment Used') + div {
          page-break-before: auto !important;
          page-break-inside: auto !important;
        }
        /* Ensure Comments section doesn't create a new page unnecessarily */
        h2:contains('Comments'),
        h2:contains('Comments') + div {
          page-break-before: auto !important;
          page-break-inside: auto !important;
        }
        /* Prevent empty elements from creating blank pages */
        div:empty, section:empty {
          display: none !important;
        }
        /* Keep only layout/utility print CSS. Remove all table/input/select/textarea print rules. */
        /* ...rest of your print CSS for layout, page breaks, etc... */
        /* Force-hide the on-screen header in print/PDF */
        .flex.justify-between.items-center.mb-6 {
          display: none !important;
        }
        /* Make Job Info, Cable Data, and Visual/Mechanical Inspection sections smaller and more compact in print */
        h2, h2 + div, h2 + .grid, h2 + .overflow-x-auto {
          font-size: 7px !important;
        }
        .mb-6 > .grid, .mb-6 > .overflow-x-auto, .mb-6 > div {
          font-size: 7px !important;
          margin-bottom: 2px !important;
        }
        .mb-6 > .grid input, .mb-6 > .grid select, .mb-6 > .grid textarea,
        .mb-6 > .overflow-x-auto input, .mb-6 > .overflow-x-auto select, .mb-6 > .overflow-x-auto textarea {
          font-size: 7px !important;
          height: 10px !important;
          padding: 0 1px !important;
        }
        /* Do NOT change electrical-tests-table font/spacing */
        .electrical-tests-table, .electrical-tests-table *, .electrical-tests-table input, .electrical-tests-table select {
          font-size: 8px !important;
          height: auto !important;
          padding: initial !important;
        }
        /* ...rest of your print CSS... */
        /* Make Visual and Mechanical Inspection table ultra-compact in print */
        h2:contains('Visual and Mechanical Inspection') + div table,
        h2:contains('Visual and Mechanical Inspection') + div table th,
        h2:contains('Visual and Mechanical Inspection') + div table td,
        h2:contains('Visual and Mechanical Inspection') + div table input,
        h2:contains('Visual and Mechanical Inspection') + div table select {
          font-size: 6px !important;
          padding: 0 1px !important;
          height: 10px !important;
        }
        h2:contains('Visual and Mechanical Inspection') + div table tr {
          height: 10px !important;
        }
        /* Visual and Mechanical Inspection table: force all borders */
        h2:contains('Visual and Mechanical Inspection') + div table,
        h2:contains('Visual and Mechanical Inspection') + div table th,
        h2:contains('Visual and Mechanical Inspection') + div table td {
          border: 1px solid black !important;
          border-collapse: collapse !important;
        }
        /* Add vertical border between NETA Section and Description columns */
        h2:contains('Visual and Mechanical Inspection') + div table th:first-child,
        h2:contains('Visual and Mechanical Inspection') + div table td:first-child {
          border-right: 1px solid black !important;
        }
        h2:contains('Visual and Mechanical Inspection') + div table th:nth-child(2),
        h2:contains('Visual and Mechanical Inspection') + div table td:nth-child(2) {
          border-left: 1px solid black !important;
        }
        /* Ensure bottom border is always present */
        h2:contains('Visual and Mechanical Inspection') + div table tr:last-child td {
          border-bottom: 1px solid black !important;
        }
        /* Ensure left and right borders for the table */
        h2:contains('Visual and Mechanical Inspection') + div table {
          border-left: 1px solid black !important;
          border-right: 1px solid black !important;
        }
        /* ...rest of your print CSS... */
        /* Stronger borders for Visual and Mechanical Inspection table */
        table.visual-mechanical-table,
        table.visual-mechanical-table th,
        table.visual-mechanical-table td {
          border-width: 1.5px !important;
          border-style: solid !important;
          border-color: black !important;
          border-collapse: collapse !important;
        }
        table.visual-mechanical-table {
          border-collapse: collapse !important;
        }
        table.visual-mechanical-table th,
        table.visual-mechanical-table td {
          border-left: 1.5px solid black !important;
          border-right: 1.5px solid black !important;
        }
        table.visual-mechanical-table th {
          border-top: 1.5px solid black !important;
        }
        table.visual-mechanical-table td {
          border-bottom: 1.5px solid black !important;
        }
        /* Strong, consistent borders for Electrical Tests table in print */
        table.electrical-tests-table,
        table.electrical-tests-table th,
        table.electrical-tests-table td {
          border-width: 1.5px !important;
          border-style: solid !important;
          border-color: black !important;
          border-collapse: collapse !important;
        }
        table.electrical-tests-table {
          border-collapse: collapse !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
        /* Remove ALL outer borders from Electrical Tests table */
        table.electrical-tests-table {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
        /* Remove borders from any container around the table */
        .overflow-x-auto,
        section[aria-labelledby="electrical-tests-heading"],
        section[aria-labelledby="electrical-tests-heading"] .overflow-x-auto {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        /* Ensure From and To fields scale properly in print */
        table.electrical-tests-table input[type="text"] {
          font-size: 4px !important;
          line-height: 0.8 !important;
          padding: 1px !important;
          word-wrap: break-word !important;
          white-space: normal !important;
          overflow: visible !important;
          height: auto !important;
          min-height: 20px !important;
          max-height: none !important;
          resize: none !important;
          text-align: center !important;
          vertical-align: middle !important;
        }
        /* Ensure table cells containing From/To inputs can expand vertically */
        table.electrical-tests-table td[rowspan="2"] {
          height: auto !important;
          min-height: 40px !important;
          max-height: none !important;
          vertical-align: middle !important;
          padding: 1px !important;
        }
        /* Ensure From and To columns are wider in print */
        table.electrical-tests-table th:nth-child(1),
        table.electrical-tests-table th:nth-child(2),
        table.electrical-tests-table td:nth-child(1),
        table.electrical-tests-table td:nth-child(2) {
          width: 100px !important;
          min-width: 100px !important;
          max-width: 100px !important;
          padding: 1px !important;
        }
        /* More aggressive targeting for From/To columns in print */
        table.electrical-tests-table thead tr:last-child th:first-child,
        table.electrical-tests-table thead tr:last-child th:nth-child(2),
        table.electrical-tests-table tbody td[rowspan="2"]:first-child,
        table.electrical-tests-table tbody td[rowspan="2"]:nth-child(2) {
          width: 100px !important;
          min-width: 100px !important;
          max-width: 100px !important;
          height: auto !important;
          min-height: 40px !important;
          max-height: none !important;
          padding: 1px !important;
          box-sizing: border-box !important;
          overflow: visible !important;
          white-space: normal !important;
          word-wrap: break-word !important;
          vertical-align: middle !important;
        }
        /* Ultra-aggressive targeting for From/To inputs specifically */
        table.electrical-tests-table tbody td[rowspan="2"]:first-child input,
        table.electrical-tests-table tbody td[rowspan="2"]:nth-child(2) input {
          font-size: 4px !important;
          line-height: 0.8 !important;
          padding: 1px !important;
          margin: 0 !important;
          border: none !important;
          background: transparent !important;
          width: 100% !important;
          height: auto !important;
          min-height: 20px !important;
          max-height: none !important;
          word-wrap: break-word !important;
          white-space: normal !important;
          overflow: visible !important;
          text-align: center !important;
          vertical-align: middle !important;
          box-sizing: border-box !important;
        }
        /* Force PASS/FAIL colors to print */
        .status-pass {
          background-color: #22c55e !important;
          border: 2px solid #16a34a !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-size: 10px !important;
          padding: 4px 8px !important;
          margin-top: 0px !important;
        }
        
        .status-fail {
          background-color: #ef4444 !important;
          border: 2px solid #dc2626 !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-size: 10px !important;
          padding: 4px 8px !important;
          margin-top: 4px !important;
        }
        
        /* Specific class for PASS/FAIL status box */
        .pass-fail-status-box {
          background-color: #22c55e !important;
          border: 2px solid #16a34a !important;
          color: white !important;
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
        /* Ensure Electrical Tests table flows across pages (allow breaks between rows, not inside rows) */
        table.electrical-tests-table {
          margin-top: 8px !important;
          page-break-inside: auto !important; /* allow the table to span multiple pages */
          break-inside: auto !important;
          border: none !important;
          border-collapse: collapse !important;
        }
        table.electrical-tests-table thead { display: table-header-group !important; }
        table.electrical-tests-table tfoot { display: table-footer-group !important; }
        table.electrical-tests-table tbody { display: table-row-group !important; }
        table.electrical-tests-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        /* Remove borders from the overflow-x-auto container around Electrical Tests table */
        .overflow-x-auto {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        
        /* Remove orange border from Electrical Tests section specifically */
        section[aria-labelledby="electrical-tests-heading"] {
          border-top: none !important;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        /* Ensure table caption is visible */
        table.electrical-tests-table caption {
          display: table-caption !important;
          font-size: 8px !important;
          padding: 2px 0 !important;
          margin-bottom: 4px !important;
          color: black !important;
        }
        
        /* Ensure table headers are fully visible */
        table.electrical-tests-table thead {
          display: table-header-group !important;
        }
        
        table.electrical-tests-table thead tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        
        table.electrical-tests-table thead th {
          padding: 2px 1px !important;
          height: auto !important;
          min-height: 16px !important;
          font-size: 8px !important;
          line-height: 1.1 !important;
          vertical-align: middle !important;
          background-color: #f0f0f0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          border-top: 1.5px solid black !important;
          border-left: 1.5px solid black !important;
          border-right: 1.5px solid black !important;
          border-bottom: 1.5px solid black !important;
        }
        /* Ensure the very top row of headers has a strong top border */
        table.electrical-tests-table thead tr:first-child th {
          border-top: 2px solid black !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Recalculate corrected readings whenever temperature or *any* reading changes
  useEffect(() => {
    const updatedTestSets = formData.testSets.map(set => {
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
        continuity: set.readings.continuity, // No TCF applied to continuity
      };
      
      // Only create a new object if readings actually changed to avoid unnecessary re-renders
      if (JSON.stringify(set.correctedReadings) !== JSON.stringify(correctedReadings)) {
        return { ...set, correctedReadings };
      }
      return set;
    });
    
    // Only update state if the testSets array content has actually changed
    if (JSON.stringify(formData.testSets) !== JSON.stringify(updatedTestSets)) {
        setFormData(prev => ({ ...prev, testSets: updatedTestSets }));
    }
  // Dependency array: watch temp and the stringified readings of all sets
  }, [formData.temperature, JSON.stringify(formData.testSets.map(s => s.readings))]); 

  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const targetValue = (e.target as HTMLInputElement).type === 'number' 
                        ? (value === '' ? '' : parseFloat(value)) // Keep empty string or parse number
                        : value;

    setFormData(prev => ({ ...prev, [name]: targetValue }));
  };

  // Handle test reading changes
  const handleReadingChange = (setId: number, field: keyof TestSet['readings'], value: string) => {
    setFormData(prev => ({
      ...prev,
      testSets: prev.testSets.map(set => 
        set.id === setId 
          ? { ...set, readings: { ...set.readings, [field]: value } } 
          : set
      )
    }));
  };

  // Handle test set metadata changes (From, To, Size, Config)
  const handleTestSetChange = (setId: number, field: keyof Pick<TestSet, 'from' | 'to' | 'size' | 'config' | 'result'>, value: string) => {
     setFormData(prev => ({
       ...prev,
       testSets: prev.testSets.map(set => 
         set.id === setId 
           ? { ...set, [field]: value } 
           : set
       )
     }));
  };

  // Handle inspection result changes
  const handleInspectionChange = (section: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      inspectionResults: {
        ...prev.inspectionResults,
        [section]: value
      }
    }));
  };
  
  // Add Save/Update Handler
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
        // Log the schema and table name for debugging
        console.log('Attempting to save to schema: neta_ops, table: low_voltage_cable_test_12sets');
        
        // Normalize test sets to ensure size/config/continuity persist
        const normalizedTestSets = formData.testSets.map((set) => ({
          ...set,
          size: set.size ?? '',
          config: set.config ?? '',
          result: set.result ?? '',
          readings: {
            ...set.readings,
            continuity: set.readings?.continuity ?? ''
          },
          correctedReadings: {
            ...set.correctedReadings,
            continuity: set.correctedReadings?.continuity ?? set.readings?.continuity ?? ''
          }
        }));

        // Structure the data to be saved (assuming a 'data' column)
        const reportPayload = {
            job_id: jobId,
            user_id: user?.id,
            data: { ...formData, testSets: normalizedTestSets } // Store the entire form state
        };

        // Log the payload for debugging
        console.log('Payload:', reportPayload);

        let savedReportId = reportId;

        if (reportId) {
            // Update existing report
            const { error: updateError } = await supabase
                .schema('neta_ops')
                .from('low_voltage_cable_test_12sets')
                .update({ data: { ...formData, testSets: normalizedTestSets }, updated_at: new Date() })
                .eq('id', reportId);
            if (updateError) {
                console.error('Update error details:', updateError);
                throw updateError;
            }
            console.log("Report updated successfully");
            
            // Show success message and navigate back to job details
            alert("Report saved successfully!");
            navigateAfterSave(navigate, jobId, location);
            return;
        } else {
            // Create new report
            // Try with direct SQL query if the regular way doesn't work
            try {
                console.log('Trying regular insert...');
                const { data: insertData, error: insertError } = await supabase
                    .schema('neta_ops')
                    .from('low_voltage_cable_test_12sets')
                    .insert(reportPayload)
                    .select('id')
                    .single();
                if (insertError) {
                    console.error('Insert error details:', insertError);
                    throw insertError;
                }
                savedReportId = insertData.id;
                console.log("Report created successfully with ID:", savedReportId);
                
                // Create an asset entry for the saved report
                const assetData = {
                    name: getAssetName(reportSlug, formData.identifier || ''),
                    file_url: `report:/jobs/${jobId}/low-voltage-cable-test-12sets/${savedReportId}`,
                    user_id: user?.id,
                    created_at: new Date().toISOString()
                };
                
                console.log('Creating asset entry:', assetData);
                const { data: assetResult, error: assetError } = await supabase
                    .schema('neta_ops')
                    .from('assets')
                    .insert(assetData)
                    .select('id')
                    .single();
                
                if (assetError) {
                    console.error('Error creating asset record:', assetError);
                    // Continue even if asset creation fails
                } else if (assetResult) {
                    console.log('Asset created with ID:', assetResult.id);
                    
                    // Link the asset to the job
                    const jobAssetData = {
                        job_id: jobId,
                        asset_id: assetResult.id,
                        user_id: user?.id
                    };
                    
                    console.log('Linking asset to job:', jobAssetData);
                    const { error: jobAssetError } = await supabase
                        .schema('neta_ops')
                        .from('job_assets')
                        .insert(jobAssetData);
                    
                    if (jobAssetError) {
                        console.error('Error linking asset to job:', jobAssetError);
                        // Continue even if linking fails
                    } else {
                        console.log('Asset successfully linked to job');
                    }
                }
                
                // Show success message and navigate back to job details
                alert("Report saved successfully!");
                navigateAfterSave(navigate, jobId, location);
                return;
            } catch (regularInsertError) {
                console.error('Regular insert failed, trying SQL query approach...');
                
                // Try to check if we have SELECT access at least
                const { data: checkData, error: checkError } = await supabase
                    .from('neta_ops.low_voltage_cable_test_12sets')
                    .select('id')
                    .limit(1);
                
                console.log('Check access result:', { data: checkData, error: checkError });
                
                // As a last resort, try saving to a table we know exists and we have access to
                console.log('Attempting to save to fallback table...');
                try {
                    // Try to save to a table that should exist and you have access to
                    const { data: fallbackData, error: fallbackError } = await supabase
                        .schema('neta_ops')
                        .from('transformer_reports') // Try a known working table
                        .insert({
                            job_id: jobId,
                            user_id: user?.id,
                            data: { test: 'This is a fallback test', original_data: formData },
                            created_at: new Date(),
                            updated_at: new Date()
                        })
                        .select('id')
                        .single();
                        
                    console.log('Fallback save result:', { data: fallbackData, error: fallbackError });
                    
                    if (!fallbackError) {
                        alert("Fallback save successful. This indicates the low_voltage_cable_test_12sets table has permission issues.");
                        savedReportId = fallbackData.id;
                        
                        // Even with fallback, navigate back to job details
                        navigateAfterSave(navigate, jobId, location);
                        return;
                    }
                } catch (fallbackError) {
                    console.error('Even fallback save failed:', fallbackError);
                }
                
                throw regularInsertError; // Re-throw the original error
            }
        }

    } catch (err: any) {
        console.error("Error saving report:", err);
        setError(`Failed to save report: ${err.message}`);
        alert(`Error saving report: ${err.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  // Add these helper functions at the component level, before the return statement
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, currentPos: { row: number, col: number }) => {
    const { row, col } = currentPos;
    
    // Debug: Log current position
    console.log(`Current position: ${row}-${col}`);
    
    // Define the number of columns (From, To, Size/Config, A-G, B-G, C-G, N-G, A-B, B-C, C-A, A-N, B-N, C-N, Cont., Results)
    // Note: RDG/20°C indicator column is skipped as it's not focusable
    const TOTAL_COLS = 15;
    const TOTAL_ROWS = formData.numberOfCables * 2; // Each cable has 2 rows (RDG + 20°C)

    // Prevent arrow keys from changing select values
    if (e.target instanceof HTMLSelectElement && 
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }

    switch (e.key) {
      case 'ArrowRight':
          e.preventDefault();
        let nextCol = col + 1;
        let nextRow = row;
        if (nextCol >= TOTAL_COLS) {
          nextCol = 0;
          nextRow = (row + 1) % TOTAL_ROWS;
        }
        let next = document.querySelector(`[data-position="${nextRow}-${nextCol}"]`);
        while (!next && (nextRow !== row || nextCol !== col)) {
          nextCol = (nextCol + 1) % TOTAL_COLS;
          if (nextCol === 0) nextRow = (nextRow + 1) % TOTAL_ROWS;
          next = document.querySelector(`[data-position="${nextRow}-${nextCol}"]`);
        }
        if (next) (next as HTMLElement).focus();
        break;
      case 'ArrowLeft':
          e.preventDefault();
        let prevCol = col - 1;
        let prevRow = row;
        if (prevCol < 0) {
          prevCol = TOTAL_COLS - 1;
          prevRow = (row - 1 + TOTAL_ROWS) % TOTAL_ROWS;
        }
        let prev = document.querySelector(`[data-position="${prevRow}-${prevCol}"]`);
        while (!prev && (prevRow !== row || prevCol !== col)) {
          prevCol = (prevCol - 1 + TOTAL_COLS) % TOTAL_COLS;
          if (prevCol === TOTAL_COLS - 1) prevRow = (prevRow - 1 + TOTAL_ROWS) % TOTAL_ROWS;
          prev = document.querySelector(`[data-position="${prevRow}-${prevCol}"]`);
        }
        if (prev) (prev as HTMLElement).focus();
        break;
      case 'ArrowDown':
          e.preventDefault();
        let downRow = (row + 1) % TOTAL_ROWS;
        let down = document.querySelector(`[data-position="${downRow}-${col}"]`);
        while (!down && downRow !== row) {
          downRow = (downRow + 1) % TOTAL_ROWS;
          down = document.querySelector(`[data-position="${downRow}-${col}"]`);
        }
        if (down) (down as HTMLElement).focus();
        break;
      case 'ArrowUp':
          e.preventDefault();
        let upRow = (row - 1 + TOTAL_ROWS) % TOTAL_ROWS;
        let up = document.querySelector(`[data-position="${upRow}-${col}"]`);
        while (!up && upRow !== row) {
          upRow = (upRow - 1 + TOTAL_ROWS) % TOTAL_ROWS;
          up = document.querySelector(`[data-position="${upRow}-${col}"]`);
        }
        if (up) (up as HTMLElement).focus();
        break;
      case 'Enter':
        // For dropdowns, don't navigate on Enter as it's used for selection
        if (!(e.target instanceof HTMLSelectElement)) {
          if (row < TOTAL_ROWS - 1) {
            e.preventDefault();
            const nextElement = document.querySelector(`[data-position="${row + 1}-${col}"]`) as HTMLElement;
            nextElement?.focus();
          }
        }
        break;
      case 'Tab':
        // Prevent default tab behavior if we're handling navigation
        if (!e.shiftKey && col < TOTAL_COLS - 1) {
          e.preventDefault();
          const nextElement = document.querySelector(`[data-position="${row}-${col + 1}"]`) as HTMLElement;
          nextElement?.focus();
        } else if (e.shiftKey && col > 0) {
          e.preventDefault();
          const prevElement = document.querySelector(`[data-position="${row}-${col - 1}"]`) as HTMLElement;
          prevElement?.focus();
        }
        break;
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-6 text-red-600 dark:text-red-400">Error: {error}</div>;

  return (
    <div className="w-full overflow-visible" style={{ minHeight: 'calc(100vh + 300px)', paddingBottom: '200px' }}>
      <ReportWrapper isPrintMode={isPrintMode}>
        {/* Print Header - Only visible when printing */}
        <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
          </div>
          <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.2.1.1
          <div className="hidden print:block mt-2">
            <div 
              className="pass-fail-status-box"
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                width: 'fit-content',
                borderRadius: '6px',
                border: '2px solid #16a34a',
                backgroundColor: '#22c55e',
                color: 'white',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                boxSizing: 'border-box',
                minWidth: '50px',
              }}
            >
              {status || 'PASS'}
            </div>
          </div>
        </div>
        </div>

        <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white" style={{ fontSize: '9px', lineHeight: 1, padding: 0, maxWidth: '100%' }}>
          {/* Header */}
          <div className={`flex justify-between items-center mb-6 ${isPrintMode ? 'hidden' : ''} print:hidden`} style={{ marginBottom: '12px', borderTop: '2px solid #f26722', paddingTop: '8px' }}>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate(`/jobs/${jobId}`)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                style={{ fontSize: '9px', padding: '2px 8px' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Job
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ fontSize: '16px', margin: 0 }}>{reportName}</h1>
            </div>
            <div className="flex gap-2">
              <select
                value={status}
                onChange={(e) => {
                  if (isEditMode) setStatus(e.target.value as 'PASS' | 'FAIL' | 'LIMITED SERVICE')
                }}
                disabled={!isEditMode}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
                  status === 'FAIL' ? 'bg-red-600 text-white focus:ring-red-500' :
                  'bg-yellow-500 text-white focus:ring-yellow-400' // LIMITED SERVICE
                } ${!isEditMode ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
                style={{ fontSize: '9px', padding: '2px 8px' }}
              >
                {EVALUATION_RESULTS.map(option => (
                  <option key={option} value={option} className="bg-white dark:bg-dark-100 text-gray-900 dark:text-white">{option}</option>
                ))}
              </select>
              {reportId && !isEditMode ? (
                <>
                  <button type="button" onClick={() => setIsEditMode(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" style={{ fontSize: '9px', padding: '2px 8px' }}>
                    Edit Report
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    style={{ fontSize: '9px', padding: '2px 8px' }}
                  >
                    Print Report
                  </button>
                </>
              ) : (
                <button type="button" onClick={handleSave} disabled={!isEditMode} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditMode ? 'hidden' : 'hover:bg-orange-700'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                  Save Report
                </button>
              )}
            </div>
          </div>

          {/* Job Information Section */}
          <div className="mb-6">
            <h2 className="section-job-info text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Column 1 */}
                <div>
                <div className="mb-4">
                  <label htmlFor="customer" className="form-label inline-block w-32">Customer:</label>
                  <input id="customer" name="customer" type="text" value={formData.customer} readOnly className="form-input bg-gray-100 dark:bg-dark-200" />
                </div>
                <div className="mb-4">
                  <label htmlFor="address" className="form-label inline-block w-32">Address:</label>
                  <input id="address" name="address" type="text" value={formData.address} readOnly className="form-input bg-gray-100 dark:bg-dark-200" />
                </div>
                <div className="mb-4">
                  <label htmlFor="user" className="form-label inline-block w-32">User:</label>
                  <input id="user" name="user" type="text" value={formData.user} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>

                <div className="mb-4">
                  <label htmlFor="date" className="form-label inline-block w-32">Date:</label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleChange}
                    readOnly={!isEditMode}
                    className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''} print:hidden`}
                  />
                  <span className="hidden print:inline" style={{ fontFamily: 'monospace', fontSize: '12px', marginLeft: 0, verticalAlign: 'middle' }}>
                    {formData.date}
                  </span>
                </div>
                <div className="mb-4">
                  <label htmlFor="identifier" className="form-label inline-block w-32">Identifier:</label>
                  <input id="identifier" name="identifier" type="text" value={formData.identifier} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
              </div>
              {/* Column 2 */}
                <div>
                <div className="mb-4">
                  <label htmlFor="jobNumber" className="form-label inline-block w-32">Job #:</label>
                  <input id="jobNumber" name="jobNumber" type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200" />
                </div>
                <div className="mb-4">
                  <label htmlFor="technicians" className="form-label inline-block w-32">Technicians:</label>
                  <input id="technicians" name="technicians" type="text" value={formData.technicians} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="temperature" className="form-label inline-block w-32">Temp:</label>
                  <input id="temperature" name="temperature" type="number" value={formData.temperature} onChange={handleChange} readOnly={!isEditMode} className={`form-input w-20 temp-input-f ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="mx-2 text-gray-600 dark:text-gray-400">°F</span>
                  <span className="mx-2 text-gray-600 dark:text-gray-400">{celsiusTemperature.toFixed(0)}</span>
                  <span className="text-gray-600 dark:text-gray-400">°C</span>
                  <span className="mx-5 text-gray-600 dark:text-gray-400 tcf-label">TCF</span>
                  <span className="font-medium text-gray-900 dark:text-white tcf-value">{tcf}</span>
                </div>
                <div className="mb-4">
                  <label htmlFor="humidity" className="form-label inline-block w-32">Humidity:</label>
                  <input id="humidity" name="humidity" type="number" value={formData.humidity} onChange={handleChange} readOnly={!isEditMode} className={`form-input w-20 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="ml-2 text-gray-600 dark:text-gray-400">%</span>
                </div>
                <div className="mb-4">
                  <label htmlFor="substation" className="form-label inline-block w-32">Substation:</label>
                  <input id="substation" name="substation" type="text" value={formData.substation} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div className="mb-4">
                  <label htmlFor="eqptLocation" className="form-label inline-block w-32">Eqpt. Location:</label>
                  <input id="eqptLocation" name="eqptLocation" type="text" value={formData.eqptLocation} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
              </div>
            </div>
          </div>
          
          {/* Cable Data Section */}
          <div className="mb-6">
            <h2 className="section-cable-data text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Cable Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Column 1 */}
              <div>
                <div className="mb-4">
                  <label htmlFor="testedFrom" className="form-label inline-block w-32">Tested From:</label>
                  <input id="testedFrom" name="testedFrom" type="text" value={formData.testedFrom} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="manufacturer" className="form-label inline-block w-32">Manufacturer:</label>
                  <input id="manufacturer" name="manufacturer" type="text" value={formData.manufacturer} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="conductorMaterial" className="form-label inline-block w-32">Conductor Material:</label>
                  <input id="conductorMaterial" name="conductorMaterial" type="text" value={formData.conductorMaterial} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="insulationType" className="form-label inline-block w-32">Insulation Type:</label>
                  <input id="insulationType" name="insulationType" type="text" value={formData.insulationType} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="mb-4">
                  <label htmlFor="systemVoltage" className="form-label inline-block w-32">System Voltage:</label>
                  <input id="systemVoltage" name="systemVoltage" type="text" value={formData.systemVoltage} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="ratedVoltage" className="form-label inline-block w-32">Rated Voltage:</label>
                  <input id="ratedVoltage" name="ratedVoltage" type="text" value={formData.ratedVoltage} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="length" className="form-label inline-block w-32">Length:</label>
                  <input id="length" name="length" type="text" value={formData.length} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`} readOnly={!isEditMode} />
                </div>
              </div>
            </div>
          </div>
          
          {/* Visual and Mechanical Inspection Section */}
          <div className="mb-6">
            <h2 className="section-visual-mechanical text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[600px] visual-mechanical-table">
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white border-b dark:border-gray-700">NETA Section</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white border-b dark:border-gray-700">Description</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 w-48">Results</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries({
                    "7.3.1.A.1": "Compare cable data with drawings and specifications.",
                    "7.3.1.A.2": "Inspect exposed sections of cables for physical damage.",
                    "7.3.1.A.3.1": "Use of a low-resistance ohmmeter in accordance with Section 7.3.3.B.1.",
                    "7.3.1.A.4": "Inspect compression-applied connectors for correct cable match and indentation.",
                    "7.3.1.A.5": "Inspect for correct identification and arrangements.",
                    "7.3.1.A.6": "Inspect cable jacket insulation and condition."
                  }).map(([section, description]) => (
                    <tr key={section} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                      <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">{section}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{description}</td>
                      <td className="px-4 py-2">
                        <select
                          id={`inspection-${section}`}
                          value={formData.inspectionResults[section]}
                          onChange={(e) => handleInspectionChange(section, e.target.value)}
                          className="form-select w-full text-sm"
                          disabled={!isEditMode}
                        >
                          {INSPECTION_RESULTS_OPTIONS.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Electrical Tests Section */}
          <section aria-labelledby="electrical-tests-heading" className="mb-6">
            <h2 id="electrical-tests-heading" className="section-electrical-tests text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests</h2>
            
            <div className="flex justify-end mb-4 gap-4">
              <div className="w-48">
                <label htmlFor="numberOfCables" className="text-sm font-medium text-gray-700 dark:text-white">Number of Cables:</label>
                <input
                  id="numberOfCables"
                  name="numberOfCables"
                  type="number"
                  min="1"
                  max="60"
                  value={formData.numberOfCables}
                  onChange={(e) => handleNumberOfCablesChange(parseInt(e.target.value) || 1)}
                  className="form-input text-sm"
                  disabled={!isEditMode}
                />
              </div>
              <div className="w-48">
                <label htmlFor="testVoltage" className="text-sm font-medium text-gray-700 dark:text-white">Test Voltage:</label>
                <select
                  id="testVoltage"
                  name="testVoltage"
                  value={formData.testVoltage}
                  onChange={handleChange}
                  className="form-select text-sm"
                  disabled={!isEditMode}
                >
                  {TEST_VOLTAGES.map(voltage => (
                    <option key={voltage} value={voltage}>{voltage}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Test Sets Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm electrical-tests-table">
                {/* Column widths to match 3-LowVoltageCableMTS exactly */}
                <colgroup>
                  <col style={{ width: '6.5%' }} />  {/* From */}
                  <col style={{ width: '6.5%' }} />  {/* To */}
                  <col style={{ width: '5%' }} />    {/* Size part 1 */}
                  <col style={{ width: '5%' }} />    {/* Size part 2 */}
                  <col style={{ width: '4%' }} />    {/* RDG / 20°C */}
                  <col style={{ width: '5.9%' }} />  {/* A-G */}
                  <col style={{ width: '5.9%' }} />  {/* B-G */}
                  <col style={{ width: '5.9%' }} />  {/* C-G */}
                  <col style={{ width: '5.9%' }} />  {/* N-G */}
                  <col style={{ width: '5.9%' }} />  {/* A-B */}
                  <col style={{ width: '5.9%' }} />  {/* B-C */}
                  <col style={{ width: '5.9%' }} />  {/* C-A */}
                  <col style={{ width: '5.9%' }} />  {/* A-N */}
                  <col style={{ width: '5.9%' }} />  {/* B-N */}
                  <col style={{ width: '5.9%' }} />  {/* C-N */}
                  <col style={{ width: '5%' }} />    {/* Cont. */}
                  <col style={{ width: '8%' }} />    {/* Results */}
                </colgroup>
                <caption className="caption-bottom text-xs text-gray-500 dark:text-gray-400 py-2">
                  Test Voltage: {formData.testVoltage} | 1 Min. Insulation Resistance in MΩ
                </caption>
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th colSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Circuit Designation</th>
                    <th colSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Size</th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600"></th>
                    <th colSpan={10} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">1 Min. Insulation Resistance in MΩ</th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Cont.</th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Results</th>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">From</th>
                    <th className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">To</th>
                    <th colSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Config.</th>
                    {['A-G','B-G','C-G','N-G','A-B','B-C','C-A','A-N','B-N','C-N'].map(h => (
                      <th key={h} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formData.testSets.map((set, index) => (
                    <React.Fragment key={set.id}>
                      {/* First row for each circuit - RDG readings */}
                      <tr className="hover:bg-gray-50 dark:hover:bg-dark-200">
                        {/* From (under Circuit Designation) - rowSpan=2 */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600" rowSpan={2} style={{ verticalAlign: 'middle' }}>
                          <input
                            type="text"
                            data-position={`${(set.id - 1) * 2}-0`}
                            aria-label={`Set ${set.id} From`}
                            value={set.from}
                            onChange={(e) => handleTestSetChange(set.id, 'from', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 0 })}
                            className="form-input text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                            readOnly={!isEditMode}
                            style={{ 
                              minHeight: '28px',
                              height: 'auto',
                              overflow: 'visible',
                              wordWrap: 'break-word',
                              whiteSpace: 'normal',
                              lineHeight: '1.1',
                              fontSize: '9px',
                              padding: '2px 1px'
                            }}
                          />
                        </td>
                        {/* To (under Circuit Designation) - rowSpan=2 */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600" rowSpan={2} style={{ verticalAlign: 'middle' }}>
                          <input
                            type="text"
                            data-position={`${(set.id - 1) * 2}-1`}
                            aria-label={`Set ${set.id} To`}
                            value={set.to}
                            onChange={(e) => handleTestSetChange(set.id, 'to', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 1 })}
                            className="form-input text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                            readOnly={!isEditMode}
                            style={{ 
                              minHeight: '28px',
                              height: 'auto',
                              overflow: 'visible',
                              wordWrap: 'break-word',
                              whiteSpace: 'normal',
                              lineHeight: '1.1',
                              fontSize: '9px',
                              padding: '2px 1px'
                            }}
                          />
                        </td>
                        {/* Size dropdown (stacked column) */}
                        <td colSpan={2} className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600">
                          <select
                            data-position={`${(set.id - 1) * 2}-2`}
                            aria-label={`Set ${set.id} Size`}
                            value={set.size}
                            onChange={(e) => handleTestSetChange(set.id, 'size', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 2 })}
                            className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                            disabled={!isEditMode}
                          >
                            <option value="">-</option>
                            {CABLE_SIZES.map(size => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </td>
                        
                        {/* RDG indicator column */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-dark-200">
                          <span className="text-xs font-medium">RDG</span>
                        </td>
                        
                        {/* Insulation readings for RDG */}
                        {['aToGround', 'bToGround', 'cToGround', 'nToGround', 'aToB', 'bToC', 'cToA', 'aToN', 'bToN', 'cToN'].map((key, idx) => (
                          <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600" key={`${set.id}-reading-${key}`}>
                            <input
                              type="text"
                              data-position={`${(set.id - 1) * 2}-${idx + 3}`}
                              aria-label={`Set ${set.id} Reading ${key}`}
                              value={set.readings[key as keyof typeof set.readings]}
                              onChange={(e) => handleReadingChange(set.id, key as keyof TestSet['readings'], e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: idx + 3 })}
                              className="form-input text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                              readOnly={!isEditMode}
                            />
                          </td>
                        ))}
                        
                        {/* Continuity - spans both rows */}
                        <td 
                          rowSpan={2} 
                          className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 align-middle"
                        >
                          <select
                            data-position={`${(set.id - 1) * 2}-13`}
                            aria-label={`Set ${set.id} Continuity`}
                            value={set.readings.continuity || ''}
                            onChange={(e) => handleReadingChange(set.id, 'continuity', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 13 })}
                            className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                            disabled={!isEditMode}
                          >
                            <option value="">-</option>
                            <option value="✓">Yes</option>
                            <option value="✗">No</option>
                          </select>
                        </td>
                        
                        {/* Results - spans both rows */}
                        <td 
                          rowSpan={2} 
                          className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 align-middle"
                        >
                          <select
                            data-position={`${(set.id - 1) * 2}-14`}
                            aria-label={`Set ${set.id} Result`}
                            className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                            value={set.result || ''}
                            onChange={(e) => handleTestSetChange(set.id, 'result', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 14 })}
                            disabled={!isEditMode}
                          >
                            <option value="">-</option>
                            {EVALUATION_RESULTS.map(result => (
                              <option key={result} value={result}>{result}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      
                      {/* Second row for 20°C corrected values */}
                      <tr className="bg-gray-50 dark:bg-dark-200 hover:bg-gray-100 dark:hover:bg-dark-300">
                        {/* Empty - under From and To, since rowSpan=2 above */}
                        {/* (No <td> here for From/To) */}
                        
                        {/* Config dropdown (stacked column) */}
                        <td colSpan={2} className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600">
                          <select
                            data-position={`${(set.id - 1) * 2 + 1}-2`}
                            aria-label={`Set ${set.id} Config`}
                            value={set.config}
                            onChange={(e) => handleTestSetChange(set.id, 'config', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2 + 1, col: 2 })}
                            className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                            disabled={!isEditMode}
                          >
                            {CONFIGURATION_OPTIONS.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </td>
                        
                        {/* 20°C indicator column */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 bg-blue-50 dark:bg-blue-900">
                          <span className="text-xs font-medium">20°C</span>
                        </td>
                        
                        {/* Temperature corrected readings */}
                        {['aToGround', 'bToGround', 'cToGround', 'nToGround', 'aToB', 'bToC', 'cToA', 'aToN', 'bToN', 'cToN'].map(key => (
                          <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-900 dark:text-white" key={`${set.id}-corrected-${key}`}>
                            {set.correctedReadings[key as keyof typeof set.correctedReadings]}
                          </td>
                        ))}
                        
                        {/* Results column already spans both rows */}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          
          {/* Test Equipment Used */}
          <div className="mb-6 page-break-before">
            <h2 className="section-test-equipment text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="megohmmeter" className="form-label inline-block w-32">Megohmmeter:</label>
                <input
                  id="megohmmeter"
                  name="testEquipment.megohmmeter"
                  type="text"
                  value={formData.testEquipment.megohmmeter}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      megohmmeter: e.target.value
                    }
                  }))}
                  className="form-input"
                  readOnly={!isEditMode}
                />
              </div>
              <div>
                <label htmlFor="serialNumber" className="form-label inline-block w-32">Serial Number:</label>
                <input
                  id="serialNumber"
                  name="testEquipment.serialNumber"
                  type="text"
                  value={formData.testEquipment.serialNumber}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      serialNumber: e.target.value
                    }
                  }))}
                  className="form-input"
                  readOnly={!isEditMode}
                />
              </div>
              <div>
                <label htmlFor="ampId" className="form-label inline-block w-32">AMP ID:</label>
                <input
                  id="ampId"
                  name="testEquipment.ampId"
                  type="text"
                  value={formData.testEquipment.ampId}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      ampId: e.target.value
                    }
                  }))}
                  className="form-input"
                  readOnly={!isEditMode}
                />
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="mb-6">
            <h2 className="section-comments text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            <textarea
              id="equipmentComments"
              name="testEquipment.comments"
              value={formData.testEquipment.comments}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                testEquipment: {
                  ...prev.testEquipment,
                  comments: e.target.value
                }
              }))}
              rows={10}
              className="w-full form-textarea resize-vertical min-h-[250px]"
              placeholder="Enter any additional comments..."
              readOnly={!isEditMode}
            />
          </div>
        </div>
      </ReportWrapper>


    </div>
  );
};

// Remove the duplicate print styles at the bottom
export default TwelveSetsLowVoltageCableTestForm;