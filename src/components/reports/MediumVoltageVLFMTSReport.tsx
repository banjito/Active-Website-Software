import React, { useState, useEffect } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useUser } from "@supabase/auth-helpers-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { format } from "date-fns";
import { toast } from "react-hot-toast";
import {
  FileText,
  Save,
  ChevronLeft,
  UploadIcon,
  Pencil as PencilIcon,
} from "lucide-react";
import { navigateAfterSave } from "../reports/ReportUtils";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";

// UI Components
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../ui/Select";
import Card, {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getReportName, getAssetName } from "./reportMappings";
import { BRAND_COLOR } from "@/lib/companyConfig";

// Types
enum TestStatus {
  PASS = "PASS",
  FAIL = "FAIL",
  LIMITED_SERVICE = "LIMITED SERVICE",
}

enum CablePhase {
  A = "A",
  B = "B",
  C = "C",
  N = "N",
}

enum InspectionResult {
  SELECT = "Select One",
  SATISFACTORY = "Satisfactory",
  UNSATISFACTORY = "Unsatisfactory",
  CLEANED = "Cleaned",
  SEE_COMMENTS = "See Comments",
  NONE = "Not Applicable",
}

// Unit Options
const continuityUnits = [
  { label: "Ohms", symbol: "Ω" },
  { label: "Milliohms", symbol: "mΩ" },
  { label: "Microohms", symbol: "μΩ" },
];

const insulationTestVoltages = [
  { label: "500 V", value: "500" },
  { label: "1000 V", value: "1000" },
  { label: "2500 V", value: "2500" },
  { label: "5000 V", value: "5000" },
  { label: "10000 V", value: "10000" },
];

const insulationUnits = [
  { label: "Gigaohms", symbol: "GΩ" },
  { label: "Megaohms", symbol: "MΩ" },
  { label: "kilaohms", symbol: "kΩ" },
];

// Current units for withstand test
const currentUnits = [
  { label: "Milliamps", symbol: "mA" },
  { label: "Microamps", symbol: "µA" },
];

interface MediumVoltageVLFMTSReportForm {
  reportInfo: {
    title?: string;
    date?: string;
    location?: string;
    technicians?: string[];
    reportNumber?: string;
    customerName?: string;
    customerContactName?: string;
    customerContactEmail?: string;
    customerContactPhone?: string;
  };
  status?: TestStatus;
  customerName: string;
  siteAddress: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  jobNumber?: string;
  identifier?: string;
  testedBy: string;
  testDate: string;
  location?: string; // Added for substation
  equipmentLocation?: string; // Added for equipment location

  // Cable information
  cableInfo: {
    description: string;
    size: string;
    length: string;
    voltageRating: string;
    insulation: string;
    yearInstalled: string;
    testedFrom?: string;
    testedTo?: string;
    from?: string;
    to?: string;
    manufacturer?: string;
    insulationThickness?: string;
    conductorMaterial?: string;
  };
  cableType: string;
  operatingVoltage: string;
  cableLength: string;

  // Termination data
  terminationData: {
    terminationData: string;
    ratedVoltage: string;
    terminationData2: string;
    ratedVoltage2: string;
    from?: string;
    to?: string;
  };

  // Visual and Mechanical Inspection
  visualInspection: {
    inspectCablesAndConnectors: InspectionResult;
    inspectTerminationsAndSplices: InspectionResult;
    useOhmmeter: InspectionResult;
    inspectShieldGrounding: InspectionResult;
    verifyBendRadius: InspectionResult;
    inspectCurrentTransformers: InspectionResult;
    comments: string;
  };

  // Electrical Tests - Shield Continuity
  shieldContinuity: {
    phaseA: string;
    phaseB: string;
    phaseC: string;
    unit: string;
  };

  // Electrical Tests - Insulation Resistance Values
  insulationTest: {
    testVoltage: string;
    unit: string;
    preTest: {
      ag: string;
      bg: string;
      cg: string;
    };
    postTest: {
      ag: string;
      bg: string;
      cg: string;
    };
    preTestCorrected: {
      ag: string;
      bg: string;
      cg: string;
    };
    postTestCorrected: {
      ag: string;
      bg: string;
      cg: string;
    };
  };

  // Test Equipment
  equipment: {
    ohmmeter: string;
    ohmSerialNumber: string;
    megohmmeter: string;
    megohmSerialNumber: string;
    vlfHipot: string;
    vlfSerialNumber: string;
    ohmAmpId: string;
    megohmAmpId: string;
    vlfAmpId: string;
    vlfTestSet?: string;
    ohmCalDate?: string;
    megohmCalDate?: string;
    vlfCalDate?: string;
  };

  // Temperature correction data
  temperature: {
    fahrenheit: number;
    celsius: number;
    humidity: number;
    tcf: number;
  };

  // Comments
  comments: string;

  // For backward compatibility (can be pruned if not strictly needed for new report type)
  testEquipment: {
    vlf: string;
    vlfCalibrationDate: string;
    insulationTester: string;
    insulationTesterCalibrationDate: string;
  };
  vlfTests?: Array<{
    testVoltage: string;
    duration: string;
    phase: CablePhase;
    result: string;
    notes: string;
  }>;
  insulationResistanceTests?: Array<{
    phase: CablePhase;
    testVoltage: string;
    oneMinuteReading: string;
    tenMinuteReading: string;
    piRatio: string;
  }>;
  voltageBreakdownChart?: any;
  voltageBreakdownPreview?: string;
  testConditions?: {
    weatherConditions: string;
    temperature: string;
    humidity: string;
    cableCondition: string;
  };
  conclusion?: string;
  recommendations?: string;
  testEngineer?: string;
  clientRepresentative?: string;
  reportDate?: string;
  equipmentType?: string;
  equipmentInfo?: {
    type?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    ratingKV?: string;
    ratingKVA?: string;
    installationDate?: string;
    lastMaintenanceDate?: string;
  };
  testData?: {
    testVoltage?: string;
    testDuration?: string;
    frequency?: string;
    leakageCurrentPhaseA?: string;
    leakageCurrentPhaseB?: string;
    leakageCurrentPhaseC?: string;
  };
  testResults?: {
    summary?: string;
    phaseAStatus?: string;
    phaseBStatus?: string;
    phaseCStatus?: string;
    overallResult?: string;
    recommendedActions?: string;
  };
  notes?: string;
  signatures?: {
    technicianSignature?: string;
    customerSignature?: string;
  };

  // Electrical Tests Withstand Test
  withstandTest: {
    readings: Array<{
      timeMinutes: string;
      kVAC: string;
      phaseA: {
        mA: string;
        nF: string;
        currentUnit?: string;
      };
      phaseB: {
        mA: string;
        nF: string;
        currentUnit?: string;
      };
      phaseC: {
        mA: string;
        nF: string;
        currentUnit?: string;
      };
    }>;
  };
}

