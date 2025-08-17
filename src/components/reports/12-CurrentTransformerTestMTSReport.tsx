import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import _ from 'lodash';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

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

// Dropdown options
const visualInspectionResultOptions = [
  "Select One", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"
];
const insulationResistanceUnitOptions = [
  { symbol: "kΩ", name: "Kilo-Ohms" }, { symbol: "MΩ", name: "Mega-Ohms" }, { symbol: "GΩ", name: "Giga-Ohms" }
];
const insulationTestVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];
const contactResistanceUnitOptions = [
  { symbol: "µΩ", name: "Micro-Ohms" }, { symbol: "mΩ", name: "Milli-Ohms" }, { symbol: "Ω", name: "Ohms" }
];
const equipmentEvaluationResultOptions = ["PASS", "FAIL", "LIMITED SERVICE"];
const ratioPolarityOptions = ["Satisfactory", "Unsatisfactory", "N/A"];

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

  // Device Data
  deviceData: {
    manufacturer: string;
    class: string;
    ctRatio: string;
    catalogNumber: string;
    voltageRating: string;
    polarityFacing: string;
    type: string;
    frequency: string;
  };

  // Visual and Mechanical Inspection
  visualMechanicalInspection: Array<{
    netaSection: string;
    description: string;
    result: string;
  }>;

  // CT Identification
  ctIdentification: {
    phase1: string; 
    phase1Serial: string;
    phase2: string; 
    phase2Serial: string;
    phase3: string; 
    phase3Serial: string;
    neutral: string; 
    neutralSerial: string;
  };

  // Electrical Tests
  electricalTests: {
    ratioPolarity: Array<{
      id: string;
      identifier: string;
      ratio: string;
      testType: 'voltage' | 'current';
      testValue: string;
      pri: string;
      sec: string;
      measuredRatio: string;
      ratioDev: string;
      polarity: string;
    }>;
    primaryWindingInsulation: {
      testVoltage: string;
      readingPhase1: string;
      readingPhase2: string;
      readingPhase3: string;
      readingNeutral: string;
      units: string;
      tempCorrection20CPhase1: string;
      tempCorrection20CPhase2: string;
      tempCorrection20CPhase3: string;
      tempCorrection20CNeutral: string;
    };
    secondaryWindingInsulation: {
      testVoltage: string;
      readingPhase1: string;
      readingPhase2: string;
      readingPhase3: string;
      readingNeutral: string;
      units: string;
      tempCorrection20CPhase1: string;
      tempCorrection20CPhase2: string;
      tempCorrection20CPhase3: string;
      tempCorrection20CNeutral: string;
    };
  };

  // Test Equipment Used
  testEquipmentUsed: {
    megohmmeterName: string;
    megohmmeterSerial: string;
    megohmmeterAmpId: string;
    ctRatioTestSetName: string;
    ctRatioTestSetSerial: string;
    ctRatioTestSetAmpId: string;
  };

  comments: string;
  status: string; // PASS, FAIL, LIMITED SERVICE
}

const calculateTempCorrected = (reading: string, tcf: number): string => {
  const numericReading = parseFloat(reading);
  if (isNaN(numericReading)) return '';
  return (numericReading * tcf).toFixed(2);
};

const CurrentTransformerTestMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = '12-current-transformer-test-mts-report'; // This component handles the 12-current-transformer-test-mts-report route
  const reportName = getReportName(reportSlug);

  const initialVisualInspectionItems = [
    { netaSection: '7.10.1.A.1', description: 'Compare equipment nameplate data with drawings and specifications.', result: 'Select One' },
    { netaSection: '7.10.1.1', description: 'Inspect physical and mechanical condition.', result: 'Select One' },
    { netaSection: '7.10.1.A.3', description: 'Verify correct connection of transformers with system requirements.', result: 'Select One' },
    { netaSection: '7.10.1.A.4', description: 'Verify that adequate clearances exist between primary and secondary circuit wiring.', result: 'Select One' },
    { netaSection: '7.10.1.3', description: 'Clean the unit.', result: 'Select One' },
    { netaSection: '7.10.1.4.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.10.1.B.1.', result: 'Select One' },
    { netaSection: '7.10.1.5', description: 'Verify that all required grounding and shorting connections provide contact.', result: 'Select One' },
    { netaSection: '7.10.1.6', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: 'Select One' },
  ];

  const initialRatioPolarityItems = Array(4).fill(null).map((_, i) => ({
    id: `rp-${i}`,
    identifier: '',
    ratio: '',
    testType: 'voltage' as const,
    testValue: '',
    pri: '',
    sec: '',
    measuredRatio: '',
    ratioDev: '',
    polarity: 'Select One',
  }));

  const [formData, setFormData] = useState<FormData>({
    customerName: '',
    customerAddress: '',
    userName: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
    substation: '',
    eqptLocation: '',
    deviceData: {
      manufacturer: '', class: '', ctRatio: '', catalogNumber: '',
      voltageRating: '', polarityFacing: '', type: '', frequency: ''
    },
    visualMechanicalInspection: initialVisualInspectionItems,
    ctIdentification: {
      phase1: '', 
      phase1Serial: '',
      phase2: '', 
      phase2Serial: '',
      phase3: '', 
      phase3Serial: '',
      neutral: '', 
      neutralSerial: ''
    },
    electricalTests: {
      ratioPolarity: initialRatioPolarityItems,
      primaryWindingInsulation: {
        testVoltage: '1000V', readingPhase1: '', readingPhase2: '', readingPhase3: '', readingNeutral: '', units: 'MΩ',
        tempCorrection20CPhase1: '', tempCorrection20CPhase2: '', tempCorrection20CPhase3: '', tempCorrection20CNeutral: ''
      },
      secondaryWindingInsulation: {
        testVoltage: '1000V', readingPhase1: '', readingPhase2: '', readingPhase3: '', readingNeutral: '', units: 'MΩ',
        tempCorrection20CPhase1: '', tempCorrection20CPhase2: '', tempCorrection20CPhase3: '', tempCorrection20CNeutral: ''
      }
    },
    testEquipmentUsed: {
      megohmmeterName: '', megohmmeterSerial: '', megohmmeterAmpId: '',
      ctRatioTestSetName: '', ctRatioTestSetSerial: '', ctRatioTestSetAmpId: ''
    },
    comments: '',
    status: 'PASS',
  });

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;
    
    try {
      setLoading(true);
      // Fetch job data
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`title, job_number, customer_id`)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      // Fetch customer data
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
            customerName: customerData.company_name || customerData.name || '',
            customerAddress: customerData.address || '',
            jobNumber: jobData.job_number || ''
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load existing report
  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true); // New reports start in edit mode
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('current_transformer_test_mts_reports')
        .select('*')
        .eq('id', reportId)
        .single();
      
      if (error) throw error;
      
      if (data && data.report_data) {
        setFormData(prev => ({
          ...prev,
          ...data.report_data,
        }));
        setIsEditing(false); // Start in view mode for existing reports
      }
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, reportId]);

  // Add print styles and hide navigation/scrollbar
  React.useEffect(() => {
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
      h2 {
        border-top: 2px solid #f26722 !important;
        padding-top: 8px !important;
        margin-top: 16px !important;
      }
      @media print {
        /* Visual & Mechanical table: compact left NETA column, wide description */
        table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
        table.visual-mechanical-table thead { display: table-header-group !important; }
        table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
        table.visual-mechanical-table colgroup col:nth-child(1) { width: 12% !important; }
        table.visual-mechanical-table colgroup col:nth-child(2) { width: 68% !important; }
        table.visual-mechanical-table colgroup col:nth-child(3) { width: 20% !important; }
        table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }
        * { color: black !important; background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif !important; font-size: 9px !important; background: white !important; line-height: 1 !important; }
        @page { size: 8.5in 11in; margin: 0.2in; }
        .print\\:hidden { display: none !important; }
        .flex.justify-between.items-center.mb-6 { display: none !important; }
        .flex.items-center.gap-4 { display: none !important; }
        button { display: none !important; }
        h2 { font-size: 9px !important; font-weight: bold !important; margin: 0 !important; margin-top: 0 !important; padding: 1px 0 !important; background-color: transparent !important; color: black !important; text-transform: none !important; border: none !important; border-bottom: 1px solid black !important; line-height: 1.2 !important; padding-bottom: 2px !important; padding-top: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; position: relative !important; }
        h2::before { display: none !important; }
        .mb-6 { margin-top: 12px !important; border-top: 1px solid #f26722 !important; padding-top: 8px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .mb-6:first-of-type { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; }
        table { margin-bottom: 8px !important; }
        .status-pass { background-color: #22c55e !important; border: 2px solid #16a34a !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .status-fail { background-color: #ef4444 !important; border: 2px solid #dc2626 !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        
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
        .bg-white, .dark\\:bg-dark-150, .rounded-lg, .shadow { background: white !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; margin-bottom: 3px !important; border: none !important; }
        section { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; margin-bottom: 2px !important; }
        div[class*="border"], div[class*="shadow"], div[class*="rounded"] { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
        div[class*="p-"], div[class*="px-"], div[class*="py-"], div[class*="pt-"], div[class*="pb-"], div[class*="pl-"], div[class*="pr-"] { padding: 0 !important; }
        * { border: none !important; box-shadow: none !important; outline: none !important; }
        .print\\:border { border: none !important; }
        .print\\:border-black { border: none !important; }
        div.bg-white, div.dark\\:bg-dark-150, div.print\\:border, div.print\\:border-black { border: none !important; box-shadow: none !important; padding: 0 !important; }
        table, th, td, thead, tbody, tr { border: 0.5px solid black !important; }
        input, select, textarea { border-bottom: 1px solid black !important; }
        textarea { border: 1px solid black !important; }
        .grid { display: grid !important; gap: 1px !important; margin-bottom: 2px !important; }
        .grid-cols-1.md\\:grid-cols-2 { grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; }
        label { font-size: 8px !important; font-weight: normal !important; margin: 0 !important; display: inline-block !important; margin-right: 2px !important; }
        input, select, textarea { width: auto !important; border: none !important; border-bottom: 1px solid black !important; background: transparent !important; padding: 0 1px !important; margin: 0 !important; font-size: 8px !important; height: 12px !important; display: inline-block !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; }
        input[type="text"], input[type="number"] { width: 80px !important; }
        /* Address and customer fields wide for print */
        input[name="customer"], input[name="address"] { width: 200px !important; max-width: none !important; word-wrap: break-word !important; white-space: nowrap !important; overflow: visible !important; }
        /* Hide select dropdowns in print, show value as text */
        select { display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; }
        .print\\:inline-block { display: inline-block !important; color: black !important; font-size: 8px !important; text-align: left !important; width: auto !important; }
        /* End custom fixes */
        table input[type="text"] { width: 50px !important; max-width: 50px !important; }
        input[type="date"] { width: 70px !important; }
        textarea { width: 100% !important; height: auto !important; min-height: 20px !important; border: 1px solid black !important; display: block !important; margin-top: 1px !important; font-size: 8px !important; padding: 2px !important; }
        th, td { border: 0.5px solid black !important; padding: 0px 1px !important; text-align: center !important; font-size: 8px !important; height: 12px !important; line-height: 1 !important; }
        th { background-color: #f0f0f0 !important; font-weight: bold !important; }
        table input, table select { border: none !important; border-bottom: none !important; padding: 0 !important; margin: 0 !important; height: 10px !important; text-align: center !important; width: 100% !important; font-size: 8px !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; }
        td input, td select, td textarea { border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; outline: none !important; }
        .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
        .mb-4 { margin-bottom: 2px !important; }
        .mb-6 { margin-bottom: 3px !important; }
        .mb-8 { margin-bottom: 3px !important; }
        .p-6 { padding: 0 !important; }
        .bg-green-600, .bg-red-600 { background-color: transparent !important; color: black !important; border: 1px solid black !important; padding: 0px 2px !important; font-weight: bold !important; font-size: 9px !important; }
        .text-green-600 { color: green !important; }
        .text-red-600 { color: red !important; }
        .min-h-[250px] { min-height: 20px !important; }
        .text-xs { font-size: 7px !important; }
        .flex.items-center { display: inline-flex !important; margin-right: 10px !important; }
        section { page-break-inside: avoid !important; }
        .max-w-7xl { max-width: 100% !important; }
        .border-b.dark\\:border-gray-700 { border: none !important; margin: 0 !important; padding: 0 !important; }
        section { margin-bottom: 2px !important; padding: 0 !important; }
        .print\\:flex { margin-bottom: 3px !important; }
        div[class*='print:border'] { border: none !important; box-shadow: none !important; background: transparent !important; }
        div[class*='print:border-black'] { border: none !important; box-shadow: none !important; background: transparent !important; }
        div.bg-white, div[class*='bg-white'] { border: none !important; box-shadow: none !important; background: transparent !important; }
        div[class*='shadow'], div[class*='rounded'] { border: none !important; box-shadow: none !important; background: transparent !important; border-radius: 0 !important; }
        .max-w-7xl > div { border: none !important; box-shadow: none !important; background: transparent !important; }
        div:not(:has(table)) { border: none !important; box-shadow: none !important; background: transparent !important; }
        @media print {
          textarea { display: none !important; }
        }
        @media print {
          /* ...existing print styles... */
          .comments-section { 
            page-break-before: always !important; 
            page-break-inside: auto !important; 
            min-height: 80px !important; 
          }
          .print-comments-box {
            display: block !important;
            border-bottom: 1px solid black !important;
            min-height: 80px !important;
            color: black !important;
            background: white !important;
            padding: 8px 0 !important;
            font-size: 12px !important;
            page-break-before: always !important;
          }
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Temperature conversion handlers
  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = Math.round((fahrenheit - 32) * 5 / 9);
    const tcf = getTCF(celsius);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit, celsius, tcf } }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = Math.round(celsius * 9 / 5 + 32);
    const tcf = getTCF(celsius);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit, celsius, tcf } }));
  };

  const handleChange = (path: string, value: any) => {
    setFormData(prev => _.set({ ...prev }, path, value));
  };
  
  const handleVisualInspectionChange = (index: number, field: keyof FormData['visualMechanicalInspection'][0], value: string) => {
    setFormData(prev => {
      const newItems = [...prev.visualMechanicalInspection];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, visualMechanicalInspection: newItems };
    });
  };

  const handleRatioPolarityChange = (index: number, field: keyof FormData['electricalTests']['ratioPolarity'][0], value: string) => {
    setFormData(prev => {
      const newItems = [...prev.electricalTests.ratioPolarity];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, electricalTests: { ...prev.electricalTests, ratioPolarity: newItems } };
    });
  };
  
  // Save report
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData // Store the whole formData object
    };

    try {
      let result;
      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from('current_transformer_test_mts_reports')
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('current_transformer_test_mts_reports')
          .insert(reportPayload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/12-current-transformer-test-mts-report/${result.data.id}`,
            user_id: user.id,
            template_type: 'MTS'
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

  const renderCtIdentification = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2">
      {[
        { label: 'Phase 1', topKey: 'phase1', serialKey: 'phase1Serial' },
        { label: 'Phase 2', topKey: 'phase2', serialKey: 'phase2Serial' },
        { label: 'Phase 3', topKey: 'phase3', serialKey: 'phase3Serial' },
        { label: 'Neutral', topKey: 'neutral', serialKey: 'neutralSerial' },
      ].map((item) => (
        <div key={item.label}>
          <label htmlFor={`ct-${item.topKey}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {item.label}
          </label>
          <input
            type="text"
            id={`ct-${item.topKey}`}
            name={item.topKey}
            value={formData.ctIdentification[item.topKey as keyof typeof formData.ctIdentification]}
            onChange={(e) => handleChange(`ctIdentification.${item.topKey}`, e.target.value)}
            readOnly={!isEditing}
            className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${
              !isEditing ? 'bg-gray-100 dark:bg-dark-200 cursor-not-allowed' : ''
            }`}
          />
          <label htmlFor={`ct-${item.serialKey}`} className="mt-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Serial #
          </label>
          <input
            type="text"
            id={`ct-${item.serialKey}`}
            name={item.serialKey}
            value={formData.ctIdentification[item.serialKey as keyof typeof formData.ctIdentification]}
            onChange={(e) => handleChange(`ctIdentification.${item.serialKey}`, e.target.value)}
            readOnly={!isEditing}
            className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${
              !isEditing ? 'bg-gray-100 dark:bg-dark-200 cursor-not-allowed' : ''
            }`}
          />
        </div>
      ))}
    </div>
  );

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="w-full overflow-visible" style={{ minHeight: 'calc(100vh + 300px)', paddingBottom: '200px' }}>
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - MTS 7.10.1
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

      {/* Header with Back button, title and buttons */}
      <div className={`flex justify-between items-center mb-6 ${isPrintMode ? 'hidden' : ''} print:hidden`}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/jobs/${jobId}`)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Job
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (isEditing) {
                setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' }))
              }
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              formData.status === 'PASS'
                ? 'bg-green-600 text-white focus:ring-green-500'
                : 'bg-red-600 text-white focus:ring-red-500'
            } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
          >
            {formData.status === 'PASS' ? 'PASS' : 'FAIL'}
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
            <button onClick={handleSave} disabled={!isEditing} className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'}`}>
              {reportId ? 'Update Report' : 'Save New Report'}
            </button>
          )}
        </div>
      </div>

      {/* Job Information Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer</label>
              <input type="text" value={formData.customerName} readOnly className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label>
              <span className="print:inline">{formData.customerAddress || ''}</span>
              <textarea
                value={formData.customerAddress}
                readOnly
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white print:hidden"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">User</label>
              <input type="text" value={formData.userName} onChange={e => handleChange('userName', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
              <input type="date" value={formData.date} onChange={e => handleChange('date', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Identifier</label>
              <input type="text" value={formData.identifier} onChange={e => handleChange('identifier', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Job #</label>
              <input type="text" value={formData.jobNumber} readOnly className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Technicians</label>
              <input type="text" value={formData.technicians} onChange={e => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temp. °F</label>
                <input type="number" value={formData.temperature.fahrenheit} onChange={e => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">°C</label>
                <input type="number" value={formData.temperature.celsius} onChange={e => handleCelsiusChange(Number(e.target.value))} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">TCF</label>
                <input type="number" value={formData.temperature.tcf} readOnly className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Humidity</label>
              <input type="number" value={formData.temperature.humidity} onChange={e => handleChange('temperature.humidity', Number(e.target.value))} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Substation</label>
              <input type="text" value={formData.substation} onChange={e => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Eqpt. Location</label>
              <input type="text" value={formData.eqptLocation} onChange={e => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Device Data Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Device Data</h2>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="space-y-4">
            <div><label htmlFor="deviceData.manufacturer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer</label><input id="deviceData.manufacturer" type="text" value={formData.deviceData.manufacturer} onChange={(e) => handleChange('deviceData.manufacturer', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.class" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Class</label><input id="deviceData.class" type="text" value={formData.deviceData.class} onChange={(e) => handleChange('deviceData.class', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.ctRatio" className="block text-sm font-medium text-gray-700 dark:text-gray-300">CT Ratio</label><input id="deviceData.ctRatio" type="text" value={formData.deviceData.ctRatio} onChange={(e) => handleChange('deviceData.ctRatio', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.catalogNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number</label><input id="deviceData.catalogNumber" type="text" value={formData.deviceData.catalogNumber} onChange={(e) => handleChange('deviceData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
          </div>
          <div className="space-y-4">
            <div><label htmlFor="deviceData.voltageRating" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Voltage Rating (V)</label><input id="deviceData.voltageRating" type="text" value={formData.deviceData.voltageRating} onChange={(e) => handleChange('deviceData.voltageRating', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.polarityFacing" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Polarity Facing</label><input id="deviceData.polarityFacing" type="text" value={formData.deviceData.polarityFacing} onChange={(e) => handleChange('deviceData.polarityFacing', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label><input id="deviceData.type" type="text" value={formData.deviceData.type} onChange={(e) => handleChange('deviceData.type', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.frequency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Frequency</label><input id="deviceData.frequency" type="text" value={formData.deviceData.frequency} onChange={(e) => handleChange('deviceData.frequency', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
          </div>
        </div>
      </div>

      {/* Visual and Mechanical Inspection Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
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
              {formData.visualMechanicalInspection.map((item, index) => (
                <tr key={item.netaSection}>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">{item.netaSection}</td>
                  <td className="px-3 py-2 text-sm whitespace-normal break-words">{item.description}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <select value={item.result} onChange={(e) => handleVisualInspectionChange(index, 'result', e.target.value)} disabled={!isEditing} className={`form-select ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                      {visualInspectionResultOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <span className="print:inline-block" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>{item.result === 'Select One' ? '' : item.result}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CT Identification Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">CT Identification</h2>
        {renderCtIdentification()}
      </div>

      {/* Electrical Tests Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests</h2>
        
        {/* Ratio and Polarity Table */}
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Ratio and Polarity</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  {['Identifier', 'Ratio', 
                    formData.electricalTests.ratioPolarity[0]?.testType === 'current' ? 'Test Current' : 'Test Voltage', 
                    'Pri.', 'Sec.', 'Measured Ratio', 'Ratio dev.', 'Polarity'].map(header => (
                    <th key={header} className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      {header === 'Test Current' || header === 'Test Voltage' ? (
                        <div className="flex items-center space-x-2">
                          <span>{header}</span>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                const newType = formData.electricalTests.ratioPolarity[0]?.testType === 'voltage' ? 'current' : 'voltage';
                                setFormData(prev => ({
                                  ...prev,
                                  electricalTests: {
                                    ...prev.electricalTests,
                                    ratioPolarity: prev.electricalTests.ratioPolarity.map(item => ({
                                      ...item,
                                      testType: newType,
                                      testValue: 'Select One' // Reset value when switching type
                                    }))
                                  }
                                }));
                              }}
                              className="ml-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              (Switch to {formData.electricalTests.ratioPolarity[0]?.testType === 'voltage' ? 'Current' : 'Voltage'})
                            </button>
                          )}
                        </div>
                      ) : header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {formData.electricalTests.ratioPolarity.map((item, index) => (
                  <tr key={item.id}>
                    <td><input type="text" value={item.identifier} onChange={(e) => handleRatioPolarityChange(index, 'identifier', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                    <td><input type="text" value={item.ratio} onChange={(e) => handleRatioPolarityChange(index, 'ratio', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                    <td>
                      <input 
                        type="text" 
                        value={item.testValue} 
                        onChange={(e) => handleRatioPolarityChange(index, 'testValue', e.target.value)} 
                        readOnly={!isEditing} 
                        placeholder={item.testType === 'voltage' ? 'Enter voltage' : 'Enter current'}
                        className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      />
                    </td>
                    <td><input type="text" value={item.pri} onChange={(e) => handleRatioPolarityChange(index, 'pri', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                    <td><input type="text" value={item.sec} onChange={(e) => handleRatioPolarityChange(index, 'sec', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                    <td><input type="text" value={item.measuredRatio} onChange={(e) => handleRatioPolarityChange(index, 'measuredRatio', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                    <td><input type="text" value={item.ratioDev} onChange={(e) => handleRatioPolarityChange(index, 'ratioDev', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                    <td>
                      <select value={item.polarity} onChange={(e) => handleRatioPolarityChange(index, 'polarity', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                        <option value="Select One" disabled>Select One</option>
                        {ratioPolarityOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <span className="print:inline-block" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>{item.polarity === 'Select One' ? '' : item.polarity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Primary Winding Insulation Table */}
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Primary Winding - 1 min. Insulation Resistance to Ground</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-300 dark:border-gray-600">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                    Test Voltage:&nbsp;
                    <select 
                      value={formData.electricalTests.primaryWindingInsulation.testVoltage} 
                      onChange={(e) => handleChange('electricalTests.primaryWindingInsulation.testVoltage', e.target.value)} 
                      disabled={!isEditing} 
                      className={`form-select inline-block w-auto p-1 text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationTestVoltageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </th>
                  {['Phase 1', 'Phase 2', 'Phase 3', 'Neutral'].map(header => (
                    <th key={header} className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{header}</th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">Reading</td>
                  {['readingPhase1', 'readingPhase2', 'readingPhase3', 'readingNeutral'].map(fieldKey => (
                    <td key={fieldKey} className="px-1 py-1">
                      <input 
                        type="text" 
                        value={formData.electricalTests.primaryWindingInsulation[fieldKey as keyof typeof formData.electricalTests.primaryWindingInsulation]} 
                        onChange={(e) => {
                          const value = e.target.value;
                          handleChange(`electricalTests.primaryWindingInsulation.${fieldKey}`, value);
                          // Calculate and update temperature corrected value
                          const correctedValue = calculateTempCorrected(value, formData.temperature.tcf);
                          handleChange(`electricalTests.primaryWindingInsulation.tempCorrection20C${fieldKey.replace('reading', '')}`, correctedValue);
                        }} 
                        readOnly={!isEditing} 
                        className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <select 
                      value={formData.electricalTests.primaryWindingInsulation.units} 
                      onChange={(e) => handleChange('electricalTests.primaryWindingInsulation.units', e.target.value)} 
                      disabled={!isEditing} 
                      className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationResistanceUnitOptions.map(option => <option key={option.symbol} value={option.symbol}>{option.symbol}</option>)}
                    </select>
                    <span className="print:inline-block" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>{formData.electricalTests.primaryWindingInsulation.units}</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">Temp. Correction 20°C</td>
                  {['tempCorrection20CPhase1', 'tempCorrection20CPhase2', 'tempCorrection20CPhase3', 'tempCorrection20CNeutral'].map(fieldKey => (
                    <td key={fieldKey} className="px-1 py-1">
                      <input 
                        type="text" 
                        value={formData.electricalTests.primaryWindingInsulation[fieldKey as keyof typeof formData.electricalTests.primaryWindingInsulation]} 
                        readOnly
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white" 
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    {formData.electricalTests.primaryWindingInsulation.units}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Secondary Winding Insulation Table */}
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Secondary Winding - 1 min. Insulation Resistance to Ground</h3>
           <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-300 dark:border-gray-600">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                    Test Voltage:&nbsp;
                    <select 
                      value={formData.electricalTests.secondaryWindingInsulation.testVoltage} 
                      onChange={(e) => handleChange('electricalTests.secondaryWindingInsulation.testVoltage', e.target.value)} 
                      disabled={!isEditing} 
                      className={`form-select inline-block w-auto p-1 text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationTestVoltageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </th>
                  {['Phase 1', 'Phase 2', 'Phase 3', 'Neutral'].map(header => (
                    <th key={header} className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{header}</th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">Reading</td>
                  {['readingPhase1', 'readingPhase2', 'readingPhase3', 'readingNeutral'].map(fieldKey => (
                    <td key={fieldKey} className="px-1 py-1">
                      <input 
                        type="text" 
                        value={formData.electricalTests.secondaryWindingInsulation[fieldKey as keyof typeof formData.electricalTests.secondaryWindingInsulation]} 
                        onChange={(e) => {
                          const value = e.target.value;
                          handleChange(`electricalTests.secondaryWindingInsulation.${fieldKey}`, value);
                          // Calculate and update temperature corrected value
                          const correctedValue = calculateTempCorrected(value, formData.temperature.tcf);
                          handleChange(`electricalTests.secondaryWindingInsulation.tempCorrection20C${fieldKey.replace('reading', '')}`, correctedValue);
                        }} 
                        readOnly={!isEditing} 
                        className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <select 
                      value={formData.electricalTests.secondaryWindingInsulation.units} 
                      onChange={(e) => handleChange('electricalTests.secondaryWindingInsulation.units', e.target.value)} 
                      disabled={!isEditing} 
                      className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {insulationResistanceUnitOptions.map(option => <option key={option.symbol} value={option.symbol}>{option.symbol}</option>)}
                    </select>
                    <span className="print:inline-block" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>{formData.electricalTests.secondaryWindingInsulation.units}</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">Temp. Correction 20°C</td>
                  {['tempCorrection20CPhase1', 'tempCorrection20CPhase2', 'tempCorrection20CPhase3', 'tempCorrection20CNeutral'].map(fieldKey => (
                    <td key={fieldKey} className="px-1 py-1">
                      <input 
                        type="text" 
                        value={formData.electricalTests.secondaryWindingInsulation[fieldKey as keyof typeof formData.electricalTests.secondaryWindingInsulation]} 
                        readOnly
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white" 
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    {formData.electricalTests.secondaryWindingInsulation.units}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Test Equipment Used Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label htmlFor="testEquipmentUsed.megohmmeterName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter</label><input id="testEquipmentUsed.megohmmeterName" type="text" value={formData.testEquipmentUsed.megohmmeterName} onChange={(e) => handleChange('testEquipmentUsed.megohmmeterName', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="testEquipmentUsed.megohmmeterSerial" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label><input id="testEquipmentUsed.megohmmeterSerial" type="text" value={formData.testEquipmentUsed.megohmmeterSerial} onChange={(e) => handleChange('testEquipmentUsed.megohmmeterSerial', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="testEquipmentUsed.megohmmeterAmpId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label><input id="testEquipmentUsed.megohmmeterAmpId" type="text" value={formData.testEquipmentUsed.megohmmeterAmpId} onChange={(e) => handleChange('testEquipmentUsed.megohmmeterAmpId', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label htmlFor="testEquipmentUsed.ctRatioTestSetName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">CT Ratio Test Set</label><input id="testEquipmentUsed.ctRatioTestSetName" type="text" value={formData.testEquipmentUsed.ctRatioTestSetName} onChange={(e) => handleChange('testEquipmentUsed.ctRatioTestSetName', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="testEquipmentUsed.ctRatioTestSetSerial" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label><input id="testEquipmentUsed.ctRatioTestSetSerial" type="text" value={formData.testEquipmentUsed.ctRatioTestSetSerial} onChange={(e) => handleChange('testEquipmentUsed.ctRatioTestSetSerial', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="testEquipmentUsed.ctRatioTestSetAmpId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label><input id="testEquipmentUsed.ctRatioTestSetAmpId" type="text" value={formData.testEquipmentUsed.ctRatioTestSetAmpId} onChange={(e) => handleChange('testEquipmentUsed.ctRatioTestSetAmpId', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
          </div>
        </div>
      </div>

      {/* Comments Section */}
      <div className="mb-6 comments-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
        
        {/* Table for print mode - always rendered but only visible in print */}
        <table className="hidden print:table" style={{ width: '100%', marginTop: '10px', border: '1px solid black' }}>
          <tbody>
            <tr>
              <td style={{ 
                padding: '12px', 
                minHeight: '120px', 
                verticalAlign: 'top',
                fontSize: '14px',
                color: 'black',
                border: '1px solid black'
              }}>
                {formData.comments && formData.comments.trim() !== '' ? formData.comments : '(No comments)'}
              </td>
            </tr>
          </tbody>
        </table>
        
        {/* Textarea for screen mode - hidden in print */}
        <textarea
          value={formData.comments}
          onChange={(e) => handleChange('comments', e.target.value)}
          readOnly={!isEditing}
          rows={6}
          className={`print:hidden mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          placeholder="Enter comments here..."
        />
      </div>
    </ReportWrapper>
  </div>
);
};

export default CurrentTransformerTestMTSReport; 