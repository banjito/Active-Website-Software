import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

// Temperature conversion and correction factor lookup tables (from PanelboardReport)
const tcfTable: { [key: string]: number } = {
  '-24': 0.054, '-23': 0.068, '-22': 0.082, '-21': 0.096, '-20': 0.11,
  '-19': 0.124, '-18': 0.138, '-17': 0.152, '-16': 0.166, '-15': 0.18,
  '-14': 0.194, '-13': 0.208, '-12': 0.222, '-11': 0.236, '-10': 0.25,
  '-9': 0.264, '-8': 0.278, '-7': 0.292, '-6': 0.306, '-5': 0.32,
  '-4': 0.336, '-3': 0.352, '-2': 0.368, '-1': 0.384, '0': 0.4,
  '1': 0.42, '2': 0.44, '3': 0.46, '4': 0.48, '5': 0.5,
  '6': 0.526, '7': 0.552, '8': 0.578, '9': 0.604, '10': 0.63,
  '11': 0.666, '12': 0.702, '13': 0.738, '14': 0.774, '15': 0.81,
  '16': 0.848, '17': 0.886, '18': 0.924, '19': 0.962, '20': 1,
  '21': 1.05, '22': 1.1, '23': 1.15, '24': 1.2, '25': 1.25,
  '26': 1.316, '27': 1.382, '28': 1.448, '29': 1.514, '30': 1.58,
  '31': 1.664, '32': 1.748, '33': 1.832, '34': 1.872, '35': 2,
  '36': 2.1, '37': 2.2, '38': 2.3, '39': 2.4, '40': 2.5,
  '41': 2.628, '42': 2.756, '43': 2.884, '44': 3.012, '45': 3.15,
  '46': 3.316, '47': 3.482, '48': 3.648, '49': 3.814, '50': 3.98,
  '51': 4.184, '52': 4.388, '53': 4.592, '54': 4.796, '55': 5,
  '56': 5.26, '57': 5.52, '58': 5.78, '59': 6.04, '60': 6.3,
  '61': 6.62, '62': 6.94, '63': 7.26, '64': 7.58, '65': 7.9,
  '66': 8.32, '67': 8.74, '68': 9.16, '69': 9.58, '70': 10,
  '71': 10.52, '72': 11.04, '73': 11.56, '74': 12.08, '75': 12.6,
  '76': 13.24, '77': 13.88, '78': 14.52, '79': 15.16, '80': 15.8,
  '81': 16.64, '82': 17.48, '83': 18.32, '84': 19.16, '85': 20,
  '86': 21.04, '87': 22.08, '88': 23.12, '89': 24.16, '90': 25.2,
  '91': 26.45, '92': 27.7, '93': 28.95, '94': 30.2, '95': 31.6,
  '96': 33.28, '97': 34.96, '98': 36.64, '99': 38.32, '100': 40,
  '101': 42.08, '102': 44.16, '103': 46.24, '104': 48.32, '105': 50.4,
  '106': 52.96, '107': 55.52, '108': 58.08, '109': 60.64, '110': 63.2
};

// Helper function to get TCF based on rounded Celsius (from PanelboardReport)
const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString(); // Use string key for lookup
  return tcfTable[key] !== undefined ? tcfTable[key] : 1; // Default to 1 if not found
};

// Dropdown options
// Updated Visual Inspection options
const visualInspectionResultsOptions = ["", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"];
const contactResistanceUnitsOptions = ["µΩ", "mΩ", "Ω"];
const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const insulationTestVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];
// Updated Pass/Fail/Limited Service options
const equipmentEvaluationResultOptions = ["PASS", "FAIL", "LIMITED SERVICE"];
// I²t Options
const i2tOptions = ["", "Yes", "No", "N/A"];
// Trip Unit Type options
const tripUnitTypeOptions = ["", "On", "Off", "In", "Out", "N/A"];
const tripTestingUnitsOptions = ["sec.", "cycles", "ms"]; // Example options

interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string; // Added based on image
  date: string;
  identifier: string; // Added based on image
  jobNumber: string;
  technicians: string;
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
    humidity: number; // Added based on image
  };
  substation: string; // Added based on image
  eqptLocation: string; // Added based on image

  // Nameplate Data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  frameSize: string; // Added based on image (A)
  icRating: string; // Added based on image (kA)
  tripUnitType: string; // Use tripUnitTypeOptions
  ratingPlug: string; // Added based on image (A)
  curveNo: string; // Added based on image
  chargeMotorVoltage: string; // Added based on image
  operation: string; // Added based on image
  mounting: string; // Added based on image
  zoneInterlock: string; // Added based on image
  thermalMemory: string; // Added based on image

  // Visual and Mechanical Inspection
  visualInspectionItems: {
    id: string; // NETA Section
    description: string;
    result: string; // Dropdown: Y, N, N/A
  }[];

  // Device Settings
  deviceSettings: {
    asFound: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    asLeft: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
  };

  // Electrical Tests - Contact/Pole Resistance
  contactResistance: {
    p1: string;
    p2: string;
    p3: string;
    unit: string; // Dropdown: µΩ, mΩ, Ω
  };

  // Electrical Tests - Insulation Resistance
  insulationResistance: {
    testVoltage: string; // Dropdown: 1000V, etc.
    unit: string; // Dropdown: MΩ, kΩ
    measured: {
      poleToPole: { p1p2: string; p2p3: string; p3p1: string; };
      poleToFrame: { p1: string; p2: string; p3: string; };
      lineToLoad: { p1: string; p2: string; p3: string; };
    };
    corrected: {
      poleToPole: { p1p2: string; p2p3: string; p3p1: string; };
      poleToFrame: { p1: string; p2: string; p3: string; };
      lineToLoad: { p1: string; p2: string; p3: string; };
    };
  };

  // Electrical Tests - Primary Injection (Replaced Trip Testing)
  primaryInjection: {
    testedSettings: { // Reuse testedSettings structure for the top table
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    results: { // Updated structure for the exact layout provided
      longTime: { 
        ratedAmperes1: string; 
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
      shortTime: { 
        ratedAmperes1: string;
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
      instantaneous: { 
        ratedAmperes1: string;
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
      groundFault: { 
        ratedAmperes1: string;
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
    };
  };

  // Test Equipment Used
  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string };
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string };
    primaryInjectionTestSet: { name: string; serialNumber: string; ampId: string }; // Changed from secondary
  };

  // Comments
  comments: string;

  // Status (PASS/FAIL) - Added based on standard report structure
  status: string;
}

// Define tableStyles based on MediumVoltageSwitchOilReport.tsx
const tableStyles = {
  container: "w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700",
  table: "w-full min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700",
  headerCell: "px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-normal",
  cell: "px-2 py-2 text-sm text-gray-900 dark:text-white whitespace-normal",
  input: "w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white",
  select: "w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
};

// Rename component
const LowVoltageCircuitBreakerElectronicTripATSReport: React.FC = () => {
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
  const reportSlug = 'low-voltage-circuit-breaker-electronic-trip-ats-report'; // This component handles the low-voltage-circuit-breaker-electronic-trip-ats-report route
  const reportName = getReportName(reportSlug);
  // Update initial state to match the new FormData structure
  const [formData, setFormData] = useState<FormData>({
    // Initialize with default values based on FormData interface
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
    substation: '',
    eqptLocation: '',
    manufacturer: '',
    catalogNumber: '',
    serialNumber: '',
    type: '',
    frameSize: '',
    icRating: '',
    tripUnitType: '', // Initialize tripUnitType
    ratingPlug: '',
    curveNo: '',
    chargeMotorVoltage: '',
    operation: '',
    mounting: '',
    zoneInterlock: '',
    thermalMemory: '',
    visualInspectionItems: [
      { id: '7.6.1.2.A.1', description: 'Compare equipment nameplate data with drawings and specifications.', result: '' },
      { id: '7.6.1.2.A.2', description: 'Inspect physical and mechanical condition.', result: '' },
      { id: '7.6.1.2.A.3', description: 'Inspect anchorage and alignment.', result: '' },
      { id: '7.6.1.2.A.4', description: 'Verify that all maintenance devices are available for servicing and operating the breaker.', result: '' },
      { id: '7.6.1.2.A.5', description: 'Verify the unit is clean.', result: '' },
      { id: '7.6.1.2.A.6', description: 'Verify the arc chutes are intact.', result: '' },
      { id: '7.6.1.2.A.7', description: 'Inspect moving and stationary contacts for condition and alignment.', result: '' },
      { id: '7.6.1.2.A.8', description: 'Verify that primary and secondary contact wipe and other dimensions vital to satisfactory operation of the breaker are correct.', result: '' },
      { id: '7.6.1.2.A.9', description: 'Perform all mechanical operator and contact alignment tests on both the breaker and its operating mechanism in accordance with manufacturer\'s published data.', result: '' },
      { id: '7.6.1.2.A.10.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.6.1.2.B.1.', result: '' },
      { id: '7.6.1.2.A.11', description: 'Verify cell fit and element alignment.', result: '' },
      { id: '7.6.1.2.A.12', description: 'Verify racking mechanism operation.', result: '' },
      { id: '7.6.1.2.A.13', description: 'Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: '' },
      { id: '7.6.1.2.A.14', description: 'Perform adjustments for final protective device settings in accordance with coordination study provided by end user.', result: '' }
    ],
    deviceSettings: {
      asFound: {
        longTime: { setting: '', delay: '', i2t: 'N/A' }, // Default I2t for Long Time
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: 'N/A' }, // Default I2t for Instantaneous
        groundFault: { setting: '', delay: '', i2t: '' }
      },
      asLeft: {
        longTime: { setting: '', delay: '', i2t: 'N/A' }, // Default I2t for Long Time
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: 'N/A' }, // Default I2t for Instantaneous
        groundFault: { setting: '', delay: '', i2t: '' }
      }
    },
    contactResistance: { p1: '', p2: '', p3: '', unit: 'µΩ' },
    insulationResistance: {
      testVoltage: '1000V', unit: 'MΩ',
      measured: {
        poleToPole: { p1p2: '', p2p3: '', p3p1: '' },
        poleToFrame: { p1: '', p2: '', p3: '' },
        lineToLoad: { p1: '', p2: '', p3: '' }
      },
      corrected: {
        poleToPole: { p1p2: '', p2p3: '', p3p1: '' },
        poleToFrame: { p1: '', p2: '', p3: '' },
        lineToLoad: { p1: '', p2: '', p3: '' }
      }
    },
    // Initialize Primary Injection with updated structure
    primaryInjection: {
      testedSettings: {
        longTime: { setting: '', delay: '', i2t: '2' },
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: 'N/A' },
        groundFault: { setting: '', delay: '', i2t: '' }
      },
      results: {
        longTime: {
          ratedAmperes1: '',
          ratedAmperes2: '',
          multiplier: '300%',
          toleranceMin: '-10%',
          toleranceMax: '10%',
          testAmperes1: '',
          testAmperes2: '',
          toleranceMin1: '',
          toleranceMin2: '',
          toleranceMax1: '',
          toleranceMax2: '',
          pole1: { sec: '', a: '' },
          pole2: { sec: '', a: '' },
          pole3: { sec: '', a: '' },
        },
        shortTime: {
          ratedAmperes1: '',
          ratedAmperes2: '',
          multiplier: '110%',
          toleranceMin: '-10%',
          toleranceMax: '10%',
          testAmperes1: '',
          testAmperes2: '',
          toleranceMin1: '',
          toleranceMin2: '',
          toleranceMax1: '',
          toleranceMax2: '',
          pole1: { sec: '', a: '' },
          pole2: { sec: '', a: '' },
          pole3: { sec: '', a: '' },
        },
        instantaneous: {
          ratedAmperes1: '',
          ratedAmperes2: '',
          multiplier: '',
          toleranceMin: '-20%',
          toleranceMax: '20%',
          testAmperes1: '',
          testAmperes2: '',
          toleranceMin1: '',
          toleranceMin2: '',
          toleranceMax1: '',
          toleranceMax2: '',
          pole1: { sec: '', a: '' },
          pole2: { sec: '', a: '' },
          pole3: { sec: '', a: '' },
        },
        groundFault: {
          ratedAmperes1: '',
          ratedAmperes2: '',
          multiplier: '110%',
          toleranceMin: '-15%',
          toleranceMax: '15%',
          testAmperes1: '',
          testAmperes2: '',
          toleranceMin1: '',
          toleranceMin2: '',
          toleranceMax1: '',
          toleranceMax2: '',
          pole1: { sec: '', a: '' },
          pole2: { sec: '', a: '' },
          pole3: { sec: '', a: '' },
        },
      },
    },
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
      primaryInjectionTestSet: { name: '', serialNumber: '', ampId: '' } // Changed
    },
    comments: '',
    status: 'PASS', // Default status
  });

  // --- Load Job Info (from PanelboardReport) ---
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
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
          customer: customerName, // Use "customer" field in FormData
          address: customerAddress, // Use "address" field in FormData
          // We might need jobTitle later, keep it in mind
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      alert(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!reportId) {
        setLoading(false); // Only stop loading if it's a new report
      }
    }
  };

  // --- Load Report ---
  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      // First try loading from the normalized JSONB store
      const { data: generic, error: genericErr } = await supabase
        .schema('neta_ops')
        .from('low_voltage_cable_test_3sets')
        .select('*')
        .eq('id', reportId)
        .single();

      if (generic && generic.data) {
        const d = generic.data as any;
        setFormData(prev => {
          const updated = {
            ...prev,
            // Job info
            customer: d.reportInfo?.customer ?? prev.customer,
            address: d.reportInfo?.address ?? prev.address,
            user: d.reportInfo?.userName ?? prev.user,
            date: d.reportInfo?.date ?? prev.date,
            identifier: d.reportInfo?.identifier ?? prev.identifier,
            jobNumber: d.reportInfo?.jobNumber ?? prev.jobNumber,
            technicians: d.reportInfo?.technicians ?? prev.technicians,
            temperature: {
              ...prev.temperature,
              fahrenheit: d.reportInfo?.temperature?.fahrenheit ?? prev.temperature.fahrenheit,
              celsius: d.reportInfo?.temperature?.celsius ?? prev.temperature.celsius,
              tcf: d.reportInfo?.temperature?.correctionFactor ?? prev.temperature.tcf,
              humidity: d.reportInfo?.humidity ?? prev.temperature.humidity,
            },
            substation: d.reportInfo?.substation ?? prev.substation,
            eqptLocation: d.reportInfo?.eqptLocation ?? prev.eqptLocation,

            // Nameplate
            manufacturer: d.nameplateData?.manufacturer ?? prev.manufacturer,
            catalogNumber: d.nameplateData?.catalogNumber ?? prev.catalogNumber,
            serialNumber: d.nameplateData?.serialNumber ?? prev.serialNumber,
            type: d.nameplateData?.type ?? prev.type,
            frameSize: d.nameplateData?.frameSize ?? prev.frameSize,
            icRating: d.nameplateData?.icRating ?? prev.icRating,
            tripUnitType: d.nameplateData?.tripUnitType ?? prev.tripUnitType,
            ratingPlug: d.nameplateData?.ratingPlug ?? prev.ratingPlug,
            curveNo: d.nameplateData?.curveNo ?? prev.curveNo,
            chargeMotorVoltage: d.nameplateData?.chargeMotorVoltage ?? prev.chargeMotorVoltage,
            operation: d.nameplateData?.operation ?? prev.operation,
            mounting: d.nameplateData?.mounting ?? prev.mounting,
            zoneInterlock: d.nameplateData?.zoneInterlock ?? prev.zoneInterlock,
            thermalMemory: d.nameplateData?.thermalMemory ?? prev.thermalMemory,

            // Visual/mechanical
            visualInspectionItems: prev.visualInspectionItems.map(item => ({
              ...item,
              result: (d.visualInspection && d.visualInspection[item.id]) ? d.visualInspection[item.id] : item.result,
            })),

            // Device settings
            deviceSettings: d.deviceSettings ?? prev.deviceSettings,

            // Contact resistance
            contactResistance: d.breakerContactResistance ? {
              ...prev.contactResistance,
              ...d.breakerContactResistance,
            } : prev.contactResistance,

            // Insulation resistance mapping from contactorInsulation
            insulationResistance: (() => {
              const ir = { ...prev.insulationResistance };
              const src = d.contactorInsulation;
              if (src) {
                ir.testVoltage = src.testVoltage ?? ir.testVoltage;
                const rows = Array.isArray(src.rows) ? src.rows : [];
                const findRow = (name: string) => rows.find((r: any) => typeof r.id === 'string' && r.id.toLowerCase().includes(name));
                const rowPTP = findRow('pole to pole');
                const rowPTF = findRow('pole to frame');
                const rowLTL = findRow('line to load');
                if (rowPTP) {
                  ir.measured.poleToPole = {
                    p1p2: rowPTP.p1 ?? ir.measured.poleToPole.p1p2,
                    p2p3: rowPTP.p2 ?? ir.measured.poleToPole.p2p3,
                    p3p1: rowPTP.p3 ?? ir.measured.poleToPole.p3p1,
                  };
                  ir.corrected.poleToPole = {
                    p1p2: rowPTP.p1c ?? ir.corrected.poleToPole.p1p2,
                    p2p3: rowPTP.p2c ?? ir.corrected.poleToPole.p2p3,
                    p3p1: rowPTP.p3c ?? ir.corrected.poleToPole.p3p1,
                  };
                }
                if (rowPTF) {
                  ir.measured.poleToFrame = {
                    p1: rowPTF.p1 ?? ir.measured.poleToFrame.p1,
                    p2: rowPTF.p2 ?? ir.measured.poleToFrame.p2,
                    p3: rowPTF.p3 ?? ir.measured.poleToFrame.p3,
                  };
                  ir.corrected.poleToFrame = {
                    p1: rowPTF.p1c ?? ir.corrected.poleToFrame.p1,
                    p2: rowPTF.p2c ?? ir.corrected.poleToFrame.p2,
                    p3: rowPTF.p3c ?? ir.corrected.poleToFrame.p3,
                  };
                }
                if (rowLTL) {
                  ir.measured.lineToLoad = {
                    p1: rowLTL.p1 ?? ir.measured.lineToLoad.p1,
                    p2: rowLTL.p2 ?? ir.measured.lineToLoad.p2,
                    p3: rowLTL.p3 ?? ir.measured.lineToLoad.p3,
                  };
                  ir.corrected.lineToLoad = {
                    p1: rowLTL.p1c ?? ir.corrected.lineToLoad.p1,
                    p2: rowLTL.p2c ?? ir.corrected.lineToLoad.p2,
                    p3: rowLTL.p3c ?? ir.corrected.lineToLoad.p3,
                  };
                }
              }
              return ir;
            })(),

            // Primary injection
            primaryInjection: d.primaryInjection ? {
              ...prev.primaryInjection,
              testedSettings: {
                longTime: { ...prev.primaryInjection.testedSettings.longTime, ...(d.primaryInjection.testedSettings?.longTime || {}) },
                shortTime: { ...prev.primaryInjection.testedSettings.shortTime, ...(d.primaryInjection.testedSettings?.shortTime || {}) },
                instantaneous: { ...prev.primaryInjection.testedSettings.instantaneous, ...(d.primaryInjection.testedSettings?.instantaneous || {}) },
                groundFault: { ...prev.primaryInjection.testedSettings.groundFault, ...(d.primaryInjection.testedSettings?.groundFault || {}) },
              },
              results: {
                longTime: { ...prev.primaryInjection.results.longTime, ...(d.primaryInjection.results?.longTime || {}) },
                shortTime: { ...prev.primaryInjection.results.shortTime, ...(d.primaryInjection.results?.shortTime || {}) },
                instantaneous: { ...prev.primaryInjection.results.instantaneous, ...(d.primaryInjection.results?.instantaneous || {}) },
                groundFault: { ...prev.primaryInjection.results.groundFault, ...(d.primaryInjection.results?.groundFault || {}) },
              }
            } : prev.primaryInjection,

            // Test equipment
            testEquipment: {
              megohmmeter: { ...prev.testEquipment.megohmmeter, ...(d.testEquipment?.megohmmeter || {}) },
              lowResistanceOhmmeter: { ...prev.testEquipment.lowResistanceOhmmeter, ...(d.testEquipment?.lowResistanceOhmmeter || {}) },
              primaryInjectionTestSet: { ...prev.testEquipment.primaryInjectionTestSet, ...(d.testEquipment?.primaryInjectionTestSet || {}) },
            },

            // Comments and status
            comments: d.reportInfo?.comments ?? prev.comments,
            status: d.status ?? prev.status,
          };
          return updated;
        });
        setIsEditing(false);
        setLoading(false);
        return;
      }

      // Fallback to the dedicated table if not found in generic store
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_circuit_breaker_electronic_trip_ats')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`Report with ID ${reportId} not found. Starting new report.`);
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (data) {
        setFormData(prev => ({
          ...prev,
          customer: data.report_info?.customer || prev.customer,
          address: data.report_info?.address || prev.address,
          user: data.report_info?.user || prev.user,
          date: data.report_info?.date || prev.date,
          identifier: data.report_info?.identifier || prev.identifier,
          jobNumber: data.report_info?.jobNumber || prev.jobNumber,
          technicians: data.report_info?.technicians || prev.technicians,
          temperature: data.report_info?.temperature || prev.temperature,
          substation: data.report_info?.substation || prev.substation,
          eqptLocation: data.report_info?.eqptLocation || prev.eqptLocation,
          manufacturer: data.nameplate_data?.manufacturer || '',
          catalogNumber: data.nameplate_data?.catalogNumber || '',
          serialNumber: data.nameplate_data?.serialNumber || '',
          type: data.nameplate_data?.type || '',
          frameSize: data.nameplate_data?.frameSize || '',
          icRating: data.nameplate_data?.icRating || '',
          tripUnitType: data.nameplate_data?.tripUnitType || '',
          ratingPlug: data.nameplate_data?.ratingPlug || '',
          curveNo: data.nameplate_data?.curveNo || '',
          chargeMotorVoltage: data.nameplate_data?.chargeMotorVoltage || '',
          operation: data.nameplate_data?.operation || '',
          mounting: data.nameplate_data?.mounting || '',
          zoneInterlock: data.nameplate_data?.zoneInterlock || '',
          thermalMemory: data.nameplate_data?.thermalMemory || '',
          visualInspectionItems: data.visual_mechanical?.items || prev.visualInspectionItems,
          deviceSettings: data.device_settings || prev.deviceSettings,
          contactResistance: data.contact_resistance || prev.contactResistance,
          insulationResistance: data.insulation_resistance || prev.insulationResistance,
          primaryInjection: data.primary_injection || prev.primaryInjection,
          testEquipment: data.test_equipment || prev.testEquipment,
          comments: data.comments || '',
          status: data.report_info?.status || 'PASS',
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  // --- Save Report ---
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    // Structure data for Supabase JSONB columns
    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: formData.customer,
        address: formData.address,
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
        frameSize: formData.frameSize,
        icRating: formData.icRating,
        tripUnitType: formData.tripUnitType,
        ratingPlug: formData.ratingPlug,
        curveNo: formData.curveNo,
        chargeMotorVoltage: formData.chargeMotorVoltage,
        operation: formData.operation,
        mounting: formData.mounting,
        zoneInterlock: formData.zoneInterlock,
        thermalMemory: formData.thermalMemory,
      },
      visual_mechanical: {
        items: formData.visualInspectionItems
      },
      device_settings: formData.deviceSettings,
      contact_resistance: formData.contactResistance,
      insulation_resistance: formData.insulationResistance,
      primary_injection: formData.primaryInjection, // Changed from trip_testing
      test_equipment: formData.testEquipment,
      comments: formData.comments
    };

    try {
      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new table name
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new table name
          .insert(reportPayload)
          .select()
          .single();

        // Create asset entry for the new report
        if (result.data) {
          const newReportId = result.data.id;
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''), // Updated name
            file_url: `report:/jobs/${jobId}/low-voltage-circuit-breaker-electronic-trip-ats-report/${newReportId}`, // Updated path
            user_id: user.id
          };

          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;

          // Link asset to job
          await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: jobId,
              asset_id: assetResult.id,
              user_id: user.id
            });
        }
      }

      if (result.error) throw result.error;

      setIsEditing(false); // Exit editing mode
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location); // Use utility function
    } catch (error: any) {
      console.error('Error saving report:', error);
      // Provide more specific error details if available
      let errorMessage = 'Unknown error';
      if (error) {
        if (error.message) {
          errorMessage = error.message;
        }
        if (error.details) {
          errorMessage += ` Details: ${error.details}`;
        }
        if (error.hint) {
          errorMessage += ` Hint: ${error.hint}`;
        }
      }
      alert(`Failed to save report: ${errorMessage}`);
    }
  };


  // --- useEffect for loading data ---
  useEffect(() => {
    if (jobId) {
      loadJobInfo(); // Load job info regardless
    }
    if (reportId) {
      loadReport(); // Load existing report if reportId exists
    } else {
      setLoading(false); // If no reportId, stop loading (new report)
      setIsEditing(true); // Start in edit mode for new reports
    }
  }, [jobId, reportId]); // Dependencies

  // Reset isEditing state when reportId changes (e.g., navigating from new to existing)
  useEffect(() => {
    setIsEditing(!reportId);
  }, [reportId]);

  // --- Temperature Handlers (from PanelboardReport) ---
  const handleFahrenheitChange = (fahrenheit: number) => {
    const calculatedCelsius = ((fahrenheit - 32) * 5) / 9;
    const roundedCelsius = Math.round(calculatedCelsius);
    const tcf = getTCF(roundedCelsius);

    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius: roundedCelsius,
        tcf
      }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const roundedCelsius = Math.round(celsius);
    const calculatedFahrenheit = (roundedCelsius * 9) / 5 + 32;
    const roundedFahrenheit = Math.round(calculatedFahrenheit);
    const tcf = getTCF(roundedCelsius);

    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        celsius: roundedCelsius,
        fahrenheit: roundedFahrenheit,
        tcf
      }
    }));
  };

  // --- Insulation Resistance Calculation ---
  // Calculate temperature corrected values whenever measured values or temperature changes
  useEffect(() => {
    if (!isEditing) return; // Only calculate in edit mode

    const calculateCorrectedValue = (value: string): string => {
      if (value === "" || value === null || value === undefined || isNaN(Number(value))) {
          return "";
      }
      const numericValue = parseFloat(value);
      const tcf = formData.temperature.tcf;
      // Handle cases where tcf might be zero or invalid
      if (!tcf || tcf === 0) return numericValue.toFixed(2);
      return (numericValue * tcf).toFixed(2);
    };

    const newCorrected = {
      poleToPole: {
        p1p2: calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p1p2),
        p2p3: calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p2p3),
        p3p1: calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p3p1),
      },
      poleToFrame: {
        p1: calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p1),
        p2: calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p2),
        p3: calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p3),
      },
      lineToLoad: {
        p1: calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p1),
        p2: calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p2),
        p3: calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p3),
      }
    };

    setFormData(prev => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        corrected: newCorrected
      }
    }));

  }, [
    JSON.stringify(formData.insulationResistance.measured), // Stringify to detect deep changes
    formData.temperature.tcf, // TCF changes should also trigger recalculation
    isEditing // Only calculate when in edit mode
  ]);


  // --- Generic Handle Change ---
  // Use lodash set for deeply nested updates
  const handleChange = (path: string, value: any) => {
    if (!isEditing) return;
    
    setFormData(prev => {
      const newState = { ...prev };
      const keys = path.split('.');
      let currentLevel: any = newState;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        // Check if the key includes an index (e.g., "visualInspectionItems[0]")
        const match = key.match(/(\w+)\[(\d+)\]/);
        if (match) {
          const arrayKey = match[1];
          const index = parseInt(match[2], 10);
          if (!currentLevel[arrayKey]) currentLevel[arrayKey] = []; // Ensure array exists
          if (!currentLevel[arrayKey][index]) currentLevel[arrayKey][index] = {}; // Ensure object at index exists
          currentLevel = currentLevel[arrayKey][index];
        } else {
          if (!currentLevel[key]) currentLevel[key] = {}; // Ensure object exists
          currentLevel = currentLevel[key];
        }
      }
      currentLevel[keys[keys.length - 1]] = value;

      // Check if this is a rated amperes field and calculate related values
      if (path.includes('ratedAmperes1')) {
        const section = path.includes('longTime') ? 'longTime' 
                     : path.includes('shortTime') ? 'shortTime'
                     : path.includes('instantaneous') ? 'instantaneous'
                     : 'groundFault';
        
        const calculated = calculateTestValues(value, section);
        if (calculated) {
          // Get the correct section in primaryInjection.results
          const sectionResults = newState.primaryInjection.results[section];
          if (sectionResults) {
            sectionResults.testAmperes1 = calculated.testAmperes1;
            sectionResults.testAmperes2 = calculated.testAmperes2;
            sectionResults.toleranceMin2 = calculated.toleranceMin2;
            sectionResults.toleranceMax2 = calculated.toleranceMax2;
          }
        }
      }

      return newState;
    });
  };

  // Add calculation function
  const calculateTestValues = (ratedAmperes: string, section: 'longTime' | 'shortTime' | 'instantaneous' | 'groundFault') => {
    if (!ratedAmperes || isNaN(Number(ratedAmperes))) return null;
    
    const value = Number(ratedAmperes);
    const multipliers = {
      longTime: { test: 3.0, tolerance: 0.10 }, // 300%, ±10%
      shortTime: { test: 1.1, tolerance: 0.10 }, // 110%, ±10%
      instantaneous: { test: 1.0, tolerance: 0.20 }, // 100%, ±20%
      groundFault: { test: 1.1, tolerance: 0.15 }, // 110%, ±15%
    };

    const mult = multipliers[section];
    
    return {
      testAmperes1: section === 'instantaneous' ? '' : (value * mult.test).toFixed(1),
      testAmperes2: value.toString(),
      toleranceMin2: (value * (1 - mult.tolerance)).toFixed(1),
      toleranceMax2: (value * (1 + mult.tolerance)).toFixed(1)
    };
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  // Create header function
  const renderHeader = () => (
    <div className="print:hidden flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        8-Low Voltage Circuit Breaker Electronic Trip Unit ATS
      </h1>
      <div className="flex gap-2">
        {/* Status Button */}
        <button
          onClick={() => {
            if (isEditing) {
              // Cycle through PASS -> FAIL -> LIMITED SERVICE -> PASS
              const nextStatus = formData.status === 'PASS' ? 'FAIL' : formData.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS';
              setFormData(prev => ({ ...prev, status: nextStatus }));
            }
          }}
          disabled={!isEditing}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
            formData.status === 'FAIL' ? 'bg-red-600 text-white focus:ring-red-500' :
            'bg-yellow-500 text-black focus:ring-yellow-400' // Style for LIMITED SERVICE
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
        >
          {formData.status}
        </button>

        {/* Edit/Save Button */}
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
            disabled={!isEditing}
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}
          >
            Save Report
          </button>
        )}
      </div>
    </div>
  );

  // --- Render Component ---
  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.6.1.2
          <div className="hidden print:block mt-2">
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
                border: formData.status === 'PASS' ? '2px solid #16a34a' : formData.status === 'FAIL' ? '2px solid #dc2626' : '2px solid #ca8a04',
                backgroundColor: formData.status === 'PASS' ? '#22c55e' : formData.status === 'FAIL' ? '#ef4444' : '#eab308',
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
      
      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        {/* Header */}
        <div className="print:hidden flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            8-Low Voltage Circuit Breaker Electronic Trip Unit ATS
          </h1>
          <div className="flex gap-2">
            {/* Status Button */}
            <button
              onClick={() => {
                if (isEditing) {
                  // Cycle through PASS -> FAIL -> LIMITED SERVICE -> PASS
                  const nextStatus = formData.status === 'PASS' ? 'FAIL' : formData.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS';
                  setFormData(prev => ({ ...prev, status: nextStatus }));
                }
              }}
              disabled={!isEditing}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
                formData.status === 'FAIL' ? 'bg-red-600 text-white focus:ring-red-500' :
                'bg-yellow-500 text-black focus:ring-yellow-400' // Style for LIMITED SERVICE
              } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
            >
              {formData.status}
            </button>

            {/* Edit/Save Button */}
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
                disabled={!isEditing}
                className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}
              >
                Save Report
              </button>
            )}
          </div>
          </div>
          
          <div className="space-y-6">
            {/* --- Job Information Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
              <div><label className="form-label">Customer:</label><input type="text" value={formData.customer} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
              <div className="md:col-span-2"><label htmlFor="address" className="form-label">Address:</label><input id="address" type="text" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
              <div><label htmlFor="technicians" className="form-label">Technicians:</label><input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="date" className="form-label">Date:</label><input id="date" type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="identifier" className="form-label">Identifier:</label><input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div className="flex items-center space-x-1">
                  <div>
                  <label htmlFor="temperature.fahrenheit" className="form-label">Temp:</label>
                  <input id="temperature.fahrenheit" type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="ml-1 text-xs">°F</span>
                      </div>
                  <div>
                  <label htmlFor="temperature.celsius" className="form-label sr-only">Celsius</label>
                  <input id="temperature.celsius" type="number" value={formData.temperature.celsius} onChange={(e) => handleCelsiusChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="ml-1 text-xs">°C</span>
                      </div>
                      </div>
              <div><label htmlFor="temperature.tcf" className="form-label">TCF:</label><input id="temperature.tcf" type="number" value={formData.temperature.tcf} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-16" /></div>
              <div><label htmlFor="temperature.humidity" className="form-label">Humidity:</label><input id="temperature.humidity" type="number" value={formData.temperature.humidity} onChange={(e) => handleChange('temperature.humidity', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /><span className="ml-1 text-xs">%</span></div>
              <div><label htmlFor="substation" className="form-label">Substation:</label><input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label><input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div className="md:col-span-2"><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                      </div>

              {/* Print-only compact job info table matching standardized layout */}
              <div className="hidden print:block">
                <table className="w-full border-collapse border border-gray-300 print:border-black">
                  <tbody>
                    <tr>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Customer:</div>
                        <div className="mt-1">{formData.customer}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Temp:</div>
                        <div className="mt-1">{`${formData.temperature.fahrenheit}°F (${formData.temperature.celsius}°C)`}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Job #:</div>
                        <div className="mt-1">{formData.jobNumber}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Technicians:</div>
                        <div className="mt-1">{formData.technicians}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Date:</div>
                        <div className="mt-1">{formData.date ? (new Date(formData.date)).toLocaleDateString() : ''}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Identifier:</div>
                        <div className="mt-1">{formData.identifier}</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Address:</div>
                        <div className="mt-1">{formData.address}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">TCF:</div>
                        <div className="mt-1">{formData.temperature.tcf}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Humidity:</div>
                        <div className="mt-1">{`${formData.temperature.humidity}%`}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Substation:</div>
                        <div className="mt-1">{formData.substation}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Eqpt. Location:</div>
                        <div className="mt-1">{formData.eqptLocation}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">User:</div>
                        <div className="mt-1">{formData.user}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
                      </div>

          {/* --- Nameplate Data Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div><label htmlFor="manufacturer" className="form-label">Manufacturer:</label><input id="manufacturer" type="text" value={formData.manufacturer} onChange={(e) => handleChange('manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="catalogNumber" className="form-label">Catalog Number:</label><input id="catalogNumber" type="text" value={formData.catalogNumber} onChange={(e) => handleChange('catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="serialNumber" className="form-label">Serial Number:</label><input id="serialNumber" type="text" value={formData.serialNumber} onChange={(e) => handleChange('serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="type" className="form-label">Type:</label><input id="type" type="text" value={formData.type} onChange={(e) => handleChange('type', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="frameSize" className="form-label">Frame Size (A):</label><input id="frameSize" type="text" value={formData.frameSize} onChange={(e) => handleChange('frameSize', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="icRating" className="form-label">I.C. Rating (kA):</label><input id="icRating" type="text" value={formData.icRating} onChange={(e) => handleChange('icRating', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="tripUnitType" className="form-label">Trip Unit Type:</label><input id="tripUnitType" type="text" value={formData.tripUnitType} onChange={(e) => handleChange('tripUnitType', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="ratingPlug" className="form-label">Rating Plug (A):</label><input id="ratingPlug" type="text" value={formData.ratingPlug} onChange={(e) => handleChange('ratingPlug', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="curveNo" className="form-label">Curve No.:</label><input id="curveNo" type="text" value={formData.curveNo} onChange={(e) => handleChange('curveNo', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="chargeMotorVoltage" className="form-label">Charge Motor V:</label><input id="chargeMotorVoltage" type="text" value={formData.chargeMotorVoltage} onChange={(e) => handleChange('chargeMotorVoltage', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="operation" className="form-label">Operation:</label><input id="operation" type="text" value={formData.operation} onChange={(e) => handleChange('operation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="mounting" className="form-label">Mounting:</label><input id="mounting" type="text" value={formData.mounting} onChange={(e) => handleChange('mounting', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="zoneInterlock" className="form-label">Zone Interlock:</label><input id="zoneInterlock" type="text" value={formData.zoneInterlock} onChange={(e) => handleChange('zoneInterlock', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="thermalMemory" className="form-label">Thermal Memory:</label><input id="thermalMemory" type="text" value={formData.thermalMemory} onChange={(e) => handleChange('thermalMemory', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                       </div>
                       </div>

          {/* --- Visual and Mechanical Inspection Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-1/6">NETA Section</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-4/6">Description</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-1/6">Results</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">{item.id}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">{item.description}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                        <select
                          value={item.result}
                          onChange={(e) => handleChange(`visualInspectionItems[${index}].result`, e.target.value)}
                          disabled={!isEditing}
                          className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        >
                          <option value=""></option>
                          {visualInspectionResultsOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Device Settings Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Device Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {/* As Found Table */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Settings As Found</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead className="bg-gray-50 dark:bg-dark-200">
                      <tr>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white"></th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Setting</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Delay</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">I²t</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                      {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => (
                        <tr key={`found-${settingType}`}>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">
                            {settingType.replace('Time', ' Time').replace('Fault', ' Fault')}
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            <input
                              type="text"
                              value={formData.deviceSettings.asFound[settingType]?.setting || ''}
                              onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.setting`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            <input
                              type="text"
                              value={formData.deviceSettings.asFound[settingType]?.delay || ''}
                              onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.delay`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            {settingType === 'shortTime' || settingType === 'groundFault' ? (
                              <select
                                value={formData.deviceSettings.asFound[settingType]?.i2t || ''}
                                onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.i2t`, e.target.value)}
                                disabled={!isEditing}
                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                              >
                                {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value=""
                                readOnly
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* As Left Table */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Settings As Left</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead className="bg-gray-50 dark:bg-dark-200">
                      <tr>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white"></th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Setting</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Delay</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">I²t</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                      {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => (
                        <tr key={`left-${settingType}`}>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">
                            {settingType.replace('Time', ' Time').replace('Fault', ' Fault')}
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            <input
                              type="text"
                              value={formData.deviceSettings.asLeft[settingType]?.setting || ''}
                              onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.setting`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            <input
                              type="text"
                              value={formData.deviceSettings.asLeft[settingType]?.delay || ''}
                              onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.delay`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            {settingType === 'shortTime' || settingType === 'groundFault' ? (
                              <select
                                value={formData.deviceSettings.asLeft[settingType]?.i2t || ''}
                                onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.i2t`, e.target.value)}
                                disabled={!isEditing}
                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                              >
                                {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value=""
                                readOnly
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* --- Electrical Tests - Contact/Pole Resistance Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Contact/Pole Resistance</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={3}>Contact Resistance</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Units</th>
                  </tr>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">P1</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">P2</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">P3</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p1}
                        onChange={(e) => handleChange('contactResistance.p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p2}
                        onChange={(e) => handleChange('contactResistance.p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p3}
                        onChange={(e) => handleChange('contactResistance.p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <select
                        value={formData.contactResistance.unit}
                        onChange={(e) => handleChange('contactResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      >
                        {contactResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Electrical Tests - Insulation Resistance Section --- */}
          <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Insulation Resistance</h2>
            <div className="flex justify-end mb-4">
              <label htmlFor="insulationTestVoltage" className="form-label mr-2 dark:text-gray-300">Test Voltage:</label>
              <select
                id="insulationTestVoltage"
                value={formData.insulationResistance.testVoltage}
                onChange={(e) => handleChange('insulationResistance.testVoltage', e.target.value)}
                disabled={!isEditing}
                className="form-select w-32" // Using general form-select as it's outside the table
              >
                {insulationTestVoltageOptions.map(option => (<option key={option} value={option}>{option}</option>))}
              </select>
            </div>
            <div className={tableStyles.container}>
              <table className={`${tableStyles.table} ins-res-table`}>
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className={`${tableStyles.headerCell} text-left whitespace-nowrap`} rowSpan={2}>Pole to...</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`} colSpan={3}>Measured Values</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`} colSpan={3}>Temperature Corrected</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`} rowSpan={2}>Units</th>
                  </tr>
                  <tr>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`}>P1 (P1-P2)</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`}>P2 (P2-P3)</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`}>P3 (P3-P1)</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`}>P1 (P1-P2)</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`}>P2 (P2-P3)</th>
                    <th className={`${tableStyles.headerCell} text-center whitespace-nowrap`}>P3 (P3-P1)</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {/* Pole to Pole (Closed) */}
                  <tr>
                    <td className={tableStyles.cell}>Pole to Pole (Closed)</td>
                    {/* Measured Values */}
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToPole.p1p2}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p1p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToPole.p2p3}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p2p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToPole.p3p1}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p3p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p1p2}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p2p3}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p3p1}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    {/* Units */}
                    <td className={`${tableStyles.cell} text-center`}>
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={tableStyles.select}
                      >
                        {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                  {/* Pole to Frame (Closed) */}
                  <tr>
                    <td className={tableStyles.cell}>Pole to Frame (Closed)</td>
                    {/* Measured Values */}
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToFrame.p1}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToFrame.p2}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToFrame.p3}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p1}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p2}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p3}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    {/* Units */}
                    <td className={`${tableStyles.cell} text-center`}>
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={tableStyles.select}
                      >
                        {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                  {/* Line to Load (Open) */}
                  <tr>
                    <td className={tableStyles.cell}>Line to Load (Open)</td>
                    {/* Measured Values */}
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.lineToLoad.p1}
                        onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.lineToLoad.p2}
                        onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.lineToLoad.p3}
                        onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p1}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p2}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p3}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                      />
                    </td>
                    {/* Units */}
                    <td className={`${tableStyles.cell} text-center`}>
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={tableStyles.select}
                      >
                        {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* --- Electrical Tests - Primary Injection Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Primary Injection</h2>
            
            {/* Add Tested Settings Table */}
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Tested Settings</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 primary-injection-table">
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white"></th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Setting</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Delay</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">I²t</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => (
                      <tr key={`tested-${settingType}`}>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {settingType.replace('Time', ' Time').replace('Fault', ' Fault')}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.primaryInjection.testedSettings[settingType]?.setting || ''}
                            onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.setting`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.primaryInjection.testedSettings[settingType]?.delay || ''}
                            onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.delay`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          {settingType === 'shortTime' || settingType === 'groundFault' ? (
                            <select
                              value={formData.primaryInjection.testedSettings[settingType]?.i2t || ''}
                              onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.i2t`, e.target.value)}
                              disabled={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            >
                              {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value=""
                              readOnly
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600 primary-injection-table">
                <colgroup>
                  <col style={{ width: '12%' }} /> {/* Function */}
                  <col style={{ width: '10%' }} /> {/* Rated Amperes */}
                  <col style={{ width: '8%' }} />  {/* Multiplier % Left */}
                  <col style={{ width: '8%' }} />  {/* Multiplier % Right */}
                  <col style={{ width: '10%' }} /> {/* Test Amperes */}
                  <col style={{ width: '8%' }} />  {/* Tolerance Min */}
                  <col style={{ width: '8%' }} />  {/* Tolerance Max */}
                  <col style={{ width: '12%' }} /> {/* Pole 1 */}
                  <col style={{ width: '12%' }} /> {/* Pole 2 */}
                  <col style={{ width: '12%' }} /> {/* Pole 3 */}
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" rowSpan={2}>Function</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Rated Amperes</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" colSpan={2}>Multiplier %</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Test Amperes</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" colSpan={2}>Tolerance</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Pole 1</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Pole 2</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Pole 3</th>
                  </tr>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Tolerance</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Min</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Max</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {/* Long Time */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Long Time</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>300%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.testAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.testAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.toleranceMin1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMin1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.toleranceMax1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMax1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole1.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.longTime.pole1.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole2.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.longTime.pole2.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole3.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.longTime.pole3.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>LTPU</td>
                    <td className={tableStyles.cell}>-10%</td>
                    <td className={tableStyles.cell}>10%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.testAmperes2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.testAmperes2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.toleranceMin2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMin2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.longTime.toleranceMax2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMax2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole1.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.longTime.pole1.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole2.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.longTime.pole2.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole3.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.longTime.pole3.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>

                  {/* Short Time */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Short Time</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>110%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.testAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.testAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMin1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMin1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMax1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMax1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole1.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.shortTime.pole1.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole2.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.shortTime.pole2.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole3.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.shortTime.pole3.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>STPU</td>
                    <td className={tableStyles.cell}>-10%</td>
                    <td className={tableStyles.cell}>10%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.testAmperes2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.testAmperes2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMin2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMin2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMax2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMax2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole1.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.shortTime.pole1.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole2.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.shortTime.pole2.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole3.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.shortTime.pole3.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>

                  {/* Instantaneous */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Instantaneous</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.instantaneous.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}></td>
                    <td className={tableStyles.cell}></td>
                    <td className={tableStyles.cell}></td>
                    <td className={tableStyles.cell}></td>
                    <td className={`${tableStyles.cell} text-center`}></td>
                    <td className={`${tableStyles.cell} text-center`}></td>
                    <td className={`${tableStyles.cell} text-center`}></td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>IPU</td>
                    <td className={tableStyles.cell}>-20%</td>
                    <td className={tableStyles.cell}>20%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.instantaneous.testAmperes2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.testAmperes2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.instantaneous.toleranceMin2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.toleranceMin2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.instantaneous.toleranceMax2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.toleranceMax2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.instantaneous.pole1.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole1.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.instantaneous.pole2.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole2.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.instantaneous.pole3.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole3.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>

                  {/* Ground Fault */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Ground Fault</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>110%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.testAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.testAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMin1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMin1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMax1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMax1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole1.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.groundFault.pole1.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole2.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.groundFault.pole2.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole3.sec || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.groundFault.pole3.sec', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>GFPU</td>
                    <td className={tableStyles.cell}>-15%</td>
                    <td className={tableStyles.cell}>15%</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.testAmperes2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.testAmperes2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMin2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMin2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMax2 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMax2', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole1.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.groundFault.pole1.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole2.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.groundFault.pole2.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole3.a || ''} 
                        onChange={(e) => handleChange('primaryInjection.results.groundFault.pole3.a', e.target.value)} 
                        readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="form-label">Megohmmeter:</label><input type="text" value={formData.testEquipment.megohmmeter.name} onChange={(e) => handleChange('testEquipment.megohmmeter.name', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.megohmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.megohmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.megohmmeter.ampId} onChange={(e) => handleChange('testEquipment.megohmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Low-Resistance Ohmmeter:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.name} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.name', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.ampId} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Primary Injection Test Set:</label><input type="text" value={formData.testEquipment.primaryInjectionTestSet.name} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.name', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.primaryInjectionTestSet.serialNumber} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.primaryInjectionTestSet.ampId} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              </div>
              </div>

          {/* --- Comments Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            <div className="mb-4">
              <textarea 
                value={formData.comments} 
                onChange={(e) => handleChange('comments', e.target.value)}
                readOnly={!isEditing}
                className={`form-textarea w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                rows={4}
              />
            </div>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default LowVoltageCircuitBreakerElectronicTripATSReport;

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide navigation bar and scrollbar */
    nav, header, .navigation, [class*="nav"], [class*="header"] {
      display: none !important;
    }
    ::-webkit-scrollbar { display: none; }
    html { -ms-overflow-style: none; scrollbar-width: none; height: 100%; }
    body { overflow-x: hidden; min-height: 100vh; padding-bottom: 100px; }
    textarea { min-height: 200px !important; }

    @media print {
      * { 
        color: black !important;
        background: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif !important;
        font-size: 9px !important;
        background: white !important;
        line-height: 1 !important;
      }
      
      /* Standard portrait page size with minimal margins */
      @page { 
        size: 8.5in 11in; 
        margin: 0.1in;
      }
      
      /* Hide all non-print elements */
      .print\\:hidden { display: none !important; }
      /* Hide original on-screen job info grid in print */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      
      /* Hide second title and back button in print only */
      .flex.justify-between.items-center.mb-6 { display: none !important; }
      .flex.items-center.gap-4 { display: none !important; }
      button { display: none !important; }
      
      /* Print header styling */
      .print\\:flex {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        border-bottom: 2px solid black !important;
        padding-bottom: 8px !important;
        margin-bottom: 12px !important;
        page-break-after: avoid !important;
      }
      
      /* Print header logo */
      .print\\:flex img {
        height: 40px !important;
        width: auto !important;
        max-height: 40px !important;
      }
      
      /* Print header title */
      .print\\:flex h1 {
        font-size: 18px !important;
        font-weight: bold !important;
        color: black !important;
        margin: 0 !important;
        text-align: center !important;
      }
      
      /* Print header NETA text */
      .print\\:flex div[style*="color: #1a4e7c"] {
        color: #1a4e7c !important;
        font-size: 16px !important;
        font-weight: bold !important;
        text-align: right !important;
      }
      
      /* Print header status box */
      .pass-fail-status-box {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
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
      
      /* Section headers with orange line above - ultra compact */
      h2 {
        font-size: 9px !important;
        font-weight: bold !important;
        margin: 0 !important;
        margin-top: 0 !important;
        padding: 1px 0 !important;
        background-color: transparent !important;
        color: black !important;
        text-transform: none !important;
        border: none !important;
        border-bottom: 1px solid black !important;
        line-height: 1.2 !important;
        padding-bottom: 2px !important;
        padding-top: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        position: relative !important;
      }
      
      /* Orange divider lines */
      .w-full.h-1.bg-\\[\\#f26722\\] {
        background-color: #f26722 !important;
        height: 4px !important;
        margin-bottom: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        border: none !important;
        border-radius: 0 !important;
      }
      
      /* Remove pseudo-element - not working properly */
      h2::before {
        display: none !important;
      }
      
      /* Add extra spacing after tables to prevent overlap */
      table { 
        margin-bottom: 8px !important;
        page-break-inside: avoid !important;
      }

      /* Force PASS/FAIL colors to print */
      .status-pass {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      .status-fail {
        background-color: #ef4444 !important;
        border: 2px solid #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Remove all card styling and shadows */
      .bg-white, .dark\\:bg-dark-150, .rounded-lg, .shadow {
        background: white !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        margin-bottom: 3px !important;
        border: none !important;
      }
      
      /* Remove ALL section styling - no boxes */
      section {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        margin-bottom: 2px !important;
        page-break-inside: avoid !important;
      }
      
      /* Remove any div that might create boxes */
      div[class*="border"], div[class*="shadow"], div[class*="rounded"] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      /* Ensure no padding on any containers */
      div[class*="p-"], div[class*="px-"], div[class*="py-"], div[class*="pt-"], div[class*="pb-"], div[class*="pl-"], div[class*="pr-"] {
        padding: 0 !important;
      }
      
      /* FORCE remove all borders and boxes from everything except tables */
      * {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
      }
      
      /* Specifically target and remove print borders */
      .print\\:border {
        border: none !important;
      }
      
      .print\\:border-black {
        border: none !important;
      }
      
      /* Remove borders from divs with these specific classes */
      div.bg-white, div.dark\\:bg-dark-150, div.print\\:border, div.print\\:border-black {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      
      /* Only allow borders on table elements */
      table, th, td, thead, tbody, tr {
        border: 1px solid black !important;
      }
      
      /* Ensure table has outer border */
      table {
        border: 1.5px solid black !important;
      }
      
      /* Allow borders on inputs */
      input, select, textarea { 
        border-bottom: 1px solid black !important;
      }
      
      textarea {
        border: 1px solid black !important; 
      }
      
      /* Form grid layout - ultra compact */
      .grid {
        display: grid !important;
        gap: 1px !important;
        margin-bottom: 2px !important;
      }
      
      /* Job info section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-4 {
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Large screen job info - 6 columns */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-6 {
        grid-template-columns: repeat(6, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Nameplate data section - 3 columns */
      .grid-cols-1.md\\:grid-cols-3 {
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Labels and inputs - better fit for data */
      label {
        font-size: 8px !important;
        font-weight: normal !important;
        margin: 0 !important;
        display: inline-block !important;
        margin-right: 2px !important;
        width: auto !important;
      }
      
      input, select, textarea { 
        width: 70px !important;
        border: 1px solid black !important; 
        background: white !important;
        padding: 2px 3px !important;
        margin: 0 !important;
        font-size: 8px !important;
        height: 12px !important;
        display: inline-block !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
      }
      
      /* Specific width for common inputs */
      input[type="text"], input[type="number"] {
        width: 70px !important;
      }
      
      /* Wider inputs for certain fields */
      input[type="date"] {
        width: 80px !important;
      }
      
      /* Temperature inputs */
      input[id*="temperature"] {
        width: 50px !important;
      }
      
      /* Job info specific inputs */
      .grid-cols-1.md\\:grid-cols-4 input[type="text"] {
        width: 90px !important;
      }
      
      /* Large screen job info inputs */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-6 input[type="text"] {
        width: 80px !important;
      }
      
      /* Nameplate data specific inputs */
      .grid-cols-1.md\\:grid-cols-3 input[type="text"] {
        width: 80px !important;
      }
      
      /* Customer field - smaller font for long names */
      input[value*="Cadell"], input[id*="customer"], input[name*="customer"] {
        font-size: 6px !important;
      }
      
      /* Table inputs - better fit for data */
      table input[type="text"], table select {
        width: 60px !important;
        max-width: 60px !important;
        border: 1px solid black !important;
        background: white !important;
      }
      
      textarea {
        width: 100% !important;
        height: auto !important;
        min-height: 20px !important;
        border: 1px solid black !important;
        display: block !important;
        margin-top: 1px !important;
        font-size: 8px !important;
        padding: 2px !important;
      }
      
      /* Table styles - proper fillable report format */
      table { 
        width: 100% !important; 
        border-collapse: collapse !important;
        margin: 1px 0 !important;
        font-size: 8px !important;
        page-break-inside: avoid !important;
        margin-bottom: 16px !important;
        border: 1.5px solid black !important;
      }
      
      /* Table headers */
      th {
        border: 1px solid black !important; 
        padding: 4px !important; 
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
        color: black !important;
        font-size: 8px !important;
        text-align: left !important;
        vertical-align: middle !important;
      }
      
      /* Table cells */
      td {
        border: 1px solid black !important;
        padding: 4px !important;
        vertical-align: middle !important;
        text-align: left !important;
        background: white !important;
        color: black !important;
        font-size: 8px !important;
        line-height: 1.2 !important;
        min-height: 16px !important;
        display: table-cell !important;
      }
      
      /* Specific input styling in tables */
      table input, table select {
        border: 1px solid black !important;
        padding: 2px 3px !important;
        margin: 0 !important;
        height: 12px !important;
        text-align: left !important;
        width: 60px !important;
        font-size: 8px !important;
        background: white !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        vertical-align: middle !important;
        display: inline-block !important;
      }
      
      /* Form label specific styling */
      .form-label {
        font-size: 8px !important;
        font-weight: normal !important;
        margin: 0 !important;
        display: inline-block !important;
        margin-right: 4px !important;
        width: auto !important;
        min-width: 0 !important;
      }
      
      /* Ensure form inputs are properly sized */
      .form-input, .form-select {
        width: 70px !important;
        border: 1px solid black !important;
        background: white !important;
        padding: 2px 3px !important;
        font-size: 8px !important;
        height: 12px !important;
      }
      
      /* Form textarea styling */
      .form-textarea {
        width: 100% !important;
        border: 1px solid black !important;
        background: white !important;
        padding: 2px !important;
        font-size: 8px !important;
        min-height: 20px !important;
      }
      
      /* Remove all spacing classes */
      .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
      .mb-4 { margin-bottom: 2px !important; }
      .mb-6 { margin-bottom: 3px !important; }
      .mb-8 { margin-bottom: 3px !important; }
      .p-6 { padding: 0 !important; }
      
      /* Force full page width */
      body, html {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Remove any max-width constraints */
      * {
        max-width: none !important;
      }
      
      /* Ensure containers use full width */
      div {
        width: 100% !important;
        max-width: none !important;
      }
      
      /* PASS/FAIL status badge */
      .bg-green-600, .bg-red-600, .bg-yellow-500 {
        background-color: transparent !important;
        color: black !important;
        border: 1px solid black !important;
        padding: 0px 2px !important;
        font-weight: bold !important; 
        font-size: 9px !important;
      }
      
      /* Status in header */
      .text-green-600 { color: green !important; }
      .text-red-600 { color: red !important; }
      .text-yellow-500 { color: orange !important; }
      
      /* Comments section */
      .min-h-[250px] {
        min-height: 20px !important;
      }
      
      /* Footer text */
      .text-xs {
        font-size: 7px !important;
      }
      
      /* Force single-line layout for form fields */
      .flex.items-center {
        display: inline-flex !important;
        margin-right: 10px !important;
      }
      
      /* Page break control */
      section { page-break-inside: avoid !important; }
      
      /* Ensure everything fits on one page */
      .max-w-7xl { 
        max-width: 100% !important; 
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Force full width layout */
      .p-6 { 
        padding: 0 !important; 
        margin: 0 !important;
        width: 100% !important;
      }
      
      /* Remove any container constraints */
      .space-y-6 > * + * { 
        margin-top: 4px !important; 
      }
      
      /* Orange header bar for sections */
      .border-b.dark\\:border-gray-700 {
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Specific section spacing */
      section { 
        margin-bottom: 2px !important;
        padding: 0 !important;
      }
      
      /* Print header specific */
      .print\\:flex {
        margin-bottom: 3px !important;
      }
      
      /* Center the title and status in print */
      .print\\:flex .flex-1.text-center {
        text-align: center !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        position: absolute !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: auto !important;
      }
      
      /* Status badge in print header */
      .print\\:flex .bg-green-600, .print\\:flex .bg-red-600, .print\\:flex .bg-yellow-500 {
        background-color: transparent !important;
        color: black !important;
        border: 2px solid black !important;
        padding: 2px 8px !important;
        font-weight: bold !important;
        font-size: 12px !important;
        margin-top: 4px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* PASS/FAIL status badge styling */
      .status-pass {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      .status-fail {
        background-color: #ef4444 !important;
        border: 2px solid #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* LIMITED SERVICE status badge styling */
      .status-limited-service {
        background-color: #eab308 !important;
        border: 2px solid #ca8a04 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Force green background for PASS status */
      div[style*="background-color: #22c55e"] {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Specific class for PASS/FAIL status box */
      .pass-fail-status-box {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
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
      }
      
      /* SUPER-SPECIFIC OVERRIDES - Must be last to override Tailwind */
      div[class*='print:border'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      div[class*='print:border-black'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      div.bg-white, div[class*='bg-white'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      div[class*='shadow'], div[class*='rounded'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
        border-radius: 0 !important;
      }
      
      /* Remove border from all direct children of .max-w-7xl in print */
      .max-w-7xl > div {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      /* Nuclear option - remove borders from all divs except those containing tables */
      div:not(:has(table)) {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      /* FINAL OVERRIDE: Force orange dividers for specific sections */
      /* Job Information divider */
      .max-w-7xl h2.section-job-information {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Nameplate Data divider */
      .max-w-7xl h2.section-nameplate-data {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Visual and Mechanical Inspection divider */
      .max-w-7xl h2.section-visual-mechanical {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Device Settings divider */
      .max-w-7xl h2.section-device-settings {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Contact Resistance divider */
      .max-w-7xl h2.section-contact-resistance {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Insulation Resistance divider */
      .max-w-7xl h2.section-insulation-resistance {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Primary Injection divider */
      .max-w-7xl h2.section-primary-injection {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Test Equipment divider */
      .max-w-7xl h2.section-test-equipment {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Comments divider */
      .max-w-7xl h2.section-comments {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Primary Injection table specific styles to prevent input box merging */
      .max-w-7xl table {
        table-layout: fixed !important;
        width: 100% !important;
        border-collapse: collapse !important;
        border-spacing: 0 !important;
      }
      
      .max-w-7xl table th,
      .max-w-7xl table td {
        border: 1px solid black !important;
        padding: 2px 1px !important;
        font-size: 8px !important;
        line-height: 1 !important;
        vertical-align: middle !important;
        text-align: center !important;
        position: relative !important;
        overflow: visible !important;
      }
      
      /* Force individual input boxes in all tables */
      .max-w-7xl table input,
      .max-w-7xl table select {
        width: 100% !important;
        min-width: 20px !important;
        max-width: 40px !important;
        height: 12px !important;
        padding: 1px !important;
        margin: 0 !important;
        border: 1px solid black !important;
        background: white !important;
        font-size: 7px !important;
        text-align: center !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        position: relative !important;
        z-index: 1 !important;
        display: inline-block !important;
        float: none !important;
        box-sizing: border-box !important;
      }
      
      /* Smaller input boxes specifically for Primary Injection table */
      .primary-injection-table input,
      .primary-injection-table select {
        width: 80% !important;
        min-width: 15px !important;
        max-width: 25px !important;
        height: 10px !important;
        padding: 0px !important;
        margin: 0 !important;
        border: 1px solid black !important;
        background: white !important;
        font-size: 6px !important;
        text-align: center !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        position: relative !important;
        z-index: 1 !important;
        display: inline-block !important;
        float: none !important;
        box-sizing: border-box !important;
      }
      
      /* Prevent input boxes from merging */
      .max-w-7xl table td {
        position: relative !important;
        overflow: visible !important;
        white-space: nowrap !important;
      }
      
      .max-w-7xl table input {
        position: relative !important;
        z-index: 1 !important;
        display: inline-block !important;
        float: none !important;
        box-sizing: border-box !important;
      }
      
      /* Ensure proper spacing between input boxes and text */
      .max-w-7xl table td input + span,
      .max-w-7xl table td span {
        margin-left: 2px !important;
        font-size: 7px !important;
        display: inline-block !important;
        white-space: nowrap !important;
      }
      
      /* Force table layout to prevent merging */
      .max-w-7xl table {
        table-layout: fixed !important;
        width: 100% !important;
        border-collapse: collapse !important;
        border-spacing: 0 !important;
      }
      
      /* Specific column widths for all tables */
      .max-w-7xl table th:nth-child(1) { width: 12% !important; }
      .max-w-7xl table th:nth-child(2) { width: 8% !important; }
      .max-w-7xl table th:nth-child(3) { width: 8% !important; }
      .max-w-7xl table th:nth-child(4) { width: 8% !important; }
      .max-w-7xl table th:nth-child(5) { width: 8% !important; }
      .max-w-7xl table th:nth-child(6) { width: 8% !important; }
      .max-w-7xl table th:nth-child(7) { width: 8% !important; }
      .max-w-7xl table th:nth-child(8) { width: 8% !important; }
      .max-w-7xl table th:nth-child(9) { width: 8% !important; }
      .max-w-7xl table th:nth-child(10) { width: 8% !important; }
      .max-w-7xl table th:nth-child(11) { width: 8% !important; }
      
      /* Additional spacing fixes */
      .max-w-7xl table td {
        word-spacing: 0 !important;
        letter-spacing: 0 !important;
      }
      
      /* Force input boxes to stay within their cells */
      .max-w-7xl table input {
        max-width: calc(100% - 2px) !important;
        box-sizing: border-box !important;
      }
      
      /* Fix PDF cutoff issues */
      body {
        margin: 0 !important;
        padding: 0 !important;
        min-height: 100vh !important;
      }
      
      .max-w-7xl {
        margin: 0 !important;
        padding: 20px !important;
        min-height: 100vh !important;
      }
      
      /* Ensure proper page breaks */
      .mb-6 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 20px !important;
      }
      
      /* Force page breaks at appropriate sections */
      h2:contains('Primary Injection') {
        page-break-before: auto !important;
        break-before: auto !important;
      }
      
      /* Insulation Resistance table explicit widths for PDF */
      .ins-res-table { table-layout: fixed !important; width: 100% !important; }
      .ins-res-table col:nth-child(1) { width: 16% !important; }
      .ins-res-table col:nth-child(2),
      .ins-res-table col:nth-child(3),
      .ins-res-table col:nth-child(4),
      .ins-res-table col:nth-child(5),
      .ins-res-table col:nth-child(6),
      .ins-res-table col:nth-child(7) { width: 12.5% !important; }
      .ins-res-table col:nth-child(8) { width: 9% !important; }
      
      /* Primary Injection table explicit widths for PDF */
      .primary-injection-table { table-layout: fixed !important; width: 100% !important; }
      .primary-injection-table col:nth-child(1) { width: 12% !important; }
      .primary-injection-table col:nth-child(2) { width: 10% !important; }
      .primary-injection-table col:nth-child(3),
      .primary-injection-table col:nth-child(4) { width: 8% !important; }
      .primary-injection-table col:nth-child(5) { width: 10% !important; }
      .primary-injection-table col:nth-child(6),
      .primary-injection-table col:nth-child(7) { width: 8% !important; }
      .primary-injection-table col:nth-child(8),
      .primary-injection-table col:nth-child(9),
      .primary-injection-table col:nth-child(10) { width: 12% !important; }
      
      /* Add bottom margin to prevent cutoff */
      .space-y-6 > *:last-child {
        margin-bottom: 40px !important;
        padding-bottom: 20px !important;
      }
      
      /* Ensure comments section doesn't get cut off */
      .mb-6:last-child {
        margin-bottom: 60px !important;
        padding-bottom: 40px !important;
      }
      
      /* Force page size and margins */
      @page {
        size: A4 !important;
        margin: 0.5in !important;
      }
      
      /* Ensure all content fits on page */
      * {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
    }
  `;
  document.head.appendChild(style);
}