import React, { useEffect, useState } from "react";
import {
  useParams,
  useLocation,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { ReportWrapper } from "./ReportWrapper";
import JobInfoPrintTable from "./common/JobInfoPrintTable";
import { ReportHeader } from "./common/ReportHeader";
import { getReportName, getAssetName } from "./reportMappings";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import { EquipmentAutocomplete } from "../equipment/EquipmentAutocomplete";
import { formatLocalDateShort } from "@/utils/dateUtils";
import { getPassFailBadgeClass } from "@/lib/reportPassFailStatus";

// Temperature Correction Factor (TCF) table and helper (copied from PanelboardReport)
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
  const rounded = Math.round(celsius);
  const key = String(rounded);
  return tcfTable[key] !== undefined ? tcfTable[key] : 1;
};

const TestStatus = { PASS: "PASS", FAIL: "FAIL" } as const;
type Status = (typeof TestStatus)[keyof typeof TestStatus];

interface JobTemp {
  fahrenheit: number;
  celsius: number;
  tcf: number;
  humidity: number | string;
}
interface SwitchRow {
  position: string;
  manufacturer: string;
  catalogNo: string;
  serialNo: string;
  type: string;
  ratedAmperage: string;
  ratedVoltage: string;
}
interface FuseRow {
  position: string;
  manufacturer: string;
  catalogNo: string;
  fuseClass: string;
  amperage: string;
  aic: string;
  voltage: string;
}
interface IRRow {
  position: string;
  // Pole to Pole (device closed)
  p1p2: string;
  p2p3: string;
  p3p1: string;
  // Pole to Neutral (device closed)
  p1n: string;
  p2n: string;
  p3n: string;
  // Pole & Neutral to Ground (device closed)
  p1g: string;
  p2g: string;
  p3g: string;
  ng: string;
  // Line to Load (device open)
  l2l_p1: string;
  l2l_p2: string;
  l2l_p3: string;
}
interface ContactRow {
  position: string;
  // Switch
  sw_p1: string;
  sw_p2: string;
  sw_p3: string;
  // Fuse
  fu_p1: string;
  fu_p2: string;
  fu_p3: string;
  // Switch + Fuse
  sf_p1: string;
  sf_p2: string;
  sf_p3: string;
  units: string;
}
interface VisualMechanicalItem {
  id: string;
  description: string;
  result: string;
}

// Visual and Mechanical inspection items for typical testing
const visualMechanicalItemsList: { id: string; description: string }[] = [
  {
    id: "7.5.1.1.A.1",
    description:
      "Compare equipment nameplate data with drawings and specifications",
  },
  {
    id: "7.5.1.1.A.3",
    description: "Inspect physical and mechanical condition",
  },
  { id: "7.5.1.1.A.4", description: "Verify the unit is clean" },
  {
    id: "7.5.1.1.A.5",
    description:
      "Verify correct blade alignment, blade penetration, travel stops, and mechanical operation",
  },
  {
    id: "7.5.1.1.A.6",
    description:
      "Verify fusing sizes and types are in accordance with drawings, short circuit, and coordination study",
  },
  {
    id: "7.5.1.1.A.7",
    description:
      "Verify each fuse has adequate mechanical support and contact integrity",
  },
  {
    id: "7.5.1.1.A.9",
    description: "Verify operation and sequencing of interlocking systems",
  },
  {
    id: "7.5.1.1.A.10",
    description: "Verify correct phase barrier installation",
  },
  {
    id: "7.5.1.1.A.11",
    description:
      "Verify correct operation of all indicating and control devices",
  },
  {
    id: "7.5.1.1.A.12",
    description:
      "Verify appropriate lubrication on moving current carrying parts and on moving and sliding surfaces",
  },
];

const visualMechanicalOptions = [
  "Select One",
  "Pass",
  "Fail",
  "See Comments",
  "N/A",
] as const;

interface FormData {
  // Job info
  customer: string;
  jobNumber: string;
  technicians: string;
  date: string;
  identifier: string;
  substation: string;
  eqptLocation: string;
  user: string;
  temperature: JobTemp;
  status: Status;

  // Sheet title (user-customizable)
  sheetTitle: string;

  // Enclosure
  enclosure: {
    manufacturer: string;
    systemVoltage: string;
    catalogNo: string;
    ratedVoltage: string;
    serialNumber: string;
    ratedCurrent: string;
    series: string;
    aicRating: string;
    type: string;
    phaseConfiguration: string;
  };

  // Tables
  switches: SwitchRow[];
  fuses: FuseRow[];
  irMeasured: IRRow[];
  irCorrected: IRRow[];
  contact: ContactRow[];
  visualMechanical: VisualMechanicalItem[];
  irTestVoltage: string;
  irUnits: string;
  contactUnits: string;

  // Equipment and comments
  equipment: {
    megger: string;
    meggerSerial: string;
    meggerAmpId: string;
    meggerCalDate: string;
    lowRes: string;
    lowResSerial: string;
    lowResAmpId: string;
    lowResCalDate: string;
  };
  comments: string;
}

const makeArray = <T,>(n: number, fn: () => T) => Array.from({ length: n }, fn);

