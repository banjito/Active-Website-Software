import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { useDemoMode } from '../../lib/DemoModeContext';
import { supabase } from '../../lib/supabase';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';
import { getPassFailBadgeClass } from '@/lib/reportPassFailStatus';

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
    calDate: string;
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
  "#18", "#16", "#14", "#12", "#10", "#8", "#6", "#4", "#2", "#1",
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
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL' | 'LIMITED SERVICE'>('PASS');
  const [isEditMode, setIsEditMode] = useState<boolean>(!reportId); // Edit mode enabled by default for new reports
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(reportId);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(reportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);
  // Mutex shared between autoSave and handleSave so they cannot both insert
  // concurrently. Without this, a manual Save click during the auto-save
  // debounce window can create a duplicate report row + orphaned asset.
  const savingInFlightRef = React.useRef(false);

  // Keep currentReportId in sync if URL param changes
  useEffect(() => {
    setCurrentReportId(reportId);
    reportIdRef.current = reportId;
    isAutoSaveCreatedRef.current = false;
  }, [reportId]);

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
      calDate: "",
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
          font-size: 8px !important; /* Increased from 10px to 12px for better readability */
          padding: 0px 1px !important;
          height: 12px !important;
          line-height: 1 !important;
        }
        
        /* 20°C corrected values row - make same size as RDG row */
        table.electrical-tests-table tbody tr:nth-child(even) td {
          font-size: 8px !important; /* Match the RDG row input size */
          font-weight: normal !important;
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
          font-size: 12px !important; /* Increased from 10px to 12px for better readability */
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
          font-size: 12px !important; /* Increased from 10px to 12px for better readability */
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
        .grid .temp-input-f { 
          width: 60px !important; 
          min-width: 60px !important; 
          text-align: center !important;
          margin: 0 auto !important;
          padding: 0 2px !important;
        }
        .grid .tcf-label { font-size: 9px !important; margin-left: 12px !important; margin-right: 4px !important; }
        .grid .tcf-value { display: inline-block !important; min-width: 32px !important; font-size: 9px !important; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        input[type="number"] { -moz-appearance: textfield !important; appearance: textfield !important; }
        
        /* Ensure all temperature inputs are centered */
        input[id*="temperature"], 
        input[name*="temperature"],
        .temp-input-f,
        .temp-input-c {
          text-align: center !important;
          margin: 0 auto !important;
        }

        /* Hide on-screen elements in print */
        .cable-data-onscreen, .cable-data-onscreen * { display: none !important; }
        .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
        .job-info-onscreen, .job-info-onscreen * { display: none !important; }
        
        /* Job info: ensure Temp/TCF area doesn't overlap; render values inline with clear spacing */
        .job-info-grid { grid-template-columns: repeat(6, minmax(0,1fr)) !important; gap: 6px 8px !important; }
        .job-info-grid input[type="number"],
        .job-info-grid input[type="text"] { height: 14px !important; font-size: 9px !important; padding: 0 2px !important; }
        .job-info-grid .tcf-value { display: inline-block !important; min-width: 32px !important; text-align: left !important; font-size: 9px !important; }
        .job-info-grid .tcf-label { margin-right: 4px !important; font-size: 9px !important; }
        /* Shorten temperature inputs and remove spinners */
        .job-info-grid .temp-input-f,
        .job-info-grid .temp-input-c { 
          display: inline-block !important; 
          width: 60px !important; 
          min-width: 60px !important; 
          text-align: center !important;
          margin: 0 auto !important;
          padding: 0 2px !important;
        }
        .job-info-grid input[type="number"]::-webkit-outer-spin-button,
        .job-info-grid input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        .job-info-grid input[type="number"] { -moz-appearance: textfield !important; appearance: textfield !important; }

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
          font-size: 13px !important; /* Increased from 11px to 13px for better readability */
          line-height: 1.1 !important;
          background: transparent !important;
          box-sizing: border-box !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background-image: none !important;
          text-align: center !important; /* Changed from left to center for all inputs */
        }
        /* Center Size/Config (colspan=2) */
        table.electrical-tests-table tbody tr:first-child td[colspan="2"] > select,
        table.electrical-tests-table tbody tr:first-child td[colspan="2"] > input,
        table.electrical-tests-table tbody tr + tr td[colspan="2"] > select,
        table.electrical-tests-table tbody tr + tr td[colspan="2"] > input {
          left: 0 !important; right: 0 !important; text-align: center !important;
          font-size: 8px !important; /* Match readings font size */
          font-weight: normal !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        /* Center Continuity and Results (rowSpan at end) */
        table.electrical-tests-table tbody tr td[rowspan="2"]:nth-last-child(2) > select,
        table.electrical-tests-table tbody tr td[rowspan="2"]:nth-last-child(2) > input,
        table.electrical-tests-table tbody tr td[rowspan="2"]:last-child > select,
        table.electrical-tests-table tbody tr td[rowspan="2"]:last-child > input {
          left: 0 !important; right: 0 !important; text-align: center !important;
          font-size: 8px !important; /* Match readings font size */
          font-weight: normal !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        table.electrical-tests-table select { background-image: none !important; }
        
        /* Force center alignment for Size, Config, Continuity, and Results columns */
        table.electrical-tests-table td:nth-child(3) > select,
        table.electrical-tests-table td:nth-child(4) > select,
        table.electrical-tests-table td[colspan="2"] > select,
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) > select,
        table.electrical-tests-table td[rowspan="2"]:last-child > select {
          text-align: center !important;
          left: 0 !important;
          right: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        /* Ultra-aggressive centering for Size, Config, Continuity, and Results */
        table.electrical-tests-table td:nth-child(3),
        table.electrical-tests-table td:nth-child(4),
        table.electrical-tests-table td[colspan="2"],
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2),
        table.electrical-tests-table td[rowspan="2"]:last-child {
          text-align: center !important;
        }
        
        /* Force center alignment for all content in these specific cells */
        table.electrical-tests-table td:nth-child(3) *,
        table.electrical-tests-table td:nth-child(4) *,
        table.electrical-tests-table td[colspan="2"] *,
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) *,
        table.electrical-tests-table td[rowspan="2"]:last-child * {
          text-align: center !important;
        }
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
        
        /* Nuclear option - force center alignment for all dropdown content */
        table.electrical-tests-table select option {
          text-align: center !important;
        }
        
        /* Override any inline styles that might be causing left alignment */
        table.electrical-tests-table td:nth-child(3) select[style*="text-align"],
        table.electrical-tests-table td:nth-child(4) select[style*="text-align"],
        table.electrical-tests-table td[colspan="2"] select[style*="text-align"],
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) select[style*="text-align"],
        table.electrical-tests-table td[rowspan="2"]:last-child select[style*="text-align"] {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }
        
        /* Force center alignment for the actual text content */
        table.electrical-tests-table td:nth-child(3) select:not([multiple]),
        table.electrical-tests-table td:nth-child(4) select:not([multiple]),
        table.electrical-tests-table td[colspan="2"] select:not([multiple]),
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) select:not([multiple]),
        table.electrical-tests-table td[rowspan="2"]:last-child select:not([multiple]) {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }
        
        /* Nuclear option - force center alignment for ALL select elements in the table */
        table.electrical-tests-table select {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        
        /* Override any inline styles with !important */
        table.electrical-tests-table select[style*="text-align"] {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }
        
        /* Force center class for select elements */
        .force-center {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }
        
        /* Target the actual text content in select elements */
        table.electrical-tests-table select option {
          text-align: center !important;
        }
        
        /* Force center alignment for the displayed text in select elements */
        table.electrical-tests-table select {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
          direction: ltr !important;
        }
        
        /* Specific targeting for Size, Config, Continuity, and Results columns */
        table.electrical-tests-table td:nth-child(3) select,
        table.electrical-tests-table td:nth-child(4) select,
        table.electrical-tests-table td[colspan="2"] select,
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) select,
        table.electrical-tests-table td[rowspan="2"]:last-child select {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
        
        /* Force center alignment for the actual displayed text in dropdowns */
        table.electrical-tests-table td:nth-child(3) select,
        table.electrical-tests-table td:nth-child(4) select,
        table.electrical-tests-table td[colspan="2"] select,
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) select,
        table.electrical-tests-table td[rowspan="2"]:last-child select {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
        
        /* Nuclear option - override ALL text alignment in these specific columns */
        table.electrical-tests-table td:nth-child(3),
        table.electrical-tests-table td:nth-child(4),
        table.electrical-tests-table td[colspan="2"],
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2),
        table.electrical-tests-table td[rowspan="2"]:last-child {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }
        
        /* Force center alignment for ALL elements within these cells */
        table.electrical-tests-table td:nth-child(3) *,
        table.electrical-tests-table td:nth-child(4) *,
        table.electrical-tests-table td[colspan="2"] *,
        table.electrical-tests-table td[rowspan="2"]:nth-last-child(2) *,
        table.electrical-tests-table td[rowspan="2"]:last-child * {
          text-align: center !important;
          text-align-last: center !important;
          -webkit-text-align-last: center !important;
          -moz-text-align-last: center !important;
        }

        /* Standardized Visual & Mechanical print table (match MTS) */
        table.visual-mechanical-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
        table.visual-mechanical-table th, table.visual-mechanical-table td { 
          white-space: normal !important; 
          word-break: break-word !important; 
          font-size: 8px !important; 
          line-height: 1.15 !important; 
          padding: 2px 3px !important; 
          vertical-align: middle !important;
          border: 0.5px solid black !important;
        }
        table.visual-mechanical-table thead th:first-child,
        table.visual-mechanical-table tbody td:first-child { width: 15% !important; text-align: left !important; }
        table.visual-mechanical-table thead th:nth-child(2),
        table.visual-mechanical-table tbody td:nth-child(2) { width: 70% !important; text-align: left !important; }
        table.visual-mechanical-table thead th:nth-child(3),
        table.visual-mechanical-table tbody td:nth-child(3) { width: 15% !important; text-align: center !important; }
        
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
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Handler for changing number of cables (preserve existing data)
  const handleNumberOfCablesChange = (newNumber: number) => {
    const clamped = Math.max(1, Math.min(60, newNumber || 1));
    setFormData(prev => {
      const currentSets = prev.testSets || [];
      const currentCount = currentSets.length;
      if (clamped === currentCount) {
        return { ...prev, numberOfCables: clamped };
      }

      if (clamped > currentCount) {
        const toAdd = clamped - currentCount;
        const newSets: TestSet[] = Array(toAdd).fill(null).map((_, idx) => ({
          id: currentCount + idx + 1,
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
        return { ...prev, numberOfCables: clamped, testSets: [...currentSets, ...newSets] };
      }

      // clamped < currentCount: trim trailing rows, preserve earlier data
      const trimmed = currentSets.slice(0, clamped).map((set, idx) => ({ ...set, id: idx + 1 }));
      return { ...prev, numberOfCables: clamped, testSets: trimmed };
    });
  };

  // Remove a specific test set row with confirmation
  const handleRemoveTestSet = (setId: number) => {
    if (!isEditMode) return;
    const confirmed = window.confirm('Are you sure you want to remove this row? Any data within this row will be deleted.');
    if (!confirmed) return;
    setFormData(prev => {
      const remaining = (prev.testSets || []).filter(s => s.id !== setId);
      const reindexed = remaining.map((s, idx) => ({ ...s, id: idx + 1 }));
      const nextCount = Math.max(1, reindexed.length);
      return { ...prev, numberOfCables: nextCount, testSets: reindexed };
    });
  };

  // Check if a test set row is completely empty (no user data)
  const isTestSetEmpty = (set: TestSet): boolean => {
    // Check basic fields - if any has data, row is not empty
    if (set.from.trim() !== '') return false;
    if (set.to.trim() !== '') return false;
    if (set.size.trim() !== '') return false;
    if (set.result.trim() !== '') return false;
    // Config "RDG" is the default, so only check if it's something else
    if (set.config.trim() !== '' && set.config.trim() !== 'RDG') return false;
    
    // Check all readings - if any has data, row is not empty
    const readings = set.readings;
    if (readings.aToGround.trim() !== '') return false;
    if (readings.bToGround.trim() !== '') return false;
    if (readings.cToGround.trim() !== '') return false;
    if (readings.nToGround.trim() !== '') return false;
    if (readings.aToB.trim() !== '') return false;
    if (readings.bToC.trim() !== '') return false;
    if (readings.cToA.trim() !== '') return false;
    if (readings.aToN.trim() !== '') return false;
    if (readings.bToN.trim() !== '') return false;
    if (readings.cToN.trim() !== '') return false;
    if (readings.continuity.trim() !== '') return false;
    
    // All fields are empty
    return true;
  };

  // Remove only empty rows (rows with no user data)
  const handleRemoveEmptyRows = () => {
    if (!isEditMode) return;
    
    const currentSets = formData.testSets || [];
    const rowsWithData = currentSets.filter(set => !isTestSetEmpty(set));
    const emptyRowCount = currentSets.length - rowsWithData.length;
    
    if (emptyRowCount === 0) {
      alert('No empty rows to remove. All rows contain data.');
      return;
    }
    
    const confirmed = window.confirm(
      `This will remove ${emptyRowCount} empty row${emptyRowCount > 1 ? 's' : ''}. ` +
      `Rows with ANY data will be kept. Continue?`
    );
    if (!confirmed) return;
    
    // Ensure at least one row remains
    const finalSets = rowsWithData.length > 0 ? rowsWithData : [currentSets[0]];
    const reindexed = finalSets.map((s, idx) => ({ ...s, id: idx + 1 }));
    const nextCount = reindexed.length;
    
    setFormData(prev => ({
      ...prev,
      numberOfCables: nextCount,
      testSets: reindexed
    }));
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
          customer_id,
          site_address
        `)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData) {
        // Then fetch customer data from common schema
        let customerName = '';
        let customerAddress = maskCustomerAddress((jobData as any).site_address || '');
        
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
            customerName = maskCustomerName(customerData.company_name || customerData.name || '');
            if (!customerAddress) customerAddress = maskCustomerAddress(customerData.address || '');
          }
        }

        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: maskCustomerName(customerName),
          address: maskCustomerAddress(customerAddress),
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      setError(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!currentReportId) {
        setLoading(false);
      }
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

    if (!currentReportId) return;
    
    try {
      setLoading(true);
      console.log(`Loading report with ID: ${currentReportId}`);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_cable_test_12sets')
        .select('*')
        .eq('id', currentReportId);
      
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
        
        // Preserve From/To exactly as entered in existing reports (no auto line-break injection)
        const migratedTestSets = (reportData.data.testSets || []).map(set => ({
          ...set,
          from: set.from,
          to: set.to,
        }));
        
        setFormData(prevData => ({
          ...prevData,
          ...reportData.data,
          temperature: reportData.data.temperature ?? prevData.temperature,
          humidity: reportData.data.humidity ?? prevData.humidity,
          testSets: migratedTestSets,
          testEquipment: reportData.data.testEquipment ?? prevData.testEquipment,
          jobNumber: prevData.jobNumber,
          customer: maskCustomerName(prevData.customer),
          address: maskCustomerAddress(prevData.address),
          user: reportData.data.user ?? prevData.user,
        }));
        
        if (reportData.data.status) {
          setStatus(reportData.data.status);
        }
        setIsEditMode(false);
      } else if (reportData && reportData.report_data) {
        console.log('Report data found in report_data column:', reportData.report_data);
        
        // Preserve From/To exactly as entered in existing reports (no auto line-break injection)
        const migratedTestSets = (reportData.report_data.testSets || []).map(set => ({
          ...set,
          from: set.from,
          to: set.to,
        }));
        
        setFormData(prevData => ({
          ...prevData,
          ...reportData.report_data,
          temperature: reportData.report_data.temperature ?? prevData.temperature,
          humidity: reportData.report_data.humidity ?? prevData.humidity,
          testSets: migratedTestSets,
          testEquipment: reportData.report_data.testEquipment ?? prevData.testEquipment,
          jobNumber: prevData.jobNumber,
          customer: maskCustomerName(prevData.customer),
          address: maskCustomerAddress(prevData.address),
          user: reportData.report_data.user ?? prevData.user,
        }));
        
        if (reportData.report_data.status) {
          setStatus(reportData.report_data.status);
        }
        setIsEditMode(false);
      } else {
        console.warn('No data found for report ID:', currentReportId);
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
  
  // Load report data when currentReportId is available
  useEffect(() => {
    if (currentReportId && user) {
      loadReport();
    }
  }, [currentReportId, user]);

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
          font-size: 8px !important; /* Increased from 6px to 8px for better readability */
          line-height: 1.2 !important; /* Increased for better text wrapping */
          padding: 2px !important; /* Increased padding for wrapped text */
          word-wrap: break-word !important;
          word-break: break-word !important; /* Additional word breaking */
          white-space: pre-wrap !important; /* Preserve whitespace and wrap */
          overflow: visible !important;
          height: auto !important;
          min-height: 24px !important; /* Increased for wrapped text */
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
        /* From and To columns in print - use percentage widths to fit page */
        table.electrical-tests-table th:nth-child(1),
        table.electrical-tests-table th:nth-child(2),
        table.electrical-tests-table td:nth-child(1),
        table.electrical-tests-table td:nth-child(2) {
          width: 8% !important;
          min-width: 0 !important;
          max-width: none !important;
          padding: 1px !important;
        }
        /* More aggressive targeting for From/To columns in print */
        table.electrical-tests-table thead tr:last-child th:first-child,
        table.electrical-tests-table thead tr:last-child th:nth-child(2),
        table.electrical-tests-table tbody td[rowspan="2"]:first-child,
        table.electrical-tests-table tbody td[rowspan="2"]:nth-child(2) {
          width: 8% !important;
          min-width: 0 !important;
          max-width: none !important;
          height: auto !important;
          min-height: 24px !important;
          max-height: none !important;
          padding: 1px !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          vertical-align: middle !important;
          display: table-cell !important;
        }
        /* Ultra-aggressive targeting for From/To textareas specifically */
        table.electrical-tests-table tbody td[rowspan="2"]:first-child textarea,
        table.electrical-tests-table tbody td[rowspan="2"]:nth-child(2) textarea {
          font-size: 6px !important;
          line-height: 1.1 !important;
          padding: 1px !important;
          margin: 0 !important;
          border: none !important;
          background: transparent !important;
          width: 100% !important;
          height: auto !important;
          min-height: 16px !important;
          max-height: none !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          white-space: pre-wrap !important;
          hyphens: auto !important;
          overflow: hidden !important;
          text-align: center !important;
          vertical-align: middle !important;
          box-sizing: border-box !important;
          resize: none !important;
          display: block !important;
          text-overflow: clip !important;
          max-width: 100% !important;
        }
        
        /* Force text wrapping in print for From/To cells */
        table.electrical-tests-table tbody td[rowspan="2"]:first-child,
        table.electrical-tests-table tbody td[rowspan="2"]:nth-child(2) {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          max-width: none !important;
          min-width: 0 !important;
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
          page-break-inside: auto !important;
          break-inside: auto !important;
          border: none !important;
          border-collapse: collapse !important;
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
          font-size: 7px !important;
          transform: scale(0.88) !important;
          transform-origin: top left !important;
          margin-bottom: -8% !important;
        }
        /* Scale the entire electrical tests section to fit page width */
        section[aria-labelledby="electrical-tests-heading"] .overflow-x-auto {
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
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
          padding: 1px !important;
          height: auto !important;
          min-height: 10px !important;
          font-size: 6px !important;
          line-height: 1.0 !important;
          vertical-align: middle !important;
          background-color: #f0f0f0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          border-top: 1px solid black !important;
          border-left: 1px solid black !important;
          border-right: 1px solid black !important;
          border-bottom: 1px solid black !important;
        }
        /* Scale electrical tests table cells */
        table.electrical-tests-table td {
          font-size: 6px !important;
          padding: 1px !important;
          line-height: 1.0 !important;
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

  // Function to render text with line breaks
  const renderTextWithBreaks = (text: string) => {
    if (!text) return '';
    return text.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
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
  
  // Build the normalized data payload (used by both autoSave and handleSave)
  const buildSavePayload = React.useCallback(() => {
    const normalizedTestSets = formData.testSets.map((set) => ({
      ...set,
      size: set.size ?? '',
      config: set.config ?? '',
      result: set.result ?? '',
      readings: {
        ...set.readings,
        continuity: set.readings?.continuity ?? '',
      },
      correctedReadings: {
        ...set.correctedReadings,
        continuity: set.correctedReadings?.continuity ?? set.readings?.continuity ?? '',
      },
    }));
    return { ...formData, status, testSets: normalizedTestSets };
  }, [formData, status]);

  // Auto-save: silently persists in-progress data so users don't lose work
  // if they close the tab, lose connectivity, etc.
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    if (savingInFlightRef.current) return;

    savingInFlightRef.current = true;
    setIsAutoSaving(true);

    try {
      const dataToSave = buildSavePayload();
      const payload = {
        job_id: jobId,
        user_id: user.id,
        data: dataToSave,
        updated_at: new Date().toISOString(),
      };

      if (reportIdRef.current) {
        const { error: updateError } = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_12sets')
          .update(payload)
          .eq('id', reportIdRef.current);
        if (updateError) throw updateError;
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const insertPayload = { ...payload, created_at: new Date().toISOString() };
          const { data: insertData, error: insertError } = await supabase
            .schema('neta_ops')
            .from('low_voltage_cable_test_12sets')
            .insert(insertPayload)
            .select('id')
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
              name: getAssetName(reportSlug, formData.identifier || ''),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${newId}`,
              user_id: user.id,
              created_at: new Date().toISOString(),
            };
            const { data: assetResult, error: assetError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select('id')
              .single();
            if (assetError) {
              console.error('Auto-save asset insert failed:', assetError);
            } else if (assetResult) {
              const { error: linkError } = await supabase
                .schema('neta_ops')
                .from('job_assets')
                .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
              if (linkError) console.error('Auto-save job_assets link failed:', linkError);
            }

            window.history.replaceState(null, '', `/jobs/${jobId}/${reportSlug}/${newId}`);
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (err) {
      console.error('Auto-save error:', err);
    } finally {
      savingInFlightRef.current = false;
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, isEditMode, buildSavePayload, formData.identifier, reportSlug]);

  // Debounced auto-save trigger when form data, status, or edit mode changes
  useEffect(() => {
    if (!isEditMode || loading) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => autoSave(), 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData, status, isEditMode, loading, autoSave]);

  // Add Save/Update Handler
  const handleSave = async () => {
    // Cancel any pending auto-save so it cannot fire mid-save and create a duplicate row
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Wait briefly if an auto-save is already in flight; up to ~5 seconds
    let waited = 0;
    while (savingInFlightRef.current && waited < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waited += 100;
    }
    if (savingInFlightRef.current) {
      alert('A save is already in progress, please wait a moment and try again.');
      return;
    }

    savingInFlightRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
        // Log the schema and table name for debugging
        console.log('Attempting to save to schema: neta_ops, table: low_voltage_cable_test_12sets');

        const dataToSave = buildSavePayload();

        // Structure the data to be saved (assuming a 'data' column)
        const reportPayload = {
            job_id: jobId,
            user_id: user?.id,
            data: dataToSave
        };

        // Log the payload for debugging
        console.log('Payload:', reportPayload);

        let savedReportId = currentReportId;

        if (currentReportId) {
            // Update existing report
            console.log('Attempting to update report with ID:', currentReportId);
            console.log('Update payload:', { data: reportPayload.data, updated_at: new Date() });
            
            // First check if the report exists
            const { data: existingReport, error: checkError } = await supabase
                .schema('neta_ops')
                .from('low_voltage_cable_test_12sets')
                .select('id')
                .eq('id', currentReportId)
                .single();
                
            if (checkError) {
                console.error('Error checking if report exists:', checkError);
                throw new Error(`Report with ID ${currentReportId} not found: ${checkError.message}`);
            }
            
            if (!existingReport) {
                throw new Error(`Report with ID ${currentReportId} does not exist in the database.`);
            }
            
            console.log('Report exists, proceeding with update...');
            
            const { data: updateData, error: updateError } = await supabase
                .schema('neta_ops')
                .from('low_voltage_cable_test_12sets')
                .update({ 
                    data: reportPayload.data, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', currentReportId)
                .select();
            
            if (updateError) {
                console.error('Update error details:', updateError);
                throw updateError;
            }
            
            console.log("Update response:", updateData);
            
            if (!updateData || updateData.length === 0) {
                console.error('No rows were updated. This could be an RLS policy issue.');
                // Don't throw error - the update might have succeeded but select failed
                console.warn('Update may have succeeded despite empty response');
            }
            
            console.log("Report updated successfully");
            
            // Show success message and stay on the report in view mode
            setIsEditMode(false);
            alert("Report updated successfully!");
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
                setCurrentReportId(savedReportId);
                isAutoSaveCreatedRef.current = true;
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
        savingInFlightRef.current = false;
        setIsSaving(false);
    }
  };

  // Add these helper functions at the component level, before the return statement
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, currentPos: { row: number, col: number }) => {
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
      <ReportWrapper isPrintMode={isPrintMode} disablePreview>
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
              className={`pass-fail-status-box ${getPassFailBadgeClass(status)}`}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                width: 'fit-content',
                borderRadius: '6px',
                
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
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-white dark:hover:text-gray-200"
                style={{ fontSize: '9px', padding: '2px 8px' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Job
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ fontSize: '16px', margin: 0 }}>{reportName}</h1>
            </div>
            <div className="flex gap-2 items-center">
              {isEditMode && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" style={{ fontSize: '9px', padding: '2px 8px' }}>
                  {isAutoSaving ? 'Auto-saving…' : '✓ Auto Saving Enabled'}
                </span>
              )}
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
                  <option key={option} value={option} className="bg-white dark:bg-dark-150 text-gray-900 dark:text-white">{option}</option>
                ))}
              </select>
              {currentReportId && !isEditMode ? (
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
                <button type="button" onClick={handleSave} disabled={!isEditMode || isSaving} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditMode ? 'hidden' : 'hover:bg-orange-700'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                  {isSaving ? 'Saving...' : currentReportId ? 'Update Report' : 'Save Report'}
                </button>
              )}
            </div>
          </div>

          {/* Job Information Section */}
          <div className="mb-6">
            <h2 className="section-job-info text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 print:hidden job-info-onscreen">
              {/* Column 1 */}
                <div>
                <div className="mb-4">
                  <label htmlFor="customer" className="form-label inline-block w-32">Customer:</label>
                  <input id="customer" name="customer" type="text" value={maskCustomerName(formData.customer)} readOnly className="form-input bg-gray-100 dark:bg-dark-150" />
                </div>
                <div className="mb-4">
                  <label htmlFor="address" className="form-label inline-block w-32">Address:</label>
                  <input id="address" name="address" type="text" value={maskCustomerAddress(formData.address)} readOnly className="form-input bg-gray-100 dark:bg-dark-150" />
                </div>
                <div className="mb-4">
                  <label htmlFor="user" className="form-label inline-block w-32">User:</label>
                  <input id="user" name="user" type="text" value={formData.user} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
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
                    className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''} print:hidden`}
                  />
                  <span className="hidden print:inline" style={{ fontFamily: 'monospace', fontSize: '12px', marginLeft: 0, verticalAlign: 'middle' }}>
                    {formData.date}
                  </span>
                </div>
                <div className="mb-4">
                  <label htmlFor="identifier" className="form-label inline-block w-32">Identifier:</label>
                  <input id="identifier" name="identifier" type="text" value={formData.identifier} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                </div>
              </div>
              {/* Column 2 */}
                <div>
                <div className="mb-4">
                  <label htmlFor="jobNumber" className="form-label inline-block w-32">Job #:</label>
                  <input id="jobNumber" name="jobNumber" type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-150" />
                </div>
                <div className="mb-4">
                  <label htmlFor="technicians" className="form-label inline-block w-32">Technicians:</label>
                  <input id="technicians" name="technicians" type="text" value={formData.technicians} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="temperature" className="form-label inline-block w-32">Temp:</label>
                  <input id="temperature" name="temperature" type="number" value={formData.temperature} onChange={handleChange} readOnly={!isEditMode} className={`form-input w-20 temp-input-f ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  <span className="mx-2 text-gray-600 dark:text-white">°F</span>
                  <span className="mx-2 text-gray-600 dark:text-white">{celsiusTemperature.toFixed(0)}</span>
                  <span className="text-gray-600 dark:text-white">°C</span>
                  <span className="mx-5 text-gray-600 dark:text-white tcf-label">TCF</span>
                  <span className="font-medium text-gray-900 dark:text-white tcf-value">{tcf}</span>
                </div>
                <div className="mb-4">
                  <label htmlFor="humidity" className="form-label inline-block w-32">Humidity:</label>
                  <input id="humidity" name="humidity" type="number" value={formData.humidity} onChange={handleChange} readOnly={!isEditMode} className={`form-input w-20 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  <span className="ml-2 text-gray-600 dark:text-white">%</span>
                </div>
                <div className="mb-4">
                  <label htmlFor="substation" className="form-label inline-block w-32">Substation:</label>
                  <input id="substation" name="substation" type="text" value={formData.substation} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                </div>
                <div className="mb-4">
                  <label htmlFor="eqptLocation" className="form-label inline-block w-32">Eqpt. Location:</label>
                  <input id="eqptLocation" name="eqptLocation" type="text" value={formData.eqptLocation} onChange={handleChange} readOnly={!isEditMode} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
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
                  celsius: Number.isFinite(celsiusTemperature) ? Number(celsiusTemperature.toFixed(0)) : undefined,
                  tcf: getTCF(convertFahrenheitToCelsius(formData.temperature)),
                  humidity: formData.humidity,
                },
              }}
            />
          </div>
          
          {/* Cable Data Section */}
          <div className="mb-6">
            <h2 className="section-cable-data text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Cable Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 print:hidden cable-data-onscreen">
              {/* Column 1 */}
              <div>
                <div className="mb-4">
                  <label htmlFor="testedFrom" className="form-label inline-block w-32">Tested From:</label>
                  <input id="testedFrom" name="testedFrom" type="text" value={formData.testedFrom} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="manufacturer" className="form-label inline-block w-32">Manufacturer:</label>
                  <input id="manufacturer" name="manufacturer" type="text" value={formData.manufacturer} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="conductorMaterial" className="form-label inline-block w-32">Conductor Material:</label>
                  <input id="conductorMaterial" name="conductorMaterial" type="text" value={formData.conductorMaterial} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="insulationType" className="form-label inline-block w-32">Insulation Type:</label>
                  <input id="insulationType" name="insulationType" type="text" value={formData.insulationType} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="mb-4">
                  <label htmlFor="systemVoltage" className="form-label inline-block w-32">System Voltage:</label>
                  <input id="systemVoltage" name="systemVoltage" type="text" value={formData.systemVoltage} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="ratedVoltage" className="form-label inline-block w-32">Rated Voltage:</label>
                  <input id="ratedVoltage" name="ratedVoltage" type="text" value={formData.ratedVoltage} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
                <div className="mb-4">
                  <label htmlFor="length" className="form-label inline-block w-32">Length:</label>
                  <input id="length" name="length" type="text" value={formData.length} onChange={handleChange} className={`form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} />
                </div>
              </div>
            </div>
            {/* Print-only Cable Data table */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem]">
                <colgroup>
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Tested From:</div><div className="mt-0">{formData.testedFrom || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Manufacturer:</div><div className="mt-0">{formData.manufacturer || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Conductor Material:</div><div className="mt-0">{formData.conductorMaterial || ''}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Insulation Type:</div><div className="mt-0">{formData.insulationType || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">System Voltage:</div><div className="mt-0">{formData.systemVoltage || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Rated Voltage:</div><div className="mt-0">{formData.ratedVoltage || ''}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border" colSpan={3}><div className="font-semibold">Length:</div><div className="mt-0">{formData.length || ''}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Visual and Mechanical Inspection Section */}
          <div className="mb-6">
            <h2 className="section-visual-mechanical text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '70%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">ID</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Result</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries({
                    "7.3.1.A.1": "Inspect exposed sections of cables and connectors for physical damage and evidence of degradation.",
                    "7.3.1.A.2.1": "Use of a low-resistance ohmmeter in accordance with Section 7.3.3.B.1.",
                    "7.3.1.A.3": "Inspect cable tray and cable supports.",
                    "7.3.1.A.4": "If cables are terminated through window-type current transformers, inspect to verify that neutral and ground conductors are correctly placed for operation of protective devices.",
                    "7.3.1.A.5*": "Compare cable data with drawings and cable schedule. *Optional"
                  }).map(([section, description]) => (
                    <tr key={section} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{section}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white whitespace-normal break-words">{description}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="print:hidden">
                          <select
                            id={`inspection-${section}`}
                            value={formData.inspectionResults[section]}
                            onChange={(e) => handleInspectionChange(section, e.target.value)}
                            disabled={!isEditMode}
                            className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          >
                            {INSPECTION_RESULTS_OPTIONS.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">{formData.inspectionResults[section] ?? ''}</div>
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
                <label htmlFor="numberOfCables" className="text-sm font-medium text-gray-700 dark:text-white">Number of Cable Sets:</label>
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
              {isEditMode && (
                <div className="flex gap-2 self-end">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => {
                        const nextId = (prev.testSets?.length || 0) + 1;
                        const newSet: TestSet = {
                          id: nextId,
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
                        };
                        return { ...prev, numberOfCables: nextId, testSets: [...(prev.testSets || []), newSet] };
                      });
                    }}
                    className="h-9 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    Add Row
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveEmptyRows}
                    className="h-9 px-3 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md"
                    title="Remove rows that have no data entered"
                  >
                    Remove Empty Rows
                  </button>
                </div>
              )}
            </div>
            
            {/* Test Sets Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm electrical-tests-table">
                {/* Column widths optimized to fit within page - total 100% */}
                <colgroup>
                  <col style={{ width: '7%' }} />   {/* From */}
                  <col style={{ width: '7%' }} />   {/* To */}
                  <col style={{ width: '4%' }} />   {/* Size part 1 */}
                  <col style={{ width: '4%' }} />   {/* Size part 2 */}
                  <col style={{ width: '4%' }} />   {/* RDG / 20°C */}
                  <col style={{ width: '5.5%' }} /> {/* A-G */}
                  <col style={{ width: '5.5%' }} /> {/* B-G */}
                  <col style={{ width: '5.5%' }} /> {/* C-G */}
                  <col style={{ width: '5.5%' }} /> {/* N-G */}
                  <col style={{ width: '5.5%' }} /> {/* A-B */}
                  <col style={{ width: '5.5%' }} /> {/* B-C */}
                  <col style={{ width: '5.5%' }} /> {/* C-A */}
                  <col style={{ width: '5.5%' }} /> {/* A-N */}
                  <col style={{ width: '5.5%' }} /> {/* B-N */}
                  <col style={{ width: '5.5%' }} /> {/* C-N */}
                  <col style={{ width: '5.5%' }} /> {/* Cont. */}
                  <col style={{ width: '7%' }} />   {/* Results */}
                </colgroup>
                <caption className="caption-bottom text-xs text-gray-500 dark:text-white py-2">
                  Test Voltage: {formData.testVoltage} | 1 Min. Insulation Resistance in MΩ
                </caption>
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-150">
                    <th colSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Circuit Designation</th>
                    <th colSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Size</th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600"></th>
                    <th colSpan={10} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">1 Min. Insulation Resistance in MΩ</th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Cont.</th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">Results</th>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-dark-150">
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
                          <div className="relative">
                            {isEditMode && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTestSet(set.id)}
                                aria-label={`Remove row ${set.id}`}
                                title="Remove row"
                                className="print:hidden absolute left-1 top-1 z-10 text-red-600 hover:text-red-800 font-bold bg-white dark:bg-dark-150 rounded-full w-4 h-4 leading-4 text-center border border-red-600 opacity-80 hover:opacity-100"
                              >
                                ×
                              </button>
                            )}
                            {isEditMode ? (
                              <textarea
                                data-position={`${(set.id - 1) * 2}-0`}
                                aria-label={`Set ${set.id} From`}
                                value={set.from}
                                onChange={(e) => handleTestSetChange(set.id, 'from', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 0 })}
                                className="w-full text-xs text-center text-gray-900 dark:text-white border-none bg-transparent resize-none"
                                rows={2}
                                style={{ 
                                  minHeight: '28px',
                                  height: 'auto',
                                  overflow: 'visible',
                                  wordWrap: 'break-word',
                                  wordBreak: 'break-word',
                                  overflowWrap: 'break-word',
                                  whiteSpace: 'pre-wrap',
                                  lineHeight: '1.1',
                                  fontSize: '9px',
                                  padding: '2px 1px',
                                  resize: 'none',
                                  border: 'none',
                                  outline: 'none',
                                  backgroundColor: 'transparent'
                                }}
                              />
                            ) : (
                              <div 
                                className="text-xs text-center w-full text-gray-900 dark:text-white"
                                style={{ 
                                  minHeight: '28px',
                                  lineHeight: '1.1',
                                  fontSize: '9px',
                                  padding: '2px 1px',
                                  wordWrap: 'break-word',
                                  wordBreak: 'break-word',
                                  overflowWrap: 'break-word',
                                  whiteSpace: 'pre-wrap'
                                }}
                              >
                                {renderTextWithBreaks(set.from)}
                              </div>
                            )}
                          </div>
                        </td>
                        {/* To (under Circuit Designation) - rowSpan=2 */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600" rowSpan={2} style={{ verticalAlign: 'middle' }}>
                          {isEditMode ? (
                            <textarea
                              data-position={`${(set.id - 1) * 2}-1`}
                              aria-label={`Set ${set.id} To`}
                              value={set.to}
                              onChange={(e) => handleTestSetChange(set.id, 'to', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 1 })}
                              className="w-full text-xs text-center text-gray-900 dark:text-white border-none bg-transparent resize-none"
                              rows={2}
                              style={{ 
                                minHeight: '28px',
                                height: 'auto',
                                overflow: 'visible',
                                wordWrap: 'break-word',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.1',
                                fontSize: '9px',
                                padding: '2px 1px 2px 10px',
                                resize: 'none',
                                border: 'none',
                                outline: 'none',
                                backgroundColor: 'transparent'
                              }}
                            />
                          ) : (
                            <div 
                              className="text-xs text-center w-full text-gray-900 dark:text-white"
                              style={{ 
                                minHeight: '28px',
                                lineHeight: '1.1',
                                fontSize: '9px',
                                padding: '2px 1px',
                                wordWrap: 'break-word',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                whiteSpace: 'pre-wrap'
                              }}
                            >
                              {renderTextWithBreaks(set.to)}
                            </div>
                          )}
                        </td>
                        {/* Size dropdown (stacked column) */}
                        <td colSpan={2} className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600">
                          {isEditMode ? (
                            <select
                              data-position={`${(set.id - 1) * 2}-2`}
                              aria-label={`Set ${set.id} Size`}
                              value={set.size}
                              onChange={(e) => handleTestSetChange(set.id, 'size', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 2 })}
                              className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                              style={{ fontSize: '8px', textAlign: 'center' }}
                            >
                              <option value="">-</option>
                              {CABLE_SIZES.map(size => (
                                <option key={size} value={size}>{size}</option>
                              ))}
                            </select>
                          ) : (
                            <div 
                              className="text-xs text-center w-full text-gray-900 dark:text-white"
                              style={{ 
                                fontSize: '8px',
                                padding: '2px 1px',
                                lineHeight: '1.2'
                              }}
                            >
                              {set.size || '-'}
                            </div>
                          )}
                        </td>
                        
                        {/* RDG indicator column */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600">
                          RDG
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
                          {isEditMode ? (
                            <select
                              data-position={`${(set.id - 1) * 2}-13`}
                              aria-label={`Set ${set.id} Continuity`}
                              value={set.readings.continuity || ''}
                              onChange={(e) => handleReadingChange(set.id, 'continuity', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 13 })}
                              className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                              style={{ fontSize: '8px', textAlign: 'center' }}
                            >
                              <option value="">-</option>
                              <option value="✓">Yes</option>
                              <option value="✗">No</option>
                            </select>
                          ) : (
                            <div 
                              className="text-xs text-center w-full text-gray-900 dark:text-white"
                              style={{ 
                                fontSize: '8px',
                                padding: '2px 1px',
                                lineHeight: '1.2'
                              }}
                            >
                              {set.readings.continuity === '✓' ? 'Yes' : 
                               set.readings.continuity === '✗' ? 'No' : 
                               set.readings.continuity || '-'}
                            </div>
                          )}
                        </td>
                        
                        {/* Results - spans both rows */}
                        <td 
                          rowSpan={2} 
                          className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 align-middle"
                        >
                          {isEditMode ? (
                            <select
                              data-position={`${(set.id - 1) * 2}-14`}
                              aria-label={`Set ${set.id} Result`}
                              className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                              value={set.result || ''}
                              onChange={(e) => handleTestSetChange(set.id, 'result', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2, col: 14 })}
                              style={{ fontSize: '8px', textAlign: 'center' }}
                            >
                              <option value="">-</option>
                              {EVALUATION_RESULTS.map(result => (
                                <option key={result} value={result}>{result}</option>
                              ))}
                            </select>
                          ) : (
                            <div 
                              className="text-xs text-center w-full text-gray-900 dark:text-white"
                              style={{ 
                                fontSize: '8px',
                                padding: '2px 1px',
                                lineHeight: '1.2'
                              }}
                            >
                              {set.result || '-'}
                            </div>
                          )}
                        </td>
                      </tr>
                      
                      {/* Second row for 20°C corrected values */}
                      <tr className="bg-gray-50 dark:bg-dark-150 hover:bg-gray-100 dark:hover:bg-dark-300">
                        {/* Empty - under From and To, since rowSpan=2 above */}
                        {/* (No <td> here for From/To) */}
                        
                        {/* Config dropdown (stacked column) */}
                        <td colSpan={2} className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600">
                          {isEditMode ? (
                            <select
                              data-position={`${(set.id - 1) * 2 + 1}-2`}
                              aria-label={`Set ${set.id} Config`}
                              value={set.config}
                              onChange={(e) => handleTestSetChange(set.id, 'config', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, { row: (set.id - 1) * 2 + 1, col: 2 })}
                              className="form-select text-xs py-1 px-1 text-center w-full text-gray-900 dark:text-white border-none bg-transparent"
                              style={{ fontSize: '8px', textAlign: 'center' }}
                            >
                              {CONFIGURATION_OPTIONS.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <div 
                              className="text-xs text-center w-full text-gray-900 dark:text-white"
                              style={{ 
                                fontSize: '8px',
                                padding: '2px 1px',
                                lineHeight: '1.2'
                              }}
                            >
                              {set.config}
                            </div>
                          )}
                        </td>
                        
                        {/* 20°C indicator column */}
                        <td className="px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600">
                          20°C
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
            <div className="grid grid-cols-4 gap-4 print:hidden test-eqpt-onscreen">
              <div>
                <label htmlFor="megohmmeter" className="form-label inline-block w-32">Megohmmeter:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter}
                  onChange={(value) => setFormData(prev => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      megohmmeter: value
                    }
                  }))}
                  onSelect={(equipment) => {
                    const formatDate = (dateString: string | null): string => {
                      if (!dateString) return '';
                      try {
                        const date = new Date(dateString);
                        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                      } catch {
                        return dateString;
                      }
                    };
                    setFormData(prev => ({
                      ...prev,
                      testEquipment: {
                        ...prev.testEquipment,
                        megohmmeter: equipment.equipment_name,
                        serialNumber: equipment.serial_number || '',
                        ampId: equipment.amp_id || '',
                        calDate: formatLocalDateShort(equipment.calibration_date)
                      }
                    }));
                  }}
                  readOnly={!isEditMode}
                  className="form-input"
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
              <div>
                <label htmlFor="calDate" className="form-label inline-block w-36">Calibration Date:</label>
                <input
                  id="calDate"
                  name="testEquipment.calDate"
                  type="text"
                  value={formData.testEquipment.calDate}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    testEquipment: {
                      ...prev.testEquipment,
                      calDate: e.target.value
                    }
                  }))}
                  className="form-input"
                  readOnly={!isEditMode}
                />
              </div>
            </div>
            {/* Print-only compact Test Equipment table (4 boxes wide, 1 row) */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem]">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">Megohmmeter:</div>
                      <div className="mt-0">{formData.testEquipment.megohmmeter || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">{formData.testEquipment.serialNumber || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">{formData.testEquipment.ampId || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">Calibration Date:</div>
                      <div className="mt-0">{formData.testEquipment.calDate || ''}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Comments Section */}
          <div className={`mb-6 print:break-inside-avoid ${!formData.testEquipment.comments?.trim() ? 'print:hidden' : ''}`}>
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
              className={`w-full form-textarea resize-vertical min-h-[250px] print:hidden`}
              placeholder="Enter any additional comments..."
              readOnly={!isEditMode}
            />
            {formData.testEquipment.comments?.trim() && (
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem]">
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">Comments</div>
                      <div className="mt-1 whitespace-pre-wrap">{formData.testEquipment.comments}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>      {/* Mark Ready to Review Button */}
      {!isPrintMode && isEditMode && (
        <div className="mb-6 print:hidden flex justify-center">
          <button
            onClick={async () => {
              if (!jobId || !user?.id) return;
              
              try {
                // Save the report first
                await handleSave();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Get the report ID (may have been created by save or by auto-save)
                const savedReportId = currentReportId || window.location.pathname.split('/').pop();
                if (!savedReportId) throw new Error('Failed to save report');
                
                // Update asset status to ready_for_review
                const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;
                const { error } = await supabase
                  .schema('neta_ops')
                  .from('assets')
                  .update({ 
                    status: 'ready_for_review',
                    submitted_at: new Date().toISOString()
                  })
                  .eq('file_url', fileUrl);
                
                if (error) throw error;
                
                alert('Report marked as ready for review!');
              } catch (error: any) {
                console.error('Error marking report as ready:', error);
                alert(`Failed to mark as ready: ${error?.message || 'Unknown error'}`);
              }
            }}
            className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Mark Ready to Review
          </button>
        </div>
      )}

      </ReportWrapper>


    </div>
  );
};

// Remove the duplicate print styles at the bottom
export default TwelveSetsLowVoltageCableTestForm;