import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
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

const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString();
  return tcfTable[key] !== undefined ? tcfTable[key] : 1;
};

const visualInspectionOptions = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const testVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];
const passFailOptions = ["PASS", "FAIL", "N/A"];
const TURNS_RATIO_WINDING_LABELS = {
  h1h2: "H1-H2",
  h2h3: "H2-H3",
  h3h1: "H3-H1",
} as const;
const connectionOptions = ["Delta", "Wye", "Single Phase"];
const materialOptions = ["Aluminum", "Copper"];

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
    correctionFactor: number;
  };
  substation: string;
  eqptLocation: string;

  // Nameplate Data
  nameplate: {
    manufacturer: string;
    kvaBase: string;
    kvaCooling: string;
    voltsPrimary: string;
    voltsPrimarySecondary: string;
    voltsSecondary: string;
    voltsSecondarySecondary: string;
    connectionsPrimary: "Delta" | "Wye" | "Single Phase";
    connectionsSecondary: "Delta" | "Wye" | "Single Phase";
    windingMaterialPrimary: "Aluminum" | "Copper";
    windingMaterialSecondary: "Aluminum" | "Copper";
    catalogNumber: string;
    tempRise: string;
    serialNumber: string;
    impedance: string;
    tapVoltages: string[];
    tapPosition: string;
    tapPositionLeftVolts: string;
    tapPositionLeftPercent: string;
  };

  // Indicator Gauge Values
  indicatorGauges: {
    liquidLevel: string;
    temperature: string;
    pressureVacuum: string;
  };

  // Visual and Mechanical Inspection
  visualInspectionItems: Array<{
    netaSection: string;
    description: string;
    result: string;
    comments?: string;
  }>;
  visualInspectionComments: string;

  // Electrical Tests - Measured Insulation Resistance
  insulationResistance: {
    tests: Array<{
      winding: string;
      testVoltage: string;
      measured0_5Min: string;
      measured1Min: string;
      units: string;
      corrected0_5Min: string;
      corrected1Min: string;
      correctedUnits: string;
      tableMinimum: string;
      tableMinimumUnits: string;
      dielectricAbsorption: string;
    }>;
    dielectricAbsorptionAcceptable: string;
  };

  // Electrical Tests - Turns Ratio
  turnsRatio: {
    secondaryWindingVoltage: string;
    tests: Array<{
      tap: string;
      nameplateVoltage: string;
      calculatedRatio: string;
      measuredH1H2: string;
      devH1H2: string;
      passFailH1H2: string;
      measuredH2H3: string;
      devH2H3: string;
      passFailH2H3: string;
      measuredH3H1: string;
      devH3H1: string;
      passFailH3H1: string;
    }>;
  };

  // Test Equipment Used
  testEquipment: {
    megohmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
    ttrTestSet: {
      name: string;
      serialNumber: string;
      ampId: string;
      calDate: string;
    };
  };

  comments: string;
  status: "PASS" | "FAIL";
}

const initialVisualInspectionItems = [
  {
    netaSection: "7.2.1.1.A.1",
    description: "Inspect physical and mechanical condition.",
    result: "",
  },
  {
    netaSection: "7.2.1.1.A.2",
    description: "Inspect anchorage, alignment, and grounding.",
    result: "",
  },
  {
    netaSection: "7.2.1.1.A.3",
    description: "*Prior to cleaning the unit, perform as-found tests.",
    result: "",
  },
  { netaSection: "7.2.1.1.A.4", description: "Clean the unit.", result: "" },
  {
    netaSection: "7.2.1.1.A.5",
    description:
      "Inspect bolted electrical connections for high resistance using a low-resistance ohmmeter",
    result: "",
  },
  {
    netaSection: "7.2.1.1.A.6.1",
    description: "Perform as-left tests.",
    result: "",
  },
  {
    netaSection: "7.2.1.1.A.7",
    description: "Verify that as-left tap connections are as specified.",
    result: "",
  },
];

const initialInsulationResistanceTests = [
  {
    winding: "Primary to Ground",
    testVoltage: "1000V",
    measured0_5Min: "",
    measured1Min: "",
    units: "GΩ",
    corrected0_5Min: "",
    corrected1Min: "",
    correctedUnits: "GΩ",
    tableMinimum: "100.5",
    tableMinimumUnits: "GΩ",
    dielectricAbsorption: "",
  },
  {
    winding: "Secondary to Ground",
    testVoltage: "500V",
    measured0_5Min: "",
    measured1Min: "",
    units: "GΩ",
    corrected0_5Min: "",
    corrected1Min: "",
    correctedUnits: "GΩ",
    tableMinimum: "",
    tableMinimumUnits: "GΩ",
    dielectricAbsorption: "",
  },
  {
    winding: "Primary to Secondary",
    testVoltage: "1000V",
    measured0_5Min: "",
    measured1Min: "",
    units: "GΩ",
    corrected0_5Min: "",
    corrected1Min: "",
    correctedUnits: "GΩ",
    tableMinimum: "",
    tableMinimumUnits: "GΩ",
    dielectricAbsorption: "",
  },
];

const TwoSmallDryTyperXfmrMTSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
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

  // Print Mode Detection
  const isPrintMode = searchParams.get("print") === "true";

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = "two-small-dry-typer-xfmr-mts-report"; // This component handles the two-small-dry-typer-xfmr-mts-report route
  const reportName = getReportName(reportSlug);
  const [error, setError] = useState<string | null>(null);
  const isUpdatingTemp = useRef<boolean>(false);

  const [formData, setFormData] = useState<FormData>({
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split("T")[0],
    identifier: "",
    jobNumber: "",
    technicians: "",
    temperature: {
      fahrenheit: 68,
      celsius: 20,
      tcf: 1,
      humidity: 50,
      correctionFactor: 1,
    },
    substation: "",
    eqptLocation: "",
    nameplate: {
      manufacturer: "",
      kvaBase: "",
      kvaCooling: "",
      voltsPrimary: "",
      voltsPrimarySecondary: "",
      voltsSecondary: "",
      voltsSecondarySecondary: "",
      connectionsPrimary: "Delta",
      connectionsSecondary: "Wye",
      windingMaterialPrimary: "Aluminum",
      windingMaterialSecondary: "Copper",
      catalogNumber: "",
      tempRise: "",
      serialNumber: "",
      impedance: "",
      tapVoltages: Array(7).fill(""),
      tapPosition: "1",
      tapPositionLeftVolts: "",
      tapPositionLeftPercent: "",
    },
    indicatorGauges: { liquidLevel: "", temperature: "", pressureVacuum: "" },
    visualInspectionItems: JSON.parse(
      JSON.stringify(initialVisualInspectionItems),
    ),
    visualInspectionComments: "",
    insulationResistance: {
      tests: JSON.parse(JSON.stringify(initialInsulationResistanceTests)),
      dielectricAbsorptionAcceptable: "Yes",
    },
    turnsRatio: {
      secondaryWindingVoltage: "",
      tests: Array(1)
        .fill(null)
        .map(() => ({
          tap: "3",
          nameplateVoltage: "",
          calculatedRatio: "",
          measuredH1H2: "",
          devH1H2: "",
          passFailH1H2: "",
          measuredH2H3: "",
          devH2H3: "",
          passFailH2H3: "",
          measuredH3H1: "",
          devH3H1: "",
          passFailH3H1: "",
        })),
    },
    testEquipment: {
      megohmmeter: { name: "", serialNumber: "", ampId: "", calDate: "" },
      ttrTestSet: { name: "", serialNumber: "", ampId: "", calDate: "" },
    },
    comments: "",
    status: "PASS",
  });

  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("title, job_number, customer_id, site_address")
        .eq("id", jobId)
        .single();
      if (jobError) throw jobError;

      let customerName = "";
      let customerAddress = (jobData as any).site_address || "";
      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema("common")
          .from("customers")
          .select("name, company_name, address")
          .eq("id", jobData.customer_id)
          .single();
        if (customerError) throw customerError;
        customerName = customerData?.company_name || customerData?.name || "";
        // Prefer site_address from job, fallback to customer address
        customerAddress =
          (jobData as any).site_address ||
          customerData?.address ||
          customerAddress ||
          "";
      }
      setFormData((prev) => ({
        ...prev,
        jobNumber: jobData?.job_number || "",
        customer: maskCustomerName(customerName),
        address: customerAddress,
        user: prev.user || "",
      }));
    } catch (error) {
      console.error("Error loading job info:", error);
      setError(`Failed to load job information: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  const loadReport = async () => {
    // CRITICAL: Check this FIRST before checking !currentReportId
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("two_small_dry_type_xfmr_mts_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) throw error;

      if (data && data.report_data) {
        // Parse the saved data and merge with current formData structure
        console.log("Loading report data:", data.report_data);
        console.log("Loading testEquipment:", data.report_data.testEquipment);
        setFormData((prev) => ({
          ...prev,
          ...data.report_data,
          // Ensure nested objects are properly structured
          nameplate: {
            ...prev.nameplate,
            ...(data.report_data.nameplate || {}),
          },
          temperature: {
            ...prev.temperature,
            ...(data.report_data.temperature || {}),
          },
          indicatorGauges: {
            ...prev.indicatorGauges,
            ...(data.report_data.indicatorGauges || {}),
          },
          insulationResistance: {
            tests:
              data.report_data.insulationResistance?.tests ||
              JSON.parse(JSON.stringify(initialInsulationResistanceTests)),
            dielectricAbsorptionAcceptable:
              data.report_data.insulationResistance
                ?.dielectricAbsorptionAcceptable || "Yes",
          },
          turnsRatio: {
            secondaryWindingVoltage:
              data.report_data.turnsRatio?.secondaryWindingVoltage || "",
            tests:
              data.report_data.turnsRatio?.tests ||
              Array(1)
                .fill(null)
                .map(() => ({
                  tap: "3",
                  nameplateVoltage: "",
                  calculatedRatio: "",
                  measuredH1H2: "",
                  devH1H2: "",
                  passFailH1H2: "",
                  measuredH2H3: "",
                  devH2H3: "",
                  passFailH2H3: "",
                  measuredH3H1: "",
                  devH3H1: "",
                  passFailH3H1: "",
                })),
          },
          testEquipment: {
            ...prev.testEquipment,
            ...(data.report_data.testEquipment || {}),
          },
          visualInspectionItems:
            data.report_data.visualInspectionItems ||
            JSON.parse(JSON.stringify(initialVisualInspectionItems)),
          status: data.report_data.status || "PASS",
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error loading report:", error);
      setError(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentReportId) {
      loadJobInfo();
    }
    loadReport();
  }, [loadJobInfo, currentReportId]);

  useEffect(() => {
    if (!isEditing || isUpdatingTemp.current) return;

    isUpdatingTemp.current = true;

    if (formData.temperature.fahrenheit) {
      const newCelsius = ((formData.temperature.fahrenheit - 32) * 5) / 9;
      const newTcf = getTCF(newCelsius);

      setFormData((prev) => ({
        ...prev,
        temperature: {
          ...prev.temperature,
          celsius: parseFloat(newCelsius.toFixed(2)),
          tcf: newTcf,
          correctionFactor: newTcf,
        },
      }));
    }

    setTimeout(() => {
      isUpdatingTemp.current = false;
    }, 0);
  }, [formData.temperature.fahrenheit, isEditing]);

  const calculateCorrectedIRValue = (value: string, tcf: number): string => {
    if (!value) return "";
    const num = parseFloat(String(value).trim());
    if (!isNaN(num)) return (num * tcf).toFixed(2);
    return String(value).trim();
  };

  useEffect(() => {
    const tcf = getTCF(formData.temperature.celsius);

    // Calculate corrected values for each test
    const nextTests = formData.insulationResistance.tests.map((test) => {
      const corrected0_5Min = calculateCorrectedIRValue(
        test.measured0_5Min,
        tcf,
      );
      const corrected1Min = calculateCorrectedIRValue(test.measured1Min, tcf);

      // Calculate dielectric absorption ratio (1 min / 0.5 min)
      let dielectricAbsorption = "";
      if (test.measured1Min && test.measured0_5Min) {
        const num1 = parseFloat(String(test.measured1Min));
        const num05 = parseFloat(String(test.measured0_5Min));
        const ratio = num1 / num05;
        if (!isNaN(ratio) && isFinite(ratio)) {
          dielectricAbsorption = ratio.toFixed(2);
        }
      }

      return {
        ...test,
        corrected0_5Min,
        corrected1Min,
        dielectricAbsorption,
      };
    });

    // Prevent update loops: only set if values actually changed
    const prevTests = formData.insulationResistance.tests;
    const changed = JSON.stringify(nextTests) !== JSON.stringify(prevTests);
    if (!changed) return;

    // Determine if all DA values are acceptable (> 1)
    const daValues = nextTests.map((test) =>
      parseFloat(test.dielectricAbsorption),
    );
    const daAcceptable = daValues.every((v) => !isNaN(v) && v > 1)
      ? "Yes"
      : "No";

    setFormData((prev) => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        tests: nextTests,
        dielectricAbsorptionAcceptable: daAcceptable,
      },
    }));
  }, [formData.insulationResistance.tests, formData.temperature.celsius]);

  // Add new effect to update nameplate voltage ratios
  useEffect(() => {
    if (!isEditing) return;

    setFormData((prev) => {
      const newTurnsRatioTests = prev.turnsRatio.tests.map((test) => {
        const tapIndex = parseInt(test.tap) - 1;
        if (tapIndex >= 0 && tapIndex < prev.nameplate.tapVoltages.length) {
          const tapVoltage = prev.nameplate.tapVoltages[tapIndex];
          if (tapVoltage) {
            return { ...test, nameplateVoltage: tapVoltage };
          }
        }
        return test;
      });

      return {
        ...prev,
        turnsRatio: {
          ...prev.turnsRatio,
          tests: newTurnsRatioTests,
        },
      };
    });
  }, [formData.nameplate.tapVoltages, isEditing]);

  // Update the turns ratio calculation effect
  useEffect(() => {
    if (!isEditing) return;

    setFormData((prev) => {
      const newTurnsRatioTests = prev.turnsRatio.tests.map((test) => {
        // Get the nameplate voltage for this tap
        const tapIndex = parseInt(test.tap) - 1;
        const tapVoltage = prev.nameplate.tapVoltages[tapIndex];

        // Calculate the ratio: Always use tapVoltage / secondaryVoltage
        let calculatedRatio = "";
        const secondaryVoltage = parseFloat(
          prev.turnsRatio.secondaryWindingVoltage,
        );
        const primaryVoltage = parseFloat(tapVoltage);

        if (
          primaryVoltage &&
          !isNaN(primaryVoltage) &&
          secondaryVoltage &&
          !isNaN(secondaryVoltage)
        ) {
          calculatedRatio = (primaryVoltage / secondaryVoltage).toFixed(4);
        }

        // Calculate deviations and pass/fail for each measurement
        const calculateDeviationAndResult = (
          measured: string,
          calculated: string,
        ) => {
          if (!measured || !calculated) return { deviation: "", passFail: "" };

          const measuredValue = parseFloat(measured);
          const calculatedValue = parseFloat(calculated);

          if (isNaN(measuredValue) || isNaN(calculatedValue))
            return { deviation: "", passFail: "" };

          // Correct formula: (calculated - measured) / calculated * 100
          const deviation = (
            ((calculatedValue - measuredValue) / calculatedValue) *
            100
          ).toFixed(3);
          const deviationValue = parseFloat(deviation);

          // Determine pass/fail based on ±0.5% threshold
          const passFail =
            deviationValue > -0.501 && deviationValue < 0.501 ? "PASS" : "FAIL";

          return { deviation, passFail };
        };

        // Calculate for H1-H2
        const h1h2Results = calculateDeviationAndResult(
          test.measuredH1H2,
          calculatedRatio,
        );
        // Calculate for H2-H3
        const h2h3Results = calculateDeviationAndResult(
          test.measuredH2H3,
          calculatedRatio,
        );
        // Calculate for H3-H1
        const h3h1Results = calculateDeviationAndResult(
          test.measuredH3H1,
          calculatedRatio,
        );

        return {
          ...test,
          calculatedRatio,
          devH1H2: h1h2Results.deviation,
          passFailH1H2: h1h2Results.passFail,
          devH2H3: h2h3Results.deviation,
          passFailH2H3: h2h3Results.passFail,
          devH3H1: h3h1Results.deviation,
          passFailH3H1: h3h1Results.passFail,
        };
      });

      return {
        ...prev,
        turnsRatio: {
          ...prev.turnsRatio,
          tests: newTurnsRatioTests,
        },
      };
    });
  }, [
    formData.nameplate.tapVoltages,
    formData.turnsRatio.secondaryWindingVoltage,
    formData.turnsRatio.tests.map((t) => t.tap).join(","),
    formData.turnsRatio.tests.map((t) => t.measuredH1H2).join(","),
    formData.turnsRatio.tests.map((t) => t.measuredH2H3).join(","),
    formData.turnsRatio.tests.map((t) => t.measuredH3H1).join(","),
    isEditing,
  ]);

  const handleFahrenheitChange = (fahrenheit: number) => {
    if (!isEditing) return;
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
      },
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    if (!isEditing) return;
    setJustSaved(false);
    const newFahrenheit = (celsius * 9) / 5 + 32;
    const newTcf = getTCF(celsius);

    setFormData((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        celsius,
        fahrenheit: parseFloat(newFahrenheit.toFixed(2)),
        tcf: newTcf,
      },
    }));
  };

  const getTableMinimum = (voltage: string): string => {
    if (!voltage) return "";
    const volts = parseFloat(voltage);
    if (isNaN(volts)) return "";

    if (volts <= 600) return "0.5";
    if (volts <= 5000) return "5";
    return "25";
  };

  const handleChange = (field: string, value: any) => {
    if (!isEditing) return;
    setJustSaved(false);

    setFormData((prev) => {
      const newData = { ...prev };

      // Handle nested fields (including multi-level nesting like testEquipment.megohmmeter.name)
      if (field.includes(".")) {
        const parts = field.split(".");
        let current = newData as any;

        // Navigate to the parent object
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        // Set the value on the final property
        current[parts[parts.length - 1]] = value;

        // Auto-fill secondary winding voltage when nameplate secondary voltage changes
        if (field === "nameplate.voltsSecondary") {
          newData.turnsRatio.secondaryWindingVoltage = value;
        }
      } else {
        (newData as any)[field] = value;
      }

      // Calculate table minimum values based on voltage
      if (
        field === "nameplate.voltsPrimary" ||
        field === "nameplate.voltsSecondary"
      ) {
        const primaryVoltage = parseFloat(newData.nameplate.voltsPrimary) || 0;
        const secondaryVoltage =
          parseFloat(newData.nameplate.voltsSecondary) || 0;

        // Update table minimum values based on voltage ranges for each test
        newData.insulationResistance.tests =
          newData.insulationResistance.tests.map((test, index) => {
            let tableMinimum = "0.5"; // Default for 0-600V
            const tableMinimumUnits = "GΩ";

            // Primary to Ground (index 0) - use primary voltage
            if (index === 0) {
              if (primaryVoltage > 5000) {
                tableMinimum = "25";
              } else if (primaryVoltage > 600) {
                tableMinimum = "5";
              }
            }
            // Secondary to Ground (index 1) - use secondary voltage
            else if (index === 1) {
              if (secondaryVoltage > 5000) {
                tableMinimum = "25";
              } else if (secondaryVoltage > 600) {
                tableMinimum = "5";
              }
            }
            // Primary to Secondary (index 2) - use primary voltage
            else if (index === 2) {
              if (primaryVoltage > 5000) {
                tableMinimum = "25";
              } else if (primaryVoltage > 600) {
                tableMinimum = "5";
              }
            }

            return {
              ...test,
              tableMinimum,
              tableMinimumUnits,
            };
          });
      }

      return newData;
    });
  };

  const handleArrayChange = (
    section: keyof FormData,
    index: number,
    field: string,
    value: any,
  ) => {
    if (!isEditing) return;
    setJustSaved(false);
    setFormData((prev) => {
      const newArray = [...(prev[section] as any[])];
      newArray[index] = { ...newArray[index], [field]: value };
      return { ...prev, [section]: newArray };
    });
  };

  const handleNestedArrayChange = (
    sectionKey: keyof Pick<FormData, "insulationResistance" | "turnsRatio">,
    testIndex: number,
    field: string,
    value: any,
  ) => {
    if (!isEditing) return;
    setJustSaved(false);
    setFormData((prev) => {
      const section = prev[sectionKey] as any;
      const newTests = [...section.tests];
      newTests[testIndex] = { ...newTests[testIndex], [field]: value };

      // Auto-fill nameplate voltage ratio when tap changes in turns ratio section
      if (sectionKey === "turnsRatio" && field === "tap") {
        const tapIndex = parseInt(value) - 1;
        if (tapIndex >= 0 && tapIndex < prev.nameplate.tapVoltages.length) {
          const tapVoltage = prev.nameplate.tapVoltages[tapIndex];
          if (tapVoltage) {
            newTests[testIndex].nameplateVoltage = tapVoltage;
          }
        }
      }

      return { ...prev, [sectionKey]: { ...section, tests: newTests } };
    });
  };

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema("neta_ops")
          .from("two_small_dry_type_xfmr_mts_reports")
          .update(reportPayload)
          .eq("id", reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema("neta_ops")
            .from("two_small_dry_type_xfmr_mts_reports")
            .insert(reportPayload)
            .select()
            .single();

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;

            const assetData = {
              name: getAssetName(
                reportSlug,
                formData.identifier ||
                  formData.eqptLocation ||
                  formData.location ||
                  "",
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
  }, [jobId, user?.id, formData, reportSlug]);

  // Auto-save effect with debounce (MUST be placed AFTER autoSave function definition)
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
    const wasExistingReport = Boolean(currentReportId || reportIdRef.current);

    console.log("Saving formData:", formData);
    console.log("Saving testEquipment:", formData.testEquipment);

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData,
      created_at: currentReportId ? undefined : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema("neta_ops")
          .from("two_small_dry_type_xfmr_mts_reports")
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
          .from("two_small_dry_type_xfmr_mts_reports")
          .update(reportPayload)
          .eq("id", createdReportId)
          .select()
          .single();
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema("neta_ops")
            .from("two_small_dry_type_xfmr_mts_reports")
            .insert(reportPayload)
            .select()
            .single();

          if (result.data) {
            reportIdRef.current = result.data.id;
            setCurrentReportId(result.data.id);

            const assetData = {
              name: getAssetName(
                reportSlug,
                formData.identifier ||
                  formData.eqptLocation ||
                  formData.location ||
                  "",
              ),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
              user_id: user.id,
            };
            const { data: assetResult, error: assetError } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert(assetData)
              .select("id")
              .single();

            if (assetError) throw assetError;
            if (!assetResult)
              throw new Error("Failed to retrieve ID for new asset.");

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

      if (result?.error) throw result.error;

      if (!wasExistingReport) {
        setIsEditing(false);
        const newId = (result as any)?.data?.id;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      } else {
        setJustSaved(true);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-semibold dark:text-white">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-semibold text-red-500">Error: {error}</div>
      </div>
    );
  }

  const renderHeader = () => (
    <ReportHeader
      title={reportName}
      isAutoSaving={isAutoSaving}
      isEditing={isEditing}
      justSaved={justSaved}
      isSaving={isSaving || loading}
      status={formData.status}
      hasReport={!!currentReportId}
      onStatusToggle={() => {
        if (isEditing) {
          setJustSaved(false);
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
  );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print-report-header print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6 print:pb-2 print:mb-4">
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
          <h1 className="text-2xl font-bold text-black mb-1 print:text-sm print:mb-0 print:leading-snug">
            {reportName}
          </h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c", width: "120px" }}
        >
          NETA - MTS 7.2.1.1
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

      <div className="two-small-xfmr-mts-print-root w-full">
        {/* Header with title and buttons */}
        <div className={`${isPrintMode ? "hidden" : ""} print:hidden`}>
          {renderHeader()}
        </div>

        <section className="mb-6 print:mb-3">
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Job Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
            <div>
              <label htmlFor="customer" className="form-label">
                Customer:
              </label>
              <input
                id="customer"
                type="text"
                name="customer"
                value={maskCustomerName(formData.customer)}
                onChange={(e) => handleChange("customer", e.target.value)}
                readOnly
                className={`form-input text-sm bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`}
              />
            </div>
            <div>
              <label htmlFor="address" className="form-label">
                Address:
              </label>
              <input
                id="address"
                type="text"
                name="address"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                readOnly
                className={`form-input text-sm bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`}
              />
            </div>
            <div>
              <label htmlFor="jobNumber" className="form-label">
                Job Number:
              </label>
              <input
                id="jobNumber"
                type="text"
                name="jobNumber"
                value={formData.jobNumber}
                onChange={(e) => handleChange("jobNumber", e.target.value)}
                readOnly
                className={`form-input text-sm bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`}
              />
            </div>
            <div>
              <label htmlFor="date" className="form-label">
                Date:
              </label>
              <input
                id="date"
                type="date"
                name="date"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
                readOnly={!isEditing}
                className={`form-input text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            <div>
              <label htmlFor="technicians" className="form-label">
                Technicians:
              </label>
              <input
                id="technicians"
                type="text"
                name="technicians"
                value={formData.technicians}
                onChange={(e) => handleChange("technicians", e.target.value)}
                readOnly={!isEditing}
                className={`form-input text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            <div>
              <label htmlFor="identifier" className="form-label">
                Identifier:
              </label>
              <input
                id="identifier"
                type="text"
                name="identifier"
                value={formData.identifier}
                onChange={(e) => handleChange("identifier", e.target.value)}
                readOnly={!isEditing}
                className={`form-input text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-2">
              <div>
                <label htmlFor="tempF" className="form-label">
                  Temp (°F):
                </label>
                <div className="flex items-center">
                  <input
                    id="tempF"
                    type="number"
                    value={formData.temperature.fahrenheit}
                    onChange={(e) =>
                      handleFahrenheitChange(parseFloat(e.target.value))
                    }
                    readOnly={!isEditing}
                    className={`form-input text-sm w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="tempC" className="form-label">
                  Temp (°C):
                </label>
                <div className="flex items-center">
                  <input
                    id="tempC"
                    type="number"
                    value={formData.temperature.celsius}
                    onChange={(e) =>
                      handleCelsiusChange(parseFloat(e.target.value))
                    }
                    readOnly={!isEditing}
                    className={`form-input text-sm w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="user" className="form-label">
                User:
              </label>
              <input
                id="user"
                type="text"
                name="user"
                value={formData.user}
                onChange={(e) => handleChange("user", e.target.value)}
                readOnly={!isEditing}
                className={`form-input text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            <div>
              <label htmlFor="humidity" className="form-label">
                Humidity (%):
              </label>
              <div className="flex items-center">
                <input
                  id="humidity"
                  type="number"
                  name="temperature.humidity"
                  value={formData.temperature.humidity}
                  onChange={(e) =>
                    handleChange(
                      "temperature.humidity",
                      parseFloat(e.target.value),
                    )
                  }
                  readOnly={!isEditing}
                  className={`form-input text-sm w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="flex items-center mt-auto mb-1">
              <label className="form-label mr-2">TCF:</label>
              <span className="font-medium text-neutral-900 dark:text-white">
                {formData.temperature.tcf}
              </span>
            </div>
            <div>
              <label htmlFor="substation" className="form-label">
                Substation:
              </label>
              <input
                id="substation"
                type="text"
                name="substation"
                value={formData.substation}
                onChange={(e) => handleChange("substation", e.target.value)}
                readOnly={!isEditing}
                className={`form-input text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
            <div>
              <label htmlFor="eqptLocation" className="form-label">
                Eqpt. Location:
              </label>
              <input
                id="eqptLocation"
                type="text"
                name="eqptLocation"
                value={formData.eqptLocation}
                onChange={(e) => handleChange("eqptLocation", e.target.value)}
                readOnly={!isEditing}
                className={`form-input text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
          </div>

          {/* Print-only Job Information table */}
          <div className="report-section-content hidden print:block">
            <JobInfoPrintTable
              data={{
                customer: maskCustomerName(formData.customer),
                address: formData.address,
                jobNumber: formData.jobNumber,
                technicians: formData.technicians,
                date: formData.date,
                identifier: formData.identifier,
                user: formData.user,
                substation: formData.substation,
                eqptLocation: formData.eqptLocation,
                temperature: { ...formData.temperature },
              }}
            />
          </div>
        </section>

        <section className="mb-6 print:mb-3">
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Nameplate Data
          </h2>

          {/* On-screen form - hidden in print */}
          <div className="space-y-4 print:hidden nameplate-onscreen">
            {/* Row 1: Manufacturer, Catalog, Serial */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Manufacturer
                </label>
                <input
                  type="text"
                  value={formData.nameplate.manufacturer}
                  onChange={(e) =>
                    handleChange("nameplate.manufacturer", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Catalog Number
                </label>
                <input
                  type="text"
                  value={formData.nameplate.catalogNumber}
                  onChange={(e) =>
                    handleChange("nameplate.catalogNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.nameplate.serialNumber}
                  onChange={(e) =>
                    handleChange("nameplate.serialNumber", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>

            {/* Row 2: KVA, Temp Rise, Impedance */}
            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  KVA
                </label>
                <div className="flex items-center space-x-1 mt-1">
                  <input
                    type="text"
                    value={formData.nameplate.kvaBase}
                    onChange={(e) =>
                      handleChange("nameplate.kvaBase", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`w-20 rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                  <span className="text-neutral-500">/</span>
                  <input
                    type="text"
                    value={formData.nameplate.kvaCooling}
                    onChange={(e) =>
                      handleChange("nameplate.kvaCooling", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`w-20 rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Temp. Rise (°C)
                </label>
                <input
                  type="text"
                  value={formData.nameplate.tempRise}
                  onChange={(e) =>
                    handleChange("nameplate.tempRise", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Impedance (%)
                </label>
                <input
                  type="text"
                  value={formData.nameplate.impedance}
                  onChange={(e) =>
                    handleChange("nameplate.impedance", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>

            {/* Row 3: Headers */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 mt-4">
              <div>{/* Empty cell for alignment */}</div>
              <div className="text-center font-medium text-sm text-neutral-700 dark:text-white">
                Volts
              </div>
              <div className="text-center font-medium text-sm text-neutral-700 dark:text-white">
                Connections
              </div>
              <div className="text-center font-medium text-sm text-neutral-700 dark:text-white">
                Winding Material
              </div>
            </div>

            {/* Row 4: Primary */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
              <div className="text-sm font-medium text-neutral-700 dark:text-white">
                Primary
              </div>
              {/* Volts */}
              <div className="flex items-center justify-center space-x-1">
                <input
                  type="text"
                  value={formData.nameplate.voltsPrimary}
                  onChange={(e) =>
                    handleChange("nameplate.voltsPrimary", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
                <span className="text-neutral-500">/</span>
                <input
                  type="text"
                  value={formData.nameplate.voltsPrimarySecondary}
                  onChange={(e) =>
                    handleChange(
                      "nameplate.voltsPrimarySecondary",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              {/* Connections */}
              <div className="flex justify-center space-x-4 connections-group">
                {["Delta", "Wye", "Single Phase"].map((conn) => (
                  <label
                    key={`pri-${conn}`}
                    className="inline-flex items-center"
                  >
                    <input
                      type="radio"
                      name="primary-connection"
                      value={conn}
                      checked={formData.nameplate.connectionsPrimary === conn}
                      onChange={() =>
                        handleChange("nameplate.connectionsPrimary", conn)
                      }
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-neutral-700 dark:text-white">
                      {conn}
                    </span>
                  </label>
                ))}
              </div>
              {/* Winding Material */}
              <div className="flex justify-center space-x-4 materials-group">
                {["Aluminum", "Copper"].map((mat) => (
                  <label
                    key={`pri-${mat}`}
                    className="inline-flex items-center"
                  >
                    <input
                      type="radio"
                      name="primary-material"
                      value={mat}
                      checked={
                        formData.nameplate.windingMaterialPrimary === mat
                      }
                      onChange={() =>
                        handleChange("nameplate.windingMaterialPrimary", mat)
                      }
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-neutral-700 dark:text-white">
                      {mat}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Row 5: Secondary */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
              <div className="text-sm font-medium text-neutral-700 dark:text-white">
                Secondary
              </div>
              {/* Volts */}
              <div className="flex items-center justify-center space-x-1">
                <input
                  type="text"
                  value={formData.nameplate.voltsSecondary}
                  onChange={(e) =>
                    handleChange("nameplate.voltsSecondary", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
                <span className="text-neutral-500">/</span>
                <input
                  type="text"
                  value={formData.nameplate.voltsSecondarySecondary}
                  onChange={(e) =>
                    handleChange(
                      "nameplate.voltsSecondarySecondary",
                      e.target.value,
                    )
                  }
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              {/* Connections */}
              <div className="flex justify-center space-x-4 connections-group">
                {["Delta", "Wye", "Single Phase"].map((conn) => (
                  <label
                    key={`sec-${conn}`}
                    className="inline-flex items-center"
                  >
                    <input
                      type="radio"
                      name="secondary-connection"
                      value={conn}
                      checked={formData.nameplate.connectionsSecondary === conn}
                      onChange={() =>
                        handleChange("nameplate.connectionsSecondary", conn)
                      }
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-neutral-700 dark:text-white">
                      {conn}
                    </span>
                  </label>
                ))}
              </div>
              {/* Winding Material */}
              <div className="flex justify-center space-x-4 materials-group">
                {["Aluminum", "Copper"].map((mat) => (
                  <label
                    key={`sec-${mat}`}
                    className="inline-flex items-center"
                  >
                    <input
                      type="radio"
                      name="secondary-material"
                      value={mat}
                      checked={
                        formData.nameplate.windingMaterialSecondary === mat
                      }
                      onChange={() =>
                        handleChange("nameplate.windingMaterialSecondary", mat)
                      }
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-neutral-700 dark:text-white">
                      {mat}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Row 6: Tap Configuration */}
            <div className="space-y-2">
              {/* Tap Voltages */}
              <div className="flex items-center">
                <label className="w-[130px] text-sm font-medium text-neutral-700 dark:text-white flex-shrink-0">
                  Tap Voltages
                </label>
                <div className="grid grid-cols-7 gap-2 flex-grow">
                  {formData.nameplate.tapVoltages.map((voltage, index) => (
                    <input
                      key={index}
                      type="text"
                      value={voltage}
                      onChange={(e) => {
                        const newVoltages = [...formData.nameplate.tapVoltages];
                        newVoltages[index] = e.target.value;
                        handleChange("nameplate.tapVoltages", newVoltages);
                      }}
                      readOnly={!isEditing}
                      className={`block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                  ))}
                </div>
              </div>

              {/* Tap Position Numbers */}
              <div className="flex items-center">
                <label className="w-[130px] text-sm font-medium text-neutral-700 dark:text-white flex-shrink-0">
                  Tap Position
                </label>
                <div className="grid grid-cols-7 gap-2 flex-grow">
                  {[1, 2, 3, 4, 5, 6, 7].map((position) => (
                    <div
                      key={position}
                      className="text-center text-sm text-neutral-700 dark:text-white font-medium"
                    >
                      {position}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tap Position Left */}
              <div className="flex items-center">
                <label className="w-[130px] text-sm font-medium text-neutral-700 dark:text-white flex-shrink-0">
                  Tap Position Left
                </label>
                {/* First pair of inputs */}
                <div className="flex items-center space-x-1 mr-4">
                  <input
                    type="text"
                    value={formData.nameplate.tapPosition}
                    onChange={(e) =>
                      handleChange("nameplate.tapPosition", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                  <span className="text-neutral-500">/</span>
                  <input
                    type="text"
                    value={formData.nameplate.tapPosition}
                    readOnly
                    className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white bg-neutral-100 dark:bg-dark-150`}
                  />
                </div>
                {/* Separate Volts input */}
                <div className="flex items-center space-x-1 mr-4">
                  <span className="text-sm font-medium text-neutral-700 dark:text-white">
                    Volts
                  </span>
                  <input
                    type="text"
                    value={formData.nameplate.tapPositionLeftVolts}
                    onChange={(e) =>
                      handleChange(
                        "nameplate.tapPositionLeftVolts",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                {/* Separate Percent input */}
                <div className="flex items-center space-x-1">
                  <span className="text-sm font-medium text-neutral-700 dark:text-white">
                    Percent
                  </span>
                  <input
                    type="text"
                    value={formData.nameplate.tapPositionLeftPercent}
                    onChange={(e) =>
                      handleChange(
                        "nameplate.tapPositionLeftPercent",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Print-only Nameplate Data tables */}
          <div className="report-section-content hidden print:block space-y-3">
            {/* Table 1: Basic Information - stacked label then value in each cell */}
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 nameplate-table">
              <colgroup>
                <col style={{ width: "33.33%" }} />
                <col style={{ width: "33.33%" }} />
                <col style={{ width: "33.33%" }} />
              </colgroup>
              <tbody>
                {/* Row 1: label and value inside the same box */}
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white">
                    <div className="text-xs font-bold">Manufacturer:</div>
                    <div className="text-sm mt-0.5">
                      {formData.nameplate.manufacturer || ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white">
                    <div className="text-xs font-bold">Catalog Number:</div>
                    <div className="text-sm mt-0.5">
                      {formData.nameplate.catalogNumber || ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white">
                    <div className="text-xs font-bold">Serial Number:</div>
                    <div className="text-sm mt-0.5">
                      {formData.nameplate.serialNumber || ""}
                    </div>
                  </td>
                </tr>
                {/* Row 2: label and value inside the same box */}
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white">
                    <div className="text-xs font-bold">KVA:</div>
                    <div className="text-sm mt-0.5">
                      {formData.nameplate.kvaBase || ""}
                      {formData.nameplate.kvaCooling
                        ? ` / ${formData.nameplate.kvaCooling}`
                        : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white">
                    <div className="text-xs font-bold">Temp. Rise (°C):</div>
                    <div className="text-sm mt-0.5">
                      {formData.nameplate.tempRise || ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white">
                    <div className="text-xs font-bold">Impedance:</div>
                    <div className="text-sm mt-0.5">
                      {formData.nameplate.impedance || ""}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Table 2: Primary/Secondary Details - Compact layout */}
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 nameplate-table">
              <colgroup>
                <col style={{ width: "12%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600"></th>
                  <th
                    className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600"
                    colSpan={1}
                  >
                    Volts
                  </th>
                  <th
                    className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600"
                    colSpan={3}
                  >
                    Connections
                  </th>
                  <th
                    className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600"
                    colSpan={2}
                  >
                    Winding Materials
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white">
                    Primary
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.voltsPrimary || ""} /{" "}
                    {formData.nameplate.voltsPrimarySecondary || ""}
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.connectionsPrimary === "Delta"
                      ? "☒"
                      : "☐"}{" "}
                    Delta
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.connectionsPrimary === "Wye"
                      ? "☒"
                      : "☐"}{" "}
                    Wye
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.connectionsPrimary === "Single Phase"
                      ? "☒"
                      : "☐"}{" "}
                    Single Phase
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.windingMaterialPrimary === "Aluminum"
                      ? "☒"
                      : "☐"}{" "}
                    Aluminum
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.windingMaterialPrimary === "Copper"
                      ? "☒"
                      : "☐"}{" "}
                    Copper
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white">
                    Secondary
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.voltsSecondary || ""} /{" "}
                    {formData.nameplate.voltsSecondarySecondary || ""}
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.connectionsSecondary === "Delta"
                      ? "☒"
                      : "☐"}{" "}
                    Delta
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.connectionsSecondary === "Wye"
                      ? "☒"
                      : "☐"}{" "}
                    Wye
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.connectionsSecondary === "Single Phase"
                      ? "☒"
                      : "☐"}{" "}
                    Single Phase
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.windingMaterialSecondary === "Aluminum"
                      ? "☒"
                      : "☐"}{" "}
                    Aluminum
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center">
                    {formData.nameplate.windingMaterialSecondary === "Copper"
                      ? "☒"
                      : "☐"}{" "}
                    Copper
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Table 3: Tap Configuration */}
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 nameplate-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Tap Position
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    1
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    2
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    3
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    4
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    5
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    6
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    7
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white">
                    Tap Voltages
                  </td>
                  {formData.nameplate.tapVoltages.map((voltage, index) => (
                    <td
                      key={index}
                      className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center"
                    >
                      {voltage || ""}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white">
                    Tap Position Left
                  </td>
                  <td
                    colSpan={7}
                    className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white"
                  >
                    Position: {formData.nameplate.tapPosition || ""} /{" "}
                    {formData.nameplate.tapPosition || ""} | Volts:{" "}
                    {formData.nameplate.tapPositionLeftVolts || ""} | Percent:{" "}
                    {formData.nameplate.tapPositionLeftPercent || ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 print:mb-3">
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Visual and Mechanical Inspection
          </h2>
          <div className="report-section-content overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "70%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <thead className="bg-neutral-50 dark:bg-dark-150">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                  >
                    NETA Section
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                  >
                    Description
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                  >
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                {formData.visualInspectionItems.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                      {item.netaSection}
                    </td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-neutral-900 dark:text-white">
                      {item.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="print:hidden">
                        <select
                          value={item.result}
                          onChange={(e) =>
                            handleArrayChange(
                              "visualInspectionItems",
                              index,
                              "result",
                              e.target.value,
                            )
                          }
                          disabled={!isEditing}
                          className={`form-select w-full text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150 cursor-not-allowed" : "dark:bg-dark-150"}`}
                        >
                          {visualInspectionOptions.map((option) => (
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

          {/* Print-only Visual Inspection Comments table */}
          <div
            className={`report-section-content hidden print:block mt-3 ${!formData.visualInspectionComments?.trim() ? "print:hidden" : ""}`}
          >
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Visual Inspection Comments
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm min-h-[60px] align-top">
                    {formData.visualInspectionComments || ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 print:mb-3">
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Electrical Tests - Measured Insulation Resistance
          </h2>
          <div className="report-section-content w-full max-w-full overflow-x-auto">
            <table
              className="w-full border-collapse border border-neutral-300 dark:border-neutral-600 insulation-resistance-table"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Winding Tested
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight">
                    Test V<br />
                    (VDC)
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    0.5 Min.
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    1 Min.
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Units
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    0.5 Min.
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    1 Min.
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Units
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Value
                  </th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Units
                  </th>
                </tr>
                <tr>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600"></th>
                  <th className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600"></th>
                  <th
                    colSpan={3}
                    className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight"
                  >
                    Measured
                  </th>
                  <th
                    colSpan={3}
                    className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight"
                  >
                    Corrected @ 20°C
                  </th>
                  <th
                    colSpan={2}
                    className="px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight"
                  >
                    Table 100.5
                  </th>
                </tr>
              </thead>
              <tbody>
                {formData.insulationResistance.tests.map((test, index) => (
                  <tr key={index}>
                    <td className="px-1 py-1 text-xs text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight">
                      {test.winding}
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <select
                        value={test.testVoltage}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "testVoltage",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`form-select w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {testVoltageOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={test.measured0_5Min}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "measured0_5Min",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={test.measured1Min}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "measured1Min",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <select
                        value={test.units}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "units",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`form-select w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={calculateCorrectedIRValue(
                          test.measured0_5Min,
                          getTCF(formData.temperature.celsius),
                        )}
                        readOnly
                        className="form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150"
                      />
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={calculateCorrectedIRValue(
                          test.measured1Min,
                          getTCF(formData.temperature.celsius),
                        )}
                        readOnly
                        className="form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150"
                      />
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <select
                        value={test.correctedUnits}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "correctedUnits",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`form-select w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={test.tableMinimum}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "tableMinimum",
                            e.target.value,
                          )
                        }
                        readOnly={!isEditing}
                        className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </td>
                    <td className="px-1 py-1 border border-neutral-300 dark:border-neutral-600">
                      <select
                        value={test.tableMinimumUnits}
                        onChange={(e) =>
                          handleNestedArrayChange(
                            "insulationResistance",
                            index,
                            "tableMinimumUnits",
                            e.target.value,
                          )
                        }
                        disabled={!isEditing}
                        className={`form-select w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {insulationResistanceUnitsOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-section-content mt-3">
            <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 dielectric-absorption-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Calculated As:
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Pri to Gnd
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Sec to Gnd
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Pri to Sec
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Pass/Fail
                  </th>
                  <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                    Min. D.A.R.
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-left border border-neutral-300 dark:border-neutral-600">
                    <div className="text-sm text-neutral-900 dark:text-white">
                      Dielectric Absorption : (Ratio of 1 Minute to 0.5 Minute
                      Result)
                    </div>
                  </td>
                  {formData.insulationResistance.tests.map((test, index) => (
                    <td
                      key={index}
                      className="px-3 py-2 border border-neutral-300 dark:border-neutral-600"
                    >
                      <input
                        type="text"
                        value={test.dielectricAbsorption}
                        readOnly
                        className="form-input text-center text-sm bg-neutral-100 dark:bg-dark-150 w-full"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={
                        formData.insulationResistance
                          .dielectricAbsorptionAcceptable
                      }
                      readOnly
                      className={`form-input text-center text-sm bg-neutral-100 dark:bg-dark-150 w-full ${
                        formData.insulationResistance
                          .dielectricAbsorptionAcceptable === "Yes"
                          ? "text-green-600 font-medium"
                          : formData.insulationResistance
                                .dielectricAbsorptionAcceptable === "No"
                            ? "text-red-600 font-medium"
                            : ""
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value="1.0"
                      readOnly
                      className="form-input text-center text-sm bg-neutral-100 dark:bg-dark-150 w-full"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 print:mb-3">
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Electrical Tests - Turns Ratio
          </h2>
          <div className="report-section-content flex justify-start items-center gap-2 mb-3 turns-ratio-secondary-label text-xs print:text-[8px]">
            <label
              htmlFor="turnsRatio.secondaryWindingVoltage"
              className="form-label mb-0 whitespace-nowrap"
            >
              Secondary Winding Voltage (L-N for Wye, L-L for Delta):
            </label>
            <input
              id="turnsRatio.secondaryWindingVoltage"
              type="text"
              name="turnsRatio.secondaryWindingVoltage"
              value={formData.turnsRatio.secondaryWindingVoltage}
              onChange={(e) => handleChange(e.target.name, e.target.value)}
              readOnly={!isEditing}
              className={`form-input w-24 text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
            />
            <span>V</span>
          </div>

          <div className="report-section-content space-y-3">
            {/* Setup: Tap, Nameplate V., Calc. Ratio — separate from test results */}
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse turns-ratio-setup-table"
                style={{ tableLayout: "fixed" }}
              >
                <colgroup>
                  <col style={{ width: "33.3333%" }} />
                  <col style={{ width: "33.3333%" }} />
                  <col style={{ width: "33.3333%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Tap
                    </th>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Nameplate V.
                    </th>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Calc. Ratio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.turnsRatio.tests.map((test, index) => (
                    <tr key={`setup-${index}`}>
                      <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                        <select
                          value={test.tap}
                          onChange={(e) =>
                            handleNestedArrayChange(
                              "turnsRatio",
                              index,
                              "tap",
                              e.target.value,
                            )
                          }
                          disabled={!isEditing}
                          className={`form-select w-full text-xs text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {Array.from({ length: 7 }, (_, i) => i + 1).map(
                            (num) => (
                              <option key={num} value={num.toString()}>
                                {num}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                        <input
                          type="text"
                          value={test.nameplateVoltage}
                          onChange={(e) =>
                            handleNestedArrayChange(
                              "turnsRatio",
                              index,
                              "nameplateVoltage",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditing}
                          className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        />
                      </td>
                      <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                        <input
                          type="text"
                          value={test.calculatedRatio}
                          readOnly
                          className="form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Test results: Winding, Measured, % Dev., Pass/Fail */}
            <div className="overflow-x-auto turns-ratio-scroll">
              <table
                className="w-full border-collapse turns-ratio-results-table"
                style={{ tableLayout: "fixed" }}
              >
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Tap
                    </th>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Winding
                    </th>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Measured
                    </th>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      % Dev.
                    </th>
                    <th className="px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600">
                      Pass/Fail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.turnsRatio.tests.map((test, index) => (
                    <React.Fragment key={`results-${index}`}>
                      <tr>
                        <td
                          rowSpan={3}
                          className="px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium align-middle"
                        >
                          {test.tap}
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium">
                          {TURNS_RATIO_WINDING_LABELS.h1h2}
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <input
                            type="text"
                            value={test.measuredH1H2}
                            onChange={(e) =>
                              handleNestedArrayChange(
                                "turnsRatio",
                                index,
                                "measuredH1H2",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <input
                            type="text"
                            value={test.devH1H2}
                            readOnly
                            className="form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150"
                          />
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <select
                            value={test.passFailH1H2}
                            onChange={(e) =>
                              handleNestedArrayChange(
                                "turnsRatio",
                                index,
                                "passFailH1H2",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`form-select w-full text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {passFailOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium">
                          {TURNS_RATIO_WINDING_LABELS.h2h3}
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <input
                            type="text"
                            value={test.measuredH2H3}
                            onChange={(e) =>
                              handleNestedArrayChange(
                                "turnsRatio",
                                index,
                                "measuredH2H3",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <input
                            type="text"
                            value={test.devH2H3}
                            readOnly
                            className="form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150"
                          />
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <select
                            value={test.passFailH2H3}
                            onChange={(e) =>
                              handleNestedArrayChange(
                                "turnsRatio",
                                index,
                                "passFailH2H3",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`form-select w-full text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {passFailOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium">
                          {TURNS_RATIO_WINDING_LABELS.h3h1}
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <input
                            type="text"
                            value={test.measuredH3H1}
                            onChange={(e) =>
                              handleNestedArrayChange(
                                "turnsRatio",
                                index,
                                "measuredH3H1",
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`form-input w-full text-center text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <input
                            type="text"
                            value={test.devH3H1}
                            readOnly
                            className="form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150"
                          />
                        </td>
                        <td className="px-2 py-2 border border-neutral-300 dark:border-neutral-600">
                          <select
                            value={test.passFailH3H1}
                            onChange={(e) =>
                              handleNestedArrayChange(
                                "turnsRatio",
                                index,
                                "passFailH3H1",
                                e.target.value,
                              )
                            }
                            disabled={!isEditing}
                            className={`form-select w-full text-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {passFailOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mb-6 print:mb-3">
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Test Equipment Used
          </h2>
          <div className="space-y-4 print:hidden test-eqpt-onscreen">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  Megohmmeter
                </label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={(value) =>
                    handleChange("testEquipment.megohmmeter.name", value)
                  }
                  onSelect={(equipment) => {
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
                  className="w-full text-sm"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  Serial Number
                </label>
                <input
                  type="text"
                  name="testEquipment.megohmmeter.serialNumber"
                  value={formData.testEquipment.megohmmeter.serialNumber}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm text-neutral-900 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  AMP ID
                </label>
                <input
                  type="text"
                  name="testEquipment.megohmmeter.ampId"
                  value={formData.testEquipment.megohmmeter.ampId}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm text-neutral-900 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  Cal Date
                </label>
                <input
                  type="text"
                  name="testEquipment.megohmmeter.calDate"
                  value={formData.testEquipment.megohmmeter.calDate}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm text-neutral-900 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  TTR Test Set
                </label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.ttrTestSet.name}
                  onChange={(value) =>
                    handleChange("testEquipment.ttrTestSet.name", value)
                  }
                  onSelect={(equipment) => {
                    setFormData((p) => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        ttrTestSet: {
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
                  className="w-full text-sm"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  Serial Number
                </label>
                <input
                  type="text"
                  name="testEquipment.ttrTestSet.serialNumber"
                  value={formData.testEquipment.ttrTestSet.serialNumber}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm text-neutral-900 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  AMP ID
                </label>
                <input
                  type="text"
                  name="testEquipment.ttrTestSet.ampId"
                  value={formData.testEquipment.ttrTestSet.ampId}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm text-neutral-900 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-1">
                  Cal Date
                </label>
                <input
                  type="text"
                  name="testEquipment.ttrTestSet.calDate"
                  value={formData.testEquipment.ttrTestSet.calDate}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm text-neutral-900 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
          </div>

          {/* Print-only Test Equipment Used table */}
          <div className="report-section-content hidden print:block">
            <table
              className="w-full border-collapse border border-black test-equipment-table"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "50%" }} />
                <col style={{ width: "50%" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="p-2 border border-black">
                    <div className="font-semibold text-xs">Megohmmeter:</div>
                    <div className="text-xs">
                      {formData.testEquipment.megohmmeter.name || ""}
                    </div>
                    <div className="text-xs">
                      S/N:{" "}
                      {formData.testEquipment.megohmmeter.serialNumber || ""}
                    </div>
                    <div className="text-xs">
                      AMP ID: {formData.testEquipment.megohmmeter.ampId || ""}
                    </div>
                    {formData.testEquipment.megohmmeter.calDate && (
                      <div className="text-xs">
                        Cal Date: {formData.testEquipment.megohmmeter.calDate}
                      </div>
                    )}
                  </td>
                  <td className="p-2 border border-black">
                    <div className="font-semibold text-xs">TTR Test Set:</div>
                    <div className="text-xs">
                      {formData.testEquipment.ttrTestSet.name || ""}
                    </div>
                    <div className="text-xs">
                      S/N:{" "}
                      {formData.testEquipment.ttrTestSet.serialNumber || ""}
                    </div>
                    <div className="text-xs">
                      AMP ID: {formData.testEquipment.ttrTestSet.ampId || ""}
                    </div>
                    {formData.testEquipment.ttrTestSet.calDate && (
                      <div className="text-xs">
                        Cal Date: {formData.testEquipment.ttrTestSet.calDate}
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section
          className={`mb-6 comments-section print:mb-3 ${!formData.comments?.trim() ? "print:hidden" : ""}`}
        >
          <div className="report-section-divider w-full h-1 bg-[#f26722] mb-3"></div>
          <h2 className="report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs">
            Comments
          </h2>
          <div className="print:hidden">
            <textarea
              name="comments"
              value={formData.comments}
              onChange={(e) => handleChange(e.target.name, e.target.value)}
              readOnly={!isEditing}
              rows={4}
              className={`form-textarea w-full text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
            />
          </div>

          {formData.comments?.trim() && (
            <div className="report-section-content hidden print:block">
              <table className="comments-print-table w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600">
                <tbody>
                  <tr>
                    <td
                      className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm min-h-[80px] align-top whitespace-pre-wrap break-words"
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        maxWidth: "100%",
                      }}
                    >
                      {formData.comments}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
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
    </ReportWrapper>
  );
};

export default TwoSmallDryTyperXfmrMTSReport;

// Add print styles and scrollbar styles
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    /* Visible scrollbar for turns ratio table on screen */
    @media screen {
      /* On-screen test equipment: ensure values are readable (print layout unchanged) */
      .test-eqpt-onscreen input,
      .test-eqpt-onscreen input[readonly],
      .test-eqpt-onscreen .form-input {
        color: #111827 !important;
        -webkit-text-fill-color: #111827 !important;
        opacity: 1 !important;
      }
      html.dark .test-eqpt-onscreen input,
      html.dark .test-eqpt-onscreen input[readonly],
      html.dark .test-eqpt-onscreen .form-input {
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
      }

      .turns-ratio-scroll {
        overflow-x: scroll !important; /* Force scrollbar to always show */
        scrollbar-gutter: stable; /* Reserve space for scrollbar */
        -webkit-overflow-scrolling: touch;
      }

      .turns-ratio-scroll::-webkit-scrollbar {
        height: 14px;
        background-color: #e5e7eb;
        -webkit-appearance: none;
        display: block !important; /* Force display */
      }

      .turns-ratio-scroll::-webkit-scrollbar:horizontal {
        display: block !important; /* Ensure horizontal scrollbar always shows */
      }

      .turns-ratio-scroll::-webkit-scrollbar-track {
        background-color: #f3f4f6;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        display: block !important;
      }

      .turns-ratio-scroll::-webkit-scrollbar-thumb {
        background-color: #f26722;
        border-radius: 8px;
        border: 2px solid #f3f4f6;
        min-width: 50px; /* Ensure thumb is always grabbable */
        display: block !important;
      }

      .turns-ratio-scroll::-webkit-scrollbar-thumb:hover {
        background-color: #e55611;
      }

      .turns-ratio-scroll::-webkit-scrollbar-thumb:active {
        background-color: #d4501a;
      }

      /* Dark mode scrollbar */
      html.dark .turns-ratio-scroll::-webkit-scrollbar {
        background-color: #1f2937;
      }

      html.dark .turns-ratio-scroll::-webkit-scrollbar-track {
        background-color: #374151;
        border: 1px solid #4b5563;
      }

      html.dark .turns-ratio-scroll::-webkit-scrollbar-thumb {
        background-color: #f26722;
        border: 2px solid #374151;
      }

      /* Firefox - force scrollbar always visible */
      @supports (scrollbar-color: auto) {
        .turns-ratio-scroll {
          scrollbar-color: #f26722 #f3f4f6;
          scrollbar-width: thin;
          overflow-x: scroll !important;
        }

        html.dark .turns-ratio-scroll {
          scrollbar-color: #f26722 #374151;
        }
      }
    }

    @media print {
      * { color: black !important; background: white !important; box-sizing: border-box !important; }
      html, body {
        margin: 0 !important;
        padding: 6px !important;
        min-height: 0 !important;
        height: auto !important;
        font-family: Arial, sans-serif !important;
        font-size: 9px !important;
      }

      /* Single-page layout: compact all report sections */
      #report-container:has(.two-small-xfmr-mts-print-root) {
        padding: 0 !important;
        max-width: 100% !important;
      }
      .two-small-xfmr-mts-print-root {
        font-size: 8px !important;
        line-height: 1.1 !important;
      }
      .two-small-xfmr-mts-print-root section {
        margin-bottom: 10px !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        page-break-before: auto !important;
        page-break-after: auto !important;
      }
      .two-small-xfmr-mts-print-root .report-section-divider {
        display: block !important;
        background-color: #f26722 !important;
        height: 3px !important;
        min-height: 3px !important;
        margin-bottom: 6px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .two-small-xfmr-mts-print-root .report-section-heading,
      .two-small-xfmr-mts-print-root section > h2 {
        font-size: 9px !important;
        margin-bottom: 6px !important;
        margin-top: 0 !important;
        padding-bottom: 2px !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content {
        margin-top: 0 !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content + .report-section-content {
        margin-top: 8px !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content.space-y-3 > * + * {
        margin-top: 8px !important;
      }
      .two-small-xfmr-mts-print-root table {
        font-size: 7px !important;
        margin: 0 0 2px 0 !important;
      }
      .two-small-xfmr-mts-print-root th,
      .two-small-xfmr-mts-print-root td {
        padding: 1px 2px !important;
        font-size: 7px !important;
        line-height: 1.1 !important;
      }
      .two-small-xfmr-mts-print-root table input,
      .two-small-xfmr-mts-print-root table select {
        font-size: 7px !important;
        min-height: 0 !important;
        height: auto !important;
        padding: 0 1px !important;
        border: none !important;
        background: transparent !important;
      }
      .two-small-xfmr-mts-print-root .nameplate-table .text-sm,
      .two-small-xfmr-mts-print-root .nameplate-table div {
        font-size: 7px !important;
        margin-top: 0 !important;
      }
      .two-small-xfmr-mts-print-root .turns-ratio-secondary-label {
        margin-bottom: 6px !important;
        font-size: 7px !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content.overflow-x-auto,
      .two-small-xfmr-mts-print-root .report-section-content.turns-ratio-scroll {
        margin-bottom: 0 !important;
        overflow: visible !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content.space-y-3 > * + * {
        margin-top: 8px !important;
      }

      .min-h-screen, .screen-min-height, .pb-20 {
        min-height: 0 !important;
        height: auto !important;
        padding-bottom: 0 !important;
      }

      /* Remove padding on main content wrapper to prevent blank page */
      .p-6 { padding: 0 !important; }
      .flex.justify-center { justify-content: flex-start !important; }
      .max-w-7xl { max-width: 100% !important; }
      .space-y-6 > * + * { margin-top: 4px !important; }
      .two-small-xfmr-mts-print-root .space-y-6 > * + * { margin-top: 0 !important; }

      /* Ensure print header doesn't cause page break */
      .print-report-header,
      .print\\:flex.hidden {
        display: flex !important;
        padding-bottom: 6px !important;
        margin-bottom: 14px !important;
        page-break-after: avoid !important;
      }

      /* Remove shadows only; keep borders for structure */
      .shadow, .shadow-md, .shadow-lg { box-shadow: none !important; }

      /* Section headers */
      section > h2,
      .report-section-heading {
        border-bottom: 1px solid black !important;
        padding-bottom: 2px !important;
        margin-bottom: 0.75rem !important;
        font-weight: bold !important;
      }
      .report-section-divider {
        background-color: #f26722 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .report-section-content + .report-section-content {
        margin-top: 0.75rem !important;
      }
      .report-section-content.space-y-3 > * + * {
        margin-top: 0.75rem !important;
      }

      /* Ensure Tailwind print:flex headers render in print */
      .print\\:flex { display: flex !important; }
      .print\\:block { display: block !important; }
      .print\\:hidden { display: none !important; }

      /* Hide Back to Job button and division headers specifically */
      button[class*="Back"],
      *[class*="Back to Job"],
      h2[class*="Division"],
      .mobile-nav-text,
      [class*="formatDivisionName"] {
        display: none !important;
      }

      /* Form elements - ensure text shows in boxes (exclude radios/checkboxes) */
      input:not([type="radio"]):not([type="checkbox"]), select, textarea {
        background-color: white !important;
        border: 1px solid black !important;
        color: black !important;
        padding: 3px 4px !important;
        font-size: 12px !important;
        font-family: Arial, sans-serif !important;
        min-height: 18px !important;
        line-height: 1 !important;
        vertical-align: top !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Ensure text values are visible in form elements */
      input[type="text"], input[type="number"], input[type="date"],
      select, textarea {
        background: white !important;
        color: black !important;
        border: 1px solid black !important;
        font-weight: normal !important;
        text-align: left !important;
        min-width: 60px !important;
        vertical-align: top !important;
      }

      /* Center-aligned inputs stay centered */
      input.text-center, select.text-center {
        text-align: center !important;
        vertical-align: top !important;
      }

      /* Ensure table center-aligned inputs are properly aligned */
      table input.text-center, table select.text-center {
        text-align: center !important;
        vertical-align: top !important;
        padding: 1px 3px !important;
        width: 95% !important;
        max-width: 95% !important;
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

      /* Use native radio look for print to match on-screen (and ATS output) */
      input[type="radio"] {
        -webkit-appearance: radio !important;
        -moz-appearance: radio !important;
        appearance: auto !important;
        background: initial !important;
        border: initial !important;
        width: 16px !important;
        height: 16px !important;
        margin-right: 6px !important;
      }
      input[type="radio"]:checked::after { content: none !important; }

      /* Table styling */
      table {
        border-collapse: collapse;
        width: 100%;
        font-size: 12px !important;
        page-break-inside: auto;
      }
      th, td {
        border: 1px solid black !important;
        padding: 3px !important;
        page-break-inside: auto;
        min-height: 0 !important;
        vertical-align: top !important;
      }
      th {
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
        font-size: 12px !important;
        text-align: center !important;
      }

      /* Table inputs need proper sizing */
      table input, table select {
        width: 95% !important;
        max-width: 95% !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        padding: 1px 2px !important;
        font-size: 7px !important;
        margin: 0 !important;
        line-height: 1 !important;
        vertical-align: top !important;
        box-sizing: border-box !important;
        border: 1px solid black !important;
      }

      /* Remove conflicting width classes in print */
      table input.w-16, table input.w-20, table input.w-24,
      table input.w-full, table input.w-32 {
        width: 95% !important;
        max-width: 95% !important;
      }

      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }

      /* Section styling */
      section {
        page-break-inside: auto !important;
        margin-bottom: 4px !important;
      }
      .two-small-xfmr-mts-print-root section {
        margin-bottom: 10px !important;
      }

      /* Page break utilities */
      .print\\:break-before-page { page-break-before: always; }
      .print\\:break-after-page { page-break-after: always; }
      .print\\:break-inside-avoid { page-break-inside: avoid; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }

      /* Improve table borders and spacing */
      .table-border {
        border: 1px solid black !important;
      }

      /* Turns Ratio table - match other tables styling */
      .turns-ratio-scroll {
        overflow: visible !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      table.turns-ratio-setup-table,
      table.turns-ratio-results-table {
        width: 100% !important;
        min-width: auto !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        margin: 0 0 2px 0 !important;
        border-collapse: collapse !important;
        transform: none !important;
        font-size: 7px !important;
      }
      table.turns-ratio-setup-table th,
      table.turns-ratio-setup-table td {
        width: 33.3333% !important;
        min-width: 33.3333% !important;
        max-width: 33.3333% !important;
      }
      .two-small-xfmr-mts-print-root table.turns-ratio-setup-table,
      .two-small-xfmr-mts-print-root table.turns-ratio-results-table {
        font-size: 7px !important;
        margin: 0 !important;
      }

      table.turns-ratio-setup-table input,
      table.turns-ratio-setup-table select,
      table.turns-ratio-results-table input,
      table.turns-ratio-results-table select {
        font-size: 7px !important;
        padding: 1px 2px !important;
        width: 88% !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
        border: none !important;
        background: transparent !important;
        text-align: center !important;
      }

      table.turns-ratio-setup-table td,
      table.turns-ratio-results-table td {
        padding: 2px !important;
        font-size: 7px !important;
        overflow: hidden !important;
        text-overflow: clip !important;
        white-space: normal !important;
        word-break: break-word !important;
        border: 1px solid black !important;
        text-align: center !important;
        vertical-align: middle !important;
      }

      table.turns-ratio-setup-table th,
      table.turns-ratio-results-table th {
        background-color: #f3f4f6 !important;
        white-space: normal !important;
        word-break: break-word !important;
        line-height: 1.1 !important;
        font-size: 7px !important;
        padding: 2px !important;
        text-align: center !important;
        font-weight: bold !important;
        border: 1px solid black !important;
        vertical-align: middle !important;
      }

      /* Test Equipment Table - better spacing for print */
      .test-equipment-table {
        margin-top: 2px !important;
        margin-bottom: 2px !important;
        width: 100% !important;
      }

      .test-equipment-table th {
        background-color: #f3f4f6 !important;
        font-size: 7px !important;
        padding: 2px 4px !important;
        text-align: left !important;
        font-weight: bold !important;
        border: 1px solid black !important;
      }

      .test-equipment-table td {
        font-size: 7px !important;
        padding: 2px 4px !important;
        text-align: left !important;
        border: 1px solid black !important;
        vertical-align: middle !important;
      }
      .two-small-xfmr-mts-print-root .test-equipment-table td,
      .two-small-xfmr-mts-print-root .test-equipment-table td div {
        font-size: 7px !important;
        line-height: 1.1 !important;
      }

      .test-equipment-table td.font-medium {
        font-weight: 600 !important;
      }

      /* Better page break handling */
      .bg-white, .dark\\:bg-dark-150 {
        background-color: white !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }

      /* Ensure proper spacing */
      .space-y-6 > * + * {
        margin-top: 1.5rem !important;
      }

      /* Grid layouts for print */
      .grid {
        display: grid !important;
      }

      /* Flex layouts for print */
      .flex {
        display: flex !important;
      }

      /* Visual & Mechanical table widths for readability */
      table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
      table.visual-mechanical-table thead { display: table-header-group !important; }
      table.visual-mechanical-table tr { page-break-inside: auto !important; break-inside: auto !important; }
      table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 7px !important; padding: 1px 2px !important; vertical-align: middle !important; }
      /* Center header text for ID/DESCRIPTION/etc */
      table.visual-mechanical-table th { text-align: center !important; }
      table.visual-mechanical-table td { text-align: center !important; }
      table.visual-mechanical-table td:nth-child(2) { text-align: center !important; }
      table.visual-mechanical-table colgroup col:nth-child(1) { width: 6% !important; }
      table.visual-mechanical-table colgroup col:nth-child(2) { width: 70% !important; }
      table.visual-mechanical-table colgroup col:nth-child(3) { width: 24% !important; }
      table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }

      /* Insulation resistance table - fit within page width */
      table.insulation-resistance-table {
        table-layout: fixed !important;
        width: 100% !important;
        max-width: 100% !important;
        font-size: 9px !important;
      }
      table.insulation-resistance-table th,
      table.insulation-resistance-table td {
        padding: 1px 2px !important;
        font-size: 7px !important;
        white-space: normal !important;
        word-break: break-word !important;
        line-height: 1.1 !important;
      }
      table.insulation-resistance-table input,
      table.insulation-resistance-table select {
        font-size: 7px !important;
        padding: 1px 2px !important;
        min-width: 0 !important;
        width: 100% !important;
      }

      /* Dielectric Absorption table - make first column wider for "Calculated As:" text */
      table.dielectric-absorption-table { table-layout: fixed !important; width: 100% !important; font-size: 7px !important; }
      table.dielectric-absorption-table th,
      table.dielectric-absorption-table td {
        padding: 1px 2px !important;
        font-size: 7px !important;
      }
      table.dielectric-absorption-table td:first-child { width: 50% !important; min-width: 50% !important; max-width: 50% !important; }
      table.dielectric-absorption-table td:not(:first-child) { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }
      table.dielectric-absorption-table th:first-child { width: 50% !important; min-width: 50% !important; max-width: 50% !important; }
      table.dielectric-absorption-table th:not(:first-child) { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }

      /* Alternative approach for browsers that don't support :has() */
      table:not(.turns-ratio-setup-table):not(.turns-ratio-results-table):not(.visual-mechanical-table):not(.dielectric-absorption-table):not(.job-info-print-table):not(.comments-print-table) { table-layout: fixed !important; width: 100% !important; }
      table:not(.turns-ratio-setup-table):not(.turns-ratio-results-table):not(.visual-mechanical-table):not(.dielectric-absorption-table):not(.job-info-print-table):not(.comments-print-table) td:first-child { width: 35% !important; }
      table:not(.turns-ratio-setup-table):not(.turns-ratio-results-table):not(.visual-mechanical-table):not(.dielectric-absorption-table):not(.job-info-print-table):not(.comments-print-table) td:not(:first-child) { width: 13% !important; }

      /* Comments tables: full width with text wrap for long content */
      table.comments-print-table { table-layout: fixed !important; width: 100% !important; max-width: 100% !important; }
      table.comments-print-table td {
        width: 100% !important;
        max-width: 100% !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        word-wrap: break-word !important;
        text-align: left !important;
        overflow: visible !important;
        text-overflow: clip !important;
      }

      /* Job Information table - force 6 equal columns and wrap text normally */
      table.job-info-print-table { table-layout: fixed !important; width: 100% !important; }
      table.job-info-print-table td { width: 16.6667% !important; min-width: 0 !important; max-width: 16.6667% !important; white-space: normal !important; overflow-wrap: break-word !important; word-break: normal !important; }

      /* Center header text for IR and corrected tables (A-G, etc.) */
      .ir-table th, .ir-corrected-table th { text-align: center !important; }
      .ir-table td, .ir-corrected-table td { text-align: center !important; }
      /* Center header text for contact resistance table */
      .contact-resistance-table th { text-align: center !important; }
      .contact-resistance-table td { text-align: center !important; }

      /* Center content in Nameplate tables */
      .nameplate-table th, .nameplate-table td, .nameplate-table div { text-align: center !important; }

      /* Hide on-screen grids in print to avoid duplication */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .nameplate-onscreen, .nameplate-onscreen * { display: none !important; }

      /* Ensure print-only tables are visible */
      .hidden.print\\:block { display: block !important; }
      .hidden.print\\:block * { display: revert !important; }

      /* Nameplate Basic Info table - ensure equal column widths */
      table:has(colgroup col[style*="33.33%"]) { table-layout: fixed !important; width: 100% !important; }
      table:has(colgroup col[style*="33.33%"]) td { width: 33.33% !important; min-width: 33.33% !important; max-width: 33.33% !important; }

      /* Nameplate Details table - optimize column widths */
      table:has(colgroup col[style*="12%"]) { table-layout: fixed !important; width: 100% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(1) { width: 12% !important; min-width: 12% !important; max-width: 12% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(2) { width: 18% !important; min-width: 18% !important; max-width: 18% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(3) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(4) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(5) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(6) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(7) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }

      /* PASS/FAIL status styles */
      .pass-fail-status-box {
        display: inline-block !important;
        padding: 4px 10px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-align: center !important;
        width: fit-content !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        min-width: 60px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color: #fff !important;
        border: 2px solid transparent !important;
        float: right !important; /* ensure it stays on the right under NETA */
      }
      .pass-fail-status-box.pass { background-color: #22c55e !important; border-color: #16a34a !important; }
      .pass-fail-status-box.fail { background-color: #ef4444 !important; border-color: #dc2626 !important; }

      /* Hide interactive buttons in print */
      button { display: none !important; }
    }

    /* Mirror critical print rules for live preview iframe (.force-print) so
       Show Preview accurately reflects final PDF rendering. */
    .force-print .turns-ratio-scroll {
      overflow: visible !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .force-print table.turns-ratio-setup-table,
    .force-print table.turns-ratio-results-table {
      width: 100% !important;
      min-width: auto !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      margin: 4px 0 !important;
      border-collapse: collapse !important;
      transform: none !important;
      font-size: 9px !important;
    }
    .force-print table.turns-ratio-setup-table th,
    .force-print table.turns-ratio-setup-table td {
      width: 33.3333% !important;
      min-width: 33.3333% !important;
      max-width: 33.3333% !important;
    }
    .force-print table.turns-ratio-setup-table input,
    .force-print table.turns-ratio-setup-table select,
    .force-print table.turns-ratio-results-table input,
    .force-print table.turns-ratio-results-table select {
      font-size: 9px !important;
      padding: 4px 2px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      border: none !important;
      background: transparent !important;
      text-align: center !important;
    }
    .force-print table.turns-ratio-setup-table td,
    .force-print table.turns-ratio-results-table td {
      padding: 4px 2px !important;
      font-size: 9px !important;
      border: 1px solid black !important;
      text-align: center !important;
      vertical-align: middle !important;
    }
    .force-print table.turns-ratio-setup-table th,
    .force-print table.turns-ratio-results-table th {
      background-color: #f3f4f6 !important;
      font-size: 9px !important;
      padding: 4px 2px !important;
      text-align: center !important;
      font-weight: bold !important;
      border: 1px solid black !important;
      vertical-align: middle !important;
    }

    /* Mirror Test Equipment table spacing */
    .force-print .test-equipment-table { width: 100% !important; margin: 10px 0 20px 0 !important; }
    .force-print .test-equipment-table th {
      background-color: #f3f4f6 !important;
      font-size: 10px !important;
      padding: 8px 12px !important;
      text-align: left !important;
      font-weight: bold !important;
      border: 1px solid black !important;
    }
    .force-print .test-equipment-table td {
      font-size: 10px !important;
      padding: 8px 12px !important;
      text-align: left !important;
      border: 1px solid black !important;
      vertical-align: middle !important;
    }
  `;
  document.head.appendChild(style);
}
