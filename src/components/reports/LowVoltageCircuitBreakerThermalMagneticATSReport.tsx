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
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";

// Temperature conversion and correction factor lookup tables (from PanelboardReport)
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

// Helper function to get TCF based on rounded Celsius (from PanelboardReport)
const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString(); // Use string key for lookup
  return tcfTable[key] !== undefined ? tcfTable[key] : 1; // Default to 1 if not found
};

// Dropdown options
const visualInspectionResultsOptions = [
  "",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
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
const tripTestingUnitsOptions = ["sec.", "cycles", "ms"]; // Example options

interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string;
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

  // Nameplate Data (Update based on Thermal-Magnetic image)
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  icRating: string; // kA
  frameSize: string; // A
  ratingPlug: string; // A - This seems specific to Electronic? Check image again. -> Yes, on electronic. Remove for thermal? Image has it. Keep it.
  curveNo: string;
  operation: string;
  mounting: string;
  thermalMemory: string;

  // Visual and Mechanical Inspection (Seems same as electronic)
  visualInspectionItems: {
    id: string; // NETA Section
    description: string;
    result: string; // Dropdown: Y, N, N/A
  }[];

  // Device Settings (Update based on Thermal-Magnetic image)
  deviceSettings: {
    asFound: {
      thermal: string;
      magnetic: string;
    };
    asLeft: {
      thermal: string;
      magnetic: string;
    };
  };

  // Electrical Tests - Contact/Pole Resistance (Seems same as electronic)
  contactResistance: {
    p1: string;
    p2: string;
    p3: string;
    unit: string; // Dropdown: µΩ, mΩ, Ω
  };

  // Electrical Tests - Insulation Resistance (Seems same as electronic)
  insulationResistance: {
    testVoltage: string; // Dropdown: 1000V, etc.
    unit: string; // Dropdown: MΩ, kΩ
    measured: {
      poleToPole: { p1p2: string; p2p3: string; p3p1: string };
      poleToFrame: { p1: string; p2: string; p3: string };
      lineToLoad: { p1: string; p2: string; p3: string };
    };
    corrected: {
      poleToPole: { p1p2: string; p2p3: string; p3p1: string };
      poleToFrame: { p1: string; p2: string; p3: string };
      lineToLoad: { p1: string; p2: string; p3: string };
    };
  };

  // Electrical Tests - Primary Injection (Update based on Thermal-Magnetic image)
  primaryInjection: {
    testedSettings: {
      thermal: string;
      magnetic: string;
    };
    results: {
      thermal: {
        amperes1: string; // First Amperes column
        multiplierTolerance: string; // e.g., 300%
        toleranceMinPct?: string; // e.g., -10%
        toleranceMaxPct?: string; // e.g., 10%
        amperes2: string; // Second Amperes column
        toleranceMin: string;
        toleranceMax: string;
        pole1: { sec: string; a: string };
        pole2: { sec: string; a: string };
        pole3: { sec: string; a: string };
      };
      magnetic: {
        amperes1: string;
        multiplierTolerance: string; // e.g., -10% 10%
        toleranceMinPct?: string; // e.g., -10%
        toleranceMaxPct?: string; // e.g., 10%
        amperes2: string;
        toleranceMin: string;
        toleranceMax: string;
        pole1: { sec: string; a: string };
        pole2: { sec: string; a: string };
        pole3: { sec: string; a: string };
      };
    };
  };

  // Test Equipment Used (Update based on Thermal-Magnetic image)
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
    primaryInjectionTestSet: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
  };

  // Comments (Seems same as electronic)
  comments: string;

  // Status (PASS/FAIL/LIMITED SERVICE)
  status: string;
}

// Define tableStyles based on MediumVoltageSwitchOilReport.tsx
const tableStyles = {
  container:
    "w-full overflow-x-auto rounded-none border border-neutral-200 dark:border-neutral-700",
  table:
    "w-full min-w-full table-fixed divide-y divide-neutral-200 dark:divide-neutral-700",
  headerCell:
    "px-2 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider whitespace-normal",
  cell: "px-2 py-2 text-sm text-neutral-900 dark:text-white whitespace-normal",
  input:
    "w-full text-sm rounded-none border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white",
  select:
    "w-full text-sm rounded-none border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white",
};