// Get temperature correction factor
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
    { temp: 20, factor: 1.0 }, // Reference
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
    { temp: 61, factor: 6.62 },
    { temp: 62, factor: 6.94 },
    { temp: 63, factor: 7.26 },
    { temp: 64, factor: 7.58 },
    { temp: 65, factor: 7.9 },
    { temp: 66, factor: 8.32 },
    { temp: 67, factor: 8.74 },
    { temp: 68, factor: 9.16 },
    { temp: 69, factor: 9.58 },
    { temp: 70, factor: 10.0 },
    { temp: 71, factor: 10.52 },
    { temp: 72, factor: 11.04 },
    { temp: 73, factor: 11.56 },
    { temp: 74, factor: 12.08 },
    { temp: 75, factor: 12.6 },
    { temp: 76, factor: 13.24 },
    { temp: 77, factor: 13.88 },
    { temp: 78, factor: 14.52 },
    { temp: 79, factor: 15.16 },
    { temp: 80, factor: 15.8 },
    { temp: 81, factor: 16.64 },
    { temp: 82, factor: 17.48 },
    { temp: 83, factor: 18.32 },
    { temp: 84, factor: 19.16 },
    { temp: 85, factor: 20.0 },
    { temp: 86, factor: 21.04 },
    { temp: 87, factor: 22.08 },
    { temp: 88, factor: 23.12 },
    { temp: 89, factor: 24.16 },
    { temp: 90, factor: 25.2 },
    { temp: 91, factor: 26.45 },
    { temp: 92, factor: 27.7 },
    { temp: 93, factor: 28.95 },
    { temp: 94, factor: 30.2 },
    { temp: 95, factor: 31.6 },
    { temp: 96, factor: 33.28 },
    { temp: 97, factor: 34.96 },
    { temp: 98, factor: 36.64 },
    { temp: 99, factor: 38.32 },
    { temp: 100, factor: 40.0 },
    { temp: 101, factor: 42.08 },
    { temp: 102, factor: 44.16 },
    { temp: 103, factor: 46.24 },
    { temp: 104, factor: 48.32 },
    { temp: 105, factor: 50.4 },
    { temp: 106, factor: 52.96 },
    { temp: 107, factor: 55.52 },
    { temp: 108, factor: 58.08 },
    { temp: 109, factor: 60.64 },
    { temp: 110, factor: 63.2 },
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

