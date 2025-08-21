import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TanDeltaDataPoint {
  voltageLabel: string;
  kV: number;
  phaseA: number;
  phaseAStdDev: number | null;
  phaseB: number;
  phaseBStdDev: number | null;
  phaseC: number;
  phaseCStdDev: number | null;
}

interface TestEquipment {
  megohmmeterMakeModel: string;
  megohmeterSerial: string;
  megohmmeterAmpId: string;
  vlfHipotMakeModel: string;
  vlfHipotSerial: string;
  vlfHipotAmpId: string;
}

// Initial data based on the image
const initialData: TanDeltaDataPoint[] = [
  { voltageLabel: '0.5 Uo', kV: 7.200, phaseA: 4.0, phaseAStdDev: null, phaseB: 4.4, phaseBStdDev: null, phaseC: 5.0, phaseCStdDev: null },
  { voltageLabel: '1.0 Uo', kV: 14.400, phaseA: 4.0, phaseAStdDev: null, phaseB: 4.5, phaseBStdDev: null, phaseC: 5.1, phaseCStdDev: null },
  { voltageLabel: '1.5 Uo', kV: 21.600, phaseA: 4.1, phaseAStdDev: null, phaseB: 4.5, phaseBStdDev: null, phaseC: 5.2, phaseCStdDev: null },
  { voltageLabel: '2.0 Uo', kV: 28.800, phaseA: 4.1, phaseAStdDev: null, phaseB: 4.7, phaseBStdDev: null, phaseC: 5.3, phaseCStdDev: null },
];

