import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import _ from 'lodash';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';

// Add type definitions for error handling
type SupabaseError = {
    message: string;
    code?: string;
};

// Define table name constant (ATS)
const LIQUID_TRANSFORMER_TABLE = 'liquid_filled_transformer_reports' as const;

// Temperature conversion and TCF tables (same as DryTypeTransformer)
const tempConvTable = [
  [-11.2, -24], [-9.4, -23], [-7.6, -22], [-5.8, -21], [-4, -20], [-2.2, -19], [1.4, -17], [3.2, -16], [5, -15], [6.8, -14], [8.6, -13], [10.4, -12], [12.2, -11], [14, -10], [15.8, -9], [17.6, -8], [19.4, -7], [21.2, -6], [23, -5], [24.8, -4], [26.6, -3], [28.4, -2], [30.2, -1], [32, 0], [33.8, 1], [35.6, 2], [37.4, 3], [39.2, 4], [41, 5], [42.8, 6], [44.6, 7], [46.4, 8], [48.2, 9], [50, 10], [51.8, 11], [53.6, 12], [55.4, 13], [57.2, 14], [59, 15], [60.8, 16], [62.6, 17], [64.4, 18], [66.2, 19], [68, 20], [70, 21], [72, 22], [73.4, 23], [75.2, 24], [77, 25], [78.8, 26], [80.6, 27], [82.4, 28], [84.2, 29], [86, 30], [87.8, 31], [89.6, 32], [91.4, 33], [93.2, 34], [95, 35], [96.8, 36], [98.6, 37], [100.4, 38], [102.2, 39], [104, 40], [105.8, 41], [107.6, 42], [109.4, 43], [111.2, 44], [113, 45], [114.8, 46], [116.6, 47], [118.4, 48], [120.2, 49], [122, 50], [123.8, 51], [125.6, 52], [127.4, 53], [129.2, 54], [131, 55], [132.8, 56], [134.6, 57], [136.4, 58], [138.2, 59], [140, 60], [141.8, 61], [143.6, 62], [145.4, 63], [147.2, 64], [149, 65]
];

const tcfTable = [
  [-24, 0.048], [-23, 0.051], [-22, 0.055], [-21, 0.059], [-20, 0.063],
  [-19, 0.068], [-18, 0.073], [-17, 0.078], [-16, 0.083], [-15, 0.089],
  [-14, 0.096], [-13, 0.103], [-12, 0.110], [-11, 0.118], [-10, 0.125],
  [-9, 0.135], [-8, 0.145], [-7, 0.155], [-6, 0.166], [-5, 0.180],
  [-4, 0.191], [-3, 0.205], [-2, 0.219], [-1, 0.235], [0, 0.250],
  [1, 0.270], [2, 0.289], [3, 0.310], [4, 0.332], [5, 0.360],
  [6, 0.381], [7, 0.409], [8, 0.438], [9, 0.469], [10, 0.500],
  [11, 0.539], [12, 0.577], [13, 0.619], [14, 0.663], [15, 0.750],
  [16, 0.761], [17, 0.816], [18, 0.874], [19, 0.937], [20, 1.000],
  [21, 1.075], [22, 1.152], [23, 1.235], [24, 1.323], [25, 1.400],
  [26, 1.519], [27, 1.628], [28, 1.745], [29, 1.869], [30, 1.980],
  [31, 2.146], [32, 2.300], [33, 2.464], [34, 2.641], [35, 2.800],
  [36, 3.032], [37, 3.249], [38, 3.482], [39, 3.731], [40, 3.950],
  [41, 4.284], [42, 4.590], [43, 4.918], [44, 5.270], [45, 5.600],
  [46, 6.051], [47, 6.484], [48, 6.948], [49, 7.445], [50, 7.850],
  [51, 8.549], [52, 9.160], [53, 9.816], [54, 10.518], [55, 11.200],
  [56, 12.077], [57, 12.941], [58, 13.866], [59, 14.859], [60, 15.850],
  [61, 17.061], [62, 18.281], [63, 19.589], [64, 20.991], [65, 22.400],
  [66, 24.101], [67, 25.826], [68, 27.673], [69, 29.653], [70, 31.750],
  [71, 34.048], [72, 36.484], [73, 39.094], [74, 41.891], [75, 44.700],
  [76, 48.100], [77, 51.541], [78, 55.228], [79, 59.179], [80, 63.500],
  [81, 67.950], [82, 72.811], [83, 78.021], [84, 83.603], [85, 89.789],
  [86, 95.993], [87, 102.861], [88, 110.219], [89, 118.105], [90, 127.000],
  [91, 135.609], [92, 145.311], [93, 155.707], [94, 166.846], [95, 180.000],
  [96, 191.574], [97, 205.280], [98, 219.966], [99, 235.703], [100, 245.000],
  [101, 270.636], [102, 289.998], [103, 310.745], [104, 332.977], [105, 359.150],
  [106, 382.326], [107, 409.679], [108, 438.989], [109, 470.395], [110, 509.000]
];

// Dropdown options
const visualInspectionOptions = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable"
];

const insulationResistanceUnits = [
  { symbol: "kΩ", name: "Kilo-Ohms" },
  { symbol: "MΩ", name: "Mega-Ohms" },
  { symbol: "GΩ", name: "Giga-Ohms" }
];

const testVoltageOptions = [
  "250V", "500V", "1000V",
  "2500V", "5000V", "10000V"
];

// Interface for form data structure
interface FormData {
  // Job Information (matches DryTypeTransformer)
  customer: string;
  address: string;
  date: string;
  technicians: string;
  jobNumber: string;
  substation: string;
  eqptLocation: string;
  identifier: string;
  userName: string;
  temperature: {
    ambient: number; // User inputs Fahrenheit
    celsius: number; // Calculated
    fahrenheit: number; // Same as ambient, kept for consistency/display
    correctionFactor: number; // Looked up from tcfTable based on celsius
  };

  // Nameplate Data (matches screenshot)
  nameplateData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string; // Added based on common practice
    kva: string;
    tempRise: string;
    impedance: string; // Added based on common practice
    primary: {
      volts: string; // Line-to-line
      voltsSecondary: string; // Added second voltage field
      connection: string; // 'Delta', 'Wye', 'Single Phase'
      material: string; // 'Aluminum', 'Copper'
    };
    secondary: {
      volts: string; // Line-to-line
      voltsSecondary: string; // Added second voltage field
      connection: string; // 'Delta', 'Wye', 'Single Phase'
      material: string; // 'Aluminum', 'Copper'
    };
    tapConfiguration: { // Based on screenshot
      positions: number[];
      voltages: string[]; // Array for 7 tap voltages
      currentPosition: number; // Tap Position Left (first part)
      currentPositionSecondary: string; // Tap Position Left (second part, often '/')
      tapVoltsSpecific: string; // Volts box next to Tap Position Left
      tapPercentSpecific: string; // Percent box next to Tap Position Left
    };
    
    // Add indicator gauge values
    indicatorGauges: {
      oilLevel: string;
      tankPressure: string;
      oilTemperature: string;
      windingTemperature: string;
      oilTempRange: string;
      windingTempRange: string;
    };
  };

  // Visual Inspection (Updated with new NETA sections)
  visualInspection: {
    "7.2.2.A.1": string; // Dropdown result
    "7.2.2.A.1_comments"?: string; // Optional comments field
    "7.2.2.A.2": string;
    "7.2.2.A.2_comments"?: string;
    "7.2.2.A.3": string;
    "7.2.2.A.3_comments"?: string;
    "7.2.2.A.4*": string;
    "7.2.2.A.4*_comments"?: string;
    "7.2.2.A.5": string;
    "7.2.2.A.5_comments"?: string;
    "7.2.2.A.6": string;
    "7.2.2.A.6_comments"?: string;
    "7.2.2.A.7": string;
    "7.2.2.A.7_comments"?: string;
    "7.2.2.A.8": string;
    "7.2.2.A.8_comments"?: string;
    "7.2.2.A.9": string;
    "7.2.2.A.9_comments"?: string;
    "7.2.2.A.10": string;
    "7.2.2.A.10_comments"?: string;
    "7.2.2.A.11": string;
    "7.2.2.A.11_comments"?: string;
    "7.2.2.A.12": string;
    "7.2.2.A.12_comments"?: string;
    "7.2.2.A.13": string;
    "7.2.2.A.13_comments"?: string;
    "7.2.2.A.14": string;
    "7.2.2.A.14_comments"?: string;
    "7.2.2.A.15": string;
    "7.2.2.A.15_comments"?: string;
    "7.2.2.A.16": string;
    "7.2.2.A.16_comments"?: string;
    "7.2.2.A.17": string;
    "7.2.2.A.17_comments"?: string;
    "7.2.2.A.18": string;
    "7.2.2.A.18_comments"?: string;
    "7.2.2.A.19": string;
    "7.2.2.A.19_comments"?: string;
  };

  // Insulation Resistance (Matches structure of DryTypeTransformer)
  insulationResistance: {
    temperature: string;
    primaryToGround: {
      testVoltage: string;
      unit: string;
      readings: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      corrected: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      dielectricAbsorption: string;
      polarizationIndex: string;
    };
    secondaryToGround: {
      testVoltage: string;
      unit: string;
      readings: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      corrected: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      dielectricAbsorption: string;
      polarizationIndex: string;
    };
    primaryToSecondary: {
      testVoltage: string;
      unit: string;
      readings: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      corrected: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      dielectricAbsorption: string;
      polarizationIndex: string;
    };
    dielectricAbsorptionAcceptable: string;
    polarizationIndexAcceptable: string;
  };

  // Test Equipment (Matches structure of DryTypeTransformer)
  testEquipment: {
    megohmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
    };
    // Add other equipment if needed (e.g., Hipot Tester, Ohmmeter)
  };

  // Comments (Matches structure of DryTypeTransformer)
  comments: string;
  status: string; // 'PASS' or 'FAIL'
}

