import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, Briefcase, Mail, Phone, MapPin, Calendar, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { format } from 'date-fns';
import { Dialog } from '@headlessui/react';

interface Customer {
  id: string;
  name: string;
  company_name: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  created_at: string;
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

interface Job {
  id: string;
  title: string;
  status: string;
  due_date: string;
  budget: number;
  priority: string;
}

interface CustomerFormData {
  // Define the structure of your customer form data
}

interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  customer_id: string;
}

const initialFormData: CustomerFormData = {
  // Initialize your customer form data
};

const initialContactFormData: ContactFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  position: '',
  is_primary: false,
  customer_id: '',
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [contactFormData, setContactFormData] = useState<ContactFormData>(initialContactFormData);

  useEffect(() => {
    if (user && id) {
      fetchCustomerData();
    }
  }, [user, id]);

  async function fetchCustomerData() {
    try {
      // Fetch customer details
      const { data: customerData, error: customerError } = await supabase
        .schema('common')
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (customerError) throw customerError;
      setCustomer(customerData);

      // Fetch related contacts
      const { data: contactsData, error: contactsError } = await supabase
        .schema('common')
        .from('contacts')
        .select('*')
        .eq('customer_id', id)
        .order('is_primary', { ascending: false });

      if (contactsError) throw contactsError;
      setContacts(contactsData || []);

      // Fetch related jobs
      const { data: jobsData, error: jobsError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;
      setJobs(jobsData || []);
    } catch (error) {
      console.error('Error fetching customer data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleAddContact() {
    if (customer) {
      setContactFormData({
        ...initialContactFormData,
        customer_id: customer.id,
      });
      setIsContactFormOpen(true);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !customer) return;

    try {
      const { error } = await supabase
        .schema('common')
        .from('contacts')
        .insert([{ ...contactFormData, user_id: user.id }]);

      if (error) throw error;

      setIsContactFormOpen(false);
      setContactFormData(initialContactFormData);
      fetchCustomerData();
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Customer not found</div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </button>
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-[#f26722]" />
              <h1 className="ml-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {customer.company_name || 'No Company Name'}
              </h1>
            </div>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
            customer.status === 'active' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
          }`}>
            {customer.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Customer Information</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <Mail className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
                  <p className="text-sm text-gray-900 dark:text-white">{customer.email || '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Phone className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</p>
                  <p className="text-sm text-gray-900 dark:text-white">{customer.phone || '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Address</p>
                  <p className="text-sm text-gray-900 dark:text-white">{customer.address || '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {format(new Date(customer.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Contacts</h2>
              <div className="flex space-x-2">
                <button
                  onClick={handleAddContact}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-[#f26722] hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722]"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  + Contact
                </button>
                <button
                  onClick={() => navigate('/contacts')}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-white bg-white dark:bg-dark-100 hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                >
                  View All Contacts
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {contacts.map((contact) => (
                <Link 
                  key={contact.id} 
                  to={`/contacts/${contact.id}`}
                  className="block p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Users className="h-5 w-5 text-[#f26722]" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {contact.first_name} {contact.last_name}
                          {contact.is_primary && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Primary
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{contact.position}</p>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {contact.email}
                    </div>
                  </div>
                </Link>
              ))}
              {contacts.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No contacts found
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-150 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Jobs</h2>
              <Link
                to="/jobs"
                className="text-sm font-medium text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
              >
                View all jobs
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {jobs.map((job) => (
              <Link 
                key={job.id} 
                to={`/jobs/${job.id}`}
                className="block p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Briefcase className="h-5 w-5 text-[#f26722]" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{job.title}</p>
                      <div className="flex items-center mt-1 space-x-2">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          job.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          job.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                          {job.status}
                        </span>
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          job.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {job.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ${job.budget?.toLocaleString() || '-'}
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Due: {job.due_date ? format(new Date(job.due_date), 'MMM d, yyyy') : 'Not set'}
                </div>
              </Link>
            ))}
            {jobs.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                No jobs found
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Add Contact Form Dialog */}
      <Dialog open={isContactFormOpen} onClose={() => setIsContactFormOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded bg-white dark:bg-dark-150 p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                Add New Contact for {customer?.company_name}
              </Dialog.Title>
              <button onClick={() => setIsContactFormOpen(false)} className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 dark:text-white">
                  First Name *
                </label>
                <input
                  type="text"
                  name="first_name"
                  id="first_name"
                  required
                  value={contactFormData.first_name}
                  onChange={(e) => setContactFormData(prev => ({ ...prev, first_name: e.target.value }))}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="last_name"
                  id="last_name"
                  required
                  value={contactFormData.last_name}
                  onChange={(e) => setContactFormData(prev => ({ ...prev, last_name: e.target.value }))}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  value={contactFormData.email}
                  onChange={(e) => setContactFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  value={contactFormData.phone}
                  onChange={(e) => setContactFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="position" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Position
                </label>
                <input
                  type="text"
                  name="position"
                  id="position"
                  value={contactFormData.position}
                  onChange={(e) => setContactFormData(prev => ({ ...prev, position: e.target.value }))}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_primary"
                  id="is_primary"
                  checked={contactFormData.is_primary}
                  onChange={(e) => setContactFormData(prev => ({ ...prev, is_primary: e.target.checked }))}
                  className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="is_primary" className="ml-2 block text-sm text-gray-700 dark:text-white">
                  Primary Contact
                </label>
              </div>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-2 sm:text-sm"
                >
                  Add Contact
                </button>
                <button
                  type="button"
                  onClick={() => setIsContactFormOpen(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-100 px-4 py-2 text-base font-medium text-gray-700 dark:text-white shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}