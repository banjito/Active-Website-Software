import React, { useEffect, useState } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";

const VISUAL_INSPECTION_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

const INSULATION_RESISTANCE_TEST_VOLTAGES = [
  "250V",
  "500V",
  "1000V",
  "2500V",
  "5000V",
];
const INSULATION_RESISTANCE_UNITS = ["kΩ", "MΩ", "GΩ"];
const WINDING_CONNECTIONS = ["Delta", "Wye", "Single Phase"];
const WINDING_MATERIALS = ["", "Copper", "Aluminum"];
const TAP_POSITIONS = ["1", "2", "3", "4", "5", "6", "7"];

type StatusType = "PASS" | "FAIL" | "LIMITED SERVICE";

interface InsulationRow {
  windingUnderTest: string;
  measured05Min: string;
  measured1Min: string;
  corrected05Min: string;
  corrected1Min: string;
}

interface TurnsRatioRow {
  primaryWinding: string;
  measuredRatio: string;
  percentDeviation: string;
  result: "Pass" | "Fail" | "";
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
    humidity: number | null;
  };
  substation: string;
  eqptLocation: string;
  status: StatusType;

  nameplate: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    kva: string;
    tempRise: string;
    impedance: string;
    primaryVoltage1: string;
    primaryVoltage2: string;
    secondaryVoltage1: string;
    secondaryVoltage2: string;
    primaryWindingConnection: string;
    secondaryWindingConnection: string;
    primaryWindingMaterial: string;
    secondaryWindingMaterial: string;
    tapVoltage1: string;
    tapVoltage2: string;
    tapVoltage3: string;
    tapVoltage4: string;
    tapVoltage5: string;
    tapVoltage6: string;
    tapVoltage7: string;
    tapPositionLeft: string;
  };

  visualInspectionItems: Array<{
    id: string;
    description: string;
    result: string;
  }>;

  insulationTemperature: string;
  insulationTestVoltage: string;
  insulationDuration: string;
  insulationUnit: string;
  insulationRows: InsulationRow[];
  insulationCriteriaValue: string;
  insulationCriteriaUnits: string;
  dielectricAbsorptionRatio: {
    priToGnd: string;
    secToGnd: string;
    priToSec: string;
    criteria: string;
    result: "Pass" | "Fail" | "";
  };

  turnsRatio: {
    tapUnderTest: string;
    primaryWindingVoltage: string;
    secondaryWindingVoltage: string;
    calculatedRatio: string;
    rows: TurnsRatioRow[];
    differenceBetweenMR: string;
    differenceResult: "Pass" | "Fail" | "";
  };

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
}

// TCF table keyed by rounded °C
const TCF_TABLE: { [k: string]: number } = {
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
};

const getTCF = (celsius: number): number =>
  TCF_TABLE[Math.round(celsius).toString()] ?? 1;

