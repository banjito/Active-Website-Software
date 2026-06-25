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
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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
  const key = roundedCelsius.toString();
  return tcfTable[key] !== undefined ? tcfTable[key] : 1;
};

// Helper function to get section number based on breaker type
const getSectionNumber = (breakerType: string): string => {
  switch (breakerType) {
    case "molded case":
      return "7.6.1.1.1";
    case "insulated case":
    case "power":
      return "7.6.1.1.2";
    default:
      return "7.6.1.1.1"; // Default to molded case
  }
};

// Helper function to get visual inspection items based on breaker type
const getVisualInspectionItems = (
  breakerType: string,
): Array<{ id: string; description: string; result: string }> => {
  const sectionNumber = getSectionNumber(breakerType);

  switch (breakerType) {
    case "molded case":
      return [
        {
          id: `${sectionNumber}.A.1`,
          description: "Compare equipment nameplate data with drawings.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.2`,
          description: "Inspect physical and mechanical condition.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.3`,
          description: "Verify the unit is clean.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.4`,
          description:
            "Operate the circuit breaker to ensure smooth operation.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.5`,
          description:
            "Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method. Torque values shall be in accordance with manufacturer's published data. In the absence of manufacturer's data, use Table 100.12.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.6`,
          description:
            "Perform adjustments for final protective device settings in accordance with the coordination study.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.7`,
          description:
            "*Perform thermographic survey in accordance with Section 9.",
          result: "",
        },
      ];
    case "insulated case":
      return [
        {
          id: `${sectionNumber}.A.1`,
          description: "Compare equipment nameplate data with drawings.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.2`,
          description: "Inspect physical and mechanical condition.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.3`,
          description: "Inspect anchorage, alignment, and grounding.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.4`,
          description:
            "Verify that all maintenance devices are available for servicing and operating the breaker.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.5`,
          description: "Verify the unit is clean.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.6`,
          description: "Verify the arc chutes are intact.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.7`,
          description:
            "Inspect moving and stationary contacts for condition and alignment.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.8`,
          description:
            "Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method. Torque values shall be in accordance with manufacturer's published data. In the absence of manufacturer's data, use Table 100.12.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.9`,
          description: "Verify cell fit and element alignment.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.10`,
          description: "Verify racking mechanism operation.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.11`,
          description:
            "Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.12`,
          description:
            "Perform adjustments for final protective device settings in accordance with coordination study.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.13`,
          description:
            "Record as-found and as-left operation counter readings.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.14`,
          description:
            "*Perform thermographic survey in accordance with Section 9.",
          result: "",
        },
      ];
    case "power":
      return [
        {
          id: `${sectionNumber}.A.1`,
          description: "Compare equipment nameplate data with drawings.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.2`,
          description: "Inspect physical and mechanical condition.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.3`,
          description: "Inspect anchorage, alignment, and grounding.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.4`,
          description:
            "Verify that all maintenance devices are available for servicing and operating the breaker.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.5`,
          description: "Verify the unit is clean.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.6`,
          description: "Verify the arc chutes are intact.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.7`,
          description:
            "Inspect moving and stationary contacts for condition and alignment.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.8`,
          description:
            "Verify the primary and secondary contacts wipe and other dimensions vital to satisfactory operation of the breaker are correct.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.9`,
          description:
            "Perform all mechanical operator and contact alignment tests on both the breaker and its operating mechanism in accordance with manufacturer's published data.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.10`,
          description:
            "Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method. Torque values shall be in accordance with manufacturer's published data. In the absence of manufacturer's data, use Table 100.12.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.11`,
          description: "Verify cell fit and element alignment.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.12`,
          description: "Verify racking mechanism operation.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.13`,
          description:
            "Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.14`,
          description:
            "Perform adjustments for final protective device settings in accordance with coordination study.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.15`,
          description:
            "Record as-found and as-left operation counter readings.",
          result: "",
        },
        {
          id: `${sectionNumber}.A.16`,
          description:
            "*Perform thermographic survey shall be in accordance with Section 9.",
          result: "",
        },
      ];
    default:
      // Default to molded case
      return getVisualInspectionItems("molded case");
  }
};

// Dropdown options
const visualInspectionResultsOptions = [
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
  "By Others",
];
const contactResistanceUnitsOptions = ["µΩ", "mΩ", "Ω"];
const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const insulationTestVoltageOptions = [
  "250V",
  "500V",
  "1000V",
  "2500V",
  "5000V",
];
const equipmentEvaluationResultOptions = ["PASS", "FAIL", "LIMITED SERVICE"];
const i2tOptions = ["", "On", "Off", "In", "Out", "N/A"];
const tripTypeOptions = [
  "",
  "LI",
  "LS",
  "LSI",
  "LIG",
  "LSG",
  "LSIG",
  "G",
  "TMF",
  "TMD",
  "TMA",
  "TF",
  "TA",
  "MF",
  "MA",
];
const ratedVoltageOptions = ["", "250", "480", "600", "1000"];
const operationOptions = ["", "Over-Center Handle", "Two-Step Stored Energy"];
const mountingOptions = [
  "",
  "Bolt-In",
  "Plug-in",
  "Fixed-Mount",
  "Bushing-Mount",
  "Draw-out",
];
const zoneInterlockOptions = ["", "Yes", "No", "Enabled", "Disabled", "N/A"];
const thermalMemoryOptions = ["", "Yes", "No", "Simulated", "Unknown", "N/A"];
const breakerTypeOptions = ["", "molded case", "insulated case", "power"];

interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string;
  date: string;
  breakerIdentifier: string;
  jobNumber: string;
  technicians: string;
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
    humidity: number;
  };
  substation: string;
  eqptIdentifier: string;
  circuitCellNo: string;

  // Nameplate Data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  breakerType: string;
  tripUnitType: string;
  frameSize: string;
  ratingPlug: string;
  ratedVoltage: string;
  operatingVoltage: string;
  icRating: string;
  curveNo: string;
  operation: string;
  mounting: string;
  zoneInterlock: string;
  thermalMemory: string;

  // Visual and Mechanical Inspection
  visualInspectionItems: {
    id: string;
    description: string;
    result: string;
  }[];

  // Device Settings
  tripType: string;
  deviceSettings: {
    asFound: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      thermal: { setting: string; delay: string; i2t: string };
      magnetic: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    asLeft: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      thermal: { setting: string; delay: string; i2t: string };
      magnetic: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    coordinationStudy: {
      noId: string;
      rev: string;
      date: string;
    };
  };

  // Electrical Tests - Contact/Pole Resistance
  contactResistance: {
    pole1: string;
    pole2: string;
    pole3: string;
    units: string;
    deviation: string;
    criteria: string;
    result: string;
  };

  // Electrical Tests - Insulation Resistance
  insulationResistance: {
    temperature: number;
    tcf: number;
    testVoltage: string;
    testDuration: string;
    poleToPole: {
      breakerPosition: string;
      measured: { p1: string; p2: string; p3: string };
      corrected: { p1: string; p2: string; p3: string };
      units: string;
      criteriaValue: string;
      criteriaUnits: string;
      result: string;
    };
    poleToFrame: {
      breakerPosition: string;
      measured: { p1: string; p2: string; p3: string };
      corrected: { p1: string; p2: string; p3: string };
      units: string;
      criteriaValue: string;
      criteriaUnits: string;
      result: string;
    };
    lineToLoad: {
      breakerPosition: string;
      measured: { p1: string; p2: string; p3: string };
      corrected: { p1: string; p2: string; p3: string };
      units: string;
      criteriaValue: string;
      criteriaUnits: string;
      result: string;
    };
  };

  // Electrical Tests - Current Sensing
  currentSensing: {
    testType: string;
    ltpuIndicator: string;
    testedSettings: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    tests: {
      function: string;
      settingAmpere: string;
      settingS: string;
      multiplierMin: string;
      multiplierMax: string;
      testAmpere: string;
      toleranceMin: string;
      toleranceMax: string;
      pole1: string;
      pole2: string;
      pole3: string;
      result: string;
    }[];
  };

  // Test Equipment Used
  testEquipment: {
    digitalLowResistanceOhmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
      calibrationDate: string;
    };
    megohmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
      calibrationDate: string;
    };
    primaryInjectionTestSet: {
      name: string;
      serialNumber: string;
      ampId: string;
      calibrationDate: string;
    };
  };

  // Comments
  comments: string;

  // Status
  status: string;

  // IR & DLRO Only mode
  irDlroOnly: boolean;
}

// Helper function to normalize address
const normalizeAddress = (address: any): string => {
  if (typeof address === "string") {
    return address;
  }
  if (typeof address === "object" && address !== null) {
    const parts: string[] = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip) parts.push(address.zip);
    return parts.join(", ");
  }
  return "";
};

