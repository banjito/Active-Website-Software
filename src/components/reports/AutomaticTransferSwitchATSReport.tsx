import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';

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

const visualInspectionResultOptions = [
  "Select One", "Satisfactory", "Unsatisfactory", "Cleaned", "Repaired", "Adjusted", "See Comments", "N/A"
];
const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const contactResistanceUnitsOptions = ["µΩ", "mΩ", "Ω"];
const testVoltageOptions = ["Select", "250V", "500V", "1000V", "2500V", "5000V", "Other"];

const initialVisualInspectionItems = [
  { netaSection: '7.22.3.A.1', description: 'Compare equipment nameplate data with drawings and specifications.', result: 'Select One' },
  { netaSection: '7.22.3.A.2', description: 'Inspect physical and mechanical condition.', result: 'Select One' },
  { netaSection: '7.22.3.A.3', description: 'Inspect anchorage, alignment, grounding, and required clearances.', result: 'Select One' },
  { netaSection: '7.22.3.A.4', description: 'Verify the unit is clean.', result: 'Select One' },
  { netaSection: '7.22.3.A.5', description: 'Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: 'Select One' },
  { netaSection: '7.22.3.A.6', description: 'Verify that manual transfer warnings are attached and visible.', result: 'Select One' },
  { netaSection: '7.22.3.A.7', description: 'Verify tightness of all control connections.', result: 'Select One' },
  { netaSection: '7.22.3.A.8.1', description: 'Use of low-resistance ohmmeter in accordance with Section 7.22.3.B.1.', result: 'Select One' },
  { netaSection: '7.22.3.A.9', description: 'Perform manual transfer operation.', result: 'Select One' },
  { netaSection: '7.22.3.A.10', description: 'Verify positive mechanical interlocking between normal and alternate sources.', result: 'Select One' },
];

interface TestEquipmentItem {
  name: string;
  serialNumber: string;
  ampId: string;
}

interface InsulationResistanceRow {
  p1Reading: string; p1Corrected: string;
  p2Reading: string; p2Corrected: string;
  p3Reading: string; p3Corrected: string;
  neutralReading?: string; neutralCorrected?: string;
  units: string;
}

interface FormData {
  // Job Information
  customerName: string;
  customerLocation: string;
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

  // Nameplate Data
  nameplateManufacturer: string;
  nameplateModelType: string;
  nameplateCatalogNo: string;
  nameplateSerialNumber: string;
  nameplateSystemVoltage: string;
  nameplateRatedVoltage: string;
  nameplateRatedCurrent: string;
  nameplateSCCR: string;

  // Visual and Mechanical Inspection
  visualInspectionItems: Array<{ netaSection: string; description: string; result: string; }>;

  // Electrical Tests
  insulationTestVoltage: string;
  insulationResistance: {
    poleToPoleNormalClosed: InsulationResistanceRow;
    poleToPoleEmergencyClosed: InsulationResistanceRow;
    poleToNeutralNormalClosed: InsulationResistanceRow;
    poleToNeutralEmergencyClosed: InsulationResistanceRow;
    poleToGroundNormalClosed: InsulationResistanceRow;
    poleToGroundEmergencyClosed: InsulationResistanceRow;
    lineToLoadNormalOpen: InsulationResistanceRow;
    lineToLoadEmergencyOpen: InsulationResistanceRow;
  };

  contactResistance: {
    normal: { p1: string; p2: string; p3: string; neutral: string; units: string; };
    emergency: { p1: string; p2: string; p3: string; neutral: string; units: string; };
  };

  // Test Equipment Used
  testEquipmentUsed: {
    megohmmeter: TestEquipmentItem;
    lowResistanceOhmmeter: TestEquipmentItem;
  };

  comments: string;
  status: 'PASS' | 'FAIL';
}

const calculateTempCorrectedReading = (reading: string, tcf: number): string => {
  if (!reading || reading.trim() === '' || isNaN(parseFloat(reading))) {
    return '';
  }
  return (parseFloat(reading) * tcf).toFixed(2);
};

const AutomaticTransferSwitchATSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const [isSaving, setIsSaving] = useState(false);
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'automatic-transfer-switch-ats-report'; // This component handles the automatic-transfer-switch-ats-report route
  const reportName = getReportName(reportSlug);

  const initialInsulationRow: InsulationResistanceRow = {
    p1Reading: '', p1Corrected: '',
    p2Reading: '', p2Corrected: '',
    p3Reading: '', p3Corrected: '',
    neutralReading: '', neutralCorrected: '',
    units: 'MΩ',
  };
  
  const [formData, setFormData] = useState<FormData>(() => ({
    customerName: '', customerLocation: '', userName: '', date: new Date().toISOString().split('T')[0], identifier: '',
    jobNumber: '', technicians: '', substation: '', eqptLocation: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50 },
    nameplateManufacturer: '', nameplateModelType: '', nameplateCatalogNo: '', nameplateSerialNumber: '',
    nameplateSystemVoltage: '', nameplateRatedVoltage: '', nameplateRatedCurrent: '', nameplateSCCR: '',
    visualInspectionItems: JSON.parse(JSON.stringify(initialVisualInspectionItems)),
    insulationTestVoltage: '1000V',
    insulationResistance: {
      poleToPoleNormalClosed: { ...initialInsulationRow },
      poleToPoleEmergencyClosed: { ...initialInsulationRow },
      poleToNeutralNormalClosed: { ...initialInsulationRow },
      poleToNeutralEmergencyClosed: { ...initialInsulationRow },
      poleToGroundNormalClosed: { ...initialInsulationRow, neutralReading: '', neutralCorrected: '' },
      poleToGroundEmergencyClosed: { ...initialInsulationRow, neutralReading: '', neutralCorrected: '' },
      lineToLoadNormalOpen: { ...initialInsulationRow, neutralReading: '', neutralCorrected: '' },
      lineToLoadEmergencyOpen: { ...initialInsulationRow, neutralReading: '', neutralCorrected: '' },
    },
    contactResistance: {
      normal: { p1: '', p2: '', p3: '', neutral: '', units: 'µΩ' },
      emergency: { p1: '', p2: '', p3: '', neutral: '', units: 'µΩ' },
    },
    testEquipmentUsed: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
    },
    comments: '', status: 'PASS',
  }));

  const loadJobInfo = useCallback(async () => {
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
          customerLocation: customerAddress,
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      alert('Failed to load job info: ' + (error as Error).message);
    }
  }, [jobId]);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('automatic_transfer_switch_ats_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setIsEditing(true);
        } else {
          throw error;
        }
      }
      if (data) {
        // Prefer full JSON payload if present (ensures nameplate & test equipment reload)
        if (data.data) {
          setFormData(prev => ({
            ...prev,
            ...data.data,
            status: data.data.status || 'PASS'
          }));
        } else {
          // Old structure: data is in individual columns
          setFormData(prev => ({
            ...prev,
            ...(data.report_info || {}),
            visualInspectionItems: data.visual_inspection_items || JSON.parse(JSON.stringify(initialVisualInspectionItems)),
            insulationResistance: data.insulation_resistance || prev.insulationResistance,
            contactResistance: data.contact_resistance || prev.contactResistance,
            comments: data.comments || '',
            status: data.report_info?.status || 'PASS',
            // Hydrate nameplate & equipment from report_info if present (legacy persistence)
            nameplateManufacturer: data.report_info?.nameplateManufacturer ?? prev.nameplateManufacturer,
            nameplateModelType: data.report_info?.nameplateModelType ?? prev.nameplateModelType,
            nameplateCatalogNo: data.report_info?.nameplateCatalogNo ?? prev.nameplateCatalogNo,
            nameplateSerialNumber: data.report_info?.nameplateSerialNumber ?? prev.nameplateSerialNumber,
            nameplateSystemVoltage: data.report_info?.nameplateSystemVoltage ?? prev.nameplateSystemVoltage,
            nameplateRatedVoltage: data.report_info?.nameplateRatedVoltage ?? prev.nameplateRatedVoltage,
            nameplateRatedCurrent: data.report_info?.nameplateRatedCurrent ?? prev.nameplateRatedCurrent,
            nameplateSCCR: data.report_info?.nameplateSCCR ?? prev.nameplateSCCR,
            testEquipmentUsed: data.report_info?.testEquipmentUsed ?? prev.testEquipmentUsed,
          }));
        }
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert('Failed to load report: ' + (error as Error).message);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    loadJobInfo();
    if (reportId) {
      loadReport();
    } else {
      setLoading(false);
      setIsEditing(true);
    }
  }, [jobId, reportId, loadJobInfo, loadReport]);
  
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

  const handleChange = (path: string, value: any) => {
    if (!isEditing) return;
    setFormData(prev => {
      const keys = path.split('.');
      let current: any = prev;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return { ...prev };
    });
  };
  
  const handleVisualInspectionChange = (index: number, field: keyof FormData['visualInspectionItems'][0], value: string) => {
    if (!isEditing) return;
    setFormData(prev => {
      const newItems = prev.visualInspectionItems.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      );
      return { ...prev, visualInspectionItems: newItems };
    });
  };

  const handleInsulationResistanceChange = (stateKey: keyof FormData['insulationResistance'], field: string, value: string) => {
    if (!isEditing) return;
    setFormData(prev => {
      const newIR = { ...prev.insulationResistance };
      newIR[stateKey] = { ...newIR[stateKey], [field]: value };
      
      // Calculate corrected values when readings change
      if (field.includes('Reading')) {
        const tcf = prev.temperature.tcf;
        const correctedField = field.replace('Reading', 'Corrected');
        (newIR[stateKey] as any)[correctedField] = calculateTempCorrectedReading(value, tcf);
      }
      
      return { ...prev, insulationResistance: newIR };
    });
  };

  const handleContactResistanceChange = (state: keyof FormData['contactResistance'], field: keyof FormData['contactResistance']['normal'], value: string) => {
    if (!isEditing) return;
    setFormData(prev => {
      const newCR = { ...prev.contactResistance };
      newCR[state] = { ...newCR[state], [field]: value };
      return { ...prev, contactResistance: newCR };
    });
  };

  const handleTestEquipmentChange = (equipmentType: 'megohmmeter' | 'lowResistanceOhmmeter', field: keyof TestEquipmentItem, value: string) => {
    if (!isEditing) return;
    setFormData(prev => {
      const newTE = { ...prev.testEquipmentUsed };
      newTE[equipmentType] = { ...newTE[equipmentType], [field]: value };
      return { ...prev, testEquipmentUsed: newTE };
    });
  };

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
 
    // Build base payload that works on legacy table (no 'data' column)
    const basePayload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customerName: formData.customerName,
        customerLocation: formData.customerLocation,
        userName: formData.userName,
        date: formData.date,
        identifier: formData.identifier,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        temperature: formData.temperature,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        // Persist nameplate and test equipment inside report_info for legacy tables
        nameplateManufacturer: formData.nameplateManufacturer,
        nameplateModelType: formData.nameplateModelType,
        nameplateCatalogNo: formData.nameplateCatalogNo,
        nameplateSerialNumber: formData.nameplateSerialNumber,
        nameplateSystemVoltage: formData.nameplateSystemVoltage,
        nameplateRatedVoltage: formData.nameplateRatedVoltage,
        nameplateRatedCurrent: formData.nameplateRatedCurrent,
        nameplateSCCR: formData.nameplateSCCR,
        testEquipmentUsed: formData.testEquipmentUsed,
        status: formData.status,
      },
      // Some ATS tables don't include a dedicated nameplate JSONB; keep legacy-compatible payload
      visual_inspection_items: formData.visualInspectionItems,
      insulation_resistance: formData.insulationResistance,
      contact_resistance: formData.contactResistance,
      // No dedicated test_equipment_used column on this table
      comments: formData.comments,
    } as const;

    // If the table supports a JSONB 'data' column, we'll include it; otherwise we'll fall back gracefully
    const fullPayload = { ...basePayload, data: { ...formData } } as any;
 
    try {
      let result: any;
      if (reportId) {
        // Try with full payload first; retry with legacy if 'data' column is missing
        result = await supabase
          .schema('neta_ops')
          .from('automatic_transfer_switch_ats_reports')
          .update(fullPayload)
          .eq('id', reportId)
          .select()
          .single();
        if (result?.error && String(result.error.message || '').toLowerCase().includes("data")) {
          result = await supabase
            .schema('neta_ops')
            .from('automatic_transfer_switch_ats_reports')
            .update(basePayload)
            .eq('id', reportId)
            .select()
            .single();
        }
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('automatic_transfer_switch_ats_reports')
          .insert(fullPayload)
          .select()
          .single();
        if (result?.error && String(result.error.message || '').toLowerCase().includes("data")) {
          result = await supabase
            .schema('neta_ops')
            .from('automatic_transfer_switch_ats_reports')
            .insert(basePayload)
            .select()
            .single();
        }
 
        if (result.data) {
          const assetData = {
            name: '35-Automatic Transfer Switch ATS - ' + (formData.identifier || formData.eqptLocation || 'Unnamed'),
            file_url: 'report:/jobs/' + jobId + '/automatic-transfer-switch-ats-report/' + result.data.id,
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
        }
      }
      if (result.error) throw result.error;
      setIsEditing(false);
      alert('Report ' + (reportId ? 'updated' : 'saved') + ' successfully!');
      navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert('Failed to save report: ' + (error?.message || 'Unknown error'));
    }
  };
  
  // Print Header
  const printHeader = (
    <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
      <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
      <div className="flex-1 text-center">
        <h1 className="text-2xl font-bold text-black mb-1">Automatic Transfer Switch ATS Report</h1>
      </div>
      <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>NETA - ATS 7.22.3</div>
    </div>
  );

  // Print CSS injection
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      if (document.getElementById('print-css-ats')) return;
      const style = document.createElement('style');
      style.id = 'print-css-ats';
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
            font-size: 14px !important; /* Larger font size for readability */
          }
          th, td {
            border: 2px solid black !important;
            padding: 8px 6px !important;
            color: black !important;
            font-size: 14px !important; /* Larger font size */
            box-sizing: border-box !important;
            line-height: 1.25 !important;
            background: white !important;
            height: 28px !important;
            vertical-align: middle !important;
            word-break: break-word !important;
            white-space: normal !important;
          }
          th {
            background-color: #f0f0f0 !important;
            font-weight: bold !important;
          }
          table thead th, table tbody td {
            border: 2px solid black !important;
            box-sizing: border-box !important;
          }
          table input, table select {
            font-size: 14px !important;
            padding: 0px !important;
            border: none !important;
            background: transparent !important;
            width: 100% !important;
            text-align: center !important;
            margin: 0 !important;
            height: 24px !important;
            min-height: 24px !important;
            box-sizing: border-box !important;
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
          .print\\:font-bold { font-weight: bold !important; }
          .print\\:text-center { text-align: center !important; }
          label { color: black !important; font-weight: 500 !important; }
          h1, h2, h3, h4, h5, h6 { color: black !important; }
          /* Remove old card styling so only tables appear with borders */
          div[class*="bg-white"], div[class*="dark:bg-dark-150"], div[class*="shadow"], div[class*="rounded"], section {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin-bottom: 12px !important;
          }
          .bg-green-100 { background-color: #dcfce7 !important; }
          .text-green-800 { color: #166534 !important; }
          .bg-red-100 { background-color: #fecaca !important; }
          .text-red-800 { color: #991b1b !important; }
          .bg-yellow-100 { background-color: #fef3c7 !important; }
          .text-yellow-800 { color: #92400e !important; }
          .overflow-x-auto {
            overflow: visible !important;
          }
          section { break-inside: avoid !important; page-break-inside: avoid !important; }
          .space-y-6 > * + * {
            margin-top: 20px !important;
          }
          #equipment-heading + div {
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 16px !important;
          }
          textarea {
            min-height: 100px !important;
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
          .form-label {
            display: block !important;
            margin-bottom: 4px !important;
            font-weight: 600 !important;
            color: black !important;
          }
          .grid.grid-cols-1.md\\:grid-cols-3 {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 16px !important;
          }
          #comments-heading {
            margin-bottom: 12px !important;
            padding-bottom: 8px !important;
            border-bottom: 1px solid black !important;
          }
          button {
            display: none !important;
          }
          * {
            color: black !important;
          }
          textarea:empty::before {
            content: "No comments entered" !important;
            color: #666 !important;
            font-style: italic !important;
          }
          .bg-white.dark\\:bg-dark-150 { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
          h2 {
            font-size: 18px !important;
            font-weight: bold !important;
            margin-bottom: 12px !important;
            padding-bottom: 8px !important;
            border-bottom: 1px solid black !important;
            color: black !important;
          }
          .form-input, .form-select {
            border: 1px solid black !important;
            background-color: white !important;
            color: black !important;
            padding: 4px 6px !important;
            font-size: 11px !important;
            width: 100% !important;
            display: block !important;
          }
          .grid.grid-cols-1.md\\:grid-cols-2 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
          }
          .form-label.inline-block {
            display: inline-block !important;
            width: 120px !important;
            font-weight: 600 !important;
            color: black !important;
            margin-right: 8px !important;
          }
          .flex.items-center {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
          }
          section:last-child {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 0 !important;
          }
          .overflow-hidden {
            overflow: visible !important;
          }
          * {
            max-height: none !important;
            overflow: visible !important;
          }
          table {
            font-size: 6px !important;
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          table th, table td {
            padding: 0px !important;
            font-size: 6px !important;
            border: 1px solid black !important;
            line-height: 1 !important;
          }
          table input, table select {
            font-size: 6px !important;
            padding: 0px !important;
            border: none !important;
            background: transparent !important;
            width: 100% !important;
            text-align: center !important;
            margin: 0 !important;
            height: 12px !important;
            min-height: 12px !important;
          }
          @page {
            size: landscape;
            margin: 3mm;
          }
          .max-w-7xl {
            max-width: none !important;
            width: 100% !important;
          }
          .w-full {
            width: 100% !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
            width: 100% !important;
          }
          section[aria-labelledby="electrical-tests-heading"] {
            padding: 4px !important;
            margin-bottom: 4px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          h2 {
            font-size: 12px !important;
            margin-bottom: 2px !important;
            padding-bottom: 2px !important;
            line-height: 1 !important;
          }
          .space-y-4 > * + * {
            margin-top: 4px !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
            width: 100% !important;
            max-width: none !important;
          }
          * {
            max-width: none !important;
            overflow: visible !important;
          }
          .mb-2, .mb-3, .mb-4 {
            margin-bottom: 2px !important;
          }
          .py-1, .py-2 {
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }
          table thead th {
            padding: 0px 1px !important;
            font-size: 6px !important;
            font-weight: bold !important;
            text-align: center !important;
            border: 1px solid black !important;
            background-color: #f0f0f0 !important;
            line-height: 1 !important;
            height: 14px !important;
          }
          table tbody td {
            padding: 0px 1px !important;
            font-size: 6px !important;
            border: 1px solid black !important;
            text-align: center !important;
            vertical-align: middle !important;
            line-height: 1 !important;
            height: 12px !important;
          }
          table caption {
            padding: 0px !important;
            margin: 0px !important;
            font-size: 6px !important;
            line-height: 1 !important;
          }
          section {
            padding: 8px !important;
            margin-bottom: 8px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          section:not([aria-labelledby="electrical-tests-heading"]) {
            padding: 6px !important;
            margin-bottom: 6px !important;
          }
          section[aria-labelledby="electrical-tests-heading"] {
            page-break-before: auto !important;
            break-before: auto !important;
          }
          /* Critical: control visibility helpers for print */
          .print\:hidden { display: none !important; }
          .hidden.print\:block { display: block !important; }
          /* And hard-hide the old nameplate grid by class */
          .nameplate-grid, .nameplate-grid * { display: none !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Header rendering with Print button
  const renderHeader = () => (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <h1 className="text-xl sm:text-2xl font-bold text-center sm:text-left">{reportName}</h1>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => isEditing && setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' }))}
          className={`px-4 py-2 rounded-md text-white font-medium text-sm ${formData.status === 'PASS' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}
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
            disabled={!isEditing || isSaving}
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700 disabled:opacity-50'}`}
          >
            {isSaving ? 'Saving...' : reportId ? 'Update Report' : 'Save Report'}
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="p-4 text-center text-lg text-gray-700 dark:text-gray-300">Loading report data...</div>;

  const renderInsulationRow = (stateKey: keyof FormData['insulationResistance'], title: string, hasNeutral: boolean = false) => {
    const rowData = formData.insulationResistance[stateKey] || { ...initialInsulationRow } as any;
    return (
      <tr>
        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{title}</td>
        {(['p1', 'p2', 'p3'] as const).map(pole => (
          <React.Fragment key={pole}>
            <td className="px-3 py-4">
              <input type="text" value={rowData[pole + 'Reading'] || ''} onChange={(e) => handleInsulationResistanceChange(stateKey, pole + 'Reading', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </td>
            <td className="px-3 py-4">
              <input type="text" value={rowData[pole + 'Corrected'] || ''} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" />
            </td>
          </React.Fragment>
        ))}
        {hasNeutral ? (
           <React.Fragment>
            <td className="px-3 py-4">
              <input type="text" value={rowData.neutralReading || ''} onChange={(e) => handleInsulationResistanceChange(stateKey, 'neutralReading', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
            </td>
            <td className="px-3 py-4">
              <input type="text" value={rowData.neutralCorrected || ''} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" />
            </td>
          </React.Fragment>
        ) : (
          <><td className="px-3 py-4 bg-gray-50 dark:bg-dark-200"></td><td className="px-3 py-4 bg-gray-50 dark:bg-dark-200"></td></>
        )}
        <td className="px-6 py-4">
          <select value={rowData.units || 'MΩ'} onChange={(e) => handleInsulationResistanceChange(stateKey, 'units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
            {insulationResistanceUnitsOptions.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
      </tr>
    );
  };




  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.22.3
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
      
      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        {/* Header */}
        <div className="print:hidden flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (isEditing) handleChange('status', formData.status === 'PASS' ? 'FAIL' : 'PASS')
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
        
        
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden">
            <div><label className="form-label">Customer:</label><input type="text" value={formData.customerName} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
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
            <div className="md:col-span-2"><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.userName} onChange={(e) => handleChange('userName', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>

        </div>
        <JobInfoPrintTable
          data={{
            customer: formData.customerName,
            address: formData.customerLocation,
            jobNumber: formData.jobNumber,
            technicians: formData.technicians,
            date: formData.date,
            identifier: formData.identifier,
            user: formData.userName,
            substation: formData.substation,
            eqptLocation: formData.eqptLocation,
            temperature: { ...formData.temperature }
          }}
        />
      </div>

      {/* Nameplate Data */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-nameplate-data">Nameplate Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 gap-x-4 gap-y-2 print:hidden nameplate-grid">
            <div><label htmlFor="nameplateManufacturer" className="form-label">Manufacturer:</label><input id="nameplateManufacturer" type="text" value={formData.nameplateManufacturer} onChange={(e) => handleChange('nameplateManufacturer', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateModelType" className="form-label">Model / Type:</label><input id="nameplateModelType" type="text" value={formData.nameplateModelType} onChange={(e) => handleChange('nameplateModelType', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateCatalogNo" className="form-label">Catalog No.:</label><input id="nameplateCatalogNo" type="text" value={formData.nameplateCatalogNo} onChange={(e) => handleChange('nameplateCatalogNo', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateSerialNumber" className="form-label">Serial Number:</label><input id="nameplateSerialNumber" type="text" value={formData.nameplateSerialNumber} onChange={(e) => handleChange('nameplateSerialNumber', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateSystemVoltage" className="form-label">System Voltage (V):</label><input id="nameplateSystemVoltage" type="text" value={formData.nameplateSystemVoltage} onChange={(e) => handleChange('nameplateSystemVoltage', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateRatedVoltage" className="form-label">Rated Voltage (V):</label><input id="nameplateRatedVoltage" type="text" value={formData.nameplateRatedVoltage} onChange={(e) => handleChange('nameplateRatedVoltage', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateRatedCurrent" className="form-label">Rated Current (A):</label><input id="nameplateRatedCurrent" type="text" value={formData.nameplateRatedCurrent} onChange={(e) => handleChange('nameplateRatedCurrent', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="nameplateSCCR" className="form-label">SCCR (kA):</label><input id="nameplateSCCR" type="text" value={formData.nameplateSCCR} onChange={(e) => handleChange('nameplateSCCR', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
        </div>

        {/* Print-only Nameplate Table (4x2) */}
        <div className="hidden print:block">
          <table className="w-full table-fixed border-collapse border border-black mb-6">
            <colgroup>
              <col style={{ width: '25%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '25%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Manufacturer:</div><div>{formData.nameplateManufacturer}</div></td>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Model / Type:</div><div>{formData.nameplateModelType}</div></td>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Catalog No.:</div><div>{formData.nameplateCatalogNo}</div></td>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Serial Number:</div><div>{formData.nameplateSerialNumber}</div></td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">System Voltage (V):</div><div>{formData.nameplateSystemVoltage}</div></td>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Rated Voltage (V):</div><div>{formData.nameplateRatedVoltage}</div></td>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">Rated Current (A):</div><div>{formData.nameplateRatedCurrent}</div></td>
                <td className="border border-black px-2 py-1 align-top"><div className="font-bold">SCCR (kA):</div><div>{formData.nameplateSCCR}</div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual and Mechanical Inspection */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-visual-mechanical">Visual and Mechanical Inspection</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '65%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">NETA Section</th>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Description</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Results</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150">
              {formData.visualInspectionItems.map((item, index) => (
                <tr key={item.netaSection}>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white">{item.netaSection}</td>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white">{item.description}</td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                    <select value={item.result} onChange={(e) => handleVisualInspectionChange(index, 'result', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                      {visualInspectionResultOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Electrical Tests - Insulation Resistance */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-insulation-resistance">Electrical Tests - Insulation Resistance</h2>
        
        <div className="flex items-center mb-4">
          <label htmlFor="insulationTestVoltage" className="mr-2 text-sm font-medium">Test Voltage:</label>
          <select 
            id="insulationTestVoltage"
            value={formData.insulationTestVoltage} 
            onChange={(e) => handleChange('insulationTestVoltage', e.target.value)} 
            disabled={!isEditing} 
            className={`form-select w-32 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          >
            {testVoltageOptions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th rowSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Test Points</th>
                <th colSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P1</th>
                <th colSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P2</th>
                <th colSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P3</th>
                <th colSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Neutral</th>
                <th rowSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
              </tr>
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">Reading</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">@20°C</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">Reading</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">@20°C</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">Reading</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">@20°C</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">Reading</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300">@20°C</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              {renderInsulationRow('poleToPoleNormalClosed', 'Pole to Pole (Normal Closed)', true)}
              {renderInsulationRow('poleToPoleEmergencyClosed', 'Pole to Pole (Emergency Closed)', true)}
              {renderInsulationRow('poleToNeutralNormalClosed', 'Pole to Neutral (Normal Closed)', true)}
              {renderInsulationRow('poleToNeutralEmergencyClosed', 'Pole to Neutral (Emergency Closed)', true)}
              {renderInsulationRow('poleToGroundNormalClosed', 'Pole to Ground (Normal Closed)', true)}
              {renderInsulationRow('poleToGroundEmergencyClosed', 'Pole to Ground (Emergency Closed)', true)}
              {renderInsulationRow('lineToLoadNormalOpen', 'Line to Load (Normal Open)', true)}
              {renderInsulationRow('lineToLoadEmergencyOpen', 'Line to Load (Emergency Open)', true)}
            </tbody>
          </table>
        </div>
      </div>

                {/* Electrical Tests - Contact/Pole Resistance */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-contact-resistance">Electrical Tests - Contact/Pole Resistance</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P1</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P2</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">P3</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Neutral</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              {(['normal', 'emergency'] as const).map(state => {
                const stateObj = formData.contactResistance[state] || { p1: '', p2: '', p3: '', neutral: '', units: 'µΩ' };
                return (
                  <tr key={state}>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{state.charAt(0).toUpperCase() + state.slice(1)}</td>
                    {(['p1', 'p2', 'p3', 'neutral'] as const).map(pole => (
                      <td key={pole} className="px-6 py-4">
                        <input type="text" value={stateObj[pole] || ''} onChange={(e) => handleContactResistanceChange(state, pole, e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                      </td>
                    ))}
                    <td className="px-6 py-4">
                      <select value={stateObj.units || 'µΩ'} onChange={(e) => handleContactResistanceChange(state, 'units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                        {contactResistanceUnitsOptions.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test Equipment Used */}
      <div className="mb-6 print:hidden">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-test-equipment">Test Equipment Used</h2>
        <div className="space-y-4">
          {(Object.keys(formData.testEquipmentUsed) as Array<keyof FormData['testEquipmentUsed']>).map(equipmentKey => {
            const equipment = formData.testEquipmentUsed[equipmentKey];
            const label = equipmentKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
              .replace('Megohmmeter', 'Megohmmeter')
              .replace('Low Resistance Ohmmeter', 'Low Resistance Ohmmeter');

            return (
              <div key={equipmentKey} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div><label htmlFor={`${equipmentKey}Name`} className="form-label block">{label}:</label><input id={`${equipmentKey}Name`} type="text" value={equipment.name} onChange={(e) => handleChange(`testEquipmentUsed.${equipmentKey}.name`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor={`${equipmentKey}Serial`} className="form-label block">Serial Number:</label><input id={`${equipmentKey}Serial`} type="text" value={equipment.serialNumber} onChange={(e) => handleChange(`testEquipmentUsed.${equipmentKey}.serialNumber`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor={`${equipmentKey}AmpId`} className="form-label block">AMP ID:</label><input id={`${equipmentKey}AmpId`} type="text" value={equipment.ampId} onChange={(e) => handleChange(`testEquipmentUsed.${equipmentKey}.ampId`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Print-only Test Equipment Used table */}
      <div className="hidden print:block">
        <h2 className="text-xl font-semibold mb-4 text-black border-b border-black pb-2 font-bold">Test Equipment Used</h2>
        <table className="w-full border-collapse border border-black mb-6">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Equipment</th>
              <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Serial Number</th>
              <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">AMP ID</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 text-sm">{formData.testEquipmentUsed.megohmmeter.name || 'Megohmmeter'}</td>
              <td className="border border-black px-2 py-1 text-sm">{formData.testEquipmentUsed.megohmmeter.serialNumber}</td>
              <td className="border border-black px-2 py-1 text-sm">{formData.testEquipmentUsed.megohmmeter.ampId}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-sm">{formData.testEquipmentUsed.lowResistanceOhmmeter.name || 'Low-Res Ohmmeter'}</td>
              <td className="border border-black px-2 py-1 text-sm">{formData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber}</td>
              <td className="border border-black px-2 py-1 text-sm">{formData.testEquipmentUsed.lowResistanceOhmmeter.ampId}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Comments */}
      <div className="mb-6 print:hidden">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-comments">Comments</h2>
        <textarea
          value={formData.comments}
          onChange={(e) => handleChange('comments', e.target.value)}
          readOnly={!isEditing}
          rows={1}
          className={`form-textarea w-full resize-none ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          placeholder="Enter comments here..."
        />
      </div>

      {/* Print-only Comments table */}
      <div className="hidden print:block">
        <h2 className="text-xl font-semibold mb-4 text-black border-b border-black pb-2 font-bold">Comments</h2>
        <table className="w-full border-collapse border border-black mb-6">
          <tbody>
            <tr>
              <td className="border border-black px-4 py-8 text-sm align-top" style={{minHeight: '150px', height: '150px'}}>
                {formData.comments}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </ReportWrapper>
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
        .section-insulation-resistance table,
        .section-contact-resistance table {
          border: 1px solid black !important;
        }
        
        .section-insulation-resistance th,
        .section-insulation-resistance td,
        .section-contact-resistance th,
        .section-contact-resistance td {
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

export default AutomaticTransferSwitchATSReport; 