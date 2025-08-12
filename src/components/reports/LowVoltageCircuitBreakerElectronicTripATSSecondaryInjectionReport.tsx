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

  // Electrical Tests - Trip Testing
  tripTesting: {
    testedSettings: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    secondaryInjection: {
      longTime: { amperes1: string; amperes2: string; toleranceMin: string; toleranceMax: string; pole1: string; pole2: string; pole3: string; unit: string; passFail: string };
      shortTime: { amperes1: string; amperes2: string; toleranceMin: string; toleranceMax: string; pole1: string; pole2: string; pole3: string; unit: string; passFail: string };
      instantaneous: { amperes1: string; amperes2: string; toleranceMin: string; toleranceMax: string; pole1: string; pole2: string; pole3: string; unit: string; passFail: string };
      groundFault: { amperes1: string; amperes2: string; toleranceMin: string; toleranceMax: string; pole1: string; pole2: string; pole3: string; unit: string; passFail: string };
    };
  };

  // Test Equipment Used
  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string };
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string }; // Added based on image
    secondaryInjectionTestSet: { name: string; serialNumber: string; ampId: string }; // Added based on image
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

const LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport: React.FC = () => {
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
  const reportSlug = 'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report';
  const reportName = getReportName(reportSlug);
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
    tripTesting: {
      testedSettings: {
        longTime: { setting: '', delay: '', i2t: '' },
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: '' },
        groundFault: { setting: '', delay: '', i2t: '' }
      },
      secondaryInjection: {
        longTime: { amperes1: '', amperes2: '', toleranceMin: 'N/A', toleranceMax: 'N/A', pole1: '', pole2: '', pole3: '', unit: 'sec.', passFail: 'PASS' }, // Default passFail to PASS
        shortTime: { amperes1: '', amperes2: '', toleranceMin: 'N/A', toleranceMax: 'N/A', pole1: '', pole2: '', pole3: '', unit: 'sec.', passFail: 'PASS' }, // Default passFail to PASS
        instantaneous: { amperes1: '', amperes2: '', toleranceMin: 'N/A', toleranceMax: 'N/A', pole1: '', pole2: '', pole3: '', unit: 'sec.', passFail: 'PASS' }, // Default passFail to PASS
        groundFault: { amperes1: '', amperes2: '', toleranceMin: '', toleranceMax: '', pole1: '', pole2: '', pole3: '', unit: 'sec.', passFail: 'PASS' } // Default passFail to PASS
      }
    },
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
      secondaryInjectionTestSet: { name: '', serialNumber: '', ampId: '' }
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
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new shorter table name
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
        // Map loaded data to formData state, ensuring all fields exist
        setFormData(prev => ({
          ...prev, // Start with defaults to ensure all keys exist
          // Job Info (potentially from report_info)
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

          // Nameplate Data
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

          // Visual and Mechanical Inspection
          visualInspectionItems: data.visual_mechanical?.items || prev.visualInspectionItems,

          // Device Settings
          deviceSettings: data.device_settings || prev.deviceSettings,

          // Electrical Tests - Contact/Pole Resistance
          contactResistance: data.contact_resistance || prev.contactResistance,

          // Electrical Tests - Insulation Resistance
          insulationResistance: data.insulation_resistance || prev.insulationResistance,

          // Electrical Tests - Trip Testing
          tripTesting: data.trip_testing || prev.tripTesting,

          // Test Equipment Used
          testEquipment: data.test_equipment || prev.testEquipment,

          // Comments
          comments: data.comments || '',

          // Status - Use equipmentEvaluationResultOptions
          status: data.report_info?.status || 'PASS',
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true); // Allow editing if loading fails
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
      trip_testing: formData.tripTesting,
      test_equipment: formData.testEquipment,
      comments: formData.comments
    };

    try {
      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new shorter table name
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_electronic_trip_ats') // Use new shorter table name
          .insert(reportPayload)
          .select()
          .single();

        // Create asset entry for the new report
        if (result.data) {
          const newReportId = result.data.id;
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report/${newReportId}`, // Reverted to descriptive path for routing
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
      // Use lodash set for easier deep updates
      // This requires installing lodash and importing set: import { set } from 'lodash';
      // set(newState, path, value); // Example usage - install lodash if proceeding
      // Manual deep update as alternative:
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
      return newState;
    });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

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
          NETA
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
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden flex justify-between items-center mb-6`}>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Low Voltage Circuit Breaker Electronic Trip Unit ATS Secondary Injection
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
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
                  formData.status === 'FAIL' ? 'bg-red-600 text-white focus:ring-red-500' :
                  'bg-yellow-500 text-black focus:ring-yellow-400' // Style for LIMITED SERVICE
                } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
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

          {/* --- Job Information Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2">
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
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-1/3">NETA Section</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-1/2">Description</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-1/6">Results</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white break-words">{item.id}</td>
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
                                value=" "
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
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Insulation Resistance</h2>
            <div className="flex justify-end mb-4">
              <label htmlFor="insulationTestVoltage" className="form-label mr-2 dark:text-gray-300">Test Voltage:</label>
              <select
                id="insulationTestVoltage"
                value={formData.insulationResistance.testVoltage}
                onChange={(e) => handleChange('insulationResistance.testVoltage', e.target.value)}
                disabled={!isEditing}
                className="form-select w-32"
              >
                {insulationTestVoltageOptions.map(option => (<option key={option} value={option}>{option}</option>))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-[16.6%]" rowSpan={2}></th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={3}>Measured Values</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={3}>Temperature Corrected</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]" rowSpan={2}>Units</th>
                  </tr>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]">P1</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]">P2</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]">P3</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]">P1</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]">P2</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[12.5%]">P3</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {/* Pole to Pole (Closed) */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">Pole to Pole (Closed)</td>
                    {/* Measured Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToPole.p1p2}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p1p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToPole.p2p3}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p2p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToPole.p3p1}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p3p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p1p2}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p2p3}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToPole.p3p1}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    {/* Units */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      >
                        {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                  {/* Pole to Frame (Closed) */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">Pole to Frame (Closed)</td>
                    {/* Measured Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToFrame.p1}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToFrame.p2}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.poleToFrame.p3}
                        onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p1}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p2}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.poleToFrame.p3}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    {/* Units */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      >
                        {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                  {/* Line to Load (Open) */}
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">Line to Load (Open)</td>
                    {/* Measured Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.lineToLoad.p1}
                        onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p1', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.lineToLoad.p2}
                        onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p2', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.measured.lineToLoad.p3}
                        onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p3', e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    {/* Corrected Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p1}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p2}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <input
                        type="text"
                        value={formData.insulationResistance.corrected.lineToLoad.p3}
                        readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 text-center"
                      />
                    </td>
                    {/* Units */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                      <select
                        value={formData.insulationResistance.unit}
                        onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      >
                        {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Electrical Tests - Trip Testing Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Trip Testing</h2>

            {/* Tested Settings Table */}
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Tested Settings</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-1/4"></th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-1/4">Setting</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-1/4">Delay</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-1/4">I²t</th>
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
                            value={formData.tripTesting.testedSettings[settingType]?.setting || ''}
                            onChange={(e) => handleChange(`tripTesting.testedSettings.${settingType}.setting`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.testedSettings[settingType]?.delay || ''}
                            onChange={(e) => handleChange(`tripTesting.testedSettings.${settingType}.delay`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          {settingType === 'shortTime' || settingType === 'groundFault' ? (
                            <select
                              value={formData.tripTesting.testedSettings[settingType]?.i2t || ''}
                              onChange={(e) => handleChange(`tripTesting.testedSettings.${settingType}.i2t`, e.target.value)}
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

            {/* Secondary Injection Table */}
            <div>
              <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Secondary Injection</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white w-[10%]" rowSpan={2}>Function</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={2}>Amperes</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={2}>Tolerance</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={3}>Results</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]" rowSpan={2}>Units</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]" rowSpan={2}>Pass/Fail</th>
                    </tr>
                    <tr>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">1</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">2</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">Min</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">Max</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">Pole 1</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">Pole 2</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white w-[10%]">Pole 3</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((funcType) => (
                      <tr key={`inj-${funcType}`}>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {funcType.replace('Time', ' Time').replace('Fault', ' Fault')}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.amperes1 || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.amperes1`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.amperes2 || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.amperes2`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.toleranceMin || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.toleranceMin`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.toleranceMax || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.toleranceMax`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.pole1 || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.pole1`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.pole2 || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.pole2`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.tripTesting.secondaryInjection[funcType]?.pole3 || ''}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.pole3`, e.target.value)}
                            readOnly={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <select
                            value={formData.tripTesting.secondaryInjection[funcType]?.unit || 'sec.'}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.unit`, e.target.value)}
                            disabled={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          >
                            {tripTestingUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                          </select>
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <select
                            value={formData.tripTesting.secondaryInjection[funcType]?.passFail || 'PASS'}
                            onChange={(e) => handleChange(`tripTesting.secondaryInjection.${funcType}.passFail`, e.target.value)}
                            disabled={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          >
                            {equipmentEvaluationResultOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <div><label className="form-label">Low-Res Ohmmeter:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.name} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.name', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.lowResistanceOhmmeter.ampId} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Secondary Inj Test Set:</label><input type="text" value={formData.testEquipment.secondaryInjectionTestSet.name} onChange={(e) => handleChange('testEquipment.secondaryInjectionTestSet.name', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.testEquipment.secondaryInjectionTestSet.serialNumber} onChange={(e) => handleChange('testEquipment.secondaryInjectionTestSet.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label className="form-label">AMP ID:</label><input type="text" value={formData.testEquipment.secondaryInjectionTestSet.ampId} onChange={(e) => handleChange('testEquipment.secondaryInjectionTestSet.ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    </div>
                    </div>

          {/* --- Comments Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            <textarea
              value={formData.comments}
              onChange={(e) => handleChange('comments', e.target.value)}
              readOnly={!isEditing}
              rows={4}
              className={`form-textarea w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Add CSS Helper Classes */}
      <style>{`
        .form-input {
          @apply mt-1 block w-full p-2
            bg-gray-50 dark:bg-dark-100
            border border-gray-300 dark:border-gray-600
            rounded-md shadow-sm
            focus:outline-none focus:ring-[#f26722] focus:border-[#f26722]
            text-gray-900 dark:text-white;
        }
        .form-input[readonly], .form-select[disabled] {
           background-color: #f3f4f6;
        }
        html.dark .form-input[readonly], html.dark .form-select[disabled] {
           background-color: #374151;
           color: #d1d5db;
           cursor: not-allowed;
        }
        .form-select {
          @apply mt-1 block w-full p-2
            bg-gray-50 dark:bg-dark-100
            border border-gray-300 dark:border-gray-600
            rounded-md shadow-sm
            focus:outline-none focus:ring-[#f26722] focus:border-[#f26722]
            text-gray-900 dark:text-white;
        }
        .form-textarea {
            @apply mt-1 block w-full p-2
            bg-gray-50 dark:bg-dark-100
            border border-gray-300 dark:border-gray-600
            rounded-md shadow-sm
            focus:outline-none focus:ring-[#f26722] focus:border-[#f26722]
            text-gray-900 dark:text-white;
        }
        .form-textarea[readonly] {
            background-color: #f3f4f6;
        }
        html.dark .form-textarea[readonly] {
           background-color: #374151;
           color: #d1d5db;
           cursor: not-allowed;
        }
        .form-label {
            @apply text-sm font-medium text-gray-700 dark:text-white;
        }

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
          
          /* Page setup */
          @page { 
            margin: 0.5in !important; 
            size: A4 !important;
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
          
          /* Force input boxes to stay within their cells */
          .max-w-7xl table input {
            max-width: calc(100% - 2px) !important;
            box-sizing: border-box !important;
          }
          
          /* Specific styles for Visual and Mechanical Inspection table */
          .max-w-7xl table td:first-child {
            word-wrap: break-word !important;
            word-break: break-all !important;
            max-width: 200px !important;
            font-size: 6px !important;
            line-height: 1.0 !important;
            padding: 2px 4px !important;
          }
          
          .max-w-7xl table th:first-child {
            max-width: 200px !important;
            font-size: 6px !important;
            padding: 2px 4px !important;
          }
          
          /* Ensure description column has enough space */
          .max-w-7xl table td:nth-child(2) {
            font-size: 6px !important;
            line-height: 1.0 !important;
            padding: 2px 4px !important;
          }
          
          .max-w-7xl table th:nth-child(2) {
            font-size: 6px !important;
            padding: 2px 4px !important;
          }
          
          /* Compact results column */
          .max-w-7xl table td:nth-child(3) {
            font-size: 7px !important;
            padding: 2px 2px !important;
          }
          
          .max-w-7xl table th:nth-child(3) {
            font-size: 7px !important;
            padding: 2px 2px !important;
          }
        }
      `}</style>

    </ReportWrapper>
  );
};

export default LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport; 