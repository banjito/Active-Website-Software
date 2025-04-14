import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, MapPin } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { format } from 'date-fns';
import { supabase, isConnectionError } from '@/lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useDivision } from '../../App';

interface Job {
  id: string;
  customer_id: string;
  title: string;
  status: string;
  start_date: string;
  due_date: string;
  budget: number;
  amount_paid: number;
  priority: string;
  job_number: string;
  division?: string;
  customers?: {
    id: string;
    name: string;
    company_name: string;
  };
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
}

const initialFormData: JobFormData = {
  customer_id: '',
  title: '',
  description: '',
  status: 'pending',
  start_date: '',
  due_date: '',
  budget: '',
  priority: 'medium',
};

export default function JobList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { division: contextDivision } = useDivision();
  const { division: urlDivision } = useParams();
  const [searchParams] = useSearchParams();
  
  // Use division from URL params first, then context, then search params
  const division = urlDivision || contextDivision || searchParams.get('division');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchCustomers();
    }
  }, [user, division]);

  async function fetchJobs() {
    setLoading(true);
    try {
      console.log('Fetching jobs for division:', division);
      let jobQuery = supabase
        .schema('neta_ops')
        .from('jobs')
        .select('*') // Select all job fields, but not the customer relationship directly here
        .order('created_at', { ascending: false });

      if (division) {
        jobQuery = jobQuery.eq('division', division);
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
        return; // No jobs found
      }

      // Now fetch customer data for each job
      const jobsWithCustomers = await Promise.all(jobData.map(async (job) => {
        if (!job.customer_id) {
          return { ...job, customers: null }; // Use `customers` key to match existing interface
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

      setJobs(jobsWithCustomers);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    try {
      // Create a new object with processed data
      const jobData = {
        ...formData,
        budget: formData.budget ? parseFloat(formData.budget) : null,
        amount_paid: 0,
        user_id: user.id,
        division: division,
        // Only include dates if they're not empty
        start_date: formData.start_date || null,
        due_date: formData.due_date || null
      };

      const { error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .insert([jobData]);

      if (error) throw error;

      setIsOpen(false);
      setFormData(initialFormData);
      fetchJobs();
    } catch (error) {
      console.error('Error creating job:', error);
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

  async function handleDelete() {
    if (!jobToDelete || !user) return;

    try {
      // First, find and update any opportunities that reference this job
      const { error: opportunityUpdateError } = await supabase
        .schema('business')
        .from('opportunities')
        .update({ job_id: null })
        .eq('job_id', jobToDelete);

      if (opportunityUpdateError) {
        console.error('Error updating opportunity references:', opportunityUpdateError);
        throw opportunityUpdateError;
      }

      // Now delete the job itself
      const { error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .delete()
        .eq('id', jobToDelete);

      if (error) throw error;

      // Refresh the jobs list
      fetchJobs();
      // Close the dialog
      setDeleteConfirmOpen(false);
      setJobToDelete(null);
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Error deleting job. Please try again.');
    }
  }

  function confirmDelete(jobId: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent row click event
    setJobToDelete(jobId);
    setDeleteConfirmOpen(true);
  }

  // Helper function to format division names for display
  function formatDivisionName(divisionValue: string | null): string {
    if (!divisionValue) return '';
    
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
    return <div className="text-gray-900 dark:text-gray-100">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Jobs {formatDivisionName(division)}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-white">
            A list of all the jobs in the selected division.
          </p>
        </div>
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
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-dark-150">
              {jobs.map((job) => (
                <tr 
                  key={job.id} 
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ease-in-out cursor-pointer"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-200 sm:pl-6">
                    {job.job_number || 'Pending'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {job.title}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {job.customers?.company_name || job.customers?.name || 'No customer'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {job.due_date ? format(new Date(job.due_date), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    ${job.budget?.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {formatDivisionName(job.division || null)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      job.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                      job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400' :
                      'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                    }`}>
                      {job.priority}
                    </span>
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                      onClick={(e) => confirmDelete(job.id, e)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        className="fixed inset-0 z-10 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-dark-900 mb-4">
              Delete Job
            </Dialog.Title>
            
            <p className="text-gray-700 dark:text-dark-300 mb-4">
              Are you sure you want to delete this job? This action cannot be undone.
            </p>

            <div className="mt-5 flex justify-end space-x-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-300 bg-white dark:bg-dark-100 border border-gray-300 dark:border-dark-300 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}