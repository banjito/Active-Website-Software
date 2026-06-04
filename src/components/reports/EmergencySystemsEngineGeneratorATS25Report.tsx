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
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getPassFailBadgeClass } from '@/lib/reportPassFailStatus';

// Temperature correction factor lookup (same as other reports e.g. LV Circuit Breaker ATS 25)
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

// Temperature corrected = measured × TCF (same as other reports)
const calculateInsulationCorrectedValue = (measured: string, tcf: number): string => {
  if (!measured || measured.trim() === '') return '';
  const hasLessThan = measured.trim().startsWith('<');
  const hasGreaterThan = measured.trim().startsWith('>');
  const symbol = hasLessThan ? '<' : hasGreaterThan ? '>' : '';
  const numericStr = measured.trim().replace(/^[<>]/, '');
  const value = parseFloat(numericStr);
  if (isNaN(value) || value === 0) return measured.trim();
  const corrected = value * tcf;
  const correctedStr = corrected.toFixed(3);
  return symbol ? `${symbol}${correctedStr}` : correctedStr;
};

// Ratio for Dielectric Absorption / Polarization Index: IF(OR(num="",denom=""), "", num/denom)
const calculateRatio = (numStr: string, denomStr: string): string => {
  if (!numStr?.trim() || !denomStr?.trim()) return '';
  const num = parseFloat(numStr.trim().replace(/^[<>]/, ''));
  const denom = parseFloat(denomStr.trim().replace(/^[<>]/, ''));
  if (isNaN(num) || isNaN(denom) || denom === 0) return '';
  return (num / denom).toFixed(3);
};

const visualInspectionResultsOptions = ['Satisfactory', 'Unsatisfactory', 'Cleaned', 'See Comments', 'Not Applicable', 'By Others'];
const insulationTypeOptions = ['Thermosetting', 'Thermoplastic', 'Other'];
const testMethodOptions = ['Single test from all phases to ground', 'Each phase to ground with other phases grounded', 'Other'];
const insulationResistanceUnitsOptions = ['kΩ', 'MΩ', 'GΩ'];
const insulationTestVoltageOptions = ['500VDC', '1000VDC', '2500VDC', '5000VDC', '10000VDC'];
const equipmentEvaluationResultOptions = ['PASS', 'FAIL', 'LIMITED SERVICE'];
const connectionsOptions = ['Delta', 'Wye', 'Single Phase'];

const VISUAL_INSPECTION_ITEMS = [
  { id: '7.22.1.A.1', description: 'Compare equipment nameplate data with drawings.', result: '' },
  { id: '7.22.1.A.2', description: 'Inspect physical and mechanical condition.', result: '' },
  { id: '7.22.1.A.3', description: 'Inspect anchorage, alignment, and grounding.', result: '' },
  { id: '7.22.1.A.4', description: 'Verify the unit is clean.', result: '' },
];

const WINDING_ROWS = [
  { key: 'aPhaseToGround', label: 'A-Phase to Ground, B- & C-phases Grounded' },
  { key: 'bPhaseToGround', label: 'B-Phase to Ground, A- & C-phases Grounded' },
  { key: 'cPhaseToGround', label: 'C-Phase to Ground, A- & B-phases Grounded' },
  { key: 'phasesToGround', label: 'A-, B-, & C-Phase (shorted) to Ground' },
];

interface WindingRow {
  testVoltage: string;
  measured30Sec: string;
  measured1Min: string;
  measured10Min: string;
  corrected30Sec: string;
  corrected1Min: string;
  corrected10Min: string;
  units: string;
}

interface FormData {
  customer: string;
  address: string;
  user: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  temperature: { fahrenheit: number; celsius: number; tcf: number; humidity: number };
  substation: string;
  eqptLocation: string;

  manufacturer: string;
  catalogModelNo: string;
  serialNumber: string;
  yearMfd: string;
  ratedKva: string;
  powerFactor: string;
  ratedKw: string;
  hp: string;
  voltages1: string;
  voltages2: string;
  currentRating: string;
  frequency: string;
  connections: string;

  visualInspectionItems: { id: string; description: string; result: string }[];

  insulationResistance: {
    insulationType: string;
    testMethod: string;
    insulationTempC: string;
    tcfTo40C: string;
    windings: Record<string, WindingRow>;
    dielectricAbsorption: { aPhase: string; bPhase: string; cPhase: string; phasesTo: string; result: string };
    polarizationIndex: { aPhase: string; bPhase: string; cPhase: string; phasesTo: string; result: string };
    complianceResult: string;
  };

  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string; calibrationDate: string };
  };

  comments: string;
  status: string;
}

const defaultWindingRow = (): WindingRow => ({
  testVoltage: '',
  measured30Sec: '',
  measured1Min: '',
  measured10Min: '',
  corrected30Sec: '',
  corrected1Min: '',
  corrected10Min: '',
  units: 'MΩ',
});

const normalizeAddress = (address: any): string => {
  if (typeof address === 'string') return address;
  if (typeof address === 'object' && address !== null) {
    const parts: string[] = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip) parts.push(address.zip);
    return parts.join(', ');
  }
  return '';
};

const defaultFormData: FormData = {
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
  catalogModelNo: '',
  serialNumber: '',
  yearMfd: '',
  ratedKva: '',
  powerFactor: '',
  ratedKw: '',
  hp: '',
  voltages1: '',
  voltages2: '',
  currentRating: '',
  frequency: '',
  connections: '',
  visualInspectionItems: VISUAL_INSPECTION_ITEMS.map(({ id, description }) => ({ id, description, result: '' })),
  insulationResistance: {
    insulationType: '',
    testMethod: 'Single test from all phases to ground',
    insulationTempC: '',
    tcfTo40C: '',
    windings: Object.fromEntries(WINDING_ROWS.map(r => [r.key, defaultWindingRow()])),
    dielectricAbsorption: { aPhase: '', bPhase: '', cPhase: '', phasesTo: '', result: '' },
    polarizationIndex: { aPhase: '', bPhase: '', cPhase: '', phasesTo: '', result: '' },
    complianceResult: '',
  },
  testEquipment: {
    megohmmeter: { name: '', serialNumber: '', ampId: '', calibrationDate: '' },
  },
  comments: '',
  status: 'PASS',
};

