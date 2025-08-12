import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

// Temperature conversion and correction factor lookup tables (copied from PanelboardReport)
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
  "Not Applicable"
];

const insulationResistanceUnits = ["kΩ", "MΩ", "GΩ"];
const insulationTestVoltages = ["250V", "500V", "1000V", "2500V", "5000V"];
const contactResistanceUnits = ["μΩ", "mΩ", "Ω"];
const dielectricWithstandUnits = ["μA", "mA"];
const equipmentEvaluationResults = ["PASS", "FAIL", "LIMITED SERVICE"];

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
  status: string; // PASS, FAIL, LIMITED SERVICE

  // Temperature Data
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
  };
  humidity: number;

  // Nameplate Data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  manufacturingDate: string;
  icRating: string; // I.C. Rating (kA)
  ratedVoltage: string; // kV
  operatingVoltage: string; // kV
  ampacity: string; // A
  mvaRating: string; // MVA

  // Visual and Mechanical Inspection
  visualMechanicalInspection: {
    [key: string]: string; // NETA Section -> Result
  };
  counterReadingAsFound: string;
  counterReadingAsLeft: string;

  // E-Gap Measurements
  eGapMeasurements: {
    unitMeasurement: string;
    tolerance: string;
    aPhase: string;
    bPhase: string;
    cPhase: string;
  };

  // Contact/Pole Resistance
  contactResistance: {
    asFound: {
      p1: string;
      p2: string;
      p3: string;
      units: string;
    };
    asLeft: {
      p1: string;
      p2: string;
      p3: string;
      units: string;
    };
  };

  // Insulation Resistance
  insulationResistanceMeasured: {
    testVoltage: string;
    poleToPoleUnits: string;
    poleToFrameUnits: string;
    lineToLoadUnits: string;
    poleToPoleClosedP1P2: string;
    poleToPoleClosedP2P3: string;
    poleToPoleClosedP3P1: string;
    poleToFrameClosedP1: string;
    poleToFrameClosedP2: string;
    poleToFrameClosedP3: string;
    lineToLoadOpenP1: string;
    lineToLoadOpenP2: string;
    lineToLoadOpenP3: string;
  };
  insulationResistanceCorrected: {
    poleToPoleClosedP1P2: string;
    poleToPoleClosedP2P3: string;
    poleToPoleClosedP3P1: string;
    poleToFrameClosedP1: string;
    poleToFrameClosedP2: string;
    poleToFrameClosedP3: string;
    lineToLoadOpenP1: string;
    lineToLoadOpenP2: string;
    lineToLoadOpenP3: string;
  };

  // Dielectric Withstand
  dielectricWithstand: {
    // Dielectric Withstand - Breaker in Closed Position
    closed: {
      testVoltage: string;
      testDuration: string;
      p1Ground: string;
      p2Ground: string;
      p3Ground: string;
      units: string;
    };
    // Vacuum Bottle Integrity - Breaker in Open Position
    open: {
      testVoltage: string;
      testDuration: string;
      p1: string;
      p2: string;
      p3: string;
      units: string;
    };
  };

  // Test Equipment Used
  testEquipment: {
    megohmmeter: {
      model: string;
      serialNumber: string;
      ampId: string;
    };
    lowResistanceOhmmeter: {
      model: string;
      serialNumber: string;
      ampId: string;
    };
    hipot: {
      model: string;
      serialNumber: string;
      ampId: string;
    };
  };

  // Comments
  comments: string;
}

