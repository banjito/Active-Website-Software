import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/toast';
import { Plus, FileText, Eye, Edit, Trash2, CheckCircle, Clock, AlertTriangle, ClipboardList, UserCheck } from 'lucide-react';
import { format } from 'date-fns';

interface TimeAllocation {
  category: string;
  hours: string;
}

interface AfterActionReport {
  id: string;
  job_id: string;
  report_type: 'technician_progress' | 'admin_closeout';
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  
  // Section A - Project Information
  technician_name: string | null;
  report_date: string | null;
  project_job_number: string | null;
  client_site_name: string | null;
  phase_scope_completed: string | null;
  crew_size_roles: string | null;
  
  // Section A - Safety & Incidents
  safety_incident: boolean;
  incident_description: string | null;
  near_misses_hazards: string | null;
  
  // Section A - Project Notes
  delays_encountered: string | null;
  scope_changes: string | null;
  equipment_issues: string | null;
  coordination_issues: string | null;
  
  // Section A - Time Allocation
  time_allocation: TimeAllocation[];
  
  // Section A - Materials & Costs
  consumables_used: string | null;
  materials_purchased_in_field: string | null;
  rental_equipment_used: string | null;
  
  // Section A - Sign-off
  technician_sign_off_name: string | null;
  technician_confirmed: boolean;
  technician_submission_timestamp: string | null;
  
  // Section B - Work Summary
  estimated_hours: number | null;
  total_hours_worked: number | null;
  variance_hours: number | null;
  crew_size_roles_confirmed: string | null;
  
  // Section B - Cost Reconciliation
  labor_cost_total: number | null;
  materials_cost_total: number | null;
  rental_cost_total: number | null;
  finalized_project_cost: number | null;
  
  // Section B - Administrative Notes
  adjustments_to_technician_report: string | null;
  notes_for_project_manager: string | null;
  admin_name: string | null;
  admin_submission_timestamp: string | null;
  
