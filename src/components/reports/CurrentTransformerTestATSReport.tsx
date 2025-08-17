import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import _ from 'lodash';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';

// Temperature conversion and correction factor lookup tables
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

function calculateTempCorrection(reading: string, tcf: number): string {
  if (reading === undefined || reading === null || reading === '') return '';
  const numeric = parseFloat(String(reading).replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(numeric)) return '';
  const corrected = numeric * (tcf || 1);
  return String(Math.round((corrected + Number.EPSILON) * 100) / 100);
}

const visualInspectionOptions = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable"
];

const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const insulationTestVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];

interface FormData {
  // Job Information
  customerName: string;
  customerAddress: string;
  userName: string;
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
  status: 'PASS' | 'FAIL';

  // Nameplate Data (Device Data)
  nameplate_data: {
    manufacturer: string;
    deviceClass: string;
    ctRatio: string;
    serialNumber: string;
    catalogNumber: string;
    voltageRating: string;
    polarityFacing: string;
    deviceType: string;
    frequency: string;
  };

  // Visual and Mechanical Inspection
  visualInspectionItems: {
    netaSection: string;
    description: string;
    result: string;
  }[];

  // Electrical Tests
  electricalTests: {
    primaryWinding: {
      testVoltage: string;
      results: string;
      units: string;
      reading: string;
      tempCorrection20C: string;
    };
    secondaryWinding: {
      testVoltage: string;
      results: string;
      units: string;
      reading: string;
      tempCorrection20C: string;
    };
  };

  // Test Equipment Used
  testEquipment: {
    megohmmeter: string;
    megohmmeterSerial: string;
    megohmmeterAmpId: string;
  };

  // Comments
  comments: string;
}

const CurrentTransformerTestATSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'current-transformer-test-ats-report'; // This component handles the current-transformer-test-ats-report route
  const reportName = getReportName(reportSlug);

  const initialVisualInspectionItems = [
    { netaSection: '7.10.1.A.1', description: 'Compare equipment nameplate data with drawings and specifications.', result: '' },
    { netaSection: '7.10.1.A.2', description: 'Inspect physical and mechanical condition.', result: '' },
    { netaSection: '7.10.1.A.3', description: 'Verify correct connection of transformers with system requirements.', result: '' },
    { netaSection: '7.10.1.A.4', description: 'Verify that adequate clearances exist between primary and secondary circuit wiring.', result: '' },
    { netaSection: '7.10.1.A.5', description: 'Verify the unit is clean.', result: '' },
    { netaSection: '7.10.1.A.6.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.10.1.B.1.', result: '' },
    { netaSection: '7.10.1.A.7', description: 'Verify that all required grounding and shorting connections provide contact.', result: '' },
    { netaSection: '7.10.1.A.8', description: 'Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: '' },
  ];
  
  const initialFormData: FormData = {
    customerName: '',
    customerAddress: '',
    userName: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 76, celsius: 24, tcf: 1.2, humidity: 0 },
    substation: '',
    eqptLocation: '',
    status: 'PASS',

    nameplate_data: {
      manufacturer: '',
      deviceClass: '',
      ctRatio: '',
      serialNumber: '',
      catalogNumber: '',
      voltageRating: '',
      polarityFacing: '',
      deviceType: '',
      frequency: '',
    },

    visualInspectionItems: initialVisualInspectionItems,

    electricalTests: {
      primaryWinding: { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' },
      secondaryWinding: { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' },
    },

    testEquipment: { megohmmeter: '', megohmmeterSerial: '', megohmmeterAmpId: '' },
    comments: '',
  };

  const [formData, setFormData] = useState<FormData>(initialFormData);

  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = Math.round((fahrenheit - 32) * 5 / 9);
    const tcf = getTCF(celsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius, tcf },
      electricalTests: {
        ...prev.electricalTests,
        primaryWinding: {
          ...prev.electricalTests.primaryWinding,
          tempCorrection20C: calculateTempCorrection(prev.electricalTests.primaryWinding.reading, tcf)
        },
        secondaryWinding: {
          ...prev.electricalTests.secondaryWinding,
          tempCorrection20C: calculateTempCorrection(prev.electricalTests.secondaryWinding.reading, tcf)
        }
      }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = Math.round((celsius * 9 / 5) + 32);
    const tcf = getTCF(celsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius, tcf },
      electricalTests: {
        ...prev.electricalTests,
        primaryWinding: {
          ...prev.electricalTests.primaryWinding,
          tempCorrection20C: calculateTempCorrection(prev.electricalTests.primaryWinding.reading, tcf)
        },
        secondaryWinding: {
          ...prev.electricalTests.secondaryWinding,
          tempCorrection20C: calculateTempCorrection(prev.electricalTests.secondaryWinding.reading, tcf)
        }
      }
    }));
  };

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

      if (jobData) {
        let customerName = '';
        let customerAddress = '';
        if (jobData.customer_id) {
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
          jobNumber: jobData.job_number || '',
          customerName: customerName,
          customerAddress: customerAddress,
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      alert(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!reportId) setLoading(false);
    }
  };

  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('current_transformer_test_ats_reports') // New table name
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
        setFormData(prev => ({
          ...prev,
          customerName: data.report_info?.customerName || prev.customerName,
          customerAddress: data.report_info?.customerAddress || prev.customerAddress,
          userName: data.report_info?.userName || prev.userName,
          date: data.report_info?.date || prev.date,
          identifier: data.report_info?.identifier || '',
          jobNumber: data.report_info?.jobNumber || prev.jobNumber,
          technicians: data.report_info?.technicians || '',
          temperature: data.report_info?.temperature || prev.temperature,
          substation: data.report_info?.substation || '',
          eqptLocation: data.report_info?.eqptLocation || '',
          status: data.report_info?.status || 'PASS',

          nameplate_data: data.nameplate_data || prev.nameplate_data,
          visualInspectionItems: data.visual_mechanical_inspection?.items || initialVisualInspectionItems,
          electricalTests: data.electrical_tests || prev.electricalTests,
          testEquipment: data.test_equipment || prev.testEquipment,
          comments: data.comments || '',
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

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customerName: formData.customerName,
        customerAddress: formData.customerAddress,
        userName: formData.userName,
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
        manufacturer: formData.nameplate_data.manufacturer,
        deviceClass: formData.nameplate_data.deviceClass,
        ctRatio: formData.nameplate_data.ctRatio,
        serialNumber: formData.nameplate_data.serialNumber,
        catalogNumber: formData.nameplate_data.catalogNumber,
        voltageRating: formData.nameplate_data.voltageRating,
        polarityFacing: formData.nameplate_data.polarityFacing,
        deviceType: formData.nameplate_data.deviceType,
        frequency: formData.nameplate_data.frequency,
      },
      visual_mechanical_inspection: { items: formData.visualInspectionItems },
      electrical_tests: formData.electricalTests,
      test_equipment: formData.testEquipment,
      comments: formData.comments,
    };

    try {
      let result;
      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from('current_transformer_test_ats_reports')
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('current_transformer_test_ats_reports')
          .insert(reportPayload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/current-transformer-test-ats-report/${result.data.id}`,
            user_id: user.id,
            template_type: 'ATS' // Added template_type
          };
          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();
          if (assetError) throw assetError;
          await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
        }
      }

      if (result.error) throw result.error;
      setIsEditing(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    }
  };
  
  useEffect(() => {
    if (jobId) loadJobInfo();
    if (reportId) loadReport(); else setLoading(false);
  }, [jobId, reportId]);

  useEffect(() => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      electricalTests: {
        ...prev.electricalTests,
        primaryWinding: {
          ...(prev.electricalTests?.primaryWinding || { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' }),
          tempCorrection20C: calculateTempCorrection((prev.electricalTests?.primaryWinding?.reading || ''), prev.temperature.tcf)
        },
        secondaryWinding: {
          ...(prev.electricalTests?.secondaryWinding || { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' }),
          tempCorrection20C: calculateTempCorrection((prev.electricalTests?.secondaryWinding?.reading || ''), prev.temperature.tcf)
        }
      }
    }));
  }, [formData.electricalTests?.primaryWinding?.reading, formData.electricalTests?.secondaryWinding?.reading, formData.temperature.tcf, isEditing]);

  // Safe getters for rendering values
  const pw = formData.electricalTests?.primaryWinding || { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' };
  const sw = formData.electricalTests?.secondaryWinding || { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' };

  const handleChange = (section: keyof FormData | null, field: string, value: any, index?: number, subField?: string) => {
    if (!isEditing) return;
  
    setFormData(prev => {
      const newState = _.cloneDeep(prev);
  
      if (section === 'visualInspectionItems' && typeof index === 'number') {
        (newState.visualInspectionItems[index] as any)[field as keyof typeof newState.visualInspectionItems[0]] = value;
      } else if (section === 'electricalTests' && subField && (field === 'primaryWinding' || field === 'secondaryWinding')) {
        (newState.electricalTests[field] as any)[subField as keyof typeof newState.electricalTests.primaryWinding] = value;
      } else if (section === 'temperature' || section === 'testEquipment') {
        (newState[section] as any)[field] = value;
      } else if (section && typeof newState[section] === 'object' && newState[section] !== null && !(newState[section] instanceof Array)) {
        (newState[section] as any)[field] = value;
      } else if (!section) {
        (newState as any)[field] = value;
      }
      return newState;
    });
  };

  if (loading) return <div className="p-6 text-center">Loading report data...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.10.1
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
                border: '2px solid #16a34a',
                backgroundColor: '#22c55e',
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
      
      {/* Header */}
      <div className="print:hidden flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (isEditing) {
                setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' }));
              }
            }}
            disabled={!isEditing}
            className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
              'bg-red-600 text-white focus:ring-red-500'
            } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
          >
            {formData.status}
          </button>

          {reportId && !isEditing ? (
            <>
              <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
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
            <button onClick={handleSave} disabled={!isEditing} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}>
              Save Report
            </button>
          )}
        </div>
      </div>

      {/* Job Information */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-job-info">Job Information</h2>
        

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2">
            <div><label className="form-label">Customer:</label><input type="text" value={formData.customerName} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
            <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
            <div><label htmlFor="technicians" className="form-label">Technicians:</label><input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange(null, 'technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="date" className="form-label">Date:</label><input id="date" type="date" value={formData.date} onChange={(e) => handleChange(null, 'date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="identifier" className="form-label">Identifier:</label><input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange(null, 'identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
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
            <div><label htmlFor="temperature.humidity" className="form-label">Humidity:</label><input id="temperature.humidity" type="number" value={formData.temperature.humidity} onChange={(e) => handleChange('temperature', 'humidity', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /><span className="ml-1 text-xs">%</span></div>
            <div><label htmlFor="substation" className="form-label">Substation:</label><input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange(null, 'substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label><input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange(null, 'eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div className="md:col-span-2"><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.userName} onChange={(e) => handleChange(null, 'userName', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>

        </div>
      </div>

      {/* Device Data */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-device-data">Device Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 gap-x-4 gap-y-2">
            <div><label htmlFor="manufacturer" className="form-label">Manufacturer:</label><input id="manufacturer" type="text" value={formData.nameplate_data.manufacturer} onChange={(e) => handleChange('nameplate_data', 'manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceClass" className="form-label">Class:</label><input id="deviceClass" type="text" value={formData.nameplate_data.deviceClass} onChange={(e) => handleChange('nameplate_data', 'deviceClass', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="ctRatio" className="form-label">CT Ratio:</label><input id="ctRatio" type="text" value={formData.nameplate_data.ctRatio} onChange={(e) => handleChange('nameplate_data', 'ctRatio', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="serialNumber" className="form-label">Serial #:</label><input id="serialNumber" type="text" value={formData.nameplate_data.serialNumber} onChange={(e) => handleChange('nameplate_data', 'serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="catalogNumber" className="form-label">Catalog Number:</label><input id="catalogNumber" type="text" value={formData.nameplate_data.catalogNumber} onChange={(e) => handleChange('nameplate_data', 'catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="voltageRating" className="form-label">Voltage Rating (V):</label><input id="voltageRating" type="text" value={formData.nameplate_data.voltageRating} onChange={(e) => handleChange('nameplate_data', 'voltageRating', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="polarityFacing" className="form-label">Polarity Facing:</label><input id="polarityFacing" type="text" value={formData.nameplate_data.polarityFacing} onChange={(e) => handleChange('nameplate_data', 'polarityFacing', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceType" className="form-label">Type:</label><input id="deviceType" type="text" value={formData.nameplate_data.deviceType} onChange={(e) => handleChange('nameplate_data', 'deviceType', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="frequency" className="form-label">Frequency:</label><input id="frequency" type="text" value={formData.nameplate_data.frequency} onChange={(e) => handleChange('nameplate_data', 'frequency', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
        </div>
      </div>
      
      {/* Visual and Mechanical Inspection */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-visual-mechanical">Visual and Mechanical Inspection</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 visual-mechanical-table table-fixed">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '68%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              {formData.visualInspectionItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">{item.netaSection}</td>
                  <td className="px-3 py-2 text-sm whitespace-normal break-words">{item.description}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <select
                      value={item.result}
                      onChange={(e) => handleChange('visualInspectionItems', 'result', e.target.value, index)}
                      disabled={!isEditing}
                      className={`form-select ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {visualInspectionOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <span className="print:inline-block" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>{item.result === 'Select One' ? '' : item.result}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Electrical Tests */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-electrical-tests">Electrical Tests</h2>
        
        {/* Primary Winding */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Primary Winding - 1 min. Insulation Resistance to Ground</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="text-left mb-1">Test Voltage:</div>
                    <select 
                      value={pw.testVoltage} 
                      onChange={(e) => handleChange('electricalTests', 'primaryWinding', e.target.value, undefined, 'testVoltage')} 
                      disabled={!isEditing}
                      className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationTestVoltageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">Reading</td>
                  <td className="px-6 py-4">
                    <input 
                      type="text" 
                      value={pw.reading} 
                      onChange={(e) => handleChange('electricalTests', 'primaryWinding', e.target.value, undefined, 'reading')} 
                      readOnly={!isEditing}
                      className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={pw.units} 
                      onChange={(e) => handleChange('electricalTests', 'primaryWinding', e.target.value, undefined, 'units')} 
                      disabled={!isEditing}
                      className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationResistanceUnitsOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">Temp. Correction 20°C</td>
                  <td className="px-6 py-4">
                    <input 
                      type="text" 
                      value={pw.tempCorrection20C} 
                      readOnly 
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                    {pw.units}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Secondary Winding */}
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Secondary Winding - 1 min. Insulation Resistance to Ground</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    <div className="text-left mb-1">Test Voltage:</div>
                    <select 
                      value={sw.testVoltage} 
                      onChange={(e) => handleChange('electricalTests', 'secondaryWinding', e.target.value, undefined, 'testVoltage')} 
                      disabled={!isEditing}
                      className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationTestVoltageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">Reading</td>
                  <td className="px-6 py-4">
                    <input 
                      type="text" 
                      value={sw.reading} 
                      onChange={(e) => handleChange('electricalTests', 'secondaryWinding', e.target.value, undefined, 'reading')} 
                      readOnly={!isEditing}
                      className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={sw.units} 
                      onChange={(e) => handleChange('electricalTests', 'secondaryWinding', e.target.value, undefined, 'units')} 
                      disabled={!isEditing}
                      className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationResistanceUnitsOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">Temp. Correction 20°C</td>
                  <td className="px-6 py-4">
                    <input 
                      type="text" 
                      value={sw.tempCorrection20C} 
                      readOnly 
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                    {sw.units}
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
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-test-equipment">Test Equipment Used</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="megohmmeter" className="form-label block">Megohmmeter:</label>
            <input id="megohmmeter" type="text" value={formData.testEquipment.megohmmeter} onChange={(e) => handleChange('testEquipment', 'megohmmeter', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
          </div>
          <div>
            <label htmlFor="megohmmeterSerial" className="form-label block">Serial Number:</label>
            <input id="megohmmeterSerial" type="text" value={formData.testEquipment.megohmmeterSerial} onChange={(e) => handleChange('testEquipment', 'megohmmeterSerial', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
          </div>
          <div>
            <label htmlFor="megohmmeterAmpId" className="form-label block">AMP ID:</label>
            <input id="megohmmeterAmpId" type="text" value={formData.testEquipment.megohmmeterAmpId} onChange={(e) => handleChange('testEquipment', 'megohmmeterAmpId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-comments">Comments</h2>
        <textarea
          value={formData.comments}
          onChange={(e) => handleChange(null, 'comments', e.target.value)}
          readOnly={!isEditing}
          rows={1}
          className={`form-textarea w-full resize-none ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          placeholder="Enter comments here..."
        />
      </div>
    </div>
  );
};

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
      }
      
      .form-input, .form-select, .form-textarea {
        background-color: white !important;
        border: 1px solid black !important;
        color: black !important;
        padding: 2px !important;
        font-size: 10px !important;
      }
      
      select {
        background-image: none !important;
        padding-right: 8px !important;
      }
      
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      
      input[type="number"] {
        -moz-appearance: textfield !important;
      }
      
      table {
        border-collapse: collapse !important;
        width: 100% !important;
        border: 1px solid black !important;
      }
      
      th, td {
        border: 1px solid black !important;
        padding: 4px !important;
        color: black !important;
        text-align: left !important;
      }
      
      th {
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
        text-align: center !important;
      }
      
      /* Ensure all table cells have borders */
      table th, table td {
        border: 1px solid black !important;
      }
      
      /* Specific styling for electrical test tables */
      .section-electrical-tests table {
        border: 1px solid black !important;
      }
      
      .section-electrical-tests th,
      .section-electrical-tests td {
        border: 1px solid black !important;
        padding: 4px !important;
      }
      
      button {
        display: none !important;
      }
      
      section {
        break-inside: avoid !important;
        margin-bottom: 20px !important;
      }
      
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
}

export default CurrentTransformerTestATSReport; 