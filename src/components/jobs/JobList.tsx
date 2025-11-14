import React, { useEffect, useState } from 'react';
import { Plus, Pencil, X, MapPin } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { format } from 'date-fns';
import { supabase, isConnectionError } from '@/lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import { useDivision } from '../../App';
import { JobNotifications } from './JobNotifications';
import { Database } from '@/types/supabase'; // Assuming this is the correct path to your generated types
import { addDefaultFilesToJob } from '../../lib/services/defaultJobFiles';

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  customer_id?: string;
}

interface TMFormData {
  customer_id: string;
  contact_id: string;
  title: string;
  description: string;
  division: string;
}

// Helper function to determine if the division is lab-related
const isLabDivision = (div: string | null | undefined): boolean => {
  if (!div) return false;
  const lowerDiv = div.toLowerCase();
  return ['calibration', 'armadillo', 'lab'].includes(lowerDiv);
};

interface Job {
  id: string;
  customer_id: string | null; 
  title: string;
  status: string;
  start_date: string | null; 
  due_date: string | null; 
  budget: number | null; 
  amount_paid?: number | null; 
  priority: string;
  job_number: string | null; 
  division?: string | null;
  description?: string | null;
  user_id?: string | null;
  notes?: string | null;
  job_type?: string | null;
  portal_type?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null; // Soft delete timestamp
  submittal_job_type?: 'standard' | 'data_center' | null;
  submittal_window_hours?: number | null;
  customers?: { 
    id: string;
    name: string;
    company_name: string;
  } | null; 
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface JobFormData {
  customer_id: string; 
  title: string;
  description: string;
  status: string;
  start_date: string;
  due_date: string;
  budget: string; 
  priority: string;
  notes?: string;
  job_number?: string; 
}

type StatusFilter = 'all' | 'in_progress' | 'pending' | 'completed' | 'billed';

const initialFormData: JobFormData = {
  customer_id: '',
  title: '',
  description: '',
  status: 'pending',
  start_date: '',
  due_date: '',
  budget: '',
  priority: 'medium',
  notes: '',
  job_number: '',
};

export default function JobList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { division: contextDivision } = useDivision();
  const { division: urlDivision } = useParams();
  const [searchParams] = useSearchParams();
  
