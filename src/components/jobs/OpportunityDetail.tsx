import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Edit, Award, X, ChevronDown, Pencil, Save, Trash2, Upload, FileText, Download, Eye, ExternalLink } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Opportunity, OpportunityFormData, SubcontractorAgreement } from '../../lib/types/index';
import EstimateSheet from '../estimates/EstimateSheet';
import { Button } from '@/components/ui/Button';
import { useJobDetails } from '../../lib/hooks/useJobDetails';
import { DivisionAnalyticsDialog } from '../analytics/DivisionAnalyticsDialog';
import { SupabaseClient } from '@supabase/supabase-js';
import { addDefaultFilesToJob } from '../../lib/services/defaultJobFiles';
import { PDFEditor } from '../pdf/PDFEditor';

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface CustomerInfo {
  id: string;
  name: string;
  company_name?: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  customer_id: string;
}

interface OpportunityWithCustomer extends Opportunity {
  customers: CustomerInfo | null;
  proposal_due_date?: string | null;
  quoted_amount?: number | null;
}

const initialFormData: OpportunityFormData = {
  customer_id: '',
  contact_id: null,
  title: '',
  description: '',
  status: 'awareness',
  expected_value: '',
  probability: '0',
  expected_close_date: '',
  proposal_due_date: '',
  notes: '',
  sales_person: '',
  amp_division: '',
  quoted_amount: '',
  selected_letter_proposal: '',
  reviewed_by: '',
  prepared_by: ''
};

