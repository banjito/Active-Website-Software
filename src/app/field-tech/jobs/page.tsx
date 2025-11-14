import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import Card from '@/components/ui/Card';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BriefcaseIcon, Plus, X } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { addDefaultFilesToJob } from '@/lib/services/defaultJobFiles';

interface Customer {
  id?: string;
  name?: string;
  company_name?: string;
}

interface JobItem {
  id: string;
  job_number?: string;
  title: string;
  status: string;
  start_date?: string;
  due_date?: string;
  budget?: string;
  customer_id?: string;
  customers?: Customer;
  division?: string;
}

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

const FIELD_TECH_DIVISIONS = ['north_alabama', 'tennessee', 'nashville', 'georgia', 'international'];

export default function FieldTechJobsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showTMModal, setShowTMModal] = useState(false);
  const [TMFormData, setTMFormData] = useState<TMFormData>({
    customer_id: '',
    contact_id: '',
    title: '',
    description: '',
    division: ''
  });
  const [isCreatingTM, setIsCreatingTM] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);

  const fetchJobs = useCallback(async () => {
    try {
      console.log('fetchJobs called - starting query');
      setLoading(true);
      let { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('*')
        .is('deleted_at', null)
        .in('division', FIELD_TECH_DIVISIONS)
        .order('created_at', { ascending: false });

      console.log('fetchJobs - query result:', { count: jobData?.length, error: jobError });
      if (jobError) throw jobError;

      // Fallback: if no jobs returned (division label mismatch), fetch without division filter
      if (!jobData || jobData.length === 0) {
        const fallback = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        if (!fallback.error && fallback.data) {
          jobData = fallback.data;
        }
      }

      if (!jobData) {
        setJobs([]);
        return;
      }

      const jobsWithCustomers = await Promise.all(jobData.map(async (job: any) => {
        if (!job.customer_id) {
          return { ...job, customers: null } as JobItem;
        }
        try {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('id, name, company_name')
            .eq('id', job.customer_id)
            .single();
          if (customerError) {
            return { ...job, customers: null } as JobItem;
          }
          return { ...job, customers: customerData } as JobItem;
        } catch {
          return { ...job, customers: null } as JobItem;
        }
      }));

      console.log('fetchJobs - setting jobs state:', jobsWithCustomers.length);
      setJobs(jobsWithCustomers);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

    if (!TMFormData.customer_id || !TMFormData.title || !TMFormData.division) {
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
        amp_division: TMFormData.division,
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
          division: TMFormData.division,
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
        await addDefaultFilesToJob(newJob.id, user.id, TMFormData.division);
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

  useEffect(() => {
    console.log('FieldTechJobsPage useEffect triggered', { 
      pathname: location.pathname, 
      user: user?.id,
      timestamp: new Date().toISOString() 
    });
    if (!user) return;
    fetchJobs();
    fetchCustomers();
  }, [user, fetchJobs, location.pathname]);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
      <div className="mb-6 sm:mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-dark-900">All Field Tech Jobs</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-dark-400">Aggregated from North Alabama, Tennessee, Georgia, and International</p>
        </div>
        {/* Only show T&M button to authorized users */}
        {(user?.email === 'william.sasser@ampqes.com' || user?.email === 'john.chambers@ampqes.com' || user?.email === 'anthony.masters@ampqes.com') && (
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
      </div>

      {loading ? (
        <div className="text-gray-500">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="text-gray-500">No jobs found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {jobs.map(job => (
            <Link to={`/jobs/${job.id}`} key={job.id}>
              <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#f26722] truncate">{job.title}</p>
                    <p className="text-xs text-gray-600 dark:text-white mt-1 truncate">{job.customers?.company_name || job.customers?.name || 'No customer'}</p>
                    <div className="mt-2 text-xs text-gray-500 dark:text-white">Division: {job.division}</div>
                  </div>
                  <div className="ml-3 flex items-center text-xs text-gray-500 dark:text-white">
                    <BriefcaseIcon className="h-4 w-4 mr-1" />
                    {job.job_number || 'N/A'}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

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


