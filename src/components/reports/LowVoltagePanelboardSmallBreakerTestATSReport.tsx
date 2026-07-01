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
import { toast } from "react-toastify";
import { getReportName, getAssetName } from "./reportMappings";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const REPORT_TABLE = "low_voltage_panelboard_small_breaker_reports";
const LEGACY_NORMALIZED_TABLE = "low_voltage_cable_test_3sets";

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

const visualInspectionResultOptions = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "Adjusted",
  "Repaired",
  "Replaced",
  "See Comments",
  "N/A",
];
const poleOptions = ["", "1", "2", "3"];
const electricalTestOrderingOptions = ["Sequential", "Other"];

interface BreakerTestData {
  result?: "PASS" | "FAIL" | "";
  circuitNumber: string;
  poles: string;
  manuf: string;
  type: string;
  frameA: string;
  tripA: string;
  ratedCurrentA: string;
  testCurrentA: string;
  tripToleranceMin: string;
  tripToleranceMax: string;
  tripTime: string;
  insulationLL: string;
  insulationLP: string;
  insulationPP: string;
}

interface CustomerData {
  name: string;
  company_name: string;
  address: string;
}

interface JobData {
  title: string;
  job_number: string;
  customer_id: string;
}

interface JobWithCustomer extends JobData {
  customers: CustomerData;
}

// Add interface for the join query result
interface JobQueryResult {
  job_number: string;
  customer_id: string;
  title: string;
  customers: {
    name: string;
    company_name: string;
    address: string;
  }[];
}

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
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
  };
  humidity: number;

  // Nameplate Data
  panelboardManufacturer: string;
  panelboardTypeCat: string;
  panelboardSizeA: string;
  panelboardVoltageV: string;
  panelboardSCCRkA: string;
  mainBreakerManufacturer: string;
  mainBreakerType: string;
  mainBreakerFrameSizeA: string;
  mainBreakerRatingPlugA: string;
  mainBreakerICRatingkA: string;

  // Visual and Mechanical Inspection
  visualInspectionItems: {
    netaSection: string;
    description: string;
    results: string;
    comments?: string;
  }[];

  // Test Equipment Used
  megohmmeterName: string;
  megohmmeterSerial: string;
  megohmmeterAmpId: string;
  megohmmeterCalDate: string;
  lowResistanceOhmmeterName: string;
  lowResistanceOhmmeterSerial: string;
  lowResistanceOhmmeterAmpId: string;
  lowResistanceOhmmeterCalDate: string;
  primaryInjectionTestSetName: string;
  primaryInjectionTestSetSerial: string;
  primaryInjectionTestSetAmpId: string;
  primaryInjectionTestSetCalDate: string;

  // Comments
  comments: string;

  // Electrical Tests
  numberOfCircuitSpaces: string;
  electricalTestOrdering: string;
  tripCurveNumbers: string;
  breakers: BreakerTestData[];
}

// Add temperature type
type TemperatureField = "fahrenheit" | "celsius" | "tcf";

const initialBreakerData = (circuitNum: number): BreakerTestData => ({
  circuitNumber: circuitNum.toString(),
  result: "",
  poles: "1",
  manuf: "",
  type: "",
  frameA: "",
  tripA: "",
  ratedCurrentA: "",
  testCurrentA: "",
  tripToleranceMin: "",
  tripToleranceMax: "",
  tripTime: "",
  insulationLL: "",
  insulationLP: "",
  insulationPP: "",
});

