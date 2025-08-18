import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface Contact {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  customers?: {
    name: string;
    company_name: string;
  };
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface ContactFormData {
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

const initialFormData: ContactFormData = {
  customer_id: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  position: '',
  is_primary: false,
};

export default function ContactList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Log location pathname whenever it changes
  useEffect(() => {
    console.log(`[ContactList] Current location.pathname on render/update: ${location.pathname}`);
  }, [location.pathname]);

  useEffect(() => {
    if (user) {
      fetchContacts();
      fetchCustomers();
    }
  }, [user, page, debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm !== debouncedSearch) {
        setDebouncedSearch(searchTerm.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, debouncedSearch]);

  useEffect(() => {
    if (customerSearch.trim()) {
      const filtered = customers.filter(customer => 
        customer.company_name.toLowerCase().includes(customerSearch.toLowerCase())
      );
      setFilteredCustomers(filtered);
      setShowCustomerResults(true);
    } else {
      setFilteredCustomers([]);
      setShowCustomerResults(false);
    }
  }, [customerSearch, customers]);

  async function fetchContacts() {
    if (debouncedSearch) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }
    try {
      // 1. Fetch base contacts data (paged)
      const pageSize = 50;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .schema('common')
        .from('contacts')
        .select('*') // Select all contact fields
        .order('created_at', { ascending: false })
        .range(from, to);

      if (debouncedSearch) {
        const like = `%${debouncedSearch}%`;
        query = query.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
      }

      const { data: contactData, error: contactError } = await query;

      if (contactError) throw contactError;
      if (!contactData) {
        setContacts([]);
        return; // No contacts found
      }

      setHasMore((contactData || []).length === pageSize);

      // 2. Fetch customer data for each contact
      const contactsWithCustomers = await Promise.all(contactData.map(async (contact) => {
        if (!contact.customer_id) {
          return { ...contact, customers: null };
        }
        
        try {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('id, name, company_name')
            .eq('id', contact.customer_id)
            .single();

          if (customerError) {
            console.warn(`Error fetching customer for contact ${contact.id}:`, customerError);
            return { ...contact, customers: null };
          }
          
          // Use the `customers` key to match the existing Contact interface
          return { ...contact, customers: customerData };
        } catch (err) {
          console.warn(`Error processing customer for contact ${contact.id}:`, err);
          return { ...contact, customers: null };
        }
      }));

      setContacts(contactsWithCustomers);

    } catch (error) {
      console.error('Error in fetchContacts function:', error);
    } finally {
      if (debouncedSearch) {
        setSearchLoading(false);
      } else {
        setLoading(false);
      }
    }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    try {
      if (isEditMode && editingContactId) {
        const { error } = await supabase
          .schema('common')
          .from('contacts')
          .update({ ...formData })
          .eq('id', editingContactId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .schema('common')
          .from('contacts')
          .insert([{ ...formData, user_id: user.id }]);

        if (error) throw error;
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setIsEditMode(false);
      setEditingContactId(null);
      fetchContacts();
    } catch (error) {
      console.error('Error saving contact:', error);
    }
  }

  function handleEdit(contact: Contact) {
    setFormData({
      customer_id: contact.customer_id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email || '',
      phone: contact.phone || '',
      position: contact.position || '',
      is_primary: contact.is_primary,
    });
    setIsEditMode(true);
    setEditingContactId(contact.id);
    setIsOpen(true);
  }

  function handleDelete(contactId: string) {
    setContactToDelete(contactId);
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!contactToDelete || !user) return;

    try {
      const { error } = await supabase
        .schema('common')
        .from('contacts')
        .delete()
        .eq('id', contactToDelete);

      if (error) throw error;

      setDeleteConfirmOpen(false);
      setContactToDelete(null);
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target as HTMLInputElement;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: newValue }));
  }

  function handleCustomerSelect(customer: Customer) {
    setFormData(prev => ({ ...prev, customer_id: customer.id }));
    setCustomerSearch(customer.company_name);
    setFilteredCustomers([]);
    setShowCustomerResults(false);
  }

  function handleAddContactForCustomer(customer: Customer) {
    setFormData(prev => ({ ...prev, customer_id: customer.id }));
    setCustomerSearch(customer.company_name);
    setIsEditMode(false);
    setEditingContactId(null);
    setIsOpen(true);
  }

  const handleRowClick = (contactId: string) => {
    const currentPath = location.pathname;
    let targetPath = '';

    if (currentPath.startsWith('/sales-dashboard')) {
      targetPath = `/sales-dashboard/contacts/${contactId}`;
    } else {
      // Check if we are in a division context (e.g., /north_alabama/contacts)
      const pathParts = currentPath.split('/').filter(part => part !== ''); // filter empty strings
      if (pathParts.length >= 2 && pathParts[1] === 'contacts') {
        const division = pathParts[0];
        targetPath = `/${division}/contacts/${contactId}`;
      } else {
        // Fallback or default behavior if context is unclear (shouldn't happen with current routes)
        console.warn(`[ContactList] Unclear navigation context from path: ${currentPath}. Falling back to generic path.`);
        targetPath = `/contacts/${contactId}`; // This path might not exist anymore, leading to redirect
      }
    }
      
    console.log(`[ContactList] handleRowClick: Current Path = ${currentPath}, Target Path = ${targetPath}`);
    navigate(targetPath);
  };

  if (loading) {
    return <div className="text-gray-900 dark:text-gray-100">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Contacts</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-white">
            Manage your contact information and view their associated customers.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:flex-none flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search contacts by name, email, phone"
            className="w-72 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
          />
          {searchLoading && (
            <div className="ml-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#f26722]"></div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setIsEditMode(false);
              setEditingContactId(null);
              setFormData(initialFormData);
              setIsOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add contact
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="-mx-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:-mx-6 md:mx-0 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50 dark:bg-dark-150">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
                  Name
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Position
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Email
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Phone
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Primary
                </th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-dark-150">
              {contacts.map((contact) => (
                <tr 
                  key={contact.id}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  onClick={() => handleRowClick(contact.id)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-200 sm:pl-6">
                    {contact.first_name} {contact.last_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">{contact.position}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">{contact.email}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">{contact.phone}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {contact.is_primary ? (
                      <span className="inline-flex rounded-full bg-green-100 dark:bg-green-900 px-2 text-xs font-semibold leading-5 text-green-800 dark:text-green-200">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-700 px-2 text-xs font-semibold leading-5 text-gray-800 dark:text-gray-200">
                        No
                      </span>
                    )}
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    {/* Temporarily commented out buttons for debugging */}
                    {/* 
                    <button 
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-2"
                      onClick={(e) => {
                        handleEdit(contact);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button 
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      onClick={(e) => {
                        handleDelete(contact.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    */}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="mt-4 flex items-center justify-between">
        <button
          className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
          disabled={page <= 1 || loading}
          onClick={() => setPage(p => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-300">Page {page}</span>
        <button
          className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
          disabled={!hasMore || loading}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </button>
      </div>

      <Dialog open={isOpen} onClose={() => {
        setIsOpen(false);
        setShowCustomerResults(false);
        setFilteredCustomers([]);
      }} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded bg-white dark:bg-dark-150 p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Contact' : 'Add New Contact'}
              </Dialog.Title>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <label htmlFor="customer_search" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Customer *
                </label>
                <input
                  type="text"
                  id="customer_search"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    if (!e.target.value.trim()) {
                      setFilteredCustomers([]);
                      setShowCustomerResults(false);
                    }
                  }}
                  placeholder="Search for a customer..."
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  required
                />
                {showCustomerResults && filteredCustomers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-dark-100 shadow-lg rounded-md border border-gray-300 dark:border-gray-600">
                    <ul className="max-h-60 overflow-auto py-1">
                      {filteredCustomers.map((customer) => (
                        <li
                          key={customer.id}
                          className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-dark-200 cursor-pointer dark:text-white"
                          onClick={() => handleCustomerSelect(customer)}
                        >
                          {customer.company_name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <input type="hidden" name="customer_id" value={formData.customer_id} required />
              </div>
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 dark:text-white">
                  First Name *
                </label>
                <input
                  type="text"
                  name="first_name"
                  id="first_name"
                  required
                  value={formData.first_name}
                  onChange={handleInputChange}
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
                  value={formData.last_name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email}
                  onChange={handleInputChange}
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
                  value={formData.phone}
                  onChange={handleInputChange}
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
                  value={formData.position}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_primary"
                  id="is_primary"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_primary: e.target.checked }))}
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
                  {isEditMode ? 'Save Changes' : 'Add Contact'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-100 px-4 py-2 text-base font-medium text-gray-700 dark:text-white shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded bg-white dark:bg-dark-100 p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-dark-900">Delete Contact</Dialog.Title>
            <div className="mt-2">
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Are you sure you want to delete this contact? This action cannot be undone.
              </p>
            </div>
            <div className="mt-4 flex space-x-3">
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex justify-center rounded-md border border-transparent bg-red-600 dark:bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="inline-flex justify-center rounded-md border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-100 px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-300 hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-amp-orange-500 dark:focus:ring-amp-gold-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}