// Rename component
const LowVoltageCircuitBreakerThermalMagneticATSReport: React.FC = () => {
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

  // Check if we're in print mode
  const isPrintMode = searchParams.get("print") === "true";

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = "low-voltage-circuit-breaker-thermal-magnetic-ats-report";
  const reportName = getReportName(reportSlug);

  // State management
  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(true);
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update initial state to match the new FormData structure
  const [formData, setFormData] = useState<FormData>({
    // Initialize with default values based on FormData interface
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split("T")[0],
    identifier: "",
    jobNumber: "",
    technicians: "",
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
    substation: "",
    eqptLocation: "",
    // Nameplate Data
    manufacturer: "",
    catalogNumber: "",
    serialNumber: "",
    type: "",
    icRating: "",
    frameSize: "",
    ratingPlug: "",
    curveNo: "",
    operation: "",
    mounting: "",
    thermalMemory: "",
    // Visual Inspection Items (Same as Electronic)
    visualInspectionItems: [
      {
        id: "7.6.1.2.A.1",
        description:
          "Compare equipment nameplate data with drawings and specifications.",
        result: "",
      },
      {
        id: "7.6.1.2.A.2",
        description: "Inspect physical and mechanical condition.",
        result: "",
      },
      {
        id: "7.6.1.2.A.3",
        description: "Inspect anchorage and alignment.",
        result: "",
      },
      {
        id: "7.6.1.2.A.4",
        description:
          "Verify that all maintenance devices are available for servicing and operating the breaker.",
        result: "",
      },
      {
        id: "7.6.1.2.A.5",
        description: "Verify the unit is clean.",
        result: "",
      },
      {
        id: "7.6.1.2.A.6",
        description: "Verify the arc chutes are intact.",
        result: "",
      },
      {
        id: "7.6.1.2.A.7",
        description:
          "Inspect moving and stationary contacts for condition and alignment.",
        result: "",
      },
      {
        id: "7.6.1.2.A.8",
        description:
          "Verify that primary and secondary contact wipe and other dimensions vital to satisfactory operation of the breaker are correct.",
        result: "",
      },
      {
        id: "7.6.1.2.A.9",
        description:
          "Perform all mechanical operator and contact alignment tests on both the breaker and its operating mechanism in accordance with manufacturer's published data.",
        result: "",
      },
      {
        id: "7.6.1.2.A.10.1",
        description:
          "Use of a low-resistance ohmmeter in accordance with Section 7.6.1.2.B.1.",
        result: "",
      },
      {
        id: "7.6.1.2.A.11",
        description: "Verify cell fit and element alignment.",
        result: "",
      },
      {
        id: "7.6.1.2.A.12",
        description: "Verify racking mechanism operation.",
        result: "",
      },
      {
        id: "7.6.1.2.A.13",
        description:
          "Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.",
        result: "",
      },
      {
        id: "7.6.1.2.A.14",
        description:
          "Perform adjustments for final protective device settings in accordance with coordination study provided by end user.",
        result: "",
      },
    ],
    // Device Settings (Thermal/Magnetic)
    deviceSettings: {
      asFound: { thermal: "", magnetic: "" },
      asLeft: { thermal: "", magnetic: "" },
    },
    // Contact Resistance (Same as Electronic)
    contactResistance: { p1: "", p2: "", p3: "", unit: "µΩ" },
    // Insulation Resistance (Same as Electronic)
    insulationResistance: {
      testVoltage: "1000V",
      unit: "MΩ",
      measured: {
        poleToPole: { p1p2: "", p2p3: "", p3p1: "" },
        poleToFrame: { p1: "", p2: "", p3: "" },
        lineToLoad: { p1: "", p2: "", p3: "" },
      },
      corrected: {
        poleToPole: { p1p2: "", p2p3: "", p3p1: "" },
        poleToFrame: { p1: "", p2: "", p3: "" },
        lineToLoad: { p1: "", p2: "", p3: "" },
      },
    },
    // Primary Injection (Thermal/Magnetic)
    primaryInjection: {
      testedSettings: { thermal: "", magnetic: "" },
      results: {
        thermal: {
          amperes1: "",
          multiplierTolerance: "300%",
          toleranceMinPct: "",
          toleranceMaxPct: "",
          amperes2: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: { sec: "", a: "" },
          pole2: { sec: "", a: "" },
          pole3: { sec: "", a: "" },
        },
        magnetic: {
          amperes1: "",
          multiplierTolerance: "-10% 10%",
          toleranceMinPct: "-10%",
          toleranceMaxPct: "10%",
          amperes2: "",
          toleranceMin: "",
          toleranceMax: "",
          pole1: { sec: "", a: "" },
          pole2: { sec: "", a: "" },
          pole3: { sec: "", a: "" },
        },
      },
    },
    // Test Equipment (Same as Electronic)
    testEquipment: {
      megohmmeter: { name: "", serialNumber: "", ampId: "", calDate: "" },
      lowResistanceOhmmeter: {
        name: "",
        serialNumber: "",
        ampId: "",
        calDate: "",
      },
      primaryInjectionTestSet: {
        name: "",
        serialNumber: "",
        ampId: "",
        calDate: "",
      },
    },
    comments: "",
    status: "PASS", // Default status
  });

  // --- Load Job Info (Keep from Electronic) ---
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
      alert(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!reportId) {
        setLoading(false);
      }
    }
  };

  // --- Load Report (Adapt for Thermal-Magnetic) ---
  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      // Load from circuit breaker thermal magnetic ATS table
      const { data: generic, error: gErr } = await supabase
        .schema("neta_ops")
        .from("low_voltage_circuit_breaker_thermal_magnetic_ats")
        .select("*")
        .eq("id", reportId)
        .single();

      if (generic) {
        const data = generic;
        setFormData((prev) => ({
          ...prev,
          // Job info from report_info JSONB column
          customer: maskCustomerName(
            data.report_info?.customer ?? prev.customer,
          ),
          address: maskCustomerAddress(
            data.report_info?.address ?? prev.address,
          ),
          user: data.report_info?.user ?? prev.user,
          date: data.report_info?.date ?? prev.date,
          identifier: data.report_info?.identifier ?? prev.identifier,
          jobNumber: data.report_info?.jobNumber ?? prev.jobNumber,
          technicians: data.report_info?.technicians ?? prev.technicians,
          temperature: {
            ...prev.temperature,
            fahrenheit:
              data.report_info?.temperature?.fahrenheit ??
              prev.temperature.fahrenheit,
            celsius:
              data.report_info?.temperature?.celsius ??
              prev.temperature.celsius,
            tcf: data.report_info?.temperature?.tcf ?? prev.temperature.tcf,
            humidity:
              data.report_info?.temperature?.humidity ??
              prev.temperature.humidity,
          },
          substation: data.report_info?.substation ?? prev.substation,
          eqptLocation: data.report_info?.eqptLocation ?? prev.eqptLocation,

          // Nameplate from nameplate_data JSONB column
          manufacturer: data.nameplate_data?.manufacturer ?? prev.manufacturer,
          catalogNumber:
            data.nameplate_data?.catalogNumber ?? prev.catalogNumber,
          serialNumber: data.nameplate_data?.serialNumber ?? prev.serialNumber,
          type: data.nameplate_data?.type ?? prev.type,
          icRating: data.nameplate_data?.icRating ?? prev.icRating,
          frameSize: data.nameplate_data?.frameSize ?? prev.frameSize,
          ratingPlug: data.nameplate_data?.ratingPlug ?? prev.ratingPlug,
          curveNo: data.nameplate_data?.curveNo ?? prev.curveNo,
          operation: data.nameplate_data?.operation ?? prev.operation,
          mounting: data.nameplate_data?.mounting ?? prev.mounting,
          thermalMemory:
            data.nameplate_data?.thermalMemory ?? prev.thermalMemory,

          // Visual / Mechanical from visual_mechanical JSONB column
          visualInspectionItems: prev.visualInspectionItems.map((item) => ({
            ...item,
            result:
              (data.visual_mechanical?.items &&
                data.visual_mechanical.items.find(
                  (vi: any) => vi.id === item.id,
                )?.result) ||
              item.result,
          })),

          // Device Settings from device_settings JSONB column
          deviceSettings: data.device_settings ?? prev.deviceSettings,

          // Contact Resistance from contact_resistance JSONB column
          contactResistance: data.contact_resistance ?? prev.contactResistance,

          // Insulation Resistance from insulation_resistance JSONB column
          insulationResistance:
            data.insulation_resistance ?? prev.insulationResistance,

          // Primary Injection from primary_injection JSONB column
          primaryInjection: data.primary_injection ?? prev.primaryInjection,

          // Test Equipment from test_equipment JSONB column - merge to preserve structure
          testEquipment: {
            megohmmeter: {
              ...prev.testEquipment.megohmmeter,
              ...(data.test_equipment?.megohmmeter || {}),
            },
            lowResistanceOhmmeter: {
              ...prev.testEquipment.lowResistanceOhmmeter,
              ...(data.test_equipment?.lowResistanceOhmmeter || {}),
            },
            primaryInjectionTestSet: {
              ...prev.testEquipment.primaryInjectionTestSet,
              ...(data.test_equipment?.primaryInjectionTestSet || {}),
            },
          },

          // Comments & Status
          comments: data.comments ?? prev.comments,
          status: data.report_info?.status ?? prev.status,
        }));
        setIsEditing(false);
        setLoading(false);
        return;
      }

      // If no data found, handle as new report
      if (gErr) {
        if (gErr.code === "PGRST116") {
          console.warn(
            `Report with ID ${reportId} not found. Starting new report.`,
          );
          setIsEditing(true);
        } else {
          throw gErr;
        }
      }
    } catch (error) {
      console.error("Error loading report:", error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  // --- Save Report (Adapt for Thermal-Magnetic) ---
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    setIsSaving(true);

    // Structure data for Supabase JSONB columns matching the new FormData
    const reportPayload = {
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
        temperature: formData.temperature,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        status: formData.status,
      },
      nameplate_data: {
        manufacturer: formData.manufacturer,
        catalogNumber: formData.catalogNumber,
        serialNumber: formData.serialNumber,
        type: formData.type,
        icRating: formData.icRating,
        frameSize: formData.frameSize,
        ratingPlug: formData.ratingPlug,
        curveNo: formData.curveNo,
        operation: formData.operation,
        mounting: formData.mounting,
        thermalMemory: formData.thermalMemory,
      },
      visual_mechanical: {
        items: formData.visualInspectionItems,
      },
      device_settings: formData.deviceSettings,
      contact_resistance: formData.contactResistance,
      insulation_resistance: formData.insulationResistance,
      primary_injection: formData.primaryInjection,
      test_equipment: formData.testEquipment,
      comments: formData.comments,
    };

    try {
      let result;
      // *** IMPORTANT: Use the correct table name for Thermal-Magnetic reports ***
      const tableName = "low_voltage_circuit_breaker_thermal_magnetic_ats"; // Placeholder

      if (reportId) {
        // Update existing report
        result = await supabase
          .schema("neta_ops")
          .from(tableName)
          .update(reportPayload)
          .eq("id", reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema("neta_ops")
          .from(tableName)
          .insert(reportPayload)
          .select()
          .single();

        // Create asset entry for the new report
        if (result.data) {
          const newReportId = result.data.id;
          const assetData = {
            // *** Update Asset Name and URL ***
            name: getAssetName(
              reportSlug,
              formData.identifier || formData.eqptLocation || "",
            ),
            file_url: `report:/jobs/${jobId}/low-voltage-circuit-breaker-thermal-magnetic-ats-report/${newReportId}`, // Needs routing
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
        }
      }

      if (result.error) throw result.error;

      setJustSaved(true);
      if (!reportId) {
        setIsEditing(false);
        const newId = (result as any)?.data?.id || (result as any)?.id;
        if (newId) {
          setCurrentReportId(newId);
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      }
    } catch (error: any) {
      console.error("Error saving report:", error);
      let errorMessage = "Unknown error";
      if (error) {
        if (error.message) errorMessage = error.message;
        if (error.details) errorMessage += ` Details: ${error.details}`;
        if (error.hint) errorMessage += ` Hint: ${error.hint}`;
      }
      alert(`Failed to save report: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportId) {
      setIsEditing(false);
    }
  };

  // --- useEffect for loading data (Keep from Electronic) ---
  useEffect(() => {
    if (jobId) {
      loadJobInfo();
    }
    if (reportId) {
      loadReport();
    } else {
      setLoading(false);
      setIsEditing(true);
    }
  }, [jobId, reportId]);

  // Reset isEditing state when reportId changes
  useEffect(() => {
    setIsEditing(!reportId);
  }, [reportId]);

  // --- Temperature Handlers (Keep from Electronic) ---
  const handleFahrenheitChange = (fahrenheit: number) => {
    setJustSaved(false);
    const calculatedCelsius = ((fahrenheit - 32) * 5) / 9;
    const roundedCelsius = Math.round(calculatedCelsius);
    const tcf = getTCF(roundedCelsius);

    setFormData((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius: roundedCelsius,
        tcf,
      },
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    setJustSaved(false);
    const fahrenheit = (celsius * 9) / 5 + 32;
    const tcf = getTCF(celsius);

    setFormData((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius,
        tcf,
      },
    }));
  };

  // Helper: parse a single multiplier like "300%", "3", "3x", "2.5 x"
  const parseMultiplier = (input: string): number | null => {
    if (!input) return null;
    const s = input.trim().toLowerCase();
    // Handle percentage like "300%"
    const percentMatch = s.match(/^([+-]?[\d.]+)\s*%$/);
    if (percentMatch) {
      const v = Number(percentMatch[1]);
      return isNaN(v) ? null : v / 100;
    }
    // Handle factors like "3x" or "3"
    const factorMatch = s.match(/^([+-]?[\d.]+)\s*(x)?$/);
    if (factorMatch) {
      const v = Number(factorMatch[1]);
      return isNaN(v) ? null : v;
    }
    return null;
  };

  // Helper: parse tolerance range like "-10% 10%" or "-15 5%" → decimals [-0.1, 0.1]
  const parseToleranceRange = (
    input: string,
  ): { min: number; max: number } | null => {
    if (!input) return null;
    const tokens = input.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    // Try to extract two numeric tokens possibly with % signs
    const nums: number[] = [];
    for (const t of tokens) {
      const m = t.match(/^([+-]?[\d.]+)\s*%?$/);
      if (m) {
        const v = Number(m[1]);
        if (!isNaN(v)) nums.push(v);
      }
    }
    if (nums.length >= 2) {
      const a = nums[0] / 100;
      const b = nums[1] / 100;
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
    // Handle formats like "+/-10%" or "±10%" ONLY if explicit plus/minus sign markup exists
    if (/±|\+\/-/.test(input)) {
      const plusMinus = input.match(/([\d.]+)\s*%/);
      if (plusMinus) {
        const v = Number(plusMinus[1]);
        if (!isNaN(v)) {
          const d = v / 100;
          return { min: -d, max: d };
        }
      }
    }
    return null;
  };

  // Calculate second amperes value using multiplier if provided.
  const calculateSecondAmperes = (
    firstAmperes: string,
    multiplierOrTolerance: string,
  ): string => {
    if (!firstAmperes || firstAmperes === "") return "";
    if (firstAmperes === "N/A") return "N/A";

    // If the field looks like a tolerance range (e.g., "-10% 10%"), don't change amperes
    const tol = parseToleranceRange(multiplierOrTolerance);
    if (tol) return firstAmperes;

    const mult = parseMultiplier(multiplierOrTolerance);
    if (mult === null) return firstAmperes;

    const base = Number(firstAmperes);
    if (isNaN(base)) return "";
    const result = base * mult;
    return isNaN(result) ? "" : result.toString();
  };

  // Calculate tolerance values based on an entered tolerance range string.
  // Min: base * (1 + minTol), Max: base * (1 + maxTol)
  const calculateMagneticTolerance = (
    amperes2: string,
    toleranceRange: string,
    isMin: boolean,
  ): string => {
    if (!amperes2 || amperes2 === "") return "";
    if (amperes2 === "N/A") return "N/A";
    const baseValue = Number(amperes2);
    if (isNaN(baseValue)) return "";
    const parsed = parseToleranceRange(toleranceRange) || {
      min: -0.1,
      max: 0.1,
    };
    const delta = isMin ? parsed.min : parsed.max;
    const result = baseValue * (1 + delta);
    return result.toString();
  };

  // --- Insulation Resistance Calculation (Keep from Electronic) ---
  useEffect(() => {
    if (!isEditing) return;

    const calculateCorrectedValue = (value: string): string => {
      if (value === "" || value === null || value === undefined) {
        return "";
      }
      const trimmedValue = value.toString().trim();
      const numericValue = parseFloat(trimmedValue);
      // If input contains symbols/letters (e.g., "<22", ">2200", "N/A"), copy as-is
      if (isNaN(numericValue) || trimmedValue !== numericValue.toString()) {
        return trimmedValue;
      }
      const tcf = formData.temperature.tcf;
      if (!tcf || tcf === 0) return numericValue.toFixed(2);
      return (numericValue * tcf).toFixed(2);
    };

    const newCorrected = {
      poleToPole: {
        p1p2: calculateCorrectedValue(
          formData.insulationResistance.measured.poleToPole.p1p2,
        ),
        p2p3: calculateCorrectedValue(
          formData.insulationResistance.measured.poleToPole.p2p3,
        ),
        p3p1: calculateCorrectedValue(
          formData.insulationResistance.measured.poleToPole.p3p1,
        ),
      },
      poleToFrame: {
        p1: calculateCorrectedValue(
          formData.insulationResistance.measured.poleToFrame.p1,
        ),
        p2: calculateCorrectedValue(
          formData.insulationResistance.measured.poleToFrame.p2,
        ),
        p3: calculateCorrectedValue(
          formData.insulationResistance.measured.poleToFrame.p3,
        ),
      },
      lineToLoad: {
        p1: calculateCorrectedValue(
          formData.insulationResistance.measured.lineToLoad.p1,
        ),
        p2: calculateCorrectedValue(
          formData.insulationResistance.measured.lineToLoad.p2,
        ),
        p3: calculateCorrectedValue(
          formData.insulationResistance.measured.lineToLoad.p3,
        ),
      },
    };

    setFormData((prev) => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        corrected: newCorrected,
      },
    }));
  }, [
    JSON.stringify(formData.insulationResistance.measured),
    formData.temperature.tcf,
    isEditing,
  ]);

  // --- Generic Handle Change (Keep from Electronic, may need adjustments for primary injection) ---
  const handleChange = (path: string, value: any) => {
    setJustSaved(false);
    if (!isEditing) return;

    setFormData((prev) => {
      const newState = { ...prev };
      const keys = path.split(".");
      let currentLevel: any = newState;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const arrayMatch = key.match(/(\w+)\[(\d+)\]/); // Handle array notation like visualInspectionItems[0]

        if (arrayMatch) {
          const arrayKey = arrayMatch[1];
          const index = parseInt(arrayMatch[2], 10);
          if (!currentLevel[arrayKey]) currentLevel[arrayKey] = [];
          if (!currentLevel[arrayKey][index]) {
            // Initialize default object if accessing new array index
            if (arrayKey === "visualInspectionItems") {
              currentLevel[arrayKey][index] = {
                id: "",
                description: "",
                result: "",
              };
            } else {
              currentLevel[arrayKey][index] = {}; // Default for other potential arrays
            }
          }
          currentLevel = currentLevel[arrayKey][index];
        } else {
          if (currentLevel[key] === undefined || currentLevel[key] === null) {
            currentLevel[key] = {}; // Ensure nested object exists
          }
          // Check if it's actually an object before diving deeper
          if (
            typeof currentLevel[key] !== "object" ||
            currentLevel[key] === null
          ) {
            currentLevel[key] = {}; // Overwrite if it's not an object (e.g., was a string)
          }

          currentLevel = currentLevel[key];
        }
        // Safety check: if currentLevel becomes null/undefined unexpectedly, stop.
        if (currentLevel === null || currentLevel === undefined) {
          console.error(`Error navigating path: ${path} at key: ${key}`);
          return prev; // Return previous state to avoid errors
        }
      }

      const finalKey = keys[keys.length - 1];
      // Check if the final key is an array index, although unlikely with this structure
      const finalArrayMatch = finalKey.match(/(\w+)\[(\d+)\]/);
      if (finalArrayMatch) {
        const arrayKey = finalArrayMatch[1];
        const index = parseInt(finalArrayMatch[2], 10);
        if (!currentLevel[arrayKey]) currentLevel[arrayKey] = [];
        currentLevel[arrayKey][index] = value;
      } else {
        currentLevel[finalKey] = value;
      }

      return newState;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // --- Render Component (Adapt JSX for Thermal-Magnetic) ---
  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6 relative">
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
          NETA - ATS 7.6.1.2
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
      {/* Print-only Job Information header and table at top */}
      <div className="hidden print:block w-full h-1 bg-[#f26722] mb-2"></div>
      <h2 className="hidden print:block text-xl font-semibold mb-2 text-black border-b border-black pb-1">
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
          temperature: {
            fahrenheit: formData.temperature?.fahrenheit,
            celsius: formData.temperature?.celsius,
            tcf: formData.temperature?.tcf,
            humidity: formData.temperature?.humidity,
          },
        }}
      />
      <div className="p-6 flex justify-center bg-neutral-50 dark:bg-dark-150">
        <div className="max-w-7xl w-full space-y-6">
          <ReportHeader
            title={reportName}
            isAutoSaving={false}
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

          {/* --- Job Information Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 print:hidden">
              {/* Column 1 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="customer"
                    className="form-label inline-block w-32"
                  >
                    Customer:
                  </label>
                  <input
                    id="customer"
                    type="text"
                    value={maskCustomerName(formData.customer)}
                    readOnly={true}
                    className="form-input flex-1 bg-neutral-100 dark:bg-dark-150"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="address"
                    className="form-label inline-block w-32"
                  >
                    Address:
                  </label>
                  <input
                    id="address"
                    type="text"
                    value={maskCustomerAddress(formData.address)}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    readOnly={!isEditing}
                    className={`form-input flex-1 dark:bg-dark-150 ${!isEditing ? "bg-neutral-100" : ""}`}
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="user"
                    className="form-label inline-block w-32"
                  >
                    User:
                  </label>
                  <input
                    id="user"
                    type="text"
                    value={formData.user}
                    onChange={(e) => handleChange("user", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="date"
                    className="form-label inline-block w-32"
                  >
                    Date:
                  </label>
                  <input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => handleChange("date", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="identifier"
                    className="form-label inline-block w-32"
                  >
                    Identifier:
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    value={formData.identifier}
                    onChange={(e) => handleChange("identifier", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="jobNumber"
                    className="form-label inline-block w-32"
                  >
                    Job #:
                  </label>
                  <input
                    id="jobNumber"
                    type="text"
                    value={formData.jobNumber}
                    readOnly={true}
                    className="form-input flex-1 bg-neutral-100 dark:bg-dark-150"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="technicians"
                    className="form-label inline-block w-32"
                  >
                    Technicians:
                  </label>
                  <input
                    id="technicians"
                    type="text"
                    value={formData.technicians}
                    onChange={(e) =>
                      handleChange("technicians", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="substation"
                    className="form-label inline-block w-32"
                  >
                    Substation:
                  </label>
                  <input
                    id="substation"
                    type="text"
                    value={formData.substation}
                    onChange={(e) => handleChange("substation", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="eqptLocation"
                    className="form-label inline-block w-32"
                  >
                    Eqpt. Location:
                  </label>
                  <input
                    id="eqptLocation"
                    type="text"
                    value={formData.eqptLocation}
                    onChange={(e) =>
                      handleChange("eqptLocation", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                {/* Temperature Fields */}
                <div className="mb-4 flex items-center space-x-2">
                  <label className="form-label inline-block w-auto">
                    Temp:
                  </label>
                  <input
                    type="number"
                    value={formData.temperature.fahrenheit}
                    onChange={(e) =>
                      handleFahrenheitChange(Number(e.target.value))
                    }
                    readOnly={!isEditing}
                    className="form-input w-20"
                  />
                  <span>°F</span>
                  <input
                    type="number"
                    value={formData.temperature.celsius}
                    readOnly
                    className="form-input w-20 bg-neutral-100 dark:bg-dark-150"
                  />
                  <span>°C</span>
                  <label className="form-label inline-block w-auto ml-4">
                    TCF:
                  </label>
                  <input
                    type="number"
                    value={formData.temperature.tcf}
                    readOnly
                    className="form-input w-24 bg-neutral-100 dark:bg-dark-150"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="humidity"
                    className="form-label inline-block w-32"
                  >
                    Humidity:
                  </label>
                  <input
                    id="humidity"
                    type="number"
                    value={formData.temperature.humidity || ""}
                    onChange={(e) =>
                      handleChange(
                        "temperature.humidity",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    readOnly={!isEditing}
                    className="form-input w-20"
                  />
                  <span className="ml-2">%</span>
                </div>
              </div>
            </div>
            {/* removed duplicate job info print table */}
          </div>

          {/* --- Nameplate Data Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Nameplate Data
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 print:hidden nameplate-onscreen">
              {/* Column 1 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="manufacturer"
                    className="form-label inline-block w-32"
                  >
                    Manufacturer:
                  </label>
                  <input
                    id="manufacturer"
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) =>
                      handleChange("manufacturer", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="catalogNumber"
                    className="form-label inline-block w-32"
                  >
                    Catalog Number:
                  </label>
                  <input
                    id="catalogNumber"
                    type="text"
                    value={formData.catalogNumber}
                    onChange={(e) =>
                      handleChange("catalogNumber", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="serialNumber"
                    className="form-label inline-block w-32"
                  >
                    Serial Number:
                  </label>
                  <input
                    id="serialNumber"
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) =>
                      handleChange("serialNumber", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="type"
                    className="form-label inline-block w-32"
                  >
                    Type:
                  </label>
                  <input
                    id="type"
                    type="text"
                    value={formData.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="icRating"
                    className="form-label inline-block w-32"
                  >
                    IC Rating:
                  </label>
                  <input
                    id="icRating"
                    type="text"
                    value={formData.icRating}
                    onChange={(e) => handleChange("icRating", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="frameSize"
                    className="form-label inline-block w-32"
                  >
                    Frame Size:
                  </label>
                  <input
                    id="frameSize"
                    type="text"
                    value={formData.frameSize}
                    onChange={(e) => handleChange("frameSize", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="ratingPlug"
                    className="form-label inline-block w-32"
                  >
                    Rating Plug:
                  </label>
                  <input
                    id="ratingPlug"
                    type="text"
                    value={formData.ratingPlug}
                    onChange={(e) => handleChange("ratingPlug", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="curveNo"
                    className="form-label inline-block w-32"
                  >
                    Curve No.:
                  </label>
                  <input
                    id="curveNo"
                    type="text"
                    value={formData.curveNo}
                    onChange={(e) => handleChange("curveNo", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="operation"
                    className="form-label inline-block w-32"
                  >
                    Operation:
                  </label>
                  <input
                    id="operation"
                    type="text"
                    value={formData.operation}
                    onChange={(e) => handleChange("operation", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="mounting"
                    className="form-label inline-block w-32"
                  >
                    Mounting:
                  </label>
                  <input
                    id="mounting"
                    type="text"
                    value={formData.mounting}
                    onChange={(e) => handleChange("mounting", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="thermalMemory"
                    className="form-label inline-block w-32"
                  >
                    Thermal Memory:
                  </label>
                  <input
                    id="thermalMemory"
                    type="text"
                    value={formData.thermalMemory}
                    onChange={(e) =>
                      handleChange("thermalMemory", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
              </div>
            </div>
            {/* Print-only Nameplate Table (Thermal Magnetic specific) */}
            <div className="hidden print:block mt-2">
              <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print:border text-[0.85rem]">
                <colgroup>
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-0">{formData.manufacturer || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Catalog No.:</div>
                      <div className="mt-0">{formData.catalogNumber || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">{formData.serialNumber || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Type:</div>
                      <div className="mt-0">{formData.type || ""}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Frame Size (A):</div>
                      <div className="mt-0">{formData.frameSize || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Rating Plug (A):</div>
                      <div className="mt-0">{formData.ratingPlug || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Curve No.:</div>
                      <div className="mt-0">{formData.curveNo || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">IC Rating (kA):</div>
                      <div className="mt-0">{formData.icRating || ""}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Operation:</div>
                      <div className="mt-0">{formData.operation || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Mounting:</div>
                      <div className="mt-0">{formData.mounting || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">Thermal Memory:</div>
                      <div className="mt-0">{formData.thermalMemory || ""}</div>
                    </td>
                    <td className="p-2 align-top border border-neutral-300 print:border-black print:border">
                      <div className="font-semibold">&nbsp;</div>
                      <div className="mt-0">&nbsp;</div>
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
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600 table-fixed">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "65%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      NETA Section
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Description
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white break-words">
                        {item.id}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                        {item.description}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                        <select
                          value={item.result}
                          onChange={(e) =>
                            handleChange(
                              `visualInspectionItems[${index}].result`,
                              e.target.value,
                            )
                          }
                          disabled={!isEditing}
                          className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          <option value=""></option>
                          {visualInspectionResultsOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {/* As Found Table */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-center dark:text-white">
                  Settings As Found
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                    <thead className="bg-neutral-50 dark:bg-dark-150">
                      <tr>
                        <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"></th>
                        <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                          Setting
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                      <tr>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                          Thermal
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asFound.thermal}
                            onChange={(e) =>
                              handleChange(
                                "deviceSettings.asFound.thermal",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                          Magnetic
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asFound.magnetic}
                            onChange={(e) =>
                              handleChange(
                                "deviceSettings.asFound.magnetic",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              {/* As Left Table */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-center dark:text-white">
                  Settings As Left
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                    <thead className="bg-neutral-50 dark:bg-dark-150">
                      <tr>
                        <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"></th>
                        <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                          Setting
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                      <tr>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                          Thermal
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asLeft.thermal}
                            onChange={(e) =>
                              handleChange(
                                "deviceSettings.asLeft.thermal",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                          Magnetic
                        </td>
                        <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asLeft.magnetic}
                            onChange={(e) =>
                              handleChange(
                                "deviceSettings.asLeft.magnetic",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* --- Electrical Tests - Contact/Pole Resistance Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Contact/Pole Resistance
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600 table-fixed">
                <colgroup>
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={3}
                    >
                      Contact Resistance
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      P1
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      P2
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      P3
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p1}
                        onChange={(e) =>
                          handleChange("contactResistance.p1", e.target.value)
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p2}
                        onChange={(e) =>
                          handleChange("contactResistance.p2", e.target.value)
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p3}
                        onChange={(e) =>
                          handleChange("contactResistance.p3", e.target.value)
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <select
                        value={formData.contactResistance.unit}
                        onChange={(e) =>
                          handleChange("contactResistance.unit", e.target.value)
                        }
                        disabled={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {contactResistanceUnitsOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
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
            <div className="flex justify-end mb-4">
              <label
                htmlFor="insulationTestVoltage"
                className="form-label mr-2"
              >
                Test Voltage:
              </label>
              <select
                id="insulationTestVoltage"
                value={formData.insulationResistance.testVoltage}
                onChange={(e) =>
                  handleChange(
                    "insulationResistance.testVoltage",
                    e.target.value,
                  )
                }
                disabled={!isEditing}
                className="form-select w-32"
              >
                {insulationTestVoltageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600 ins-res-table">
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "9%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"
                      rowSpan={2}
                    ></th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={3}
                    >
                      Measured Values
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={3}
                    >
                      Temperature Corrected
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      rowSpan={2}
                    >
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-xs font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      P1 (P1-P2)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-xs font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      P2 (P2-P3)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-xs font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      P3 (P3-P1)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-xs font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      P1 (P1-P2)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-xs font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      P2 (P2-P3)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-xs font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      P3 (P3-P1)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {/* Pole to Pole (Closed) */}
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                      Pole to Pole (Closed)
                    </td>
                    {/* Measured Values */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.poleToPole.p1p2
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.poleToPole.p1p2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.poleToPole.p2p3
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.poleToPole.p2p3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.poleToPole.p3p1
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.poleToPole.p3p1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.poleToPole
                            .p1p2
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.poleToPole
                            .p2p3
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.poleToPole
                            .p3p1
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    {/* Units */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.unit",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnitsOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {/* Pole to Frame (Closed) */}
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                      Pole to Frame (Closed)
                    </td>
                    {/* Measured Values */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.poleToFrame.p1
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.poleToFrame.p1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.poleToFrame.p2
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.poleToFrame.p2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.poleToFrame.p3
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.poleToFrame.p3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.poleToFrame.p1
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.poleToFrame.p2
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.poleToFrame.p3
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    {/* Units */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.unit",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnitsOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {/* Line to Load (Open) */}
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                      Line to Load (Open)
                    </td>
                    {/* Measured Values */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.lineToLoad.p1
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.lineToLoad.p1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.lineToLoad.p2
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.lineToLoad.p2",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.measured.lineToLoad.p3
                        }
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.measured.lineToLoad.p3",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.lineToLoad.p1
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.lineToLoad.p2
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={
                          formData.insulationResistance.corrected.lineToLoad.p3
                        }
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150 text-center"
                      />
                    </td>
                    {/* Units */}
                    <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) =>
                          handleChange(
                            "insulationResistance.unit",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnitsOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Electrical Tests - Primary Injection Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Primary Injection
            </h2>

            {/* Tested Settings Table */}
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2 text-center dark:text-white">
                Tested Settings
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600">
                  <thead className="bg-neutral-50 dark:bg-dark-150">
                    <tr>
                      <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"></th>
                      <th className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                        Setting
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                        Thermal
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.testedSettings.thermal
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.testedSettings.thermal",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-900 dark:text-white">
                        Magnetic
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-center">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.testedSettings.magnetic
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.testedSettings.magnetic",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Primary Injection Results Table */}
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600 primary-injection-table">
                <colgroup>
                  <col style={{ width: "16%" }} /> {/* Function */}
                  <col style={{ width: "10%" }} /> {/* Amperes 1 */}
                  <col style={{ width: "12%" }} /> {/* Multiplier Tolerance */}
                  <col style={{ width: "10%" }} /> {/* Amperes 2 */}
                  <col style={{ width: "8%" }} /> {/* Tol Min */}
                  <col style={{ width: "8%" }} /> {/* Tol Max */}
                  <col style={{ width: "12%" }} /> {/* Pole 1 */}
                  <col style={{ width: "12%" }} /> {/* Pole 2 */}
                  <col style={{ width: "12%" }} /> {/* Pole 3 */}
                </colgroup>
                <caption className="caption-top p-2 text-lg font-medium text-neutral-900 dark:text-white">
                  Primary Injection
                </caption>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"
                      rowSpan={2}
                    >
                      Function
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Amperes
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Multiplier Tolerance
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Amperes
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={2}
                    >
                      Tolerance
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white"
                      colSpan={3}
                    >
                      Pole
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"></th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"></th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white"></th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Min
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white">
                      Max
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Pole 1
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Pole 2
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center text-sm font-medium text-neutral-900 dark:text-white">
                      Pole 3
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {/* Thermal Row */}
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                      Thermal
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={
                          formData.primaryInjection.results.thermal.amperes1
                        }
                        onChange={(e) =>
                          handleChange(
                            "primaryInjection.results.thermal.amperes1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={
                          formData.primaryInjection.results.thermal
                            .multiplierTolerance
                        }
                        onChange={(e) =>
                          handleChange(
                            "primaryInjection.results.thermal.multiplierTolerance",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={calculateSecondAmperes(
                          formData.primaryInjection.results.thermal.amperes1,
                          formData.primaryInjection.results.thermal
                            .multiplierTolerance,
                        )}
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={
                          formData.primaryInjection.results.thermal.toleranceMin
                        }
                        onChange={(e) =>
                          handleChange(
                            "primaryInjection.results.thermal.toleranceMin",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={
                          formData.primaryInjection.results.thermal.toleranceMax
                        }
                        onChange={(e) =>
                          handleChange(
                            "primaryInjection.results.thermal.toleranceMax",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.results.thermal.pole1.sec
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.results.thermal.pole1.sec",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-12 h-7 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"} ${!isEditing ? "" : "focus:border-[#f26722] focus:ring-[#f26722]"}`}
                        />
                        <span className="text-xs">sec.</span>
                      </div>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.results.thermal.pole2.sec
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.results.thermal.pole2.sec",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-12 h-7 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"} ${!isEditing ? "" : "focus:border-[#f26722] focus:ring-[#f26722]"}`}
                        />
                        <span className="text-xs">sec.</span>
                      </div>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.results.thermal.pole3.sec
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.results.thermal.pole3.sec",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-12 h-7 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"} ${!isEditing ? "" : "focus:border-[#f26722] focus:ring-[#f26722]"}`}
                        />
                        <span className="text-xs">sec.</span>
                      </div>
                    </td>
                  </tr>
                  {/* Magnetic Row */}
                  <tr>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                      Magnetic
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={
                          formData.primaryInjection.results.magnetic.amperes1
                        }
                        onChange={(e) =>
                          handleChange(
                            "primaryInjection.results.magnetic.amperes1",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <div className="grid grid-cols-2 gap-1">
                        <div className="flex items-center">
                          <input
                            type="text"
                            value={(
                              formData.primaryInjection.results.magnetic
                                .toleranceMinPct || ""
                            ).replace(/%/g, "")}
                            onChange={(e) => {
                              const v = `${e.target.value}`.replace(
                                /[^0-9.-]/g,
                                "",
                              );
                              handleChange(
                                "primaryInjection.results.magnetic.toleranceMinPct",
                                v ? `${v}%` : "",
                              );
                              const combined =
                                `${v ? `${v}%` : ""} ${formData.primaryInjection.results.magnetic.toleranceMaxPct || ""}`.trim();
                              handleChange(
                                "primaryInjection.results.magnetic.multiplierTolerance",
                                combined,
                              );
                            }}
                            readOnly={!isEditing}
                            className={`tol-pct-input w-full p-2 text-center border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                          <span className="ml-1 text-sm text-neutral-900 dark:text-white">
                            %
                          </span>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="text"
                            value={(
                              formData.primaryInjection.results.magnetic
                                .toleranceMaxPct || ""
                            ).replace(/%/g, "")}
                            onChange={(e) => {
                              const v = `${e.target.value}`.replace(
                                /[^0-9.-]/g,
                                "",
                              );
                              handleChange(
                                "primaryInjection.results.magnetic.toleranceMaxPct",
                                v ? `${v}%` : "",
                              );
                              const combined =
                                `${formData.primaryInjection.results.magnetic.toleranceMinPct || ""} ${v ? `${v}%` : ""}`.trim();
                              handleChange(
                                "primaryInjection.results.magnetic.multiplierTolerance",
                                combined,
                              );
                            }}
                            readOnly={!isEditing}
                            className={`tol-pct-input w-full p-2 text-center border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                          <span className="ml-1 text-sm text-neutral-900 dark:text-white">
                            %
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={calculateSecondAmperes(
                          formData.primaryInjection.results.magnetic.amperes1,
                          `${formData.primaryInjection.results.magnetic.toleranceMinPct || ""} ${formData.primaryInjection.results.magnetic.toleranceMaxPct || ""}`.trim(),
                        )}
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={calculateMagneticTolerance(
                          calculateSecondAmperes(
                            formData.primaryInjection.results.magnetic.amperes1,
                            `${formData.primaryInjection.results.magnetic.toleranceMinPct || ""} ${formData.primaryInjection.results.magnetic.toleranceMaxPct || ""}`.trim(),
                          ),
                          `${formData.primaryInjection.results.magnetic.toleranceMinPct || ""} ${formData.primaryInjection.results.magnetic.toleranceMaxPct || ""}`.trim(),
                          true,
                        )}
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-3 py-2">
                      <input
                        type="text"
                        value={calculateMagneticTolerance(
                          calculateSecondAmperes(
                            formData.primaryInjection.results.magnetic.amperes1,
                            `${formData.primaryInjection.results.magnetic.toleranceMinPct || ""} ${formData.primaryInjection.results.magnetic.toleranceMaxPct || ""}`.trim(),
                          ),
                          `${formData.primaryInjection.results.magnetic.toleranceMinPct || ""} ${formData.primaryInjection.results.magnetic.toleranceMaxPct || ""}`.trim(),
                          false,
                        )}
                        readOnly
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-150"
                      />
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.results.magnetic.pole1.a
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.results.magnetic.pole1.a",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-12 h-7 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"} ${!isEditing ? "" : "focus:border-[#f26722] focus:ring-[#f26722]"}`}
                        />
                        <span className="text-xs">A</span>
                      </div>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.results.magnetic.pole2.a
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.results.magnetic.pole2.a",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-12 h-7 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"} ${!isEditing ? "" : "focus:border-[#f26722] focus:ring-[#f26722]"}`}
                        />
                        <span className="text-xs">A</span>
                      </div>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <input
                          type="text"
                          value={
                            formData.primaryInjection.results.magnetic.pole3.a
                          }
                          onChange={(e) =>
                            handleChange(
                              "primaryInjection.results.magnetic.pole3.a",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`w-12 h-7 text-sm text-center border border-neutral-300 dark:border-neutral-600 rounded ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"} ${!isEditing ? "" : "focus:border-[#f26722] focus:ring-[#f26722]"}`}
                        />
                        <span className="text-xs">A</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Test Equipment Used Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            <div className="grid grid-cols-1 gap-y-4">
              {/* Megohmmeter */}
              <div className="flex items-center">
                <label className="form-label inline-block w-48">
                  Megohmmeter:
                </label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={(value) =>
                    handleChange("testEquipment.megohmmeter.name", value)
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
                    setFormData((p) => ({
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
                  className="flex-1"
                />
                <label className="form-label inline-block w-32 ml-4">
                  Serial Number:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.serialNumber}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.megohmmeter.serialNumber",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
                <label className="form-label inline-block w-24 ml-4">
                  AMP ID:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.ampId}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.megohmmeter.ampId",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
                <label className="form-label inline-block w-24 ml-4">
                  Cal Date:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.calDate}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.megohmmeter.calDate",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
              </div>
              {/* Low Resistance Ohmmeter */}
              <div className="flex items-center">
                <label className="form-label inline-block w-48">
                  Low-Resistance Ohmmeter:
                </label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.lowResistanceOhmmeter.name}
                  onChange={(value) =>
                    handleChange(
                      "testEquipment.lowResistanceOhmmeter.name",
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
                    setFormData((p) => ({
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
                  className="flex-1"
                />
                <label className="form-label inline-block w-32 ml-4">
                  Serial Number:
                </label>
                <input
                  type="text"
                  value={
                    formData.testEquipment.lowResistanceOhmmeter.serialNumber
                  }
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.lowResistanceOhmmeter.serialNumber",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
                <label className="form-label inline-block w-24 ml-4">
                  AMP ID:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.lowResistanceOhmmeter.ampId}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.lowResistanceOhmmeter.ampId",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
                <label className="form-label inline-block w-24 ml-4">
                  Cal Date:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.lowResistanceOhmmeter.calDate}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.lowResistanceOhmmeter.calDate",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
              </div>
              {/* Primary Injection Test Set */}
              <div className="flex items-center">
                <label className="form-label inline-block w-48">
                  Primary Injection Test Set:
                </label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.primaryInjectionTestSet.name}
                  onChange={(value) =>
                    handleChange(
                      "testEquipment.primaryInjectionTestSet.name",
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
                    setFormData((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        primaryInjectionTestSet: {
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
                  className="flex-1"
                />
                <label className="form-label inline-block w-32 ml-4">
                  Serial Number:
                </label>
                <input
                  type="text"
                  value={
                    formData.testEquipment.primaryInjectionTestSet.serialNumber
                  }
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.primaryInjectionTestSet.serialNumber",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
                <label className="form-label inline-block w-24 ml-4">
                  AMP ID:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.primaryInjectionTestSet.ampId}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.primaryInjectionTestSet.ampId",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
                <label className="form-label inline-block w-24 ml-4">
                  Cal Date:
                </label>
                <input
                  type="text"
                  value={formData.testEquipment.primaryInjectionTestSet.calDate}
                  onChange={(e) =>
                    handleChange(
                      "testEquipment.primaryInjectionTestSet.calDate",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className="form-input flex-1"
                />
              </div>
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
            <div className="mb-4 print:hidden">
              <textarea
                value={formData.comments}
                onChange={(e) => handleChange("comments", e.target.value)}
                readOnly={!isEditing}
                className={`w-full p-2 rounded-none border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                rows={4}
              />
            </div>
            {formData.comments?.trim() && (
              <div className="hidden print:block mt-2">
                <table className="w-full table-fixed border-collapse border border-neutral-300 print:border-black print:border">
                  <tbody>
                    <tr>
                      <td
                        className="p-2 align-top border border-neutral-300 print:border-black print:border"
                        style={{ minHeight: "140px" }}
                      >
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
                  reportId || window.location.pathname.split("/").pop();
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

// Readability/style tweaks for on-screen Primary Injection table
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @media screen {
      .primary-injection-table input,
      .primary-injection-table select {
        font-size: 12px !important;
        height: 28px !important;
        padding: 2px 4px !important;
      }
      .primary-injection-table td { vertical-align: middle !important; }
      .primary-injection-table span { font-size: 12px !important; }
      /* Make bottom tolerance inputs wider so values are readable */
      .primary-injection-table .tol-pct-input {
        min-width: 38px !important;
        width: 42px !important;
        height: 26px !important;
        padding: 2px !important;
      }
      .primary-injection-table .tol-pct-input + span { margin-left: 4px !important; }
    }
  `;
  document.head.appendChild(style);
}

// Add print styles
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      * { color: black !important; }
      /* Ensure print:hidden and on-screen nameplate grid are hidden */
      .print\:hidden { display: none !important; }
      .grid.print\:hidden, .flex.print\:hidden { display: none !important; }
      .nameplate-onscreen { display: none !important; }

      /* Keep Comments header and box together and prevent clipping */
      .comments-section { page-break-inside: avoid !important; break-inside: avoid !important; }
      .comments-section h2 { page-break-after: avoid !important; }
      .comments-section table { page-break-inside: avoid !important; break-inside: avoid !important; }
      .comments-section td { height: 140px !important; vertical-align: top !important; }

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

      /* Ultra-compact font sizes for Visual and Mechanical Inspection table */
      .border.border-neutral-300.dark\\:border-neutral-600.px-4.py-2.text-sm.text-neutral-900.dark\\:text-white.break-words {
        font-size: 6px !important;
        line-height: 1.0 !important;
        padding: 2px 4px !important;
        max-width: 200px !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
      }

      .border.border-neutral-300.dark\\:border-neutral-600.px-4.py-2.text-sm.text-neutral-900.dark\\:text-white {
        font-size: 6px !important;
        line-height: 1.0 !important;
        padding: 2px 4px !important;
      }

      .border.border-neutral-300.dark\\:border-neutral-600.px-4.py-2.text-center {
        font-size: 7px !important;
        padding: 2px 2px !important;
      }

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

      /* Status box styling for print */
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
        margin-top: 4px !important;
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

      /* Ensure proper page breaks */
      .mb-6 { margin-bottom: 20px !important; }
      .space-y-6 > * + * { margin-top: 20px !important; }

      /* Grid layouts for forms */
      .grid-cols-1 { grid-template-columns: 1fr !important; }
      .grid-cols-2 { grid-template-columns: 1fr 1fr !important; }
      .grid-cols-3 { grid-template-columns: 1fr 1fr 1fr !important; }
      .grid-cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr !important; }
      .grid-cols-5 { grid-template-columns: 1fr 1fr 1fr 1fr 1fr !important; }
      .grid-cols-6 { grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr !important; }

      /* Labels and text */
      label {
        font-size: 10px !important;
        font-weight: bold !important;
        margin-bottom: 2px !important;
        display: block !important;
      }

      /* Headers */
      h1 { font-size: 18px !important; font-weight: bold !important; }
      h2 { font-size: 14px !important; font-weight: bold !important; }
      h3 { font-size: 12px !important; font-weight: bold !important; }

      /* Ensure all text is black for maximum readability */
      * { color: black !important; }

      /* Fix specific table column widths for better layout */
      .w-24 { width: 6rem !important; }
      .w-32 { width: 8rem !important; }
      .w-40 { width: 10rem !important; }
      .w-48 { width: 12rem !important; }

      /* Overflow handling */
      .overflow-x-auto { overflow: visible !important; }

      /* Prevent text from breaking out of containers */
      div, span, p {
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }

      /* Insulation Resistance and Primary Injection explicit widths for PDF */
      .ins-res-table { table-layout: fixed !important; width: 100% !important; }
      .ins-res-table col:nth-child(1) { width: 16% !important; }
      .ins-res-table col:nth-child(2),
      .ins-res-table col:nth-child(3),
      .ins-res-table col:nth-child(4),
      .ins-res-table col:nth-child(5),
      .ins-res-table col:nth-child(6),
      .ins-res-table col:nth-child(7) { width: 12.5% !important; }
      .ins-res-table col:nth-child(8) { width: 9% !important; }

      .primary-injection-table { table-layout: fixed !important; width: 100% !important; }
      .primary-injection-table col:nth-child(1) { width: 16% !important; }
      .primary-injection-table col:nth-child(2) { width: 10% !important; }
      .primary-injection-table col:nth-child(3) { width: 12% !important; }
      .primary-injection-table col:nth-child(4) { width: 10% !important; }
      .primary-injection-table col:nth-child(5) { width: 8% !important; }
      .primary-injection-table col:nth-child(6) { width: 8% !important; }
      .primary-injection-table col:nth-child(7),
      .primary-injection-table col:nth-child(8),
      .primary-injection-table col:nth-child(9) { width: 12% !important; }
    }
  `;
  document.head.appendChild(style);
}

export default LowVoltageCircuitBreakerThermalMagneticATSReport;
