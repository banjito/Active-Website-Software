import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ReportWrapper } from './ReportWrapper';
import { getAssetName, getReportName } from './reportMappings';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import JobInfoPrintTable from './common/JobInfoPrintTable';

const REPORT_SLUG = 'grounding-fall-of-potential-slope-method-test';
const TABLE_NAME = 'grounding_fall_of_potential_slope_method_test_reports';

// Excel LOOKUP table: maps change-in-slope (u) -> ratio (Dp/Dc)
const SLOPE_TO_DP_RATIO: { u: number; ratio: number }[] = [
  { u: 0.40, ratio: 0.643 }, { u: 0.41, ratio: 0.642 }, { u: 0.42, ratio: 0.640 }, { u: 0.43, ratio: 0.639 },
  { u: 0.44, ratio: 0.637 }, { u: 0.45, ratio: 0.636 }, { u: 0.46, ratio: 0.635 }, { u: 0.47, ratio: 0.633 },
  { u: 0.48, ratio: 0.632 }, { u: 0.49, ratio: 0.630 }, { u: 0.50, ratio: 0.629 }, { u: 0.51, ratio: 0.627 },
  { u: 0.52, ratio: 0.626 }, { u: 0.53, ratio: 0.624 }, { u: 0.54, ratio: 0.623 }, { u: 0.55, ratio: 0.621 },
  { u: 0.56, ratio: 0.620 }, { u: 0.57, ratio: 0.618 }, { u: 0.58, ratio: 0.617 }, { u: 0.59, ratio: 0.615 },
  { u: 0.60, ratio: 0.614 }, { u: 0.61, ratio: 0.612 }, { u: 0.62, ratio: 0.610 }, { u: 0.63, ratio: 0.609 },
  { u: 0.64, ratio: 0.607 }, { u: 0.65, ratio: 0.606 }, { u: 0.66, ratio: 0.604 }, { u: 0.67, ratio: 0.602 },
  { u: 0.68, ratio: 0.601 }, { u: 0.69, ratio: 0.599 }, { u: 0.70, ratio: 0.597 }, { u: 0.71, ratio: 0.596 },
  { u: 0.72, ratio: 0.594 }, { u: 0.73, ratio: 0.592 }, { u: 0.74, ratio: 0.591 }, { u: 0.75, ratio: 0.589 },
  { u: 0.76, ratio: 0.587 }, { u: 0.77, ratio: 0.585 }, { u: 0.78, ratio: 0.584 }, { u: 0.79, ratio: 0.582 },
  { u: 0.80, ratio: 0.580 }, { u: 0.81, ratio: 0.579 }, { u: 0.82, ratio: 0.577 }, { u: 0.83, ratio: 0.575 },
  { u: 0.84, ratio: 0.573 }, { u: 0.85, ratio: 0.572 }, { u: 0.86, ratio: 0.569 }, { u: 0.87, ratio: 0.567 },
  { u: 0.88, ratio: 0.566 }, { u: 0.89, ratio: 0.564 }, { u: 0.90, ratio: 0.562 }, { u: 0.91, ratio: 0.560 },
  { u: 0.92, ratio: 0.558 }, { u: 0.93, ratio: 0.556 }, { u: 0.94, ratio: 0.554 }, { u: 0.95, ratio: 0.552 },
  { u: 0.96, ratio: 0.550 }, { u: 0.97, ratio: 0.548 }, { u: 0.98, ratio: 0.546 }, { u: 0.99, ratio: 0.544 },
  { u: 1.00, ratio: 0.542 }, { u: 1.01, ratio: 0.539 }, { u: 1.02, ratio: 0.537 }, { u: 1.03, ratio: 0.535 },
  { u: 1.04, ratio: 0.533 }, { u: 1.05, ratio: 0.531 }, { u: 1.06, ratio: 0.528 }, { u: 1.07, ratio: 0.526 },
  { u: 1.08, ratio: 0.524 }, { u: 1.09, ratio: 0.522 }, { u: 1.10, ratio: 0.519 }, { u: 1.11, ratio: 0.517 },
  { u: 1.12, ratio: 0.514 }, { u: 1.13, ratio: 0.512 }, { u: 1.14, ratio: 0.509 }, { u: 1.15, ratio: 0.507 },
  { u: 1.16, ratio: 0.504 }, { u: 1.17, ratio: 0.502 }, { u: 1.18, ratio: 0.499 }, { u: 1.19, ratio: 0.497 },
  { u: 1.20, ratio: 0.494 }, { u: 1.21, ratio: 0.491 }, { u: 1.22, ratio: 0.488 }, { u: 1.23, ratio: 0.486 },
  { u: 1.24, ratio: 0.483 }, { u: 1.25, ratio: 0.480 }, { u: 1.26, ratio: 0.477 }, { u: 1.27, ratio: 0.474 },
  { u: 1.28, ratio: 0.471 }, { u: 1.29, ratio: 0.468 }, { u: 1.30, ratio: 0.465 }, { u: 1.31, ratio: 0.462 },
  { u: 1.32, ratio: 0.458 }, { u: 1.33, ratio: 0.455 }, { u: 1.34, ratio: 0.452 }, { u: 1.35, ratio: 0.448 },
  { u: 1.36, ratio: 0.445 }, { u: 1.37, ratio: 0.441 }, { u: 1.38, ratio: 0.438 }, { u: 1.39, ratio: 0.434 },
  { u: 1.40, ratio: 0.431 }, { u: 1.41, ratio: 0.427 }, { u: 1.42, ratio: 0.423 }, { u: 1.43, ratio: 0.418 },
  { u: 1.44, ratio: 0.414 }, { u: 1.45, ratio: 0.410 }, { u: 1.46, ratio: 0.406 }, { u: 1.47, ratio: 0.401 },
  { u: 1.48, ratio: 0.397 }, { u: 1.49, ratio: 0.393 }, { u: 1.50, ratio: 0.389 }, { u: 1.51, ratio: 0.384 },
  { u: 1.52, ratio: 0.379 }, { u: 1.53, ratio: 0.374 }, { u: 1.54, ratio: 0.369 }, { u: 1.55, ratio: 0.364 },
  { u: 1.56, ratio: 0.358 }, { u: 1.57, ratio: 0.352 }, { u: 1.58, ratio: 0.347 }, { u: 1.59, ratio: 0.341 },
];