// Add this utility function to handle date formatting consistently
function formatDateSafe(dateString: string | null | undefined): string {
  if (!dateString) return 'Not specified';
  
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

// Add this function after the imports but before the component definition
async function createJobManually(
  opportunity: any, 
  supabase: SupabaseClient<any, "common" | "public", any>, 
  userId: string
): Promise<string> {
  if (!opportunity) {
    throw new Error('Cannot create job: opportunity data is missing');
  }

  if (!opportunity.customer_id) {
    throw new Error('Cannot create job: customer_id is required');
  }
  
  if (!userId) {
    throw new Error('Cannot create job: user ID is missing');
  }
  
  // Create the job in neta_ops schema
  const { data: newJob, error: jobError } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .insert({
      user_id: userId,
      customer_id: opportunity.customer_id,
      title: opportunity.title,
      description: opportunity.description,
      status: 'pending',
      start_date: new Date().toISOString().substring(0, 10),
      budget: opportunity.expected_value,
      notes: (opportunity.notes || '') + '\n\nConverted from opportunity: ' + opportunity.quote_number,
      priority: 'medium',
      division: opportunity.amp_division === 'Decatur' ? 'north_alabama' : opportunity.amp_division
    })
    .select()
    .single();
    
  if (jobError) {
    console.error('Manual job creation error:', jobError);
    throw new Error(`Manual job creation failed: ${jobError.message}`);
  }
  
  try {
    // First check if job_id column exists in business.opportunities
    const { error: checkError } = await supabase
      .schema('business')
      .from('opportunities')
      .select('job_id')
      .limit(1);
    
    if (checkError) {
      // Column doesn't exist - log warning but don't fail
      console.warn('Warning: job_id column not found in opportunities table:', checkError.message);
      console.warn('Job was created successfully but opportunity could not be linked to it.');
    } else {
      // Column exists, so update the opportunity in business schema
      const { error: updateError } = await supabase
        .schema('business')
        .from('opportunities')
        .update({ job_id: newJob.id })
        .eq('id', opportunity.id);
        
      if (updateError) {
        console.error('Opportunity update error:', updateError);
        // Don't throw, just log the error
        console.warn('Job was created successfully but opportunity could not be linked to it.');
      }
    }
  } catch (error) {
    console.error('Error updating opportunity:', error);
    // Don't throw, just log the error
    console.warn('Job was created successfully but opportunity could not be linked to it.');
  }
  
  // Add default files to the newly created job
  try {
    const division = opportunity.amp_division === 'Decatur' ? 'north_alabama' : opportunity.amp_division;
    await addDefaultFilesToJob(newJob.id, userId, division);
    console.log('Default files added successfully to job:', newJob.id);
  } catch (fileError) {
    console.error('Error adding default files to job:', fileError);
    // Don't fail the job creation if default files fail
    console.warn('Job was created successfully but some default files could not be added');
  }
  
  return newJob.id;
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const mergedIdsParam = search.get('ids');
  const primaryIdParam = search.get('primary');
  const mergedIds = (mergedIdsParam ? mergedIdsParam.split(',').filter(Boolean) : []);
  const { user } = useAuth();
  const [opportunity, setOpportunity] = useState<OpportunityWithCustomer | null>(null);
  const [mergedList, setMergedList] = useState<OpportunityWithCustomer[]>([]);
  const [groupLockJobId, setGroupLockJobId] = useState<string | null>(null);
  const [savedMergeIds, setSavedMergeIds] = useState<string[]>([]);
  const [savedPrimaryId, setSavedPrimaryId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<OpportunityFormData>(initialFormData);
  const [confirmConvertToJobOpen, setConfirmConvertToJobOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<OpportunityFormData>({
    customer_id: '',
    title: '',
    description: '',
    expected_value: '',
    status: 'awareness',
    expected_close_date: '',
    sales_person: '',
    notes: '',
    probability: '0',
    amp_division: '',
    quoted_amount: '',
    selected_letter_proposal: '',
    reviewed_by: '',
    prepared_by: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showJobDialog, setShowJobDialog] = useState(false);
  const { jobDetails } = useJobDetails(jobId || undefined);
  const [showDivisionAnalytics, setShowDivisionAnalytics] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [showEstimate, setShowEstimate] = useState<'new' | 'view' | 'letter' | 'letters' | 'combined-letter' | false>(false);
  
  // Function to update prepared_by field based on estimate creators
  const updatePreparedByFromEstimates = async (opportunityId: string) => {
    try {
      // Get all estimates for this opportunity with user information
      const { data: estimates, error } = await supabase
        .schema('business')
        .from('estimates')
        .select(`
          user_id,
          auth.users!inner(email)
        `)
        .eq('opportunity_id', opportunityId);

      if (error) {
        console.error('Error fetching estimates for prepared_by:', error);
        return;
      }

      if (estimates && estimates.length > 0) {
        // Get unique user emails from estimate creators
        const uniqueEmails = [...new Set(estimates.map(est => est.auth?.users?.email).filter(Boolean))];
        const preparedByValue = uniqueEmails.join(', ');

        // Update the opportunity's prepared_by field
        const { error: updateError } = await supabase
          .schema('business')
          .from('opportunities')
          .update({ prepared_by: preparedByValue })
          .eq('id', opportunityId);

        if (updateError) {
          console.error('Error updating prepared_by:', updateError);
        } else {
          console.log('Updated prepared_by:', preparedByValue);
          // Refresh the opportunity data to show the updated field
          fetchOpportunity();
        }
      }
    } catch (error) {
      console.error('Error in updatePreparedByFromEstimates:', error);
    }
  };

  // Listen for estimate save events to update prepared_by field
  useEffect(() => {
    const handleEstimateSaved = (event: CustomEvent) => {
      const { opportunityId } = event.detail;
      if (opportunityId === id) {
        // Refresh the opportunity so UI shows latest prepared_by immediately
        fetchOpportunity();
      }
    };

    window.addEventListener('estimateSaved', handleEstimateSaved as EventListener);
    
    return () => {
      window.removeEventListener('estimateSaved', handleEstimateSaved as EventListener);
    };
  }, [id]);

  // Clear any persisted estimate mode/draft when leaving the page
  useEffect(() => {
    return () => {
      try {
        if (id) {
          localStorage.removeItem(`estimate-last-mode-${id}`);
          localStorage.removeItem(`estimate-draft-${id}`);
          // Clean up letter proposal persistence when leaving the page
          localStorage.removeItem(`letter-proposal-draft-${id}`);
          localStorage.removeItem(`letter-proposal-open-${id}`);
          localStorage.removeItem(`letter-quote-index-${id}`);
          localStorage.removeItem(`letter-neta-standard-${id}`);
        }
        localStorage.removeItem('AMP_SUSPEND_REFRESH');
      } catch {}
    };
  }, [id]);
  const [estimateOpenSignal, setEstimateOpenSignal] = useState(0);
  const [subcontractorAgreements, setSubcontractorAgreements] = useState<SubcontractorAgreement[]>([]);
  const [showSubcontractorDialog, setShowSubcontractorDialog] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<SubcontractorAgreement | null>(null);
  const [isEditingPDF, setIsEditingPDF] = useState(false);
  const [isSavingPDF, setIsSavingPDF] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [letterProposals, setLetterProposals] = useState<Array<{
    id: string;
    letter_number: string;
    net_30_price: number;
    opportunity_id: string;
  }>>([]);

  // Only fetch when ID or URL params change, use user ID instead of user object to prevent unnecessary re-renders
  const userId = user?.id;
  useEffect(() => {
    if (userId && id) {
      fetchOpportunity();
      fetchCustomers();
    }
  }, [userId, id, mergedIdsParam, primaryIdParam]);

  // Listen for estimate mode reset events
  useEffect(() => {
    const handleResetEstimateMode = () => {
      setShowEstimate(false);
    };

    window.addEventListener('resetEstimateMode', handleResetEstimateMode);
    return () => {
      window.removeEventListener('resetEstimateMode', handleResetEstimateMode);
    };
  }, []);

  // Read any existing merge lock for this group from localStorage
  useEffect(() => {
    if (id === 'merge' && mergedIds.length > 0) {
      try {
        const key = `opportunity-merge-lock-${mergedIds.slice().sort().join(',')}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.jobId) {
            setGroupLockJobId(String(parsed.jobId));
          }
        }
      } catch {}
    }
  }, [id, mergedIdsParam]);

  useEffect(() => {
    if (opportunity) {
      setEditFormData({
        customer_id: opportunity.customer_id || '',
        title: opportunity.title || '',
        description: opportunity.description || '',
        expected_value: opportunity.expected_value?.toString() || '',
        status: opportunity.status || '',
        expected_close_date: opportunity.expected_close_date 
          ? opportunity.expected_close_date.substring(0, 10)
          : '',
        proposal_due_date: opportunity.proposal_due_date 
          ? opportunity.proposal_due_date.substring(0, 10)
          : '',
        sales_person: opportunity.sales_person || '',
        notes: opportunity.notes || '',
        probability: opportunity.probability?.toString() || '0',
        amp_division: opportunity.amp_division || '',
        quoted_amount: (opportunity as any).quoted_amount?.toString() || '',
        selected_letter_proposal: (opportunity as any).selected_letter_proposal || '',
        reviewed_by: (opportunity as any).reviewed_by || '',
        prepared_by: (opportunity as any).prepared_by || ''
      });
      // Fetch letter proposals for this opportunity
      fetchLetterProposals(opportunity.id);
      // Fetch all documents for this opportunity
      (async () => {
        const { data: agreements, error } = await supabase
          .schema('business')
          .from('subcontractor_agreements')
          .select('*')
          .eq('opportunity_id', opportunity.id)
          .order('upload_date', { ascending: false });
        if (!error && agreements) {
          setSubcontractorAgreements(agreements);
        }
      })();
    }
  }, [opportunity]);

  async function fetchLetterProposals(opportunityId: string) {
    try {
      console.log('Fetching letter proposals for opportunity:', opportunityId);
      const { data, error } = await supabase
        .schema('business')
        .from('letter_proposals')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log('Letter proposals fetched:', data);
      console.log('First letter proposal structure:', data?.[0]);
      setLetterProposals(data || []);
    } catch (error) {
      console.error('Error fetching letter proposals:', error);
    }
  }

  async function fetchOpportunity() {
    setLoading(true);
    try {
      // Explicitly select columns to avoid implicit relationship lookups
      const opportunityColumns = 
        'id, created_at, updated_at, customer_id, contact_id, title, description, status, expected_value, probability, expected_close_date, quote_number, notes, job_id, awarded_date, sales_person, amp_division, subcontractor_agreements, quoted_amount, selected_letter_proposal, reviewed_by, prepared_by';

      let opportunityData: Opportunity | null = null;
      let primaryId: string | null = null;

      if (id === 'merge' && mergedIds.length > 0) {
        // Merged view: fetch all listed opportunities and pick primary (most recent if not provided)
        const { data: list, error } = await supabase
          .schema('business')
          .from('opportunities')
          .select(opportunityColumns)
          .in('id', mergedIds);
        if (error) throw error;
        // Determine primary
        let primary = null as any;
        if (primaryIdParam) {
          primary = list?.find(o => String(o.id) === primaryIdParam) || null;
        }
        if (!primary) {
          primary = (list || []).slice().sort((a: any, b: any) => {
            const at = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bt - at; // most recent first
          })[0] || null;
        }
        opportunityData = (primary as any) || null;
        primaryId = primary ? String(primary.id) : null;

        // Attach customers for each and store merged list for rendering
        const withCustomers = await Promise.all((list || []).map(async (o: any) => {
          let cInfo: CustomerInfo | null = null;
          if (o.customer_id) {
            const { data: cData } = await supabase
              .schema('common')
              .from('customers')
              .select('id, name, company_name')
              .eq('id', o.customer_id)
              .maybeSingle();
            if (cData) cInfo = cData as CustomerInfo;
          }
          return { ...(o as Opportunity), customers: cInfo } as OpportunityWithCustomer;
        }));
        setMergedList(withCustomers);
        const existingJob = withCustomers.find((m) => !!m.job_id)?.job_id;
        if (existingJob) {
          setGroupLockJobId(String(existingJob));
          try {
            const key = `opportunity-merge-lock-${mergedIds.slice().sort().join(',')}`;
            localStorage.setItem(key, JSON.stringify({ jobId: existingJob, ids: mergedIds, lockedAt: new Date().toISOString() }));
          } catch {}
        }
      } else {
        // Normal view: fetch by id
        const { data, error } = await supabase
          .schema('business')
          .from('opportunities')
          .select(opportunityColumns)
          .eq('id', id)
          .single<Opportunity>();
        if (error) throw error;
        opportunityData = data || null;
        primaryId = opportunityData ? String(opportunityData.id) : null;

        // Prefer DB-backed merge groups if present
        try {
          const { data: membership } = await supabase
            .schema('business')
            .from('opportunity_merge_members')
            .select('merge_group_id, opportunity_id, is_primary')
            .eq('opportunity_id', id)
            .maybeSingle();

          if (membership && membership.merge_group_id) {
            const groupId = membership.merge_group_id as string;
            const [{ data: group }, { data: members }] = await Promise.all([
              supabase
                .schema('business')
                .from('opportunity_merge_groups')
                .select('primary_opportunity_id, job_id')
                .eq('id', groupId)
                .maybeSingle(),
              supabase
                .schema('business')
                .from('opportunity_merge_members')
                .select('opportunity_id, is_primary')
                .eq('merge_group_id', groupId)
            ]);

            const ids = (members || []).map(m => String((m as any).opportunity_id));
            if (ids.length > 1) {
              setSavedMergeIds(ids);
              const pId = (group as any)?.primary_opportunity_id
                ? String((group as any).primary_opportunity_id)
                : ((members || []).find(m => (m as any).is_primary)?.opportunity_id ? String((members as any[]).find(m => (m as any).is_primary)!.opportunity_id) : primaryId);
              setSavedPrimaryId(pId || primaryId);
              if ((group as any)?.job_id) setGroupLockJobId(String((group as any).job_id));

              // Fetch peers and attach customers
              const { data: peers } = await supabase
                .schema('business')
                .from('opportunities')
                .select(opportunityColumns)
                .in('id', ids);
              const withCustomers = await Promise.all((peers || []).map(async (o: any) => {
                let cInfo: CustomerInfo | null = null;
                if (o.customer_id) {
                  const { data: cData } = await supabase
                    .schema('common')
                    .from('customers')
                    .select('id, name, company_name')
                    .eq('id', o.customer_id)
                    .maybeSingle();
                  if (cData) cInfo = cData as CustomerInfo;
                }
                return { ...(o as Opportunity), customers: cInfo } as OpportunityWithCustomer;
              }));
              setMergedList(withCustomers);
            }
          }
        } catch (e) {
          console.warn('Merge group lookup failed (non-fatal):', e);
        }

        // Parse saved merge info from notes for non-merge route
        if (opportunityData && typeof opportunityData.notes === 'string') {
          const meta = extractMergeMetaFromNotes(opportunityData.notes);
          if (meta && meta.ids && meta.ids.length > 1) {
            setSavedMergeIds(meta.ids);
            setSavedPrimaryId(meta.primary || primaryId);
            // Fetch merged peers for inline view
            const { data: peers } = await supabase
              .schema('business')
              .from('opportunities')
              .select(opportunityColumns)
              .in('id', meta.ids);
            const withCustomers = await Promise.all((peers || []).map(async (o: any) => {
              let cInfo: CustomerInfo | null = null;
              if (o.customer_id) {
                const { data: cData } = await supabase
                  .schema('common')
                  .from('customers')
                  .select('id, name, company_name')
                  .eq('id', o.customer_id)
                  .maybeSingle();
                if (cData) cInfo = cData as CustomerInfo;
              }
              return { ...(o as Opportunity), customers: cInfo } as OpportunityWithCustomer;
            }));
            setMergedList(withCustomers);
            const existingJob = withCustomers.find((m) => !!m.job_id)?.job_id;
            if (existingJob) {
              setGroupLockJobId(String(existingJob));
            }
          } else {
            setSavedMergeIds([]);
            setSavedPrimaryId(null);
          }
        }
      }

      if (!opportunityData) throw new Error('Opportunity not found');
      
      // Then fetch the customer data from common schema if we have a customer_id
      let customerInfo: CustomerInfo | null = null;
      if (opportunityData.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .eq('id', opportunityData.customer_id)
          .single<CustomerInfo>();
          
        if (!customerError && customerData) {
          customerInfo = customerData;
        }
      }
      
      // Optionally fetch the linked contact
      let contactInfo: Contact | null = null;
      if (opportunityData.contact_id) {
        const { data: cData, error: cErr } = await supabase
          .schema('common')
          .from('contacts')
          .select('id, first_name, last_name, email, phone, customer_id')
          .eq('id', opportunityData.contact_id)
          .maybeSingle();
        if (!cErr && cData) {
          contactInfo = {
            id: cData.id,
            name: `${cData.first_name} ${cData.last_name}`,
            email: cData.email || '',
            phone: cData.phone,
            customer_id: cData.customer_id
          };
        }
      }

      // Combine the data
      setOpportunity({
        ...opportunityData,
        customers: customerInfo
      });
      if (contactInfo) {
        setContacts(prev => {
          const exists = prev.some(c => c.id === contactInfo!.id);
          return exists ? prev : [contactInfo!, ...prev];
        });
      }

      // Safely try to fetch optional proposal_due_date without breaking if it doesn't exist
      try {
        const pdTargetId = primaryId || id;
        const { data: pd, error: pdError } = await supabase
          .schema('business')
          .from('opportunities')
          .select('proposal_due_date')
          .eq('id', pdTargetId)
          .maybeSingle();
        if (!pdError && pd && 'proposal_due_date' in (pd as any)) {
          setOpportunity(prev => prev ? { ...prev, proposal_due_date: (pd as any).proposal_due_date } : prev);
        }
      } catch (e: any) {
        // If column doesn't exist (42703) or any other error, ignore gracefully
        if (e?.code !== '42703') {
          console.warn('Optional proposal_due_date fetch warning:', e);
        }
      }
         
      if (opportunityData.job_id) {
        setJobId(opportunityData.job_id.toString());
      }

    } catch (error) {
      console.error('Error fetching opportunity:', error);
    } finally {
      setLoading(false);
      
      // Update prepared_by field based on existing estimates
      if (opportunity && opportunity.id) {
        updatePreparedByFromEstimates(opportunity.id);
      }
    }
  }

  // --- Merge metadata helpers ---
  function buildMergeMeta(ids: string[], primary: string | null, jobId?: string | null) {
    return `[MERGE_GROUP]primary=${primary || ''};ids=${ids.join(',')};locked_job=${jobId || ''};[/MERGE_GROUP]`;
  }

  function extractMergeMetaFromNotes(notes: string | null | undefined): { ids: string[]; primary: string | null; locked_job: string | null } | null {
    if (!notes) return null;
    const start = notes.indexOf('[MERGE_GROUP]');
    const end = notes.indexOf('[/MERGE_GROUP]');
    if (start === -1 || end === -1 || end <= start) return null;
    const block = notes.substring(start + 13, end).trim();
    // format: primary=...;ids=a,b,c;locked_job=...
    const parts = block.split(';').map(s => s.trim());
    const map: Record<string, string> = {};
    parts.forEach(p => {
      const idx = p.indexOf('=');
      if (idx > -1) {
        map[p.substring(0, idx)] = p.substring(idx + 1);
      }
    });
    const ids = (map['ids'] || '').split(',').filter(Boolean);
    const primary = map['primary'] || null;
    const locked_job = map['locked_job'] || null;
    if (ids.length < 2) return null;
    return { ids, primary, locked_job };
  }

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('customers')
        .select('id, name, company_name')
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  }
  
  async function fetchContacts(customerId: string) {
    if (!customerId) {
      setContacts([]); // Ensure setContacts exists in component state
      return;
    }
    try {
      const { data, error } = await supabase
        .schema('common') 
        .from('contacts')
        .select('id, first_name, last_name, email, phone, customer_id') // Select all needed fields
        .eq('customer_id', customerId);

      if (error) throw error;
      
      // Transform the data to match the Contact interface
      const transformedContacts = (data || []).map(contact => ({
        id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`,
        email: contact.email || '',
        phone: contact.phone,
        customer_id: contact.customer_id
      }));
      
      setContacts(transformedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setContacts([]); // Set to empty array on error
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!opportunity) return;
    setIsSubmitting(true);

    try {
      const expectedCloseDate = editFormData.expected_close_date
        ? editFormData.expected_close_date
        : null;
      const proposalDueDate = editFormData.proposal_due_date
        ? editFormData.proposal_due_date
        : null;

      console.log("Submitting with expected_close_date:", expectedCloseDate);

      const updatePayload: any = {
        customer_id: editFormData.customer_id,
        title: editFormData.title,
        description: editFormData.description,
        expected_value: editFormData.expected_value ? parseFloat(editFormData.expected_value) : null,
        status: editFormData.status,
        expected_close_date: expectedCloseDate,
        sales_person: editFormData.sales_person,
        notes: editFormData.notes,
        probability: editFormData.probability ? parseFloat(editFormData.probability) : 0,
        amp_division: editFormData.amp_division,
        quoted_amount: editFormData.quoted_amount ? parseFloat(editFormData.quoted_amount) : null,
        selected_letter_proposal: editFormData.selected_letter_proposal || null,
        reviewed_by: editFormData.reviewed_by || null,
        prepared_by: editFormData.prepared_by || null
      };
      updatePayload.proposal_due_date = proposalDueDate;

      // Try update with proposal_due_date included first
      let updateError = null as any;
      let res = await supabase
        .schema('business')
        .from('opportunities')
        .update({ ...updatePayload, proposal_due_date: proposalDueDate })
        .eq('id', opportunity.id)
        .select();
      updateError = res.error;

      // If column missing (42703), retry without proposal_due_date
      if (updateError && updateError.code === '42703') {
        res = await supabase
          .schema('business')
          .from('opportunities')
          .update(updatePayload)
          .eq('id', opportunity.id)
          .select();
        updateError = res.error;
      }

      const error = updateError;

      if (error) throw error;

      setIsEditing(false);
      fetchOpportunity();
    } catch (error) {
      console.error('Error updating opportunity:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  }

  function handleLetterProposalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedProposalId = e.target.value;
    const selectedProposal = letterProposals.find(p => p.id === selectedProposalId);
    
    setEditFormData(prev => ({
      ...prev,
      selected_letter_proposal: selectedProposalId,
      quoted_amount: selectedProposal ? selectedProposal.net_30_price.toString() : ''
    }));
  }

  function getStatusColor(status: string) {
    switch (status.toLowerCase()) {
      case 'awareness':
        return 'bg-gray-100 text-gray-800 dark:bg-dark-150 dark:text-gray-100';
      case 'interest':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100';
      case 'quote':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100';
      case 'decision':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
      case 'decision - forecasted win':
        return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
      case 'decision - forecast lose':
        return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
      case 'awarded':
        return 'bg-green-500 text-white dark:bg-green-600';
      case 'lost':
        return 'bg-red-500 text-white dark:bg-red-600';
      case 'no quote':
        return 'bg-gray-500 text-white dark:bg-gray-600';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-dark-150 dark:text-gray-100';
    }
  }

  function formatStatus(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  }

  const handleConvertToJob = async () => {
    if (!opportunity?.id || !user) return;

    try {
      // Check if opportunity has required fields
      if (!opportunity?.customer_id) {
        throw new Error('Opportunity is missing customer_id which is required for job creation');
      }

      // Create the job directly without changing the opportunity status
      const newJobId = await createJobManually(opportunity, supabase, user.id);
      setJobId(newJobId);
      
      // Update the opportunity in state to include the job_id
      setOpportunity(prev => 
        prev ? { ...prev, job_id: newJobId } as OpportunityWithCustomer : null
      );

      // If this is a merged view, lock the group so others cannot convert
      if (id === 'merge' && mergedIds.length > 0) {
        try {
          const key = `opportunity-merge-lock-${mergedIds.slice().sort().join(',')}`;
          localStorage.setItem(key, JSON.stringify({ jobId: newJobId, ids: mergedIds, lockedAt: new Date().toISOString() }));
          setGroupLockJobId(String(newJobId));
        } catch {}
      }

      // Persist merge metadata into notes so future loads show merged grouping
      try {
        const idsToPersist = id === 'merge' && mergedIds.length > 0 ? mergedIds : (savedMergeIds.length > 0 ? savedMergeIds : []);
        if (idsToPersist.length > 1) {
          const { data: currentRow } = await supabase
            .schema('business')
            .from('opportunities')
            .select('notes')
            .eq('id', opportunity.id)
            .maybeSingle();

          const currentNotes = (currentRow?.notes as string) || '';
          const withoutOld = currentNotes.replace(/\[MERGE_GROUP\][\s\S]*?\[\/MERGE_GROUP\]/g, '').trim();
          const newMeta = buildMergeMeta(idsToPersist, String(opportunity.id), newJobId);
          const combined = (withoutOld ? (withoutOld + '\n\n') : '') + newMeta;
          await supabase
            .schema('business')
            .from('opportunities')
            .update({ notes: combined })
            .eq('id', opportunity.id);
        }
      } catch (e) {
        console.warn('Failed to persist merge metadata:', e);
      }
      
      setConfirmConvertToJobOpen(false);
      setShowSuccessMessage(`Job successfully created! Job ID: ${newJobId}`);
      // Auto-hide success message after 5 seconds
      setTimeout(() => setShowSuccessMessage(null), 5000);
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job: ' + (error instanceof Error ? error.message : 'Please try again. If the problem persists, contact support.'));
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!opportunity?.id || !user) return;

    try {
      const { error } = await supabase
        .schema('business')
        .from('opportunities')
        .update({ status: newStatus })
        .eq('id', opportunity.id);

      if (error) throw error;

      // Update the local state for all status changes
      setOpportunity(prev => 
        prev ? { ...prev, status: newStatus as any } : null
      );
      
      setIsStatusEditing(false);
    } catch (error) {
      console.error('Error updating opportunity status:', error);
      alert('Failed to update opportunity status: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !opportunity?.id) return;

    console.log('Starting file upload...', { fileName: file.name, fileSize: file.size, fileType: file.type });

    setUploadingFile(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${opportunity.id}/${fileName}`;

      console.log('Uploading to path:', filePath);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('job-documents')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      if (!uploadData) {
        throw new Error('Upload completed but no data returned');
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-documents')
        .getPublicUrl(filePath);

      console.log('Public URL generated:', publicUrl);

      // Save to database first to get the proper ID
      const { data: savedAgreement, error } = await supabase
        .schema('business')
        .from('subcontractor_agreements')
        .insert({
          opportunity_id: opportunity.id,
          user_id: user?.id,
          name: file.name,
          file_url: publicUrl,
          upload_date: new Date().toISOString(),
          status: 'pending',
          description: ''
        })
        .select()
        .single();

      if (error) {
        console.error('Database insert error:', error);
        throw error;
      }

      console.log('Document saved to database:', savedAgreement);

      // Create new agreement object with the database-generated ID
      const newAgreement: SubcontractorAgreement = {
        id: savedAgreement.id,
        name: file.name,
        file_url: publicUrl,
        upload_date: new Date().toISOString(),
        status: 'pending',
        description: ''
      };

      // Update agreements array
      const updatedAgreements = [...subcontractorAgreements, newAgreement];
      setSubcontractorAgreements(updatedAgreements);

      alert('Document uploaded successfully!');
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload document: ' + (error instanceof Error ? error.message : 'Please try again.'));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAgreement = async (agreementId: string) => {
    if (!opportunity?.id || !confirm('Are you sure you want to delete this document?')) return;

    try {
      const updatedAgreements = subcontractorAgreements.filter(agreement => agreement.id !== agreementId);
      setSubcontractorAgreements(updatedAgreements);

      const { error } = await supabase
        .schema('business')
        .from('subcontractor_agreements')
        .delete()
        .eq('id', agreementId);

      if (error) throw error;

      alert('Document deleted successfully!');
    } catch (error) {
      console.error('Error deleting agreement:', error);
      alert('Failed to delete document: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  };

  const handleUpdateAgreementStatus = async (agreementId: string, newStatus: SubcontractorAgreement['status']) => {
    if (!opportunity?.id) return;

    try {
      const updatedAgreements = subcontractorAgreements.map(agreement =>
        agreement.id === agreementId ? { ...agreement, status: newStatus } : agreement
      );
      setSubcontractorAgreements(updatedAgreements);

      const { error } = await supabase
        .schema('business')
        .from('subcontractor_agreements')
        .update({ status: newStatus })
        .eq('id', agreementId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating agreement status:', error);
      alert('Failed to update agreement status: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  };

  const handlePreviewFile = (agreement: SubcontractorAgreement) => {
    setPreviewFile(agreement);
    setShowPreviewModal(true);
  };

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toLowerCase() || '';
  };

  const isPreviewable = (fileName: string) => {
    const ext = getFileExtension(fileName);
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'txt'].includes(ext);
  };

  const handleSavePDF = async (editedBlob: Blob) => {
    if (!previewFile || !opportunity?.id) {
      console.error('Missing previewFile or id:', { previewFile, id });
      return;
    }

    console.log('Starting PDF save to storage...', {
      fileName: previewFile.name,
      blobSize: editedBlob.size,
      blobType: editedBlob.type
    });

    try {
      // Generate new filename for the updated version
      const fileExt = previewFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${opportunity.id}/${fileName}`;

      console.log('Uploading to path:', filePath);

      // Upload the modified PDF back to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('job-documents')
        .upload(filePath, editedBlob, { 
          upsert: true,
          contentType: 'application/pdf'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get the new public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-documents')
        .getPublicUrl(filePath);

      console.log('Generated public URL:', publicUrl);

      // Update the agreement with the new file URL
      const updatedAgreements = subcontractorAgreements.map(agreement =>
        agreement.id === previewFile.id 
          ? { ...agreement, file_url: publicUrl, upload_date: new Date().toISOString() }
          : agreement
      );
      setSubcontractorAgreements(updatedAgreements);

      console.log('Updated agreements array:', updatedAgreements);

      // Save to database
      const { error: dbError } = await supabase
        .schema('business')
        .from('subcontractor_agreements')
        .update({ file_url: publicUrl, upload_date: new Date().toISOString() })
        .eq('id', previewFile.id);

      if (dbError) {
        console.error('Database update error:', dbError);
        throw dbError;
      }

      console.log('Database updated successfully');

      // Update the preview file state with the new URL
      const updatedPreviewFile = { ...previewFile, file_url: publicUrl, upload_date: new Date().toISOString() };
      setPreviewFile(updatedPreviewFile);

      console.log('PDF save process completed successfully');
      console.log('Updated preview file URL:', publicUrl);

      // Close and reopen the preview to show the updated PDF
      setShowPreviewModal(false);
      
      // Small delay then reopen with updated file
      setTimeout(() => {
        setPreviewFile(updatedPreviewFile);
        setShowPreviewModal(true);
      }, 500);

      alert('PDF saved successfully! The preview will refresh with the updated version.');
    } catch (error) {
      console.error('Error saving PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to save PDF: ${errorMessage}`);
      throw error;
    }
  };

  async function handleDeleteOpportunity() {
    if (!opportunity || !user) return;
    try {
      const { error } = await supabase
        .schema('business')
        .from('opportunities')
        .delete()
        .eq('id', opportunity.id);
      if (error) throw error;
      alert('Opportunity deleted.');
      navigate('/sales-dashboard/opportunities');
    } catch (err: any) {
      console.error('Error deleting opportunity:', err);
      alert(`Failed to delete: ${err?.message || 'Unknown error'}`);
    } finally {
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!opportunity) {
    return <div>Opportunity not found</div>;
  }

  const customer = customers.find(c => c.id === opportunity.customer_id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-background">
      <div className="bg-white shadow-sm p-4 mb-6 dark:bg-dark-150 dark:border-b dark:border-dark-200">
        <Link to="/sales-dashboard/opportunities" className="text-gray-600 hover:text-gray-900 dark:text-dark-400 dark:hover:text-dark-900 flex items-center">
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Opportunities
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-dark-150 shadow-md rounded-lg overflow-hidden">
          {mergedIds.length > 0 && (
            <div className="px-4 py-3 border-b border-blue-200 bg-blue-50 text-blue-900">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Merged Opportunities: {mergedIds.join(', ')}</div>
                <div className="text-xs">Primary: <span className="font-semibold">{primaryIdParam || opportunity.id}</span></div>
              </div>
              <p className="mt-1 text-xs text-blue-800">Converting to a job will bundle these into a single job (based on primary).</p>
            </div>
          )}
          <div className="flex justify-between items-center p-4 border-b border-gray-300 dark:border-dark-300">
            <div className="flex items-center">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-dark-800">
                {opportunity.quote_number}: {opportunity.title}
              </h2>
            </div>
            <div className="flex space-x-2">
              {!opportunity.job_id && (
                <div className="flex flex-col items-start">
                  <button
                    onClick={() => setConfirmConvertToJobOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                    disabled={mergedIds.length > 0 && !!groupLockJobId}
                  >
                    <Award className="h-4 w-4 mr-1" />
                    {mergedIds.length > 0 && !!groupLockJobId ? 'Locked (already converted)' : 'Convert to Job'}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-white mt-1">
                    {mergedIds.length > 0 && !!groupLockJobId
                      ? `Group locked by Job #${groupLockJobId}. Only one conversion per merged group.`
                      : 'This will create a new job and link it to this opportunity'}
                  </p>
                </div>
              )}
              {mergedIds.length > 0 && !!groupLockJobId && (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/jobs/${groupLockJobId}`}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View Shared Job #{groupLockJobId}
                  </Link>
                </div>
              )}
              {opportunity.job_id && (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium dark:bg-green-900 dark:text-green-200">
                    ✓ Converted to Job
                  </span>
                  <Link
                    to={`/jobs/${opportunity.job_id}`}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View Job
                  </Link>
                </div>
              )}
              {!isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    if (opportunity) {
                      setEditFormData({
                        customer_id: opportunity.customer_id || '',
                        title: opportunity.title || '',
                        description: opportunity.description || '',
                        expected_value: opportunity.expected_value?.toString() || '',
                        status: opportunity.status || '',
                        expected_close_date: opportunity.expected_close_date 
                          ? opportunity.expected_close_date.substring(0, 10)
                          : '',
                        proposal_due_date: opportunity.proposal_due_date 
                          ? opportunity.proposal_due_date.substring(0, 10)
                          : '',
                        sales_person: opportunity.sales_person || '',
                        notes: opportunity.notes || '',
                        probability: opportunity.probability?.toString() || '0',
                        amp_division: opportunity.amp_division || '',
                        quoted_amount: (opportunity as any).quoted_amount?.toString() || '',
                        selected_letter_proposal: (opportunity as any).selected_letter_proposal || '',
                        reviewed_by: (opportunity as any).reviewed_by || '',
                        prepared_by: (opportunity as any).prepared_by || ''
                      });
                    }
                  }}
                  className="px-4 py-2 bg-[#f26722] text-white rounded hover:bg-[#f26722]/90 transition-colors flex items-center"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </button>
              )}
              {!isEditing && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </button>
              )}
            </div>
          </div>

          {(mergedIds.length > 0 || savedMergeIds.length > 1) && mergedList.length > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Merged Opportunities</div>
                <div className="space-x-2">
                  {mergedList.map((m) => {
                    const isPrimary = String(m.id) === ((primaryIdParam || savedPrimaryId) || String(opportunity.id));
                    return (
                      <button
                        key={String(m.id)}
                        onClick={() => {
                          if (id === 'merge') {
                            const params = new URLSearchParams(location.search);
                            params.set('primary', String(m.id));
                            navigate(`/sales-dashboard/opportunities/merge?${params.toString()}`);
                          } else if (savedMergeIds.length > 1) {
                            // Navigate to merge view using saved IDs when in normal view
                            const params = new URLSearchParams();
                            params.set('ids', savedMergeIds.join(','));
                            params.set('primary', String(m.id));
                            navigate(`/sales-dashboard/opportunities/merge?${params.toString()}`);
                          }
                        }}
                        className={`text-xs px-3 py-1 rounded ${isPrimary ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-dark-150 text-gray-700 dark:text-gray-200'}`}
                      >
                        {m.quote_number}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {mergedList.map((m) => {
                  const isPrimary = String(m.id) === (primaryIdParam || String(opportunity.id));
                  return (
                    <div key={String(m.id)} className={`border rounded-md p-3 bg-white dark:bg-dark-150 ${isPrimary ? 'ring-2 ring-blue-400' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{m.quote_number}</div>
                        {isPrimary ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Primary</span>
                        ) : (
                          <button
                            onClick={() => {
                              const params = new URLSearchParams(location.search);
                              params.set('primary', String(m.id));
                              navigate(`/sales-dashboard/opportunities/merge?${params.toString()}`);
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Make Primary
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-white mb-2">{m.customers?.company_name || m.customers?.name || 'Unknown Customer'}</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{m.title}</div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-gray-600 dark:text-white">
                        <div>
                          <span className="text-gray-500 dark:text-white">Status:</span> {m.status}
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-white">Due:</span> {m.expected_close_date ? formatDateSafe(m.expected_close_date) : '-'}
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-white">Value:</span> {m.expected_value ? `$${m.expected_value.toLocaleString()}` : '-'}
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-white">Probability:</span> {m.probability != null ? `${m.probability}%` : '-'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Success Message */}
          {showSuccessMessage && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4 mb-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    {showSuccessMessage}
                  </p>
                  {jobId && (
                    <div className="mt-2">
                      <Link
                        to={`/jobs/${jobId}`}
                        className="text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 underline"
                      >
                        View Job #{jobId} →
                      </Link>
                    </div>
                  )}
                </div>
                <div className="ml-auto pl-3">
                  <button
                    type="button"
                    className="inline-flex text-green-400 hover:text-green-600 dark:text-green-300 dark:hover:text-green-100"
                    onClick={() => setShowSuccessMessage(null)}
                  >
                    <span className="sr-only">Dismiss</span>
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="p-6">
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label htmlFor="customer_id" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Customer
                  </label>
                  <select
                    id="customer_id"
                    name="customer_id"
                    value={editFormData.customer_id}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  >
                    <option value="" className="dark:bg-dark-150 dark:text-white">Select a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id} className="dark:bg-dark-150 dark:text-white">
                        {customer.company_name || customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={editFormData.title}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={editFormData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="expected_value" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Expected Value ($)
                    </label>
                    <input
                      type="number"
                      id="expected_value"
                      name="expected_value"
                      value={editFormData.expected_value}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="probability" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Probability (%)
                    </label>
                    <input
                      type="number"
                      id="probability"
                      name="probability"
                      value={editFormData.probability}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={editFormData.status}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    >
                      <option value="awareness" className="dark:bg-dark-150 dark:text-white">Awareness</option>
                      <option value="interest" className="dark:bg-dark-150 dark:text-white">Interest</option>
                      <option value="quote" className="dark:bg-dark-150 dark:text-white">Quote</option>
                      <option value="decision" className="dark:bg-dark-150 dark:text-white">Decision</option>
                      <option value="decision - forecasted win" className="dark:bg-dark-150 dark:text-white">Decision - Forecasted Win</option>
                      <option value="decision - forecast lose" className="dark:bg-dark-150 dark:text-white">Decision - Forecast Lose</option>
                      <option value="awarded" className="dark:bg-dark-150 dark:text-white">Awarded</option>
                      <option value="lost" className="dark:bg-dark-150 dark:text-white">Lost</option>
                      <option value="no quote" className="dark:bg-dark-150 dark:text-white">No Quote</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="expected_close_date" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Expected Close Date
                    </label>
                    <input
                      type="date"
                      id="expected_close_date"
                      name="expected_close_date"
                      value={editFormData.expected_close_date}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="proposal_due_date" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Proposal Due Date
                    </label>
                    <input
                      type="date"
                      id="proposal_due_date"
                      name="proposal_due_date"
                      value={editFormData.proposal_due_date || ''}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="amp_division" className="block text-sm font-medium text-gray-700 dark:text-white">
                    AMP Division
                  </label>
                  <select
                    id="amp_division"
                    name="amp_division"
                    value={editFormData.amp_division}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  >
                    <option value="" className="dark:bg-dark-150 dark:text-white">Select a division</option>
                    <option value="north_alabama" className="dark:bg-dark-150 dark:text-white">North Alabama Division</option>
                    <option value="tennessee" className="dark:bg-dark-150 dark:text-white">Tennessee Division</option>
                    <option value="georgia" className="dark:bg-dark-150 dark:text-white">Georgia Division</option>
                    <option value="international" className="dark:bg-dark-150 dark:text-white">International Division</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="quoted_amount" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Quoted Amount (NET 30) ($)
                  </label>
                  <input
                    type="number"
                    id="quoted_amount"
                    name="quoted_amount"
                    value={editFormData.quoted_amount}
                    onChange={handleInputChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    placeholder="Enter NET 30 price"
                  />
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={editFormData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reviewed_by" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Reviewed By
                    </label>
                    <input
                      type="text"
                      id="reviewed_by"
                      name="reviewed_by"
                      value={editFormData.reviewed_by}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                      placeholder="Enter reviewer name"
                    />
                  </div>

                  <div>
                    <label htmlFor="prepared_by" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Prepared By (Auto-populated from estimate creators)
                    </label>
                    <input
                      type="text"
                      id="prepared_by"
                      name="prepared_by"
                      value={editFormData.prepared_by}
                      onChange={handleInputChange}
                      readOnly
                      className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 dark:text-white cursor-not-allowed"
                      placeholder="Auto-populated from estimate creators"
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#f26722] border border-transparent rounded-md shadow-sm hover:bg-[#f26722]/90 focus:outline-none"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-dark-900 mb-3">Opportunity Details</h3>
                  <div className="bg-white dark:bg-dark-150 shadow-sm rounded-md border border-gray-200 dark:border-dark-300 p-4">
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Quote Number</p>
                      <p className="text-gray-900 dark:text-dark-900">{opportunity.quote_number}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Customer</p>
                      <p className="text-gray-900 dark:text-dark-900">{customer?.company_name || customer?.name}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Contact</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {(() => {
                          const c = contacts.find(c => c.id === (opportunity as any).contact_id);
                          return c ? (
                            <span>{c.name} {c.email ? `• ${c.email}` : ''}</span>
                          ) : 'No contact linked';
                        })()}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Title</p>
                      <p className="text-gray-900 dark:text-dark-900">{opportunity.title}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Description</p>
                      <p className="text-gray-900 dark:text-dark-900 whitespace-pre-line">{opportunity.description || 'No description'}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Status</p>
                      {isStatusEditing ? (
                        <div className="relative mt-1">
                          <select
                            value={opportunity.status}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            className="block w-full pl-3 pr-10 py-1 text-xs rounded-full appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 border border-gray-200"
                            autoFocus
                            onBlur={() => setIsStatusEditing(false)}
                          >
                            <option value="awareness">Awareness</option>
                            <option value="interest">Interest</option>
                            <option value="quote">Quote</option>
                            <option value="decision">Decision</option>
                            <option value="decision - forecasted win">Decision - Forecasted Win</option>
                            <option value="decision - forecast lose">Decision - Forecast Lose</option>
                            <option value="awarded">Awarded</option>
                            <option value="lost">Lost</option>
                            <option value="no quote">No Quote</option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-gray-500" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsStatusEditing(true)}
                          className="mt-1"
                        >
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(opportunity.status)}`}>
                            {formatStatus(opportunity.status)}
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </span>
                        </button>
                      )}
                      {opportunity.status !== 'awarded' && opportunity.status !== 'lost' && !opportunity.job_id && (
                        <p className="text-xs text-gray-500 dark:text-white mt-1">
                          Change status above or use "Convert to Job" button to create a job
                        </p>
                      )}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">AMP Division</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {opportunity.amp_division ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (opportunity.amp_division) {
                                setSelectedDivision(opportunity.amp_division);
                                setShowDivisionAnalytics(true);
                              }
                            }}
                            className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                          >
                            {formatDivisionName(opportunity.amp_division)}
                          </button>
                        ) : 'Not specified'}
                      </p>
                    </div>
                    {opportunity.job_id && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 dark:text-dark-400">Job Status</p>
                        <div className="flex items-center gap-2">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Converted to Job
                          </span>
                          <Link
                            to={`/jobs/${opportunity.job_id}`}
                            className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90 text-sm"
                          >
                            View Job #{opportunity.job_id}
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-dark-900 mb-3">Financial & Timeline</h3>
                  <div className="bg-white dark:bg-dark-150 shadow-sm rounded-md border border-gray-200 dark:border-dark-300 p-4">
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Expected Value</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {opportunity.expected_value
                          ? `$${opportunity.expected_value.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : 'Not specified'}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Probability</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {opportunity.probability !== null && opportunity.probability !== undefined
                          ? `${opportunity.probability}%`
                          : 'Not specified'}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Quoted Amount (NET 30)</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {letterProposals.length > 0 
                          ? (() => {
                              const letter = letterProposals[0] as any;
                              let price = 0;
                              
                              // Try to extract NET 30 price from HTML content
                              if (letter.html) {
                                const htmlContent = letter.html;
                                // Look for "Option 1: Where NET 30 Terms are applicable" pattern
                                const net30Match = htmlContent.match(/Option\s*1:\s*Where\s*NET\s*30\s*Terms\s*are\s*applicable[^$]*\$([0-9,]+(?:\.[0-9]{2})?)/i);
                                if (net30Match) {
                                  const priceString = net30Match[1].replace(/,/g, '');
                                  price = parseFloat(priceString);
                                }
                              }
                              
                              // Fallback to other price fields if NET 30 not found
                              if (!price) {
                                price = letter.net_30_price || letter.total || letter.amount || 0;
                              }
                              
                              const letterNum = letter.letter_number || letter.quote_number || `Letter ${letter.id?.slice(0, 8)}`;
                              return price > 0 
                                ? `$${price.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })} (from ${letterNum})`
                                : `NET 30 price not found in ${letterNum} - Debug: ${letter.html ? 'HTML content exists' : 'No HTML content'}`;
                            })()
                          : (() => {
                              // Only show quoted_amount - no fallback to expected_value
                              const quotedAmount = opportunity.quoted_amount;
                              
                              if (quotedAmount && Number(quotedAmount) > 0) {
                                return `$${Number(quotedAmount).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} (quoted amount)`;
                              } else {
                                return 'No quoted amount';
                              }
                            })()}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Expected Close Date</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {opportunity.expected_close_date
                          ? formatDateSafe(opportunity.expected_close_date)
                          : 'Not specified'}
                      </p>
                    </div>
                    {opportunity.proposal_due_date && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 dark:text-dark-400">Proposal Due Date</p>
                        <p className="text-gray-900 dark:text-dark-900">
                          {formatDateSafe(opportunity.proposal_due_date)}
                        </p>
                      </div>
                    )}
                    {opportunity.awarded_date && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 dark:text-dark-400">Awarded Date</p>
                        <p className="text-gray-900 dark:text-dark-900">
                          {formatDateSafe(opportunity.awarded_date)}
                        </p>
                      </div>
                    )}
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Proposal Due Date</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {opportunity.proposal_due_date
                          ? formatDateSafe(opportunity.proposal_due_date)
                          : 'Not specified'}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Reviewed By</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {(opportunity as any).reviewed_by || 'Not specified'}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Prepared By</p>
                      <p className="text-gray-900 dark:text-dark-900">
                        {(opportunity as any).prepared_by || 'Not specified'}
                      </p>
                    </div>

                    {/* Documents Section */}
                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-sm text-gray-500 dark:text-dark-400">Documents</p>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            id="subcontractor-file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            onChange={handleFileUpload}
                            disabled={uploadingFile}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('subcontractor-file')?.click()}
                            disabled={uploadingFile}
                            className="text-[#f26722] border-[#f26722] hover:bg-[#f26722] hover:text-white"
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            {uploadingFile ? 'Uploading...' : 'Upload'}
                          </Button>
                        </div>
                      </div>
                      
                      {subcontractorAgreements.length > 0 ? (
                        <div className="space-y-2">
                          {subcontractorAgreements.map((agreement) => (
                            <div key={agreement.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-dark-150 rounded-md">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-gray-500" />
                                <div className="flex-1">
                                  <button
                                    onClick={() => handlePreviewFile(agreement)}
                                    className="text-sm font-medium text-[#f26722] hover:text-[#f26722]/90 hover:underline text-left"
                                  >
                                    {agreement.name}
                                  </button>
                                  <p className="text-xs text-gray-500 dark:text-white">
                                    {formatDateSafe(agreement.upload_date)} • 
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                                      agreement.status === 'signed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                      agreement.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                      agreement.status === 'expired' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                      'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-white'
                                    }`}>
                                      {agreement.status}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <select
                                  value={agreement.status}
                                  onChange={(e) => handleUpdateAgreementStatus(agreement.id, e.target.value as SubcontractorAgreement['status'])}
                                  className="text-xs p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-900 dark:text-white"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="signed">Signed</option>
                                  <option value="expired">Expired</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePreviewFile(agreement)}
                                  className="p-1 h-6 w-6 text-blue-500 hover:bg-blue-500 hover:text-white"
                                  title="Preview"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = agreement.file_url;
                                    link.download = agreement.name;
                                    link.target = '_blank';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  className="p-1 h-6 w-6 text-[#f26722] hover:bg-[#f26722] hover:text-white"
                                  title="Download"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAgreement(agreement.id)}
                                  className="p-1 h-6 w-6 text-red-500 hover:bg-red-500 hover:text-white"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-white italic">
                          No documents uploaded yet.
                        </p>
                      )}
                    </div>
                    
                    {jobId && (
                      <div className="mt-6">
                        <Button 
                          variant="outline"
                          className="bg-[#f26722] text-white hover:bg-[#f26722]/90"
                          onClick={() => setShowJobDialog(true)}
                        >
                          View Associated Job
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {opportunity.notes && (
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-dark-900 mb-3">Notes</h3>
                    <div className="bg-white dark:bg-dark-150 p-4 rounded-md">
                      <p className="text-gray-900 dark:text-dark-900 whitespace-pre-line">{opportunity.notes}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Estimate Sheet section */}
              <div className="mt-8">
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-900 mb-3">Estimate</h3>
                <div className="bg-white dark:bg-dark-150 p-4 rounded-md text-center">
                  {/* Always show the action buttons horizontally */}
                  <div className="flex flex-row justify-center gap-4 mb-4">
                    <button
                      onClick={() => {
                        setShowEstimate('new');
                        setEstimateOpenSignal((s) => s + 1);
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Generate Estimate
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate('view');
                        setEstimateOpenSignal((s) => s + 1);
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Show Estimates
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate('letters');
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Show Letter Proposals
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate('letter');
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Generate Letter Proposal
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate('combined-letter');
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Generate Combined Letter Proposal
                    </button>
                  </div>
                  {/* Show EstimateSheet only if an action is selected */}
                  {showEstimate !== false && (
                    <EstimateSheet opportunityId={id || ''} mode={showEstimate} openSignal={estimateOpenSignal} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Convert to Job Confirmation Dialog */}
          <Dialog
            open={confirmConvertToJobOpen}
            onClose={() => setConfirmConvertToJobOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500 dark:text-white dark:hover:text-gray-200"
                    onClick={() => setConfirmConvertToJobOpen(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>
                
                <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Convert Opportunity to Job
                </Dialog.Title>
                
                <p className="text-gray-700 dark:text-white mb-4">
                  Are you sure you want to create a job from this opportunity? This action will:
                </p>
                
                <ul className="text-sm text-gray-600 dark:text-white mb-4 space-y-1">
                  <li>• Create a new job record in the system</li>
                  <li>• Link the opportunity to the new job</li>
                  <li>• Keep the opportunity status unchanged</li>
                </ul>
                
                <p className="text-gray-700 dark:text-white mb-4">
                  The opportunity will remain in its current status. You can change the status separately if needed.
                </p>

                <div className="mt-5 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                    onClick={() => setConfirmConvertToJobOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#f26722] border border-transparent rounded-md shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                    onClick={handleConvertToJob}
                  >
                    Convert to Job
                  </button>
                </div>
              </div>
            </div>
          </Dialog>

          {/* Job Details Dialog */}
          <Dialog
            open={showJobDialog}
            onClose={() => setShowJobDialog(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-4xl w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500"
                    onClick={() => setShowJobDialog(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>
                
                <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-dark-900 mb-4">
                  Job Details
                </Dialog.Title>
                
                {jobDetails ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Job Title</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{jobDetails.title}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Job Number</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{jobDetails.job_number}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Status</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">{jobDetails.status}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Customer</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {jobDetails.customer?.company_name || jobDetails.customer?.name || 'No customer assigned'}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Start Date</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {jobDetails.start_date ? formatDateSafe(jobDetails.start_date) : 'Not set'}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Due Date</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {jobDetails.due_date ? formatDateSafe(jobDetails.due_date) : 'Not set'}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Budget</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        ${jobDetails.budget?.toLocaleString() || '0'}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-white">Division</h3>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {formatDivisionName(jobDetails.division || '')}
                      </p>
                    </div>

                    {jobDetails.description && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-white">Description</h3>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                          {jobDetails.description}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-500 dark:text-white">Loading job details...</p>
                  </div>
                )}
              </div>
            </div>
          </Dialog>

          {/* Division Analytics Dialog */}
          {selectedDivision && (
            <DivisionAnalyticsDialog
              division={selectedDivision}
              isOpen={showDivisionAnalytics}
              onClose={() => {
                setShowDivisionAnalytics(false);
                setSelectedDivision(null);
              }}
            />
          )}

          {/* File Preview Modal */}
          <Dialog
            open={showPreviewModal}
            onClose={() => setShowPreviewModal(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen px-4">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />
              
              <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-4xl w-full mx-auto shadow-xl max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-500" />
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                        {previewFile?.name}
                      </Dialog.Title>
                      <p className="text-sm text-gray-500 dark:text-white">
                        {previewFile && formatDateSafe(previewFile.upload_date)} • 
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          previewFile?.status === 'signed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                          previewFile?.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                          previewFile?.status === 'expired' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-white'
                        }`}>
                          {previewFile?.status}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewFile && window.open(previewFile.file_url, '_blank')}
                      className="text-[#f26722] border-[#f26722] hover:bg-[#f26722] hover:text-white"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open in New Tab
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreviewModal(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="flex-1 p-4 overflow-hidden">
                  {previewFile && (
                    <div className="h-full">
                      {getFileExtension(previewFile.name) === 'pdf' ? (
                        <PDFEditor
                          fileUrl={previewFile.file_url}
                          fileName={previewFile.name}
                          onSave={handleSavePDF}
                          onClose={() => setShowPreviewModal(false)}
                        />
                      ) : ['jpg', 'jpeg', 'png', 'gif'].includes(getFileExtension(previewFile.name)) ? (
                        <div className="flex items-center justify-center h-full">
                          <img
                            src={previewFile.file_url}
                            alt={previewFile.name}
                            className="max-w-full max-h-full object-contain rounded"
                          />
                        </div>
                      ) : getFileExtension(previewFile.name) === 'txt' ? (
                        <div className="h-full">
                          <iframe
                            src={previewFile.file_url}
                            className="w-full h-full min-h-[600px] border border-gray-200 dark:border-gray-700 rounded bg-white"
                            title={previewFile.name}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <FileText className="h-16 w-16 text-gray-400 mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                            Preview not available
                          </h3>
                          <p className="text-gray-500 dark:text-white mb-4">
                            This file type cannot be previewed in the browser.
                          </p>
                          <Button
                            onClick={() => previewFile && window.open(previewFile.file_url, '_blank')}
                            className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download File
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Dialog>

          {/* Delete Opportunity Confirmation Dialog */}
          <Dialog
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500 dark:text-white dark:hover:text-gray-200"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Delete Opportunity
                </Dialog.Title>
                <p className="text-sm text-gray-600 dark:text-white mb-6">Are you sure you want to delete this opportunity? This action cannot be undone.</p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    onClick={handleDeleteOpportunity}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

function formatDivisionName(division: string): string {
  const divisionMap: { [key: string]: string } = {
    'north_alabama': 'North Alabama Division',
    'tennessee': 'Tennessee Division',
    'georgia': 'Georgia Division',
    'international': 'International Division'
  };
  return divisionMap[division] || division;
} 