const EmergencySystemsEngineGeneratorATS25Report: React.FC = () => {
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
  // Mutex shared between autoSave and handleSave so they cannot both insert
  // concurrently. Without this, a manual Save click during the 2-second
  // autoSave debounce window can create a duplicate report row + orphaned
  // asset (no job_assets link), which is what made "save to a job" appear
  // to do nothing — the report saved but the job link was missing.
  const savingInFlightRef = React.useRef(false);

  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';

  const reportSlug = 'emergency-systems-engine-generator-ats25';
  const reportName = getReportName(reportSlug);

  const [pastSubstations, setPastSubstations] = useState<string[]>([]);
  const [pastIdentifiers, setPastIdentifiers] = useState<string[]>([]);

  useEffect(() => {
    setCurrentReportId(initialReportId);
    setIsEditing(!initialReportId);
    isAutoSaveCreatedRef.current = false;
    if (initialReportId) setLoading(true);
  }, [initialReportId]);

  React.useEffect(() => {
    try {
      const substations = JSON.parse(localStorage.getItem('emergency-engine-substations') || '[]');
      const identifiers = JSON.parse(localStorage.getItem('emergency-engine-identifiers') || '[]');
      setPastSubstations(substations);
      setPastIdentifiers(identifiers);
    } catch (err) {
      console.error('Error loading past values:', err);
    }
  }, []);

  const saveToRemember = React.useCallback((key: string, value: string, setter: (vals: string[]) => void) => {
    if (!value || value.trim() === '') return;
    try {
      const storageKey = `emergency-engine-${key}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[];
      const trimmed = value.trim();
      const updated = [trimmed, ...existing.filter(v => v !== trimmed)].slice(0, 20);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setter(updated);
    } catch (err) {
      console.error('Error saving to remember:', err);
    }
  }, []);

  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);

  const loadJobInfo = async () => {
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
        let customerAddress = (jobData as any).site_address || '';
        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();
          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || '';
            if (!customerAddress) customerAddress = customerData.address || '';
          }
        }
        setFormData(prev => ({
          ...prev,
          customer: maskCustomerName(customerName),
          address: maskCustomerAddress(normalizeAddress(customerAddress)),
          jobNumber: jobData.job_number || '',
        }));
      }
    } catch (err) {
      console.error('Error loading job info:', err);
    }
  };

  const loadReport = async () => {
    if (!currentReportId) {
      setLoading(false);
      return;
    }
    if (isAutoSaveCreatedRef.current) {
      setLoading(false);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .schema('neta_ops')
        .from('emergency_systems_engine_generator_ats25')
        .select('*')
        .eq('id', currentReportId)
        .single();
      if (fetchError) throw fetchError;
      if (data?.report_data) {
        const rd = data.report_data as any;
        const windings = rd.insulationResistance?.windings || defaultFormData.insulationResistance.windings;
        // Backward compat: old reports had single "voltages"; now we have voltages1 and voltages2
        const voltages1 = rd.voltages1 ?? (rd.voltages != null ? rd.voltages : '');
        const voltages2 = rd.voltages2 ?? '';
        setFormData(prev => ({
          ...prev,
          ...rd,
          voltages1,
          voltages2,
          address: normalizeAddress(rd.address ?? prev.address),
          visualInspectionItems: rd.visualInspectionItems || prev.visualInspectionItems,
          insulationResistance: {
            ...prev.insulationResistance,
            ...rd.insulationResistance,
            windings: { ...prev.insulationResistance.windings, ...windings },
          },
          testEquipment: rd.testEquipment ? { ...prev.testEquipment, ...rd.testEquipment } : prev.testEquipment,
        }));
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Error loading report:', err);
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, currentReportId]);

  const autoSave = React.useCallback(async () => {
    if (!jobId || !isEditing) return;
    // Skip if a save (manual or auto) is already running.
    if (savingInFlightRef.current) return;
    savingInFlightRef.current = true;
    setIsAutoSaving(true);
    try {
      const dataToSave = {
        job_id: jobId,
        user_id: user?.id,
        report_data: formData,
        updated_at: new Date().toISOString(),
      };
      if (reportIdRef.current) {
        const { error: updateError } = await supabase
          .schema('neta_ops')
          .from('emergency_systems_engine_generator_ats25')
          .update(dataToSave)
          .eq('id', reportIdRef.current);
        if (updateError) throw updateError;
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const assetName = getAssetName(reportSlug, formData.identifier);
          const { data: newReport, error: insertError } = await supabase
            .schema('neta_ops')
            .from('emergency_systems_engine_generator_ats25')
            .insert({ ...dataToSave, created_at: new Date().toISOString() })
            .select()
            .single();
          if (insertError) {
            creatingRef.current = false;
            throw insertError;
          }
          if (newReport) {
            reportIdRef.current = newReport.id;
            isAutoSaveCreatedRef.current = true;
            setCurrentReportId(newReport.id);
            const { data: assetResult, error: assetErr } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert({
                name: assetName,
                file_url: `report:/jobs/${jobId}/${reportSlug}/${newReport.id}`,
                template_type: 'ATS',
                status: 'in_progress',
              })
              .select()
              .single();
            if (assetErr) {
              console.error('Auto-save asset insert failed:', assetErr);
            } else if (assetResult) {
              const { error: linkErr } = await supabase
                .schema('neta_ops')
                .from('job_assets')
                .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user?.id });
              if (linkErr) {
                console.error('Auto-save job_assets link failed:', linkErr);
              }
            }
            window.history.replaceState(null, '', `/jobs/${jobId}/${reportSlug}/${newReport.id}`);
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (err) {
      console.error('Auto-save error:', err);
    } finally {
      savingInFlightRef.current = false;
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [formData, jobId, isEditing, user]);

  useEffect(() => {
    if (isEditing && jobId) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => autoSave(), 2000);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData, isEditing, jobId, currentReportId, user, autoSave]);

  const handleSave = async () => {
    if (!jobId) {
      alert('Cannot save: missing job ID');
      return;
    }

    // Cancel any pending autoSave timer so it can't fire mid-save and create
    // a duplicate row.
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Wait briefly if an autoSave is already in flight; up to ~5 seconds.
    let waited = 0;
    while (savingInFlightRef.current && waited < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waited += 100;
    }
    if (savingInFlightRef.current) {
      alert('A save is already in progress, please wait a moment and try again.');
      return;
    }

    savingInFlightRef.current = true;
    try {
      const assetName = getAssetName(reportSlug, formData.identifier);
      const dataToSave = {
        job_id: jobId,
        user_id: user?.id,
        report_data: formData,
        updated_at: new Date().toISOString(),
      };
      if (currentReportId) {
        const { error: updateErr } = await supabase
          .schema('neta_ops')
          .from('emergency_systems_engine_generator_ats25')
          .update(dataToSave)
          .eq('id', currentReportId);
        if (updateErr) throw updateErr;
        const { error: assetUpdErr } = await supabase
          .schema('neta_ops')
          .from('assets')
          .update({ name: assetName })
          .ilike('file_url', `%${reportSlug}/${currentReportId}%`);
        if (assetUpdErr) console.warn('Asset name update failed:', assetUpdErr);
      } else {
        const { data: newReport, error: insertError } = await supabase
          .schema('neta_ops')
          .from('emergency_systems_engine_generator_ats25')
          .insert({ ...dataToSave, created_at: new Date().toISOString() })
          .select()
          .single();
        if (insertError) throw insertError;
        if (!newReport) throw new Error('Report insert returned no data');

        setCurrentReportId(newReport.id);
        isAutoSaveCreatedRef.current = true;

        const { data: assetResult, error: assetInsertErr } = await supabase
          .schema('neta_ops')
          .from('assets')
          .insert({
            name: assetName,
            file_url: `report:/jobs/${jobId}/${reportSlug}/${newReport.id}`,
            template_type: 'ATS',
            status: 'in_progress',
          })
          .select()
          .single();
        if (assetInsertErr) throw assetInsertErr;
        if (!assetResult) throw new Error('Asset insert returned no data');

        const { error: linkErr } = await supabase
          .schema('neta_ops')
          .from('job_assets')
          .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user?.id });
        if (linkErr) throw linkErr;
      }
      setIsEditing(false);
      navigateAfterSave(navigate, jobId, location);
    } catch (err: any) {
      console.error('Save error:', err);
      const msg = err?.message || JSON.stringify(err) || 'Unknown error';
      setError(`Failed to save report: ${msg}`);
      alert(`Save failed: ${msg}`);
    } finally {
      savingInFlightRef.current = false;
    }
  };

  const handleChange = (path: string, value: any) => {
    setFormData(prev => {
      const keys = path.split('.');
      const newData = JSON.parse(JSON.stringify(prev));
      let current: any = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const nextKey = keys[i + 1];
        if (Array.isArray(current[key])) {
          const index = parseInt(nextKey, 10);
          if (!isNaN(index)) {
            current[key] = [...current[key]];
            current = current[key];
            continue;
          }
        }
        current[key] = { ...current[key] };
        current = current[key];
      }
      current[keys[keys.length - 1]] = value;
      return newData;
    });
  };

  const handleFahrenheitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || v === '-') {
      setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit: 0, celsius: 0, tcf: 1 } }));
      return;
    }
    const val = parseFloat(v);
    if (isNaN(val)) return;
    const celsius = Math.round((val - 32) * 5 / 9 * 10) / 10;
    const tcf = getTCF(celsius);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit: val, celsius, tcf } }));
  };

  const handleCelsiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || v === '-') {
      setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, celsius: 0, fahrenheit: 32, tcf: 1 } }));
      return;
    }
    const val = parseFloat(v);
    if (isNaN(val)) return;
    const fahrenheit = Math.round((val * 9 / 5 + 32) * 10) / 10;
    const tcf = getTCF(val);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, celsius: val, fahrenheit, tcf } }));
  };

  // Update TCF when insulation temp changes
  useEffect(() => {
    const tempC = parseFloat(formData.insulationResistance.insulationTempC);
    if (!isNaN(tempC)) {
      const tcf = getTCF(tempC);
      if (String(tcf) !== formData.insulationResistance.tcfTo40C) {
        handleChange('insulationResistance.tcfTo40C', String(tcf));
      }
    }
  }, [formData.insulationResistance.insulationTempC]);

  // Auto-calculate temperature corrected values: corrected = measured × TCF
  useEffect(() => {
    const tcfNum = parseFloat(formData.insulationResistance.tcfTo40C);
    if (isNaN(tcfNum) || tcfNum <= 0) return;
    const windings = formData.insulationResistance.windings;
    let hasChanges = false;
    const nextWindings: Record<string, WindingRow> = {};
    WINDING_ROWS.forEach(({ key }) => {
      const w = windings[key];
      if (!w) return;
      const corrected30Sec = calculateInsulationCorrectedValue(w.measured30Sec, tcfNum);
      const corrected1Min = calculateInsulationCorrectedValue(w.measured1Min, tcfNum);
      const corrected10Min = calculateInsulationCorrectedValue(w.measured10Min, tcfNum);
      if (corrected30Sec !== w.corrected30Sec || corrected1Min !== w.corrected1Min || corrected10Min !== w.corrected10Min) {
        hasChanges = true;
      }
      nextWindings[key] = {
        ...w,
        corrected30Sec,
        corrected1Min,
        corrected10Min,
      };
    });
    if (hasChanges) {
      setFormData(prev => ({
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          windings: { ...prev.insulationResistance.windings, ...nextWindings },
        },
      }));
    }
  }, [
    formData.insulationResistance.tcfTo40C,
    ...WINDING_ROWS.flatMap(({ key }) => [
      formData.insulationResistance.windings[key]?.measured30Sec,
      formData.insulationResistance.windings[key]?.measured1Min,
      formData.insulationResistance.windings[key]?.measured10Min,
    ]),
  ]);

  // Auto-calculate Dielectric Absorption (1 Min / 30 Sec) and Polarization Index (10 Min / 1 Min) from corrected values
  useEffect(() => {
    const windings = formData.insulationResistance.windings;
    const da = {
      aPhase: calculateRatio(windings.aPhaseToGround?.corrected1Min ?? '', windings.aPhaseToGround?.corrected30Sec ?? ''),
      bPhase: calculateRatio(windings.bPhaseToGround?.corrected1Min ?? '', windings.bPhaseToGround?.corrected30Sec ?? ''),
      cPhase: calculateRatio(windings.cPhaseToGround?.corrected1Min ?? '', windings.cPhaseToGround?.corrected30Sec ?? ''),
      phasesTo: calculateRatio(windings.phasesToGround?.corrected1Min ?? '', windings.phasesToGround?.corrected30Sec ?? ''),
    };
    const pi = {
      aPhase: calculateRatio(windings.aPhaseToGround?.corrected10Min ?? '', windings.aPhaseToGround?.corrected1Min ?? ''),
      bPhase: calculateRatio(windings.bPhaseToGround?.corrected10Min ?? '', windings.bPhaseToGround?.corrected1Min ?? ''),
      cPhase: calculateRatio(windings.cPhaseToGround?.corrected10Min ?? '', windings.cPhaseToGround?.corrected1Min ?? ''),
      phasesTo: calculateRatio(windings.phasesToGround?.corrected10Min ?? '', windings.phasesToGround?.corrected1Min ?? ''),
    };
    const prevDA = formData.insulationResistance.dielectricAbsorption;
    const prevPI = formData.insulationResistance.polarizationIndex;
    const daChanged = da.aPhase !== prevDA.aPhase || da.bPhase !== prevDA.bPhase || da.cPhase !== prevDA.cPhase || da.phasesTo !== prevDA.phasesTo;
    const piChanged = pi.aPhase !== prevPI.aPhase || pi.bPhase !== prevPI.bPhase || pi.cPhase !== prevPI.cPhase || pi.phasesTo !== prevPI.phasesTo;
    if (daChanged || piChanged) {
      setFormData(prev => ({
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          dielectricAbsorption: daChanged ? { ...prev.insulationResistance.dielectricAbsorption, ...da } : prev.insulationResistance.dielectricAbsorption,
          polarizationIndex: piChanged ? { ...prev.insulationResistance.polarizationIndex, ...pi } : prev.insulationResistance.polarizationIndex,
        },
      }));
    }
  }, [
    formData.insulationResistance.windings.aPhaseToGround?.corrected30Sec,
    formData.insulationResistance.windings.aPhaseToGround?.corrected1Min,
    formData.insulationResistance.windings.aPhaseToGround?.corrected10Min,
    formData.insulationResistance.windings.bPhaseToGround?.corrected30Sec,
    formData.insulationResistance.windings.bPhaseToGround?.corrected1Min,
    formData.insulationResistance.windings.bPhaseToGround?.corrected10Min,
    formData.insulationResistance.windings.cPhaseToGround?.corrected30Sec,
    formData.insulationResistance.windings.cPhaseToGround?.corrected1Min,
    formData.insulationResistance.windings.cPhaseToGround?.corrected10Min,
    formData.insulationResistance.windings.phasesToGround?.corrected30Sec,
    formData.insulationResistance.windings.phasesToGround?.corrected1Min,
    formData.insulationResistance.windings.phasesToGround?.corrected10Min,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg"><LoadingSpinner size="md" /></div>
      </div>
    );
  }

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print/PDF: narrow Test Voltage and Units so Measured and Temperature Corrected get more space */}
      <style>{`
        @media print {
          #report-container .emergency-engine-ir-table { table-layout: fixed !important; width: 100% !important; }
          #report-container .emergency-engine-ir-table th:nth-child(1),
          #report-container .emergency-engine-ir-table td:nth-child(1) { width: 17% !important; }
          #report-container .emergency-engine-ir-table th:nth-child(2),
          #report-container .emergency-engine-ir-table td:nth-child(2) { width: 5% !important; max-width: 5% !important; }
          #report-container .emergency-engine-ir-table th:nth-child(9),
          #report-container .emergency-engine-ir-table td:nth-child(9) { width: 2% !important; max-width: 2% !important; }
          #report-container .emergency-engine-ir-table th:nth-child(3),
          #report-container .emergency-engine-ir-table td:nth-child(3),
          #report-container .emergency-engine-ir-table th:nth-child(4),
          #report-container .emergency-engine-ir-table td:nth-child(4),
          #report-container .emergency-engine-ir-table th:nth-child(5),
          #report-container .emergency-engine-ir-table td:nth-child(5),
          #report-container .emergency-engine-ir-table th:nth-child(6),
          #report-container .emergency-engine-ir-table td:nth-child(6),
          #report-container .emergency-engine-ir-table th:nth-child(7),
          #report-container .emergency-engine-ir-table td:nth-child(7),
          #report-container .emergency-engine-ir-table th:nth-child(8),
          #report-container .emergency-engine-ir-table td:nth-child(8) { width: 12.67% !important; }
        }
      `}</style>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">Emergency Systems Engine Generator Test</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.22.1
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
                border: `2px solid ${formData.status === 'PASS' ? '#16a34a' : formData.status === 'FAIL' ? '#dc2626' : '#ca8a04'}`,
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
      {/* Orange divider below print header */}
      <div className="w-full h-1 bg-[#f26722] mb-4 hidden print:block" />

      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 mb-4">
            {error}
          </div>
        )}

        <div className="print:hidden flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">7.22.1 Emergency Systems, Engine Generator Test Sheet ATS 25</h1>
          <div className="flex gap-2 items-center">
            {isAutoSaving && <span className="text-xs text-gray-500">Saving...</span>}
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              ✓ Auto Saving Enabled
            </span>
            <button
              onClick={() => isEditing && setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : prev.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS' }))}
              disabled={!isEditing}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                formData.status === 'PASS' ? 'bg-green-600 text-white' : formData.status === 'FAIL' ? 'bg-red-600 text-white' : 'bg-yellow-500 text-black'
              } ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {formData.status}
            </button>
            {currentReportId && !isEditing ? (
              <>
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md">
                  Edit Report
                </button>
                <button onClick={() => window.print()} className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md">
                  Print Report
                </button>
              </>
            ) : (
              <button onClick={handleSave} disabled={!isEditing} className="px-4 py-2 text-sm text-white bg-orange-600 rounded-md hover:bg-orange-700">
                Save Report
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Job Information */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden">
              <div><label className="form-label">Customer:</label><input type="text" value={maskCustomerName(formData.customer)} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
              <div className="md:col-span-2"><label className="form-label">Address:</label><input type="text" value={maskCustomerAddress(formData.address)} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-150" /></div>
              <div><label className="form-label">User:</label><input type="text" value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-150 w-full" /></div>
              <div><label className="form-label">Technicians:</label><input type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Date:</label><input type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div className="flex items-center space-x-1">
                <div><label className="form-label">Temp:</label><input type="number" value={formData.temperature.fahrenheit || ''} onChange={handleFahrenheitChange} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /><span className="ml-1 text-xs">°F</span></div>
                <div><label className="form-label sr-only">°C</label><input type="number" value={formData.temperature.celsius || ''} onChange={handleCelsiusChange} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /><span className="ml-1 text-xs">°C</span></div>
              </div>
              <div><label className="form-label">Humidity %:</label><input type="number" value={formData.temperature.humidity || ''} onChange={(e) => handleChange('temperature.humidity', e.target.value === '' ? '' : Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Substation:</label><input type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} onBlur={(e) => e.target.value.trim() && saveToRemember('substations', e.target.value, setPastSubstations)} list="substation-options" readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Eqpt. Location:</label><input type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Identifier:</label><input type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} onBlur={(e) => e.target.value.trim() && saveToRemember('identifiers', e.target.value, setPastIdentifiers)} list="identifier-options" readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
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
                temperature: {
                  fahrenheit: formData.temperature.fahrenheit,
                  celsius: formData.temperature.celsius,
                  tcf: formData.temperature.tcf,
                  humidity: formData.temperature.humidity,
                },
              }}
            />
          </div>

          {/* Orange divider between Job Information and Nameplate Data */}
          <div className="w-full h-1 bg-[#f26722] mb-4" />

          {/* Nameplate Data */}
          <div className="mb-6">
            <div className="print:hidden">
              <div className="w-full h-1 bg-[#f26722] mb-4" />
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div><label className="form-label">Manufacturer:</label><input type="text" value={formData.manufacturer} onChange={(e) => handleChange('manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Cat./Model No.:</label><input type="text" value={formData.catalogModelNo} onChange={(e) => handleChange('catalogModelNo', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Serial Number:</label><input type="text" value={formData.serialNumber} onChange={(e) => handleChange('serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Year Mfd.:</label><input type="text" value={formData.yearMfd} onChange={(e) => handleChange('yearMfd', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Rated KVA:</label><input type="text" value={formData.ratedKva} onChange={(e) => handleChange('ratedKva', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Power Factor:</label><input type="text" value={formData.powerFactor} onChange={(e) => handleChange('powerFactor', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Rated kW:</label><input type="text" value={formData.ratedKw} onChange={(e) => handleChange('ratedKw', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">HP:</label><input type="text" value={formData.hp} onChange={(e) => handleChange('hp', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Voltages (V):</label><input type="text" value={formData.voltages1} onChange={(e) => handleChange('voltages1', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} placeholder="e.g. 480" /></div>
              <div><label className="form-label">Voltages (V) 2:</label><input type="text" value={formData.voltages2} onChange={(e) => handleChange('voltages2', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} placeholder="e.g. 208" /></div>
              <div><label className="form-label">Current Rating (A):</label><input type="text" value={formData.currentRating} onChange={(e) => handleChange('currentRating', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Frequency (Hz):</label><input type="text" value={formData.frequency} onChange={(e) => handleChange('frequency', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Connections:</label><select value={formData.connections} onChange={(e) => handleChange('connections', e.target.value)} disabled={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>{connectionsOptions.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}</select></div>
              </div>
            </div>
            {/* Print-only nameplate table: 4 wide, 3 down, then Connections full row */}
            <div className="hidden print:block print:mt-2">
              <h2 className="text-xl font-semibold mb-2 text-black border-b border-black pb-2 font-bold">Nameplate Data</h2>
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black text-[0.85rem]">
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Manufacturer:</div><div>{formData.manufacturer || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Cat./Model No.:</div><div>{formData.catalogModelNo || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Serial Number:</div><div>{formData.serialNumber || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Year Mfd.:</div><div>{formData.yearMfd || '-'}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Rated KVA:</div><div>{formData.ratedKva || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Power Factor:</div><div>{formData.powerFactor || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Rated kW:</div><div>{formData.ratedKw || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">HP:</div><div>{formData.hp || '-'}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Voltages (V):</div><div>{formData.voltages1 || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Voltages (V) 2:</div><div>{formData.voltages2 || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Current Rating (A):</div><div>{formData.currentRating || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div className="font-semibold">Frequency (Hz):</div><div>{formData.frequency || '-'}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black" colSpan={4}><div className="font-semibold">Connections:</div><div>{formData.connections || '-'}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual and Mechanical Inspection */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4" />
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 vm-standard visual-mechanical-table">
              <thead className="bg-gray-50 dark:bg-dark-150"><tr><th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left text-sm font-medium text-gray-900 dark:text-white">NETA Section</th><th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left text-sm font-medium text-gray-900 dark:text-white">Description</th><th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium text-gray-900 dark:text-white">Results</th></tr></thead>
              <tbody className="bg-white dark:bg-dark-150">
                {formData.visualInspectionItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-white">{item.id}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-white">{item.description}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                      <select value={item.result} onChange={(e) => handleChange(`visualInspectionItems.${idx}.result`, e.target.value)} disabled={!isEditing} className={`w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                        <option value="">-</option>
                        {visualInspectionResultsOptions.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Electrical - Insulation Resistance Tests */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4" />
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical - Insulation Resistance Tests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 print:hidden">
              <div><label className="form-label">Insulation Type:</label><select value={formData.insulationResistance.insulationType} onChange={(e) => handleChange('insulationResistance.insulationType', e.target.value)} disabled={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>{insulationTypeOptions.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}</select></div>
              <div><label className="form-label">Test method:</label><select value={formData.insulationResistance.testMethod} onChange={(e) => handleChange('insulationResistance.testMethod', e.target.value)} disabled={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>{testMethodOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label className="form-label">Insulation Temperature (°C):</label><input type="text" value={formData.insulationResistance.insulationTempC} onChange={(e) => handleChange('insulationResistance.insulationTempC', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
              <div><label className="form-label">Temperature Correction Factor to 40°C:</label><input type="text" value={formData.insulationResistance.tcfTo40C} onChange={(e) => handleChange('insulationResistance.tcfTo40C', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></div>
            </div>
            {/* Print-only: Insulation Type, Test method, Temp, TCF table */}
            <div className="hidden print:block print:mb-3">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black text-[0.85rem]">
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black w-1/4"><div className="font-semibold">Insulation Type:</div><div>{formData.insulationResistance.insulationType || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black w-1/4"><div className="font-semibold">Test method:</div><div>{formData.insulationResistance.testMethod || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black w-1/4"><div className="font-semibold">Insulation Temperature (°C):</div><div>{formData.insulationResistance.insulationTempC || '-'}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black w-1/4"><div className="font-semibold">Temperature Correction Factor to 40°C:</div><div>{formData.insulationResistance.tcfTo40C || '-'}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 electrical-tests-table emergency-engine-ir-table">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '2%' }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-150">
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-left text-xs">Winding Under Test</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-left text-xs">Test Voltage</th>
                    <th colSpan={3} className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs">Measured Values</th>
                    <th colSpan={3} className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs">Temperature Corrected</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-left text-xs">Units</th>
                  </tr>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1" />
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1" />
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">30 Sec.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">1 Min.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">10 Min.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">30 Sec.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">1 Min.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">10 Min.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-1 py-1" />
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  {WINDING_ROWS.map(({ key, label }) => {
                    const w = formData.insulationResistance.windings[key] || defaultWindingRow();
                    return (
                      <tr key={key}>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-xs">{label}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><select value={w.testVoltage} onChange={(e) => handleChange(`insulationResistance.windings.${key}.testVoltage`, e.target.value)} disabled={!isEditing} className={`w-full text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>{insulationTestVoltageOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input type="text" value={w.measured30Sec} onChange={(e) => handleChange(`insulationResistance.windings.${key}.measured30Sec`, e.target.value)} readOnly={!isEditing} className={`w-full text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input type="text" value={w.measured1Min} onChange={(e) => handleChange(`insulationResistance.windings.${key}.measured1Min`, e.target.value)} readOnly={!isEditing} className={`w-full text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input type="text" value={w.measured10Min} onChange={(e) => handleChange(`insulationResistance.windings.${key}.measured10Min`, e.target.value)} readOnly={!isEditing} className={`w-full text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} /></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input type="text" value={w.corrected30Sec} readOnly className="w-full text-xs bg-gray-100 dark:bg-dark-150" title="Calculated: measured × TCF" /></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input type="text" value={w.corrected1Min} readOnly className="w-full text-xs bg-gray-100 dark:bg-dark-150" title="Calculated: measured × TCF" /></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input type="text" value={w.corrected10Min} readOnly className="w-full text-xs bg-gray-100 dark:bg-dark-150" title="Calculated: measured × TCF" /></td>
                        <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><select value={w.units} onChange={(e) => handleChange(`insulationResistance.windings.${key}.units`, e.target.value)} disabled={!isEditing} className={`w-full text-xs ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>{insulationResistanceUnitsOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Dielectric Absorption / Polarization Index - same table as other reports (e.g. Liquid Filled Xfmr ATS 25) */}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-300 dark:border-gray-600 table-fixed w-full">
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]"></th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]"></th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]">A Phase</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]">B Phase</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]">C Phase</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]">Phases to GND.</th>
                    <th className="px-2 py-2 bg-gray-50 dark:bg-dark-150 text-center text-xs font-medium text-gray-500 dark:text-white uppercase border border-gray-300 dark:border-gray-600 print:text-[7px]">Acceptable</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150">
                  <tr>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Dielectric Absorption</td>
                    <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">(Ratio of 1 Min. to 30 Sec. Result)</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.dielectricAbsorption.aPhase} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 1 Min / 30 Sec corrected" />
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.dielectricAbsorption.bPhase} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 1 Min / 30 Sec corrected" />
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.dielectricAbsorption.cPhase} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 1 Min / 30 Sec corrected" />
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.dielectricAbsorption.phasesTo} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 1 Min / 30 Sec corrected" />
                    </td>
                    <td className={`px-2 py-2 text-center text-sm font-semibold border border-gray-300 dark:border-gray-600 ${formData.insulationResistance.dielectricAbsorption.result === 'PASS' ? 'text-green-600 bg-green-100 dark:bg-green-900 print:bg-green-100' : formData.insulationResistance.dielectricAbsorption.result === 'FAIL' ? 'text-red-600 bg-red-100 dark:bg-red-900 print:bg-red-100' : ''}`}>
                      <select value={formData.insulationResistance.dielectricAbsorption.result} onChange={(e) => handleChange('insulationResistance.dielectricAbsorption.result', e.target.value)} disabled={!isEditing} className={`w-full text-center text-sm border-0 bg-transparent ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}><option value="">-</option>{equipmentEvaluationResultOptions.map(o => <option key={o} value={o}>{o}</option>)}</select>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Polarization Index</td>
                    <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">(Ratio of 10 Min. to 1 Min. Result)</td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.polarizationIndex.aPhase} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 10 Min / 1 Min corrected" />
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.polarizationIndex.bPhase} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 10 Min / 1 Min corrected" />
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.polarizationIndex.cPhase} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 10 Min / 1 Min corrected" />
                    </td>
                    <td className="px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600">
                      <input type="text" value={formData.insulationResistance.polarizationIndex.phasesTo} readOnly className="w-full text-center text-sm border-0 bg-gray-100 dark:bg-dark-150" title="Calculated: 10 Min / 1 Min corrected" />
                    </td>
                    <td className={`px-2 py-2 text-center text-sm font-semibold border border-gray-300 dark:border-gray-600 ${formData.insulationResistance.polarizationIndex.result === 'PASS' ? 'text-green-600 bg-green-100 dark:bg-green-900 print:bg-green-100' : formData.insulationResistance.polarizationIndex.result === 'FAIL' ? 'text-red-600 bg-red-100 dark:bg-red-900 print:bg-red-100' : ''}`}>
                      <select value={formData.insulationResistance.polarizationIndex.result} onChange={(e) => handleChange('insulationResistance.polarizationIndex.result', e.target.value)} disabled={!isEditing} className={`w-full text-center text-sm border-0 bg-transparent ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}><option value="">-</option>{equipmentEvaluationResultOptions.map(o => <option key={o} value={o}>{o}</option>)}</select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 print:hidden"><label className="form-label">Compare temperature corrected values to IEEE-43 & NETA minimum insulation resistances:</label><select value={formData.insulationResistance.complianceResult} onChange={(e) => handleChange('insulationResistance.complianceResult', e.target.value)} disabled={!isEditing} className={`form-input w-48 mt-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}><option value="">-</option>{equipmentEvaluationResultOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
            {/* Print-only: Compare temp corrected values in table */}
            <div className="hidden print:block print:mt-3">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black text-[0.85rem]">
                <thead>
                  <tr>
                    <th className="p-2 text-left border border-gray-300 print:border-black font-semibold text-black">Description</th>
                    <th className="p-2 text-left border border-gray-300 print:border-black font-semibold text-black w-24">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div>Compare temperature corrected values to IEEE-43 & NETA minimum insulation resistances:</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black"><div>{formData.insulationResistance.complianceResult || '-'}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Equipment Used */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4" />
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden test-eqpt-onscreen">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">Megohmmeter:</label>
                <EquipmentAutocomplete
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={(value) => handleChange('testEquipment.megohmmeter.name', value)}
                  onSelect={(equipment) => {
                    const formatDate = (dateString: string | null): string => {
                      if (!dateString) return '';
                      try {
                        const d = new Date(dateString);
                        return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
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
                          calibrationDate: formatLocalDateShort(equipment.calibration_date),
                        }
                      }
                    }));
                  }}
                  readOnly={!isEditing}
                  className="mt-1 w-full"
                />
              </div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-white">Serial Number:</label><input type="text" value={formData.testEquipment.megohmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.megohmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : 'bg-white dark:bg-dark-150'}`} /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-white">AMP ID:</label><input type="text" value={formData.testEquipment.megohmmeter.ampId} onChange={(e) => handleChange('testEquipment.megohmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : 'bg-white dark:bg-dark-150'}`} /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-white">Cal Date:</label><input type="text" value={formData.testEquipment.megohmmeter.calibrationDate} onChange={(e) => handleChange('testEquipment.megohmmeter.calibrationDate', e.target.value)} readOnly={!isEditing} placeholder="MM/DD/YYYY" className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : 'bg-white dark:bg-dark-150'}`} /></div>
            </div>
            <div className="hidden print:block">
              <table className="w-full border-collapse border border-gray-300 print:border-black">
                <thead><tr><th className="border border-gray-300 print:border-black p-1 text-left">Equipment</th><th className="border border-gray-300 print:border-black p-1 text-left">Serial Number</th><th className="border border-gray-300 print:border-black p-1 text-left">AMP ID</th><th className="border border-gray-300 print:border-black p-1 text-left">Cal Date</th></tr></thead>
                <tbody><tr><td className="border border-gray-300 print:border-black p-1">{formData.testEquipment.megohmmeter.name || 'Megohmmeter'}</td><td className="border border-gray-300 print:border-black p-1">{formData.testEquipment.megohmmeter.serialNumber}</td><td className="border border-gray-300 print:border-black p-1">{formData.testEquipment.megohmmeter.ampId}</td><td className="border border-gray-300 print:border-black p-1">{formData.testEquipment.megohmmeter.calibrationDate}</td></tr></tbody>
              </table>
            </div>
          </div>

          {/* Comments */}
          <div className={`mb-6 comments-section print:break-inside-avoid ${!formData.comments?.trim() ? 'print:hidden' : ''}`}>
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            <textarea value={formData.comments} onChange={(e) => handleChange('comments', e.target.value)} readOnly={!isEditing} rows={4} className={`form-input w-full print:hidden ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} placeholder="Enter any comments or notes..." />
            {formData.comments?.trim() && (
              <div className="hidden print:block">
                <table className="w-full border-collapse border border-gray-300 print:border-black text-[0.85rem]">
                  <tbody>
                    <tr>
                      <td className="p-3 align-top border border-gray-300 print:border-black min-h-[80px] whitespace-pre-wrap text-black">{formData.comments}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mark Ready to Review Button - flips the linked asset's status to
              'ready_for_review' so the report appears in the Pending Approvals
              queue (ReportApprovalWorkflow filters on this status).
              This implementation is self-healing: if no asset row exists for
              this report (e.g. a prior save silently failed to create one, or
              the asset was created by JobDetail with a placeholder file_url),
              the button locates any matching asset by job + slug + report id,
              creates one if still missing, and links it to job_assets. The
              update is verified via .select() so silent no-ops are caught. */}
          {!isPrintMode && isEditing && (
            <div className="mb-6 print:hidden flex justify-center">
              <button
                onClick={async () => {
                  if (!jobId || !user?.id) return;

                  try {
                    await handleSave();
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const savedReportId = currentReportId || window.location.pathname.split('/').pop();
                    if (!savedReportId) throw new Error('Failed to save report');

                    const canonicalFileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;
                    const submittedAt = new Date().toISOString();

                    // Step 1: try the canonical update first and verify rows changed.
                    let updatedRows: Array<{ id: string }> = [];
                    {
                      const { data, error: updateError } = await supabase
                        .schema('neta_ops')
                        .from('assets')
                        .update({ status: 'ready_for_review', submitted_at: submittedAt })
                        .eq('file_url', canonicalFileUrl)
                        .select('id');
                      if (updateError) throw updateError;
                      updatedRows = data || [];
                    }

                    // Step 2: if no row matched, look up any asset whose file_url
                    // contains this report id (covers placeholder URLs from
                    // JobDetail or older saves that stored a slightly different
                    // file_url) and update those.
                    if (!updatedRows || updatedRows.length === 0) {
                      const { data: candidates, error: lookupError } = await supabase
                        .schema('neta_ops')
                        .from('assets')
                        .select('id, file_url')
                        .ilike('file_url', `%${reportSlug}/${savedReportId}%`);

                      if (lookupError) throw lookupError;

                      if (candidates && candidates.length > 0) {
                        const ids = candidates.map(c => c.id);
                        const { data: fixedRows, error: fixError } = await supabase
                          .schema('neta_ops')
                          .from('assets')
                          .update({
                            status: 'ready_for_review',
                            submitted_at: submittedAt,
                            file_url: canonicalFileUrl
                          })
                          .in('id', ids)
                          .select('id');
                        if (fixError) throw fixError;
                        updatedRows = (fixedRows as Array<{ id: string }> | null) || [];
                      }
                    }

                    // Step 3: if still nothing exists, create the asset and link
                    // it to job_assets so the Pending Approvals queue can find it.
                    if (!updatedRows || updatedRows.length === 0) {
                      const assetName = getAssetName(reportSlug, formData.identifier);
                      const { data: newAsset, error: insertError } = await supabase
                        .schema('neta_ops')
                        .from('assets')
                        .insert({
                          name: assetName,
                          file_url: canonicalFileUrl,
                          template_type: 'ATS',
                          status: 'ready_for_review',
                          submitted_at: submittedAt
                        })
                        .select('id')
                        .single();
                      if (insertError) throw insertError;
                      if (newAsset) {
                        const { error: linkError } = await supabase
                          .schema('neta_ops')
                          .from('job_assets')
                          .insert({ job_id: jobId, asset_id: newAsset.id, user_id: user.id });
                        if (linkError) {
                          console.warn('Asset created but job link failed:', linkError);
                        }
                      }
                    }

                    alert('Report marked as ready for review!');
                  } catch (err: any) {
                    console.error('Error marking report as ready:', err);
                    alert(`Failed to mark as ready: ${err?.message || 'Unknown error'}`);
                  }
                }}
                className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Mark Ready to Review
              </button>
            </div>
          )}
        </div>
      </div>

      <datalist id="substation-options">{pastSubstations.map((v, i) => <option key={i} value={v} />)}</datalist>
      <datalist id="identifier-options">{pastIdentifiers.map((v, i) => <option key={i} value={v} />)}</datalist>
    </ReportWrapper>
  );
};

export default EmergencySystemsEngineGeneratorATS25Report;