const LVMoldedCaseCircuitBreakerATS25Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);

  // When the reportId in the URL changes (e.g. after "Copy nameplate to new report" navigates),
  // sync state so we load and show the new report instead of keeping the old one
  useEffect(() => {
    setCurrentReportId(initialReportId);
    setIsEditing(!initialReportId);
    isAutoSaveCreatedRef.current = false;
    if (initialReportId) {
      setLoading(true);
    }
  }, [initialReportId]);

  /**
   * REMEMBERING FEATURE - Autocomplete with Past Inputs
   *
   * This feature provides a "remembering" autocomplete dropdown for the Substation and
   * Breaker Identifier fields, similar to the Low Voltage Cable Test report.
   *
   * HOW IT WORKS:
   * 1. State Management: Two state arrays store the past values for each field
   *    - pastSubstations: Array of previously entered substation values
   *    - pastBreakerIdentifiers: Array of previously entered breaker identifier values
   *
   * 2. localStorage Storage: Values are persisted in the browser's localStorage
   *    - Key: 'lv-breaker-substations' for substation values
   *    - Key: 'lv-breaker-identifiers' for breaker identifier values
   *    - Format: JSON array of strings, max 20 most recent values
   *    - Storage is per-browser (not synced across devices/users)
   *
   * 3. Loading Past Values: On component mount, values are loaded from localStorage
   *    and populated into the state arrays, which are then used to populate the
   *    HTML5 <datalist> elements.
   *
   * 4. Saving New Values: When a user finishes typing and leaves the field (onBlur),
   *    the value is saved to localStorage if it's not empty. The saveToRemember function:
   *    - Trims whitespace from the value
   *    - Removes the value if it already exists in the list (to avoid duplicates)
   *    - Adds the new value to the front of the array (most recent first)
   *    - Limits the array to 20 items (removes oldest if over limit)
   *    - Updates both localStorage and the state array
   *
   * 5. HTML5 Datalist: The input fields use the 'list' attribute pointing to <datalist>
   *    elements. The datalist is populated with <option> elements from the state arrays.
   *    This provides native browser autocomplete functionality with a dropdown of suggestions.
   *
   * 6. Arrow Removal: CSS is used to hide the default browser dropdown arrow that appears
   *    on datalist inputs, providing a cleaner appearance while maintaining functionality.
   *
   * IMPLEMENTATION DETAILS:
   * - Uses React state to manage the list of past values
   * - Uses localStorage for persistence across page reloads
   * - Uses HTML5 <datalist> for native autocomplete dropdown
   * - Saves on blur (when user leaves the field) to avoid saving incomplete entries
   * - Maintains most recent 20 values per field
   * - Values are stored per-field (separate lists for substation and identifier)
   */
  const [pastSubstations, setPastSubstations] = useState<string[]>([]);
  const [pastBreakerIdentifiers, setPastBreakerIdentifiers] = useState<
    string[]
  >([]);

  // Test Equipment table sort: column key and direction
  type TestEquipmentSortColumn =
    | "equipment"
    | "name"
    | "serialNumber"
    | "ampId"
    | "calibrationDate";
  const [testEquipmentSort, setTestEquipmentSort] = useState<{
    column: TestEquipmentSortColumn;
    direction: "asc" | "desc";
  } | null>(null);

  /**
   * Load past values from localStorage when component mounts
   * This populates the autocomplete dropdowns with previously entered values
   */
  React.useEffect(() => {
    const loadPastValues = () => {
      try {
        const substations = JSON.parse(
          localStorage.getItem("lv-breaker-substations") || "[]",
        );
        const identifiers = JSON.parse(
          localStorage.getItem("lv-breaker-identifiers") || "[]",
        );
        setPastSubstations(substations);
        setPastBreakerIdentifiers(identifiers);
      } catch (err) {
        console.error("Error loading past values:", err);
      }
    };
    loadPastValues();
  }, []);

  /**
   * Save a value to localStorage for the remembering feature
   *
   * @param key - The field key ('substations' or 'identifiers')
   * @param value - The value to save
   * @param setter - The state setter function to update the state array
   *
   * This function:
   * - Only saves non-empty, trimmed values
   * - Removes duplicates (moves existing value to front if found)
   * - Limits to 20 most recent values
   * - Updates both localStorage and React state
   */
  const saveToRemember = React.useCallback(
    (key: string, value: string, setter: (vals: string[]) => void) => {
      if (!value || value.trim() === "") return;

      try {
        const storageKey = `lv-breaker-${key}`;
        const existing = JSON.parse(
          localStorage.getItem(storageKey) || "[]",
        ) as string[];
        const trimmedValue = value.trim();

        // Remove if already exists, then add to front (most recent first)
        const updated = [
          trimmedValue,
          ...existing.filter((v) => v !== trimmedValue),
        ].slice(0, 20); // Keep last 20
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setter(updated);
      } catch (err) {
        console.error("Error saving to remember:", err);
      }
    },
    [],
  );

  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get("print") === "true";

  const reportSlug = "lv-molded-case-circuit-breaker-ats25";
  const reportName = getReportName(reportSlug);

  const [formData, setFormData] = useState<FormData>({
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split("T")[0],
    breakerIdentifier: "",
    jobNumber: "",
    technicians: "",
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
    substation: "",
    eqptIdentifier: "",
    circuitCellNo: "",
    manufacturer: "",
    catalogNumber: "",
    serialNumber: "",
    breakerType: "",
    tripUnitType: "",
    frameSize: "",
    ratingPlug: "",
    ratedVoltage: "",
    operatingVoltage: "",
    icRating: "",
    curveNo: "",
    operation: "",
    mounting: "",
    zoneInterlock: "",
    thermalMemory: "",
    visualInspectionItems: [
      {
        id: "7.6.1.1.1.A.1",
        description: "Compare equipment nameplate data with drawings.",
        result: "",
      },
      {
        id: "7.6.1.1.1.A.2",
        description: "Inspect physical and mechanical condition.",
        result: "",
      },
      {
        id: "7.6.1.1.1.A.3",
        description: "Verify the unit is clean.",
        result: "",
      },
      {
        id: "7.6.1.1.1.A.4",
        description: "Operate the circuit breaker to ensure smooth operation.",
        result: "",
      },
      {
        id: "7.6.1.1.1.A.5",
        description:
          "Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method. Torque values shall be in accordance with manufacturer's published data. In the absence of manufacturer's data, use Table 100.12.",
        result: "",
      },
      {
        id: "7.6.1.1.1.A.6",
        description:
          "Perform adjustments for final protective device settings in accordance with the coordination study.",
        result: "",
      },
      {
        id: "7.6.1.1.1.A.7",
        description:
          "*Perform thermographic survey in accordance with Section 9.",
        result: "",
      },
    ],
    tripType: "",
    deviceSettings: {
      asFound: {
        longTime: { setting: "", delay: "", i2t: "" },
        shortTime: { setting: "", delay: "", i2t: "" },
        thermal: { setting: "", delay: "", i2t: "" },
        magnetic: { setting: "", delay: "", i2t: "" },
        instantaneous: { setting: "", delay: "", i2t: "" },
        groundFault: { setting: "", delay: "", i2t: "" },
      },
      asLeft: {
        longTime: { setting: "", delay: "", i2t: "" },
        shortTime: { setting: "", delay: "", i2t: "" },
        thermal: { setting: "", delay: "", i2t: "" },
        magnetic: { setting: "", delay: "", i2t: "" },
        instantaneous: { setting: "", delay: "", i2t: "" },
        groundFault: { setting: "", delay: "", i2t: "" },
      },
      coordinationStudy: {
        noId: "",
        rev: "",
        date: "",
      },
    },
    contactResistance: {
      pole1: "",
      pole2: "",
      pole3: "",
      units: "µΩ",
      deviation: "",
      criteria: "<50%",
      result: "",
    },
    insulationResistance: {
      temperature: 68,
      tcf: 0.176,
      testVoltage: "1000V",
      testDuration: "1 min",
      poleToPole: {
        breakerPosition: "Closed",
        measured: { p1: "", p2: "", p3: "" },
        corrected: { p1: "", p2: "", p3: "" },
        units: "MΩ",
        criteriaValue: "≥",
        criteriaUnits: "MΩ",
        result: "",
      },
      poleToFrame: {
        breakerPosition: "Closed",
        measured: { p1: "", p2: "", p3: "" },
        corrected: { p1: "", p2: "", p3: "" },
        units: "MΩ",
        criteriaValue: "≥",
        criteriaUnits: "MΩ",
        result: "",
      },
      lineToLoad: {
        breakerPosition: "Open",
        measured: { p1: "", p2: "", p3: "" },
        corrected: { p1: "", p2: "", p3: "" },
        units: "MΩ",
        criteriaValue: ">",
        criteriaUnits: "MΩ",
        result: "",
      },
    },
    currentSensing: {
      testType: "Primary Injection",
      ltpuIndicator: "Yes",
      testedSettings: {
        longTime: { setting: "Fixed", delay: "", i2t: "" },
        shortTime: { setting: "21", delay: "N/a", i2t: "" },
        instantaneous: { setting: "", delay: "", i2t: "" },
        groundFault: { setting: "", delay: "", i2t: "" },
      },
      tests: [
        {
          function: "LTD",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "300%",
          multiplierMax: "",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "LTPU",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "-10%",
          multiplierMax: "10%",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "STD",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "110%",
          multiplierMax: "",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "STPU",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "-10%",
          multiplierMax: "10%",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "INST-D",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "110%",
          multiplierMax: "",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "INST-PU",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "-20%",
          multiplierMax: "20%",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "GFD",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "110%",
          multiplierMax: "",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
        {
          function: "GFPU",
          settingAmpere: "",
          settingS: "",
          multiplierMin: "-15%",
          multiplierMax: "15%",
          testAmpere: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: "",
          pole2: "",
          pole3: "",
          result: "",
        },
      ],
    },
    testEquipment: {
      digitalLowResistanceOhmmeter: {
        name: "",
        serialNumber: "",
        ampId: "",
        calibrationDate: "",
      },
      megohmmeter: {
        name: "",
        serialNumber: "",
        ampId: "",
        calibrationDate: "",
      },
      primaryInjectionTestSet: {
        name: "",
        serialNumber: "",
        ampId: "",
        calibrationDate: "",
      },
    },
    comments: "",
    status: "PASS",
    irDlroOnly: false,
  });

  const [error, setError] = useState<string | null>(null);

  // Load job info
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
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
        let customerName = "";
        let customerAddress = (jobData as any).site_address || "";

        // Fetch customer from common schema
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
          customer: maskCustomerName(customerName),
          address: maskCustomerAddress(normalizeAddress(customerAddress)),
          jobNumber: jobData.job_number || "",
          user: prev.user || "", // Don't auto-fill user field
        }));
      }
    } catch (err) {
      console.error("Error loading job info:", err);
    }
  };

  // Load existing report
  const loadReport = async () => {
    if (!currentReportId) {
      setLoading(false);
      return;
    }

    // Don't reload if this report was just created via autosave - keep editing mode
    if (isAutoSaveCreatedRef.current) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("lv_molded_case_circuit_breaker_ats25")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) throw error;

      if (data && data.report_data) {
        const reportData = data.report_data as any;
        const loadedTemp = reportData.temperature || {
          fahrenheit: 68,
          celsius: 20,
          tcf: 1,
          humidity: 0,
        };
        const recomputedTCF = getTCF(loadedTemp.celsius || 20);

        setFormData((prev) => {
          // Ensure thermal and magnetic are initialized if they don't exist in loaded data
          const deviceSettings =
            reportData.deviceSettings || prev.deviceSettings;
          const ensureFunction = (settings: any, funcName: string) => {
            if (!settings[funcName]) {
              settings[funcName] = { setting: "", delay: "", i2t: "" };
            }
          };
          if (deviceSettings?.asFound) {
            ensureFunction(deviceSettings.asFound, "thermal");
            ensureFunction(deviceSettings.asFound, "magnetic");
          }
          if (deviceSettings?.asLeft) {
            ensureFunction(deviceSettings.asLeft, "thermal");
            ensureFunction(deviceSettings.asLeft, "magnetic");
          }

          // Clean up currentSensing.tests to only include valid function names
          const validFunctions = [
            "LTD",
            "LTPU",
            "STD",
            "STPU",
            "INST-D",
            "INST-PU",
            "GFD",
            "GFPU",
          ];
          let currentSensingData =
            reportData.currentSensing || prev.currentSensing;
          if (currentSensingData?.tests) {
            currentSensingData = {
              ...currentSensingData,
              tests: currentSensingData.tests.filter((t: any) =>
                validFunctions.includes(t.function),
              ),
            };
          }

          return {
            ...prev,
            ...reportData,
            temperature: {
              ...loadedTemp,
              tcf: recomputedTCF,
            },
            address: normalizeAddress(reportData.address),
            visualInspectionItems:
              reportData.visualInspectionItems || prev.visualInspectionItems,
            deviceSettings: deviceSettings,
            contactResistance:
              reportData.contactResistance || prev.contactResistance,
            insulationResistance:
              reportData.insulationResistance || prev.insulationResistance,
            currentSensing: currentSensingData,
            testEquipment: reportData.testEquipment
              ? {
                  digitalLowResistanceOhmmeter: {
                    ...prev.testEquipment.digitalLowResistanceOhmmeter,
                    ...reportData.testEquipment.digitalLowResistanceOhmmeter,
                    calibrationDate:
                      reportData.testEquipment.digitalLowResistanceOhmmeter
                        ?.calibrationDate || "",
                  },
                  megohmmeter: {
                    ...prev.testEquipment.megohmmeter,
                    ...reportData.testEquipment.megohmmeter,
                    calibrationDate:
                      reportData.testEquipment.megohmmeter?.calibrationDate ||
                      "",
                  },
                  primaryInjectionTestSet: {
                    ...prev.testEquipment.primaryInjectionTestSet,
                    ...reportData.testEquipment.primaryInjectionTestSet,
                    calibrationDate:
                      reportData.testEquipment.primaryInjectionTestSet
                        ?.calibrationDate || "",
                  },
                }
              : prev.testEquipment,
          };
        });
        setIsEditing(false);
      }
    } catch (err) {
      console.error("Error loading report:", err);
      setError("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadJobInfo();
      await loadReport();
    };
    init();
  }, [jobId, currentReportId]);

  // Auto-save functionality
  const autoSave = React.useCallback(async () => {
    if (!jobId || !isEditing) return;

    setIsAutoSaving(true);

    try {
      const dataToSave = {
        job_id: jobId,
        user_id: user?.id,
        report_data: formData,
        updated_at: new Date().toISOString(),
      };

      if (reportIdRef.current) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("lv_molded_case_circuit_breaker_ats25")
          .update(dataToSave)
          .eq("id", reportIdRef.current);

        if (error) throw error;
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const assetName = getAssetName(
            reportSlug,
            formData.breakerIdentifier,
          );

          const { data: newReport, error } = await supabase
            .schema("neta_ops")
            .from("lv_molded_case_circuit_breaker_ats25")
            .insert({
              ...dataToSave,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) {
            creatingRef.current = false;
            throw error;
          }

          if (newReport) {
            reportIdRef.current = newReport.id;
            isAutoSaveCreatedRef.current = true;
            setCurrentReportId(newReport.id);
            const { data: assetResult } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert({
                name: assetName,
                file_url: `report:/jobs/${jobId}/${reportSlug}/${newReport.id}`,
                template_type: "ATS",
                status: "in_progress",
              })
              .select()
              .single();

            if (assetResult) {
              await supabase.schema("neta_ops").from("job_assets").insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user?.id,
              });
            }

            window.history.replaceState(
              null,
              "",
              `/jobs/${jobId}/${reportSlug}/${newReport.id}`,
            );
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
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [formData, jobId, isEditing, user]);

  // Debounce auto-save
  useEffect(() => {
    if (isEditing && jobId) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        autoSave();
      }, 2000);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, isEditing, jobId, currentReportId, user, autoSave]);

  // Manual save
  const handleSave = async () => {
    if (!jobId) return;
    setIsSaving(true);

    try {
      const assetName = getAssetName(reportSlug, formData.breakerIdentifier);

      const dataToSave = {
        job_id: jobId,
        user_id: user?.id,
        report_data: formData,
        updated_at: new Date().toISOString(),
      };

      let savedReportId: string | undefined;
      // Use the ref as the source of truth for the report's identity so a manual
      // save and an in-flight autosave can't each insert a separate row. (state
      // `currentReportId` updates a render late, which is what duplicated reports.)
      const existingId = reportIdRef.current || currentReportId;
      if (existingId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("lv_molded_case_circuit_breaker_ats25")
          .update(dataToSave)
          .eq("id", existingId);

        if (error) throw error;

        await supabase
          .schema("neta_ops")
          .from("assets")
          .update({ name: assetName })
          .ilike("file_url", `%${reportSlug}/${existingId}%`);
      } else if (creatingRef.current) {
        // Autosave is already creating this report — let it finish (and pick up
        // the latest data) instead of inserting a duplicate.
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const { data: newReport, error } = await supabase
            .schema("neta_ops")
            .from("lv_molded_case_circuit_breaker_ats25")
            .insert({
              ...dataToSave,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) {
            creatingRef.current = false;
            throw error;
          }

          if (newReport) {
            savedReportId = newReport.id;
            // Set the ref immediately so a pending autosave routes to UPDATE.
            reportIdRef.current = newReport.id;
            setCurrentReportId(newReport.id);
            const { data: assetResult } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert({
                name: assetName,
                file_url: `report:/jobs/${jobId}/${reportSlug}/${newReport.id}`,
                template_type: "ATS",
                status: "in_progress",
              })
              .select()
              .single();

            // Link asset to job
            if (assetResult) {
              await supabase.schema("neta_ops").from("job_assets").insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user?.id,
              });
            }
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }

      setJustSaved(true);
      // Only a genuine new insert navigates / leaves edit mode.
      if (savedReportId) {
        setIsEditing(false);
        navigate(`/jobs/${jobId}/${reportSlug}/${savedReportId}`, {
          replace: true,
        });
      }
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save report");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (currentReportId) {
      setIsEditing(false);
    }
  };

  // Save current report and create a new one with nameplate data (excluding serial number)
  const copyNameplateDataToNewReport = React.useCallback(async () => {
    if (!jobId || !user?.id) {
      alert("Unable to create new report. Missing job or user information.");
      return;
    }

    try {
      // First, save the current report
      const currentDataToSave = {
        job_id: jobId,
        user_id: user.id,
        report_data: formData,
        updated_at: new Date().toISOString(),
      };

      if (currentReportId) {
        await supabase
          .schema("neta_ops")
          .from("lv_molded_case_circuit_breaker_ats25")
          .update(currentDataToSave)
          .eq("id", currentReportId);
      } else {
        // If current report doesn't exist, create it first
        const { data: currentReport } = await supabase
          .schema("neta_ops")
          .from("lv_molded_case_circuit_breaker_ats25")
          .insert({
            ...currentDataToSave,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (currentReport) {
          // Create asset for current report if needed
          const assetName = getAssetName(
            reportSlug,
            formData.breakerIdentifier,
          );
          await supabase
            .schema("neta_ops")
            .from("assets")
            .insert({
              name: assetName,
              file_url: `report:/jobs/${jobId}/${reportSlug}/${currentReport.id}`,
              template_type: "ATS",
              status: "in_progress",
            })
            .select()
            .single()
            .then(({ data: assetResult }) => {
              if (assetResult) {
                supabase.schema("neta_ops").from("job_assets").insert({
                  job_id: jobId,
                  asset_id: assetResult.id,
                  user_id: user.id,
                });
              }
            });
        }
      }

      // Create new report data with ONLY nameplate data copied (excluding serial number)
      // All other fields start with default/empty values
      const newReportData: FormData = {
        // Job info - keep from current report (these come from the job)
        customer: formData.customer,
        address: formData.address,
        jobNumber: formData.jobNumber,
        // Default values for everything else
        user: "",
        date: new Date().toISOString().split("T")[0],
        breakerIdentifier: "",
        technicians: "",
        temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
        substation: "",
        eqptIdentifier: "",
        circuitCellNo: "",
        // ONLY copy nameplate data (excluding serial number)
        manufacturer: formData.manufacturer,
        catalogNumber: formData.catalogNumber,
        serialNumber: "", // Explicitly blank
        breakerType: formData.breakerType,
        tripUnitType: formData.tripUnitType,
        frameSize: formData.frameSize,
        ratingPlug: formData.ratingPlug,
        ratedVoltage: formData.ratedVoltage,
        operatingVoltage: formData.operatingVoltage,
        icRating: formData.icRating,
        curveNo: formData.curveNo,
        operation: formData.operation,
        mounting: formData.mounting,
        zoneInterlock: formData.zoneInterlock,
        thermalMemory: formData.thermalMemory,
        // Default visual inspection items based on breaker type
        visualInspectionItems: getVisualInspectionItems(
          formData.breakerType || "molded case",
        ),
        tripType: "",
        deviceSettings: {
          asFound: {
            longTime: { setting: "", delay: "", i2t: "" },
            shortTime: { setting: "", delay: "", i2t: "" },
            thermal: { setting: "", delay: "", i2t: "" },
            magnetic: { setting: "", delay: "", i2t: "" },
            instantaneous: { setting: "", delay: "", i2t: "" },
            groundFault: { setting: "", delay: "", i2t: "" },
          },
          asLeft: {
            longTime: { setting: "", delay: "", i2t: "" },
            shortTime: { setting: "", delay: "", i2t: "" },
            thermal: { setting: "", delay: "", i2t: "" },
            magnetic: { setting: "", delay: "", i2t: "" },
            instantaneous: { setting: "", delay: "", i2t: "" },
            groundFault: { setting: "", delay: "", i2t: "" },
          },
          coordinationStudy: {
            noId: "",
            rev: "",
            date: "",
          },
        },
        contactResistance: {
          pole1: "",
          pole2: "",
          pole3: "",
          units: "µΩ",
          deviation: "",
          criteria: "<50%",
          result: "",
        },
        insulationResistance: {
          temperature: 68,
          tcf: 0.176,
          testVoltage: "1000V",
          testDuration: "1 min",
          poleToPole: {
            breakerPosition: "Closed",
            measured: { p1: "", p2: "", p3: "" },
            corrected: { p1: "", p2: "", p3: "" },
            units: "MΩ",
            criteriaValue: "≥",
            criteriaUnits: "MΩ",
            result: "",
          },
          poleToFrame: {
            breakerPosition: "Closed",
            measured: { p1: "", p2: "", p3: "" },
            corrected: { p1: "", p2: "", p3: "" },
            units: "MΩ",
            criteriaValue: "≥",
            criteriaUnits: "MΩ",
            result: "",
          },
          lineToLoad: {
            breakerPosition: "Open",
            measured: { p1: "", p2: "", p3: "" },
            corrected: { p1: "", p2: "", p3: "" },
            units: "MΩ",
            criteriaValue: ">",
            criteriaUnits: "MΩ",
            result: "",
          },
        },
        currentSensing: {
          testType: "Primary Injection",
          ltpuIndicator: "Yes",
          testedSettings: {
            longTime: { setting: "Fixed", delay: "", i2t: "" },
            shortTime: { setting: "21", delay: "N/a", i2t: "" },
            instantaneous: { setting: "", delay: "", i2t: "" },
            groundFault: { setting: "", delay: "", i2t: "" },
          },
          tests: [
            {
              function: "LTD",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "300%",
              multiplierMax: "",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "LTPU",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "-10%",
              multiplierMax: "10%",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "STD",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "110%",
              multiplierMax: "",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "STPU",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "-10%",
              multiplierMax: "10%",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "INST-D",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "110%",
              multiplierMax: "",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "INST-PU",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "-20%",
              multiplierMax: "20%",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "GFD",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "110%",
              multiplierMax: "",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
            {
              function: "GFPU",
              settingAmpere: "",
              settingS: "",
              multiplierMin: "-15%",
              multiplierMax: "15%",
              testAmpere: "",
              toleranceMin: "",
              toleranceMax: "",
              pole1: "",
              pole2: "",
              pole3: "",
              result: "",
            },
          ],
        },
        testEquipment: {
          digitalLowResistanceOhmmeter: {
            name: "",
            serialNumber: "",
            ampId: "",
            calibrationDate: "",
          },
          megohmmeter: {
            name: "",
            serialNumber: "",
            ampId: "",
            calibrationDate: "",
          },
          primaryInjectionTestSet: {
            name: "",
            serialNumber: "",
            ampId: "",
            calibrationDate: "",
          },
        },
        comments: "",
        status: "PASS",
        irDlroOnly: false,
      };

      // Create the new report
      const { data: newReport, error: newReportError } = await supabase
        .schema("neta_ops")
        .from("lv_molded_case_circuit_breaker_ats25")
        .insert({
          job_id: jobId,
          user_id: user.id,
          report_data: newReportData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (newReportError) throw newReportError;
      if (!newReport) throw new Error("Failed to create new report");

      // Create asset for the new report (best-effort; don't block opening the report)
      const newAssetName = getAssetName(reportSlug, "");
      const { data: newAsset, error: assetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .insert({
          name: newAssetName,
          file_url: `report:/jobs/${jobId}/${reportSlug}/${newReport.id}`,
          template_type: "ATS",
          status: "in_progress",
        })
        .select()
        .single();

      if (!assetError && newAsset) {
        await supabase.schema("neta_ops").from("job_assets").insert({
          job_id: jobId,
          asset_id: newAsset.id,
          user_id: user.id,
        });
      }
      if (assetError) {
        console.warn(
          "Asset creation failed for new report (report was created):",
          assetError,
        );
      }

      // Open the new report so user can start the next one immediately
      navigate(`/jobs/${jobId}/${reportSlug}/${newReport.id}`, {
        replace: true,
      });
    } catch (err) {
      console.error("Error creating new report:", err);
      alert(
        `Failed to create new report: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [formData, jobId, isEditing, user, currentReportId, navigate, reportSlug]);

  // Handle form changes with nested path support
  const handleChange = (path: string, value: any) => {
    setJustSaved(false);
    setFormData((prev) => {
      const keys = path.split(".");
      const newData = { ...prev };
      let current: any = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const nextKey = keys[i + 1];

        if (Array.isArray(current[key])) {
          const index = parseInt(nextKey);
          if (!isNaN(index)) {
            current[key] = [...current[key]];
            current = current[key];
            continue;
          }
        }

        current[key] = { ...current[key] };
        current = current[key];
      }

      const lastKey = keys[keys.length - 1];
      current[lastKey] = value;

      // If breaker type changed, update visual inspection items
      if (path === "breakerType" && value) {
        const newItems = getVisualInspectionItems(value);
        // Preserve existing results if item IDs match
        const itemsWithResults = newItems.map((newItem) => {
          const existingItem = prev.visualInspectionItems.find(
            (item) => item.id === newItem.id,
          );
          return existingItem
            ? { ...newItem, result: existingItem.result }
            : newItem;
        });
        newData.visualInspectionItems = itemsWithResults;
      }

      return newData;
    });
  };

  // Temperature change handlers
  const handleFahrenheitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setJustSaved(false);
    const inputValue = e.target.value;
    // Allow empty string
    if (inputValue === "" || inputValue === "-") {
      setFormData((prev) => ({
        ...prev,
        temperature: { ...prev.temperature, fahrenheit: 0, celsius: 0, tcf: 1 },
      }));
      return;
    }
    // Remove leading zeros (e.g., "01" becomes "1", but keep "0" as "0")
    const cleanValue = inputValue.replace(/^0+(\d)/, "$1") || inputValue;
    const value = parseFloat(cleanValue);
    if (isNaN(value)) return;

    const celsius = Math.round((((value - 32) * 5) / 9) * 10) / 10;
    const tcf = getTCF(celsius);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit: value, celsius, tcf },
    }));
  };

  const handleCelsiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setJustSaved(false);
    const inputValue = e.target.value;
    // Allow empty string
    if (inputValue === "" || inputValue === "-") {
      setFormData((prev) => ({
        ...prev,
        temperature: {
          ...prev.temperature,
          celsius: 0,
          fahrenheit: 32,
          tcf: 1,
        },
      }));
      return;
    }
    // Remove leading zeros (e.g., "01" becomes "1", but keep "0" as "0")
    const cleanValue = inputValue.replace(/^0+(\d)/, "$1") || inputValue;
    const value = parseFloat(cleanValue);
    if (isNaN(value)) return;

    const fahrenheit = Math.round(((value * 9) / 5 + 32) * 10) / 10;
    const tcf = getTCF(value);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius: value, tcf },
    }));
  };

  // Handle insulation resistance temperature change
  const handleInsulationTemperatureChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const inputValue = e.target.value;
    // Allow empty string
    if (inputValue === "" || inputValue === "-") {
      handleChange("insulationResistance.temperature", 0);
      return;
    }
    // Remove leading zeros (e.g., "01" becomes "1", but keep "0" as "0")
    const cleanValue = inputValue.replace(/^0+(\d)/, "$1") || inputValue;
    const value = parseFloat(cleanValue);
    if (isNaN(value)) return;

    handleChange("insulationResistance.temperature", value);
  };

  // Calculate insulation resistance temperature corrected values
  // Supports < and > symbols (e.g., "<2200" becomes "<2200.000" after correction)
  const calculateInsulationCorrectedValue = (
    measured: string,
    tcf: number,
  ): string => {
    if (!measured || measured.trim() === "") return "";

    // Check if value starts with < or >
    const hasLessThan = measured.trim().startsWith("<");
    const hasGreaterThan = measured.trim().startsWith(">");
    const symbol = hasLessThan ? "<" : hasGreaterThan ? ">" : "";

    // Extract numeric value (remove symbol if present)
    const numericStr = measured.trim().replace(/^[<>]/, "");
    const value = parseFloat(numericStr);

    // If not a valid number, return the original value (preserves symbols and text)
    if (isNaN(value) || value === 0) {
      return measured.trim();
    }

    // Calculate corrected value
    const corrected = value * tcf;
    const correctedStr = corrected.toFixed(3);

    // Prepend symbol if it was present
    return symbol ? `${symbol}${correctedStr}` : correctedStr;
  };

  // Auto-calculate temperature corrected values when measured values or TCF changes
  React.useEffect(() => {
    const tcf = formData.insulationResistance.tcf;
    const { poleToPole, poleToFrame, lineToLoad } =
      formData.insulationResistance;

    const newPoleToPole = {
      p1: calculateInsulationCorrectedValue(poleToPole.measured.p1, tcf),
      p2: calculateInsulationCorrectedValue(poleToPole.measured.p2, tcf),
      p3: calculateInsulationCorrectedValue(poleToPole.measured.p3, tcf),
    };

    const newPoleToFrame = {
      p1: calculateInsulationCorrectedValue(poleToFrame.measured.p1, tcf),
      p2: calculateInsulationCorrectedValue(poleToFrame.measured.p2, tcf),
      p3: calculateInsulationCorrectedValue(poleToFrame.measured.p3, tcf),
    };

    const newLineToLoad = {
      p1: calculateInsulationCorrectedValue(lineToLoad.measured.p1, tcf),
      p2: calculateInsulationCorrectedValue(lineToLoad.measured.p2, tcf),
      p3: calculateInsulationCorrectedValue(lineToLoad.measured.p3, tcf),
    };

    // Only update if values actually changed to avoid infinite loops
    const changed =
      JSON.stringify(newPoleToPole) !== JSON.stringify(poleToPole.corrected) ||
      JSON.stringify(newPoleToFrame) !==
        JSON.stringify(poleToFrame.corrected) ||
      JSON.stringify(newLineToLoad) !== JSON.stringify(lineToLoad.corrected);

    if (changed) {
      setFormData((prev) => ({
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          poleToPole: {
            ...prev.insulationResistance.poleToPole,
            corrected: newPoleToPole,
          },
          poleToFrame: {
            ...prev.insulationResistance.poleToFrame,
            corrected: newPoleToFrame,
          },
          lineToLoad: {
            ...prev.insulationResistance.lineToLoad,
            corrected: newLineToLoad,
          },
        },
      }));
    }
  }, [
    formData.insulationResistance.tcf,
    formData.insulationResistance.poleToPole.measured.p1,
    formData.insulationResistance.poleToPole.measured.p2,
    formData.insulationResistance.poleToPole.measured.p3,
    formData.insulationResistance.poleToFrame.measured.p1,
    formData.insulationResistance.poleToFrame.measured.p2,
    formData.insulationResistance.poleToFrame.measured.p3,
    formData.insulationResistance.lineToLoad.measured.p1,
    formData.insulationResistance.lineToLoad.measured.p2,
    formData.insulationResistance.lineToLoad.measured.p3,
  ]);

  // Autofill insulation temperature from header temperature (Job Information)
  React.useEffect(() => {
    const headerF = formData.temperature.fahrenheit;
    if (
      headerF != null &&
      formData.insulationResistance.temperature !== headerF
    ) {
      setFormData((prev) => ({
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          temperature: headerF,
        },
      }));
    }
  }, [formData.temperature.fahrenheit]);

  // Update TCF when insulation temperature changes
  React.useEffect(() => {
    const tempF = formData.insulationResistance.temperature;
    const tempC = ((tempF - 32) * 5) / 9;
    const newTcf = getTCF(tempC);

    if (newTcf !== formData.insulationResistance.tcf) {
      setFormData((prev) => ({
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          tcf: newTcf,
        },
      }));
    }
  }, [formData.insulationResistance.temperature]);

  // Autofill tested settings (Current Sensing) from As Left device settings so the tables stay in sync
  React.useEffect(() => {
    const asLeft = formData.deviceSettings.asLeft;
    const tested = formData.currentSensing.testedSettings;
    const thermalMagneticTypes = ["TMF", "TMD", "TMA", "TF", "TA", "MF", "MA"];
    const isThermalMagnetic = thermalMagneticTypes.includes(formData.tripType);

    const copy = (
      from: { setting: string; delay: string; i2t: string } | undefined,
    ) =>
      from
        ? {
            setting: from.setting ?? "",
            delay: from.delay ?? "",
            i2t: from.i2t ?? "",
          }
        : null;

    const longTimeSource = isThermalMagnetic ? asLeft.thermal : asLeft.longTime;
    const shortTimeSource = isThermalMagnetic
      ? asLeft.magnetic
      : asLeft.shortTime;

    const updates: Partial<typeof tested> = {};
    if (longTimeSource) {
      const v = copy(longTimeSource);
      if (
        v &&
        (v.setting !== tested.longTime.setting ||
          v.delay !== tested.longTime.delay ||
          v.i2t !== tested.longTime.i2t)
      ) {
        updates.longTime = v;
      }
    }
    if (shortTimeSource) {
      const v = copy(shortTimeSource);
      if (
        v &&
        (v.setting !== tested.shortTime.setting ||
          v.delay !== tested.shortTime.delay ||
          v.i2t !== tested.shortTime.i2t)
      ) {
        updates.shortTime = v;
      }
    }
    // Thermal-magnetic types (TMF, TMD, TMA, TF, TA, MF, MA) have no instantaneous or ground fault rows
    if (!isThermalMagnetic) {
      if (asLeft.instantaneous) {
        const v = copy(asLeft.instantaneous);
        if (
          v &&
          (v.setting !== tested.instantaneous.setting ||
            v.delay !== tested.instantaneous.delay ||
            v.i2t !== tested.instantaneous.i2t)
        ) {
          updates.instantaneous = v;
        }
      }
      if (asLeft.groundFault) {
        const v = copy(asLeft.groundFault);
        if (
          v &&
          (v.setting !== tested.groundFault.setting ||
            v.delay !== tested.groundFault.delay ||
            v.i2t !== tested.groundFault.i2t)
        ) {
          updates.groundFault = v;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      setFormData((prev) => ({
        ...prev,
        currentSensing: {
          ...prev.currentSensing,
          testedSettings: { ...prev.currentSensing.testedSettings, ...updates },
        },
      }));
    }
  }, [
    formData.tripType,
    formData.deviceSettings.asLeft.longTime?.setting,
    formData.deviceSettings.asLeft.longTime?.delay,
    formData.deviceSettings.asLeft.longTime?.i2t,
    formData.deviceSettings.asLeft.shortTime?.setting,
    formData.deviceSettings.asLeft.shortTime?.delay,
    formData.deviceSettings.asLeft.shortTime?.i2t,
    formData.deviceSettings.asLeft.thermal?.setting,
    formData.deviceSettings.asLeft.thermal?.delay,
    formData.deviceSettings.asLeft.thermal?.i2t,
    formData.deviceSettings.asLeft.magnetic?.setting,
    formData.deviceSettings.asLeft.magnetic?.delay,
    formData.deviceSettings.asLeft.magnetic?.i2t,
    formData.deviceSettings.asLeft.instantaneous?.setting,
    formData.deviceSettings.asLeft.instantaneous?.delay,
    formData.deviceSettings.asLeft.instantaneous?.i2t,
    formData.deviceSettings.asLeft.groundFault?.setting,
    formData.deviceSettings.asLeft.groundFault?.delay,
    formData.deviceSettings.asLeft.groundFault?.i2t,
  ]);

  // Calculate insulation resistance criteria value based on rated voltage and units
  // Formula: IF rated voltage ≤ 250V → 25 MΩ (or 0.025 GΩ), else 100 MΩ (or 0.1 GΩ)
  const calculateInsulationCriteriaValue = (units: string): string => {
    const ratedVoltage = parseFloat(formData.ratedVoltage) || 0;
    if (ratedVoltage === 0) return "";

    if (ratedVoltage <= 250) {
      if (units === "MΩ") return "25";
      if (units === "GΩ") return "0.025";
      if (units === "kΩ") return "25000";
    } else {
      if (units === "MΩ") return "100";
      if (units === "GΩ") return "0.1";
      if (units === "kΩ") return "100000";
    }
    return "";
  };

  // Calculate insulation resistance result based on corrected values vs criteria
  // Formula: All three corrected values must be > criteria value to PASS
  // Handles < and > symbols by extracting numeric values for comparison
  const calculateInsulationResult = (
    corrected: { p1: string; p2: string; p3: string },
    criteriaValue: string,
  ): string => {
    // Extract numeric values, handling < and > symbols
    const extractNumeric = (val: string): number => {
      if (!val || val.trim() === "") return NaN;
      const numericStr = val.trim().replace(/^[<>]/, "");
      return parseFloat(numericStr);
    };

    const p1 = extractNumeric(corrected.p1);
    const p2 = extractNumeric(corrected.p2);
    const p3 = extractNumeric(corrected.p3);
    const criteria = parseFloat(criteriaValue);

    // If any corrected values are empty/invalid or criteria is empty → "-"
    if (
      isNaN(p1) ||
      isNaN(p2) ||
      isNaN(p3) ||
      isNaN(criteria) ||
      criteriaValue === ""
    ) {
      return "-";
    }

    // If criteria is N/A → "N/A"
    if (criteriaValue === "N/A") {
      return "N/A";
    }

    // If all three corrected values > criteria → PASS, else FAIL
    if (p1 > criteria && p2 > criteria && p3 > criteria) {
      return "PASS";
    }
    return "FAIL";
  };

  // Auto-calculate current sensing formulas
  // PU rows (LTPU/STPU/INST-PU/GFPU): toleranceMin = (multiplierMin * settingAmpere) + settingAmpere
  // PU rows (LTPU/STPU/INST-PU/GFPU): toleranceMax = (multiplierMax * settingAmpere) + settingAmpere
  // PU rows (LTPU/STPU/INST-PU/GFPU): testAmpere = settingAmpere (copy)
  // D rows (LTD/STD/INST-D/GFD): testAmpere = settingAmpere * multiplierMin
  // Results: PASS if all poles are within tolerance range, FAIL otherwise
  React.useEffect(() => {
    const tests = formData.currentSensing.tests;
    let hasChanges = false;
    const updatedTests = tests.map((test) => {
      const settingAmpere = parseFloat(test.settingAmpere);
      const multiplierMin =
        parseFloat(test.multiplierMin?.replace("%", "")) / 100;
      const multiplierMax =
        parseFloat(test.multiplierMax?.replace("%", "")) / 100;
      const updates: Partial<typeof test> = {};

      // All PU rows: tolerance Min/Max formulas + copy settingAmpere to testAmpere (Primary Injection only)
      if (["LTPU", "STPU", "INST-PU", "GFPU"].includes(test.function)) {
        if (!isNaN(settingAmpere) && settingAmpere !== 0) {
          // Tolerance Min = (multiplierMin * settingAmpere) + settingAmpere
          if (!isNaN(multiplierMin)) {
            const newMin = (
              multiplierMin * settingAmpere +
              settingAmpere
            ).toFixed(2);
            if (newMin !== test.toleranceMin) updates.toleranceMin = newMin;
          }
          // Tolerance Max = (multiplierMax * settingAmpere) + settingAmpere
          if (!isNaN(multiplierMax)) {
            const newMax = (
              multiplierMax * settingAmpere +
              settingAmpere
            ).toFixed(2);
            if (newMax !== test.toleranceMax) updates.toleranceMax = newMax;
          }
          // Test Ampere = Setting Ampere (copy) — only for Primary Injection; Secondary Injection is user input
          if (
            formData.currentSensing.testType !== "Secondary Injection" &&
            test.settingAmpere !== test.testAmpere
          ) {
            updates.testAmpere = test.settingAmpere;
          }
        }
      }

      // All D rows: testAmpere = settingAmpere * multiplierMin — only for Primary Injection; Secondary Injection is user input
      if (
        formData.currentSensing.testType !== "Secondary Injection" &&
        ["LTD", "STD", "INST-D", "GFD"].includes(test.function)
      ) {
        if (
          !isNaN(settingAmpere) &&
          settingAmpere !== 0 &&
          !isNaN(multiplierMin)
        ) {
          const newTestAmpere = (settingAmpere * multiplierMin).toFixed(2);
          if (newTestAmpere !== test.testAmpere) {
            updates.testAmpere = newTestAmpere;
          }
        }
      }

      // Calculate Result: PASS if all poles are within tolerance range [Min, Max]
      const pole1 = parseFloat(test.pole1);
      const pole2 = parseFloat(test.pole2);
      const pole3 = parseFloat(test.pole3);
      const tolMin = parseFloat(updates.toleranceMin || test.toleranceMin);
      const tolMax = parseFloat(updates.toleranceMax || test.toleranceMax);

      // If any pole is empty, result is empty
      if (test.pole1 === "" || test.pole2 === "" || test.pole3 === "") {
        if (test.result !== "") updates.result = "";
      } else if (
        !isNaN(pole1) &&
        !isNaN(pole2) &&
        !isNaN(pole3) &&
        !isNaN(tolMin) &&
        !isNaN(tolMax)
      ) {
        // Check if all poles are within range [tolMin, tolMax]
        const allWithinRange =
          pole1 >= tolMin &&
          pole1 <= tolMax &&
          pole2 >= tolMin &&
          pole2 <= tolMax &&
          pole3 >= tolMin &&
          pole3 <= tolMax;
        const newResult = allWithinRange ? "PASS" : "FAIL";
        if (newResult !== test.result) updates.result = newResult;
      }

      if (Object.keys(updates).length > 0) {
        hasChanges = true;
        return { ...test, ...updates };
      }
      return test;
    });

    if (hasChanges) {
      setFormData((prev) => ({
        ...prev,
        currentSensing: {
          ...prev.currentSensing,
          tests: updatedTests,
        },
      }));
    }
  }, [
    formData.currentSensing.testType,
    formData.currentSensing.tests
      .map(
        (t) =>
          `${t.function}-${t.settingAmpere}-${t.multiplierMin}-${t.multiplierMax}-${t.pole1}-${t.pole2}-${t.pole3}-${t.toleranceMin}-${t.toleranceMax}`,
      )
      .join(","),
  ]);

  // Calculate contact resistance deviation and result
  const calculateContactResistance = () => {
    const { pole1, pole2, pole3 } = formData.contactResistance;
    const p1 = parseFloat(pole1) || 0;
    const p2 = parseFloat(pole2) || 0;
    const p3 = parseFloat(pole3) || 0;

    if (p1 === 0 && p2 === 0 && p3 === 0) {
      return { deviation: "-", result: "-" };
    }

    const values = [p1, p2, p3].filter((v) => v > 0);
    if (values.length < 2) {
      return { deviation: "-", result: "-" };
    }

    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const deviation = (maxVal / minVal - 1) * 100;
    const result = deviation > 50 ? "FAIL" : "PASS";

    return {
      deviation: `${deviation.toFixed(1)}%`,
      result,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const contactResResults = calculateContactResistance();

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/*
        REMEMBERING FEATURE - CSS to Hide Datalist Arrow

        This global style tag removes the default browser dropdown arrow that appears
        on HTML5 datalist inputs. The arrow removal provides a cleaner appearance while
        maintaining full autocomplete functionality.

        HOW IT WORKS:
        - Targets the substation input field specifically via the list attribute selector
        - Uses multiple CSS pseudo-elements to target different browser implementations:
          * ::-webkit-calendar-picker-indicator (Chrome, Safari, Edge)
          * ::-webkit-list-button (WebKit browsers)
          * ::-ms-expand (Internet Explorer, older Edge)
        - Uses !important flags to override browser defaults
        - Hides the arrow through multiple methods (display: none, opacity: 0, visibility: hidden)
          to ensure compatibility across all browsers

        NOTE: The autocomplete dropdown functionality remains fully intact - only the
        visual arrow indicator is hidden. Users can still click in the input field
        and see suggestions as they type.
      */}
      <style>{`
        input[list="substation-options"]::-webkit-calendar-picker-indicator {
          display: none !important;
          opacity: 0 !important;
          position: absolute !important;
          right: -9999px !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          visibility: hidden !important;
        }
        input[list="substation-options"]::-webkit-list-button {
          display: none !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          visibility: hidden !important;
        }
        input[list="substation-options"] {
          background-image: none !important;
        }
        input[list="substation-options"]::-ms-expand {
          display: none !important;
        }
      `}</style>
      {/* Print Header - Only visible when printing */}
      <div
        className="print:flex hidden items-center justify-between pb-4 mb-6 relative"
        style={{
          overflow: "visible",
          paddingLeft: "0.5rem",
          paddingRight: "0.5rem",
        }}
      >
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40, flexShrink: 0 }}
        />
        <div
          className="flex-1 text-center flex flex-col items-center justify-center"
          style={{
            overflow: "visible",
            minWidth: 0,
            paddingLeft: "0.5rem",
            paddingRight: "0.5rem",
          }}
        >
          <h1
            className="text-2xl font-bold text-black mb-1"
            style={{
              overflow: "visible",
              textOverflow: "clip",
              whiteSpace: "normal",
              width: "100%",
            }}
          >
            LV Circuit Breaker ATS 25
          </h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c" }}
        >
          NETA - ATS {getSectionNumber(formData.breakerType)}
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
                border:
                  formData.status === "PASS"
                    ? "2px solid #16a34a"
                    : formData.status === "FAIL"
                      ? "2px solid #dc2626"
                      : "2px solid #ca8a04",
                backgroundColor:
                  formData.status === "PASS"
                    ? "#22c55e"
                    : formData.status === "FAIL"
                      ? "#ef4444"
                      : "#eab308",
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

      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 mb-4">
            {error}
          </div>
        )}

        <ReportHeader
          title={`${getSectionNumber(formData.breakerType)} LV Circuit Breaker ATS 25`}
          isAutoSaving={isAutoSaving}
          isEditing={isEditing}
          justSaved={justSaved}
          isSaving={isSaving}
          status={formData.status}
          hasReport={!!currentReportId}
          onStatusToggle={() => {
            if (isEditing) {
              const nextStatus =
                formData.status === "PASS"
                  ? "FAIL"
                  : formData.status === "FAIL"
                    ? "LIMITED SERVICE"
                    : "PASS";
              setFormData((prev) => ({ ...prev, status: nextStatus }));
            }
          }}
          onSave={handleSave}
          onSaveAndClose={handleSaveAndClose}
          onEdit={() => setIsEditing(true)}
          onBack={() => navigate(`/jobs/${jobId}`)}
          onPrint={() => window.print()}
          isPrintMode={isPrintMode}
        />
        {isEditing && (
          <div className="print:hidden mb-6 flex justify-end">
            <div className="flex flex-col items-center">
              <span
                className={`text-[10px] font-medium mb-0.5 ${formData.irDlroOnly ? "text-purple-600 dark:text-purple-400" : "text-neutral-500 dark:text-neutral-400"}`}
              >
                {formData.irDlroOnly ? "Enabled" : "Disabled"}
              </span>
              <button
                onClick={() => handleChange("irDlroOnly", !formData.irDlroOnly)}
                disabled={!isEditing}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  formData.irDlroOnly
                    ? "bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500"
                    : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 focus:ring-neutral-400 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                }`}
              >
                IR & DLRO Only
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* --- Job Information Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            {/* On-screen only: row1 = Customer, Address, Job#, Technicians, Date; row2 = Breaker, Sub, Eqpt Ident, Circuit, User; row3 = Temp, Celsius, Humidity, TCF; print uses table below */}
            <div className="grid grid-cols-5 gap-x-10 gap-y-5 print:hidden">
              <div className="flex flex-col min-w-0">
                <label className="form-label">Customer:</label>
                <input
                  type="text"
                  value={maskCustomerName(formData.customer)}
                  readOnly
                  className="form-input bg-neutral-100 dark:bg-dark-150 w-full min-w-0"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">Address:</label>
                <input
                  type="text"
                  value={maskCustomerAddress(formData.address)}
                  onChange={(e) => handleChange("address", e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full min-w-0 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">Job #:</label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  readOnly
                  className="form-input bg-neutral-100 dark:bg-dark-150 w-full"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">Technicians:</label>
                <input
                  type="text"
                  value={formData.technicians}
                  onChange={(e) => handleChange("technicians", e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">Date:</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange("date", e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              {/*
                REMEMBERING FEATURE - Breaker Identifier Field
                This input uses the HTML5 'list' attribute to connect to a <datalist> element
                that provides autocomplete suggestions from past entries.
                - list="breaker-identifier-options" connects to the datalist below
                - onBlur saves the value to localStorage when user leaves the field
                - Past values are loaded from localStorage on component mount
              */}
              <div className="flex flex-col min-w-0">
                <label className="form-label">Breaker Identifier:</label>
                <input
                  type="text"
                  value={formData.breakerIdentifier}
                  onChange={(e) =>
                    handleChange("breakerIdentifier", e.target.value)
                  }
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      saveToRemember(
                        "identifiers",
                        e.target.value,
                        setPastBreakerIdentifiers,
                      );
                    }
                  }}
                  list="breaker-identifier-options"
                  readOnly={!isEditing}
                  className={`form-input w-full min-w-0 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              {/*
                REMEMBERING FEATURE - Substation Field
                This input uses the HTML5 'list' attribute to connect to a <datalist> element
                that provides autocomplete suggestions from past entries.
                - list="substation-options" connects to the datalist below
                - onBlur saves the value to localStorage when user leaves the field
                - Past values are loaded from localStorage on component mount
                - CSS styles remove the default browser dropdown arrow for cleaner appearance
              */}
              <div className="flex flex-col min-w-0">
                <label className="form-label">Substation:</label>
                <input
                  type="text"
                  value={formData.substation}
                  onChange={(e) => handleChange("substation", e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      saveToRemember(
                        "substations",
                        e.target.value,
                        setPastSubstations,
                      );
                    }
                  }}
                  list="substation-options"
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "textfield",
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">Eqpt. Identifier:</label>
                <input
                  type="text"
                  value={formData.eqptIdentifier}
                  onChange={(e) =>
                    handleChange("eqptIdentifier", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full min-w-0 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">Circuit / Cell No.:</label>
                <input
                  type="text"
                  value={formData.circuitCellNo}
                  onChange={(e) =>
                    handleChange("circuitCellNo", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full min-w-0 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="form-label">User:</label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) => handleChange("user", e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full min-w-0 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              {/* Bottom row: Temp, Celsius, Humidity, TCF — 4 wide inside full row */}
              <div className="col-span-5 grid grid-cols-4 gap-x-10 gap-y-0 pt-1">
                <div className="flex flex-col min-w-0">
                  <label className="form-label">Temp:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={
                        formData.temperature.fahrenheit === 0
                          ? ""
                          : formData.temperature.fahrenheit || ""
                      }
                      onChange={handleFahrenheitChange}
                      readOnly={!isEditing}
                      className={`form-input w-10 text-sm py-1 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                    <span className="text-xs">°F</span>
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <label className="form-label">Celsius:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={
                        formData.temperature.celsius === 0
                          ? ""
                          : formData.temperature.celsius || ""
                      }
                      onChange={handleCelsiusChange}
                      readOnly={!isEditing}
                      className={`form-input w-10 text-sm py-1 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                    <span className="text-xs">°C</span>
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <label className="form-label">Humidity:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={formData.temperature.humidity || ""}
                      onChange={(e) =>
                        handleChange(
                          "temperature.humidity",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      readOnly={!isEditing}
                      className={`form-input w-10 text-sm py-1 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                    <span className="text-xs">%</span>
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <label className="form-label">TCF:</label>
                  <input
                    type="number"
                    value={formData.temperature.tcf}
                    readOnly
                    className="form-input bg-neutral-100 dark:bg-dark-150 w-10 text-sm py-1"
                  />
                </div>
              </div>
            </div>

            {/* Print-only compact job info table - Customer & Address wide; Temp, TCF, Job#, Humidity, Tech, Substation narrow */}
            <div className="hidden print:block">
              <table className="w-full border-collapse border border-neutral-300 print:border-black table-fixed">
                <colgroup>
                  <col style={{ width: "35%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "30%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Customer:</div>
                      <div className="mt-0.5 text-xs break-words">
                        {maskCustomerName(formData.customer)}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Temp:</div>
                      <div className="mt-0.5 text-xs">{`${formData.temperature.fahrenheit}°F (${formData.temperature.celsius}°C)`}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Job #:</div>
                      <div className="mt-0.5 text-xs">{formData.jobNumber}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Technicians:</div>
                      <div className="mt-0.5 text-xs">
                        {formData.technicians}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Date:</div>
                      <div className="mt-0.5 text-xs">
                        {formData.date
                          ? new Date(
                              formData.date + "T00:00:00",
                            ).toLocaleDateString()
                          : ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Breaker ID:</div>
                      <div className="mt-0.5 text-xs">
                        {formData.breakerIdentifier}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Address:</div>
                      <div className="mt-0.5 text-xs break-words">
                        {maskCustomerAddress(
                          normalizeAddress(formData.address),
                        )}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">TCF:</div>
                      <div className="mt-0.5 text-xs">
                        {formData.temperature.tcf}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Humidity:</div>
                      <div className="mt-0.5 text-xs">{`${formData.temperature.humidity}%`}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Substation:</div>
                      <div className="mt-0.5 text-xs">
                        {formData.substation}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">
                        Eqpt. Identifier:
                      </div>
                      <div className="mt-0.5 text-xs">
                        {formData.eqptIdentifier}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold text-xs">Circuit/Cell:</div>
                      <div className="mt-0.5 text-xs">
                        {formData.circuitCellNo}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Nameplate Data Section --- */}
          <div className="mb-6">
            <div className="print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Nameplate Data
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Manufacturer:</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) =>
                      handleChange("manufacturer", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Catalog Number:</label>
                  <input
                    type="text"
                    value={formData.catalogNumber}
                    onChange={(e) =>
                      handleChange("catalogNumber", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number:</label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) =>
                      handleChange("serialNumber", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Breaker Type:</label>
                  <select
                    value={formData.breakerType}
                    onChange={(e) =>
                      handleChange("breakerType", e.target.value)
                    }
                    disabled={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {breakerTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Trip Unit Type:</label>
                  <input
                    type="text"
                    value={formData.tripUnitType}
                    onChange={(e) =>
                      handleChange("tripUnitType", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Frame Size (A):</label>
                  <input
                    type="text"
                    value={formData.frameSize}
                    onChange={(e) => handleChange("frameSize", e.target.value)}
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Rating Plug (A):</label>
                  <input
                    type="text"
                    value={formData.ratingPlug}
                    onChange={(e) => handleChange("ratingPlug", e.target.value)}
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Rated Voltage (V):</label>
                  <select
                    value={formData.ratedVoltage}
                    onChange={(e) =>
                      handleChange("ratedVoltage", e.target.value)
                    }
                    disabled={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {ratedVoltageOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Operating Voltage (V):</label>
                  <input
                    type="text"
                    value={formData.operatingVoltage}
                    onChange={(e) =>
                      handleChange("operatingVoltage", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">I.C. Rating (kA):</label>
                  <input
                    type="text"
                    value={formData.icRating}
                    onChange={(e) => handleChange("icRating", e.target.value)}
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Curve No.:</label>
                  <input
                    type="text"
                    value={formData.curveNo}
                    onChange={(e) => handleChange("curveNo", e.target.value)}
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Operation:</label>
                  <select
                    value={formData.operation}
                    onChange={(e) => handleChange("operation", e.target.value)}
                    disabled={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {operationOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Mounting:</label>
                  <select
                    value={formData.mounting}
                    onChange={(e) => handleChange("mounting", e.target.value)}
                    disabled={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {mountingOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Zone Interlock:</label>
                  <select
                    value={formData.zoneInterlock}
                    onChange={(e) =>
                      handleChange("zoneInterlock", e.target.value)
                    }
                    disabled={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {zoneInterlockOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Thermal Memory:</label>
                  <select
                    value={formData.thermalMemory}
                    onChange={(e) =>
                      handleChange("thermalMemory", e.target.value)
                    }
                    disabled={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {thermalMemoryOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || "Select..."}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Print-only nameplate table */}
            <div className="hidden print:block print:mt-2">
              <h2 className="text-xl font-semibold mb-2 text-black border-b border-black pb-2 font-bold">
                Nameplate Data
              </h2>
              <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black text-[0.85rem]">
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Manufacturer:</div>
                      <div>{formData.manufacturer}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Catalog No.:</div>
                      <div>{formData.catalogNumber}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div>{formData.serialNumber}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Breaker Type:</div>
                      <div>{formData.breakerType}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Trip Unit Type:</div>
                      <div>{formData.tripUnitType}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Frame Size (A):</div>
                      <div>{formData.frameSize}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Rating Plug (A):</div>
                      <div>{formData.ratingPlug}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Rated Voltage:</div>
                      <div>{formData.ratedVoltage}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Operating Voltage:</div>
                      <div>{formData.operatingVoltage}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">I.C. Rating (kA):</div>
                      <div>{formData.icRating}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Curve No.:</div>
                      <div>{formData.curveNo}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Operation:</div>
                      <div>{formData.operation}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Mounting:</div>
                      <div>{formData.mounting}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Zone Interlock:</div>
                      <div>{formData.zoneInterlock}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Thermal Memory:</div>
                      <div>{formData.thermalMemory}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Visual and Mechanical Inspection Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
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
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      NETA Section
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Description
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                        {item.id}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                        {item.description}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                        <div className="print:hidden">
                          <select
                            value={item.result}
                            onChange={(e) =>
                              handleChange(
                                `visualInspectionItems.${index}.result`,
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            <option value=""></option>
                            {visualInspectionResultsOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {item.result || ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Device Settings Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Device Settings
            </h2>

            {/* Trip Type */}
            <div className="mb-4 flex items-center gap-4">
              <label className="form-label mb-0">Trip Type:</label>
              <select
                value={formData.tripType}
                onChange={(e) => handleChange("tripType", e.target.value)}
                disabled={!isEditing}
                className={`form-input w-32 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                {tripTypeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt || "Select..."}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              // Helper function to determine which functions to show and which columns they need
              const getTripTypeConfig = (tripType: string) => {
                const config: {
                  functions: Array<{
                    name:
                      | "longTime"
                      | "shortTime"
                      | "thermal"
                      | "magnetic"
                      | "instantaneous"
                      | "groundFault";
                    showSetting: boolean;
                    showDelay: boolean;
                    showI2t: boolean;
                  }>;
                  showSettingColumn: boolean;
                  showDelayColumn: boolean;
                  showI2tColumn: boolean;
                } = {
                  functions: [],
                  showSettingColumn: false,
                  showDelayColumn: false,
                  showI2tColumn: false,
                };

                switch (tripType) {
                  // Electronic Trip Types
                  case "LI":
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "instantaneous",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = false;
                    break;
                  case "LS":
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "shortTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "LSI":
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "shortTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                      {
                        name: "instantaneous",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "LIG":
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "instantaneous",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "groundFault",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "LSG":
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "shortTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                      {
                        name: "groundFault",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "LSIG":
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "shortTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                      {
                        name: "instantaneous",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "groundFault",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "G":
                    config.functions = [
                      {
                        name: "groundFault",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  // Thermal-Magnetic Trip Types — only Thermal and Magnetic (no Instantaneous or Ground Fault)
                  case "TMF":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "TMD":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "TMA":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "TF":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: false,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "TA":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: false,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "MF":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: false,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  case "MA":
                    config.functions = [
                      {
                        name: "thermal",
                        showSetting: false,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "magnetic",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                    break;
                  default:
                    // Default: show all electronic trip functions
                    config.functions = [
                      {
                        name: "longTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: false,
                      },
                      {
                        name: "shortTime",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                      {
                        name: "instantaneous",
                        showSetting: true,
                        showDelay: false,
                        showI2t: false,
                      },
                      {
                        name: "groundFault",
                        showSetting: true,
                        showDelay: true,
                        showI2t: true,
                      },
                    ];
                    config.showSettingColumn = true;
                    config.showDelayColumn = true;
                    config.showI2tColumn = true;
                }

                return config;
              };

              const tripConfig = getTripTypeConfig(formData.tripType);
              const functionLabels: { [key: string]: string } = {
                longTime: "Long Time",
                shortTime: "Short Time",
                thermal: "Thermal",
                magnetic: "Magnetic",
                instantaneous: "Instantaneous",
                groundFault: "Ground Fault",
              };

              const renderTable = (settingType: "asFound" | "asLeft") => (
                <div>
                  <h3 className="text-lg font-medium mb-2 text-center dark:text-white">
                    Settings As {settingType === "asFound" ? "Found" : "Left"}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                      <thead className="bg-neutral-50 dark:bg-dark-150">
                        <tr>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                            Function
                          </th>
                          {tripConfig.showSettingColumn && (
                            <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                              Setting
                            </th>
                          )}
                          {tripConfig.showDelayColumn && (
                            <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                              Delay
                            </th>
                          )}
                          {tripConfig.showI2tColumn && (
                            <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                              I²t
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-dark-150">
                        {tripConfig.functions.map((funcConfig) => {
                          const func = funcConfig.name;

                          // Base visibility from config
                          let showSetting = funcConfig.showSetting;
                          let showDelay = funcConfig.showDelay;
                          let showI2t = funcConfig.showI2t;
                          let useTextI2t = false;
                          const skipRow = false;

                          // Special handling for TMD rows (thermal-magnetic: only thermal + magnetic)
                          if (formData.tripType === "TMD") {
                            if (func === "thermal") {
                              showSetting = true;
                              showDelay = true;
                              showI2t = false;
                            }
                            if (func === "magnetic") {
                              showSetting = true;
                              showDelay = false;
                              showI2t = false;
                            }
                          }

                          // Special handling for TMA rows (thermal-magnetic: only thermal + magnetic, no delay)
                          if (formData.tripType === "TMA") {
                            if (
                              func === "thermal" &&
                              settingType === "asLeft"
                            ) {
                              showSetting = true;
                              showDelay = false;
                              showI2t = false;
                            }
                            if (func === "magnetic") {
                              showSetting = true;
                              showDelay = false;
                              showI2t = false;
                            }
                          }

                          // Special handling for TF rows (thermal-magnetic: only thermal + magnetic)
                          if (formData.tripType === "TF") {
                            if (
                              func === "thermal" &&
                              settingType === "asLeft"
                            ) {
                              showSetting = true;
                              showDelay = false;
                              showI2t = false;
                            }
                            if (func === "magnetic") {
                              showSetting = false;
                              showDelay = false;
                              showI2t = false;
                            }
                          }

                          // Special handling for TA rows (thermal-magnetic: only thermal + magnetic)
                          if (formData.tripType === "TA") {
                            if (func === "thermal") {
                              showSetting = true;
                              showDelay = true;
                              showI2t = false;
                            }
                            if (func === "magnetic") {
                              showSetting = false;
                              showDelay = false;
                              showI2t = false;
                            }
                          }

                          // Special handling for MF rows (thermal-magnetic: only thermal + magnetic)
                          if (formData.tripType === "MF") {
                            if (func === "thermal") {
                              showSetting = false;
                              showDelay = false;
                              showI2t = false;
                            }
                            if (func === "magnetic") {
                              showSetting = true;
                              showDelay = false;
                              showI2t = false;
                            }
                          }

                          // For all thermal-magnetic trip types, any visible I²t field should be a free-text box
                          const thermalMagneticTripTypes = [
                            "TMF",
                            "TMD",
                            "TMA",
                            "TF",
                            "TA",
                            "MF",
                            "MA",
                          ];
                          if (
                            thermalMagneticTripTypes.includes(
                              formData.tripType,
                            ) &&
                            showI2t
                          ) {
                            useTextI2t = true;
                          }

                          if (skipRow) {
                            return null;
                          }

                          return (
                            <tr key={`${settingType}-${func}`}>
                              <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                                {functionLabels[func]}
                              </td>
                              {tripConfig.showSettingColumn && (
                                <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                                  {showSetting ? (
                                    <input
                                      type="text"
                                      value={
                                        formData.deviceSettings[settingType][
                                          func
                                        ]?.setting || ""
                                      }
                                      onChange={(e) =>
                                        handleChange(
                                          `deviceSettings.${settingType}.${func}.setting`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${
                                        !isEditing ? "bg-neutral-100" : ""
                                      }`}
                                    />
                                  ) : (
                                    <div className="w-full p-1 text-center text-neutral-400">
                                      -
                                    </div>
                                  )}
                                </td>
                              )}
                              {tripConfig.showDelayColumn && (
                                <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                                  {showDelay ? (
                                    <input
                                      type="text"
                                      value={
                                        formData.deviceSettings[settingType][
                                          func
                                        ]?.delay || ""
                                      }
                                      onChange={(e) =>
                                        handleChange(
                                          `deviceSettings.${settingType}.${func}.delay`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${
                                        !isEditing ? "bg-neutral-100" : ""
                                      }`}
                                    />
                                  ) : (
                                    <div className="w-full p-1 text-center text-neutral-400">
                                      -
                                    </div>
                                  )}
                                </td>
                              )}
                              {tripConfig.showI2tColumn && (
                                <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                                  {showI2t ? (
                                    useTextI2t ? (
                                      <input
                                        type="text"
                                        value={
                                          formData.deviceSettings[settingType][
                                            func
                                          ]?.i2t || ""
                                        }
                                        onChange={(e) =>
                                          handleChange(
                                            `deviceSettings.${settingType}.${func}.i2t`,
                                            e.target.value,
                                          )
                                        }
                                        readOnly={!isEditing}
                                        className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${
                                          !isEditing ? "bg-neutral-100" : ""
                                        }`}
                                      />
                                    ) : (
                                      <select
                                        value={
                                          formData.deviceSettings[settingType][
                                            func
                                          ]?.i2t || ""
                                        }
                                        onChange={(e) =>
                                          handleChange(
                                            `deviceSettings.${settingType}.${func}.i2t`,
                                            e.target.value,
                                          )
                                        }
                                        disabled={!isEditing}
                                        className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${
                                          !isEditing
                                            ? "bg-neutral-100"
                                            : "bg-white"
                                        }`}
                                      >
                                        {i2tOptions.map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt || "-"}
                                          </option>
                                        ))}
                                      </select>
                                    )
                                  ) : (
                                    <div className="w-full p-1 text-center text-neutral-400">
                                      -
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );

              return (
                <div className="grid grid-cols-1">
                  {renderTable("asLeft")}
                </div>
              );
            })()}

            {/* Coordination Study - Screen Version */}
            <div className="mt-4 print:hidden">
              <h3 className="text-md font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                Coordination Study
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">No./ID.:</label>
                  <input
                    type="text"
                    value={formData.deviceSettings.coordinationStudy.noId}
                    onChange={(e) =>
                      handleChange(
                        "deviceSettings.coordinationStudy.noId",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Rev.:</label>
                  <input
                    type="text"
                    value={formData.deviceSettings.coordinationStudy.rev}
                    onChange={(e) =>
                      handleChange(
                        "deviceSettings.coordinationStudy.rev",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Date:</label>
                  <input
                    type="date"
                    value={formData.deviceSettings.coordinationStudy.date}
                    onChange={(e) =>
                      handleChange(
                        "deviceSettings.coordinationStudy.date",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </div>
            {/* Coordination Study - Print Version */}
            <div className="mt-4 hidden print:block">
              <h3 className="text-md font-semibold text-black mb-2">
                Coordination Study
              </h3>
              <table className="border-collapse border border-neutral-300 print:border-black">
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">No./ID.:</div>
                      <div>
                        {formData.deviceSettings.coordinationStudy.noId || "-"}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Rev.:</div>
                      <div>
                        {formData.deviceSettings.coordinationStudy.rev || "-"}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black">
                      <div className="font-semibold">Date:</div>
                      <div>
                        {formData.deviceSettings.coordinationStudy.date || "-"}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Electrical Tests - Contact/Pole Resistance Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Contact/Pole Resistance
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={4}
                    >
                      Resistance Measurements
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={2}
                    >
                      Value Deviation
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Result
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Pole 1
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Pole 2
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Pole 3
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Units
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Measured
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Criteria
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      -
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                      <input
                        type="text"
                        value={formData.contactResistance.pole1}
                        onChange={(e) =>
                          handleChange(
                            "contactResistance.pole1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                      <input
                        type="text"
                        value={formData.contactResistance.pole2}
                        onChange={(e) =>
                          handleChange(
                            "contactResistance.pole2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                      <input
                        type="text"
                        value={formData.contactResistance.pole3}
                        onChange={(e) =>
                          handleChange(
                            "contactResistance.pole3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                      <select
                        value={formData.contactResistance.units}
                        onChange={(e) =>
                          handleChange(
                            "contactResistance.units",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded text-center dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                      >
                        {contactResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm text-neutral-900 dark:text-white">
                      {contactResResults.deviation}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm text-neutral-900 dark:text-white">
                      &lt;50%
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center">
                      <span
                        className={`font-medium ${contactResResults.result === "PASS" ? "text-green-600 result-pass" : contactResResults.result === "FAIL" ? "text-red-600 result-fail" : "text-neutral-900 dark:text-white"}`}
                      >
                        {contactResResults.result}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Electrical Tests - Insulation Resistance Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Insulation Resistance
            </h2>

            {/* Header row with temperature, TCF, voltage, duration */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className="form-label">
                  Insulation Temperature (°F):
                </label>
                <input
                  type="number"
                  value={
                    formData.insulationResistance.temperature === 0
                      ? ""
                      : formData.insulationResistance.temperature || ""
                  }
                  onChange={handleInsulationTemperatureChange}
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="form-label">
                  Temperature Correction Factor:
                </label>
                <input
                  type="text"
                  value={formData.insulationResistance.tcf}
                  readOnly
                  className="form-input w-full bg-neutral-100 dark:bg-dark-150"
                />
              </div>
              <div>
                <label className="form-label">Test Voltage (V):</label>
                <select
                  value={formData.insulationResistance.testVoltage}
                  onChange={(e) =>
                    handleChange(
                      "insulationResistance.testVoltage",
                      e.target.value,
                    )
                  }
                  disabled={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                >
                  {insulationTestVoltageOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Test Duration:</label>
                <input
                  type="text"
                  value={formData.insulationResistance.testDuration}
                  onChange={(e) =>
                    handleChange(
                      "insulationResistance.testDuration",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>

            {/* Main Insulation Resistance Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600 text-xs table-fixed">
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                      rowSpan={2}
                    >
                      Test Points
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                      rowSpan={2}
                    >
                      Breaker
                      <br />
                      Position
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                      colSpan={3}
                    >
                      Measured Values
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                      colSpan={3}
                    >
                      Temperature Corrected
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                      rowSpan={2}
                    >
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      P1 (P1-P2)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      P2 (P2-P3)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      P3 (P3-P1)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      P1 (P1-P2)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      P2 (P2-P3)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      P3 (P3-P1)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs text-neutral-900 dark:text-white">
                      Pole to Pole
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs text-neutral-900 dark:text-white">
                      {formData.insulationResistance.poleToPole.breakerPosition}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.poleToPole.measured.p1
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToPole.measured.p1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.poleToPole.measured.p2
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToPole.measured.p2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.poleToPole.measured.p3
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToPole.measured.p3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.poleToPole.corrected
                          .p1 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.poleToPole.corrected
                          .p2 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.poleToPole.corrected
                          .p3 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-0 py-1">
                      <select
                        value={formData.insulationResistance.poleToPole.units}
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToPole.units",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      >
                        {insulationResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs text-neutral-900 dark:text-white">
                      Pole to Frame
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs text-neutral-900 dark:text-white">
                      {
                        formData.insulationResistance.poleToFrame
                          .breakerPosition
                      }
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.poleToFrame.measured.p1
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToFrame.measured.p1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.poleToFrame.measured.p2
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToFrame.measured.p2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.poleToFrame.measured.p3
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToFrame.measured.p3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.poleToFrame.corrected
                          .p1 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.poleToFrame.corrected
                          .p2 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.poleToFrame.corrected
                          .p3 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-0 py-1">
                      <select
                        value={formData.insulationResistance.poleToFrame.units}
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.poleToFrame.units",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      >
                        {insulationResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs text-neutral-900 dark:text-white">
                      Line to Load
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs text-neutral-900 dark:text-white">
                      {formData.insulationResistance.lineToLoad.breakerPosition}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.lineToLoad.measured.p1
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.lineToLoad.measured.p1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.lineToLoad.measured.p2
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.lineToLoad.measured.p2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.lineToLoad.measured.p3
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.lineToLoad.measured.p3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.lineToLoad.corrected
                          .p1 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.lineToLoad.corrected
                          .p2 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 bg-neutral-100 dark:bg-neutral-700">
                      <span className="block w-full p-1 text-center text-xs dark:text-white">
                        {formData.insulationResistance.lineToLoad.corrected
                          .p3 || "-"}
                      </span>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-0 py-1">
                      <select
                        value={formData.insulationResistance.lineToLoad.units}
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.lineToLoad.units",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`}
                      >
                        {insulationResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Criteria & Results Table */}
            <div className="mt-2">
              <table className="border-collapse border border-neutral-300 dark:border-neutral-600 text-xs">
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      Test Points
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                      colSpan={2}
                    >
                      Table 100.1 Criteria
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      Results
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"></th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      Value
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white">
                      Units
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs text-neutral-900 dark:text-white">
                      Pole to Pole
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-700">
                      {calculateInsulationCriteriaValue(
                        formData.insulationResistance.poleToPole.units,
                      ) || "-"}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white">
                      {formData.insulationResistance.poleToPole.units}
                    </td>
                    <td
                      className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium bg-neutral-100 dark:bg-neutral-700 ${calculateInsulationResult(formData.insulationResistance.poleToPole.corrected, calculateInsulationCriteriaValue(formData.insulationResistance.poleToPole.units)) === "PASS" ? "text-green-600 result-pass" : calculateInsulationResult(formData.insulationResistance.poleToPole.corrected, calculateInsulationCriteriaValue(formData.insulationResistance.poleToPole.units)) === "FAIL" ? "text-red-600 result-fail" : "text-neutral-900 dark:text-white"}`}
                    >
                      {calculateInsulationResult(
                        formData.insulationResistance.poleToPole.corrected,
                        calculateInsulationCriteriaValue(
                          formData.insulationResistance.poleToPole.units,
                        ),
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs text-neutral-900 dark:text-white">
                      Pole to Frame
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-700">
                      {calculateInsulationCriteriaValue(
                        formData.insulationResistance.poleToFrame.units,
                      ) || "-"}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white">
                      {formData.insulationResistance.poleToFrame.units}
                    </td>
                    <td
                      className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium bg-neutral-100 dark:bg-neutral-700 ${calculateInsulationResult(formData.insulationResistance.poleToFrame.corrected, calculateInsulationCriteriaValue(formData.insulationResistance.poleToFrame.units)) === "PASS" ? "text-green-600 result-pass" : calculateInsulationResult(formData.insulationResistance.poleToFrame.corrected, calculateInsulationCriteriaValue(formData.insulationResistance.poleToFrame.units)) === "FAIL" ? "text-red-600 result-fail" : "text-neutral-900 dark:text-white"}`}
                    >
                      {calculateInsulationResult(
                        formData.insulationResistance.poleToFrame.corrected,
                        calculateInsulationCriteriaValue(
                          formData.insulationResistance.poleToFrame.units,
                        ),
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs text-neutral-900 dark:text-white">
                      Line to Load
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-700">
                      {calculateInsulationCriteriaValue(
                        formData.insulationResistance.lineToLoad.units,
                      ) || "-"}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white">
                      {formData.insulationResistance.lineToLoad.units}
                    </td>
                    <td
                      className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium bg-neutral-100 dark:bg-neutral-700 ${calculateInsulationResult(formData.insulationResistance.lineToLoad.corrected, calculateInsulationCriteriaValue(formData.insulationResistance.lineToLoad.units)) === "PASS" ? "text-green-600 result-pass" : calculateInsulationResult(formData.insulationResistance.lineToLoad.corrected, calculateInsulationCriteriaValue(formData.insulationResistance.lineToLoad.units)) === "FAIL" ? "text-red-600 result-fail" : "text-neutral-900 dark:text-white"}`}
                    >
                      {calculateInsulationResult(
                        formData.insulationResistance.lineToLoad.corrected,
                        calculateInsulationCriteriaValue(
                          formData.insulationResistance.lineToLoad.units,
                        ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Electrical Tests - Current Sensing Section --- */}
          {!formData.irDlroOnly && (
            <div className="mb-6">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
                Electrical Tests - Current Sensing
              </h2>

              {/* Header row with Test Type, Tested Settings, and LTPU Indicator */}
              <div className="flex flex-wrap gap-4 mb-4 items-start">
                {/* Test Type */}
                <div className="flex-shrink-0">
                  <label className="form-label">Test Type</label>
                  <select
                    value={formData.currentSensing.testType}
                    onChange={(e) =>
                      handleChange("currentSensing.testType", e.target.value)
                    }
                    disabled={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    <option value="">Select...</option>
                    <option value="Primary Injection">Primary Injection</option>
                    <option value="Secondary Injection">
                      Secondary Injection
                    </option>
                  </select>
                </div>

                {/* Tested Settings Table */}
                <div className="flex-grow">
                  {(() => {
                    const thermalMagneticTypes = [
                      "TMF",
                      "TMD",
                      "TMA",
                      "TF",
                      "TA",
                      "MF",
                      "MA",
                    ];
                    const isThermalMagnetic = thermalMagneticTypes.includes(
                      formData.tripType,
                    );
                    const tripType = formData.tripType;

                    const disabledCellClass =
                      "bg-neutral-100 dark:bg-neutral-700";
                    const disabledSpan = (
                      <span className="block w-16 p-1 text-center text-xs text-neutral-400">
                        -
                      </span>
                    );
                    const inputClass = `w-16 p-1 border-0 text-center text-xs dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-50" : "bg-white"}`;

                    // Get configuration matching Device Settings As Found
                    const getRowConfig = () => {
                      // Returns: { row1, row2, row3, row4 } where each has: { label, showSetting, showDelay, showI2t, useTextI2t }
                      switch (tripType) {
                        case "LI":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                          };
                        case "LS":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                          };
                        case "LSI":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                          };
                        case "LIG":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                          };
                        case "LSG":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                          };
                        case "LSIG":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                          };
                        case "G":
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                          };
                        case "TMF":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        case "TMD":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        case "TMA":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        case "TF":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        case "TA":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        case "MF":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        case "MA":
                          return {
                            row1: {
                              label: "Thermal",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Magnetic",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: false,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                              showRow: false,
                            },
                          };
                        default:
                          return {
                            row1: {
                              label: "Long Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row2: {
                              label: "Short Time",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                            row3: {
                              label: "Instantaneous",
                              showSetting: true,
                              showDelay: false,
                              showI2t: false,
                              useTextI2t: false,
                            },
                            row4: {
                              label: "Ground Fault",
                              showSetting: true,
                              showDelay: true,
                              showI2t: true,
                              useTextI2t: false,
                            },
                          };
                      }
                    };

                    const rowConfig = getRowConfig();
                    const isRowDisabled = (row: any) =>
                      !row.showSetting && !row.showDelay && !row.showI2t;

                    const renderRow = (
                      row: any,
                      dataKey:
                        | "longTime"
                        | "shortTime"
                        | "instantaneous"
                        | "groundFault",
                    ) => {
                      const disabled = isRowDisabled(row);
                      const rowClass = disabled ? disabledCellClass : "";
                      return (
                        <tr key={dataKey} className={rowClass}>
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs ${rowClass}`}
                          >
                            {row.label}
                          </td>
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 ${!row.showSetting ? disabledCellClass : ""}`}
                          >
                            {row.showSetting ? (
                              <input
                                type="text"
                                value={
                                  formData.currentSensing.testedSettings[
                                    dataKey
                                  ].setting
                                }
                                onChange={(e) =>
                                  handleChange(
                                    `currentSensing.testedSettings.${dataKey}.setting`,
                                    e.target.value,
                                  )
                                }
                                readOnly={!isEditing}
                                className={inputClass}
                              />
                            ) : (
                              disabledSpan
                            )}
                          </td>
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 ${!row.showDelay ? disabledCellClass : ""}`}
                          >
                            {row.showDelay ? (
                              <input
                                type="text"
                                value={
                                  formData.currentSensing.testedSettings[
                                    dataKey
                                  ].delay
                                }
                                onChange={(e) =>
                                  handleChange(
                                    `currentSensing.testedSettings.${dataKey}.delay`,
                                    e.target.value,
                                  )
                                }
                                readOnly={!isEditing}
                                className={inputClass}
                              />
                            ) : (
                              disabledSpan
                            )}
                          </td>
                          <td
                            className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 ${!row.showI2t ? disabledCellClass : ""}`}
                          >
                            {row.showI2t ? (
                              row.useTextI2t ? (
                                <input
                                  type="text"
                                  value={
                                    formData.currentSensing.testedSettings[
                                      dataKey
                                    ].i2t
                                  }
                                  onChange={(e) =>
                                    handleChange(
                                      `currentSensing.testedSettings.${dataKey}.i2t`,
                                      e.target.value,
                                    )
                                  }
                                  readOnly={!isEditing}
                                  className={inputClass}
                                />
                              ) : (
                                <select
                                  value={
                                    formData.currentSensing.testedSettings[
                                      dataKey
                                    ].i2t
                                  }
                                  onChange={(e) =>
                                    handleChange(
                                      `currentSensing.testedSettings.${dataKey}.i2t`,
                                      e.target.value,
                                    )
                                  }
                                  disabled={!isEditing}
                                  className={inputClass}
                                >
                                  <option value="">-</option>
                                  {i2tOptions
                                    .filter((o) => o)
                                    .map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                </select>
                              )
                            ) : (
                              disabledSpan
                            )}
                          </td>
                        </tr>
                      );
                    };

                    return (
                      <table className="border-collapse border border-neutral-300 dark:border-neutral-600 text-xs">
                        <thead className="bg-neutral-50 dark:bg-dark-150">
                          <tr>
                            <th
                              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"
                              colSpan={4}
                            >
                              Tested Settings
                            </th>
                          </tr>
                          <tr>
                            <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"></th>
                            <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                              Setting
                            </th>
                            <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                              Delay
                            </th>
                            <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                              I2t
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-dark-150">
                          {renderRow(rowConfig.row1, "longTime")}
                          {renderRow(rowConfig.row2, "shortTime")}
                          {(rowConfig.row3 as { showRow?: boolean }).showRow !==
                            false && renderRow(rowConfig.row3, "instantaneous")}
                          {(rowConfig.row4 as { showRow?: boolean }).showRow !==
                            false && renderRow(rowConfig.row4, "groundFault")}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>

                {/* LTPU Indicator */}
                <div className="flex-shrink-0">
                  <label className="form-label">LTPU Indicator?</label>
                  <select
                    value={formData.currentSensing.ltpuIndicator}
                    onChange={(e) =>
                      handleChange(
                        "currentSensing.ltpuIndicator",
                        e.target.value,
                      )
                    }
                    disabled={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    <option value="">Select...</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
              </div>

              {/* Current Sensing Tests Tables - Side by Side - align at bottom so GFPU / A. row lines up */}
              <div className="flex flex-wrap gap-4 items-end">
                {/* Left Table: Settings */}
                <div className="overflow-x-auto">
                  <table className="border-collapse border border-neutral-300 dark:border-neutral-600 text-xs align-top">
                    <thead className="bg-neutral-50 dark:bg-dark-150">
                      {formData.currentSensing.testType ===
                      "Secondary Injection" ? (
                        <tr>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-24">
                            Function
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16">
                            Setting
                            <br />
                            Amperes
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16">
                            Test
                            <br />
                            Amperes
                          </th>
                        </tr>
                      ) : (
                        <>
                          <tr>
                            <th
                              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16"
                              rowSpan={2}
                            >
                              Function
                            </th>
                            <th
                              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16"
                              rowSpan={2}
                            >
                              Setting
                              <br />
                              Amperes
                            </th>
                            <th
                              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20"
                              rowSpan={2}
                            >
                              %<br />
                              Tolerance
                            </th>
                            <th
                              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16"
                              rowSpan={2}
                            >
                              Test
                              <br />
                              Amperes
                            </th>
                            <th
                              className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white"
                              colSpan={2}
                            >
                              Tolerance
                            </th>
                          </tr>
                          <tr>
                            <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16">
                              Min
                            </th>
                            <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16">
                              Max
                            </th>
                          </tr>
                        </>
                      )}
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150">
                      {formData.currentSensing.tests
                        .filter((test) => {
                          const thermalMagneticTypes = [
                            "TMF",
                            "TMD",
                            "TMA",
                            "TF",
                            "TA",
                            "MF",
                            "MA",
                          ];
                          const isThermalMagnetic =
                            thermalMagneticTypes.includes(formData.tripType);
                          // Thermal-magnetic: only show LTD and LTPU (Thermal and Magnetic)
                          if (isThermalMagnetic) {
                            const allowed: { [key: string]: string[] } = {
                              TMF: ["LTD", "LTPU"],
                              TMD: ["LTD", "LTPU"],
                              TMA: ["LTD", "LTPU"],
                              TF: ["LTD"],
                              TA: ["LTD"],
                              MF: ["LTPU"],
                              MA: ["LTPU"],
                            };
                            return (
                              allowed[formData.tripType]?.includes(
                                test.function,
                              ) ?? false
                            );
                          }
                          // For Secondary Injection (electronic), hide PU rows
                          if (
                            formData.currentSensing.testType ===
                              "Secondary Injection" &&
                            test.function.includes("PU")
                          ) {
                            return false;
                          }
                          return true;
                        })
                        .map((test) => {
                          const originalIndex =
                            formData.currentSensing.tests.findIndex(
                              (t) => t.function === test.function,
                            );
                          const thermalMagneticTypes = [
                            "TMF",
                            "TMD",
                            "TMA",
                            "TF",
                            "TA",
                            "MF",
                            "MA",
                          ];
                          const isThermalMagnetic =
                            thermalMagneticTypes.includes(formData.tripType);

                          // Determine if row is disabled based on trip type and test type
                          const isRowEnabled = (() => {
                            const tripType = formData.tripType;
                            const testType = formData.currentSensing.testType;
                            const func = test.function;

                            // Define enabled rows for each trip type
                            // For thermal-magnetic: LTD=THERMAL, LTPU=MAGNETIC
                            const primaryEnabled: { [key: string]: string[] } =
                              {
                                LI: ["LTD", "LTPU", "INST-PU"],
                                LS: ["LTD", "LTPU", "STD", "STPU"],
                                LSI: ["LTD", "LTPU", "STD", "STPU", "INST-PU"],
                                LIG: ["LTD", "LTPU", "INST-PU", "GFD", "GFPU"],
                                LSG: [
                                  "LTD",
                                  "LTPU",
                                  "STD",
                                  "STPU",
                                  "GFD",
                                  "GFPU",
                                ],
                                LSIG: [
                                  "LTD",
                                  "LTPU",
                                  "STD",
                                  "STPU",
                                  "INST-PU",
                                  "GFD",
                                  "GFPU",
                                ],
                                G: ["GFD", "GFPU"],
                                TMF: ["LTD", "LTPU"],
                                TMD: ["LTD", "LTPU"],
                                TMA: ["LTD", "LTPU"],
                                TF: ["LTD"],
                                TA: ["LTD"],
                                MF: ["LTPU"],
                                MA: ["LTPU"],
                              };

                            const secondaryEnabled: {
                              [key: string]: string[];
                            } = {
                              LI: ["LTD", "INST-D"],
                              LS: ["LTD", "STD"],
                              LSI: ["LTD", "STD", "INST-D"],
                              LIG: ["LTD", "INST-D", "GFD"],
                              LSG: ["LTD", "STD", "GFD"],
                              LSIG: ["LTD", "STD", "INST-D", "GFD"],
                              G: ["GFD"],
                              TMF: ["LTD", "LTPU"],
                              TMD: ["LTD", "LTPU"],
                              TMA: ["LTD", "LTPU"],
                              TF: ["LTD"],
                              TA: ["LTD"],
                              MF: ["LTPU"],
                              MA: ["LTPU"],
                            };

                            const enabledList =
                              testType === "Secondary Injection"
                                ? secondaryEnabled[tripType]
                                : primaryEnabled[tripType];

                            if (!enabledList) return true; // default all enabled if no config

                            // LTPU Indicator controls LTPU row
                            if (
                              func === "LTPU" &&
                              formData.currentSensing.ltpuIndicator !== "Yes"
                            ) {
                              return false;
                            }

                            return enabledList.includes(func);
                          })();

                          const isRowDisabled = !isRowEnabled;
                          const rowBgClass = isRowDisabled
                            ? "bg-neutral-200 dark:bg-neutral-700"
                            : "";
                          const cellBgClass = isRowDisabled
                            ? "bg-neutral-200 dark:bg-neutral-700"
                            : !isEditing
                              ? "bg-neutral-50"
                              : "bg-white";
                          const inputClass = `w-full h-6 p-1 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white ${cellBgClass}`;
                          const spanClass = `block w-full h-6 leading-6 text-center text-xs font-normal text-neutral-900 dark:text-white`;

                          // Display name for thermal-magnetic types
                          let displayName = test.function;
                          if (isThermalMagnetic) {
                            if (test.function === "LTD")
                              displayName = "Thermal";
                            if (test.function === "LTPU")
                              displayName = "Magnetic";
                          }

                          if (
                            formData.currentSensing.testType ===
                            "Secondary Injection"
                          ) {
                            // Use function codes directly, except Thermal for LTD in thermal-magnetic types
                            const secDisplayName =
                              isThermalMagnetic && test.function === "LTD"
                                ? "Thermal"
                                : test.function;
                            const secRowBgClass = isRowDisabled
                              ? "bg-neutral-200 dark:bg-neutral-700"
                              : "";
                            const secCellBgClass = isRowDisabled
                              ? "bg-neutral-200 dark:bg-neutral-700"
                              : !isEditing
                                ? "bg-neutral-50"
                                : "bg-white";
                            const secInputClass = `w-full h-6 p-1 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white ${secCellBgClass}`;

                            return (
                              <tr key={originalIndex} className={secRowBgClass}>
                                <td
                                  className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white font-medium ${secRowBgClass}`}
                                >
                                  {secDisplayName}
                                </td>
                                <td
                                  className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${secRowBgClass}`}
                                >
                                  {isRowDisabled ? (
                                    <span
                                      className={`${spanClass} text-neutral-400`}
                                    >
                                      -
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={test.settingAmpere}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.settingAmpere`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={secInputClass}
                                    />
                                  )}
                                </td>
                                <td
                                  className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${secRowBgClass}`}
                                >
                                  {isRowDisabled ? (
                                    <span
                                      className={`${spanClass} text-neutral-400`}
                                    >
                                      -
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={test.testAmpere}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.testAmpere`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={secInputClass}
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={originalIndex} className={rowBgClass}>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs text-neutral-900 dark:text-white font-medium ${rowBgClass}`}
                              >
                                {displayName}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${rowBgClass}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : (
                                  <input
                                    type="text"
                                    value={test.settingAmpere}
                                    onChange={(e) =>
                                      handleChange(
                                        `currentSensing.tests.${originalIndex}.settingAmpere`,
                                        e.target.value,
                                      )
                                    }
                                    readOnly={!isEditing}
                                    className={inputClass}
                                  />
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${rowBgClass}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : test.function.includes("PU") ? (
                                  <div className="flex items-center justify-center h-6">
                                    <input
                                      type="text"
                                      value={test.multiplierMin}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.multiplierMin`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-8 h-6 p-0 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white ${cellBgClass}`}
                                    />
                                    <span className="text-xs font-normal text-neutral-500 mx-0.5">
                                      |
                                    </span>
                                    <input
                                      type="text"
                                      value={test.multiplierMax}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.multiplierMax`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-8 h-6 p-0 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white ${cellBgClass}`}
                                    />
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={test.multiplierMin}
                                    onChange={(e) =>
                                      handleChange(
                                        `currentSensing.tests.${originalIndex}.multiplierMin`,
                                        e.target.value,
                                      )
                                    }
                                    readOnly={!isEditing}
                                    className={inputClass}
                                  />
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${rowBgClass} ${!isRowDisabled ? "bg-neutral-100 dark:bg-neutral-700" : ""}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : (
                                  <span className={spanClass}>
                                    {test.testAmpere || "-"}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${rowBgClass} ${["LTPU", "STPU", "INST-PU", "GFPU"].includes(test.function) && !isRowDisabled ? "bg-neutral-100 dark:bg-neutral-700" : ""}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : [
                                    "LTPU",
                                    "STPU",
                                    "INST-PU",
                                    "GFPU",
                                  ].includes(test.function) ? (
                                  <span className={spanClass}>
                                    {test.toleranceMin || "-"}
                                  </span>
                                ) : (
                                  <input
                                    type="text"
                                    value={test.toleranceMin}
                                    onChange={(e) =>
                                      handleChange(
                                        `currentSensing.tests.${originalIndex}.toleranceMin`,
                                        e.target.value,
                                      )
                                    }
                                    readOnly={!isEditing}
                                    className={inputClass}
                                  />
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${rowBgClass} ${["LTPU", "STPU", "INST-PU", "GFPU"].includes(test.function) && !isRowDisabled ? "bg-neutral-100 dark:bg-neutral-700" : ""}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : [
                                    "LTPU",
                                    "STPU",
                                    "INST-PU",
                                    "GFPU",
                                  ].includes(test.function) ? (
                                  <span className={spanClass}>
                                    {test.toleranceMax || "-"}
                                  </span>
                                ) : (
                                  <input
                                    type="text"
                                    value={test.toleranceMax}
                                    onChange={(e) =>
                                      handleChange(
                                        `currentSensing.tests.${originalIndex}.toleranceMax`,
                                        e.target.value,
                                      )
                                    }
                                    readOnly={!isEditing}
                                    className={inputClass}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Right Table: Poles & Results */}
                <div className="overflow-x-auto">
                  <table className="border-collapse border border-neutral-300 dark:border-neutral-600 text-xs align-top">
                    <thead className="bg-neutral-50 dark:bg-dark-150">
                      {formData.currentSensing.testType ===
                      "Secondary Injection" ? (
                        <tr>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20">
                            Pole 1
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20">
                            Pole 2
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20">
                            Pole 3
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16">
                            Results
                          </th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20">
                            Pole 1
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20">
                            Pole 2
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-20">
                            Pole 3
                          </th>
                          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-center text-xs font-medium text-neutral-900 dark:text-white w-16">
                            Results
                          </th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150">
                      {formData.currentSensing.tests
                        .filter((test) => {
                          const thermalMagneticTypes = [
                            "TMF",
                            "TMD",
                            "TMA",
                            "TF",
                            "TA",
                            "MF",
                            "MA",
                          ];
                          const isThermalMagnetic =
                            thermalMagneticTypes.includes(formData.tripType);
                          // Thermal-magnetic: only show LTD and LTPU (Thermal and Magnetic)
                          if (isThermalMagnetic) {
                            const allowed: { [key: string]: string[] } = {
                              TMF: ["LTD", "LTPU"],
                              TMD: ["LTD", "LTPU"],
                              TMA: ["LTD", "LTPU"],
                              TF: ["LTD"],
                              TA: ["LTD"],
                              MF: ["LTPU"],
                              MA: ["LTPU"],
                            };
                            return (
                              allowed[formData.tripType]?.includes(
                                test.function,
                              ) ?? false
                            );
                          }
                          // For Secondary Injection (electronic), hide PU rows
                          if (
                            formData.currentSensing.testType ===
                              "Secondary Injection" &&
                            test.function.includes("PU")
                          ) {
                            return false;
                          }
                          return true;
                        })
                        .map((test) => {
                          const originalIndex =
                            formData.currentSensing.tests.findIndex(
                              (t) => t.function === test.function,
                            );

                          // Same logic as left table
                          const isRowEnabled = (() => {
                            const tripType = formData.tripType;
                            const testType = formData.currentSensing.testType;
                            const func = test.function;

                            const primaryEnabled: { [key: string]: string[] } =
                              {
                                LI: ["LTD", "LTPU", "INST-PU"],
                                LS: ["LTD", "LTPU", "STD", "STPU"],
                                LSI: ["LTD", "LTPU", "STD", "STPU", "INST-PU"],
                                LIG: ["LTD", "LTPU", "INST-PU", "GFD", "GFPU"],
                                LSG: [
                                  "LTD",
                                  "LTPU",
                                  "STD",
                                  "STPU",
                                  "GFD",
                                  "GFPU",
                                ],
                                LSIG: [
                                  "LTD",
                                  "LTPU",
                                  "STD",
                                  "STPU",
                                  "INST-PU",
                                  "GFD",
                                  "GFPU",
                                ],
                                G: ["GFD", "GFPU"],
                                TMF: ["LTD", "LTPU"],
                                TMD: ["LTD", "LTPU"],
                                TMA: ["LTD", "LTPU"],
                                TF: ["LTD"],
                                TA: ["LTD"],
                                MF: ["LTPU"],
                                MA: ["LTPU"],
                              };

                            const secondaryEnabled: {
                              [key: string]: string[];
                            } = {
                              LI: ["LTD", "INST-D"],
                              LS: ["LTD", "STD"],
                              LSI: ["LTD", "STD", "INST-D"],
                              LIG: ["LTD", "INST-D", "GFD"],
                              LSG: ["LTD", "STD", "GFD"],
                              LSIG: ["LTD", "STD", "INST-D", "GFD"],
                              G: ["GFD"],
                              TMF: ["LTD", "LTPU"],
                              TMD: ["LTD", "LTPU"],
                              TMA: ["LTD", "LTPU"],
                              TF: ["LTD"],
                              TA: ["LTD"],
                              MF: ["LTPU"],
                              MA: ["LTPU"],
                            };

                            const enabledList =
                              testType === "Secondary Injection"
                                ? secondaryEnabled[tripType]
                                : primaryEnabled[tripType];

                            if (!enabledList) return true;

                            // LTPU Indicator controls LTPU row
                            if (
                              func === "LTPU" &&
                              formData.currentSensing.ltpuIndicator !== "Yes"
                            ) {
                              return false;
                            }

                            return enabledList.includes(func);
                          })();

                          const isRowDisabled = !isRowEnabled;
                          const rowBgClass = isRowDisabled
                            ? "bg-neutral-200 dark:bg-neutral-700"
                            : "";
                          const cellBgClass = isRowDisabled
                            ? "bg-neutral-200 dark:bg-neutral-700"
                            : !isEditing
                              ? "bg-neutral-50"
                              : "bg-white";
                          const poleUnit = test.function.includes("PU")
                            ? "A."
                            : "sec.";
                          const spanClass = `block w-full h-6 leading-6 text-center text-xs font-normal text-neutral-900 dark:text-white`;
                          return (
                            <tr key={originalIndex} className={rowBgClass}>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 ${rowBgClass}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-center h-6">
                                    <input
                                      type="text"
                                      value={test.pole1}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.pole1`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-10 h-6 p-0 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white print:hidden ${cellBgClass}`}
                                    />
                                    <span className="text-xs text-neutral-500 print:hidden ml-0.5">
                                      {poleUnit}
                                    </span>
                                    <span className="hidden print:block text-xs text-center">
                                      {test.pole1
                                        ? `${test.pole1} ${poleUnit}`
                                        : "-"}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 ${rowBgClass}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-center h-6">
                                    <input
                                      type="text"
                                      value={test.pole2}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.pole2`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-10 h-6 p-0 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white print:hidden ${cellBgClass}`}
                                    />
                                    <span className="text-xs text-neutral-500 print:hidden ml-0.5">
                                      {poleUnit}
                                    </span>
                                    <span className="hidden print:block text-xs text-center">
                                      {test.pole2
                                        ? `${test.pole2} ${poleUnit}`
                                        : "-"}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 ${rowBgClass}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-center h-6">
                                    <input
                                      type="text"
                                      value={test.pole3}
                                      onChange={(e) =>
                                        handleChange(
                                          `currentSensing.tests.${originalIndex}.pole3`,
                                          e.target.value,
                                        )
                                      }
                                      readOnly={!isEditing}
                                      className={`w-10 h-6 p-0 border-0 text-center text-xs font-normal dark:bg-dark-150 dark:text-white print:hidden ${cellBgClass}`}
                                    />
                                    <span className="text-xs text-neutral-500 print:hidden ml-0.5">
                                      {poleUnit}
                                    </span>
                                    <span className="hidden print:block text-xs text-center">
                                      {test.pole3
                                        ? `${test.pole3} ${poleUnit}`
                                        : "-"}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td
                                className={`border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center ${rowBgClass}`}
                              >
                                {isRowDisabled ? (
                                  <span
                                    className={`${spanClass} text-neutral-400`}
                                  >
                                    -
                                  </span>
                                ) : (
                                  <select
                                    value={test.result}
                                    onChange={(e) =>
                                      handleChange(
                                        `currentSensing.tests.${originalIndex}.result`,
                                        e.target.value,
                                      )
                                    }
                                    disabled={!isEditing}
                                    style={{
                                      textAlign: "center",
                                      textAlignLast: "center",
                                    }}
                                    className={`w-full h-6 p-0 border-0 text-xs font-normal dark:bg-dark-150 dark:text-white ${cellBgClass} ${test.result === "PASS" ? "text-green-600 result-pass" : test.result === "FAIL" ? "text-red-600 result-fail" : ""}`}
                                  >
                                    <option value="">-</option>
                                    <option value="PASS">PASS</option>
                                    <option value="FAIL">FAIL</option>
                                    <option value="N/A">N/A</option>
                                  </select>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- Test Equipment Used Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    {(
                      [
                        { key: "equipment" as const, label: "Equipment" },
                        { key: "name" as const, label: "Name/Model" },
                        {
                          key: "serialNumber" as const,
                          label: "Serial Number",
                        },
                        { key: "ampId" as const, label: "AMP ID" },
                        {
                          key: "calibrationDate" as const,
                          label: "Calibration Date",
                        },
                      ] as const
                    ).map(({ key, label }) => {
                      const isActive = testEquipmentSort?.column === key;
                      const direction = testEquipmentSort?.direction ?? "asc";
                      return (
                        <th
                          key={key}
                          className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-dark-200 print:cursor-default print:hover:bg-transparent"
                          onClick={() => {
                            setTestEquipmentSort((prev) =>
                              prev?.column === key
                                ? {
                                    column: key,
                                    direction:
                                      prev.direction === "asc" ? "desc" : "asc",
                                  }
                                : { column: key, direction: "asc" },
                            );
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setTestEquipmentSort((prev) =>
                                prev?.column === key
                                  ? {
                                      column: key,
                                      direction:
                                        prev.direction === "asc"
                                          ? "desc"
                                          : "asc",
                                    }
                                  : { column: key, direction: "asc" },
                              );
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {isActive && (
                              <span className="text-xs" aria-hidden>
                                {direction === "asc" ? "↑" : "↓"}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  {(() => {
                    const equipmentRows: Array<{
                      formKey:
                        | "digitalLowResistanceOhmmeter"
                        | "megohmmeter"
                        | "primaryInjectionTestSet";
                      equipmentLabel: string;
                      data: {
                        name: string;
                        serialNumber: string;
                        ampId: string;
                        calibrationDate: string;
                      };
                    }> = [
                      {
                        formKey: "digitalLowResistanceOhmmeter",
                        equipmentLabel: "Digital Low-Resistance Ohmmeter",
                        data: formData.testEquipment
                          .digitalLowResistanceOhmmeter,
                      },
                      {
                        formKey: "megohmmeter",
                        equipmentLabel: "Megohmmeter",
                        data: formData.testEquipment.megohmmeter,
                      },
                      {
                        formKey: "primaryInjectionTestSet",
                        equipmentLabel:
                          formData.currentSensing.testType ===
                          "Secondary Injection"
                            ? "Secondary Injection Test Set"
                            : "Primary Injection Test Set",
                        data: formData.testEquipment.primaryInjectionTestSet,
                      },
                    ];
                    const parseSortValue = (
                      row: (typeof equipmentRows)[0],
                      col: TestEquipmentSortColumn,
                    ): string | number => {
                      if (col === "equipment") return row.equipmentLabel;
                      if (col === "name") return row.data.name;
                      if (col === "serialNumber") return row.data.serialNumber;
                      if (col === "ampId") {
                        const v = (row.data.ampId || "").trim();
                        const num = Number(v);
                        return v === "" || Number.isNaN(num) ? v : num;
                      }
                      if (col === "calibrationDate") {
                        const s = (row.data.calibrationDate || "").trim();
                        if (!s) return 0;
                        const d = new Date(s);
                        return Number.isNaN(d.getTime()) ? s : d.getTime();
                      }
                      return "";
                    };
                    const compare = (
                      a: (typeof equipmentRows)[0],
                      b: (typeof equipmentRows)[0],
                    ): number => {
                      if (!testEquipmentSort) return 0;
                      const va = parseSortValue(a, testEquipmentSort.column);
                      const vb = parseSortValue(b, testEquipmentSort.column);
                      const mult =
                        testEquipmentSort.direction === "asc" ? 1 : -1;
                      if (typeof va === "number" && typeof vb === "number")
                        return mult * (va - vb);
                      return (
                        mult *
                        String(va).localeCompare(String(vb), undefined, {
                          numeric: true,
                        })
                      );
                    };
                    const sorted = [...equipmentRows].sort(compare);
                    return sorted.map((row) => (
                      <tr key={row.formKey}>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                          {row.equipmentLabel}
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                          <EquipmentAutocomplete
                            value={row.data.name}
                            onChange={(value) =>
                              handleChange(
                                `testEquipment.${row.formKey}.name`,
                                value,
                              )
                            }
                            onSelect={(equipment) => {
                              setFormData((p) => ({
                                ...p,
                                testEquipment: {
                                  ...p.testEquipment,
                                  [row.formKey]: {
                                    name: equipment.equipment_name,
                                    serialNumber: equipment.serial_number || "",
                                    ampId: equipment.amp_id || "",
                                    calibrationDate: formatLocalDateShort(
                                      equipment.calibration_date,
                                    ),
                                  },
                                },
                              }));
                            }}
                            readOnly={!isEditing}
                            className="w-full"
                          />
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                          <input
                            type="text"
                            value={row.data.serialNumber}
                            onChange={(e) =>
                              handleChange(
                                `testEquipment.${row.formKey}.serialNumber`,
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                          />
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                          <input
                            type="text"
                            value={row.data.ampId}
                            onChange={(e) =>
                              handleChange(
                                `testEquipment.${row.formKey}.ampId`,
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                          />
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1">
                          <input
                            type="text"
                            value={row.data.calibrationDate}
                            onChange={(e) =>
                              handleChange(
                                `testEquipment.${row.formKey}.calibrationDate`,
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-1 border border-neutral-300 dark:border-neutral-600 rounded dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100" : ""}`}
                            placeholder="MM/DD/YYYY"
                          />
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Comments Section --- */}
          <div
            className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments
            </h2>
            <textarea
              value={formData.comments}
              onChange={(e) => handleChange("comments", e.target.value)}
              readOnly={!isEditing}
              rows={4}
              className={`form-input w-full print:hidden ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              placeholder="Enter any comments or notes..."
            />
            {formData.comments?.trim() && (
              <div className="hidden print:block border border-neutral-300 print:border-black p-3 min-h-[4rem] text-sm text-neutral-900 print:text-black whitespace-pre-wrap">
                {formData.comments}
              </div>
            )}
          </div>

          {/* Function Legend and Trip Type Legend */}
          {!formData.irDlroOnly && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:break-inside-avoid">
              <div className="bg-neutral-50 dark:bg-dark-200 p-4 border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Function Legend
                </h3>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 grid grid-cols-3 gap-x-4 gap-y-1">
                  <div className="space-y-1">
                    <p>
                      <strong>LTD</strong> = Long Time Delay
                    </p>
                    <p>
                      <strong>LTPU</strong> = Long Time Pick-up
                    </p>
                    <p>
                      <strong>STD</strong> = Short Time Delay
                    </p>
                    <p>
                      <strong>STPU</strong> = Short Time Pick-up
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p>
                      <strong>INST-D</strong> = Instantaneous Delay
                    </p>
                    <p>
                      <strong>INST-PU</strong> = Instantaneous Pick-up
                    </p>
                    <p>
                      <strong>GFD</strong> = Ground Fault Delay
                    </p>
                    <p>
                      <strong>GFPU</strong> = Ground Fault Pick-up
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p>
                      <strong>Thermal</strong> = Overload protection element
                    </p>
                    <p>
                      <strong>Magnetic</strong> = Short circuit protection
                      element
                    </p>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2 mt-3">
                  I²t Options
                </h3>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                  <p>
                    <strong>On/Off</strong> = I²t Enabled/Disabled
                  </p>
                  <p>
                    <strong>In/Out</strong> = I²t In/Out of Circuit
                  </p>
                </div>
              </div>
              <div className="bg-neutral-50 dark:bg-dark-200 p-4 border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Trip Type Legend
                </h3>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="space-y-1">
                    <p>
                      <strong>LI</strong> = Long Time, Instantaneous
                    </p>
                    <p>
                      <strong>LS</strong> = Long Time, Short Time
                    </p>
                    <p>
                      <strong>LSI</strong> = Long Time, Short Time,
                      Instantaneous
                    </p>
                    <p>
                      <strong>LIG</strong> = Long Time, Instantaneous, Ground
                      Fault
                    </p>
                    <p>
                      <strong>LSG</strong> = Long Time, Short Time, Ground Fault
                    </p>
                    <p>
                      <strong>LSIG</strong> = Long Time, Short Time,
                      Instantaneous, Ground Fault
                    </p>
                    <p>
                      <strong>G</strong> = Ground Fault Only
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p>
                      <strong>TMF</strong> = Fixed Thermal, Fixed Magnetic
                    </p>
                    <p>
                      <strong>TMD</strong> = Adjustable Thermal, Fixed Magnetic
                    </p>
                    <p>
                      <strong>TMA</strong> = Fixed Thermal, Adjustable Magnetic
                    </p>
                    <p>
                      <strong>TF</strong> = Fixed Thermal
                    </p>
                    <p>
                      <strong>TA</strong> = Adjustable Thermal
                    </p>
                    <p>
                      <strong>MF</strong> = Fixed Magnetic
                    </p>
                    <p>
                      <strong>MA</strong> = Adjustable Magnetic
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Copy Nameplate Data Button */}
      {!isPrintMode && isEditing && (
        <div className="mb-4 print:hidden flex justify-center">
          <button
            onClick={copyNameplateDataToNewReport}
            className="px-6 py-3 text-base font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
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
            className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Mark Ready to Review
          </button>
        </div>
      )}

      {/*
        REMEMBERING FEATURE - HTML5 Datalist Elements

        These <datalist> elements provide the autocomplete dropdown functionality for the
        remembering feature. They are connected to their respective input fields via the
        'list' attribute on the inputs.

        HOW DATALIST WORKS:
        1. The <datalist> element has an 'id' attribute that matches the 'list' attribute
           on the input field (e.g., list="substation-options" connects to id="substation-options")
        2. Each <option> element inside the datalist represents a suggestion that appears
           in the dropdown when the user types
        3. The browser automatically filters and displays matching options as the user types
        4. Users can click on a suggestion to auto-fill the input field

        DATA SOURCE:
        - pastSubstations: Array loaded from localStorage key 'lv-breaker-substations'
        - pastBreakerIdentifiers: Array loaded from localStorage key 'lv-breaker-identifiers'
        - Both arrays are populated on component mount and updated when new values are saved
        - Maximum of 20 most recent values are stored per field

        STYLING:
        - CSS is applied globally to hide the default browser dropdown arrow
        - The arrow removal is handled in the <style> tag at the top of the component
        - This provides a cleaner appearance while maintaining full functionality
      */}
      <datalist id="substation-options">
        {pastSubstations.map((value, index) => (
          <option key={index} value={value} />
        ))}
      </datalist>
      <datalist id="breaker-identifier-options">
        {pastBreakerIdentifiers.map((value, index) => (
          <option key={index} value={value} />
        ))}
      </datalist>
    </ReportWrapper>
  );
};

export default LVMoldedCaseCircuitBreakerATS25Report;
