import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { getReportName, getAssetName } from './reportMappings';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

// Temperature Correction Factor (TCF) table and helper (copied from PanelboardReport)
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
  const rounded = Math.round(celsius);
  const key = String(rounded);
  return tcfTable[key] !== undefined ? tcfTable[key] : 1;
};

const TestStatus = { PASS: 'PASS', FAIL: 'FAIL' } as const;
type Status = typeof TestStatus[keyof typeof TestStatus];

interface JobTemp { fahrenheit: number; celsius: number; tcf: number; humidity: number | string; }
interface SwitchRow { position: string; manufacturer: string; catalogNo: string; serialNo: string; type: string; ratedAmperage: string; ratedVoltage: string; }
interface FuseRow { position: string; manufacturer: string; catalogNo: string; fuseClass: string; amperage: string; aic: string; voltage: string; }
interface IRRow {
  position: string;
  // Pole to Pole (switch open)
  p1p2: string; p2p3: string; p3p1: string;
  // Pole to Frame (switch closed)
  p1_frame: string; p2_frame: string; p3_frame: string;
  // Line to Load (switch closed)
  p1_line: string; p2_line: string; p3_line: string;
}
interface ContactRow { position: string; switchOnly: string; fuseOnly: string; switchPlusFuse: string; units: string; }
interface VisualInspectionItem { identifier: string; values: Record<string, string>; }

interface FormData {
  // Job info
  customer: string; jobNumber: string; technicians: string; date: string; identifier: string;
  substation: string; eqptLocation: string; user: string; temperature: JobTemp; status: Status;

  // Enclosure
  enclosure: {
    manufacturer: string; systemVoltage: string; catalogNo: string; ratedVoltage: string;
    serialNumber: string; ratedCurrent: string; series: string; aicRating: string; type: string; phaseConfiguration: string;
  };

  // Tables
  switches: SwitchRow[];
  fuses: FuseRow[];
  irMeasured: IRRow[];
  irCorrected: IRRow[];
  contact: ContactRow[];
  visualInspection: { items: VisualInspectionItem[] };
  irTestVoltage: string;
  irUnits: string;

  // Equipment and comments
  equipment: { megger: string; meggerSerial: string; meggerAmpId: string; lowRes: string; lowResSerial: string; lowResAmpId: string; };
  comments: string;
}

const makeArray = <T,>(n: number, fn: () => T) => Array.from({ length: n }, fn);

