import { supabase } from '@/lib/supabase';

// Types
export interface VendorContact {
  id: string;
  vendor_id?: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

export interface VendorContract {
  id: string;
  vendor_id?: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  value: number;
  status: 'active' | 'pending' | 'expired' | 'terminated' | 'renewal';
  renewal_terms: string;
  document_url?: string;
}

export interface Vendor {
  id: string;
  company_name: string;
  category: string[];
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country: string;
  phone: string;
  email: string;
  website: string;
  rating: number;
  active: boolean;
  notes: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  contacts?: VendorContact[];
  contracts?: VendorContract[];
}

export interface VendorFormData {
  company_name: string;
  category: string[];
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country: string;
  phone: string;
  email: string;
  website: string;
  rating: number;
  active: boolean;
  notes: string;
}

// Fetch all vendors with their contacts and contracts
export async function fetchVendors(): Promise<Vendor[]> {
  const { data: vendors, error } = await supabase
    .schema('common')
    .from('vendors')
    .select('*')
    .order('company_name');

  if (error) {
    console.error('Error fetching vendors:', error);
    throw error;
  }

  if (!vendors || vendors.length === 0) {
    return [];
  }

  // Fetch contacts and contracts for all vendors
  const vendorIds = vendors.map(v => v.id);

  const [contactsResult, contractsResult] = await Promise.all([
    supabase
      .schema('common')
      .from('vendor_contacts')
      .select('*')
      .in('vendor_id', vendorIds),
    supabase
      .schema('common')
      .from('vendor_contracts')
      .select('*')
      .in('vendor_id', vendorIds)
  ]);

  const contactsByVendor: Record<string, VendorContact[]> = {};
  const contractsByVendor: Record<string, VendorContract[]> = {};

  if (contactsResult.data) {
    contactsResult.data.forEach(contact => {
      if (!contactsByVendor[contact.vendor_id]) {
        contactsByVendor[contact.vendor_id] = [];
      }
      contactsByVendor[contact.vendor_id].push(contact);
    });
  }

  if (contractsResult.data) {
    contractsResult.data.forEach(contract => {
      if (!contractsByVendor[contract.vendor_id]) {
        contractsByVendor[contract.vendor_id] = [];
      }
      contractsByVendor[contract.vendor_id].push(contract);
    });
  }

  return vendors.map(vendor => ({
    ...vendor,
    contacts: contactsByVendor[vendor.id] || [],
    contracts: contractsByVendor[vendor.id] || []
  }));
}

// Create a new vendor
export async function createVendor(vendorData: VendorFormData, userId?: string): Promise<Vendor> {
  const { data, error } = await supabase
    .schema('common')
    .from('vendors')
    .insert({
      ...vendorData,
      created_by: userId
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating vendor:', error);
    throw error;
  }

  return { ...data, contacts: [], contracts: [] };
}

// Update a vendor
export async function updateVendor(id: string, vendorData: Partial<VendorFormData>): Promise<Vendor> {
  const { data, error } = await supabase
    .schema('common')
    .from('vendors')
    .update(vendorData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating vendor:', error);
    throw error;
  }

  // Fetch contacts and contracts
  const [contactsResult, contractsResult] = await Promise.all([
    supabase.schema('common').from('vendor_contacts').select('*').eq('vendor_id', id),
    supabase.schema('common').from('vendor_contracts').select('*').eq('vendor_id', id)
  ]);

  return {
    ...data,
    contacts: contactsResult.data || [],
    contracts: contractsResult.data || []
  };
}

// Delete a vendor
export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('vendors')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting vendor:', error);
    throw error;
  }
}

// Create a contact
export async function createContact(vendorId: string, contactData: Omit<VendorContact, 'id' | 'vendor_id'>): Promise<VendorContact> {
  const { data, error } = await supabase
    .schema('common')
    .from('vendor_contacts')
    .insert({
      vendor_id: vendorId,
      ...contactData
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating contact:', error);
    throw error;
  }

  return data;
}

// Update a contact
export async function updateContact(id: string, contactData: Partial<VendorContact>): Promise<VendorContact> {
  const { data, error } = await supabase
    .schema('common')
    .from('vendor_contacts')
    .update(contactData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating contact:', error);
    throw error;
  }

  return data;
}

// Delete a contact
export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('vendor_contacts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting contact:', error);
    throw error;
  }
}

// Create a contract
export async function createContract(vendorId: string, contractData: Omit<VendorContract, 'id' | 'vendor_id'>): Promise<VendorContract> {
  const { data, error } = await supabase
    .schema('common')
    .from('vendor_contracts')
    .insert({
      vendor_id: vendorId,
      ...contractData
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating contract:', error);
    throw error;
  }

  return data;
}

// Update a contract
export async function updateContract(id: string, contractData: Partial<VendorContract>): Promise<VendorContract> {
  const { data, error } = await supabase
    .schema('common')
    .from('vendor_contracts')
    .update(contractData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating contract:', error);
    throw error;
  }

  return data;
}

// Delete a contract
export async function deleteContract(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('vendor_contracts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting contract:', error);
    throw error;
  }
}
