import React, { useState, useEffect } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useDemoMode } from "../../lib/DemoModeContext";
import { supabase } from "../../lib/supabase";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import { useReportLocked } from "./useReportLocked";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "../../components/equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "../../utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Add dropdown option constants
const INSPECTION_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

const INSULATION_RESISTANCE_UNITS = [
  { value: "kΩ", label: "kΩ" },
  { value: "MΩ", label: "MΩ" },
  { value: "GΩ", label: "GΩ" },
];

const INSULATION_TEST_VOLTAGES = ["250V", "500V", "1000V", "2500V", "5000V"];

const CONTACT_RESISTANCE_UNITS = [
  { value: "μΩ", label: "μΩ" },
  { value: "mΩ", label: "mΩ" },
  { value: "Ω", label: "Ω" },
];

const DIELECTRIC_WITHSTAND_UNITS = [
  { value: "μA", label: "μA" },
  { value: "mA", label: "mA" },
];

const VLF_WITHSTAND_TEST_VOLTAGES = [
  { rating: "5", voltage: "10" },
  { rating: "8", voltage: "13" },
  { rating: "15", voltage: "21" },
  { rating: "20", voltage: "26" },
  { rating: "25", voltage: "32" },
  { rating: "28", voltage: "36" },
  { rating: "30", voltage: "38" },
  { rating: "35", voltage: "44" },
  { rating: "46", voltage: "57" },
  { rating: "69", voltage: "84" },
];

const EQUIPMENT_EVALUATION_RESULTS = ["PASS", "FAIL", "LIMITED SERVICE"];

interface FormData {
  // Customer information
  customer: string;
  address: string;
  user: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  equipment: string;

  // Temperature data
  temperature: string;
  fahrenheit: boolean;
  tcf: number;
  humidity: string;

  // Nameplate data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  fedFrom: string;
  conductorMaterial: string;
  ratedVoltage: string;
  operatingVoltage: string;
  ampacity: string;

  // NETA section results
  netaResults: {
    [key: string]: string;
  };

  // Contact/Pole Resistance
  busResistance: {
    p1: string;
    p2: string;
    p3: string;
    neutral: string;
  };

  // Insulation Resistance
  testVoltage1: string;
  insulationResistance: {
    [key: string]: string;
  };
  correctedInsulationResistance: {
    [key: string]: string;
  };

  // Test Equipment
  megohmmeter: string;
  megohmSerial: string;
  megAmpId: string;
  megCalDate: string;
  lowResistanceOhmmeter: string;
  lowResistanceSerial: string;
  lowResistanceAmpId: string;
  lowResistanceCalDate: string;

  comments: string;

  // Overall status
  status: "PASS" | "FAIL" | "LIMITED SERVICE";

  // Add unit selection fields
  insulationResistanceUnit: string;
  contactResistanceUnit: string;
  dielectricWithstandUnit: string;

  // VLF withstand test fields
  cableRating: string;
  testVoltage: string;

  // Dielectric withstand test fields
  dielectricPhaseA: string;
  dielectricPhaseB: string;
  dielectricPhaseC: string;
}

// Add interface for the report data structure
interface ReportData {
  job_id: string;
  user_id: string;
  report_info: {
    customer: string;
    address: string;
    user: string;
    date: string;
    identifier: string;
    jobNumber: string;
    technicians: string;
    substation: string;
    equipment: string;

    temperature: string;
    fahrenheit: boolean;
    tcf: number;
    humidity: string;

    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    fedFrom: string;
    conductorMaterial: string;
    ratedVoltage: string;
    operatingVoltage: string;
    ampacity: string;

    netaResults: { [key: string]: string };
    busResistance: {
      p1: string;
      p2: string;
      p3: string;
      neutral: string;
    };

    testVoltage1: string;
    insulationResistance: { [key: string]: string };

    insulationResistanceUnit: string;
    contactResistanceUnit: string;

    megohmmeter: string;
    megohmSerial: string;
    megAmpId: string;
    megCalDate: string;
    lowResistanceOhmmeter: string;
    lowResistanceSerial: string;
    lowResistanceAmpId: string;
    lowResistanceCalDate: string;

    status: "PASS" | "FAIL" | "LIMITED SERVICE";
  };
  comments: string;
  created_at?: string;
  updated_at: string;
}

// Add TCF conversion table
const TCF_TABLE = {
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
  "20": 1.0,
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
  "35": 2.0,
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
  "55": 5.0,
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
  "70": 10.0,
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
  "85": 20.0,
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
  "100": 40.0,
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
} as const;

const MetalEnclosedBuswayReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    reportId,
  );

  useEffect(() => {
    setCurrentReportId(reportId);
  }, [reportId]);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Optional: hold raw row for debugging when ?debug=true
  const [rawRow, setRawRow] = useState<any>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [suggestedReports, setSuggestedReports] = useState<any[]>([]);

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = "metal-enclosed-busway"; // This component handles the metal-enclosed-busway route
  const reportName = getReportName(reportSlug);

  // Print Mode Detection
  const isPrintMode = searchParams.get("print") === "true";
  const { locked } = useReportLocked(reportId, jobId, reportSlug);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    // Customer information
    customer: "",
    address: "",
    user: "",
    date: "",
    identifier: "",
    jobNumber: "",
    technicians: "",
    substation: "",
    equipment: "",

    // Temperature data
    temperature: "",
    fahrenheit: true,
    tcf: 0.138,
    humidity: "",

    // Nameplate data
    manufacturer: "",
    catalogNumber: "",
    serialNumber: "",
    fedFrom: "",
    conductorMaterial: "",
    ratedVoltage: "",
    operatingVoltage: "",
    ampacity: "",

    // NETA section results
    netaResults: {
      "7.4.A.1": "",
      "7.4.A.2": "",
      "7.4.A.3": "",
      "7.4.A.4": "",
      "7.4.A.5.1": "",
      "7.4.A.6": "",
      "7.4.A.7": "",
      "7.4.A.8": "",
      "7.4.A.9": "",
    },

    // Contact/Pole Resistance
    busResistance: {
      p1: "",
      p2: "",
      p3: "",
      neutral: "",
    },

    // Insulation Resistance
    testVoltage1: "",
    insulationResistance: {
      "A-B": "",
      "B-C": "",
      "C-A": "",
      "A-N": "",
      "B-N": "",
      "C-N": "",
      "A-G": "",
      "B-G": "",
      "C-G": "",
      "N-G": "",
    },
    correctedInsulationResistance: {
      "A-B": "",
      "B-C": "",
      "C-A": "",
      "A-N": "",
      "B-N": "",
      "C-N": "",
      "A-G": "",
      "B-G": "",
      "C-G": "",
      "N-G": "",
    },

    // Test Equipment
    megohmmeter: "",
    megohmSerial: "",
    megAmpId: "",
    megCalDate: "",
    lowResistanceOhmmeter: "",
    lowResistanceSerial: "",
    lowResistanceAmpId: "",
    lowResistanceCalDate: "",

    comments: "",

    // Overall status
    status: "PASS",

    // Add unit selection fields
    insulationResistanceUnit: "MΩ",
    contactResistanceUnit: "μΩ",
    dielectricWithstandUnit: "mA",

    // VLF withstand test fields
    cableRating: "",
    testVoltage: "",

    // Dielectric withstand test fields
    dielectricPhaseA: "",
    dielectricPhaseB: "",
    dielectricPhaseC: "",
  });

  // Temperature conversion functions
  const convertFtoC = (f: string): string => {
    const fValue = parseFloat(f);
    if (isNaN(fValue)) return "";
    return (((fValue - 32) * 5) / 9).toFixed(1);
  };

  // Update getTCF function to use the lookup table
  const getTCF = (temp: string): number => {
    const tempValue = parseFloat(temp);
    if (isNaN(tempValue)) return 0.138;

    // Convert Fahrenheit to Celsius
    const tempC = Math.round(parseFloat(convertFtoC(temp))).toString();

    // If temperature is below table minimum, return lowest value
    if (parseInt(tempC) < -24) return 0.054;

    // If temperature is above table maximum, return highest value
    if (parseInt(tempC) > 110) return 63.2;

    // Return exact value from table
    return TCF_TABLE[tempC as keyof typeof TCF_TABLE] || 0.138;
  };

  // Handle temperature change
  useEffect(() => {
    if (formData.temperature) {
      const tcf = getTCF(formData.temperature);
      setFormData((prev) => ({ ...prev, tcf }));
    }
  }, [formData.temperature]);

  // Recalculate temperature-corrected insulation resistance values
  useEffect(() => {
    const keys = [
      "aToB",
      "bToC",
      "cToA",
      "aToN",
      "bToN",
      "cToN",
      "aToG",
      "bToG",
      "cToG",
      "nToG",
    ] as const;

    const parseReading = (
      value: string | number | undefined,
    ): number | null => {
      if (value === undefined || value === null) return null;
      const s = String(value)
        .replace(/,/g, "")
        .replace(/[^0-9eE+\-.]/g, "");
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };

    const tcf = Number(formData.tcf);
    if (!tcf || Number.isNaN(tcf)) {
      // Clear corrected values when TCF is invalid
      const cleared: Record<string, string> = {} as any;
      keys.forEach((k) => {
        cleared[k] = "";
      });
      const changed = keys.some(
        (k) =>
          (formData.correctedInsulationResistance[k] || "") !==
          (cleared[k] || ""),
      );
      if (changed) {
        setFormData((prev) => ({
          ...prev,
          correctedInsulationResistance: cleared,
        }));
      }
      return;
    }

    const computed: Record<string, string> = {} as any;
    keys.forEach((k) => {
      const base = parseReading((formData.insulationResistance as any)[k]);
      computed[k] = base === null ? "" : (base * tcf).toFixed(2);
    });

    const changed = keys.some(
      (k) =>
        (formData.correctedInsulationResistance[k] || "") !==
        (computed[k] || ""),
    );
    if (changed) {
      setFormData((prev) => ({
        ...prev,
        correctedInsulationResistance: computed,
      }));
    }
  }, [formData.insulationResistance, formData.tcf]);

  // Handle form input changes
  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setJustSaved(false);
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle NETA section results
  const handleNetaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setJustSaved(false);
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      netaResults: {
        ...prev.netaResults,
        [name]: value,
      },
    }));
  };

  // Handle bus resistance changes
  const handleBusResistanceChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setJustSaved(false);
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      busResistance: {
        ...prev.busResistance,
        [name]: value,
      },
    }));
  };

  // Handle insulation resistance changes
  const handleInsulationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setJustSaved(false);
    const { name, value } = e.target;
    const key = getDataKey(name);
    setFormData((prev) => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        [key]: value,
      },
    }));
  };

  // Toggle pass/fail status
  const toggleStatus = () => {
    setFormData((prev) => ({
      ...prev,
      status: prev.status === "PASS" ? "FAIL" : "PASS",
    }));
  };

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
      setLoading(true);
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
        // Then fetch customer data
        let customerName = "";
        let customerAddress = (jobData as any).site_address || "";

        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select(
              `
              name,
              address
            `,
            )
            .eq("id", jobData.customer_id)
            .single();

          if (!customerError && customerData) {
            customerName = maskCustomerName(customerData.name);
            customerAddress = customerData.address;
          }
        }

        setFormData((prev) => ({
          ...prev,
          jobNumber: jobData.job_number || "",
          customer: maskCustomerName(customerName),
          address: maskCustomerAddress(customerAddress),
        }));
      }
    } catch (error) {
      console.error("Error loading job info:", error);
    } finally {
      setLoading(false);
    }
  };

  // Add key mapping function to convert between display keys and data keys
  const getDataKey = (displayKey: string): string => {
    const keyMap: { [key: string]: string } = {
      "A-B": "aToB",
      "B-C": "bToC",
      "C-A": "cToA",
      "A-N": "aToN",
      "B-N": "bToN",
      "C-N": "cToN",
      "A-G": "aToG",
      "B-G": "bToG",
      "C-G": "cToG",
      "N-G": "nToG",
    };
    return keyMap[displayKey] || displayKey;
  };

  // Load report data
  const loadReport = async () => {
    // Load report without requiring user context; viewing does not need user id
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      // Primary fetch: by id only
      let { data, error } = await supabase
        .schema("neta_ops")
        .from("metal_enclosed_busway_reports")
        .select(
          "*, report_info, visual_mechanical, visual_mechanical_inspection, contact_resistance, bus_resistance, insulation_resistance, test_equipment, comments, status",
        )
        .eq("id", reportId)
        .maybeSingle();

      if (error || !data) {
        // Fallback: some RLS policies require matching user_id and/or job_id
        console.warn(
          "Primary fetch returned no row. Trying fallback filters (user_id/job_id)...",
        );
        const fb = supabase
          .schema("neta_ops")
          .from("metal_enclosed_busway_reports")
          .select(
            "*, report_info, visual_mechanical, visual_mechanical_inspection, contact_resistance, bus_resistance, insulation_resistance, test_equipment, comments, status",
          )
          .eq("id", reportId)
          .eq("job_id", jobId || "")
          .maybeSingle();
        let fbResult = await fb;
        if ((!fbResult.data || fbResult.error) && user?.id) {
          fbResult = await supabase
            .schema("neta_ops")
            .from("metal_enclosed_busway_reports")
            .select(
              "*, report_info, visual_mechanical, visual_mechanical_inspection, contact_resistance, bus_resistance, insulation_resistance, test_equipment, comments, status",
            )
            .eq("id", reportId)
            .eq("user_id", user.id)
            .maybeSingle();
        }
        data = fbResult.data as any;
        error = fbResult.error as any;
      }

      if (error && !data) {
        console.warn(
          `Report with ID ${reportId} not found or access denied.`,
          error,
        );
        setNotFound(true);
        // Try to suggest existing reports for this job so user can pick one
        if (jobId) {
          const { data: list } = await supabase
            .schema("neta_ops")
            .from("metal_enclosed_busway_reports")
            .select("id, created_at")
            .eq("job_id", jobId)
            .order("created_at", { ascending: false })
            .limit(10);
          setSuggestedReports(list || []);
        }
        return;
      }

      if (data) {
        setRawRow(data);
        console.log("🔍 MetalEnclosedBuswayReport - Loaded data:", data);
        console.log(
          "🔍 insulation_resistance column:",
          data.insulation_resistance,
        );
        console.log(
          "🔍 insulation_resistance.readings:",
          data.insulation_resistance?.readings,
        );
        console.log(
          "🔍 insulation_resistance.correctedReadings:",
          data.insulation_resistance?.correctedReadings,
        );
        console.log(
          "🔍 insulation_resistance.readings.aToB:",
          data.insulation_resistance?.readings?.aToB,
        );
        console.log(
          "🔍 insulation_resistance.correctedReadings.aToB:",
          data.insulation_resistance?.correctedReadings?.aToB,
        );

        // Map the data from separate columns to the formData structure
        // Build helpers to normalize from multiple shapes
        const normalizeInsulationObj = (src: any): Record<string, string> => {
          if (!src || typeof src !== "object") return {};
          // Accept both display keys and aToB keys
          const out: Record<string, string> = {};
          const fromDisplay = (k: string) =>
            (
              ({
                "A-B": "aToB",
                "B-C": "bToC",
                "C-A": "cToA",
                "A-N": "aToN",
                "B-N": "bToN",
                "C-N": "cToN",
                "A-G": "aToG",
                "B-G": "bToG",
                "C-G": "cToG",
                "N-G": "nToG",
              }) as any
            )[k] || k;
          Object.keys(src).forEach((k) => {
            const key = fromDisplay(k);
            out[key] = src[k];
          });
          return out;
        };

        const expectedIds = [
          "7.4.A.1",
          "7.4.A.2",
          "7.4.A.3",
          "7.4.A.4",
          "7.4.A.5.1",
          "7.4.A.6",
          "7.4.A.7",
          "7.4.A.8",
          "7.4.A.9",
        ];
        const guessIdFromDescription = (desc: string): string | null => {
          const d = (desc || "").toLowerCase();
          if (!d) return null;
          if (d.includes("nameplate") && d.includes("drawings"))
            return "7.4.A.1";
          if (d.includes("inspect") && d.includes("mechanical"))
            return "7.4.A.2";
          if (
            d.includes("anchorage") ||
            (d.includes("alignment") && d.includes("ground"))
          )
            return "7.4.A.3";
          if (
            d.includes("single-line") ||
            (d.includes("single line") && d.includes("diagram"))
          )
            return "7.4.A.4";
          if (d.includes("low-resistance") || d.includes("ohmmeter"))
            return "7.4.A.5.1";
          if (d.includes("orientation") || d.includes("adequate cooling"))
            return "7.4.A.6";
          if (d.includes("weep-hole") || d.includes("weep hole"))
            return "7.4.A.7";
          if (d.includes("joint") && d.includes("shield")) return "7.4.A.8";
          if (d.includes("ventilating") || d.includes("openings"))
            return "7.4.A.9";
          return null;
        };
        const vmiFromArray = (arr: any[]): Record<string, string> => {
          const base: Record<string, string> = Object.fromEntries(
            expectedIds.map((id) => [id, ""]),
          );
          (arr || []).forEach((item: any) => {
            if (!item) return;
            const value = item.result ?? item.value ?? "";
            let key = item.id ?? item.section ?? null;
            if (!key && item.description)
              key = guessIdFromDescription(item.description);
            if (key && expectedIds.includes(key) && value !== undefined) {
              base[key] = value;
            }
          });
          return base;
        };

        // Payload fallback (for tables where everything is under a JSONB column like report_data or data)
        const payload: any =
          (data as any).report_data || (data as any).data || {};

        const R = (key: string, def: any = "") =>
          data.report_info?.[key] ??
          payload.report_info?.[key] ??
          payload[key] ??
          def;
        const J = (key: string) => (data as any)[key] ?? payload[key];

        // Prefer new column names but fall back to legacy ones; prefer NON-EMPTY values
        const isNonEmptyArray = (a: any) => Array.isArray(a) && a.length > 0;
        const isNonEmptyObj = (o: any) =>
          o && typeof o === "object" && Object.keys(o).length > 0;

        const vmInspect = J("visual_mechanical_inspection");
        const vmLegacy = J("visual_mechanical");
        const visualArray = isNonEmptyArray(vmInspect)
          ? vmInspect
          : isNonEmptyArray(vmLegacy)
            ? vmLegacy
            : [];

        const busNew = J("bus_resistance");
        const busLegacy = J("contact_resistance");
        const busResObj = isNonEmptyObj(busNew)
          ? busNew
          : isNonEmptyObj(busLegacy)
            ? busLegacy
            : R("busResistance", {}) || {};

        const newFormData = {
          customer: R("customer"),
          address: R("address"),
          user: R("user"),
          date: R("date"),
          identifier: R("identifier"),
          jobNumber: R("jobNumber"),
          technicians: R("technicians"),
          substation: R("substation"),
          // Importer stores equipment location as 'eqptLocation'; support both
          equipment:
            R("equipment") ||
            (data.report_info?.eqptLocation ??
              payload.report_info?.eqptLocation ??
              payload.eqptLocation ??
              ""),

          temperature: R("temperature"),
          fahrenheit:
            data.report_info?.fahrenheit ??
            payload.report_info?.fahrenheit ??
            true,
          tcf: data.insulation_resistance?.tcf
            ? parseFloat(data.insulation_resistance.tcf)
            : typeof R("tcf") === "number"
              ? R("tcf")
              : 0.138,
          humidity: R("humidity"),

          manufacturer: R("manufacturer"),
          catalogNumber: R("catalogNumber"),
          serialNumber: R("serialNumber"),
          fedFrom: R("fedFrom"),
          conductorMaterial: R("conductorMaterial"),
          ratedVoltage: R("ratedVoltage"),
          operatingVoltage: R("operatingVoltage"),
          ampacity: R("ampacity"),

          // Visual and mechanical inspection from separate column(s) or report_info
          netaResults: Array.isArray(visualArray)
            ? vmiFromArray(visualArray)
            : {
                "7.4.A.1": R("netaResults", {})["7.4.A.1"] || "",
                "7.4.A.2": R("netaResults", {})["7.4.A.2"] || "",
                "7.4.A.3": R("netaResults", {})["7.4.A.3"] || "",
                "7.4.A.4": R("netaResults", {})["7.4.A.4"] || "",
                "7.4.A.5.1": R("netaResults", {})["7.4.A.5.1"] || "",
                "7.4.A.6": R("netaResults", {})["7.4.A.6"] || "",
                "7.4.A.7": R("netaResults", {})["7.4.A.7"] || "",
                "7.4.A.8": R("netaResults", {})["7.4.A.8"] || "",
                "7.4.A.9": R("netaResults", {})["7.4.A.9"] || "",
              },

          // Bus resistance from separate column or report_info
          busResistance: {
            p1: busResObj?.p1 ?? busResObj?.P1 ?? busResObj?.phase1 ?? "",
            p2: busResObj?.p2 ?? busResObj?.P2 ?? busResObj?.phase2 ?? "",
            p3: busResObj?.p3 ?? busResObj?.P3 ?? busResObj?.phase3 ?? "",
            neutral:
              busResObj?.neutral ?? busResObj?.N ?? busResObj?.neut ?? "",
          },

          // Map insulation resistance from the separate column
          testVoltage1:
            J("insulation_resistance")?.testVoltage || R("testVoltage1") || "",
          insulationResistance: {
            ...(J("insulation_resistance")?.readings
              ? {
                  aToB: J("insulation_resistance").readings.aToB || "",
                  bToC: J("insulation_resistance").readings.bToC || "",
                  cToA: J("insulation_resistance").readings.cToA || "",
                  aToN: J("insulation_resistance").readings.aToN || "",
                  bToN: J("insulation_resistance").readings.bToN || "",
                  cToN: J("insulation_resistance").readings.cToN || "",
                  aToG: J("insulation_resistance").readings.aToG || "",
                  bToG: J("insulation_resistance").readings.bToG || "",
                  cToG: J("insulation_resistance").readings.cToG || "",
                  nToG: J("insulation_resistance").readings.nToG || "",
                }
              : normalizeInsulationObj(R("insulationResistance", {}))),
          },
          correctedInsulationResistance: {
            aToB: J("insulation_resistance")?.correctedReadings?.aToB || "",
            bToC: J("insulation_resistance")?.correctedReadings?.bToC || "",
            cToA: J("insulation_resistance")?.correctedReadings?.cToA || "",
            aToN: J("insulation_resistance")?.correctedReadings?.aToN || "",
            bToN: J("insulation_resistance")?.correctedReadings?.bToN || "",
            cToN: J("insulation_resistance")?.correctedReadings?.cToN || "",
            aToG: J("insulation_resistance")?.correctedReadings?.aToG || "",
            bToG: J("insulation_resistance")?.correctedReadings?.bToG || "",
            cToG: J("insulation_resistance")?.correctedReadings?.cToG || "",
            nToG: J("insulation_resistance")?.correctedReadings?.nToG || "",
          },

          // Map test equipment from the separate column
          megohmmeter:
            J("test_equipment")?.megohmmeter?.name || R("megohmmeter") || "",
          megohmSerial:
            J("test_equipment")?.megohmmeter?.serialNumber ||
            R("megohmSerial") ||
            "",
          megAmpId:
            J("test_equipment")?.megohmmeter?.ampId || R("megAmpId") || "",
          megCalDate:
            J("test_equipment")?.megohmmeter?.calDate || R("megCalDate") || "",
          lowResistanceOhmmeter:
            J("test_equipment")?.lowResistanceOhmmeter?.name ||
            R("lowResistanceOhmmeter") ||
            "",
          lowResistanceSerial:
            J("test_equipment")?.lowResistanceOhmmeter?.serialNumber ||
            R("lowResistanceSerial") ||
            "",
          lowResistanceAmpId:
            J("test_equipment")?.lowResistanceOhmmeter?.ampId ||
            R("lowResistanceAmpId") ||
            "",
          lowResistanceCalDate:
            J("test_equipment")?.lowResistanceOhmmeter?.calDate ||
            R("lowResistanceCalDate") ||
            "",

          comments: data.comments || "",
          status: data.status || "PASS",

          insulationResistanceUnit:
            J("insulation_resistance")?.units ||
            R("insulationResistanceUnit") ||
            "MΩ",
          contactResistanceUnit: "μΩ", // Default value
          dielectricWithstandUnit: "mA", // Default value

          cableRating: "", // Not used in this report
          testVoltage:
            J("insulation_resistance")?.testVoltage || R("testVoltage1") || "",

          dielectricPhaseA: "", // Not used in this report
          dielectricPhaseB: "", // Not used in this report
          dielectricPhaseC: "", // Not used in this report
        };

        console.log(
          "🔍 MetalEnclosedBuswayReport - Mapped formData:",
          newFormData,
        );
        setFormData(newFormData);
        setIsEditing(false);
      } else {
        console.warn(
          "MetalEnclosedBuswayReport - No data returned for id:",
          reportId,
        );
      }
    } catch (error) {
      console.error("Error loading report:", error);
      alert("Error loading report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Save report
  const handleSave = async (options?: {
    closeAfterSave?: boolean;
    skipAlertAndNavigation?: boolean;
  }): Promise<string | null> => {
    if (!jobId || !user?.id) {
      console.error("Missing required job ID or user ID");
      alert("Error: Missing required information. Please try again.");
      return null;
    }

    try {
      setIsSaving(true);

      const reportData: ReportData = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          customer: maskCustomerName(formData.customer),
          address: maskCustomerAddress(formData.address),
          user: formData.user,
          date: formData.date,
          identifier: formData.identifier,
          jobNumber: formData.jobNumber,
          technicians: formData.technicians,
          substation: formData.substation,
          equipment: formData.equipment,

          temperature: formData.temperature,
          fahrenheit: formData.fahrenheit,
          tcf: formData.tcf,
          humidity: formData.humidity,

          manufacturer: formData.manufacturer,
          catalogNumber: formData.catalogNumber,
          serialNumber: formData.serialNumber,
          fedFrom: formData.fedFrom,
          conductorMaterial: formData.conductorMaterial,
          ratedVoltage: formData.ratedVoltage,
          operatingVoltage: formData.operatingVoltage,
          ampacity: formData.ampacity,

          netaResults: formData.netaResults,
          busResistance: formData.busResistance,

          testVoltage1: formData.testVoltage1,
          insulationResistance: formData.insulationResistance,

          insulationResistanceUnit: formData.insulationResistanceUnit,
          contactResistanceUnit: formData.contactResistanceUnit,

          megohmmeter: formData.megohmmeter,
          megohmSerial: formData.megohmSerial,
          megAmpId: formData.megAmpId,
          megCalDate: formData.megCalDate,
          lowResistanceOhmmeter: formData.lowResistanceOhmmeter,
          lowResistanceSerial: formData.lowResistanceSerial,
          lowResistanceAmpId: formData.lowResistanceAmpId,
          lowResistanceCalDate: formData.lowResistanceCalDate,

          status: formData.status,
        },
        comments: formData.comments,
        updated_at: new Date().toISOString(),
      };

      // Also populate dedicated JSONB columns for robust loads
      const visualArray = Object.entries(formData.netaResults || {}).map(
        ([id, result]) => ({ id, result }),
      );
      const busRes = {
        p1: formData.busResistance?.p1 || "",
        p2: formData.busResistance?.p2 || "",
        p3: formData.busResistance?.p3 || "",
        neutral: formData.busResistance?.neutral || "",
      };
      const insRes = {
        testVoltage: formData.testVoltage1 || "",
        units: formData.insulationResistanceUnit || "MΩ",
        temperature: formData.temperature || "",
        tcf: formData.tcf,
        readings: {
          aToB: formData.insulationResistance.aToB || "",
          bToC: formData.insulationResistance.bToC || "",
          cToA: formData.insulationResistance.cToA || "",
          aToN: formData.insulationResistance.aToN || "",
          bToN: formData.insulationResistance.bToN || "",
          cToN: formData.insulationResistance.cToN || "",
          aToG: formData.insulationResistance.aToG || "",
          bToG: formData.insulationResistance.bToG || "",
          cToG: formData.insulationResistance.cToG || "",
          nToG: formData.insulationResistance.nToG || "",
        },
        correctedReadings: {
          aToB: formData.correctedInsulationResistance.aToB || "",
          bToC: formData.correctedInsulationResistance.bToC || "",
          cToA: formData.correctedInsulationResistance.cToA || "",
          aToN: formData.correctedInsulationResistance.aToN || "",
          bToN: formData.correctedInsulationResistance.bToN || "",
          cToN: formData.correctedInsulationResistance.cToN || "",
          aToG: formData.correctedInsulationResistance.aToG || "",
          bToG: formData.correctedInsulationResistance.bToG || "",
          cToG: formData.correctedInsulationResistance.cToG || "",
          nToG: formData.correctedInsulationResistance.nToG || "",
        },
      };
      const testEquipment = {
        megohmmeter: {
          name: formData.megohmmeter || "",
          serialNumber: formData.megohmSerial || "",
          ampId: formData.megAmpId || "",
          calDate: formData.megCalDate || "",
        },
        lowResistanceOhmmeter: {
          name: formData.lowResistanceOhmmeter || "",
          serialNumber: formData.lowResistanceSerial || "",
          ampId: formData.lowResistanceAmpId || "",
          calDate: formData.lowResistanceCalDate || "",
        },
      };

      const upsertPayload: any = {
        report_info: reportData.report_info,
        comments: reportData.comments,
        status: reportData.report_info.status,
        visual_mechanical_inspection: visualArray,
        bus_resistance: busRes,
        insulation_resistance: insRes,
        test_equipment: testEquipment,
      };

      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema("neta_ops")
          .from("metal_enclosed_busway_reports")
          .update(upsertPayload)
          .eq("id", reportId)
          .select()
          .single();
      } else {
        // Insert new report
        reportData.created_at = new Date().toISOString();
        result = await supabase
          .schema("neta_ops")
          .from("metal_enclosed_busway_reports")
          .insert({
            job_id: jobId,
            user_id: user.id,
            ...upsertPayload,
            created_at: reportData.created_at,
            updated_at: reportData.updated_at,
          })
          .select()
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      setJustSaved(true);
      const savedId = result.data?.id || reportId;

      // If this was a new report, create and link an asset
      if (!reportId && result.data) {
        // Create asset entry
        const assetData = {
          name: getAssetName(
            reportSlug,
            formData.identifier || formData.equipment || "",
          ),
          file_url: `report:/jobs/${jobId}/metal-enclosed-busway/${result.data.id}`,
          user_id: user.id,
        };

        const { data: assetResult, error: assetError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .insert(assetData)
          .select("id")
          .single();

        if (assetError) throw assetError;

        // Link asset to job
        const { error: linkError } = await supabase
          .schema("neta_ops")
          .from("job_assets")
          .insert({
            job_id: jobId,
            asset_id: assetResult.id,
            user_id: user.id,
          });

        if (linkError) throw linkError;
      }

      if (options?.closeAfterSave) {
        setIsEditing(false);
      }
      if (!options?.skipAlertAndNavigation && !reportId) {
        setCurrentReportId(savedId);
        navigate(`/jobs/${jobId}/${reportSlug}/${savedId}`, { replace: true });
      }
      return savedId || null;
    } catch (error) {
      console.error("Error saving report:", error);
      alert("Error saving report. Please try again.");
      setIsEditing(true); // Re-enable editing if save failed
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const savedId = await handleSave({ closeAfterSave: true });
    if (savedId || currentReportId) {
      setIsEditing(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, reportId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-white">
          Report not found or access denied
        </h2>
        <p className="text-sm text-zinc-600 dark:text-white mb-4">
          We couldn’t load this Metal Enclosed Busway report. It may not exist,
          or you may not have permission.
        </p>
        {jobId && suggestedReports.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-zinc-900 dark:text-white">
              Recent reports for this job:
            </h3>
            <ul className="list-disc pl-5 text-sm text-blue-600 dark:text-blue-300">
              {suggestedReports.map((r) => (
                <li key={r.id}>
                  <a
                    href={`/jobs/${jobId}/metal-enclosed-busway/${r.id}`}
                    className="underline"
                  >
                    {r.id}
                  </a>
                  <span className="ml-2 text-zinc-500 dark:text-white">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const renderHeader = () => (
    <ReportHeader
      title={reportName}
      isAutoSaving={false}
      isEditing={isEditing}
      justSaved={justSaved}
      isSaving={isSaving}
      status={formData.status}
      hasReport={!!currentReportId && !locked}
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
  );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-zinc-800 pb-4 mb-6">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c" }}
        >
          NETA - ATS 7.4
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
      {/* End Print Header */}
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {/* Optional debug dump: open with ?debug=true */}
          {searchParams.get("debug") === "true" && (
            <section className="mb-4">
              <h2 className="text-sm font-semibold mb-2 text-zinc-900 dark:text-white">
                Debug: Raw Loaded Row
              </h2>
              <pre className="p-3 bg-zinc-100 dark:bg-dark-150 rounded text-xs overflow-auto max-h-64 text-zinc-900 dark:text-white">
                {rawRow ? JSON.stringify(rawRow, null, 2) : "No row loaded"}
              </pre>
            </section>
          )}
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? "hidden" : ""} print:hidden`}>
            {renderHeader()}
          </div>

          {/* Job Information */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-2 gap-6 jobinfo-screen print:hidden job-info-onscreen">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Job #
                  </label>
                  <input
                    type="text"
                    name="jobNumber"
                    value={formData.jobNumber}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className="block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-dark-150 text-zinc-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Customer
                  </label>
                  <input
                    type="text"
                    name="customer"
                    value={formData.customer}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className="block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-dark-150 text-zinc-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Location
                  </label>
                  <textarea
                    name="address"
                    value={maskCustomerAddress(formData.address)}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    rows={3}
                    className="block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-dark-150 text-zinc-900 dark:text-white text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Identifier
                  </label>
                  <input
                    type="text"
                    name="identifier"
                    value={formData.identifier}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Technicians
                  </label>
                  <input
                    type="text"
                    name="technicians"
                    value={formData.technicians}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Substation
                  </label>
                  <input
                    type="text"
                    name="substation"
                    value={formData.substation}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Equipment Location
                  </label>
                  <input
                    type="text"
                    name="equipment"
                    value={formData.equipment}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    User
                  </label>
                  <input
                    type="text"
                    name="user"
                    value={formData.user}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-white">
                      Temp.
                    </label>
                    <input
                      type="number"
                      name="temperature"
                      value={formData.temperature}
                      onChange={handleInputChange}
                      readOnly={!isEditing}
                      className={`w-12 px-1 py-1 text-right border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white text-xs focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                    />
                    <span className="text-xs text-zinc-500 dark:text-white">
                      °F
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <input
                      type="text"
                      value={
                        formData.temperature
                          ? convertFtoC(formData.temperature)
                          : ""
                      }
                      readOnly
                      className="w-10 px-1 py-1 text-right border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-dark-150 text-zinc-900 dark:text-white text-xs"
                    />
                    <span className="text-xs text-zinc-500 dark:text-white">
                      °C
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-white">
                      TCF
                    </label>
                    <input
                      type="text"
                      value={formData.tcf.toFixed(3)}
                      readOnly
                      className="w-10 px-1 py-1 text-right border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-dark-150 text-zinc-900 dark:text-white text-xs"
                    />
                  </div>

                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      name="humidity"
                      value={formData.humidity}
                      onChange={handleInputChange}
                      readOnly={!isEditing}
                      className={`w-12 px-1 py-1 text-right border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white text-xs focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}`}
                    />
                    <span className="text-xs text-zinc-500 dark:text-white">
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/* Print-only JobInfoPrintTable */}
            <div className="hidden print:block">
              <JobInfoPrintTable
                data={{
                  customer: formData.customer,
                  address: formData.address,
                  jobNumber: formData.jobNumber,
                  technicians: formData.technicians,
                  date: formData.date,
                  identifier: formData.identifier,
                  user: formData.user,
                  substation: formData.substation,
                  eqptLocation: formData.equipment,
                  temperature: {
                    fahrenheit: formData.temperature
                      ? parseFloat(formData.temperature)
                      : undefined,
                    celsius: formData.temperature
                      ? parseFloat(convertFtoC(formData.temperature))
                      : undefined,
                    tcf: formData.tcf,
                    humidity: formData.humidity
                      ? parseFloat(formData.humidity)
                      : undefined,
                  },
                }}
              />
            </div>
          </section>

          {/* Nameplate Data */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Nameplate Data
            </h2>
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-2 gap-4 nameplate-screen print:hidden nameplate-onscreen">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Catalog Number
                  </label>
                  <input
                    type="text"
                    name="catalogNumber"
                    value={formData.catalogNumber}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Fed From
                  </label>
                  <input
                    type="text"
                    name="fedFrom"
                    value={formData.fedFrom}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Conductor Material
                  </label>
                  <input
                    type="text"
                    name="conductorMaterial"
                    value={formData.conductorMaterial}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Rated Voltage (kV)
                  </label>
                  <input
                    type="text"
                    name="ratedVoltage"
                    value={formData.ratedVoltage}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Operating Voltage (kV)
                  </label>
                  <input
                    type="text"
                    name="operatingVoltage"
                    value={formData.operatingVoltage}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Ampacity (A)
                  </label>
                  <input
                    type="text"
                    name="ampacity"
                    value={formData.ampacity}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </div>
            {/* Print-only compact table */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-zinc-300 print:border-black print-comment-table">
                <colgroup>
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">{formData.manufacturer || ""}</div>
                    </td>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Catalog Number:</div>
                      <div className="mt-1">{formData.catalogNumber || ""}</div>
                    </td>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-1">{formData.serialNumber || ""}</div>
                    </td>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Fed From:</div>
                      <div className="mt-1">{formData.fedFrom || ""}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Conductor Material:</div>
                      <div className="mt-1">
                        {formData.conductorMaterial || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Rated Voltage (kV):</div>
                      <div className="mt-1">{formData.ratedVoltage || ""}</div>
                    </td>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">
                        Operating Voltage (kV):
                      </div>
                      <div className="mt-1">
                        {formData.operatingVoltage || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-zinc-300 print:border-black">
                      <div className="font-semibold">Ampacity (A):</div>
                      <div className="mt-1">{formData.ampacity || ""}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Visual and Mechanical Inspection */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "63%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-left text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-left text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-left text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-zinc-200 dark:divide-zinc-700">
                  {Object.entries(formData.netaResults).map(([id, result]) => (
                    <tr key={id}>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-white">
                        {id}
                      </td>
                      <td className="px-3 py-2 text-sm text-zinc-900 dark:text-white whitespace-normal break-words">
                        {(() => {
                          switch (id) {
                            case "7.4.A.1":
                              return "Compare equipment nameplate data with drawings and specifications.";
                            case "7.4.A.2":
                              return "Inspect physical and mechanical condition.";
                            case "7.4.A.3":
                              return "Inspect anchorage, alignment, and grounding.";
                            case "7.4.A.4":
                              return "Verify correct connection in accordance with single-line diagram.";
                            case "7.4.A.5.1":
                              return "Use of a low-resistance ohmmeter in accordance with Section 7.4.B.";
                            case "7.4.A.6":
                              return "Confirm physical orientation in accordance with manufacturer's labels to insure adequate cooling.";
                            case "7.4.A.7":
                              return 'Verify "weep-hole" plugs are in accordance with manufacturer\'s published data.';
                            case "7.4.A.8":
                              return "Verify correct installation of joint shield.";
                            case "7.4.A.9":
                              return "Verify ventilating openings are clean.";
                            default:
                              return "";
                          }
                        })()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="print:hidden">
                          <select
                            name={id}
                            value={result}
                            onChange={handleNetaChange}
                            disabled={!isEditing}
                            className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                          >
                            {INSPECTION_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {result || ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Contact/Pole Resistance */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Contact/Pole Resistance
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                <thead>
                  <tr>
                    <th
                      colSpan={5}
                      className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider"
                    >
                      Bus Resistance
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      P1
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      P2
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      P3
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      Neutral
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-zinc-200 dark:divide-zinc-700">
                  <tr>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name="p1"
                        value={formData.busResistance.p1}
                        onChange={handleBusResistanceChange}
                        readOnly={!isEditing}
                        className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name="p2"
                        value={formData.busResistance.p2}
                        onChange={handleBusResistanceChange}
                        readOnly={!isEditing}
                        className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name="p3"
                        value={formData.busResistance.p3}
                        onChange={handleBusResistanceChange}
                        readOnly={!isEditing}
                        className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name="neutral"
                        value={formData.busResistance.neutral}
                        onChange={handleBusResistanceChange}
                        readOnly={!isEditing}
                        className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center text-sm text-zinc-900 dark:text-white">
                      {formData.contactResistanceUnit}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Insulation Resistance */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Insulation Resistance
            </h2>
            <div className="flex justify-end mb-2 space-x-4">
              <div className="w-48 border border-zinc-300 dark:border-zinc-700 p-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                  Test Voltage:
                </label>
                <select
                  name="testVoltage1"
                  value={formData.testVoltage1}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                >
                  <option value="">Select Voltage</option>
                  {INSULATION_TEST_VOLTAGES.map((voltage) => (
                    <option key={voltage} value={voltage}>
                      {voltage}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-48 border border-zinc-300 dark:border-zinc-700 p-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                  Unit:
                </label>
                <select
                  name="insulationResistanceUnit"
                  value={formData.insulationResistanceUnit}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                >
                  {INSULATION_RESISTANCE_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 ir-table">
                {/* Print-only column sizing */}
                <colgroup>
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-units-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th
                      colSpan={10}
                      className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider"
                    >
                      Insulation Resistance
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider ir-units">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      A-B
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      B-C
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      C-A
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      A-N
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      B-N
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      C-N
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      A-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      B-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      C-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      N-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-zinc-200 dark:divide-zinc-700">
                  <tr>
                    {[
                      "A-B",
                      "B-C",
                      "C-A",
                      "A-N",
                      "B-N",
                      "C-N",
                      "A-G",
                      "B-G",
                      "C-G",
                      "N-G",
                    ].map((key) => (
                      <td key={key} className="px-3 py-2">
                        <input
                          type="text"
                          name={key}
                          value={formData.insulationResistance[getDataKey(key)]}
                          onChange={handleInsulationChange}
                          readOnly={!isEditing}
                          className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-sm text-zinc-900 dark:text-white ir-units">
                      {formData.insulationResistanceUnit}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Temperature Corrected Insulation Resistance Values */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Temperature Corrected Insulation Resistance
              Values
            </h2>
            <div className="flex justify-end mb-2">
              <div className="w-48 border border-zinc-300 dark:border-zinc-700 p-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                  Test Voltage:
                </label>
                <input
                  type="text"
                  value={formData.testVoltage1}
                  readOnly
                  className="mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-dark-150 shadow-sm dark:text-white"
                />
              </div>
            </div>

            {/* Temperature and TCF Information - CORRECTED VALUES SECTION */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                  Temperature (°F):
                </label>
                <input
                  type="text"
                  value={formData.temperature || ""}
                  readOnly
                  className="mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-dark-150 shadow-sm dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                  Temperature (°C):
                </label>
                <input
                  type="text"
                  value={
                    formData.temperature
                      ? (
                          ((parseFloat(formData.temperature) - 32) * 5) /
                          9
                        ).toFixed(1)
                      : ""
                  }
                  readOnly
                  className="mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-dark-150 shadow-sm dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                  TCF:
                </label>
                <input
                  type="text"
                  value={formData.tcf ? formData.tcf.toFixed(3) : ""}
                  readOnly
                  className="mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-dark-150 shadow-sm dark:text-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 ir-table">
                {/* Print-only column sizing */}
                <colgroup>
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-col" />
                  <col className="ir-units-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th
                      colSpan={10}
                      className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider"
                    >
                      Temperature Corrected Values
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase tracking-wider ir-units">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      A-B
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      B-C
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      C-A
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      A-N
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      B-N
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      C-N
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      A-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      B-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      C-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase">
                      N-G
                    </th>
                    <th className="px-3 py-2 bg-zinc-50 dark:bg-dark-150 text-center text-xs font-medium text-zinc-500 dark:text-white uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-zinc-200 dark:divide-zinc-700">
                  <tr>
                    {[
                      "A-B",
                      "B-C",
                      "C-A",
                      "A-N",
                      "B-N",
                      "C-N",
                      "A-G",
                      "B-G",
                      "C-G",
                      "N-G",
                    ].map((key) => {
                      const dataKey = getDataKey(key);
                      const measured = (
                        formData.insulationResistance[dataKey] || ""
                      ).trim();
                      const rawCorrected =
                        formData.correctedInsulationResistance[dataKey] || "";
                      const displayCorrected = measured.startsWith(">")
                        ? ">" + rawCorrected.replace(/^\s*>/, "")
                        : rawCorrected;
                      return (
                        <td key={key} className="px-3 py-2">
                          <input
                            type="text"
                            value={displayCorrected}
                            readOnly
                            className="block w-full rounded-md border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-dark-150 shadow-sm text-sm dark:text-white"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center text-sm text-zinc-900 dark:text-white ir-units">
                      {formData.insulationResistanceUnit}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Equipment Used */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 gap-6 print:hidden test-eqpt-onscreen">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Megohmmeter
                  </label>
                  <EquipmentAutocomplete
                    value={formData.megohmmeter}
                    onChange={(value) =>
                      handleInputChange({
                        target: { name: "megohmmeter", value },
                      } as any)
                    }
                    onSelect={(equipment) => {
                      handleInputChange({
                        target: {
                          name: "megohmmeter",
                          value: equipment.equipment_name,
                        },
                      } as any);
                      handleInputChange({
                        target: {
                          name: "megohmSerial",
                          value: equipment.serial_number || "",
                        },
                      } as any);
                      handleInputChange({
                        target: {
                          name: "megAmpId",
                          value: equipment.amp_id || "",
                        },
                      } as any);
                      handleInputChange({
                        target: {
                          name: "megCalDate",
                          value: formatLocalDateShort(
                            equipment.calibration_date,
                          ),
                        },
                      } as any);
                    }}
                    readOnly={!isEditing}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    name="megohmSerial"
                    value={formData.megohmSerial}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    AMP ID
                  </label>
                  <input
                    type="text"
                    name="megAmpId"
                    value={formData.megAmpId}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Cal Date
                  </label>
                  <input
                    type="text"
                    name="megCalDate"
                    value={formData.megCalDate}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Low Resistance Ohmmeter
                  </label>
                  <EquipmentAutocomplete
                    value={formData.lowResistanceOhmmeter}
                    onChange={(value) =>
                      handleInputChange({
                        target: { name: "lowResistanceOhmmeter", value },
                      } as any)
                    }
                    onSelect={(equipment) => {
                      handleInputChange({
                        target: {
                          name: "lowResistanceOhmmeter",
                          value: equipment.equipment_name,
                        },
                      } as any);
                      handleInputChange({
                        target: {
                          name: "lowResistanceSerial",
                          value: equipment.serial_number || "",
                        },
                      } as any);
                      handleInputChange({
                        target: {
                          name: "lowResistanceAmpId",
                          value: equipment.amp_id || "",
                        },
                      } as any);
                      handleInputChange({
                        target: {
                          name: "lowResistanceCalDate",
                          value: formatLocalDateShort(
                            equipment.calibration_date,
                          ),
                        },
                      } as any);
                    }}
                    readOnly={!isEditing}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    name="lowResistanceSerial"
                    value={formData.lowResistanceSerial}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    AMP ID
                  </label>
                  <input
                    type="text"
                    name="lowResistanceAmpId"
                    value={formData.lowResistanceAmpId}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white">
                    Cal Date
                  </label>
                  <input
                    type="text"
                    name="lowResistanceCalDate"
                    value={formData.lowResistanceCalDate}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </div>
            {/* Print-only compact arrangement */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-zinc-300 print:border-black te-print">
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">Megohmmeter:</div>
                      <div className="mt-0">{formData.megohmmeter || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">{formData.megohmSerial || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">{formData.megAmpId || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">Cal Date:</div>
                      <div className="mt-0">{formData.megCalDate || ""}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">
                        Low Resistance Ohmmeter:
                      </div>
                      <div className="mt-0">
                        {formData.lowResistanceOhmmeter || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">
                        {formData.lowResistanceSerial || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">
                        {formData.lowResistanceAmpId || ""}
                      </div>
                    </td>
                    <td className="p-2 align-top border border-zinc-300 print:border-black">
                      <div className="font-semibold">Cal Date:</div>
                      <div className="mt-0">
                        {formData.lowResistanceCalDate || ""}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Comments */}
          <section
            className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments
            </h2>
            {/* On-screen textarea - hidden in print */}
            <div className="print:hidden comments-onscreen">
              <textarea
                name="comments"
                value={formData.comments}
                onChange={handleInputChange}
                readOnly={!isEditing}
                rows={4}
                className={`block w-full rounded-md border-zinc-300 dark:border-zinc-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-zinc-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            {formData.comments?.trim() && (
              <div className="hidden print:block">
                <table className="w-full table-fixed border-collapse border border-zinc-300 print:border-black print-comment-table">
                  <tbody>
                    <tr>
                      <td className="p-2 align-top border border-zinc-300 print:border-black">
                        <div className="whitespace-pre-wrap break-words">
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
                // Save the report first without navigating away
                const savedReportId = await handleSave({
                  skipAlertAndNavigation: true,
                });
                if (!savedReportId) throw new Error("Failed to save report");

                const now = new Date().toISOString();

                // Update asset status to ready_for_review with submitted_at timestamp
                const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;
                const { error } = await supabase
                  .schema("neta_ops")
                  .from("assets")
                  .update({
                    status: "ready_for_review",
                    submitted_at: now,
                  })
                  .eq("file_url", fileUrl);

                if (error) throw error;

                alert("Report marked as ready for review!");
                // Only navigate for new reports — existing reports stay on page
                if (!reportId) {
                  navigateAfterSave(navigate, jobId, location);
                }
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
    </ReportWrapper>
  );
};

// Add this function to calculate temperature-corrected insulation resistance values
const calculateTempCorrectedValue = (value: string, tcf: number): string => {
  if (!value || !tcf) return "";
  return (parseFloat(value) * parseFloat(tcf.toFixed(3))).toFixed(2);
};

// Add print styles
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }

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

      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid black !important; padding: 4px !important; }
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

      /* Ensure all text is black for maximum readability */
      * { color: black !important; }

      /* Table input sizing for print */
      table input, table select, table textarea {
        width: 80% !important;
        max-width: 80% !important;
        min-width: 30px !important;
        font-size: 7px !important;
        padding: 0px !important;
        border: 1px solid black !important;
        background-color: white !important;
        color: black !important;
        box-sizing: border-box !important;
        margin: 0px !important;
      }

      /* Specific table column sizing */
      table th, table td {
        padding: 1px !important;
        font-size: 7px !important;
        width: 8% !important;
        min-width: 40px !important;
        max-width: 8% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      /* Ensure tables don't break across pages */
      table {
        page-break-inside: avoid !important;
        border-collapse: collapse !important;
        width: 100% !important;
        table-layout: fixed !important;
      }

      /* Force table columns to be more compact */
      table th:first-child,
      table td:first-child {
        width: 8% !important;
        max-width: 8% !important;
      }

      table th:last-child,
      table td:last-child {
        width: 8% !important;
        max-width: 8% !important;
      }

      /* Additional table constraints */
      table * {
        box-sizing: border-box !important;
      }

      /* Prevent any overflow */
      table, table th, table td, table input, table select, table textarea {
        overflow: hidden !important;
        word-wrap: break-word !important;
      }

      /* Section styling */
      section { break-inside: avoid !important; margin-bottom: 14px !important; }

      /* Print-only compact Job Info table */
      .jobinfo-print { display: table !important; width: 100% !important; border-collapse: collapse !important; }
      .jobinfo-print td { border: 1px solid black !important; padding: 2px 4px !important; font-size: 9px !important; }
      .jobinfo-screen { display: none !important; }

      /* Print-only compact Nameplate table */
      .nameplate-print { display: table !important; width: 100% !important; border-collapse: collapse !important; }
      .nameplate-print td { border: 1px solid black !important; padding: 2px 4px !important; font-size: 9px !important; }
      .nameplate-screen { display: none !important; }
      /* Insulation Resistance tables: narrow Units col on right */
      .ir-table { table-layout: fixed !important; width: 100% !important; }
      .ir-table .ir-col { width: 9% !important; }
      .ir-table .ir-units-col { width: 10% !important; }
      .ir-table .ir-units { font-size: 9px !important; }
      /* Visual & Mechanical standardized three-column layout */
      table.vm-standard { table-layout: fixed !important; width: 100% !important; }
      table.vm-standard thead th:nth-child(1),
      table.vm-standard tbody td:nth-child(1) { width: 18% !important; }
      table.vm-standard thead th:nth-child(2),
      table.vm-standard tbody td:nth-child(2) { width: 62% !important; }
      table.vm-standard thead th:nth-child(3),
      table.vm-standard tbody td:nth-child(3) { width: 20% !important; }

      /* Test Equipment print table */
      .te-print { display: table !important; width: 100% !important; border-collapse: collapse !important; }
      .te-print td { border: 1px solid black !important; padding: 2px 4px !important; font-size: 9px !important; }

      /* Hide on-screen elements in print */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      .nameplate-onscreen, .nameplate-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .comments-onscreen, .comments-onscreen * { display: none !important; }

      /* Visual & Mechanical table styling for print */
      table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
      table.visual-mechanical-table thead { display: table-header-group !important; }
      table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
      table.visual-mechanical-table colgroup col:nth-child(1) { width: 12% !important; }
      table.visual-mechanical-table colgroup col:nth-child(2) { width: 63% !important; }
      table.visual-mechanical-table colgroup col:nth-child(3) { width: 25% !important; }
      table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }
    }
  `;
  document.head.appendChild(style);
}

export default MetalEnclosedBuswayReport;