const MediumVoltageVLFMTSReport: React.FC = () => {
  const params = useParams<{ id?: string; jobId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress, maskJobTitle } = useDemoMode();

  // Print Mode Detection
  const isPrintMode = searchParams.get("print") === "true";

  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [reportId, setReportId] = useState<string | undefined>(undefined);
  const currentReportId = reportId;
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = "medium-voltage-vlf-mts-report"; // This component handles the medium-voltage-vlf-mts-report route
  const reportName = getReportName(reportSlug);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pathParts = location.pathname
      .split("/")
      .filter((part) => part !== "");
    const jobsIndex = pathParts.findIndex((part) => part === "jobs");
    let extractedJobId: string | undefined = undefined;
    let extractedReportId: string | undefined = undefined;

    if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
      extractedJobId = pathParts[jobsIndex + 1];
      // Example: /jobs/{jobId}/medium-voltage-vlf-mts-report/{reportId}
      if (jobsIndex + 3 < pathParts.length) {
        extractedReportId = pathParts[jobsIndex + 3];
      }
    }

    setJobId(extractedJobId);
    setReportId(extractedReportId);
    setIsEditMode(!extractedReportId);
  }, [location.pathname]);

  const [formData, setFormData] = useState<MediumVoltageVLFMTSReportForm>({
    reportInfo: {
      title: "MEDIUM VOLTAGE CABLE VLF TEST REPORT MTS",
      date: "",
      location: "",
      technicians: [],
      reportNumber: "",
      customerName: "",
      customerContactName: "",
      customerContactEmail: "",
      customerContactPhone: "",
    },
    status: TestStatus.PASS,
    customerName: "",
    siteAddress: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    jobNumber: "",
    identifier: "",
    testedBy: "",
    testDate: "",
    location: "",
    equipmentLocation: "",
    cableType: "",
    operatingVoltage: "",
    cableLength: "",
    cableInfo: {
      description: "",
      size: "",
      length: "",
      voltageRating: "",
      insulation: "",
      yearInstalled: "",
      testedFrom: "",
      testedTo: "",
      from: "",
      to: "",
      manufacturer: "",
      insulationThickness: "",
      conductorMaterial: "",
    },
    terminationData: {
      terminationData: "",
      ratedVoltage: "",
      terminationData2: "",
      ratedVoltage2: "",
      from: "",
      to: "",
    },
    visualInspection: {
      inspectCablesAndConnectors: InspectionResult.SELECT,
      inspectTerminationsAndSplices: InspectionResult.SELECT,
      useOhmmeter: InspectionResult.SELECT,
      inspectShieldGrounding: InspectionResult.SELECT,
      verifyBendRadius: InspectionResult.SELECT,
      inspectCurrentTransformers: InspectionResult.SELECT,
      comments: "",
    },
    shieldContinuity: { phaseA: "", phaseB: "", phaseC: "", unit: "Ω" },
    insulationTest: {
      testVoltage: "1000",
      unit: "GΩ",
      preTest: { ag: "", bg: "", cg: "" },
      postTest: { ag: "", bg: "", cg: "" },
      preTestCorrected: { ag: "", bg: "", cg: "" },
      postTestCorrected: { ag: "", bg: "", cg: "" },
    },
    equipment: {
      ohmmeter: "",
      ohmSerialNumber: "",
      megohmmeter: "",
      megohmSerialNumber: "",
      vlfHipot: "",
      vlfSerialNumber: "",
      ohmAmpId: "",
      megohmAmpId: "",
      vlfAmpId: "",
      vlfTestSet: "",
      ohmCalDate: "",
      megohmCalDate: "",
      vlfCalDate: "",
    },
    temperature: { fahrenheit: 68, celsius: 20, humidity: 0, tcf: 1.0 },
    comments: "",
    testEquipment: {
      vlf: "",
      vlfCalibrationDate: "",
      insulationTester: "",
      insulationTesterCalibrationDate: "",
    },
    vlfTests: [],
    insulationResistanceTests: [],
    withstandTest: {
      readings: [
        {
          timeMinutes: "10",
          kVAC: "",
          phaseA: { mA: "", nF: "", currentUnit: "mA" },
          phaseB: { mA: "", nF: "", currentUnit: "mA" },
          phaseC: { mA: "", nF: "", currentUnit: "mA" },
        },
        {
          timeMinutes: "20",
          kVAC: "",
          phaseA: { mA: "", nF: "", currentUnit: "mA" },
          phaseB: { mA: "", nF: "", currentUnit: "mA" },
          phaseC: { mA: "", nF: "", currentUnit: "mA" },
        },
        {
          timeMinutes: "30",
          kVAC: "",
          phaseA: { mA: "", nF: "", currentUnit: "mA" },
          phaseB: { mA: "", nF: "", currentUnit: "mA" },
          phaseC: { mA: "", nF: "", currentUnit: "mA" },
        },
        {
          timeMinutes: "40",
          kVAC: "",
          phaseA: { mA: "", nF: "", currentUnit: "mA" },
          phaseB: { mA: "", nF: "", currentUnit: "mA" },
          phaseC: { mA: "", nF: "", currentUnit: "mA" },
        },
        {
          timeMinutes: "50",
          kVAC: "",
          phaseA: { mA: "", nF: "", currentUnit: "mA" },
          phaseB: { mA: "", nF: "", currentUnit: "mA" },
          phaseC: { mA: "", nF: "", currentUnit: "mA" },
        },
        {
          timeMinutes: "60",
          kVAC: "",
          phaseA: { mA: "", nF: "", currentUnit: "mA" },
          phaseB: { mA: "", nF: "", currentUnit: "mA" },
          phaseC: { mA: "", nF: "", currentUnit: "mA" },
        },
      ],
    },
  });

  useEffect(() => {
    if (error || !location.pathname) {
      if (loading) setLoading(false);
      return;
    }
    const loadData = async () => {
      setLoading(true);
      try {
        if (jobId) {
          await loadJobInfo(jobId);
        }
        if (reportId) {
          await loadReport();
        } else {
          setIsEditMode(true);
        }
      } catch (err) {
        if (!error) setError(`Error loading data: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    };
    if (jobId !== undefined || reportId !== undefined) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [jobId, reportId, location.pathname]);

  const loadJobInfo = async (currentJobId: string) => {
    if (!currentJobId) {
      setError("No job ID was provided.");
      return;
    }
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("title,job_number,customer_id,site_address")
        .eq("id", currentJobId)
        .single();
      if (jobError) throw jobError;
      let customerName = "";
      // Prioritize site_address from the job
      let customerAddress = (jobData as any).site_address || "";
      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema("common")
          .from("customers")
          .select("name,company_name,address")
          .eq("id", jobData.customer_id)
          .single();
        if (!customerError && customerData) {
          customerName = customerData.company_name || customerData.name || "";
          // Only use customer address as fallback if job has no site_address
          if (!customerAddress) customerAddress = customerData.address || "";
        }
      }
      setFormData((prev) => ({
        ...prev,
        jobNumber: jobData.job_number || "",
        customerName: maskCustomerName(customerName),
        siteAddress: maskCustomerAddress(customerAddress),
        testDate: prev.testDate || new Date().toISOString().split("T")[0],
        reportInfo: {
          ...prev.reportInfo,
          title: maskJobTitle(jobData.title || ""),
          customerName: maskCustomerName(customerName),
        },
      }));
    } catch (error) {
      setError(`Failed to load job info: ${(error as Error).message}`);
      toast.error(`Failed to load job info: ${(error as Error).message}`);
    }
  };

  const handleChange = (field: string, value: any) => {
    setJustSaved(false);
    setJustSaved(false);
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleInsulationTestValueChange = (
    testType: "preTest" | "postTest" | "preTestCorrected" | "postTestCorrected",
    field: string,
    value: string,
  ) => {
    if (testType === "preTestCorrected" || testType === "postTestCorrected") {
      setFormData((prev) => ({
        ...prev,
        insulationTest: {
          ...prev.insulationTest,
          [testType]: { ...prev.insulationTest[testType], [field]: value },
        },
      }));
      return;
    }
    setFormData((prev) => {
      const updatedTest = {
        ...prev.insulationTest,
        [testType]: { ...prev.insulationTest[testType], [field]: value },
      };
      const correctedField = `${testType}Corrected`;
      const correctedValue = calculateCorrectedValue(
        value,
        prev.temperature.tcf,
      );
      updatedTest[correctedField] = {
        ...prev.insulationTest[correctedField],
        [field]: correctedValue,
      };
      return { ...prev, insulationTest: updatedTest };
    });
  };

  const calculateCorrectedValue = (value: string, tcf: number): string => {
    if (value === "" || value === null || value === undefined) return "";
    const trimmed = String(value).trim();
    const numeric = parseFloat(trimmed);
    // If not a pure number (e.g., "<22", ">2200", "N/A"), copy through unchanged
    if (isNaN(numeric) || trimmed !== numeric.toString()) return trimmed;
    if (!tcf || tcf === 0) return numeric.toFixed(2);
    return (numeric * tcf).toFixed(2);
  };

  useEffect(() => {
    const tcf = getTCF(formData.temperature.celsius);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, tcf },
    }));
    updateCorrectedValues();
  }, [formData.temperature.celsius]);

  const updateCorrectedValues = () => {
    const { insulationTest, temperature } = formData;
    if (!insulationTest) return;
    const preTestCorrected = {
      ag: calculateCorrectedValue(insulationTest.preTest.ag, temperature.tcf),
      bg: calculateCorrectedValue(insulationTest.preTest.bg, temperature.tcf),
      cg: calculateCorrectedValue(insulationTest.preTest.cg, temperature.tcf),
    };
    const postTestCorrected = {
      ag: calculateCorrectedValue(insulationTest.postTest.ag, temperature.tcf),
      bg: calculateCorrectedValue(insulationTest.postTest.bg, temperature.tcf),
      cg: calculateCorrectedValue(insulationTest.postTest.cg, temperature.tcf),
    };
    setFormData((prev) => ({
      ...prev,
      insulationTest: {
        ...prev.insulationTest,
        preTestCorrected,
        postTestCorrected,
      },
    }));
  };

  const handleFahrenheitChange = (fahrenheit: number) => {
    setJustSaved(false);
    setJustSaved(false);
    const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius },
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    setJustSaved(false);
    setJustSaved(false);
    const fahrenheit = Math.round((celsius * 9) / 5 + 32);
    setFormData((prev) => ({
      ...prev,
      temperature: { ...prev.temperature, celsius, fahrenheit },
    }));
  };

  const handleWithstandTestChange = (
    index: number,
    field: string,
    value: string,
    phase?: string,
    subfield?: string,
  ) => {
    setFormData((prev) => {
      const readings = [...(prev.withstandTest?.readings || [])];
      if (phase && subfield) {
        readings[index] = {
          ...readings[index],
          [phase]: { ...readings[index][phase], [subfield]: value },
        };
      } else {
        readings[index] = { ...readings[index], [field]: value };
      }
      return { ...prev, withstandTest: { ...prev.withstandTest, readings } };
    });
  };

  const handleSave = async () => {
    const effectiveJobId =
      jobId || location.pathname.split("/jobs/")[1]?.split("/")[0];
    if (!effectiveJobId || !user?.id || !isEditMode) {
      toast.error("Cannot save: Missing job ID, user ID, or not in edit mode.");
      return;
    }
    const wasExistingReport = Boolean(reportId);
    setIsSaving(true);
    try {
      const reportData = {
        data: formData,
        job_id: effectiveJobId,
        user_id: user.id,
      };
      let result;
      if (reportId) {
        result = await supabase
          .schema("neta_ops")
          .from("medium_voltage_vlf_mts_reports")
          .update(reportData)
          .eq("id", reportId)
          .select("id");
      } else {
        result = await supabase
          .schema("neta_ops")
          .from("medium_voltage_vlf_mts_reports")
          .insert(reportData)
          // Only need the id back to create the asset
          .select("id")
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(
              reportSlug,
              formData.identifier || formData.equipmentLocation || "",
            ),
            file_url: `report:/jobs/${effectiveJobId}/medium-voltage-vlf-mts-report/${result.data.id}`,
            user_id: user.id,
          };
          const { data: assetResult, error: assetError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;

          await supabase.schema("neta_ops").from("job_assets").insert({
            job_id: effectiveJobId,
            asset_id: assetResult.id,
            user_id: user.id,
          });
        }
      }
      // If update returned zero rows, attempt a migration/upsert for legacy records
      if (
        reportId &&
        !result.error &&
        Array.isArray(result.data) &&
        result.data.length === 0
      ) {
        try {
          const upsertPayload = {
            id: reportId,
            job_id: effectiveJobId,
            user_id: user.id,
            data: formData,
          } as any;

          const { error: upsertError } = await supabase
            .schema("neta_ops")
            .from("medium_voltage_vlf_mts_reports")
            .upsert(upsertPayload, {
              onConflict: "id",
              ignoreDuplicates: false,
            });

          if (upsertError) throw upsertError;
        } catch (migrateErr) {
          console.error("MTS migration/upsert failed:", migrateErr);
          throw migrateErr as any;
        }
      }

      if (result.error) throw result.error;
      if (!wasExistingReport) {
        setIsEditMode(false);
        const newId = (result as any)?.data?.id;
        if (newId) {
          setReportId(newId);
          navigate(`/jobs/${effectiveJobId}/${reportSlug}/${newId}`, {
            replace: true,
          });
        }
      } else {
        setJustSaved(true);
      }
    } catch (error: any) {
      toast.error(
        `Failed to save report: ${error?.message || "Unknown error"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportId) {
      setIsEditMode(false);
    }
  };

  const loadReport = async () => {
    if (!reportId) {
      setIsEditMode(true); // New report, start in edit mode (this is correct for new reports)
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("medium_voltage_vlf_mts_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

      if (error) throw error;

      if (data && data.data) {
        // Store the current job info (customer name and site address) before overwriting
        const currentCustomerName = formData.customerName;
        const currentSiteAddress = formData.siteAddress;

        setFormData((prev) => ({
          ...prev,
          ...data.data,
          // Always use fresh job info for customer name and site address
          customerName: currentCustomerName || data.data.customerName,
          siteAddress: currentSiteAddress || data.data.siteAddress,
        }));
        // Set status from loaded data
        if (data.data.status) {
          setFormData((prev) => ({
            ...prev,
            status: data.data.status as TestStatus,
          }));
        }
        setIsEditMode(false);
      } else {
        toast.error("Loaded report seems incomplete.");
        // Don't automatically set edit mode for incomplete data - let user click Edit if needed
      }
    } catch (error) {
      toast.error(`Failed to load report: ${(error as Error).message}`);
      // Don't automatically set edit mode on load errors - let user click Edit if needed
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="md" />
      </div>
    );
  if (error)
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center max-w-md p-6">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => navigate(`/jobs/${jobId || ""}?tab=assets`)}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-none"
          >
            Return to Job
          </button>
        </div>
      </div>
    );

  const renderHeader = () => (
    <ReportHeader
      title={reportName}
      isAutoSaving={false}
      isEditing={isEditMode}
      justSaved={justSaved}
      isSaving={isSaving}
      status={formData.status}
      hasReport={!!currentReportId}
      onStatusToggle={() => {
        if (isEditMode) {
          setFormData((prev) => ({
            ...prev,
            status:
              prev.status === TestStatus.PASS
                ? TestStatus.FAIL
                : prev.status === TestStatus.FAIL
                  ? TestStatus.LIMITED_SERVICE
                  : TestStatus.PASS,
          }));
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

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      <style>{`
        @media print {
          /* Make wrapper div not create a box - children flow directly */
          .job-info-print ~ div[class*="p-6"],
          .job-info-print ~ div[class*="flex"] {
            display: contents !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          div[class*="max-w-7xl"] {
            margin: 0 !important;
            padding: 0 !important;
            margin-top: 0 !important;
          }
          div[class*="max-w-7xl"] > section:first-child {
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
        }
      `}</style>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-2 mb-2 relative">
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
          NETA - MTS 7.3.3
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
                  formData.status === TestStatus.PASS
                    ? "2px solid #16a34a"
                    : formData.status === TestStatus.LIMITED_SERVICE
                      ? "2px solid #ca8a04"
                      : "2px solid #dc2626",
                backgroundColor:
                  formData.status === TestStatus.PASS
                    ? "#22c55e"
                    : formData.status === TestStatus.LIMITED_SERVICE
                      ? "#eab308"
                      : "#ef4444",
                color:
                  formData.status === TestStatus.LIMITED_SERVICE
                    ? "#111827"
                    : "white",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
                boxSizing: "border-box",
                minWidth: "50px",
              }}
            >
              {formData.status}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      {/* Print-only Job Information header and table at top */}
      <div className="hidden print:block w-full h-1 bg-brand mb-1"></div>
      <h2 className="hidden print:block text-xl font-semibold mb-1 text-black border-b border-black pb-1">
        Job Information
      </h2>
      <JobInfoPrintTable
        data={{
          customer: formData.customerName,
          address: formData.siteAddress,
          jobNumber: formData.jobNumber,
          technicians: formData.testedBy,
          date: formData.testDate,
          identifier: formData.identifier,
          user: formData.contactPerson,
          substation: formData.location,
          eqptLocation: formData.equipmentLocation,
          temperature: {
            fahrenheit: formData.temperature.fahrenheit,
            celsius: formData.temperature.celsius,
            tcf: formData.temperature.tcf,
            humidity: formData.temperature.humidity,
          },
        }}
      />
      <div className="p-6 print:p-0 print:m-0 flex justify-center bg-neutral-50 dark:bg-dark-150 print:bg-white">
        <div className="max-w-7xl w-full space-y-2 print:space-y-0 print:m-0">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? "hidden" : ""} print:hidden`}>
            {renderHeader()}
          </div>

          {/* Job Information - Hidden in print, we use JobInfoPrintTable above */}
          <section className="mb-6 print:hidden job-info-section">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Job Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
              <div>
                {" "}
                {/* Left Column */}
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Customer
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={maskCustomerName(formData.customerName)}
                      onChange={(e) =>
                        handleChange("customerName", e.target.value)
                      }
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Site Address
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={maskCustomerAddress(formData.siteAddress)}
                      onChange={(e) =>
                        handleChange("siteAddress", e.target.value)
                      }
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    User
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.contactPerson}
                      onChange={(e) =>
                        handleChange("contactPerson", e.target.value)
                      }
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Date
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="date"
                      value={formData.testDate}
                      onChange={(e) => handleChange("testDate", e.target.value)}
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Identifier
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.identifier || ""}
                      onChange={(e) =>
                        handleChange("identifier", e.target.value)
                      }
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                      placeholder="Enter an identifier for this cable"
                    />
                  </div>
                </div>
              </div>
              <div>
                {" "}
                {/* Right Column */}
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Job #
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.jobNumber || ""}
                      onChange={(e) =>
                        handleChange("jobNumber", e.target.value)
                      }
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Technicians
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.testedBy}
                      onChange={(e) => handleChange("testedBy", e.target.value)}
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex items-center">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Temp.
                  </label>
                  <div className="flex-1 flex items-center">
                    <div className="w-16 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="number"
                        value={formData.temperature?.fahrenheit || 68}
                        onChange={(e) =>
                          handleFahrenheitChange(Number(e.target.value))
                        }
                        readOnly={!isEditMode}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="mx-2">°F</span>{" "}
                    <span className="mx-2">
                      {formData.temperature?.celsius || 20}
                    </span>{" "}
                    <span className="mx-2">°C</span>
                    <span className="mx-5">TCF</span>{" "}
                    <div className="w-16 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="text"
                        value={formData.temperature?.tcf.toFixed(3) || "1.000"}
                        readOnly={true}
                        className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                      />
                    </div>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Humidity
                  </label>
                  <div className="flex items-center flex-1">
                    <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                      <input
                        type="number"
                        value={formData.temperature?.humidity || ""}
                        onChange={(e) =>
                          handleChange("temperature", {
                            ...formData.temperature,
                            humidity:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        readOnly={!isEditMode}
                        className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                      />
                    </div>
                    <span className="ml-2">%</span>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Substation
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.location || ""}
                      onChange={(e) => handleChange("location", e.target.value)}
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-neutral-700 dark:text-white">
                    Eqpt. Location
                  </label>
                  <div className="flex-1 border-b border-neutral-300 dark:border-neutral-600">
                    <input
                      type="text"
                      value={formData.equipmentLocation || ""}
                      onChange={(e) =>
                        handleChange("equipmentLocation", e.target.value)
                      }
                      readOnly={!isEditMode}
                      className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? "cursor-default" : ""}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Cable Information (acts as Nameplate for this report) */}
          <section className="mb-6 nameplate-section">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Cable & Termination Data
            </h2>
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 gap-6 print:hidden cable-termination-onscreen">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  {
                    label: "Tested From",
                    field: "testedFrom",
                    section: "cableInfo",
                  },
                  { label: "", field: "", section: "" },
                  {
                    label: "Manufacturer",
                    field: "manufacturer",
                    section: "cableInfo",
                  },
                  {
                    label: "Cable Operating Voltage (kV)",
                    field: "operatingVoltage",
                    section: "cableInfo",
                  },
                  {
                    label: "Cable Rated Voltage (kV)",
                    field: "voltageRating",
                    section: "cableInfo",
                  },
                  { label: "", field: "", section: "" },
                  { label: "Cable Type", field: "cableType", section: null },
                  { label: "Length (ft)", field: "cableLength", section: null },
                  {
                    label: "Conductor Size",
                    field: "size",
                    section: "cableInfo",
                  },
                  {
                    label: "Insulation Type",
                    field: "insulation",
                    section: "cableInfo",
                  },
                  {
                    label: "Conductor Material",
                    field: "conductorMaterial",
                    section: "cableInfo",
                  },
                  {
                    label: "Insulation Thickness",
                    field: "insulationThickness",
                    section: "cableInfo",
                  },
                  { label: "From", field: "from", section: "cableInfo" },
                  { label: "To", field: "to", section: "cableInfo" },
                  {
                    label: "Termination Data",
                    field: "terminationData",
                    section: "terminationData",
                  },
                  {
                    label: "Termination Data",
                    field: "terminationData2",
                    section: "terminationData",
                  },
                  {
                    label: "Rated Voltage (kV)",
                    field: "ratedVoltage",
                    section: "terminationData",
                  },
                  {
                    label: "Rated Voltage (kV)",
                    field: "ratedVoltage2",
                    section: "terminationData",
                  },
                ].map((item, idx) =>
                  item.label ? (
                    <div className="flex items-center" key={idx}>
                      <label className="w-1/2 text-sm font-medium text-neutral-700 dark:text-white">
                        {item.label}
                      </label>
                      <input
                        type="text"
                        value={
                          item.section
                            ? formData[item.section]?.[item.field] || ""
                            : formData[item.field] || ""
                        }
                        onChange={(e) =>
                          item.section
                            ? handleChange(item.section, {
                                ...formData[item.section],
                                [item.field]: e.target.value,
                              })
                            : handleChange(item.field, e.target.value)
                        }
                        readOnly={!isEditMode}
                        className={`w-1/2 rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      />
                    </div>
                  ) : (
                    <div key={idx}></div>
                  ),
                )}
              </div>
            </div>

            {/* Print-only table - 5 columns wide, 3 rows down */}
            <div className="hidden print:block">
              <table className="w-full border border-neutral-300 print:border-black">
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Tested From:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.testedFrom || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.manufacturer || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">
                        Cable Operating Voltage (kV):
                      </div>
                      <div className="mt-1">
                        {formData.cableInfo?.operatingVoltage || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">
                        Cable Rated Voltage (kV):
                      </div>
                      <div className="mt-1">
                        {formData.cableInfo?.voltageRating || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Cable Type:</div>
                      <div className="mt-1">{formData.cableType || ""}</div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Length (ft):</div>
                      <div className="mt-1">{formData.cableLength || ""}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Conductor Size:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.size || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Insulation Type:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.insulation || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Conductor Material:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.conductorMaterial || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Insulation Thickness:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.insulationThickness || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">From:</div>
                      <div className="mt-1">
                        {formData.cableInfo?.from || ""}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">To:</div>
                      <div className="mt-1">{formData.cableInfo?.to || ""}</div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Termination Data:</div>
                      <div className="mt-1">
                        {formData.terminationData?.terminationData || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Termination Data 2:</div>
                      <div className="mt-1">
                        {formData.terminationData?.terminationData2 || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Rated Voltage (kV):</div>
                      <div className="mt-1">
                        {formData.terminationData?.ratedVoltage || ""}
                      </div>
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black text-center">
                      <div className="font-semibold">Rated Voltage 2 (kV):</div>
                      <div className="mt-1">
                        {formData.terminationData?.ratedVoltage2 || ""}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Visual and Mechanical Inspection */}
          <section className="mb-6 visual-mechanical-inspection">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              7.3.3.A Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 vm-standard table-fixed">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "60%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      NETA Section
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {[
                    {
                      id: "7.3.3.A.1",
                      desc: "Compare cable data with drawings and specifications.",
                      field: "inspectCablesAndConnectors",
                    },
                    {
                      id: "7.3.3.A.2",
                      desc: "Inspect exposed sections of cables for physical damage.",
                      field: "inspectTerminationsAndSplices",
                    },
                    {
                      id: "7.3.3.A.3.1",
                      desc: "Use of a low-resistance ohmmeter in accordance with Section 7.3.3.B.1.",
                      field: "useOhmmeter",
                    },
                    {
                      id: "7.3.3.A.4",
                      desc: "Inspect shield grounding, cable supports, and terminations.",
                      field: "inspectShieldGrounding",
                    },
                    {
                      id: "7.3.3.A.5",
                      desc: "Verify that visible cable bends meet or exceed ICEA and manufacturer's minimum published bending radius.",
                      field: "verifyBendRadius",
                    },
                    {
                      id: "7.3.3.A.7",
                      desc: "If cables are terminated through window-type current transformers, inspect to verify that neutral and ground conductors are correctly placed and that shields are correctly terminated for operation of protective devices.",
                      field: "inspectCurrentTransformers",
                    },
                  ].map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white">
                        {row.id}
                      </td>
                      <td className="px-3 py-2 text-sm text-neutral-700 dark:text-white">
                        {row.desc}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <select
                          value={
                            formData.visualInspection[row.field] ||
                            InspectionResult.SELECT
                          }
                          onChange={(e) =>
                            handleChange("visualInspection", {
                              ...formData.visualInspection,
                              [row.field]: e.target.value as InspectionResult,
                            })
                          }
                          disabled={!isEditMode}
                          className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {Object.values(InspectionResult).map((result) => (
                            <option key={result} value={result}>
                              {result}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Shield Continuity */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Shield Continuity
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
                <thead>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      A Phase
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      B Phase
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      C Phase
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {["phaseA", "phaseB", "phaseC"].map((phase) => (
                      <td
                        className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap"
                        key={phase}
                      >
                        <input
                          type="text"
                          value={formData.shieldContinuity[phase]}
                          onChange={(e) =>
                            handleChange("shieldContinuity", {
                              ...formData.shieldContinuity,
                              [phase]: e.target.value,
                            })
                          }
                          readOnly={!isEditMode}
                          className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        />
                      </td>
                    ))}
                    <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap">
                      <select
                        value={formData.shieldContinuity.unit}
                        onChange={(e) =>
                          handleChange("shieldContinuity", {
                            ...formData.shieldContinuity,
                            unit: e.target.value,
                          })
                        }
                        disabled={!isEditMode}
                        className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                      >
                        {continuityUnits.map((unit) => (
                          <option
                            key={unit.symbol}
                            value={unit.symbol}
                            className="dark:bg-dark-150 dark:text-white"
                          >
                            {unit.symbol}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Insulation Resistance Values */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests - Insulation Resistance Values
            </h2>
            <div className="mb-4 flex items-center">
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mr-2">
                Test Voltage:
              </label>
              <select
                value={formData.insulationTest.testVoltage}
                onChange={(e) =>
                  handleChange("insulationTest", {
                    ...formData.insulationTest,
                    testVoltage: e.target.value,
                  })
                }
                disabled={!isEditMode}
                className={`w-32 rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                {insulationTestVoltages.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="ml-2 text-neutral-900 dark:text-white">V</span>
            </div>
            <div className="overflow-x-auto section-insulation-resistance">
              <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700 table-fixed">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-2 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase"></th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={3}
                    >
                      Insulation Resistance
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={3}
                    >
                      Temperature Corrected
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-2 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Units
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-2 py-2"></th>
                    {Array(2)
                      .fill(null)
                      .map((_, i) =>
                        ["A-G", "B-G", "C-G"].map((phase) => (
                          <th
                            key={`${i}-${phase}`}
                            className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                          >
                            {phase}
                          </th>
                        )),
                      )}
                    <th className="border border-neutral-300 dark:border-neutral-700 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Pre-Test", type: "preTest" },
                    { label: "Post-Test", type: "postTest" },
                  ].map((test) => (
                    <tr key={test.type}>
                      <td className="border border-neutral-300 dark:border-neutral-700 px-2 py-2 whitespace-nowrap text-xs text-neutral-900 dark:text-white">
                        {test.label}
                      </td>
                      {["ag", "bg", "cg"].map((phase) => (
                        <td
                          className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap"
                          key={`${test.type}-${phase}-input`}
                        >
                          <input
                            type="text"
                            value={formData.insulationTest[test.type][phase]}
                            onChange={(e) =>
                              handleInsulationTestValueChange(
                                test.type as "preTest" | "postTest",
                                phase,
                                e.target.value,
                              )
                            }
                            readOnly={!isEditMode}
                            className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                          <div className="hidden print:block text-xs text-black">
                            {formData.insulationTest[test.type][phase]}
                          </div>
                        </td>
                      ))}
                      {["ag", "bg", "cg"].map((phase) => (
                        <td
                          className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap"
                          key={`${test.type}-${phase}-corrected`}
                        >
                          <input
                            type="text"
                            value={
                              formData.insulationTest[`${test.type}Corrected`][
                                phase
                              ]
                            }
                            readOnly={true}
                            className="w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm dark:bg-dark-150 dark:text-white bg-neutral-100 dark:bg-dark-150 print:hidden"
                          />
                          <div className="hidden print:block text-xs text-black">
                            {
                              formData.insulationTest[`${test.type}Corrected`][
                                phase
                              ]
                            }
                          </div>
                        </td>
                      ))}
                      <td className="border border-neutral-300 dark:border-neutral-700 px-2 py-2 whitespace-nowrap text-xs text-neutral-900 dark:text-white">
                        {formData.insulationTest.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex justify-end items-center">
              <label className="block text-sm font-medium text-neutral-700 dark:text-white mr-2">
                Units:
              </label>
              <select
                value={formData.insulationTest.unit}
                onChange={(e) =>
                  handleChange("insulationTest", {
                    ...formData.insulationTest,
                    unit: e.target.value,
                  })
                }
                disabled={!isEditMode}
                className={`w-32 rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              >
                {insulationUnits.map((unit) => (
                  <option
                    key={unit.symbol}
                    value={unit.symbol}
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    {unit.symbol}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Electrical Tests Withstand Test */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Electrical Tests Withstand Test
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-neutral-300 dark:border-neutral-700">
                <thead>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      Time(min)
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                      kVAC
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={2}
                    >
                      A Phase
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={2}
                    >
                      B Phase
                    </th>
                    <th
                      className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider"
                      colSpan={2}
                    >
                      C Phase
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2"></th>
                    <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2"></th>
                    {["phaseA", "phaseB", "phaseC"].map((phase) => (
                      <React.Fragment key={phase}>
                        <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                          <select
                            onChange={(e) => {
                              const newReadings = [
                                ...formData.withstandTest.readings,
                              ];
                              newReadings.forEach((r) => {
                                r[phase].currentUnit = e.target.value;
                              });
                              handleChange("withstandTest", {
                                readings: newReadings,
                              });
                            }}
                            value={
                              formData.withstandTest.readings[0]?.[phase]
                                ?.currentUnit || "mA"
                            }
                            disabled={!isEditMode}
                            className={`w-16 rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand text-xs dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          >
                            {currentUnits.map((unit) => (
                              <option
                                key={unit.symbol}
                                value={unit.symbol}
                                className="dark:bg-dark-150 dark:text-white"
                              >
                                {unit.symbol}
                              </option>
                            ))}
                          </select>
                          <div className="hidden print:block text-xs text-black normal-case">
                            {formData.withstandTest.readings[0]?.[phase]
                              ?.currentUnit || "mA"}
                          </div>
                        </th>
                        <th className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider">
                          nF
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formData.withstandTest?.readings.map((reading, index) => (
                    <tr key={index}>
                      <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap">
                        <input
                          type="text"
                          value={reading.timeMinutes}
                          onChange={(e) =>
                            handleWithstandTestChange(
                              index,
                              "timeMinutes",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        />
                        <div className="hidden print:block text-xs text-black">
                          {reading.timeMinutes}
                        </div>
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap">
                        <input
                          type="text"
                          value={reading.kVAC}
                          onChange={(e) =>
                            handleWithstandTestChange(
                              index,
                              "kVAC",
                              e.target.value,
                            )
                          }
                          readOnly={!isEditMode}
                          className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        />
                        <div className="hidden print:block text-xs text-black">
                          {reading.kVAC}
                        </div>
                      </td>
                      {["phaseA", "phaseB", "phaseC"].map((phase) => (
                        <React.Fragment key={`${index}-${phase}`}>
                          <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap">
                            <input
                              type="text"
                              value={reading[phase]?.mA || ""}
                              onChange={(e) =>
                                handleWithstandTestChange(
                                  index,
                                  phase,
                                  e.target.value,
                                  phase,
                                  "mA",
                                )
                              }
                              readOnly={!isEditMode}
                              className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                            <div className="hidden print:block text-xs text-black">
                              {reading[phase]?.mA || ""}
                            </div>
                          </td>
                          <td className="border border-neutral-300 dark:border-neutral-700 px-3 py-2 whitespace-nowrap">
                            <input
                              type="text"
                              value={reading[phase]?.nF || ""}
                              onChange={(e) =>
                                handleWithstandTestChange(
                                  index,
                                  phase,
                                  e.target.value,
                                  phase,
                                  "nF",
                                )
                              }
                              readOnly={!isEditMode}
                              className={`w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white print:hidden ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            />
                            <div className="hidden print:block text-xs text-black">
                              {reading[phase]?.nF || ""}
                            </div>
                          </td>
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Equipment Used */}
          <section className="mb-6">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold">
              Test Equipment Used
            </h2>
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden test-eqpt-onscreen">
              {/* Ohmmeter Row */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Ohmmeter
                </label>
                <EquipmentAutocomplete
                  value={formData.equipment?.ohmmeter || ""}
                  onChange={(value) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      ohmmeter: value,
                    })
                  }
                  onSelect={(equipment) => {
                    handleChange("equipment", {
                      ...formData.equipment,
                      ohmmeter: equipment.equipment_name,
                      ohmSerialNumber: equipment.serial_number || "",
                      ohmAmpId: equipment.amp_id || "",
                      ohmCalDate: formatLocalDateShort(
                        equipment.calibration_date,
                      ),
                    });
                  }}
                  readOnly={!isEditMode}
                  className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.equipment?.ohmSerialNumber || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      ohmSerialNumber: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  AMP ID
                </label>
                <input
                  type="text"
                  value={formData.equipment?.ohmAmpId || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      ohmAmpId: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Cal Date
                </label>
                <input
                  type="text"
                  value={formData.equipment?.ohmCalDate || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      ohmCalDate: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>

              {/* Megohmmeter Row */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Megohmmeter
                </label>
                <EquipmentAutocomplete
                  value={formData.equipment?.megohmmeter || ""}
                  onChange={(value) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      megohmmeter: value,
                    })
                  }
                  onSelect={(equipment) => {
                    handleChange("equipment", {
                      ...formData.equipment,
                      megohmmeter: equipment.equipment_name,
                      megohmSerialNumber: equipment.serial_number || "",
                      megohmAmpId: equipment.amp_id || "",
                      megohmCalDate: formatLocalDateShort(
                        equipment.calibration_date,
                      ),
                    });
                  }}
                  readOnly={!isEditMode}
                  className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.equipment?.megohmSerialNumber || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      megohmSerialNumber: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  AMP ID
                </label>
                <input
                  type="text"
                  value={formData.equipment?.megohmAmpId || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      megohmAmpId: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Cal Date
                </label>
                <input
                  type="text"
                  value={formData.equipment?.megohmCalDate || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      megohmCalDate: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>

              {/* VLF Hipot Row */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  VLF Hipot
                </label>
                <EquipmentAutocomplete
                  value={formData.equipment?.vlfHipot || ""}
                  onChange={(value) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      vlfHipot: value,
                    })
                  }
                  onSelect={(equipment) => {
                    handleChange("equipment", {
                      ...formData.equipment,
                      vlfHipot: equipment.equipment_name,
                      vlfSerialNumber: equipment.serial_number || "",
                      vlfAmpId: equipment.amp_id || "",
                      vlfCalDate: formatLocalDateShort(
                        equipment.calibration_date,
                      ),
                    });
                  }}
                  readOnly={!isEditMode}
                  className="mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.equipment?.vlfSerialNumber || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      vlfSerialNumber: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  AMP ID
                </label>
                <input
                  type="text"
                  value={formData.equipment?.vlfAmpId || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      vlfAmpId: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Cal Date
                </label>
                <input
                  type="text"
                  value={formData.equipment?.vlfCalDate || ""}
                  onChange={(e) =>
                    handleChange("equipment", {
                      ...formData.equipment,
                      vlfCalDate: e.target.value,
                    })
                  }
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>

            {/* Print-only table */}
            <div className="hidden print:block">
              <table className="w-full border border-neutral-300 print:border-black">
                <thead>
                  <tr>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 text-left">
                      Equipment
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 text-left">
                      Make/Model
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 text-left">
                      Serial Number
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 text-left">
                      AMP ID
                    </th>
                    <th className="p-2 border border-neutral-300 print:border-black bg-neutral-50 print:bg-neutral-100 text-left">
                      Cal Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black font-semibold">
                      Ohmmeter
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.ohmmeter || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.ohmSerialNumber || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.ohmAmpId || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.ohmCalDate || ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black font-semibold">
                      Megohmmeter
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.megohmmeter || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.megohmSerialNumber || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.megohmAmpId || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.megohmCalDate || ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-neutral-300 print:border-black font-semibold">
                      VLF Hipot
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.vlfHipot || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.vlfSerialNumber || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.vlfAmpId || ""}
                    </td>
                    <td className="p-2 border border-neutral-300 print:border-black">
                      {formData.equipment?.vlfCalDate || ""}
                    </td>
                  </tr>
                </tbody>
              </table>

              {formData.comments?.trim() && (
                <div className="comments-section-print print:break-before-page mt-6 print:mt-8">
                  <div className="w-full h-1 bg-brand mb-3 print:mb-4"></div>
                  <h2 className="text-xl font-semibold mb-2 print:mb-3 text-black border-b border-black pb-1 font-bold comments-print-heading">
                    Comments
                  </h2>
                  <table
                    className="w-full border border-neutral-300 print:border-black print-comment-table"
                    style={{ tableLayout: "fixed", width: "100%" }}
                  >
                    <tbody>
                      <tr className="allow-row-break">
                        <td
                          className="p-2 border border-neutral-300 print:border-black min-h-0 align-top break-words whitespace-pre-wrap"
                          style={{
                            wordWrap: "break-word",
                            overflowWrap: "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          <div className="text-sm whitespace-pre-wrap break-words">
                            {formData.comments}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Comments (on-screen only) */}
          <section className="mb-6 comments-section print:hidden">
            <div className="w-full h-1 bg-brand mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
              Comments
            </h2>
            <div className="comments-onscreen">
              <textarea
                value={formData.comments || ""}
                onChange={(e) => handleChange("comments", e.target.value)}
                readOnly={!isEditMode}
                rows={4}
                className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-brand focus:ring-brand dark:bg-dark-150 dark:text-white break-words whitespace-pre-wrap ${!isEditMode ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
              />
            </div>
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

export default MediumVoltageVLFMTSReport;

// Add print styles
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    /* Hide number input arrows globally (screen + print) */
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
    }
    input[type="number"] {
      -moz-appearance: textfield !important;
    }

            @media print {
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
          @page { margin: 0.25in; }

          /* Hide in-report navigation elements only (scoped to report container) */
          #report-container nav,
          #report-container .navigation,
          #report-container [class*="nav"],
          #report-container .print\\:hidden {
            display: none !important;
          }

          /* Ensure Visual & Mechanical Inspection table has proper spacing */
          .vm-standard td {
            padding: 8px 12px !important;
            word-wrap: break-word !important;
            white-space: normal !important;
          }

          /* Ensure the Result column has enough space for "Not Applicable" */
          .vm-standard td:last-child {
            min-width: 120px !important;
            padding-right: 16px !important;
          }

          /* Additional spacing for Visual & Mechanical Inspection table */
          .visual-mechanical-inspection table td {
            padding: 8px 12px !important;
            word-wrap: break-word !important;
            white-space: normal !important;
          }

          /* Ensure the Result column has enough space for "Not Applicable" */
          .visual-mechanical-inspection table td:last-child {
            min-width: 120px !important;
            padding-right: 16px !important;
            word-wrap: break-word !important;
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

      /* Text inputs/selects/textarea styling (exclude checkboxes and radios) */
      input:not([type="checkbox"]):not([type="radio"]), select, textarea {
        background-color: white !important;
        border: 1px solid black !important;
        color: black !important;
        padding: 2px !important;
        font-size: 10px !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
      }

      /* Ensure checkboxes and radio buttons print with their native checked marks */
      input[type="checkbox"], input[type="radio"] {
        -webkit-appearance: auto !important;
        -moz-appearance: auto !important;
        appearance: auto !important;
        width: 12px !important;
        height: 12px !important;
        accent-color: #000 !important; /* ensure visible check mark in print */
        border: 1px solid black !important;
        background: white !important;
        vertical-align: middle !important;
        margin-right: 4px !important;
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
        appearance: textfield !important;
      }

      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }

      /* Section styling - ULTRA COMPACT for first page */
      section {
        break-inside: auto !important;
        page-break-inside: auto !important;
        margin-bottom: 0 !important;
        margin-top: 0 !important;
        padding-bottom: 0 !important;
        padding-top: 0 !important;
      }
      section[class*="print:mb-2"] {
        margin-bottom: 0 !important;
      }

      /* Reduce divider and heading spacing in print - MINIMAL */
      div[class*="h-1"][class*="bg-[${BRAND_COLOR}"]],
      div[class*="h-1"][class*="bg-[${BRAND_COLOR}"][class*="mb-4"],
      div[class*="h-1"][class*="bg-[${BRAND_COLOR}"]][class*="print:mb-1"] {
        margin-bottom: 1px !important;
        margin-top: 1px !important;
        height: 1px !important;
      }
      h2 {
        margin-bottom: 1px !important;
        margin-top: 1px !important;
        font-size: 9px !important;
        line-height: 1.1 !important;
        padding-bottom: 1px !important;
        padding-top: 0 !important;
      }

      /* Reduce table spacing - MINIMAL */
      table {
        margin-top: 1px !important;
        margin-bottom: 1px !important;
      }
      th, td {
        padding: 1px 2px !important;
        font-size: 7px !important;
        line-height: 1 !important;
      }

      /* Remove ALL spacing between wrapper children */
      div[class*="max-w-7xl"][class*="space-y-2"][class*="print:space-y-0"] > * {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      div[class*="max-w-7xl"][class*="space-y-2"][class*="print:space-y-0"] > * + * {
        margin-top: 2px !important;
      }

      /* Ensure all text is black for maximum readability */
      * { color: black !important; }

      /* PASS/FAIL badge — keep red/green after global color override */
      .pass-fail-status-box {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color: white !important;
      }
      .pass-fail-status-box.pass {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
      }
      .pass-fail-status-box.fail {
        background-color: #ef4444 !important;
        border: 2px solid #dc2626 !important;
        color: white !important;
      }
      .pass-fail-status-box.limited {
        background-color: #eab308 !important;
        border: 2px solid #ca8a04 !important;
        color: #111827 !important;
      }

      /* Force printed layout to match on-screen for Job Information */
      .job-info-section .grid { display: grid !important; }
      .job-info-section .grid.grid-cols-1.md\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; gap: 4px !important; }
      /* Inline, compact rows (label left, input underlined) */
      .job-info-section .mb-4.flex { display: flex !important; align-items: center !important; margin-bottom: 8px !important; }
      .job-info-section label { width: 96px !important; font-size: 10px !important; margin-right: 6px !important; }
      .job-info-section .flex-1 { border-bottom: 1px solid black !important; }
      .job-info-section input { background: white !important; border: none !important; width: 100% !important; padding: 0 !important; height: 14px !important; font-size: 11px !important; }
      .job-info-section input[type="date"] { height: 16px !important; }

      /* Hide on-screen elements in print */
      .cable-termination-onscreen, .cable-termination-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .comments-onscreen, .comments-onscreen * { display: none !important; }
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }

      /* Comments — new page, space above heading, wrap long text */
      .comments-section-print {
        page-break-before: always !important;
        break-before: page !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        margin-top: 24px !important;
        margin-bottom: 0 !important;
        padding-top: 8px !important;
      }
      .comments-section-print .comments-print-heading,
      .comments-section-print h2 {
        margin-top: 12px !important;
        margin-bottom: 8px !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .comments-section-print > div[class*="bg-brand"] {
        margin-bottom: 12px !important;
      }
      .comments-section-print tr,
      .comments-section-print tr.allow-row-break {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .comments-section-print table,
      .comments-section-print table.print-comment-table,
      .comments-section table,
      .comments-section table.print-comment-table {
        table-layout: fixed !important;
        width: 100% !important;
        max-width: 100% !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      #report-container .comments-section-print table.print-comment-table td,
      #report-container .comments-section table.print-comment-table td,
      .comments-section-print table td,
      .comments-section-print table td div,
      .comments-section table td,
      .comments-section table td div {
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
        white-space: pre-wrap !important;
        vertical-align: top !important;
        padding: 4px !important;
        font-size: 9px !important;
        line-height: 1.3 !important;
        max-width: 100% !important;
        min-height: 0 !important;
        height: auto !important;
        overflow: visible !important;
      }
      div[class*="p-6"],
      div[class*="max-w-7xl"],
      section {
        min-height: 0 !important;
        height: auto !important;
      }
      .job-info-section .w-16 { width: 50px !important; }
      .job-info-section span { margin: 0 6px !important; }

      /* Nameplate/Cable & Termination Data alignment: label left, input right, 2-col rows */
      .nameplate-section .grid { display: grid !important; }
      .nameplate-section .grid.grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
      .nameplate-section .flex.items-center { display: flex !important; align-items: center !important; }
      .nameplate-section label { width: 50% !important; font-size: 10px !important; }
      .nameplate-section input, .nameplate-section select { width: 50% !important; background: white !important; border: 1px solid black !important; font-size: 11px !important; height: 16px !important; }
      .nameplate-section .dark\\:bg-dark-100 { background: white !important; }
      .nameplate-section .grid-cols-2 .gap-x-6 { column-gap: 16px !important; }
    }
  `;
  document.head.appendChild(style);
}