const visualInspectionItemsList = [
  { id: '7.6.3.A.1', description: 'Inspect physical and mechanical condition' },
  { id: '7.6.3.A.2', description: 'Inspect anchorage, alignment, and grounding.' },
  { id: '7.6.3.A.3', description: 'Verify that all maintenance devices are available for servicing and operating the breaker.' },
  { id: '7.6.3.A.6', description: 'Clean the unit.' },
  { id: '7.6.3.A.7', description: 'Inspect vacuum bottle assemblies.' },
  { id: '7.6.3.A.8', description: 'Measure critical distances such as contact gap as recommended by the manufacturer.' },
  { id: '7.6.3.A.9', description: 'If recommended by the manufacturer, slow close/open the breaker and check for binding, friction, contact alignment, contact sequence, and penetration.' },
  { id: '7.6.3.A.10', description: 'Perform all mechanical maintenance and tests on the operating mechanism in accordance with manufacturer\'s published data.' },
  { id: '7.6.3.A.11.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.6.3.B.1.' },
  { id: '7.6.3.A.12', description: 'Verify cell fit and element alignment' },
  { id: '7.6.3.A.13', description: 'Verify racking mechanism operation.' },
  { id: '7.6.3.A.14', description: 'Inspect vacuum bellows operation.' },
  { id: '7.6.3.A.15', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.' }
];

const MediumVoltageCircuitBreakerMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [saving, setSaving] = useState<boolean>(false);

  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'medium-voltage-circuit-breaker-mts-report';
  const reportName = getReportName(reportSlug);

  const initialFormData: FormData = {
    customer: '', address: '', user: '', date: new Date().toISOString().split('T')[0],
    jobNumber: '', technicians: '', substation: '', eqptLocation: '', identifier: '', status: 'PASS',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1 }, humidity: 80,
    manufacturer: '', catalogNumber: '', serialNumber: '', type: '', manufacturingDate: '',
    icRating: '', ratedVoltage: '', operatingVoltage: '', ampacity: '', mvaRating: '',
    visualMechanicalInspection: visualInspectionItemsList.reduce((acc, item) => ({ ...acc, [item.id]: 'Select One' }), {}),
    counterReadingAsFound: '', counterReadingAsLeft: '',
    eGapMeasurements: {
      unitMeasurement: '',
      tolerance: '',
      aPhase: '',
      bPhase: '',
      cPhase: '',
    },
    contactResistance: {
      asFound: {
        p1: '', p2: '', p3: '', units: 'μΩ'
      },
      asLeft: {
        p1: '', p2: '', p3: '', units: 'μΩ'
      },
    },
    insulationResistanceMeasured: {
      testVoltage: '1000V',
      poleToPoleUnits: 'MΩ',
      poleToFrameUnits: 'MΩ',
      lineToLoadUnits: 'MΩ',
      poleToPoleClosedP1P2: '',
      poleToPoleClosedP2P3: '',
      poleToPoleClosedP3P1: '',
      poleToFrameClosedP1: '',
      poleToFrameClosedP2: '',
      poleToFrameClosedP3: '',
      lineToLoadOpenP1: '',
      lineToLoadOpenP2: '',
      lineToLoadOpenP3: '',
    },
    insulationResistanceCorrected: {
      poleToPoleClosedP1P2: '', poleToPoleClosedP2P3: '', poleToPoleClosedP3P1: '',
      poleToFrameClosedP1: '', poleToFrameClosedP2: '', poleToFrameClosedP3: '',
      lineToLoadOpenP1: '', lineToLoadOpenP2: '', lineToLoadOpenP3: '',
    },
    dielectricWithstand: {
      // Dielectric Withstand - Breaker in Closed Position
      closed: {
        testVoltage: '',
        testDuration: '1 Min.',
        p1Ground: '',
        p2Ground: '',
        p3Ground: '',
        units: 'μA',
      },
      // Vacuum Bottle Integrity - Breaker in Open Position
      open: {
        testVoltage: '',
        testDuration: '1 Min.',
        p1: '',
        p2: '',
        p3: '',
        units: 'μA',
      },
    },
    testEquipment: {
      megohmmeter: {
        model: '', serialNumber: '', ampId: '',
      },
      lowResistanceOhmmeter: {
        model: '', serialNumber: '', ampId: '',
      },
      hipot: {
        model: '', serialNumber: '', ampId: '',
      },
    },
    comments: '',
  };

  const [formData, setFormData] = useState<FormData>(initialFormData);

  useEffect(() => {
    const loadJobInfo = async () => {
      if (!jobId) return;
      try {
        const { data: jobData, error: jobError } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('title, job_number, customer_id')
          .eq('id', jobId)
          .single();
        if (jobError) throw jobError;

        let customerName = '';
        let customerAddress = '';
        if (jobData?.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();
          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || '';
            customerAddress = customerData.address || '';
          }
        }
        setFormData(prev => ({
          ...prev,
          customer: customerName,
          address: customerAddress,
          jobNumber: jobData?.job_number || '',
        }));
      } catch (error) {
        console.error('Error loading job info:', error);
        alert(`Failed to load job info: ${(error as Error).message}`);
      }
    };

    if (jobId) loadJobInfo();
    if (!reportId) setLoading(false);
  }, [jobId]);

  useEffect(() => {
    const loadReportData = async () => {
      if (!reportId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_circuit_breaker_mts_reports')
          .select('*')
          .eq('id', reportId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') { // Not found
            setIsEditing(true);
          } else {
            throw error;
          }
        }
        if (data) {
          setFormData(prev => ({ ...prev, ...data.report_data, status: (data.report_data.status as 'PASS' | 'FAIL' | 'LIMITED SERVICE') || 'PASS' }));
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
    if (reportId) loadReportData();
  }, [reportId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const keys = name.split('.');
    
    setFormData(prev => {
      let current = { ...prev } as any;
      let pointer = current;
      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          pointer[key] = value;
        } else {
          if (!pointer[key]) pointer[key] = {};
          pointer = pointer[key];
        }
      });
      return current;
    });
  };
  
  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
    const tcf = getTCF(celsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius, tcf }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const roundedCelsius = Math.round(celsius);
    const fahrenheit = Math.round((roundedCelsius * 9) / 5 + 32);
    const tcf = getTCF(roundedCelsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, celsius: roundedCelsius, fahrenheit, tcf }
    }));
  };

  useEffect(() => {
    const calculateCorrected = () => {
      const corrected: Partial<FormData['insulationResistanceCorrected']> = {};
      const measured = formData.insulationResistanceMeasured;
      const tcf = formData.temperature.tcf;

      for (const key in measured) {
        if (key !== 'testVoltage' && key !== 'units') {
          const valueStr = (measured as any)[key];
          if (valueStr && !isNaN(parseFloat(valueStr))) {
            (corrected as any)[key] = (parseFloat(valueStr) * tcf).toFixed(2);
          } else {
            (corrected as any)[key] = valueStr; // Keep non-numeric like N/A, >1000 etc.
          }
        }
      }
      setFormData(prev => ({
        ...prev,
        insulationResistanceCorrected: corrected as FormData['insulationResistanceCorrected']
      }));
    };
    calculateCorrected();
  }, [formData.insulationResistanceMeasured, formData.temperature.tcf]);

  const calculateCorrectedValue = (value: string, tcf: number): string => {
    if (value && !isNaN(parseFloat(value))) {
      return (parseFloat(value) * tcf).toFixed(2);
    }
    return value; // Keep non-numeric values as is
  };

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    setSaving(true);

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData,
    };

    try {
      let result;
      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_circuit_breaker_mts_reports')
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_circuit_breaker_mts_reports')
          .insert(reportPayload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName('medium-voltage-circuit-breaker-mts-report', formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/medium-voltage-circuit-breaker-mts-report/${result.data.id}`,
            user_id: user.id,
          };
          const { error: assetError } = await supabase.schema('neta_ops').from('assets').insert(assetData);
          if (assetError) throw assetError;
          
          // Get the newly created asset's ID to link it
          const { data: newAsset, error: newAssetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .select('id')
            .eq('file_url', assetData.file_url)
            .single();
          if (newAssetError || !newAsset) throw newAssetError || new Error("Failed to retrieve new asset ID");

          await supabase.schema('neta_ops').from('job_assets').insert({
            job_id: jobId,
            asset_id: newAsset.id,
            user_id: user.id,
          });
        }
      }
      if (result.error) throw result.error;
      setIsEditing(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
    } catch (error) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;

  const renderHeader = () => (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (isEditing) {
              setFormData(prev => ({ 
                ...prev, 
                status: prev.status === 'PASS' ? 'FAIL' : prev.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS' 
              }));
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            formData.status === 'PASS'
              ? 'bg-green-600 text-white focus:ring-green-500 hover:bg-green-700'
              : formData.status === 'FAIL'
              ? 'bg-red-600 text-white focus:ring-red-500 hover:bg-red-700'
              : 'bg-yellow-500 text-black focus:ring-yellow-400 hover:bg-yellow-600'
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {formData.status}
        </button>

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
            disabled={!isEditing || saving}
            className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'}`}
          >
            {saving ? 'Saving...' : (reportId ? 'Update Report' : 'Save Report')}
          </button>
        )}
      </div>
    </div>
  );

  const renderInput = (name: string, placeholder?: string, type: string = "text", readOnlyOverride?: boolean, widthClass: string = "w-full") => {
    const value = name.split('.').reduce((o, i) => o?.[i], formData);
    const displayValue = (typeof value === 'string' || typeof value === 'number') ? value : '';
    return (
      <input
        type={type}
        name={name}
        value={displayValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        readOnly={!isEditing || readOnlyOverride}
        className={`mt-1 block ${widthClass} rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${(!isEditing || readOnlyOverride) ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
      />
    );
  }

  const renderSelect = (name: string, options: readonly string[], readOnlyOverride?: boolean, widthClass: string = "w-full") => {
    const value = name.split('.').reduce((o, i) => o?.[i], formData);
    const displayValue = (typeof value === 'string' || typeof value === 'number') ? value : '';
    return (
      <select
        name={name}
        value={displayValue}
        onChange={handleInputChange}
        disabled={!isEditing || readOnlyOverride}
        className={`mt-1 block ${widthClass} rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${(!isEditing || readOnlyOverride) ? 'bg-gray-100 dark:bg-dark-200 cursor-not-allowed' : ''}`}
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
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
      
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>

          {/* Job Information */}
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Column 1 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="customer" className="form-label inline-block w-32">Customer:</label>
                  <input id="customer" type="text" value={formData.customer} onChange={(e) => handleInputChange(e)} name="customer" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="address" className="form-label inline-block w-32">Address:</label>
                  <input id="address" type="text" value={formData.address} onChange={(e) => handleInputChange(e)} name="address" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="jobNumber" className="form-label inline-block w-32">Job #:</label>
                  <input id="jobNumber" type="text" value={formData.jobNumber} onChange={(e) => handleInputChange(e)} name="jobNumber" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="date" className="form-label inline-block w-32">Date:</label>
                  <input id="date" type="date" value={formData.date} onChange={(e) => handleInputChange(e)} name="date" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="technicians" className="form-label inline-block w-32">Technicians:</label>
                  <input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleInputChange(e)} name="technicians" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="identifier" className="form-label inline-block w-32">Identifier:</label>
                  <input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleInputChange(e)} name="identifier" readOnly={!isEditing} className="form-input flex-1" />
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="user" className="form-label inline-block w-32">User:</label>
                  <input id="user" type="text" value={formData.user} onChange={(e) => handleInputChange(e)} name="user" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="substation" className="form-label inline-block w-32">Substation:</label>
                  <input id="substation" type="text" value={formData.substation} onChange={(e) => handleInputChange(e)} name="substation" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="eqptLocation" className="form-label inline-block w-32">Eqpt. Location:</label>
                  <input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleInputChange(e)} name="eqptLocation" readOnly={!isEditing} className="form-input flex-1" />
                </div>
                {/* Temperature Fields */}
                <div className="mb-4">
                  <div className="flex items-center space-x-1 mb-2">
                    <label className="form-label inline-block w-auto">Temp:</label>
                    <input type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className="form-input w-12" />
                    <span className="text-xs">°F</span>
                    <input type="number" value={formData.temperature.celsius} readOnly className="form-input w-12 bg-gray-100 dark:bg-dark-200" />
                    <span className="text-xs">°C</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <label className="form-label inline-block w-auto">TCF:</label>
                    <input type="number" value={formData.temperature.tcf.toFixed(3)} readOnly className="form-input w-20 bg-gray-100 dark:bg-dark-200" />
                  </div>
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="humidity" className="form-label inline-block w-32">Humidity:</label>
                  <input id="humidity" type="number" value={formData.humidity} onChange={(e) => handleInputChange(e)} name="humidity" readOnly={!isEditing} className="form-input w-20" />
                  <span className="ml-2">%</span>
                </div>
              </div>
            </div>
          </section>

      {/* Nameplate Data */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer:</label>{renderInput("manufacturer")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">I.C. Rating (kA):</label>{renderInput("icRating")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number:</label>{renderInput("catalogNumber")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rated Voltage (kV):</label>{renderInput("ratedVoltage")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number:</label>{renderInput("serialNumber")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Voltage (kV):</label>{renderInput("operatingVoltage")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type:</label>{renderInput("type")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ampacity (A):</label>{renderInput("ampacity")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturing Date:</label>{renderInput("manufacturingDate")}</div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">MVA Rating:</label>{renderInput("mvaRating")}</div>
        </div>
      </section>

      {/* Visual and Mechanical Inspection */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              {visualInspectionItemsList.map(item => (
                <tr key={item.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.id}</td>
                  <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{item.description}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {renderSelect(`visualMechanicalInspection.${item.id}`, visualInspectionOptions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mt-4 border-collapse border border-gray-200 dark:border-gray-700">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200" colSpan={2}>
                  Counter Reading
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">As Found</td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("counterReadingAsFound", "", "text", false, "w-full")}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">As Left</td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("counterReadingAsLeft", "", "text", false, "w-full")}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="mt-4 border-collapse border border-gray-200 dark:border-gray-700">
            <thead>
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  E-Gap
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  Unit Measurement
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  Tolerance
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  A-Phase
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  B-Phase
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  C-Phase
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"></td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("eGapMeasurements.unitMeasurement", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("eGapMeasurements.tolerance", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("eGapMeasurements.aPhase", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("eGapMeasurements.bPhase", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("eGapMeasurements.cPhase", "", "text", false, "w-full")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Contact/Pole Resistance */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Contact/Pole Resistance</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact Resistance (As Found) */}
          <div>
            <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
              <thead>
                <tr>
                  <th colSpan={4} className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                    Contact Resistance (As Found)
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">P1</th>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">P2</th>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">P3</th>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">Units</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderInput("contactResistance.asFound.p1", "", "text", false, "w-full")}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderInput("contactResistance.asFound.p2", "", "text", false, "w-full")}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderInput("contactResistance.asFound.p3", "", "text", false, "w-full")}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderSelect("contactResistance.asFound.units", contactResistanceUnits, false, "w-full")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Contact Resistance (As Left) */}
          <div>
            <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
              <thead>
                <tr>
                  <th colSpan={4} className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                    Contact Resistance (As Left)
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">P1</th>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">P2</th>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">P3</th>
                  <th className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">Units</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderInput("contactResistance.asLeft.p1", "", "text", false, "w-full")}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderInput("contactResistance.asLeft.p2", "", "text", false, "w-full")}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderInput("contactResistance.asLeft.p3", "", "text", false, "w-full")}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                    {renderSelect("contactResistance.asLeft.units", contactResistanceUnits, false, "w-full")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Insulation Resistance */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Insulation Resistance</h2>
        <div className="overflow-x-auto">
          <div className="flex items-center mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Test Voltage:</span>
            {renderSelect("insulationResistanceMeasured.testVoltage", insulationTestVoltages, false, "w-32")}
          </div>
          <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
            <thead>
              <tr>
                <th className="w-24 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200"></th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200"></th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  Measured Values<br />P1 (P1-P2) P2 (P2-P3) P3 (P3-P1)
                </th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                  Temperature Corrected<br />P1 (P1-P2) P2 (P2-P3) P3 (P3-P1)
                </th>
                <th className="w-32 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">Units</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">Pole to Pole</td>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">Closed</td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.poleToPoleClosedP1P2", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.poleToPoleClosedP2P3", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.poleToPoleClosedP3P1", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.poleToPoleClosedP1P2, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.poleToPoleClosedP2P3, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.poleToPoleClosedP3P1, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderSelect("insulationResistanceMeasured.poleToPoleUnits", insulationResistanceUnits, false, "w-full")}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">Pole to Frame</td>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">Closed</td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.poleToFrameClosedP1", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.poleToFrameClosedP2", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.poleToFrameClosedP3", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.poleToFrameClosedP1, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.poleToFrameClosedP2, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.poleToFrameClosedP3, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderSelect("insulationResistanceMeasured.poleToFrameUnits", insulationResistanceUnits, false, "w-full")}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">Line to Load</td>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">Open</td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.lineToLoadOpenP1", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.lineToLoadOpenP2", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderInput("insulationResistanceMeasured.lineToLoadOpenP3", "", "text", false, "w-full")}
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.lineToLoadOpenP1, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.lineToLoadOpenP2, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={calculateCorrectedValue(formData.insulationResistanceMeasured.lineToLoadOpenP3, formData.temperature.tcf)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm dark:text-white"
                  />
                </td>
                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {renderSelect("insulationResistanceMeasured.lineToLoadUnits", insulationResistanceUnits, false, "w-full")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Dielectric Withstand */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Dielectric Withstand</h2>
        <div className="space-y-6">
          {/* Dielectric Withstand - Breaker in Closed Position */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Test Parameters */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Voltage</label>
                {renderInput("dielectricWithstand.closed.testVoltage", "", "text", false, "w-full")}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Duration</label>
                {renderInput("dielectricWithstand.closed.testDuration", "", "text", false, "w-full")}
              </div>
            </div>

            {/* Measurement Table */}
            <div className="lg:col-span-3">
              <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr>
                    <th colSpan={4} className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      Dielectric Withstand (Breaker In Closed Position)
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      P1 - Ground
                    </th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      P2 - Ground
                    </th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      P3 - Ground
                    </th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderInput("dielectricWithstand.closed.p1Ground", "", "text", false, "w-full")}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderInput("dielectricWithstand.closed.p2Ground", "", "text", false, "w-full")}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderInput("dielectricWithstand.closed.p3Ground", "", "text", false, "w-full")}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderSelect("dielectricWithstand.closed.units", dielectricWithstandUnits, false, "w-full")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Vacuum Bottle Integrity - Breaker in Open Position */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Test Parameters */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Voltage</label>
                {renderInput("dielectricWithstand.open.testVoltage", "", "text", false, "w-full")}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Duration</label>
                {renderInput("dielectricWithstand.open.testDuration", "", "text", false, "w-full")}
              </div>
            </div>

            {/* Measurement Table */}
            <div className="lg:col-span-3">
              <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr>
                    <th colSpan={4} className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      Vacuum Bottle Integrity (Breaker In Open Position)
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      P1
                    </th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      P2
                    </th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      P3
                    </th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderInput("dielectricWithstand.open.p1", "", "text", false, "w-full")}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderInput("dielectricWithstand.open.p2", "", "text", false, "w-full")}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderInput("dielectricWithstand.open.p3", "", "text", false, "w-full")}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {renderSelect("dielectricWithstand.open.units", dielectricWithstandUnits, false, "w-full")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Test Equipment Used */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
        <div className="space-y-4">
          {/* Megohmmeter */}
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-900 dark:text-white w-32">Megohmmeter:</label>
            {renderInput("testEquipment.megohmmeter.model", "", "text", false, "flex-1")}
            <label className="text-sm font-medium text-gray-900 dark:text-white">Serial Number:</label>
            {renderInput("testEquipment.megohmmeter.serialNumber", "", "text", false, "w-32")}
            <label className="text-sm font-medium text-gray-900 dark:text-white">AMP ID:</label>
            {renderInput("testEquipment.megohmmeter.ampId", "", "text", false, "w-32")}
          </div>

          {/* Low-Resistance Ohmmeter */}
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-900 dark:text-white w-32">Low-Resistance Ohmmeter:</label>
            {renderInput("testEquipment.lowResistanceOhmmeter.model", "", "text", false, "flex-1")}
            <label className="text-sm font-medium text-gray-900 dark:text-white">Serial Number:</label>
            {renderInput("testEquipment.lowResistanceOhmmeter.serialNumber", "", "text", false, "w-32")}
            <label className="text-sm font-medium text-gray-900 dark:text-white">AMP ID:</label>
            {renderInput("testEquipment.lowResistanceOhmmeter.ampId", "", "text", false, "w-32")}
          </div>

          {/* Hipot */}
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-900 dark:text-white w-32">Hipot:</label>
            {renderInput("testEquipment.hipot.model", "", "text", false, "flex-1")}
            <label className="text-sm font-medium text-gray-900 dark:text-white">Serial Number:</label>
            {renderInput("testEquipment.hipot.serialNumber", "", "text", false, "w-32")}
            <label className="text-sm font-medium text-gray-900 dark:text-white">AMP ID:</label>
            {renderInput("testEquipment.hipot.ampId", "", "text", false, "w-32")}
          </div>
        </div>
      </section>

      {/* Comments */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
        <textarea
          name="comments"
          value={formData.comments}
          onChange={handleInputChange}
          placeholder="Enter any comments or notes here..."
          readOnly={!isEditing}
          rows={4}
          className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
        />
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
      
      /* Print-specific form input sizing */
      .form-input {
        width: auto !important;
        max-width: 120px !important;
        min-width: 60px !important;
      }
      
      /* Temperature fields specific sizing */
      input[type="number"] {
        width: 40px !important;
        max-width: 40px !important;
        min-width: 40px !important;
      }
      
      /* Job information fields */
      .mb-4.flex.items-center .form-input {
        width: 150px !important;
        max-width: 150px !important;
      }
      
      /* Nameplate data fields */
      .grid.grid-cols-2 .form-input {
        width: 120px !important;
        max-width: 120px !important;
      }
      
      /* Test equipment fields */
      .space-y-4 .form-input {
        width: 100px !important;
        max-width: 100px !important;
      }
      
      /* Comments textarea */
      textarea {
        width: 100% !important;
        max-width: none !important;
      }
      
      /* Ensure all text is black for maximum readability */
      * { color: black !important; }
    }
  `;
  document.head.appendChild(style);
}

export default MediumVoltageCircuitBreakerMTSReport; 