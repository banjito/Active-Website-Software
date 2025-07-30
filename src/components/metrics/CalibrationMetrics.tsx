import React, { useState, useEffect } from 'react';
import Card from '../ui/Card';
import { CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { MetricsChart, MetricData } from '../ui/MetricsChart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { 
  fetchReportApprovalMetrics,
  fetchVehicleAvailabilityMetrics,
  fetchEquipmentAvailabilityMetrics,
  fetchTechnicianCountMetrics
} from '../../services/metricsService';
import { Ruler, BarChart, AlertCircle, FileCheck, Truck, Wrench, Users } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';

interface CalibrationMetricsProps {
  division?: string | null;
}

export function CalibrationMetrics({ division }: CalibrationMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [reportApprovalData, setReportApprovalData] = useState<MetricData[]>([]);
  const [reportApprovalMetrics, setReportApprovalMetrics] = useState<{
    approved: number;
    pending: number;
    rejected: number;
    total: number;
  }>({
    approved: 0,
    pending: 0,
    rejected: 0,
    total: 0
  });
  const [vehiclesAvailable, setVehiclesAvailable] = useState<number>(0);
  const [equipmentAvailable, setEquipmentAvailable] = useState<number>(0);
  const [technicianCount, setTechnicianCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState('overview');

  // Calibration-specific metrics
  const [calibrationMetrics, setCalibrationMetrics] = useState({
    equipmentCalibrated: 187,
    calibrationAccuracy: '99.4%',
    pendingCalibrations: 43
  });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch report approval data for the specific division
        const reportApproval = await fetchReportApprovalMetrics(division || undefined);
        setReportApprovalMetrics(reportApproval);
        
        // Set chart data - only show if there are reports
        if (reportApproval.total > 0) {
          setReportApprovalData([
            { name: 'Approved', value: reportApproval.approved },
            { name: 'Pending', value: reportApproval.pending },
            { name: 'Rejected', value: reportApproval.rejected }
          ]);
        } else {
          setReportApprovalData([]);
        }

        // Fetch single metrics
        const vehicles = await fetchVehicleAvailabilityMetrics(division || undefined);
        setVehiclesAvailable(vehicles);

        const equipment = await fetchEquipmentAvailabilityMetrics(division || undefined);
        setEquipmentAvailable(equipment);

        const technicians = await fetchTechnicianCountMetrics(division || undefined);
        setTechnicianCount(technicians);
      } catch (error) {
        console.error('Error loading Calibration metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [division]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-xl">Calibration Performance Metrics</CardTitle>
        <CardDescription>
          Key metrics for Calibration Division
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reports">Report Approval</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Calibration-specific metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
              <Card>
                <div className="flex items-center justify-between p-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground dark:text-white/70">Equipment Calibrated</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{calibrationMetrics.equipmentCalibrated}</p>
                    )}
                  </div>
                  <div className="rounded-md bg-black/5 p-2">
                    <Ruler className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
                  </div>
                </div>
              </Card>

        <Card>
          <div className="flex items-center justify-between p-6">
            <div>
                    <p className="text-sm font-medium text-muted-foreground dark:text-white/70">Calibration Accuracy</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{calibrationMetrics.calibrationAccuracy}</p>
                    )}
            </div>
            <div className="rounded-md bg-black/5 p-2">
                    <BarChart className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between p-6">
            <div>
                    <p className="text-sm font-medium text-muted-foreground dark:text-white/70">Pending Calibrations</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{calibrationMetrics.pendingCalibrations}</p>
                    )}
                  </div>
                  <div className="rounded-md bg-black/5 p-2">
                    <AlertCircle className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
                  </div>
                </div>
              </Card>
            </div>

            {/* General metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
              <Card>
                <div className="flex items-center justify-between p-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground dark:text-white/70">Vehicles Available</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{vehiclesAvailable}</p>
                    )}
                  </div>
                  <div className="rounded-md bg-black/5 p-2">
                    <Truck className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between p-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground dark:text-white/70">Equipment Available</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{equipmentAvailable}</p>
                    )}
            </div>
            <div className="rounded-md bg-black/5 p-2">
              <Wrench className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between p-6">
            <div>
                    <p className="text-sm font-medium text-muted-foreground dark:text-white/70">Technicians</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{technicianCount}</p>
                    )}
            </div>
            <div className="rounded-md bg-black/5 p-2">
              <Users className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>
      </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Report Approval Rate</CardTitle>
                  <div className="rounded-md bg-black/5 p-2">
                    <FileCheck className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : reportApprovalMetrics.total === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">No reports found for this division</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportApprovalMetrics.total}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Reports</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600">{reportApprovalMetrics.approved}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Approved</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-yellow-600">{reportApprovalMetrics.pending}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{reportApprovalMetrics.rejected}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Rejected</p>
                      </div>
                    </div>
                    <div className="h-[200px]">
                      <MetricsChart 
                        type="pie"
                        data={reportApprovalData}
                        title="Report Status Distribution"
                        colors={['#4ade80', '#facc15', '#f87171']}
                        height={200}
                      />
                    </div>
            </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Report Approval Status</CardTitle>
                  <div className="rounded-md bg-black/5 p-2">
                    <FileCheck className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Skeleton className="h-[300px] w-full" />
                  </div>
                ) : reportApprovalMetrics.total === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">No reports found for this division</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      Reports will appear here once they are submitted for approval
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{reportApprovalMetrics.total}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Reports</p>
                      </div>
                      <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-green-600">{reportApprovalMetrics.approved}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Approved</p>
                        <p className="text-xs text-green-600">
                          {reportApprovalMetrics.total > 0 ? Math.round((reportApprovalMetrics.approved / reportApprovalMetrics.total) * 100) : 0}%
                        </p>
                      </div>
                      <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-yellow-600">{reportApprovalMetrics.pending}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
                        <p className="text-xs text-yellow-600">
                          {reportApprovalMetrics.total > 0 ? Math.round((reportApprovalMetrics.pending / reportApprovalMetrics.total) * 100) : 0}%
                        </p>
                      </div>
                      <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-red-600">{reportApprovalMetrics.rejected}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Rejected</p>
                        <p className="text-xs text-red-600">
                          {reportApprovalMetrics.total > 0 ? Math.round((reportApprovalMetrics.rejected / reportApprovalMetrics.total) * 100) : 0}%
                        </p>
                      </div>
                    </div>
                    <div className="h-[350px]">
                      <MetricsChart 
                        type="bar"
                        data={reportApprovalData}
                        title="Report Status"
                        colors={['#4ade80', '#facc15', '#f87171']}
                        height={350}
                      />
            </div>
            </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
      </Card>
  );
}

export default CalibrationMetrics; 