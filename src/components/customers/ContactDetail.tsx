import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, Building2, Mail, Phone, Briefcase, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { format } from 'date-fns';

interface Contact {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && id) {
      fetchContactData();
    }
  }, [user, id]);

  async function fetchContactData() {
    try {
      // Fetch contact details
      const { data: contactData, error: contactError } = await supabase
        .schema('common')
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single();

      if (contactError) {
        console.error('Error fetching contact details:', contactError);
        if (contactError.code === 'PGRST116') {
            // Handle case where contact is not found specifically
            setContact(null);
            setLoading(false);
            return;
        } else {
            throw contactError;
        }
      }
      setContact(contactData);

      if (contactData?.customer_id) {
        // Fetch related customer
        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .eq('id', contactData.customer_id)
          .single();

        if (customerError) {
            console.error('Error fetching related customer:', customerError);
            // If customer not found, still show contact details
            setCustomer(null);
        } else {
            setCustomer(customerData);
        }
      } else {
          setCustomer(null); // No customer_id associated
      }
    } catch (error) {
      console.error('Error in fetchContactData:', error);
      // Setting contact to null will trigger the "Contact not found" message
      setContact(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Contact not found</div>
      </div>
    );
  }

  return (
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
            <Users className="h-8 w-8 text-[#f26722]" />
            <h1 className="ml-3 text-2xl font-semibold text-gray-900 dark:text-white">
              {contact.first_name} {contact.last_name}
            </h1>
          </div>
        </div>
        {contact.is_primary && (
          <span className="inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            Primary Contact
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Contact Information</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <Mail className="h-5 w-5 text-[#f26722] mt-0.5" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
                <a 
                  href={`mailto:${contact.email}`} 
                  className="text-sm text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                >
                  {contact.email}
                </a>
              </div>
            </div>
            <div className="flex items-start">
              <Phone className="h-5 w-5 text-[#f26722] mt-0.5" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</p>
                <p className="text-sm text-gray-900 dark:text-white">{contact.phone || '-'}</p>
              </div>
            </div>
            <div className="flex items-start">
              <Briefcase className="h-5 w-5 text-[#f26722] mt-0.5" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Position</p>
                <p className="text-sm text-gray-900 dark:text-white">{contact.position || '-'}</p>
              </div>
            </div>
            <div className="flex items-start">
              <Calendar className="h-5 w-5 text-[#f26722] mt-0.5" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {format(new Date(contact.created_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Company Information</h2>
          {customer ? (() => {
            // Build a route that matches configured routes
            const currentPath = location.pathname;
            let toPath = `/sales-dashboard/customers/${customer.id}`;
            if (currentPath.startsWith('/sales-dashboard')) {
              toPath = `/sales-dashboard/customers/${customer.id}`;
            } else {
              const parts = currentPath.split('/').filter(Boolean);
              if (parts.length >= 1) {
                const division = parts[0];
                toPath = `/${division}/customers/${customer.id}`;
              }
            }
            return (
              <Link 
                to={toPath}
              className="block hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <div className="space-y-4">
                <div className="flex items-start">
                  <Building2 className="h-5 w-5 text-[#f26722] mt-0.5" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Company</p>
                    <p className="text-sm text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90">
                      {customer.company_name || customer.name}
                    </p>
                  </div>
                </div>
              </div>
              </Link>
            );
          })() : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No company information available</p>
          )}
        </div>
      </div>
    </div>
  );
}