const SmallLowVoltageDryTypeTransformerATS25Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const isPrintMode = searchParams.get("print") === "true";

  const reportSlug = "small-lv-dry-type-transformer-ats25";
  const reportName = getReportName(reportSlug);

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const [loading, setLoading] = useState(true);
  const [justSaved, setJustSaved] = useState(false);

  // Centralized form change handler that resets justSaved
  const handleChange = (updater: (prev: FormData) => FormData) => {
    setJustSaved(false);
    setFormData(updater);
  };
  const [isEditing, setIsEditing] = useState(!initialReportId);
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

  const [formData, setFormData] = useState<FormData>({
    customerName: "",
    customerLocation: "",
    userName: "",
    date: new Date().toISOString().split("T")[0],
    identifier: "",
    jobNumber: "",
    technicians: "",
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: null },
    substation: "",
    eqptLocation: "",
    status: "PASS",
    nameplate: {
      manufacturer: "",
      catalogNumber: "",
      serialNumber: "",
      kva: "",
      tempRise: "",
      impedance: "",
      primaryVoltage1: "",
      primaryVoltage2: "",
      secondaryVoltage1: "",
      secondaryVoltage2: "",
      primaryWindingConnection: "Delta",
      secondaryWindingConnection: "Wye",
      primaryWindingMaterial: "",
      secondaryWindingMaterial: "",
      tapVoltage1: "",
      tapVoltage2: "",
      tapVoltage3: "",
      tapVoltage4: "",
      tapVoltage5: "",
      tapVoltage6: "",
      tapVoltage7: "",
      tapPositionLeft: "",
    },
    visualInspectionItems: [
      {
        id: "7.2.1.1.A.1",
        description: "Compare equipment nameplate data with drawings.",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.2",
        description: "Inspect physical and mechanical condition.",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.3",
        description: "Inspect anchorage, alignment, and grounding.",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.4",
        description:
          "Verify that resilient mounts are free and that any shipping brackets have been removed.",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.5",
        description: "Verify the unit is clean.",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.6",
        description:
          "Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method or in accordance with 7.2.1.1.B.1 (Low Resistance Ohmmeter).",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.7",
        description: "Verify that as-left tap connections are as specified.",
        result: "Select One",
      },
      {
        id: "7.2.1.1.A.8",
        description:
          "*Perform thermographic survey in accordance with Section 9.",
        result: "Select One",
      },
    ],
    insulationTemperature: "",
    insulationTestVoltage: "1000V",
    insulationDuration: "1 min",
    insulationUnit: "MΩ",
    insulationRows: [
      {
        windingUnderTest: "Primary to Ground",
        measured05Min: "",
        measured1Min: "",
        corrected05Min: "",
        corrected1Min: "",
      },
      {
        windingUnderTest: "Secondary to Ground",
        measured05Min: "",
        measured1Min: "",
        corrected05Min: "",
        corrected1Min: "",
      },
      {
        windingUnderTest: "Primary to Secondary",
        measured05Min: "",
        measured1Min: "",
        corrected05Min: "",
        corrected1Min: "",
      },
    ],
    insulationCriteriaValue: "≥ 500",
    insulationCriteriaUnits: "MΩ",
    dielectricAbsorptionRatio: {
      priToGnd: "",
      secToGnd: "",
      priToSec: "",
      criteria: "≥ 1.00",
      result: "",
    },
    turnsRatio: {
      tapUnderTest: "3",
      primaryWindingVoltage: "480.00",
      secondaryWindingVoltage: "120.00",
      calculatedRatio: "4.0000",
      rows: [
        {
          primaryWinding: "H0-H1",
          measuredRatio: "",
          percentDeviation: "",
          result: "",
        },
        {
          primaryWinding: "H0-H2",
          measuredRatio: "",
          percentDeviation: "",
          result: "",
        },
        {
          primaryWinding: "H0-H3",
          measuredRatio: "",
          percentDeviation: "",
          result: "",
        },
      ],
      differenceBetweenMR: "",
      differenceResult: "",
    },
    testEquipment: {
      megohmmeter: { name: "", serialNumber: "", ampId: "", calDate: "" },
      ttrTestSet: { name: "", serialNumber: "", ampId: "", calDate: "" },
    },
    comments: "",
  });

  const loadJobInfo = async () => {
    if (!jobId) return;
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("job_number, customer_id, site_address")
        .eq("id", jobId)
        .single();
      if (jobError) throw jobError;
      let customerName = "";
      let customerAddress = (jobData as any)?.site_address || "";
      if (jobData?.customer_id) {
        const { data: customer, error: custErr } = await supabase
          .schema("common")
          .from("customers")
          .select("name, company_name, address")
          .eq("id", jobData.customer_id)
          .single();
        if (!custErr && customer) {
          customerName = customer.company_name || customer.name || "";
          if (!customerAddress) customerAddress = customer.address || "";
        }
      }
      setFormData((prev) => ({
        ...prev,
        jobNumber: jobData?.job_number || "",
        customerName: maskCustomerName(customerName),
        customerLocation: maskCustomerAddress(customerAddress),
      }));
    } catch (e) {
      /* noop */
    }
  };

  const loadReport = async () => {
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
        .from("small_lv_dry_type_transformer_ats25_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();
      if (error) throw error;
      if (data) {
        const info = data.report_info || {};
        const vm = data.visual_mechanical?.items || [];
        const ir = data.insulation_resistance || {};
        const tr = data.turns_ratio || {};
        const te = data.test_equipment || info.testEquipment || undefined;
        setFormData((prev) => ({
          ...prev,
          customerName: info.customer || prev.customerName,
          customerLocation: info.address || prev.customerLocation,
          userName: info.userName || prev.userName,
          date: info.date || prev.date,
          technicians: info.technicians || prev.technicians,
          identifier: info.identifier || prev.identifier,
          substation: info.substation || prev.substation,
          eqptLocation: info.eqptLocation || prev.eqptLocation,
          temperature: info.temperature || prev.temperature,
          status: info.status || prev.status,
          nameplate: info.nameplate || prev.nameplate,
          visualInspectionItems: vm.length ? vm : prev.visualInspectionItems,
          insulationTemperature:
            ir.insulationTemperature || prev.insulationTemperature,
          insulationTestVoltage: ir.testVoltage || prev.insulationTestVoltage,
          insulationDuration: ir.duration || prev.insulationDuration,
          insulationUnit: ir.unit || prev.insulationUnit,
          insulationRows: ir.rows || prev.insulationRows,
          insulationCriteriaValue:
            ir.criteriaValue || prev.insulationCriteriaValue,
          insulationCriteriaUnits:
            ir.criteriaUnits || prev.insulationCriteriaUnits,
          dielectricAbsorptionRatio:
            ir.dielectricAbsorptionRatio || prev.dielectricAbsorptionRatio,
          turnsRatio: tr.tapUnderTest
            ? { ...prev.turnsRatio, ...tr }
            : prev.turnsRatio,
          testEquipment: te || prev.testEquipment,
          comments: data.comments || prev.comments,
        }));
        setIsEditing(false);
      }
    } catch (e) {
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, currentReportId]);

  useEffect(() => {
    const prev = document.title;
    const title = getAssetName(
      reportSlug,
      formData.identifier || formData.eqptLocation || "",
    );
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [formData.identifier, formData.eqptLocation]);

  // Temperature conversions
  const handleF = (f: number) => {
    setJustSaved(false);
    const c = Math.round(((f - 32) * 5) / 9);
    const tcf = getTCF(c);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit: f, celsius: c, tcf },
    }));
  };

  // Table 100.5 Criteria calculation based on voltage and units
  // Formula: IF voltage <= 600: MΩ=500, GΩ=0.5
  //          IF voltage <= 5000: MΩ=5000, GΩ=5
  //          IF voltage > 5000: MΩ=25000, GΩ=25
  const getTable1005Criteria = (voltageStr: string, unit: string): string => {
    if (!voltageStr || voltageStr.trim() === "") return "";
    const voltage = parseFloat(voltageStr);
    if (!isFinite(voltage)) return "";

    const isMegaohm = unit === "MΩ";
    const isGigaohm = unit === "GΩ";

    if (voltage <= 600) {
      return isMegaohm ? "500" : isGigaohm ? "0.5" : "";
    } else if (voltage <= 5000) {
      return isMegaohm ? "5000" : isGigaohm ? "5" : "";
    } else {
      return isMegaohm ? "25000" : isGigaohm ? "25" : "";
    }
  };

  // Get voltage for each insulation test row
  const getVoltageForRow = (rowIndex: number): string => {
    switch (rowIndex) {
      case 0:
        return formData.nameplate.primaryVoltage1; // Primary to Ground uses primary voltage
      case 1:
        return formData.nameplate.secondaryVoltage1; // Secondary to Ground uses secondary voltage
      case 2:
        return formData.nameplate.primaryVoltage1; // Primary to Secondary uses primary voltage
      default:
        return "";
    }
  };

  // Apply temperature correction to insulation rows
  useEffect(() => {
    const tcf = formData.temperature.tcf || 1;
    setFormData((prev) => ({
      ...prev,
      insulationRows: prev.insulationRows.map((row) => {
        const correct = (v: string) => {
          const trimmed = v.trim();
          if (
            !trimmed ||
            trimmed.toLowerCase() === "n/a" ||
            trimmed.startsWith(">") ||
            trimmed.startsWith("<")
          )
            return trimmed || "N/A";
          const n = parseFloat(trimmed);
          return isFinite(n) ? (n * tcf).toFixed(2) : "N/A";
        };
        return {
          ...row,
          corrected05Min: correct(row.measured05Min),
          corrected1Min: correct(row.measured1Min),
        };
      }),
    }));
  }, [
    formData.temperature.tcf,
    JSON.stringify(
      formData.insulationRows.map((r) => [r.measured05Min, r.measured1Min]),
    ),
  ]);

  // Calculate Dielectric Absorption Ratio (1 Min / 0.5 Min)
  useEffect(() => {
    const rows = formData.insulationRows;
    const calcRatio = (idx: number): string => {
      const m05 = parseFloat(rows[idx]?.corrected05Min || "");
      const m1 = parseFloat(rows[idx]?.corrected1Min || "");
      if (!isFinite(m05) || !isFinite(m1) || m05 === 0) return "";
      return (m1 / m05).toFixed(2);
    };
    const priToGnd = calcRatio(0);
    const secToGnd = calcRatio(1);
    const priToSec = calcRatio(2);

    // Evaluate result based on criteria ≥ 1.00
    const allRatios = [priToGnd, secToGnd, priToSec]
      .map((v) => parseFloat(v))
      .filter((n) => isFinite(n));
    let result: "Pass" | "Fail" | "" = "";
    if (allRatios.length > 0) {
      result = allRatios.every((r) => r >= 1.0) ? "Pass" : "Fail";
    }

    setFormData((prev) => ({
      ...prev,
      dielectricAbsorptionRatio: {
        ...prev.dielectricAbsorptionRatio,
        priToGnd,
        secToGnd,
        priToSec,
        result,
      },
    }));
  }, [JSON.stringify(formData.insulationRows)]);

  // Auto-calculate Primary and Secondary Winding Voltages for Turns Ratio
  // Primary Winding Voltage = HLOOKUP(Tap Under Test, Tap Voltages, 2) - looks up tap voltage for selected tap
  // Secondary Winding Voltage = First secondary voltage input (secondaryVoltage1)
  useEffect(() => {
    const tapUnderTest = formData.turnsRatio.tapUnderTest;
    const tapVoltageKey =
      `tapVoltage${tapUnderTest}` as keyof typeof formData.nameplate;
    const primaryWindingVoltage =
      (formData.nameplate[tapVoltageKey] as string) || "";

    // Secondary: Use the first secondary voltage input
    const secondaryWindingVoltage = formData.nameplate.secondaryVoltage1;

    setFormData((prev) => ({
      ...prev,
      turnsRatio: {
        ...prev.turnsRatio,
        primaryWindingVoltage: primaryWindingVoltage,
        secondaryWindingVoltage: secondaryWindingVoltage || "",
      },
    }));
  }, [
    formData.turnsRatio.tapUnderTest,
    formData.nameplate.tapVoltage1,
    formData.nameplate.tapVoltage2,
    formData.nameplate.tapVoltage3,
    formData.nameplate.tapVoltage4,
    formData.nameplate.tapVoltage5,
    formData.nameplate.tapVoltage6,
    formData.nameplate.tapVoltage7,
    formData.nameplate.secondaryVoltage1,
  ]);

  // Calculate Turns Ratio
  // Formula: primary 1 slot (primaryVoltage1) / secondary 2 spot (secondaryVoltage2)
  useEffect(() => {
    const primaryV = parseFloat(formData.nameplate.primaryVoltage1);
    const secondaryV = parseFloat(formData.nameplate.secondaryVoltage2);
    let calculatedRatio = "";
    if (isFinite(primaryV) && isFinite(secondaryV) && secondaryV !== 0) {
      calculatedRatio = (primaryV / secondaryV).toFixed(4);
    }

    // Calculate % deviation and result for each row
    // Deviation formula: ((CR - MR) / CR) * 100
    // Results: Pass if deviation is between -0.5 and 0.5 (inclusive)
    const cr = parseFloat(calculatedRatio);
    const updatedRows = formData.turnsRatio.rows.map((row) => {
      const mr = parseFloat(row.measuredRatio);
      if (!isFinite(mr) || !isFinite(cr) || cr === 0) {
        return { ...row, percentDeviation: "", result: "" as const };
      }
      const deviation = ((cr - mr) / cr) * 100;
      const result: "Pass" | "Fail" =
        deviation <= 0.5 && deviation >= -0.5 ? "Pass" : "Fail";
      return { ...row, percentDeviation: deviation.toFixed(4), result };
    });

    // Calculate difference between MR (max - min)
    const measuredRatios = updatedRows
      .map((r) => parseFloat(r.measuredRatio))
      .filter((n) => isFinite(n));
    let differenceBetweenMR = "";
    let differenceResult: "Pass" | "Fail" | "" = "";
    if (measuredRatios.length >= 2) {
      const max = Math.max(...measuredRatios);
      const min = Math.min(...measuredRatios);
      const diff = ((max - min) / min) * 100;
      differenceBetweenMR = diff.toFixed(4);
      differenceResult = diff <= 0.5 ? "Pass" : "Fail";
    }

    setFormData((prev) => ({
      ...prev,
      turnsRatio: {
        ...prev.turnsRatio,
        calculatedRatio,
        rows: updatedRows,
        differenceBetweenMR,
        differenceResult,
      },
    }));
  }, [
    formData.nameplate.primaryVoltage1,
    formData.nameplate.secondaryVoltage2,
    JSON.stringify(formData.turnsRatio.rows.map((r) => r.measuredRatio)),
  ]);

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const payload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        userName: formData.userName,
        date: formData.date,
        identifier: formData.identifier,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        status: formData.status,
        nameplate: formData.nameplate,
      },
      visual_mechanical: { items: formData.visualInspectionItems },
      insulation_resistance: {
        insulationTemperature: formData.insulationTemperature,
        testVoltage: formData.insulationTestVoltage,
        duration: formData.insulationDuration,
        unit: formData.insulationUnit,
        rows: formData.insulationRows,
        criteriaValue: formData.insulationCriteriaValue,
        criteriaUnits: formData.insulationCriteriaUnits,
        dielectricAbsorptionRatio: formData.dielectricAbsorptionRatio,
      },
      turns_ratio: formData.turnsRatio,
      test_equipment: formData.testEquipment,
      comments: formData.comments,
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema("neta_ops")
          .from("small_lv_dry_type_transformer_ats25_reports")
          .update(payload)
          .eq("id", reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema("neta_ops")
            .from("small_lv_dry_type_transformer_ats25_reports")
            .insert(payload)
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
  }, [jobId, user?.id, formData, reportSlug]);

  useEffect(() => {
    if (!isEditing || loading) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, isEditing, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    const payload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        userName: formData.userName,
        date: formData.date,
        identifier: formData.identifier,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        status: formData.status,
        nameplate: formData.nameplate,
      },
      visual_mechanical: { items: formData.visualInspectionItems },
      insulation_resistance: {
        insulationTemperature: formData.insulationTemperature,
        testVoltage: formData.insulationTestVoltage,
        duration: formData.insulationDuration,
        unit: formData.insulationUnit,
        rows: formData.insulationRows,
        criteriaValue: formData.insulationCriteriaValue,
        criteriaUnits: formData.insulationCriteriaUnits,
        dielectricAbsorptionRatio: formData.dielectricAbsorptionRatio,
      },
      turns_ratio: formData.turnsRatio,
      test_equipment: formData.testEquipment,
      comments: formData.comments,
    };

    try {
      setIsSaving(true);
      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema("neta_ops")
          .from("small_lv_dry_type_transformer_ats25_reports")
          .update(payload)
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
          .from("small_lv_dry_type_transformer_ats25_reports")
          .update(payload)
          .eq("id", createdReportId)
          .select()
          .single();
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema("neta_ops")
            .from("small_lv_dry_type_transformer_ats25_reports")
            .insert(payload)
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
              file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
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
          } else {
            creatingRef.current = false;
          }
        } catch (saveError) {
          creatingRef.current = false;
          throw saveError;
        }
      }

      if ((result as any)?.error) throw (result as any).error;
      setJustSaved(true);
      if (!currentReportId) {
        setIsEditing(false);
        const newId = (result as any)?.data?.id || reportIdRef.current;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      }
    } catch (e: any) {
      console.error("Save error", e);
      alert(`Failed to save report: ${e?.message || "Unknown error"}`);
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

  // Print styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@media print {
      body { margin:0; padding:10px; font-family: Arial, Helvetica, sans-serif !important; }
      html, body { font-size:9px !important; color:black !important; background:white !important; }
      .print\\:hidden { display:none !important; }
      .print\\:block { display:block !important; }
      .print\\:flex { display:flex !important; }
      table { border-collapse:collapse !important; width:100% !important; font-size:8px !important; }
      thead { display:table-header-group !important; }
      tr { page-break-inside: avoid !important; }
      table, th, td, thead, tbody, tr { border:1px solid black !important; }
      th, td { padding:2px 3px !important; text-align:center !important; }
      th { background:#f0f0f0 !important; font-weight:bold !important; }
      input, select, textarea { background:transparent !important; border:none !important; color:black !important; -webkit-appearance:none !important; appearance:none !important; }
      select { background-image:none !important; }
      input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none !important; margin:0 !important; }
      input[type="number"] { -moz-appearance:textfield !important; }
      button:not(.print-visible) { display:none !important; }
      * { color:black !important; }
      .overflow-x-auto { overflow: visible !important; }
      .job-info-onscreen { display: none !important; }
      .job-info-print { display: block !important; }
      table.vm-inspection-table { table-layout: fixed !important; width: 100% !important; }
      table.vm-inspection-table col:nth-child(1) { width: 12% !important; }
      table.vm-inspection-table col:nth-child(2) { width: 68% !important; }
      table.vm-inspection-table col:nth-child(3) { width: 20% !important; }
      table.vm-inspection-table th:nth-child(2), table.vm-inspection-table td:nth-child(2) { white-space: normal !important; overflow-wrap: anywhere !important; word-break: break-word !important; text-align: left !important; }
    }`;
    document.head.appendChild(style);
    return () => {
      try {
        document.head.removeChild(style);
      } catch {
        /* ignore */
      }
    };
  }, []);

  if (loading && currentReportId)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right" style={{ minWidth: 150 }}>
          <div className="font-extrabold text-xl" style={{ color: "#1a4e7c" }}>
            NETA - ATS 7.2.1.1
          </div>
          <div
            className={`mt-1 inline-block pass-fail-status-box ${getPassFailBadgeClass(formData.status)}`}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 800,
              textAlign: "center",
              borderRadius: "6px",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
              minWidth: 60,
            }}
          >
            {formData.status}
          </div>
        </div>
      </div>

      <div className="p-6 flex justify-center print:p-0 print:block">
        <div className="max-w-7xl w-full space-y-6 print:max-w-none print:space-y-2">
          <ReportHeader
            title={reportName}
            isAutoSaving={isAutoSaving}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={isSaving}
            status={formData.status}
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

          {/* Job Information */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Information
            </h2>
            <div className="grid grid-cols-2 gap-6 print:hidden job-info-onscreen">
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Customer
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={maskCustomerName(formData.customerName)}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Site Address
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={maskCustomerAddress(formData.customerLocation)}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    User
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.userName}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          userName: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Date
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        handleChange((p) => ({ ...p, date: e.target.value }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Identifier
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.identifier}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          identifier: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Job #
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.jobNumber}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Technicians
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.technicians}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          technicians: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex items-center">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Temp.
                  </label>
                  <div className="flex-1 flex items-center">
                    <div className="w-16 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="number"
                        value={formData.temperature.fahrenheit}
                        onChange={(e) => handleF(parseFloat(e.target.value))}
                        readOnly={!isEditing}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="mx-2">°F</span>
                    <span className="mx-2">{formData.temperature.celsius}</span>
                    <span className="mx-2">°C</span>
                    <span className="mx-5">TCF</span>
                    <div className="w-16 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={formData.temperature.tcf.toFixed(3)}
                        readOnly
                        className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                      />
                    </div>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Humidity
                  </label>
                  <div className="flex items-center flex-1">
                    <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="number"
                        value={formData.temperature.humidity || 0}
                        onChange={(e) =>
                          handleChange((p) => ({
                            ...p,
                            temperature: {
                              ...p.temperature,
                              humidity: Number(e.target.value),
                            },
                          }))
                        }
                        readOnly={!isEditing}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="ml-2">%</span>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Substation
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.substation}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          substation: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300">
                    Eqpt. Location
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.eqptLocation}
                      onChange={(e) =>
                        handleChange((p) => ({
                          ...p,
                          eqptLocation: e.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? "cursor-default" : ""}`}
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
                temperature: {
                  fahrenheit: formData.temperature.fahrenheit,
                  celsius: formData.temperature.celsius,
                  tcf: formData.temperature.tcf,
                  humidity: formData.temperature.humidity ?? undefined,
                },
              }}
            />
          </div>

          {/* Nameplate Data */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Nameplate Data
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
                <colgroup>
                  <col style={{ width: "33.33%" }} />
                  <col style={{ width: "33.33%" }} />
                  <col style={{ width: "33.34%" }} />
                </colgroup>
                <tbody className="bg-white dark:bg-dark-150">
                  {/* Row 1: Manufacturer, Catalog Number, Serial Number */}
                  <tr>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        Manufacturer:
                      </div>
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.manufacturer}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                manufacturer: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.manufacturer || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        Catalog Number:
                      </div>
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.catalogNumber}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                catalogNumber: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.catalogNumber || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        Serial Number:
                      </div>
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.serialNumber}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                serialNumber: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.serialNumber || "-"}
                      </div>
                    </td>
                  </tr>
                  {/* Row 2: KVA, Temp Rise, Impedance */}
                  <tr>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        KVA:
                      </div>
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.kva}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                kva: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.kva || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        Temp. Rise:
                      </div>
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.tempRise}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                tempRise: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.tempRise || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                        Impedance:
                      </div>
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.impedance}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                impedance: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.impedance || "-"}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Voltages and Winding Connections */}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 border border-neutral-200 dark:border-neutral-700 print:table-fixed print:w-full">
                <thead>
                  <tr>
                    <th
                      className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[9px] print:break-words print:whitespace-normal"
                      colSpan={2}
                    >
                      Voltages (V)
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[9px] print:break-words print:whitespace-normal">
                      Winding Connections
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[9px] print:break-words print:whitespace-normal">
                      Winding Material
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                      Primary
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden flex gap-2">
                        <input
                          className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.primaryVoltage1}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                primaryVoltage1: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                          placeholder="480"
                        />
                        <span>/</span>
                        <input
                          className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.primaryVoltage2}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                primaryVoltage2: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.primaryVoltage1 || "-"} /{" "}
                        {formData.nameplate.primaryVoltage2 || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <select
                          value={formData.nameplate.primaryWindingConnection}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                primaryWindingConnection: e.target.value,
                              },
                            }))
                          }
                          disabled={!isEditing}
                          className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {WINDING_CONNECTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">
                        {formData.nameplate.primaryWindingConnection || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <select
                          value={formData.nameplate.primaryWindingMaterial}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                primaryWindingMaterial: e.target.value,
                              },
                            }))
                          }
                          disabled={!isEditing}
                          className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {WINDING_MATERIALS.map((m) => (
                            <option key={m} value={m}>
                              {m || "Select..."}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">
                        {formData.nameplate.primaryWindingMaterial || "-"}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                      Secondary
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden flex gap-2">
                        <input
                          className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.secondaryVoltage1}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                secondaryVoltage1: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                          placeholder="208"
                        />
                        <span>/</span>
                        <input
                          className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.nameplate.secondaryVoltage2}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                secondaryVoltage2: e.target.value,
                              },
                            }))
                          }
                          readOnly={!isEditing}
                          placeholder="120"
                        />
                      </div>
                      <div className="hidden print:block text-sm">
                        {formData.nameplate.secondaryVoltage1 || "-"} /{" "}
                        {formData.nameplate.secondaryVoltage2 || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <select
                          value={formData.nameplate.secondaryWindingConnection}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                secondaryWindingConnection: e.target.value,
                              },
                            }))
                          }
                          disabled={!isEditing}
                          className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {WINDING_CONNECTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">
                        {formData.nameplate.secondaryWindingConnection || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <select
                          value={formData.nameplate.secondaryWindingMaterial}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              nameplate: {
                                ...p.nameplate,
                                secondaryWindingMaterial: e.target.value,
                              },
                            }))
                          }
                          disabled={!isEditing}
                          className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {WINDING_MATERIALS.map((m) => (
                            <option key={m} value={m}>
                              {m || "Select..."}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">
                        {formData.nameplate.secondaryWindingMaterial || "-"}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tap Position / Voltages */}
            <div className="mt-4">
              <table className="w-full table-fixed border-collapse border border-neutral-200 dark:border-neutral-700">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  {TAP_POSITIONS.map((pos) => (
                    <col key={pos} style={{ width: `${85 / 7}%` }} />
                  ))}
                </colgroup>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                      Tap Position
                    </td>
                    {TAP_POSITIONS.map((pos) => (
                      <td
                        key={pos}
                        className="px-3 py-2 text-center text-sm text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 font-medium"
                      >
                        {pos}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                      Tap Voltages
                    </td>
                    {TAP_POSITIONS.map((pos) => {
                      const key =
                        `tapVoltage${pos}` as keyof typeof formData.nameplate;
                      return (
                        <td
                          key={pos}
                          className="px-2 py-2 text-center border border-neutral-200 dark:border-neutral-700"
                        >
                          <div className="print:hidden">
                            <input
                              className={`form-input w-full text-center text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                              value={(formData.nameplate[key] as string) || ""}
                              onChange={(e) =>
                                handleChange((p) => ({
                                  ...p,
                                  nameplate: {
                                    ...p.nameplate,
                                    [key]: e.target.value,
                                  },
                                }))
                              }
                              readOnly={!isEditing}
                            />
                          </div>
                          <div className="hidden print:block text-sm">
                            {(formData.nameplate[key] as string) || "-"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tap Position Left */}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Tap Position Left:
              </span>
              <input
                className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                value={formData.nameplate.tapPositionLeft}
                onChange={(e) =>
                  handleChange((p) => ({
                    ...p,
                    nameplate: {
                      ...p.nameplate,
                      tapPositionLeft: e.target.value,
                    },
                  }))
                }
                readOnly={!isEditing}
              />
            </div>
          </div>

          {/* Visual and Mechanical Inspection */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 table-fixed vm-inspection-table">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "68%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      NETA Section
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.visualInspectionItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                        {item.id}
                      </td>
                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white whitespace-normal break-words">
                        {item.description}
                      </td>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={item.result}
                            onChange={(e) => {
                              const list = [...formData.visualInspectionItems];
                              list[idx].result = e.target.value;
                              handleChange((p) => ({
                                ...p,
                                visualInspectionItems: list,
                              }));
                            }}
                            disabled={!isEditing}
                            className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
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

          {/* Electrical - Insulation Resistance Tests */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical - Insulation Resistance Tests
            </h2>
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Insulation Temperature (°F):</span>
                <input
                  value={formData.insulationTemperature}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      insulationTemperature: e.target.value,
                    }))
                  }
                  readOnly={!isEditing}
                  className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Temperature Correction Factor:</span>
                <span className="font-semibold">
                  {formData.temperature.tcf.toFixed(3)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Test Voltage (V):</span>
                <select
                  value={formData.insulationTestVoltage}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      insulationTestVoltage: e.target.value,
                    }))
                  }
                  disabled={!isEditing}
                  className={`form-select ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                >
                  {INSULATION_RESISTANCE_TEST_VOLTAGES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Test Duration:</span>
                <input
                  value={formData.insulationDuration}
                  onChange={(e) =>
                    handleChange((p) => ({
                      ...p,
                      insulationDuration: e.target.value,
                    }))
                  }
                  readOnly={!isEditing}
                  className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 border border-neutral-200 dark:border-neutral-700 print:table-fixed print:w-full">
                <thead>
                  <tr>
                    <th
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px] print:w-[12%]"
                      rowSpan={2}
                    >
                      <span className="print:hidden">Winding Under Test</span>
                      <span className="hidden print:inline">
                        Winding
                        <br />
                        Under
                        <br />
                        Test
                      </span>
                    </th>
                    <th
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]"
                      colSpan={2}
                    >
                      Measured Values
                    </th>
                    <th
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]"
                      colSpan={2}
                    >
                      Temp Corrected
                    </th>
                    <th
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px] print:w-[8%]"
                      rowSpan={2}
                    >
                      Units
                    </th>
                    <th
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]"
                      colSpan={2}
                    >
                      Table 100.5
                    </th>
                    <th
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px] print:w-[8%]"
                      rowSpan={2}
                    >
                      Results
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white">
                      0.5 Min.
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white">
                      1 Min.
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white">
                      0.5 Min.
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white">
                      1 Min.
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white">
                      Value
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.insulationRows.map((row, idx) => {
                    // Get the voltage for this row and calculate the Table 100.5 criteria
                    const voltageForRow = getVoltageForRow(idx);
                    const criteriaValue = getTable1005Criteria(
                      voltageForRow,
                      formData.insulationUnit,
                    );
                    const criteriaDisplay = criteriaValue
                      ? `≥ ${criteriaValue}`
                      : "-";

                    const corrected1MinVal = parseFloat(row.corrected1Min);
                    const criteriaNum = parseFloat(criteriaValue);
                    let result: "Pass" | "Fail" | "-" = "-";
                    if (isFinite(corrected1MinVal) && isFinite(criteriaNum)) {
                      result =
                        corrected1MinVal >= criteriaNum ? "Pass" : "Fail";
                    }
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                          {row.windingUnderTest}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.measured05Min}
                            onChange={(e) => {
                              const rows = [...formData.insulationRows];
                              rows[idx].measured05Min = e.target.value;
                              handleChange((p) => ({
                                ...p,
                                insulationRows: rows,
                              }));
                            }}
                            readOnly={!isEditing}
                            className={`form-input w-full text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.measured1Min}
                            onChange={(e) => {
                              const rows = [...formData.insulationRows];
                              rows[idx].measured1Min = e.target.value;
                              handleChange((p) => ({
                                ...p,
                                insulationRows: rows,
                              }));
                            }}
                            readOnly={!isEditing}
                            className={`form-input w-full text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-neutral-900 dark:text-white">
                          {row.corrected05Min || "-"}
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-neutral-900 dark:text-white">
                          {row.corrected1Min || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={formData.insulationUnit}
                            onChange={(e) =>
                              handleChange((p) => ({
                                ...p,
                                insulationUnit: e.target.value,
                              }))
                            }
                            disabled={!isEditing}
                            className={`form-select w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {INSULATION_RESISTANCE_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center text-sm">
                          {criteriaDisplay}
                        </td>
                        <td className="px-3 py-2 text-center text-sm">
                          {formData.insulationUnit}
                        </td>
                        <td
                          className={`px-3 py-2 text-center text-sm font-semibold ${result === "Pass" ? "text-green-600" : result === "Fail" ? "text-red-600" : ""}`}
                        >
                          {result}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Dielectric Absorption Ratio */}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 border border-neutral-200 dark:border-neutral-700 print:table-fixed print:w-full">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px] align-middle"
                    >
                      <span className="print:hidden">
                        Dielectric Absorption Ratio
                      </span>
                      <span className="hidden print:inline">
                        Dielectric
                        <br />
                        Absorption
                        <br />
                        Ratio
                      </span>
                    </th>
                    <th className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]">
                      Calculated as:
                    </th>
                    <th className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]">
                      Pri to Gnd
                    </th>
                    <th className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]">
                      Sec to Gnd
                    </th>
                    <th className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]">
                      Pri to Sec
                    </th>
                    <th className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]">
                      Criteria
                    </th>
                    <th className="px-1 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 print:text-[7px]">
                      Result
                    </th>
                  </tr>
                  <tr>
                    <td className="px-2 py-2 text-center text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 print:text-[8px]">
                      1 Min. / 0.5 Min. Values
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 print:text-[8px]">
                      {formData.dielectricAbsorptionRatio.priToGnd || "-"}
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 print:text-[8px]">
                      {formData.dielectricAbsorptionRatio.secToGnd || "-"}
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 print:text-[8px]">
                      {formData.dielectricAbsorptionRatio.priToSec || "-"}
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 print:text-[8px]">
                      {formData.dielectricAbsorptionRatio.criteria}
                    </td>
                    <td
                      className={`px-2 py-2 text-center text-sm font-semibold border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 print:text-[8px] ${formData.dielectricAbsorptionRatio.result === "Pass" ? "text-green-600 print:bg-green-100" : formData.dielectricAbsorptionRatio.result === "Fail" ? "text-red-600 print:bg-red-100" : ""}`}
                    >
                      {formData.dielectricAbsorptionRatio.result || "-"}
                    </td>
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* Electrical - Turns Ratio Tests */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical - Turns Ratio Tests
            </h2>
            <div className="flex flex-wrap gap-4 items-start">
              {/* Section 1: Tap Settings */}
              <div className="flex-shrink-0">
                <table className="border-collapse border border-neutral-200 dark:border-neutral-700">
                  <tbody className="bg-white dark:bg-dark-150">
                    <tr>
                      <td className="px-2 py-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 text-right whitespace-nowrap">
                        Tap Under Test:
                      </td>
                      <td className="px-2 py-1 border border-neutral-200 dark:border-neutral-700 w-20">
                        <div className="print:hidden">
                          <select
                            value={formData.turnsRatio.tapUnderTest}
                            onChange={(e) =>
                              handleChange((p) => ({
                                ...p,
                                turnsRatio: {
                                  ...p.turnsRatio,
                                  tapUnderTest: e.target.value,
                                },
                              }))
                            }
                            disabled={!isEditing}
                            className={`form-select w-full text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {TAP_POSITIONS.map((pos) => (
                              <option key={pos} value={pos}>
                                {pos}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.turnsRatio.tapUnderTest}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 text-right whitespace-nowrap">
                        Primary Winding Voltage:
                      </td>
                      <td className="px-2 py-1 border border-neutral-200 dark:border-neutral-700 text-center text-sm">
                        {formData.turnsRatio.primaryWindingVoltage || "-"} V
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 text-right whitespace-nowrap">
                        Secondary Winding Voltage:
                      </td>
                      <td className="px-2 py-1 border border-neutral-200 dark:border-neutral-700 text-center text-sm">
                        {formData.turnsRatio.secondaryWindingVoltage || "-"} V
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 text-right whitespace-nowrap">
                        Calculated Ratio (CR):
                      </td>
                      <td className="px-2 py-1 border border-neutral-200 dark:border-neutral-700 text-center text-sm font-semibold">
                        {formData.turnsRatio.calculatedRatio || "#DIV/0!"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section 2: Measured Ratio Table */}
              <div className="flex-grow">
                <table className="border-collapse border border-neutral-200 dark:border-neutral-700 w-full">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                        Primary Winding
                      </th>
                      <th className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                        Measured Ratio (MR)
                      </th>
                      <th className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                        % Deviation from CR
                      </th>
                      <th className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                        Results
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150">
                    {formData.turnsRatio.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1 text-center text-sm border border-neutral-200 dark:border-neutral-700">
                          {row.primaryWinding}
                        </td>
                        <td className="px-2 py-1 border border-neutral-200 dark:border-neutral-700">
                          <div className="print:hidden">
                            <input
                              value={row.measuredRatio || ""}
                              onChange={(e) => {
                                const rows = [...formData.turnsRatio.rows];
                                rows[idx].measuredRatio = e.target.value;
                                handleChange((p) => ({
                                  ...p,
                                  turnsRatio: { ...p.turnsRatio, rows },
                                }));
                              }}
                              readOnly={!isEditing}
                              className={`form-input w-full text-center text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                          </div>
                          <div className="hidden print:block text-center text-sm">
                            {row.measuredRatio || "-"}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-center text-sm border border-neutral-200 dark:border-neutral-700">
                          {row.percentDeviation || "-"}
                        </td>
                        <td
                          className={`px-2 py-1 text-center text-sm font-semibold border border-neutral-200 dark:border-neutral-700 ${row.result === "Pass" ? "text-green-600 bg-green-100 dark:bg-green-900 print:bg-green-100" : row.result === "Fail" ? "text-red-600 bg-red-100 dark:bg-red-900 print:bg-red-100" : ""}`}
                        >
                          {row.result || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Section 3: Difference Between MR */}
              <div className="flex-shrink-0">
                <table className="border-collapse border border-neutral-200 dark:border-neutral-700">
                  <thead>
                    <tr>
                      <th
                        className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700"
                        colSpan={2}
                      >
                        Difference (%) between MR
                      </th>
                    </tr>
                    <tr>
                      <th className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 w-16"></th>
                      <th className="px-2 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 w-16">
                        Results
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150">
                    <tr>
                      <td className="px-2 py-1 text-center text-sm border border-neutral-200 dark:border-neutral-700">
                        {formData.turnsRatio.differenceBetweenMR || "N/A"}
                      </td>
                      <td
                        className={`px-2 py-1 text-center text-sm font-semibold border border-neutral-200 dark:border-neutral-700 ${formData.turnsRatio.differenceResult === "Pass" ? "text-green-600 bg-green-100 dark:bg-green-900 print:bg-green-100" : formData.turnsRatio.differenceResult === "Fail" ? "text-red-600 bg-red-100 dark:bg-red-900 print:bg-red-100" : ""}`}
                      >
                        {formData.turnsRatio.differenceResult || "N/A"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Test Equipment Used */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 border border-neutral-200 dark:border-neutral-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700 w-32"></th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                      Name:
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                      Serial Number:
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                      AMP ID:
                    </th>
                    <th className="px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase border border-neutral-200 dark:border-neutral-700">
                      Cal Date:
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">
                      Megohmmeter:
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <EquipmentAutocomplete
                          value={formData.testEquipment.megohmmeter.name}
                          onChange={(value) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                megohmmeter: {
                                  ...p.testEquipment.megohmmeter,
                                  name: value,
                                },
                              },
                            }))
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
                            setJustSaved(false);
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
                          className="w-full"
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.megohmmeter.name || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={
                            formData.testEquipment.megohmmeter.serialNumber
                          }
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                megohmmeter: {
                                  ...p.testEquipment.megohmmeter,
                                  serialNumber: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.megohmmeter.serialNumber || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.testEquipment.megohmmeter.ampId}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                megohmmeter: {
                                  ...p.testEquipment.megohmmeter,
                                  ampId: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.megohmmeter.ampId || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.testEquipment.megohmmeter.calDate}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                megohmmeter: {
                                  ...p.testEquipment.megohmmeter,
                                  calDate: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.megohmmeter.calDate || "-"}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">
                      TTR Test Set:
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <EquipmentAutocomplete
                          value={formData.testEquipment.ttrTestSet.name}
                          onChange={(value) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                ttrTestSet: {
                                  ...p.testEquipment.ttrTestSet,
                                  name: value,
                                },
                              },
                            }))
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
                            setJustSaved(false);
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
                          className="w-full"
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.ttrTestSet.name || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.testEquipment.ttrTestSet.serialNumber}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                ttrTestSet: {
                                  ...p.testEquipment.ttrTestSet,
                                  serialNumber: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.ttrTestSet.serialNumber || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.testEquipment.ttrTestSet.ampId}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                ttrTestSet: {
                                  ...p.testEquipment.ttrTestSet,
                                  ampId: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.ttrTestSet.ampId || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                      <div className="print:hidden">
                        <input
                          className={`form-input w-full ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          value={formData.testEquipment.ttrTestSet.calDate}
                          onChange={(e) =>
                            handleChange((p) => ({
                              ...p,
                              testEquipment: {
                                ...p.testEquipment,
                                ttrTestSet: {
                                  ...p.testEquipment.ttrTestSet,
                                  calDate: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditing}
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">
                        {formData.testEquipment.ttrTestSet.calDate || "-"}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Comments */}
          <div
            className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments:
            </h2>
            <textarea
              value={formData.comments}
              onChange={(e) =>
                handleChange((p) => ({ ...p, comments: e.target.value }))
              }
              rows={4}
              readOnly={!isEditing}
              className={`form-textarea w-full resize-none ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} print:hidden`}
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
        </div>
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

export default SmallLowVoltageDryTypeTransformerATS25Report;