const LowVoltagePanelboardSmallBreakerTestATSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{
    id: string;
    reportId?: string;
  }>();
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
  const reportSlug = "low-voltage-panelboard-small-breaker-report";
  const reportName = getReportName(reportSlug);

  // State management
  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(true);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tcf, setTcf] = useState(1);
  const [saving, setSaving] = useState(false);
  const [reportStorageTable, setReportStorageTable] = useState<
    typeof REPORT_TABLE | typeof LEGACY_NORMALIZED_TABLE
  >(REPORT_TABLE);
  const [status, setStatus] = useState<"PASS" | "FAIL" | "LIMITED SERVICE">(
    "PASS",
  );

  const [formData, setFormData] = useState<FormData>(() => {
    const initialSpaces = 120;
    return {
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
      },
      humidity: 0,
      substation: "",
      eqptLocation: "",
      panelboardManufacturer: "",
      panelboardTypeCat: "",
      panelboardSizeA: "",
      panelboardVoltageV: "",
      panelboardSCCRkA: "",
      mainBreakerManufacturer: "",
      mainBreakerType: "",
      mainBreakerFrameSizeA: "",
      mainBreakerRatingPlugA: "",
      mainBreakerICRatingkA: "",
      visualInspectionItems: [
        {
          netaSection: "7.6.1.2.A.1",
          description:
            "Compare equipment nameplate data with drawings and specifications.",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.2",
          description: "Inspect physical and mechanical condition.",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.3",
          description: "Inspect anchorage and alignment [and grounding].",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.4",
          description:
            "Verify that all maintenance devices are available for servicing and operating the breaker.",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.5",
          description: "Verify the unit is clean.",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.6",
          description:
            "Verify the arc chutes are intact. [For insulated-case/molded-case breakers, only perform if unsealed]",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.7",
          description:
            "Inspect moving and stationary contacts for condition and alignment [For insulated-case/molded-case breakers, only perform if unsealed]",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.10.1",
          description:
            "Use of a low-resistance ohmmeter in accordance with Section 7.6.1.2.B.1.",
          results: "",
        },
        {
          netaSection: "7.6.1.2.A.14",
          description:
            "Perform adjustments for final protective device settings in accordance with coordination study provided by end user.",
          results: "",
        },
      ],
      megohmmeterName: "",
      megohmmeterSerial: "",
      megohmmeterAmpId: "",
      megohmmeterCalDate: "",
      lowResistanceOhmmeterName: "",
      lowResistanceOhmmeterSerial: "",
      lowResistanceOhmmeterAmpId: "",
      lowResistanceOhmmeterCalDate: "",
      primaryInjectionTestSetName: "",
      primaryInjectionTestSetSerial: "",
      primaryInjectionTestSetAmpId: "",
      primaryInjectionTestSetCalDate: "",
      comments:
        "Some items specific to switchgear draw-out breakers were removed from the above list.",
      numberOfCircuitSpaces: initialSpaces.toString(),
      electricalTestOrdering: "Sequential",
      tripCurveNumbers: "",
      breakers: Array(initialSpaces)
        .fill(null)
        .map((_, i) => initialBreakerData(i + 1)),
    };
  });

  // Update TCF when temperature changes
  useEffect(() => {
    setTcf(calculateTCF(formData.temperature.fahrenheit));
  }, [formData.temperature]);

  // Load job info
  useEffect(() => {
    const loadJobInfo = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error: jobError } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("job_number, customer_id, title, site_address")
          .eq("id", jobId)
          .single();

        if (jobError) throw jobError;
        const jobData = data as JobData;

        if (jobData?.customer_id) {
          const { data: customerResult, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select("name, company_name, address")
            .eq("id", jobData.customer_id)
            .single();

          if (!customerError && customerResult) {
            const customerData = customerResult as CustomerData;
            setFormData((currentData) => ({
              ...currentData,
              customer: maskCustomerName(
                customerData.company_name || customerData.name || "",
              ),
              address: maskCustomerAddress(customerData.address || ""),
              jobNumber: jobData.job_number || "",
            }));
          }
        }
      } catch (error) {
        console.error("Error loading job info:", error);
        setError(`Failed to load job info: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadJobInfo();
  }, [jobId]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      if (jobId) {
        try {
          const { data, error: jobError } = await supabase
            .schema("neta_ops")
            .from("jobs")
            .select(
              "job_number, customer_id, title, site_address, customers!inner(name, company_name, address)",
            )
            .eq("id", jobId)
            .single();

          if (jobError) throw jobError;

          if (data) {
            const typedJobData = data as unknown as JobQueryResult;
            const customerData = typedJobData.customers[0];
            setFormData((prev) => ({
              ...prev,
              jobNumber: typedJobData.job_number || "",
              customer: maskCustomerName(
                customerData?.company_name || customerData?.name || "",
              ),
              address: maskCustomerAddress(customerData?.address || ""),
            }));
          }
        } catch (error) {
          console.error("Error loading job info:", error);
        }
      }

      if (reportId) {
        try {
          const { data: storedReportData, error: storedReportError } =
            await supabase
              .schema("neta_ops")
              .from(REPORT_TABLE)
              .select("*")
              .eq("id", reportId)
              .maybeSingle();

          if (storedReportError) throw storedReportError;

          if (storedReportData) {
            setReportStorageTable(REPORT_TABLE);
            const loadedReportInfo =
              (storedReportData as any).report_info || {};
            const loadedElectricalTests =
              (storedReportData as any).electrical_tests || {};
            setFormData((prev) => ({
              ...prev,
              ...loadedReportInfo,
              temperature: loadedReportInfo.temperature || prev.temperature,
              visualInspectionItems:
                (storedReportData as any).visual_mechanical_inspection ||
                prev.visualInspectionItems,
              breakers:
                loadedElectricalTests.breakers ||
                Array(
                  parseInt(
                    loadedElectricalTests.numberOfCircuitSpaces ||
                      prev.numberOfCircuitSpaces,
                    10,
                  ) || 120,
                )
                  .fill(null)
                  .map((_, i) => initialBreakerData(i + 1)),
              numberOfCircuitSpaces:
                loadedElectricalTests.numberOfCircuitSpaces ||
                prev.numberOfCircuitSpaces,
              electricalTestOrdering:
                loadedElectricalTests.electricalTestOrdering ||
                prev.electricalTestOrdering,
              tripCurveNumbers:
                loadedElectricalTests.tripCurveNumbers || prev.tripCurveNumbers,
              comments:
                (storedReportData as any).comments_text || prev.comments,
            }));
            if ((storedReportData as any).status) {
              setStatus((storedReportData as any).status);
            }
            setIsEditing(false);
            setLoading(false);
            return;
          }

          // Try normalized store first
          const { data: generic, error: gErr } = await supabase
            .schema("neta_ops")
            .from(LEGACY_NORMALIZED_TABLE)
            .select("*")
            .eq("id", reportId)
            .maybeSingle();

          if (gErr) throw gErr;

          if (generic && (generic as any).data) {
            setReportStorageTable(LEGACY_NORMALIZED_TABLE);
            const d: any = (generic as any).data;
            // Map normalized data to form state
            setFormData((prev) => ({
              ...prev,
              customer: maskCustomerName(
                d.reportInfo?.customer ?? prev.customer,
              ),
              address: maskCustomerAddress(
                d.reportInfo?.address ?? prev.address,
              ),
              user: d.reportInfo?.userName ?? prev.user,
              date: d.reportInfo?.date ?? prev.date,
              jobNumber: d.reportInfo?.jobNumber ?? prev.jobNumber,
              technicians: d.reportInfo?.technicians ?? prev.technicians,
              identifier: d.reportInfo?.identifier ?? prev.identifier,
              substation: d.reportInfo?.substation ?? prev.substation,
              eqptLocation: d.reportInfo?.eqptLocation ?? prev.eqptLocation,
              temperature: {
                ...prev.temperature,
                fahrenheit:
                  d.reportInfo?.temperature?.fahrenheit ??
                  prev.temperature.fahrenheit,
                celsius:
                  d.reportInfo?.temperature?.celsius ??
                  prev.temperature.celsius,
                tcf:
                  d.reportInfo?.temperature?.correctionFactor ??
                  prev.temperature.tcf,
              },
              humidity: Number(d.reportInfo?.humidity ?? prev.humidity ?? 0),

              panelboardManufacturer:
                d.nameplateData?.panelboardManufacturer ??
                prev.panelboardManufacturer,
              panelboardTypeCat:
                d.nameplateData?.panelboardTypeCatalog ??
                prev.panelboardTypeCat,
              panelboardSizeA:
                d.nameplateData?.panelboardSizeA ?? prev.panelboardSizeA,
              panelboardVoltageV:
                d.nameplateData?.panelboardVoltageV ?? prev.panelboardVoltageV,
              panelboardSCCRkA:
                d.nameplateData?.panelboardSCCRkA ?? prev.panelboardSCCRkA,
              mainBreakerManufacturer:
                d.nameplateData?.mainBreakerManufacturer ??
                prev.mainBreakerManufacturer,
              mainBreakerType:
                d.nameplateData?.mainBreakerType ?? prev.mainBreakerType,
              mainBreakerFrameSizeA:
                d.nameplateData?.mainBreakerFrameSizeA ??
                prev.mainBreakerFrameSizeA,
              mainBreakerRatingPlugA:
                d.nameplateData?.mainBreakerRatingPlugA ??
                prev.mainBreakerRatingPlugA,
              mainBreakerICRatingkA:
                d.nameplateData?.mainBreakerICRatingkA ??
                prev.mainBreakerICRatingkA,

              visualInspectionItems: prev.visualInspectionItems.map((item) => ({
                ...item,
                results: d.visualInspection?.[item.netaSection] ?? item.results,
              })),

              numberOfCircuitSpaces: (
                d.electricalTests?.numberOfCircuitSpaces ??
                prev.numberOfCircuitSpaces ??
                "120"
              ).toString(),
              electricalTestOrdering:
                d.electricalTests?.ordering ?? prev.electricalTestOrdering,
              tripCurveNumbers:
                d.electricalTests?.tripCurveNumbers ?? prev.tripCurveNumbers,
              breakers:
                Array.isArray(d.electricalTests?.breakers) &&
                d.electricalTests.breakers.length > 0
                  ? d.electricalTests.breakers.map((b: any, i: number) => ({
                      ...initialBreakerData(i + 1),
                      circuitNumber: b.circuitNumber ?? (i + 1).toString(),
                      result: b.result ?? "",
                      poles: b.poles ?? "",
                      manuf: b.manuf ?? "",
                      type: b.type ?? "",
                      frameA: b.frameA ?? "",
                      tripA: b.tripA ?? "",
                      ratedCurrentA: b.ratedCurrentA ?? "",
                      testCurrentA: b.testCurrentA ?? "",
                      tripToleranceMin: b.tripToleranceMin ?? "",
                      tripToleranceMax: b.tripToleranceMax ?? "",
                      tripTime: b.tripTime ?? "",
                      insulationLL: b.insulationLL ?? "",
                      insulationLP: b.insulationLP ?? "",
                      insulationPP: b.insulationPP ?? "",
                    }))
                  : prev.breakers,

              megohmmeterName:
                d.testEquipment?.megohmmeter?.name ?? prev.megohmmeterName,
              megohmmeterSerial:
                d.testEquipment?.megohmmeter?.serialNumber ??
                prev.megohmmeterSerial,
              megohmmeterAmpId:
                d.testEquipment?.megohmmeter?.ampId ?? prev.megohmmeterAmpId,
              lowResistanceOhmmeterName:
                d.testEquipment?.lowResistanceOhmmeter?.name ??
                prev.lowResistanceOhmmeterName,
              lowResistanceOhmmeterSerial:
                d.testEquipment?.lowResistanceOhmmeter?.serialNumber ??
                prev.lowResistanceOhmmeterSerial,
              lowResistanceOhmmeterAmpId:
                d.testEquipment?.lowResistanceOhmmeter?.ampId ??
                prev.lowResistanceOhmmeterAmpId,
              primaryInjectionTestSetName:
                d.testEquipment?.primaryInjectionTestSet?.name ??
                prev.primaryInjectionTestSetName,
              primaryInjectionTestSetSerial:
                d.testEquipment?.primaryInjectionTestSet?.serialNumber ??
                prev.primaryInjectionTestSetSerial,
              primaryInjectionTestSetAmpId:
                d.testEquipment?.primaryInjectionTestSet?.ampId ??
                prev.primaryInjectionTestSetAmpId,

              comments: d.reportInfo?.comments ?? prev.comments,
            }));
            if (d.status) setStatus(d.status);
            setIsEditing(false);
            setLoading(false);
            return;
          }

          // Fallback to older dedicated table (legacy)
          const { data: reportData, error: reportError } = await supabase
            .schema("neta_ops")
            .from(REPORT_TABLE)
            .select("*")
            .eq("id", reportId)
            .maybeSingle();

          if (reportError) throw reportError;

          if (reportData) {
            setReportStorageTable(REPORT_TABLE);
            const loadedReportInfo = (reportData as any).report_info || {};
            const loadedElectricalTests =
              (reportData as any).electrical_tests || {};
            setFormData((prev) => ({
              ...prev,
              ...loadedReportInfo,
              temperature: loadedReportInfo.temperature || prev.temperature,
              visualInspectionItems:
                (reportData as any).visual_mechanical_inspection ||
                prev.visualInspectionItems,
              breakers:
                loadedElectricalTests.breakers ||
                Array(
                  parseInt(
                    loadedElectricalTests.numberOfCircuitSpaces ||
                      prev.numberOfCircuitSpaces,
                    10,
                  ) || 120,
                )
                  .fill(null)
                  .map((_, i) => initialBreakerData(i + 1)),
              numberOfCircuitSpaces:
                loadedElectricalTests.numberOfCircuitSpaces ||
                prev.numberOfCircuitSpaces,
              electricalTestOrdering:
                loadedElectricalTests.electricalTestOrdering ||
                prev.electricalTestOrdering,
              tripCurveNumbers:
                loadedElectricalTests.tripCurveNumbers || prev.tripCurveNumbers,
              comments: (reportData as any).comments_text || prev.comments,
            }));
            setIsEditing(false);
          }
        } catch (error) {
          console.error("Error loading report data:", error);
        }
      } else {
        setIsEditing(true);
      }
      setLoading(false);
    };
    loadInitialData();
  }, [jobId, reportId, user]);

  useEffect(() => {
    const numSpaces = parseInt(formData.numberOfCircuitSpaces, 10);
    if (!isNaN(numSpaces) && numSpaces >= 0 && numSpaces <= 120) {
      // Allow 0 for empty
      setFormData((prev) => {
        const currentBreakers = prev.breakers;
        if (currentBreakers.length < numSpaces) {
          const newBreakersToAdd = Array(numSpaces - currentBreakers.length)
            .fill(null)
            .map((_, i) => initialBreakerData(currentBreakers.length + i + 1));
          return {
            ...prev,
            breakers: [...currentBreakers, ...newBreakersToAdd],
          };
        } else if (currentBreakers.length > numSpaces) {
          return { ...prev, breakers: currentBreakers.slice(0, numSpaces) };
        }
        return prev;
      });
    } else if (formData.numberOfCircuitSpaces === "") {
      // If input is cleared, default to 0 breakers
      setFormData((prev) => ({ ...prev, breakers: [] }));
    } else if (numSpaces > 120) {
      setFormData((prev) => ({
        ...prev,
        numberOfCircuitSpaces: "120",
        breakers: Array(120)
          .fill(null)
          .map((_, i) => initialBreakerData(i + 1)),
      }));
    }
  }, [formData.numberOfCircuitSpaces]);

  const handleChange = (
    field: string,
    value: any,
    index?: number,
    subField?: string,
  ) => {
    setJustSaved(false);
    if (!isEditing) return;
    setFormData((prev) => {
      const newState = JSON.parse(JSON.stringify(prev)); // Deep copy

      if (field === "breakers" && index !== undefined && subField) {
        if (!newState.breakers[index])
          newState.breakers[index] = initialBreakerData(index + 1);

        // Special handling for rated current to auto-calculate test current
        if (subField === "ratedCurrentA") {
          (newState.breakers[index] as any)[subField] = value;
          // Calculate test current as 3x rated current if rated current is a valid number
          const ratedCurrent = parseFloat(value);
          if (!isNaN(ratedCurrent)) {
            (newState.breakers[index] as any)["testCurrentA"] = (
              ratedCurrent * 3
            ).toString();
          }
        } else {
          (newState.breakers[index] as any)[subField] = value;
        }
      } else if (
        field === "visualInspectionItems" &&
        index !== undefined &&
        subField
      ) {
        if (!newState.visualInspectionItems[index])
          newState.visualInspectionItems[index] = {
            netaSection: "",
            description: "",
            results: "",
          };
        (newState.visualInspectionItems[index] as any)[subField] = value;
      } else if (field === "temperature.fahrenheit") {
        const fahrenheit = Number(value);
        const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
        const tcf = getTCF(celsius);
        newState.temperature = {
          fahrenheit,
          celsius,
          tcf,
        };
      } else if (field === "temperature.celsius") {
        const celsius = Number(value);
        const fahrenheit = Math.round((celsius * 9) / 5 + 32);
        const tcf = getTCF(celsius);
        newState.temperature = {
          fahrenheit,
          celsius,
          tcf,
        };
      } else {
        // For top-level fields or simple nested (e.g. panelboardManufacturer)
        const keys = field.split(".");
        let currentLevel: any = newState;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!currentLevel[keys[i]]) currentLevel[keys[i]] = {};
          currentLevel = currentLevel[keys[i]];
        }
        currentLevel[keys[keys.length - 1]] = value;
      }
      return newState;
    });
  };

  const handleBreakerChange = (index: number, field: string, value: any) => {
    if (!isEditing) return;
    setFormData((prev) => {
      const newState = JSON.parse(JSON.stringify(prev)); // Deep copy
      if (field === "poles") {
        if (!newState.breakers[index])
          newState.breakers[index] = initialBreakerData(index + 1);
        (newState.breakers[index] as any)[field] = value;
      } else {
        (newState.breakers[index] as any)[field] = value;
      }
      return newState;
    });
  };

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    const wasExistingReport = Boolean(reportId);

    // Build normalized payload for JSONB store
    const normalized: any = {
      reportInfo: {
        customer: maskCustomerName(formData.customer),
        address: maskCustomerAddress(formData.address),
        userName: formData.user,
        date: formData.date,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        identifier: formData.identifier,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: {
          fahrenheit: formData.temperature.fahrenheit,
          celsius: formData.temperature.celsius,
          correctionFactor: formData.temperature.tcf,
        },
        humidity: formData.humidity,
        comments: formData.comments,
      },
      nameplateData: {
        panelboardManufacturer: formData.panelboardManufacturer,
        panelboardTypeCatalog: formData.panelboardTypeCat,
        panelboardSizeA: formData.panelboardSizeA,
        panelboardVoltageV: formData.panelboardVoltageV,
        panelboardSCCRkA: formData.panelboardSCCRkA,
        mainBreakerManufacturer: formData.mainBreakerManufacturer,
        mainBreakerType: formData.mainBreakerType,
        mainBreakerFrameSizeA: formData.mainBreakerFrameSizeA,
        mainBreakerRatingPlugA: formData.mainBreakerRatingPlugA,
        mainBreakerICRatingkA: formData.mainBreakerICRatingkA,
      },
      visualInspection: formData.visualInspectionItems.reduce(
        (acc, row) => {
          acc[row.netaSection] = row.results || "";
          return acc;
        },
        {} as Record<string, string>,
      ),
      electricalTests: {
        numberOfCircuitSpaces: formData.numberOfCircuitSpaces,
        ordering: formData.electricalTestOrdering,
        tripCurveNumbers: formData.tripCurveNumbers,
        breakers: formData.breakers,
      },
      testEquipment: {
        megohmmeter: {
          name: formData.megohmmeterName,
          serialNumber: formData.megohmmeterSerial,
          ampId: formData.megohmmeterAmpId,
        },
        lowResistanceOhmmeter: {
          name: formData.lowResistanceOhmmeterName,
          serialNumber: formData.lowResistanceOhmmeterSerial,
          ampId: formData.lowResistanceOhmmeterAmpId,
        },
        primaryInjectionTestSet: {
          name: formData.primaryInjectionTestSetName,
          serialNumber: formData.primaryInjectionTestSetSerial,
          ampId: formData.primaryInjectionTestSetAmpId,
        },
      },
      status,
      reportType: reportSlug,
    };

    const payload = {
      job_id: jobId,
      user_id: user.id,
      report_info: normalized.reportInfo,
      visual_mechanical_inspection: formData.visualInspectionItems,
      electrical_tests: {
        numberOfCircuitSpaces: formData.numberOfCircuitSpaces,
        electricalTestOrdering: formData.electricalTestOrdering,
        tripCurveNumbers: formData.tripCurveNumbers,
        breakers: formData.breakers,
      },
      test_equipment: normalized.testEquipment,
      comments_text: formData.comments,
      status,
    };

    const legacyPayload = {
      job_id: jobId,
      user_id: user.id,
      data: normalized,
    };

    try {
      setSaving(true);
      let result;
      if (reportId) {
        result = await supabase
          .schema("neta_ops")
          .from(reportStorageTable)
          .update(
            reportStorageTable === LEGACY_NORMALIZED_TABLE
              ? legacyPayload
              : payload,
          )
          .eq("id", reportId)
          .select("id")
          .single();
      } else {
        result = await supabase
          .schema("neta_ops")
          .from(REPORT_TABLE)
          .insert(payload)
          .select("id")
          .single();

        if (result.data && (result.data as any).id) {
          const newReportId = (result.data as any).id as string;
          const assetData = {
            name: getAssetName(
              reportSlug,
              formData.identifier || formData.eqptLocation || "",
            ),
            file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
            user_id: user.id,
            template_type: "ATS",
          } as any;

          const { data: assetResult, error: assetError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert(assetData)
            .select("id")
            .single();

          if (assetError) throw assetError;

          if (assetResult && (assetResult as any).id) {
            await supabase
              .schema("neta_ops")
              .from("job_assets")
              .insert({
                job_id: jobId,
                asset_id: (assetResult as any).id,
                user_id: user.id,
              });
          }
        }
      }

      if ((result as any).error) throw (result as any).error;

      setJustSaved(true);

      if (!wasExistingReport && result.data && (result.data as any).id) {
        // First save: update URL with new report ID so future saves are UPDATEs
        const newId = (result.data as any).id as string;
        setCurrentReportId(newId);
        navigate(`/jobs/${jobId}/${reportSlug}/${newId}`, { replace: true });
      }
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error(`Failed to save report: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    if (reportId) {
      setIsEditing(false);
    }
  };

  const renderInputField = (
    label: string,
    fieldKey: string,
    placeholder = "",
    type = "text",
    colSpan = "md:col-span-1",
    isReadOnly?: boolean,
  ) => {
    // Utility to get deeply nested values
    const getValue = (obj: any, path: string) =>
      path.split(".").reduce((acc, part) => acc && acc[part], obj);

    return (
      <div className={`mb-2 ${colSpan}`}>
        <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
          {label}:
        </label>
        <input
          type={type}
          value={getValue(formData, fieldKey) || ""}
          onChange={(e) =>
            handleChange(
              fieldKey,
              type === "number"
                ? parseFloat(e.target.value) || 0
                : e.target.value,
            )
          }
          readOnly={!isEditing || isReadOnly}
          placeholder={placeholder}
          className={`mt-1 block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing || isReadOnly ? "bg-neutral-100 dark:bg-dark-150 cursor-not-allowed" : ""}`}
        />
      </div>
    );
  };

  // Temperature conversion and TCF calculation functions
  const calculateTCF = (fahrenheit: number): number => {
    const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
    return getTCF(celsius);
  };

  if (loading)
    return (
      <div className="p-6 text-center text-neutral-500 dark:text-white">
        <LoadingSpinner size="md" />
      </div>
    );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="hidden print:flex items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6 relative">
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
              className={`pass-fail-status-box ${getPassFailBadgeClass(status)}`}
              style={{
                display: "inline-block",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "bold",
                textAlign: "center",
                width: "fit-content",
                borderRadius: "6px",
                border:
                  status === "PASS"
                    ? "2px solid #16a34a"
                    : status === "FAIL"
                      ? "2px solid #dc2626"
                      : "2px solid #ca8a04",
                backgroundColor:
                  status === "PASS"
                    ? "#22c55e"
                    : status === "FAIL"
                      ? "#ef4444"
                      : "#eab308",
                color: "white",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
                boxSizing: "border-box",
                minWidth: "50px",
              }}
            >
              {status || "PASS"}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      {/* Print-only Job Information Section - directly under header */}
      <div
        className={
          isPrintMode ? "block px-4 mb-2" : "hidden print:block px-4 mb-2"
        }
      >
        <div className="w-full h-1 bg-[#f26722] mb-2"></div>
        <h2 className="text-base font-bold mb-2 text-black pb-2">
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
              ...formData.temperature,
              humidity: formData.humidity,
            },
          }}
        />
      </div>
      {/* Print-only sections - rendered outside wrapper for deliverable viewer compatibility */}
      <div
        className={
          isPrintMode
            ? "block px-4 space-y-4"
            : "hidden print:block px-4 space-y-4"
        }
      >
        {/* Nameplate Data */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-2"></div>
          <h2 className="text-base font-bold mb-2 text-black border-black pb-2">
            Nameplate Data
          </h2>
          <table className="w-full border-collapse border border-black mb-2">
            <thead>
              <tr>
                <th className="p-2 text-left border border-black" colSpan={2}>
                  Panelboard
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Manufacturer
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.panelboardManufacturer || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Type / Cat #
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.panelboardTypeCat || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Size (A)
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.panelboardSizeA || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Voltage (V)
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.panelboardVoltageV || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  SCCR (kA)
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.panelboardSCCRkA || ""}
                </td>
              </tr>
            </tbody>
          </table>
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr>
                <th className="p-2 text-left border border-black" colSpan={2}>
                  Main Breaker
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Manufacturer
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.mainBreakerManufacturer || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Type
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.mainBreakerType || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Frame Size (A)
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.mainBreakerFrameSizeA || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  Rating Plug (A)
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.mainBreakerRatingPlugA || ""}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-black font-semibold text-xs">
                  I.C. Rating (kA)
                </td>
                <td className="p-2 border border-black text-xs">
                  {formData.mainBreakerICRatingkA || ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Visual and Mechanical Inspection */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-2"></div>
          <h2 className="text-base font-bold mb-2 text-black border-black pb-2">
            Visual and Mechanical Inspection
          </h2>
          <table className="w-full border-collapse border border-black text-xs">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-2 text-left border border-black">
                  NETA Section
                </th>
                <th className="p-2 text-left border border-black">
                  Description
                </th>
                <th className="p-2 text-center border border-black">Result</th>
              </tr>
            </thead>
            <tbody>
              {formData.visualInspectionItems.map((item, index) => (
                <tr key={index}>
                  <td className="p-2 border border-black">
                    {item.netaSection}
                  </td>
                  <td className="p-2 border border-black">
                    {item.description}
                  </td>
                  <td className="p-2 border border-black text-center">
                    {item.results || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Test Equipment Used */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-2"></div>
          <h2 className="text-base font-bold mb-2 text-black border-black pb-2">
            Test Equipment Used
          </h2>
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr>
                <th className="p-2 text-left border border-black">
                  Megohmmeter
                </th>
                <th className="p-2 text-left border border-black">
                  Low-Resistance Ohmmeter
                </th>
                <th className="p-2 text-left border border-black">
                  Primary Injection Test Set
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-black">
                  Name: {formData.megohmmeterName}
                  <br />
                  Serial #: {formData.megohmmeterSerial}
                  <br />
                  AMP ID: {formData.megohmmeterAmpId}
                  <br />
                  Cal Date: {formData.megohmmeterCalDate}
                </td>
                <td className="p-2 border border-black">
                  Name: {formData.lowResistanceOhmmeterName}
                  <br />
                  Serial #: {formData.lowResistanceOhmmeterSerial}
                  <br />
                  AMP ID: {formData.lowResistanceOhmmeterAmpId}
                  <br />
                  Cal Date: {formData.lowResistanceOhmmeterCalDate}
                </td>
                <td className="p-2 border border-black">
                  Name: {formData.primaryInjectionTestSetName}
                  <br />
                  Serial #: {formData.primaryInjectionTestSetSerial}
                  <br />
                  AMP ID: {formData.primaryInjectionTestSetAmpId}
                  <br />
                  Cal Date: {formData.primaryInjectionTestSetCalDate}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Electrical Tests */}
        <div style={{ pageBreakInside: "auto" }}>
          <div
            className="w-full h-1 bg-[#f26722] mb-1"
            style={{ pageBreakAfter: "avoid" }}
          ></div>
          <h2
            className="text-base font-bold mb-1 text-black pb-1"
            style={{ pageBreakAfter: "avoid" }}
          >
            Electrical Tests
          </h2>
          <div
            className="flex gap-4 mb-1 text-xs"
            style={{ pageBreakAfter: "avoid" }}
          >
            <span># of circuit spaces: {formData.numberOfCircuitSpaces}</span>
            <span>Ordering: {formData.electricalTestOrdering}</span>
            <span>Trip Curve #'s: {formData.tripCurveNumbers}</span>
          </div>
          <table
            className="w-full border-collapse border border-black text-xs"
            style={{ pageBreakBefore: "avoid" }}
          >
            <thead className="bg-neutral-100">
              <tr>
                <th className="border border-black p-1">Result</th>
                <th className="border border-black p-1">Circuit</th>
                <th className="border border-black p-1">Poles</th>
                <th className="border border-black p-1">Manuf</th>
                <th className="border border-black p-1">Type</th>
                <th className="border border-black p-1">Frame</th>
                <th className="border border-black p-1">Trip</th>
                <th className="border border-black p-1">Rated</th>
                <th className="border border-black p-1">Test</th>
                <th className="border border-black p-1">Min</th>
                <th className="border border-black p-1">Max</th>
                <th className="border border-black p-1">Time</th>
                <th className="border border-black p-1">L-L</th>
                <th className="border border-black p-1">L-P</th>
                <th className="border border-black p-1">P-P</th>
              </tr>
            </thead>
            <tbody>
              {formData.breakers
                .slice(0, parseInt(formData.numberOfCircuitSpaces) || 30)
                .map((breaker, index) => (
                  <tr key={index}>
                    <td className="border border-black p-1 text-center">
                      {breaker.result || "-"}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.circuitNumber}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.poles}
                    </td>
                    <td className="border border-black p-1">{breaker.manuf}</td>
                    <td className="border border-black p-1">{breaker.type}</td>
                    <td className="border border-black p-1 text-center">
                      {breaker.frameA}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.tripA}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.ratedCurrentA}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.testCurrentA}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.tripToleranceMin}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.tripToleranceMax}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.tripTime}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.insulationLL}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.insulationLP}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {breaker.insulationPP}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Screen-only content wrapper - hidden in print mode */}
      <div
        className={
          isPrintMode
            ? "hidden"
            : "p-6 flex justify-center bg-neutral-50 dark:bg-dark-150 print:hidden"
        }
      >
        <div className="max-w-7xl w-full space-y-6">
          <ReportHeader
            title={reportName}
            isAutoSaving={false}
            isEditing={isEditing}
            justSaved={justSaved}
            isSaving={saving}
            status={status}
            hasReport={!!currentReportId}
            onStatusToggle={() => {
              if (isEditing) {
                const nextStatus =
                  status === "PASS"
                    ? "FAIL"
                    : status === "FAIL"
                      ? "LIMITED SERVICE"
                      : "PASS";
                setStatus(nextStatus);
              }
            }}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onEdit={() => setIsEditing(true)}
            onBack={() => navigate(`/jobs/${jobId}`)}
            onPrint={() => window.print()}
            isPrintMode={isPrintMode}
          />

          {/* --- Job Information Section (Screen only) --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
              Job Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 job-info-onscreen">
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
                    value={formData.customer}
                    onChange={(e) => handleChange("customer", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
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
                    onChange={(e) => handleChange("address", e.target.value)}
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <label
                    htmlFor="jobNumber"
                    className="form-label inline-block w-32"
                  >
                    Job Number:
                  </label>
                  <input
                    id="jobNumber"
                    type="text"
                    value={formData.jobNumber}
                    onChange={(e) => handleChange("jobNumber", e.target.value)}
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
                    htmlFor="technicians"
                    className="form-label inline-block w-32"
                  >
                    Technician(s):
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
                    htmlFor="identifier"
                    className="form-label inline-block w-32"
                  >
                    Equipment Identifier:
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
                    Equipment Location:
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
                {/* Temperature Fields */}
                <div className="mb-4 flex items-center space-x-2">
                  <label className="form-label inline-block w-auto">
                    Temp:
                  </label>
                  <input
                    type="number"
                    value={formData.temperature.fahrenheit}
                    onChange={(e) =>
                      handleChange(
                        "temperature.fahrenheit",
                        Number(e.target.value),
                      )
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
                    value={formData.temperature?.tcf?.toFixed(3) ?? ""}
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
                    value={formData.humidity || ""}
                    onChange={(e) =>
                      handleChange(
                        "humidity",
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
          </div>

          {/* --- Nameplate Data Section (Screen only) --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 font-semibold pb-2">
              Nameplate Data
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 nameplate-onscreen">
              {/* Panelboard Column */}
              <div>
                <h3 className="text-lg font-medium mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Panelboard
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <label
                      htmlFor="panelboardManufacturer"
                      className="form-label inline-block w-32"
                    >
                      Manufacturer:
                    </label>
                    <input
                      id="panelboardManufacturer"
                      type="text"
                      value={formData.panelboardManufacturer}
                      onChange={(e) =>
                        handleChange("panelboardManufacturer", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="panelboardTypeCat"
                      className="form-label inline-block w-32"
                    >
                      Type / Cat #:
                    </label>
                    <input
                      id="panelboardTypeCat"
                      type="text"
                      value={formData.panelboardTypeCat}
                      onChange={(e) =>
                        handleChange("panelboardTypeCat", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="panelboardSizeA"
                      className="form-label inline-block w-32"
                    >
                      Size (A):
                    </label>
                    <input
                      id="panelboardSizeA"
                      type="text"
                      value={formData.panelboardSizeA}
                      onChange={(e) =>
                        handleChange("panelboardSizeA", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="panelboardVoltageV"
                      className="form-label inline-block w-32"
                    >
                      Voltage (V):
                    </label>
                    <input
                      id="panelboardVoltageV"
                      type="text"
                      value={formData.panelboardVoltageV}
                      onChange={(e) =>
                        handleChange("panelboardVoltageV", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="panelboardSCCRkA"
                      className="form-label inline-block w-32"
                    >
                      SCCR (kA):
                    </label>
                    <input
                      id="panelboardSCCRkA"
                      type="text"
                      value={formData.panelboardSCCRkA}
                      onChange={(e) =>
                        handleChange("panelboardSCCRkA", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                </div>
              </div>
              {/* Main Breaker Column */}
              <div>
                <h3 className="text-lg font-medium mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Main Breaker
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <label
                      htmlFor="mainBreakerManufacturer"
                      className="form-label inline-block w-32"
                    >
                      Manufacturer:
                    </label>
                    <input
                      id="mainBreakerManufacturer"
                      type="text"
                      value={formData.mainBreakerManufacturer}
                      onChange={(e) =>
                        handleChange("mainBreakerManufacturer", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="mainBreakerType"
                      className="form-label inline-block w-32"
                    >
                      Type:
                    </label>
                    <input
                      id="mainBreakerType"
                      type="text"
                      value={formData.mainBreakerType}
                      onChange={(e) =>
                        handleChange("mainBreakerType", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="mainBreakerFrameSizeA"
                      className="form-label inline-block w-32"
                    >
                      Frame Size (A):
                    </label>
                    <input
                      id="mainBreakerFrameSizeA"
                      type="text"
                      value={formData.mainBreakerFrameSizeA}
                      onChange={(e) =>
                        handleChange("mainBreakerFrameSizeA", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="mainBreakerRatingPlugA"
                      className="form-label inline-block w-32"
                    >
                      Rating Plug (A):
                    </label>
                    <input
                      id="mainBreakerRatingPlugA"
                      type="text"
                      value={formData.mainBreakerRatingPlugA}
                      onChange={(e) =>
                        handleChange("mainBreakerRatingPlugA", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                  <div className="flex items-center">
                    <label
                      htmlFor="mainBreakerICRatingkA"
                      className="form-label inline-block w-32"
                    >
                      I.C. Rating (kA):
                    </label>
                    <input
                      id="mainBreakerICRatingkA"
                      type="text"
                      value={formData.mainBreakerICRatingkA}
                      onChange={(e) =>
                        handleChange("mainBreakerICRatingkA", e.target.value)
                      }
                      readOnly={!isEditing}
                      className="form-input flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* --- Visual and Mechanical Inspection Section (Screen only) --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 font-semibold pb-2">
              Visual and Mechanical Inspection
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "65%" }} />
                  <col style={{ width: "20%" }} />
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
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                        {item.netaSection}
                      </td>
                      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white whitespace-normal break-words">
                        {item.description}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <select
                          value={item.results}
                          onChange={(e) =>
                            handleChange(
                              "visualInspectionItems",
                              e.target.value,
                              index,
                              "results",
                            )
                          }
                          disabled={!isEditing}
                          className={`block w-full rounded-none border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                        >
                          {visualInspectionResultOptions.map((opt) => (
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
          </div>

          {/* --- Test Equipment Used Section (Screen only) --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 font-semibold pb-2">
              Test Equipment Used
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-4 test-eqpt-onscreen">
              {/* Megohmmeter */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Megohmmeter
                </h3>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="megohmmeterName"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Name:
                  </label>
                  <EquipmentAutocomplete
                    value={formData.megohmmeterName}
                    onChange={(value) => handleChange("megohmmeterName", value)}
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
                      handleChange("megohmmeterName", equipment.equipment_name);
                      handleChange(
                        "megohmmeterSerial",
                        equipment.serial_number || "",
                      );
                      handleChange("megohmmeterAmpId", equipment.amp_id || "");
                      handleChange(
                        "megohmmeterCalDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="megohmmeterSerial"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Serial #:
                  </label>
                  <input
                    id="megohmmeterSerial"
                    type="text"
                    value={formData.megohmmeterSerial}
                    onChange={(e) =>
                      handleChange("megohmmeterSerial", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="megohmmeterAmpId"
                    className="form-label w-20 flex-shrink-0"
                  >
                    AMP ID:
                  </label>
                  <input
                    id="megohmmeterAmpId"
                    type="text"
                    value={formData.megohmmeterAmpId}
                    onChange={(e) =>
                      handleChange("megohmmeterAmpId", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="megohmmeterCalDate"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Cal Date:
                  </label>
                  <input
                    id="megohmmeterCalDate"
                    type="text"
                    value={formData.megohmmeterCalDate}
                    onChange={(e) =>
                      handleChange("megohmmeterCalDate", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
              </div>
              {/* Low-Resistance Ohmmeter */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Low-Resistance Ohmmeter
                </h3>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="lowResistanceOhmmeterName"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Name:
                  </label>
                  <EquipmentAutocomplete
                    value={formData.lowResistanceOhmmeterName}
                    onChange={(value) =>
                      handleChange("lowResistanceOhmmeterName", value)
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
                      handleChange(
                        "lowResistanceOhmmeterName",
                        equipment.equipment_name,
                      );
                      handleChange(
                        "lowResistanceOhmmeterSerial",
                        equipment.serial_number || "",
                      );
                      handleChange(
                        "lowResistanceOhmmeterAmpId",
                        equipment.amp_id || "",
                      );
                      handleChange(
                        "lowResistanceOhmmeterCalDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="lowResistanceOhmmeterSerial"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Serial #:
                  </label>
                  <input
                    id="lowResistanceOhmmeterSerial"
                    type="text"
                    value={formData.lowResistanceOhmmeterSerial}
                    onChange={(e) =>
                      handleChange(
                        "lowResistanceOhmmeterSerial",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="lowResistanceOhmmeterAmpId"
                    className="form-label w-20 flex-shrink-0"
                  >
                    AMP ID:
                  </label>
                  <input
                    id="lowResistanceOhmmeterAmpId"
                    type="text"
                    value={formData.lowResistanceOhmmeterAmpId}
                    onChange={(e) =>
                      handleChange("lowResistanceOhmmeterAmpId", e.target.value)
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="lowResistanceOhmmeterCalDate"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Cal Date:
                  </label>
                  <input
                    id="lowResistanceOhmmeterCalDate"
                    type="text"
                    value={formData.lowResistanceOhmmeterCalDate}
                    onChange={(e) =>
                      handleChange(
                        "lowResistanceOhmmeterCalDate",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
              </div>
              {/* Primary Injection Test Set */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Primary Injection Test Set
                </h3>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="primaryInjectionTestSetName"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Name:
                  </label>
                  <EquipmentAutocomplete
                    value={formData.primaryInjectionTestSetName}
                    onChange={(value) =>
                      handleChange("primaryInjectionTestSetName", value)
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
                      handleChange(
                        "primaryInjectionTestSetName",
                        equipment.equipment_name,
                      );
                      handleChange(
                        "primaryInjectionTestSetSerial",
                        equipment.serial_number || "",
                      );
                      handleChange(
                        "primaryInjectionTestSetAmpId",
                        equipment.amp_id || "",
                      );
                      handleChange(
                        "primaryInjectionTestSetCalDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="primaryInjectionTestSetSerial"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Serial #:
                  </label>
                  <input
                    id="primaryInjectionTestSetSerial"
                    type="text"
                    value={formData.primaryInjectionTestSetSerial}
                    onChange={(e) =>
                      handleChange(
                        "primaryInjectionTestSetSerial",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="primaryInjectionTestSetAmpId"
                    className="form-label w-20 flex-shrink-0"
                  >
                    AMP ID:
                  </label>
                  <input
                    id="primaryInjectionTestSetAmpId"
                    type="text"
                    value={formData.primaryInjectionTestSetAmpId}
                    onChange={(e) =>
                      handleChange(
                        "primaryInjectionTestSetAmpId",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="primaryInjectionTestSetCalDate"
                    className="form-label w-20 flex-shrink-0"
                  >
                    Cal Date:
                  </label>
                  <input
                    id="primaryInjectionTestSetCalDate"
                    type="text"
                    value={formData.primaryInjectionTestSetCalDate}
                    onChange={(e) =>
                      handleChange(
                        "primaryInjectionTestSetCalDate",
                        e.target.value,
                      )
                    }
                    readOnly={!isEditing}
                    className="form-input flex-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* --- Electrical Tests Section (Screen only) --- */}
          <div className="mb-6 electrical-tests-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 font-semibold pb-2">
              Electrical Tests
            </h2>

            {/* Test Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mb-6">
              <div className="flex items-center">
                <label className="form-label mr-2"># of circuit spaces:</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={formData.numberOfCircuitSpaces}
                  onChange={(e) =>
                    handleChange("numberOfCircuitSpaces", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input w-20 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
              <div className="flex items-center">
                <label className="form-label mr-2">Ordering:</label>
                <select
                  value={formData.electricalTestOrdering}
                  onChange={(e) =>
                    handleChange("electricalTestOrdering", e.target.value)
                  }
                  disabled={!isEditing}
                  className={`form-select ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                >
                  {electricalTestOrderingOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="form-label mr-2">Trip Curve #'s:</label>
                <input
                  type="text"
                  value={formData.tripCurveNumbers}
                  onChange={(e) =>
                    handleChange("tripCurveNumbers", e.target.value)
                  }
                  readOnly={!isEditing}
                  className={`form-input flex-1 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                />
              </div>
            </div>

            {/* Breakers Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-neutral-300 dark:border-neutral-600 text-xs">
                <thead className="bg-neutral-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-16">
                      Result
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-12">
                      Circuit
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-14">
                      Poles
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-20">
                      Manuf.
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-20">
                      Type
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-16">
                      Frame
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-16">
                      Trip
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-20">
                      Rated
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white w-20">
                      Test
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white text-center w-12">
                      Min
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white text-center w-12">
                      Max
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white text-center w-12">
                      Time
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white text-center w-12">
                      L-L
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white text-center w-12">
                      L-P
                    </th>
                    <th className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-xs font-medium text-neutral-900 dark:text-white text-center w-12">
                      P-P
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700">
                  {formData.breakers.map((breaker, index) => (
                    <tr
                      key={index}
                      className="hover:bg-neutral-50 dark:hover:bg-dark-200"
                    >
                      <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                        <select
                          value={breaker.result || ""}
                          onChange={(e) =>
                            handleChange(
                              "breakers",
                              e.target.value,
                              index,
                              "result",
                            )
                          }
                          disabled={!isEditing}
                          className={`w-full text-xs rounded border-neutral-300 dark:border-neutral-600
                            ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}
                            ${breaker.result === "FAIL" ? "text-red-600" : "text-green-600"}`}
                        >
                          <option value="">-</option>
                          <option value="PASS" className="text-green-600">
                            PASS
                          </option>
                          <option value="FAIL" className="text-red-600">
                            FAIL
                          </option>
                        </select>
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1 text-center text-xs">
                        {breaker.circuitNumber}
                      </td>
                      <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                        <select
                          value={breaker.poles || ""}
                          onChange={(e) =>
                            handleBreakerChange(index, "poles", e.target.value)
                          }
                          disabled={!isEditing}
                          className={`w-full text-xs rounded border-neutral-300 dark:border-neutral-600
                            ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : "bg-white dark:bg-dark-150"}
                            ${breaker.poles ? "" : "text-neutral-400"}`}
                        >
                          <option value="">-</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </td>
                      {[
                        "manuf",
                        "type",
                        "frameA",
                        "tripA",
                        "ratedCurrentA",
                      ].map((field) => (
                        <td
                          key={field}
                          className="border border-neutral-300 dark:border-neutral-600 px-1 py-1"
                        >
                          <input
                            type="text"
                            value={(breaker as any)[field]}
                            onChange={(e) =>
                              handleChange(
                                "breakers",
                                e.target.value,
                                index,
                                field,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full text-xs border-0 focus:ring-0 ${!isEditing ? "cursor-not-allowed bg-transparent" : ""}`}
                          />
                        </td>
                      ))}
                      <td className="border border-neutral-300 dark:border-neutral-600 px-1 py-1">
                        <input
                          type="text"
                          value={breaker.testCurrentA}
                          readOnly={true}
                          className="w-full text-xs border-0 focus:ring-0 bg-neutral-50 cursor-not-allowed"
                        />
                      </td>
                      {[
                        "tripToleranceMin",
                        "tripToleranceMax",
                        "tripTime",
                        "insulationLL",
                        "insulationLP",
                        "insulationPP",
                      ].map((field) => (
                        <td
                          key={field}
                          className="border border-neutral-300 dark:border-neutral-600 px-1 py-1"
                        >
                          <input
                            type="text"
                            value={(breaker as any)[field]}
                            onChange={(e) =>
                              handleChange(
                                "breakers",
                                e.target.value,
                                index,
                                field,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full text-xs border-0 focus:ring-0 ${!isEditing ? "cursor-not-allowed bg-transparent" : ""}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

// Add print styles
if (typeof document !== "undefined") {
  const style = document.createElement("style");
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

      /* Force orange dividers for sections */
      .w-full.h-1.bg-\\[\\#f26722\\] {
        background-color: #f26722 !important;
        height: 4px !important;
      }

      /* Ensure proper page breaks */
      .mb-6 { margin-bottom: 1.5rem !important; }

      /* Table specific styling for this report */
      .electrical-tests-table {
        font-size: 8px !important;
        page-break-inside: auto !important;
      }

      .electrical-tests-table th,
      .electrical-tests-table td {
        padding: 1px !important;
        font-size: 7px !important;
        line-height: 1 !important;
      }

      /* Allow the Electrical Tests table to break across pages */
      .mb-6:last-child {
        page-break-inside: auto !important;
      }

      .mb-6:last-child table {
        page-break-inside: auto !important;
      }

      .mb-6:last-child tbody {
        page-break-inside: auto !important;
      }

      .mb-6:last-child tr {
        page-break-inside: avoid !important;
      }

      /* Ensure the table container allows page breaks */
      .overflow-x-auto {
        page-break-inside: auto !important;
      }

      /* Prevent excessive spacing in electrical tests */
      .electrical-tests-section .mb-4 { margin-bottom: 0.5rem !important; }
      .electrical-tests-section .mb-2 { margin-bottom: 0.25rem !important; }
      .electrical-tests-section { margin-bottom: 0 !important; }

      /* Force table to start immediately after header */
      .electrical-tests-section table {
        margin-top: 0 !important;
        page-break-before: auto !important;
      }

      /* Reduce tbody height to prevent blank pages */
      .electrical-tests-section tbody {
        page-break-inside: auto !important;
      }

      .electrical-tests-section tbody tr {
        page-break-inside: avoid !important;
        height: auto !important;
        min-height: 0 !important;
      }

      /* Reduce padding in electrical tests section */
      .electrical-tests-section { padding: 0.5rem !important; }

      /* Specific page break handling for electrical tests */
      .electrical-tests-section {
        page-break-inside: auto !important;
      }

      .electrical-tests-section table {
        page-break-inside: auto !important;
      }

      .electrical-tests-section tbody {
        page-break-inside: auto !important;
      }

      .electrical-tests-section tr {
        page-break-inside: avoid !important;
      }

      /* Grid layouts for forms */
      .grid { display: grid !important; }
      .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }
      .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
      .gap-x-6 { column-gap: 1.5rem !important; }
      .gap-y-4 { row-gap: 1rem !important; }

      /* Preserve flexbox layouts */
      .flex { display: flex !important; }
      .items-center { align-items: center !important; }
      .items-end { align-items: flex-end !important; }
      .justify-center { justify-content: center !important; }
      .justify-between { justify-content: space-between !important; }
      .space-x-2 > * + * { margin-left: 0.5rem !important; }
      .space-y-4 > * + * { margin-top: 1rem !important; }

      /* Width utilities */
      .w-16 { width: 4rem !important; }
      .w-20 { width: 5rem !important; }
      .w-24 { width: 6rem !important; }
      .w-32 { width: 8rem !important; }
      .max-w-7xl { max-width: 80rem !important; }

      /* Margin and padding */
      .mb-2 { margin-bottom: 0.5rem !important; }
      .mb-4 { margin-bottom: 1rem !important; }
      .mb-6 { margin-bottom: 1.5rem !important; }
      .p-6 { padding: 1.5rem !important; }
      .pb-1 { padding-bottom: 0.25rem !important; }
      .pb-2 { padding-bottom: 0.5rem !important; }
      .pt-7 { padding-top: 1.75rem !important; }

      /* Border utilities */
      .border-b { border-bottom-width: 1px !important; }
      .rounded-none { border-radius: 0.5rem !important; }
      .shadow-md { box-shadow: none !important; }

      /* Text utilities */
      .text-xl { font-size: 1.25rem !important; }
      .text-lg { font-size: 1.125rem !important; }
      .text-sm { font-size: 0.875rem !important; }
      .text-xs { font-size: 0.75rem !important; }
      .font-semibold { font-weight: 600 !important; }
      .font-medium { font-weight: 500 !important; }
      .font-bold { font-weight: 700 !important; }
      .uppercase { text-transform: uppercase !important; }
      .tracking-wider { letter-spacing: 0.05em !important; }
      .text-center { text-align: center !important; }
      .text-left { text-align: left !important; }

      /* Form input styling */
      .form-input, .form-select, .form-textarea {
        border: 1px solid black !important;
        padding: 2px 3px !important;
        font-size: 8px !important;
        height: 12px !important;
        background-color: white !important;
        color: black !important;
      }

      /* Status box styling */
      .pass-fail-status-box {
        display: inline-block !important;
        padding: 4px 10px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-align: center !important;
        width: fit-content !important;
        border-radius: 6px !important;
        border: 2px solid black !important;
        background-color: #f0f0f0 !important;
        color: black !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-sizing: border-box !important;
        min-width: 50px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default LowVoltagePanelboardSmallBreakerTestATSReport;
