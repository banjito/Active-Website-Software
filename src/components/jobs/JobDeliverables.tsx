import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Deliverable {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'delivered';
  cover_letter_id: string;
  executive_summary_id: string | null;
  combined_pdf_url: string | null;
  created_at: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  delivered_at: string | null;
}

interface CoverLetter {
  id: string;
  name: string | null;
  doc_type: string;
  selected_report_ids: string[];
  created_at: string;
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
}

interface JobDeliverablesProps {
  jobId: string;
}

const JobDeliverables: React.FC<JobDeliverablesProps> = ({ jobId }) => {
  const { user } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCoverLetterId, setSelectedCoverLetterId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDeliverables();
    loadCoverLetters();
    loadAssets();
  }, [jobId]);

  const loadDeliverables = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('deliverables')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeliverables(data || []);
    } catch (error: any) {
      console.error('Error loading deliverables:', error);
      alert(`Failed to load deliverables: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadCoverLetters = async () => {
    try {
      console.log('🔍 Loading cover letters for job:', jobId);
      
      // First, let's see ALL generated documents for this job to debug
      const { data: allDocs, error: allDocsError } = await supabase
        .schema('neta_ops')
        .from('generated_documents')
        .select('id, name, doc_type, created_at')
        .eq('job_id', jobId);
      
      console.log('📋 ALL generated documents for this job:', allDocs);
      console.log('📊 Document types found:', allDocs?.map(d => d.doc_type));
      
      // Now get cover letters (including 'both' type which is cover + summary combined)
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('generated_documents')
        .select('id, name, doc_type, selected_report_ids, created_at')
        .eq('job_id', jobId)
        .in('doc_type', ['cover', 'both'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading cover letters:', error);
        // If the column doesn't exist yet, show helpful message
        if (error.message?.includes('selected_report_ids') || error.message?.includes('column') || error.code === '42703') {
          alert('Database migration required!\n\nPlease run these SQL scripts in order:\n1. add_report_selection_to_cover_letters.sql\n2. create_deliverables_table.sql\n\nColumn "selected_report_ids" is missing from generated_documents table.');
        }
        throw error;
      }
      
      console.log('✅ Cover letters loaded:', data?.length || 0, 'found');
      console.log('📄 Cover letters data:', data);
      setCoverLetters(data || []);
    } catch (error: any) {
      console.error('❌ Caught error loading cover letters:', error);
    }
  };

  const loadAssets = async () => {
    try {
      // Query assets directly instead of through job_assets relationship
      const { data: jobAssetData, error: jobAssetError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .select('asset_id')
        .eq('job_id', jobId);

      if (jobAssetError) throw jobAssetError;
      
      const assetIds = (jobAssetData || []).map((ja: any) => ja.asset_id);
      
      if (assetIds.length === 0) {
        setAssets([]);
        return;
      }
      
      // Now get the actual assets (include both report:/ URLs and PDF reports)
      const { data: assetData, error: assetError } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('id, name, file_url')
        .in('id', assetIds)
        .or('file_url.like.report:%,file_url.ilike.%.pdf'); // Get both report assets and PDF reports

      if (assetError) throw assetError;
      
      setAssets(assetData || []);
      console.log('📦 Assets loaded:', assetData?.length || 0, 'reports found (including PDF reports)');
    } catch (error: any) {
      console.error('Error loading assets:', error);
    }
  };

  const handleCreateDeliverable = async () => {
    if (!user || !name.trim() || !selectedCoverLetterId) {
      alert('Please enter a name and select a cover letter');
      return;
    }

    try {
      setSaving(true);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('deliverables')
        .insert({
          job_id: jobId,
          name: name.trim(),
          description: description.trim() || null,
          status: 'draft',
          cover_letter_id: selectedCoverLetterId,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      alert('Deliverable created successfully');
      setName('');
      setDescription('');
      setSelectedCoverLetterId('');
      setIsCreateDialogOpen(false);
      loadDeliverables();
    } catch (error: any) {
      console.error('Error creating deliverable:', error);
      alert(`Failed to create deliverable: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (deliverableId: string, newStatus: Deliverable['status'], rejectionReason?: string) => {
    if (!user) return;

    try {
      // Find the deliverable to get its cover letter ID
      const deliverable = deliverables.find(d => d.id === deliverableId);
      
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'approved') {
        updateData.approved_by = user.id;
        updateData.approved_at = new Date().toISOString();
      } else if (newStatus === 'rejected') {
        updateData.rejected_by = user.id;
        updateData.rejected_at = new Date().toISOString();
        updateData.rejection_reason = rejectionReason || null;
      } else if (newStatus === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .schema('neta_ops')
        .from('deliverables')
        .update(updateData)
        .eq('id', deliverableId);

      if (error) throw error;

      alert(`Deliverable ${newStatus}`);
      loadDeliverables();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      console.error('Error updating deliverable status:', error);
      alert(`Failed to update status: ${error.message}`);
    }
  };

  const handleDeleteDeliverable = async (deliverableId: string) => {
    if (!confirm('Are you sure you want to delete this deliverable?')) return;

    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('deliverables')
        .delete()
        .eq('id', deliverableId);

      if (error) throw error;

      alert('Deliverable deleted successfully');
      loadDeliverables();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      console.error('Error deleting deliverable:', error);
      alert(`Failed to delete deliverable: ${error.message}`);
    }
  };

  const handleViewDeliverable = (deliverable: Deliverable) => {
    // Open deliverable viewer in new window showing cover letter + all reports
    window.open(`/jobs/${jobId}/deliverable/${deliverable.id}`, '_blank');
  };

  const getStatusBadgeColor = (status: Deliverable['status']) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-500';
      case 'in_review':
        return 'bg-blue-500';
      case 'approved':
        return 'bg-green-500';
      case 'rejected':
        return 'bg-red-500';
      case 'delivered':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: Deliverable['status']) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const openDetailDialog = async (deliverable: Deliverable) => {
    setSelectedDeliverable(deliverable);
    setIsDetailDialogOpen(true);
  };

  const getCoverLetterName = (coverLetterId: string) => {
    const coverLetter = coverLetters.find(cl => cl.id === coverLetterId);
    return coverLetter?.name || 'Cover Letter';
  };

  const getCoverLetterReportCount = (coverLetterId: string) => {
    const coverLetter = coverLetters.find(cl => cl.id === coverLetterId);
    return coverLetter?.selected_report_ids?.length || 0;
  };

  const getReportNames = (reportIds: string[]) => {
    return reportIds.map(id => {
      const asset = assets.find(a => a.id === id);
      return asset?.name || 'Unknown Report';
    });
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><LoadingSpinner size="md" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Deliverables</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Create deliverables from saved cover letters and their associated reports
          </p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-[#f26722] hover:bg-[#e55611] text-white"
        >
          Create Deliverable
        </Button>
      </div>

      {/* Deliverables List */}
      {deliverables.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">No deliverables yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            First, create a cover letter and select reports. Then create a deliverable here.
          </p>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="mt-4 bg-[#f26722] hover:bg-[#e55611] text-white"
            disabled={coverLetters.length === 0}
          >
            {coverLetters.length === 0 ? 'No Cover Letters Available' : 'Create First Deliverable'}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {deliverables.map((deliverable) => {
            const reportCount = getCoverLetterReportCount(deliverable.cover_letter_id);
            return (
              <div
                key={deliverable.id}
                className="bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {deliverable.name}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${getStatusBadgeColor(deliverable.status)}`}>
                        {getStatusLabel(deliverable.status)}
                      </span>
                    </div>
                    {deliverable.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {deliverable.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
                      <span>{getCoverLetterName(deliverable.cover_letter_id)}</span>
                      <span>•</span>
                      <span>{reportCount} report(s)</span>
                      <span>•</span>
                      <span>Created {new Date(deliverable.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleViewDeliverable(deliverable)}
                      variant="secondary"
                      size="sm"
                    >
                      View
                    </Button>
                    <Button
                      onClick={() => openDetailDialog(deliverable)}
                      variant="secondary"
                      size="sm"
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Deliverable Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Deliverable</DialogTitle>
            <DialogDescription>
              Select a cover letter (which includes associated reports)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Phase 1 Deliverable, Progress Report"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this deliverable"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
                Select Cover Letter *
              </label>
              {coverLetters.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 p-3 border border-gray-300 dark:border-gray-600 rounded-md">
                  No cover letters available. Please generate a cover letter first.
                </p>
              ) : (
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2">
                  {coverLetters.map((coverLetter) => {
                    const reportNames = getReportNames(coverLetter.selected_report_ids || []);
                    return (
                      <label
                        key={coverLetter.id}
                        className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                          selectedCoverLetterId === coverLetter.id
                            ? 'border-[#f26722] bg-orange-50 dark:bg-orange-900/20'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-100'
                        }`}
                      >
                        <input
                          type="radio"
                          name="coverLetter"
                          checked={selectedCoverLetterId === coverLetter.id}
                          onChange={() => setSelectedCoverLetterId(coverLetter.id)}
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                            {coverLetter.name || 'Cover Letter'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Created {new Date(coverLetter.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsCreateDialogOpen(false)} variant="secondary">
              Cancel
            </Button>
            <Button
              onClick={handleCreateDeliverable}
              disabled={saving || !name.trim() || !selectedCoverLetterId}
              className="bg-[#f26722] hover:bg-[#e55611] text-white"
            >
              {saving ? 'Creating...' : 'Create Deliverable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliverable Detail Dialog */}
      {selectedDeliverable && (
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{selectedDeliverable.name}</DialogTitle>
              <DialogDescription>
                Deliverable details and actions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-white">Status:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${getStatusBadgeColor(selectedDeliverable.status)}`}>
                  {getStatusLabel(selectedDeliverable.status)}
                </span>
              </div>
              
              {selectedDeliverable.description && (
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-white">Description:</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {selectedDeliverable.description}
                  </p>
                </div>
              )}

              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-white">Cover Letter:</span>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {getCoverLetterName(selectedDeliverable.cover_letter_id)}
                </p>
              </div>

              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-white">
                  Reports ({getCoverLetterReportCount(selectedDeliverable.cover_letter_id)})
                </span>
                <ul className="mt-2 space-y-1">
                  {(() => {
                    const coverLetter = coverLetters.find(cl => cl.id === selectedDeliverable.cover_letter_id);
                    const reportIds = coverLetter?.selected_report_ids || [];
                    return getReportNames(reportIds).map((name, idx) => (
                      <li key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                        • {name}
                      </li>
                    ));
                  })()}
                </ul>
              </div>

              {selectedDeliverable.rejection_reason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <span className="text-sm font-medium text-red-900 dark:text-red-300">Rejection Reason:</span>
                  <p className="text-sm text-red-800 dark:text-red-400 mt-1">
                    {selectedDeliverable.rejection_reason}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <div className="flex gap-2 flex-wrap">
                {selectedDeliverable.status === 'draft' && (
                  <Button
                    onClick={() => handleUpdateStatus(selectedDeliverable.id, 'in_review')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Submit for Review
                  </Button>
                )}
                
                {selectedDeliverable.status === 'in_review' && (
                  <>
                    <Button
                      onClick={() => handleUpdateStatus(selectedDeliverable.id, 'approved')}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() => {
                        const reason = prompt('Enter rejection reason:');
                        if (reason) {
                          handleUpdateStatus(selectedDeliverable.id, 'rejected', reason);
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Reject
                    </Button>
                  </>
                )}

                {selectedDeliverable.status === 'approved' && (
                  <Button
                    onClick={() => handleUpdateStatus(selectedDeliverable.id, 'delivered')}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Mark as Delivered
                  </Button>
                )}

                {selectedDeliverable.status === 'draft' && (
                  <Button
                    onClick={() => handleDeleteDeliverable(selectedDeliverable.id)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete
                  </Button>
                )}

                <Button onClick={() => setIsDetailDialogOpen(false)} variant="secondary">
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default JobDeliverables;
