import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, ChevronDown, Plus, Paperclip, X, FileEdit, Pencil, Upload } from 'lucide-react';
import { supabase, isConnectionError } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useJobDetails } from '../../lib/hooks';
import { format } from 'date-fns';
import { Button } from '../ui/Button';
import { reportImportService } from '../../services/reportImport';
import Card, { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/Table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/DropdownMenu';

interface Job {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  job_number: string | null;
  start_date: string | null;
  due_date: string | null;
  budget: number | null;
  customer_id: string;
  division?: string | null;
  customers: {
    id: string;
    name: string;
    company_name?: string | null;
    address?: string | null;
  };
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  template_type?: 'MTS' | 'ATS' | null;
}

interface RelatedOpportunity {
  id: string;
  quote_number: string;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobDetails } = useJobDetails(id);
  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobAssets, setJobAssets] = useState<Asset[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [opportunity, setOpportunity] = useState<RelatedOpportunity | null>(null);
  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [isPriorityEditing, setIsPriorityEditing] = useState(false);
  const [isDueDateEditing, setIsDueDateEditing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempDueDate, setTempDueDate] = useState<string>('');
  
  // Default assets that are always available
  const defaultAssets: Asset[] = [
    {
      id: 'switchgear-inspection-report',
      name: '1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21',
      file_url: `report:/jobs/${id}/switchgear-report`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'panelboard-inspection-report',
      name: '1-Panelboard Inspection & Test Report ATS 21',
      file_url: `report:/jobs/${id}/panelboard-report`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'dry-type-transformer-test',
      name: '2-Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
      file_url: `report:/jobs/${id}/dry-type-transformer`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'large-dry-type-transformer-test',
      name: '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
      file_url: `report:/jobs/${id}/large-dry-type-transformer`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'liquid-filled-transformer-test',
      name: '2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
      file_url: `report:/jobs/${id}/liquid-filled-transformer`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'oil-inspection-report',
      name: '2-Oil Xfmr. Inspection and Test ATS 21',
      file_url: `report:/jobs/${id}/oil-inspection`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-cable-test-12sets',
      name: '3-Low Voltage Cable Test ATS 12 sets',
      file_url: `report:/jobs/${id}/low-voltage-cable-test-12sets`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    }
  ];

  useEffect(() => {
    if (user && id) {
      // If we have job details from the hook, use them
      if (jobDetails) {
        // Create a compatible job object from jobDetails
        const jobFromDetails: Job = {
          id: jobDetails.id,
          customer_id: jobDetails.customer?.id || '',
          title: jobDetails.title,
          description: jobDetails.description || '',
          status: jobDetails.status,
          priority: jobDetails.priority || 'medium',
          job_number: jobDetails.job_number,
          start_date: jobDetails.start_date || null,
          due_date: jobDetails.due_date || null,
          budget: jobDetails.budget || null,
          division: (jobDetails as any).division || null,
          customers: jobDetails.customer ? {
            id: jobDetails.customer.id,
            name: jobDetails.customer.name,
            company_name: jobDetails.customer.company_name,
            address: (jobDetails.customer as any).address,
          } : {
            id: '',
            name: '',
            company_name: null,
          }
        };
        
        setJob(jobFromDetails);
        
        if (jobDetails.customer) {
          setCustomer({
            id: jobDetails.customer.id,
            name: jobDetails.customer.name,
            company_name: jobDetails.customer.company_name || '',
          });
        }
        
        // Still need to fetch contacts
        fetchContacts(jobDetails.customer?.id);
        setLoading(false);
      } else {
        // Fallback to original fetching
        // We might remove this fetchJobDetails call if useJobDetails is reliable
        // fetchJobDetails(); 
      }
      
      // These fetches might still be needed if useJobDetails doesn't cover them
      fetchAssets(); 
      fetchJobAssets();
      
      // Fetch related opportunity if exists
      const fetchRelatedOpportunity = async () => {
        const opportunityData = await fetchOpportunityForJob(id); 
        setOpportunity(opportunityData);
      };
      
      fetchRelatedOpportunity();
    }
  }, [user, id, jobDetails]); // Depend on jobDetails from the hook

  useEffect(() => {
    if (job && !editFormData) {
      console.log('Setting edit form data with dates:', { 
        start_date: job.start_date, 
        due_date: job.due_date 
      });
      
      // Use normalized dates when initializing edit form
      setEditFormData({
        ...job,
        start_date: normalizeDate(job.start_date),
        due_date: normalizeDate(job.due_date)
      });
    }
  }, [job]);

  async function fetchAssets() {
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error('Error fetching assets:', error);
    }
  }

  async function fetchJobAssets() {
    if (!id) return;
    try {
      // 1. Fetch asset IDs associated with the job
      const { data: jobAssetLinks, error: linksError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .select('asset_id')
        .eq('job_id', id);

      if (linksError) {
        console.error('Error fetching job asset links:', linksError);
        throw linksError;
      }

      if (!jobAssetLinks || jobAssetLinks.length === 0) {
        setJobAssets([]);
        return;
      }

      const assetIds = jobAssetLinks.map(link => link.asset_id);

      // 2. Fetch the details of those assets
      const { data: assetsData, error: assetsError } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('id, name, file_url, created_at')
        .in('id', assetIds);

      if (assetsError) {
        console.error('Error fetching linked assets:', assetsError);
        throw assetsError;
      }

      setJobAssets(assetsData || []);
    } catch (error) {
      console.error('Error fetching job assets:', error);
    }
  }

  async function fetchContacts(customerId?: string) {
    if (!customerId) {
      setContacts([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .schema('common') // Add schema
        .from('contacts')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false }); // Order by primary contact first

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setContacts([]);
    }
  }

  async function fetchOpportunityForJob(jobId) {
    if (!jobId) return null;
    try {
      const { data, error } = await supabase
        .schema('business') // Add schema
        .from('opportunities')
        .select('id, quote_number') // Removed division
        .eq('job_id', jobId)
        .maybeSingle(); // Use maybeSingle as there might not be a linked opportunity

      if (error) {
        console.error('Error fetching related opportunity:', error);
        return null;
      }
      return data as RelatedOpportunity | null;
    } catch (error) {
      console.error('Catch block: Error fetching related opportunity:', error);
      return null;
    }
  }

  async function handleAddExistingAsset(assetId: string) {
    if (!id || !user?.id) return;
    
    try {
      // Define report templates mapping
      const reportTemplates = {
        'switchgear-inspection-report': {
          route: 'switchgear-report',
          name: '1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21'
        },
        'panelboard-inspection-report': {
          route: 'panelboard-report',
          name: '1-Panelboard Inspection & Test Report ATS 21'
        },
        'dry-type-transformer-test': {
          route: 'dry-type-transformer',
          name: '2-Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21'
        },
        'large-dry-type-transformer-test': {
          route: 'large-dry-type-transformer',
          name: '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21'
        },
        'liquid-filled-transformer-test': {
          route: 'liquid-filled-transformer',
          name: '2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21'
        },
        'oil-inspection-report': {
          route: 'oil-inspection',
          name: '3-Oil Inspection Report ATS 21'
        },
        'low-voltage-cable-test-12sets': {
          route: 'low-voltage-cable-test-12sets',
          name: '3-Low Voltage Cable Test ATS 12 sets'
        }
      };

      // Handle report templates
      const template = reportTemplates[assetId as keyof typeof reportTemplates];
      if (template) {
        console.log(`Navigating to ${template.name} creation:`, `/jobs/${id}/${template.route}`);
        navigate(`/jobs/${id}/${template.route}`);
        return;
      }
      
      // For non-template assets, add them to the job
      const { error } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .insert({
          job_id: id,
          asset_id: assetId,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      
      // Refresh job assets
      fetchJobAssets();
      
      // Close the dropdown after selection
      setIsDropdownOpen(false);
    } catch (error) {
      console.error('Error adding asset to job:', error);
    }
  }

  async function handleUploadAsset() {
    if (!selectedFile || !newAssetName.trim()) {
      alert('Please provide a name and select a file.');
      return;
    }

    if (!user?.id) {
      alert('You must be logged in to upload assets.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      console.log('Starting asset upload process with user ID:', user?.id);

      // Determine if this is a JSON report file
      const isJsonReport = selectedFile.name.toLowerCase().endsWith('.json');
      
      if (isJsonReport) {
        try {
          if (!user) {
            throw new Error('User not authenticated');
          }

          if (!id) {
            throw new Error('Job ID is required');
          }

          const fileReaderEvent = event as ProgressEvent<FileReader>;
          const target = fileReaderEvent.target;
          
          if (!target) {
            throw new Error('Invalid file reader target');
          }

          const fileContent = target.result;
          if (fileContent === null || typeof fileContent !== 'string') {
            throw new Error('Invalid file content type');
          }

          const jsonContent = JSON.parse(fileContent);
          console.log("Processing JSON report:", jsonContent);

          // Re-introduce baseName definition
          const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
          console.log("JSON successfully parsed. Content keys:", Object.keys(jsonContent as Record<string, any>), "Base name:", baseName);

          // Use the centralized report import service
          console.log("Calling reportImportService.importReport");
          const importResult = await reportImportService.importReport(
            jsonContent as Record<string, any>, // Pass the parsed JSON
            id as string, // Pass job ID
            user.id       // Pass user ID
          );

          if (!importResult.success) {
            console.error("Report import failed:", importResult.error);
            throw new Error(importResult.error || 'Failed to import report via service');
          }

          if (!importResult.reportId || !importResult.reportType) {
             console.error("Import result missing fields:", importResult);
             throw new Error('Report import result from service is missing required fields (reportId or reportType)');
          }

          setUploadProgress(50); // Progress after successful import via service
          console.log(`Report import successful via service: Type=${importResult.reportType}, ID=${importResult.reportId}`);

          // Create asset record with report URL using info from the service result
          const reportUrl = `report:/jobs/${id}/${importResult.reportType}/${importResult.reportId}`;
          
          // Create asset entry
          const assetData = {
            // Use baseName (filename without extension) or a default
            name: baseName || `Imported ${importResult.reportType} Report`,
            file_url: reportUrl,
            user_id: user.id
          };
          
          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();
          
          if (assetError) {
            console.error("Error creating asset record:", assetError);
            throw assetError;
          }
          
          setUploadProgress(75);
          console.log("Asset record created with ID:", assetResult.id);
          
          // Link to job
          const { error: linkError } = await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: id,
              asset_id: assetResult.id,
              user_id: user.id
            });
          
          if (linkError) {
            console.error("Error linking asset to job:", linkError);
            // Consider rolling back asset creation or notifying user
            throw linkError;
          }
          
          setUploadProgress(100);
          console.log("Asset successfully linked to job");
          
          // Reset form and refresh data
          setNewAssetName(''); // Clear any name potentially set via other means
          setSelectedFile(null); // Clear any file potentially set via other means
          fetchAssets();
          fetchJobAssets();
          setIsUploading(false); // Already handled in finally, but good practice
          
          alert(`Successfully imported ${importResult.reportType} report.`);

        } catch (jsonProcessError: any) {
          console.error('JSON processing or import service error:', jsonProcessError);
          // Use the error message from the exception
          throw new Error(`JSON processing/import failed: ${jsonProcessError.message}`);
        }
      } else {
        // Handle regular file upload (non-JSON)
        console.log("Handling non-JSON file upload:", selectedFile.name);
        // ... existing code ...
      }
    } catch (error: any) {
      console.error('Error uploading asset:', error);
      if (error.details) console.error('Error details:', error.details);
      if (error.hint) console.error('Error hint:', error.hint);
      if (error.code) console.error('Error code:', error.code);
      alert(`Error uploading asset: ${error.message || 'Please try again.'}`);
      setIsUploading(false);
    }
  }

  async function handleRemoveJobAsset(assetId: string) {
    if (!confirm('Are you sure you want to remove this asset from the job?')) {
      return;
    }

    if (!user?.id) {
      alert('You must be logged in to remove assets.');
      return;
    }

    try {
      console.log(`Removing asset ${assetId} from job ${id}`);
      
      const { error } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .delete()
        .eq('job_id', id)
        .eq('asset_id', assetId);

      if (error) {
        console.error('Error removing asset from job:', error);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        throw error;
      }

      console.log('Asset successfully removed from job');
      fetchJobAssets();
    } catch (error: any) {
      console.error('Error removing asset:', error);
      if (error.details) console.error('Error details:', error.details);
      if (error.hint) console.error('Error hint:', error.hint);
      if (error.code) console.error('Error code:', error.code);
      alert(`Error removing asset: ${error.message || 'Please try again.'}`);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!job) return;
    
    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', job.id);

      if (error) throw error;

      // Update local state
      setJob(prev => prev ? { ...prev, status: newStatus } : null);
      setIsStatusEditing(false);
    } catch (error) {
      console.error('Error updating job status:', error);
      alert('Failed to update job status. Please try again.');
    }
  }

  async function handlePriorityChange(newPriority: string) {
    if (!job) return;
    
    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .update({ priority: newPriority })
        .eq('id', job.id);

      if (error) throw error;

      // Update local state
      setJob(prev => prev ? { ...prev, priority: newPriority } : null);
      setIsPriorityEditing(false);
    } catch (error) {
      console.error('Error updating job priority:', error);
      alert('Failed to update job priority. Please try again.');
    }
  }

  async function handleDueDateChange(newDueDate: string) {
    if (!job) return;
    
    // Store the value for UI update
    let displayDueDate = newDueDate;
    
    try {
      // Ensure we're sending a properly formatted date to the database
      const { error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .update({ due_date: newDueDate || null })
        .eq('id', job.id);

      if (error) throw error;

      // Update local state
      setJob(prev => prev ? { ...prev, due_date: displayDueDate } : null);
      setIsDueDateEditing(false);
      
      console.log('Due date updated successfully:', displayDueDate);
    } catch (error) {
      console.error('Error updating job due date:', error);
      alert('Failed to update job due date. Please try again.');
    }
  }

  async function handleEditSubmit() {
    if (!editFormData || !job) return;

    console.log('Submitting edit with dates:', {
      start_date: editFormData.start_date,
      due_date: editFormData.due_date
    });

    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .update({
          title: editFormData.title,
          description: editFormData.description,
          start_date: editFormData.start_date,
          due_date: editFormData.due_date,
          budget: editFormData.budget,
          priority: editFormData.priority,
          status: editFormData.status,
          division: editFormData.division
        })
        .eq('id', job.id);

      if (error) throw error;

      setJob({
        ...editFormData,
        start_date: editFormData.start_date,
        due_date: editFormData.due_date
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating job:', error);
    }
  }

  function handleEditChange(field: keyof Job, value: any) {
    if (!editFormData) return;
    setEditFormData({ ...editFormData, [field]: value });
  }

  function getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getPriorityColor(priority: string) {
    return priority === 'high' ? 'bg-red-100 text-red-800' :
      priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
      'bg-green-100 text-green-800';
  }

  // Helper function to get the correct report URL based on asset name
  const getReportUrl = async (asset: Asset) => {
    if (asset.file_url.startsWith('report:')) {
      const reportPath = asset.file_url.replace('report:', ''); // Get the full path
      navigate(reportPath); // Navigate to the stored path
    } else {
      window.open(asset.file_url, '_blank');
    }
  };

  // Replace the existing formatDateSafe function with this more robust implementation
  function formatDateSafe(dateString: string | null): string {
    if (!dateString) return 'Click to set';
    
    // For YYYY-MM-DD format strings, parse them in a timezone-safe way
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      // Split the date parts and construct a new date
      const [year, month, day] = dateString.split('-').map(Number);
      // Note: month is 0-indexed in JavaScript Date
      return format(new Date(year, month - 1, day), 'MMM d, yyyy');
    }
    
    // For ISO strings or other formats, use a different approach
    // Add 12 hours to avoid timezone day boundary issues
    const date = new Date(dateString);
    date.setHours(12, 0, 0, 0);
    return format(date, 'MMM d, yyyy');
  }

  // Add this helper function to normalize dates for form display
  function normalizeDate(dateString: string | null): string {
    if (!dateString) return '';
    
    // If it's already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }
    
    // Otherwise, convert it to YYYY-MM-DD
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Helper function to format division names for display
  function formatDivisionName(divisionValue: string | null): string {
    if (!divisionValue) return 'No Division Assigned';
    
    const divisionMap: { [key: string]: string } = {
      'north_alabama': 'North Alabama Division',
      'tennessee': 'Tennessee Division',
      'georgia': 'Georgia Division',
      'international': 'International Division',
      'Decatur': 'North Alabama Division (Decatur)'
    };
    
    return divisionMap[divisionValue] || divisionValue;
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="mb-4 text-red-600">{error}</div>
        <Button 
          variant="ghost"
          onClick={() => navigate('/jobs')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8">
        <div className="mb-4">Job not found</div>
        <Button 
          variant="ghost"
          onClick={() => navigate('/jobs')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <Button 
          variant="ghost"
          onClick={() => navigate('/jobs')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            Edit Job
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-150 shadow">
        {isEditing ? (
          <div className="px-6 py-4">
            <form onSubmit={(e) => { e.preventDefault(); handleEditSubmit(); }} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-white">Job Title</label>
                  <input
                    type="text"
                    id="title"
                    value={editFormData?.title || ''}
                    onChange={(e) => handleEditChange('title', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="job_number" className="block text-sm font-medium text-gray-700 dark:text-white">Job Number</label>
                  <input
                    type="text"
                    id="job_number"
                    value={editFormData?.job_number || ''}
                    onChange={(e) => handleEditChange('job_number', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-white">Description</label>
                <textarea
                  id="description"
                  value={editFormData?.description || ''}
                  onChange={(e) => handleEditChange('description', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 dark:text-white">Start Date</label>
                  <input
                    type="date"
                    id="start_date"
                    value={editFormData?.start_date || ''}
                    onChange={(e) => handleEditChange('start_date', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 dark:text-white">Due Date</label>
                  <input
                    type="date"
                    id="due_date"
                    name="due_date"
                    value={editFormData?.due_date || ''}
                    onChange={(e) => handleEditChange('due_date', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="budget" className="block text-sm font-medium text-gray-700 dark:text-white">Budget</label>
                  <input
                    type="number"
                    id="budget"
                    value={editFormData?.budget || ''}
                    onChange={(e) => handleEditChange('budget', e.target.value ? parseFloat(e.target.value) : null)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-white">Priority</label>
                  <select
                    id="priority"
                    value={editFormData?.priority || 'medium'}
                    onChange={(e) => handleEditChange('priority', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-white">Status</label>
                <select
                  id="status"
                  value={editFormData?.status || 'pending'}
                  onChange={(e) => handleEditChange('status', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label htmlFor="division" className="block text-sm font-medium text-gray-700 dark:text-white">Division</label>
                <select
                  id="division"
                  name="division"
                  value={editFormData?.division || ''}
                  onChange={(e) => handleEditChange('division', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                >
                  <option value="">No Division</option>
                  <option value="north_alabama">North Alabama Division</option>
                  <option value="tennessee">Tennessee Division</option>
                  <option value="georgia">Georgia Division</option>
                  <option value="international">International Division</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="bg-white dark:bg-dark-100 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-dark-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="bg-[#f26722] text-white hover:bg-[#f26722]/90"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{job.title}</h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Job #{job.job_number || 'Pending'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isStatusEditing ? (
                    <div className="relative inline-block">
                      <select
                        value={job.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className="h-8 pl-3 pr-8 rounded-full text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-[#f26722] border border-gray-200 dark:border-gray-700 dark:bg-dark-100 dark:text-white"
                        autoFocus
                        onBlur={() => setIsStatusEditing(false)}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-gray-500 dark:text-gray-400" />
                    </div>
                  ) : (
                    <button 
                      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                        job.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        job.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                      onClick={() => setIsStatusEditing(true)}
                    >
                      {job.status}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </button>
                  )}
                  
                  {isPriorityEditing ? (
                    <div className="relative inline-block">
                      <select
                        value={job.priority}
                        onChange={(e) => handlePriorityChange(e.target.value)}
                        className="h-8 pl-3 pr-8 rounded-full text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-[#f26722] border border-gray-200 dark:border-gray-700 dark:bg-dark-100 dark:text-white"
                        autoFocus
                        onBlur={() => setIsPriorityEditing(false)}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-gray-500 dark:text-gray-400" />
                    </div>
                  ) : (
                    job.priority && (
                      <button
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                          job.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}
                        onClick={() => setIsPriorityEditing(true)}
                      >
                        {job.priority} Priority
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer</h3>
                  <Link 
                    to={`/customers/${job.customers?.id}`}
                    className="mt-1 text-sm text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                  >
                    {job.customers?.company_name || job.customers?.name || 'No customer assigned'}
                  </Link>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Start Date</h3>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {job.start_date ? formatDateSafe(job.start_date) : 'Not set'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Due Date</h3>
                  {isDueDateEditing ? (
                    <div className="mt-1 relative">
                      <input
                        type="date"
                        value={tempDueDate}
                        onChange={(e) => setTempDueDate(e.target.value)}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white sm:text-sm"
                        autoFocus
                        onBlur={() => handleDueDateChange(tempDueDate)}
                      />
                    </div>
                  ) : (
                    <p 
                      className="mt-1 text-sm text-gray-900 dark:text-white cursor-pointer hover:text-[#f26722] dark:hover:text-[#f26722]"
                      onClick={() => {
                        const normalizedDate = normalizeDate(job.due_date);
                        setTempDueDate(normalizedDate);
                        setIsDueDateEditing(true);
                      }}
                    >
                      {job.due_date ? formatDateSafe(job.due_date) : 'Click to set'}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Budget</h3>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    ${job.budget?.toLocaleString() || '0'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Division</h3>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formatDivisionName(job.division || null)}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Address</h3>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {job?.customers?.address ? (
                      job.customers.address.split('\n').map((line, index) => (
                        <span key={index} className="block">{line}</span>
                      ))
                    ) : job?.customers ? (
                      <span>Address not available</span>
                    ) : (
                      'Loading...'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {job.description && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900 dark:text-white">{job.description}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Related Opportunity - Conditionally Rendered based on role */}
      {(user && (user.role === 'sales' || user.role === 'admin') && opportunity) && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Related Opportunity</h3>
          <div className="bg-white dark:bg-dark-150 shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-200 inline-block px-2 py-1 rounded text-xs mb-2">
                  Created from Quote
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Quote #</p>
                <p className="text-lg font-medium">
                  <Link to={`/sales-dashboard/opportunities/${opportunity.id}`} className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90">
                    {opportunity.quote_number}
                  </Link>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  View associated quote for pricing, scope, and additional details
                </p>
              </div>
              <Link to={`/sales-dashboard/opportunities/${opportunity.id}`}>
                <Button 
                  variant="outline"
                  className="dark:bg-dark-100 dark:text-white dark:border-gray-700 dark:hover:bg-dark-200"
                >
                  View Opportunity
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Assets Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Assets</h3>
          <div className="relative">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#f26722] hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722]"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add assets
                <ChevronDown className="h-4 w-4 ml-1" />
              </button>
              <button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#f26722] hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722]"
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload assets
              </button>
              <input
                id="file-upload"
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  if (!user?.id) {
                    alert('You must be logged in to upload assets.');
                    return;
                  }
                  
                  try {
                    // Get file name without extension for the asset name
                    const baseName = file.name.replace(/\.[^/.]+$/, "");
                    console.log('File selected:', file.name, 'Base name:', baseName);
                    
                    // Start upload process
                    setIsUploading(true);
                    setUploadProgress(0);
                    console.log('Starting direct asset upload with file:', file.name);
                    
                    // Check if it's a JSON file
                    if (file.name.toLowerCase().endsWith('.json')) {
                      // Process JSON file
                      const reader = new FileReader();
                      
                      // Use a promise to handle the FileReader
                      try {
                        const jsonContent = await new Promise((resolve, reject) => {
                          reader.onload = (event) => {
                            try {
                              if (!event.target || typeof event.target.result !== 'string') {
                                reject(new Error('Failed to read file content'));
                                return;
                              }
                              console.log('File content loaded, parsing JSON...');
                              const content = JSON.parse(event.target.result);
                              resolve(content);
                            } catch (parseError: any) {
                              console.error('JSON parse error:', parseError);
                              reject(new Error(`Invalid JSON format: ${parseError.message}`));
                            }
                          };
                          reader.onerror = (fileError) => {
                            console.error('FileReader error:', fileError);
                            reject(new Error(`Error reading file: ${fileError}`));
                          };
                          reader.readAsText(file);
                        });
                        
                        console.log("JSON successfully parsed. Content keys:", Object.keys(jsonContent as Record<string, any>));
                        
                        // Use the centralized report import service
                        console.log("Calling reportImportService.importReport");
                        const importResult = await reportImportService.importReport(
                          jsonContent as Record<string, any>, // Pass the parsed JSON
                          id as string, // Pass job ID
                          user.id       // Pass user ID
                        );

                        if (!importResult.success) {
                          console.error("Report import failed:", importResult.error);
                          throw new Error(importResult.error || 'Failed to import report via service');
                        }

                        if (!importResult.reportId || !importResult.reportType) {
                           console.error("Import result missing fields:", importResult);
                           throw new Error('Report import result from service is missing required fields (reportId or reportType)');
                        }
                        
                        setUploadProgress(50); // Progress after successful import via service
                        console.log(`Report import successful via service: Type=${importResult.reportType}, ID=${importResult.reportId}`);

                        // Create asset record with report URL using info from the service result
                        const reportUrl = `report:/jobs/${id}/${importResult.reportType}/${importResult.reportId}`;
                              
                              // Create asset entry
                              const assetData = {
                          // Use baseName (filename without extension) or a default
                          name: baseName || `Imported ${importResult.reportType} Report`,
                                file_url: reportUrl,
                                user_id: user.id
                              };
                              
                              const { data: assetResult, error: assetError } = await supabase
                                .schema('neta_ops')
                                .from('assets')
                                .insert(assetData)
                                .select()
                                .single();
                              
                              if (assetError) {
                                console.error("Error creating asset record:", assetError);
                                throw assetError;
                              }
                              
                              setUploadProgress(75);
                              console.log("Asset record created with ID:", assetResult.id);
                              
                              // Link to job
                              const { error: linkError } = await supabase
                                .schema('neta_ops')
                                .from('job_assets')
                                .insert({
                                  job_id: id,
                                  asset_id: assetResult.id,
                                  user_id: user.id
                                });
                              
                              if (linkError) {
                                console.error("Error linking asset to job:", linkError);
                          // Consider rolling back asset creation or notifying user
                                throw linkError;
                              }
                              
                              setUploadProgress(100);
                              console.log("Asset successfully linked to job");
                              
                              // Reset form and refresh data
                        setNewAssetName(''); // Clear any name potentially set via other means
                        setSelectedFile(null); // Clear any file potentially set via other means
                              fetchAssets();
                              fetchJobAssets();
                        setIsUploading(false); // Already handled in finally, but good practice
                        
                        alert(`Successfully imported ${importResult.reportType} report.`);

                      } catch (jsonProcessError: any) {
                        console.error('JSON processing or import service error:', jsonProcessError);
                        // Use the error message from the exception
                        throw new Error(`JSON processing/import failed: ${jsonProcessError.message}`);
                      }
                    } else {
                      // Handle regular file upload (non-JSON)
                      console.log("Handling non-JSON file upload:", file.name);
                      // ... existing code ...
                    }
                  } catch (error: any) {
                    console.error('Error processing upload:', error);
                    // Extract the most useful error message
                    let errorMessage = 'Unknown error';
                    if (error.message) {
                      errorMessage = error.message;
                    } else if (error.details) {
                      errorMessage = error.details;
                    } else if (error.hint) {
                      errorMessage = error.hint;
                    } else if (typeof error === 'string') {
                      errorMessage = error;
                    }
                    
                    alert(`Upload failed: ${errorMessage}`);
                  } finally {
                    setIsUploading(false);
                    setUploadProgress(0);
                  }
                }}
                className="hidden"
              />
            </div>
            
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-dark-150 rounded-md shadow-lg z-10 border border-gray-200 dark:border-gray-700">
                <div className="p-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Templates</h4>
                    <div className="space-y-2">
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">MTS Forms</h5>
                        <div className="space-y-1">
                          {assets.filter(asset => asset.template_type === 'MTS').map(asset => (
                            <li key={asset.id} className="py-1">
                              <button
                                onClick={() => handleAddExistingAsset(asset.id)}
                                className="w-full text-left flex items-center text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded"
                              >
                                <Paperclip className="h-4 w-4 text-[#f26722] mr-2" />
                                <span className="truncate">{asset.name}</span>
                              </button>
                            </li>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">ATS Forms</h5>
                        <div className="space-y-1">
                          {(() => {
                            // Get all ATS form assets
                            const allATSForms = [...defaultAssets, ...assets].filter(asset => asset.template_type === 'ATS');
                            // Create a map to deduplicate by id
                            const assetMap = new Map();
                            allATSForms.forEach(asset => {
                              if (!assetMap.has(asset.id)) {
                                assetMap.set(asset.id, asset);
                              }
                            });
                            // Convert map values back to array
                            return Array.from(assetMap.values());
                          })().map(asset => (
                            <li key={asset.id} className="py-1">
                              <button
                                onClick={() => handleAddExistingAsset(asset.id)}
                                className="w-full text-left flex items-center text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded group"
                              >
                                <FileEdit className="h-4 w-4 text-[#f26722] mr-2" />
                                <span className="truncate flex-1">{asset.name}</span>
                                <span className="ml-2 text-xs text-[#f26722] group-hover:font-medium whitespace-nowrap">
                                  Fill Out Form
                                </span>
                              </button>
                            </li>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {jobAssets.length > 0 ? (
          <div className="bg-white dark:bg-dark-150 shadow rounded-lg overflow-hidden">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {jobAssets.map((asset) => (
                <li key={asset.id} className="px-4 py-4 sm:px-6 flex items-center justify-between">
                  <div className="flex items-center">
                    <Paperclip className="h-5 w-5 text-[#f26722]" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{asset.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Added {formatDateSafe(asset.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {asset.file_url.startsWith('report:') && (
                      <button
                        onClick={() => getReportUrl(asset)}
                        className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-[#f26722] hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722]"
                      >
                        View Report
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveJobAsset(asset.id)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-150 shadow rounded-lg p-6 text-center">
            <Paperclip className="h-8 w-8 text-[#f26722] mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No assets attached to this job</p>
          </div>
        )}
      </div>

      {contacts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Customer Contacts</h3>
          <div className="bg-white dark:bg-dark-150 shadow rounded-lg overflow-hidden">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {contacts.map((contact) => (
                <li key={contact.id} className="px-4 py-4 sm:px-6">
                  <Link to={`/contacts/${contact.id}`} className="block hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Users className="h-5 w-5 text-[#f26722]" />
                        <p className="ml-2 text-sm font-medium text-gray-900 dark:text-white">
                          {contact.first_name} {contact.last_name}
                          {contact.is_primary && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Primary
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{contact.position}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}