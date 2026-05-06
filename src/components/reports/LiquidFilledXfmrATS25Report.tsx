import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';

const VISUAL_INSPECTION_OPTIONS = [
  'Select One',
  'Satisfactory',
  'Unsatisfactory',
  'Cleaned',
  'See Comments',
  'Not Applicable'
];

const INSULATION_RESISTANCE_TEST_VOLTAGES = ['1000V', '2500V', '5000V'];
const INSULATION_RESISTANCE_UNITS = ['kΩ', 'MΩ', 'GΩ'];
const WINDING_CONNECTIONS = ['Delta', 'Wye', 'Single Phase'];
const WINDING_MATERIALS = ['', 'Copper', 'Aluminum'];
const TAP_POSITIONS = ['1', '2', '3', '4', '5', '6', '7'];

type StatusType = 'PASS' | 'FAIL' | 'LIMITED SERVICE';

interface InsulationRow {
  windingUnderTest: string;
  testVoltage: string;
  measured05Min: string;
  measured1Min: string;
  measured10Min: string;
  corrected05Min: string;
  corrected1Min: string;
  corrected10Min: string;
}

interface FormData {
  customerName: string;
  customerLocation: string;
  userName: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  temperature: { fahrenheit: number; celsius: number; tcf: number; humidity: number | null };
  substation: string;
  eqptLocation: string;
  status: StatusType;

  nameplate: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    kva: string;
    tempRise: string;
    impedance: string;
    fluidType: string;
    fluidVolume: string;
    primaryVoltage1: string;
    primaryVoltage2: string;
    secondaryVoltage1: string;
    secondaryVoltage2: string;
    primaryWindingConnection: string;
    secondaryWindingConnection: string;
    primaryWindingMaterial: string;
    secondaryWindingMaterial: string;
    tapVoltage1: string;
    tapVoltage2: string;
    tapVoltage3: string;
    tapVoltage4: string;
    tapVoltage5: string;
    tapVoltage6: string;
    tapVoltage7: string;
    tapPositionLeft: string;
  };

  visualInspectionItems: Array<{ id: string; description: string; result: string }>;

  indicatorGaugeValues: {
    oilLevel: string;
    tankPressure: string;
    oilTemperature: string;
    windingTemperature: string;
    oilTempRange: string;
    windingTempRange: string;
  };

  insulationTemperature: string;
  insulationUnit: string;
  insulationRows: InsulationRow[];
  dielectricAbsorption: {
    primary: string;
    secondary: string;
    priToSec: string;
    acceptable: 'Pass' | 'Fail' | '';
  };
  polarizationIndex: {
    primary: string;
    secondary: string;
    priToSec: string;
    acceptable: 'Pass' | 'Fail' | '';
  };

  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
  };
  visualMechanicalComments: string;
  comments: string;
}

// TIF table keyed by rounded °C (Temperature Insulation Factor for liquid-filled transformers)
const TCF_TABLE: { [k: string]: number } = {
  '-24': 0.048, '-23': 0.051, '-22': 0.055, '-21': 0.059, '-20': 0.063,
  '-19': 0.068, '-18': 0.073, '-17': 0.078, '-16': 0.083, '-15': 0.089,
  '-14': 0.096, '-13': 0.103, '-12': 0.110, '-11': 0.118, '-10': 0.125,
  '-9': 0.135, '-8': 0.145, '-7': 0.155, '-6': 0.166, '-5': 0.180,
  '-4': 0.191, '-3': 0.205, '-2': 0.219, '-1': 0.235, '0': 0.250,
  '1': 0.270, '2': 0.289, '3': 0.310, '4': 0.332, '5': 0.360,
  '6': 0.381, '7': 0.409, '8': 0.438, '9': 0.469, '10': 0.500,
  '11': 0.539, '12': 0.577, '13': 0.619, '14': 0.663, '15': 0.750,
  '16': 0.761, '17': 0.816, '18': 0.874, '19': 0.937, '20': 1.000,
  '21': 1.075, '22': 1.152, '23': 1.235, '24': 1.323, '25': 1.400,
  '26': 1.519, '27': 1.628, '28': 1.745, '29': 1.869, '30': 1.980,
  '31': 2.146, '32': 2.300, '33': 2.464, '34': 2.641, '35': 2.800,
  '36': 3.032, '37': 3.249, '38': 3.482, '39': 3.731, '40': 3.950,
  '41': 4.284, '42': 4.590, '43': 4.918, '44': 5.270, '45': 5.600,
  '46': 6.051, '47': 6.484, '48': 6.948, '49': 7.445, '50': 7.850,
  '51': 8.549, '52': 9.160, '53': 9.816, '54': 10.518, '55': 11.200,
  '56': 12.077, '57': 12.941, '58': 13.866, '59': 14.859, '60': 15.850,
  '61': 17.061, '62': 18.281, '63': 19.589, '64': 20.991, '65': 22.400,
  '66': 24.101, '67': 25.826, '68': 27.673, '69': 29.653, '70': 31.750,
  '71': 34.048, '72': 36.484, '73': 39.094, '74': 41.891, '75': 44.700,
  '76': 48.100, '77': 51.541, '78': 55.228, '79': 59.179, '80': 63.500,
  '81': 67.950, '82': 72.811, '83': 78.021, '84': 83.603, '85': 89.789,
  '86': 95.993, '87': 102.861, '88': 110.219, '89': 118.105, '90': 127.000,
  '91': 135.609, '92': 145.311, '93': 155.707, '94': 166.846, '95': 180.000,
  '96': 191.574, '97': 205.280, '98': 219.966, '99': 235.703, '100': 245.000,
  '101': 270.636, '102': 289.998, '103': 310.745, '104': 332.977, '105': 359.150,
  '106': 382.326, '107': 409.679, '108': 438.989, '109': 470.395, '110': 509.000
};