  const division = urlDivision || contextDivision || searchParams.get('division');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showTMModal, setShowTMModal] = useState(false);
  const [TMFormData, setTMFormData] = useState<TMFormData>({
    customer_id: '',
    contact_id: '',
    title: '',
    description: '',
    division: ''
  });
  const [isCreatingTM, setIsCreatingTM] = useState(false);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    console.log('JobList useEffect - TRIGGERED', { 
      pathname: location.pathname, 
      division, 
      user: user?.id,
      timestamp: new Date().toISOString()
    });
    if (user) {
      fetchJobs();
      fetchCustomers();
    }
  }, [user, division, location.pathname]);

  useEffect(() => {
    let base = jobs;
    if (statusFilter !== 'all') {
      if (statusFilter === 'completed') {
        base = base.filter(j => {
          const s = (j.status || '').toLowerCase();
          return s === 'completed' || s === 'ready_to_bill' || s === 'ready to bill';
        });
      } else if (statusFilter === 'billed') {
        base = base.filter(j => (j.status || '').toLowerCase() === 'billed');
      } else {
        base = base.filter(j => (j.status || '').toLowerCase() === statusFilter);
      }
    }

    if (searchTerm.trim() === '') {
      setFilteredJobs(base);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const filtered = base.filter(job => {
      return (
        job.title?.toLowerCase().includes(searchLower) ||
        job.customers?.company_name?.toLowerCase().includes(searchLower) ||
        job.customers?.name?.toLowerCase().includes(searchLower) ||
        job.job_number?.toLowerCase().includes(searchLower) ||
        (job.status || '').toLowerCase().includes(searchLower) ||
        job.description?.toLowerCase().includes(searchLower)
      );
    });
    setFilteredJobs(filtered);
  }, [searchTerm, statusFilter, jobs]);

  async function fetchJobs() {
    setLoading(true);
    try {
      console.log('Fetching jobs for division:', division);
      const currentSchema = isLabDivision(division) ? 'lab_ops' : 'neta_ops';
      const currentTable = isLabDivision(division) ? 'lab_jobs' : 'jobs';

      console.log(`Using schema: ${currentSchema}, table: ${currentTable}`);

      let jobQuery = supabase
        .schema(currentSchema)
        .from(currentTable)
        .select('*') 
        .is('deleted_at', null) // Only fetch non-deleted jobs
        .order('created_at', { ascending: false });

      if (division) {
        if (division === 'field_tech' || division === 'field-tech') {
          jobQuery = jobQuery.in('division', ['north_alabama', 'tennessee', 'georgia', 'international']);
        } else {
          jobQuery = jobQuery.eq('division', division);
        }
      }

      const { data: jobData, error: jobError } = await jobQuery;

      if (jobError) {
        console.error('Error fetching base job data:', jobError);
        if (isConnectionError(jobError)) {
          throw new Error('Unable to connect to the database. Please check your connection.');
        }
        throw jobError;
      }

      if (!jobData) {
        setJobs([]);
        return; 
      }

      const jobsWithCustomers = await Promise.all(jobData.map(async (job) => {
        if (!job.customer_id) {
          return { ...job, customers: null }; 
        }
        
        try {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('id, name, company_name')
            .eq('id', job.customer_id)
            .single();

          if (customerError) {
            console.warn(`Error fetching customer for job ${job.id}:`, customerError);
            return { ...job, customers: null };
          }
          
          return { ...job, customers: customerData };
        } catch (err) {
           console.warn(`Error processing customer for job ${job.id}:`, err);
           return { ...job, customers: null };
        }
      }));

      setJobs(jobsWithCustomers as Job[]); // Cast to Job[]
      setFilteredJobs(jobsWithCustomers as Job[]); // Initialize filtered jobs

    } catch (error) {
      console.error('Error in fetchJobs function:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCustomers() {
    try {
      console.log('Fetching customers');
      const { data, error } = await supabase
        .schema('common')
        .from('customers')
        .select('id, name, company_name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching customers:', error);
        if (isConnectionError(error)) {
          throw new Error('Unable to connect to the database. Please check your connection.');
        }
        throw error;
      }

      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  }

  async function fetchContacts(customerId: string) {
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('contacts')
        .select('id, first_name, last_name, customer_id')
        .eq('customer_id', customerId)
        .order('first_name');

      if (error) throw error;
      setContacts(data || []);
      setTMFormData(prev => ({ ...prev, contact_id: '' }));
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  }

  useEffect(() => {
    if (customers.length > 0) {
      const filtered = customers.filter(customer => {
        const searchTerm = customerSearch.toLowerCase();
        return (
          customer.name.toLowerCase().includes(searchTerm) ||
          customer.company_name.toLowerCase().includes(searchTerm)
        );
      });
      setFilteredCustomers(filtered);
    } else {
      setFilteredCustomers([]);
    }
  }, [customerSearch, customers]);

  useEffect(() => {
    if (TMFormData.customer_id) {
      fetchContacts(TMFormData.customer_id);
    }
  }, [TMFormData.customer_id]);

  function handleTMChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setTMFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleTMSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!user?.id) {
      alert('User not authenticated');
      return;
    }

    const fieldTechDivisions = ['north_alabama', 'tennessee', 'georgia', 'international'];
    const activeDivision = fieldTechDivisions.includes(division || '') ? division : TMFormData.division;

    if (!TMFormData.customer_id || !TMFormData.title || !activeDivision) {
      alert('Please fill in all required fields (Customer, Title, Division)');
      return;
    }

    setIsCreatingTM(true);

    try {
      // Get the next quote number for the opportunity
      const { data: recent } = await supabase
        .schema('business')
        .from('opportunities')
        .select('quote_number')
        .order('created_at', { ascending: false })
        .limit(500);

      const nums: number[] = (recent || [])
        .map(r => (r as any)?.quote_number)
        .filter((q: any) => typeof q === 'string' && /^[0-9]+$/.test(q))
        .map((q: string) => parseInt(q, 10))
        .filter(n => Number.isFinite(n));

      const maxNumeric = nums.length ? Math.max(...nums) : 0;
      const base = 3802;
      const nextQuoteNumber = Math.max(maxNumeric, base) + 1;

      // Get the next job number (numeric)
      let nextJobNumberNumeric = 0;
      try {
        const { data: fnResult } = await supabase.rpc('get_max_job_number');
        const maxNum = (Array.isArray(fnResult) ? (fnResult[0] as any) : fnResult) as any;
        const value = typeof maxNum === 'number' ? maxNum : (maxNum as any)?.get_max_job_number;
        nextJobNumberNumeric = (typeof value === 'number' && Number.isFinite(value)) ? value + 1 : 0;
      } catch {}
      if (!nextJobNumberNumeric) {
        try {
          const { data: jobsScan } = await supabase
            .schema('neta_ops')
            .from('jobs')
            .select('job_number')
            .order('created_at', { ascending: false })
            .limit(500);
          const jobNums = (jobsScan || [])
            .map((j: any) => j?.job_number)
            .filter((s: any) => typeof s === 'string')
            .map((s: string) => {
              if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
              const digits = s.replace(/\D/g, '');
              return digits ? parseInt(digits, 10) : 0;
            })
            .filter((n: number) => Number.isFinite(n));
          const maxLocal = jobNums.length ? Math.max(...jobNums) : 0;
          nextJobNumberNumeric = maxLocal + 1;
        } catch {}
      }
      const nextJobNumberStr = String(nextJobNumberNumeric);

      // Create the opportunity first
      const opportunityData = {
        customer_id: TMFormData.customer_id,
        contact_id: TMFormData.contact_id || null,
        title: TMFormData.title,
        description: TMFormData.description || '',
        status: 'awarded',
        expected_value: 0,
        probability: 100,
        notes: 'Created from T&M form',
        amp_division: activeDivision,
        sales_person: user.email,
        user_id: user.id,
        quote_number: String(nextQuoteNumber),
        reviewed_by: null,
        prepared_by: null
      };

      const { data: newOpportunity, error: opportunityError } = await supabase
        .schema('business')
        .from('opportunities')
        .insert(opportunityData)
        .select()
        .single();

      if (opportunityError) {
        throw opportunityError;
      }

      // Create the job
      const { data: newJob, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .insert({
          user_id: user.id,
          customer_id: TMFormData.customer_id,
          title: TMFormData.title,
          description: TMFormData.description || '',
          status: 'pending',
          start_date: new Date().toISOString().substring(0, 10),
          budget: null,
          notes: 'Created from T&M opportunity',
          priority: 'medium',
          division: activeDivision,
          job_number: nextJobNumberStr,
          opportunity_id: newOpportunity.id
        })
        .select()
        .single();

      if (jobError) {
        throw jobError;
      }

      // Link the opportunity to the job
      try {
        await supabase
          .schema('business')
          .from('opportunities')
          .update({ job_id: newJob.id })
          .eq('id', newOpportunity.id);
      } catch (linkError) {
        console.warn('Could not link opportunity to job:', linkError);
      }

      // Add default files to the newly created job
      try {
        await addDefaultFilesToJob(newJob.id, user.id, activeDivision);
        console.log('Default files added successfully to job:', newJob.id);
      } catch (fileError) {
        console.error('Error adding default files to job:', fileError);
      }

      alert('T&M opportunity and job created successfully!');
      setShowTMModal(false);
      setTMFormData({
        customer_id: '',
        contact_id: '',
        title: '',
        description: '',
        division: ''
      });

      // Refresh jobs list and navigate to the new job
      fetchJobs();
      navigate(`/jobs/${newJob.id}`);

    } catch (error: any) {
      console.error('Error creating T&M opportunity and job:', error);
      alert(`Error creating T&M opportunity and job: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsCreatingTM(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    let payloadToLog: any = null; // For logging

    try {
      const currentSchema = isLabDivision(division) ? 'lab_ops' : 'neta_ops';
      const currentTable = isLabDivision(division) ? 'lab_jobs' : 'jobs';
      const activeDivision = division;

      console.log(`Saving job to schema: ${currentSchema}, table: ${currentTable} for division: ${activeDivision}`);

      let finalBudget: number | undefined;
      if (formData.budget) {
        const parsedBudget = parseFloat(formData.budget);
        if (!isNaN(parsedBudget)) {
          finalBudget = parsedBudget;
        }
      }
      
      if (activeDivision?.toLowerCase() === 'calibration' || activeDivision?.toLowerCase() === 'armadillo') {
        finalBudget = undefined; 
      }

      let result;
      
      if (currentSchema === 'lab_ops') {
        const labJobData: Database['lab_ops']['Tables']['lab_jobs']['Insert'] = {
          title: formData.title,
          customer_id: formData.customer_id || null, 
          description: formData.description || undefined,
          status: formData.status || 'pending',
          priority: formData.priority || 'medium',
          start_date: formData.start_date || null, 
          due_date: formData.due_date || null,     
          notes: formData.notes || undefined,
          job_number: formData.job_number || null, 
          user_id: user.id,
          division: activeDivision,                
          budget: finalBudget === undefined ? null : finalBudget, 
          portal_type: 'lab',
        };
        payloadToLog = labJobData;

        result = await supabase
          .schema('lab_ops')
          .from('lab_jobs')
          .insert(labJobData)
          .select('id')
          .single();

      } else { // neta_ops
        if (!formData.customer_id) {
            console.error('Customer ID is required for neta_ops jobs.');
            alert('Customer ID is required.');
            return; 
        }

        const netaJobData: Database['neta_ops']['Tables']['jobs']['Insert'] = {
          title: formData.title,
          customer_id: formData.customer_id, // Must be string
          description: formData.description || undefined,
          status: formData.status || 'pending',
          priority: formData.priority || 'medium',
          start_date: formData.start_date || undefined,
          due_date: formData.due_date || undefined,
          notes: formData.notes || undefined,
          job_number: formData.job_number || undefined,
          user_id: user.id,
          division: activeDivision || undefined,
          budget: finalBudget, 
          portal_type: 'neta',
          // amount_paid is intentionally removed as it's not in the Insert type
        };
        payloadToLog = netaJobData;
        
        result = await supabase
          .schema('neta_ops')
          .from('jobs')
          .insert(netaJobData)
          .select('id')
          .single();
      }

      if (result.error) {
        console.error(`Error creating job in ${currentSchema}.${currentTable}:`, result.error);
        console.error('Payload sent for ' + currentSchema + ':', payloadToLog);
        throw result.error;
      }
      
      console.log(`Job created successfully in ${currentSchema}.${currentTable}:`, result.data);

      // Add default files to the newly created job
      try {
        await addDefaultFilesToJob(result.data.id, user.id, activeDivision || undefined);
        console.log('Default files added successfully to job:', result.data.id);
      } catch (fileError) {
        console.error('Error adding default files to job:', fileError);
        // Don't fail the job creation if default files fail
        alert('Job created but some default files could not be added');
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setSearchTerm(''); // Clear search when adding new job
      fetchJobs();
    } catch (error) {
      console.error('Caught error in handleSubmit:', error);
      // Log payloadToLog here as well if an error is caught after payload construction but before/during Supabase call
      if (payloadToLog) {
        console.error('Payload at time of error:', payloadToLog);
      }
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  function getStatusColor(status: string) {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }


  function formatDivisionName(divisionValue: string | null): string {
    if (!divisionValue) return '';
    
    const divisionMap: { [key: string]: string } = {
      'north_alabama': 'North Alabama Division',
      'tennessee': 'Tennessee Division',
      'georgia': 'Georgia Division',
      'international': 'International Division',
      'engineering': 'Engineering',
      'Decatur': 'North Alabama Division (Decatur)',
      'calibration': 'Calibration Lab',
      'armadillo': 'Armadillo Lab',
      'lab': 'Lab Portal'
    };
    
    return divisionMap[divisionValue.toLowerCase()] || divisionValue;
  }

  if (loading) {
    return <div className="text-gray-900 dark:text-gray-100">Loading...</div>;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {division === 'field_tech' ? 'Field Tech Jobs' : `Jobs ${formatDivisionName(division)}`}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-white">
            A list of all the jobs in the selected division.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <JobNotifications />
          
          {/* T&M button for Field Tech divisions - only visible to authorized users */}
          {(division === 'field_tech' || division === 'field-tech' || division === 'north_alabama' || division === 'tennessee' || division === 'georgia' || division === 'international') &&
           (user?.email === 'william.sasser@ampqes.com' || user?.email === 'john.chambers@ampqes.com' || user?.email === 'anthony.masters@ampqes.com') && (
            <button
              type="button"
              onClick={() => {
                setShowTMModal(true);
                setTMFormData({
                  customer_id: '',
                  contact_id: '',
                  title: '',
                  description: '',
                  division: ''
                });
              }}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add T&M or Emergency Job
            </button>
          )}
          
          {(division?.toLowerCase() === 'calibration' || division?.toLowerCase() === 'armadillo') && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center p-2 border border-transparent rounded-md shadow-sm text-white bg-[#f26722] hover:bg-[#d94e00] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722]"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="mt-6">
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden" role="tablist" aria-label="Job status filter">
          {([
            { key: 'all', label: 'All Jobs' },
            { key: 'pending', label: 'Pending' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'completed', label: 'Completed / Ready to Bill' },
            { key: 'billed', label: 'Billed' }
          ] as { key: StatusFilter; label: string }[]).map(t => {
            const active = statusFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={
                  `px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${
                    active
                      ? 'bg-[#f26722] text-white'
                      : 'bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-100'
                  }` + (t.key !== 'billed' ? ' border-r border-gray-200 dark:border-gray-700' : '')
                }
                onClick={() => setStatusFilter(t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Section */}
      <div className="mt-6">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search jobs by title, customer, job number, status, or description..."
            className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-dark-150 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <X className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          )}
        </div>
        {searchTerm && (
          <div className="mt-2 text-sm text-gray-600 dark:text-white">
            Found {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} matching "{searchTerm}"
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="-mx-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:-mx-6 md:mx-0 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50 dark:bg-dark-150">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-200 sm:pl-6">
                  Job #
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Title
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Customer
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Status
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Due Date
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Budget
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Division
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-dark-150">
              {filteredJobs.map((job) => (
                <tr 
                  key={job.id} 
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ease-in-out cursor-pointer"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-200 sm:pl-6">
                    {job.job_number || 'Pending'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-white">
                    {job.title}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-white">
                    {job.customers?.company_name || job.customers?.name || 'No customer'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-white">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-white">
                    {job.due_date ? format(new Date(job.due_date), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-white">
                    ${job.budget?.toLocaleString() ?? 'N/A'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-white">
                    {formatDivisionName(job.division || null)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-white">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      job.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                      job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400' :
                      'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                    }`}>
                      {job.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* Job Creation Form Dialog */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="fixed inset-0 z-10 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-xl w-full mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500"
                onClick={() => setIsOpen(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Create New Job
            </Dialog.Title>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="customer_id" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Customer *
                  </label>
                  <div className="mt-1">
                    <select
                      id="customer_id"
                      name="customer_id"
                      required
                      value={formData.customer_id}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    >
                      <option value="">Select a customer</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.company_name || customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Job Title *
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="title"
                      id="title"
                      required
                      value={formData.title}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Description
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="description"
                      name="description"
                      rows={3}
                      value={formData.description}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Status
                  </label>
                  <div className="mt-1">
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="billed">Billed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Priority
                  </label>
                  <div className="mt-1">
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Start Date
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      name="start_date"
                      id="start_date"
                      value={formData.start_date}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Due Date
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      name="due_date"
                      id="due_date"
                      value={formData.due_date}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                {/* Budget field visibility: always hidden if division is calibration or armadillo */}
                {!(division?.toLowerCase() === 'calibration' || division?.toLowerCase() === 'armadillo') && (
                  <div className="sm:col-span-1">
                    <label htmlFor="budget" className="block text-sm font-medium text-gray-700 dark:text-white">
                      Budget
                    </label>
                    <div className="mt-1">
                      <input
                        type="number"
                        name="budget"
                        id="budget"
                        step="0.01"
                        value={formData.budget}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                      />
                    </div>
                  </div>
                )}

                {/* Optional notes field */}
                 <div className="sm:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Notes
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="notes"
                      name="notes"
                      rows={3}
                      value={formData.notes}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>
                
                {/* Optional Job Number field - if it can be manually entered */}
                {/* <div className="sm:col-span-1">
                  <label htmlFor="job_number" className="block text-sm font-medium text-gray-700 dark:text-white">
                    Job Number (Optional)
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="job_number"
                      id="job_number"
                      value={formData.job_number}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div> */}

              </div>

              <div className="mt-5 flex justify-end space-x-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Create Job
                </button>
              </div>
            </form>
          </div>
        </div>
      </Dialog>

      {/* T&M Modal */}
      <Dialog
        open={showTMModal}
        onClose={() => setShowTMModal(false)}
        className="fixed inset-0 z-10 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-white dark:hover:text-gray-200"
                onClick={() => setShowTMModal(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Add T&M Opportunity
            </Dialog.Title>

            <form onSubmit={handleTMSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Customer *
                </label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers (name or company)"
                  className="mt-1 mb-2 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
                {TMFormData.customer_id && (
                  <div className="text-xs text-gray-600 dark:text-white mb-1">
                    Selected: {(customers.find(c => c.id === TMFormData.customer_id)?.company_name) || (customers.find(c => c.id === TMFormData.customer_id)?.name) || 'Unknown'}
                    <button
                      type="button"
                      className="ml-2 underline text-[#f26722] hover:text-[#f26722]/90"
                      onClick={() => setTMFormData(prev => ({ ...prev, customer_id: '' }))}
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md">
                  {filteredCustomers.slice(0, 20).map((customer) => {
                    const isSelected = TMFormData.customer_id === customer.id;
                    return (
                      <button
                        type="button"
                        key={customer.id}
                        onClick={() => {
                          setTMFormData(prev => ({ ...prev, customer_id: customer.id }));
                          fetchContacts(customer.id);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${
                          isSelected
                            ? 'bg-orange-50 text-gray-900 dark:bg-orange-900/20 dark:text-white'
                            : 'hover:bg-gray-50 dark:hover:bg-dark-200 text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {customer.company_name || customer.name}
                      </button>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-white">No matches</div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Contact
                </label>
                <select
                  name="contact_id"
                  value={TMFormData.contact_id}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  disabled={!TMFormData.customer_id}
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">No Contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id} className="dark:bg-dark-150 dark:text-white">
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={TMFormData.title}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Division *
                </label>
                <select
                  name="division"
                  value={TMFormData.division}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">Select a division</option>
                  <option value="north_alabama" className="dark:bg-dark-150 dark:text-white">North Alabama Division</option>
                  <option value="tennessee" className="dark:bg-dark-150 dark:text-white">Tennessee Division</option>
                  <option value="georgia" className="dark:bg-dark-150 dark:text-white">Georgia Division</option>
                  <option value="international" className="dark:bg-dark-150 dark:text-white">International Division</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Description
                </label>
                <textarea
                  name="description"
                  value={TMFormData.description}
                  onChange={handleTMChange}
                  rows={3}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  placeholder="Optional description"
                />
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                  onClick={() => setShowTMModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTM}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                >
                  {isCreatingTM ? 'Creating...' : 'Create T&M or Emergency Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Dialog>
    </div>
  );
}