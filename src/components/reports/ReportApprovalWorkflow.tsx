import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { reportService, TechnicalReport, ReportStatus, ReportFilters } from '@/lib/services/reportService';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/toast';
import { 
  ClipboardCheck, 
  FilePlus, 
  FileCheck, 
  FileX, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Search,
  RotateCw,
  Eye,
  Download,
  Clock1,
  History,
  UserCheck
} from 'lucide-react';
import Select from '@/components/ui/Select';
import { Routes, Route } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

// Report Content Viewer Component
interface ReportContentViewerProps {
  report: TechnicalReport;
}

function ReportContentViewer({ report }: ReportContentViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);

  useEffect(() => {
    try {
      setIsLoading(true);
      setError(null);
      setReportPath(null);

      if (!report.report_data?.file_url) {
        setError('No report URL found');
        return;
      }

      const fileUrl = report.report_data.file_url as string;
      if (!fileUrl.startsWith('report:/jobs/')) {
        setError('Invalid report URL format');
        return;
      }

      const urlParts = fileUrl.replace('report:/jobs/', '').split('/');
      if (urlParts.length < 2) {
        setError('Invalid report URL structure');
        return;
      }

      const jobId = urlParts[0];
      const reportSlug = urlParts[1];
      const reportId = urlParts[2];

      // Build the in-app route path for iframe
      const basePath = reportId
        ? `/jobs/${jobId}/${reportSlug}/${reportId}`
        : `/jobs/${jobId}/${reportSlug}`;
      const path = `${basePath}?fromApproval=true`;

      setReportPath(path);
    } catch (e: any) {
      setError(e?.message || 'Failed to prepare report preview');
    } finally {
      setIsLoading(false);
    }
  }, [report]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-lg">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex">
              <AlertTriangle className="h-6 w-6 text-yellow-400 flex-shrink-0" />
              <div className="ml-4">
                <h3 className="text-lg font-medium text-yellow-800">Report Preview Unavailable</h3>
                <div className="mt-3 text-yellow-700">
                  <p className="mb-4">{error}</p>
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium hover:text-yellow-900">
                      View Raw Report Data
                    </summary>
                    <pre className="mt-3 text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
                      {JSON.stringify(report.report_data, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-shrink-0 text-sm text-gray-600 bg-blue-50 p-3 border-b flex items-center justify-between">
        <div>
          <strong>Preview Mode:</strong> This is a read-only preview of the report content.
        </div>
        {reportPath && (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="truncate max-w-xs" title={reportPath}>Path: {reportPath}</span>
            <a
              href={reportPath}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Open in new tab
            </a>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden bg-white">
        {reportPath ? (
          <iframe
            title="Report Preview"
            src={`${window.location.origin}${reportPath}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-500">
            Unable to resolve report path
          </div>
        )}
      </div>
    </div>
  );
}

interface ReportApprovalWorkflowProps {
  division?: string;
  jobId?: string;
  onUpdate?: () => void;
}

export function ReportApprovalWorkflow({ division, jobId, onUpdate }: ReportApprovalWorkflowProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<TechnicalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<TechnicalReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [reportSubstations, setReportSubstations] = useState<Record<string, string>>({});
  
  // Filter and search state
  const [filters, setFilters] = useState<ReportFilters>({
    status: 'submitted',
    job_id: jobId
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start?: string, end?: string }>({});

  // Review dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewComments, setReviewComments] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');
  
  // View report dialog state
  const [showViewDialog, setShowViewDialog] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState({
    total: 0,
    draft: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
    rejected: 0,
    archived: 0,
    sent: 0
  });

  // Role-based access control
  const [userRole, setUserRole] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<{
    canView: boolean;
    canReview: boolean;
    canApprove: boolean;
    canExport: boolean;
  }>({
    canView: false,
    canReview: false,
    canApprove: false,
    canExport: false
  });

  // When jobId changes, update filters
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      job_id: jobId
    }));
  }, [jobId]);

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchReports();
    fetchMetrics();
    if (user?.user_metadata?.role) {
      const role = user.user_metadata.role as string;
      setUserRole(role);
      
      // Set permissions based on role
      setUserPermissions({
        canView: true, // All authenticated users can view
        canReview: ['Manager', 'Admin', 'Supervisor'].includes(role),
        canApprove: ['Manager', 'Admin'].includes(role),
        canExport: ['Manager', 'Admin', 'Supervisor', 'User'].includes(role)
      });
    }
  }, [activeTab, filters, jobId, user]);

  // Listen for asset status changes to refresh the component
  useEffect(() => {
    const handleAssetStatusChange = (event: CustomEvent) => {
      const { newStatus } = event.detail;
      // Only refresh if the status change affects ready_for_review
      if (newStatus === 'ready_for_review' || newStatus === 'in_progress') {
        console.log('Asset status changed, refreshing ReportApprovalWorkflow');
        fetchReports();
        fetchMetrics();
      }
    };

    window.addEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    
    return () => {
      window.removeEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    };
  }, []);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      // Always show only ready-to-review (submitted) reports in job context
      let statusFilter: ReportStatus | undefined = jobId ? 'submitted' : undefined;
      switch (activeTab) {
        case 'pending':
          // Only show ready to approve
          statusFilter = 'submitted';
          break;
        case 'approved':
          statusFilter = 'approved';
          break;
        case 'accepted':
          // Alias of approved for UI terminology
          statusFilter = 'approved';
          break;
        case 'sent':
          statusFilter = 'sent';
          break;
        case 'rejected':
          statusFilter = 'rejected';
          break;
        case 'archived':
          statusFilter = 'archived';
          break;
        default:
          statusFilter = jobId ? 'submitted' : undefined;
      }

      if (jobId) {
        console.log('[ReportApproval] jobId:', jobId, 'statusFilter:', statusFilter);
        // Fetch reports ONLY via links from this job's assets to avoid stale/unlinked items
        const { data: jobAssetLinks, error: linksError } = await supabase
          .schema('neta_ops')
          .from('job_assets')
          .select('asset_id')
          .eq('job_id', jobId);
        if (linksError) throw linksError;
        const assetIds = (jobAssetLinks || []).map(l => l.asset_id);
        console.log('[ReportApproval] job asset link count:', assetIds.length);

        let byLinked: TechnicalReport[] = [];
        let linkedReportIds: string[] = [];
        if (assetIds.length > 0) {
          const { data: reportLinks, error: repLinksErr } = await supabase
            .schema('neta_ops')
            .from('asset_reports')
            .select('report_id')
            .in('asset_id', assetIds);
          if (repLinksErr) throw repLinksErr;
          linkedReportIds = Array.from(new Set((reportLinks || []).map(r => r.report_id)));
          console.log('[ReportApproval] linked report ids count:', linkedReportIds.length);
          if (linkedReportIds.length > 0) {
            let q2 = supabase
              .schema('neta_ops')
              .from('technical_reports')
              .select('*')
              .in('id', linkedReportIds);
            if (statusFilter) q2 = q2.eq('status', statusFilter);
            const { data: byIds, error: byIdsErr } = await q2;
            if (byIdsErr) throw byIdsErr;
            byLinked = (byIds || []) as TechnicalReport[];
          }
        }

        // Work only with linked reports
        // Filter by status for each tab explicitly
        let merged = byLinked.filter(r => {
          if (activeTab === 'pending') return r.status === 'submitted';
          if (activeTab === 'approved') return r.status === 'approved';
          if (activeTab === 'accepted') return r.status === 'approved';
          if (activeTab === 'sent') return r.status === 'sent';
          if (activeTab === 'rejected') return r.status === 'rejected' || r.status === 'issue';
          if (activeTab === 'archived') return r.status === 'archived';
          return true;
        });

        // For pending tab, also check that linked assets are still "ready_for_review"
        if (activeTab === 'pending' && merged.length > 0) {
          // Get the asset IDs for these reports
          const reportIds = merged.map(r => r.id);
          const { data: assetLinks, error: assetLinksError } = await supabase
            .schema('neta_ops')
            .from('asset_reports')
            .select('report_id, asset_id')
            .in('report_id', reportIds);
          
          if (!assetLinksError && assetLinks && assetLinks.length > 0) {
            const assetIds = Array.from(new Set(assetLinks.map(l => l.asset_id)));
            
            // Get the current status of these assets
            const { data: assetsData, error: assetsError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .select('id, status')
              .in('id', assetIds);
            
            if (!assetsError && assetsData) {
              // Create a map of asset status
              const assetStatusMap = new Map(assetsData.map(a => [a.id, a.status]));
              
              // Filter out reports where linked assets are not "ready_for_review"
              merged = merged.filter(report => {
                const linkedAssets = assetLinks.filter(l => l.report_id === report.id);
                return linkedAssets.some(link => assetStatusMap.get(link.asset_id) === 'ready_for_review');
              });
              
              console.log('[ReportApproval] After asset status filter:', merged.length);
            }
          }
        }
        console.log('[ReportApproval] fetched linked reports:', merged.length);

        // Client-side filters
        if (dateRange.start) {
          merged = merged.filter(r => !r.submitted_at || new Date(r.submitted_at) >= new Date(dateRange.start!));
        }
        if (dateRange.end) {
          merged = merged.filter(r => !r.submitted_at || new Date(r.submitted_at) <= new Date(dateRange.end!));
        }
        if (reportTypeFilter) {
          merged = merged.filter(r => (r.report_type || '').toLowerCase() === reportTypeFilter.toLowerCase());
        }
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          merged = merged.filter(r =>
            (r.title || '').toLowerCase().includes(term) ||
            (r.report_type || '').toLowerCase().includes(term)
          );
        }

        // Sort newest submitted first
        merged.sort((a, b) => new Date(b.submitted_at || '').getTime() - new Date(a.submitted_at || '').getTime());
        console.log('[ReportApproval] after filters count:', merged.length, 'ids:', merged.map(r => r.id));

        // Build map of reportId -> linked asset (for grouping/diagnostics if needed)
        let reportAssetsMap: Record<string, { name?: string; file_url?: string }[]> = {};
        if (merged.length > 0) {
          const reportIds = merged.map(r => r.id);
          const { data: repLinks, error: repLinksErr2 } = await supabase
            .schema('neta_ops')
            .from('asset_reports')
            .select('report_id, asset_id')
            .in('report_id', reportIds);
          if (!repLinksErr2 && repLinks && repLinks.length > 0) {
            const assetIds2 = Array.from(new Set(repLinks.map(l => l.asset_id)));
            const { data: assetsRows, error: assetsErr } = await supabase
              .schema('neta_ops')
              .from('assets')
              .select('id, name, file_url')
              .in('id', assetIds2);
            if (!assetsErr && assetsRows) {
              const assetById: Record<string, { name?: string; file_url?: string }> = {};
              assetsRows.forEach(a => { assetById[a.id] = { name: a.name, file_url: a.file_url }; });
              repLinks.forEach(l => {
                if (!reportAssetsMap[l.report_id]) reportAssetsMap[l.report_id] = [];
                const asset = assetById[l.asset_id];
                if (asset) reportAssetsMap[l.report_id].push(asset);
              });
            }
          }
        }
        ;(window as any).__reportApprovalAssetsMap = reportAssetsMap;

        // Resolve substation/location per report using underlying saved report rows, similar to Job Details
        try {
          const slugToTable: Record<string, string> = {
            'panelboard-report': 'panelboard_reports',
            'switchgear-report': 'switchgear_reports',
            'dry-type-transformer': 'transformer_reports',
            'large-dry-type-transformer-report': 'large_transformer_reports',
            'large-dry-type-transformer': 'large_transformer_reports',
            'large-dry-type-transformer-mts-report': 'large_dry_type_transformer_mts_reports',
            'large-dry-type-xfmr-mts-report': 'large_dry_type_transformer_mts_reports',
            'liquid-xfmr-visual-mts-report': 'liquid_xfmr_visual_mts_reports',
            'low-voltage-switch-report': 'low_voltage_switch_reports',
            'medium-voltage-switch-oil-report': 'medium_voltage_switch_oil_reports',
            'medium-voltage-switch-sf6-report': 'medium_voltage_switch_sf6_reports',
            'potential-transformer-ats-report': 'potential_transformer_ats_reports',
            'low-voltage-panelboard-small-breaker-report': 'low_voltage_panelboard_small_breaker_report',
            'medium-voltage-circuit-breaker-report': 'medium_voltage_circuit_breaker_reports',
            'medium-voltage-circuit-breaker-mts-report': 'medium_voltage_circuit_breaker_mts_reports',
            'medium-voltage-vlf-mts-report': 'medium_voltage_vlf_mts_reports',
            'medium-voltage-cable-vlf-test-mts': 'medium_voltage_vlf_mts_reports',
            'medium-voltage-vlf': 'medium_voltage_vlf_mts_reports',
            'medium-voltage-vlf-tan-delta': 'tandelta_reports',
            'medium-voltage-vlf-tan-delta-mts': 'tandelta_mts_reports',
            'electrical-tan-delta-test-mts-form': 'tandelta_mts_reports',
            'medium-voltage-cable-vlf-test': 'medium_voltage_cable_vlf_test',
            'current-transformer-test-ats-report': 'current_transformer_test_ats_reports',
            '12-current-transformer-test-ats-report': 'current_transformer_test_ats_reports',
            '12-current-transformer-test-mts-report': 'current_transformer_test_mts_reports',
            '13-voltage-potential-transformer-test-mts-report': 'voltage_potential_transformer_mts_reports',
            '23-medium-voltage-motor-starter-mts-report': 'medium_voltage_motor_starter_mts_reports',
            '23-medium-voltage-switch-mts-report': 'medium_voltage_switch_mts_reports',
            'metal-enclosed-busway': 'metal_enclosed_busway_reports',
            'low-voltage-circuit-breaker-thermal-magnetic-mts-report': 'low_voltage_circuit_breaker_thermal_magnetic_mts_reports',
            'low-voltage-circuit-breaker-electronic-trip-ats-report': 'low_voltage_circuit_breaker_electronic_trip_ats',
            'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report': 'low_voltage_circuit_breaker_electronic_trip_ats',
            'low-voltage-circuit-breaker-thermal-magnetic-ats-report': 'low_voltage_circuit_breaker_thermal_magnetic_ats',
            'automatic-transfer-switch-ats-report': 'automatic_transfer_switch_ats_reports',
            'low-voltage-circuit-breaker-electronic-trip-mts-report': 'low_voltage_circuit_breaker_electronic_trip_mts',
            'low-voltage-circuit-breaker-electronic-trip-mts': 'low_voltage_circuit_breaker_electronic_trip_mts',
            'low-voltage-circuit-breaker-electronic-trip-unit-mts': 'low_voltage_circuit_breaker_electronic_trip_mts',
            'two-small-dry-typer-xfmr-mts-report': 'two_small_dry_type_xfmr_mts_reports',
            'low-voltage-cable-test-3sets': 'low_voltage_cable_test_3sets',
            'low-voltage-cable-test-12sets': 'low_voltage_cable_test_12sets',
            'low-voltage-cable-test-20sets': 'transformer_reports',
            'low-voltage-switch-multi-device-test': 'low_voltage_switch_multi_device_reports',
            'two-small-dry-typer-xfmr-ats-report': 'two_small_dry_type_xfmr_ats_reports',
            'switchgear-panelboard-mts-report': 'switchgear_panelboard_mts_reports',
            'liquid-filled-transformer': 'liquid_filled_transformer_reports',
            'oil-inspection': 'oil_inspection_reports',
            'standard-report': 'standard_reports'
          };
          const slugFallbackTables: Record<string, string[]> = {
            'low-voltage-panelboard-small-breaker-report': ['low_voltage_cable_test_3sets'],
            'low-voltage-switch-multi-device-test': ['low_voltage_cable_test_3sets'],
            'medium-voltage-vlf-mts-report': ['medium_voltage_cable_vlf_test'],
            'medium-voltage-cable-vlf-test-mts': ['medium_voltage_cable_vlf_test'],
            'low-voltage-circuit-breaker-electronic-trip-mts-report': ['low_voltage_cable_test_3sets'],
            'low-voltage-circuit-breaker-thermal-magnetic-ats-report': ['low_voltage_cable_test_3sets']
          };

          const subMap: Record<string, string> = {};
          await Promise.all(merged.map(async (r) => {
            const fileUrl = (r as any)?.report_data?.file_url as string | undefined;
            if (!fileUrl || !fileUrl.startsWith('report:/jobs/')) return;
            const parts = fileUrl.replace('report:/jobs/', '').split('/');
            if (parts.length < 3) return;
            const slug = (parts[1] || '').split('?')[0];
            const repId = (parts[2] || '').split('?')[0];
            const primaryTable = slugToTable[slug];
            if (!primaryTable) return;
            const tablesToTry = [primaryTable, ...(slugFallbackTables[slug] || [])];
            let data: any = null;
            for (const t of tablesToTry) {
              const { data: d } = await supabase
                .schema('neta_ops')
                .from(t)
                .select('*')
                .eq('id', repId)
                .maybeSingle();
              if (d) { data = d; break; }
            }
            if (!data) return;
            const substation =
              (data.report_info && (data.report_info.substation || data.report_info.location || (data.report_info.jobInfo && data.report_info.jobInfo.substation))) ||
              (data.report_data && (
                data.report_data.substation || (data.report_data.jobInfo && data.report_data.jobInfo.substation) ||
                (data.report_data.reportInfo && (data.report_data.reportInfo.substation || data.report_data.reportInfo.location))
              )) ||
              (data.data && (
                data.data.substation || data.data.location || (data.data.jobInfo && data.data.jobInfo.substation) ||
                (data.data.reportInfo && (data.data.reportInfo.substation || data.data.reportInfo.location))
              )) || '';
            if (typeof substation === 'string' && substation.trim()) {
              subMap[r.id] = substation.trim();
            }
          }));
          setReportSubstations(subMap);
        } catch {}

        setReports(merged);
        setError(null);
      } else {
        // Global mode
        const queryFilters: ReportFilters = {
          ...filters,
          status: statusFilter,
          start_date: dateRange.start,
          end_date: dateRange.end,
          search: searchTerm,
          report_type: reportTypeFilter || undefined,
        };
        const response = await reportService.getAllReports(queryFilters);
        if (response.error) {
          setError(`Failed to load reports: ${response.error && typeof response.error === 'object' ? (response.error as any).message || 'Unknown error' : 'Unknown error'}`);
        } else {
          let reports = response.data || [];
          
          // For pending tab in global mode, also filter by asset status
          if (activeTab === 'pending' && reports.length > 0) {
            // Get the asset IDs for these reports
            const reportIds = reports.map(r => r.id);
            const { data: assetLinks, error: assetLinksError } = await supabase
              .schema('neta_ops')
              .from('asset_reports')
              .select('report_id, asset_id')
              .in('report_id', reportIds);
            
            if (!assetLinksError && assetLinks && assetLinks.length > 0) {
              const assetIds = Array.from(new Set(assetLinks.map(l => l.asset_id)));
              
              // Get the current status of these assets
              const { data: assetsData, error: assetsError } = await supabase
                .schema('neta_ops')
                .from('assets')
                .select('id, status')
                .in('id', assetIds);
              
              if (!assetsError && assetsData) {
                // Create a map of asset status
                const assetStatusMap = new Map(assetsData.map(a => [a.id, a.status]));
                
                // Filter out reports where linked assets are not "ready_for_review"
                reports = reports.filter(report => {
                  const linkedAssets = assetLinks.filter(l => l.report_id === report.id);
                  return linkedAssets.some(link => assetStatusMap.get(link.asset_id) === 'ready_for_review');
                });
                
                console.log('[ReportApproval] Global mode - After asset status filter:', reports.length);
              }
            }
          }
          
          setReports(reports);
          setError(null);
        }
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('An unexpected error occurred while fetching reports.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      let response;
      if (jobId) {
        // For job-specific metrics, we need to modify our API call
        // Since the original function doesn't support job_id filtering directly
        const allReportsResponse = await reportService.getAllReports({ job_id: jobId });
        if (allReportsResponse.data) {
          // Calculate metrics manually from the filtered reports
          const reports = allReportsResponse.data;
                     const metricCounts = {
             total: reports.length,
             draft: reports.filter(r => r.status === 'draft').length,
             submitted: reports.filter(r => r.status === 'submitted').length,
             inReview: 0, // Removed in-review status
             approved: reports.filter(r => r.status === 'approved').length,
             rejected: reports.filter(r => r.status === 'rejected').length,
             archived: reports.filter(r => r.status === 'archived').length,
             sent: reports.filter(r => r.status === 'sent').length
           };
          setMetrics(metricCounts);
          return;
        }
      }
      
      // If no jobId or there was an error, get global metrics
      response = await reportService.getReportApprovalMetrics();
      
      if (response.error) {
        console.error('Error fetching metrics:', response.error);
      } else {
        setMetrics(response.data);
      }
    } catch (err) {
      console.error('Error fetching metrics:', err);
    }
  };

  const handleReviewReport = (report: TechnicalReport) => {
    setSelectedReport(report);
    setReviewComments('');
    setReviewStatus('approved');
    setShowReviewDialog(true);
  };

  const handleViewReport = (report: TechnicalReport) => {
    setSelectedReport(report);
    setShowViewDialog(true);
  };

  const handleMarkAsSent = async (report: TechnicalReport) => {
    console.log('handleMarkAsSent called with report:', report.id, 'user:', user?.id);
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log('Calling reportService.markReportAsSent...');
      const response = await reportService.markReportAsSent(report.id, user.id, 'Report marked as sent');
      
      if (response.error) {
        toast({
          title: "Error",
          description: `Failed to mark report as sent: ${response.error && typeof response.error === 'object' ? (response.error as any).message || 'Unknown error' : 'Unknown error'}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Report marked as sent successfully",
          variant: "success"
        });
        fetchReports();
        fetchMetrics();
        if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
      }
    } catch (err) {
      console.error('Error marking report as sent:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsApproved = async (report: TechnicalReport) => {
    console.log('handleMarkAsApproved called with report:', report.id, 'user:', user?.id);
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log('Calling reportService.reviewReport to mark as approved...');
      const response = await reportService.reviewReport({
        report_id: report.id,
        status: 'approved',
        comments: 'Report marked as approved from sent status',
        reviewer_id: user.id
      });
      
      if (response.error) {
        toast({
          title: "Error",
          description: `Failed to mark report as approved: ${response.error && typeof response.error === 'object' ? (response.error as any).message || 'Unknown error' : 'Unknown error'}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Report marked as approved successfully",
          variant: "success"
        });
        fetchReports();
        fetchMetrics();
        if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
      }
    } catch (err) {
      console.error('Error marking report as approved:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const submitReview = async () => {
    if (!selectedReport || !user) return;
    
    setIsLoading(true);
    try {
      const response = await reportService.reviewReport({
        report_id: selectedReport.id,
        status: reviewStatus,
        comments: reviewComments,
        reviewer_id: user.id
      });
      
      if (response.error) {
        toast({
          title: "Error",
          description: `Failed to submit review: ${response.error && typeof response.error === 'object' ? (response.error as any).message || 'Unknown error' : 'Unknown error'}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: `Report ${reviewStatus === 'approved' ? 'approved' : 'rejected'}`,
          variant: "success"
        });
        setShowReviewDialog(false);
        fetchReports();
        fetchMetrics();
        if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
      }
    } catch (err) {
      console.error('Error submitting review:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchReports();
    fetchMetrics();
  };

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'submitted':
        return <Badge variant="default">Pending</Badge>;
      case 'approved':
        return <Badge variant="secondary">Approved</Badge>;
      case 'sent':
        return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">Sent</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isManager = user?.user_metadata?.role === 'Manager' || user?.user_metadata?.role === 'Admin';

  // Generate PDF report
  const generatePDF = (report: TechnicalReport) => {
    try {
      const doc = new jsPDF();
      
      // Add header with logo (would need to import logo)
      // doc.addImage(logo, 'PNG', 10, 10, 50, 15);
      
      // Add title
      doc.setFontSize(20);
      doc.text('Technical Report', 105, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text(report.title, 105, 30, { align: 'center' });
      
      // Add metadata
      doc.setFontSize(12);
      doc.text(`Report ID: ${report.id}`, 14, 45);
      doc.text(`Type: ${report.report_type}`, 14, 55);
      doc.text(`Status: ${report.status.toUpperCase()}`, 14, 65);
      doc.text(`Submitted: ${formatDate(report.submitted_at)}`, 14, 75);
      
      if (report.reviewed_at && report.reviewed_by) {
        doc.text(`Reviewed: ${formatDate(report.reviewed_at)}`, 14, 85);
        doc.text(`Reviewer: ${typeof report.reviewed_by === 'object' ? 
          (report.reviewed_by as any)?.display_name || 'Unknown' : 'Unknown'}`, 14, 95);
      }
      
      // Add revision history
      doc.setFontSize(14);
      doc.text('Revision History', 14, 115);
      
      const revisionData = report.revision_history.map(rev => [
        `v${rev.version}`,
        rev.status,
        formatDate(rev.timestamp),
        rev.user_name || 'Unknown'
      ]);
      
      (doc as any).autoTable({
        startY: 120,
        head: [['Version', 'Status', 'Date', 'User']],
        body: revisionData,
      });
      
      // Add report data
      const reportDataY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(14);
      doc.text('Report Details', 14, reportDataY);
      
      // Format report data as needed
      let reportTextY = reportDataY + 10;
      const reportDataStr = JSON.stringify(report.report_data, null, 2);
      const reportLines = reportDataStr.split('\n');
      
      doc.setFontSize(10);
      reportLines.forEach((line, index) => {
        if (reportTextY > 280) {
          doc.addPage();
          reportTextY = 20;
        }
        doc.text(line, 14, reportTextY);
        reportTextY += 5;
      });
      
      // Add approval signature for approved reports
      if (report.status === 'approved') {
        doc.addPage();
        doc.setFontSize(14);
        doc.text('Approval Certification', 105, 20, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text('This report has been reviewed and approved according to', 105, 40, { align: 'center' });
        doc.text('company standards and procedures.', 105, 50, { align: 'center' });
        
        doc.text(`Approved by: ${typeof report.reviewed_by === 'object' ? 
          (report.reviewed_by as any)?.display_name || 'Unknown' : 'Unknown'}`, 105, 70, { align: 'center' });
        doc.text(`Approval date: ${formatDate(report.reviewed_at)}`, 105, 80, { align: 'center' });
        
        // Add signature line
        doc.line(60, 100, 150, 100);
        doc.text('Authorized Signature', 105, 110, { align: 'center' });
      }
      
      // Save the PDF
      doc.save(`Report_${report.id}_${report.title.replace(/\s+/g, '_')}.pdf`);
      
      toast({
        title: "Success",
        description: "Report PDF has been generated and downloaded",
        variant: "success"
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: "Error",
        description: "Failed to generate PDF report",
        variant: "destructive"
      });
    }
  };

  // Customize the UI based on whether we're showing all reports or just job-specific reports
  const isJobSpecific = !!jobId;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {isJobSpecific ? "Job Report Approval" : "Technical Report Approval Workflow"}
        </h2>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RotateCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Metrics Summary Cards - Only show if not job-specific */}
      {!isJobSpecific && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {metrics.submitted}
                <span className="text-sm text-gray-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {metrics.approved}
                <span className="text-sm text-gray-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {metrics.sent}
                <span className="text-sm text-gray-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {metrics.rejected}
                <span className="text-sm text-gray-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}


      {/* Tabs for report status filter */}
      <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">
            <Clock className="mr-2 h-4 w-4" />
            Pending Approval
          </TabsTrigger>

          <TabsTrigger value="approved">
            <CheckCircle className="mr-2 h-4 w-4" />
            Approved
          </TabsTrigger>
          <TabsTrigger value="sent">
            <Download className="mr-2 h-4 w-4" />
            Sent
          </TabsTrigger>
          <TabsTrigger value="rejected">
            <XCircle className="mr-2 h-4 w-4" />
            Rejected
          </TabsTrigger>
          <TabsTrigger value="accepted">
            <UserCheck className="mr-2 h-4 w-4" />
            Accepted
          </TabsTrigger>
          <TabsTrigger value="archived">
            <FileCheck className="mr-2 h-4 w-4" />
            Archived
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-10">
              <p>Loading reports...</p>
            </div>
          ) : error ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p>{error}</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-10 border rounded-md">
              <FileCheck className="mx-auto h-10 w-10 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No reports found</h3>
              <p className="mt-1 text-sm text-gray-500">
                There are no reports with the current filter criteria.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                // In job context, group like Linked Assets: Imported, numeric folders, Other
                if (jobId) {
                  const assetsMap: Record<string, { name?: string; file_url?: string }[]> = (window as any).__reportApprovalAssetsMap || {};
                  const getFolder = (r: TechnicalReport): string => {
                    // Prefer grouping by Substation/Location from report_data (match Job Details Reports tab)
                    try {
                      const data: any = (r as any).report_data || {};
                      const candidates: Array<any> = [
                        data?.report_info?.substation,
                        data?.report_info?.location,
                        data?.report_info?.jobInfo?.substation,
                        data?.report_info?.job_info?.substation,
                        data?.reportInfo?.substation,
                        data?.reportInfo?.location,
                        data?.reportInfo?.jobInfo?.substation,
                        data?.job_info?.substation,
                        data?.job_info?.location,
                        data?.jobInfo?.substation,
                        data?.jobInfo?.location,
                        data?.substation,
                        data?.location,
                        data?.data?.report_info?.substation,
                        data?.data?.report_info?.location,
                        data?.data?.reportInfo?.substation,
                        data?.data?.reportInfo?.location,
                        data?.data?.job_info?.substation,
                        data?.data?.jobInfo?.substation,
                        data?.data?.substation,
                        data?.data?.location
                      ];
                      const found = candidates.find(v => typeof v === 'string' && v.trim());
                      if (typeof found === 'string') {
                        return found.trim();
                      }
                    } catch (_) {}

                    // If we have pre-resolved substation from underlying report rows, use it
                    const pre = reportSubstations[r.id];
                    if (typeof pre === 'string' && pre.trim()) return pre.trim();

                    // Fallbacks: mark Imported if any linked asset indicates import; else Other
                    const linked = assetsMap[r.id] || [];
                    if (linked.length > 0) {
                      const primary = linked[0];
                      const imported = /import/i.test(primary?.name || '') || /import/i.test(primary?.file_url || '');
                      if (imported) return 'Imported';
                    }
                    return 'Other';
                  };
                  const groups: Record<string, TechnicalReport[]> = {};
                  reports.forEach(r => {
                    const key = getFolder(r);
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(r);
                  });
                  const orderKeys = Object.keys(groups).sort((a, b) => {
                    if (a === 'Imported') return -1;
                    if (b === 'Imported') return 1;
                    if (a === 'Other' && b !== 'Other') return 1;
                    if (b === 'Other' && a !== 'Other') return -1;
                    return a.localeCompare(b, undefined, { sensitivity: 'base' });
                  });
                  return (
                    <>
                      {orderKeys.map((folderKey) => (
                        <details key={folderKey} className="group border rounded-md overflow-hidden">
                          <summary className="cursor-pointer select-none bg-gray-50 dark:bg-dark-150 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-800 dark:text-white">
                                {folderKey === 'Imported' ? 'Imported' : folderKey === 'Other' ? 'Other' : `${folderKey}`}
                              </span>
                              <span className="text-xs text-gray-500">({groups[folderKey].length})</span>
                            </div>
                            <svg className="w-4 h-4 text-gray-500 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div className="bg-white dark:bg-dark-150 p-3 space-y-2">
                            {groups[folderKey]
                              .slice()
                              .sort((a, b) => new Date(b.submitted_at || '').getTime() - new Date(a.submitted_at || '').getTime())
                              .map((report) => (
                                <div key={report.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                                  <div className="flex-1 min-w-0 pr-3">
                                    <div className="flex items-center gap-3">
                                      <h4 className="text-sm font-semibold truncate">{report.title}</h4>
                                      {getStatusBadge(report.status)}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500 flex items-center gap-4">
                                      <span>Submitted: {formatDate(report.submitted_at)}</span>
                                    </div>
                                    {report.review_comments && (
                                      <div className="mt-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                                        {report.review_comments}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => handleViewReport(report)}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      View
                                    </Button>
                            {(() => {
                              const isApprovedTab = activeTab === 'approved' || activeTab === 'accepted';
                              const shouldShowSent = isApprovedTab && report.status === 'approved';
                              const shouldShowApproved = activeTab === 'sent' && report.status === 'sent';
                                      console.log('Button visibility check:', { reportId: report.id, activeTab, reportStatus: report.status, shouldShowSent, shouldShowApproved });
                                      return shouldShowSent || shouldShowApproved;
                                    })() && (
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => {
                                          if (report.status === 'approved') {
                                            console.log('Mark as Sent clicked for report:', report.id, 'status:', report.status, 'activeTab:', activeTab);
                                            handleMarkAsSent(report);
                                          } else if (report.status === 'sent') {
                                            console.log('Mark as Approved clicked for report:', report.id, 'status:', report.status, 'activeTab:', activeTab);
                                            handleMarkAsApproved(report);
                                          }
                                        }}
                                        className={`${
                                          report.status === 'approved' 
                                            ? 'text-blue-600 hover:text-blue-700 border-blue-300 hover:border-blue-400'
                                            : 'text-green-600 hover:text-green-700 border-green-300 hover:border-green-400'
                                        }`}
                                      >
                                        <Download className="h-4 w-4 mr-2" />
                                        {report.status === 'approved' ? 'Mark as Sent' : 'Mark as Approved'}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </details>
                      ))}
                    </>
                  );
                }
                // Global view fallback
                return (
                  <div className="space-y-2">
                    {reports.map(report => (
                      <div key={report.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-3">
                            <h4 className="text-sm font-semibold truncate">{report.title}</h4>
                            {getStatusBadge(report.status)}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 flex items-center gap-4">
                            <span>Submitted: {formatDate(report.submitted_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleViewReport(report)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                          {(() => {
                            const shouldShowSent = activeTab === 'approved' && report.status === 'approved';
                            const shouldShowApproved = activeTab === 'sent' && report.status === 'sent';
                            console.log('Button visibility check (global):', { reportId: report.id, activeTab, reportStatus: report.status, shouldShowSent, shouldShowApproved });
                            return shouldShowSent || shouldShowApproved;
                          })() && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                if (report.status === 'approved') {
                                  console.log('Mark as Sent clicked for report (global):', report.id, 'status:', report.status, 'activeTab:', activeTab);
                                  handleMarkAsSent(report);
                                } else if (report.status === 'sent') {
                                  console.log('Mark as Approved clicked for report (global):', report.id, 'status:', report.status, 'activeTab:', activeTab);
                                  handleMarkAsApproved(report);
                                }
                              }}
                              className={`${
                                report.status === 'approved' 
                                  ? 'text-blue-600 hover:text-blue-700 border-blue-300 hover:border-blue-400'
                                  : 'text-green-600 hover:text-green-700 border-green-300 hover:border-green-400'
                              }`}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              {report.status === 'approved' ? 'Mark as Sent' : 'Mark as Approved'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {selectedReport && (
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Review Report: {selectedReport.title}</DialogTitle>
              <DialogDescription>Review and set the approval status for this report.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Report Status</h4>
                  <div className="flex space-x-2">
                    <Button 
                      type="button" 
                      variant={reviewStatus === 'approved' ? 'secondary' : 'outline'}
                      onClick={() => setReviewStatus('approved')}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button 
                      type="button" 
                      variant={reviewStatus === 'rejected' ? 'secondary' : 'outline'}
                      onClick={() => setReviewStatus('rejected')}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Review Comments</h4>
                  <Textarea
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder={reviewStatus === 'rejected' ? 'Explanation for rejection is required...' : 'Add comments about this report...'}
                    rows={4}
                    required={reviewStatus === 'rejected'}
                  />
                  {reviewStatus === 'rejected' && !reviewComments && (
                    <p className="text-sm text-red-500 mt-1">Comments are required when rejecting a report</p>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowReviewDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={submitReview}
                    disabled={isLoading || (reviewStatus === 'rejected' && !reviewComments)}
                  >
                    Submit Review
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* View Report Dialog */}
      {selectedReport && (
        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
          <style dangerouslySetInnerHTML={{
            __html: `
              [data-radix-dialog-content] {
                max-width: none !important;
                width: calc(100vw - 4rem) !important;
                height: calc(100vh - 4rem) !important;
                margin: 2rem !important;
                padding: 0 !important;
                border-radius: 12px !important;
                position: fixed !important;
                top: 2rem !important;
                left: 2rem !important;
                right: 2rem !important;
                bottom: 2rem !important;
                transform: none !important;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
              }
              
              [data-radix-dialog-overlay] {
                background-color: rgba(0, 0, 0, 0.75) !important;
              }
              
              /* Hide only the default dialog close button in top-right corner */
              [data-radix-dialog-content] > button[aria-label="Close"] {
                display: none !important;
              }
            `
          }} />
          <DialogContent className="max-w-none p-0 flex flex-col" style={{
            width: 'calc(100vw - 4rem)',
            height: 'calc(100vh - 4rem)',
            margin: '2rem',
            maxWidth: 'none',
            maxHeight: 'none',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Header */}
            <DialogHeader className="flex-shrink-0 p-4 border-b bg-white">
              <div className="flex justify-between items-center">
                <DialogTitle className="text-lg font-semibold">{selectedReport.title}</DialogTitle>
                <DialogDescription>Read-only preview of the submitted report.</DialogDescription>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span>Status:</span>
                    {getStatusBadge(selectedReport.status)}
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      onClick={() => setShowViewDialog(false)}
                      variant="secondary"
                      size="sm"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Report Content - Full Screen */}
            <div className="flex-1 overflow-hidden bg-gray-50">
              <ReportContentViewer report={selectedReport} />
            </div>

            {/* Collapsible Review Panel */}
            <div className="flex-shrink-0 border-t bg-white">
              <details className="group">
                <summary className="cursor-pointer p-4 hover:bg-gray-50 flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {userPermissions.canReview && selectedReport.status === 'submitted' ? 'Review Actions' : 'Report Details & History'}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">Click to expand</span>
                    <div className="transform transition-transform group-open:rotate-180">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </summary>
                
                <div className="px-4 pb-4 border-t bg-gray-50">
                  {/* Show Review Actions if user can review and report is submitted */}
                  {userPermissions.canReview && selectedReport.status === 'submitted' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Review Comments</label>
                        <Textarea
                          value={reviewComments}
                          onChange={(e) => setReviewComments(e.target.value)}
                          placeholder="Add comments about this report..."
                          rows={3}
                          className="w-full"
                        />
                      </div>
                      
                      <div className="flex justify-end space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            if (!selectedReport || !user) return;
                            try {
                              const response = await reportService.archiveReport(selectedReport.id, user.id, reviewComments || 'Report archived');
                              if (response.error) {
                                toast({
                                  title: "Error",
                                  description: `Failed to archive report: ${response.error}`,
                                  variant: "destructive"
                                });
                              } else {
                                toast({
                                  title: "Success",
                                  description: "Report archived successfully",
                                  variant: "success"
                                });
                                setShowViewDialog(false);
                                fetchReports();
                                fetchMetrics();
                                if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
                              }
                            } catch (err) {
                              console.error('Error archiving report:', err);
                              toast({
                                title: "Error",
                                description: "Failed to archive report",
                                variant: "destructive"
                              });
                            }
                          }}
                        >
                          Archive Report
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            if (!selectedReport || !user) return;
                            if (!reviewComments.trim()) {
                              toast({
                                title: "Error",
                                description: "Comments are required when rejecting a report",
                                variant: "destructive"
                              });
                              return;
                            }
                            try {
                              const response = await reportService.reviewReport({
                                report_id: selectedReport.id,
                                status: 'rejected',
                                comments: reviewComments,
                                reviewer_id: user.id
                              });
                              if (response.error) {
                                toast({
                                  title: "Error",
                                  description: `Failed to reject report: ${response.error}`,
                                  variant: "destructive"
                                });
                              } else {
                                toast({
                                  title: "Success",
                                  description: "Report rejected",
                                  variant: "success"
                                });
                                setShowViewDialog(false);
                                fetchReports();
                                fetchMetrics();
                                if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
                              }
                            } catch (err) {
                              console.error('Error rejecting report:', err);
                              toast({
                                title: "Error",
                                description: "Failed to reject report",
                                variant: "destructive"
                              });
                            }
                          }}
                          className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject & Mark as Issue
                        </Button>
                        
                        <Button 
                          size="sm"
                          onClick={async () => {
                            if (!selectedReport || !user) return;
                            try {
                              const response = await reportService.reviewReport({
                                report_id: selectedReport.id,
                                status: 'approved',
                                comments: reviewComments || 'Report approved',
                                reviewer_id: user.id
                              });
                              if (response.error) {
                                toast({
                                  title: "Error",
                                  description: `Failed to approve report: ${response.error}`,
                                  variant: "destructive"
                                });
                              } else {
                                toast({
                                  title: "Success",
                                  description: "Report approved",
                                  variant: "success"
                                });
                                setShowViewDialog(false);
                                fetchReports();
                                fetchMetrics();
                                if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
                              }
                            } catch (err) {
                              console.error('Error approving report:', err);
                              toast({
                                title: "Error",
                                description: "Failed to approve report",
                                variant: "destructive"
                              });
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Show Report Details & History for non-reviewable reports */
                    <>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div>
                          <h4 className="text-sm font-medium mb-1 text-gray-700">Report Type</h4>
                          <p className="text-sm">{selectedReport.report_type}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-1 text-gray-700">Submitted By</h4>
                          <p className="text-sm">{typeof selectedReport.submitted_by === 'object' ? (selectedReport.submitted_by as any)?.display_name || 'Unknown' : 'Unknown'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-1 text-gray-700">Submitted Date</h4>
                          <p className="text-sm">{formatDate(selectedReport.submitted_at)}</p>
                        </div>
                        {selectedReport.reviewed_by && (
                          <div>
                            <h4 className="text-sm font-medium mb-1 text-gray-700">Reviewed By</h4>
                            <p className="text-sm">{typeof selectedReport.reviewed_by === 'object' ? (selectedReport.reviewed_by as any)?.display_name || 'Unknown' : 'Unknown'}</p>
                          </div>
                        )}
                      </div>

                      {selectedReport.review_comments && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium mb-2 text-gray-700">Review Comments</h4>
                          <div className="p-3 border rounded bg-white text-sm">
                            {selectedReport.review_comments}
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="text-sm font-medium mb-2 text-gray-700">Revision History</h4>
                        <div className="border rounded bg-white divide-y max-h-32 overflow-y-auto">
                          {selectedReport.revision_history.map((revision, index) => (
                            <div key={index} className="p-3 flex justify-between text-sm">
                              <div className="flex items-center">
                                <History className="h-3 w-3 mr-2 text-gray-400" />
                                <span className="font-medium">v{revision.version}</span>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {revision.status}
                                </Badge>
                                {revision.comments && (
                                  <span className="ml-3 text-gray-600 truncate max-w-xs">
                                    {revision.comments}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center text-gray-500 text-xs">
                                <Clock1 className="h-3 w-3 mr-1" />
                                {formatDate(revision.timestamp)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </details>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 