import React, { useEffect, useState, useCallback } from "react";
import { ReportHeader } from "@/components/reports/common/ReportHeader";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { navigateAfterSave } from "./ReportUtils";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string;
  date: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  eqptLocation: string;
  identifier: string;

  // Temperature data for JobInfoPrintTable
  temperature?: {
    fahrenheit: number | "";
    celsius: number | "";
    tcf: number;
    humidity: number | "";
  };

  // Device Data
  deviceData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    systemVoltage: string;
    type: string;
    icRating: string;
    ratedVoltage: string;
    phaseConfig: string;
  };

  // Fuse Data
  fuseData: {
    manufacturer: string;
    class: string;
    icRating: string;
    catalogNumber: string;
    ampacity: string;
    voltageRating: string;
  };

  // Visual and Mechanical Inspection
  visualMechanicalInspection: {
    [key: string]: string;
  };

  // Test Results - Insulation Resistance
  insulationResistance: {
    testVoltage: string;
    pole1: {
      poleToPole: string;
      poleToFrame: string;
      lineToLoad: string;
      poleToN1: string;
    };
    pole2: {
      poleToPole: string;
      poleToFrame: string;
      lineToLoad: string;
      poleToN1: string;
    };
    pole3: {
      poleToPole: string;
      poleToFrame: string;
      lineToLoad: string;
      poleToN1: string;
    };
  };

  // Pole Resistance
  poleResistance: {
    p1AsFound: string;
    p1AsLeft: string;
    p2AsFound: string;
    p2AsLeft: string;
    p3AsFound: string;
    p3AsLeft: string;
    nAsFound: string;
    nAsLeft: string;
    switchAsFound: string;
    switchAsLeft: string;
    fuseSwitchAsFound: string;
    fuseSwitchAsLeft: string;
  };

  // Detailed Pole Resistance per device (for table rendering)
  poleResistanceDevices?: {
    switch: {
      p1AsFound: string;
      p1AsLeft: string;
      p2AsFound: string;
      p2AsLeft: string;
      p3AsFound: string;
      p3AsLeft: string;
      nAsFound: string;
      nAsLeft: string;
    };
    fuse: {
      p1AsFound: string;
      p1AsLeft: string;
      p2AsFound: string;
      p2AsLeft: string;
      p3AsFound: string;
      p3AsLeft: string;
      nAsFound: string;
      nAsLeft: string;
    };
    switchFuse: {
      p1AsFound: string;
      p1AsLeft: string;
      p2AsFound: string;
      p2AsLeft: string;
      p3AsFound: string;
      p3AsLeft: string;
      nAsFound: string;
      nAsLeft: string;
    };
  };

  // Comments
  comments: string;
}

const getVisualInspectionDescription = (section: string): string => {
  const descriptions: Record<string, string> = {
    "7.5.1.1.A.1": "Inspect physical and mechanical condition.",
    "7.5.1.1.A.2":
      "Inspect anchorage, alignment, grounding, and required clearances.",
    "7.5.1.1.A.3":
      "Before cleaning the unit, perform as-found tests if required.",
    "7.5.1.1.A.4": "Verify the unit is clean.",
    "7.5.1.1.A.5":
      "Verify blade alignment, blade penetration, travel stops, and mechanical operation.",
    "7.5.1.1.A.6":
      "Verify fuse sizes and types match drawings, short-circuit studies, and coordination study.",
    "7.5.1.1.A.7.1":
      "Verify each fuse has adequate mechanical support and contact integrity.",
    "7.5.1.1.A.9.1":
      "Inspect bolted electrical connections with a low-resistance ohmmeter. Verify interlock operation and sequencing.",
    "7.5.1.1.A.10.1": "Verify correct phase barrier installation.",
    "7.5.1.1.A.11.1":
      "Verify correct operation of all indicating and control devices.",
    "7.5.1.1.A.13":
      "Apply appropriate lubrication on moving current‑carrying parts and sliding surfaces. Perform as-left tests.",
  };
  return descriptions[section] || "";
};

const VISUAL_INSPECTION_SECTIONS = [
  "7.5.1.1.A.1",
  "7.5.1.1.A.2",
  "7.5.1.1.A.3",
  "7.5.1.1.A.4",
  "7.5.1.1.A.5",
  "7.5.1.1.A.6",
  "7.5.1.1.A.7.1",
  "7.5.1.1.A.9.1",
  "7.5.1.1.A.10.1",
  "7.5.1.1.A.11.1",
  "7.5.1.1.A.13",
];

