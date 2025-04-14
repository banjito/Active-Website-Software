import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface Customer {
  id: string;
  name: string;
  company_name: string;
  email: string;
  phone: string;
  address: string;
  status: string;
}

interface CustomerFormData {
  company_name: string;
  email: string;
  phone: string;
  address: string;
}

const initialFormData: CustomerFormData = {
  company_name: '',
  email: '',
  phone: '',
  address: '',
};

export default function CustomerList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!user) return;

      const dataToSave = {
        ...formData,
        name: formData.company_name // Set name to be the same as company_name
      };

      if (isEditing && customerToEdit) {
        // Update existing customer
        const { error } = await supabase
          .schema('common')
          .from('customers')
          .update(dataToSave)
          .eq('id', customerToEdit);

        if (error) throw error;
      } else {
        // Create new customer
        const { error } = await supabase
          .schema('common')
          .from('customers')
          .insert([{ 
            ...dataToSave, 
            status: 'active',
            user_id: user.id 
          }]);

        if (error) throw error;
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setIsEditing(false);
      setCustomerToEdit(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error saving customer:', error);
    }
  }

  async function handleDelete(customerId: string) {
    try {
      const { error } = await supabase
        .schema('common')
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) throw error;

      setDeleteConfirmOpen(false);
      setCustomerToDelete(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  function confirmDelete(customerId: string) {
    setCustomerToDelete(customerId);
    setDeleteConfirmOpen(true);
  }

  function handleEdit(customer: Customer, e: React.MouseEvent) {
    setIsEditing(true);
    setCustomerToEdit(customer.id);
    setFormData({
      company_name: customer.company_name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address
    });
    setIsOpen(true);
  }

  const handleRowClick = (customerId: string) => {
    const currentPath = location.pathname;
    let targetPath = '';

    if (currentPath.startsWith('/sales-dashboard')) {
      targetPath = `/sales-dashboard/customers/${customerId}`;
    } else {
      // Check if we are in a division context (e.g., /north_alabama/customers)
      const pathParts = currentPath.split('/').filter(part => part !== ''); // filter empty strings
      if (pathParts.length >= 2 && pathParts[1] === 'customers') {
        const division = pathParts[0];
        targetPath = `/${division}/customers/${customerId}`;
      } else {
        // Fallback or default behavior if context is unclear (shouldn't happen with current routes)
        console.warn(`[CustomerList] Unclear navigation context from path: ${currentPath}. Falling back to generic path.`);
        targetPath = `/customers/${customerId}`; // This path might not exist anymore, leading to redirect
      }
    }
      
    console.log(`[CustomerList] handleRowClick: Current Path = ${currentPath}, Target Path = ${targetPath}`);
    navigate(targetPath);
  };

  if (loading) {
    return <div className="text-gray-900 dark:text-gray-100">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white">
            Manage your customer accounts and view their details.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setCustomerToEdit(null);
              setFormData(initialFormData);
              setIsOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add customer
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="-mx-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:-mx-6 md:mx-0 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50 dark:bg-dark-150">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-200 sm:pl-6">
                  Company
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Email
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Phone
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                  Status
                </th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-dark-150">
              {customers.map((customer) => (
                <tr 
                  key={customer.id} 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" 
                  onClick={() => handleRowClick(customer.id)}
                >
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-200 sm:pl-6">
                    {customer.company_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{customer.email}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{customer.phone}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      customer.status === 'active' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}>
                      {customer.status}
                    </span>
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button 
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-2"
                      onClick={(e) => handleEdit(customer, e)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button 
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      onClick={(e) => {
                        confirmDelete(customer.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded bg-white dark:bg-dark-150 p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                {isEditing ? 'Edit Customer' : 'Add New Customer'}
              </Dialog.Title>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="company_name"
                  id="company_name"
                  required
                  value={formData.company_name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  id="address"
                  value={formData.address}
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
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:col-start-2 sm:text-sm"
                >
                  {isEditing ? 'Save Changes' : 'Add Customer'}
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
          <Dialog.Panel className="mx-auto max-w-sm rounded bg-white dark:bg-gray-800 p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">Delete Customer</Dialog.Title>
            <div className="mt-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Are you sure you want to delete this customer? This action cannot be undone.
                All associated contacts and jobs will also be deleted.
              </p>
            </div>
            <div className="mt-4 flex space-x-3">
              <button
                type="button"
                onClick={() => customerToDelete && handleDelete(customerToDelete)}
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