// Helper function to calculate corrected value (same as DryType)
const calculateCorrectedValue = (readingStr: string, tcf: number): string => {
  // Handle special cases like "> 2000" or "< 1" if necessary
   if (typeof readingStr === 'string' && (readingStr.includes('>') || readingStr.includes('<'))) {
      return readingStr; // Return non-numeric strings as is
   }
  const readingNum = parseFloat(readingStr);
  if (isNaN(readingNum) || !isFinite(readingNum)) {
    return ''; // Return empty if reading is not a valid number
  }
  const corrected = readingNum * tcf;
  // Adjust precision based on magnitude or keep fixed? Using 2 for now.
  return corrected.toFixed(2);
};

// Helper function to calculate DA/PI ratio (same as DryType)
const calculateRatio = (numeratorStr: string, denominatorStr: string): string => {
  // Handle non-numeric inputs if corrected values can be non-numeric
   if (typeof numeratorStr === 'string' && (numeratorStr.includes('>') || numeratorStr.includes('<'))) return '';
   if (typeof denominatorStr === 'string' && (denominatorStr.includes('>') || denominatorStr.includes('<'))) return '';

  const numerator = parseFloat(numeratorStr);
  const denominator = parseFloat(denominatorStr);

  if (isNaN(numerator) || isNaN(denominator) || !isFinite(numerator) || !isFinite(denominator) || denominator === 0) {
    return ''; // Return empty if inputs are invalid or denominator is zero
  }

  const ratio = numerator / denominator;
  return ratio.toFixed(2); // Format to 2 decimal places
};

// Helper function to calculate TCF (same as DryTypeTransformer)
const calculateTCF = (celsius: number): number => {
  const match = tcfTable.find(item => item[0] === celsius);
  return match ? match[1] : 1;
};

// Helper function to calculate DA (same as DryTypeTransformer)
const calculateDA = (readings: { halfMinute: string, oneMinute: string, tenMinute: string }): string => {
  const halfMinute = parseFloat(readings.halfMinute);
  const oneMinute = parseFloat(readings.oneMinute);
  const tenMinute = parseFloat(readings.tenMinute);
  const ratio = oneMinute / halfMinute;
  return ratio.toFixed(2);
};

// Helper function to calculate PI (same as DryTypeTransformer)
const calculatePI = (readings: { halfMinute: string, oneMinute: string, tenMinute: string }): string => {
  const oneMinute = parseFloat(readings.oneMinute);
  const tenMinute = parseFloat(readings.tenMinute);
  const ratio = tenMinute / oneMinute;
  return ratio.toFixed(2);
};

const LiquidFilledTransformerReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'liquid-filled-transformer'; // This component handles the liquid-filled-transformer route
  const reportName = getReportName(reportSlug);

  // Initialize form data with default values
  const [formData, setFormData] = useState<FormData>({
    customer: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    technicians: '',
    jobNumber: '',
    substation: '',
    eqptLocation: '',
    identifier: '',
    userName: '', // Consider pre-filling with logged-in user?
    temperature: {
      ambient: 72, // Default ambient temp in F
      celsius: 22, // Calculated from 72F
      fahrenheit: 72, // Display F
      correctionFactor: 1.152 // Looked up for 22C
    },
    nameplateData: {
      manufacturer: '',
      catalogNumber: '',
      serialNumber: '',
      kva: '',
      tempRise: '',
      impedance: '',
      primary: { volts: '', voltsSecondary: '', connection: '', material: '' },
      secondary: { volts: '', voltsSecondary: '', connection: '', material: '' },
      tapConfiguration: { positions: [1,2,3,4,5,6,7], voltages: Array(7).fill(''), currentPosition: 1, currentPositionSecondary: '', tapVoltsSpecific: '', tapPercentSpecific: '' },
      indicatorGauges: { oilLevel: '', tankPressure: '', oilTemperature: '', windingTemperature: '', oilTempRange: '', windingTempRange: '' }
    },
    visualInspection: {
      "7.2.2.A.1": "Select One",
      "7.2.2.A.2": "Select One",
      "7.2.2.A.3": "Select One",
      "7.2.2.A.4*": "Select One",
      "7.2.2.A.5": "Select One",
      "7.2.2.A.6": "Select One",
      "7.2.2.A.7": "Select One",
      "7.2.2.A.8": "Select One",
      "7.2.2.A.9": "Select One",
      "7.2.2.A.10": "Select One",
      "7.2.2.A.11": "Select One",
      "7.2.2.A.12": "Select One",
      "7.2.2.A.13": "Select One",
      "7.2.2.A.14": "Select One",
      "7.2.2.A.15": "Select One",
      "7.2.2.A.16": "Select One",
      "7.2.2.A.17": "Select One",
      "7.2.2.A.18": "Select One",
      "7.2.2.A.19": "Select One"
    },
    insulationResistance: { // Default voltages match screenshot
      temperature: '',
      primaryToGround: {
        testVoltage: "5000V",
        unit: "MΩ",
        readings: { halfMinute: "", oneMinute: "", tenMinute: "" },
        corrected: { halfMinute: "", oneMinute: "", tenMinute: "" },
        dielectricAbsorption: '', polarizationIndex: ''
      },
      secondaryToGround: {
        testVoltage: "1000V",
        unit: "MΩ",
        readings: { halfMinute: "", oneMinute: "", tenMinute: "" },
        corrected: { halfMinute: "", oneMinute: "", tenMinute: "" },
        dielectricAbsorption: '', polarizationIndex: ''
      },
      primaryToSecondary: {
        testVoltage: "5000V",
        unit: "MΩ",
        readings: { halfMinute: "", oneMinute: "", tenMinute: "" },
        corrected: { halfMinute: "", oneMinute: "", tenMinute: "" },
        dielectricAbsorption: '', polarizationIndex: ''
      },
      dielectricAbsorptionAcceptable: '',
      polarizationIndexAcceptable: ''
    },
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' }
    },
    comments: '',
    status: 'PASS' // Default status
  });

  // Helper function to get visual inspection description based on screenshot
  const getVisualInspectionDescription = (id: string): string => {
    // Use NETA section numbers from the screenshot (7.2.2.A.x)
    const descriptions: { [key: string]: string } = {
      "7.2.2.A.1": "Compare equipment nameplate data with drawings and specifications.",
      "7.2.2.A.2": "Inspect physical and mechanical condition.",
      "7.2.2.A.3": "Inspect impact recorder prior to unloading.",
      "7.2.2.A.4*": "Test dew point of tank gases. *Optional",
      "7.2.2.A.5": "Inspect anchorage, alignment, and grounding.",
      "7.2.2.A.6": "Verify the presence of PCB content labeling.",
      "7.2.2.A.7": "Verify removal of any shipping bracing after placement.",
      "7.2.2.A.8": "Verify the bushings are clean.",
      "7.2.2.A.9": "Verify that alarm, control, and trip settings on temperature and level indicators are as specified.",
      "7.2.2.A.10": "Verify operation of alarm, control, and trip circuits from temperature and level indicators, pressure relief device, gas accumulator, and fault pressure relay.",
      "7.2.2.A.11": "Verify that cooling fans and pumps operate correctly and have appropriate overcurrent protection.",
      "7.2.2.A.12": "Inspect bolted electrical connections for high resistance using low-resistance ohmmeter, calibrated torquewrench, or thermographic survey.",
      "7.2.2.A.13": "Verify correct liquid level in tanks and bushings.",
      "7.2.2.A.14": "Verify valves are in the correct operating position.",
      "7.2.2.A.15": "Verify that positive pressure is maintained on gas-blanketed transformers.",
      "7.2.2.A.16": "Perform inspections and mechanical tests as recommended by the manufacturer.",
      "7.2.2.A.17": "Test load tap-changer in accordance with Section 7.12.3.",
      "7.2.2.A.18": "Verify presence of transformer surge arresters.",
      "7.2.2.A.19": "Verify de-energized tap-changer position is left as specified."
    };
    return descriptions[id] || `Unknown Section: ${id}`; // Fallback for missing keys
  };

  // Handle temperature changes (same logic as DryTypeTransformer)
  const handleTemperatureChange = (fahrenheit: number) => {
      // Find the closest match in the temperature conversion table
      const closestMatch = tempConvTable.reduce((prev, curr) => {
        return Math.abs(curr[0] - fahrenheit) < Math.abs(prev[0] - fahrenheit) ? curr : prev;
      });

      const celsius = closestMatch[1];

      // Find the correction factor from the TCF table
      const tcfMatch = tcfTable.find(item => item[0] === celsius) || [0, 1]; // Default TCF to 1 if not found
      const correctionFactor = tcfMatch[1];

      setFormData(prev => ({
        ...prev,
        temperature: {
          ambient: fahrenheit, // Keep the user input F value
          celsius,             // Store calculated C value
          fahrenheit: fahrenheit, // Store F value for display consistency
          correctionFactor      // Store looked-up TCF
        }
      }));
    };


  // Handle form field changes (generic handlers, same as DryTypeTransformer)
   const handleChange = (section: keyof FormData | null, field: string, value: any) => {
       setFormData(prev => {
           if (section) {
               // Check if the section exists before trying to spread it
               const currentSection = prev[section];
               if (typeof currentSection !== 'object' || currentSection === null) {
                   console.error(`Section "${section}" does not exist or is not an object in formData.`);
                   return prev; // Return previous state if section is invalid
               }
               return {
                   ...prev,
                   [section]: {
                       ...(currentSection as object), // Type assertion
                       [field]: value
                   }
               };
           } else {
               // Ensure the top-level field exists
               if (!(field in prev)) {
                   console.error(`Field "${field}" does not exist at the top level of formData.`);
                   return prev;
               }
               return {
                   ...prev,
                   [field]: value
               };
           }
       });
   };

   const handleNestedChange = (section: keyof FormData, subsection: string, value: any) => {
       setFormData(prev => {
           const currentSection = prev[section];
           if (typeof currentSection !== 'object' || currentSection === null) {
               console.error(`Section "${section}" does not exist or is not an object.`);
               return prev;
           }
           // Check if the subsection exists before trying to spread it
           const currentSubsection = currentSection[subsection];
            // Allow updating the entire subsection object directly
           return {
               ...prev,
               [section]: {
                   ...(currentSection as object),
                   [subsection]: value // Update the subsection directly
               }
           };
       });
   };


   const handleDeepNestedChange = (section: keyof FormData, subsection: string, nestedSection: string, field: string, value: any) => {
       setFormData(prev => {
            const currentSection: any = prev[section];
            if (typeof currentSection !== 'object' || currentSection === null) {
                console.error(`Section "${section}" is invalid.`);
                return prev;
            }
            const currentSubsection: any = currentSection[subsection];
            if (typeof currentSubsection !== 'object' || currentSubsection === null) {
                 console.error(`Subsection "${subsection}" in "${section}" is invalid.`);
                 return prev;
            }
            const currentNested = currentSubsection[nestedSection];

            const newSection: any = { ...currentSection };
            const newSubsection: any = { ...currentSubsection };

            if (field && typeof currentNested === 'object' && currentNested !== null) {
                newSubsection[nestedSection] = { ...currentNested, [field]: value };
            } else {
                newSubsection[nestedSection] = value;
            }

            newSection[subsection] = newSubsection;

            return { ...prev, [section]: newSection };
       });
   };

   // Handle specific changes for Visual Inspection comments
    const handleVisualInspectionChange = (id: string, type: 'result' | 'comment', value: string) => {
        const field = type === 'result' ? id : `${id}_comments`;
        handleNestedChange('visualInspection', field, value);
    };


  // useEffect to calculate corrected values, DA, and PI (same logic as DryTypeTransformer)
  useEffect(() => {
      const tcf = formData.temperature.correctionFactor;

      const updateCalculatedValues = (testId: keyof FormData['insulationResistance']) => {
          // Ensure testId refers to a structure with readings before accessing
          if (testId !== 'primaryToGround' && testId !== 'secondaryToGround' && testId !== 'primaryToSecondary') {
              return {
                  corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
                  dielectricAbsorption: '',
                  polarizationIndex: ''
              };
          }

          const testRecord = formData.insulationResistance[testId];
          // Check if testRecord and readings exist
           if (!testRecord || !testRecord.readings) {
               console.warn(`Insulation resistance data for ${testId} is missing or incomplete.`);
               return {
                  corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
                  dielectricAbsorption: '',
                  polarizationIndex: ''
               };
           }
           const readings = testRecord.readings;


          const corrected = {
              halfMinute: calculateCorrectedValue(readings.halfMinute, tcf),
              oneMinute: calculateCorrectedValue(readings.oneMinute, tcf),
              tenMinute: calculateCorrectedValue(readings.tenMinute, tcf),
          };
           // Use CORRECTED values for DA/PI calculations as per NETA/industry standard
          const dielectricAbsorption = calculateRatio(corrected.oneMinute, corrected.halfMinute);
          const polarizationIndex = calculateRatio(corrected.tenMinute, corrected.oneMinute);

          return { corrected, dielectricAbsorption, polarizationIndex };
      };

      // Check if insulationResistance exists before trying to update
      if (formData.insulationResistance) {
          setFormData(prev => {
              if (!prev.insulationResistance) return prev;

              const primaryCalcs = updateCalculatedValues('primaryToGround');
              const secondaryCalcs = updateCalculatedValues('secondaryToGround');
              const primarySecondaryCalcs = updateCalculatedValues('primaryToSecondary');

              const prevPrimary = prev.insulationResistance.primaryToGround;
              const prevSecondary = prev.insulationResistance.secondaryToGround;
              const prevPrimarySecondary = prev.insulationResistance.primaryToSecondary;

              const daValues = [
                  primaryCalcs.dielectricAbsorption,
                  secondaryCalcs.dielectricAbsorption,
                  primarySecondaryCalcs.dielectricAbsorption
              ].map(v => parseFloat(v));
              const daAcceptable = daValues.some(v => !isNaN(v)) && daValues.every(v => isNaN(v) || v > 1.0) ? 'Yes' : 'No';

              const piValues = [
                  primaryCalcs.polarizationIndex,
                  secondaryCalcs.polarizationIndex,
                  primarySecondaryCalcs.polarizationIndex
              ].map(v => parseFloat(v));
              const piAcceptable = piValues.some(v => !isNaN(v)) && piValues.every(v => isNaN(v) || v > 1.0) ? 'Yes' : 'No';

              if (
                  !_.isEqual(prevPrimary.corrected, primaryCalcs.corrected) ||
                  !_.isEqual(prevSecondary.corrected, secondaryCalcs.corrected) ||
                  !_.isEqual(prevPrimarySecondary.corrected, primarySecondaryCalcs.corrected) ||
                  prevPrimary.dielectricAbsorption !== primaryCalcs.dielectricAbsorption ||
                  prevSecondary.dielectricAbsorption !== secondaryCalcs.dielectricAbsorption ||
                  prevPrimarySecondary.dielectricAbsorption !== primarySecondaryCalcs.dielectricAbsorption ||
                  prevPrimary.polarizationIndex !== primaryCalcs.polarizationIndex ||
                  prevSecondary.polarizationIndex !== secondaryCalcs.polarizationIndex ||
                  prevPrimarySecondary.polarizationIndex !== primarySecondaryCalcs.polarizationIndex ||
                  prev.insulationResistance.dielectricAbsorptionAcceptable !== daAcceptable ||
                  prev.insulationResistance.polarizationIndexAcceptable !== piAcceptable
              ) {
                  return {
                      ...prev,
                      insulationResistance: {
                          ...prev.insulationResistance,  // This preserves all existing fields including temperature
                          primaryToGround: {
                              ...prev.insulationResistance.primaryToGround,
                              corrected: primaryCalcs.corrected,
                              dielectricAbsorption: primaryCalcs.dielectricAbsorption,
                              polarizationIndex: primaryCalcs.polarizationIndex,
                          },
                          secondaryToGround: {
                              ...prev.insulationResistance.secondaryToGround,
                              corrected: secondaryCalcs.corrected,
                              dielectricAbsorption: secondaryCalcs.dielectricAbsorption,
                              polarizationIndex: secondaryCalcs.polarizationIndex,
                          },
                          primaryToSecondary: {
                              ...prev.insulationResistance.primaryToSecondary,
                              corrected: primarySecondaryCalcs.corrected,
                              dielectricAbsorption: primarySecondaryCalcs.dielectricAbsorption,
                              polarizationIndex: primarySecondaryCalcs.polarizationIndex,
                          },
                          dielectricAbsorptionAcceptable: daAcceptable,
                          polarizationIndexAcceptable: piAcceptable,
                      },
                  };
              }
              return prev;
          });
      }

  }, [ // Dependencies: trigger recalculation when readings or TCF change
      formData.insulationResistance?.primaryToGround?.readings,
      formData.insulationResistance?.secondaryToGround?.readings,
      formData.insulationResistance?.primaryToSecondary?.readings,
      formData.temperature.correctionFactor,
      // Add formData.insulationResistance itself to handle potential unit changes etc.
      // Be cautious if this causes infinite loops, might need more specific dependencies.
      // formData.insulationResistance
  ]);


  // Load job information (same logic as DryTypeTransformer)
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
      const err = error as SupabaseError;
      console.error('Error loading job info:', err);
      alert(`Failed to load job info: ${err.message}`);
    } finally {
      // setLoading(false); // Loading finishes in loadReport or useEffect
    }
  };

  // Load existing report
  const loadReport = async () => {
      if (!reportId) {
          setLoading(false);
          setIsEditing(true);
          return;
      }

      setLoading(true);
      try {
          console.log(`Loading report from ${LIQUID_TRANSFORMER_TABLE} with ID: ${reportId}`);
          const { data, error } = await supabase
              .schema('neta_ops')
              .from(LIQUID_TRANSFORMER_TABLE)
              .select('*')
              .eq('id', reportId)
              .single();

          if (error) {
              if (error.code === 'PGRST116') {
                  console.warn(`Report with ID ${reportId} not found in ${LIQUID_TRANSFORMER_TABLE}.`);
                  // Keep view mode when opened from an asset link even if the row is missing
                  setIsEditing(false);
              } else {
                  throw error;
              }
          }

          if (data) {
              console.log("Loaded report data:", data);
              const normalized: any = (data as any).data
                || (data as any).report_data
                || ((data as any).report_info ? {
                  reportInfo: (data as any).report_info,
                  visualInspection: (data as any).visual_inspection ?? {},
                  insulationResistance: (data as any).insulation_resistance ?? {},
                  testEquipment: (data as any).test_equipment ?? {},
                  comments: (data as any).comments ?? '',
                  status: (data as any).status ?? undefined
                } : null);

              if (normalized) {
                setFormData(prev => ({
                  ...prev,
                  customer: normalized?.reportInfo?.customer ?? prev.customer,
                  address: normalized?.reportInfo?.address ?? prev.address,
                  date: normalized?.reportInfo?.date ?? prev.date,
                  technicians: normalized?.reportInfo?.technicians ?? '',
                  jobNumber: normalized?.reportInfo?.jobNumber ?? prev.jobNumber,
                  substation: normalized?.reportInfo?.substation ?? '',
                  eqptLocation: normalized?.reportInfo?.eqptLocation ?? '',
                  identifier: normalized?.reportInfo?.identifier ?? '',
                  userName: normalized?.reportInfo?.userName ?? '',
                  temperature: normalized?.reportInfo?.temperature ?? prev.temperature,
                  nameplateData: {
                    ...prev.nameplateData,
                    ...normalized?.reportInfo?.nameplateData,
                    indicatorGauges: (() => {
                      const ig = (normalized?.reportInfo?.nameplateData?.indicatorGauges as any) || {};
                      return {
                        oilLevel: normalized?.reportInfo?.oilLevel ?? ig.oilLevel ?? '',
                        tankPressure: normalized?.reportInfo?.tankPressure ?? ig.tankPressure ?? '',
                        oilTemperature: normalized?.reportInfo?.oilTemperature ?? ig.oilTemperature ?? '',
                        windingTemperature: normalized?.reportInfo?.windingTemperature ?? ig.windingTemperature ?? '',
                        oilTempRange: normalized?.reportInfo?.oilTempRange ?? ig.oilTempRange ?? '',
                        windingTempRange: normalized?.reportInfo?.windingTempRange ?? ig.windingTempRange ?? '',
                        humidity: ig.humidity ?? ''
                      };
                    })()
                  },
                  visualInspection: normalized?.visualInspection ?? prev.visualInspection,
                  insulationResistance: normalized?.insulationResistance ?? prev.insulationResistance,
                  testEquipment: normalized?.testEquipment ?? prev.testEquipment,
                  comments: normalized?.comments ?? '',
                  status: normalized?.status ?? 'PASS'
                }));
                setIsEditing(false);
              }
          }
      } catch (error) {
          const err = error as SupabaseError;
          console.error(`Error loading report from ${LIQUID_TRANSFORMER_TABLE}:`, err);
          alert(`Failed to load report: ${err.message}`);
          // Do not force edit mode on load failure if reportId exists
          if (!reportId) setIsEditing(true);
      } finally {
          setLoading(false);
      }
  };


  // Save report
  const handleSave = async () => {
      if (!jobId || !user?.id || !isEditing) {
          console.warn("Save condition not met:", { jobId, userId: user?.id, isEditing });
          return;
      }

       // Target ATS table
       const tableName = 'liquid_filled_transformer_reports';
       const baseData = {
           reportInfo: {
               customer: formData.customer,
               address: formData.address,
               date: formData.date,
               technicians: formData.technicians,
               jobNumber: formData.jobNumber,
               substation: formData.substation,
               eqptLocation: formData.eqptLocation,
               identifier: formData.identifier,
               userName: formData.userName,
               temperature: formData.temperature,
               nameplateData: {
                 ...formData.nameplateData,
                 indicatorGauges: {
                   ...(formData.nameplateData.indicatorGauges as any)
                 }
               }
           },
           visualInspection: formData.visualInspection,
           insulationResistance: formData.insulationResistance,
           testEquipment: formData.testEquipment,
           comments: formData.comments,
           status: formData.status
       };

       const reportData = { job_id: jobId, user_id: user.id, data: baseData } as const;
       const reportDataReportData = { job_id: jobId, user_id: user.id, report_data: baseData } as const;
       const reportDataSplit = {
           job_id: jobId,
           user_id: user.id,
           report_info: baseData.reportInfo,
           visual_inspection: baseData.visualInspection,
           insulation_resistance: baseData.insulationResistance,
           test_equipment: baseData.testEquipment,
           comments: baseData.comments
       } as const;

       console.log(`Saving data to ${tableName}:`, reportData);

       try {
           setLoading(true); // Indicate saving process
           let result;
           let currentReportId = reportId; // Use ID from URL for updates

           const upsert = async (payload: any) => {
               if (currentReportId) {
                   return await supabase.schema('neta_ops').from(tableName).update(payload).eq('id', currentReportId).select().single();
               }
               return await supabase.schema('neta_ops').from(tableName).insert(payload).select().single();
           };

           if (currentReportId) {
               console.log(`Updating ${tableName} with ID: ${currentReportId}`);
               result = await upsert(reportData);
               if (result.error && /data.*(does not exist|schema cache)/i.test(result.error.message)) {
                   console.warn('Column "data" missing; retrying with report_data...');
                   result = await upsert(reportDataReportData);
                   if (result.error && /report_data.*(does not exist|schema cache)/i.test(result.error.message)) {
                       console.warn('Column "report_data" missing; retrying with split columns...');
                       result = await upsert(reportDataSplit);
                   }
               }
           } else {
               console.log(`Inserting into ${tableName} for job ID: ${jobId}`);
               result = await upsert(reportData);
               if (result.error && /data.*(does not exist|schema cache)/i.test(result.error.message)) {
                   console.warn('Column "data" missing; retrying with report_data...');
                   result = await upsert(reportDataReportData);
                   if (result.error && /report_data.*(does not exist|schema cache)/i.test(result.error.message)) {
                       console.warn('Column "report_data" missing; retrying with split columns...');
                       result = await upsert(reportDataSplit);
                   }
               }

               if (result.data?.id) {
                   currentReportId = result.data.id; // Get the new report ID
                   console.log(`New report created with ID: ${currentReportId}`);

                   // --- Create corresponding asset entry (like DryType) ---
                   const assetName = getAssetName(reportSlug, formData.identifier || formData.eqptLocation || '');
                   // Update the URL path to match the new route
                   const assetUrl = `report:/jobs/${jobId}/liquid-filled-transformer/${currentReportId}`;

                   const assetData = {
                       name: assetName,
                       file_url: assetUrl,
                       user_id: user.id
                   };
                   console.log("Creating asset:", assetData);

                   const { data: assetResult, error: assetError } = await supabase
                       .schema('neta_ops') // Use schema
                       .from('assets')
                       .insert(assetData)
                       .select('id') // Only select the ID
                       .single();

                   if (assetError) throw assetError;
                   console.log("Asset created:", assetResult);

                   // Link asset to job
                   console.log(`Linking asset ${assetResult.id} to job ${jobId}`);
                   const { error: linkError } = await supabase
                       .schema('neta_ops') // Use schema
                       .from('job_assets')
                       .insert({
                           job_id: jobId,
                           asset_id: assetResult.id,
                           user_id: user.id
                       });
                   if (linkError) throw linkError;
                   console.log("Asset linked.");

                   // Optionally navigate to the new report URL after creation
                   // navigate(`/jobs/${jobId}/liquid-filled-transformer/${currentReportId}`, { replace: true }); // <<< ADJUST ROUTE AS NEEDED
               }
           }

           if (result.error) throw result.error;

           console.log(`${tableName} saved/updated successfully. Result:`, result.data);
           setIsEditing(false); // Exit editing mode
           alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
           navigateAfterSave(navigate, jobId, location);
            
            // Remove or comment out the URL history update since we're navigating away
       } catch (error: any) {
           console.error(`Error saving to ${tableName}:`, error);
           alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
       } finally {
           setLoading(false); // Finish loading indicator
       }
   };


  // useEffect to load data on initial mount or when jobId/reportId changes
  useEffect(() => {
      const fetchData = async () => {
          await loadJobInfo(); // Load job info first
          await loadReport(); // Then attempt to load the report
      }
      fetchData();
  }, [jobId, reportId]); // Dependencies for loading data

  // Create header function
  const renderHeader = () => (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex gap-2">
        {/* Pass/Fail Button */}
        <button
          onClick={() => {
            if (isEditing) {
              handleChange(null, 'status', formData.status === 'PASS' ? 'FAIL' : 'PASS');
            }
          }}
          disabled={!isEditing}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            formData.status === 'PASS'
              ? 'bg-green-600 text-white focus:ring-green-500'
              : 'bg-red-600 text-white focus:ring-red-500'
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        >
          {formData.status}
        </button>

        {/* Edit/Save Buttons */}
        {reportId && !isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Edit Report
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Print Report
            </button>
          </>
        ) : (
          <button
            onClick={handleSave}
            disabled={!isEditing || loading}
            className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${
              !isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'
            } ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? 'Saving...' : (reportId ? 'Update Report' : 'Save New Report')}
          </button>
        )}
      </div>
    </div>
  );

  // Loading indicator
  if (loading) {
    return <div className="p-4">Loading Report Data...</div>;
  }

  // Render the form JSX
  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.2.1.1
          <div className="mt-2">
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
                border: formData.status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: formData.status === 'PASS' ? '#22c55e' : '#ef4444',
                color: 'white',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                boxSizing: 'border-box',
                minWidth: '50px',
              }}
            >
              {formData.status || 'PASS'}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-2">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>
          
          <div className="space-y-8">
            {/* Job Information (copied layout from 13-VoltagePotentialTransformerTestMTSReport) */}
            <section className="mb-6">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
                <div><label className="form-label">Customer:</label><input type="text" value={formData.customer} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
                <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
                <div><label className="form-label">Technicians:</label><input type="text" value={formData.technicians} onChange={(e) => handleChange(null, 'technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label className="form-label">Date:</label><input type="date" value={formData.date} onChange={(e) => handleChange(null, 'date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label className="form-label">Identifier:</label><input type="text" value={formData.identifier} onChange={(e) => handleChange(null, 'identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div className="flex items-center space-x-1">
                  <div>
                    <label className="form-label">Temp:</label>
                    <input type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleTemperatureChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    <span className="ml-1 text-xs">°F</span>
                  </div>
                  <div>
                    <label className="form-label sr-only">Celsius</label>
                    <input type="number" value={formData.temperature.celsius} readOnly className="form-input w-16 bg-gray-100 dark:bg-dark-200" />
                    <span className="ml-1 text-xs">°C</span>
                  </div>
                </div>
                <div><label className="form-label">TCF:</label><input type="number" value={formData.temperature.correctionFactor} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-16" /></div>
                <div>
                  <label className="form-label">Humidity:</label>
                  <input
                    type="number"
                    value={(formData.nameplateData && (formData as any).nameplateData?.indicatorGauges?.humidity) || ''}
                    onChange={(e) => {
                      const humidity = e.target.value;
                      const ig = { ...(formData.nameplateData.indicatorGauges as any), humidity };
                      handleNestedChange('nameplateData', 'indicatorGauges', ig);
                    }}
                    readOnly={!isEditing}
                    className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="ml-1 text-xs">%</span>
                </div>
                <div><label className="form-label">Substation:</label><input type="text" value={formData.substation} onChange={(e) => handleChange(null, 'substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label className="form-label">Eqpt. Location:</label><input type="text" value={formData.eqptLocation} onChange={(e) => handleChange(null, 'eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div className="md:col-span-2"><label className="form-label">User:</label><input type="text" value={formData.userName} onChange={(e) => handleChange(null, 'userName', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
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
                    user: formData.userName,
                    substation: formData.substation,
                    eqptLocation: formData.eqptLocation,
                    temperature: {
                      fahrenheit: formData.temperature?.fahrenheit,
                      celsius: formData.temperature?.celsius,
                      tcf: formData.temperature?.correctionFactor,
                      humidity: undefined,
                    },
                  }}
                />
              </div>
            </section>
            
            {/* Nameplate Data */}
            <section className="mb-6 nameplate-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
              <div className="grid grid-cols-3 gap-4 print:hidden nameplate-onscreen">
                {/* Row 1: Manufacturer, Catalog, Serial */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer</label>
                  <input
                    type="text"
                    value={formData.nameplateData.manufacturer}
                    onChange={(e) => handleNestedChange('nameplateData', 'manufacturer', e.target.value)}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number</label>
                  <input
                    type="text"
                    value={formData.nameplateData.catalogNumber}
                    onChange={(e) => handleNestedChange('nameplateData', 'catalogNumber', e.target.value)}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
                  <input
                    type="text"
                    value={formData.nameplateData.serialNumber}
                    onChange={(e) => handleNestedChange('nameplateData', 'serialNumber', e.target.value)}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 print:hidden nameplate-onscreen">
                {/* Row 2: KVA, Temp Rise, Impedance */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">KVA</label>
                  <input
                    type="text"
                    value={formData.nameplateData.kva}
                    onChange={(e) => handleNestedChange('nameplateData', 'kva', e.target.value)}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temp. Rise (°C)</label>
                  <input
                    type="text"
                    value={formData.nameplateData.tempRise}
                    onChange={(e) => handleNestedChange('nameplateData', 'tempRise', e.target.value)}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Impedance (%)</label>
                  <input
                    type="text"
                    value={formData.nameplateData.impedance}
                    onChange={(e) => handleNestedChange('nameplateData', 'impedance', e.target.value)}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
              </div>

              <div className="mt-6 print:hidden nameplate-onscreen">
                <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
                  <div></div>
                  <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">Volts</div>
                  <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">Connections</div>
                  <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">Winding Material</div>

                  {/* Primary Row */}
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Primary</div>
                  <div className="flex justify-center items-center space-x-2">
                    <input
                      type="text"
                      value={formData.nameplateData.primary.volts}
                      onChange={(e) => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, volts: e.target.value })}
                      readOnly={!isEditing}
                      className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                    <span className="text-gray-500 dark:text-gray-400">/</span>
                    <input
                      type="text"
                      value={formData.nameplateData.primary.voltsSecondary || ''}
                      onChange={(e) => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, voltsSecondary: e.target.value })}
                      readOnly={!isEditing}
                      className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </div>
                  <div className="flex justify-center space-x-4">
                    {['Delta', 'Wye', 'Single Phase'].map(conn => (
                      <label key={`pri-${conn}`} className="inline-flex items-center">
                        <input
                          type="radio"
                          name="primary-connection"
                          value={conn}
                          checked={formData.nameplateData.primary.connection === conn}
                          onChange={() => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, connection: conn })}
                          disabled={!isEditing}
                          className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{conn}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-center space-x-4">
                    {['Aluminum', 'Copper'].map(mat => (
                      <label key={`pri-${mat}`} className="inline-flex items-center">
                        <input
                          type="radio"
                          name="primary-material"
                          value={mat}
                          checked={formData.nameplateData.primary.material === mat}
                          onChange={() => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, material: mat })}
                          disabled={!isEditing}
                          className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{mat}</span>
                      </label>
                    ))}
                  </div>

                  {/* Secondary Row */}
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Secondary</div>
                  <div className="flex justify-center items-center space-x-2">
                    <input
                      type="text"
                      value={formData.nameplateData.secondary.volts}
                      onChange={(e) => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, volts: e.target.value })}
                      readOnly={!isEditing}
                      className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${!isEditing ? 'bg-gray-100' : ''}`}
                    />
                    <span className="text-gray-500 dark:text-gray-400">/</span>
                    <input
                      type="text"
                      value={formData.nameplateData.secondary.voltsSecondary || ''}
                      onChange={(e) => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, voltsSecondary: e.target.value })}
                      readOnly={!isEditing}
                      className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${!isEditing ? 'bg-gray-100' : ''}`}
                    />
                  </div>
                  <div className="flex justify-center space-x-4">
                    {['Delta', 'Wye', 'Single Phase'].map(conn => (
                      <label key={`sec-${conn}`} className="inline-flex items-center">
                        <input
                          type="radio"
                          name="secondary-connection"
                          value={conn}
                          checked={formData.nameplateData.secondary.connection === conn}
                          onChange={() => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, connection: conn })}
                          disabled={!isEditing}
                          className="form-radio h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{conn}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-center space-x-4">
                    {['Aluminum', 'Copper'].map(mat => (
                      <label key={`sec-${mat}`} className="inline-flex items-center">
                        <input
                          type="radio"
                          name="secondary-material"
                          value={mat}
                          checked={formData.nameplateData.secondary.material === mat}
                          onChange={() => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, material: mat })}
                          disabled={!isEditing}
                          className="form-radio h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{mat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tap Configuration */}
              <div className="mt-6 border-t dark:border-gray-700 pt-4 tap-configuration-section print:hidden nameplate-onscreen">
                <h3 className="text-md font-semibold mb-4 text-gray-800 dark:text-white">Tap Configuration</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Voltages</label>
                    <div className="grid grid-cols-7 gap-2 flex-1">
                      {formData.nameplateData.tapConfiguration.voltages.map((voltage, index) => (
                        <input
                          key={`tap-volt-${index}`}
                          type="text"
                          value={voltage}
                          onChange={(e) => {
                            const newVoltages = [...formData.nameplateData.tapConfiguration.voltages];
                            newVoltages[index] = e.target.value;
                            handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, voltages: newVoltages });
                          }}
                          readOnly={!isEditing}
                          className={`w-full text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          placeholder={index === 5 || index === 6 ? '-' : ''}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position</label>
                    <div className="grid grid-cols-7 gap-2 flex-1">
                      {formData.nameplateData.tapConfiguration.positions.map((position) => (
                        <div key={`tap-pos-${position}`} className="text-center text-sm text-gray-700 dark:text-white font-medium">
                          {position}
                        </div>
                      ))}
                    </div>
                  </div>

                  

                  <div className="flex items-center">
                    <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position Left</label>
                    <div className="flex items-center space-x-8">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={formData.nameplateData.tapConfiguration.currentPosition}
                          onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, currentPosition: parseInt(e.target.value) || 0 })}
                          readOnly={!isEditing}
                          className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                        <span className="text-gray-500 dark:text-gray-400">/</span>
                        <input
                          type="text"
                          value={formData.nameplateData.tapConfiguration.currentPositionSecondary}
                          onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, currentPositionSecondary: e.target.value })}
                          readOnly={!isEditing}
                          className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Volts</span>
                        <input
                          type="text"
                          value={formData.nameplateData.tapConfiguration.tapVoltsSpecific}
                          onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, tapVoltsSpecific: e.target.value })}
                          readOnly={!isEditing}
                          className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Percent</span>
                        <input
                          type="text"
                          value={formData.nameplateData.tapConfiguration.tapPercentSpecific}
                          onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, tapPercentSpecific: e.target.value })}
                          readOnly={!isEditing}
                          className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Print-only Nameplate Data tables */}
              <div className="hidden print:block space-y-4">
                {/* Table 1: Basic Information */}
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <colgroup>
                    <col style={{ width: '33.33%' }} />
                    <col style={{ width: '33.33%' }} />
                    <col style={{ width: '33.33%' }} />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">Manufacturer:</span> {formData.nameplateData.manufacturer || ''}
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">Catalog Number:</span> {formData.nameplateData.catalogNumber || ''}
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">Serial Number:</span> {formData.nameplateData.serialNumber || ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">KVA:</span> {formData.nameplateData.kva || ''}
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">Temp. Rise °C:</span> {formData.nameplateData.tempRise || ''}
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">Impedance:</span> {formData.nameplateData.impedance || ''}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Table 2: Primary/Secondary Details */}
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <colgroup>
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" colSpan={1}>
                        Volts
                      </th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" colSpan={3}>
                        Connections
                      </th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" colSpan={2}>
                        Winding Materials
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Primary</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{formData.nameplateData.primary.volts || ''} / {formData.nameplateData.primary.voltsSecondary || ''}</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.primary.connection === 'Delta' ? '☒' : '☐'} Delta
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.primary.connection === 'Wye' ? '☒' : '☐'} Wye
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.primary.connection === 'Single Phase' ? '☒' : '☐'} Single Phase
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.primary.material === 'Aluminum' ? '☒' : '☐'} Aluminum
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.primary.material === 'Copper' ? '☒' : '☐'} Copper
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Secondary</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{formData.nameplateData.secondary.volts || ''} / {formData.nameplateData.secondary.voltsSecondary || ''}</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.secondary.connection === 'Delta' ? '☒' : '☐'} Delta
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.secondary.connection === 'Wye' ? '☒' : '☐'} Wye
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.secondary.connection === 'Single Phase' ? '☒' : '☐'} Single Phase
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.secondary.material === 'Aluminum' ? '☒' : '☐'} Aluminum
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                        {formData.nameplateData.secondary.material === 'Copper' ? '☒' : '☐'} Copper
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Table 3: Tap Configuration */}
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Tap Position</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">1</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">2</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">3</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">4</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">5</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">6</th>
                      <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">7</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Tap Voltages</td>
                      {formData.nameplateData.tapConfiguration.voltages.map((voltage, index) => (
                        <td key={index} className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{voltage || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Tap Position Left</td>
                      <td colSpan={7} className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                        Position: {formData.nameplateData.tapConfiguration.currentPosition || ''} / {formData.nameplateData.tapConfiguration.currentPositionSecondary || ''} |
                        Volts: {formData.nameplateData.tapConfiguration.tapVoltsSpecific || ''} |
                        Percent: {formData.nameplateData.tapConfiguration.tapPercentSpecific || ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Indicator Gauge Values */}
            <section className="mb-6 indicator-gauges-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Indicator Gauge Values</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 print:hidden indicator-gauges-onscreen">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oil Level:</label>
                      <input type="text" value={formData.nameplateData?.indicatorGauges?.oilLevel || ''} onChange={(e) => {
                        const ig = { ...(formData.nameplateData.indicatorGauges as any), oilLevel: e.target.value };
                        handleNestedChange('nameplateData', 'indicatorGauges', ig);
                      }} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} placeholder="Enter oil level" />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oil Temperature (°C):</label>
                      <input type="text" value={formData.nameplateData?.indicatorGauges?.oilTemperature || ''} onChange={(e) => {
                        const ig = { ...(formData.nameplateData.indicatorGauges as any), oilTemperature: e.target.value };
                        handleNestedChange('nameplateData', 'indicatorGauges', ig);
                      }} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} placeholder="Enter oil temperature" />
                  </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oil Temp. Range:</label>
                      <input type="text" value={formData.nameplateData?.indicatorGauges?.oilTempRange || ''} onChange={(e) => {
                        const ig = { ...(formData.nameplateData.indicatorGauges as any), oilTempRange: e.target.value };
                        handleNestedChange('nameplateData', 'indicatorGauges', ig);
                      }} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} placeholder="Enter oil temp range" />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tank Pressure:</label>
                      <input type="text" value={formData.nameplateData?.indicatorGauges?.tankPressure || ''} onChange={(e) => {
                        const ig = { ...(formData.nameplateData.indicatorGauges as any), tankPressure: e.target.value };
                        handleNestedChange('nameplateData', 'indicatorGauges', ig);
                      }} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} placeholder="Enter tank pressure" />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Winding Temperature (°C):</label>
                      <input type="text" value={formData.nameplateData?.indicatorGauges?.windingTemperature || ''} onChange={(e) => {
                        const ig = { ...(formData.nameplateData.indicatorGauges as any), windingTemperature: e.target.value };
                        handleNestedChange('nameplateData', 'indicatorGauges', ig);
                      }} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} placeholder="Enter winding temperature" />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Winding Temp. Range:</label>
                      <input type="text" value={formData.nameplateData?.indicatorGauges?.windingTempRange || ''} onChange={(e) => {
                        const ig = { ...(formData.nameplateData.indicatorGauges as any), windingTempRange: e.target.value };
                        handleNestedChange('nameplateData', 'indicatorGauges', ig);
                      }} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} placeholder="Enter winding temp range" />
                  </div>
                </div>

                {/* Print-only compact Indicator Gauge Values table (3 columns x 2 rows) */}
                <div className="hidden print:block">
                  <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem]">
                    <colgroup>
                      <col style={{ width: '33.33%' }} />
                      <col style={{ width: '33.33%' }} />
                      <col style={{ width: '33.33%' }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                          <div className="font-semibold">Oil Level:</div>
                          <div className="mt-0">{formData.nameplateData?.indicatorGauges?.oilLevel || ''}</div>
                        </td>
                        <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                          <div className="font-semibold">Oil Temperature (°C):</div>
                          <div className="mt-0">{formData.nameplateData?.indicatorGauges?.oilTemperature || ''}</div>
                        </td>
                        <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                          <div className="font-semibold">Oil Temp. Range:</div>
                          <div className="mt-0">{formData.nameplateData?.indicatorGauges?.oilTempRange || ''}</div>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                          <div className="font-semibold">Tank Pressure:</div>
                          <div className="mt-0">{formData.nameplateData?.indicatorGauges?.tankPressure || ''}</div>
                        </td>
                        <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                          <div className="font-semibold">Winding Temperature (°C):</div>
                          <div className="mt-0">{formData.nameplateData?.indicatorGauges?.windingTemperature || ''}</div>
                        </td>
                        <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                          <div className="font-semibold">Winding Temp. Range:</div>
                          <div className="mt-0">{formData.nameplateData?.indicatorGauges?.windingTempRange || ''}</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Visual and Mechanical Inspection */}
            <section className="mb-6 visual-mechanical-inspection">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 visual-mechanical-table table-fixed">
                  <colgroup>
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '58%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Result</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Comments</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.keys(formData.visualInspection)
                       .filter(key => !key.endsWith('_comments'))
                       .sort((a, b) => {
                         const aNum = parseInt(a.split('.').pop() || '0');
                         const bNum = parseInt(b.split('.').pop() || '0');
                         return aNum - bNum;
                       })
                       .map((id) => (
                      <tr key={id}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{id.replace('*','')}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-normal break-words">{getVisualInspectionDescription(id)}</td>
                        <td className="px-3 py-2">
                          <div className="print:hidden">
                            <select
                              value={formData.visualInspection[id]}
                              onChange={(e) => handleVisualInspectionChange(id, 'result', e.target.value)}
                              disabled={!isEditing}
                              className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            >
                              {visualInspectionOptions.map(option => (
                                <option key={option} value={option} className="dark:bg-dark-100 dark:text-white">{option}</option>
                              ))}
                            </select>
                          </div>
                          <div className="hidden print:block text-center">{formData.visualInspection[id] || ''}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="print:hidden">
                            <input
                              type="text"
                              value={formData.visualInspection[`${id}_comments`] || ''}
                              onChange={(e) => handleVisualInspectionChange(id, 'comment', e.target.value)}
                              readOnly={!isEditing}
                              className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                              placeholder="Optional comments"
                            />
                          </div>
                          <div className="hidden print:block">{formData.visualInspection[`${id}_comments`] || ''}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Insulation Resistance Tests */}
            <section className="mb-6">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Insulation Resistance</h2>
              <div className="space-y-6">
                {/* Grid container for side-by-side tables */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Insulation Resistance Values Table */}
                  <div>
                    <table className="w-full border border-gray-200 dark:border-gray-700">
                      <thead>
                        <tr>
                          <th colSpan={6} className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Insulation Resistance Values</th>
                        </tr>
                        <tr>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700 w-24">Test</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700 w-20">kV</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">0.5 Min.</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">1 Min.</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">10 Min.</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 w-16">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                        {[
                          { id: 'primaryToGround', label: 'Primary to Ground' },
                          { id: 'secondaryToGround', label: 'Secondary to Ground' },
                          { id: 'primaryToSecondary', label: 'Primary to Secondary' }
                        ].map((test) => (
                          <tr key={test.id}>
                            <td className="px-2 py-1 text-sm text-gray-900 dark:text-white border-r dark:border-gray-700">{test.label}</td>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <select
                                value={formData.insulationResistance[test.id]?.testVoltage || ''}
                                onChange={(e) => handleNestedChange('insulationResistance', test.id, { ...formData.insulationResistance[test.id], testVoltage: e.target.value })}
                                disabled={!isEditing}
                                className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                              >
                                {testVoltageOptions.map(voltage => (
                                  <option key={voltage} value={voltage} className="dark:bg-dark-100 dark:text-white">{voltage}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.readings?.halfMinute || ''} 
                                onChange={(e) => handleDeepNestedChange('insulationResistance', test.id, 'readings', 'halfMinute', e.target.value)} 
                                readOnly={!isEditing} 
                                className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                              />
                            </td>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.readings?.oneMinute || ''} 
                                onChange={(e) => handleDeepNestedChange('insulationResistance', test.id, 'readings', 'oneMinute', e.target.value)} 
                                readOnly={!isEditing} 
                                className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                              />
                            </td>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.readings?.tenMinute || ''} 
                                onChange={(e) => handleDeepNestedChange('insulationResistance', test.id, 'readings', 'tenMinute', e.target.value)} 
                                readOnly={!isEditing} 
                                className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                              />
                            </td>
                            <td className="px-1 py-1">
                              <select
                                value={formData.insulationResistance[test.id]?.unit || 'MΩ'}
                                onChange={(e) => handleNestedChange('insulationResistance', test.id, { ...formData.insulationResistance[test.id], unit: e.target.value })}
                                disabled={!isEditing}
                                className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                              >
                                {insulationResistanceUnits.map(unit => (
                                  <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Temperature Corrected Values Table */}
                  <div>
                    <table className="w-full border border-gray-200 dark:border-gray-700">
                      <thead>
                        <tr>
                          <th colSpan={4} className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Temperature Corrected Values</th>
                        </tr>
                        <tr>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">0.5 Min.</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">1 Min.</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">10 Min.</th>
                          <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                        {[
                          { id: 'primaryToGround' },
                          { id: 'secondaryToGround' },
                          { id: 'primaryToSecondary' }
                        ].map((test) => (
                          <tr key={`${test.id}-corr`}>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.corrected?.halfMinute || ''} 
                                readOnly 
                                className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                              />
                            </td>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.corrected?.oneMinute || ''} 
                                readOnly 
                                className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                              />
                            </td>
                            <td className="px-1 py-1 border-r dark:border-gray-700">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.corrected?.tenMinute || ''} 
                                readOnly 
                                className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                              />
                            </td>
                            <td className="px-1 py-1">
                              <input 
                                type="text" 
                                value={formData.insulationResistance[test.id]?.unit || 'MΩ'} 
                                readOnly 
                                className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dielectric Absorption and Polarization Index Table */}
                <table className="w-full border border-gray-200 dark:border-gray-700">
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700 w-1/3">Calculated Values</th>
                      <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">Primary</th>
                      <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">Secondary</th>
                      <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">Pri-Sec</th>
                      <th className="px-2 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Acceptable</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-2 py-2 text-sm text-gray-900 dark:text-white border-r dark:border-gray-700">
                        Dielectric Absorption
                        <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400">(Ratio of 1 Min. to 0.5 Minute Result)</div>
                      </td>
                      <td className="px-1 py-1 border-r dark:border-gray-700">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.primaryToGround?.dielectricAbsorption || ''} 
                          readOnly 
                          className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                        />
                      </td>
                      <td className="px-1 py-1 border-r dark:border-gray-700">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.secondaryToGround?.dielectricAbsorption || ''} 
                          readOnly 
                          className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                        />
                      </td>
                      <td className="px-1 py-1 border-r dark:border-gray-700">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.primaryToSecondary?.dielectricAbsorption || ''} 
                          readOnly 
                          className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.dielectricAbsorptionAcceptable} 
                          readOnly 
                          className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm ${
                            formData.insulationResistance.dielectricAbsorptionAcceptable === 'Yes' ? 'text-green-600 dark:text-green-400 font-medium' :
                            formData.insulationResistance.dielectricAbsorptionAcceptable === 'No' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'
                          }`} 
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-2 text-sm text-gray-900 dark:text-white border-r dark:border-gray-700">
                        Polarization Index
                        <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400">(Ratio of 10 Min. to 1 Min. Result)</div>
                      </td>
                      <td className="px-1 py-1 border-r dark:border-gray-700">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.primaryToGround?.polarizationIndex || ''} 
                          readOnly 
                          className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                        />
                      </td>
                      <td className="px-1 py-1 border-r dark:border-gray-700">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.secondaryToGround?.polarizationIndex || ''} 
                          readOnly 
                          className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                        />
                      </td>
                      <td className="px-1 py-1 border-r dark:border-gray-700">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.primaryToSecondary?.polarizationIndex || ''} 
                          readOnly 
                          className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-gray-900 dark:text-white" 
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input 
                          type="text" 
                          value={formData.insulationResistance.polarizationIndexAcceptable} 
                          readOnly 
                          className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm ${
                            formData.insulationResistance.polarizationIndexAcceptable === 'Yes' ? 'text-green-600 dark:text-green-400 font-medium' :
                            formData.insulationResistance.polarizationIndexAcceptable === 'No' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-white'
                          }`} 
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>




            {/* Test Equipment Used */}
            <section className="mb-6">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
              <div className="grid grid-cols-1 gap-6 print:hidden test-eqpt-onscreen">
                {/* Megohmmeter Section */}
                <div className="grid grid-cols-3 gap-4 border-b dark:border-gray-700 pb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter</label>
                    <input 
                      type="text" 
                      value={formData.testEquipment.megohmmeter.name} 
                      onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', { ...formData.testEquipment.megohmmeter, name: e.target.value })} 
                      readOnly={!isEditing}
                      className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
                    <input 
                      type="text" 
                      value={formData.testEquipment.megohmmeter.serialNumber} 
                      onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', { ...formData.testEquipment.megohmmeter, serialNumber: e.target.value })} 
                      readOnly={!isEditing}
                      className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
                    <input 
                      type="text" 
                      value={formData.testEquipment.megohmmeter.ampId} 
                      onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', { ...formData.testEquipment.megohmmeter, ampId: e.target.value })} 
                      readOnly={!isEditing}
                      className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </div>
                </div>
              </div>
              {/* Print-only compact Test Equipment table */}
              <div className="hidden print:block">
                <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black">
                  <colgroup>
                    <col style={{ width: '33.33%' }} />
                    <col style={{ width: '33.33%' }} />
                    <col style={{ width: '33.33%' }} />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="p-2 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Megohmmeter</div>
                        <div className="mt-0">{formData.testEquipment.megohmmeter.name || ''}</div>
                      </td>
                      <td className="p-2 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Serial Number</div>
                        <div className="mt-0">{formData.testEquipment.megohmmeter.serialNumber || ''}</div>
                      </td>
                      <td className="p-2 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">AMP ID</div>
                        <div className="mt-0">{formData.testEquipment.megohmmeter.ampId || ''}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Comments */}
            <section className="mb-6 comments-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
              <textarea
                value={formData.comments}
                onChange={(e) => handleChange(null, 'comments', e.target.value)}
                rows={4}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''} print:hidden`}
              />
              {/* Print-only comments table */}
              <div className="hidden print:block">
                <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black">
                  <tbody>
                    <tr>
                      <td className="p-2 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Comments</div>
                        <div className="mt-0">{formData.comments || ''}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      * { color: black !important; }
      
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
      
      /* Form elements - hide interactive indicators */
      input, select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 11px !important;
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
      table { 
        border-collapse: collapse !important; 
        width: 100% !important; 
        font-size: 12px !important;
        page-break-inside: avoid !important;
      }
      th, td { 
        border: 1px solid black !important; 
        padding: 4px !important; 
        text-align: left !important;
        vertical-align: top !important;
      }
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
      }
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Section styling */
      section { 
        break-inside: avoid !important; 
        margin-bottom: 20px !important; 
      }
      
      /* Page break utilities */
      .print\\:break-before-page { page-break-before: always !important; }
      .print\\:break-after-page { page-break-after: always !important; }
      .print\\:break-inside-avoid { page-break-inside: avoid !important; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }
      
      /* Grid and flexbox adjustments */
      .grid { display: block !important; }
      .flex { display: block !important; }
      
      /* Ensure proper spacing */
      .space-y-8 > * + * { margin-top: 2rem !important; }
      .space-y-6 > * + * { margin-top: 1.5rem !important; }
      .space-y-4 > * + * { margin-top: 1rem !important; }
      .space-y-2 > * + * { margin-top: 0.5rem !important; }
      
      /* Radio buttons and checkboxes */
      input[type="radio"], input[type="checkbox"] {
        width: 12px !important;
        height: 12px !important;
        margin-right: 4px !important;
      }
      
      /* Prevent page breaks in critical sections */
      .bg-white, .dark\\:bg-dark-150 {
        page-break-inside: avoid !important;
        margin-bottom: 1rem !important;
      }
      
      /* Ensure headers stay with content */
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid !important;
        margin-bottom: 0.5rem !important;
        font-weight: bold !important;
      }

      /* Mirror on-screen layout exactly for Job Info, Nameplate, Tap Config, Indicator Gauges */
      .grid.grid-cols-1.md\:grid-cols-4.lg\:grid-cols-6 { display: grid !important; grid-template-columns: repeat(6, 1fr) !important; gap: 4px !important; }
      .nameplate-section .grid-cols-3 { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
      .tap-configuration-section .grid-cols-7 { display: grid !important; grid-template-columns: repeat(7, minmax(0, 1fr)) !important; gap: 4px !important; }
      .indicator-gauges-section .grid-cols-3 { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
      .nameplate-section input, .tap-configuration-section input, .indicator-gauges-section input { width: 100% !important; }
      .tap-configuration-section .w-16 { width: 40px !important; }
      .tap-configuration-section .w-24 { width: 60px !important; }
      
      /* Shift Tap Voltages/Positions further left (match Dry Type ATS print layout) */
      .nameplate-section .tap-configuration-section label.w-32 { width: 70px !important; }
      .tap-configuration-section .grid { gap: 4px !important; justify-items: start !important; justify-content: start !important; }
      /* Reduce spacing created by space-x utilities when printing */
      .tap-configuration-section .flex.items-center > * + * { margin-left: 6px !important; }
      .tap-configuration-section .flex.items-center.space-x-8 > * + * { margin-left: 6px !important; }
      /* Ensure the 7-column tap grids do not center and use available width */
      .tap-configuration-section .grid.grid-cols-7 { width: auto !important; justify-content: start !important; }
      .nameplate-section label.inline-flex { display: inline-flex !important; align-items: center !important; margin-right: 8px !important; }
      .nameplate-section input[type="radio"] { width: 10px !important; height: 10px !important; margin-right: 4px !important; }

      /* Visual & Mechanical table widths for readability */
      table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
      table.visual-mechanical-table thead { display: table-header-group !important; }
      table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
      table.visual-mechanical-table colgroup col:nth-child(1) { width: 12% !important; }
      table.visual-mechanical-table colgroup col:nth-child(2) { width: 58% !important; }
      table.visual-mechanical-table colgroup col:nth-child(3) { width: 15% !important; }
      table.visual-mechanical-table colgroup col:nth-child(4) { width: 15% !important; }
      table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }

      /* Indicator Gauges: hide on-screen grid and use compact table in print */
      .indicator-gauges-section .indicator-gauges-onscreen { display: none !important; }
      .indicator-gauges-section .indicator-gauges-onscreen * { display: none !important; }
      /* Extra guard: hide any remaining grids/inputs/labels in the section */
      .indicator-gauges-section .grid { display: none !important; }
      .indicator-gauges-section input, .indicator-gauges-section label { display: none !important; }
      /* Ensure the print table wrapper is visible */
      .indicator-gauges-section .hidden.print\:block { display: block !important; }
      /* Force indicator gauges table to be visible and properly styled in print */
      .indicator-gauges-section table.indicator-gauges-table { 
        display: table !important; 
        table-layout: fixed !important; 
        width: 100% !important; 
        border-collapse: collapse !important; 
        margin-top: 10px !important;
        margin-bottom: 10px !important;
      }
      .indicator-gauges-section table.indicator-gauges-table thead { display: table-header-group !important; }
      .indicator-gauges-section table.indicator-gauges-table tbody { display: table-row-group !important; }
      .indicator-gauges-section table.indicator-gauges-table tr { display: table-row !important; }
      .indicator-gauges-section table.indicator-gauges-table th, 
      .indicator-gauges-section table.indicator-gauges-table td { 
        display: table-cell !important;
        font-size: 10px !important; 
        padding: 4px 6px !important; 
        vertical-align: middle !important; 
        border: 1px solid black !important;
        text-align: center !important;
      }
      .indicator-gauges-section table.indicator-gauges-table th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
      }

      /* Hide on-screen elements in print */
      .job-info-onscreen,
      .job-info-onscreen *,
      .indicator-gauges-onscreen,
      .indicator-gauges-onscreen *,
      .test-eqpt-onscreen,
      .test-eqpt-onscreen *,
      .nameplate-onscreen,
      .nameplate-onscreen * {
        display: none !important;
      }

      /* Ensure print-only elements are visible */
      .hidden.print\\:block {
        display: block !important;
      }

      /* Force-hide on-screen Test Equipment section to avoid duplication */
      .test-eqpt-onscreen, .test-eqpt-onscreen * {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Enforce table layouts for specific tables */
      table:has(colgroup col[style*="33.33%"]) {
        table-layout: fixed !important;
        width: 100% !important;
      }

      table:has(colgroup col[style*="12%"]) {
        table-layout: fixed !important;
        width: 100% !important;
      }

      table:has(colgroup col[style*="33.33%"]) th,
      table:has(colgroup col[style*="33.33%"]) td {
        width: 33.33% !important;
        min-width: 33.33% !important;
        max-width: 33.33% !important;
      }

      table:has(colgroup col[style*="12%"]) th,
      table:has(colgroup col[style*="12%"]) td {
        width: auto !important;
        min-width: auto !important;
        max-width: auto !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(1),
      table:has(colgroup col[style*="12%"]) td:nth-child(1) {
        width: 12% !important;
        min-width: 12% !important;
        max-width: 12% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(2),
      table:has(colgroup col[style*="12%"]) td:nth-child(2) {
        width: 18% !important;
        min-width: 18% !important;
        max-width: 18% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(3),
      table:has(colgroup col[style*="12%"]) td:nth-child(3) {
        width: 16% !important;
        min-width: 16% !important;
        max-width: 16% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(4),
      table:has(colgroup col[style*="12%"]) td:nth-child(4) {
        width: 16% !important;
        min-width: 16% !important;
        max-width: 16% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(5),
      table:has(colgroup col[style*="12%"]) td:nth-child(5) {
        width: 16% !important;
        min-width: 16% !important;
        max-width: 16% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(6),
      table:has(colgroup col[style*="12%"]) td:nth-child(6) {
        width: 9% !important;
        min-width: 9% !important;
        max-width: 9% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(7),
      table:has(colgroup col[style*="12%"]) td:nth-child(7) {
        width: 9% !important;
        min-width: 9% !important;
        max-width: 9% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default LiquidFilledTransformerReport;