const TEST_VOLTAGE_OPTIONS = ["250V", "500V", "1000V", "2500V", "5000V"];
const VISUAL_INSPECTION_OPTIONS = [
  "",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable",
];

// Temperature Correction Factor utilities (aligned with Medium Voltage Cable ATS)
const calculateCorrectedValue = (value: string, tcf: number): string => {
  if (value === "" || value === null || value === undefined) return "";
  const trimmed = String(value).trim();
  const numeric = parseFloat(trimmed);
  if (isNaN(numeric) || trimmed !== numeric.toString()) return trimmed;
  if (!tcf || tcf === 0) return numeric.toFixed(2);
  return (numeric * tcf).toFixed(2);
};

const getTCF = (celsius: number): number => {
  const tempFactors = [
    { temp: -24, factor: 0.054 },
    { temp: -23, factor: 0.068 },
    { temp: -22, factor: 0.082 },
    { temp: -21, factor: 0.096 },
    { temp: -20, factor: 0.11 },
    { temp: -19, factor: 0.124 },
    { temp: -18, factor: 0.138 },
    { temp: -17, factor: 0.152 },
    { temp: -16, factor: 0.166 },
    { temp: -15, factor: 0.18 },
    { temp: -14, factor: 0.194 },
    { temp: -13, factor: 0.208 },
    { temp: -12, factor: 0.222 },
    { temp: -11, factor: 0.236 },
    { temp: -10, factor: 0.25 },
    { temp: -9, factor: 0.264 },
    { temp: -8, factor: 0.278 },
    { temp: -7, factor: 0.292 },
    { temp: -6, factor: 0.306 },
    { temp: -5, factor: 0.32 },
    { temp: -4, factor: 0.336 },
    { temp: -3, factor: 0.352 },
    { temp: -2, factor: 0.368 },
    { temp: -1, factor: 0.384 },
    { temp: 0, factor: 0.4 },
    { temp: 1, factor: 0.42 },
    { temp: 2, factor: 0.44 },
    { temp: 3, factor: 0.46 },
    { temp: 4, factor: 0.48 },
    { temp: 5, factor: 0.5 },
    { temp: 6, factor: 0.526 },
    { temp: 7, factor: 0.552 },
    { temp: 8, factor: 0.578 },
    { temp: 9, factor: 0.604 },
    { temp: 10, factor: 0.63 },
    { temp: 11, factor: 0.666 },
    { temp: 12, factor: 0.702 },
    { temp: 13, factor: 0.738 },
    { temp: 14, factor: 0.774 },
    { temp: 15, factor: 0.81 },
    { temp: 16, factor: 0.848 },
    { temp: 17, factor: 0.886 },
    { temp: 18, factor: 0.924 },
    { temp: 19, factor: 0.962 },
    { temp: 20, factor: 1.0 },
    { temp: 21, factor: 1.05 },
    { temp: 22, factor: 1.1 },
    { temp: 23, factor: 1.15 },
    { temp: 24, factor: 1.2 },
    { temp: 25, factor: 1.25 },
    { temp: 26, factor: 1.316 },
    { temp: 27, factor: 1.382 },
    { temp: 28, factor: 1.448 },
    { temp: 29, factor: 1.514 },
    { temp: 30, factor: 1.58 },
    { temp: 31, factor: 1.664 },
    { temp: 32, factor: 1.748 },
    { temp: 33, factor: 1.832 },
    { temp: 34, factor: 1.872 },
    { temp: 35, factor: 2.0 },
    { temp: 36, factor: 2.1 },
    { temp: 37, factor: 2.2 },
    { temp: 38, factor: 2.3 },
    { temp: 39, factor: 2.4 },
    { temp: 40, factor: 2.5 },
    { temp: 41, factor: 2.628 },
    { temp: 42, factor: 2.756 },
    { temp: 43, factor: 2.884 },
    { temp: 44, factor: 3.012 },
    { temp: 45, factor: 3.15 },
    { temp: 46, factor: 3.316 },
    { temp: 47, factor: 3.482 },
    { temp: 48, factor: 3.648 },
    { temp: 49, factor: 3.814 },
    { temp: 50, factor: 3.98 },
    { temp: 51, factor: 4.184 },
    { temp: 52, factor: 4.388 },
    { temp: 53, factor: 4.592 },
    { temp: 54, factor: 4.796 },
    { temp: 55, factor: 5.0 },
    { temp: 56, factor: 5.26 },
    { temp: 57, factor: 5.52 },
    { temp: 58, factor: 5.78 },
    { temp: 59, factor: 6.04 },
    { temp: 60, factor: 6.3 },
  ];
  const exactMatch = tempFactors.find((tf) => tf.temp === celsius);
  if (exactMatch) return exactMatch.factor;
  const lowerFactor = tempFactors.filter((tf) => tf.temp < celsius).pop();
  const upperFactor = tempFactors.find((tf) => tf.temp > celsius);
  if (!lowerFactor || !upperFactor) {
    return tempFactors.reduce((prev, curr) =>
      Math.abs(curr.temp - celsius) < Math.abs(prev.temp - celsius)
        ? curr
        : prev,
    ).factor;
  }
  const range = upperFactor.temp - lowerFactor.temp;
  const ratio = (celsius - lowerFactor.temp) / range;
  return lowerFactor.factor + ratio * (upperFactor.factor - lowerFactor.factor);
};

const LowVoltageSwitchMaintMTSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    initialReportId,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState<boolean>(!initialReportId);
  const [status, setStatus] = useState<"PASS" | "FAIL">("PASS");
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get("print") === "true";

  const reportSlug = "6-low-voltage-switch-maint-mts-report";
  const reportName = getReportName(reportSlug);

  const [formData, setFormData] = useState<FormData>({
    customer: "",
    address: "",
    user: "",
    date: new Date().toISOString().split("T")[0],
    jobNumber: "",
    technicians: "",
    substation: "",
    eqptLocation: "",
    identifier: "",

    temperature: {
      fahrenheit: 68,
      celsius: 20,
      tcf: 1,
      humidity: 50,
    },

    deviceData: {
      manufacturer: "",
      catalogNumber: "",
      serialNumber: "",
      systemVoltage: "",
      type: "",
      icRating: "",
      ratedVoltage: "",
      phaseConfig: "",
    },

    fuseData: {
      manufacturer: "",
      class: "",
      icRating: "",
      catalogNumber: "",
      ampacity: "",
      voltageRating: "",
    },

    visualMechanicalInspection: VISUAL_INSPECTION_SECTIONS.reduce(
      (acc, section) => {
        acc[section] = "";
        return acc;
      },
      {} as { [key: string]: string },
    ),

    insulationResistance: {
      testVoltage: "1000VDC",
      pole1: {
        poleToPole: "0",
        poleToFrame: "0",
        lineToLoad: "0",
        poleToN1: "0",
      },
      pole2: {
        poleToPole: "0",
        poleToFrame: "0",
        lineToLoad: "0",
        poleToN1: "0",
      },
      pole3: {
        poleToPole: "0",
        poleToFrame: "0",
        lineToLoad: "0",
        poleToN1: "0",
      },
    },

    poleResistance: {
      p1AsFound: "",
      p1AsLeft: "",
      p2AsFound: "",
      p2AsLeft: "",
      p3AsFound: "",
      p3AsLeft: "",
      nAsFound: "",
      nAsLeft: "",
      switchAsFound: "",
      switchAsLeft: "",
      fuseSwitchAsFound: "",
      fuseSwitchAsLeft: "",
    },

    poleResistanceDevices: {
      switch: {
        p1AsFound: "",
        p1AsLeft: "",
        p2AsFound: "",
        p2AsLeft: "",
        p3AsFound: "",
        p3AsLeft: "",
        nAsFound: "",
        nAsLeft: "",
      },
      fuse: {
        p1AsFound: "",
        p1AsLeft: "",
        p2AsFound: "",
        p2AsLeft: "",
        p3AsFound: "",
        p3AsLeft: "",
        nAsFound: "",
        nAsLeft: "",
      },
      switchFuse: {
        p1AsFound: "",
        p1AsLeft: "",
        p2AsFound: "",
        p2AsLeft: "",
        p3AsFound: "",
        p3AsLeft: "",
        nAsFound: "",
        nAsLeft: "",
      },
    },

    comments: "",
  });

  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;

    try {
      setLoading(true);
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select(`title, job_number, customer_id, site_address`)
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
            .select(`name, company_name, address`)
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
          address: customerAddress,
          jobNumber: jobData.job_number || "",
        }));
      }
    } catch (error) {
      console.error("Error loading job info:", error);
      toast.error(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  const loadReport = useCallback(async () => {
    // CRITICAL: Check this FIRST before checking !currentReportId
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) {
      setLoading(false);
      setIsEditMode(true);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("low_voltage_switch_maint_mts_reports")
        .select("*")
        .eq("id", currentReportId)
        .single();

      if (error) throw error;

      if (data && data.report_info) {
        setFormData((prev) => ({
          ...prev,
          ...data.report_info,
        }));

        if (data.report_info.status) {
          setStatus(data.report_info.status);
        }

        setIsEditMode(false);
      }
    } catch (error) {
      console.error("Error loading report:", error);
      toast.error(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [currentReportId]);

  useEffect(() => {
    // For new reports, preload job info. For existing reports, do not override
    // fields that will be loaded from the saved report.
    if (!currentReportId) {
      loadJobInfo();
    }
  }, [loadJobInfo, currentReportId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Add print styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        * { color: black !important; }

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
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleChange = (field: string, value: any) => {
    setJustSaved(false);
    if (field.startsWith("deviceData.")) {
      const subField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        deviceData: {
          ...prev.deviceData,
          [subField]: value,
        },
      }));
    } else if (field.startsWith("fuseData.")) {
      const subField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        fuseData: {
          ...prev.fuseData,
          [subField]: value,
        },
      }));
    } else if (field.startsWith("insulationResistance.")) {
      const parts = field.split(".");
      if (parts.length === 2) {
        setFormData((prev) => ({
          ...prev,
          insulationResistance: {
            ...prev.insulationResistance,
            [parts[1]]: value,
          },
        }));
      } else if (parts.length === 3) {
        const pole = parts[1];
        const measurement = parts[2];
        setFormData((prev) => ({
          ...prev,
          insulationResistance: {
            ...prev.insulationResistance,
            [pole]: {
              ...(prev.insulationResistance as any)[pole],
              [measurement]: value,
            },
          },
        }));
      }
    } else if (field.startsWith("poleResistance.")) {
      const subField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        poleResistance: {
          ...prev.poleResistance,
          [subField]: value,
        },
      }));
    } else if (field.startsWith("visualMechanicalInspection.")) {
      const prefix = "visualMechanicalInspection.";
      const sectionKey = field.slice(prefix.length); // preserve full section like 7.5.1.1.A.1
      setFormData((prev) => ({
        ...prev,
        visualMechanicalInspection: {
          ...prev.visualMechanicalInspection,
          [sectionKey]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        ...formData,
        status,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema("neta_ops")
          .from("low_voltage_switch_maint_mts_reports")
          .update(reportPayload)
          .eq("id", reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema("neta_ops")
            .from("low_voltage_switch_maint_mts_reports")
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
  }, [jobId, user?.id, formData, status, reportSlug]);

  // Auto-save effect with debounce (MUST be placed AFTER autoSave function definition)
  useEffect(() => {
    if (!isEditMode || loading) return;

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
  }, [formData, status, isEditMode, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    const wasExistingReport = Boolean(currentReportId || reportIdRef.current);

    try {
      setSaving(true);
      const reportPayload = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          ...formData,
          status,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema("neta_ops")
          .from("low_voltage_switch_maint_mts_reports")
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
          .from("low_voltage_switch_maint_mts_reports")
          .update(reportPayload)
          .eq("id", createdReportId)
          .select()
          .single();
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema("neta_ops")
            .from("low_voltage_switch_maint_mts_reports")
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

      setJustSaved(true);
      if (!wasExistingReport) {
        setIsEditMode(false);
        // Quietly update URL with new report ID
        const newId = result?.data?.id;
        if (newId) {
          navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
        }
      }
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast.error(
        `Failed to save report: ${error?.message || "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportIdRef.current) {
      setIsEditMode(false);
    }
  };

  const renderHeader = () => (
    <ReportHeader
      title={reportName}
      isAutoSaving={isAutoSaving}
      isEditing={isEditMode}
      justSaved={justSaved}
      isSaving={saving}
      status={status}
      hasReport={!!currentReportId}
      onStatusToggle={() => {
        if (isEditMode) {
          setStatus(status === "PASS" ? "FAIL" : "PASS");
        }
      }}
      onSave={handleSave}
      onSaveAndClose={handleSaveAndClose}
      onEdit={() => setIsEditMode(true)}
      onBack={() => navigate(`/jobs/${jobId}`)}
      onPrint={() => window.print()}
      isPrintMode={isPrintMode}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - visible only in print */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-zinc-800 pb-4 mb-6">
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
          NETA ATS/MTS 7.5.1.1.6
          <div className="hidden print:block mt-2">
            <div
              className={`pass-fail-status-box ${getPassFailBadgeClass(status)}`}
              style={{
                display: "inline-block",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "bold",
                textAlign: "center",
                width: "fit-content",
                borderRadius: "6px",
                border: `2px solid ${status === "PASS" ? "#16a34a" : "#dc2626"}`,
                backgroundColor: status === "PASS" ? "#22c55e" : "#ef4444",
                color: "white",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
                boxSizing: "border-box",
                minWidth: "50px",
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </div>
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {renderHeader()}

          {/* Job Information */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
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
                temperature:
                  typeof formData.temperature === "number"
                    ? formData.temperature
                    : {
                        fahrenheit:
                          formData.temperature?.fahrenheit === ""
                            ? undefined
                            : (formData.temperature?.fahrenheit as
                                | number
                                | undefined),
                        celsius:
                          formData.temperature?.celsius === ""
                            ? undefined
                            : (formData.temperature?.celsius as
                                | number
                                | undefined),
                        tcf: formData.temperature?.tcf,
                        humidity:
                          formData.temperature?.humidity === ""
                            ? undefined
                            : (formData.temperature?.humidity as
                                | number
                                | undefined),
                      },
              }}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 print:hidden">
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Customer</label>
                <input
                  type="text"
                  value={maskCustomerName(formData.customer)}
                  onChange={(e) => handleChange("customer", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Job #</label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  onChange={(e) => handleChange("jobNumber", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Site Address
                </label>
                <input
                  type="text"
                  value={maskCustomerAddress(formData.address)}
                  onChange={(e) => handleChange("address", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Technicians
                </label>
                <input
                  type="text"
                  value={formData.technicians}
                  onChange={(e) => handleChange("technicians", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">User</label>
                <input
                  type="text"
                  value={formData.user}
                  onChange={(e) => handleChange("user", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Temp.</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={
                      formData.temperature?.fahrenheit === ""
                        ? ""
                        : formData.temperature?.fahrenheit || 68
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setFormData((prev) => ({
                          ...prev,
                          temperature: {
                            fahrenheit: "",
                            celsius: "",
                            tcf: prev.temperature?.tcf ?? 1,
                            humidity: prev.temperature?.humidity ?? "",
                          },
                        }));
                        return;
                      }
                      const fahrenheit = Number(raw);
                      const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
                      const tcf = getTCF(celsius);
                      setFormData((prev) => ({
                        ...prev,
                        temperature: {
                          fahrenheit,
                          celsius,
                          tcf,
                          humidity: prev.temperature?.humidity ?? "",
                        },
                      }));
                    }}
                    readOnly={!isEditMode}
                    className={`form-input w-24 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                  />
                  <span>°F</span>
                  <span>
                    {formData.temperature?.celsius === ""
                      ? ""
                      : formData.temperature?.celsius || 20}
                  </span>
                  <span>°C</span>
                  <span className="ml-4">TCF</span>
                  <input
                    type="text"
                    value={(formData.temperature?.tcf ?? 1).toFixed(3)}
                    readOnly
                    className="form-input w-20 bg-zinc-100 dark:bg-dark-200"
                  />
                </div>
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange("date", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Humidity</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={
                      formData.temperature?.humidity === ""
                        ? ""
                        : (formData.temperature?.humidity ?? "")
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        temperature: {
                          fahrenheit:
                            prev.temperature?.fahrenheit === ""
                              ? ""
                              : (prev.temperature?.fahrenheit ?? 68),
                          celsius:
                            prev.temperature?.celsius === ""
                              ? ""
                              : (prev.temperature?.celsius ?? 20),
                          tcf: prev.temperature?.tcf ?? 1,
                          humidity:
                            e.target.value === "" ? "" : Number(e.target.value),
                        },
                      }))
                    }
                    readOnly={!isEditMode}
                    className={`form-input w-24 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Identifier
                </label>
                <input
                  type="text"
                  value={formData.identifier}
                  onChange={(e) => handleChange("identifier", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Substation
                </label>
                <input
                  type="text"
                  value={formData.substation}
                  onChange={(e) => handleChange("substation", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">
                  Eqpt. Location
                </label>
                <input
                  type="text"
                  value={formData.eqptLocation}
                  onChange={(e) => handleChange("eqptLocation", e.target.value)}
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
            </div>
          </section>

          {/* Device Data */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Device Data
            </h2>
            {/* On-screen grid */}
            <div className="grid grid-cols-2 gap-4 print:hidden">
              <div className="flex items-center">
                <label
                  htmlFor="deviceManufacturer"
                  className="form-label inline-block w-32"
                >
                  Manufacturer:
                </label>
                <input
                  id="deviceManufacturer"
                  type="text"
                  value={formData.deviceData.manufacturer}
                  onChange={(e) =>
                    handleChange("deviceData.manufacturer", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceType"
                  className="form-label inline-block w-32"
                >
                  Type:
                </label>
                <input
                  id="deviceType"
                  type="text"
                  value={formData.deviceData.type}
                  onChange={(e) =>
                    handleChange("deviceData.type", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceCatalogNumber"
                  className="form-label inline-block w-32"
                >
                  Catalog Number:
                </label>
                <input
                  id="deviceCatalogNumber"
                  type="text"
                  value={formData.deviceData.catalogNumber}
                  onChange={(e) =>
                    handleChange("deviceData.catalogNumber", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceIcRating"
                  className="form-label inline-block w-32"
                >
                  I.C. Rating:
                </label>
                <input
                  id="deviceIcRating"
                  type="text"
                  value={formData.deviceData.icRating}
                  onChange={(e) =>
                    handleChange("deviceData.icRating", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceSerialNumber"
                  className="form-label inline-block w-32"
                >
                  Serial Number:
                </label>
                <input
                  id="deviceSerialNumber"
                  type="text"
                  value={formData.deviceData.serialNumber}
                  onChange={(e) =>
                    handleChange("deviceData.serialNumber", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceRatedVoltage"
                  className="form-label inline-block w-32"
                >
                  Rated Voltage:
                </label>
                <input
                  id="deviceRatedVoltage"
                  type="text"
                  value={formData.deviceData.ratedVoltage}
                  onChange={(e) =>
                    handleChange("deviceData.ratedVoltage", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="deviceSystemVoltage"
                  className="form-label inline-block w-32"
                >
                  System Voltage:
                </label>
                <input
                  id="deviceSystemVoltage"
                  type="text"
                  value={formData.deviceData.systemVoltage}
                  onChange={(e) =>
                    handleChange("deviceData.systemVoltage", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="devicePhaseConfig"
                  className="form-label inline-block w-32"
                >
                  Phase Config.:
                </label>
                <input
                  id="devicePhaseConfig"
                  type="text"
                  value={formData.deviceData.phaseConfig}
                  onChange={(e) =>
                    handleChange("deviceData.phaseConfig", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
            </div>
            {/* Print-only device table */}
            <div className="hidden print:block">
              <table className="w-full border-collapse border border-black">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">
                        {formData.deviceData.manufacturer}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Type:</div>
                      <div className="mt-1">{formData.deviceData.type}</div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Catalog Number:</div>
                      <div className="mt-1">
                        {formData.deviceData.catalogNumber}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">I.C. Rating:</div>
                      <div className="mt-1">{formData.deviceData.icRating}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-1">
                        {formData.deviceData.serialNumber}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Rated Voltage:</div>
                      <div className="mt-1">
                        {formData.deviceData.ratedVoltage}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">System Voltage:</div>
                      <div className="mt-1">
                        {formData.deviceData.systemVoltage}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Phase Config.:</div>
                      <div className="mt-1">
                        {formData.deviceData.phaseConfig}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Fuse Data */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Fuse Data
            </h2>
            {/* On-screen grid */}
            <div className="grid grid-cols-2 gap-4 print:hidden">
              <div className="flex items-center">
                <label
                  htmlFor="fuseManufacturer"
                  className="form-label inline-block w-32"
                >
                  Manufacturer:
                </label>
                <input
                  id="fuseManufacturer"
                  type="text"
                  value={formData.fuseData.manufacturer}
                  onChange={(e) =>
                    handleChange("fuseData.manufacturer", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseCatalogNumber"
                  className="form-label inline-block w-32"
                >
                  Catalog Number:
                </label>
                <input
                  id="fuseCatalogNumber"
                  type="text"
                  value={formData.fuseData.catalogNumber}
                  onChange={(e) =>
                    handleChange("fuseData.catalogNumber", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseClass"
                  className="form-label inline-block w-32"
                >
                  Class:
                </label>
                <input
                  id="fuseClass"
                  type="text"
                  value={formData.fuseData.class}
                  onChange={(e) =>
                    handleChange("fuseData.class", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseAmpacity"
                  className="form-label inline-block w-32"
                >
                  Ampacity:
                </label>
                <input
                  id="fuseAmpacity"
                  type="text"
                  value={formData.fuseData.ampacity}
                  onChange={(e) =>
                    handleChange("fuseData.ampacity", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseIcRating"
                  className="form-label inline-block w-32"
                >
                  I.C. Rating:
                </label>
                <input
                  id="fuseIcRating"
                  type="text"
                  value={formData.fuseData.icRating}
                  onChange={(e) =>
                    handleChange("fuseData.icRating", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label
                  htmlFor="fuseVoltageRating"
                  className="form-label inline-block w-32"
                >
                  Voltage Rating:
                </label>
                <input
                  id="fuseVoltageRating"
                  type="text"
                  value={formData.fuseData.voltageRating}
                  onChange={(e) =>
                    handleChange("fuseData.voltageRating", e.target.value)
                  }
                  readOnly={!isEditMode}
                  className={`form-input flex-1 ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                />
              </div>
            </div>
            {/* Print-only fuse table */}
            <div className="hidden print:block">
              <table className="w-full border-collapse border border-black">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">
                        {formData.fuseData.manufacturer}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Catalog Number:</div>
                      <div className="mt-1">
                        {formData.fuseData.catalogNumber}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Class:</div>
                      <div className="mt-1">{formData.fuseData.class}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Voltage Rating:</div>
                      <div className="mt-1">
                        {formData.fuseData.voltageRating}
                      </div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">Ampacity:</div>
                      <div className="mt-1">{formData.fuseData.ampacity}</div>
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      <div className="font-semibold">I.C. Rating:</div>
                      <div className="mt-1">{formData.fuseData.icRating}</div>
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
              <table className="w-full table-fixed border-collapse border border-zinc-300 dark:border-zinc-600">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "65%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-zinc-50 dark:bg-dark-200">
                    <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-left text-zinc-900 dark:text-white w-40">
                      Section
                    </th>
                    <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-left text-zinc-900 dark:text-white">
                      Description
                    </th>
                    <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-center text-zinc-900 dark:text-white w-48">
                      Results
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {VISUAL_INSPECTION_SECTIONS.map((sectionCode) => (
                    <tr key={sectionCode}>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        {sectionCode}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        {getVisualInspectionDescription(sectionCode)}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-center">
                        <div className="print:hidden">
                          <select
                            value={
                              formData.visualMechanicalInspection[
                                sectionCode
                              ] || ""
                            }
                            onChange={(e) =>
                              handleChange(
                                `visualMechanicalInspection.${sectionCode}`,
                                e.target.value,
                              )
                            }
                            disabled={!isEditMode}
                            className={`form-select w-full text-center ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                          >
                            {VISUAL_INSPECTION_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">
                          {formData.visualMechanicalInspection[sectionCode] ||
                            ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Results */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Results
            </h2>

            {/* Insulation Resistance */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-zinc-900 dark:text-white">
                Insulation Resistance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-zinc-300 dark:border-zinc-600">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-dark-200">
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        Insulation Resistance
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        Pole 1 MΩ
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        Pole 2 MΩ
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        Pole 3 MΩ
                      </th>
                    </tr>
                    <tr className="bg-zinc-50 dark:bg-dark-200">
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"></th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"></th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Reading
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        20°C
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Reading
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        20°C
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Reading
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        20°C
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Test Voltage
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <select
                          value={formData.insulationResistance.testVoltage}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.testVoltage",
                              e.target.value,
                            )
                          }
                          disabled={!isEditMode}
                          className={`form-select w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        >
                          {TEST_VOLTAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className="border border-zinc-300 dark:border-zinc-600 p-2"
                        colSpan={6}
                      ></td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Pole to Pole
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Closed
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole1.poleToPole}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.poleToPole",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.poleToPole,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole2.poleToPole}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.poleToPole",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.poleToPole,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole3.poleToPole}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.poleToPole",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.poleToPole,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Pole to Frame
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Closed
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.insulationResistance.pole1.poleToFrame
                          }
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.poleToFrame",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.poleToFrame,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.insulationResistance.pole2.poleToFrame
                          }
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.poleToFrame",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.poleToFrame,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.insulationResistance.pole3.poleToFrame
                          }
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.poleToFrame",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.poleToFrame,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Line to Load
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Open
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole1.lineToLoad}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.lineToLoad",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.lineToLoad,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole2.lineToLoad}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.lineToLoad",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.lineToLoad,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole3.lineToLoad}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.lineToLoad",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.lineToLoad,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Pole to Neutral
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Closed
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole1.poleToN1}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole1.poleToN1",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole1.poleToN1,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole2.poleToN1}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole2.poleToN1",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole2.poleToN1,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.insulationResistance.pole3.poleToN1}
                          onChange={(e) =>
                            handleChange(
                              "insulationResistance.pole3.poleToN1",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 bg-zinc-100 dark:bg-dark-200 text-zinc-900 dark:text-white">
                        {calculateCorrectedValue(
                          formData.insulationResistance.pole3.poleToN1,
                          formData.temperature?.tcf ?? 1,
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pole Resistance */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-zinc-900 dark:text-white">
                Pole Resistance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-zinc-300 dark:border-zinc-600">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-dark-200">
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        rowSpan={2}
                      >
                        Pole Resistance
                        <div className="text-sm font-normal">
                          Resistance in Micro-ohms
                        </div>
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        P1
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        P2
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        P3
                      </th>
                      <th
                        className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white"
                        colSpan={2}
                      >
                        N
                      </th>
                    </tr>
                    <tr className="bg-zinc-50 dark:bg-dark-200">
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Left
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Left
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Left
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Found
                      </th>
                      <th className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        As Left
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Switch
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p1AsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p1AsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p1AsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p1AsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p2AsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p2AsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p2AsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p2AsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p3AsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p3AsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.p3AsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.p3AsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.nAsFound}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.nAsFound",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={formData.poleResistance.nAsLeft}
                          onChange={(e) =>
                            handleChange(
                              "poleResistance.nAsLeft",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Fuse
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p1AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p1AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p1AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p1AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p2AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p2AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p2AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p2AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p3AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p3AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.p3AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  p3AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.nAsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  nAsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.fuse.nAsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                fuse: {
                                  ...prev.poleResistanceDevices!.fuse,
                                  nAsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2 text-zinc-900 dark:text-white">
                        Switch + Fuse
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p1AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p1AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p1AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p1AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p2AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p2AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p2AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p2AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p3AsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p3AsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .p3AsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  p3AsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .nAsFound || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  nAsFound: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                      <td className="border border-zinc-300 dark:border-zinc-600 p-2">
                        <input
                          type="text"
                          value={
                            formData.poleResistanceDevices?.switchFuse
                              .nAsLeft || ""
                          }
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              poleResistanceDevices: {
                                ...prev.poleResistanceDevices!,
                                switchFuse: {
                                  ...prev.poleResistanceDevices!.switchFuse,
                                  nAsLeft: e.target.value,
                                },
                              },
                            }))
                          }
                          readOnly={!isEditMode}
                          className={`form-input w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Comments */}
          <section
            className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? "print:hidden" : ""}`}
          >
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white border-b dark:border-zinc-700 pb-2 print:text-black print:border-black print:font-bold">
              Comments:
            </h2>
            <div className="print:hidden">
              <textarea
                value={formData.comments}
                onChange={(e) => handleChange("comments", e.target.value)}
                readOnly={!isEditMode}
                rows={6}
                className={`form-textarea w-full ${!isEditMode ? "bg-zinc-100 dark:bg-dark-200" : ""}`}
              />
            </div>
            {formData.comments?.trim() && (
              <div className="hidden print:block">
                <table className="min-w-full border-collapse border border-black">
                  <thead>
                    <tr>
                      <th className="px-3 py-1 bg-zinc-50 text-center text-xs font-semibold text-black border border-black">
                        Comments
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-black text-black text-sm min-h-[80px] align-top">
                        {formData.comments}
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
      {!isPrintMode && isEditMode && (
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

export default LowVoltageSwitchMaintMTSReport;
