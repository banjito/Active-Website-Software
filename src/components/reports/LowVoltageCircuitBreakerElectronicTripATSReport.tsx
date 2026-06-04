import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';
import { getPassFailBadgeClass } from '@/lib/reportPassFailStatus';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
    megohmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
    primaryInjectionTestSet: { name: string; serialNumber: string; ampId: string; calDate: string }; // Changed from secondary
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
  headerCell: "px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider whitespace-normal",
  cell: "px-2 py-2 text-sm text-gray-900 dark:text-white whitespace-normal",
  input: "w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white",
  select: "w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white"
};

// Rename component
const LowVoltageCircuitBreakerElectronicTripATSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);
  
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
      megohmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' },
      primaryInjectionTestSet: { name: '', serialNumber: '', ampId: '', calDate: '' } // Changed
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
          customer_id,
          site_address
        `)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData) {
        let customerName = '';
        let customerAddress = maskCustomerAddress((jobData as any).site_address || '');

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
            customerName = maskCustomerName(customerData.company_name || customerData.name || '');
            if (!customerAddress) customerAddress = maskCustomerAddress(customerData.address || '');
          }
        }

        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: maskCustomerName(customerName), // Use "customer" field in FormData
          address: maskCustomerAddress(normalizeAddress(customerAddress)), // normalized address
          // We might need jobTitle later, keep it in mind
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      alert(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!currentReportId) {
        setLoading(false); // Only stop loading if it's a new report
      }
    }
  };

  // --- Load Report ---
  const loadReport = async () => {
    if (!currentReportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    
    // Don't reload if this report was just created via autosave
    if (isAutoSaveCreatedRef.current) {
      setLoading(false);
      return;
    }

    try {
      // First try loading from the normalized JSONB store
      const { data: generic, error: genericErr} = await supabase
        .schema('neta_ops')
        .from('low_voltage_cable_test_3sets')
        .select('*')
        .eq('id', currentReportId)
        .single();

      if (generic && generic.data) {
        const d = generic.data as any;
        setFormData(prev => {
          const updated = {
            ...prev,
            // Job info
            customer: maskCustomerName(d.reportInfo?.customer ?? prev.customer),
            address: maskCustomerAddress(d.reportInfo?.address ?? prev.address),
            user: d.reportInfo?.userName ?? prev.user,
            date: d.reportInfo?.date ?? prev.date,
            identifier: d.reportInfo?.identifier ?? prev.identifier,
            jobNumber: d.reportInfo?.jobNumber ?? prev.jobNumber,
            technicians: d.reportInfo?.technicians ?? prev.technicians,
            temperature: (() => {
              const fahrenheit = d.reportInfo?.temperature?.fahrenheit ?? prev.temperature.fahrenheit;
              const celsius = d.reportInfo?.temperature?.celsius ?? prev.temperature.celsius;
              // Always recalculate TCF based on the temperature values to ensure consistency
              const calculatedCelsius = celsius || (fahrenheit ? Math.round(((fahrenheit - 32) * 5) / 9) : prev.temperature.celsius);
              const calculatedTCF = getTCF(calculatedCelsius);
              
              return {
              ...prev.temperature,
                fahrenheit: fahrenheit || prev.temperature.fahrenheit,
                celsius: calculatedCelsius,
                tcf: calculatedTCF,
              humidity: d.reportInfo?.humidity ?? prev.temperature.humidity,
              };
            })(),
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

            // Visual/mechanical - merge by id, preserve defaults when missing
            visualInspectionItems: Array.isArray(prev.visualInspectionItems)
              ? prev.visualInspectionItems.map(item => ({
              ...item,
              result: (d.visualInspection && d.visualInspection[item.id]) ? d.visualInspection[item.id] : item.result,
                }))
              : prev.visualInspectionItems,

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
          // Recompute tolerance min/max for previously saved reports
          normalizeLoadedPrimaryInjection(updated);
          return updated;
        });
        setIsEditing(false);

        // Also run backfill for generic table loads to ensure all data is populated
        try {
          console.log('=== GENERIC TABLE BACKFILL DEBUG START ===');
          console.log('Running backfill for generic table load, identifier:', d.reportInfo?.identifier);
          const identifier = d.reportInfo?.identifier;
          if (identifier) {
            const { data: genList } = await supabase
              .schema('neta_ops')
              .from('low_voltage_cable_test_3sets')
              .select('*')
              .filter('data->fields->>identifier', 'eq', identifier)
              .ilike('data->>reportType', '%LowVoltageCircuitBreaker%ATS%');

            console.log('Found additional generic rows for backfill:', genList?.length);
            if (genList && genList.length > 0) {
              const genericRow = genList[0] as any;
              const d2 = (genericRow?.data as any) || (genericRow as any);
              const fields = (d2?.data?.fields as any) || (d2?.fields as any);
              
              if (fields) {
                console.log('Backfill fields found:', Object.keys(fields));
                setFormData(prev => {
                  const updated = {
                    ...prev,
                    // Update nameplate data if missing
                    tripUnitType: prev.tripUnitType || fields?.tripUnitType,
                    manufacturer: prev.manufacturer || fields?.manufacturer,
                    catalogNumber: prev.catalogNumber || fields?.catalogNumber,
                    serialNumber: prev.serialNumber || fields?.serialNumber,
                    type: prev.type || fields?.type,
                    frameSize: prev.frameSize || fields?.frameSize,
                    icRating: prev.icRating || fields?.icRating,
                    ratingPlug: prev.ratingPlug || fields?.ratingPlug,
                    curveNo: prev.curveNo || fields?.curveNo,
                    chargeMotorVoltage: prev.chargeMotorVoltage || fields?.chargeMotorVoltage,
                    operation: prev.operation || fields?.operation,
                    mounting: prev.mounting || fields?.mounting,
                    zoneInterlock: prev.zoneInterlock || fields?.zoneInterlock,
                    thermalMemory: prev.thermalMemory || fields?.thermalMemory,
                    
                    // Update other sections if missing
                    visualInspectionItems: (() => {
                      const rows = Array.isArray(fields?.['vm-table']?.rows) ? fields['vm-table'].rows : null;
                      if (rows && rows.length > 0) {
                        const byId: Record<string, any> = {};
                        rows.forEach((row: any) => {
                          if (row && typeof row.id === 'string') byId[row.id] = row;
                        });
                        return prev.visualInspectionItems.map(item => ({
                          ...item,
                          result: byId[item.id]?.result ?? item.result
                        }));
                      }
                      return prev.visualInspectionItems;
                    })(),
                    contactResistance: fields?.breakerContactResistance ? { 
                      ...prev.contactResistance, 
                      p1: fields.breakerContactResistance.p1,
                      p2: fields.breakerContactResistance.p2,
                      p3: fields.breakerContactResistance.p3
                    } : prev.contactResistance,
                    comments: prev.comments || fields?.comments,
                  };
                  console.log('Updated formData with backfill data from generic table');
                  return updated;
                });
              }
            }
          }
        } catch (e) {
          console.warn('Generic table backfill failed:', e);
        }
        console.log('=== GENERIC TABLE BACKFILL DEBUG END ===');
        
        setLoading(false);
        return;
      }

      // Fallback to the dedicated table if not found in generic store
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_circuit_breaker_electronic_trip_ats')
        .select('*')
        .eq('id', currentReportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`Report with ID ${currentReportId} not found. Starting new report.`);
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (data) {
        setFormData(prev => ({
          ...prev,
          customer: maskCustomerName(data.report_info?.customer || prev.customer),
          address: maskCustomerAddress(data.report_info?.address || prev.address),
          user: data.report_info?.user || prev.user,
          date: data.report_info?.date || prev.date,
          identifier: data.report_info?.identifier || prev.identifier,
          jobNumber: data.report_info?.jobNumber || prev.jobNumber,
          technicians: data.report_info?.technicians || prev.technicians,
          temperature: (() => {
            const tempData = data.report_info?.temperature || prev.temperature;
            const fahrenheit = tempData?.fahrenheit ?? prev.temperature.fahrenheit;
            const celsius = tempData?.celsius ?? prev.temperature.celsius;
            // Always recalculate TCF based on the temperature values to ensure consistency
            const calculatedCelsius = celsius || (fahrenheit ? Math.round(((fahrenheit - 32) * 5) / 9) : prev.temperature.celsius);
            const calculatedTCF = getTCF(calculatedCelsius);
            
            return {
              ...prev.temperature,
              fahrenheit: fahrenheit || prev.temperature.fahrenheit,
              celsius: calculatedCelsius,
              tcf: calculatedTCF,
              humidity: tempData?.humidity ?? prev.temperature.humidity,
            };
          })(),
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
          // Visual/mechanical: accept arrays in various legacy shapes and merge by id
          visualInspectionItems: (() => {
            const vm = (data as any).visual_mechanical;
            const vmi = (data as any).visual_mechanical_inspection;
            const vi = (data as any).visualInspection;
            const itemsSource =
              (Array.isArray(vm?.items) && vm.items) ||
              (Array.isArray(vmi?.items) && vmi.items) ||
              (Array.isArray(vmi) && vmi) ||
              (Array.isArray(vm) && vm) ||
              null;
            if (Array.isArray(itemsSource)) {
              const byId: Record<string, any> = {};
              itemsSource.forEach((it: any) => { if (it && typeof it.id === 'string') byId[it.id] = it; });
              return prev.visualInspectionItems.map(item => ({
                ...item,
                result: byId[item.id]?.result ?? item.result
              }));
            }
            if (vi && !Array.isArray(vi)) {
              return prev.visualInspectionItems.map(item => ({
                ...item,
                result: vi[item.id]?.result ?? vi[item.id] ?? item.result
              }));
            }
            return prev.visualInspectionItems;
          })(),
          deviceSettings: data.device_settings || prev.deviceSettings,
          contactResistance: data.contact_resistance || prev.contactResistance,
          insulationResistance: {
            testVoltage: data.insulation_resistance?.testVoltage ?? prev.insulationResistance.testVoltage,
            unit: data.insulation_resistance?.unit ?? prev.insulationResistance.unit,
            measured: {
              poleToPole: {
                p1p2: data.insulation_resistance?.measured?.poleToPole?.p1p2 ?? prev.insulationResistance.measured.poleToPole.p1p2,
                p2p3: data.insulation_resistance?.measured?.poleToPole?.p2p3 ?? prev.insulationResistance.measured.poleToPole.p2p3,
                p3p1: data.insulation_resistance?.measured?.poleToPole?.p3p1 ?? prev.insulationResistance.measured.poleToPole.p3p1,
              },
              poleToFrame: {
                p1: data.insulation_resistance?.measured?.poleToFrame?.p1 ?? prev.insulationResistance.measured.poleToFrame.p1,
                p2: data.insulation_resistance?.measured?.poleToFrame?.p2 ?? prev.insulationResistance.measured.poleToFrame.p2,
                p3: data.insulation_resistance?.measured?.poleToFrame?.p3 ?? prev.insulationResistance.measured.poleToFrame.p3,
              },
              lineToLoad: {
                p1: data.insulation_resistance?.measured?.lineToLoad?.p1 ?? prev.insulationResistance.measured.lineToLoad.p1,
                p2: data.insulation_resistance?.measured?.lineToLoad?.p2 ?? prev.insulationResistance.measured.lineToLoad.p2,
                p3: data.insulation_resistance?.measured?.lineToLoad?.p3 ?? prev.insulationResistance.measured.lineToLoad.p3,
              },
            },
            corrected: (() => {
              // Get the measured values first
              const measured = {
              poleToPole: {
                  p1p2: (data as any)?.insulation_resistance?.measured?.poleToPole?.p1p2 ?? prev.insulationResistance.measured.poleToPole.p1p2,
                  p2p3: (data as any)?.insulation_resistance?.measured?.poleToPole?.p2p3 ?? prev.insulationResistance.measured.poleToPole.p2p3,
                  p3p1: (data as any)?.insulation_resistance?.measured?.poleToPole?.p3p1 ?? prev.insulationResistance.measured.poleToPole.p3p1,
              },
              poleToFrame: {
                  p1: (data as any)?.insulation_resistance?.measured?.poleToFrame?.p1 ?? prev.insulationResistance.measured.poleToFrame.p1,
                  p2: (data as any)?.insulation_resistance?.measured?.poleToFrame?.p2 ?? prev.insulationResistance.measured.poleToFrame.p2,
                  p3: (data as any)?.insulation_resistance?.measured?.poleToFrame?.p3 ?? prev.insulationResistance.measured.poleToFrame.p3,
              },
              lineToLoad: {
                  p1: (data as any)?.insulation_resistance?.measured?.lineToLoad?.p1 ?? prev.insulationResistance.measured.lineToLoad.p1,
                  p2: (data as any)?.insulation_resistance?.measured?.lineToLoad?.p2 ?? prev.insulationResistance.measured.lineToLoad.p2,
                  p3: (data as any)?.insulation_resistance?.measured?.lineToLoad?.p3 ?? prev.insulationResistance.measured.lineToLoad.p3,
                },
              };

              // Calculate corrected values using current TCF
              const calculateCorrectedValue = (value: string): string => {
                if (value === "" || value === null || value === undefined) {
                  return "";
                }
                
                // Check if value contains non-numeric characters (like >, <, letters, etc.)
                const hasNonNumericChars = /[^0-9.-]/.test(value);
                if (hasNonNumericChars) {
                  // If it contains symbols or letters, just return the original value
                  return value;
                }
                
                // If it's a pure number, proceed with TCF calculation
                if (isNaN(Number(value))) {
                  return "";
                }
                
                const numericValue = parseFloat(value);
                const tcf = getTCF(Math.round(((data.report_info?.temperature?.fahrenheit ?? prev.temperature.fahrenheit - 32) * 5) / 9));
                if (!tcf || tcf === 0) return numericValue.toFixed(2);
                return (numericValue * tcf).toFixed(2);
              };

              return {
                poleToPole: {
                  p1p2: calculateCorrectedValue(measured.poleToPole.p1p2),
                  p2p3: calculateCorrectedValue(measured.poleToPole.p2p3),
                  p3p1: calculateCorrectedValue(measured.poleToPole.p3p1),
                },
                poleToFrame: {
                  p1: calculateCorrectedValue(measured.poleToFrame.p1),
                  p2: calculateCorrectedValue(measured.poleToFrame.p2),
                  p3: calculateCorrectedValue(measured.poleToFrame.p3),
                },
                lineToLoad: {
                  p1: calculateCorrectedValue(measured.lineToLoad.p1),
                  p2: calculateCorrectedValue(measured.lineToLoad.p2),
                  p3: calculateCorrectedValue(measured.lineToLoad.p3),
                },
              };
            })(),
          },
          primaryInjection: (data as any)?.primary_injection ? {
            testedSettings: {
              longTime: { ...prev.primaryInjection.testedSettings.longTime, ...((data as any).primary_injection?.testedSettings?.longTime || {}) },
              shortTime: { ...prev.primaryInjection.testedSettings.shortTime, ...((data as any).primary_injection?.testedSettings?.shortTime || {}) },
              instantaneous: { ...prev.primaryInjection.testedSettings.instantaneous, ...((data as any).primary_injection?.testedSettings?.instantaneous || {}) },
              groundFault: { ...prev.primaryInjection.testedSettings.groundFault, ...((data as any).primary_injection?.testedSettings?.groundFault || {}) },
            },
            results: {
              longTime: { ...prev.primaryInjection.results.longTime, ...((data as any).primary_injection?.results?.longTime || {}) },
              shortTime: { ...prev.primaryInjection.results.shortTime, ...((data as any).primary_injection?.results?.shortTime || {}) },
              instantaneous: { ...prev.primaryInjection.results.instantaneous, ...((data as any).primary_injection?.results?.instantaneous || {}) },
              groundFault: { ...prev.primaryInjection.results.groundFault, ...((data as any).primary_injection?.results?.groundFault || {}) },
            },
          } : prev.primaryInjection,
          testEquipment: data.test_equipment || prev.testEquipment,
          comments: data.comments || '',
          status: data.report_info?.status || 'PASS',
        }));
        // Ensure tolerance min/max are normalized for saved records
        setFormData(prev => {
          const cloned = { ...prev } as any;
          normalizeLoadedPrimaryInjection(cloned);
          return cloned;
        });
        setIsEditing(false);

        // Retroactive backfill: if imported JSON exists in generic store keyed by identifier, merge it in
        try {
          console.log('=== BACKFILL DEBUG START ===');
          console.log('Starting retroactive backfill for identifier:', data.report_info?.identifier);
          console.log('Report data loaded:', data);
          const identifier = data.report_info?.identifier;
          if (identifier) {
            const { data: genList } = await supabase
              .schema('neta_ops')
              .from('low_voltage_cable_test_3sets')
              .select('*')
              .filter('data->fields->>identifier', 'eq', identifier)
              .ilike('data->>reportType', '%LowVoltageCircuitBreaker%ATS%');

            console.log('Found generic rows:', genList?.length);
            console.log('Generic rows data:', genList);
            if (genList && genList.length > 0) {
              const genericRow = genList[0] as any;
              console.log('Processing generic row:', genericRow?.id);
              const d = (genericRow?.data as any) || (genericRow as any);
              const rawSections = Array.isArray(d?.sections)
                ? d.sections
                : (Array.isArray(d?.data?.sections) ? d.data.sections : undefined);
              console.log('Raw sections found:', rawSections?.length);
              const rebuildFromSections = (() => {
                if (!rawSections) return undefined;
                const byTitle = (title: string) => rawSections.find((s: any) => (s?.title || '').toLowerCase().includes(title.toLowerCase()));
                const job = byTitle('Job Information');
                const npd = byTitle('Nameplate Data');
                const vm = byTitle('Visual and Mechanical Inspection');
                const dev = byTitle('Device Settings');
                const cr = byTitle('Contact/Pole Resistance');
                const ir = byTitle('Insulation Resistance');
                const pi = byTitle('Primary Injection');
                const te = byTitle('Test Equipment Used');
                const cm = byTitle('Comments');

                const fieldListToObj = (sec: any) => {
                  const obj: any = {};
                  const arr = sec?.fields || [];
                  for (const f of arr) {
                    const label = (f?.label || '').toLowerCase();
                    const v = f?.value;
                    if (label.startsWith('customer')) obj.customer = maskCustomerName(v);
                    else if (label.startsWith('address')) obj.address = maskCustomerAddress(v);
                    else if (label === 'user') obj.user = v;
                    else if (label === 'date') obj.date = v;
                    else if (label.includes('identifier')) obj.identifier = v;
                    else if (label.startsWith('job #')) obj.jobNumber = v;
                    else if (label.startsWith('technicians')) obj.technicians = v;
                    else if (label.includes('temp')) obj.temperatureF = v;
                    else if (label.includes('humidity')) obj.humidity = v;
                    else if (label.includes('substation')) obj.substation = v;
                    else if (label.includes('eqpt')) obj.eqptLocation = v;
                    else if (label === 'manufacturer') obj.manufacturer = v;
                    else if (label === 'catalog number') obj.catalogNumber = v;
                    else if (label === 'serial number') obj.serialNumber = v;
                    else if (label === 'type') obj.type = v;
                    else if (label.startsWith('frame size')) obj.frameSize = v;
                    else if (label.startsWith('i.c. rating')) obj.icRating = v;
                    else if (label === 'trip unit type') obj.tripUnitType = v;
                    else if (label.startsWith('rating plug')) obj.ratingPlug = v;
                    else if (label.startsWith('curve')) obj.curveNo = v;
                    else if (label.startsWith('charge motor v')) obj.chargeMotorVoltage = v;
                    else if (label === 'operation') obj.operation = v;
                    else if (label === 'mounting') obj.mounting = v;
                    else if (label === 'zone interlock') obj.zoneInterlock = v;
                    else if (label === 'thermal memory') obj.thermalMemory = v;
                  }
                  return obj;
                };

                const fieldsFromSections: any = fieldListToObj(job);
                Object.assign(fieldsFromSections, fieldListToObj(npd));
                console.log('Job and nameplate fields:', Object.keys(fieldsFromSections));
                const vmField = vm?.fields?.find((f: any) => (f?.type === 'table'));
                if (vmField?.value?.rows) fieldsFromSections['vm-table'] = { rows: vmField.value.rows };
                console.log('VM table found:', !!vmField?.value?.rows);
                const devField = dev?.fields?.find((f: any) => f?.type === 'table');
                if (devField?.value) fieldsFromSections.deviceSettings = devField.value;
                console.log('Device settings found:', !!devField?.value);
                const crField = cr?.fields?.find((f: any) => (f?.label || '').toLowerCase().includes('contact resistance'));
                if (crField?.value) fieldsFromSections.breakerContactResistance = crField.value;
                console.log('Contact resistance found:', !!crField?.value);
                const irField = ir?.fields?.find((f: any) => (f?.label || '').toLowerCase().includes('insulation resistance'));
                if (irField?.value) fieldsFromSections.contactorInsulation = irField.value;
                console.log('Insulation resistance found:', !!irField?.value);
                const piField = pi?.fields?.find((f: any) => (f?.label || '').toLowerCase().includes('primary injection'));
                if (piField?.value) fieldsFromSections.primaryInjection = piField.value;
                console.log('Primary injection found:', !!piField?.value);
                const teField = te?.fields?.find((f: any) => (f?.type === 'table'));
                if (teField?.value) fieldsFromSections.testEquipment3 = teField.value;
                console.log('Test equipment found:', !!teField?.value);
                const cmField = cm?.fields?.find((f: any) => (f?.label || '').toLowerCase() === 'comments');
                if (cmField?.value != null) fieldsFromSections.comments = cmField.value;
                console.log('Comments found:', cmField?.value != null);
                return fieldsFromSections;
              })();
              // Prefer data.fields if available, otherwise use sections reconstruction
              const fields = (d?.data?.fields as any) || (d?.fields as any) || rebuildFromSections;

              console.log('Final fields object:', fields ? Object.keys(fields) : 'none');
              console.log('Trip Unit Type in fields:', fields?.tripUnitType);
              console.log('All nameplate fields:', {
                manufacturer: fields?.manufacturer,
                catalogNumber: fields?.catalogNumber,
                serialNumber: fields?.serialNumber,
                type: fields?.type,
                frameSize: fields?.frameSize,
                icRating: fields?.icRating,
                tripUnitType: fields?.tripUnitType,
                ratingPlug: fields?.ratingPlug,
                curveNo: fields?.curveNo,
                chargeMotorVoltage: fields?.chargeMotorVoltage,
                operation: fields?.operation,
                mounting: fields?.mounting,
                zoneInterlock: fields?.zoneInterlock,
                thermalMemory: fields?.thermalMemory,
              });
              if (fields || d) {
                setFormData(prev => {
                  const updated = {
                    ...prev,
                    customer: fields?.customer ?? prev.customer,
                    address: fields?.address ?? prev.address,
                    user: fields?.user ?? prev.user,
                    date: fields?.date ?? prev.date,
                    identifier: fields?.identifier ?? prev.identifier,
                    jobNumber: fields?.jobNumber ?? prev.jobNumber,
                    technicians: fields?.technicians ?? prev.technicians,
                    temperature: {
                      ...prev.temperature,
                      fahrenheit: fields?.temperatureF != null ? Number(fields.temperatureF) : prev.temperature.fahrenheit,
                      celsius: fields?.temperatureF != null ? Math.round(((Number(fields.temperatureF) - 32) * 5) / 9) : prev.temperature.celsius,
                      tcf: fields?.temperatureF != null ? getTCF(Math.round(((Number(fields.temperatureF) - 32) * 5) / 9)) : prev.temperature.tcf,
                      humidity: fields?.humidity ?? prev.temperature.humidity,
                    },
                    substation: fields?.substation ?? prev.substation,
                    eqptLocation: fields?.eqptLocation ?? prev.eqptLocation,
                    manufacturer: fields?.manufacturer ?? prev.manufacturer,
                    catalogNumber: fields?.catalogNumber ?? prev.catalogNumber,
                    serialNumber: fields?.serialNumber ?? prev.serialNumber,
                    type: fields?.type ?? prev.type,
                    frameSize: fields?.frameSize ?? prev.frameSize,
                    icRating: fields?.icRating ?? prev.icRating,
                    tripUnitType: fields?.tripUnitType ?? prev.tripUnitType,
                    ratingPlug: fields?.ratingPlug ?? prev.ratingPlug,
                    curveNo: fields?.curveNo ?? prev.curveNo,
                    chargeMotorVoltage: fields?.chargeMotorVoltage ?? prev.chargeMotorVoltage,
                    operation: fields?.operation ?? prev.operation,
                    mounting: fields?.mounting ?? prev.mounting,
                    zoneInterlock: fields?.zoneInterlock ?? prev.zoneInterlock,
                    thermalMemory: fields?.thermalMemory ?? prev.thermalMemory,
                    visualInspectionItems: Array.isArray(fields?.['vm-table']?.rows)
                      ? fields['vm-table'].rows.map((row: any) => ({ id: row.id ?? '', description: row.description ?? '', result: row.result ?? '' }))
                      : prev.visualInspectionItems,
                    deviceSettings: (fields?.deviceSettings && Object.keys(fields.deviceSettings).length > 0) ? fields.deviceSettings : prev.deviceSettings,
                    contactResistance: fields?.breakerContactResistance ? { 
                      ...prev.contactResistance, 
                      p1: fields.breakerContactResistance.p1,
                      p2: fields.breakerContactResistance.p2,
                      p3: fields.breakerContactResistance.p3
                    } : prev.contactResistance,
                    insulationResistance: (() => {
                      const ir = { ...prev.insulationResistance };
                      const src = fields?.contactorInsulation;
                      if (src) {
                        ir.testVoltage = src.testVoltage ?? ir.testVoltage;
                        const rows = Array.isArray(src.rows) ? src.rows : [];
                        const findRow = (name: string) => rows.find((r: any) => typeof r.id === 'string' && r.id.toLowerCase().includes(name));
                        const rowPTP = findRow('pole to pole');
                        const rowPTF = findRow('pole to frame');
                        const rowLTL = findRow('line to load');
                        if (rowPTP) {
                          ir.measured.poleToPole = { p1p2: rowPTP.p1 ?? ir.measured.poleToPole.p1p2, p2p3: rowPTP.p2 ?? ir.measured.poleToPole.p2p3, p3p1: rowPTP.p3 ?? ir.measured.poleToPole.p3p1 };
                          // Calculate corrected values using current TCF instead of using stored values
                          const calculateCorrectedValue = (value: string): string => {
                            if (value === "" || value === null || value === undefined) {
                              return "";
                            }
                            
                            // Check if value contains non-numeric characters (like >, <, letters, etc.)
                            const hasNonNumericChars = /[^0-9.-]/.test(value);
                            if (hasNonNumericChars) {
                              // If it contains symbols or letters, just return the original value
                              return value;
                            }
                            
                            // If it's a pure number, proceed with TCF calculation
                            if (isNaN(Number(value))) {
                              return "";
                            }
                            
                            const numericValue = parseFloat(value);
                            const tcf = getTCF(Math.round(((fields?.temperatureF ?? prev.temperature.fahrenheit - 32) * 5) / 9));
                            if (!tcf || tcf === 0) return numericValue.toFixed(2);
                            return (numericValue * tcf).toFixed(2);
                          };
                          ir.corrected.poleToPole = { 
                            p1p2: calculateCorrectedValue(rowPTP.p1 ?? ir.measured.poleToPole.p1p2), 
                            p2p3: calculateCorrectedValue(rowPTP.p2 ?? ir.measured.poleToPole.p2p3), 
                            p3p1: calculateCorrectedValue(rowPTP.p3 ?? ir.measured.poleToPole.p3p1) 
                          };
                        }
                        if (rowPTF) {
                          ir.measured.poleToFrame = { p1: rowPTF.p1 ?? ir.measured.poleToFrame.p1, p2: rowPTF.p2 ?? ir.measured.poleToFrame.p2, p3: rowPTF.p3 ?? ir.measured.poleToFrame.p3 };
                          // Calculate corrected values using current TCF instead of using stored values
                          const calculateCorrectedValue = (value: string): string => {
                            if (value === "" || value === null || value === undefined) {
                              return "";
                            }
                            
                            // Check if value contains non-numeric characters (like >, <, letters, etc.)
                            const hasNonNumericChars = /[^0-9.-]/.test(value);
                            if (hasNonNumericChars) {
                              // If it contains symbols or letters, just return the original value
                              return value;
                            }
                            
                            // If it's a pure number, proceed with TCF calculation
                            if (isNaN(Number(value))) {
                              return "";
                            }
                            
                            const numericValue = parseFloat(value);
                            const tcf = getTCF(Math.round(((fields?.temperatureF ?? prev.temperature.fahrenheit - 32) * 5) / 9));
                            if (!tcf || tcf === 0) return numericValue.toFixed(2);
                            return (numericValue * tcf).toFixed(2);
                          };
                          ir.corrected.poleToFrame = { 
                            p1: calculateCorrectedValue(rowPTF.p1 ?? ir.measured.poleToFrame.p1), 
                            p2: calculateCorrectedValue(rowPTF.p2 ?? ir.measured.poleToFrame.p2), 
                            p3: calculateCorrectedValue(rowPTF.p3 ?? ir.measured.poleToFrame.p3) 
                          };
                        }
                        if (rowLTL) {
                          ir.measured.lineToLoad = { p1: rowLTL.p1 ?? ir.measured.lineToLoad.p1, p2: rowLTL.p2 ?? ir.measured.lineToLoad.p2, p3: rowLTL.p3 ?? ir.measured.lineToLoad.p3 };
                          // Calculate corrected values using current TCF instead of using stored values
                          const calculateCorrectedValue = (value: string): string => {
                            if (value === "" || value === null || value === undefined) {
                              return "";
                            }
                            
                            // Check if value contains non-numeric characters (like >, <, letters, etc.)
                            const hasNonNumericChars = /[^0-9.-]/.test(value);
                            if (hasNonNumericChars) {
                              // If it contains symbols or letters, just return the original value
                              return value;
                            }
                            
                            // If it's a pure number, proceed with TCF calculation
                            if (isNaN(Number(value))) {
                              return "";
                            }
                            
                            const numericValue = parseFloat(value);
                            const tcf = getTCF(Math.round(((fields?.temperatureF ?? prev.temperature.fahrenheit - 32) * 5) / 9));
                            if (!tcf || tcf === 0) return numericValue.toFixed(2);
                            return (numericValue * tcf).toFixed(2);
                          };
                          ir.corrected.lineToLoad = { 
                            p1: calculateCorrectedValue(rowLTL.p1 ?? ir.measured.lineToLoad.p1), 
                            p2: calculateCorrectedValue(rowLTL.p2 ?? ir.measured.lineToLoad.p2), 
                            p3: calculateCorrectedValue(rowLTL.p3 ?? ir.measured.lineToLoad.p3) 
                          };
                        }
                      }
                      return ir;
                    })(),
                    primaryInjection: (fields?.primaryInjection && Object.keys(fields.primaryInjection).length > 0) ? {
                      ...prev.primaryInjection,
                      testedSettings: {
                        longTime: { ...prev.primaryInjection.testedSettings.longTime, ...(fields?.primaryInjection?.testedSettings?.longTime || {}) },
                        shortTime: { ...prev.primaryInjection.testedSettings.shortTime, ...(fields?.primaryInjection?.testedSettings?.shortTime || {}) },
                        instantaneous: { ...prev.primaryInjection.testedSettings.instantaneous, ...(fields?.primaryInjection?.testedSettings?.instantaneous || {}) },
                        groundFault: { ...prev.primaryInjection.testedSettings.groundFault, ...(fields?.primaryInjection?.testedSettings?.groundFault || {}) },
                      },
                      results: {
                        longTime: { ...prev.primaryInjection.results.longTime, ...(fields?.primaryInjection?.results?.longTime || {}) },
                        shortTime: { ...prev.primaryInjection.results.shortTime, ...(fields?.primaryInjection?.results?.shortTime || {}) },
                        instantaneous: { ...prev.primaryInjection.results.instantaneous, ...(fields?.primaryInjection?.results?.instantaneous || {}) },
                        groundFault: { ...prev.primaryInjection.results.groundFault, ...(fields?.primaryInjection?.results?.groundFault || {}) },
                      }
                    } : prev.primaryInjection,
                    testEquipment: (() => {
                      const te = fields?.testEquipment3 || fields?.testEquipment;
                      if (!te || Object.keys(te).length === 0) return prev.testEquipment;
                      return {
                        megohmmeter: { ...prev.testEquipment.megohmmeter, ...(te?.megohmmeter || {}) },
                        lowResistanceOhmmeter: { ...prev.testEquipment.lowResistanceOhmmeter, ...(te?.lowResistanceOhmmeter || {}) },
                        primaryInjectionTestSet: { ...prev.testEquipment.primaryInjectionTestSet, ...(te?.primaryInjectionTestSet || {}) },
                      };
                    })(),
                    comments: fields?.comments ?? prev.comments,
                  };
                  console.log('Updated formData with backfilled data');
                  console.log('Trip Unit Type from fields:', fields?.tripUnitType);
                  console.log('Trip Unit Type in updated formData:', updated.tripUnitType);
                  return updated;
                });
              }
            }
          }
        } catch (e) {
          console.warn('Backfill lookup failed:', e);
          console.error('Backfill error details:', e);
        }
        console.log('=== BACKFILL DEBUG END ===');
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  // --- Autosave Function ---
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id || !isEditing || isAutoSaving) return;

    setIsAutoSaving(true);
    
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
      primary_injection: formData.primaryInjection,
      test_equipment: formData.testEquipment,
      comments: formData.comments
    };

    try {
      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats')
          .update(reportPayload)
          .eq('id', reportIdRef.current)
          .select();
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema('neta_ops')
            .from('low_voltage_circuit_breaker_electronic_trip_ats')
            .insert(reportPayload)
            .select()
            .maybeSingle();

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;
            isAutoSaveCreatedRef.current = true;
            setCurrentReportId(newReportId);

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
              file_url: `report:/jobs/${jobId}/low-voltage-circuit-breaker-electronic-trip-ats-report/${newReportId}`,
              user_id: user.id
            };

            const { data: assetResult, error: assetError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select()
              .single();

            if (!assetError && assetResult) {
              await supabase
                .schema('neta_ops')
                .from('job_assets')
                .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
            }

            window.history.replaceState({}, '', `/jobs/${jobId}/low-voltage-circuit-breaker-electronic-trip-ats-report/${newReportId}`);
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (error: any) {
      console.error('Autosave error:', error);
    } finally {
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, isEditing, isAutoSaving, formData, reportSlug]);

  // Autosave effect - triggers after user stops typing for 2 seconds
  React.useEffect(() => {
    if (!isEditing || loading) return;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer - save immediately after each input
    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500); // 500ms debounce for immediate feel

    // Cleanup
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, isEditing, loading, autoSave]);

  // --- Save Report ---
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    // Structure data for Supabase JSONB columns
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
      if (currentReportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new table name
          .update(reportPayload)
          .eq('id', currentReportId)
          .select()
          .maybeSingle();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new table name
          .insert(reportPayload)
          .select()
          .maybeSingle();

        // Create asset entry for the new report
        let newReportId = result.data?.id;
        if (!result.error && !newReportId) {
          // Fallback fetch if RLS prevents returning row on insert
          const { data: fetched } = await supabase
            .schema('neta_ops')
            .from('low_voltage_circuit_breaker_electronic_trip_ats')
            .select('id')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          newReportId = fetched?.id;
        }
        if (newReportId) {
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
            .maybeSingle();

          if (assetError) throw assetError;

          // Link asset to job
          if (assetResult?.id) {
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
      }

      if (result.error) throw result.error;

      setIsEditing(false); // Exit editing mode
      alert(`Report ${currentReportId ? 'updated' : 'saved'} successfully!`);
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
    if (currentReportId) {
      loadReport(); // Load existing report if currentReportId exists
    } else {
      setLoading(false); // If no currentReportId, stop loading (new report)
      setIsEditing(true); // Start in edit mode for new reports
    }
  }, [jobId, currentReportId]); // Dependencies

  // Ensure formData is properly initialized
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      visualInspectionItems: Array.isArray(prev.visualInspectionItems) ? prev.visualInspectionItems : [
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
        { id: '7.6.1.2.A.14', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
        { id: '7.6.1.2.A.15', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
        { id: '7.6.1.2.A.16', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
        { id: '7.6.1.2.A.17', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
        { id: '7.6.1.2.A.18', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
        { id: '7.6.1.2.A.19', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
        { id: '7.6.1.2.A.20', description: 'Verify that all devices are free from the accumulation of dust and other foreign matter.', result: '' },
      ]
    }));
  }, []); // Run once on mount

  // Auto-calculate TCF when temperature values change (for imported reports)
  useEffect(() => {
    setFormData(prev => {
      const currentCelsius = prev.temperature.celsius;
      const currentFahrenheit = prev.temperature.fahrenheit;
      const currentTCF = prev.temperature.tcf;
      
      // Recalculate TCF if we have a valid temperature
      if (currentCelsius !== null && currentCelsius !== undefined && !isNaN(currentCelsius)) {
        const calculatedTCF = getTCF(currentCelsius);
        // Only update if the TCF is different to avoid infinite loops
        if (calculatedTCF !== currentTCF) {
          return {
            ...prev,
            temperature: {
              ...prev.temperature,
              tcf: calculatedTCF
            }
          };
        }
      }
      
      return prev; // No changes needed
    });
  }, [formData.temperature.fahrenheit, formData.temperature.celsius]); // Trigger when temperature changes

  // Auto-recalculate corrected values when TCF changes (for imported reports)
  useEffect(() => {
    const calculateCorrectedValue = (value: string): string => {
      if (value === "" || value === null || value === undefined) {
        return "";
      }
      
      // Check if value contains non-numeric characters (like >, <, letters, etc.)
      const hasNonNumericChars = /[^0-9.-]/.test(value);
      if (hasNonNumericChars) {
        // If it contains symbols or letters, just return the original value
        return value;
      }
      
      // If it's a pure number, proceed with TCF calculation
      if (isNaN(Number(value))) {
        return "";
      }
      
      const numericValue = parseFloat(value);
      const tcf = formData.temperature.tcf;
      // Handle cases where tcf might be zero or invalid
      if (!tcf || tcf === 0) return numericValue.toFixed(2);
      return (numericValue * tcf).toFixed(2);
    };

    setFormData(prev => {
      const newCorrected = {
        poleToPole: {
          p1p2: calculateCorrectedValue(prev.insulationResistance.measured.poleToPole.p1p2),
          p2p3: calculateCorrectedValue(prev.insulationResistance.measured.poleToPole.p2p3),
          p3p1: calculateCorrectedValue(prev.insulationResistance.measured.poleToPole.p3p1),
        },
        poleToFrame: {
          p1: calculateCorrectedValue(prev.insulationResistance.measured.poleToFrame.p1),
          p2: calculateCorrectedValue(prev.insulationResistance.measured.poleToFrame.p2),
          p3: calculateCorrectedValue(prev.insulationResistance.measured.poleToFrame.p3),
        },
        lineToLoad: {
          p1: calculateCorrectedValue(prev.insulationResistance.measured.lineToLoad.p1),
          p2: calculateCorrectedValue(prev.insulationResistance.measured.lineToLoad.p2),
          p3: calculateCorrectedValue(prev.insulationResistance.measured.lineToLoad.p3),
        }
      };

      return {
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          corrected: newCorrected
        }
      };
    });
  }, [formData.temperature.tcf]); // Trigger when TCF changes

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
      if (value === "" || value === null || value === undefined) {
          return "";
      }
      
      // Check if value contains non-numeric characters (like >, <, letters, etc.)
      const hasNonNumericChars = /[^0-9.-]/.test(value);
      if (hasNonNumericChars) {
        // If it contains symbols or letters, just return the original value
        return value;
      }
      
      // If it's a pure number, proceed with TCF calculation
      if (isNaN(Number(value))) {
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
            // Recompute based on current tolerance % using bottom testAmperes2
            recomputeBottomTolerance(newState, section as SectionKey);
            // Also respect editable multiplier to derive top-row test amperes
            recomputeTopFromMultiplier(newState, section as SectionKey);
          }
        }
      }

      // If user edits bottom row testAmperes2 or tolerance %, recompute min/max dynamically
      if (path.includes('primaryInjection.results.')) {
        const section: SectionKey | null = path.includes('longTime') ? 'longTime'
          : path.includes('shortTime') ? 'shortTime'
          : path.includes('instantaneous') ? 'instantaneous'
          : path.includes('groundFault') ? 'groundFault'
          : null;
        if (section && (path.endsWith('.testAmperes2') || path.endsWith('.toleranceMin') || path.endsWith('.toleranceMax'))) {
          recomputeBottomTolerance(newState, section);
        }
        // If user edits the multiplier, recompute the top-row test amperes
        if (section && path.endsWith('.multiplier')) {
          recomputeTopFromMultiplier(newState, section);
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

  // Parse a percent string like "-10%" or "10" into decimal (-0.10, 0.10)
  const parsePercent = (val?: string): number => {
    if (!val) return 0;
    const cleaned = `${val}`.toString().replace(/%/g, '').trim();
    const num = Number(cleaned);
    if (!isFinite(num)) return 0;
    return num / 100;
  };

  type SectionKey = 'longTime' | 'shortTime' | 'instantaneous' | 'groundFault';

  // Recompute top-row test amperes from ratedAmperes1 and editable multiplier
  const recomputeTopFromMultiplier = (state: any, section: SectionKey) => {
    const res = state?.primaryInjection?.results?.[section];
    if (!res) return;
    const rated = Number(res.ratedAmperes1);
    const multPct = parsePercent(res.multiplier);
    if (!isFinite(rated) || !isFinite(multPct) || multPct === 0) {
      // For instantaneous allow blank; others clear if invalid
      res.testAmperes1 = section === 'instantaneous' ? (res.testAmperes1 || '') : '';
      return;
    }
    res.testAmperes1 = (rated * multPct).toFixed(1);
  };

  // Recompute bottom-row tolerance min/max based on bottom-row testAmperes2 and tolerance % inputs
  const recomputeBottomTolerance = (state: any, section: SectionKey) => {
    const res = state?.primaryInjection?.results?.[section];
    if (!res) return;
    const test2 = Number(res.testAmperes2);
    if (!isFinite(test2)) {
      res.toleranceMin2 = '';
      res.toleranceMax2 = '';
      return;
    }
    const minPct = parsePercent(res.toleranceMin);
    const maxPct = parsePercent(res.toleranceMax);
    res.toleranceMin2 = (test2 * (1 + minPct)).toFixed(1);
    res.toleranceMax2 = (test2 * (1 + maxPct)).toFixed(1);
  };

  // Normalize previously saved reports after load
  const normalizeLoadedPrimaryInjection = (state: any) => {
    try {
      const sections: SectionKey[] = ['longTime', 'shortTime', 'instantaneous', 'groundFault'];
      sections.forEach(sec => recomputeBottomTolerance(state, sec));
    } catch (_) {}
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><LoadingSpinner size="md" /></div>;
  }

  // Create header function
  const renderHeader = () => (
    <div className="print:hidden flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        8-Low Voltage Circuit Breaker Electronic Trip Unit ATS
      </h1>
      <div className="flex gap-2 items-center">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          ✓ Auto Saving Enabled
        </span>
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
        {currentReportId && !isEditing ? (
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
              className={`pass-fail-status-box ${getPassFailBadgeClass(formData.status)}`}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                width: 'fit-content',
                borderRadius: '6px',
                boxSizing: 'border-box',
                minWidth: '50px',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
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
          <div className="flex gap-2 items-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              ✓ Auto Saving Enabled
            </span>
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
            {currentReportId && !isEditing ? (
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
              <div><label className="form-label">Customer:</label><input type="text" value={maskCustomerName(formData.customer)} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
              <div className="md:col-span-2"><label htmlFor="address" className="form-label">Address:</label><input id="address" type="text" value={maskCustomerAddress(formData.address)} onChange={(e) => handleChange('address', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
              <div><label htmlFor="technicians" className="form-label">Technicians:</label><input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label htmlFor="date" className="form-label">Date:</label><input id="date" type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label htmlFor="identifier" className="form-label">Identifier:</label><input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div className="flex items-center space-x-1">
                  <div>
                  <label htmlFor="temperature.fahrenheit" className="form-label">Temp:</label>
                  <input id="temperature.fahrenheit" type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  <span className="ml-1 text-xs">°F</span>
                      </div>
                  <div>
                  <label htmlFor="temperature.celsius" className="form-label sr-only">Celsius</label>
                  <input id="temperature.celsius" type="number" value={formData.temperature.celsius} onChange={(e) => handleCelsiusChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  <span className="ml-1 text-xs">°C</span>
                      </div>
                      </div>
              <div><label htmlFor="temperature.tcf" className="form-label">TCF:</label><input id="temperature.tcf" type="number" value={formData.temperature.tcf} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-16" /></div>
              <div><label htmlFor="temperature.humidity" className="form-label">Humidity:</label><input id="temperature.humidity" type="number" value={formData.temperature.humidity || ''} onChange={(e) => handleChange('temperature.humidity', e.target.value === '' ? null : Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /><span className="ml-1 text-xs">%</span></div>
              <div><label htmlFor="substation" className="form-label">Substation:</label><input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label><input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div className="md:col-span-2"><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                      </div>

              {/* Print-only compact job info table matching standardized layout */}
              <div className="hidden print:block">
                <table className="w-full border-collapse border border-gray-300 print:border-black">
                  <tbody>
                    <tr>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Customer:</div>
                        <div className="mt-1">{maskCustomerName(formData.customer)}</div>
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
                        <div className="mt-1">{formData.date ? (new Date(formData.date + 'T00:00:00')).toLocaleDateString() : ''}</div>
                      </td>
                      <td className="p-3 align-top border border-gray-300 print:border-black">
                        <div className="font-semibold">Identifier:</div>
                        <div className="mt-1">{formData.identifier}</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 align-top border border-gray-300 print:border-black lvcb-ats-address-cell">
                        <div className="font-semibold">Address:</div>
                        <div className="mt-1 lvcb-ats-address-value">{maskCustomerAddress(normalizeAddress(formData.address))}</div>
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
            {/* Screen-only editable block */}
            <div className="print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label htmlFor="manufacturer" className="form-label">Manufacturer:</label><input id="manufacturer" type="text" value={formData.manufacturer} onChange={(e) => handleChange('manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="catalogNumber" className="form-label">Catalog Number:</label><input id="catalogNumber" type="text" value={formData.catalogNumber} onChange={(e) => handleChange('catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="serialNumber" className="form-label">Serial Number:</label><input id="serialNumber" type="text" value={formData.serialNumber} onChange={(e) => handleChange('serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="type" className="form-label">Type:</label><input id="type" type="text" value={formData.type} onChange={(e) => handleChange('type', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="frameSize" className="form-label">Frame Size (A):</label><input id="frameSize" type="text" value={formData.frameSize} onChange={(e) => handleChange('frameSize', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="icRating" className="form-label">I.C. Rating (kA):</label><input id="icRating" type="text" value={formData.icRating} onChange={(e) => handleChange('icRating', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="tripUnitType" className="form-label">Trip Unit Type:</label><input id="tripUnitType" type="text" value={formData.tripUnitType} onChange={(e) => handleChange('tripUnitType', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="ratingPlug" className="form-label">Rating Plug (A):</label><input id="ratingPlug" type="text" value={formData.ratingPlug} onChange={(e) => handleChange('ratingPlug', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="curveNo" className="form-label">Curve No.:</label><input id="curveNo" type="text" value={formData.curveNo} onChange={(e) => handleChange('curveNo', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="chargeMotorVoltage" className="form-label">Charge Motor V:</label><input id="chargeMotorVoltage" type="text" value={formData.chargeMotorVoltage} onChange={(e) => handleChange('chargeMotorVoltage', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="operation" className="form-label">Operation:</label><input id="operation" type="text" value={formData.operation} onChange={(e) => handleChange('operation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="mounting" className="form-label">Mounting:</label><input id="mounting" type="text" value={formData.mounting} onChange={(e) => handleChange('mounting', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="zoneInterlock" className="form-label">Zone Interlock:</label><input id="zoneInterlock" type="text" value={formData.zoneInterlock} onChange={(e) => handleChange('zoneInterlock', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
                <div><label htmlFor="thermalMemory" className="form-label">Thermal Memory:</label><input id="thermalMemory" type="text" value={formData.thermalMemory} onChange={(e) => handleChange('thermalMemory', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              </div>
            </div>

            {/* Print-only compact table with header */}
            <div className="hidden print:block print:mt-2">
              <h2 className="text-xl font-semibold mb-2 text-black border-b border-black pb-2 font-bold">Nameplate Data</h2>
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem] nameplate-print-table">
                <colgroup>
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Manufacturer:</div><div className="mt-0">{formData.manufacturer}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Catalog No.:</div><div className="mt-0">{formData.catalogNumber}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Serial Number:</div><div className="mt-0">{formData.serialNumber}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Type:</div><div className="mt-0">{formData.type}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Frame Size (A):</div><div className="mt-0">{formData.frameSize}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">I.C. Rating (kA):</div><div className="mt-0">{formData.icRating}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Trip Unit Type:</div><div className="mt-0">{formData.tripUnitType}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Rating Plug (A):</div><div className="mt-0">{formData.ratingPlug}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Curve No.:</div><div className="mt-0">{formData.curveNo}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Charge Motor V:</div><div className="mt-0">{formData.chargeMotorVoltage}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Operation:</div><div className="mt-0">{formData.operation}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Mounting:</div><div className="mt-0">{formData.mounting}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Zone Interlock:</div><div className="mt-0">{formData.zoneInterlock}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Thermal Memory:</div><div className="mt-0">{formData.thermalMemory}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Visual and Mechanical Inspection Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
                <colgroup>
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '65%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">NETA Section</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Description</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Results</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {(Array.isArray(formData.visualInspectionItems) ? formData.visualInspectionItems : []).map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white">{item.id}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white">{item.description}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                        <div className="print:hidden">
                          <select
                            value={item.result}
                            onChange={(e) => handleChange(`visualInspectionItems[${index}].result`, e.target.value)}
                            disabled={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          >
                            <option value=""></option>
                            {visualInspectionResultsOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">{item.result || ''}</div>
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
                    <thead className="bg-gray-50 dark:bg-dark-150">
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
                              value={formData.deviceSettings?.asFound?.[settingType]?.setting || ''}
                              onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.setting`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            <input
                              type="text"
                              value={formData.deviceSettings?.asFound?.[settingType]?.delay || ''}
                              onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.delay`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            {settingType === 'shortTime' || settingType === 'groundFault' ? (
                              <select
                                value={formData.deviceSettings?.asFound?.[settingType]?.i2t || ''}
                                onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.i2t`, e.target.value)}
                                disabled={!isEditing}
                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                              >
                                {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value=""
                                readOnly
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
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
                    <thead className="bg-gray-50 dark:bg-dark-150">
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
                              value={formData.deviceSettings?.asLeft?.[settingType]?.setting || ''}
                              onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.setting`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            <input
                              type="text"
                              value={formData.deviceSettings?.asLeft?.[settingType]?.delay || ''}
                              onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.delay`, e.target.value)}
                              readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            />
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                            {settingType === 'shortTime' || settingType === 'groundFault' ? (
                              <select
                                value={formData.deviceSettings?.asLeft?.[settingType]?.i2t || ''}
                                onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.i2t`, e.target.value)}
                                disabled={!isEditing}
                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                              >
                                {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value=""
                                readOnly
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
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
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-150">
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
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p2}
                        onChange={(e) => handleChange('contactResistance.p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.contactResistance.p3}
                        onChange={(e) => handleChange('contactResistance.p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <select
                        value={formData.contactResistance.unit}
                        onChange={(e) => handleChange('contactResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
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
              <label htmlFor="insulationTestVoltage" className="form-label mr-2 dark:text-white">Test Voltage:</label>
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
                <thead className="bg-gray-50 dark:bg-dark-150">
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
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p2p3}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p3p1}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
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
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p2}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p3}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
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
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p2}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                      />
                    </td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p3}
                        readOnly
                        className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
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
                  <thead className="bg-gray-50 dark:bg-dark-150">
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
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.primaryInjection.testedSettings[settingType]?.delay || ''}
                            onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.delay`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          {settingType === 'shortTime' || settingType === 'groundFault' ? (
                            <select
                              value={formData.primaryInjection.testedSettings[settingType]?.i2t || ''}
                              onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.i2t`, e.target.value)}
                              disabled={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            >
                              {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value=""
                              readOnly
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
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
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600 primary-injection-table primary-injection-main-table">
                <colgroup>
                  {/* widths sum to 100% so cross-browser print layouts stay
                      consistent (otherwise Chrome/Win shrinks the last col) */}
                  <col style={{ width: isPrintMode ? '12%' : '11%' }} /> {/* Function */}
                  <col style={{ width: isPrintMode ? '12%' : '13%' }} /> {/* Rated Amperes */}
                  <col style={{ width: isPrintMode ? '10%' : '10%' }} /> {/* Multiplier % Left */}
                  <col style={{ width: isPrintMode ? '10%' : '10%' }} /> {/* Multiplier % Right */}
                  <col style={{ width: isPrintMode ? '15%' : '15%' }} /> {/* Test Amperes */}
                  <col style={{ width: isPrintMode ? '20.5%' : '20.5%' }} /> {/* Tolerance Min */}
                  <col style={{ width: isPrintMode ? '20.5%' : '20.5%' }} /> {/* Tolerance Max */}
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" rowSpan={2}>Function</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" rowSpan={2}>Rated Amperes</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" colSpan={2}>Multiplier %</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" rowSpan={2}>Test Amperes</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" colSpan={2}>Tolerance</th>
                  </tr>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap"></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Min</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Max</th>
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
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.longTime.multiplier || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.longTime.multiplier', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>LTPU</td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.longTime.toleranceMin || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.longTime.toleranceMin', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.longTime.toleranceMax || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.longTime.toleranceMax', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>

                  {/* Short Time */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Short Time</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.shortTime.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.shortTime.multiplier || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.shortTime.multiplier', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>STPU</td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.shortTime.toleranceMin || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.shortTime.toleranceMin', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.shortTime.toleranceMax || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.shortTime.toleranceMax', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>

                  {/* Instantaneous */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Instantaneous</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.instantaneous.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.instantaneous.multiplier || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.instantaneous.multiplier', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
                    <td className={tableStyles.cell}></td>
                    <td className={tableStyles.cell}></td>
                    <td className={tableStyles.cell}></td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>IPU</td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.instantaneous.toleranceMin || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.instantaneous.toleranceMin', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.instantaneous.toleranceMax || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.instantaneous.toleranceMax', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>

                  {/* Ground Fault */}
                  <tr>
                    <td className={tableStyles.cell} rowSpan={2}>Ground Fault</td>
                    <td className={tableStyles.cell}>
                      <input type="text" value={formData.primaryInjection.results.groundFault.ratedAmperes1 || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.ratedAmperes1', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                    </td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.groundFault.multiplier || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.groundFault.multiplier', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>GFPU</td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.groundFault.toleranceMin || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.groundFault.toleranceMin', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          value={(formData.primaryInjection.results.groundFault.toleranceMax || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange('primaryInjection.results.groundFault.toleranceMax', v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center w-20`}
                        />
                        <span className="ml-1">%</span>
                      </div>
                    </td>
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
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 overflow-x-auto primary-injection-poles-section">
              <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-white print:text-black">Primary injection — pole readings (Poles 1–3)</h3>
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600 primary-injection-table primary-injection-poles-table">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '21.33%' }} />
                  <col style={{ width: '21.33%' }} />
                  <col style={{ width: '21.34%' }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Function</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Row</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Pole 1</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Pole 2</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Pole 3</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className={tableStyles.cell}>Long Time</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>Delay</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole1.sec || ''} onChange={(e) => handleChange('primaryInjection.results.longTime.pole1.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole2.sec || ''} onChange={(e) => handleChange('primaryInjection.results.longTime.pole2.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole3.sec || ''} onChange={(e) => handleChange('primaryInjection.results.longTime.pole3.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Long Time</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>LTPU</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole1.a || ''} onChange={(e) => handleChange('primaryInjection.results.longTime.pole1.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole2.a || ''} onChange={(e) => handleChange('primaryInjection.results.longTime.pole2.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.longTime.pole3.a || ''} onChange={(e) => handleChange('primaryInjection.results.longTime.pole3.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Short Time</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>Delay</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole1.sec || ''} onChange={(e) => handleChange('primaryInjection.results.shortTime.pole1.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole2.sec || ''} onChange={(e) => handleChange('primaryInjection.results.shortTime.pole2.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole3.sec || ''} onChange={(e) => handleChange('primaryInjection.results.shortTime.pole3.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Short Time</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>STPU</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole1.a || ''} onChange={(e) => handleChange('primaryInjection.results.shortTime.pole1.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole2.a || ''} onChange={(e) => handleChange('primaryInjection.results.shortTime.pole2.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.shortTime.pole3.a || ''} onChange={(e) => handleChange('primaryInjection.results.shortTime.pole3.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Instantaneous</td>
                    <td className={`${tableStyles.cell} text-center text-sm text-gray-500 dark:text-gray-400`}>—</td>
                    <td className={`${tableStyles.cell} text-center`} colSpan={3}></td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Instantaneous</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>IPU</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.instantaneous.pole1.a || ''} onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole1.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.instantaneous.pole2.a || ''} onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole2.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.instantaneous.pole3.a || ''} onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole3.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Ground Fault</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>Delay</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole1.sec || ''} onChange={(e) => handleChange('primaryInjection.results.groundFault.pole1.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole2.sec || ''} onChange={(e) => handleChange('primaryInjection.results.groundFault.pole2.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole3.sec || ''} onChange={(e) => handleChange('primaryInjection.results.groundFault.pole3.sec', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">sec.</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Ground Fault</td>
                    <td className={`${tableStyles.cell} text-center text-sm`}>GFPU</td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole1.a || ''} onChange={(e) => handleChange('primaryInjection.results.groundFault.pole1.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole2.a || ''} onChange={(e) => handleChange('primaryInjection.results.groundFault.pole2.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                    <td className={`${tableStyles.cell} text-center`}>
                      <div className="flex items-center justify-center">
                        <input type="text" value={formData.primaryInjection.results.groundFault.pole3.a || ''} onChange={(e) => handleChange('primaryInjection.results.groundFault.pole3.a', e.target.value)} readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                        <span className="ml-1">A</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Test Equipment Used Section --- */}
          <div className="mb-6 print:hidden">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Megohmmeter:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={(value) => handleChange('testEquipment.megohmmeter.name', value)}
                  onSelect={(equipment) => {
                    const formatDate = (dateString: string | null): string => {
                      if (!dateString) return '';
                      try {
                        const date = new Date(dateString);
                        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                      } catch {
                        return dateString;
                      }
                    };
                    setFormData(p => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        megohmmeter: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || '',
                          ampId: equipment.amp_id || '',
                          calDate: formatLocalDateShort(equipment.calibration_date),
                        }
                      }
                    }));
                  }}
                  readOnly={!isEditing}
                  className="w-full"
                />
              </div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.megohmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.megohmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.megohmmeter.ampId} onChange={(e) => handleChange('testEquipment.megohmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Cal Date:</label><input type="text" value={formData.testEquipment.megohmmeter.calDate} onChange={(e) => handleChange('testEquipment.megohmmeter.calDate', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div>
                <label className="form-label">Low-Resistance Ohmmeter:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.lowResistanceOhmmeter.name}
                  onChange={(value) => handleChange('testEquipment.lowResistanceOhmmeter.name', value)}
                  onSelect={(equipment) => {
                    const formatDate = (dateString: string | null): string => {
                      if (!dateString) return '';
                      try {
                        const date = new Date(dateString);
                        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                      } catch {
                        return dateString;
                      }
                    };
                    setFormData(p => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        lowResistanceOhmmeter: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || '',
                          ampId: equipment.amp_id || '',
                          calDate: formatLocalDateShort(equipment.calibration_date),
                        }
                      }
                    }));
                  }}
                  readOnly={!isEditing}
                  className="w-full"
                />
              </div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.ampId} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Cal Date:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.calDate} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.calDate', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div>
                <label className="form-label">Primary Injection Test Set:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.primaryInjectionTestSet.name}
                  onChange={(value) => handleChange('testEquipment.primaryInjectionTestSet.name', value)}
                  onSelect={(equipment) => {
                    const formatDate = (dateString: string | null): string => {
                      if (!dateString) return '';
                      try {
                        const date = new Date(dateString);
                        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                      } catch {
                        return dateString;
                      }
                    };
                    setFormData(p => ({
                      ...p,
                      testEquipment: {
                        ...p.testEquipment,
                        primaryInjectionTestSet: {
                          name: equipment.equipment_name,
                          serialNumber: equipment.serial_number || '',
                          ampId: equipment.amp_id || '',
                          calDate: formatLocalDateShort(equipment.calibration_date),
                        }
                      }
                    }));
                  }}
                  readOnly={!isEditing}
                  className="w-full"
                />
              </div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.primaryInjectionTestSet.serialNumber} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.primaryInjectionTestSet.ampId} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Cal Date:</label><input type="text" value={formData.testEquipment.primaryInjectionTestSet.calDate} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.calDate', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              </div>
              </div>

          {/* Print-Only Test Equipment Used Table */}
          <div className="hidden print:block">
            <h2 className="text-xl font-semibold mb-4 text-black border-b border-black pb-2 font-bold">Test Equipment Used</h2>
            <table className="w-full border-collapse border border-black mb-6">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Equipment</th>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Serial Number</th>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">AMP ID</th>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Cal Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.name || 'Megohmmeter'}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.serialNumber}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.ampId}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.calDate}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.name || 'Low-Res Ohmmeter'}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.serialNumber}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.ampId}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.calDate}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.name || 'Primary Inj Test Set'}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.serialNumber}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.ampId}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.calDate}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* --- Comments Section --- */}
          <div className="mb-6 print:hidden">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            <div className="mb-4">
              <textarea 
                value={formData.comments} 
                onChange={(e) => handleChange('comments', e.target.value)}
                readOnly={!isEditing}
                className={`form-textarea w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                rows={4}
              />
            </div>
          </div>

          {/* Print-Only Comments Table */}
          {formData.comments?.trim() && (
          <div className="hidden print:block">
            <h2 className="text-xl font-semibold mb-4 text-black border-b border-black pb-2 font-bold">Comments</h2>
            <table className="w-full border-collapse border border-black mb-6">
              <tbody>
                <tr>
                  <td className="border border-black px-4 py-8 text-sm align-top" style={{minHeight: '150px', height: '150px', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word'}}>
                    {formData.comments}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>      {/* Mark Ready to Review Button */}
      {!isPrintMode && isEditing && (
        <div className="mb-6 print:hidden flex justify-center">
          <button
            onClick={async () => {
              if (!jobId || !user?.id) return;
              
              try {
                // Save the report first
                await handleSave();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Get the report ID (may have been created by save)
                const savedReportId = currentReportId || window.location.pathname.split('/').pop();
                if (!savedReportId) throw new Error('Failed to save report');
                
                // Update asset status to ready_for_review
                const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;
                const { error } = await supabase
                  .schema('neta_ops')
                  .from('assets')
                  .update({ 
                    status: 'ready_for_review',
                    submitted_at: new Date().toISOString()
                  })
                  .eq('file_url', fileUrl);
                
                if (error) throw error;
                
                alert('Report marked as ready for review!');
              } catch (error: any) {
                console.error('Error marking report as ready:', error);
                alert(`Failed to mark as ready: ${error?.message || 'Unknown error'}`);
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

export default LowVoltageCircuitBreakerElectronicTripATSReport;

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide navigation bar and scrollbar */
    nav, header, .navigation, [class*="nav"], [class*="header"] {
      display: none !important;
    }
    html { height: 100%; }
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
      
      /* Address cell — wrap long addresses instead of overflowing the column */
      .lvcb-ats-address-cell,
      .lvcb-ats-address-cell .lvcb-ats-address-value {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        max-width: 100% !important;
        overflow: hidden !important;
        line-height: 1.2 !important;
      }

      /* Print header status box */
      .pass-fail-status-box.pass {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.fail {
        background-color: #ef4444 !important;
        border: 2px solid #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.limited {
        background-color: #eab308 !important;
        border: 2px solid #ca8a04 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box {
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
      
      /* Specific class for PASS/FAIL/LIMITED status box */
      .pass-fail-status-box.pass {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.fail {
        background-color: #ef4444 !important;
        border: 2px solid #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.limited {
        background-color: #eab308 !important;
        border: 2px solid #ca8a04 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box {
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
        margin: 0 auto !important;
        border: 1px solid black !important;
        background: white !important;
        font-size: 8px !important;
        text-align: center !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        position: relative !important;
        z-index: 1 !important;
        display: block !important;
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
        margin: 0 auto !important;
        border: 1px solid black !important;
        background: white !important;
        font-size: 7px !important;
        text-align: center !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        position: relative !important;
        z-index: 1 !important;
        display: block !important;
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
        margin-left: -23px !important;
        font-size: 10px !important;
        display: inline-block !important;
        white-space: nowrap !important;
        color: black !important;
        font-weight: normal !important;
      }
      
      /* Specifically ensure unit labels (sec., A, %, etc.) are visible */
      .max-w-7xl table span.ml-1,
      .max-w-7xl table span:contains('sec.'),
      .max-w-7xl table span:contains('A'),
      .max-w-7xl table span:contains('%') {
        display: inline-block !important;
        visibility: visible !important;
        font-size: 10px !important;
        color: black !important;
        font-weight: normal !important;
        margin-left: -15px !important;
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
      
      /* Primary Injection — setup table (no pole columns).
         Widths sum to exactly 100% so Chrome on Windows lays out Min and
         Max identically (otherwise the leftover % gets distributed
         unevenly and Max collapses). */
      .primary-injection-main-table { table-layout: fixed !important; width: 100% !important; }
      .primary-injection-main-table col:nth-child(1) { width: 12% !important; }
      .primary-injection-main-table col:nth-child(2) { width: 12% !important; }
      .primary-injection-main-table col:nth-child(3),
      .primary-injection-main-table col:nth-child(4) { width: 10% !important; }
      .primary-injection-main-table col:nth-child(5) { width: 15% !important; }
      .primary-injection-main-table col:nth-child(6),
      .primary-injection-main-table col:nth-child(7) { width: 20.5% !important; }

      .primary-injection-main-table th:nth-child(6),
      .primary-injection-main-table th:nth-child(7),
      .primary-injection-main-table td:nth-child(6),
      .primary-injection-main-table td:nth-child(7) {
        text-align: center !important;
        vertical-align: middle !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }

      .primary-injection-main-table td:nth-child(6) input,
      .primary-injection-main-table td:nth-child(7) input {
        margin: 0 auto !important;
        text-align: center !important;
        width: 90% !important;
      }

      .primary-injection-main-table td:nth-child(3) div,
      .primary-injection-main-table td:nth-child(4) div {
        justify-content: center !important;
        gap: 0px !important;
      }

      .primary-injection-main-table td:nth-child(3) input,
      .primary-injection-main-table td:nth-child(4) input {
        width: 50% !important;
        margin-right: 0px !important;
        text-align: center !important;
      }

      .primary-injection-main-table td:nth-child(3) span,
      .primary-injection-main-table td:nth-child(4) span {
        font-size: 7px !important;
        margin-left: -5px !important;
      }

      .primary-injection-main-table td:nth-child(4) { overflow: visible !important; }
      .primary-injection-main-table td:nth-child(4) div { white-space: nowrap !important; }

      .primary-injection-main-table td:nth-child(2),
      .primary-injection-main-table td:nth-child(5) { font-size: 8px !important; }
      .primary-injection-main-table td:nth-child(2) input,
      .primary-injection-main-table td:nth-child(5) input { font-size: 8px !important; }

      /* Pole readings table (below setup table) */
      .primary-injection-poles-table { table-layout: fixed !important; width: 100% !important; page-break-inside: avoid !important; break-inside: avoid !important; }
      .primary-injection-poles-table col:nth-child(1) { width: 22% !important; }
      .primary-injection-poles-table col:nth-child(2) { width: 14% !important; }
      .primary-injection-poles-table col:nth-child(3),
      .primary-injection-poles-table col:nth-child(4),
      .primary-injection-poles-table col:nth-child(5) { width: 21.33% !important; }

      .primary-injection-poles-table td:nth-child(3) div,
      .primary-injection-poles-table td:nth-child(4) div,
      .primary-injection-poles-table td:nth-child(5) div {
        justify-content: center !important;
        align-items: center !important;
        gap: 2px !important;
      }

      .primary-injection-poles-table td:nth-child(3) input,
      .primary-injection-poles-table td:nth-child(4) input,
      .primary-injection-poles-table td:nth-child(5) input {
        width: 70% !important;
        text-align: center !important;
        margin-right: 2px !important;
      }

      .primary-injection-poles-table td:nth-child(3) span,
      .primary-injection-poles-table td:nth-child(4) span,
      .primary-injection-poles-table td:nth-child(5) span {
        font-size: 8px !important;
        margin-left: 1px !important;
        white-space: nowrap !important;
      }

      .primary-injection-poles-section h3 {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      
      
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
      
      /* Orange dividers for section headers in print */
      .bg-\[\#f26722\] {
        background-color: #f26722 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        display: block !important;
        height: 4px !important;
        margin-bottom: 16px !important;
        width: 100% !important;
      }
      
      /* Job info table column sizing - distribute columns more evenly to give substation more room */
      .print\\:block table {
        table-layout: fixed !important;
      }
      
      .print\\:block table td:nth-child(1) {
        width: 18% !important;
      }
      
      .print\\:block table td:nth-child(2) {
        width: 14% !important;
      }
      
      .print\\:block table td:nth-child(3) {
        width: 16% !important;
      }
      
      .print\\:block table td:nth-child(4) {
        width: 19% !important;
      }
      
      .print\\:block table td:nth-child(5) {
        width: 15% !important;
      }
      
      .print\\:block table td:nth-child(6) {
        width: 15% !important;
      }
      
      /* Ensure all content fits on page */
      * {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      
      /* Fix comments section text wrapping - override any nowrap rules */
      table.border-collapse.border.border-black td {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        word-break: normal !important;
      }
      
      /* Ensure comments specifically wrap properly */
      .hidden.print\\:block table td.border.border-black {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        word-break: normal !important;
        max-width: 100% !important;
      }

      /* Nameplate Data print table — wrap long values (e.g. Operation,
         Trip Unit Type) instead of overflowing the column. Must come AFTER
         the generic .max-w-7xl table td { white-space: nowrap } block. */
      .nameplate-print-table {
        table-layout: fixed !important;
        width: 100% !important;
      }
      .nameplate-print-table td,
      .nameplate-print-table td div {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        max-width: 100% !important;
        overflow: hidden !important;
        line-height: 1.15 !important;
      }
      .nameplate-print-table td {
        padding: 2px 3px !important;
        vertical-align: top !important;
      }

      /* ============================================================== */
      /* PDF CLEANUP — unified type scale + no stretched text in inputs */
      /* (placed LAST so it wins over the per-section mixed sizes above) */
      /* ============================================================== */

      /* No artificial stretching anywhere in print */
      .max-w-7xl,
      .max-w-7xl *,
      table,
      table *,
      input,
      select,
      textarea,
      td,
      th,
      label,
      span,
      div {
        letter-spacing: normal !important;
        word-spacing: normal !important;
        font-stretch: normal !important;
        text-rendering: geometricPrecision !important;
        text-justify: none !important;
      }

      /* Inputs/selects/textareas — never justify, never stretch glyphs.
         CRITICAL: force font-family: inherit so form controls render with
         the same Arial face as surrounding cell/label text (browsers default
         form controls to a system UI font, which looks "different and
         smaller" in PDF — exactly the Min/Max column issue). */
      input,
      select,
      textarea,
      .max-w-7xl input,
      .max-w-7xl select,
      .max-w-7xl textarea,
      .max-w-7xl table input,
      .max-w-7xl table select,
      .max-w-7xl table textarea,
      .primary-injection-table input,
      .primary-injection-table select,
      .primary-injection-main-table input,
      .primary-injection-main-table select,
      .primary-injection-poles-table input,
      .primary-injection-poles-table select {
        text-align: left !important;
        text-overflow: clip !important;
        font-stretch: normal !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        font-family: Arial, Helvetica, sans-serif !important;
        font-weight: normal !important;
        font-style: normal !important;
        line-height: 1.2 !important;
      }
      .text-center input,
      input.text-center,
      select.text-center,
      td.text-center input,
      td.text-center select {
        text-align: center !important;
      }

      /* Unified type scale (overrides earlier 7/8/9/10/12/16/18 mix).
         Uses high-specificity selectors so it wins the cascade over
         .max-w-7xl table td/th/input/select rules earlier in this stylesheet. */

      /* Print header — title, subheader, status badge */
      .print\\:flex h1 { font-size: 14px !important; }
      .print\\:flex div[style*="color: #1a4e7c"] { font-size: 11px !important; }
      .pass-fail-status-box,
      .pass-fail-status-box.pass,
      .pass-fail-status-box.fail,
      .pass-fail-status-box.limited,
      .print\\:flex .bg-green-600,
      .print\\:flex .bg-red-600,
      .print\\:flex .bg-yellow-500 { font-size: 11px !important; }

      /* Section headers (h2) and sub-section headers (h3 — e.g. "Tested Settings") */
      .max-w-7xl h2,
      .max-w-7xl h2.section-job-information,
      .max-w-7xl h2.section-nameplate-data,
      .max-w-7xl h2.section-visual-mechanical,
      .max-w-7xl h2.section-device-settings,
      .max-w-7xl h2.section-contact-resistance,
      .max-w-7xl h2.section-insulation-resistance,
      .max-w-7xl h2.section-primary-injection,
      .max-w-7xl h2.section-test-equipment,
      .max-w-7xl h2.section-comments { font-size: 10px !important; line-height: 1.2 !important; }
      .max-w-7xl h3,
      .max-w-7xl h3.text-lg { font-size: 10px !important; line-height: 1.2 !important; margin: 2px 0 !important; }

      /* Body text — labels, plain divs/paragraphs/spans, including value cells
         that render as <div> inside <td> (Nameplate Data, Job Info, etc.) */
      .max-w-7xl,
      .max-w-7xl label,
      .max-w-7xl p,
      .max-w-7xl span,
      .max-w-7xl div,
      .form-label { font-size: 9px !important; }

      /* Inputs / selects / textareas (outside tables) */
      .max-w-7xl input,
      .max-w-7xl select,
      .max-w-7xl textarea,
      .form-input,
      .form-select,
      .form-textarea { font-size: 9px !important; }

      /* Tables — cells, inputs, selects, and ALL inner descendants render
         at one unified 9px (must beat .max-w-7xl table td 8px). */
      .max-w-7xl table,
      .max-w-7xl table *,
      .max-w-7xl table td,
      .max-w-7xl table th,
      .max-w-7xl table td *,
      .max-w-7xl table th *,
      .max-w-7xl table td div,
      .max-w-7xl table td span,
      .max-w-7xl table td p,
      .max-w-7xl table th div,
      .max-w-7xl table th span,
      .max-w-7xl table input,
      .max-w-7xl table select,
      .max-w-7xl table textarea { font-size: 9px !important; }

      /* Unit labels next to inputs (sec., A, %, etc.) — match cell text */
      .max-w-7xl table td input + span,
      .max-w-7xl table span.ml-1 { font-size: 9px !important; }

      /* Tailwind text-size class overrides — neutralize the on-screen
         scale (text-sm, text-base, text-lg, text-xl, text-2xl) so they
         can't leak through into print at 14/16/18/24px. */
      .max-w-7xl .text-2xl { font-size: 14px !important; }
      .max-w-7xl .text-xl { font-size: 12px !important; }
      .max-w-7xl .text-lg { font-size: 10px !important; }
      .max-w-7xl .text-base { font-size: 9px !important; }
      .max-w-7xl .text-sm { font-size: 9px !important; }

      /* Footer / very small */
      .text-xs,
      .max-w-7xl .text-xs { font-size: 8px !important; }

      /* Primary Injection tables — same 9px as the rest of the report.
         Selectors are scoped under .max-w-7xl table so they match (and
         beat) the earlier .max-w-7xl table input { 8px } rule by both
         specificity AND cascade order. */
      .max-w-7xl table.primary-injection-table,
      .max-w-7xl table.primary-injection-table td,
      .max-w-7xl table.primary-injection-table th,
      .max-w-7xl table.primary-injection-table td div,
      .max-w-7xl table.primary-injection-table td span,
      .max-w-7xl table.primary-injection-table th div,
      .max-w-7xl table.primary-injection-table th span,
      .max-w-7xl table.primary-injection-table input,
      .max-w-7xl table.primary-injection-table select,
      .max-w-7xl table.primary-injection-main-table,
      .max-w-7xl table.primary-injection-main-table td,
      .max-w-7xl table.primary-injection-main-table th,
      .max-w-7xl table.primary-injection-main-table td div,
      .max-w-7xl table.primary-injection-main-table td span,
      .max-w-7xl table.primary-injection-main-table th div,
      .max-w-7xl table.primary-injection-main-table th span,
      .max-w-7xl table.primary-injection-main-table input,
      .max-w-7xl table.primary-injection-main-table select,
      .max-w-7xl table.primary-injection-poles-table,
      .max-w-7xl table.primary-injection-poles-table td,
      .max-w-7xl table.primary-injection-poles-table th,
      .max-w-7xl table.primary-injection-poles-table td div,
      .max-w-7xl table.primary-injection-poles-table td span,
      .max-w-7xl table.primary-injection-poles-table th div,
      .max-w-7xl table.primary-injection-poles-table th span,
      .max-w-7xl table.primary-injection-poles-table input,
      .max-w-7xl table.primary-injection-poles-table select { font-size: 9px !important; }

      /* CROSS-BROWSER COLUMN WIDTH FIX for Primary Injection main table.
         The generic .max-w-7xl table th:nth-child(N) { width: 8% } rules
         earlier in the stylesheet collapse the second-row "Max" <th>
         (which is th:nth-child(4) of its <tr>) to 8% on Windows Chrome,
         even though <col> widths are larger. Force the cells AND headers
         in cols 6 (Min) and 7 (Max) to the same explicit width with high
         specificity so neither side can collapse. */
      .max-w-7xl table.primary-injection-main-table > colgroup > col:nth-child(6),
      .max-w-7xl table.primary-injection-main-table > colgroup > col:nth-child(7) {
        width: 20.5% !important;
        min-width: 20.5% !important;
      }
      .max-w-7xl table.primary-injection-main-table tr td:nth-child(5),
      .max-w-7xl table.primary-injection-main-table tr td:nth-child(6),
      .max-w-7xl table.primary-injection-main-table tr td:nth-child(7) {
        min-width: 60px !important;
      }
      /* The 2nd thead row only has 4 <th>s (empty, empty, Min, Max);
         neutralize the broad th:nth-child(3)/(4) { width: 8% } rule. */
      .max-w-7xl table.primary-injection-main-table thead tr:nth-child(2) th:nth-child(3),
      .max-w-7xl table.primary-injection-main-table thead tr:nth-child(2) th:nth-child(4) {
        width: auto !important;
        min-width: 60px !important;
      }

      /* DECISIVE Primary Injection input/select normalization.
         Earlier rules use nth-child(5/6/7) selectors, but the table mixes
         rowSpan + colSpan so the same logical column (e.g. Tolerance Max)
         lands at different nth-child positions across rows. That made
         Min, Max, Test Amperes, etc. render at slightly different
         font-sizes / widths / paddings / heights. This rule forces every
         input and select in every Primary Injection table to be visually
         identical. Targets all rows regardless of nth-child position. */
      .max-w-7xl table.primary-injection-table tr td input,
      .max-w-7xl table.primary-injection-table tr td select,
      .max-w-7xl table.primary-injection-main-table tr td input,
      .max-w-7xl table.primary-injection-main-table tr td select,
      .max-w-7xl table.primary-injection-poles-table tr td input,
      .max-w-7xl table.primary-injection-poles-table tr td select {
        font-size: 9px !important;
        font-family: Arial, Helvetica, sans-serif !important;
        font-weight: normal !important;
        font-style: normal !important;
        line-height: 1.2 !important;
        text-align: center !important;
        height: 14px !important;
        padding: 1px 2px !important;
        margin: 0 auto !important;
        width: 90% !important;
        max-width: none !important;
        min-width: 0 !important;
        border: 1px solid black !important;
        background: white !important;
        box-sizing: border-box !important;
      }

      /* And every cell in primary-injection tables uses the same alignment
         + font, so labels match input values. */
      .max-w-7xl table.primary-injection-table tr td,
      .max-w-7xl table.primary-injection-main-table tr td,
      .max-w-7xl table.primary-injection-poles-table tr td {
        font-size: 9px !important;
        font-family: Arial, Helvetica, sans-serif !important;
        font-weight: normal !important;
        text-align: center !important;
        vertical-align: middle !important;
        padding: 2px !important;
      }
      .max-w-7xl table.primary-injection-table tr th,
      .max-w-7xl table.primary-injection-main-table tr th,
      .max-w-7xl table.primary-injection-poles-table tr th {
        font-size: 9px !important;
        font-family: Arial, Helvetica, sans-serif !important;
        font-weight: bold !important;
        text-align: center !important;
        padding: 2px !important;
      }

      /* Multiplier % spans (e.g. "%") next to inputs — match cell font,
         drop the negative margin that was pulling them on top of the
         neighbouring input. */
      .max-w-7xl table.primary-injection-main-table tr td span,
      .max-w-7xl table.primary-injection-poles-table tr td span {
        font-size: 9px !important;
        margin-left: 2px !important;
        font-weight: normal !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// Helper: normalize address (abbreviate state names and remove United States)
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'
};

const normalizeAddress = (text?: string): string => {
  if (!text) return '';
  // unify commas spacing
  let t = text.replace(/,\s*/g, ', ');
  // remove United States
  t = t.replace(/,?\s*United States\.?/gi, '');
  // replace full state names with abbr at word boundaries
  t = t.replace(/\b([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/g, (m) => {
    const key = m.toLowerCase();
    return STATE_NAME_TO_ABBR[key] || m;
  });
  // tidy duplicate commas/spaces
  return t.replace(/\s+,/g, ', ').replace(/,\s*,+/g, ', ').replace(/[\s,]+$/g, '').trim();
};