import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ReportWrapper } from './ReportWrapper';
import { getAssetName, getReportName } from './reportMappings';
import JobInfoPrintTable from './common/JobInfoPrintTable';

// Route slug and DB table placeholders
const REPORT_SLUG = 'grounding-system-master';
const TABLE_NAME = 'grounding_system_master_reports';

const GroundingSystemMaster: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');
  const [identifier, setIdentifier] = useState<string>('');
  const [jobInfo, setJobInfo] = useState({
    customer: '',
    address: '',
    user: '',
    date: '',
    jobNumber: '',
    technicians: '',
    substation: '',
    eqptLocation: '',
    temperature: { fahrenheit: 68, celsius: 20, humidity: 0 }
  });

  // Master table rows
  const [rowCount, setRowCount] = useState<number>(50);
  const createRow = (index: number) => ({
    pointLabel: `PTP #${index + 1}`,
    location: '', from: '', to: '', measurement: '', date: '', technicians: '', status: 'PASS' as 'PASS' | 'FAIL', manuf: '', ampId: '', tempC: '', humidity: '', c2: '', p2: '', lastRainfall: '', comments: ''
  });
  type Row = {
    pointLabel: string; // PTP #1 etc
    location: string;
    from: string;
    to: string;
    measurement: string;
    date: string;
    status: 'PASS' | 'FAIL';
    technicians: string;
    manuf: string;
    ampId: string;
    tempC: string;
    humidity: string;
    c2: string; // Fall-of-Potential ONLY
    p2: string; // Fall-of-Potential ONLY
    lastRainfall: string;
    comments: string;
  };
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: rowCount }, (_, i) => createRow(i)));

  // When rowCount changes, resize rows while preserving data
  useEffect(() => {
    setRows(prev => {
      if (rowCount === prev.length) return prev;
      if (rowCount < prev.length) {
        return prev.slice(0, rowCount).map((r, i) => ({ ...r, pointLabel: `PTP #${i + 1}` }));
      }
      const extra = Array.from({ length: rowCount - prev.length }, (_, k) => createRow(prev.length + k));
      return [...prev.map((r, i) => ({ ...r, pointLabel: `PTP #${i + 1}` })), ...extra];
    });
  }, [rowCount]);

  // Auto-load job information (match other reports)
  useEffect(() => {
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

        let customerName = '';
        let customerAddress = '';
        const siteAddress = (jobData as any)?.site_address || '';
        if (jobData?.customer_id) {
          const { data: cust, error: custErr } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();
          if (!custErr && cust) {
            customerName = cust.name || cust.company_name || '';
            customerAddress = cust.address || '';
          }
        }

        setJobInfo(prev => ({
          ...prev,
          customer: customerName || prev.customer,
          address: siteAddress || customerAddress || prev.address,
          jobNumber: jobData?.job_number || prev.jobNumber,
        }));
      } catch {
        // ignore
      }
    };
    loadJobInfo();
  }, [jobId]);

  const reportName = getReportName(REPORT_SLUG) || 'Grounding System MASTER';
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const [scrollMax, setScrollMax] = useState<number>(0);
  const [scrollValue, setScrollValue] = useState<number>(0);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;
    const update = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      setScrollMax(max);
      setScrollValue(el.scrollLeft);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update as any);
    };
  }, []);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    const el = tableWrapperRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;
    e.preventDefault();
  };

  const onHeaderMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = tableWrapperRef.current;
    if (!el) return;
    const delta = e.clientX - dragStartXRef.current;
    el.scrollLeft = Math.max(0, Math.min(startScrollLeftRef.current - delta, el.scrollWidth - el.clientWidth));
  };

  const onHeaderMouseUp = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const loadExisting = async () => {
      if (!reportId) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .schema('neta_ops')
          .from(TABLE_NAME)
          .select('*')
          .eq('id', reportId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const info = (data as any).report_info || {};
          setIdentifier(String(info.identifier || ''));
          setStatus((String(info.status || 'PASS') === 'FAIL') ? 'FAIL' : 'PASS');
          // Populate job info from saved record
          setJobInfo(prev => ({
            ...prev,
            customer: info.customer ?? prev.customer,
            address: info.address ?? prev.address,
            user: info.user ?? prev.user,
            date: info.date ?? prev.date,
            jobNumber: info.jobNumber ?? prev.jobNumber,
            technicians: info.technicians ?? prev.technicians,
            substation: info.substation ?? prev.substation,
            eqptLocation: info.eqptLocation ?? prev.eqptLocation,
            temperature: {
              fahrenheit: info.temperature?.fahrenheit ?? prev.temperature.fahrenheit,
              celsius: info.temperature?.celsius ?? prev.temperature.celsius,
              humidity: info.temperature?.humidity ?? prev.temperature.humidity,
            }
          }));
          // Load master rows if present
          if (Array.isArray((data as any).rows)) {
            const savedRows = (data as any).rows as any[];
            setRows(savedRows.map((r: any, i: number) => ({
              pointLabel: r.pointLabel || `PTP #${i + 1}`,
              location: r.location || '',
              from: r.from || '',
              to: r.to || '',
              measurement: r.measurement || '',
              date: r.date || '',
              status: (r.status === 'FAIL' ? 'FAIL' : 'PASS'),
              technicians: r.technicians || '',
              manuf: r.manuf || '',
              ampId: r.ampId || '',
              tempC: r.tempC || '',
              humidity: r.humidity || '',
              c2: r.c2 || '',
              p2: r.p2 || '',
              lastRainfall: r.lastRainfall || '',
              comments: r.comments || ''
            })));
            setRowCount(savedRows.length || rowCount);
          }
          setIsEditing(false);
        }
      } catch (e) {
        // noop for blank page
      } finally {
        setLoading(false);
      }
    };
    loadExisting();
  }, [reportId]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    try {
      setLoading(true);
      let result;
      const payload = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          ...jobInfo,
          identifier,
          status,
          title: reportName,
        },
        rows,
      } as any;

      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from(TABLE_NAME)
          .update(payload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from(TABLE_NAME)
          .insert(payload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(REPORT_SLUG, identifier || ''),
            file_url: `report:/jobs/${jobId}/${REPORT_SLUG}/${result.data.id}`,
            user_id: user.id,
          };
          const { data: assetResult } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();
          if (assetResult?.id) {
            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
          }
        }
      }

      if (result?.error) throw result.error;
      setIsEditing(false);
      navigate(`/jobs/${jobId}`);
    } catch (e) {
      // Keep blank minimal behavior
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportWrapper>
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {/* Global print header (hidden now in favor of per-row headers) */}
          <div className="hidden">
            <div className="relative flex items-center justify-between border-b-2 border-gray-800 pb-4 mb-4">
              <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto relative" style={{ maxHeight: 40, zIndex: 1 }} />
              <div className="absolute left-0 right-0 text-center" style={{ zIndex: 0, pointerEvents: 'none', background: 'transparent' }}>
                <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
              </div>
              <div className="text-right font-extrabold text-xl relative" style={{ color: '#1a4e7c', zIndex: 1 }}>
                NETA - MTS 7.13
              </div>
            </div>
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          </div>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">{reportName}</h1>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
              <button
                onClick={() => { if (isEditing) setStatus(status === 'PASS' ? 'FAIL' : 'PASS'); }}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' : 'bg-red-600 text-white focus:ring-red-500'
                } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
                disabled={!isEditing}
              >
                {status}
              </button>
              {reportId && !isEditing ? (
                <>
                  <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Edit Report</button>
                  <button onClick={() => window.print()} className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Print Report</button>
                </>
              ) : (
                <button onClick={handleSave} disabled={!isEditing || loading} className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90 disabled:opacity-50'}`}>{loading ? 'Saving...' : (reportId ? 'Update Report' : 'Save Report')}</button>
              )}
            </div>
          </div>

          {/* Job Information - on-screen editable, hidden in print */}
          <section className="p-0 print:hidden">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 job-info-onscreen">
              {/* Left Column */}
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Customer</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.customer} onChange={(e)=>setJobInfo(p=>({...p, customer:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Site Address</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.address} onChange={(e)=>setJobInfo(p=>({...p, address:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">User</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.user} onChange={(e)=>setJobInfo(p=>({...p, user:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Date</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="date" value={jobInfo.date} onChange={(e)=>setJobInfo(p=>({...p, date:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Identifier</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={identifier} onChange={(e)=>setIdentifier(e.target.value)} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
              </div>
              {/* Right Column */}
              <div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Job #</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.jobNumber} onChange={(e)=>setJobInfo(p=>({...p, jobNumber:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Technicians</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.technicians} onChange={(e)=>setJobInfo(p=>({...p, technicians:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex items-center">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Temp.</label>
                  <div className="flex-1 flex items-center">
                    <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                      <input type="number" value={jobInfo.temperature.fahrenheit} onChange={(e)=>setJobInfo(p=>({...p, temperature:{...p.temperature, fahrenheit:Number(e.target.value), celsius: Math.round(((Number(e.target.value) - 32) * 5) / 9)}}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                    </div>
                    <span className="mx-2">°F</span>
                    <span className="mx-2">{jobInfo.temperature.celsius}</span>
                    <span className="mx-2">°C</span>
                    <span className="mx-5">TCF</span>
                    <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                      <input type="text" value={"1.000"} readOnly className="w-full bg-transparent border-none focus:ring-0 cursor-default" />
                    </div>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Humidity</label>
                  <div className="flex items-center flex-1">
                    <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                      <input type="number" value={jobInfo.temperature.humidity} onChange={(e)=>setJobInfo(p=>({...p, temperature:{...p.temperature, humidity:Number(e.target.value)}}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                    </div>
                    <span className="ml-2">%</span>
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Substation</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.substation} onChange={(e)=>setJobInfo(p=>({...p, substation:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Eqpt. Location</label>
                  <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                    <input type="text" value={jobInfo.eqptLocation} onChange={(e)=>setJobInfo(p=>({...p, eqptLocation:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Master table */}
          {/* Ensure outer table borders are removed in print for master + job info */}
          <style>{`
            @media print {
              #report-container table.no-outer-border { border: 0 !important; }
              #report-container .job-info-print table { border: 0 !important; }
            }
          `}</style>
          <section className="p-0 print:hidden">
            {/* Row controls (screen only) */}
            <div className="print:hidden flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Rows</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRowCount(c => Math.max(1, c - 10))}
                  className="px-2 py-1 text-sm bg-gray-100 dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded"
                >-10</button>
                <button
                  onClick={() => setRowCount(c => Math.max(1, c - 1))}
                  className="px-2 py-1 text-sm bg-gray-100 dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded"
                >-1</button>
                <input
                  type="number"
                  className="w-20 form-input"
                  value={rowCount}
                  min={1}
                  onChange={(e) => setRowCount(Math.max(1, Number(e.target.value) || 1))}
                />
                <button
                  onClick={() => setRowCount(c => c + 1)}
                  className="px-2 py-1 text-sm bg-gray-100 dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded"
                >+1</button>
                <button
                  onClick={() => setRowCount(c => c + 10)}
                  className="px-2 py-1 text-sm bg-gray-100 dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded"
                >+10</button>
              </div>
            </div>
            <div className="overflow-x-auto" ref={tableWrapperRef} id="gsm-scroll-wrapper">
              <table className="min-w-full text-xs no-outer-border select-none">
                <thead onMouseDown={onHeaderMouseDown} onMouseMove={onHeaderMouseMove} onMouseUp={onHeaderMouseUp} onMouseLeave={onHeaderMouseUp} style={{ cursor: 'grab' }}>
                  <tr className="bg-gray-50 dark:bg-dark-200">
                    <th className="px-2 py-2 text-left">Ground Point</th>
                    <th className="px-2 py-2 text-left">Location</th>
                    <th className="px-2 py-2 text-left">FROM</th>
                    <th className="px-2 py-2 text-left min-w-[12rem]">TO</th>
                    <th className="px-2 py-2 text-left">Measurement</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Technicians</th>
                    <th className="px-2 py-2 text-left">Test Equip. Manuf.</th>
                    <th className="px-2 py-2 text-left">Test Equip. AMP ID</th>
                    <th className="px-2 py-2 text-left">Temp. Celsius</th>
                    <th className="px-2 py-2 text-left">Humidity</th>
                    <th className="px-2 py-2 text-left">C2:</th>
                    <th className="px-2 py-2 text-left">P2:</th>
                    <th className="px-2 py-2 text-left">Last Rainfall</th>
                    <th className="px-2 py-2 text-left">Comments (Leave blank for "None")</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-dark-150' : 'bg-gray-50 dark:bg-dark-200'}>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <input className="w-24 bg-transparent border-b border-gray-300 dark:border-gray-700 focus:outline-none" value={r.pointLabel} readOnly />
                      </td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.location} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].location=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.from} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].from=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1 min-w-[12rem]"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.to} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].to=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.measurement} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].measurement=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input type="date" className="bg-transparent border-none focus:ring-0 focus:outline-none" value={r.date} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].date=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className={`px-2 py-1 text-xs font-bold rounded-md focus:outline-none ${r.status==='PASS' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-dark-100 dark:text-white'}`}
                              onClick={()=>setRows(rs=>{const c=[...rs]; c[idx].status='PASS'; return c;})}
                            >
                              PASS
                            </button>
                            <button
                              type="button"
                              className={`px-2 py-1 text-xs font-bold rounded-md focus:outline-none ${r.status==='FAIL' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-dark-100 dark:text-white'}`}
                              onClick={()=>setRows(rs=>{const c=[...rs]; c[idx].status='FAIL'; return c;})}
                            >
                              FAIL
                            </button>
                          </div>
                        ) : (
                          <span className={`inline-block px-3 py-1 text-xs font-bold rounded-md ${r.status==='PASS' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{r.status}</span>
                        )}
                      </td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.technicians} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].technicians=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.manuf} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].manuf=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.ampId} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].ampId=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-24 bg-transparent border-none focus:ring-0 focus:outline-none" value={r.tempC} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].tempC=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-20 bg-transparent border-none focus:ring-0 focus:outline-none" value={r.humidity} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].humidity=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-16 bg-transparent border-none focus:ring-0 focus:outline-none" value={r.c2} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].c2=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-16 bg-transparent border-none focus:ring-0 focus:outline-none" value={r.p2} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].p2=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-28 bg-transparent border-none focus:ring-0 focus:outline-none" value={r.lastRainfall} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].lastRainfall=e.target.value; return c;})} /></td>
                      <td className="px-2 py-1"><input className="w-full bg-transparent border-none focus:ring-0 focus:outline-none" value={r.comments} onChange={e=>setRows(rs=>{const c=[...rs]; c[idx].comments=e.target.value; return c;})} placeholder="Leave blank for 'None'" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, scrollMax)}
                  value={Math.min(scrollValue, scrollMax)}
                  onChange={(e) => {
                    const el = tableWrapperRef.current; if (!el) return;
                    const next = Number(e.target.value) || 0; el.scrollLeft = next; setScrollValue(next);
                  }}
                  className="w-full"
                />
              </div>
            </div>
          </section>

          {/* Print-only per-row pages */}
          <style>{`
            @page { size: Letter portrait; margin: 0.5in; }
            @media print {
              /* Ensure per-row pages always get their own sheet, regardless of content */
              .gsm-page { 
                page-break-before: always; 
                break-before: page; 
                page-break-after: always; 
                break-after: page; 
                page-break-inside: avoid; 
                position: relative;
                height: calc(11in - 1in); /* Letter minus 0.5in top/bottom margins */
                display: flex;
                flex-direction: column;
                justify-content: flex-start;
              }
              .gsm-content { padding: 0; overflow: visible; }
              .gsm-content .job-info-print, .gsm-content .job-info-print table { margin-left: 0 !important; }
              .gsm-page:first-child { 
                page-break-before: auto; 
                break-before: auto; 
              }
              /* Avoid breaking tables across pages */
              .gsm-page table, .gsm-page thead, .gsm-page tbody, .gsm-page tr { page-break-inside: avoid; break-inside: avoid; }
              .gsm-header { 
                /* Force header to render even if global rules hide [class*="header"] */
                display: flex !important;
                min-height: auto !important; 
                padding-top: 0.12in; 
                padding-bottom: 0.12in;
                margin-top: 0.05in; 
                overflow: visible; 
              }
              .gsm-header img { display: block !important; }
              .gsm-header .pass-fail-status-box { display: inline-block !important; }
              .gsm-divider { 
                height: 4px !important; 
                background: #f26722 !important; 
                background-color: #f26722 !important;
                margin: 0.15in 0 !important; 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important;
                color-adjust: exact !important;
                width: 100% !important;
                display: block !important;
              }
              /* Shift readings to align fully left with page margin (cancel container padding) */
              .gsm-readings {
                margin-left: -20px !important; /* counteracts #report-container print padding-left */
                padding-left: 0 !important;
                text-align: left !important;
                width: 100% !important;
                max-width: none !important;
              }
              /* Stabilize table rendering */
              .gsm-page table { border-collapse: collapse !important; table-layout: fixed; width: 100%; }
              .gsm-page th, .gsm-page td { border: none !important; border-bottom: 1px solid black !important; padding: 4px 6px !important; font-size: 11px; line-height: 1.3; word-break: break-word; white-space: normal; text-align: left; }
              .gsm-page thead th { background: transparent; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: normal; }
              .gsm-page tbody td { padding-top: 2px !important; padding-bottom: 6px !important; }
              /* Remove outer table borders, keep only bottom lines */
              .gsm-page table { border: none !important; }
              .gsm-page tr:last-child td { border-bottom: none !important; }
            }
          `}</style>
          <div className="hidden print:block">
            {rows.map((r, idx) => (
              <div key={idx} className="gsm-page">
                <div className="gsm-header relative flex items-start justify-between border-b-2 border-gray-800 pb-2 mb-2">
                  <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-12 w-auto relative" style={{ maxHeight: 48, zIndex: 1 }} />
                  <div className="absolute left-0 right-0 text-center" style={{ zIndex: 0 }}>
                    <h1 className="text-2xl font-bold text-black mb-1">Grounding System MASTER</h1>
                    <div className="text-sm font-semibold">{r.pointLabel}</div>
                  </div>
                  <div className="relative flex flex-col items-end" style={{ zIndex: 1 }}>
                    <div className="font-extrabold text-xl text-right" style={{ color: '#1a4e7c' }}>
                      <div>ANSI/NETA ATS Section 7.13</div>
                      <div>ANSI/NETA MTS Section 7.13</div>
                    </div>
                    <div
                      className="pass-fail-status-box mt-2"
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        width: 'fit-content',
                        borderRadius: '6px',
                        border: r.status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                        backgroundColor: r.status === 'PASS' ? '#22c55e' : '#ef4444',
                        color: 'white',
                        WebkitPrintColorAdjust: 'exact',
                        printColorAdjust: 'exact',
                        minWidth: '50px'
                      }}
                    >
                      {r.status}
                    </div>
                  </div>
                </div>
                <div className="gsm-content">
                  <div className="gsm-divider"></div>
                  {/* Per-page job info */}
                  <JobInfoPrintTable data={{
                    customer: jobInfo.customer,
                    address: jobInfo.address,
                    jobNumber: jobInfo.jobNumber,
                    technicians: jobInfo.technicians,
                    date: r.date || jobInfo.date,
                    identifier,
                    user: jobInfo.user,
                    substation: jobInfo.substation,
                    eqptLocation: jobInfo.eqptLocation,
                    temperature: {
                      fahrenheit: jobInfo.temperature.fahrenheit,
                      celsius: jobInfo.temperature.celsius,
                      humidity: jobInfo.temperature.humidity,
                      tcf: 1
                    }
                  }} />
                  <div className="gsm-divider"></div>
                  
                  {/* Readings Section */}
                  <div className="gsm-readings" style={{ fontSize: '11px', lineHeight: '1.6' }}>
                    {/* Location */}
                    <div style={{ display: 'flex', marginBottom: '6px', alignItems: 'baseline', justifyContent: 'flex-start', marginLeft: '0' }}>
                      <div style={{ width: '1.2in', textAlign: 'right', paddingRight: '0.1in' }}>Location:</div>
                      <div style={{ width: '3.2in', borderBottom: '1px solid black', paddingBottom: '2px' }}>{r.location || '\u00A0'}</div>
                    </div>
                    
                    {/* From */}
                    <div style={{ display: 'flex', marginBottom: '6px', alignItems: 'baseline', justifyContent: 'flex-start', marginLeft: '0' }}>
                      <div style={{ width: '1.2in', textAlign: 'right', paddingRight: '0.1in' }}>From:</div>
                      <div style={{ width: '3.2in', borderBottom: '1px solid black', paddingBottom: '2px' }}>{r.from || '\u00A0'}</div>
                    </div>
                    
                    {/* To */}
                    <div style={{ display: 'flex', marginBottom: '6px', alignItems: 'baseline', justifyContent: 'flex-start', marginLeft: '0' }}>
                      <div style={{ width: '1.2in', textAlign: 'right', paddingRight: '0.1in' }}>To:</div>
                      <div style={{ width: '3.2in', borderBottom: '1px solid black', paddingBottom: '2px' }}>{r.to || '\u00A0'}</div>
                    </div>
                    
                    {/* Ground Resistance Measurement */}
                    <div style={{ display: 'flex', marginBottom: '12px', alignItems: 'baseline', justifyContent: 'flex-start', marginLeft: '0' }}>
                      <div style={{ width: '2.5in', textAlign: 'right', paddingRight: '0.1in' }}>Ground Resistance Measurement:</div>
                      <div style={{ width: '1.3in', borderBottom: '1px solid black', paddingBottom: '2px', display: 'flex', alignItems: 'baseline' }}>
                        <span>{r.measurement || '\u00A0'}</span>
                        <span style={{ marginLeft: '0.06in' }}>Ω</span>
                      </div>
                    </div>
                    
                    {/* Comments */}
                    <div style={{ display: 'flex', marginTop: '16px', alignItems: 'flex-start', justifyContent: 'flex-start', marginLeft: '0' }}>
                      <div style={{ width: '1.2in', textAlign: 'right', paddingRight: '0.1in', paddingTop: '2px' }}>Comments:</div>
                      <div style={{ width: '5.2in', minHeight: '0.8in', borderBottom: '1px solid black' }}>{r.comments || 'None'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default GroundingSystemMaster;