const getTCF = (celsius: number): number => TCF_TABLE[Math.round(celsius).toString()] ?? 1;

const LiquidFilledXfmrATS25Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const isPrintMode = searchParams.get('print') === 'true';

  const reportSlug = 'liquid-filled-xfmr-ats25';
  const reportName = getReportName(reportSlug);

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!initialReportId);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);

  const [formData, setFormData] = useState<FormData>({
    customerName: '', customerLocation: '', userName: '', date: new Date().toISOString().split('T')[0],
    identifier: '', jobNumber: '', technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: null },
    substation: '', eqptLocation: '', status: 'PASS',
    nameplate: {
      manufacturer: '', catalogNumber: '', serialNumber: '', kva: '', tempRise: '', impedance: '', fluidType: '', fluidVolume: '',
      primaryVoltage1: '', primaryVoltage2: '', secondaryVoltage1: '', secondaryVoltage2: '',
      primaryWindingConnection: 'Delta', secondaryWindingConnection: 'Wye', primaryWindingMaterial: '', secondaryWindingMaterial: '',
      tapVoltage1: '', tapVoltage2: '', tapVoltage3: '', tapVoltage4: '', tapVoltage5: '', tapVoltage6: '', tapVoltage7: '',
      tapPositionLeft: ''
    },
    visualInspectionItems: [
      { id: '7.2.2.A.1', description: 'Compare equipment nameplate data with drawings.', result: 'Select One' },
      { id: '7.2.2.A.2', description: 'Inspect physical and mechanical condition.', result: 'Select One' },
      { id: '7.2.2.A.3', description: 'Inspect impact recorder prior to unloading.', result: 'Select One' },
      { id: '7.2.2.A.5', description: 'Inspect anchorage, alignment, and grounding.', result: 'Select One' },
      { id: '7.2.2.A.6', description: 'Verify the presence of PCB content labeling.', result: 'Select One' },
      { id: '7.2.2.A.7', description: 'Verify removal of any shipping bracing after placement.', result: 'Select One' },
      { id: '7.2.2.A.8', description: 'Verify the bushings are clean.', result: 'Select One' },
      { id: '7.2.2.A.9', description: 'Verify that alarm, control, and trip settings on temperature and level indicators are as specified.', result: 'Select One' },
      { id: '7.2.2.A.10', description: 'Verify operation of alarm, control, and trip circuits from temperature and level indicators, pressure relief device, gas accumulator, and fault pressure relay.', result: 'Select One' },
      { id: '7.2.2.A.11', description: 'Verify that cooling fans and pumps operate correctly and have appropriate overcurrent protection.', result: 'Select One' },
      { id: '7.2.2.A.12', description: 'Verify tightness of accessible bolted electrical connections by calibrated torque-wrench method or in accordance with 7.2.2.B.1. Torque values shall be in accordance with manufacturer\'s published data. In the absence of manufacturer\'s data, use Table 100.12.', result: 'Select One' },
      { id: '7.2.2.A.13', description: 'Verify correct liquid level in tanks and bushings.', result: 'Select One' },
      { id: '7.2.2.A.14', description: 'Verify valves are in the correct operating position.', result: 'Select One' },
      { id: '7.2.2.A.15', description: 'Verify that positive pressure is maintained on gas-blanketed transformers.', result: 'Select One' },
      { id: '7.2.2.A.16', description: 'Perform inspections and mechanical tests as recommended by the manufacturer.', result: 'Select One' },
      { id: '7.2.2.A.17', description: 'Test load tap-changer in accordance with Section 7.12.3.', result: 'Select One' },
      { id: '7.2.2.A.18', description: 'Verify presence of transformer surge arresters.', result: 'Select One' },
      { id: '7.2.2.A.19', description: 'Verify de-energized tap-changer position is left as specified.', result: 'Select One' }
    ],
    indicatorGaugeValues: {
      oilLevel: '',
      tankPressure: '',
      oilTemperature: '',
      windingTemperature: '',
      oilTempRange: '',
      windingTempRange: ''
    },
    insulationTemperature: '',
    insulationUnit: 'MΩ',
    insulationRows: [
      { windingUnderTest: 'Primary to Ground', testVoltage: '5000V', measured05Min: '', measured1Min: '', measured10Min: '', corrected05Min: '', corrected1Min: '', corrected10Min: '' },
      { windingUnderTest: 'Secondary to Ground', testVoltage: '1000V', measured05Min: '', measured1Min: '', measured10Min: '', corrected05Min: '', corrected1Min: '', corrected10Min: '' },
      { windingUnderTest: 'Primary to Secondary', testVoltage: '5000V', measured05Min: '', measured1Min: '', measured10Min: '', corrected05Min: '', corrected1Min: '', corrected10Min: '' }
    ],
    dielectricAbsorption: { primary: '', secondary: '', priToSec: '', acceptable: '' },
    polarizationIndex: { primary: '', secondary: '', priToSec: '', acceptable: '' },
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' }
    },
    visualMechanicalComments: '',
    comments: ''
  });

  const loadJobInfo = async () => {
    if (!jobId) return;
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('job_number, customer_id, site_address')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;
      let customerName = '';
      let customerAddress = (jobData as any)?.site_address || '';
      if (jobData?.customer_id) {
        const { data: customer, error: custErr } = await supabase
          .schema('common')
          .from('customers')
          .select('name, company_name, address')
          .eq('id', jobData.customer_id)
          .single();
        if (!custErr && customer) {
          customerName = maskCustomerName(customer.company_name || customer.name || '');
          if (!customerAddress) customerAddress = customer.address || '';
        }
      }
      setFormData(prev => ({ ...prev, jobNumber: jobData?.job_number || '', customerName: maskCustomerName(customerName), customerLocation: maskCustomerAddress(customerAddress) }));
    } catch (e) { /* noop */ }
  };

  const loadReport = async () => {
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) { setLoading(false); setIsEditing(true); return; }
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('liquid_filled_xfmr_ats25_reports')
        .select('*')
        .eq('id', currentReportId)
        .single();
      if (error) throw error;
      if (data) {
        const info = data.report_info || {};
        const vm = data.visual_mechanical || {};
        const vmItems = vm.items || [];
        const ir = data.insulation_resistance || {};
        const tr = data.turns_ratio || {};
        const te = data.test_equipment || info.testEquipment || undefined;
        setFormData(prev => ({
          ...prev,
          customerName: info.customer || prev.customerName,
          customerLocation: info.address || prev.customerLocation,
          userName: info.userName || prev.userName,
          date: info.date || prev.date,
          technicians: info.technicians || prev.technicians,
          identifier: info.identifier || prev.identifier,
          substation: info.substation || prev.substation,
          eqptLocation: info.eqptLocation || prev.eqptLocation,
          temperature: info.temperature || prev.temperature,
          status: info.status || prev.status,
          nameplate: info.nameplate || prev.nameplate,
          indicatorGaugeValues: info.indicatorGaugeValues || prev.indicatorGaugeValues,
          visualInspectionItems: vmItems.length ? vmItems : prev.visualInspectionItems,
          visualMechanicalComments: vm.comments || prev.visualMechanicalComments,
          insulationTemperature: ir.insulationTemperature || prev.insulationTemperature,
          insulationUnit: ir.unit || prev.insulationUnit,
          insulationRows: ir.rows || prev.insulationRows,
          dielectricAbsorption: ir.dielectricAbsorption || prev.dielectricAbsorption,
          polarizationIndex: ir.polarizationIndex || prev.polarizationIndex,
          testEquipment: te || prev.testEquipment,
          comments: data.comments || prev.comments
        }));
        setIsEditing(false);
      }
    } catch (e) {
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadJobInfo(); loadReport(); }, [jobId, currentReportId]);

  useEffect(() => {
    const prev = document.title;
    const title = getAssetName(reportSlug, formData.identifier || formData.eqptLocation || '');
    document.title = title;
    return () => { document.title = prev; };
  }, [formData.identifier, formData.eqptLocation]);

  // Temperature conversions
  const handleF = (f: number) => {
    const c = Math.round(((f - 32) * 5) / 9);
    const tcf = getTCF(c);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit: f, celsius: c, tcf } }));
  };

  // Apply temperature correction to insulation rows
  useEffect(() => {
    const tcf = formData.temperature.tcf || 1;
    setFormData(prev => ({
      ...prev,
      insulationRows: prev.insulationRows.map(row => {
        const correct = (v: string) => {
          const trimmed = v.trim();
          if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.startsWith('>') || trimmed.startsWith('<')) return trimmed || '';
          const n = parseFloat(trimmed);
          return isFinite(n) ? (n * tcf).toFixed(2) : '';
        };
        return {
          ...row,
          corrected05Min: correct(row.measured05Min),
          corrected1Min: correct(row.measured1Min),
          corrected10Min: correct(row.measured10Min)
        };
      })
    }));
  }, [formData.temperature.tcf, JSON.stringify(formData.insulationRows.map(r => [r.measured05Min, r.measured1Min, r.measured10Min]))]);

  // Calculate Dielectric Absorption (1 Min / 0.5 Min) and Polarization Index (10 Min / 1 Min)
  useEffect(() => {
    const rows = formData.insulationRows;
    
    // Dielectric Absorption: 1 Min / 0.5 Min
    const calcDA = (idx: number): string => {
      const m05 = parseFloat(rows[idx]?.corrected05Min || '');
      const m1 = parseFloat(rows[idx]?.corrected1Min || '');
      if (!isFinite(m05) || !isFinite(m1) || m05 === 0) return '';
      return (m1 / m05).toFixed(2);
    };
    
    // Polarization Index: 10 Min / 1 Min
    const calcPI = (idx: number): string => {
      const m1 = parseFloat(rows[idx]?.corrected1Min || '');
      const m10 = parseFloat(rows[idx]?.corrected10Min || '');
      if (!isFinite(m1) || !isFinite(m10) || m1 === 0) return '';
      return (m10 / m1).toFixed(2);
    };

    const daPrimary = calcDA(0);
    const daSecondary = calcDA(1);
    const daPriToSec = calcDA(2);
    const piPrimary = calcPI(0);
    const piSecondary = calcPI(1);
    const piPriToSec = calcPI(2);

    // Determine acceptable (Pass/Fail) - All ratios must be >= 1.0 to pass
    const daValues = [daPrimary, daSecondary, daPriToSec].map(v => parseFloat(v)).filter(n => isFinite(n));
    const daAcceptable: 'Pass' | 'Fail' | '' = daValues.length > 0 
      ? (daValues.every(v => v >= 1.0) ? 'Pass' : 'Fail') 
      : '';

    const piValues = [piPrimary, piSecondary, piPriToSec].map(v => parseFloat(v)).filter(n => isFinite(n));
    const piAcceptable: 'Pass' | 'Fail' | '' = piValues.length > 0 
      ? (piValues.every(v => v >= 1.0) ? 'Pass' : 'Fail') 
      : '';

    setFormData(prev => ({
      ...prev,
      dielectricAbsorption: {
        primary: daPrimary,
        secondary: daSecondary,
        priToSec: daPriToSec,
        acceptable: daAcceptable
      },
      polarizationIndex: {
        primary: piPrimary,
        secondary: piSecondary,
        priToSec: piPriToSec,
        acceptable: piAcceptable
      }
    }));
  }, [JSON.stringify(formData.insulationRows)]);

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const payload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        userName: formData.userName,
        date: formData.date,
        identifier: formData.identifier,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        status: formData.status,
        nameplate: formData.nameplate,
        indicatorGaugeValues: formData.indicatorGaugeValues
      },
      visual_mechanical: { items: formData.visualInspectionItems, comments: formData.visualMechanicalComments },
      insulation_resistance: {
        insulationTemperature: formData.insulationTemperature,
        unit: formData.insulationUnit,
        rows: formData.insulationRows,
        dielectricAbsorption: formData.dielectricAbsorption,
        polarizationIndex: formData.polarizationIndex
      },
      test_equipment: formData.testEquipment,
      comments: formData.comments
    };

    try {
      setIsAutoSaving(true);

      if (currentReportId) {
        await supabase
          .schema('neta_ops')
          .from('liquid_filled_xfmr_ats25_reports')
          .update(payload)
          .eq('id', currentReportId);
      } else {
        const result = await supabase
          .schema('neta_ops')
          .from('liquid_filled_xfmr_ats25_reports')
          .insert(payload)
          .select()
          .single();

        if (result.data) {
          const newReportId = result.data.id;

          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
            user_id: user.id
          };

          const { data: assetResult } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (assetResult) {
            await supabase.schema('neta_ops').from('job_assets').insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
          }

          setCurrentReportId(newReportId);
          isAutoSaveCreatedRef.current = true;
          window.history.replaceState({}, '', `/jobs/${jobId}/${reportSlug}/${newReportId}`);
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [jobId, user?.id, currentReportId, formData, reportSlug]);

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
    const payload = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: maskCustomerName(formData.customerName),
        address: maskCustomerAddress(formData.customerLocation),
        userName: formData.userName,
        date: formData.date,
        identifier: formData.identifier,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        status: formData.status,
        nameplate: formData.nameplate,
        indicatorGaugeValues: formData.indicatorGaugeValues
      },
      visual_mechanical: { items: formData.visualInspectionItems, comments: formData.visualMechanicalComments },
      insulation_resistance: {
        insulationTemperature: formData.insulationTemperature,
        unit: formData.insulationUnit,
        rows: formData.insulationRows,
        dielectricAbsorption: formData.dielectricAbsorption,
        polarizationIndex: formData.polarizationIndex
      },
      test_equipment: formData.testEquipment,
      comments: formData.comments
    };

    try {
      let result;
      if (currentReportId) {
        result = await supabase
          .schema('neta_ops')
          .from('liquid_filled_xfmr_ats25_reports')
          .update(payload)
          .eq('id', currentReportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('liquid_filled_xfmr_ats25_reports')
          .insert(payload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
            user_id: user.id
          };
          const { data: assetResult } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();
          if (assetResult) {
            await supabase.schema('neta_ops').from('job_assets').insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
          }
        }
      }

      if ((result as any)?.error) throw (result as any).error;
      setIsEditing(false);
      navigateAfterSave(navigate, jobId, location);
    } catch (e: any) {
      console.error('Save error', e);
      alert(`Failed to save report: ${e?.message || 'Unknown error'}`);
    }
  };

  // Print styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@media print { 
      body { margin:0; padding:10px; font-family: Arial, Helvetica, sans-serif !important; } 
      html, body { font-size:9px !important; color:black !important; background:white !important; } 
      .print\\:hidden { display:none !important; } 
      .print\\:block { display:block !important; }
      .print\\:flex { display:flex !important; }
      table { border-collapse:collapse !important; width:100% !important; font-size:8px !important; table-layout: fixed !important; } 
      thead { display:table-header-group !important; } 
      tr { page-break-inside: avoid !important; } 
      table, th, td, thead, tbody, tr { border:1px solid black !important; } 
      th, td { padding:2px 3px !important; text-align:center !important; word-wrap: break-word !important; overflow-wrap: break-word !important; white-space: normal !important; } 
      th { background:#f0f0f0 !important; font-weight:bold !important; } 
      input, select, textarea { background:transparent !important; border:none !important; color:black !important; -webkit-appearance:none !important; appearance:none !important; } 
      select { background-image:none !important; } 
      input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none !important; margin:0 !important; } 
      input[type="number"] { -moz-appearance:textfield !important; } 
      button:not(.print-visible) { display:none !important; } 
      * { color:black !important; } 
      .overflow-x-auto { overflow: visible !important; }
      .job-info-onscreen { display: none !important; }
      .job-info-print { display: block !important; }
      /* Visual & Mechanical table text wrapping */
      .visual-mechanical-table td { text-align: left !important; vertical-align: top !important; }
      .visual-mechanical-table td:first-child { width: 12% !important; }
      .visual-mechanical-table td:nth-child(2) { width: 68% !important; }
      .visual-mechanical-table td:last-child { width: 20% !important; text-align: center !important; }
    }`;
    document.head.appendChild(style);
    return () => { try { document.head.removeChild(style); } catch { /* ignore */ } };
  }, []);

  if (loading && currentReportId) return <div className="p-4">Loading report...</div>;

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">
            7.2.2 Liquid Filled Xfmr. Visual, Mechanical,<br/>
            Insulation Resistance Test ATS 25
          </h1>
        </div>
        <div className="text-right" style={{ minWidth: 150 }}>
          <div className="font-extrabold text-xl" style={{ color: '#1a4e7c' }}>NETA - ATS 7.2.2</div>
          <div
            className={`mt-1 inline-block pass-fail-status-box ${formData.status === 'FAIL' ? 'fail' : formData.status === 'LIMITED SERVICE' ? 'limited' : 'pass'}`}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 800,
              textAlign: 'center',
              borderRadius: '6px',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
              minWidth: 60
            }}
          >
            {formData.status}
          </div>
        </div>
      </div>

      <div className="p-6 flex justify-center print:p-0 print:block">
        <div className="max-w-7xl w-full space-y-6 print:max-w-none print:space-y-2">
          {/* Header */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden flex justify-between items-center mb-6`}>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
            <div className="flex gap-2 items-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                ✓ Auto Saving Enabled
              </span>
              <button
                onClick={() => isEditing && setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : prev.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS' }))}
                disabled={!isEditing}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500 hover:bg-green-700' :
                  formData.status === 'FAIL' ? 'bg-red-600 text-white focus:ring-red-500 hover:bg-red-700' :
                  'bg-yellow-500 text-black focus:ring-yellow-400 hover:bg-yellow-600'
                } ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {formData.status}
              </button>
              {currentReportId && !isEditing ? (
                <>
                  <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Edit Report</button>
                  <button onClick={() => window.print()} className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Print Report</button>
                </>
              ) : (
                <button onClick={handleSave} disabled={!isEditing} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}>Save Report</button>
              )}
            </div>
          </div>

          {/* Job Information */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-2 gap-6 print:hidden job-info-onscreen">
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Customer</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.customerName} readOnly className="w-full bg-transparent border-none focus:ring-0 cursor-default" />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Site Address</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={maskCustomerAddress(formData.customerLocation)} readOnly className="w-full bg-transparent border-none focus:ring-0 cursor-default" />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">User</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.userName} onChange={e => setFormData(p => ({ ...p, userName: e.target.value }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Date</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Identifier</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.identifier} onChange={e => setFormData(p => ({ ...p, identifier: e.target.value }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Job #</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.jobNumber} readOnly className="w-full bg-transparent border-none focus:ring-0 cursor-default" />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Technicians</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.technicians} onChange={e => setFormData(p => ({ ...p, technicians: e.target.value }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex items-center">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Temp.</label>
                  <div className="flex-1 flex items-center">
                    <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                      <input type="number" value={formData.temperature.fahrenheit} onChange={e => handleF(parseFloat(e.target.value))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                    </div>
                    <span className="mx-2">°F</span>
                    <span className="mx-2">{formData.temperature.celsius}</span>
                    <span className="mx-2">°C</span>
                    <span className="mx-5">TCF</span>
                    <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.temperature.tcf.toFixed(3)} readOnly className="w-full bg-transparent border-none focus:ring-0 cursor-default" />
                    </div>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Humidity</label>
                  <div className="flex items-center flex-1">
                    <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                      <input type="number" value={formData.temperature.humidity || 0} onChange={e => setFormData(p => ({ ...p, temperature: { ...p.temperature, humidity: Number(e.target.value) } }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                    </div>
                    <span className="ml-2">%</span>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Substation</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.substation} onChange={e => setFormData(p => ({ ...p, substation: e.target.value }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Eqpt. Location</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={formData.eqptLocation} onChange={e => setFormData(p => ({ ...p, eqptLocation: e.target.value }))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
              </div>
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
                temperature: { fahrenheit: formData.temperature.fahrenheit, celsius: formData.temperature.celsius, tcf: formData.temperature.tcf, humidity: formData.temperature.humidity ?? undefined }
              }}
            />
          </div>

          {/* Nameplate Data */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-200 dark:border-gray-700">
                  <colgroup>
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                  </colgroup>
                <tbody className="bg-white dark:bg-dark-150">
                  {/* Row 1: Manufacturer, Catalog Number, Serial Number, KVA */}
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Manufacturer:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.manufacturer} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, manufacturer: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.manufacturer || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Catalog Number:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.catalogNumber} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, catalogNumber: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.catalogNumber || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Serial Number:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.serialNumber} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, serialNumber: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.serialNumber || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">KVA:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.kva} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, kva: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.kva || '-'}</div>
                    </td>
                  </tr>
                  {/* Row 2: Temp Rise, Impedance, Fluid Type, Fluid Volume */}
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Temp. Rise:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.tempRise} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, tempRise: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.tempRise || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Impedance:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.impedance} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, impedance: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.impedance || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Fluid Type:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.fluidType} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, fluidType: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.fluidType || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Fluid Volume (gal):</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.fluidVolume} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, fluidVolume: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.fluidVolume || '-'}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Voltages and Winding Connections */}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 print:table-fixed print:w-full">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[9px] print:break-words print:whitespace-normal" colSpan={2}>Voltages (V)</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[9px] print:break-words print:whitespace-normal">Winding Connections</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[9px] print:break-words print:whitespace-normal">Winding Material</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">Primary</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden flex gap-2">
                        <input className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.primaryVoltage1} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, primaryVoltage1: e.target.value } }))} readOnly={!isEditing} placeholder="480" />
                        <span>/</span>
                        <input className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.primaryVoltage2} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, primaryVoltage2: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.primaryVoltage1 || '-'} / {formData.nameplate.primaryVoltage2 || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden">
                        <select value={formData.nameplate.primaryWindingConnection} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, primaryWindingConnection: e.target.value } }))} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                          {WINDING_CONNECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">{formData.nameplate.primaryWindingConnection || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden">
                        <select value={formData.nameplate.primaryWindingMaterial} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, primaryWindingMaterial: e.target.value } }))} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                          {WINDING_MATERIALS.map(m => <option key={m} value={m}>{m || 'Select...'}</option>)}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">{formData.nameplate.primaryWindingMaterial || '-'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">Secondary</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden flex gap-2">
                        <input className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.secondaryVoltage1} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, secondaryVoltage1: e.target.value } }))} readOnly={!isEditing} placeholder="208" />
                        <span>/</span>
                        <input className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.nameplate.secondaryVoltage2} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, secondaryVoltage2: e.target.value } }))} readOnly={!isEditing} placeholder="120" />
                      </div>
                      <div className="hidden print:block text-sm">{formData.nameplate.secondaryVoltage1 || '-'} / {formData.nameplate.secondaryVoltage2 || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden">
                        <select value={formData.nameplate.secondaryWindingConnection} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, secondaryWindingConnection: e.target.value } }))} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                          {WINDING_CONNECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">{formData.nameplate.secondaryWindingConnection || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden">
                        <select value={formData.nameplate.secondaryWindingMaterial} onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, secondaryWindingMaterial: e.target.value } }))} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                          {WINDING_MATERIALS.map(m => <option key={m} value={m}>{m || 'Select...'}</option>)}
                        </select>
                      </div>
                      <div className="hidden print:block text-sm text-center">{formData.nameplate.secondaryWindingMaterial || '-'}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tap Position / Voltages */}
            <div className="mt-4">
              <table className="w-full table-fixed border-collapse border border-gray-200 dark:border-gray-700">
                <colgroup>
                  <col style={{ width: '15%' }} />
                  {TAP_POSITIONS.map(pos => <col key={pos} style={{ width: `${85/7}%` }} />)}
                </colgroup>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">Tap Position</td>
                    {TAP_POSITIONS.map(pos => (
                      <td key={pos} className="px-3 py-2 text-center text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 font-medium">{pos}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">Tap Voltages</td>
                    {TAP_POSITIONS.map((pos) => {
                      const key = `tapVoltage${pos}` as keyof typeof formData.nameplate;
                      return (
                        <td key={pos} className="px-2 py-2 text-center border border-gray-200 dark:border-gray-700">
                          <div className="print:hidden">
                            <input 
                              className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} 
                              value={(formData.nameplate[key] as string) || ''} 
                              onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, [key]: e.target.value } }))} 
                              readOnly={!isEditing} 
                            />
                          </div>
                          <div className="hidden print:block text-sm">{(formData.nameplate[key] as string) || '-'}</div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tap Position Left */}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position Left:</span>
              <input 
                className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} 
                value={formData.nameplate.tapPositionLeft} 
                onChange={e => setFormData(p => ({ ...p, nameplate: { ...p.nameplate, tapPositionLeft: e.target.value } }))} 
                readOnly={!isEditing} 
              />
            </div>
          </div>

          {/* Indicator Gauge Values */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Indicator Gauge Values</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-200 dark:border-gray-700">
                <colgroup>
                  <col style={{ width: '16.66%' }} />
                  <col style={{ width: '16.66%' }} />
                  <col style={{ width: '16.66%' }} />
                  <col style={{ width: '16.66%' }} />
                  <col style={{ width: '16.66%' }} />
                  <col style={{ width: '16.70%' }} />
                </colgroup>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Oil Level:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.indicatorGaugeValues.oilLevel} onChange={e => setFormData(p => ({ ...p, indicatorGaugeValues: { ...p.indicatorGaugeValues, oilLevel: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.indicatorGaugeValues.oilLevel || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Oil Temperature (°C):</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.indicatorGaugeValues.oilTemperature} onChange={e => setFormData(p => ({ ...p, indicatorGaugeValues: { ...p.indicatorGaugeValues, oilTemperature: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.indicatorGaugeValues.oilTemperature || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Oil Temp. Range:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.indicatorGaugeValues.oilTempRange} onChange={e => setFormData(p => ({ ...p, indicatorGaugeValues: { ...p.indicatorGaugeValues, oilTempRange: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.indicatorGaugeValues.oilTempRange || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Tank Pressure:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.indicatorGaugeValues.tankPressure} onChange={e => setFormData(p => ({ ...p, indicatorGaugeValues: { ...p.indicatorGaugeValues, tankPressure: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.indicatorGaugeValues.tankPressure || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Winding Temperature (°C):</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.indicatorGaugeValues.windingTemperature} onChange={e => setFormData(p => ({ ...p, indicatorGaugeValues: { ...p.indicatorGaugeValues, windingTemperature: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.indicatorGaugeValues.windingTemperature || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Winding Temp. Range:</div>
                      <div className="print:hidden">
                        <input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.indicatorGaugeValues.windingTempRange} onChange={e => setFormData(p => ({ ...p, indicatorGaugeValues: { ...p.indicatorGaugeValues, windingTempRange: e.target.value } }))} readOnly={!isEditing} />
                      </div>
                      <div className="hidden print:block text-sm">{formData.indicatorGaugeValues.windingTempRange || '-'}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual and Mechanical Inspection */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed visual-mechanical-table">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '68%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">NETA Section</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider"></th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Results</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.visualInspectionItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{item.id}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white" style={{ whiteSpace: 'normal', wordWrap: 'break-word', overflowWrap: 'break-word' }}>{item.description}</td>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select value={item.result} onChange={e => { const list = [...formData.visualInspectionItems]; list[idx].result = e.target.value; setFormData(p => ({ ...p, visualInspectionItems: list })); }} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                            {VISUAL_INSPECTION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">{item.result}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual & Mechanical Inspection Comments */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual & Mechanical Inspection Comments:</h2>
            <textarea value={formData.visualMechanicalComments || ''} onChange={e => setFormData(p => ({ ...p, visualMechanicalComments: e.target.value }))} rows={4} readOnly={!isEditing} className={`form-textarea w-full resize-none ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''} print:hidden`} />
            <div className="hidden print:block"><table className="w-full table-fixed border-collapse border border-gray-300 print:border-black"><tbody><tr><td className="p-2 align-top border border-gray-300 print:border-black"><div className="mt-0">{formData.visualMechanicalComments || ''}</div></td></tr></tbody></table></div>
          </div>

          {/* Electrical - Insulation Resistance Tests */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical - Insulation Resistance Tests</h2>
            <div className="flex flex-wrap justify-end items-center mb-4 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">TCF</span>
                <span className="font-semibold">{formData.temperature.tcf.toFixed(3)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 table-fixed w-full">
                <colgroup>
                  <col style={{ width: '10%' }} /> {/* Winding Under Test */}
                  <col style={{ width: '7%' }} /> {/* Test Voltage */}
                  <col style={{ width: '10%' }} /> {/* 0.5 Min Measured */}
                  <col style={{ width: '10%' }} /> {/* 1 Min Measured */}
                  <col style={{ width: '10%' }} /> {/* 10 Min Measured */}
                  <col style={{ width: '9%' }} /> {/* Units */}
                  <col style={{ width: '11%' }} /> {/* 0.5 Min Corrected */}
                  <col style={{ width: '11%' }} /> {/* 1 Min Corrected */}
                  <col style={{ width: '11%' }} /> {/* 10 Min Corrected */}
                  <col style={{ width: '9%' }} /> {/* Units */}
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]" rowSpan={2}>
                      <span className="print:hidden">Winding Under Test</span>
                      <span className="hidden print:inline">Winding<br/>Under<br/>Test</span>
                    </th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]" rowSpan={2}>
                      <span className="print:hidden">Test Voltage</span>
                      <span className="hidden print:inline">Test<br/>Voltage</span>
                    </th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]" colSpan={4}>Insulation Resistance Values</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]" colSpan={4}>Temperature Corrected Values</th>
                  </tr>
                  <tr>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">0.5 Min.</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">1 Min.</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">10 Min.</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">Units</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">0.5 Min.</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">1 Min.</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">10 Min.</th>
                    <th className="px-1 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white border border-gray-200 dark:border-gray-700">Units</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.insulationRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-1 py-2 text-xs text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700" style={{ whiteSpace: 'normal', wordWrap: 'break-word' }}>{row.windingUnderTest}</td>
                      <td className="px-1 py-2 border border-gray-200 dark:border-gray-700 align-middle">
                        <div className="print:hidden">
                          <select
                            value={row.testVoltage}
                            onChange={e => { const rows = [...formData.insulationRows]; rows[idx].testVoltage = e.target.value; setFormData(p => ({ ...p, insulationRows: rows })); }}
                            disabled={!isEditing}
                            className={`form-select w-20 max-w-full text-sm font-medium text-gray-900 dark:text-white py-1 px-1.5 rounded border-gray-300 dark:border-gray-600 focus:ring-[#f26722] focus:border-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : 'bg-white dark:bg-dark-150'}`}
                          >
                            {INSULATION_RESISTANCE_TEST_VOLTAGES.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div className="hidden print:block text-center text-sm text-gray-900 dark:text-white font-medium">{row.testVoltage}</div>
                      </td>
                      <td className="px-1 py-2 border border-gray-200 dark:border-gray-700">
                        <input value={row.measured05Min} onChange={e => { const rows = [...formData.insulationRows]; rows[idx].measured05Min = e.target.value; setFormData(p => ({ ...p, insulationRows: rows })); }} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                      </td>
                      <td className="px-1 py-2 border border-gray-200 dark:border-gray-700">
                        <input value={row.measured1Min} onChange={e => { const rows = [...formData.insulationRows]; rows[idx].measured1Min = e.target.value; setFormData(p => ({ ...p, insulationRows: rows })); }} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                      </td>
                      <td className="px-1 py-2 border border-gray-200 dark:border-gray-700">
                        <input value={row.measured10Min} onChange={e => { const rows = [...formData.insulationRows]; rows[idx].measured10Min = e.target.value; setFormData(p => ({ ...p, insulationRows: rows })); }} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
                      </td>
                      <td className="px-2 py-2 border border-gray-200 dark:border-gray-700 align-middle">
                        <select value={formData.insulationUnit} onChange={e => setFormData(p => ({ ...p, insulationUnit: e.target.value }))} disabled={!isEditing} className={`form-select w-full text-sm font-medium text-gray-900 dark:text-white py-1.5 px-2 rounded border-gray-300 dark:border-gray-600 focus:ring-[#f26722] focus:border-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : 'bg-white dark:bg-dark-150'}`}>
                          {INSULATION_RESISTANCE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-2 text-center text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{row.corrected05Min || ''}</td>
                      <td className="px-1 py-2 text-center text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{row.corrected1Min || ''}</td>
                      <td className="px-1 py-2 text-center text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{row.corrected10Min || ''}</td>
                      <td className="px-1 py-2 text-center text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{formData.insulationUnit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dielectric Absorption / Polarization Index */}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 table-fixed w-full">
                <colgroup>
                  <col style={{ width: '18%' }} /> {/* Dielectric Absorption / Polarization Index */}
                  <col style={{ width: '30%' }} /> {/* Ratio description */}
                  <col style={{ width: '13%' }} /> {/* Primary */}
                  <col style={{ width: '13%' }} /> {/* Secondary */}
                  <col style={{ width: '13%' }} /> {/* Primary to Secondary */}
                  <col style={{ width: '13%' }} /> {/* Acceptable */}
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]"></th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]"></th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]">Primary</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]">Secondary</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]">Primary to Secondary</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 print:text-[7px]">Acceptable</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">Dielectric Absorption</td>
                    <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">: (Ratio of 1 Minute to 0.5 Minute Result)</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-200 dark:border-gray-700">{formData.dielectricAbsorption.primary || ''}</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-200 dark:border-gray-700">{formData.dielectricAbsorption.secondary || ''}</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-200 dark:border-gray-700">{formData.dielectricAbsorption.priToSec || ''}</td>
                    <td className={`px-2 py-2 text-center text-sm font-semibold border border-gray-200 dark:border-gray-700 ${formData.dielectricAbsorption.acceptable === 'Pass' ? 'text-green-600 bg-green-100 dark:bg-green-900 print:bg-green-100' : formData.dielectricAbsorption.acceptable === 'Fail' ? 'text-red-600 bg-red-100 dark:bg-red-900 print:bg-red-100' : ''}`}>
                      {formData.dielectricAbsorption.acceptable || ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">Polarization Index</td>
                    <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">: (Ratio of 10 Minute to 1 Minute Result)</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-200 dark:border-gray-700">{formData.polarizationIndex.primary || ''}</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-200 dark:border-gray-700">{formData.polarizationIndex.secondary || ''}</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-200 dark:border-gray-700">{formData.polarizationIndex.priToSec || ''}</td>
                    <td className={`px-2 py-2 text-center text-sm font-semibold border border-gray-200 dark:border-gray-700 ${formData.polarizationIndex.acceptable === 'Pass' ? 'text-green-600 bg-green-100 dark:bg-green-900 print:bg-green-100' : formData.polarizationIndex.acceptable === 'Fail' ? 'text-red-600 bg-red-100 dark:bg-red-900 print:bg-red-100' : ''}`}>
                      {formData.polarizationIndex.acceptable || ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Equipment Used */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700 w-32"></th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700">Name:</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700">Serial Number:</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700">AMP ID:</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-200 dark:border-gray-700">Cal Date:</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700">Megohmmeter:</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden">
                        <EquipmentAutocomplete
                          value={formData.testEquipment.megohmmeter.name}
                          onChange={value => setFormData(p => ({ ...p, testEquipment: { ...p.testEquipment, megohmmeter: { ...p.testEquipment.megohmmeter, name: value } } }))}
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
                                  calDate: formatLocalDateShort(equipment.calibration_date)
                                }
                              }
                            }));
                          }}
                          readOnly={!isEditing}
                          className="w-full"
                        />
                      </div>
                      <div className="hidden print:block text-center text-sm">{formData.testEquipment.megohmmeter.name || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden"><input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.testEquipment.megohmmeter.serialNumber} onChange={e => setFormData(p => ({ ...p, testEquipment: { ...p.testEquipment, megohmmeter: { ...p.testEquipment.megohmmeter, serialNumber: e.target.value } } }))} readOnly={!isEditing} /></div>
                      <div className="hidden print:block text-center text-sm">{formData.testEquipment.megohmmeter.serialNumber || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden"><input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.testEquipment.megohmmeter.ampId} onChange={e => setFormData(p => ({ ...p, testEquipment: { ...p.testEquipment, megohmmeter: { ...p.testEquipment.megohmmeter, ampId: e.target.value } } }))} readOnly={!isEditing} /></div>
                      <div className="hidden print:block text-center text-sm">{formData.testEquipment.megohmmeter.ampId || '-'}</div>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <div className="print:hidden"><input className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.testEquipment.megohmmeter.calDate} onChange={e => setFormData(p => ({ ...p, testEquipment: { ...p.testEquipment, megohmmeter: { ...p.testEquipment.megohmmeter, calDate: e.target.value } } }))} readOnly={!isEditing} /></div>
                      <div className="hidden print:block text-center text-sm">{formData.testEquipment.megohmmeter.calDate || '-'}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Comments */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments:</h2>
            <textarea value={formData.comments} onChange={e => setFormData(p => ({ ...p, comments: e.target.value }))} rows={4} readOnly={!isEditing} className={`form-textarea w-full resize-none ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''} print:hidden`} />
            <div className="hidden print:block"><table className="w-full table-fixed border-collapse border border-gray-300 print:border-black"><tbody><tr><td className="p-2 align-top border border-gray-300 print:border-black"><div className="mt-0">{formData.comments || ''}</div></td></tr></tbody></table></div>
          </div>
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

export default LiquidFilledXfmrATS25Report;

