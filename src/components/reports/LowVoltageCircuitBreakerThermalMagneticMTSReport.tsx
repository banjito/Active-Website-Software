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
const visualInspectionResultsOptions = ["", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"];
const contactResistanceUnitsOptions = ["µΩ", "mΩ", "Ω"];
const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const insulationTestVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];
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
  ratingPlug: string; // A
  curveNo: string;
  operation: string;
  mounting: string;
  thermalMemory: string;

  // Visual and Mechanical Inspection
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

  // Electrical Tests - Primary Injection
  primaryInjection: {
    testedSettings: {
      thermal: string;
      magnetic: string;
    };
    results: {
      thermal: {
        amperes1: string; // First Amperes column
        multiplierTolerance: string; // e.g., 300%
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
        amperes2: string;
        toleranceMin: string;
        toleranceMax: string;
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
    primaryInjectionTestSet: { name: string; serialNumber: string; ampId: string };
  };

  // Comments
  comments: string;

  // Status (PASS/FAIL/LIMITED SERVICE)
  status: string;

  // Counter Reading
  counterReading: {
    asFound: string;
    asLeft: string;
  };
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

const LowVoltageCircuitBreakerThermalMagneticMTSReport: React.FC = () => {
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
  const reportSlug = 'low-voltage-circuit-breaker-thermal-magnetic-mts-report'; // This component handles the low-voltage-circuit-breaker-thermal-magnetic-mts-report route
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
    // Nameplate Data
    manufacturer: '',
    catalogNumber: '',
    serialNumber: '',
    type: '',
    icRating: '',
    frameSize: '',
    ratingPlug: '',
    curveNo: '',
    operation: '',
    mounting: '',
    thermalMemory: '',
    // Visual Inspection Items
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
    // Device Settings (Thermal/Magnetic)
    deviceSettings: {
      asFound: { thermal: '', magnetic: '' },
      asLeft: { thermal: '', magnetic: '' }
    },
    // Contact Resistance
    contactResistance: { p1: '', p2: '', p3: '', unit: 'µΩ' },
    // Insulation Resistance
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
    // Primary Injection
    primaryInjection: {
      testedSettings: { thermal: '', magnetic: '' },
      results: {
        thermal: {
          amperes1: '',
          multiplierTolerance: '',
          amperes2: '',
          toleranceMin: '',
          toleranceMax: '',
          pole1: { sec: '', a: '' },
          pole2: { sec: '', a: '' },
          pole3: { sec: '', a: '' }
        },
        magnetic: {
          amperes1: '',
          multiplierTolerance: '',
          amperes2: '',
          toleranceMin: '',
          toleranceMax: '',
          pole1: { sec: '', a: '' },
          pole2: { sec: '', a: '' },
          pole3: { sec: '', a: '' }
        }
      }
    },
    // Test Equipment
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
      primaryInjectionTestSet: { name: '', serialNumber: '', ampId: '' }
    },
    comments: '',
    status: 'PASS',
    counterReading: {
      asFound: '',
      asLeft: ''
    }
  });

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;
    
    try {
      setLoading(true);
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`title, job_number, customer_id`)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select(`name, company_name, address`)
          .eq('id', jobData.customer_id)
          .single();
          
        if (!customerError && customerData) {
          setFormData(prev => ({
            ...prev,
            customer: customerData.company_name || customerData.name,
            address: customerData.address || '',
            jobNumber: jobData.job_number || ''
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
    }
  };

  // Load existing report data
  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_circuit_breaker_thermal_magnetic_mts_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData(prev => ({
          ...prev,
          ...data.report_info,
          status: data.status || 'PASS'
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle form field changes
  const handleChange = (path: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev };
      const keys = path.split('.');
      let current: any = newData;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newData;
    });
  };

  // Handle temperature changes
  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = (fahrenheit - 32) * (5/9);
    const tcf = getTCF(celsius);
    
    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius,
        tcf
      }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = (celsius * 9/5) + 32;
    const tcf = getTCF(celsius);
    
    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius,
        tcf
      }
    }));
  };

  // Calculate corrected insulation resistance values
  const calculateCorrectedValue = (value: string): string => {
    if (!value || isNaN(Number(value))) return '';
    return (Number(value) * formData.temperature.tcf).toFixed(2);
  };

  // Calculate second amperes value using the Excel formula: =IF(G73="","",IF(G73="N/A", "N/A", G73*J73))
  const calculateSecondAmperes = (firstAmperes: string, multiplier: string): string => {
    if (!firstAmperes || firstAmperes === '') return '';
    if (firstAmperes === 'N/A') return 'N/A';
    
    // For magnetic, just copy the first amperes value
    if (multiplier === '-10% 10%') {
      return firstAmperes;
    }
    
    // For thermal, multiply by 3.0 (300%)
    if (multiplier === '300%') {
      const result = Number(firstAmperes) * 3.0;
      return isNaN(result) ? '' : result.toString();
    }
    
    return firstAmperes;
  };

  // Calculate tolerance values for magnetic row
  // Min: =IF(G74="","",IF(N74="N/A", "N/A", (J74*N74)+N74)) where J74 is -0.1 (-10%)
  // Max: =IF(G74="","",IF(N74="N/A", "N/A", (L74*N74)+N74)) where L74 is 0.1 (10%)
  const calculateMagneticTolerance = (amperes2: string, isMin: boolean): string => {
    if (!amperes2 || amperes2 === '') return '';
    if (amperes2 === 'N/A') return 'N/A';
    
    const baseValue = Number(amperes2);
    if (isNaN(baseValue)) return '';
    
    const tolerance = isMin ? -0.1 : 0.1; // -10% or +10%
    const result = (tolerance * baseValue) + baseValue;
    return result.toString();
  };

  // Handle save/update
  const handleSave = async () => {
    if (!jobId || !user?.id) return;

    try {
      const reportData = {
        job_id: jobId,
        user_id: user.id,
        report_info: { ...formData },
        status: formData.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_thermal_magnetic_mts_reports')
          .update(reportData)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_circuit_breaker_thermal_magnetic_mts_reports')
          .insert(reportData)
          .select()
          .single();

        if (result.data) {
          // Create asset entry
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/low-voltage-circuit-breaker-thermal-magnetic-mts-report/${result.data.id}`,
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

      setIsEditing(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
    } catch (error) {
      console.error('Error saving report:', error);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, reportId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#f26722]"></div>
      </div>
    );
  }

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>NETA</div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden flex justify-end items-center mb-6`}>
            <div className="flex gap-2">
              {/* Status Button - Always visible, only interactive in edit mode */}
              <button
                onClick={() => {
                  if (isEditing) {
                    handleChange('status', formData.status === 'PASS' ? 'FAIL' : 'PASS');
                  }
                }}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  formData.status === 'PASS'
                    ? 'bg-green-600 text-white focus:ring-green-500'
                    : 'bg-red-600 text-white focus:ring-red-500'
                } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
              >
                {formData.status}
              </button>

              {/* Edit/Save/Print Buttons */}
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
                  className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'}`}
                >
                  Save Report
                </button>
              )}
            </div>
          </div>

      {/* Job Information */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Job Information
        </h2>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Customer:</label>
            <input
              type="text"
              value={formData.customer}
              onChange={(e) => handleChange('customer', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Address:</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Job Number:</label>
            <input
              type="text"
              value={formData.jobNumber}
              onChange={(e) => handleChange('jobNumber', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Date:</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Technician(s):</label>
            <input
              type="text"
              value={formData.technicians}
              onChange={(e) => handleChange('technicians', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Equipment Identifier:</label>
            <input
              type="text"
              value={formData.identifier}
              onChange={(e) => handleChange('identifier', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Substation:</label>
            <input
              type="text"
              value={formData.substation}
              onChange={(e) => handleChange('substation', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Equipment Location:</label>
            <input
              type="text"
              value={formData.eqptLocation}
              onChange={(e) => handleChange('eqptLocation', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Temperature (°F):</label>
            <input
              type="number"
              value={formData.temperature.fahrenheit}
              onChange={(e) => handleFahrenheitChange(Number(e.target.value))}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Temperature (°C):</label>
            <input
              type="number"
              value={formData.temperature.celsius.toFixed(1)}
              onChange={(e) => handleCelsiusChange(Number(e.target.value))}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Humidity (%):</label>
            <input
              type="number"
              value={formData.temperature.humidity}
              onChange={(e) => handleChange('temperature.humidity', Number(e.target.value))}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">TCF:</label>
            <input
              type="number"
              value={formData.temperature.tcf.toFixed(3)}
              readOnly
              className={tableStyles.input}
            />
          </div>
        </div>
      </section>

      {/* Nameplate Data */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Nameplate Data
        </h2>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Manufacturer:</label>
            <input
              type="text"
              value={formData.manufacturer}
              onChange={(e) => handleChange('manufacturer', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Catalog Number:</label>
            <input
              type="text"
              value={formData.catalogNumber}
              onChange={(e) => handleChange('catalogNumber', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Serial Number:</label>
            <input
              type="text"
              value={formData.serialNumber}
              onChange={(e) => handleChange('serialNumber', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Type:</label>
            <input
              type="text"
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">IC Rating (kA):</label>
            <input
              type="text"
              value={formData.icRating}
              onChange={(e) => handleChange('icRating', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Frame Size (A):</label>
            <input
              type="text"
              value={formData.frameSize}
              onChange={(e) => handleChange('frameSize', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Rating Plug (A):</label>
            <input
              type="text"
              value={formData.ratingPlug}
              onChange={(e) => handleChange('ratingPlug', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Curve No.:</label>
            <input
              type="text"
              value={formData.curveNo}
              onChange={(e) => handleChange('curveNo', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Operation:</label>
            <input
              type="text"
              value={formData.operation}
              onChange={(e) => handleChange('operation', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Mounting:</label>
            <input
              type="text"
              value={formData.mounting}
              onChange={(e) => handleChange('mounting', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white">Thermal Memory:</label>
            <input
              type="text"
              value={formData.thermalMemory}
              onChange={(e) => handleChange('thermalMemory', e.target.value)}
              readOnly={!isEditing}
              className={tableStyles.input}
            />
          </div>
        </div>
      </section>

      {/* Visual and Mechanical Inspection */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Visual and Mechanical Inspection
        </h2>
        <div className="overflow-x-auto">
          <table className={tableStyles.table}>
            <thead>
              <tr className="bg-gray-50 dark:bg-dark-200">
                <th className={`${tableStyles.headerCell} w-24`}>Section</th>
                <th className={tableStyles.headerCell}>Description</th>
                <th className={`${tableStyles.headerCell} w-40`}>Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {formData.visualInspectionItems.map((item, index) => (
                <tr key={item.id}>
                  <td className={tableStyles.cell}>{item.id}</td>
                  <td className={tableStyles.cell}>{item.description}</td>
                  <td className={tableStyles.cell}>
                    <select
                      value={item.result}
                      onChange={(e) => handleChange(`visualInspectionItems.${index}.result`, e.target.value)}
                      disabled={!isEditing}
                      className={tableStyles.select}
                    >
                      {visualInspectionResultsOptions.map(option => (
                        <option key={option} value={option}>{option || 'Select...'}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Counter Reading Fields */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="form-label mb-2 dark:text-gray-300">Counter Reading As Found:</label>
          <input
            type="text"
            value={formData.counterReading.asFound}
            onChange={(e) => handleChange('counterReading.asFound', e.target.value)}
            readOnly={!isEditing}
            className={`${tableStyles.input} text-center`}
          />
        </div>
        <div className="flex flex-col">
          <label className="form-label mb-2 dark:text-gray-300">Counter Reading As Left:</label>
          <input
            type="text"
            value={formData.counterReading.asLeft}
            onChange={(e) => handleChange('counterReading.asLeft', e.target.value)}
            readOnly={!isEditing}
            className={`${tableStyles.input} text-center`}
          />
        </div>
      </div>

      {/* Device Settings */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Device Settings
        </h2>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Settings As Found */}
          <div>
            <h3 className="text-lg font-medium mb-2 text-center text-gray-900 dark:text-white">Settings As Found</h3>
            <div className={tableStyles.container}>
              <table className={tableStyles.table}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className={`${tableStyles.headerCell} text-center`}>SETTING</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Thermal</span>
                        <input
                          type="text"
                          value={formData.deviceSettings.asFound.thermal}
                          onChange={(e) => handleChange('deviceSettings.asFound.thermal', e.target.value)}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} w-32 ml-2`}
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Magnetic</span>
                        <input
                          type="text"
                          value={formData.deviceSettings.asFound.magnetic}
                          onChange={(e) => handleChange('deviceSettings.asFound.magnetic', e.target.value)}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} w-32 ml-2`}
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Settings As Left */}
          <div>
            <h3 className="text-lg font-medium mb-2 text-center text-gray-900 dark:text-white">Settings As Left</h3>
            <div className={tableStyles.container}>
              <table className={tableStyles.table}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className={`${tableStyles.headerCell} text-center`}>SETTING</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Thermal</span>
                        <input
                          type="text"
                          value={formData.deviceSettings.asLeft.thermal}
                          onChange={(e) => handleChange('deviceSettings.asLeft.thermal', e.target.value)}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} w-32 ml-2`}
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Magnetic</span>
                        <input
                          type="text"
                          value={formData.deviceSettings.asLeft.magnetic}
                          onChange={(e) => handleChange('deviceSettings.asLeft.magnetic', e.target.value)}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} w-32 ml-2`}
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Resistance */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Electrical Tests - Contact/Pole Resistance
        </h2>
        <div className="p-4">
          <table className={tableStyles.table}>
            <thead>
              <tr className="bg-gray-50 dark:bg-dark-200">
                <th className={`${tableStyles.headerCell} text-center`} colSpan={3}>CONTACT RESISTANCE</th>
                <th className={`${tableStyles.headerCell} text-center`}>UNITS</th>
              </tr>
              <tr className="bg-gray-50 dark:bg-dark-200">
                <th className={`${tableStyles.headerCell} text-center`}>P1</th>
                <th className={`${tableStyles.headerCell} text-center`}>P2</th>
                <th className={`${tableStyles.headerCell} text-center`}>P3</th>
                <th className={`${tableStyles.headerCell} text-center`}></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={formData.contactResistance.p1}
                    onChange={(e) => handleChange('contactResistance.p1', e.target.value)}
                    readOnly={!isEditing}
                    className={`${tableStyles.input} text-center`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={formData.contactResistance.p2}
                    onChange={(e) => handleChange('contactResistance.p2', e.target.value)}
                    readOnly={!isEditing}
                    className={`${tableStyles.input} text-center`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={formData.contactResistance.p3}
                    onChange={(e) => handleChange('contactResistance.p3', e.target.value)}
                    readOnly={!isEditing}
                    className={`${tableStyles.input} text-center`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <select
                    value={formData.contactResistance.unit}
                    onChange={(e) => handleChange('contactResistance.unit', e.target.value)}
                    disabled={!isEditing}
                    className={`${tableStyles.select} text-center`}
                  >
                    {contactResistanceUnitsOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Insulation Resistance */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Electrical Tests - Insulation Resistance
        </h2>
        <div className="p-4">
          <div className="flex justify-end mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-white mr-2">Test Voltage:</label>
            <select
              value={formData.insulationResistance.testVoltage}
              onChange={(e) => handleChange('insulationResistance.testVoltage', e.target.value)}
              disabled={!isEditing}
              className="text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
            >
              {insulationTestVoltageOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <table className={tableStyles.table}>
            <thead>
              <tr className="bg-gray-50 dark:bg-dark-200">
                <th className={`${tableStyles.headerCell}`} rowSpan={2}></th>
                <th className={`${tableStyles.headerCell} text-center`} colSpan={3}>MEASURED VALUES</th>
                <th className={`${tableStyles.headerCell} text-center`} colSpan={3}>TEMPERATURE CORRECTED</th>
                <th className={`${tableStyles.headerCell} text-center`} rowSpan={2}>UNITS</th>
              </tr>
              <tr className="bg-gray-50 dark:bg-dark-200">
                <th className={`${tableStyles.headerCell} text-center`}>P1 (P1-P2)</th>
                <th className={`${tableStyles.headerCell} text-center`}>P2 (P2-P3)</th>
                <th className={`${tableStyles.headerCell} text-center`}>P3 (P3-P1)</th>
                <th className={`${tableStyles.headerCell} text-center`}>P1 (P1-P2)</th>
                <th className={`${tableStyles.headerCell} text-center`}>P2 (P2-P3)</th>
                <th className={`${tableStyles.headerCell} text-center`}>P3 (P3-P1)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${tableStyles.cell} font-medium`}>Pole to Pole (Closed)</td>
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
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p1p2)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p2p3)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p3p1)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <select
                    value={formData.insulationResistance.unit}
                    onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                    disabled={!isEditing}
                    className={`${tableStyles.select} text-center`}
                  >
                    {insulationResistanceUnitsOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td className={`${tableStyles.cell} font-medium`}>Pole to Frame (Closed)</td>
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
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p1)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p2)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p3)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <select
                    value={formData.insulationResistance.unit}
                    onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                    disabled={!isEditing}
                    className={`${tableStyles.select} text-center`}
                  >
                    {insulationResistanceUnitsOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td className={`${tableStyles.cell} font-medium`}>Line to Load (Open)</td>
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
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p1)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p2)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p3)}
                    readOnly
                    className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                  />
                </td>
                <td className={tableStyles.cell}>
                  <select
                    value={formData.insulationResistance.unit}
                    onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                    disabled={!isEditing}
                    className={`${tableStyles.select} text-center`}
                  >
                    {insulationResistanceUnitsOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Primary Injection */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Electrical Tests - Primary Injection
        </h2>
        <div className="p-4">
          {/* Tested Settings */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-center text-gray-900 dark:text-white mb-4">Tested Settings</h3>
            <div className={tableStyles.container}>
              <table className={tableStyles.table}>
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className={tableStyles.headerCell}></th>
                    <th className={`${tableStyles.headerCell} text-center`}>Setting</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className={tableStyles.cell}>Thermal</td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.primaryInjection.testedSettings.thermal}
                        onChange={(e) => handleChange('primaryInjection.testedSettings.thermal', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className={tableStyles.cell}>Magnetic</td>
                    <td className={tableStyles.cell}>
                      <input
                        type="text"
                        value={formData.primaryInjection.testedSettings.magnetic}
                        onChange={(e) => handleChange('primaryInjection.testedSettings.magnetic', e.target.value)}
                        readOnly={!isEditing}
                        className={`${tableStyles.input} text-center`}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Primary Injection Results */}
          <div className={tableStyles.container}>
            <table className={tableStyles.table}>
              <caption className="caption-top p-2 text-lg font-medium text-gray-900 dark:text-white">
                Primary Injection
              </caption>
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  <th className={tableStyles.headerCell} rowSpan={2}>Function</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Ampere s</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Multiplier Tolerance</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Ampere s</th>
                  <th className={`${tableStyles.headerCell} text-center`} colSpan={2}>Tolerance</th>
                  <th className={`${tableStyles.headerCell} text-center`} colSpan={3}>Pole</th>
                </tr>
                <tr>
                  <th className={tableStyles.headerCell}></th>
                  <th className={tableStyles.headerCell}></th>
                  <th className={tableStyles.headerCell}></th>
                  <th className={`${tableStyles.headerCell} text-center`}>Min</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Max</th>
                  <th className={`${tableStyles.headerCell} text-center`}>1 sec.</th>
                  <th className={`${tableStyles.headerCell} text-center`}>2 sec.</th>
                  <th className={`${tableStyles.headerCell} text-center`}>3 sec.</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {/* Thermal Row */}
                <tr>
                  <td className={tableStyles.cell}>Thermal</td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={formData.primaryInjection.results.thermal.amperes1} 
                      onChange={(e) => handleChange('primaryInjection.results.thermal.amperes1', e.target.value)} 
                      readOnly={!isEditing} 
                      className={`${tableStyles.input} text-center`} 
                    />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>300%</td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={calculateSecondAmperes(formData.primaryInjection.results.thermal.amperes1, '300%')} 
                      readOnly
                      className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={formData.primaryInjection.results.thermal.toleranceMin} 
                      onChange={(e) => handleChange('primaryInjection.results.thermal.toleranceMin', e.target.value)} 
                      readOnly={!isEditing} 
                      className={`${tableStyles.input} text-center`} 
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={formData.primaryInjection.results.thermal.toleranceMax} 
                      onChange={(e) => handleChange('primaryInjection.results.thermal.toleranceMax', e.target.value)} 
                      readOnly={!isEditing} 
                      className={`${tableStyles.input} text-center`} 
                    />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>sec.</td>
                  <td className={`${tableStyles.cell} text-center`}>sec.</td>
                  <td className={`${tableStyles.cell} text-center`}>sec.</td>
                </tr>
                {/* Magnetic Row */}
                <tr>
                  <td className={tableStyles.cell}>Magnetic</td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={formData.primaryInjection.results.magnetic.amperes1} 
                      onChange={(e) => handleChange('primaryInjection.results.magnetic.amperes1', e.target.value)} 
                      readOnly={!isEditing} 
                      className={`${tableStyles.input} text-center`} 
                    />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>-10% 10%</td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={calculateSecondAmperes(formData.primaryInjection.results.magnetic.amperes1, '-10% 10%')} 
                      readOnly
                      className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={calculateMagneticTolerance(calculateSecondAmperes(formData.primaryInjection.results.magnetic.amperes1, '-10% 10%'), true)} 
                      readOnly
                      className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input 
                      type="text" 
                      value={calculateMagneticTolerance(calculateSecondAmperes(formData.primaryInjection.results.magnetic.amperes1, '-10% 10%'), false)} 
                      readOnly
                      className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-200`}
                    />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>A</td>
                  <td className={`${tableStyles.cell} text-center`}>A</td>
                  <td className={`${tableStyles.cell} text-center`}>A</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Test Equipment */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Test Equipment Used
        </h2>
        <div className="p-4">
          <div className="grid grid-cols-1 gap-y-4">
            {/* Megohmmeter */}
            <div className="flex items-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-48">Megohmmeter:</label>
              <input 
                type="text" 
                value={formData.testEquipment.megohmmeter.name} 
                onChange={(e) => handleChange('testEquipment.megohmmeter.name', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-32 ml-4">Serial Number:</label>
              <input 
                type="text" 
                value={formData.testEquipment.megohmmeter.serialNumber} 
                onChange={(e) => handleChange('testEquipment.megohmmeter.serialNumber', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-24 ml-4">AMP ID:</label>
              <input 
                type="text" 
                value={formData.testEquipment.megohmmeter.ampId} 
                onChange={(e) => handleChange('testEquipment.megohmmeter.ampId', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
            </div>
            {/* Low Resistance Ohmmeter */}
            <div className="flex items-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-48">Low-Resistance Ohmmeter:</label>
              <input 
                type="text" 
                value={formData.testEquipment.lowResistanceOhmmeter.name} 
                onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.name', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-32 ml-4">Serial Number:</label>
              <input 
                type="text" 
                value={formData.testEquipment.lowResistanceOhmmeter.serialNumber} 
                onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.serialNumber', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-24 ml-4">AMP ID:</label>
              <input 
                type="text" 
                value={formData.testEquipment.lowResistanceOhmmeter.ampId} 
                onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.ampId', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
            </div>
            {/* Primary Injection Test Set */}
            <div className="flex items-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-48">Primary Injection Test Set:</label>
              <input 
                type="text" 
                value={formData.testEquipment.primaryInjectionTestSet.name} 
                onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.name', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-32 ml-4">Serial Number:</label>
              <input 
                type="text" 
                value={formData.testEquipment.primaryInjectionTestSet.serialNumber} 
                onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.serialNumber', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-white inline-block w-24 ml-4">AMP ID:</label>
              <input 
                type="text" 
                value={formData.testEquipment.primaryInjectionTestSet.ampId} 
                onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.ampId', e.target.value)} 
                readOnly={!isEditing} 
                className={`${tableStyles.input} flex-1`} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Comments */}
      <section className={tableStyles.container}>
        <h2 className="text-xl font-semibold mb-4 p-4 text-gray-900 dark:text-white border-b dark:border-gray-700">
          Comments
        </h2>
        <div className="p-4">
          <textarea
            value={formData.comments}
            onChange={(e) => handleChange('comments', e.target.value)}
            readOnly={!isEditing}
            rows={4}
            className={`${tableStyles.input} resize-none`}
          />
        </div>
               </section>
         </div>
       </div>
     </ReportWrapper>
      );
 };

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; font-size: 12px; }
      
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
      
      /* Preserve grid and flexbox layouts */
      .grid { display: grid !important; }
      .flex { display: flex !important; }
      .space-y-6 > * + * { margin-top: 1.5rem !important; }
      .space-y-2 > * + * { margin-top: 0.5rem !important; }
      .gap-4 { gap: 1rem !important; }
      .gap-6 { gap: 1.5rem !important; }
      .mb-4 { margin-bottom: 1rem !important; }
      .mb-6 { margin-bottom: 1.5rem !important; }
      .p-4 { padding: 1rem !important; }
      .p-6 { padding: 1.5rem !important; }
      
      /* Table styling with better spacing */
      table { 
        border-collapse: collapse; 
        width: 100%; 
        font-size: 11px !important;
        table-layout: fixed !important;
      }
      
      th, td { 
        border: 1px solid black !important; 
        padding: 3px !important; 
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        hyphens: auto !important;
        vertical-align: top !important;
        line-height: 1.2 !important;
      }
      
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
        font-size: 10px !important;
        text-align: center !important;
      }
      
      /* Form elements styling */
      input, select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 10px !important;
        line-height: 1.2 !important;
        width: 100% !important;
        box-sizing: border-box !important;
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
      section { 
        break-inside: avoid !important; 
        margin-bottom: 15px !important; 
        page-break-inside: avoid !important;
      }
      
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
    }
  `;
  document.head.appendChild(style);
}

 export default LowVoltageCircuitBreakerThermalMagneticMTSReport; 