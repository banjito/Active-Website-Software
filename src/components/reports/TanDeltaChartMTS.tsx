import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { ReportWrapper } from './ReportWrapper';
import { getReportName } from './reportMappings';
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
  megohmeterSerial: string;
  megohmmeterAmpId: string;
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

const TanDeltaChartMTS: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Print Mode Detection
  const isPrintMode = searchParams.get('print') === 'true';
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'medium-voltage-vlf-tan-delta-mts';
  const reportName = getReportName(reportSlug);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(!reportId);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');
  const [data, setData] = useState<TanDeltaDataPoint[]>(initialData);
  const [editingData, setEditingData] = useState<boolean>(false);
  const [testDate, setTestDate] = useState<string>('');
  const [cableType, setCableType] = useState<string>('');
  const [systemVoltage, setSystemVoltage] = useState<string>('14.400');
  const [equipment, setEquipment] = useState<TestEquipment>({
    megohmeterSerial: '',
    megohmmeterAmpId: '',
    vlfHipotSerial: '',
    vlfHipotAmpId: ''
  });

  useEffect(() => {
    if (jobId) {
      loadJobInfo();
    }
    if (reportId) {
      loadReport();
    }
    setIsEditing(!reportId);
  }, [jobId, reportId]);

  // Debug: Monitor data changes for chart updates
  useEffect(() => {
    console.log('Chart data updated:', data);
  }, [data]);

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
      const { data: reportData, error } = await supabase
        .schema('neta_ops')
        .from('tandelta_mts_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`Report with ID ${reportId} not found. Starting new report.`);
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (reportData) {
        // Load report data from database
        setData(reportData.test_data?.points || initialData);
        setTestDate(reportData.report_info?.date || '');
        setCableType(reportData.report_info?.cableType || '');
        setSystemVoltage(reportData.report_info?.systemVoltage || '14.400');
        setEquipment(reportData.report_info?.testEquipment || {
          megohmeterSerial: '',
          megohmmeterAmpId: '',
          vlfHipotSerial: '',
          vlfHipotAmpId: ''
        });
        setStatus(reportData.report_info?.status || 'PASS');
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
      
      const reportData = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          date: testDate,
          cableType: cableType,
          systemVoltage: systemVoltage,
          testEquipment: equipment,
          status: status
        },
        test_data: {
          points: data
        }
      };

      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('tandelta_mts_reports')
          .update(reportData)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('tandelta_mts_reports')
          .insert(reportData)
          .select()
          .single();

        // Create asset entry
        if (result.data) {
          const assetData = {
            name: `Tan Delta Test MTS - ${cableType || 'Cable'}`,
            file_url: `report:/jobs/${jobId}/medium-voltage-vlf-tan-delta-mts/${result.data.id}`,
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

      if (result.error) throw result.error;

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
    value: string | number
  ) => {
    const newData = [...data];
    if (field === 'voltageLabel') {
      newData[index][field] = String(value);
    } else if (field === 'phaseAStdDev' || field === 'phaseBStdDev' || field === 'phaseCStdDev') {
      // For standard deviation fields, use null for empty values
      const s = String(value);
      newData[index][field] = s === '' ? null : parseFloat(s) || 0;
    } else {
      newData[index][field] = typeof value === 'number' ? value : (parseFloat(String(value)) || 0);
    }
    console.log('Data changed:', { index, field, value, newData });
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
        4-Medium Voltage Cable VLF Tan Delta MTS
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
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>
          
          {/* Job Information */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">System Voltage Line to Ground (kV RMS):</label>
                <input
                  type="number"
                  step="0.001"
                  value={systemVoltage}
                  onChange={(e) => setSystemVoltage(e.target.value)}
                  disabled={!isEditing}
                  className="mt-1 block w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cable Type:</label>
                <input
                  type="text"
                  value={cableType}
                  onChange={(e) => setCableType(e.target.value)}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Test Date:</label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Test Equipment */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter:</label>
                <input
                  type="text"
                  value={equipment.megohmeterSerial}
                  onChange={(e) => setEquipment(prev => ({ ...prev, megohmeterSerial: e.target.value }))}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number:</label>
                <input
                  type="text"
                  value={equipment.megohmeterSerial}
                  onChange={(e) => setEquipment(prev => ({ ...prev, megohmeterSerial: e.target.value }))}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID:</label>
                <input
                  type="text"
                  value={equipment.megohmmeterAmpId}
                  onChange={(e) => setEquipment(prev => ({ ...prev, megohmmeterAmpId: e.target.value }))}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VLF Hipot:</label>
                <input
                  type="text"
                  value={equipment.vlfHipotSerial}
                  onChange={(e) => setEquipment(prev => ({ ...prev, vlfHipotSerial: e.target.value }))}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number:</label>
                <input
                  type="text"
                  value={equipment.vlfHipotSerial}
                  onChange={(e) => setEquipment(prev => ({ ...prev, vlfHipotSerial: e.target.value }))}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID:</label>
                <input
                  type="text"
                  value={equipment.vlfHipotAmpId}
                  onChange={(e) => setEquipment(prev => ({ ...prev, vlfHipotAmpId: e.target.value }))}
                  disabled={!isEditing}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Tan Delta Test Data */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Tan Delta Test Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 p-3 bg-gray-50 dark:bg-dark-200 text-left">Voltage Steps</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-3 bg-gray-50 dark:bg-dark-200 text-left">kV</th>
                    <th colSpan={2} className="border border-gray-300 dark:border-gray-600 p-3 bg-gray-50 dark:bg-dark-200 text-center">A Phase</th>
                    <th colSpan={2} className="border border-gray-300 dark:border-gray-600 p-3 bg-gray-50 dark:bg-dark-200 text-center">B Phase</th>
                    <th colSpan={2} className="border border-gray-300 dark:border-gray-600 p-3 bg-gray-50 dark:bg-dark-200 text-center">C Phase</th>
                  </tr>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200"></th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200"></th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200 text-center">Tan Delta</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200 text-center">Std Dev</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200 text-center">Tan Delta</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200 text-center">Std Dev</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200 text-center">Tan Delta</th>
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-dark-200 text-center">Std Dev</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((point, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">{point.voltageLabel}</td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">{point.kV}</td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={point.phaseA}
                          onChange={(e) => handleDataChange(index, 'phaseA', parseFloat(e.target.value) || 0)}
                          disabled={!isEditing}
                          className="mt-1 block w-20 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={point.phaseAStdDev === null ? '' : String(point.phaseAStdDev)}
                          onChange={(e) => handleDataChange(index, 'phaseAStdDev', e.target.value)}
                          disabled={!isEditing}
                          className="mt-1 block w-20 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={point.phaseB}
                          onChange={(e) => handleDataChange(index, 'phaseB', parseFloat(e.target.value) || 0)}
                          disabled={!isEditing}
                          className="mt-1 block w-20 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={point.phaseBStdDev === null ? '' : String(point.phaseBStdDev)}
                          onChange={(e) => handleDataChange(index, 'phaseBStdDev', e.target.value)}
                          disabled={!isEditing}
                          className="mt-1 block w-20 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={point.phaseC}
                          onChange={(e) => handleDataChange(index, 'phaseC', parseFloat(e.target.value) || 0)}
                          disabled={!isEditing}
                          className="mt-1 block w-20 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={point.phaseCStdDev === null ? '' : String(point.phaseCStdDev)}
                          onChange={(e) => handleDataChange(index, 'phaseCStdDev', e.target.value)}
                          disabled={!isEditing}
                          className="mt-1 block w-20 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tan Delta Chart */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Tan Delta Chart</h2>
            <div className="bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700 p-6" style={{ height: '400px' }}>
              <ResponsiveContainer>
                <LineChart
                  data={data}
                  margin={{ top: 30, right: 40, left: 30, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="kV" 
                    label={{ value: 'Test Voltage (kV)', position: 'bottom', offset: 10 }} 
                    padding={{ left: 20, right: 20 }}
                  />
                  <YAxis
                    label={{ value: 'Tan Delta (E-3)', angle: -90, position: 'insideLeft', offset: -10 }}
                    domain={[0, 'auto']}
                    padding={{ top: 20 }}
                  />
                  <Tooltip formatter={(value) => [`${value}`, 'Tan Delta (E-3)']} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="top" 
                    align="center"
                    wrapperStyle={{ paddingBottom: '20px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="phaseA"
                    name="A Phase"
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                    strokeWidth={2}
                    dot={{ strokeWidth: 2, r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="phaseB"
                    name="B Phase"
                    stroke="#82ca9d"
                    activeDot={{ r: 8 }}
                    strokeWidth={2}
                    dot={{ strokeWidth: 2, r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="phaseC"
                    name="C Phase"
                    stroke="#ff7300"
                    activeDot={{ r: 8 }}
                    strokeWidth={2}
                    dot={{ strokeWidth: 2, r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
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
      /* Force all elements to print styles */
      * { 
        color: black !important; 
        background-color: white !important;
        box-sizing: border-box !important;
      }
      
      body { 
        margin: 0 !important; 
        padding: 20px !important; 
        font-family: Arial, sans-serif !important; 
        font-size: 12px !important;
      }
      
      /* Hide all navigation and header elements */
      header, nav, .navigation, [class*="nav"], [class*="header"], 
      .sticky, [class*="sticky"], .print\\:hidden { 
        display: none !important; 
      }
      
      /* Hide Back to Job button and division headers specifically */
      button[class*="Back"], 
      *[class*="Back to Job"], 
      h2[class*="Division"],
      .mobile-nav-text { 
        display: none !important; 
      }
      
      /* Form elements - hide interactive indicators */
      input, select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 10px !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        width: 100% !important; 
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      
      /* Hide dropdown arrows and form control indicators */
      select {
        background-image: none !important;
        padding-right: 8px !important;
      }
      
      /* Hide spin buttons on number inputs */
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      input[type="number"] {
        -moz-appearance: textfield !important;
      }
      
      /* Table styling - Force all tables to have proper layout */
      table { 
        border-collapse: collapse !important; 
        width: 100% !important; 
        table-layout: fixed !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      th, td { 
        border: 1px solid black !important; 
        padding: 3px !important; 
        font-size: 8px !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        white-space: normal !important;
        vertical-align: top !important;
        text-align: left !important;
        min-width: 0 !important;
        max-width: none !important;
      }
      
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
        font-size: 7px !important;
        text-align: center !important;
      }
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Section styling */
      section { break-inside: avoid !important; margin-bottom: 20px !important; }
      
      /* PRINT-SPECIFIC TABLE LAYOUT - Force override all existing styles */
      
      /* Tan Delta Data Table - Optimize column widths */
      table th:first-child,
      table td:first-child { 
        width: 15% !important; 
        min-width: 80px !important;
        max-width: 15% !important;
      }
      table th:nth-child(2),
      table td:nth-child(2) { 
        width: 8% !important; 
        min-width: 50px !important;
        max-width: 8% !important;
      }
      table th:nth-child(3),
      table td:nth-child(3),
      table th:nth-child(5),
      table td:nth-child(5),
      table th:nth-child(7),
      table td:nth-child(7) { 
        width: 12% !important; 
        min-width: 70px !important;
        max-width: 12% !important;
      }
      table th:nth-child(4),
      table td:nth-child(4),
      table th:nth-child(6),
      table td:nth-child(6),
      table th:nth-child(8),
      table td:nth-child(8) { 
        width: 12% !important; 
        min-width: 70px !important;
        max-width: 12% !important;
      }
      
      /* Force table layout for all tables */
      table { 
        table-layout: fixed !important; 
        width: 100% !important; 
        min-width: 100% !important;
        max-width: 100% !important;
      }
      
      /* Ensure text doesn't overflow in cells - Override all existing styles */
      table td { 
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        white-space: normal !important;
        font-size: 8px !important;
        line-height: 1.2 !important;
        overflow: visible !important;
        text-overflow: clip !important;
      }
      
      /* Make headers more compact - Override all existing styles */
      table th { 
        font-size: 7px !important;
        line-height: 1.1 !important;
        padding: 2px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      
      /* Force input fields to fit properly in print */
      table input,
      table select { 
        width: 100% !important; 
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        font-size: 8px !important;
        padding: 1px !important;
        margin: 0 !important;
        border: 1px solid black !important;
        background-color: white !important;
        color: black !important;
      }
      
      /* Chart styling for print */
      .recharts-wrapper {
        page-break-inside: avoid !important;
        margin: 20px 0 !important;
      }
      
      /* Ensure proper spacing between sections */
      .mb-6 {
        margin-bottom: 20px !important;
        page-break-inside: avoid !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default TanDeltaChartMTS; 