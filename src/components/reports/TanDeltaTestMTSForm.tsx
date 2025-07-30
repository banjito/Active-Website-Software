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
          points: data
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
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>NETA</div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-2">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>
          
          {/* Cable Type and Test Date Inputs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <label htmlFor="systemVoltage" style={{ marginRight: '10px' }}>System Voltage Line to Ground (kV RMS):</label>
              <input 
                type="text" 
                id="systemVoltage" 
                value={systemVoltage} 
                onChange={(e) => setSystemVoltage(e.target.value)} 
                disabled={!isEditing}
                style={{ border: '1px solid #ddd', padding: '8px', borderRadius: '4px', width: '80px' }}
              />
            </div>
          </div>

          {/* Data Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 'bold' }}>Tan Delta Test</h2>
            {isEditing && (
              <button 
                onClick={toggleEditMode} 
                style={{ 
                  padding: '8px 15px', 
                  backgroundColor: editingData ? '#f44336' : '#4CAF50', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }}
              >
                {editingData ? 'Lock Data' : 'Edit Data'}
              </button>
            )}
          </div>
          <div style={{ marginBottom: '30px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>Voltage Steps</th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>kV</th>
                  <th colSpan={2} style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2', textAlign: 'center' }}>A Phase</th>
                  <th colSpan={2} style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2', textAlign: 'center' }}>B Phase</th>
                  <th colSpan={2} style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2', textAlign: 'center' }}>C Phase</th>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}></th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}></th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>TD [E-3]</th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>Std. Dev</th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>TD [E-3]</th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>Std. Dev</th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>TD [E-3]</th>
                  <th style={{ border: '1px solid #ddd', padding: '10px', backgroundColor: '#f2f2f2' }}>Std. Dev</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={index}>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="text"
                          value={row.voltageLabel}
                          onChange={(e) => handleDataChange(index, 'voltageLabel', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.voltageLabel
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.001"
                          value={row.kV}
                          onChange={(e) => handleDataChange(index, 'kV', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.kV.toFixed(3)
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.1"
                          value={row.phaseA}
                          onChange={(e) => handleDataChange(index, 'phaseA', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.phaseA.toFixed(1)
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.01"
                          value={row.phaseAStdDev === null ? '' : row.phaseAStdDev}
                          onChange={(e) => handleDataChange(index, 'phaseAStdDev', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.phaseAStdDev === null ? '' : row.phaseAStdDev.toFixed(1)
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.1"
                          value={row.phaseB}
                          onChange={(e) => handleDataChange(index, 'phaseB', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.phaseB.toFixed(1)
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.01"
                          value={row.phaseBStdDev === null ? '' : row.phaseBStdDev}
                          onChange={(e) => handleDataChange(index, 'phaseBStdDev', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.phaseBStdDev === null ? '' : row.phaseBStdDev.toFixed(1)
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.1"
                          value={row.phaseC}
                          onChange={(e) => handleDataChange(index, 'phaseC', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.phaseC.toFixed(1)
                      )}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                      {editingData ? (
                        <input
                          type="number"
                          step="0.01"
                          value={row.phaseCStdDev === null ? '' : row.phaseCStdDev}
                          onChange={(e) => handleDataChange(index, 'phaseCStdDev', e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                          disabled={!isEditing || !editingData}
                        />
                      ) : (
                        row.phaseCStdDev === null ? '' : row.phaseCStdDev.toFixed(1)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart - Always visible below the table */}
          <div style={{ height: '400px', border: '1px solid #ddd', padding: '15px', marginBottom: '30px', background: '#f9f9f9' }}>
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

          {/* Test Equipment Used Section */}
          <div className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
            <div className="space-y-6">
              {/* Megohmmeter Section */}
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-baseline">
                  <div>
                    <label htmlFor="megohmmeterMakeModel" className="form-label">Megohmmeter Make/Model:</label>
                    <input
                      id="megohmmeterMakeModel"
                      type="text"
                      value={equipment.megohmmeterMakeModel}
                      onChange={(e) => handleEquipmentChange('megohmmeterMakeModel', e.target.value)}
                      className="form-input mt-1"
                      disabled={!isEditing}
                      placeholder="Make/Model"
                    />
                  </div>
                  <div>
                    <label htmlFor="megohmeterSerial" className="form-label">Serial Number:</label>
                    <input
                      id="megohmeterSerial"
                      type="text"
                      value={equipment.megohmeterSerial}
                      onChange={(e) => handleEquipmentChange('megohmeterSerial', e.target.value)}
                      className="form-input mt-1"
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <label htmlFor="megohmmeterAmpId" className="form-label">AMP ID:</label>
                    <input
                      id="megohmmeterAmpId"
                      type="text"
                      value={equipment.megohmmeterAmpId}
                      onChange={(e) => handleEquipmentChange('megohmmeterAmpId', e.target.value)}
                      className="form-input mt-1"
                      disabled={!isEditing}
                    />
                  </div>
                </div>
              </div>

              {/* VLF Hipot Section */}
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-baseline">
                  <div>
                    <label htmlFor="vlfHipotMakeModel" className="form-label">VLF Hipot Make/Model:</label>
                    <input
                      id="vlfHipotMakeModel"
                      type="text"
                      value={equipment.vlfHipotMakeModel}
                      onChange={(e) => handleEquipmentChange('vlfHipotMakeModel', e.target.value)}
                      className="form-input mt-1"
                      disabled={!isEditing}
                      placeholder="Make/Model"
                    />
                  </div>
                  <div>
                    <label htmlFor="vlfHipotSerial" className="form-label">Serial Number:</label>
                    <input
                      id="vlfHipotSerial"
                      type="text"
                      value={equipment.vlfHipotSerial}
                      onChange={(e) => handleEquipmentChange('vlfHipotSerial', e.target.value)}
                      className="form-input mt-1"
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <label htmlFor="vlfHipotAmpId" className="form-label">AMP ID:</label>
                    <input
                      id="vlfHipotAmpId"
                      type="text"
                      value={equipment.vlfHipotAmpId}
                      onChange={(e) => handleEquipmentChange('vlfHipotAmpId', e.target.value)}
                      className="form-input mt-1"
                      disabled={!isEditing}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Comments Section */}
          <div className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
            <textarea
              rows={4}
              className="form-input"
              // Add state and handler for comments if needed
              disabled={!isEditing}
            />
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
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      
      /* Hide all navigation and header elements */
      header, nav, .navigation, [class*="nav"], [class*="header"], 
      .sticky, [class*="sticky"], .print\\:hidden { 
        display: none !important; 
      }
      
      /* Hide Back to Job button and division headers specifically */
      button[class*="Back"], 
      *[class*="Back to Job"], 
      h2[class*="Division"],
      .mobile-nav-text,
      [class*="formatDivisionName"] {
        display: none !important;
      }
      
      .print\\:break-before-page { page-break-before: always; }
      .print\\:break-after-page { page-break-after: always; }
      .print\\:break-inside-avoid { page-break-inside: avoid; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }
      
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid black !important; padding: 4px !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }
      
      input, select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 10px !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
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
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Section styling */
      section { break-inside: avoid !important; margin-bottom: 20px !important; }
      
      /* Ensure all text is black for maximum readability */
      * { color: black !important; }
    }
  `;
  document.head.appendChild(style);
}

export default TanDeltaTestMTSForm; 