// Excel LOOKUP-style behavior: last entry with u_i <= u; clamp to bounds
const getDpRatioFromSlope = (u: number): number => {
  const list = SLOPE_TO_DP_RATIO;
  if (!isFinite(u)) return list[0].ratio;
  if (u <= list[0].u) return list[0].ratio;
  if (u >= list[list.length - 1].u) return list[list.length - 1].ratio;
  for (let i = list.length - 1; i >= 0; i--) {
    if (u >= list[i].u) return list[i].ratio;
  }
  return list[0].ratio;
};

type TempInfo = { fahrenheit: number; celsius: number; humidity?: number };

const GroundingFallOfPotentialSlopeMethodTest: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');

  // Job info (copied pattern from MV VLF Test)
  const [jobInfo, setJobInfo] = useState({
    customer: '',
    address: '',
    user: '',
    date: '',
    jobNumber: '',
    technicians: '',
    identifier: '',
    substation: '',
    eqptLocation: ''
  });
  const [temperature, setTemperature] = useState<TempInfo>({ fahrenheit: 68, celsius: 20, humidity: 0 });

  // Grounding inputs
  const [soil, setSoil] = useState({ type: '', conditions: '', rodDepth: '', multipleRods: 'N', longestDimension: '' });
  const [dcFeet, setDcFeet] = useState<number>(250);
  const [r40, setR40] = useState<number>(0.1);
  const [r60, setR60] = useState<number>(0.2);
  const [r80, setR80] = useState<number>(0.25);
  const [comments, setComments] = useState<string>('');

  const reportName = getReportName(REPORT_SLUG) || 'Grounding Fall of Potential Slope Method Test';

  // Derived distances
  const d40 = useMemo(() => Number.isFinite(dcFeet) ? Number((dcFeet * 0.4).toFixed(2)) : 0, [dcFeet]);
  const d60 = useMemo(() => Number.isFinite(dcFeet) ? Number((dcFeet * 0.6).toFixed(2)) : 0, [dcFeet]);
  const d80 = useMemo(() => Number.isFinite(dcFeet) ? Number((dcFeet * 0.8).toFixed(2)) : 0, [dcFeet]);

  // Slope method: u and Dp approximation
  const u = useMemo(() => {
    const denom = (r60 - r40);
    if (!isFinite(denom) || Math.abs(denom) < 1e-6) return 0;
    const value = (r80 - r60) / denom;
    return Number((value).toFixed(2));
  }, [r40, r60, r80]);

  const dpFeet = useMemo(() => {
    const ratio = getDpRatioFromSlope(u);
    const raw = Number.isFinite(dcFeet) ? dcFeet * ratio : NaN;
    return Number.isFinite(raw) ? Number(raw.toFixed(3)) : NaN;
  }, [dcFeet, u]);

  const groundResistanceAtDp = useMemo(() => {
    // Piecewise linear interpolate through (d40,r40),(d60,r60),(d80,r80)
    const points = [
      { x: d40, y: r40 },
      { x: d60, y: r60 },
      { x: d80, y: r80 }
    ].sort((a,b)=>a.x-b.x);
    const x = dpFeet;
    if (x <= points[0].x) return Number(points[0].y.toFixed(3));
    if (x >= points[2].x) return Number(points[2].y.toFixed(3));
    const seg = x <= points[1].x ? [points[0], points[1]] : [points[1], points[2]];
    const t = (x - seg[0].x) / (seg[1].x - seg[0].x);
    const y = seg[0].y + t * (seg[1].y - seg[0].y);
    return Number(y.toFixed(3));
  }, [d40, d60, d80, r40, r60, r80, dpFeet]);

  const chartData = useMemo(() => {
    const safe = (n: number) => (Number.isFinite(n) ? n : 0);
    return [
      { distance: d40, resistance: safe(r40), label: '40%' },
      { distance: d60, resistance: safe(r60), label: '60%' },
      { distance: d80, resistance: safe(r80), label: '80%' },
    ];
  }, [d40, d60, d80, r40, r60, r80]);

  useEffect(() => {
    // Load job + customer data for job info section
    const loadJobInfo = async () => {
      if (!jobId) return;
      try {
        const { data: job } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('title, job_number, customer_id, site_address')
          .eq('id', jobId)
          .single();
        if (job?.customer_id) {
          const { data: cust } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', job.customer_id)
            .single();
          setJobInfo(prev => ({
            ...prev,
            customer: cust?.name || cust?.company_name || '',
            address: cust?.address || '',
            jobNumber: job?.job_number || prev.jobNumber,
          }));
        }
      } catch {}
    };
    loadJobInfo();
  }, [jobId]);

  useEffect(() => {
    // Load existing report
    const loadExisting = async () => {
      if (!reportId) { setIsEditing(true); return; }
      try {
        setLoading(true);
        const { data } = await supabase
          .schema('neta_ops')
          .from(TABLE_NAME)
          .select('*')
          .eq('id', reportId)
          .maybeSingle();
        if (data) {
          const info = data.report_info || {};
          setStatus((info.status || 'PASS') === 'FAIL' ? 'FAIL' : 'PASS');
          setJobInfo(prev => ({
            ...prev,
            customer: info.customer || prev.customer,
            address: info.address || prev.address,
            user: info.user || prev.user,
            date: info.date || prev.date,
            jobNumber: info.jobNumber || prev.jobNumber,
            technicians: info.technicians || '',
            identifier: info.identifier || '',
            substation: info.substation || '',
            eqptLocation: info.eqptLocation || ''
          }));
          setTemperature({
            fahrenheit: info.temperature?.fahrenheit ?? 68,
            celsius: info.temperature?.celsius ?? 20,
            humidity: info.temperature?.humidity ?? 0,
          });
          const s = info.soil || {};
          setSoil({
            type: s.type || '',
            conditions: s.conditions || '',
            rodDepth: s.rodDepth || '',
            multipleRods: s.multipleRods || 'N',
            longestDimension: s.longestDimension || ''
          });
          setDcFeet(Number(info.dcFeet) || 250);
          setR40(Number(info.r40) || 0);
          setR60(Number(info.r60) || 0);
          setR80(Number(info.r80) || 0);
          setComments(String(info.comments || ''));
          setIsEditing(false);
        }
      } catch {
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
      const payload = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          ...jobInfo,
          temperature,
          soil,
          dcFeet,
          r40, r60, r80,
          u,
          dpFeet,
          groundResistanceAtDp,
          comments,
          status,
          title: reportName
        }
      } as any;
      let result;
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
            name: getAssetName(REPORT_SLUG, jobInfo.identifier || jobInfo.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/${REPORT_SLUG}/${result.data.id}`,
            user_id: user.id
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
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const setTempF = (val: number) => {
    const c = Math.round(((val - 32) * 5) / 9);
    setTemperature(prev => ({ ...prev, fahrenheit: val, celsius: c }));
  };

  return (
    <ReportWrapper>
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-6">
          {/* Print Header - Only visible when printing */}
          <div className="hidden print:block">
            <div className="relative flex items-center justify-between border-b-2 border-gray-800 pb-4 mb-4">
              <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto relative" style={{ maxHeight: 40, zIndex: 1 }} />
              {/* Absolutely centered title to keep perfect center regardless of right-side width */}
              <div className="absolute left-0 right-0 text-center" style={{ zIndex: 0, pointerEvents: 'none', background: 'transparent' }}>
                <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
              </div>
              <div className="text-right font-extrabold text-xl relative" style={{ color: '#1a4e7c', zIndex: 1 }}>
                NETA - MTS 7.13
                <div className="mt-2">
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
                      border: status === 'PASS' ? '2px solid #16a34a' : status === 'FAIL' ? '2px solid #dc2626' : '2px solid #ca8a04',
                      backgroundColor: status === 'PASS' ? '#22c55e' : status === 'FAIL' ? '#ef4444' : '#eab308',
                      color: status === 'PASS' ? 'white' : (status === 'FAIL' ? 'white' : 'black'),
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact',
                      boxSizing: 'border-box',
                      minWidth: '50px',
                    }}
                  >
                    {status}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="hidden print:block w-full h-1 bg-[#f26722] mb-4"></div>
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => { if (isEditing) setStatus(status === 'PASS' ? 'FAIL' : 'PASS'); }}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' : 'bg-red-600 text-white focus:ring-red-500'} ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
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

          {/* Job Information (mirrors MV VLF layout) */}
          <section className="mb-6 job-info-section">
            <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:hidden">Job Details</h2>
            <div className="grid grid-cols-2 gap-6 print:hidden job-info-onscreen">
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
                    <input type="text" value={jobInfo.identifier} onChange={(e)=>setJobInfo(p=>({...p, identifier:e.target.value}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} placeholder="Enter an identifier" />
                  </div>
                </div>
              </div>

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
                      <input type="number" value={temperature.fahrenheit} onChange={(e)=>setTempF(Number(e.target.value))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                    </div>
                    <span className="mx-2">°F</span>
                    <span className="mx-2">{temperature.celsius}</span>
                    <span className="mx-2">°C</span>
                    <span className="mx-5">Humidity</span>
                    <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                      <input type="number" value={temperature.humidity} onChange={(e)=>setTemperature(p=>({...p, humidity:Number(e.target.value)}))} readOnly={!isEditing} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditing ? 'cursor-default' : ''}`} />
                    </div>
                    <span className="ml-2">%</span>
                  </div>
                </div>

                <div className="mb-4 flex">
                  <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Location</label>
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
            {/* Print-only */}
            <div className="hidden print:block">
              <JobInfoPrintTable
                data={{
                  customer: jobInfo.customer,
                  address: jobInfo.address,
                  jobNumber: jobInfo.jobNumber,
                  technicians: jobInfo.technicians,
                  date: jobInfo.date,
                  identifier: jobInfo.identifier,
                  user: jobInfo.user,
                  substation: jobInfo.substation,
                  eqptLocation: jobInfo.eqptLocation,
                  temperature: { fahrenheit: temperature.fahrenheit, celsius: temperature.celsius, tcf: 1, humidity: temperature.humidity }
                }}
              />
              {/* Print divider below job info */}
              <div className="w-full h-1 bg-[#f26722] my-4"></div>
            </div>
          </section>

          {/* Grounding Inputs */}
          <section className="p-0">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Grounding Test Inputs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center">
                  <label className="form-label inline-block w-40">Soil Type</label>
                  <input type="text" value={soil.type} onChange={e=>setSoil(p=>({...p, type:e.target.value}))} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div className="flex items-center">
                  <label className="form-label inline-block w-40">Soil Conditions</label>
                  <input type="text" value={soil.conditions} onChange={e=>setSoil(p=>({...p, conditions:e.target.value}))} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div className="flex items-center">
                  <label className="form-label inline-block w-40">Rod Depth</label>
                  <input type="text" value={soil.rodDepth} onChange={e=>setSoil(p=>({...p, rodDepth:e.target.value}))} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div className="flex items-center">
                  <label className="form-label inline-block w-40">Multiple Rods (Y/N)</label>
                  <select value={soil.multipleRods} onChange={e=>setSoil(p=>({...p, multipleRods:e.target.value}))} disabled={!isEditing} className={`form-select ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="form-label inline-block w-40">Longest Dimension</label>
                  <input type="text" value={soil.longestDimension} onChange={e=>setSoil(p=>({...p, longestDimension:e.target.value}))} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <label className="form-label inline-block w-56">Distance Of Current Probe (Dc)</label>
                  <input
                    type="number"
                    value={Number.isFinite(dcFeet) ? dcFeet : ''}
                    onChange={e=>{
                      const v = e.target.value;
                      setDcFeet(v === '' ? NaN : Number(v));
                    }}
                    readOnly={!isEditing}
                    className={`form-input w-40 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="ml-2">Feet</span>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold mb-2">Calculate Potential Probe Location (Dp)</div>
                  <div className="grid grid-cols-3 gap-3 items-center text-sm">
                    <div className="font-medium">Distance (ft)</div>
                    <div className="font-medium">Resistance</div>
                    <div></div>
                    <div>{d40}</div>
                    <div>
                  <input
                    type="number"
                    value={Number.isFinite(r40) ? r40 : ''}
                    onChange={e=>{
                      const v = e.target.value;
                      setR40(v === '' ? NaN : Number(v));
                    }}
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                    </div>
                    <div className="text-gray-500">40%</div>
                    <div>{d60}</div>
                    <div>
                  <input
                    type="number"
                    value={Number.isFinite(r60) ? r60 : ''}
                    onChange={e=>{
                      const v = e.target.value;
                      setR60(v === '' ? NaN : Number(v));
                    }}
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                    </div>
                    <div className="text-gray-500">60%</div>
                    <div>{d80}</div>
                    <div>
                  <input
                    type="number"
                    value={Number.isFinite(r80) ? r80 : ''}
                    onChange={e=>{
                      const v = e.target.value;
                      setR80(v === '' ? NaN : Number(v));
                    }}
                    readOnly={!isEditing}
                    className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                    </div>
                    <div className="text-gray-500">80%</div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 items-center mt-4">
                    <div className="font-medium">Change in Slope (u)</div>
                    <div className="col-span-2"><input type="text" readOnly value={u.toFixed(2)} className="form-input bg-gray-100 dark:bg-dark-200" /></div>
                    <div className="font-medium">Dp</div>
                    <div className="col-span-2 flex items-center">
                      <input type="text" readOnly value={dpFeet.toFixed(3)} className="form-input bg-gray-100 dark:bg-dark-200 w-40" />
                      <span className="ml-2">Feet</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 font-semibold text-lg">
              Ground Resistance reading: <span className="ml-2">{groundResistanceAtDp} Ω @ {dpFeet.toFixed(3)} Feet</span>
            </div>
          </section>

          {/* Chart (shown on screen and print) */}
          <section className="p-0">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Resistance vs Distance</h2>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="distance" label={{ value: 'Distance (feet)', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'Resistance (Ω)', angle: -90, position: 'insideLeft' }} domain={[0, 'auto']} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="resistance" name="Resistance" stroke="#1f77b4" dot={{ r: 5 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          {/* Print divider between chart and reading */}
          <div className="hidden print:block w-full h-1 bg-[#f26722] my-4"></div>

          {/* Removed print-only summary */}

          {/* Comments */}
          <section className="p-0 mb-20">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
            <textarea value={comments} onChange={e=>setComments(e.target.value)} readOnly={!isEditing} className={`form-textarea min-h-[120px] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
          </section>
          {/* Removed final print divider per request */}
        </div>
      </div>
    </ReportWrapper>
  );
};

export default GroundingFallOfPotentialSlopeMethodTest;


