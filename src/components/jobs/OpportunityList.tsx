import React, { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X, ArrowLeft, Award } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { DivisionAnalyticsDialog } from '../analytics/DivisionAnalyticsDialog';

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  customer_id?: string;
}

interface FormData {
  customer_id: string;
  contact_id: string;
  title: string;
  description: string;
  status: string;
  expected_value: string;
  probability: string;
  expected_close_date: string;
  proposal_due_date: string;
  notes: string;
  amp_division: string;
  sales_person: string;
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'awareness':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
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
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
  }
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
}

const initialFormData: FormData = {
  customer_id: '',
  contact_id: '',
  title: '',
  description: '',
  status: 'awareness',
  expected_value: '',
  probability: '0',
  expected_close_date: '',
  proposal_due_date: '',
  notes: '',
  amp_division: '',
  sales_person: ''
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

export default function OpportunityList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [showDivisionAnalytics, setShowDivisionAnalytics] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [sortField, setSortField] = useState<'quote_number' | 'expected_close_date'>('quote_number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderDraggingRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartScrollLeftRef = useRef<number>(0);
  const [isHeaderGrabbing, setIsHeaderGrabbing] = useState<boolean>(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{ company_name: string; name: string; email: string; phone: string; address: string }>({
    company_name: '',
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [showNewContact, setShowNewContact] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContact, setNewContact] = useState<{ first_name: string; last_name: string; email: string; phone: string }>({
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    if (user) {
      fetchOpportunities();
      fetchCustomers();
    }
  }, [user, page, debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm !== debouncedSearch) {
        setDebouncedSearch(searchTerm.trim());
        setPage(1); // Only reset page when search actually changes
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, debouncedSearch]);

  useEffect(() => {
    if (formData.customer_id) {
      fetchContacts(formData.customer_id);
    }
  }, [formData.customer_id]);

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

  async function fetchOpportunities() {
    if (debouncedSearch) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }
    try {
      // 1. Fetch base opportunities from the 'business' schema (paged)
      const pageSize = 50;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .schema('business')
        .from('opportunities')
        .select('*') // Select all opportunity fields
        .order('created_at', { ascending: false })
        .range(from, to);

      if (debouncedSearch) {
        const like = `%${debouncedSearch}%`;
        query = query.or(`quote_number.ilike.${like},title.ilike.${like},description.ilike.${like},sales_person.ilike.${like}`);
      }

      const { data: opportunityData, error: opportunityError } = await query;

      if (opportunityError) throw opportunityError;
      
      if (!opportunityData) {
        setOpportunities([]);
        return; // No opportunities found
      }

      setHasMore((opportunityData || []).length === pageSize);

      // 2a. Try to load proposal_due_date explicitly to ensure availability across environments
      try {
        const ids = opportunityData.map((o: any) => o.id);
        if (ids.length > 0) {
          const { data: pdList } = await supabase
            .schema('business')
            .from('opportunities')
            .select('id, proposal_due_date')
            .in('id', ids);
          const idToPd: Record<string, any> = {};
          (pdList || []).forEach((row: any) => {
            idToPd[String(row.id)] = row.proposal_due_date;
          });
          opportunityData = opportunityData.map((o: any) => ({
            ...o,
            proposal_due_date: o.proposal_due_date ?? idToPd[String(o.id)] ?? null,
          }));
        }
      } catch (_e) {
        // Best-effort; ignore
      }

      // 2b. Fetch customer data for each opportunity from the 'common' schema
      const opportunitiesWithCustomers = await Promise.all(opportunityData.map(async (opportunity: any) => {
        if (!opportunity.customer_id) {
          return { ...opportunity, customers: null }; // Keep 'customers' key for consistency
        }

        try {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('id, name, company_name')
            .eq('id', opportunity.customer_id)
            .single();

          if (customerError) {
            console.warn(`Error fetching customer for opportunity ${opportunity.id}:`, customerError);
            return { ...opportunity, customers: null };
          }

          return { ...opportunity, customers: customerData };
        } catch (err) {
          console.warn(`Error processing customer for opportunity ${opportunity.id}:`, err);
          return { ...opportunity, customers: null };
        }
      }));

      const sortOpportunities = (list: any[]) => {
        const copy = [...list];
        copy.sort((a, b) => {
          const dir = sortDirection === 'asc' ? 1 : -1;
          if (sortField === 'quote_number') {
            const an = parseInt(String(a.quote_number ?? '0'), 10) || 0;
            const bn = parseInt(String(b.quote_number ?? '0'), 10) || 0;
            return (an - bn) * dir;
          } else {
            const ad = a.expected_close_date ? new Date(a.expected_close_date).getTime() : 0;
            const bd = b.expected_close_date ? new Date(b.expected_close_date).getTime() : 0;
            return (ad - bd) * dir;
          }
        });
        return copy;
      };

      setOpportunities(sortOpportunities(opportunitiesWithCustomers));

    } catch (error) {
      console.error('Error in fetchOpportunities function:', error);
    } finally {
      if (debouncedSearch) {
        setSearchLoading(false);
      } else {
        setLoading(false);
      }
    }
  }

  // Re-sort when sort controls change without refetching
  useEffect(() => {
    setOpportunities(prev => {
      const list = Array.isArray(prev) ? prev : [] as any[];
      const copy = [...list];
      copy.sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;
        if (sortField === 'quote_number') {
          const an = parseInt(String(a.quote_number ?? '0'), 10) || 0;
          const bn = parseInt(String(b.quote_number ?? '0'), 10) || 0;
          return (an - bn) * dir;
        } else {
          const ad = a.expected_close_date ? new Date(a.expected_close_date).getTime() : 0;
          const bd = b.expected_close_date ? new Date(b.expected_close_date).getTime() : 0;
          return (ad - bd) * dir;
        }
      });
      return copy;
    });
  }, [sortField, sortDirection]);

  // Header drag-to-scroll handlers
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    isHeaderDraggingRef.current = true;
    setIsHeaderGrabbing(true);
    dragStartXRef.current = e.clientX;
    dragStartScrollLeftRef.current = scrollContainerRef.current.scrollLeft;
    e.preventDefault();
  };

  const handleHeaderMouseMove = (e: React.MouseEvent) => {
    if (!isHeaderDraggingRef.current || !scrollContainerRef.current) return;
    e.preventDefault();
    const delta = e.clientX - dragStartXRef.current;
    scrollContainerRef.current.scrollLeft = dragStartScrollLeftRef.current - delta;
  };

  const handleHeaderMouseUp = () => {
    if (!isHeaderDraggingRef.current) return;
    isHeaderDraggingRef.current = false;
    setIsHeaderGrabbing(false);
  };

  async function handleCreateCustomer() {
    if (!user) return;
    if (!newCustomer.company_name && !newCustomer.name) {
      alert('Please enter a Company name or Customer name');
      return;
    }
    setCreatingCustomer(true);
    try {
      const payload: any = {
        company_name: newCustomer.company_name || newCustomer.name,
        name: newCustomer.name || newCustomer.company_name,
        email: newCustomer.email || null,
        phone: newCustomer.phone || null,
        address: newCustomer.address || null,
        status: 'active',
        user_id: user.id
      };
      const { data, error } = await supabase
        .schema('common')
        .from('customers')
        .insert([payload])
        .select('id, name, company_name')
        .single();
      if (error) throw error;
      // Refresh customers and set selected
      await fetchCustomers();
      setFormData(prev => ({ ...prev, customer_id: data.id }));
      setShowNewCustomer(false);
      setNewCustomer({ company_name: '', name: '', email: '', phone: '', address: '' });
    } catch (err: any) {
      console.error('Error creating customer:', err);
      alert(err.message || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleCreateContact() {
    if (!user) return;
    if (!formData.customer_id) {
      alert('Please select or create a customer first');
      return;
    }
    if (!newContact.first_name || !newContact.last_name) {
      alert('Please enter first and last name');
      return;
    }
    setCreatingContact(true);
    try {
      const contactPayload: any = {
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email || null,
        phone: newContact.phone || null,
        customer_id: formData.customer_id,
        user_id: user.id,
        is_primary: false
      };
      const { error } = await supabase
        .schema('common')
        .from('contacts')
        .insert([contactPayload]);
      if (error) throw error;
      // Refresh contacts for selected customer and close form
      await fetchContacts(formData.customer_id);
      setShowNewContact(false);
      setNewContact({ first_name: '', last_name: '', email: '', phone: '' });
    } catch (err: any) {
      console.error('Error creating contact:', err);
      alert(err.message || 'Failed to create contact');
    } finally {
      setCreatingContact(false);
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
      // Reset contact_id when customer changes
      setFormData(prev => ({ ...prev, contact_id: '' }));
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log('Form submitted');
    
    if (!user) {
      console.error('No user found');
      alert('You must be logged in to create an opportunity');
      return;
    }

    try {
      // Check if the opportunities table exists in the correct schema
      const { data: tableCheck, error: tableError } = await supabase
        .schema('business') // Specify schema
        .from('opportunities')
        .select('count', { head: true, count: 'exact' }); // Use head:true for faster count check

      if (tableError) {
        console.error('Table check error:', tableError);
        // Check if the error specifically indicates the relation doesn't exist
        if (tableError.code === '42P01') {
             alert('The opportunities table is not properly set up in the business schema. Please contact support.');
        } else {
            alert('Error checking opportunities table setup. Please contact support.');
        }
        return;
      }
      
      // Log the count result (optional)
      // console.log('Table check count:', tableCheck?.count);

      console.log('Processing form data:', formData);
      
      // Validate required fields
      if (!formData.customer_id) {
        console.error('Missing customer');
        alert('Please select a customer');
        return;
      }
      
      // First check if the customer exists in the common schema
      const { data: customerData, error: customerError } = await supabase
        .schema('common') // Specify schema
        .from('customers')
        .select('id') // Explicitly select 'id' instead of using head:true
        .eq('id', formData.customer_id)
        .maybeSingle(); // Use maybeSingle to handle null without error

      // Add detailed logging for the customer check
      console.log('[handleSubmit] Customer Check:', {
          customerIdToCheck: formData.customer_id,
          customerDataResult: customerData, // Will be null if not found
          customerErrorResult: customerError
      });

      if (customerError) {
         console.error('Customer validation database error:', customerError);
         alert('Error validating customer. Please try again.');
         return;
      }
      if (!customerData) { // CustomerData will be null if not found
        console.error('Selected customer does not exist:', formData.customer_id);
        alert('Selected customer does not exist. Please refresh and try again.');
        return;
      }
      
      // Compute the next sequential quote number (numeric, starting at 3803)
      async function computeNextQuoteNumber(): Promise<number> {
        // Fetch recent opportunities and compute max numeric quote_number
        const { data: recent, error: recentError } = await supabase
          .schema('business')
          .from('opportunities')
          .select('quote_number')
          .order('created_at', { ascending: false })
          .limit(500);

        if (recentError) {
          console.warn('Error reading existing quote numbers, defaulting seed:', recentError);
        }

        const nums: number[] = (recent || [])
          .map(r => (r as any)?.quote_number)
          .filter((q: any) => typeof q === 'string' && /^[0-9]+$/.test(q))
          .map((q: string) => parseInt(q, 10))
          .filter(n => Number.isFinite(n));

        const maxNumeric = nums.length ? Math.max(...nums) : 0;
        const base = 3802; // so next becomes 3803 if none exist
        return Math.max(maxNumeric, base) + 1;
      }

      let nextQuoteNumber = await computeNextQuoteNumber();

      // Create a new object with processed data
      const opportunityDataBase: any = {
        customer_id: formData.customer_id,
        contact_id: formData.contact_id || null, // Ensure contact_id can be null
        title: formData.title || '',
        description: formData.description || '',
        status: formData.status || 'awareness',
        expected_value: formData.expected_value ? parseFloat(formData.expected_value) : null,
        probability: formData.probability ? parseInt(formData.probability) : 0, // Parse probability
        expected_close_date: formData.expected_close_date || null,
        notes: formData.notes || '',
        amp_division: formData.amp_division,
        sales_person: user.email, // Automatically set to the user's email
        user_id: user.id,
        quote_number: String(nextQuoteNumber),
        proposal_due_date: formData.proposal_due_date || null
      };
      
      console.log('Sending to Supabase:', opportunityDataBase);

      // Try to insert into the business schema with retry on unique conflict
      let data: any = null;
      let error: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        ({ data, error } = await supabase
          .schema('business')
          .from('opportunities')
          .insert({ ...opportunityDataBase, quote_number: String(nextQuoteNumber) })
          .select()
          .single());

        if (!error) break;
        // If proposal_due_date column doesn't exist, drop it and retry once
        if (error?.code === '42703' && 'proposal_due_date' in opportunityDataBase) {
          delete opportunityDataBase.proposal_due_date;
          continue;
        }
        if (error?.code === '23505') {
          // Unique violation on quote_number: increment and retry
          nextQuoteNumber += 1;
          continue;
        }
        break;
      }
 
      if (error) {
        console.error('Detailed Supabase error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          error: error
        });
        
        // Handle specific error cases
        if (error.code === '23505') { // Unique violation
          alert('A quote number conflict occurred. Please try again.');
        } else if (error.code === '23503') { // Foreign key violation
          alert('Invalid customer or contact selected. Please try again.');
        } else if (error.code === '42P01') { // Table does not exist
          alert('The opportunities table is not properly set up. Please contact support.');
        } else {
          alert(`Error creating opportunity: ${error.message || 'Unknown error'}`);
        }
        throw error;
      }

      // --- Add default subcontractor agreement PDF ---
      try {
        const publicURL = '/templates/subcontractor-agreement-template.pdf';
        await supabase
          .schema('business')
          .from('subcontractor_agreements')
          .insert({
            opportunity_id: data.id,
            user_id: user.id,
            name: 'Default Subcontractor Agreement',
            file_url: publicURL,
            status: 'pending',
            upload_date: new Date().toISOString()
          });
      } catch (err) {
        console.error('Error adding default subcontractor agreement:', err);
        // Don't block opportunity creation if this fails
      }

      console.log('Created opportunity:', data);
      alert('Opportunity created successfully!');
      setIsOpen(false);
      setFormData(initialFormData);
      fetchOpportunities();
    } catch (error: any) {
      console.error('Error creating opportunity:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error
      });
      
      // Try to get more specific error information
      let errorMessage = 'Database error';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (error?.hint) {
        errorMessage = error.hint;
      }
      
      alert(`Error creating opportunity: ${errorMessage}`);
    }
  }

  if (loading) {
    return <div className="text-gray-900 dark:text-gray-100">Loading...</div>;
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-dark-900">Opportunities</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-dark-400">
              A list of all opportunities and their key information.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by quote #, title, description, sales person"
                className={`w-72 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                  searchTerm ? 'border-[#f26722] bg-orange-50 dark:bg-orange-900/20' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150'
                } text-gray-900 dark:text-white`}
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#f26722]"></div>
                </div>
              )}
              {searchTerm && !searchLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="w-2 h-2 bg-[#f26722] rounded-full"></div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-dark-400">Sort by</label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as 'quote_number' | 'expected_close_date')}
                className="rounded-md border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-150 px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              >
                <option value="quote_number">Letter Number</option>
                <option value="expected_close_date">Due Date</option>
              </select>
              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                className="rounded-md border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-150 px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                setFormData(initialFormData);
              }}
              className="inline-flex items-center justify-center rounded-md bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add opportunity
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-dark-200 overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto"
            onMouseMove={handleHeaderMouseMove}
            onMouseUp={handleHeaderMouseUp}
            onMouseLeave={handleHeaderMouseUp}
          >
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-200">
              <thead
                className={`bg-gray-50 dark:bg-dark-100 select-none ${isHeaderGrabbing ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleHeaderMouseDown}
              >
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Quote #
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Proposal Due
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Customer
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Opportunity
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Job
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Division
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Value
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Probability
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-dark-200">
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-4 text-center text-gray-500 dark:text-dark-400">
                      No opportunities found. Click "Add Opportunity" to create one.
                    </td>
                  </tr>
                ) : (
                  opportunities.map((opportunity) => (
                    <tr
                      key={opportunity.id}
                      onClick={() => navigate(`/sales-dashboard/opportunities/${opportunity.id}`)}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-900">
                          {opportunity.quote_number}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-400">
                        {opportunity.proposal_due_date ? formatDateSafe(opportunity.proposal_due_date) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-400">
                        {formatDateSafe(opportunity.expected_close_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-900">
                          {opportunity.customers?.company_name || opportunity.customers?.name || 'Unknown Customer'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">{opportunity.title}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            opportunity.status
                          )}`}
                        >
                          {formatStatus(opportunity.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.job_id ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                ✓ Job #{opportunity.job_id}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/jobs/${opportunity.job_id}`);
                                }}
                                className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-xs underline"
                                title="View Job"
                              >
                                View
                              </button>
                            </div>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                              No Job
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.amp_division ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDivision(opportunity.amp_division);
                                setShowDivisionAnalytics(true);
                              }}
                              className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                            >
                              {formatDivisionName(opportunity.amp_division)}
                            </button>
                          ) : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.expected_value
                            ? `$${opportunity.expected_value.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.probability !== null && opportunity.probability !== undefined
                            ? `${opportunity.probability}%`
                            : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                          {!opportunity.job_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/sales-dashboard/opportunities/${opportunity.id}`);
                                // The opportunity detail page will show the Convert to Job button
                              }}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Convert to Job"
                            >
                              <Award className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/sales-dashboard/opportunities/${opportunity.id}`);
                            }}
                            className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                          >
                            <Pencil className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
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
      </div>

      {/* Add Opportunity Modal */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="fixed inset-0 z-10 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
                onClick={() => setIsOpen(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Add New Opportunity
            </Dialog.Title>

            <form onSubmit={handleSubmit} className="space-y-4">
              {showNewCustomer && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">New Customer</div>
                    <button type="button" className="text-xs text-gray-600" onClick={() => setShowNewCustomer(false)}>Cancel</button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <input placeholder="Company name" className="border rounded px-2 py-1 text-sm dark:bg-dark-100 dark:text-white" value={newCustomer.company_name} onChange={e => setNewCustomer(prev => ({ ...prev, company_name: e.target.value }))} />
                    <input placeholder="Customer name" className="border rounded px-2 py-1 text-sm dark:bg-dark-100 dark:text-white" value={newCustomer.name} onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} />
                    <input placeholder="Email" className="border rounded px-2 py-1 text-sm dark:bg-dark-100 dark:text-white" value={newCustomer.email} onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} />
                    <input placeholder="Phone" className="border rounded px-2 py-1 text-sm dark:bg-dark-100 dark:text-white" value={newCustomer.phone} onChange={e => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))} />
                    <input placeholder="Address" className="border rounded px-2 py-1 text-sm dark:bg-dark-100 dark:text-white" value={newCustomer.address} onChange={e => setNewCustomer(prev => ({ ...prev, address: e.target.value }))} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={handleCreateCustomer} disabled={creatingCustomer} className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90">
                      {creatingCustomer ? 'Creating...' : 'Create customer'}
                    </button>
                  </div>
                </div>
              )}

              {showNewContact && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">New Contact</div>
                    <button type="button" className="text-xs text-gray-600" onClick={() => setShowNewContact(false)}>Cancel</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="First name" className="border rounded px-2 py-1 text-sm col-span-1 dark:bg-dark-100 dark:text-white" value={newContact.first_name} onChange={e => setNewContact(prev => ({ ...prev, first_name: e.target.value }))} />
                    <input placeholder="Last name" className="border rounded px-2 py-1 text-sm col-span-1 dark:bg-dark-100 dark:text-white" value={newContact.last_name} onChange={e => setNewContact(prev => ({ ...prev, last_name: e.target.value }))} />
                    <input placeholder="Email" className="border rounded px-2 py-1 text-sm col-span-2 dark:bg-dark-100 dark:text-white" value={newContact.email} onChange={e => setNewContact(prev => ({ ...prev, email: e.target.value }))} />
                    <input placeholder="Phone" className="border rounded px-2 py-1 text-sm col-span-2 dark:bg-dark-100 dark:text-white" value={newContact.phone} onChange={e => setNewContact(prev => ({ ...prev, phone: e.target.value }))} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={handleCreateContact} disabled={creatingContact} className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90">
                      {creatingContact ? 'Creating...' : 'Create contact'}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Sales Person
                </label>
                <input
                  type="text"
                  name="sales_person"
                  value={user?.email || ''}
                  disabled
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-dark-200 focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:text-white cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Sales Stage
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  required
                >
                  <option value="awareness" className="dark:bg-dark-100 dark:text-white">Awareness</option>
                  <option value="interest" className="dark:bg-dark-100 dark:text-white">Interest</option>
                  <option value="quote" className="dark:bg-dark-100 dark:text-white">Quote</option>
                  <option value="decision" className="dark:bg-dark-100 dark:text-white">Decision</option>
                  <option value="decision - forecasted win" className="dark:bg-dark-100 dark:text-white">Decision - Forecasted Win</option>
                  <option value="decision - forecast lose" className="dark:bg-dark-100 dark:text-white">Decision - Forecast Lose</option>
                  <option value="awarded" className="dark:bg-dark-100 dark:text-white">Awarded</option>
                  <option value="lost" className="dark:bg-dark-100 dark:text-white">Lost</option>
                  <option value="no quote" className="dark:bg-dark-100 dark:text-white">No Quote</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Customer
                </label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers (name or company)"
                  className="mt-1 mb-2 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
                {formData.customer_id && (
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                    Selected: {(customers.find(c => c.id === formData.customer_id)?.company_name) || (customers.find(c => c.id === formData.customer_id)?.name) || 'Unknown'}
                    <button
                      type="button"
                      className="ml-2 underline text-[#f26722] hover:text-[#f26722]/90"
                      onClick={() => setFormData(prev => ({ ...prev, customer_id: '' }))}
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md">
                  {filteredCustomers.slice(0, 20).map((customer) => {
                    const isSelected = formData.customer_id === customer.id;
                    return (
                      <button
                        type="button"
                        key={customer.id}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, customer_id: customer.id }));
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
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No matches</div>
                  )}
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(true)}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                  >
                    + Add new customer
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Contact
                </label>
                <select
                  name="contact_id"
                  value={formData.contact_id}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  disabled={!formData.customer_id}
                >
                  <option value="" className="dark:bg-dark-100 dark:text-white">No Contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id} className="dark:bg-dark-100 dark:text-white">
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewContact(true)}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                    disabled={!formData.customer_id}
                  >
                    + Add new contact
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Opportunity Title
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Opportunity Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.stopPropagation();
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart ?? 0;
                      const end = target.selectionEnd ?? 0;
                      const current = formData.description || '';
                      const nextVal = current.slice(0, start) + '\n' + current.slice(end);
                      setFormData(prev => ({ ...prev, description: nextVal }));
                      setTimeout(() => {
                        if (descriptionRef.current) {
                          const pos = start + 1;
                          descriptionRef.current.selectionStart = pos;
                          descriptionRef.current.selectionEnd = pos;
                        }
                      }, 0);
                      return;
                    }
                    if (e.key === 'Tab' && e.shiftKey) {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart ?? 0;
                      const end = target.selectionEnd ?? 0;
                      const current = formData.description || '';
                      const nextVal = current.slice(0, start) + '\n' + current.slice(end);
                      setFormData(prev => ({ ...prev, description: nextVal }));
                      // Restore caret after React updates value
                      setTimeout(() => {
                        if (descriptionRef.current) {
                          const pos = start + 1;
                          descriptionRef.current.selectionStart = pos;
                          descriptionRef.current.selectionEnd = pos;
                        }
                      }, 0);
                    }
                  }}
                  ref={descriptionRef}
                  rows={3}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Expected Value ($)
                  </label>
                  <input
                    type="number"
                    name="expected_value"
                    value={formData.expected_value}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Probability (%)
                  </label>
                  <input
                    type="number"
                    name="probability"
                    value={formData.probability}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                    min="0"
                    max="100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Opportunity Date
                </label>
                <input
                  type="date"
                  name="expected_close_date"
                  value={formData.expected_close_date}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Proposal Due Date
                </label>
                <input
                  type="date"
                  name="proposal_due_date"
                  value={formData.proposal_due_date}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  AMP Division
                </label>
                <select
                  name="amp_division"
                  value={formData.amp_division}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
                  required
                >
                  <option value="" className="dark:bg-dark-100 dark:text-white">Select a division</option>
                  <option value="north_alabama" className="dark:bg-dark-100 dark:text-white">North Alabama Division</option>
                  <option value="tennessee" className="dark:bg-dark-100 dark:text-white">Tennessee Division</option>
                  <option value="georgia" className="dark:bg-dark-100 dark:text-white">Georgia Division</option>
                  <option value="international" className="dark:bg-dark-100 dark:text-white">International Division</option>
                </select>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-[#f26722] border border-transparent rounded-md shadow-sm hover:bg-[#f26722]/90 focus:outline-none"
                >
                  Create
                </button>
              </div>
            </form>
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
    </>
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