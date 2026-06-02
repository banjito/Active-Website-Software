import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { getAssetName, getReportName } from './reportMappings';
import { navigateAfterSave } from './ReportUtils';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { getPassFailBadgeClass } from '@/lib/reportPassFailStatus';

type PassFail = 'PASS' | 'FAIL';

const visualOptions = [
  'Select One',
  'Satisfactory',
  'Unsatisfactory',
  'Cleaned',
  'See Comments',
  'Not Applicable'
];

const testVoltageOptions = ['250V', '500V', '1000V', '2500V', '5000V'];

// Temperature Correction Factor lookup (Celsius → multiplier)
const TCF_TABLE: Record<string, number> = {
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
  '66': 8.32, '67': 8.74, '68': 9.16, '69': 9.58, '70': 10
};

const getTCF = (celsius: number) => {
  const key = String(Math.round(celsius));
  return TCF_TABLE[key] ?? 1;
};

interface VisualRow {
  neta: string;
  description: string;
  result: string;
}

interface NameplateData {
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  mfgDate: string;
  icRatingKa: string;
  ratedVoltageKv: string;
  operatingVoltageKv: string;
  ampacity: string;
  impulseBil: string;
}

interface FuseData {
  manufacturer: string;
  catalogNumber: string;
  className: string;
  ratedVoltageKv: string;
  ampacityA: string;
  icRatingKa: string;
}

type ThreePhase = { p1: string; p2: string; p3: string };

interface ReportData {
  // Job Info
  customer: string;
  address: string;
  user: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  eqptLocation: string;
  temperature: { fahrenheit: number | ''; celsius: number | ''; tcf: number; humidity: number | '' };

  // Sections
  nameplate: NameplateData;
  visual: VisualRow[];
  fuseData: FuseData;

  // Electrical Tests
  contactAsFound: { switch: ThreePhase; fuse: ThreePhase; switchFuse: ThreePhase; units: string };
  contactAsLeft: { switch: ThreePhase; fuse: ThreePhase; switchFuse: ThreePhase; units: string };
  insulation: {
    testVoltage: string;
    rows: Array<{ label: string; position: string; readings: ThreePhase }>;
  };
  insulationCorrected: {
    rows: Array<{ label: string; readings: ThreePhase }>;
  };
  dielectric: {
    testVoltage: string;
    duration: string;
    units: string;
    p1: string; p2: string; p3: string;
  };

  // Equipment Used
  equipmentUsed: {
    megohmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
    hipot: { name: string; serialNumber: string; ampId: string; calDate: string };
  };

  comments: string;
  status: PassFail;
}

const initialVisualRows: VisualRow[] = [
  { neta: '7.5.1.2.A.1', description: 'Inspect physical and mechanical condition.', result: '' },
  { neta: '7.5.1.2.A.2', description: 'Inspect anchorage, alignment, and grounding.', result: '' },
  { neta: '7.5.1.2.A.4', description: 'Clean the unit.', result: '' },
  { neta: '7.5.1.2.A.5', description: 'Verify correct blade alignment, blade penetration, travel stops, arc interrupter operation, and mechanical operation.', result: '' },
  { neta: '7.5.1.2.A.6', description: 'Verify that fuse sizes and types are in accordance with drawings, short-circuit studies, and', result: '' },
  { neta: '7.5.1.2.A.7', description: 'Verify that expulsion-limiting devices are in place on all fuses having expulsion-type elements.', result: '' },
  { neta: '7.5.1.2.A.8', description: 'Verify that each fuseholder has adequate mechanical support and contact integrity.', result: '' },
  { neta: '7.5.1.2.A.9.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.5.1.2.B.1.', result: '' },
  { neta: '7.5.1.2.A.10', description: 'Verify operation and sequencing of interlocking systems.', result: '' },
  { neta: '7.5.1.2.A.11', description: 'Verify that phase-barrier mounting is intact.', result: '' },
  { neta: '7.5.1.2.A.12', description: 'Verify correct operation of all indicating and control devices.', result: '' },
  { neta: '7.5.1.2.A.13', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: '' }
];

const makeEmpty3 = (): ThreePhase => ({ p1: '', p2: '', p3: '' });

const MediumVoltageSwitchMTSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId?: string }>();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();

  const [loading, setLoading] = useState<boolean>(true);
  const [isEditMode, setIsEditMode] = useState<boolean>(!initialReportId);
  const [status, setStatus] = useState<PassFail>('PASS');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);

  const reportSlug = '23-medium-voltage-switch-mts-report';
  const reportTitle = getReportName(reportSlug);
  const isPrintMode = searchParams.get('print') === 'true';

  const [form, setForm] = useState<ReportData>({
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    substation: '',
    eqptLocation: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50 },
    nameplate: {
      manufacturer: '', catalogNumber: '', serialNumber: '', type: '', mfgDate: '',
      icRatingKa: '', ratedVoltageKv: '', operatingVoltageKv: '', ampacity: '', impulseBil: ''
    },
    visual: initialVisualRows.map(v => ({ ...v })),
    fuseData: { manufacturer: '', catalogNumber: '', className: '', ratedVoltageKv: '', ampacityA: '', icRatingKa: '' },
    contactAsFound: { switch: makeEmpty3(), fuse: makeEmpty3(), switchFuse: makeEmpty3(), units: 'µΩ' },
    contactAsLeft: { switch: makeEmpty3(), fuse: makeEmpty3(), switchFuse: makeEmpty3(), units: 'µΩ' },
    insulation: {
      testVoltage: '2500V',
      rows: [
        { label: 'Pole to Pole', position: 'Closed', readings: makeEmpty3() },
        { label: 'Pole to Frame', position: 'Closed', readings: makeEmpty3() },
        { label: 'Line to Load', position: 'Open', readings: makeEmpty3() }
      ]
    },
    insulationCorrected: {
      rows: [
        { label: 'Pole to Pole', readings: makeEmpty3() },
        { label: 'Pole to Frame', readings: makeEmpty3() },
        { label: 'Line to Load', readings: makeEmpty3() }
      ]
    },
    dielectric: { testVoltage: '16.1', duration: '1 Min.', units: 'mA', p1: '', p2: '', p3: '' },
    equipmentUsed: {
      megohmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' },
      hipot: { name: '', serialNumber: '', ampId: '', calDate: '' }
    },
    comments: '',
    status: 'PASS'
  });

  // Minimal print CSS parity with other reports (hide app chrome during print)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'mv-switch-mts-print-css';
    style.textContent = `
      @media print {
        nav, header, .navigation, [class*="nav"], [class*="header"], .sticky, [class*="sticky"], .print\\:hidden { display: none !important; }
        button:not(.print-visible) { display: none !important; }
        /* Tables */
        #report-container table { border-collapse: collapse !important; width: 100% !important; }
        #report-container th, #report-container td { border: 1px solid black !important; padding: 2px 3px !important; font-size: 9px !important; }
        #report-container th { background-color: #f0f0f0 !important; font-weight: bold !important; }
        /* Centering helper for this report */
        .mv-center-table th,
        .mv-center-table td,
        .mv-center-table td > div { text-align: center !important; }
        .mv-center-table td { vertical-align: middle !important; }
        .mv-center-table input,
        .mv-center-table select,
        .mv-center-table textarea { text-align: center !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      try { document.head.removeChild(style); } catch {}
    };
  }, []);

  // Derived corrections
  useEffect(() => {
    const tcf = getTCF(Number(form.temperature.celsius || 0));
    if (tcf !== form.temperature.tcf) {
      setForm(prev => ({ ...prev, temperature: { ...prev.temperature, tcf } }));
    }
  }, [form.temperature.celsius]);

  useEffect(() => {
    // Recompute corrected insulation readings when input or TCF changes
    setForm(prev => {
      const tcf = prev.temperature.tcf || 1;
      const corrected = prev.insulation.rows.map(r => {
        const parse = (v: string) => {
          const n = Number(v);
          return Number.isFinite(n) ? String((n * tcf).toFixed(2)) : v;
        };
        return {
          label: r.label,
          readings: { p1: parse(r.readings.p1), p2: parse(r.readings.p2), p3: parse(r.readings.p3) }
        };
      });
      return { ...prev, insulationCorrected: { rows: corrected } };
    });
  }, [form.insulation.rows, form.temperature.tcf]);

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

      if (jobData?.customer_id) {
        const { data: customerData } = await supabase
          .schema('common')
          .from('customers')
          .select('name, company_name, address')
          .eq('id', jobData.customer_id)
          .single();
        setForm(prev => ({
          ...prev,
          customer: maskCustomerName((customerData as any)?.company_name || (customerData as any)?.name || ''),
          address: maskCustomerAddress((jobData as any)?.site_address || (customerData as any)?.address || ''),
          jobNumber: (jobData as any)?.job_number || ''
        }));
      }
    } catch (err) {
      // Silent fallback
    }
  };

  const loadReport = async () => {
    // CRITICAL: Check this FIRST before checking !currentReportId
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    if (!currentReportId) { setLoading(false); setIsEditMode(true); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .schema('neta_ops')
        .from('medium_voltage_switch_mts_reports')
        .select('*')
        .eq('id', currentReportId)
        .maybeSingle();
      if (data?.report_data) {
        const rd = data.report_data as ReportData;
        setForm(prev => ({ ...prev, ...rd }));
        setStatus((rd.status as PassFail) || 'PASS');
        setIsEditMode(false);
      } else {
        setIsEditMode(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadJobInfo(); loadReport(); }, [jobId, currentReportId]);

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const payload = {
      job_id: jobId,
      user_id: user.id,
      report_data: { ...form, status }
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_mts_reports')
          .update(payload)
          .eq('id', reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema('neta_ops')
            .from('medium_voltage_switch_mts_reports')
            .insert(payload)
            .select()
            .single();

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || formData.location || ''),
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
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, form, status, reportSlug]);

  // Auto-save effect with debounce (MUST be placed AFTER autoSave function definition)
  useEffect(() => {
    if (!isEditMode || loading) return;
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500); // 500ms debounce

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [form, status, isEditMode, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    try {
      const payload = {
        job_id: jobId,
        user_id: user.id,
        report_data: { ...form, status }
      };

      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_mts_reports')
          .update(payload)
          .eq('id', reportIdRef.current)
          .select()
          .single();
      } else if (creatingRef.current) {
        const deadline = Date.now() + 5000;
        while (creatingRef.current && !reportIdRef.current && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (reportIdRef.current) {
          result = await supabase
            .schema('neta_ops')
            .from('medium_voltage_switch_mts_reports')
            .update(payload)
            .eq('id', reportIdRef.current)
            .select()
            .single();
        } else {
          throw new Error('Report creation is still in progress. Please try again.');
        }
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema('neta_ops')
            .from('medium_voltage_switch_mts_reports')
            .insert(payload)
            .select()
            .single();

          if (result.data) {
            reportIdRef.current = result.data.id;
            setCurrentReportId(result.data.id);
            const assetData = {
              name: getAssetName(reportSlug, form.identifier || form.eqptLocation || ''),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
              user_id: user.id,
              template_type: 'MTS',
            };
            const { data: assetResult, error: assetError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select('id')
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

      if ((result as any)?.error) throw (result as any).error;
      setIsEditMode(false);
      alert(`Report ${currentReportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
    } catch (err: any) {
      alert(`Failed to save report: ${err?.message || 'Unknown error'}`);
    }
  };

  // Helpers
  const setJobInfo = (field: keyof ReportData, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const setTemp = (key: keyof ReportData['temperature'], value: any) => setForm(prev => ({ ...prev, temperature: { ...prev.temperature, [key]: value } }));

  const header = (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportTitle}</h1>
      <div className="flex gap-2 items-center">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          ✓ Auto Saving Enabled
        </span>
        
        <button
          onClick={() => { if (isEditMode) setStatus(status === 'PASS' ? 'FAIL' : 'PASS'); }}
          className={`px-4 py-2 text-sm font-medium rounded-md ${status === 'PASS' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'} ${!isEditMode ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        >
          {status}
        </button>
        {currentReportId && !isEditMode ? (
          <>
            <button onClick={() => setIsEditMode(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md">Edit Report</button>
            <button onClick={() => window.print()} className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md">Print Report</button>
          </>
        ) : (
          <button onClick={handleSave} disabled={!isEditMode} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md ${!isEditMode ? 'opacity-60 cursor-not-allowed' : 'hover:bg-orange-700'}`}>Save Report</button>
        )}
      </div>
    </div>
  );

  const jobInfo = (
    <section className="mb-6 job-info-section">
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Details</h2>
      {/* On-screen form - hidden in print (copied styling from MediumVoltageCableVLFTest.jsx) */}
      <div className="grid grid-cols-2 gap-6 print:hidden job-info-onscreen">
        {/* Left Column */}
        <div>
          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Customer</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={maskCustomerName(form.customer)} onChange={e => setJobInfo('customer', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Site Address</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={maskCustomerAddress(form.address)} onChange={e => setJobInfo('address', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">User</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={form.user} onChange={e => setJobInfo('user', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Date</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="date" value={form.date} onChange={e => setJobInfo('date', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Identifier</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={form.identifier} onChange={e => setJobInfo('identifier', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div>
          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Job #</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={form.jobNumber} onChange={e => setJobInfo('jobNumber', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Technicians</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={form.technicians} onChange={e => setJobInfo('technicians', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex items-center">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Temp.</label>
            <div className="flex-1 flex items-center">
              <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(form.temperature.fahrenheit ?? '')}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9.-]/g, '');
                    // Allow empty string for easier editing
                    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
                      setTemp('fahrenheit', '' as any);
                      setTemp('celsius', '' as any);
                      return;
                    }
                    const f = Number(raw);
                    const c = Math.round((f - 32) * 5 / 9);
                    setTemp('fahrenheit', isNaN(f) ? ('' as any) : f);
                    setTemp('celsius', isNaN(c) ? ('' as any) : c);
                  }}
                  readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                />
              </div>
              <span className="mx-2">°F</span>
              <span className="mx-2">{form.temperature.celsius as any}</span>
              <span className="mx-2">°C</span>
              <span className="mx-5">TCF</span>
              <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                <input type="text" value={(Number(form.temperature.tcf) || 0).toFixed(3)} readOnly className="w-full bg-transparent border-none focus:ring-0 cursor-default" />
              </div>
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Humidity</label>
            <div className="flex items-center flex-1">
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input type="number" value={form.temperature.humidity as any} onChange={e => setTemp('humidity', Number(e.target.value))} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
              </div>
              <span className="ml-2">%</span>
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Substation</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={form.substation} onChange={e => setJobInfo('substation', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>

          <div className="mb-4 flex">
            <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Eqpt. Location</label>
            <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={form.eqptLocation} onChange={e => setJobInfo('eqptLocation', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Print-only compact table */}
      <div className="hidden print:block">
        <JobInfoPrintTable data={{
          customer: maskCustomerName(form.customer),
          address: form.address,
          jobNumber: form.jobNumber,
          technicians: form.technicians,
          date: form.date,
          identifier: form.identifier,
          user: form.user,
          substation: form.substation,
          eqptLocation: form.eqptLocation,
          temperature: form.temperature
        }} />
      </div>
    </section>
  );

  const nameplate = (
    <section className="mb-6">
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Manufacturer</label>
          <input className="form-input col-span-2" value={form.nameplate.manufacturer} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, manufacturer: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">I.C. Rating (kA)</label>
          <input className="form-input col-span-2" value={form.nameplate.icRatingKa} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, icRatingKa: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Catalog Number</label>
          <input className="form-input col-span-2" value={form.nameplate.catalogNumber} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, catalogNumber: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Rated Voltage (kV)</label>
          <input className="form-input col-span-2" value={form.nameplate.ratedVoltageKv} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, ratedVoltageKv: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Serial Number</label>
          <input className="form-input col-span-2" value={form.nameplate.serialNumber} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, serialNumber: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Operating Voltage (kV)</label>
          <input className="form-input col-span-2" value={form.nameplate.operatingVoltageKv} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, operatingVoltageKv: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Type</label>
          <input className="form-input col-span-2" value={form.nameplate.type} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, type: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Ampacity</label>
          <input className="form-input col-span-2" value={form.nameplate.ampacity} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, ampacity: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Manufacturing Date</label>
          <input className="form-input col-span-2" value={form.nameplate.mfgDate} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, mfgDate: e.target.value } }))} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <label className="form-label">Impulse Rating (BIL)</label>
          <input className="form-input col-span-2" value={form.nameplate.impulseBil} readOnly={!isEditMode} onChange={e => setForm(p => ({ ...p, nameplate: { ...p.nameplate, impulseBil: e.target.value } }))} />
        </div>
      </div>
      {/* Print-only Nameplate table with all fields */}
      <div className="hidden print:block">
        <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem] mv-center-table">
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Manufacturer</div><div>{form.nameplate.manufacturer || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Catalog No.</div><div>{form.nameplate.catalogNumber || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Serial Number</div><div>{form.nameplate.serialNumber || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Type</div><div>{form.nameplate.type || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Mfg Date</div><div>{form.nameplate.mfgDate || ''}</div></td>
            </tr>
            <tr>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Rated Voltage (kV)</div><div>{form.nameplate.ratedVoltageKv || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Operating Voltage (kV)</div><div>{form.nameplate.operatingVoltageKv || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Ampacity (A)</div><div>{form.nameplate.ampacity || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">I.C. Rating (kA)</div><div>{form.nameplate.icRatingKa || ''}</div></td>
              <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Impulse (BIL)</div><div>{form.nameplate.impulseBil || ''}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  const visual = (
    <section className="mb-6">
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>

      {/* Screen view — dropdowns */}
      <table className="w-full border-collapse visual-mechanical-table print:hidden">
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '75%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-gray-300 dark:border-gray-700 p-2 text-left">NETA Section</th>
            <th className="border border-gray-300 dark:border-gray-700 p-2 text-left">Description</th>
            <th className="border border-gray-300 dark:border-gray-700 p-2 text-center">Results</th>
          </tr>
        </thead>
        <tbody>
          {form.visual.map((row, idx) => (
            <tr key={row.neta}>
              <td className="border border-gray-300 dark:border-gray-700 p-2 align-top">{row.neta}</td>
              <td className="border border-gray-300 dark:border-gray-700 p-2 align-top">{row.description}</td>
              <td className="border border-gray-300 dark:border-gray-700 p-2 align-top">
                <select className="form-select" value={row.result} onChange={e => {
                  if (!isEditMode) return;
                  const v = e.target.value;
                  setForm(prev => ({
                    ...prev,
                    visual: prev.visual.map((r, i) => i === idx ? { ...r, result: v } : r)
                  }));
                }} disabled={!isEditMode}>
                  {visualOptions.map(opt => <option key={opt} value={opt === 'Select One' ? '' : opt}>{opt}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Print view — plain text so values actually render */}
      <table className="hidden print:table w-full border-collapse" style={{ fontSize: '9px' }}>
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '75%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-black p-1 text-left bg-gray-100" style={{ backgroundColor: '#f0f0f0' }}>NETA Section</th>
            <th className="border border-black p-1 text-left bg-gray-100" style={{ backgroundColor: '#f0f0f0' }}>Description</th>
            <th className="border border-black p-1 text-center bg-gray-100" style={{ backgroundColor: '#f0f0f0' }}>Results</th>
          </tr>
        </thead>
        <tbody>
          {form.visual.map(row => (
            <tr key={row.neta}>
              <td className="border border-black p-1 align-top">{row.neta}</td>
              <td className="border border-black p-1 align-top">{row.description}</td>
              <td className="border border-black p-1 text-center align-top">{row.result || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  const fuseData = (
    <section className="mb-6">
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Fuse Data</h2>
      {/* Unified 3x2 grid table (screen + print). Each cell: label + input/value */}
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300 dark:border-gray-700 mv-center-table">
          <colgroup>
            <col style={{ width: '33.33%' }} />
            <col style={{ width: '33.33%' }} />
            <col style={{ width: '33.33%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="p-2 align-top border border-gray-300 dark:border-gray-700 print:text-center">
                <div className="font-semibold print:text-center">Manufacturer</div>
                <input
                  type="text"
                  value={form.fuseData.manufacturer}
                  onChange={e=>setForm(p=>({...p, fuseData:{...p.fuseData, manufacturer:e.target.value}}))}
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150':''}`}
                />
              </td>
              <td className="p-2 align-top border border-gray-300 dark:border-gray-700 print:text-center">
                <div className="font-semibold print:text-center">Catalog No.</div>
                <input
                  type="text"
                  value={form.fuseData.catalogNumber}
                  onChange={e=>setForm(p=>({...p, fuseData:{...p.fuseData, catalogNumber:e.target.value}}))}
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150':''}`}
                />
              </td>
              <td className="p-2 align-top border border-gray-300 dark:border-gray-700 print:text-center">
                <div className="font-semibold print:text-center">Class</div>
                <input
                  type="text"
                  value={form.fuseData.className}
                  onChange={e=>setForm(p=>({...p, fuseData:{...p.fuseData, className:e.target.value}}))}
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150':''}`}
                />
              </td>
            </tr>
            <tr>
              <td className="p-2 align-top border border-gray-300 dark:border-gray-700 print:text-center">
                <div className="font-semibold print:text-center">Rated Voltage (kV)</div>
                <input
                  type="text"
                  value={form.fuseData.ratedVoltageKv}
                  onChange={e=>setForm(p=>({...p, fuseData:{...p.fuseData, ratedVoltageKv:e.target.value}}))}
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150':''}`}
                />
              </td>
              <td className="p-2 align-top border border-gray-300 dark:border-gray-700 print:text-center">
                <div className="font-semibold print:text-center">Ampacity (A)</div>
                <input
                  type="text"
                  value={form.fuseData.ampacityA}
                  onChange={e=>setForm(p=>({...p, fuseData:{...p.fuseData, ampacityA:e.target.value}}))}
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150':''}`}
                />
              </td>
              <td className="p-2 align-top border border-gray-300 dark:border-gray-700 print:text-center">
                <div className="font-semibold print:text-center">I.C. Rating (kA)</div>
                <input
                  type="text"
                  value={form.fuseData.icRatingKa}
                  onChange={e=>setForm(p=>({...p, fuseData:{...p.fuseData, icRatingKa:e.target.value}}))}
                  readOnly={!isEditMode}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150':''}`}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  const contactTable = (title: string, key: 'contactAsFound' | 'contactAsLeft') => (
    <div className="border border-gray-300 dark:border-gray-700 p-3">
      <div className="font-semibold mb-2">{title}</div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2">&nbsp;</th>
            <th className="border p-2">P1</th>
            <th className="border p-2">P2</th>
            <th className="border p-2">P3</th>
            <th className="border p-2">Units</th>
          </tr>
        </thead>
        <tbody>
          {(['switch', 'fuse', 'switchFuse'] as const).map(row => (
            <tr key={row}>
              <td className="border p-2 capitalize">{row === 'switchFuse' ? 'Switch + Fuse' : row}</td>
              {(['p1', 'p2', 'p3'] as const).map(ph => (
                <td key={ph} className="border p-1">
                  <input className="form-input" value={(form as any)[key][row][ph]} onChange={e => setForm(p => ({ ...p, [key]: { ...(p as any)[key], [row]: { ...(p as any)[key][row], [ph]: e.target.value } } }))} readOnly={!isEditMode} />
                </td>
              ))}
              <td className="border p-1">
                <select className="form-select" value={(form as any)[key].units} onChange={e => setForm(p => ({ ...p, [key]: { ...(p as any)[key], units: e.target.value } }))} disabled={!isEditMode}>
                  <option value="µΩ">µΩ</option>
                  <option value="mΩ">mΩ</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const electrical = (
    <section className="mb-6">
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests</h2>
      {/* Screen layout (hidden when printing) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
        {contactTable('Contact Resistance (As Found)', 'contactAsFound')}
        {contactTable('Contact Resistance (As Left)', 'contactAsLeft')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 print:hidden">
        {/* Insulation Resistance */}
        <div className="border border-gray-300 dark:border-gray-700 p-3">
          <div className="font-semibold mb-2">Insulation Resistance</div>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span>Test Voltage</span>
            <select className="form-select w-28" value={form.insulation.testVoltage} onChange={e => setForm(p => ({ ...p, insulation: { ...p.insulation, testVoltage: e.target.value } }))} disabled={!isEditMode}>
              {testVoltageOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <table className="w-full border-collapse text-sm">
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="border p-2">&nbsp;</th>
                <th className="border p-2">P1 MΩ</th>
                <th className="border p-2">P2 MΩ</th>
                <th className="border p-2">P3 MΩ</th>
              </tr>
            </thead>
            <tbody>
              {form.insulation.rows.map((r, idx) => (
                <tr key={r.label}>
                  <td className="border p-2">
                    <div className="flex items-center gap-2">
                      <span>{r.label}</span>
                      <span className="text-xs text-gray-600">{r.position}</span>
                    </div>
                  </td>
                  {(['p1', 'p2', 'p3'] as const).map(ph => (
                    <td key={ph} className="border p-1">
                      <input className="form-input" value={r.readings[ph]} onChange={e => setForm(p => ({ ...p, insulation: { ...p.insulation, rows: p.insulation.rows.map((rr, i) => i === idx ? { ...rr, readings: { ...rr.readings, [ph]: e.target.value } } : rr) } }))} readOnly={!isEditMode} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Temperature Corrected */}
        <div className="border border-gray-300 dark:border-gray-700 p-3">
          <div className="font-semibold mb-2">Temperature Corrected</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border p-2">P1 MΩ</th>
                <th className="border p-2">P2 MΩ</th>
                <th className="border p-2">P3 MΩ</th>
              </tr>
            </thead>
            <tbody>
              {form.insulationCorrected.rows.map(r => (
                <tr key={r.label}>
                  <td className="border p-1"><input className="form-input" value={r.readings.p1} readOnly /></td>
                  <td className="border p-1"><input className="form-input" value={r.readings.p2} readOnly /></td>
                  <td className="border p-1"><input className="form-input" value={r.readings.p3} readOnly /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print layout: four boxed squares (2x2 grid) */}
      <div className="hidden print:grid grid-cols-2 gap-2 mt-2">
        {/* Contact Resistance (As Found) */}
        <table className="w-full border border-gray-300 print:border-black">
          <thead>
            <tr><th colSpan={5} className="border p-2 text-left bg-gray-50">Contact Resistance (As Found)</th></tr>
            <tr>
              <th className="border p-1">&nbsp;</th>
              <th className="border p-1">P1</th>
              <th className="border p-1">P2</th>
              <th className="border p-1">P3</th>
              <th className="border p-1">Units</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['Switch', form.contactAsFound.switch],
              ['Fuse', form.contactAsFound.fuse],
              ['Switch + Fuse', form.contactAsFound.switchFuse]
            ] as const).map(([label, vals]) => (
              <tr key={label}>
                <td className="border p-1">{label}</td>
                <td className="border p-1 text-center">{vals.p1 || ''}</td>
                <td className="border p-1 text-center">{vals.p2 || ''}</td>
                <td className="border p-1 text-center">{vals.p3 || ''}</td>
                <td className="border p-1 text-center">{form.contactAsFound.units}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Contact Resistance (As Left) */}
        <table className="w-full border border-gray-300 print:border-black">
          <thead>
            <tr><th colSpan={5} className="border p-2 text-left bg-gray-50">Contact Resistance (As Left)</th></tr>
            <tr>
              <th className="border p-1">&nbsp;</th>
              <th className="border p-1">P1</th>
              <th className="border p-1">P2</th>
              <th className="border p-1">P3</th>
              <th className="border p-1">Units</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['Switch', form.contactAsLeft.switch],
              ['Fuse', form.contactAsLeft.fuse],
              ['Switch + Fuse', form.contactAsLeft.switchFuse]
            ] as const).map(([label, vals]) => (
              <tr key={label}>
                <td className="border p-1">{label}</td>
                <td className="border p-1 text-center">{vals.p1 || ''}</td>
                <td className="border p-1 text-center">{vals.p2 || ''}</td>
                <td className="border p-1 text-center">{vals.p3 || ''}</td>
                <td className="border p-1 text-center">{form.contactAsLeft.units}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Insulation Resistance */}
        <table className="w-full border border-gray-300 print:border-black">
          <colgroup>
            <col style={{ width: '40%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr><th colSpan={4} className="border p-2 text-left bg-gray-50">Insulation Resistance</th></tr>
            <tr>
              <th className="border p-1 text-left">Test Voltage {form.insulation.testVoltage}</th>
              <th className="border p-1 text-center">P1 MΩ</th>
              <th className="border p-1 text-center">P2 MΩ</th>
              <th className="border p-1 text-center">P3 MΩ</th>
            </tr>
          </thead>
          <tbody>
            {form.insulation.rows.map((r) => (
              <tr key={r.label}>
                <td className="border p-1">{r.label}{r.position ? ` (${r.position})` : ''}</td>
                <td className="border p-1 text-center">{r.readings.p1 || ''}</td>
                <td className="border p-1 text-center">{r.readings.p2 || ''}</td>
                <td className="border p-1 text-center">{r.readings.p3 || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Temperature Corrected */}
        <table className="w-full border border-gray-300 print:border-black">
          <thead>
            <tr><th colSpan={3} className="border p-2 text-left bg-gray-50">Temperature Corrected</th></tr>
            <tr>
              <th className="border p-1 text-center">P1 MΩ</th>
              <th className="border p-1 text-center">P2 MΩ</th>
              <th className="border p-1 text-center">P3 MΩ</th>
            </tr>
          </thead>
          <tbody>
            {form.insulationCorrected.rows.map((r) => (
              <tr key={r.label}>
                <td className="border p-1 text-center">{r.readings.p1 || ''}</td>
                <td className="border p-1 text-center">{r.readings.p2 || ''}</td>
                <td className="border p-1 text-center">{r.readings.p3 || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dielectric */}
      <div className="mt-4">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-700">
          <thead>
            <tr>
              <th colSpan={6} className="border border-gray-300 dark:border-gray-700 px-2 py-1 text-center">Dielectric Withstand Phase to Ground</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">Test Voltage</td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                <input className="form-input" value={form.dielectric.testVoltage} onChange={e => setForm(p => ({ ...p, dielectric: { ...p.dielectric, testVoltage: e.target.value } }))} readOnly={!isEditMode} />
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1 text-center font-semibold">P1</td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1 text-center font-semibold">P2</td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1 text-center font-semibold">P3</td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1 font-semibold">Units</td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">Test Duration</td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                <input className="form-input" value={form.dielectric.duration} onChange={e => setForm(p => ({ ...p, dielectric: { ...p.dielectric, duration: e.target.value } }))} readOnly={!isEditMode} />
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                <input className="form-input" value={form.dielectric.p1} onChange={e => setForm(p => ({ ...p, dielectric: { ...p.dielectric, p1: e.target.value } }))} readOnly={!isEditMode} />
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                <input className="form-input" value={form.dielectric.p2} onChange={e => setForm(p => ({ ...p, dielectric: { ...p.dielectric, p2: e.target.value } }))} readOnly={!isEditMode} />
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                <input className="form-input" value={form.dielectric.p3} onChange={e => setForm(p => ({ ...p, dielectric: { ...p.dielectric, p3: e.target.value } }))} readOnly={!isEditMode} />
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                <select className="form-select" value={form.dielectric.units} onChange={e => setForm(p => ({ ...p, dielectric: { ...p.dielectric, units: e.target.value } }))} disabled={!isEditMode}>
                  <option value="mA">mA</option>
                  <option value="µA">µA</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  const equipment = (
    <section className="mb-6">
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
      {/* On-screen form - hidden in print */}
      <div className="print:hidden">
      {([
        ['Megohmmeter', 'megohmmeter'],
        ['Low-Resistance Ohmmeter', 'lowResistanceOhmmeter'],
        ['Hipot', 'hipot']
      ] as const).map(([label, key]) => (
        <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
          <div className="grid grid-cols-3 items-center gap-2"><label className="form-label text-center w-full">{label}:</label><input className="form-input col-span-2" value={(form.equipmentUsed as any)[key].name} onChange={e => setForm(p => ({ ...p, equipmentUsed: { ...p.equipmentUsed, [key]: { ...(p.equipmentUsed as any)[key], name: e.target.value } } }))} readOnly={!isEditMode} /></div>
          <div className="grid grid-cols-3 items-center gap-2"><label className="form-label text-center w-full">Serial Number:</label><input className="form-input col-span-2" value={(form.equipmentUsed as any)[key].serialNumber} onChange={e => setForm(p => ({ ...p, equipmentUsed: { ...p.equipmentUsed, [key]: { ...(p.equipmentUsed as any)[key], serialNumber: e.target.value } } }))} readOnly={!isEditMode} /></div>
          <div className="grid grid-cols-3 items-center gap-2"><label className="form-label text-center w-full">AMP ID:</label><input className="form-input col-span-2" value={(form.equipmentUsed as any)[key].ampId} onChange={e => setForm(p => ({ ...p, equipmentUsed: { ...p.equipmentUsed, [key]: { ...(p.equipmentUsed as any)[key], ampId: e.target.value } } }))} readOnly={!isEditMode} /></div>
          <div className="grid grid-cols-3 items-center gap-2"><label className="form-label text-center w-full">Cal Date:</label><input className="form-input col-span-2" value={(form.equipmentUsed as any)[key].calDate} onChange={e => setForm(p => ({ ...p, equipmentUsed: { ...p.equipmentUsed, [key]: { ...(p.equipmentUsed as any)[key], calDate: e.target.value } } }))} readOnly={!isEditMode} /></div>
        </div>
      ))}
      </div>

      {/* Print-only compact Test Equipment table */}
      <div className="hidden print:block">
        <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem] mv-center-table test-eqpt-print">
          <colgroup>
            <col style={{ width: '33.33%' }} />
            <col style={{ width: '33.33%' }} />
            <col style={{ width: '33.33%' }} />
          </colgroup>
          <tbody>
            {([
              ['Megohmmeter', 'megohmmeter'],
              ['Low-Resistance Ohmmeter', 'lowResistanceOhmmeter'],
              ['Hipot', 'hipot']
            ] as const).map(([label, key]) => (
              <tr key={key}>
                <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">{label}</div><div>{(form.equipmentUsed as any)[key]?.name || ''}</div></td>
                <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">Serial Number</div><div>{(form.equipmentUsed as any)[key]?.serialNumber || ''}</div></td>
                <td className="p-2 align-middle text-center border border-gray-300 print:border-black"><div className="font-semibold">AMP ID</div><div>{(form.equipmentUsed as any)[key]?.ampId || ''}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const comments = (
    <section className={`mb-6 print:break-inside-avoid ${!form.comments?.trim() ? 'print:hidden' : ''}`}>
      <div className="w-full h-1 bg-[#f26722] mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
      <textarea className="form-textarea w-full print:hidden" rows={4} value={form.comments} onChange={e => setForm(p => ({ ...p, comments: e.target.value }))} readOnly={!isEditMode} />
      {form.comments?.trim() && (
      <div className="hidden print:block">
        <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print-comment-table">
          <tbody>
            <tr>
              <td className="p-2 align-top border border-gray-300 print:border-black">
                <div className="font-semibold">Comments</div>
                <div className="mt-0 whitespace-pre-wrap">{form.comments}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]"><span>Loading...</span></div>
    );
  }

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
          alt="AMP Logo"
          className="h-10 w-auto"
          style={{ maxHeight: 40 }}
        />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportTitle}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - MTS 7.5.1.2
          <div className="mt-2">
            <div
              className={`pass-fail-status-box ${getPassFailBadgeClass(status)}`}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                width: 'fit-content',
                borderRadius: '6px',
                border: status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: status === 'PASS' ? '#22c55e' : '#ef4444',
                color: 'white',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                boxSizing: 'border-box',
                minWidth: '50px'
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </div>

      {/* Screen Header - hidden during print */}
      <div className="print:hidden">
        {header}
      </div>
      {jobInfo}
      {nameplate}
      {visual}
      {fuseData}
      {electrical}
      {equipment}
      {comments}      {/* Mark Ready to Review Button */}
      {!isPrintMode && isEditMode && (
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

export default MediumVoltageSwitchMTSReport;