  // Metadata
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface AfterActionReportsProps {
  jobId: string;
  jobNumber?: string;
  clientName?: string;
}

const DEFAULT_TIME_CATEGORIES = [
  'Setup / Break Down',
  'Re-tests / Repairs',
  'Waiting / Delays',
  'Safety Incidents',
  'Other'
];

const AfterActionReports: React.FC<AfterActionReportsProps> = ({ jobId, jobNumber, clientName }) => {
  const { user } = useAuth();
  const { maskCustomerName } = useDemoMode();
  const isAdmin = user?.user_metadata?.role === 'Admin';
  
  const [reports, setReports] = useState<AfterActionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AfterActionReport | null>(null);
  const [reportType, setReportType] = useState<'technician_progress' | 'admin_closeout'>('technician_progress');
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<Partial<AfterActionReport>>({
    technician_name: user?.user_metadata?.full_name || '',
    report_date: new Date().toISOString().split('T')[0],
    project_job_number: jobNumber || '',
    client_site_name: maskCustomerName(clientName) || '',
    phase_scope_completed: '',
    crew_size_roles: '',
    safety_incident: false,
    incident_description: '',
    near_misses_hazards: '',
    delays_encountered: '',
    scope_changes: '',
    equipment_issues: '',
    coordination_issues: '',
    time_allocation: DEFAULT_TIME_CATEGORIES.map(cat => ({ category: cat, hours: '' })),
    consumables_used: '',
    materials_purchased_in_field: '',
    rental_equipment_used: '',
    technician_sign_off_name: '',
    technician_confirmed: false,
    // Admin fields
    estimated_hours: null,
    total_hours_worked: null,
    variance_hours: null,
    crew_size_roles_confirmed: '',
    labor_cost_total: null,
    materials_cost_total: null,
    rental_cost_total: null,
    finalized_project_cost: null,
    adjustments_to_technician_report: '',
    notes_for_project_manager: '',
    admin_name: '',
  });

  useEffect(() => {
    loadReports();
  }, [jobId]);

  useEffect(() => {
    // Update job info when props change
    setFormData(prev => ({
      ...prev,
      project_job_number: jobNumber || prev.project_job_number,
      client_site_name: maskCustomerName(clientName) || prev.client_site_name,
    }));
  }, [jobNumber, clientName]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('after_action_reports')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error: any) {
      console.error('Error loading after-action reports:', error);
      toast({
        title: 'Error',
        description: `Failed to load reports: ${error.message}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      technician_name: user?.user_metadata?.full_name || '',
      report_date: new Date().toISOString().split('T')[0],
      project_job_number: jobNumber || '',
      client_site_name: maskCustomerName(clientName) || '',
      phase_scope_completed: '',
      crew_size_roles: '',
      safety_incident: false,
      incident_description: '',
      near_misses_hazards: '',
      delays_encountered: '',
      scope_changes: '',
      equipment_issues: '',
      coordination_issues: '',
      time_allocation: DEFAULT_TIME_CATEGORIES.map(cat => ({ category: cat, hours: '' })),
      consumables_used: '',
      materials_purchased_in_field: '',
      rental_equipment_used: '',
      technician_sign_off_name: '',
      technician_confirmed: false,
      estimated_hours: null,
      total_hours_worked: null,
      variance_hours: null,
      crew_size_roles_confirmed: '',
      labor_cost_total: null,
      materials_cost_total: null,
      rental_cost_total: null,
      finalized_project_cost: null,
      adjustments_to_technician_report: '',
      notes_for_project_manager: '',
      admin_name: '',
    });
  };

  const handleCreateNew = (type: 'technician_progress' | 'admin_closeout') => {
    setReportType(type);
    setSelectedReport(null);
    resetForm();
    setIsEditMode(true);
    setIsCreateDialogOpen(true);
  };

  const handleViewReport = (report: AfterActionReport) => {
    setSelectedReport(report);
    setReportType(report.report_type);
    setFormData({
      ...report,
      time_allocation: report.time_allocation || DEFAULT_TIME_CATEGORIES.map(cat => ({ category: cat, hours: '' })),
    });
    setIsEditMode(false);
    setIsViewDialogOpen(true);
  };

  const handleEditReport = (report: AfterActionReport) => {
    setSelectedReport(report);
    setReportType(report.report_type);
    setFormData({
      ...report,
      time_allocation: report.time_allocation || DEFAULT_TIME_CATEGORIES.map(cat => ({ category: cat, hours: '' })),
    });
    setIsEditMode(true);
    setIsViewDialogOpen(true);
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('after_action_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Report deleted successfully',
      });
      loadReports();
    } catch (error: any) {
      console.error('Error deleting report:', error);
      toast({
        title: 'Error',
        description: `Failed to delete report: ${error.message}`,
        variant: 'destructive'
      });
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTimeAllocationChange = (index: number, hours: string) => {
    const newTimeAllocation = [...(formData.time_allocation || [])];
    newTimeAllocation[index] = { ...newTimeAllocation[index], hours };
    setFormData(prev => ({ ...prev, time_allocation: newTimeAllocation }));
  };

  const handleSave = async (submitReport: boolean = false) => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to save a report',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      const reportData = {
        job_id: jobId,
        report_type: reportType,
        status: submitReport ? 'submitted' : 'draft',
        // Section A
        technician_name: formData.technician_name,
        report_date: formData.report_date,
        project_job_number: formData.project_job_number,
        client_site_name: formData.client_site_name,
        phase_scope_completed: formData.phase_scope_completed,
        crew_size_roles: formData.crew_size_roles,
        safety_incident: formData.safety_incident,
        incident_description: formData.incident_description,
        near_misses_hazards: formData.near_misses_hazards,
        delays_encountered: formData.delays_encountered,
        scope_changes: formData.scope_changes,
        equipment_issues: formData.equipment_issues,
        coordination_issues: formData.coordination_issues,
        time_allocation: formData.time_allocation,
        consumables_used: formData.consumables_used,
        materials_purchased_in_field: formData.materials_purchased_in_field,
        rental_equipment_used: formData.rental_equipment_used,
        technician_sign_off_name: formData.technician_sign_off_name,
        technician_confirmed: formData.technician_confirmed,
        technician_submission_timestamp: submitReport && reportType === 'technician_progress' ? new Date().toISOString() : formData.technician_submission_timestamp,
        // Section B
        estimated_hours: formData.estimated_hours,
        total_hours_worked: formData.total_hours_worked,
        variance_hours: formData.variance_hours,
        crew_size_roles_confirmed: formData.crew_size_roles_confirmed,
        labor_cost_total: formData.labor_cost_total,
        materials_cost_total: formData.materials_cost_total,
        rental_cost_total: formData.rental_cost_total,
        finalized_project_cost: formData.finalized_project_cost,
        adjustments_to_technician_report: formData.adjustments_to_technician_report,
        notes_for_project_manager: formData.notes_for_project_manager,
        admin_name: formData.admin_name,
        admin_submission_timestamp: submitReport && reportType === 'admin_closeout' ? new Date().toISOString() : formData.admin_submission_timestamp,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (selectedReport?.id) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('after_action_reports')
          .update(reportData)
          .eq('id', selectedReport.id)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('after_action_reports')
          .insert({
            ...reportData,
            created_by: user.id,
          })
          .select()
          .single();
      }

      if (result.error) throw result.error;

      toast({
        title: 'Success',
        description: `Report ${selectedReport?.id ? 'updated' : 'created'} successfully${submitReport ? ' and submitted' : ''}`,
      });

      setIsCreateDialogOpen(false);
      setIsViewDialogOpen(false);
      loadReports();
    } catch (error: any) {
      console.error('Error saving report:', error);
      const errorMessage = error?.message || error?.details || error?.hint || JSON.stringify(error) || 'Unknown error occurred';
      toast({
        title: 'Error',
        description: `Failed to save report: ${errorMessage}`,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'submitted':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"><FileText className="w-3 h-3 mr-1" />Submitted</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"><AlertTriangle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getReportTypeBadge = (type: string) => {
    if (type === 'technician_progress') {
      return <Badge className="bg-[#f26722] text-white"><ClipboardList className="w-3 h-3 mr-1" />Technician Progress</Badge>;
    }
    return <Badge className="bg-purple-600 text-white"><UserCheck className="w-3 h-3 mr-1" />Admin Close-out</Badge>;
  };

  const renderTechnicianProgressForm = () => (
    <div className="space-y-3">
      {/* Header */}
      <div className="pb-2">
        <h2 className="text-base font-bold text-[#1e5091] dark:text-blue-400 border-b-2 border-[#1e5091] dark:border-blue-400 inline-block">NETA Technician After-Action Report</h2>
        <h3 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mt-2">Section A – Technician Completed Fields</h3>
      </div>

      {/* Project Information */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Project Information</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <tbody>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white w-1/3">Technician Name</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.technician_name || ''} onChange={(e) => handleInputChange('technician_name', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Date</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="date" value={formData.report_date || ''} onChange={(e) => handleInputChange('report_date', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Project / Job Number</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.project_job_number || ''} onChange={(e) => handleInputChange('project_job_number', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Client / Site Name</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={maskCustomerName(formData.client_site_name)} onChange={(e) => handleInputChange('client_site_name', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Phase / Scope Completed</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.phase_scope_completed || ''} onChange={(e) => handleInputChange('phase_scope_completed', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Crew Size / Roles (observed)</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.crew_size_roles || ''} onChange={(e) => handleInputChange('crew_size_roles', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Safety & Incidents */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Safety & Incidents</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <tbody>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white w-1/3">Safety Incident?</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1 cursor-pointer text-sm"><input type="checkbox" checked={formData.safety_incident === true} onChange={() => handleInputChange('safety_incident', true)} disabled={!isEditMode} className="w-3 h-3" /><span className="text-gray-700 dark:text-white">Yes</span></label>
                  <label className="flex items-center gap-1 cursor-pointer text-sm"><input type="checkbox" checked={formData.safety_incident === false} onChange={() => handleInputChange('safety_incident', false)} disabled={!isEditMode} className="w-3 h-3" /><span className="text-gray-700 dark:text-white">No</span></label>
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white align-top">Incident Description</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><textarea value={formData.incident_description || ''} onChange={(e) => handleInputChange('incident_description', e.target.value)} disabled={!isEditMode} rows={1} className="w-full p-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-dark-100 dark:text-white" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white align-top">Near Misses / Hazards Observed</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><textarea value={formData.near_misses_hazards || ''} onChange={(e) => handleInputChange('near_misses_hazards', e.target.value)} disabled={!isEditMode} rows={1} className="w-full p-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-dark-100 dark:text-white" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Project Notes */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Project Notes</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <tbody>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white w-1/3">Delays Encountered</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.delays_encountered || ''} onChange={(e) => handleInputChange('delays_encountered', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Scope Changes</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.scope_changes || ''} onChange={(e) => handleInputChange('scope_changes', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Equipment Issues</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.equipment_issues || ''} onChange={(e) => handleInputChange('equipment_issues', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Coordination Issues</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.coordination_issues || ''} onChange={(e) => handleInputChange('coordination_issues', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
          </tbody>
        </table>
      </div>

      {/* Time Allocation */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Time Allocation (approximate)</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <thead>
            <tr>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left text-gray-700 dark:text-white font-semibold w-1/3">Category</th>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left text-gray-700 dark:text-white font-semibold">Hours</th>
            </tr>
          </thead>
          <tbody>
            {(formData.time_allocation || []).map((item, index) => (
              <tr key={index}>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">{item.category}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="text" value={item.hours} onChange={(e) => handleTimeAllocationChange(index, e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-6 text-sm dark:bg-dark-100 dark:text-white w-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );

  const renderAdminCloseoutForm = () => (
    <div className="space-y-3">
      {/* Header */}
      <div className="text-center pb-2">
        <h2 className="text-base font-bold text-[#1e5091] dark:text-blue-400">NETA Technician After-Action Report</h2>
        <h3 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400">Section B – Admin / Finalized Completed Fields</h3>
      </div>

      {/* Work Summary */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Work Summary</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <tbody>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white w-1/3">Estimated Hours</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.estimated_hours ?? ''} onChange={(e) => handleInputChange('estimated_hours', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Total Hours Worked</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.total_hours_worked ?? ''} onChange={(e) => handleInputChange('total_hours_worked', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Variance (+/-)</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.variance_hours ?? ''} onChange={(e) => handleInputChange('variance_hours', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Crew Size / Roles (confirmed)</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.crew_size_roles_confirmed || ''} onChange={(e) => handleInputChange('crew_size_roles_confirmed', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
          </tbody>
        </table>
      </div>

      {/* Cost Reconciliation */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Cost Reconciliation</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <tbody>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white w-1/3">Labor Cost Total</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.labor_cost_total ?? ''} onChange={(e) => handleInputChange('labor_cost_total', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Materials Cost Total</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.materials_cost_total ?? ''} onChange={(e) => handleInputChange('materials_cost_total', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Rental Cost Total</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.rental_cost_total ?? ''} onChange={(e) => handleInputChange('rental_cost_total', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white font-semibold">Finalized Project Cost</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input type="number" step="0.01" value={formData.finalized_project_cost ?? ''} onChange={(e) => handleInputChange('finalized_project_cost', e.target.value ? parseFloat(e.target.value) : null)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm font-semibold dark:bg-dark-100 dark:text-white w-full" /></td></tr>
          </tbody>
        </table>
      </div>

      {/* Administrative Notes & Approval */}
      <div>
        <h4 className="text-sm font-semibold text-[#1e5091] dark:text-blue-400 mb-1">Administrative Notes & Approval</h4>
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <tbody>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white w-1/3 align-top">Adjustments to Technician Report</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><textarea value={formData.adjustments_to_technician_report || ''} onChange={(e) => handleInputChange('adjustments_to_technician_report', e.target.value)} disabled={!isEditMode} rows={2} className="w-full p-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-dark-100 dark:text-white" /></td>
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white align-top">Notes for Project Manager / Estimator</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><textarea value={formData.notes_for_project_manager || ''} onChange={(e) => handleInputChange('notes_for_project_manager', e.target.value)} disabled={!isEditMode} rows={2} className="w-full p-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-dark-100 dark:text-white" /></td>
            </tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Admin Name</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1"><Input value={formData.admin_name || ''} onChange={(e) => handleInputChange('admin_name', e.target.value)} disabled={!isEditMode} className="border-0 shadow-none h-7 text-sm dark:bg-dark-100 dark:text-white w-full" /></td></tr>
            <tr><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">Submission Timestamp</td><td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-white">{formData.admin_submission_timestamp ? format(new Date(formData.admin_submission_timestamp), 'MMM d, yyyy h:mm a') : ''}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header with action buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">After-Action Reports</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Document project progress and close-out information
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => handleCreateNew('technician_progress')}
            className="bg-[#f26722] hover:bg-[#e55611] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Technician Progress Report
          </Button>
          {isAdmin && (
            <Button 
              onClick={() => handleCreateNew('admin_closeout')}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Admin Close-out Report
            </Button>
          )}
        </div>
      </div>

      {/* Reports list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f26722]"></div>
        </div>
      ) : reports.length === 0 ? (
        <Card className="dark:bg-dark-150">
          <CardContent className="py-12">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No After-Action Reports Yet</p>
              <p className="text-sm mt-2">Create your first report using the buttons above.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id} className="dark:bg-dark-150 hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col gap-2">
                      {getReportTypeBadge(report.report_type)}
                      {getStatusBadge(report.status)}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {report.report_type === 'technician_progress' ? 'Technician Progress Report' : 'Admin Close-out Report'}
                      </h3>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {report.technician_name && <span>By {report.technician_name} • </span>}
                        {report.report_date && <span>{format(new Date(report.report_date), 'MMM d, yyyy')} • </span>}
                        <span>Created {format(new Date(report.created_at), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewReport(report)}
                      className="text-gray-600 dark:text-gray-300"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditReport(report)}
                      className="text-blue-600 dark:text-blue-400"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteReport(report.id)}
                        className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || isViewDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setIsViewDialogOpen(false);
        }
      }}>
        <DialogContent className="max-w-[90vw] w-[700px] max-h-[85vh] overflow-y-auto dark:bg-dark-150 bg-white p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {reportType === 'technician_progress' ? 'Technician Progress Report' : 'Admin Close-out Report'}
            </DialogTitle>
            <DialogDescription>
              {reportType === 'technician_progress' 
                ? 'Document project progress, safety incidents, and time allocation'
                : 'Finalize work summary and cost reconciliation'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {reportType === 'technician_progress' ? renderTechnicianProgressForm() : renderAdminCloseoutForm()}
          </div>

          <DialogFooter className="mt-6 flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setIsViewDialogOpen(false);
              }}
              className="dark:text-white dark:border-gray-600"
            >
              {isEditMode ? 'Cancel' : 'Close'}
            </Button>
            {!isEditMode && (
              <Button
                onClick={() => setIsEditMode(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Report
              </Button>
            )}
            {isEditMode && (
              <>
                <Button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  variant="outline"
                  className="border-[#f26722] text-[#f26722] hover:bg-[#f26722]/10"
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </Button>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="bg-[#f26722] hover:bg-[#e55611] text-white"
                >
                  {saving ? 'Submitting...' : 'Save & Submit'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AfterActionReports;