const LowVoltageSwitchMultiDeviceTest: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const reportName = getReportName('low-voltage-switch-multi-device-test');
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [saving, setSaving] = useState<boolean>(false);
  const [formData, setFormData] = useState<FormData>({
    customer: '', jobNumber: '', technicians: '', date: new Date().toISOString().split('T')[0], identifier: '',
    substation: '', eqptLocation: '', user: '', temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 }, status: TestStatus.PASS,
    enclosure: { manufacturer: '', systemVoltage: '', catalogNo: '', ratedVoltage: '', serialNumber: '', ratedCurrent: '', series: '', aicRating: '', type: '', phaseConfiguration: '' },
    switches: makeArray<SwitchRow>(6, () => ({ position: '', manufacturer: '', catalogNo: '', serialNo: '', type: '', ratedAmperage: '', ratedVoltage: '' })),
    fuses: makeArray<FuseRow>(6, () => ({ position: '', manufacturer: '', catalogNo: '', fuseClass: '', amperage: '', aic: '', voltage: '' })),
    irMeasured: makeArray<IRRow>(6, () => ({ position: '', p1p2: '', p2p3: '', p3p1: '', p1_frame: '', p2_frame: '', p3_frame: '', p1_line: '', p2_line: '', p3_line: '' })),
    irCorrected: makeArray<IRRow>(6, () => ({ position: '', p1p2: '', p2p3: '', p3p1: '', p1_frame: '', p2_frame: '', p3_frame: '', p1_line: '', p2_line: '', p3_line: '' })),
    contact: makeArray<ContactRow>(6, () => ({ position: '', switchOnly: '', fuseOnly: '', switchPlusFuse: '', units: 'µΩ' })),
    visualInspection: { items: makeArray<VisualInspectionItem>(5, () => ({ identifier: '', values: {} })) },
    irTestVoltage: '1000V',
    irUnits: 'MΩ',
    equipment: { megger: '', meggerSerial: '', meggerAmpId: '', lowRes: '', lowResSerial: '', lowResAmpId: '' },
    comments: '',
  });

  // Load job information when component mounts
  useEffect(() => {
    if (jobId) {
      loadJobInfo();
    }
  }, [jobId]);

  // Keep Fahrenheit/Celsius/TCF in sync using the shared TCF table
  useEffect(() => {
    const c = Math.round((formData.temperature.fahrenheit - 32) * 5 / 9);
    const tcf = getTCF(c);
    if (c !== formData.temperature.celsius || tcf !== formData.temperature.tcf) {
      setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, celsius: c, tcf } }));
    }
  }, [formData.temperature.fahrenheit]);

  // Auto-calculate Temperature Corrected Insulation Resistance (TCIR)
  useEffect(() => {
    const tcf = Number(formData.temperature.tcf) || 1;

    const multiply = (val: string): string => {
      const num = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
      if (Number.isNaN(num)) return val || '';
      const result = num * tcf;
      const fixed = Math.round((result + Number.EPSILON) * 100) / 100;
      return String(fixed);
    };

    const nextCorrected = formData.irMeasured.map(row => ({
      position: row.position,
      p1p2: multiply(row.p1p2),
      p2p3: multiply(row.p2p3),
      p3p1: multiply(row.p3p1),
      p1_frame: multiply(row.p1_frame),
      p2_frame: multiply(row.p2_frame),
      p3_frame: multiply(row.p3_frame),
      p1_line: multiply(row.p1_line),
      p2_line: multiply(row.p2_line),
      p3_line: multiply(row.p3_line),
    }));

    if (JSON.stringify(nextCorrected) !== JSON.stringify(formData.irCorrected)) {
      setFormData(prev => ({ ...prev, irCorrected: nextCorrected }));
    }
  }, [formData.irMeasured, formData.temperature.tcf]);

  const setField = (path: string, value: any) => {
    setFormData(prev => {
      const clone: any = { ...prev };
      const keys = path.split('.');
      let cur = clone;
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] === undefined) cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return clone;
    });
  };

  // Load job information (customer, job number, technicians, etc.)
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

      // Fetch customer information
      if (jobData?.customer_id) {
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
          setFormData(prev => ({
            ...prev,
            customer: customerData.company_name || customerData.name || '',
            jobNumber: jobData.job_number || '',
            // Set current date if not already set
            date: prev.date || new Date().toISOString().split('T')[0],
            // Set current user if not already set
            user: prev.user || user?.email || '',
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
    }
  };

  // Load existing report from normalized store
  useEffect(() => {
    const loadReport = async () => {
      if (!reportId) return;
      try {
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .select('*')
          .eq('id', reportId)
          .single();
        if (error) throw error;
        if (data && (data as any).data) {
          const d: any = (data as any).data;
          setFormData(prev => ({
            ...prev,
            customer: d.reportInfo?.customer ?? prev.customer,
            jobNumber: d.reportInfo?.jobNumber ?? prev.jobNumber,
            technicians: d.reportInfo?.technicians ?? prev.technicians,
            date: d.reportInfo?.date ?? prev.date,
            identifier: d.reportInfo?.identifier ?? prev.identifier,
            substation: d.reportInfo?.substation ?? prev.substation,
            eqptLocation: d.reportInfo?.eqptLocation ?? prev.eqptLocation,
            user: d.reportInfo?.userName ?? prev.user,
            temperature: {
              fahrenheit: d.reportInfo?.temperature?.fahrenheit ?? prev.temperature.fahrenheit,
              celsius: d.reportInfo?.temperature?.celsius ?? prev.temperature.celsius,
              tcf: d.reportInfo?.temperature?.correctionFactor ?? prev.temperature.tcf,
              humidity: d.reportInfo?.humidity ?? prev.temperature.humidity,
            },
            status: (d.status as Status) ?? prev.status,
            enclosure: {
              manufacturer: d.enclosure?.manufacturer ?? prev.enclosure.manufacturer,
              systemVoltage: d.enclosure?.systemVoltage ?? prev.enclosure.systemVoltage,
              catalogNo: d.enclosure?.catalogNo ?? prev.enclosure.catalogNo,
              ratedVoltage: d.enclosure?.ratedVoltage ?? prev.enclosure.ratedVoltage,
              serialNumber: d.enclosure?.serialNumber ?? prev.enclosure.serialNumber,
              ratedCurrent: d.enclosure?.ratedCurrent ?? prev.enclosure.ratedCurrent,
              series: d.enclosure?.series ?? prev.enclosure.series,
              aicRating: d.enclosure?.aicRating ?? prev.enclosure.aicRating,
              type: d.enclosure?.type ?? prev.enclosure.type,
              phaseConfiguration: d.enclosure?.phaseConfiguration ?? prev.enclosure.phaseConfiguration,
            },
            switches: Array.isArray(d.switches) && d.switches.length > 0 ? d.switches : prev.switches,
            fuses: Array.isArray(d.fuses) && d.fuses.length > 0 ? d.fuses : prev.fuses,
            irMeasured: Array.isArray(d.irTests?.rows) && d.irTests.rows.length > 0
              ? d.irTests.rows.map((r: any) => ({
                  position: r.position || '',
                  p1p2: r.p1p2 || '',
                  p2p3: r.p2p3 || '',
                  p3p1: r.p3p1 || '',
                  p1_frame: r.p1_frame || '',
                  p2_frame: r.p2_frame || '',
                  p3_frame: r.p3_frame || '',
                  p1_line: r.p1_line || '',
                  p2_line: r.p2_line || '',
                  p3_line: r.p3_line || '',
                }))
              : prev.irMeasured,
            irUnits: d.irTests?.units ?? prev.irUnits,
            irTestVoltage: d.irTests?.testVoltage ?? prev.irTestVoltage,
            contact: Array.isArray(d.contactResistance?.rows) && d.contactResistance.rows.length > 0
              ? d.contactResistance.rows.map((r: any) => ({
                  position: r.position || '',
                  switchOnly: r.switchOnly || '',
                  fuseOnly: r.fuseOnly || '',
                  switchPlusFuse: r.switchPlusFuse || '',
                  units: r.units || 'µΩ',
                }))
              : prev.contact,
            equipment: {
              megger: d.equipment?.megger ?? prev.equipment.megger,
              meggerSerial: d.equipment?.meggerSerial ?? prev.equipment.meggerSerial,
              meggerAmpId: d.equipment?.meggerAmpId ?? prev.equipment.meggerAmpId,
              lowRes: d.equipment?.lowRes ?? prev.equipment.lowRes,
              lowResSerial: d.equipment?.lowResSerial ?? prev.equipment.lowResSerial,
              lowResAmpId: d.equipment?.lowResAmpId ?? prev.equipment.lowResAmpId,
            },
            comments: d.reportInfo?.comments ?? prev.comments,
            // Visual and Mechanical mapping from normalized importer with fallbacks
            visualInspection: (() => {
              let items: any[] = [];
              if (Array.isArray(d.visualInspection?.items) && d.visualInspection.items.length > 0) {
                items = d.visualInspection.items.map((it: any) => ({
                  identifier: it?.identifier || '',
                  values: typeof it?.values === 'object' && it?.values !== null ? it.values : {}
                }));
              } else if (Array.isArray(d['vm-matrix']?.rows)) {
                items = d['vm-matrix'].rows.map((r: any) => ({
                  identifier: r?.identifier || '',
                  values: typeof r?.values === 'object' && r?.values !== null ? r.values : {}
                }));
              }
              // Ensure exactly 5 rows for the UI grid
              if (items.length < 5) {
                items = items.concat(Array.from({ length: 5 - items.length }, () => ({ identifier: '', values: {} })));
              } else if (items.length > 5) {
                items = items.slice(0, 5);
              }
              return { items: items.length ? items : prev.visualInspection.items };
            })(),
          }));
          setIsEditing(false);
        }
      } catch (err) {
        console.error('Error loading switch multi-device report:', err);
      }
    };
    if (reportId) loadReport();
  }, [reportId]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    setSaving(true);

    const normalized: any = {
      reportInfo: {
        customer: formData.customer,
        address: '',
        userName: formData.user,
        date: formData.date,
        identifier: formData.identifier,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: {
          fahrenheit: formData.temperature.fahrenheit,
          celsius: formData.temperature.celsius,
          correctionFactor: formData.temperature.tcf,
        },
        humidity: formData.temperature.humidity,
        comments: formData.comments,
      },
      visualInspection: { items: formData.visualInspection.items },
      enclosure: { ...formData.enclosure },
      switches: formData.switches,
      fuses: formData.fuses,
      irTests: {
        testVoltage: formData.irTestVoltage,
        units: formData.irUnits,
        rows: formData.irMeasured.map(r => ({
          position: r.position,
          p1p2: r.p1p2,
          p2p3: r.p2p3,
          p3p1: r.p3p1,
          p1_frame: r.p1_frame,
          p2_frame: r.p2_frame,
          p3_frame: r.p3_frame,
          p1_line: r.p1_line,
          p2_line: r.p2_line,
          p3_line: r.p3_line,
        })),
      },
      contactResistance: { rows: formData.contact },
      equipment: { ...formData.equipment },
      status: formData.status,
      reportType: 'low-voltage-switch-multi-device-test',
    };

    const payload = {
      job_id: jobId,
      user_id: user.id,
      data: normalized,
    };

    try {
      if (reportId) {
        const { error } = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .update(payload)
          .eq('id', reportId)
          .single();
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        const newId = (data as any)?.id as string;
        if (newId) {
          const asset = {
            name: getAssetName('low-voltage-switch-multi-device-test', formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/low-voltage-switch-multi-device-test/${newId}`,
            user_id: user.id,
          } as any;
          const { data: assetRow, error: assetErr } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(asset)
            .select('id')
            .single();
          if (assetErr) throw assetErr;
          if (assetRow?.id) {
            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({ job_id: jobId, asset_id: assetRow.id, user_id: user.id });
          }
        }
      }
      setIsEditing(false);
    } catch (err: any) {
      console.error('Failed to save report:', err);
      alert(`Failed to save report: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleVisualInspectionChange = (rowIndex: number, fieldKey: string, value: string) => {
    setFormData(prev => {
      const next = { ...prev } as any;
      const items: VisualInspectionItem[] = [...next.visualInspection.items];
      while (items.length <= rowIndex) items.push({ identifier: '', values: {} });
      if (fieldKey === 'identifier') {
        items[rowIndex] = { ...items[rowIndex], identifier: value };
      } else {
        items[rowIndex] = {
          ...items[rowIndex],
          values: { ...items[rowIndex].values, [fieldKey]: value }
        };
      }
      next.visualInspection = { items };
      return next;
    });
  };

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - ATS 7.5.1.1
          <div className="mt-2">
            <div
              className="pass-fail-status-box"
              style={{
                display: 'inline-block', padding: '4px 10px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', width: 'fit-content', borderRadius: '6px',
                border: formData.status === TestStatus.PASS ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: formData.status === TestStatus.PASS ? '#22c55e' : '#ef4444', color: 'white', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', minWidth: '50px'
              }}
            >
              {formData.status}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}

      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-8">
          {/* Header (screen only) */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (isEditing) setFormData(p => ({ ...p, status: p.status === TestStatus.PASS ? TestStatus.FAIL : TestStatus.PASS })); }} disabled={!isEditing} className={`px-4 py-2 rounded-md text-white font-medium ${formData.status === TestStatus.PASS ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}>{formData.status}</button>
                {reportId && !isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md">Edit Report</button>
                    <button onClick={() => window.print()} className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md">Print Report</button>
                  </>
                ) : (
                  <button onClick={handleSave} disabled={!isEditing || saving} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}>{saving ? 'Saving...' : 'Save Report'}</button>
                )}
              </div>
            </div>
          </div>

          {/* Job Information */}
          <section className="mb-6 job-info-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Information</h2>
            
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
              <div><label className="form-label">Customer:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.customer} onChange={e=>setField('customer', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Job #:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.jobNumber} onChange={e=>setField('jobNumber', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Technicians:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.technicians} onChange={e=>setField('technicians', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Date:</label><input type="date" className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.date} onChange={e=>setField('date', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Identifier:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.identifier} onChange={e=>setField('identifier', e.target.value)} readOnly={!isEditing} /></div>
              <div className="flex items-center space-x-1">
                <div>
                  <label className="form-label">Temp:</label>
                  <input type="number" value={formData.temperature.fahrenheit} onChange={e=>setField('temperature.fahrenheit', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} />
                  <span className="ml-1 text-xs">°F</span>
                </div>
                <div>
                  <label className="form-label sr-only">Celsius</label>
                  <input type="number" value={formData.temperature.celsius} readOnly className="form-input w-16 bg-gray-100 dark:bg-dark-200" />
                  <span className="ml-1 text-xs">°C</span>
                </div>
              </div>
              <div><label className="form-label">TCF:</label><input type="number" value={formData.temperature.tcf} readOnly className="form-input w-16 bg-gray-100 dark:bg-dark-200" /></div>
              <div><label className="form-label">Humidity:</label><input type="number" value={formData.temperature.humidity as number} onChange={e=>setField('temperature.humidity', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /><span className="ml-1 text-xs">%</span></div>
              <div><label className="form-label">Substation:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.substation} onChange={e=>setField('substation', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Eqpt. Location:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.eqptLocation} onChange={e=>setField('eqptLocation', e.target.value)} readOnly={!isEditing} /></div>
              <div className="md:col-span-2"><label className="form-label">User:</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.user} onChange={e=>setField('user', e.target.value)} readOnly={!isEditing} /></div>
            </div>

            {/* Print-only JobInfoPrintTable */}
            <div className="hidden print:block">
              <JobInfoPrintTable
                data={{
                  customer: formData.customer,
                  address: '',
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
                    humidity: typeof formData.temperature.humidity === 'string' ? parseFloat(formData.temperature.humidity) || 0 : formData.temperature.humidity,
                  },
                }}
              />
            </div>
          </section>

          {/* Visual and Mechanical Inspection */}
          <section className="mb-6 visual-mechanical-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <div className="flex">
                <div className="flex-grow">
                  <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700 visual-inspection-table">
                    <colgroup>
                      <col style={{ width: '25%' }} />
                      {Array.from({ length: 12 }).map((_, i) => (
                        <col key={`vmi-col-${i}`} style={{ width: '6.25%' }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th colSpan={13} className="border border-gray-300 dark:border-gray-700 p-2 text-center bg-gray-50 dark:bg-dark-200">
                          Visual and Mechanical Tests for NETA ATS Section 7.5.1.1.A
                        </th>
                      </tr>
                      <tr className="bg-gray-50 dark:bg-dark-200">
                        <th className="border border-gray-300 dark:border-gray-700 p-2 text-left w-[25%]">Position / Identifier</th>
                        {Array.from({ length: 12 }).map((_, i) => (
                          <th key={i} className="border border-gray-300 dark:border-gray-700 p-2 text-center w-[6.25%]">{i === 7 ? '8.1' : i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 5 }).map((_, rowIndex) => (
                        <tr key={`visual-${rowIndex}`}>
                          <td className="border border-gray-300 dark:border-gray-700 p-2 w-[25%]">
                            {rowIndex === 4 ? (
                              <span>P1-</span>
                            ) : (
                              <input
                                type="text"
                                value={formData.visualInspection.items[rowIndex]?.identifier || ''}
                                onChange={(e) => handleVisualInspectionChange(rowIndex, 'identifier', e.target.value)}
                                readOnly={!isEditing}
                                className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-not-allowed' : ''}`}
                              />
                            )}
                          </td>
                          {Array.from({ length: 12 }).map((_, colIndex) => (
                            <td key={`visual-${rowIndex}-${colIndex}`} className="border border-gray-300 dark:border-gray-700 p-2 w-[6.25%]">
                              <select
                                value={formData.visualInspection.items[rowIndex]?.values[`${colIndex + 1}`] || ''}
                                onChange={(e) => handleVisualInspectionChange(rowIndex, `${colIndex + 1}`, e.target.value)}
                                disabled={!isEditing}
                                className={`w-full bg-transparent border-none focus:ring-0 text-center ${!isEditing ? 'cursor-not-allowed' : ''}`}
                              >
                                <option value=""></option>
                                {['Y','N','N/A'].map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <table className="satisfactory-table border-collapse border border-gray-300 dark:border-gray-700">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-dark-200">
                        <th colSpan={3} className="border border-gray-300 dark:border-gray-700 p-2 text-center">Satisfactory?</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">Yes</td>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">=</td>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">Y</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">No</td>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">=</td>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">N</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">Not</td>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">=</td>
                        <td className="border border-gray-300 dark:border-gray-700 p-2">N/A</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
          {/* Enclosure Data */}
          <section className="mb-6 enclosure-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Enclosure Data</h2>
            
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 print:hidden enclosure-onscreen">
              <div><label className="form-label">Manufacturer</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.manufacturer} onChange={e=>setField('enclosure.manufacturer', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">System Voltage (V)</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.systemVoltage} onChange={e=>setField('enclosure.systemVoltage', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Catalog No.</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.catalogNo} onChange={e=>setField('enclosure.catalogNo', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Rated Voltage (V)</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.ratedVoltage} onChange={e=>setField('enclosure.ratedVoltage', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Serial Number</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.serialNumber} onChange={e=>setField('enclosure.serialNumber', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Rated Current (A)</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.ratedCurrent} onChange={e=>setField('enclosure.ratedCurrent', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Series</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.series} onChange={e=>setField('enclosure.series', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">AIC Rating (kA)</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.aicRating} onChange={e=>setField('enclosure.aicRating', e.target.value)} readOnly={!isEditing} /></div>
              <div><label className="form-label">Type</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.type} onChange={e=>setField('enclosure.type', e.target.value)} readOnly={!isEditing} /></div>
              <div className="md:col-span-3"><label className="form-label">Phase Configuration</label><input className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} value={formData.enclosure.phaseConfiguration} onChange={e=>setField('enclosure.phaseConfiguration', e.target.value)} readOnly={!isEditing} /></div>
            </div>

            {/* Print-only Enclosure Data table */}
            <div className="hidden print:block">
              <table className="min-w-full border border-gray-300 print:border-black">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Manufacturer:</div>
                      <div className="mt-1">{formData.enclosure.manufacturer || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">System Voltage (V):</div>
                      <div className="mt-1">{formData.enclosure.systemVoltage || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Catalog No.:</div>
                      <div className="mt-1">{formData.enclosure.catalogNo || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Rated Voltage (V):</div>
                      <div className="mt-1">{formData.enclosure.ratedVoltage || ''}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-1">{formData.enclosure.serialNumber || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Rated Current (A):</div>
                      <div className="mt-1">{formData.enclosure.ratedCurrent || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Series:</div>
                      <div className="mt-1">{formData.enclosure.series || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">AIC Rating (kA):</div>
                      <div className="mt-1">{formData.enclosure.aicRating || ''}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Type:</div>
                      <div className="mt-1">{formData.enclosure.type || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black" colSpan={3}>
                      <div className="font-semibold">Phase Configuration:</div>
                      <div className="mt-1">{formData.enclosure.phaseConfiguration || ''}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Switch Data */}
          <section className="mb-6 switch-data-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Switch Data</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="px-2 py-2 border">Position / Identifier</th>
                    <th className="px-2 py-2 border">Manufacturer</th>
                    <th className="px-2 py-2 border">Catalog No.</th>
                    <th className="px-2 py-2 border">Serial No.</th>
                    <th className="px-2 py-2 border">Type</th>
                    <th className="px-2 py-2 border text-center" colSpan={2}>
                      <div>Rated</div>
                      <div className="grid grid-cols-2">
                        <div className="border-t border-r border-gray-300 dark:border-gray-700 p-1">Amperage</div>
                        <div className="border-t border-gray-300 dark:border-gray-700 p-1">Voltage</div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.switches.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1 border"><input type="text" value={row.position} onChange={e=>{ const next=[...formData.switches]; next[idx].position=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.manufacturer} onChange={e=>{ const next=[...formData.switches]; next[idx].manufacturer=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.catalogNo} onChange={e=>{ const next=[...formData.switches]; next[idx].catalogNo=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.serialNo} onChange={e=>{ const next=[...formData.switches]; next[idx].serialNo=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.type} onChange={e=>{ const next=[...formData.switches]; next[idx].type=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.ratedAmperage} onChange={e=>{ const next=[...formData.switches]; next[idx].ratedAmperage=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.ratedVoltage} onChange={e=>{ const next=[...formData.switches]; next[idx].ratedVoltage=e.target.value; setField('switches', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Fuse Data */}
          <section className="mb-6 fuse-data-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Fuse Data</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="px-2 py-2 border">Position / Identifier</th>
                    <th className="px-2 py-2 border">Manufacturer</th>
                    <th className="px-2 py-2 border">Catalog No.</th>
                    <th className="px-2 py-2 border">Class</th>
                    <th className="px-2 py-2 border text-center" colSpan={3}>
                      <div>Rated</div>
                      <div className="grid grid-cols-3">
                        <div className="border-t border-r border-gray-300 dark:border-gray-700 p-1">Amperage</div>
                        <div className="border-t border-r border-gray-300 dark:border-gray-700 p-1">AIC</div>
                        <div className="border-t border-gray-300 dark:border-gray-700 p-1">Voltage</div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.fuses.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1 border"><input type="text" value={row.position} onChange={e=>{ const next=[...formData.fuses]; next[idx].position=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.manufacturer} onChange={e=>{ const next=[...formData.fuses]; next[idx].manufacturer=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.catalogNo} onChange={e=>{ const next=[...formData.fuses]; next[idx].catalogNo=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.fuseClass} onChange={e=>{ const next=[...formData.fuses]; next[idx].fuseClass=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.amperage} onChange={e=>{ const next=[...formData.fuses]; next[idx].amperage=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.aic} onChange={e=>{ const next=[...formData.fuses]; next[idx].aic=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="px-2 py-1 border"><input type="text" value={row.voltage} onChange={e=>{ const next=[...formData.fuses]; next[idx].voltage=e.target.value; setField('fuses', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Measured Insulation Resistance Values */}
          <section className="mb-6 insulation-measured-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Measured Insulation Resistance Values</h2>
              <div className="mb-2 flex items-center">
                <label className="mr-2 text-sm">Test Voltage:</label>
                <select value={formData.irTestVoltage} onChange={e=>setField('irTestVoltage', e.target.value)} disabled={!isEditing} className={`w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`}>
                  {['250V','500V','1000V','2500V','5000V','10000V'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="border px-2 py-2 bg-gray-50 dark:bg-dark-200"></th>
                    <th colSpan={9} className="border px-2 py-2 text-center bg-gray-50 dark:bg-dark-200">Insulation Resistance</th>
                    <th className="border px-2 py-2 bg-gray-50 dark:bg-dark-200">Units</th>
                  </tr>
                  <tr>
                    <th className="border px-2 py-2" rowSpan={2}>Position / Identifier</th>
                    <th className="border px-2 py-2 text-center" colSpan={3}>Pole to Pole (switch open)</th>
                    <th className="border px-2 py-2 text-center" colSpan={3}>Pole to Frame (switch closed)</th>
                    <th className="border px-2 py-2 text-center" colSpan={3}>Line to Load (switch closed)</th>
                    <th className="border px-2 py-2" rowSpan={2}>Units</th>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className="border px-2 py-2 text-center">P1-P2</th>
                    <th className="border px-2 py-2 text-center">P2-P3</th>
                    <th className="border px-2 py-2 text-center">P3-P1</th>
                    <th className="border px-2 py-2 text-center">P1</th>
                    <th className="border px-2 py-2 text-center">P2</th>
                    <th className="border px-2 py-2 text-center">P3</th>
                    <th className="border px-2 py-2 text-center">P1</th>
                    <th className="border px-2 py-2 text-center">P2</th>
                    <th className="border px-2 py-2 text-center">P3</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.irMeasured.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border px-2 py-1"><input type="text" value={row.position} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].position=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p1p2} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p1p2=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p2p3} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p2p3=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p3p1} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p3p1=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p1_frame} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p1_frame=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p2_frame} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p2_frame=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p3_frame} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p3_frame=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p1_line} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p1_line=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p2_line} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p2_line=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p3_line} onChange={e=>{ const next=[...formData.irMeasured]; next[idx].p3_line=e.target.value; setField('irMeasured', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1 text-sm">{formData.irUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Temperature Corrected Insulation Resistance Values */}
          <section className="mb-6 insulation-corrected-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Temperature Corrected Insulation Resistance Values</h2>
              <div className="mb-2 text-sm text-gray-700 print:text-black">Corrected values are auto-calculated as Measured × TCF.</div>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="border px-2 py-2 bg-gray-50 dark:bg-dark-200"></th>
                    <th colSpan={9} className="border px-2 py-2 text-center bg-gray-50 dark:bg-dark-200">Insulation Resistance</th>
                    <th className="border px-2 py-2 bg-gray-50 dark:bg-dark-200">Units</th>
                  </tr>
                  <tr>
                    <th className="border px-2 py-2" rowSpan={2}>Position / Identifier</th>
                    <th className="border px-2 py-2 text-center" colSpan={3}>Pole to Pole</th>
                    <th className="border px-2 py-2 text-center" colSpan={3}>Pole to Frame</th>
                    <th className="border px-2 py-2 text-center" colSpan={3}>Line to Load</th>
                    <th className="border px-2 py-2" rowSpan={2}>Units</th>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className="border px-2 py-2 text-center">P1-P2</th>
                    <th className="border px-2 py-2 text-center">P2-P3</th>
                    <th className="border px-2 py-2 text-center">P3-P1</th>
                    <th className="border px-2 py-2 text-center">P1-Frame</th>
                    <th className="border px-2 py-2 text-center">P2-Frame</th>
                    <th className="border px-2 py-2 text-center">P3-Frame</th>
                    <th className="border px-2 py-2 text-center">P1</th>
                    <th className="border px-2 py-2 text-center">P2</th>
                    <th className="border px-2 py-2 text-center">P3</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.irCorrected.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border px-2 py-1"><input type="text" value={row.position} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].position=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p1p2} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p1p2=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p2p3} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p2p3=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p3p1} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p3p1=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p1_frame} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p1_frame=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p2_frame} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p2_frame=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p3_frame} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p3_frame=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p1_line} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p1_line=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p2_line} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p2_line=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.p3_line} onChange={e=>{ const next=[...formData.irCorrected]; next[idx].p3_line=e.target.value; setField('irCorrected', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1 text-sm">{formData.irUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Electrical Tests - Contact Resistance */}
          <section className="mb-6 contact-resistance-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Contact Resistance</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700">
                <thead>
                  <tr>
                    <th className="border px-2 py-2">Position / Identifier</th>
                    <th className="border px-2 py-2">Switch</th>
                    <th className="border px-2 py-2">Fuse</th>
                    <th className="border px-2 py-2">Switch + Fuse</th>
                    <th className="border px-2 py-2">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.contact.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border px-2 py-1"><input type="text" value={row.position} onChange={e=>{ const next=[...formData.contact]; next[idx].position=e.target.value; setField('contact', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.switchOnly} onChange={e=>{ const next=[...formData.contact]; next[idx].switchOnly=e.target.value; setField('contact', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.fuseOnly} onChange={e=>{ const next=[...formData.contact]; next[idx].fuseOnly=e.target.value; setField('contact', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.switchPlusFuse} onChange={e=>{ const next=[...formData.contact]; next[idx].switchPlusFuse=e.target.value; setField('contact', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                      <td className="border px-2 py-1"><input type="text" value={row.units} onChange={e=>{ const next=[...formData.contact]; next[idx].units=e.target.value; setField('contact', next); }} readOnly={!isEditing} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* NETA Reference */}
          <section className="mb-6 neta-reference-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">NETA Reference</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-700">
                <thead>
                  <tr>
                    <th className="border px-2 py-2">Section</th>
                    <th className="border px-2 py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['7.5.11.A.1', 'Compare equipment data with drawings & specifications'],
                    ['7.5.11.A.3', 'Inspect physical & mechanical condition'],
                    ['7.5.11.A.4', 'Verify the unit is clean'],
                    ['7.5.11.A.5', 'Verify correct blade alignment, blade penetration, travel stops, & mechanical operation'],
                    ['7.5.11.A.6', 'Verify fusing sizes & types are in accordance with drawings, short circuit, & coordination study'],
                    ['7.5.11.A.7', 'Verify each fuse has adequate mechanical support & contact integrity'],
                    ['7.5.11.A.8.1', 'Inspect bolted electrical connections for resistance utilizing a low resistance ohmmeter'],
                    ['7.5.11.A.9', 'Verify operation & sequencing of interlocking systems'],
                    ['7.5.11.A.10', 'Verify correct phase barrier installation'],
                    ['7.5.11.A.11', 'Verify correct operation of all indicating & control devices'],
                    ['7.5.11.A.12', 'Verify appropriate lubrication on moving current carrying parts & on moving and sliding surfaces'],
                  ].map(([sec, desc]) => (
                    <tr key={sec as string}>
                      <td className="border px-2 py-1 text-sm">{sec}</td>
                      <td className="border px-2 py-1 text-sm">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Equipment Used */}
          <section className="mb-6 test-equipment-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
            
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden test-eqpt-onscreen">
              <div><label className="form-label">Megohmmeter</label><input value={formData.equipment.megger} onChange={e=>setField('equipment.megger', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></div>
              <div><label className="form-label">Serial Number</label><input value={formData.equipment.meggerSerial} onChange={e=>setField('equipment.meggerSerial', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></div>
              <div><label className="form-label">AMP ID</label><input value={formData.equipment.meggerAmpId} onChange={e=>setField('equipment.meggerAmpId', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></div>
              <div><label className="form-label">Low Resistance</label><input value={formData.equipment.lowRes} onChange={e=>setField('equipment.lowRes', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></div>
              <div><label className="form-label">Serial Number</label><input value={formData.equipment.lowResSerial} onChange={e=>setField('equipment.lowResSerial', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></div>
              <div><label className="form-label">AMP ID</label><input value={formData.equipment.lowResAmpId} onChange={e=>setField('equipment.lowResAmpId', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''}`} /></div>
            </div>

            {/* Print-only Test Equipment table */}
            <div className="hidden print:block">
              <table className="min-w-full border border-gray-300 print:border-black">
                <colgroup>
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Megohmmeter</div>
                      <div className="mt-1">{formData.equipment.megger || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Serial Number</div>
                      <div className="mt-1">{formData.equipment.meggerSerial || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">AMP ID</div>
                      <div className="mt-1">{formData.equipment.meggerAmpId || ''}</div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Low Resistance</div>
                      <div className="mt-1">{formData.equipment.lowRes || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">Serial Number</div>
                      <div className="mt-1">{formData.equipment.lowResSerial || ''}</div>
                    </td>
                    <td className="p-2 border border-gray-300 print:border-black">
                      <div className="font-semibold">AMP ID</div>
                      <div className="mt-1">{formData.equipment.lowResAmpId || ''}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Comments */}
          <section className="mb-6 comments-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
            
            {/* On-screen form - hidden in print */}
            <textarea 
              value={formData.comments} 
              onChange={e=>setField('comments', e.target.value)} 
              readOnly={!isEditing} 
              rows={4} 
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200':''} print:hidden comments-onscreen`} 
            />

            {/* Print-only Comments table */}
            <div className="hidden print:block">
              <table className="min-w-full border border-gray-300 print:border-black">
                <tbody>
                  <tr>
                    <td className="p-4 border border-gray-300 print:border-black">
                      <div className="font-semibold mb-2">Comments:</div>
                      <div className="whitespace-pre-wrap">{formData.comments || ''}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default LowVoltageSwitchMultiDeviceTest;

// Print styles (scoped)
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide number input arrows globally (screen + print) */
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
    input[type="number"] { -moz-appearance: textfield !important; }

    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      * { color: black !important; }
      header, nav, .navigation, [class*="nav"], [class*="header"], .sticky, [class*="sticky"], .print\\:hidden { display: none !important; }
      button:not(.print-visible) { display: none !important; }

      table { border-collapse: collapse; width: 100% !important; table-layout: fixed !important; }
      th, td { border: 1px solid black !important; padding: 2px 3px !important; font-size: 8px !important; line-height: 1.05 !important; vertical-align: middle !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }

      /* Visual & Mechanical: match on-screen layout exactly */
      .visual-mechanical-section .visual-inspection-table { table-layout: fixed !important; }
      .visual-mechanical-section .visual-inspection-table col:nth-child(1) { width: 25% !important; }
      .visual-mechanical-section .visual-inspection-table col:nth-child(n+2):nth-child(-n+13) { width: 6.25% !important; }
      .visual-mechanical-section .visual-inspection-table th,
      .visual-mechanical-section .visual-inspection-table td {
        text-align: center !important;
        padding: 2px 3px !important;
        font-size: 8px !important;
        line-height: 1 !important;
        height: 12px !important;
      }
      .visual-mechanical-section .visual-inspection-table td:first-child,
      .visual-mechanical-section .visual-inspection-table th:first-child { text-align: left !important; }
      
      /* Keep legend tight and aligned to the right of the table */
      .visual-mechanical-section .satisfactory-table { width: auto !important; }
      .visual-mechanical-section .satisfactory-table th,
      .visual-mechanical-section .satisfactory-table td { font-size: 8px !important; padding: 2px 3px !important; line-height: 1 !important; }
      
      /* Remove internal vertical dividing line artifacts in print */
      .visual-mechanical-section .visual-inspection-table td,
      .visual-mechanical-section .visual-inspection-table th { border-color: black !important; }
      
      /* Hide form controls in V&M cells during print to avoid duplicate letters */
      .visual-mechanical-section select { display: none !important; }
      
      /* Show the selected values in print by making them visible */
      .visual-mechanical-section .visual-inspection-table tbody td:nth-child(n+2) { 
        color: black !important; 
        text-align: center !important;
        font-size: 8px !important;
        font-weight: bold !important;
      }

      /* Show Position/Identifier values in print */
      .visual-mechanical-section .visual-inspection-table tbody td:first-child { 
        color: black !important; 
        text-align: left !important;
        font-size: 8px !important;
        font-weight: bold !important;
      }

      /* Make input values visible in print by overriding the display:none */
      .visual-mechanical-section .visual-inspection-table tbody td:first-child input[type="text"] { 
        display: block !important; 
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        font-size: 8px !important;
        font-weight: bold !important;
        color: black !important;
        width: 100% !important;
      }

      /* Insulation tables: exact column widths */
      /* Make Position/Identifier smaller to spread readings */
      .insulation-measured-section table { table-layout: fixed !important; }
      .insulation-corrected-section table { table-layout: fixed !important; }
      .insulation-measured-section table col:nth-child(1),
      .insulation-corrected-section table col:nth-child(1) { width: 12% !important; }
      .insulation-measured-section table col:nth-child(n+2):nth-child(-n+10),
      .insulation-corrected-section table col:nth-child(n+2):nth-child(-n+10) { width: 9% !important; }
      .insulation-measured-section table col:nth-child(11),
      .insulation-corrected-section table col:nth-child(11) { width: 7% !important; }

      /* Switch Data: shrink first col, redistribute others */
      .switch-data-section table { table-layout: fixed !important; }
      .switch-data-section table th:first-child,
      .switch-data-section table td:first-child { width: 12% !important; text-align: left !important; }
      .switch-data-section table th:nth-child(2), .switch-data-section table td:nth-child(2) { width: 16% !important; }
      .switch-data-section table th:nth-child(3), .switch-data-section table td:nth-child(3) { width: 14% !important; }
      .switch-data-section table th:nth-child(4), .switch-data-section table td:nth-child(4) { width: 14% !important; }
      .switch-data-section table th:nth-child(5), .switch-data-section table td:nth-child(5) { width: 10% !important; }
      .switch-data-section table th:nth-child(6), .switch-data-section table td:nth-child(6) { width: 17% !important; }
      .switch-data-section table th:nth-child(7), .switch-data-section table td:nth-child(7) { width: 17% !important; }

      /* Fuse Data: shrink first col, redistribute */
      .fuse-data-section table { table-layout: fixed !important; }
      .fuse-data-section table th:first-child,
      .fuse-data-section table td:first-child { width: 12% !important; text-align: left !important; }
      .fuse-data-section table th:nth-child(2), .fuse-data-section table td:nth-child(2) { width: 14% !important; }
      .fuse-data-section table th:nth-child(3), .fuse-data-section table td:nth-child(3) { width: 12% !important; }
      .fuse-data-section table th:nth-child(4), .fuse-data-section table td:nth-child(4) { width: 8% !important; }
      .fuse-data-section table th:nth-child(5), .fuse-data-section table td:nth-child(5) { width: 18% !important; }
      .fuse-data-section table th:nth-child(6), .fuse-data-section table td:nth-child(6) { width: 18% !important; }
      .fuse-data-section table th:nth-child(7), .fuse-data-section table td:nth-child(7) { width: 18% !important; }

      /* Contact Resistance: shrink first col */
      .contact-resistance-section table { table-layout: fixed !important; }
      .contact-resistance-section table th:first-child,
      .contact-resistance-section table td:first-child { width: 12% !important; text-align: left !important; }
      .contact-resistance-section table th:nth-child(2), .contact-resistance-section table td:nth-child(2) { width: 26% !important; }
      .contact-resistance-section table th:nth-child(3), .contact-resistance-section table td:nth-child(3) { width: 26% !important; }
      .contact-resistance-section table th:nth-child(4), .contact-resistance-section table td:nth-child(4) { width: 26% !important; }
      .contact-resistance-section table th:nth-child(5), .contact-resistance-section table td:nth-child(5) { width: 10% !important; }

      /* NETA Reference: larger font, section on far left, description spans */
      .neta-reference-section table { table-layout: fixed !important; width: 100% !important; }
      .neta-reference-section table th:first-child,
      .neta-reference-section table td:first-child { width: 10% !important; text-align: left !important; }
      .neta-reference-section table th:nth-child(2),
      .neta-reference-section table td:nth-child(2) { width: 90% !important; text-align: left !important; }
      .neta-reference-section table th, .neta-reference-section table td {
        font-size: 14px !important;
        line-height: 1.25 !important;
        padding: 4px 6px !important;
        white-space: normal !important;
        word-break: break-word !important;
      }

      input:not([type="checkbox"]):not([type="radio"]), select, textarea {
        background-color: white !important; border: 1px solid black !important; color: black !important;
        padding: 2px !important; font-size: 10px !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important;
      }
      select { background-image: none !important; padding-right: 8px !important; }
      /* Screen/print visibility helpers */
      .screen-only { display: inline; }
      .print-only { display: none; }
      @media print {
        .screen-only { display: none !important; }
        .print-only { display: inline !important; }
      }
      
      /* Force layout for Visual & Mechanical section in print */
      @media print {
        .visual-mechanical-section .overflow-x-auto { overflow: visible !important; }
        .visual-mechanical-section .flex { display: grid !important; grid-template-columns: 1fr 140px !important; column-gap: 12px !important; align-items: start !important; }
        .visual-mechanical-section .flex > .flex-grow { width: 100% !important; }
        .visual-mechanical-section .satisfactory-table { width: 140px !important; }
        .visual-mechanical-section .visual-inspection-table { width: 100% !important; }
      }

      .insulation-measured-section table input,
      .insulation-corrected-section table input { width: 100% !important; font-size: 9px !important; padding: 1px !important; }

      /* Hide on-screen elements in print */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      .enclosure-onscreen, .enclosure-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .comments-onscreen, .comments-onscreen * { display: none !important; }

      /* Enclosure Data print table styling */
      .enclosure-section table { table-layout: fixed !important; }
      .enclosure-section table th, .enclosure-section table td {
        font-size: 10px !important;
        line-height: 1.2 !important;
        padding: 4px 6px !important;
      }

      /* Test Equipment print table styling */
      .test-equipment-section table { table-layout: fixed !important; }
      .test-equipment-section table th, .test-equipment-section table td {
        font-size: 10px !important;
        line-height: 1.2 !important;
        padding: 4px 6px !important;
      }

      /* Comments print table styling */
      .comments-section table { table-layout: fixed !important; }
      .comments-section table th, .comments-section table td {
        font-size: 10px !important;
        line-height: 1.2 !important;
        padding: 4px 6px !important;
      }

      section { break-inside: avoid !important; margin-bottom: 20px !important; page-break-inside: avoid !important; }
      .grid { display: grid !important; }
      .flex { display: flex !important; }
    }
  `;
  document.head.appendChild(style);
}