const TanDeltaTestMTSForm: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Print Mode Detection
  const isPrintMode = searchParams.get('print') === 'true';
  
  const [loading, setLoading] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');
  
  // Define the report slug and name
  const reportSlug = 'electrical-tan-delta-test-mts-form';
  const reportName = getReportName(reportSlug);
  const [data, setData] = useState<TanDeltaDataPoint[]>(initialData);
  const [editingData, setEditingData] = useState<boolean>(false);
  const [systemVoltage, setSystemVoltage] = useState<string>('14.400');
  const [equipment, setEquipment] = useState<TestEquipment>({
    megohmmeterMakeModel: '',
    megohmeterSerial: '',
    megohmmeterAmpId: '',
    vlfHipotMakeModel: '',
    vlfHipotSerial: '',
    vlfHipotAmpId: ''
  });
  const [comments, setComments] = useState<string>('');

  useEffect(() => {
    if (jobId) {
      loadJobInfo();
    }
    if (reportId) {
      loadReport();
    }
    setIsEditing(!reportId);
  }, [jobId, reportId]);

  const loadJobInfo = async () => {
    if (!jobId) return;
    
    try {
      setLoading(true);
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

      // Additional job data loading as needed
    } catch (error) {
      console.error('Error loading job info:', error);
      alert(`Failed to load job info: ${(error as any).message}`);
    } finally {
      if (!reportId) {
        setLoading(false);
      }
    }
  };

  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      setLoading(true);
      console.log('Loading report:', reportId); // Debug log

      const { data: reportDataResult, error } = await supabase
        .schema('neta_ops')
        .from('tan_delta_test_mts')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        console.error('Supabase error:', error); // Debug log
        if (error.code === 'PGRST116') {
          console.warn(`Report with ID ${reportId} not found. Starting new report.`);
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (reportDataResult) {
        console.log('Report data:', reportDataResult); // Debug log
        
        // Load report data from database with null checks
        const reportData = reportDataResult.data || {};
        
        // Set data with fallback to initialData
        setData(Array.isArray(reportData.points) ? reportData.points : initialData);
        
        // Set system voltage with fallback
        setSystemVoltage(reportData.systemVoltage || '14.400');
        
        // Set equipment with complete fallback object
        const defaultEquipment = {
          megohmmeterMakeModel: '',
          megohmeterSerial: '',
          megohmmeterAmpId: '',
          vlfHipotMakeModel: '',
          vlfHipotSerial: '',
          vlfHipotAmpId: ''
        };
        setEquipment(reportData.testEquipment || defaultEquipment);
        
        // Set status with fallback
        setStatus(reportData.status || 'PASS');
        
        // Set comments with fallback
        setComments(reportData.comments || '');
        
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

    try {
      setLoading(true);
      console.log('Saving report...'); // Debug log
      
      const reportDataToSave = {
        job_id: jobId,
        user_id: user.id,
        data: {
          systemVoltage,
          testEquipment: equipment,
          status,
          points: data,
          comments
        }
      };

      console.log('Data to save:', reportDataToSave); // Debug log

      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('tan_delta_test_mts')
          .update(reportDataToSave)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('tan_delta_test_mts')
          .insert(reportDataToSave)
          .select()
          .single();

        // Create asset entry
        if (result.data) {
          const newReportId = result.data.id;
          const assetData = {
            name: getAssetName(reportSlug, systemVoltage || ''),
            file_url: `report:/jobs/${jobId}/electrical-tan-delta-test-mts-form/${newReportId}`,
            user_id: user.id
          };

          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;

          // Link asset to job
          if (assetResult) {
            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id
              });
          }
        }
      }

      if (result.error) {
        console.error('Save error:', result.error); // Debug log
        throw result.error;
      }

      console.log('Save successful:', result.data); // Debug log
      
      setIsEditing(false);
      alert("Report saved successfully!");
      
      // Navigate back to job page
      navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };
  
  const toggleEditMode = () => {
    setEditingData(!editingData);
  };

  const handleDataChange = (
    index: number,
    field: keyof TanDeltaDataPoint,
    value: string
  ) => {
    const newData = [...data];
    if (field === 'voltageLabel') {
      newData[index][field] = value;
    } else if (field === 'phaseAStdDev' || field === 'phaseBStdDev' || field === 'phaseCStdDev') {
      // For standard deviation fields, use null for empty values
      newData[index][field] = value === '' ? null : parseFloat(value) || 0;
    } else {
      newData[index][field] = parseFloat(value) || 0;
    }
    setData(newData);
  };

  const handleEquipmentChange = (field: keyof TestEquipment, value: string) => {
    setEquipment(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const renderHeader = () => (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        {reportName}
      </h1>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (isEditing) {
              setStatus(status === 'PASS' ? 'FAIL' : 'PASS');
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            status === 'PASS'
              ? 'bg-green-600 text-white focus:ring-green-500'
              : 'bg-red-600 text-white focus:ring-red-500'
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        >
          {status === 'PASS' ? 'PASS' : 'FAIL'}
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
            disabled={!isEditing}
            className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'}`}
          >
            Save Report
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - MTS 7.3.3
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
                border: status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: status === 'PASS' ? '#22c55e' : '#ef4444',
                color: 'white',
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
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (isEditing) setStatus(status === 'PASS' ? 'FAIL' : 'PASS');
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' : 'bg-red-600 text-white focus:ring-red-500'
                  } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
                >
                  {status}
                </button>
                {reportId && !isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Edit Report</button>
                    <button onClick={() => window.print()} className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Print Report</button>
                  </>
                ) : (
                  <button onClick={handleSave} disabled={!isEditing} className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'}`}>Save Report</button>
                )}
              </div>
            </div>
          </div>

          {/* System Voltage */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Parameters</h2>
            {/* On-screen form - hidden in print */}
            <div className="flex items-center gap-4 print:hidden test-params-onscreen">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">System Voltage Line to Ground (kV RMS):</label>
              <input type="number" step="0.001" value={systemVoltage} onChange={(e) => setSystemVoltage(e.target.value)} disabled={!isEditing} className="mt-1 block w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />
            </div>
            
            {/* Print-only table */}
            <div className="hidden print:block">
              <table className="w-full border border-gray-300 print:border-black">
                <tbody>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black font-semibold w-1/3">System Voltage Line to Ground (kV RMS):</td>
                    <td className="p-2 border border-gray-300 print:border-black">{systemVoltage}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tan Delta Test Data */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Tan Delta Test</h2>
            <div className="flex justify-end mb-2 print:hidden">
              <button onClick={toggleEditMode} className={`px-4 py-2 text-sm font-medium text-white rounded-md ${editingData ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>{editingData ? 'Lock Data' : 'Edit Data'}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Voltage Steps</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">kV</th>
                    <th colSpan={2} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">A Phase</th>
                    <th colSpan={2} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">B Phase</th>
                    <th colSpan={2} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">C Phase</th>
                  </tr>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200"></th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200"></th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">TD [E-3]</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Std. Dev</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">TD [E-3]</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Std. Dev</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">TD [E-3]</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Std. Dev</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.map((row, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2">
                        {editingData ? (
                          <input type="text" value={row.voltageLabel} onChange={(e) => handleDataChange(index, 'voltageLabel', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />
                        ) : (<span className="text-gray-900 dark:text-white">{row.voltageLabel}</span>)}
                      </td>
                      <td className="px-3 py-2">
                        {editingData ? (
                          <input type="number" step="0.001" value={row.kV} onChange={(e) => handleDataChange(index, 'kV', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />
                        ) : (<span className="text-gray-900 dark:text-white">{row.kV.toFixed(3)}</span>)}
                      </td>
                      <td className="px-3 py-2">{editingData ? (<input type="number" step="0.1" value={row.phaseA} onChange={(e) => handleDataChange(index, 'phaseA', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />) : (<span className="text-gray-900 dark:text-white">{row.phaseA.toFixed(1)}</span>)}</td>
                      <td className="px-3 py-2">{editingData ? (<input type="number" step="0.01" value={row.phaseAStdDev === null ? '' : row.phaseAStdDev} onChange={(e) => handleDataChange(index, 'phaseAStdDev', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />) : (<span className="text-gray-900 dark:text-white">{row.phaseAStdDev === null ? '' : row.phaseAStdDev.toFixed(1)}</span>)}</td>
                      <td className="px-3 py-2">{editingData ? (<input type="number" step="0.1" value={row.phaseB} onChange={(e) => handleDataChange(index, 'phaseB', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />) : (<span className="text-gray-900 dark:text-white">{row.phaseB.toFixed(1)}</span>)}</td>
                      <td className="px-3 py-2">{editingData ? (<input type="number" step="0.01" value={row.phaseBStdDev === null ? '' : row.phaseBStdDev} onChange={(e) => handleDataChange(index, 'phaseBStdDev', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />) : (<span className="text-gray-900 dark:text-white">{row.phaseBStdDev === null ? '' : row.phaseBStdDev.toFixed(1)}</span>)}</td>
                      <td className="px-3 py-2">{editingData ? (<input type="number" step="0.1" value={row.phaseC} onChange={(e) => handleDataChange(index, 'phaseC', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />) : (<span className="text-gray-900 dark:text-white">{row.phaseC.toFixed(1)}</span>)}</td>
                      <td className="px-3 py-2">{editingData ? (<input type="number" step="0.01" value={row.phaseCStdDev === null ? '' : row.phaseCStdDev} onChange={(e) => handleDataChange(index, 'phaseCStdDev', e.target.value)} disabled={!isEditing || !editingData} className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white" />) : (<span className="text-gray-900 dark:text-white">{row.phaseCStdDev === null ? '' : row.phaseCStdDev.toFixed(1)}</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Tan Delta Chart</h2>
            <div className="border border-gray-200 dark:border-gray-700 p-6" style={{ height: '400px' }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 30, right: 40, left: 30, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="kV" label={{ value: 'Test Voltage (kV)', position: 'bottom', offset: 10 }} padding={{ left: 20, right: 20 }} />
                  <YAxis label={{ value: 'Tan Delta (E-3)', angle: -90, position: 'insideLeft', offset: -10 }} domain={[0, 'auto']} padding={{ top: 20 }} />
                  <Tooltip formatter={(value) => [`${value}`, 'Tan Delta (E-3)']} />
                  <Legend layout="horizontal" verticalAlign="top" align="center" wrapperStyle={{ paddingBottom: '20px' }} />
                  <Line type="monotone" dataKey="phaseA" name="A Phase" stroke="#8884d8" activeDot={{ r: 8 }} strokeWidth={2} dot={{ strokeWidth: 2, r: 5 }} />
                  <Line type="monotone" dataKey="phaseB" name="B Phase" stroke="#82ca9d" activeDot={{ r: 8 }} strokeWidth={2} dot={{ strokeWidth: 2, r: 5 }} />
                  <Line type="monotone" dataKey="phaseC" name="C Phase" stroke="#ff7300" activeDot={{ r: 8 }} strokeWidth={2} dot={{ strokeWidth: 2, r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Test Equipment Used Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            {/* On-screen form - hidden in print */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden test-eqpt-onscreen">
              <div>
                <label htmlFor="megohmmeterMakeModel" className="form-label">Megohmmeter Make/Model</label>
                <input id="megohmmeterMakeModel" type="text" value={equipment.megohmmeterMakeModel} onChange={(e) => handleEquipmentChange('megohmmeterMakeModel', e.target.value)} disabled={!isEditing} className="form-input mt-1" />
              </div>
              <div>
                <label htmlFor="megohmeterSerial" className="form-label">Serial Number</label>
                <input id="megohmeterSerial" type="text" value={equipment.megohmeterSerial} onChange={(e) => handleEquipmentChange('megohmeterSerial', e.target.value)} disabled={!isEditing} className="form-input mt-1" />
              </div>
              <div>
                <label htmlFor="megohmmeterAmpId" className="form-label">AMP ID</label>
                <input id="megohmmeterAmpId" type="text" value={equipment.megohmmeterAmpId} onChange={(e) => handleEquipmentChange('megohmmeterAmpId', e.target.value)} disabled={!isEditing} className="form-input mt-1" />
              </div>
              <div>
                <label htmlFor="vlfHipotMakeModel" className="form-label">VLF Hipot Make/Model</label>
                <input id="vlfHipotMakeModel" type="text" value={equipment.vlfHipotMakeModel} onChange={(e) => handleEquipmentChange('vlfHipotMakeModel', e.target.value)} disabled={!isEditing} className="form-input mt-1" />
              </div>
              <div>
                <label htmlFor="vlfHipotSerial" className="form-label">Serial Number</label>
                <input id="vlfHipotSerial" type="text" value={equipment.vlfHipotSerial} onChange={(e) => handleEquipmentChange('vlfHipotSerial', e.target.value)} disabled={!isEditing} className="form-input mt-1" />
              </div>
              <div>
                <label htmlFor="vlfHipotAmpId" className="form-label">AMP ID</label>
                <input id="vlfHipotAmpId" type="text" value={equipment.vlfHipotAmpId} onChange={(e) => handleEquipmentChange('vlfHipotAmpId', e.target.value)} disabled={!isEditing} className="form-input mt-1" />
              </div>
            </div>
            
            {/* Print-only table */}
            <div className="hidden print:block">
              <table className="w-full border border-gray-300 print:border-black">
                <thead>
                  <tr>
                    <th className="p-2 border border-gray-300 print:border-black bg-gray-50 print:bg-gray-100 text-left">Equipment</th>
                    <th className="p-2 border border-gray-300 print:border-black bg-gray-50 print:bg-gray-100 text-left">Make/Model</th>
                    <th className="p-2 border border-gray-300 print:border-black bg-gray-50 print:bg-gray-100 text-left">Serial Number</th>
                    <th className="p-2 border border-gray-300 print:border-black bg-gray-50 print:bg-gray-100 text-left">AMP ID</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black font-semibold">Megohmmeter</td>
                    <td className="p-2 border border-gray-300 print:border-black">{equipment.megohmmeterMakeModel || ''}</td>
                    <td className="p-2 border border-gray-300 print:border-black">{equipment.megohmeterSerial || ''}</td>
                    <td className="p-2 border border-gray-300 print:border-black">{equipment.megohmmeterAmpId || ''}</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black font-semibold">VLF Hipot</td>
                    <td className="p-2 border border-gray-300 print:border-black">{equipment.vlfHipotMakeModel || ''}</td>
                    <td className="p-2 border border-gray-300 print:border-black">{equipment.vlfHipotSerial || ''}</td>
                    <td className="p-2 border border-gray-300 print:border-black">{equipment.vlfHipotAmpId || ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
 
          {/* Comments Section */}
          <div className="mb-6 comments-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            {/* On-screen form - hidden in print */}
            <div className="print:hidden comments-onscreen">
              <textarea 
                rows={8} 
                className="form-input resize-vertical" 
                disabled={!isEditing}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter any additional comments or notes..."
              />
            </div>
            
            {/* Print-only table */}
            <div className="hidden print:block">
              <table className="w-full border border-gray-300 print:border-black">
                <tbody>
                  <tr>
                    <td className="p-2 border border-gray-300 print:border-black min-h-[100px] align-top">
                      {comments || 'No comments'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      /* Global resets */
      * { color: black !important; background: white !important; box-sizing: border-box !important; }
      body { margin: 0 !important; padding: 20px !important; font-family: Arial, sans-serif !important; font-size: 12px !important; }

      /* Hide navigation and non-print elements */
      header, nav, .navigation, [class*="nav"], [class*="header"], .sticky, [class*="sticky"], .print\\:hidden { display: none !important; }
      
      /* Hide on-screen elements in print */
      .test-params-onscreen, .test-params-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .comments-onscreen, .comments-onscreen * { display: none !important; }

      /* Inputs/selects */
      input, select, textarea { background-color: white !important; border: 1px solid black !important; color: black !important; padding: 2px !important; font-size: 9px !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; width: 100% !important; min-width: 0 !important; }
      select { background-image: none !important; padding-right: 8px !important; }
      input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
      input[type="number"] { -moz-appearance: textfield !important; }

      /* Tables */
      table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 0 !important; }
      th, td { border: 1px solid black !important; padding: 2px !important; font-size: 8px !important; white-space: normal !important; word-wrap: break-word !important; overflow-wrap: break-word !important; text-align: center !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }
      table input, table select { border: none !important; background: transparent !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; height: 10px !important; font-size: 8px !important; text-align: center !important; }

      /* Section spacing and dividers */
      .mb-6 { margin-bottom: 16px !important; page-break-inside: avoid !important; }
      .mb-6 > h2 { border-bottom: 1px solid black !important; padding-bottom: 2px !important; margin-bottom: 6px !important; font-size: 12px !important; }

      /* Remove card/shadow visuals */
      .shadow, .shadow-md, .shadow-lg, .rounded, .rounded-lg, .border, .border-gray-200, .dark\\:border-gray-700, .bg-white, .dark\\:bg-dark-150 { border: none !important; box-shadow: none !important; background: transparent !important; padding: 0 !important; }

      /* Print header spacing */
      .print\\:flex { margin-bottom: 8px !important; }

      /* Chart */
      .recharts-wrapper { page-break-inside: avoid !important; margin: 10px 0 !important; }

      /* Comments section: wider, not taller */
      .comments-section { width: 100% !important; }
      .comments-section textarea { width: 100% !important; max-width: 100% !important; min-width: 100% !important; height: 90px !important; }
      
      /* Form label styling */
      .form-label { display: block !important; text-sm !important; font-medium !important; text-gray-700 !important; margin-bottom: 0.25rem !important; }
      .form-input { display: block !important; width: 100% !important; padding: 0.5rem !important; border: 1px solid #d1d5db !important; border-radius: 0.375rem !important; background-color: white !important; color: black !important; font-size: 12px !important; }
    }
  `;
  document.head.appendChild(style);
}

export default TanDeltaTestMTSForm; 