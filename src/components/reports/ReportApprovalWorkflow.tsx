import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { reportService, TechnicalReport, ReportStatus, ReportFilters } from '@/lib/services/reportService';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
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
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Report Content Viewer Component
interface ReportContentViewerProps {
  report: TechnicalReport;
}

function ReportContentViewer({ report }: ReportContentViewerProps) {
  const [reportComponent, setReportComponent] = useState<React.ComponentType<any> | null>(null);
  const [reportProps, setReportProps] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReportComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!report.report_data?.file_url) {
          setError('No report URL found');
          return;
        }

        // Parse the file_url to determine report type and ID
        const fileUrl = report.report_data.file_url;
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

                 // Map report slugs to their components
         const reportComponentMap: { [key: string]: () => Promise<{ default: React.ComponentType<any> }> } = {
           'panelboard-report': () => import('@/components/reports/PanelboardReport'),
           'low-voltage-switch-multi-device-test': () => import('@/components/reports/LowVoltageSwitchMultiDeviceTest'),
           'low-voltage-circuit-breaker-electronic-trip-ats-report': () => import('@/components/reports/LowVoltageCircuitBreakerElectronicTripATSReport'),
           'low-voltage-circuit-breaker-electronic-trip-mts-report': () => import('@/components/reports/LowVoltageCircuitBreakerElectronicTripMTSReport'),
           'automatic-transfer-switch-ats-report': () => import('@/components/reports/AutomaticTransferSwitchATSReport'),
           'large-dry-type-transformer-mts-report': () => import('@/components/reports/LargeDryTypeTransformerMTSReport'),
           'large-dry-type-xfmr-mts-report': () => import('@/components/reports/LargeDryTypeXfmrMTSReport'),
           'switchgear-panelboard-mts-report': () => import('@/components/reports/SwitchgearPanelboardMTSReport'),
           'liquid-xfmr-visual-mts-report': () => import('@/components/reports/LiquidXfmrVisualMTSReport'),
           'switchgear-report': () => import('@/components/reports/SwitchgearReport'),
           'dry-type-transformer': () => import('@/components/reports/DryTypeTransformerReport'),
           'large-dry-type-transformer': () => import('@/components/reports/LargeDryTypeTransformerReport'),
           'large-dry-type-transformer-report': () => import('@/components/reports/LargeDryTypeTransformerReport'),
           'liquid-filled-transformer': () => import('@/components/reports/LiquidFilledTransformerReport'),
           'oil-inspection': () => import('@/components/reports/OilInspectionReport'),
           'low-voltage-cable-test-12sets': () => import('@/components/reports/12setslowvoltagecables'),
           'low-voltage-cable-test-3sets': () => import('@/components/reports/3-LowVoltageCableMTS'),
           'medium-voltage-vlf-tan-delta': () => import('@/components/reports/TanDeltaChart'),
           'medium-voltage-vlf': () => import('@/components/reports/MediumVoltageVLFReport'),
           'medium-voltage-cable-vlf-test': () => import('@/components/reports/MediumVoltageCableVLFTest'),
           'metal-enclosed-busway': () => import('@/components/reports/MetalEnclosedBuswayReport'),
           'low-voltage-switch-report': () => import('@/components/reports/LowVoltageSwitchReport'),
           'medium-voltage-switch-oil-report': () => import('@/components/reports/MediumVoltageSwitchOilReport'),
           'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report': () => import('@/components/reports/LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport'),
           'low-voltage-circuit-breaker-thermal-magnetic-ats-report': () => import('@/components/reports/LowVoltageCircuitBreakerThermalMagneticATSReport'),
           'low-voltage-circuit-breaker-thermal-magnetic-mts-report': () => import('@/components/reports/LowVoltageCircuitBreakerThermalMagneticMTSReport'),
           'low-voltage-panelboard-small-breaker-report': () => import('@/components/reports/LowVoltagePanelboardSmallBreakerTestATSReport'),
           'medium-voltage-circuit-breaker-report': () => import('@/components/reports/MediumVoltageCircuitBreakerReport'),
           'current-transformer-test-ats-report': () => import('@/components/reports/CurrentTransformerTestATSReport'),
           '12-current-transformer-test-ats-report': () => import('@/components/reports/12-CurrentTransformerTestATSReport'),
           'oil-analysis-report': () => import('@/components/reports/OilAnalysisReport'),
           'cable-hipot-test-report': () => import('@/components/reports/CableHiPotReport'),
           'relay-test-report': () => import('@/components/reports/RelayTestReport'),
           'two-small-dry-typer-xfmr-ats-report': () => import('@/components/reports/TwoSmallDryTyperXfmrATSReport'),
           'medium-voltage-vlf-mts-report': () => import('@/components/reports/MediumVoltageVLFMTSReport'),
           'electrical-tan-delta-test-mts-form': () => import('@/components/reports/TanDeltaTestMTSForm'),
           'medium-voltage-cable-vlf-test-mts': () => import('@/components/reports/TanDeltaChartMTS'),
           'medium-voltage-circuit-breaker-mts-report': () => import('@/components/reports/MediumVoltageCircuitBreakerMTSReport'),
           '12-current-transformer-test-mts-report': () => import('@/components/reports/12-CurrentTransformerTestMTSReport'),
           '13-voltage-potential-transformer-test-mts-report': () => import('@/components/reports/13-VoltagePotentialTransformerTestMTSReport'),
           '23-medium-voltage-motor-starter-mts-report': () => import('@/components/reports/23-MediumVoltageMotorStarterMTSReport')
         };

        const componentLoader = reportComponentMap[reportSlug];
        if (!componentLoader) {
          setError(`Unknown report type: ${reportSlug}`);
          return;
        }

        // Load the component
        const module = await componentLoader();
        const ReportComponent = module.default;

        // Set up props for the report component
        const props = {
          jobId,
          reportId: reportId || undefined,
          // Add any other props that might be needed
          viewMode: true, // Indicate this is view-only mode
          readOnly: true, // Ensure no editing is allowed
          isPreview: true, // Additional flag for preview mode
        };

        setReportComponent(() => ReportComponent);
        setReportProps(props);
      } catch (err) {
        console.error('Error loading report component:', err);
        setError(`Failed to load report: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadReportComponent();
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

  if (!reportComponent) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div className="max-w-2xl w-full text-center">
          <p className="text-gray-500 italic text-lg mb-4">No report component available for preview.</p>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              View Raw Report Data
            </summary>
            <pre className="mt-3 text-xs whitespace-pre-wrap overflow-auto bg-gray-100 p-3 rounded max-h-64 text-left">
              {JSON.stringify(report.report_data, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  const ReportComponent = reportComponent;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-shrink-0 text-sm text-gray-600 bg-blue-50 p-3 border-b">
        <strong>Preview Mode:</strong> This is a read-only preview of the report content.
      </div>
      <div className="flex-1 overflow-auto bg-white">
        <div className="w-full min-h-full">
          <style dangerouslySetInnerHTML={{
            __html: `
              .report-fullscreen-viewer .max-w-7xl,
              .report-fullscreen-viewer .max-w-6xl,
              .report-fullscreen-viewer .max-w-5xl,
              .report-fullscreen-viewer .max-w-4xl,
              .report-fullscreen-viewer .max-w-3xl,
              .report-fullscreen-viewer .max-w-2xl,
              .report-fullscreen-viewer .max-w-xl,
              .report-fullscreen-viewer .max-w-lg,
              .report-fullscreen-viewer .max-w-md,
              .report-fullscreen-viewer .max-w-sm {
                max-width: none !important;
                width: 100% !important;
              }
              
              .report-fullscreen-viewer .justify-center {
                justify-content: flex-start !important;
              }
              
              .report-fullscreen-viewer .mx-auto {
                margin-left: 0 !important;
                margin-right: 0 !important;
              }
              
                             .report-fullscreen-viewer > div {
                 width: 100% !important;
                 max-width: none !important;
               }
               
               .report-fullscreen-viewer input,
               .report-fullscreen-viewer select,
               .report-fullscreen-viewer textarea {
                 pointer-events: none !important;
                 cursor: not-allowed !important;
                 user-select: none !important;
               }
               
               .report-fullscreen-viewer button:not(.status-button) {
                 pointer-events: none !important;
                 cursor: not-allowed !important;
               }
             `
           }} />
          <div className="report-fullscreen-viewer">
            <ReportComponent {...reportProps} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReportApprovalWorkflowProps {
  division?: string;
  jobId?: string;
}

export function ReportApprovalWorkflow({ division, jobId }: ReportApprovalWorkflowProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<TechnicalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<TechnicalReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('pending');
  
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
    archived: 0
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

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      // Map activeTab to status filter
      let statusFilter: ReportStatus | undefined;
      switch (activeTab) {
        case 'pending':
          statusFilter = 'submitted';
          break;

        case 'approved':
          statusFilter = 'approved';
          break;
        case 'rejected':
          statusFilter = 'rejected';
          break;
        case 'archived':
          statusFilter = 'archived';
          break;
        default:
          statusFilter = undefined;
      }

      // Build filters object
      const queryFilters: ReportFilters = {
        ...filters,
        status: statusFilter,
        start_date: dateRange.start,
        end_date: dateRange.end,
        search: searchTerm,
        report_type: reportTypeFilter || undefined,
        job_id: jobId // Ensure job_id is set from props
      };

      const response = await reportService.getAllReports(queryFilters);
      
      if (response.error) {
        setError(`Failed to load reports: ${response.error && typeof response.error === 'object' ? (response.error as any).message || 'Unknown error' : 'Unknown error'}`);
      } else {
        setReports(response.data || []);
        setError(null);
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
            archived: reports.filter(r => r.status === 'archived').length
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <TabsTrigger value="rejected">
            <XCircle className="mr-2 h-4 w-4" />
            Rejected
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
              {reports.map((report) => (
                <Card key={report.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold truncate">{report.title}</h3>
                            <p className="text-sm text-gray-500">
                              Report Type: {report.report_type}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-4">
                            {getStatusBadge(report.status)}
                            <span className="text-sm text-gray-500 whitespace-nowrap">
                              Submitted: {formatDate(report.submitted_at)}
                            </span>
                            
                            {report.reviewed_at && (
                              <span className="text-sm text-gray-500 whitespace-nowrap">
                                Reviewed: {formatDate(report.reviewed_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {report.review_comments && (
                          <div className="mt-2 p-2 border border-gray-200 rounded-md bg-gray-50">
                            <p className="text-sm text-gray-700">{report.review_comments}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewReport(report)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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