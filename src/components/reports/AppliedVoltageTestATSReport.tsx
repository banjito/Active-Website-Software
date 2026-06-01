import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';

// Temperature correction factor lookup table
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
  '36': 2.1, '37': 2.2, '38': 2.3, '39': 2.4, '40': 2.5
};

const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString();
  return tcfTable[key] !== undefined ? tcfTable[key] : 1;
};

// Dropdown options
const windingConnectionOptions = ['Select', 'Delta', 'Wye', 'Single Phase'];
const windingMaterialOptions = ['Select', 'Copper', 'Aluminum', 'Other'];
const testFrequencyOptions = ['Select', '50', '60'];
const testResultOptions = ['Select', 'Pass', 'Fail'];
const testVoltageOptions = ['Select', '10', '15', '19', '26', '34', '50', '70', '95', '140'];

interface AppliedVoltageTestRow {
  windingUnderTest: string;
  testVoltage: string;
  testFrequency: string;
  duration: string;
  results: string;
}

interface TestEquipmentItem {
  name: string;
  serialNumber: string;
  ampId: string;
  calDate: string;
}

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

  // Nameplate Data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  kva: string;
  tempRise: string;
  impedance: string;
  primaryVoltage1: string;
  primaryVoltage2: string;
  secondaryVoltage1: string;
  secondaryVoltage2: string;
  primaryWindingConnection: string;
  secondaryWindingConnection: string;
  primaryWindingMaterial: string;
  secondaryWindingMaterial: string;
  primaryBIL: string;
  secondaryBIL: string;

  // Applied Voltage Test Data
  appliedVoltageTests: AppliedVoltageTestRow[];

  // Test Equipment Used
  testEquipment: TestEquipmentItem;

  // Comments
  comments: string;
  status: 'PASS' | 'FAIL';
}

const initialAppliedVoltageTests: AppliedVoltageTestRow[] = [
  { windingUnderTest: 'Primary', testVoltage: 'Select', testFrequency: 'Select', duration: '', results: 'Select' },
  { windingUnderTest: 'Secondary', testVoltage: 'Select', testFrequency: 'Select', duration: '', results: 'Select' },
];

const AppliedVoltageTestATSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const [isSaving, setIsSaving] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);

  const reportSlug = 'applied-voltage-test-ats-report';
  const reportName = getReportName(reportSlug);

  const [formData, setFormData] = useState<FormData>(() => ({
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50 },
    substation: '',
    eqptLocation: '',
    manufacturer: '',
    catalogNumber: '',
    serialNumber: '',
    kva: '',
    tempRise: '',
    impedance: '',
    primaryVoltage1: '',
    primaryVoltage2: '',
    secondaryVoltage1: '',
    secondaryVoltage2: '',
    primaryWindingConnection: 'Select',
    secondaryWindingConnection: 'Select',
    primaryWindingMaterial: 'Select',
    secondaryWindingMaterial: 'Select',
    primaryBIL: '',
    secondaryBIL: '',
    appliedVoltageTests: JSON.parse(JSON.stringify(initialAppliedVoltageTests)),
    testEquipment: { name: '', serialNumber: '', ampId: '', calDate: '' },
    comments: '',
    status: 'PASS',
  }));

  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('title, job_number, customer_id, site_address')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;

      if (jobData) {
        let customerName = '';
        let customerAddress = jobData.site_address || '';
        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();
          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || '';
            customerAddress = jobData.site_address || customerData.address || customerAddress || '';
          }
        }
        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: maskCustomerName(customerName),
          address: maskCustomerAddress(customerAddress),
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
    }
  }, [jobId]);

  const loadReport = useCallback(async () => {
    if (!currentReportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    if (isAutoSaveCreatedRef.current) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('applied_voltage_test_ats_reports')
        .select('*')
        .eq('id', currentReportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setIsEditing(true);
        } else {
          throw error;
        }
      }
      if (data) {
        if (data.data) {
          setFormData(prev => ({
            ...prev,
            ...data.data,
            status: data.data.status || 'PASS'
          }));
        } else if (data.report_info) {
          setFormData(prev => ({
            ...prev,
            ...data.report_info,
            appliedVoltageTests: data.applied_voltage_tests || prev.appliedVoltageTests,
            testEquipment: data.test_equipment || prev.testEquipment,
            comments: data.comments || '',
            status: data.report_info?.status || 'PASS',
          }));
        }
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  }, [currentReportId]);

  useEffect(() => {
    loadJobInfo();
    if (currentReportId) {
      loadReport();
    } else {
      setLoading(false);
      setIsEditing(true);
    }
  }, [jobId, currentReportId, loadJobInfo, loadReport]);

  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = ((fahrenheit - 32) * 5) / 9;
    const tcf = getTCF(celsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius: parseFloat(celsius.toFixed(1)), tcf }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = (celsius * 9) / 5 + 32;
    const tcf = getTCF(celsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, celsius, fahrenheit: parseFloat(fahrenheit.toFixed(1)), tcf }
    }));
  };

  const handleChange = (field: string, value: any) => {
    if (!isEditing) return;
    setFormData(prev => {
      const keys = field.split('.');
      if (keys.length === 1) {
        return { ...prev, [field]: value };
      }
      const current: any = { ...prev };
      let obj = current;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] };
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return current;
    });
  };

  const handleAppliedVoltageTestChange = (index: number, field: keyof AppliedVoltageTestRow, value: string) => {
    if (!isEditing) return;
    setFormData(prev => {
      const newTests = prev.appliedVoltageTests.map((test, i) =>
        i === index ? { ...test, [field]: value } : test
      );
      return { ...prev, appliedVoltageTests: newTests };
    });
  };

  const handleTestEquipmentChange = (field: keyof TestEquipmentItem, value: string) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      testEquipment: { ...prev.testEquipment, [field]: value }
    }));
  };

  // Autosave function
  const autoSave = useCallback(async () => {
    if (!jobId || !user?.id || !isEditing || isAutoSaving) return;

    setIsAutoSaving(true);

    const basePayload = {
      job_id: jobId,
      user_id: user.id,
      report_info: { ...formData },
      applied_voltage_tests: formData.appliedVoltageTests,
      test_equipment: formData.testEquipment,
      comments: formData.comments,
    };

    const fullPayload = { ...basePayload, data: { ...formData } };

    try {
      let result: any;
      if (reportIdRef.current) {
        result = await supabase
          .schema('neta_ops')
          .from('applied_voltage_test_ats_reports')
          .update(fullPayload)
          .eq('id', reportIdRef.current)
          .select()
          .single();
        if (result?.error && String(result.error.message || '').toLowerCase().includes('data')) {
          result = await supabase
            .schema('neta_ops')
            .from('applied_voltage_test_ats_reports')
            .update(basePayload)
            .eq('id', reportIdRef.current)
            .select()
            .single();
        }
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema('neta_ops')
            .from('applied_voltage_test_ats_reports')
            .insert(fullPayload)
            .select()
            .single();
          if (result?.error && String(result.error.message || '').toLowerCase().includes('data')) {
            result = await supabase
              .schema('neta_ops')
              .from('applied_voltage_test_ats_reports')
              .insert(basePayload)
              .select()
              .single();
          }

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;
            isAutoSaveCreatedRef.current = true;
            setCurrentReportId(newReportId);

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || formData.serialNumber || 'Unnamed'),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
              user_id: user.id,
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

            window.history.replaceState({}, '', `/jobs/${jobId}/${reportSlug}/${newReportId}`);
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Autosave error:', error);
    } finally {
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, isEditing, isAutoSaving, formData, reportSlug]);

  // Autosave effect
  useEffect(() => {
    if (!isEditing || loading) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, isEditing, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    setIsSaving(true);

    const basePayload = {
      job_id: jobId,
      user_id: user.id,
      report_info: { ...formData },
      applied_voltage_tests: formData.appliedVoltageTests,
      test_equipment: formData.testEquipment,
      comments: formData.comments,
    };

    const fullPayload = { ...basePayload, data: { ...formData } };

    try {
      let result: any;
      if (reportIdRef.current) {
        result = await supabase
          .schema('neta_ops')
          .from('applied_voltage_test_ats_reports')
          .update(fullPayload)
          .eq('id', reportIdRef.current)
          .select()
          .single();
        if (result?.error && String(result.error.message || '').toLowerCase().includes('data')) {
          result = await supabase
            .schema('neta_ops')
            .from('applied_voltage_test_ats_reports')
            .update(basePayload)
            .eq('id', reportIdRef.current)
            .select()
            .single();
        }
      } else if (creatingRef.current) {
        const deadline = Date.now() + 5000;
        while (creatingRef.current && !reportIdRef.current && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!reportIdRef.current) {
          throw new Error('Report creation is still in progress. Please try again.');
        }
        result = await supabase
          .schema('neta_ops')
          .from('applied_voltage_test_ats_reports')
          .update(fullPayload)
          .eq('id', reportIdRef.current)
          .select()
          .single();
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema('neta_ops')
            .from('applied_voltage_test_ats_reports')
            .insert(fullPayload)
            .select()
            .single();
          if (result?.error && String(result.error.message || '').toLowerCase().includes('data')) {
            result = await supabase
              .schema('neta_ops')
              .from('applied_voltage_test_ats_reports')
              .insert(basePayload)
              .select()
              .single();
          }

          if (result.data) {
            reportIdRef.current = result.data.id;
            setCurrentReportId(result.data.id);

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || formData.serialNumber || 'Unnamed'),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
              user_id: user.id,
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
          } else {
            creatingRef.current = false;
          }
        } catch (saveError) {
          creatingRef.current = false;
          throw saveError;
        }
      }
      if (result.error) throw result.error;
      setIsEditing(false);
      alert('Report ' + (reportIdRef.current ? 'updated' : 'saved') + ' successfully!');
      navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert('Failed to save report: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Print CSS injection
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      if (document.getElementById('print-css-applied-voltage')) return;
      const style = document.createElement('style');
      style.id = 'print-css-applied-voltage';
      style.textContent = `
        @media print {
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          .print\\:break-before-page { page-break-before: always; }
          .print\\:break-after-page { page-break-after: always; }
          .print\\:break-inside-avoid { page-break-inside: avoid; }
          .print\\:text-black { color: black !important; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:border-black { border-color: black !important; }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 11px !important;
          }
          th, td {
            border: 1px solid black !important;
            padding: 6px 4px !important;
            color: black !important;
            font-size: 11px !important;
            box-sizing: border-box !important;
            line-height: 1.25 !important;
            background: white !important;
            vertical-align: middle !important;
            word-break: break-word !important;
            white-space: normal !important;
          }
          th {
            background-color: #f0f0f0 !important;
            font-weight: bold !important;
          }
          table input, table select {
            font-size: 11px !important;
            padding: 0px !important;
            border: none !important;
            background: transparent !important;
            width: 100% !important;
            text-align: center !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }
          select {
            background-image: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
          }
          .print\\:hidden { display: none !important; }
          .hidden.print\\:block { display: block !important; }
          button { display: none !important; }
          * { color: black !important; }
          .form-input, .form-select {
            border: 1px solid black !important;
            background-color: white !important;
            color: black !important;
            padding: 4px 6px !important;
            font-size: 11px !important;
            width: 100% !important;
            display: block !important;
          }
          h2 {
            font-size: 14px !important;
            font-weight: bold !important;
            margin-bottom: 8px !important;
            padding-bottom: 4px !important;
            border-bottom: 1px solid black !important;
            color: black !important;
          }
          section { break-inside: avoid !important; page-break-inside: avoid !important; }
          @page {
            size: portrait;
            margin: 10mm;
          }
          .max-w-7xl {
            max-width: none !important;
            width: 100% !important;
          }
          textarea {
            min-height: 80px !important;
            max-height: none !important;
            resize: none !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            font-family: Arial, sans-serif !important;
            line-height: 1.4 !important;
            overflow: visible !important;
            display: block !important;
            width: 100% !important;
            border: 1px solid black !important;
            background-color: white !important;
            color: black !important;
            padding: 8px !important;
            font-size: 11px !important;
            margin-top: 8px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (loading) return <div className="p-4 text-center text-lg text-gray-700 dark:text-white">Loading report data...</div>;

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS
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
                border: formData.status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: formData.status === 'PASS' ? '#22c55e' : '#ef4444',
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
        {/* Screen Header */}
        <div className="print:hidden flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
          <div className="flex gap-2 items-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              ✓ Auto Saving Enabled
            </span>
            <button
              onClick={() => {
                if (isEditing) handleChange('status', formData.status === 'PASS' ? 'FAIL' : 'PASS');
              }}
              disabled={!isEditing}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
                'bg-red-600 text-white focus:ring-red-500'
              } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
            >
              {formData.status}
            </button>

            {currentReportId && !isEditing ? (
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
              <button onClick={handleSave} disabled={!isEditing || isSaving} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}>
                {isSaving ? 'Saving...' : 'Save Report'}
              </button>
            )}
          </div>
        </div>

        {/* Job Information */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden">
            <div><label className="form-label">Customer:</label><input type="text" value={maskCustomerName(formData.customer)} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
            <div className="md:col-span-2 lg:col-span-3"><label className="form-label">Address:</label><input type="text" value={maskCustomerAddress(formData.address)} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
            <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
            <div><label htmlFor="technicians" className="form-label">Technicians:</label><input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
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
            <div><label htmlFor="temperature.humidity" className="form-label">Humidity:</label><input id="temperature.humidity" type="number" value={formData.temperature.humidity || ''} onChange={(e) => handleChange('temperature.humidity', e.target.value === '' ? null : Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /><span className="ml-1 text-xs">%</span></div>
            <div><label htmlFor="substation" className="form-label">Substation:</label><input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label><input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
          </div>

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
              temperature: { ...formData.temperature }
            }}
          />
        </section>

        {/* Nameplate Data */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden">
            <div><label htmlFor="manufacturer" className="form-label">Manufacturer:</label><input id="manufacturer" type="text" value={formData.manufacturer} onChange={(e) => handleChange('manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="catalogNumber" className="form-label">Catalog Number:</label><input id="catalogNumber" type="text" value={formData.catalogNumber} onChange={(e) => handleChange('catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="serialNumber" className="form-label">Serial Number:</label><input id="serialNumber" type="text" value={formData.serialNumber} onChange={(e) => handleChange('serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="kva" className="form-label">KVA:</label><input id="kva" type="text" value={formData.kva} onChange={(e) => handleChange('kva', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="tempRise" className="form-label">Temp. Rise:</label><input id="tempRise" type="text" value={formData.tempRise} onChange={(e) => handleChange('tempRise', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            <div><label htmlFor="impedance" className="form-label">Impedance:</label><input id="impedance" type="text" value={formData.impedance} onChange={(e) => handleChange('impedance', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
          </div>

          {/* Voltages Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white"></th>
                  <th colSpan={2} className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Voltages (V)</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Winding Connections</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Winding Material</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">BIL (kV)</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150">
                <tr>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">Primary</td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <input type="text" value={formData.primaryVoltage1} onChange={(e) => handleChange('primaryVoltage1', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} placeholder="/" />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <input type="text" value={formData.primaryVoltage2} onChange={(e) => handleChange('primaryVoltage2', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <select value={formData.primaryWindingConnection} onChange={(e) => handleChange('primaryWindingConnection', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                      {windingConnectionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <select value={formData.primaryWindingMaterial} onChange={(e) => handleChange('primaryWindingMaterial', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                      {windingMaterialOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <input type="text" value={formData.primaryBIL} onChange={(e) => handleChange('primaryBIL', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">Secondary</td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <input type="text" value={formData.secondaryVoltage1} onChange={(e) => handleChange('secondaryVoltage1', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} placeholder="/" />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <input type="text" value={formData.secondaryVoltage2} onChange={(e) => handleChange('secondaryVoltage2', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <select value={formData.secondaryWindingConnection} onChange={(e) => handleChange('secondaryWindingConnection', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                      {windingConnectionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <select value={formData.secondaryWindingMaterial} onChange={(e) => handleChange('secondaryWindingMaterial', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                      {windingMaterialOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                    <input type="text" value={formData.secondaryBIL} onChange={(e) => handleChange('secondaryBIL', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Print-only Nameplate Table */}
          <div className="hidden print:block mt-4">
            <table className="w-full table-fixed border-collapse border border-black mb-4">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Manufacturer:</div><div>{formData.manufacturer}</div></td>
                  <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Catalog Number:</div><div>{formData.catalogNumber}</div></td>
                  <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Serial Number:</div><div>{formData.serialNumber}</div></td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 align-top"><div className="font-bold">KVA:</div><div>{formData.kva}</div></td>
                  <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Temp. Rise:</div><div>{formData.tempRise}</div></td>
                  <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Impedance:</div><div>{formData.impedance}</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Electrical - Applied Voltage Test */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical - Applied Voltage Test</h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Winding Under Test</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Test Voltage (kV)</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Test Frequency (Hz)</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Duration (s)</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Results</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150">
                {formData.appliedVoltageTests.map((test, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm text-gray-900 dark:text-white">{test.windingUnderTest}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                      <select value={test.testVoltage} onChange={(e) => handleAppliedVoltageTestChange(index, 'testVoltage', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                        {testVoltageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                      <select value={test.testFrequency} onChange={(e) => handleAppliedVoltageTestChange(index, 'testFrequency', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                        {testFrequencyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                      <input type="text" value={test.duration} onChange={(e) => handleAppliedVoltageTestChange(index, 'duration', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                      <select value={test.results} onChange={(e) => handleAppliedVoltageTestChange(index, 'results', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                        {testResultOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Test Equipment Used */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>

          {/* Screen version - hidden during print */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 print:hidden">
            <div>
              <label htmlFor="testEquipment.name" className="form-label">Hipot:</label>
              <EquipmentAutocomplete
                value={formData.testEquipment.name}
                onChange={(value) => handleTestEquipmentChange('name', value)}
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
                  handleTestEquipmentChange('name', equipment.equipment_name);
                  handleTestEquipmentChange('serialNumber', equipment.serial_number || '');
                  handleTestEquipmentChange('ampId', equipment.amp_id || '');
                  handleTestEquipmentChange('calDate', formatLocalDateShort(equipment.calibration_date));
                }}
                readOnly={!isEditing}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="testEquipment.serialNumber" className="form-label">Serial Number:</label>
              <input id="testEquipment.serialNumber" type="text" value={formData.testEquipment.serialNumber} onChange={(e) => handleTestEquipmentChange('serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
            </div>
            <div>
              <label htmlFor="testEquipment.ampId" className="form-label">AMP ID:</label>
              <input id="testEquipment.ampId" type="text" value={formData.testEquipment.ampId} onChange={(e) => handleTestEquipmentChange('ampId', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
            </div>
            <div>
              <label htmlFor="testEquipment.calDate" className="form-label">Cal Date:</label>
              <input id="testEquipment.calDate" type="date" value={formData.testEquipment.calDate} onChange={(e) => handleTestEquipmentChange('calDate', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
            </div>
          </div>

          {/* Print-only Test Equipment Table with proper styling */}
          <div className="hidden print:block">
            <table className="w-full table-fixed border-collapse border border-black">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-3 py-2 text-center text-sm font-bold">Hipot</th>
                  <th className="border border-black px-3 py-2 text-center text-sm font-bold">Serial Number</th>
                  <th className="border border-black px-3 py-2 text-center text-sm font-bold">AMP ID</th>
                  <th className="border border-black px-3 py-2 text-center text-sm font-bold">Cal Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black px-3 py-2 text-center">{formData.testEquipment.name || ''}</td>
                  <td className="border border-black px-3 py-2 text-center">{formData.testEquipment.serialNumber || ''}</td>
                  <td className="border border-black px-3 py-2 text-center">{formData.testEquipment.ampId || ''}</td>
                  <td className="border border-black px-3 py-2 text-center">{formData.testEquipment.calDate || ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Comments */}
        <section className={`mb-6 print:break-inside-avoid ${!formData.comments?.trim() ? 'print:hidden' : ''}`}>
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
          <textarea
            value={formData.comments}
            onChange={(e) => handleChange('comments', e.target.value)}
            readOnly={!isEditing}
            rows={5}
            className={`w-full form-input print:hidden ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
            placeholder="Enter any additional comments or notes here..."
          />
        </section>
      </div>
    </ReportWrapper>
  );
};

export default AppliedVoltageTestATSReport;

