import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { TechnicalReport, ReportStatus, ReportFilters } from '@/lib/services/reportService';
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

interface ReportApprovalWorkflowProps {
  division?: string;
  jobId?: string;
  onUpdate?: () => void;
}

const REPORT_APPROVAL_LOAD_LIMIT = 500;

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

  // Sort: submission_date (default oldest first), alphabetical, or substation
  type SortByOption = 'submission_date' | 'alphabetical' | 'substation';
  const [sort, setSort] = useState<{ by: SortByOption; dir: 'asc' | 'desc' }>({ by: 'submission_date', dir: 'asc' });
  const sortBy = sort.by;
  const sortDirection = sort.dir;

  // Pagination for global report list (next 500)
  const [reportsOffset, setReportsOffset] = useState(0);
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Review dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewComments, setReviewComments] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');

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
    setReportsOffset(0);
    fetchReports(0);
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

  // Compute sorted list on every render so sort changes always apply (avoids stale closure)
  const sortedReports = (() => {
    const list = [...reports];
    const mult = sort.dir === 'asc' ? 1 : -1;
    const getSub = (r: TechnicalReport) =>
      (reportSubstations[r.id] || (r.report_data?.substation as string) || '').trim().toLowerCase();
    list.sort((a, b) => {
      if (sort.by === 'submission_date') {
        const ta = new Date(a.submitted_at || a.created_at || 0).getTime();
        const tb = new Date(b.submitted_at || b.created_at || 0).getTime();
        return mult * (ta - tb);
      }
      if (sort.by === 'alphabetical') {
        const sa = (a.title || '').toLowerCase();
        const sb = (b.title || '').toLowerCase();
        return mult * sa.localeCompare(sb, undefined, { sensitivity: 'base' });
      }
      // sort.by === 'substation'
      const sa = getSub(a) || '\uffff';
      const sb = getSub(b) || '\uffff';
      return mult * sa.localeCompare(sb, undefined, { sensitivity: 'base' });
    });
    return list;
  })();

  const fetchReports = async (loadOffset: number = 0) => {
    const isLoadMore = loadOffset > 0;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    try {
      // Map tab names to asset status values
      // Asset statuses: 'ready_for_review', 'approved', 'sent', 'rejected', 'in_progress', etc.
      let assetStatusFilter: string | undefined;
      switch (activeTab) {
        case 'pending':
          assetStatusFilter = 'ready_for_review';
          break;
        case 'approved':
        case 'accepted':
          assetStatusFilter = 'approved';
          break;
        case 'sent':
          assetStatusFilter = 'sent';
          break;
        case 'rejected':
          assetStatusFilter = 'rejected';
          break;
        case 'archived':
          assetStatusFilter = 'archived';
          break;
        default:
          assetStatusFilter = jobId ? 'ready_for_review' : undefined;
      }

      if (jobId) {
        console.log('[ReportApproval] jobId:', jobId, 'assetStatusFilter:', assetStatusFilter, 'loadOffset:', loadOffset);
        
        // Fetch one page of asset IDs linked to this job (500 at a time)
        const { data: jobAssetLinks, error: linksError } = await supabase
          .schema('neta_ops')
          .from('job_assets')
          .select('asset_id')
          .eq('job_id', jobId)
          .order('asset_id', { ascending: true })
          .range(loadOffset, loadOffset + REPORT_APPROVAL_LOAD_LIMIT - 1);
        if (linksError) throw linksError;
        const assetIds: string[] = (jobAssetLinks || []).map(l => l.asset_id);
        console.log('[ReportApproval] job asset link count this page:', assetIds.length);

        const assetsData: any[] = [];
        if (assetIds.length > 0) {
          let assetQuery = supabase
            .schema('neta_ops')
            .from('assets')
            .select('id, name, file_url, status, created_at, submitted_at, approved_at, sent_at, urgency, substation')
            .in('id', assetIds)
            .or('file_url.like.report:/%,file_url.ilike.%.pdf');
          if (assetStatusFilter) {
            assetQuery = assetQuery.eq('status', assetStatusFilter);
          }
          const { data: assets, error: assetsError } = await assetQuery;
          if (assetsError) throw assetsError;
          if (assets && assets.length > 0) assetsData.push(...assets);
        }
        
        console.log('[ReportApproval] fetched assets count:', assetsData.length);
        setHasMoreReports((jobAssetLinks || []).length === REPORT_APPROVAL_LOAD_LIMIT);
        setReportsOffset(loadOffset + (jobAssetLinks || []).length);

        // Convert assets to TechnicalReport-like format for compatibility with existing UI
        let merged: TechnicalReport[] = assetsData.map(asset => {
          // Check if this is a PDF report (not a report:/ URL)
          const isPdfReport = asset.file_url && !asset.file_url.startsWith('report:/') && asset.file_url.toLowerCase().endsWith('.pdf');
          
          let reportSlug = '';
          let reportId = asset.id;
          
          if (isPdfReport) {
            // For PDF reports, use a special type identifier
            reportSlug = 'pdf-report';
          } else {
            // Extract report type from file_url: report:/jobs/{jobId}/{reportSlug}/{reportId}
            const urlParts = (asset.file_url || '').replace('report:/jobs/', '').split('/');
            reportSlug = urlParts.length >= 2 ? urlParts[1] : '';
            reportId = urlParts.length >= 3 ? urlParts[2] : asset.id;
          }
          
          // Convert slug to readable title
          const reportType = reportSlug
            .split('-')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          
          return {
            id: asset.id,
            title: asset.name || reportType || 'Untitled Report',
            report_type: reportSlug,
            status: asset.status === 'ready_for_review' ? 'submitted' : asset.status,
            job_id: jobId,
            submitted_at: asset.submitted_at || asset.created_at,
            approved_at: asset.approved_at,
            sent_at: asset.sent_at,
            created_at: asset.created_at,
            report_data: {
              file_url: asset.file_url,
              urgency: asset.urgency,
              substation: asset.substation
            }
          } as TechnicalReport;
        });

        console.log('[ReportApproval] converted reports:', merged.length);

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
        const reportAssetsMap: Record<string, { name?: string; file_url?: string; urgency?: 'normal' | 'critical' }[]> = {};
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
              .select('id, name, file_url, urgency')
              .in('id', assetIds2);
            if (!assetsErr && assetsRows) {
              const assetById: Record<string, { name?: string; file_url?: string; urgency?: 'normal' | 'critical' }> = {};
              assetsRows.forEach(a => { assetById[a.id] = { name: a.name, file_url: a.file_url, urgency: a.urgency }; });
              repLinks.forEach(l => {
                if (!reportAssetsMap[l.report_id]) reportAssetsMap[l.report_id] = [];
                const asset = assetById[l.asset_id];
                if (asset) reportAssetsMap[l.report_id].push(asset);
              });
            }
          }
        }
        const existingMap = (window as any).__reportApprovalAssetsMap || {};
        (window as any).__reportApprovalAssetsMap = isLoadMore ? { ...existingMap, ...reportAssetsMap } : reportAssetsMap;

        if (isLoadMore) {
          setReports(prev => [...prev, ...merged]);
        } else {
          setReports(merged);
        }

        // Resolve substation/location per report using underlying saved report rows, similar to Job Details
        try {
          const slugToTable: Record<string, string> = {
            // New ATS25 reports
            'switchgear-switchboard-assemblies-ats25': 'switchgear_switchboard_ats25_reports',
            'panelboard-assemblies-ats25': 'panelboard_assemblies_ats25_reports',
            'small-lv-dry-type-transformer-ats25': 'small_lv_dry_type_transformer_ats25_reports',
            'liquid-filled-xfmr-ats25': 'liquid_filled_xfmr_ats25_reports',
            'lv-molded-case-circuit-breaker-ats25': 'lv_molded_case_circuit_breaker_ats25',
            'emergency-systems-engine-generator-ats25': 'emergency_systems_engine_generator_ats25',
            // Legacy reports
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
            'medium-voltage-switch-sf6': 'medium_voltage_switch_sf6_reports',
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
            'gfi-trip-test-report': 'gfi_trip_test_reports',
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
            'grounding-system-master': 'grounding_system_master_reports',
            'grounding-fall-of-potential-slope-method-test': 'grounding_fall_of_potential_slope_method_test_reports',
            'standard-report': 'standard_reports',
            '6-low-voltage-switch-maint-mts-report': 'low_voltage_switch_maint_mts_reports'
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
            // Get file_url from linked asset (more reliable than technical_reports.report_data.file_url)
            const linkedAssets = reportAssetsMap[r.id] || [];
            const linkedAssetFileUrl = linkedAssets.length > 0 ? linkedAssets[0].file_url : undefined;
            // Fall back to technical_reports.report_data.file_url if no linked asset found
            const fileUrl = linkedAssetFileUrl || (r as any)?.report_data?.file_url as string | undefined;
            if (!fileUrl || !fileUrl.startsWith('report:/jobs/')) return;
            const parts = fileUrl.replace('report:/jobs/', '').split('/');
            // parts can be:
            // ['jobId', 'slug', 'reportId'] (standard format)
            // ['jobId', 'slug', 'substationFolder', 'reportId'] (grounding reports with substation)
            if (parts.length < 3) return;
            const slug = (parts[1] || '').split('?')[0];
            // Check if this is a report with substation folder (4 parts)
            const isGroundingReport = slug === 'grounding-system-master' || slug === 'grounding-fall-of-potential-slope-method-test' || slug === 'gfi-trip-test-report';
            let repId = '';
            if (parts.length >= 4 && isGroundingReport) {
              // substationFolder is parts[2], reportId is parts[3]
              repId = (parts[3] || '').split('?')[0];
            } else {
              // Standard format: reportId is parts[2]
              repId = (parts[2] || '').split('?')[0];
            }
            if (!repId) return;
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
            // Extract substation - check direct field first, then nested paths
            const substation =
              data.substation ||
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
          if (isLoadMore) {
            setReportSubstations(prev => ({ ...prev, ...subMap }));
          } else {
            setReportSubstations(subMap);
          }
        } catch {}

        setError(null);
      } else {
        // Global mode - Query assets table directly with the correct status
        console.log('[ReportApproval] Global mode - assetStatusFilter:', assetStatusFilter);
        
        let assetQuery = supabase
          .schema('neta_ops')
          .from('assets')
          .select('id, name, file_url, status, created_at, submitted_at, approved_at, sent_at, urgency')
          .like('file_url', 'report:/%'); // Only get report assets
        
        if (assetStatusFilter) {
          assetQuery = assetQuery.eq('status', assetStatusFilter);
        }
        
        // Apply date filters
        if (dateRange.start) {
          assetQuery = assetQuery.gte('submitted_at', dateRange.start);
        }
        if (dateRange.end) {
          assetQuery = assetQuery.lte('submitted_at', dateRange.end);
        }
        
        // Apply search filter
        if (searchTerm) {
          assetQuery = assetQuery.ilike('name', `%${searchTerm}%`);
        }
        
        assetQuery = assetQuery
          .order('submitted_at', { ascending: false, nullsFirst: false })
          .range(loadOffset, loadOffset + REPORT_APPROVAL_LOAD_LIMIT - 1);
        
        const { data: assetsData, error: assetsError } = await assetQuery;
        
        if (assetsError) {
          if (assetsError.code === 'PGRST106' || assetsError.message?.includes('does not exist')) {
            console.warn('Assets table does not exist yet');
            setReports([]);
            setError(null);
          } else {
            setError(`Failed to load reports: ${assetsError.message || 'Unknown error'}`);
          }
        } else {
          // Convert assets to TechnicalReport-like format
          let reports: TechnicalReport[] = (assetsData || []).map(asset => {
            // Extract job_id and report type from file_url
            const urlParts = (asset.file_url || '').replace('report:/jobs/', '').split('/');
            const assetJobId = urlParts.length >= 1 ? urlParts[0] : '';
            const reportSlug = urlParts.length >= 2 ? urlParts[1] : '';
            
            const reportType = reportSlug
              .split('-')
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            
            return {
              id: asset.id,
              title: asset.name || reportType || 'Untitled Report',
              report_type: reportSlug,
              status: asset.status === 'ready_for_review' ? 'submitted' : asset.status,
              job_id: assetJobId,
              submitted_at: asset.submitted_at || asset.created_at,
              approved_at: asset.approved_at,
              sent_at: asset.sent_at,
              created_at: asset.created_at,
              report_data: {
                file_url: asset.file_url,
                urgency: asset.urgency
              }
            } as TechnicalReport;
          });
          
          // Apply report type filter if specified
          if (reportTypeFilter) {
            reports = reports.filter(r => 
              (r.report_type || '').toLowerCase() === reportTypeFilter.toLowerCase()
            );
          }
          
          setHasMoreReports((assetsData || []).length === REPORT_APPROVAL_LOAD_LIMIT);
          setReportsOffset(loadOffset + (assetsData || []).length);
          if (isLoadMore) {
            setReports(prev => [...prev, ...reports]);
          } else {
            setReports(reports);
          }
          console.log('[ReportApproval] Global mode - Reports count:', isLoadMore ? reports.length + ' (appended)' : reports.length);
          setError(null);
        }
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('An unexpected error occurred while fetching reports.');
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      let assets: { id: string; status: string }[] = [];

      if (jobId) {
        // For job-specific metrics, get asset IDs in batches of 500
        const assetIds: string[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: jobAssetLinks, error: linksError } = await supabase
            .schema('neta_ops')
            .from('job_assets')
            .select('asset_id')
            .eq('job_id', jobId)
            .order('asset_id', { ascending: true })
            .range(offset, offset + REPORT_APPROVAL_LOAD_LIMIT - 1);
          if (linksError) {
            console.error('Error fetching job asset links:', linksError);
            return;
          }
          if (!jobAssetLinks || jobAssetLinks.length === 0) break;
          jobAssetLinks.forEach(l => assetIds.push(l.asset_id));
          hasMore = jobAssetLinks.length === REPORT_APPROVAL_LOAD_LIMIT;
          offset += REPORT_APPROVAL_LOAD_LIMIT;
        }
        if (assetIds.length === 0) {
          setMetrics({
            total: 0,
            draft: 0,
            submitted: 0,
            inReview: 0,
            approved: 0,
            rejected: 0,
            archived: 0,
            sent: 0
          });
          return;
        }
        // Fetch assets in batches of 500
        for (let i = 0; i < assetIds.length; i += REPORT_APPROVAL_LOAD_LIMIT) {
          const chunk = assetIds.slice(i, i + REPORT_APPROVAL_LOAD_LIMIT);
          const { data: assetsData, error: assetsError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .select('id, status')
            .like('file_url', 'report:/%')
            .in('id', chunk);
          if (assetsError) {
            console.error('Error fetching assets for metrics:', assetsError);
            return;
          }
          if (assetsData && assetsData.length > 0) assets.push(...assetsData);
        }
      } else {
        // Global metrics: cap at 500 to match list
        const { data: assetsData, error: assetsError } = await supabase
          .schema('neta_ops')
          .from('assets')
          .select('id, status')
          .like('file_url', 'report:/%')
          .limit(REPORT_APPROVAL_LOAD_LIMIT);
        if (assetsError) {
          console.error('Error fetching assets for metrics:', assetsError);
          return;
        }
        assets = assetsData || [];
      }
      
      // Map asset statuses to report metrics
      // Asset statuses: ready_for_review, approved, sent, rejected, in_progress, etc.
      const metricCounts = {
        total: assets.length,
        draft: assets.filter(a => a.status === 'in_progress' || a.status === 'draft').length,
        submitted: assets.filter(a => a.status === 'ready_for_review').length, // ready_for_review = submitted
        inReview: 0, // Not used
        approved: assets.filter(a => a.status === 'approved').length,
        rejected: assets.filter(a => a.status === 'rejected' || a.status === 'issue').length,
        archived: assets.filter(a => a.status === 'archived').length,
        sent: assets.filter(a => a.status === 'sent').length
      };
      
      setMetrics(metricCounts);
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

  // Handle downloading/printing PDF reports
  const handleDownloadPdfReport = async (report: TechnicalReport) => {
    const fileUrl = report.report_data?.file_url as string;
    if (fileUrl && !fileUrl.startsWith('report:/') && fileUrl.toLowerCase().endsWith('.pdf')) {
      try {
        // Fetch the PDF file as a blob to ensure it downloads rather than opens
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch PDF file');
        }
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Create a temporary anchor element to trigger download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${report.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the blob URL
        window.URL.revokeObjectURL(blobUrl);
        
        toast({
          title: "Success",
          description: "PDF report downloaded",
          variant: "success"
        });
      } catch (error: any) {
        console.error('Error downloading PDF report:', error);
        toast({
          title: "Error",
          description: `Failed to download PDF: ${error.message || 'Unknown error'}`,
          variant: "destructive"
        });
      }
    }
  };

  const handleViewReport = (report: TechnicalReport) => {
    console.log('[ViewDialog] handleViewReport called for:', report.id);
    
    // Build the report URL
    if (!report.report_data?.file_url) {
      toast({ title: "Error", description: "No report URL found", variant: "destructive" });
      return;
    }
    
    const fileUrl = report.report_data.file_url as string;
    
    // Check if this report can be reviewed (status is submitted)
    const canReview = report.status === 'submitted' && userPermissions.canReview;
    
    // Create modal completely outside of React
    // This survives component unmounts
    let modalContainer = document.getElementById('report-view-modal-root');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'report-view-modal-root';
      document.body.appendChild(modalContainer);
    }
    
    // Handle PDF reports (direct file URLs, not report:/ URLs)
    if (fileUrl && !fileUrl.startsWith('report:/') && fileUrl.toLowerCase().endsWith('.pdf')) {
      // Create modal for PDF report
      modalContainer.innerHTML = `
        <div id="report-view-modal" style="position:fixed;inset:0;z-index:99999;isolation:isolate;">
          <div style="position:absolute;inset:0;background:rgba(0,0,0,0.75);"></div>
          <div style="position:absolute;inset:2rem;background:white;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;">
            <!-- Header -->
            <div style="flex-shrink:0;padding:1rem;border-bottom:1px solid #e5e7eb;background:white;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">${report.title}</h2>
                <p style="font-size:0.875rem;color:#6b7280;margin:0;">PDF Report - Review and approve or reject</p>
              </div>
              <div style="display:flex;align-items:center;gap:0.75rem;">
                <span style="padding:0.25rem 0.75rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:${report.status === 'submitted' ? '#fef3c7' : report.status === 'approved' ? '#d1fae5' : '#fee2e2'};color:${report.status === 'submitted' ? '#92400e' : report.status === 'approved' ? '#065f46' : '#991b1b'};">
                  ${report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                </span>
                <button id="report-view-close-btn" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;">
                  Close
                </button>
              </div>
            </div>
            
            <!-- PDF Content -->
            <div style="flex:1;overflow:hidden;background:#f9fafb;">
              <div style="padding:0.75rem;background:#eff6ff;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#4b5563;">
                <strong>PDF Report:</strong> View the PDF below. 
                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;margin-left:0.5rem;">Open in new tab</a>
              </div>
              <iframe 
                src="${fileUrl}" 
                style="width:100%;height:calc(100% - 45px);border:none;"
                title="PDF Report Preview"
              ></iframe>
            </div>
            
            <!-- Review Actions Panel -->
            ${canReview ? `
            <div id="review-panel" style="flex-shrink:0;border-top:1px solid #e5e7eb;background:white;padding:1rem;display:none;">
              <div style="margin-bottom:0.75rem;">
                <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.5rem;">Review Comments</label>
                <textarea 
                  id="review-comments-input"
                  placeholder="Add comments about this report (required for rejection)..."
                  style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:0.375rem;font-size:0.875rem;resize:none;box-sizing:border-box;"
                  rows="2"
                ></textarea>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
                <button id="review-archive-btn" style="padding:0.5rem 1rem;background:white;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;color:#374151;">
                  Archive
                </button>
                <button id="review-reject-btn" style="padding:0.5rem 1rem;background:white;border:1px solid #fca5a5;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;color:#dc2626;">
                  ✕ Reject / Mark as Issue
                </button>
                <button id="review-approve-btn" style="padding:0.5rem 1rem;background:#16a34a;border:none;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;color:white;font-weight:500;">
                  ✓ Approve
                </button>
              </div>
            </div>
            <div style="flex-shrink:0;border-top:1px solid #e5e7eb;background:white;padding:0.75rem;display:flex;justify-content:center;">
              <button id="review-toggle-btn" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;display:flex;align-items:center;gap:0.5rem;">
                <span id="review-toggle-text">Show Review</span>
                <span id="review-toggle-icon">▲</span>
              </button>
            </div>
            ` : ''}
          </div>
        </div>
      `;
      
      // Add close handler
      const closeBtn = document.getElementById('report-view-close-btn');
      if (closeBtn) {
        closeBtn.onclick = () => {
          const modal = document.getElementById('report-view-modal');
          if (modal) modal.remove();
        };
      }
      
      // Add toggle handler for review panel
      if (canReview) {
        const toggleBtn = document.getElementById('review-toggle-btn');
        const reviewPanel = document.getElementById('review-panel');
        const toggleText = document.getElementById('review-toggle-text');
        const toggleIcon = document.getElementById('review-toggle-icon');
        
        if (toggleBtn && reviewPanel && toggleText && toggleIcon) {
          toggleBtn.onclick = () => {
            const isVisible = reviewPanel.style.display !== 'none';
            if (isVisible) {
              reviewPanel.style.display = 'none';
              toggleText.textContent = 'Show Review';
              toggleIcon.textContent = '▲';
            } else {
              reviewPanel.style.display = 'block';
              toggleText.textContent = 'Hide Review';
              toggleIcon.textContent = '▼';
            }
          };
        }
      }
      
      // Add review action handlers if canReview
      if (canReview) {
        const approveBtn = document.getElementById('review-approve-btn');
        const rejectBtn = document.getElementById('review-reject-btn');
        const archiveBtn = document.getElementById('review-archive-btn');
        const commentsInput = document.getElementById('review-comments-input') as HTMLTextAreaElement;
        
        if (approveBtn) {
          approveBtn.onclick = async () => {
            if (!user) return;
            const now = new Date().toISOString();
            
            const updateData: any = {
              status: 'approved',
              reviewed_by: user.id,
              reviewed_at: now,
              approved_at: now,
              review_comments: commentsInput?.value || null
            };
            
            const { error } = await supabase
              .schema('neta_ops')
              .from('assets')
              .update(updateData)
              .eq('id', report.id);
            
            if (error) {
              toast({
                title: "Error",
                description: `Failed to approve report: ${error.message || 'Unknown error'}`,
                variant: "destructive"
              });
            } else {
              window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'approved' } }));
              toast({
                title: "Success",
                description: "Report approved successfully",
                variant: "success"
              });
              const modal = document.getElementById('report-view-modal');
              if (modal) modal.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
            }
          };
        }
        
        if (rejectBtn) {
          rejectBtn.onclick = async () => {
            if (!user) return;
            // Get fresh reference to comments input to ensure we have the current value
            const commentsEl = document.getElementById('review-comments-input') as HTMLTextAreaElement;
            const comments = commentsEl?.value?.trim() || '';
            
            if (!comments) {
              toast({
                title: "Error",
                description: "Comments are required when rejecting a report",
                variant: "destructive"
              });
              commentsEl?.focus();
              return;
            }
            
            const now = new Date().toISOString();
            const updateData: any = {
              status: 'issue',
              reviewed_by: user.id,
              reviewed_at: now,
              review_comments: comments
            };
            
            const { error } = await supabase
              .schema('neta_ops')
              .from('assets')
              .update(updateData)
              .eq('id', report.id);
            
            if (error) {
              toast({
                title: "Error",
                description: `Failed to reject report: ${error.message || 'Unknown error'}`,
                variant: "destructive"
              });
            } else {
              window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'issue' } }));
              toast({
                title: "Success",
                description: "Report rejected and marked as issue",
                variant: "success"
              });
              const modal = document.getElementById('report-view-modal');
              if (modal) modal.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
            }
          };
        }
        
        if (archiveBtn) {
          archiveBtn.onclick = async () => {
            if (!user) return;
            const now = new Date().toISOString();
            
            const updateData: any = {
              status: 'archived',
              reviewed_by: user.id,
              reviewed_at: now,
              review_comments: commentsInput?.value || null
            };
            
            const { error } = await supabase
              .schema('neta_ops')
              .from('assets')
              .update(updateData)
              .eq('id', report.id);
            
            if (error) {
              toast({
                title: "Error",
                description: `Failed to archive report: ${error.message || 'Unknown error'}`,
                variant: "destructive"
              });
            } else {
              window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'archived' } }));
              toast({
                title: "Success",
                description: "Report archived successfully",
                variant: "success"
              });
              const modal = document.getElementById('report-view-modal');
              if (modal) modal.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) { try { onUpdate(); } catch { /* noop */ } }
            }
          };
        }
      }
      
      return;
    }
    
    if (!fileUrl.startsWith('report:/jobs/')) {
      toast({ title: "Error", description: "Invalid report URL format", variant: "destructive" });
      return;
    }
    
    const urlParts = fileUrl.replace('report:/jobs/', '').split('/');
    if (urlParts.length < 2) {
      toast({ title: "Error", description: "Invalid report URL structure", variant: "destructive" });
      return;
    }
    
    const reportJobId = urlParts[0];
    const reportSlug = urlParts[1];
    
    // URL structure can be:
    // /jobs/{jobId}/{reportSlug}/{reportId} (3 parts)
    // /jobs/{jobId}/{reportSlug}/{substation}/{reportId} (4 parts)
    let basePath: string;
    if (urlParts.length === 4) {
      // Has substation: urlParts[2] is substation, urlParts[3] is reportId
      const substation = urlParts[2];
      const reportId = urlParts[3];
      basePath = `/jobs/${reportJobId}/${reportSlug}/${substation}/${reportId}`;
      console.log('[ViewDialog] URL parsing (4 parts):', { fileUrl, urlParts, reportJobId, reportSlug, substation, reportId });
    } else if (urlParts.length === 3) {
      // No substation: urlParts[2] is reportId
      const reportId = urlParts[2];
      basePath = `/jobs/${reportJobId}/${reportSlug}/${reportId}`;
      console.log('[ViewDialog] URL parsing (3 parts):', { fileUrl, urlParts, reportJobId, reportSlug, reportId });
    } else {
      // Just the slug, no reportId
      basePath = `/jobs/${reportJobId}/${reportSlug}`;
      console.log('[ViewDialog] URL parsing (2 parts):', { fileUrl, urlParts, reportJobId, reportSlug });
    }
    
    const fullReportUrl = `${window.location.origin}${basePath}?fromApproval=true`;
    
    console.log('[ViewDialog] Opening report at:', fullReportUrl);
    
    modalContainer.innerHTML = `
      <div id="report-view-modal" style="position:fixed;inset:0;z-index:99999;isolation:isolate;">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.75);"></div>
        <div style="position:absolute;inset:2rem;background:white;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;">
          <!-- Header -->
          <div style="flex-shrink:0;padding:1rem;border-bottom:1px solid #e5e7eb;background:white;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h2 style="font-size:1.125rem;font-weight:600;margin:0;">${report.title}</h2>
              <p style="font-size:0.875rem;color:#6b7280;margin:0;">Read-only preview of the submitted report.</p>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span style="padding:0.25rem 0.75rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:${report.status === 'submitted' ? '#fef3c7' : report.status === 'approved' ? '#d1fae5' : '#fee2e2'};color:${report.status === 'submitted' ? '#92400e' : report.status === 'approved' ? '#065f46' : '#991b1b'};">
                ${report.status.charAt(0).toUpperCase() + report.status.slice(1)}
              </span>
              <button id="report-view-close-btn" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;">
                Close
              </button>
            </div>
          </div>
          
          <!-- Report Content -->
          <div style="flex:1;overflow:hidden;background:#f9fafb;">
            <div style="padding:0.75rem;background:#eff6ff;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#4b5563;">
              <strong>Preview Mode:</strong> This is a read-only preview. 
              <a href="${fullReportUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;margin-left:0.5rem;">Open in new tab</a>
            </div>
            <iframe 
              src="${fullReportUrl}" 
              style="width:100%;height:calc(100% - 45px);border:none;"
              title="Report Preview"
            ></iframe>
          </div>
          
          <!-- Review Actions Panel -->
          ${canReview ? `
          <div id="review-panel" style="flex-shrink:0;border-top:1px solid #e5e7eb;background:white;padding:1rem;display:none;">
            <div style="margin-bottom:0.75rem;">
              <label style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.5rem;">Review Comments</label>
              <textarea 
                id="review-comments-input"
                placeholder="Add comments about this report (required for rejection)..."
                style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:0.375rem;font-size:0.875rem;resize:none;box-sizing:border-box;"
                rows="2"
              ></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
              <button id="review-archive-btn" style="padding:0.5rem 1rem;background:white;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;color:#374151;">
                Archive
              </button>
              <button id="review-reject-btn" style="padding:0.5rem 1rem;background:white;border:1px solid #fca5a5;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;color:#dc2626;">
                ✕ Reject / Mark as Issue
              </button>
              <button id="review-approve-btn" style="padding:0.5rem 1rem;background:#16a34a;border:none;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;color:white;font-weight:500;">
                ✓ Approve
              </button>
            </div>
          </div>
          <div style="flex-shrink:0;border-top:1px solid #e5e7eb;background:white;padding:0.75rem;display:flex;justify-content:center;">
            <button id="review-toggle-btn" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;display:flex;align-items:center;gap:0.5rem;">
              <span id="review-toggle-text">Show Review</span>
              <span id="review-toggle-icon">▲</span>
            </button>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // Add close handler
    const closeBtn = document.getElementById('report-view-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        const modal = document.getElementById('report-view-modal');
        if (modal) modal.remove();
      };
    }
    
    // Add toggle handler for review panel
    if (canReview) {
      const toggleBtn = document.getElementById('review-toggle-btn');
      const reviewPanel = document.getElementById('review-panel');
      const toggleText = document.getElementById('review-toggle-text');
      const toggleIcon = document.getElementById('review-toggle-icon');
      
      if (toggleBtn && reviewPanel && toggleText && toggleIcon) {
        toggleBtn.onclick = () => {
          const isVisible = reviewPanel.style.display !== 'none';
          if (isVisible) {
            reviewPanel.style.display = 'none';
            toggleText.textContent = 'Show Review';
            toggleIcon.textContent = '▲';
          } else {
            reviewPanel.style.display = 'block';
            toggleText.textContent = 'Hide Review';
            toggleIcon.textContent = '▼';
          }
        };
      }
    }
    
    // Add review action handlers if canReview
    if (canReview) {
      const approveBtn = document.getElementById('review-approve-btn');
      const rejectBtn = document.getElementById('review-reject-btn');
      const archiveBtn = document.getElementById('review-archive-btn');
      const commentsInput = document.getElementById('review-comments-input') as HTMLTextAreaElement;
      
      if (approveBtn) {
        approveBtn.onclick = async () => {
          if (!user) return;
          const comments = commentsInput?.value || 'Report approved';
          const now = new Date().toISOString();
          try {
            approveBtn.textContent = 'Approving...';
            approveBtn.setAttribute('disabled', 'true');
            // Update asset status directly
            const { error } = await supabase
              .schema('neta_ops')
              .from('assets')
              .update({
                status: 'approved',
                reviewed_by: user.id,
                reviewed_at: now,
                approved_at: now,
                review_comments: comments
              })
              .eq('id', report.id);
            if (error) {
              toast({ title: "Error", description: `Failed to approve: ${error.message}`, variant: "destructive" });
              approveBtn.textContent = '✓ Approve';
              approveBtn.removeAttribute('disabled');
            } else {
              window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'approved' } }));
              toast({ title: "Success", description: "Report approved", variant: "success" });
              document.getElementById('report-view-modal')?.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) onUpdate();
            }
          } catch (err) {
            console.error('Error approving:', err);
            toast({ title: "Error", description: "Failed to approve report", variant: "destructive" });
            approveBtn.textContent = '✓ Approve';
            approveBtn.removeAttribute('disabled');
          }
        };
      }
      
      if (rejectBtn) {
        rejectBtn.onclick = async () => {
          if (!user) return;
          // Get fresh reference to comments input to ensure we have the current value
          const commentsEl = document.getElementById('review-comments-input') as HTMLTextAreaElement;
          const comments = commentsEl?.value?.trim() || '';
          if (!comments) {
            toast({ title: "Error", description: "Comments are required when rejecting a report", variant: "destructive" });
            commentsEl?.focus();
            return;
          }
          const now = new Date().toISOString();
          try {
            rejectBtn.textContent = 'Rejecting...';
            rejectBtn.setAttribute('disabled', 'true');
            // Update asset status directly
            const { error } = await supabase
              .schema('neta_ops')
              .from('assets')
              .update({
                status: 'issue',
                reviewed_by: user.id,
                reviewed_at: now,
                review_comments: comments
              })
              .eq('id', report.id);
            if (error) {
              toast({ title: "Error", description: `Failed to reject: ${error.message}`, variant: "destructive" });
              rejectBtn.textContent = '✕ Reject / Mark as Issue';
              rejectBtn.removeAttribute('disabled');
            } else {
              window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'issue' } }));
              toast({ title: "Success", description: "Report rejected / marked as issue", variant: "success" });
              document.getElementById('report-view-modal')?.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) onUpdate();
            }
          } catch (err) {
            console.error('Error rejecting:', err);
            toast({ title: "Error", description: "Failed to reject report", variant: "destructive" });
            rejectBtn.textContent = '✕ Reject / Mark as Issue';
            rejectBtn.removeAttribute('disabled');
          }
        };
      }
      
      if (archiveBtn) {
        archiveBtn.onclick = async () => {
          if (!user) return;
          const comments = commentsInput?.value || 'Report archived';
          const now = new Date().toISOString();
          try {
            archiveBtn.textContent = 'Archiving...';
            archiveBtn.setAttribute('disabled', 'true');
            // Update asset status directly
            const { error } = await supabase
              .schema('neta_ops')
              .from('assets')
              .update({
                status: 'archived',
                reviewed_by: user.id,
                reviewed_at: now,
                review_comments: comments
              })
              .eq('id', report.id);
            if (error) {
              toast({ title: "Error", description: `Failed to archive: ${error.message}`, variant: "destructive" });
              archiveBtn.textContent = 'Archive';
              archiveBtn.removeAttribute('disabled');
            } else {
              window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'archived' } }));
              toast({ title: "Success", description: "Report archived", variant: "success" });
              document.getElementById('report-view-modal')?.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) onUpdate();
            }
          } catch (err) {
            console.error('Error archiving:', err);
            toast({ title: "Error", description: "Failed to archive report", variant: "destructive" });
            archiveBtn.textContent = 'Archive';
            archiveBtn.removeAttribute('disabled');
          }
        };
      }
    }
    
    // Store report for review actions
    setSelectedReport(report);
  };

  const handleMarkAsSent = async (report: TechnicalReport) => {
    console.log('handleMarkAsSent called with report:', report.id, 'user:', user?.id);
    if (!user) return;
    
    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      
      // Update asset status directly
      const { error } = await supabase
        .schema('neta_ops')
        .from('assets')
        .update({
          status: 'sent',
          sent_at: now,
          reviewed_by: user.id
        })
        .eq('id', report.id);
      
      if (error) {
        toast({
          title: "Error",
          description: `Failed to mark report as sent: ${error.message || 'Unknown error'}`,
          variant: "destructive"
        });
      } else {
        window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'sent' } }));
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
      const now = new Date().toISOString();
      
      // Update asset status directly
      const { error } = await supabase
        .schema('neta_ops')
        .from('assets')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: now,
          approved_at: now,
          review_comments: 'Report marked as approved from sent status'
        })
        .eq('id', report.id);
      
      if (error) {
        toast({
          title: "Error",
          description: `Failed to mark report as approved: ${error.message || 'Unknown error'}`,
          variant: "destructive"
        });
      } else {
        window.dispatchEvent(new CustomEvent('assetStatusChanged', { detail: { assetIds: [report.id], newStatus: 'approved' } }));
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
      const now = new Date().toISOString();
      
      // Update asset status directly (selectedReport.id is the asset ID)
      // Map 'rejected' to 'issue' for assets table (which doesn't support 'rejected' status)
      const assetStatus = reviewStatus === 'rejected' ? 'issue' : reviewStatus;
      const updateData: any = {
        status: assetStatus,
        reviewed_by: user.id,
        reviewed_at: now,
        review_comments: reviewComments || null
      };
      
      // Add approved_at timestamp if approved
      if (reviewStatus === 'approved') {
        updateData.approved_at = now;
      }
      
      const { error } = await supabase
        .schema('neta_ops')
        .from('assets')
        .update(updateData)
        .eq('id', selectedReport.id);
      
      if (error) {
        toast({
          title: "Error",
          description: `Failed to submit review: ${error.message || 'Unknown error'}`,
          variant: "destructive"
        });
      } else {
        // Dispatch event to notify other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('assetStatusChanged', {
            detail: { assetIds: [selectedReport.id], newStatus: assetStatus }
          }));
        }
        
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
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label htmlFor="report-sort" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sort by
                </label>
                <select
                  id="report-sort"
                  value={`${sortBy}_${sortDirection}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Split on last underscore only (submission_date has an underscore)
                    const lastUnderscore = v.lastIndexOf('_');
                    const by = v.slice(0, lastUnderscore) as SortByOption;
                    const dir = v.slice(lastUnderscore + 1) as 'asc' | 'desc';
                    if (by && (by === 'submission_date' || by === 'alphabetical' || by === 'substation') && (dir === 'asc' || dir === 'desc')) {
                      setSort({ by, dir });
                    }
                  }}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm min-w-[220px]"
                >
                  <option value="submission_date_asc">Submission date (oldest first)</option>
                  <option value="submission_date_desc">Submission date (newest first)</option>
                  <option value="alphabetical_asc">Name (A–Z)</option>
                  <option value="alphabetical_desc">Name (Z–A)</option>
                  <option value="substation_asc">Substation (A–Z)</option>
                  <option value="substation_desc">Substation (Z–A)</option>
                </select>
              </div>
              {(() => {
                // In job context, group like Linked Assets: Imported, numeric folders, Other
                if (jobId) {
                  const assetsMap: Record<string, { name?: string; file_url?: string; urgency?: 'normal' | 'critical' }[]> = (window as any).__reportApprovalAssetsMap || {};
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
                  sortedReports.forEach(r => {
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
                      {hasMoreReports && (
                        <div className="flex justify-center py-3 mb-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-dark-200">
                          <Button
                            variant="outline"
                            onClick={() => fetchReports(reportsOffset)}
                            disabled={loadingMore}
                            className="min-w-[200px] bg-white dark:bg-dark-150"
                          >
                            {loadingMore ? (
                              <>
                                <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                                Loading…
                              </>
                            ) : (
                              <>Load next 500 reports</>
                            )}
                          </Button>
                        </div>
                      )}
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
                            {groups[folderKey].map((report) => (
                                <div key={report.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                                  <div className="flex-1 min-w-0 pr-3">
                                    <div className="flex items-center gap-3">
                                      <h4 className="text-sm font-semibold truncate">{report.title}</h4>
                                      {/* Urgency indicator */}
                                      {(() => {
                                        const linkedAssets = assetsMap[report.id] || [];
                                        const hasCritical = linkedAssets.some(a => a.urgency === 'critical');
                                        return hasCritical ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                            <AlertTriangle className="w-3 h-3" />
                                            Critical
                                          </span>
                                        ) : null;
                                      })()}
                                      {getStatusBadge(report.status)}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500 flex items-center gap-4 flex-wrap">
                                      <span>Submitted: {formatDate(report.submitted_at)}</span>
                                      {report.approved_at && <span>Approved: {formatDate(report.approved_at)}</span>}
                                      {report.sent_at && <span>Sent: {formatDate(report.sent_at)}</span>}
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
                                    {/* Show download/print button for PDF reports on approved tab */}
                                    {report.report_data?.file_url && !report.report_data.file_url.startsWith('report:/') && report.report_data.file_url.toLowerCase().endsWith('.pdf') && (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handleDownloadPdfReport(report)}
                                        title="Download/Print PDF"
                                      >
                                        <Download className="h-4 w-4 mr-2" />
                                        {activeTab === 'approved' || activeTab === 'accepted' ? 'Print' : 'Download'}
                                      </Button>
                                    )}
                            {(() => {
                              const isApprovedTab = activeTab === 'approved' || activeTab === 'accepted';
                              const shouldShowSent = isApprovedTab && report.status === 'approved';
                              const shouldShowApproved = activeTab === 'sent' && report.status === 'sent';
                                      console.log('Button visibility check:', { reportId: report.id, activeTab, reportStatus: report.status, shouldShowSent, shouldShowApproved });
                                      // Don't show "Mark as Sent" button for PDF reports (they use the Print button instead)
                                      const isPdfReport = report.report_data?.file_url && !report.report_data.file_url.startsWith('report:/') && report.report_data.file_url.toLowerCase().endsWith('.pdf');
                                      return (shouldShowSent || shouldShowApproved) && !isPdfReport;
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
                      {hasMoreReports && (
                        <div className="flex justify-center pt-4 pb-2">
                          <Button
                            variant="outline"
                            onClick={() => fetchReports(reportsOffset)}
                            disabled={loadingMore}
                            className="min-w-[180px]"
                          >
                            {loadingMore ? (
                              <>
                                <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                                Loading…
                              </>
                            ) : (
                              <>Load next 500 reports</>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  );
                }
                // Global view fallback
                const globalAssetsMap: Record<string, { name?: string; file_url?: string; urgency?: 'normal' | 'critical' }[]> = (window as any).__reportApprovalAssetsMap || {};
                return (
                  <div key={`list-${sortBy}-${sortDirection}`} className="space-y-2">
                    {hasMoreReports && (
                      <div className="flex justify-center py-3 mb-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-dark-200">
                        <Button
                          variant="outline"
                          onClick={() => fetchReports(reportsOffset)}
                          disabled={loadingMore}
                          className="min-w-[200px] bg-white dark:bg-dark-150"
                        >
                          {loadingMore ? (
                            <>
                              <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                              Loading…
                            </>
                          ) : (
                            <>Load next 500 reports</>
                          )}
                        </Button>
                      </div>
                    )}
                    {sortedReports.map(report => (
                      <div key={report.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-3">
                            <h4 className="text-sm font-semibold truncate">{report.title}</h4>
                            {/* Urgency indicator */}
                            {(() => {
                              const linkedAssets = globalAssetsMap[report.id] || [];
                              const hasCritical = linkedAssets.some(a => a.urgency === 'critical');
                              return hasCritical ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                  <AlertTriangle className="w-3 h-3" />
                                  Critical
                                </span>
                              ) : null;
                            })()}
                            {getStatusBadge(report.status)}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 flex items-center gap-4 flex-wrap">
                            <span>Submitted: {formatDate(report.submitted_at)}</span>
                            {report.approved_at && <span>Approved: {formatDate(report.approved_at)}</span>}
                            {report.sent_at && <span>Sent: {formatDate(report.sent_at)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleViewReport(report)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                          {/* Show download/print button for PDF reports on approved tab */}
                          {report.report_data?.file_url && !report.report_data.file_url.startsWith('report:/') && report.report_data.file_url.toLowerCase().endsWith('.pdf') && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleDownloadPdfReport(report)}
                              title="Download/Print PDF"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              {activeTab === 'approved' || activeTab === 'accepted' ? 'Print' : 'Download'}
                            </Button>
                          )}
                          {(() => {
                            const shouldShowSent = activeTab === 'approved' && report.status === 'approved';
                            const shouldShowApproved = activeTab === 'sent' && report.status === 'sent';
                            console.log('Button visibility check (global):', { reportId: report.id, activeTab, reportStatus: report.status, shouldShowSent, shouldShowApproved });
                            // Don't show "Mark as Sent" button for PDF reports (they use the Print button instead)
                            const isPdfReport = report.report_data?.file_url && !report.report_data.file_url.startsWith('report:/') && report.report_data.file_url.toLowerCase().endsWith('.pdf');
                            return (shouldShowSent || shouldShowApproved) && !isPdfReport;
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
                    {hasMoreReports && (
                      <div className="flex justify-center pt-4 pb-2">
                        <Button
                          variant="outline"
                          onClick={() => fetchReports(reportsOffset)}
                          disabled={loadingMore}
                          className="min-w-[180px]"
                        >
                          {loadingMore ? (
                            <>
                              <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                              Loading…
                            </>
                          ) : (
                            <>Load next 500 reports</>
                          )}
                        </Button>
                      </div>
                    )}
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

    </div>
  );
} 