const LowVoltageSwitchMultiDeviceTest: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(
    reportId,
  );

  useEffect(() => {
    setCurrentReportId(reportId);
  }, [reportId]);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get("print") === "true";
  const reportName = getReportName("low-voltage-switch-multi-device-test");
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();

  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [saving, setSaving] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState(false);
  const [applyIrReading, setApplyIrReading] = useState<string | null>(null);
  const createEmptyIRRow = (): IRRow => ({
    position: "",
    p1p2: "",
    p2p3: "",
    p3p1: "",
    p1n: "",
    p2n: "",
    p3n: "",
    p1g: "",
    p2g: "",
    p3g: "",
    ng: "",
    l2l_p1: "",
    l2l_p2: "",
    l2l_p3: "",
  });

  const createEmptySwitchRow = (): SwitchRow => ({
    position: "",
    manufacturer: "",
    catalogNo: "",
    serialNo: "",
    type: "",
    ratedAmperage: "",
    ratedVoltage: "",
  });
  const createEmptyFuseRow = (): FuseRow => ({
    position: "",
    manufacturer: "",
    catalogNo: "",
    fuseClass: "",
    amperage: "",
    aic: "",
    voltage: "",
  });
  const createEmptyContactRow = (): ContactRow => ({
    position: "",
    sw_p1: "",
    sw_p2: "",
    sw_p3: "",
    fu_p1: "",
    fu_p2: "",
    fu_p3: "",
    sf_p1: "",
    sf_p2: "",
    sf_p3: "",
    units: "µΩ",
  });

  const [formData, setFormData] = useState<FormData>({
    customer: "",
    jobNumber: "",
    technicians: "",
    date: new Date().toISOString().split("T")[0],
    identifier: "",
    substation: "",
    eqptLocation: "",
    user: "",
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
    status: TestStatus.PASS,
    sheetTitle: "Multi-Device",
    enclosure: {
      manufacturer: "",
      systemVoltage: "",
      catalogNo: "",
      ratedVoltage: "",
      serialNumber: "",
      ratedCurrent: "",
      series: "",
      aicRating: "",
      type: "",
      phaseConfiguration: "",
    },
    switches: makeArray<SwitchRow>(6, createEmptySwitchRow),
    fuses: makeArray<FuseRow>(6, createEmptyFuseRow),
    irMeasured: makeArray<IRRow>(6, createEmptyIRRow),
    irCorrected: makeArray<IRRow>(6, createEmptyIRRow),
    contact: makeArray<ContactRow>(6, createEmptyContactRow),
    visualMechanical: visualMechanicalItemsList.map((item) => ({
      id: item.id,
      description: item.description,
      result: "Select One",
    })),
    irTestVoltage: "1000V",
    irUnits: "MΩ",
    contactUnits: "µΩ",
    equipment: {
      megger: "",
      meggerSerial: "",
      meggerAmpId: "",
      meggerCalDate: "",
      lowRes: "",
      lowResSerial: "",
      lowResAmpId: "",
      lowResCalDate: "",
    },
    comments: "",
  });

  // Load job information when component mounts
  useEffect(() => {
    if (jobId) {
      loadJobInfo();
    }
  }, [jobId]);

  // Keep Fahrenheit/Celsius/TCF in sync using the shared TCF table
  useEffect(() => {
    const c = Math.round(((formData.temperature.fahrenheit - 32) * 5) / 9);
    const tcf = getTCF(c);
    if (
      c !== formData.temperature.celsius ||
      tcf !== formData.temperature.tcf
    ) {
      setFormData((prev) => ({
        ...prev,
        temperature: { ...prev.temperature, celsius: c, tcf },
      }));
    }
  }, [formData.temperature.fahrenheit]);

  // Auto-calculate Temperature Corrected Insulation Resistance (TCIR)
  useEffect(() => {
    const tcf = Number(formData.temperature.tcf) || 1;

    const multiply = (val: string): string => {
      const s = String(val).trim();
      if (!s) return "";
      const prefix = s.startsWith(">") ? ">" : s.startsWith("<") ? "<" : "";
      const num = parseFloat(s.replace(/[^0-9.\-]/g, ""));
      if (Number.isNaN(num)) return val || "";
      const result = num * tcf;
      const fixed = Math.round((result + Number.EPSILON) * 100) / 100;
      return prefix ? `${prefix}${fixed}` : String(fixed);
    };

    const nextCorrected = formData.irMeasured.map((row) => ({
      position: row.position,
      p1p2: multiply(row.p1p2),
      p2p3: multiply(row.p2p3),
      p3p1: multiply(row.p3p1),
      p1n: multiply(row.p1n),
      p2n: multiply(row.p2n),
      p3n: multiply(row.p3n),
      p1g: multiply(row.p1g),
      p2g: multiply(row.p2g),
      p3g: multiply(row.p3g),
      ng: multiply(row.ng),
      l2l_p1: multiply(row.l2l_p1),
      l2l_p2: multiply(row.l2l_p2),
      l2l_p3: multiply(row.l2l_p3),
    }));

    if (
      JSON.stringify(nextCorrected) !== JSON.stringify(formData.irCorrected)
    ) {
      setFormData((prev) => ({ ...prev, irCorrected: nextCorrected }));
    }
  }, [formData.irMeasured, formData.temperature.tcf]);

  // Auto-populate position identifiers across all tables when first table (switches) is edited
  const handlePositionChange = (
    arrayName: "switches" | "fuses" | "irMeasured" | "contact",
    index: number,
    value: string,
  ) => {
    setFormData((prev) => {
      const clone = { ...prev } as any;

      // Update the specified array
      const targetArray = [...clone[arrayName]];
      targetArray[index] = { ...targetArray[index], position: value };
      clone[arrayName] = targetArray;

      // If this is the switches array, propagate to all other tables
      if (arrayName === "switches") {
        if (clone.fuses[index]) {
          const fuses = [...clone.fuses];
          fuses[index] = { ...fuses[index], position: value };
          clone.fuses = fuses;
        }
        if (clone.irMeasured[index]) {
          const irMeasured = [...clone.irMeasured];
          irMeasured[index] = { ...irMeasured[index], position: value };
          clone.irMeasured = irMeasured;
        }
        if (clone.contact[index]) {
          const contact = [...clone.contact];
          contact[index] = { ...contact[index], position: value };
          clone.contact = contact;
        }
      }

      return clone;
    });
  };

  // Add a new device row to all tables
  const addDeviceRow = () => {
    setFormData((prev) => ({
      ...prev,
      switches: [...prev.switches, createEmptySwitchRow()],
      fuses: [...prev.fuses, createEmptyFuseRow()],
      irMeasured: [...prev.irMeasured, createEmptyIRRow()],
      irCorrected: [...prev.irCorrected, createEmptyIRRow()],
      contact: [...prev.contact, createEmptyContactRow()],
    }));
  };

  // Remove the last device row from all tables
  const removeDeviceRow = () => {
    if (formData.switches.length <= 1) return; // Keep at least one row
    setFormData((prev) => ({
      ...prev,
      switches: prev.switches.slice(0, -1),
      fuses: prev.fuses.slice(0, -1),
      irMeasured: prev.irMeasured.slice(0, -1),
      irCorrected: prev.irCorrected.slice(0, -1),
      contact: prev.contact.slice(0, -1),
    }));
  };

  const setField = (path: string, value: any) => {
    setFormData((prev) => {
      const clone: any = { ...prev };
      const keys = path.split(".");
      let cur = clone;
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] === undefined) cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return clone;
    });
  };

  // Apply a bulk reading (e.g. ">2200") to all IR measured cells in one row
  const applyReadingToIrRow = (idx: number) => {
    if (!applyIrReading || !isEditing) return;
    const reading = applyIrReading;
    setFormData((prev) => {
      const next = [...prev.irMeasured];
      next[idx] = {
        ...next[idx],
        p1p2: reading,
        p2p3: reading,
        p3p1: reading,
        p1n: reading,
        p2n: reading,
        p3n: reading,
        p1g: reading,
        p2g: reading,
        p3g: reading,
        ng: reading,
        l2l_p1: reading,
        l2l_p2: reading,
        l2l_p3: reading,
      };
      return { ...prev, irMeasured: next };
    });
  };

  // Clear all IR reading cells in one row (used when unchecking the apply checkbox)
  const clearIrRow = (idx: number) => {
    if (!isEditing) return;
    setFormData((prev) => {
      const next = [...prev.irMeasured];
      next[idx] = {
        ...next[idx],
        p1p2: "",
        p2p3: "",
        p3p1: "",
        p1n: "",
        p2n: "",
        p3n: "",
        p1g: "",
        p2g: "",
        p3g: "",
        ng: "",
        l2l_p1: "",
        l2l_p2: "",
        l2l_p3: "",
      };
      return { ...prev, irMeasured: next };
    });
  };

  // Arrow-key navigation for IR Measured table (14 columns: position + 13 readings).
  // Always consume arrow keys here so global position-based nav doesn't run (avoids skip/jump on Windows).
  const IR_MEASURED_COLS = 14;
  const handleIrMeasuredKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown"
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    const totalRows = formData.irMeasured.length;
    let targetRow = row;
    let targetCol = col;
    if (e.key === "ArrowLeft") {
      if (col > 0) targetCol = col - 1;
    } else if (e.key === "ArrowRight") {
      if (col < IR_MEASURED_COLS - 1) targetCol = col + 1;
    } else if (e.key === "ArrowUp") {
      if (row > 0) targetRow = row - 1;
    } else if (e.key === "ArrowDown") {
      if (row < totalRows - 1) targetRow = row + 1;
    }
    if (targetRow !== row || targetCol !== col) {
      const el = document.querySelector(
        `[data-ir-pos="${targetRow}-${targetCol}"]`,
      ) as HTMLElement;
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
          el.select();
      }
    }
  };

  // Load job information (customer, job number, technicians, etc.)
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

      // Fetch customer information
      if (jobData?.customer_id) {
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
          setFormData((prev) => ({
            ...prev,
            customer: maskCustomerName(
              customerData.company_name || customerData.name || "",
            ),
            jobNumber: jobData.job_number || "",
            // Set current date if not already set
            date: prev.date || new Date().toISOString().split("T")[0],
            // Set current user if not already set
            user: prev.user || user?.email || "",
            // Prefer job site_address over customer address
            address: maskCustomerAddress(
              (jobData as any).site_address || customerData.address || "",
            ),
          }));
        }
      }
    } catch (error) {
      console.error("Error loading job info:", error);
    }
  };

  // Load existing report from normalized store
  useEffect(() => {
    const loadReport = async () => {
      if (!reportId) return;
      try {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("low_voltage_cable_test_3sets")
          .select("*")
          .eq("id", reportId)
          .single();
        if (error) throw error;
        const storedReportData =
          (data as any)?.data || (data as any)?.report_data;
        if (data && storedReportData) {
          const d: any = storedReportData;
          setFormData((prev) => ({
            ...prev,
            customer: maskCustomerName(d.reportInfo?.customer ?? prev.customer),
            jobNumber: d.reportInfo?.jobNumber ?? prev.jobNumber,
            technicians: d.reportInfo?.technicians ?? prev.technicians,
            date: d.reportInfo?.date ?? prev.date,
            identifier: d.reportInfo?.identifier ?? prev.identifier,
            substation: d.reportInfo?.substation ?? prev.substation,
            eqptLocation: d.reportInfo?.eqptLocation ?? prev.eqptLocation,
            user: d.reportInfo?.userName ?? prev.user,
            temperature: {
              fahrenheit:
                d.reportInfo?.temperature?.fahrenheit ??
                prev.temperature.fahrenheit,
              celsius:
                d.reportInfo?.temperature?.celsius ?? prev.temperature.celsius,
              tcf:
                d.reportInfo?.temperature?.correctionFactor ??
                prev.temperature.tcf,
              humidity: d.reportInfo?.humidity ?? prev.temperature.humidity,
            },
            status: (d.status as Status) ?? prev.status,
            enclosure: {
              manufacturer:
                d.enclosure?.manufacturer ?? prev.enclosure.manufacturer,
              systemVoltage:
                d.enclosure?.systemVoltage ?? prev.enclosure.systemVoltage,
              catalogNo: d.enclosure?.catalogNo ?? prev.enclosure.catalogNo,
              ratedVoltage:
                d.enclosure?.ratedVoltage ?? prev.enclosure.ratedVoltage,
              serialNumber:
                d.enclosure?.serialNumber ?? prev.enclosure.serialNumber,
              ratedCurrent:
                d.enclosure?.ratedCurrent ?? prev.enclosure.ratedCurrent,
              series: d.enclosure?.series ?? prev.enclosure.series,
              aicRating: d.enclosure?.aicRating ?? prev.enclosure.aicRating,
              type: d.enclosure?.type ?? prev.enclosure.type,
              phaseConfiguration:
                d.enclosure?.phaseConfiguration ??
                prev.enclosure.phaseConfiguration,
            },
            switches:
              Array.isArray(d.switches) && d.switches.length > 0
                ? d.switches
                : prev.switches,
            fuses:
              Array.isArray(d.fuses) && d.fuses.length > 0
                ? d.fuses
                : prev.fuses,
            sheetTitle: d.sheetTitle ?? prev.sheetTitle,
            irMeasured:
              Array.isArray(d.irTests?.rows) && d.irTests.rows.length > 0
                ? d.irTests.rows.map((r: any) => ({
                    position: r.position || "",
                    p1p2: r.p1p2 || "",
                    p2p3: r.p2p3 || "",
                    p3p1: r.p3p1 || "",
                    p1n: r.p1n || "",
                    p2n: r.p2n || "",
                    p3n: r.p3n || "",
                    p1g: r.p1g || "",
                    p2g: r.p2g || "",
                    p3g: r.p3g || "",
                    ng: r.ng || "",
                    l2l_p1: r.l2l_p1 || "",
                    l2l_p2: r.l2l_p2 || "",
                    l2l_p3: r.l2l_p3 || "",
                  }))
                : prev.irMeasured,
            irUnits: d.irTests?.units ?? prev.irUnits,
            irTestVoltage: d.irTests?.testVoltage ?? prev.irTestVoltage,
            contactUnits: d.contactResistance?.units ?? prev.contactUnits,
            contact:
              Array.isArray(d.contactResistance?.rows) &&
              d.contactResistance.rows.length > 0
                ? d.contactResistance.rows.map((r: any) => {
                    const split3 = (val: any): [string, string, string] => {
                      if (typeof val !== "string") return ["", "", ""];
                      const parts = val
                        .split("/")
                        .map((p: string) => p.trim())
                        .filter(Boolean);
                      return [
                        parts[0] || "",
                        parts[1] || "",
                        parts[2] || "",
                      ] as [string, string, string];
                    };
                    const [sw1, sw2, sw3] =
                      r.sw_p1 !== undefined ||
                      r.sw_p2 !== undefined ||
                      r.sw_p3 !== undefined
                        ? [r.sw_p1 || "", r.sw_p2 || "", r.sw_p3 || ""]
                        : split3(r.switchOnly);
                    const [fu1, fu2, fu3] =
                      r.fu_p1 !== undefined ||
                      r.fu_p2 !== undefined ||
                      r.fu_p3 !== undefined
                        ? [r.fu_p1 || "", r.fu_p2 || "", r.fu_p3 || ""]
                        : split3(r.fuseOnly);
                    const [sf1, sf2, sf3] =
                      r.sf_p1 !== undefined ||
                      r.sf_p2 !== undefined ||
                      r.sf_p3 !== undefined
                        ? [r.sf_p1 || "", r.sf_p2 || "", r.sf_p3 || ""]
                        : split3(r.switchPlusFuse);
                    return {
                      position: r.position || "",
                      sw_p1: sw1,
                      sw_p2: sw2,
                      sw_p3: sw3,
                      fu_p1: fu1,
                      fu_p2: fu2,
                      fu_p3: fu3,
                      sf_p1: sf1,
                      sf_p2: sf2,
                      sf_p3: sf3,
                      units: r.units || "µΩ",
                    } as ContactRow;
                  })
                : prev.contact,
            equipment: {
              megger: d.equipment?.megger ?? prev.equipment.megger,
              meggerSerial:
                d.equipment?.meggerSerial ?? prev.equipment.meggerSerial,
              meggerAmpId:
                d.equipment?.meggerAmpId ?? prev.equipment.meggerAmpId,
              meggerCalDate:
                d.equipment?.meggerCalDate ?? prev.equipment.meggerCalDate,
              lowRes: d.equipment?.lowRes ?? prev.equipment.lowRes,
              lowResSerial:
                d.equipment?.lowResSerial ?? prev.equipment.lowResSerial,
              lowResAmpId:
                d.equipment?.lowResAmpId ?? prev.equipment.lowResAmpId,
              lowResCalDate:
                d.equipment?.lowResCalDate ?? prev.equipment.lowResCalDate,
            },
            comments: d.reportInfo?.comments ?? prev.comments,
            // Visual and Mechanical inspection items
            visualMechanical:
              Array.isArray(d.visualMechanical) && d.visualMechanical.length > 0
                ? d.visualMechanical.map((item: any) => ({
                    id: item.id || "",
                    description:
                      item.description ||
                      visualMechanicalItemsList.find((v) => v.id === item.id)
                        ?.description ||
                      "",
                    result: item.result || "Select One",
                  }))
                : prev.visualMechanical,
          }));
          setIsEditing(false);
        }
      } catch (err) {
        console.error("Error loading switch multi-device report:", err);
      }
    };
    if (reportId) loadReport();
  }, [reportId]);

  const handleSave = async (): Promise<string | null> => {
    if (!jobId || !user?.id || !isEditing)
      return currentReportId || reportId || null;
    setSaving(true);

    const normalized: any = {
      reportInfo: {
        customer: maskCustomerName(formData.customer),
        address: maskCustomerAddress((formData as any).address),
        userName: formData.user,
        date: formData.date,
        identifier: formData.identifier,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: {
          fahrenheit: formData.temperature.fahrenheit,
          celsius: formData.temperature.celsius,
          correctionFactor: formData.temperature.tcf,
        },
        humidity: formData.temperature.humidity,
        comments: formData.comments,
      },
      sheetTitle: formData.sheetTitle,
      visualMechanical: formData.visualMechanical,
      enclosure: { ...formData.enclosure },
      switches: formData.switches,
      fuses: formData.fuses,
      irTests: {
        testVoltage: formData.irTestVoltage,
        units: formData.irUnits,
        rows: formData.irMeasured.map((r) => ({
          position: r.position,
          p1p2: r.p1p2,
          p2p3: r.p2p3,
          p3p1: r.p3p1,
          p1n: r.p1n,
          p2n: r.p2n,
          p3n: r.p3n,
          p1g: r.p1g,
          p2g: r.p2g,
          p3g: r.p3g,
          ng: r.ng,
          l2l_p1: r.l2l_p1,
          l2l_p2: r.l2l_p2,
          l2l_p3: r.l2l_p3,
        })),
      },
      contactResistance: {
        units: formData.contactUnits,
        rows: formData.contact,
      },
      equipment: { ...formData.equipment },
      status: formData.status,
      reportType: "low-voltage-switch-multi-device-test",
    };

    const payload = {
      job_id: jobId,
      user_id: user.id,
      data: normalized,
    };

    try {
      const activeReportId = currentReportId || reportId;

      if (activeReportId) {
        const { error } = await supabase
          .schema("neta_ops")
          .from("low_voltage_cable_test_3sets")
          .update(payload)
          .eq("id", activeReportId)
          .single();
        if (error) throw error;
        setCurrentReportId(activeReportId);
        setJustSaved(true);
        return activeReportId;
      } else {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("low_voltage_cable_test_3sets")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        const newId = (data as any)?.id as string;
        if (newId) {
          setCurrentReportId(newId);
          setJustSaved(true);
          navigate(
            `/jobs/${jobId}/low-voltage-switch-multi-device-test/${newId}`,
            {
              replace: true,
            },
          );
          const asset = {
            name: getAssetName(
              "low-voltage-switch-multi-device-test",
              formData.identifier || formData.eqptLocation || "",
            ),
            file_url: `report:/jobs/${jobId}/low-voltage-switch-multi-device-test/${newId}`,
            user_id: user.id,
          } as any;
          const { data: assetRow, error: assetErr } = await supabase
            .schema("neta_ops")
            .from("assets")
            .insert(asset)
            .select("id")
            .single();
          if (assetErr) throw assetErr;
          if (assetRow?.id) {
            await supabase.schema("neta_ops").from("job_assets").insert({
              job_id: jobId,
              asset_id: assetRow.id,
              user_id: user.id,
            });
          }
          return newId;
        }
      }
      setJustSaved(true);
      return currentReportId || reportId || null;
    } catch (err: any) {
      console.error("Failed to save report:", err);
      alert(`Failed to save report: ${err?.message || "Unknown error"}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const savedReportId = await handleSave();
    if (savedReportId || currentReportId || reportId) {
      setIsEditing(false);
    }
  };

  const handleVisualMechanicalChange = (index: number, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.visualMechanical];
      updated[index] = { ...updated[index], result: value };
      return { ...prev, visualMechanical: updated };
    });
  };

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
          <h1 className="text-2xl font-bold text-black mb-1">
            Low Voltage Switch - {formData.sheetTitle}
          </h1>
        </div>
        <div
          className="text-right font-extrabold text-xl"
          style={{ color: "#1a4e7c" }}
        >
          NETA - ATS 7.5.1.1
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
                    : "2px solid #dc2626",
                backgroundColor:
                  formData.status === TestStatus.PASS ? "#22c55e" : "#ef4444",
                color: "white",
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
            jobNumber: formData.jobNumber,
            technicians: formData.technicians,
            date: formData.date,
            identifier: formData.identifier,
            user: formData.user,
            substation: formData.substation,
            eqptLocation: formData.eqptLocation,
            temperature: {
              fahrenheit: formData.temperature.fahrenheit,
              celsius: formData.temperature.celsius,
              tcf: formData.temperature.tcf,
              humidity:
                typeof formData.temperature.humidity === "string"
                  ? parseFloat(formData.temperature.humidity) || 0
                  : formData.temperature.humidity,
            },
          }}
        />
      </div>

      {/* Print-only sections - rendered outside wrapper for deliverable viewer compatibility */}
      <div
        className={
          isPrintMode
            ? "block px-4 space-y-3"
            : "hidden print:block px-4 space-y-3"
        }
        style={{ fontSize: "9px" }}
      >
        {/* Visual and Mechanical Inspection */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">
            Visual and Mechanical Inspection
          </h2>
          <table
            className="visual-mechanical-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              fontSize: "8px",
            }}
          >
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "70%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    textAlign: "left",
                  }}
                >
                  NETA Section
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    textAlign: "left",
                  }}
                >
                  Description
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    textAlign: "center",
                  }}
                >
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.visualMechanical.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {item.id}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {item.description}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {item.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Enclosure Data */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">Enclosure Data</h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "8px",
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    border: "1px solid black",
                    padding: "3px",
                    width: "25%",
                  }}
                >
                  <strong>Manufacturer:</strong>{" "}
                  {formData.enclosure.manufacturer}
                </td>
                <td
                  style={{
                    border: "1px solid black",
                    padding: "3px",
                    width: "25%",
                  }}
                >
                  <strong>System Voltage:</strong>{" "}
                  {formData.enclosure.systemVoltage}
                </td>
                <td
                  style={{
                    border: "1px solid black",
                    padding: "3px",
                    width: "25%",
                  }}
                >
                  <strong>Catalog No.:</strong> {formData.enclosure.catalogNo}
                </td>
                <td
                  style={{
                    border: "1px solid black",
                    padding: "3px",
                    width: "25%",
                  }}
                >
                  <strong>Rated Voltage:</strong>{" "}
                  {formData.enclosure.ratedVoltage}
                </td>
              </tr>
              <tr>
                <td style={{ border: "1px solid black", padding: "3px" }}>
                  <strong>Serial Number:</strong>{" "}
                  {formData.enclosure.serialNumber}
                </td>
                <td style={{ border: "1px solid black", padding: "3px" }}>
                  <strong>Rated Current:</strong>{" "}
                  {formData.enclosure.ratedCurrent}
                </td>
                <td style={{ border: "1px solid black", padding: "3px" }}>
                  <strong>Series:</strong> {formData.enclosure.series}
                </td>
                <td style={{ border: "1px solid black", padding: "3px" }}>
                  <strong>SCCR:</strong> {formData.enclosure.aicRating}
                </td>
              </tr>
              <tr>
                <td style={{ border: "1px solid black", padding: "3px" }}>
                  <strong>Type:</strong> {formData.enclosure.type}
                </td>
                <td
                  colSpan={3}
                  style={{ border: "1px solid black", padding: "3px" }}
                >
                  <strong>Phase Configuration:</strong>{" "}
                  {formData.enclosure.phaseConfiguration}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Switch Data */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">Switch Data</h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "8px",
              tableLayout: "fixed",
            }}
          >
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Position
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Manufacturer
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Catalog No.
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Serial No.
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "15%",
                  }}
                >
                  Rated Amp
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "15%",
                  }}
                >
                  Rated Volt
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.switches.map((sw, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.position}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.manufacturer}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.catalogNo}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.serialNo}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.type}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.ratedAmperage}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {sw.ratedVoltage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fuse Data */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">Fuse Data</h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "8px",
              tableLayout: "fixed",
            }}
          >
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Position
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Manufacturer
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Catalog No.
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Fuse Class
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "14%",
                  }}
                >
                  Amperage
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "15%",
                  }}
                >
                  AIC
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "15%",
                  }}
                >
                  Voltage
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.fuses.map((fuse, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.position}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.manufacturer}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.catalogNo}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.fuseClass}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.amperage}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.aic}
                  </td>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {fuse.voltage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insulation Resistance - Measured */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">
            Electrical Tests - Measured Insulation Resistance
          </h2>
          <div style={{ fontSize: "8px", marginBottom: "2px" }}>
            Test Voltage: {formData.irTestVoltage} | Units: {formData.irUnits}
          </div>

          {/* Part 1: Pole to Pole + Pole to Neutral (7 equal cols) */}
          <table
            className="ir-print-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "7.5px",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2858%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  rowSpan={2}
                >
                  Position
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Pole to Pole (closed)
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Pole to Neutral (closed)
                </th>
              </tr>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1-P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2-P3
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3-P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1-N
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2-N
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3-N
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.irMeasured.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {row.position}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p1p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p2p3}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p3p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p1n}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p2n}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p3n}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Part 2: Pole & Neutral to Ground + Line to Load (8 equal cols @ 12.5%) */}
          <table
            className="ir-print-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "7.5px",
              tableLayout: "fixed",
              marginTop: "-1px",
            }}
          >
            <colgroup>
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  rowSpan={2}
                >
                  Position
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={4}
                >
                  Pole & Neutral to Ground (closed)
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Line to Load (open)
                </th>
              </tr>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  N-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.irMeasured.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {row.position}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p1g}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p2g}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p3g}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.ng}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.l2l_p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.l2l_p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.l2l_p3}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insulation Resistance - Corrected */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">
            Electrical Tests - Temperature Corrected IR Values
          </h2>
          <div style={{ fontSize: "8px", marginBottom: "2px" }}>
            Units: {formData.irUnits}
          </div>

          {/* Part 1: Pole to Pole + Pole to Neutral (7 equal cols) */}
          <table
            className="ir-print-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "7.5px",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2857%" }} />
              <col style={{ width: "14.2858%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  rowSpan={2}
                >
                  Position
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Pole to Pole (closed)
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Pole to Neutral (closed)
                </th>
              </tr>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1-P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2-P3
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3-P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1-N
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2-N
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3-N
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.irCorrected.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {row.position}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p1p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p2p3}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p3p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p1n}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p2n}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p3n}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Part 2: Pole & Neutral to Ground + Line to Load (8 equal cols @ 12.5%) */}
          <table
            className="ir-print-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "7.5px",
              tableLayout: "fixed",
              marginTop: "-1px",
            }}
          >
            <colgroup>
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
              <col style={{ width: "12.5%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  rowSpan={2}
                >
                  Position
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={4}
                >
                  Pole & Neutral to Ground (closed)
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Line to Load (open)
                </th>
              </tr>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  N-G
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.irCorrected.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {row.position}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p1g}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p2g}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.p3g}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.ng}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.l2l_p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.l2l_p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.l2l_p3}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Contact Resistance */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">
            Electrical Tests - Contact Resistance
          </h2>
          <div style={{ fontSize: "8px", marginBottom: "2px" }}>
            Units: {formData.contactUnits}
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "8px",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  rowSpan={2}
                >
                  Position
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Switch
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Fuse
                </th>
                <th
                  style={{ border: "1px solid black", padding: "2px" }}
                  colSpan={3}
                >
                  Switch + Fuse
                </th>
              </tr>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P1
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P2
                </th>
                <th style={{ border: "1px solid black", padding: "2px" }}>
                  P3
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.contact.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid black", padding: "2px" }}>
                    {row.position}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.sw_p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.sw_p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.sw_p3}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.fu_p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.fu_p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.fu_p3}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.sf_p1}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.sf_p2}
                  </td>
                  <td
                    style={{
                      border: "1px solid black",
                      padding: "2px",
                      textAlign: "center",
                    }}
                  >
                    {row.sf_p3}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Test Equipment Used */}
        <div>
          <div className="w-full h-1 bg-[#f26722] mb-1"></div>
          <h2 className="text-sm font-bold mb-1 text-black">
            Test Equipment Used
          </h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "8px",
              tableLayout: "fixed",
            }}
          >
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "20%",
                  }}
                >
                  Equipment
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "20%",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "20%",
                  }}
                >
                  Serial #
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "20%",
                  }}
                >
                  AMP ID
                </th>
                <th
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    width: "20%",
                  }}
                >
                  Cal Date
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    fontWeight: "bold",
                  }}
                >
                  Megohmmeter
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.megger}
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.meggerSerial}
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.meggerAmpId}
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.meggerCalDate}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: "1px solid black",
                    padding: "2px",
                    fontWeight: "bold",
                  }}
                >
                  Low-Res Ohmmeter
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.lowRes}
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.lowResSerial}
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.lowResAmpId}
                </td>
                <td style={{ border: "1px solid black", padding: "2px" }}>
                  {formData.equipment.lowResCalDate}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {formData.comments?.trim() && (
          <div>
            <div className="w-full h-1 bg-[#f26722] mb-1"></div>
            <h2 className="text-sm font-bold mb-1 text-black">Comments</h2>
            <div
              style={{
                border: "1px solid black",
                padding: "4px",
                fontSize: "8px",
                minHeight: "30px",
                whiteSpace: "pre-wrap",
              }}
            >
              {formData.comments}
            </div>
          </div>
        )}
      </div>

      {/* Main content wrapper - screen only */}
      {!isPrintMode && (
        <div className="p-6 flex justify-center bg-neutral-50 dark:bg-dark-150 print:hidden">
          <div className="max-w-7xl w-full space-y-8">
            <ReportHeader
              title={`Low Voltage Switch - ${formData.sheetTitle || "Multi-Device"}`}
              isAutoSaving={false}
              isEditing={isEditing}
              justSaved={justSaved}
              isSaving={saving}
              status={formData.status}
              hasReport={!!currentReportId}
              onStatusToggle={() => {
                if (isEditing) {
                  setFormData((p) => ({
                    ...p,
                    status:
                      p.status === TestStatus.PASS
                        ? TestStatus.FAIL
                        : TestStatus.PASS,
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
            <div className={`${isPrintMode ? "hidden" : ""} print:hidden`}>
              <div className="mb-4 flex items-center gap-3">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Sheet title
                </label>
                <input
                  type="text"
                  value={formData.sheetTitle}
                  onChange={(e) => setField("sheetTitle", e.target.value)}
                  readOnly={!isEditing}
                  placeholder="Multi-Device"
                  className={`form-input max-w-xs ${!isEditing ? "bg-neutral-100 dark:bg-dark-150 cursor-default" : ""}`}
                />
              </div>
              {/* Device Row Controls */}
              {isEditing && (
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={addDeviceRow}
                    className="px-3 py-1 text-sm text-white bg-green-600 hover:bg-green-700 rounded-md"
                  >
                    + Add Device Row
                  </button>
                  <button
                    onClick={removeDeviceRow}
                    disabled={formData.switches.length <= 1}
                    className="px-3 py-1 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    - Remove Last Row
                  </button>
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    ({formData.switches.length} device
                    {formData.switches.length > 1 ? "s" : ""})
                  </span>
                </div>
              )}
            </div>

            {/* Job Information */}
            <section className="mb-6 job-info-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Job Information
              </h2>

              {/* On-screen form - hidden in print */}
              <div
                className={`grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 ${isPrintMode ? "hidden" : ""} print:hidden job-info-onscreen`}
              >
                <div>
                  <label className="form-label">Customer:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={maskCustomerName(formData.customer)}
                    onChange={(e) => setField("customer", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Job #:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.jobNumber}
                    onChange={(e) => setField("jobNumber", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Technicians:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.technicians}
                    onChange={(e) => setField("technicians", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Date:</label>
                  <input
                    type="date"
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.date}
                    onChange={(e) => setField("date", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Identifier:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.identifier}
                    onChange={(e) => setField("identifier", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div className="flex items-center space-x-1">
                  <div>
                    <label className="form-label">Temp:</label>
                    <input
                      type="number"
                      value={formData.temperature.fahrenheit}
                      onChange={(e) =>
                        setField(
                          "temperature.fahrenheit",
                          Number(e.target.value),
                        )
                      }
                      readOnly={!isEditing}
                      className={`form-input w-16 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    />
                    <span className="ml-1 text-xs">°F</span>
                  </div>
                  <div>
                    <label className="form-label sr-only">Celsius</label>
                    <input
                      type="number"
                      value={formData.temperature.celsius}
                      readOnly
                      className="form-input w-16 bg-neutral-100 dark:bg-dark-150"
                    />
                    <span className="ml-1 text-xs">°C</span>
                  </div>
                </div>
                <div>
                  <label className="form-label">TCF:</label>
                  <input
                    type="number"
                    value={formData.temperature.tcf}
                    readOnly
                    className="form-input w-16 bg-neutral-100 dark:bg-dark-150"
                  />
                </div>
                <div>
                  <label className="form-label">Humidity:</label>
                  <input
                    type="number"
                    value={formData.temperature.humidity || ""}
                    onChange={(e) =>
                      setField(
                        "temperature.humidity",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    readOnly={!isEditing}
                    className={`form-input w-16 ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                  <span className="ml-1 text-xs">%</span>
                </div>
                <div>
                  <label className="form-label">Substation:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.substation}
                    onChange={(e) => setField("substation", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Eqpt. Location:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.eqptLocation}
                    onChange={(e) => setField("eqptLocation", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">User:</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.user}
                    onChange={(e) => setField("user", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
              </div>
            </section>

            {/* Visual and Mechanical Inspection */}
            <section className="mb-6 visual-mechanical-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Visual and Mechanical Inspection
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed">
                  <colgroup>
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "70%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead className="bg-neutral-50 dark:bg-dark-150">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border border-neutral-300 dark:border-neutral-700">
                        NETA Section
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border border-neutral-300 dark:border-neutral-700">
                        Description
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border border-neutral-300 dark:border-neutral-700">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-100 divide-y divide-neutral-200 dark:divide-neutral-700">
                    {formData.visualMechanical.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-700">
                          {item.id}
                        </td>
                        <td className="px-3 py-2 text-sm text-neutral-900 dark:text-white whitespace-normal break-words border border-neutral-300 dark:border-neutral-700">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 border border-neutral-300 dark:border-neutral-700">
                          <select
                            value={item.result}
                            onChange={(e) =>
                              handleVisualMechanicalChange(idx, e.target.value)
                            }
                            disabled={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-center ${!isEditing ? "bg-neutral-100 dark:bg-dark-150 cursor-not-allowed" : ""}`}
                          >
                            {visualMechanicalOptions.map((opt) => (
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
            </section>
            {/* Enclosure Data */}
            <section className="mb-6 enclosure-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Enclosure Data
              </h2>

              {/* On-screen form - hidden in print */}
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 ${isPrintMode ? "hidden" : ""} print:hidden enclosure-onscreen`}
              >
                <div>
                  <label className="form-label">Manufacturer</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.manufacturer}
                    onChange={(e) =>
                      setField("enclosure.manufacturer", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">System Voltage (V)</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.systemVoltage}
                    onChange={(e) =>
                      setField("enclosure.systemVoltage", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Catalog No.</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.catalogNo}
                    onChange={(e) =>
                      setField("enclosure.catalogNo", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Rated Voltage (V)</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.ratedVoltage}
                    onChange={(e) =>
                      setField("enclosure.ratedVoltage", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.serialNumber}
                    onChange={(e) =>
                      setField("enclosure.serialNumber", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Rated Current (A)</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.ratedCurrent}
                    onChange={(e) =>
                      setField("enclosure.ratedCurrent", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Series</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.series}
                    onChange={(e) =>
                      setField("enclosure.series", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">SCCR (kA)</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.aicRating}
                    onChange={(e) =>
                      setField("enclosure.aicRating", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.type}
                    onChange={(e) => setField("enclosure.type", e.target.value)}
                    readOnly={!isEditing}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="form-label">Phase Configuration</label>
                  <input
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    value={formData.enclosure.phaseConfiguration}
                    onChange={(e) =>
                      setField("enclosure.phaseConfiguration", e.target.value)
                    }
                    readOnly={!isEditing}
                  />
                </div>
              </div>
            </section>

            {/* Switch Data */}
            <section className="mb-6 switch-data-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Switch Data
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-neutral-300 dark:border-neutral-700">
                  <thead className="bg-neutral-50 dark:bg-dark-150">
                    <tr>
                      <th className="px-2 py-2 border">
                        Position / Identifier
                      </th>
                      <th className="px-2 py-2 border">Manufacturer</th>
                      <th className="px-2 py-2 border">Catalog No.</th>
                      <th className="px-2 py-2 border">Serial No.</th>
                      <th className="px-2 py-2 border">Type</th>
                      <th className="px-2 py-2 border text-center" colSpan={2}>
                        <div>Rated</div>
                        <div className="grid grid-cols-2">
                          <div className="border-t border-r border-neutral-300 dark:border-neutral-700 p-1">
                            Amperage
                          </div>
                          <div className="border-t border-neutral-300 dark:border-neutral-700 p-1">
                            Voltage
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.switches.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.position}
                            onChange={(e) =>
                              handlePositionChange(
                                "switches",
                                idx,
                                e.target.value,
                              )
                            }
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                            placeholder="Auto-populates to other tables"
                            title="Position auto-populates to Fuse, IR, and Contact tables"
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.manufacturer}
                            onChange={(e) => {
                              const next = [...formData.switches];
                              next[idx].manufacturer = e.target.value;
                              setField("switches", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.catalogNo}
                            onChange={(e) => {
                              const next = [...formData.switches];
                              next[idx].catalogNo = e.target.value;
                              setField("switches", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.serialNo}
                            onChange={(e) => {
                              const next = [...formData.switches];
                              next[idx].serialNo = e.target.value;
                              setField("switches", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.type}
                            onChange={(e) => {
                              const next = [...formData.switches];
                              next[idx].type = e.target.value;
                              setField("switches", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.ratedAmperage}
                            onChange={(e) => {
                              const next = [...formData.switches];
                              next[idx].ratedAmperage = e.target.value;
                              setField("switches", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.ratedVoltage}
                            onChange={(e) => {
                              const next = [...formData.switches];
                              next[idx].ratedVoltage = e.target.value;
                              setField("switches", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-neutral-500 mt-1">
                  * Position/Identifier entered here will auto-populate to Fuse
                  Data, Insulation Resistance, and Contact Resistance tables
                </p>
              </div>
            </section>

            {/* Fuse Data */}
            <section className="mb-6 fuse-data-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Fuse Data
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-neutral-300 dark:border-neutral-700">
                  <thead className="bg-neutral-50 dark:bg-dark-150">
                    <tr>
                      <th className="px-2 py-2 border">
                        Position / Identifier
                      </th>
                      <th className="px-2 py-2 border">Manufacturer</th>
                      <th className="px-2 py-2 border">Catalog No.</th>
                      <th className="px-2 py-2 border">Class</th>
                      <th className="px-2 py-2 border text-center" colSpan={3}>
                        <div>Rated</div>
                        <div className="grid grid-cols-3">
                          <div className="border-t border-r border-neutral-300 dark:border-neutral-700 p-1">
                            Amperage
                          </div>
                          <div className="border-t border-r border-neutral-300 dark:border-neutral-700 p-1">
                            AIC
                          </div>
                          <div className="border-t border-neutral-300 dark:border-neutral-700 p-1">
                            Voltage
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.fuses.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.position}
                            readOnly
                            className="w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm bg-neutral-100 dark:bg-dark-150"
                            title="Auto-populated from Switch Data"
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.manufacturer}
                            onChange={(e) => {
                              const next = [...formData.fuses];
                              next[idx].manufacturer = e.target.value;
                              setField("fuses", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.catalogNo}
                            onChange={(e) => {
                              const next = [...formData.fuses];
                              next[idx].catalogNo = e.target.value;
                              setField("fuses", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.fuseClass}
                            onChange={(e) => {
                              const next = [...formData.fuses];
                              next[idx].fuseClass = e.target.value;
                              setField("fuses", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.amperage}
                            onChange={(e) => {
                              const next = [...formData.fuses];
                              next[idx].amperage = e.target.value;
                              setField("fuses", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.aic}
                            onChange={(e) => {
                              const next = [...formData.fuses];
                              next[idx].aic = e.target.value;
                              setField("fuses", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 border">
                          <input
                            type="text"
                            value={row.voltage}
                            onChange={(e) => {
                              const next = [...formData.fuses];
                              next[idx].voltage = e.target.value;
                              setField("fuses", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Electrical Tests - Measured Insulation Resistance Values */}
            <section className="mb-6 insulation-measured-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Electrical Tests - Measured Insulation Resistance Values
                </h2>
                <div className="mb-2 flex items-center gap-4">
                  <div className="flex items-center">
                    <label className="mr-2 text-sm">Test Voltage:</label>
                    <select
                      value={formData.irTestVoltage}
                      onChange={(e) =>
                        setField("irTestVoltage", e.target.value)
                      }
                      disabled={!isEditing}
                      className={`w-28 rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    >
                      {[
                        "250V",
                        "500V",
                        "1000V",
                        "2500V",
                        "5000V",
                        "10000V",
                      ].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className="mr-2 text-sm">Units:</label>
                    <select
                      value={formData.irUnits}
                      onChange={(e) => setField("irUnits", e.target.value)}
                      disabled={!isEditing}
                      className={`w-20 rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                    >
                      {["MΩ", "GΩ", "TΩ"].map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isEditing && (
                    <div className="flex items-center gap-2">
                      {applyIrReading ? (
                        <>
                          <span className="text-sm text-amber-600 dark:text-amber-400">
                            Click rows to apply {applyIrReading}
                          </span>
                          <button
                            type="button"
                            onClick={() => setApplyIrReading(null)}
                            className="px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-150 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm"
                          >
                            Done
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setApplyIrReading(">2200")}
                          className="px-3 py-1.5 rounded-md border border-[#f26722] bg-[#f26722] text-white hover:bg-[#e55c1a] text-sm font-medium"
                        >
                          Add &gt;2200
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-neutral-300 dark:border-neutral-700 text-sm">
                  <thead>
                    <tr>
                      <th
                        className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150"
                        rowSpan={2}
                      >
                        Position
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={3}
                      >
                        Pole to Pole (closed)
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={3}
                      >
                        Pole to Neutral (closed)
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={4}
                      >
                        Pole & Neutral to Ground (closed)
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={3}
                      >
                        Line to Load (open)
                      </th>
                      {applyIrReading && (
                        <th
                          className="border px-1 py-1 text-center bg-amber-50 dark:bg-amber-900/30"
                          rowSpan={2}
                          title={`Apply ${applyIrReading}`}
                        >
                          {applyIrReading}
                        </th>
                      )}
                    </tr>
                    <tr className="bg-neutral-50 dark:bg-dark-150 text-xs">
                      <th className="border px-1 py-1 text-center">P1-P2</th>
                      <th className="border px-1 py-1 text-center">P2-P3</th>
                      <th className="border px-1 py-1 text-center">P3-P1</th>
                      <th className="border px-1 py-1 text-center">P1-N</th>
                      <th className="border px-1 py-1 text-center">P2-N</th>
                      <th className="border px-1 py-1 text-center">P3-N</th>
                      <th className="border px-1 py-1 text-center">P1-G</th>
                      <th className="border px-1 py-1 text-center">P2-G</th>
                      <th className="border px-1 py-1 text-center">P3-G</th>
                      <th className="border px-1 py-1 text-center">N-G</th>
                      <th className="border px-1 py-1 text-center">P1</th>
                      <th className="border px-1 py-1 text-center">P2</th>
                      <th className="border px-1 py-1 text-center">P3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.irMeasured.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={() =>
                          applyIrReading && applyReadingToIrRow(idx)
                        }
                        className={
                          applyIrReading
                            ? "cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            : undefined
                        }
                        title={
                          applyIrReading
                            ? `Click to apply ${applyIrReading} to this row`
                            : undefined
                        }
                      >
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-0`}
                            value={row.position}
                            readOnly
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 0)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm bg-neutral-100 dark:bg-dark-150 text-sm ${applyIrReading ? "pointer-events-none" : ""}`}
                            title="Auto-populated from Switch Data"
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-1`}
                            value={row.p1p2}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p1p2 = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 1)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-2`}
                            value={row.p2p3}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p2p3 = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 2)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-3`}
                            value={row.p3p1}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p3p1 = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 3)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-4`}
                            value={row.p1n}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p1n = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 4)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-5`}
                            value={row.p2n}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p2n = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 5)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-6`}
                            value={row.p3n}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p3n = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 6)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-7`}
                            value={row.p1g}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p1g = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 7)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-8`}
                            value={row.p2g}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p2g = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 8)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-9`}
                            value={row.p3g}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].p3g = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 9)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-10`}
                            value={row.ng}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].ng = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 10)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-11`}
                            value={row.l2l_p1}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].l2l_p1 = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 11)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-12`}
                            value={row.l2l_p2}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].l2l_p2 = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 12)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        <td
                          className={`border px-1 py-1 ${applyIrReading ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="text"
                            data-ir-pos={`${idx}-13`}
                            value={row.l2l_p3}
                            onChange={(e) => {
                              const next = [...formData.irMeasured];
                              next[idx].l2l_p3 = e.target.value;
                              setField("irMeasured", next);
                            }}
                            readOnly={!isEditing}
                            onKeyDown={(e) =>
                              handleIrMeasuredKeyDown(e, idx, 13)
                            }
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm text-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${applyIrReading ? "pointer-events-none" : ""}`}
                          />
                        </td>
                        {applyIrReading && (
                          <td
                            className="border px-1 py-1 text-center bg-amber-50/50 dark:bg-amber-900/20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  row.p1p2 === applyIrReading &&
                                  row.p2p3 === applyIrReading &&
                                  row.p3p1 === applyIrReading &&
                                  row.p1n === applyIrReading &&
                                  row.p2n === applyIrReading &&
                                  row.p3n === applyIrReading &&
                                  row.p1g === applyIrReading &&
                                  row.p2g === applyIrReading &&
                                  row.p3g === applyIrReading &&
                                  row.ng === applyIrReading &&
                                  row.l2l_p1 === applyIrReading &&
                                  row.l2l_p2 === applyIrReading &&
                                  row.l2l_p3 === applyIrReading
                                }
                                onChange={(e) =>
                                  e.target.checked
                                    ? applyReadingToIrRow(idx)
                                    : clearIrRow(idx)
                                }
                                className="rounded border-neutral-400 text-[#f26722] focus:ring-[#f26722]"
                                title={`Apply ${applyIrReading} to this row`}
                              />
                              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                                Apply
                              </span>
                            </label>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Electrical Tests - Temperature Corrected Insulation Resistance Values */}
            <section className="mb-6 insulation-corrected-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Electrical Tests - Temperature Corrected Insulation Resistance
                Values
              </h2>
              <div className="mb-2 text-sm text-neutral-700 dark:text-neutral-300">
                Corrected values are auto-calculated as Measured × TCF. Units:{" "}
                {formData.irUnits}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-neutral-300 dark:border-neutral-700 text-sm">
                  <thead>
                    <tr>
                      <th
                        className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150"
                        rowSpan={2}
                      >
                        Position
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={3}
                      >
                        Pole to Pole (closed)
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={3}
                      >
                        Pole to Neutral (closed)
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={4}
                      >
                        Pole & Neutral to Ground (closed)
                      </th>
                      <th
                        className="border px-1 py-1 text-center bg-neutral-50 dark:bg-dark-150"
                        colSpan={3}
                      >
                        Line to Load (open)
                      </th>
                    </tr>
                    <tr className="bg-neutral-50 dark:bg-dark-150 text-xs">
                      <th className="border px-1 py-1 text-center">P1-P2</th>
                      <th className="border px-1 py-1 text-center">P2-P3</th>
                      <th className="border px-1 py-1 text-center">P3-P1</th>
                      <th className="border px-1 py-1 text-center">P1-N</th>
                      <th className="border px-1 py-1 text-center">P2-N</th>
                      <th className="border px-1 py-1 text-center">P3-N</th>
                      <th className="border px-1 py-1 text-center">P1-G</th>
                      <th className="border px-1 py-1 text-center">P2-G</th>
                      <th className="border px-1 py-1 text-center">P3-G</th>
                      <th className="border px-1 py-1 text-center">N-G</th>
                      <th className="border px-1 py-1 text-center">P1</th>
                      <th className="border px-1 py-1 text-center">P2</th>
                      <th className="border px-1 py-1 text-center">P3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.irCorrected.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border px-1 py-1">
                          <input
                            type="text"
                            value={row.position}
                            readOnly
                            className="w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm bg-neutral-100 dark:bg-dark-150 text-sm"
                          />
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p1p2}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p2p3}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p3p1}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p1n}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p2n}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p3n}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p1g}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p2g}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.p3g}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.ng}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.l2l_p1}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.l2l_p2}
                        </td>
                        <td className="border px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-sm">
                          {row.l2l_p3}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Electrical Tests - Contact Resistance */}
            <section className="mb-6 contact-resistance-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                  Electrical Tests - Contact Resistance
                </h2>
                <div className="mb-2 flex items-center">
                  <label className="mr-2 text-sm">Units:</label>
                  <select
                    value={formData.contactUnits}
                    onChange={(e) => setField("contactUnits", e.target.value)}
                    disabled={!isEditing}
                    className={`w-20 rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  >
                    {["mΩ", "µΩ"].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-neutral-300 dark:border-neutral-700">
                  <thead>
                    <tr>
                      <th className="border px-2 py-2" rowSpan={2}>
                        Position
                      </th>
                      <th className="border px-2 py-2 text-center" colSpan={3}>
                        Switch
                      </th>
                      <th className="border px-2 py-2 text-center" colSpan={3}>
                        Fuse
                      </th>
                      <th className="border px-2 py-2 text-center" colSpan={3}>
                        Switch + Fuse
                      </th>
                    </tr>
                    <tr className="bg-neutral-50 dark:bg-dark-150">
                      <th className="border px-2 py-2 text-center">P1</th>
                      <th className="border px-2 py-2 text-center">P2</th>
                      <th className="border px-2 py-2 text-center">P3</th>
                      <th className="border px-2 py-2 text-center">P1</th>
                      <th className="border px-2 py-2 text-center">P2</th>
                      <th className="border px-2 py-2 text-center">P3</th>
                      <th className="border px-2 py-2 text-center">P1</th>
                      <th className="border px-2 py-2 text-center">P2</th>
                      <th className="border px-2 py-2 text-center">P3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.contact.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.position}
                            readOnly
                            className="w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm bg-neutral-100 dark:bg-dark-150"
                            title="Auto-populated from Switch Data"
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.sw_p1}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].sw_p1 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.sw_p2}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].sw_p2 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.sw_p3}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].sw_p3 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.fu_p1}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].fu_p1 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.fu_p2}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].fu_p2 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.fu_p3}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].fu_p3 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.sf_p1}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].sf_p1 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.sf_p2}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].sf_p2 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          <input
                            type="text"
                            value={row.sf_p3}
                            onChange={(e) => {
                              const next = [...formData.contact];
                              next[idx].sf_p3 = e.target.value;
                              setField("contact", next);
                            }}
                            readOnly={!isEditing}
                            className={`w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Test Equipment Used */}
            <section className="mb-6 test-equipment-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Test Equipment Used
              </h2>

              {/* On-screen form - hidden in print */}
              <div
                className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${isPrintMode ? "hidden" : ""} print:hidden test-eqpt-onscreen`}
              >
                <div>
                  <label className="form-label">Megohmmeter</label>
                  <EquipmentAutocomplete
                    value={formData.equipment.megger}
                    onChange={(value) => setField("equipment.megger", value)}
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
                      setField("equipment.megger", equipment.equipment_name);
                      setField(
                        "equipment.meggerSerial",
                        equipment.serial_number || "",
                      );
                      setField("equipment.meggerAmpId", equipment.amp_id || "");
                      setField(
                        "equipment.meggerCalDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number</label>
                  <input
                    value={formData.equipment.meggerSerial}
                    onChange={(e) =>
                      setField("equipment.meggerSerial", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">AMP ID</label>
                  <input
                    value={formData.equipment.meggerAmpId}
                    onChange={(e) =>
                      setField("equipment.meggerAmpId", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Cal Date</label>
                  <input
                    value={formData.equipment.meggerCalDate}
                    onChange={(e) =>
                      setField("equipment.meggerCalDate", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Low Resistance</label>
                  <EquipmentAutocomplete
                    value={formData.equipment.lowRes}
                    onChange={(value) => setField("equipment.lowRes", value)}
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
                      setField("equipment.lowRes", equipment.equipment_name);
                      setField(
                        "equipment.lowResSerial",
                        equipment.serial_number || "",
                      );
                      setField("equipment.lowResAmpId", equipment.amp_id || "");
                      setField(
                        "equipment.lowResCalDate",
                        formatLocalDateShort(equipment.calibration_date),
                      );
                    }}
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number</label>
                  <input
                    value={formData.equipment.lowResSerial}
                    onChange={(e) =>
                      setField("equipment.lowResSerial", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">AMP ID</label>
                  <input
                    value={formData.equipment.lowResAmpId}
                    onChange={(e) =>
                      setField("equipment.lowResAmpId", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
                <div>
                  <label className="form-label">Cal Date</label>
                  <input
                    value={formData.equipment.lowResCalDate}
                    onChange={(e) =>
                      setField("equipment.lowResCalDate", e.target.value)
                    }
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""}`}
                  />
                </div>
              </div>
            </section>

            {/* Comments */}
            <section className="mb-6 comments-section print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
                Comments
              </h2>

              {/* On-screen form - hidden in print */}
              <textarea
                value={formData.comments}
                onChange={(e) => setField("comments", e.target.value)}
                readOnly={!isEditing}
                rows={4}
                className={`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditing ? "bg-neutral-100 dark:bg-dark-150" : ""} ${isPrintMode ? "hidden" : ""} print:hidden comments-onscreen`}
              />
            </section>
          </div>
        </div>
      )}
    </ReportWrapper>
  );
};

export default LowVoltageSwitchMultiDeviceTest;

// Print styles (scoped)
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    /* Hide number input arrows globally (screen + print) */
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
    input[type="number"] { -moz-appearance: textfield !important; }

    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      * { color: black !important; }
      header, nav, .navigation, [class*="nav"], [class*="header"], .sticky, [class*="sticky"], .print\\:hidden { display: none !important; }
      button:not(.print-visible) { display: none !important; }

      table { border-collapse: collapse; width: 100% !important; table-layout: fixed !important; }
      th, td { border: 1px solid black !important; padding: 2px 3px !important; font-size: 8px !important; line-height: 1.05 !important; vertical-align: middle !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }

      /* Visual & Mechanical: match on-screen layout exactly */
      .visual-mechanical-section .visual-inspection-table { table-layout: fixed !important; }
      .visual-mechanical-section .visual-inspection-table col:nth-child(1) { width: 25% !important; }
      .visual-mechanical-section .visual-inspection-table col:nth-child(n+2):nth-child(-n+13) { width: 6.25% !important; }
      .visual-mechanical-section .visual-inspection-table th,
      .visual-mechanical-section .visual-inspection-table td {
        text-align: center !important;
        padding: 2px 3px !important;
        font-size: 8px !important;
        line-height: 1 !important;
        height: 12px !important;
      }
      .visual-mechanical-section .visual-inspection-table td:first-child,
      .visual-mechanical-section .visual-inspection-table th:first-child { text-align: left !important; }

      /* Keep legend tight and aligned to the right of the table */
      .visual-mechanical-section .satisfactory-table { width: auto !important; }
      .visual-mechanical-section .satisfactory-table th,
      .visual-mechanical-section .satisfactory-table td { font-size: 8px !important; padding: 2px 3px !important; line-height: 1 !important; }

      /* Remove internal vertical dividing line artifacts in print */
      .visual-mechanical-section .visual-inspection-table td,
      .visual-mechanical-section .visual-inspection-table th { border-color: black !important; }

      /* Hide form controls in V&M cells during print to avoid duplicate letters */
      .visual-mechanical-section select { display: none !important; }

      /* Show the selected values in print by making them visible */
      .visual-mechanical-section .visual-inspection-table tbody td:nth-child(n+2) {
        color: black !important;
        text-align: center !important;
        font-size: 8px !important;
        font-weight: bold !important;
      }

      /* Show Position/Identifier values in print */
      .visual-mechanical-section .visual-inspection-table tbody td:first-child {
        color: black !important;
        text-align: left !important;
        font-size: 8px !important;
        font-weight: bold !important;
      }

      /* Make input values visible in print by overriding the display:none */
      .visual-mechanical-section .visual-inspection-table tbody td:first-child input[type="text"] {
        display: block !important;
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        font-size: 8px !important;
        font-weight: bold !important;
        color: black !important;
        width: 100% !important;
      }

      /* Insulation tables: exact column widths */
      /* Make Position/Identifier smaller to spread readings */
      .insulation-measured-section table { table-layout: fixed !important; }
      .insulation-corrected-section table { table-layout: fixed !important; }
      .insulation-measured-section table col:nth-child(1),
      .insulation-corrected-section table col:nth-child(1) { width: 12% !important; }
      .insulation-measured-section table col:nth-child(n+2):nth-child(-n+10),
      .insulation-corrected-section table col:nth-child(n+2):nth-child(-n+10) { width: 9% !important; }
      .insulation-measured-section table col:nth-child(11),
      .insulation-corrected-section table col:nth-child(11) { width: 7% !important; }

      /* Print-only IR tables: each table sets its own colgroup widths */
      .ir-print-table { table-layout: fixed !important; width: 100% !important; }
      .ir-print-table th, .ir-print-table td {
        font-size: 7.5px !important;
        padding: 2px 3px !important;
        line-height: 1.1 !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        white-space: normal !important;
      }

      /* Switch Data: shrink first col, redistribute others */
      .switch-data-section table { table-layout: fixed !important; }
      .switch-data-section table th:first-child,
      .switch-data-section table td:first-child { width: 12% !important; text-align: left !important; }
      .switch-data-section table th:nth-child(2), .switch-data-section table td:nth-child(2) { width: 16% !important; }
      .switch-data-section table th:nth-child(3), .switch-data-section table td:nth-child(3) { width: 14% !important; }
      .switch-data-section table th:nth-child(4), .switch-data-section table td:nth-child(4) { width: 14% !important; }
      .switch-data-section table th:nth-child(5), .switch-data-section table td:nth-child(5) { width: 10% !important; }
      .switch-data-section table th:nth-child(6), .switch-data-section table td:nth-child(6) { width: 17% !important; }
      .switch-data-section table th:nth-child(7), .switch-data-section table td:nth-child(7) { width: 17% !important; }

      /* Fuse Data: shrink first col, redistribute */
      .fuse-data-section table { table-layout: fixed !important; }
      .fuse-data-section table th:first-child,
      .fuse-data-section table td:first-child { width: 12% !important; text-align: left !important; }
      .fuse-data-section table th:nth-child(2), .fuse-data-section table td:nth-child(2) { width: 14% !important; }
      .fuse-data-section table th:nth-child(3), .fuse-data-section table td:nth-child(3) { width: 12% !important; }
      .fuse-data-section table th:nth-child(4), .fuse-data-section table td:nth-child(4) { width: 8% !important; }
      .fuse-data-section table th:nth-child(5), .fuse-data-section table td:nth-child(5) { width: 18% !important; }
      .fuse-data-section table th:nth-child(6), .fuse-data-section table td:nth-child(6) { width: 18% !important; }
      .fuse-data-section table th:nth-child(7), .fuse-data-section table td:nth-child(7) { width: 18% !important; }

      /* Contact Resistance (11 columns: Pos + 9 readings + Units) */
      .contact-resistance-section table { table-layout: fixed !important; width: 100% !important; }
      .contact-resistance-section table th:first-child,
      .contact-resistance-section table td:first-child { width: 6% !important; text-align: left !important; }
      /* Reading columns (2..10) expanded further */
      .contact-resistance-section table th:nth-child(2), .contact-resistance-section table td:nth-child(2) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(3), .contact-resistance-section table td:nth-child(3) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(4), .contact-resistance-section table td:nth-child(4) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(5), .contact-resistance-section table td:nth-child(5) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(6), .contact-resistance-section table td:nth-child(6) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(7), .contact-resistance-section table td:nth-child(7) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(8), .contact-resistance-section table td:nth-child(8) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(9), .contact-resistance-section table td:nth-child(9) { width: 9.89% !important; }
      .contact-resistance-section table th:nth-child(10), .contact-resistance-section table td:nth-child(10) { width: 9.89% !important; }
      /* Units column pinned far right and narrower */
      .contact-resistance-section table th:nth-child(11), .contact-resistance-section table td:nth-child(11) { width: 5% !important; }
      /* Center readings */
      .contact-resistance-section table th:nth-child(n+2):nth-child(-n+10),
      .contact-resistance-section table td:nth-child(n+2):nth-child(-n+10) { text-align: center !important; }

      /* NETA Reference: larger font, section on far left, description spans */
      .neta-reference-section table { table-layout: fixed !important; width: 100% !important; }
      .neta-reference-section table th:first-child,
      .neta-reference-section table td:first-child { width: 10% !important; text-align: left !important; }
      .neta-reference-section table th:nth-child(2),
      .neta-reference-section table td:nth-child(2) { width: 90% !important; text-align: left !important; }
      .neta-reference-section table th, .neta-reference-section table td {
        font-size: 14px !important;
        line-height: 1.25 !important;
        padding: 4px 6px !important;
        white-space: normal !important;
        word-break: break-word !important;
      }

      input:not([type="checkbox"]):not([type="radio"]), select, textarea {
        background-color: white !important; border: 1px solid black !important; color: black !important;
        padding: 2px !important; font-size: 10px !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important;
      }
      select { background-image: none !important; padding-right: 8px !important; }
      /* Screen/print visibility helpers */
      .screen-only { display: inline; }
      .print-only { display: none; }
      @media print {
        .screen-only { display: none !important; }
        .print-only { display: inline !important; }
      }

      /* Force layout for Visual & Mechanical section in print */
      @media print {
        .visual-mechanical-section .overflow-x-auto { overflow: visible !important; }
        .visual-mechanical-section .flex { display: grid !important; grid-template-columns: 1fr 140px !important; column-gap: 12px !important; align-items: start !important; }
        .visual-mechanical-section .flex > .flex-grow { width: 100% !important; }
        .visual-mechanical-section .satisfactory-table { width: 140px !important; }
        .visual-mechanical-section .visual-inspection-table { width: 100% !important; }
      }

      .insulation-measured-section table input,
      .insulation-corrected-section table input { width: 100% !important; font-size: 9px !important; padding: 1px !important; }

      /* Hide on-screen elements in print */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      .enclosure-onscreen, .enclosure-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .comments-onscreen, .comments-onscreen * { display: none !important; }

      /* Enclosure Data print table styling */
      .enclosure-section table { table-layout: fixed !important; }
      .enclosure-section table th, .enclosure-section table td {
        font-size: 10px !important;
        line-height: 1.2 !important;
        padding: 4px 6px !important;
      }

      /* Test Equipment print table styling */
      .test-equipment-section table { table-layout: fixed !important; }
      .test-equipment-section table th, .test-equipment-section table td {
        font-size: 10px !important;
        line-height: 1.2 !important;
        padding: 4px 6px !important;
      }

      /* Comments print table styling */
      .comments-section table { table-layout: fixed !important; }
      .comments-section table th, .comments-section table td {
        font-size: 10px !important;
        line-height: 1.2 !important;
        padding: 4px 6px !important;
      }

      section { break-inside: avoid !important; margin-bottom: 20px !important; page-break-inside: avoid !important; }
      .grid { display: grid !important; }
      .flex { display: flex !important; }
    }
  `;
  document.head.appendChild(style);
}
