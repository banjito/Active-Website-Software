import { supabase } from '@/lib/supabase';

// Types
export interface VendorPOItem {
  id?: string;
  po_id?: string;
  item_number: string;
  quantity: string | number;
  description: string;
  unit_price: string | number;
  extended_price: number;
}

export interface VendorPO {
  id: string;
  po_number: string;
  vendor_id: string | null;
  date: string;
  amount: number;
  terms: string;
  quote_number: string;
  quote_references: string;
  ship_to_name: string;
  ship_to_address: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  status: 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled';
  notes: string;
  authorized_by: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  items?: VendorPOItem[];
  vendor?: {
    id: string;
    company_name: string;
    address_street: string;
    address_city: string;
    address_state: string;
    address_zip: string;
    phone: string;
    email: string;
  };
}

export interface VendorPOFormData {
  vendor_id: string | null;
  date: string;
  terms: string;
  quote_number: string;
  quote_references: string;
  ship_to_name: string;
  ship_to_address: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  status: 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled';
  notes: string;
  authorized_by: string;
  items: VendorPOItem[];
}

// Get next PO number
export async function getNextPONumber(): Promise<string> {
  const { data, error } = await supabase
    .schema('common')
    .rpc('nextval', { seq_name: 'vendor_po_number_seq' });

  if (error) {
    // Fallback: generate based on timestamp
    console.error('Error getting next PO number:', error);
    return `PO-${Date.now().toString().slice(-6)}`;
  }

  return `#${data}`;
}

// Fetch all vendor POs with items and vendor info
export async function fetchVendorPOs(): Promise<VendorPO[]> {
  const { data: pos, error } = await supabase
    .schema('common')
    .from('vendor_pos')
    .select(`
      *,
      vendor:vendor_id (
        id,
        company_name,
        address_street,
        address_city,
        address_state,
        address_zip,
        phone,
        email
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching vendor POs:', error);
    throw error;
  }

  if (!pos || pos.length === 0) {
    return [];
  }

  // Fetch items for all POs
  const poIds = pos.map(p => p.id);
  const { data: items, error: itemsError } = await supabase
    .schema('common')
    .from('vendor_po_items')
    .select('*')
    .in('po_id', poIds)
    .order('item_number');

  if (itemsError) {
    console.error('Error fetching PO items:', itemsError);
  }

  const itemsByPO: Record<string, VendorPOItem[]> = {};
  if (items) {
    items.forEach(item => {
      if (!itemsByPO[item.po_id]) {
        itemsByPO[item.po_id] = [];
      }
      itemsByPO[item.po_id].push(item);
    });
  }

  return pos.map(po => ({
    ...po,
    items: itemsByPO[po.id] || []
  }));
}

// Create a new vendor PO
export async function createVendorPO(poData: VendorPOFormData, userId?: string): Promise<VendorPO> {
  // Calculate total amount
  const totalAmount = poData.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);

  // Get next PO number
  const poNumber = await getNextPONumber();

  // Insert PO
  const { data: po, error: poError } = await supabase
    .schema('common')
    .from('vendor_pos')
    .insert({
      po_number: poNumber,
      vendor_id: poData.vendor_id,
      date: poData.date,
      amount: totalAmount,
      terms: poData.terms,
      quote_number: poData.quote_number,
      quote_references: poData.quote_references,
      ship_to_name: poData.ship_to_name,
      ship_to_address: poData.ship_to_address,
      ship_to_city: poData.ship_to_city,
      ship_to_state: poData.ship_to_state,
      ship_to_zip: poData.ship_to_zip,
      status: poData.status,
      notes: poData.notes,
      authorized_by: poData.authorized_by,
      created_by: userId
    })
    .select()
    .single();

  if (poError) {
    console.error('Error creating vendor PO:', poError);
    throw poError;
  }

  // Insert line items
  if (poData.items.length > 0) {
    const itemsToInsert = poData.items.map((item, index) => ({
      po_id: po.id,
      item_number: index + 1,
      quantity: item.quantity,
      description: item.description,
      unit_price: item.unit_price,
      extended_price: item.quantity * item.unit_price
    }));

    const { error: itemsError } = await supabase
      .schema('common')
      .from('vendor_po_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Error creating PO items:', itemsError);
      throw itemsError;
    }
  }

  return { ...po, items: poData.items };
}

// Update a vendor PO
export async function updateVendorPO(id: string, poData: Partial<VendorPOFormData>): Promise<VendorPO> {
  // Calculate total amount if items provided
  const totalAmount = poData.items?.reduce((sum, item) => sum + (item.extended_price || 0), 0);

  const updateData: any = {
    vendor_id: poData.vendor_id,
    date: poData.date,
    terms: poData.terms,
    quote_number: poData.quote_number,
    quote_references: poData.quote_references,
    ship_to_name: poData.ship_to_name,
    ship_to_address: poData.ship_to_address,
    ship_to_city: poData.ship_to_city,
    ship_to_state: poData.ship_to_state,
    ship_to_zip: poData.ship_to_zip,
    status: poData.status,
    notes: poData.notes,
    authorized_by: poData.authorized_by
  };

  if (totalAmount !== undefined) {
    updateData.amount = totalAmount;
  }

  const { data: po, error: poError } = await supabase
    .schema('common')
    .from('vendor_pos')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (poError) {
    console.error('Error updating vendor PO:', poError);
    throw poError;
  }

  // Update items if provided
  if (poData.items) {
    // Delete existing items
    await supabase
      .schema('common')
      .from('vendor_po_items')
      .delete()
      .eq('po_id', id);

    // Insert new items
    if (poData.items.length > 0) {
      const itemsToInsert = poData.items.map((item, index) => ({
        po_id: id,
        item_number: index + 1,
        quantity: item.quantity,
        description: item.description,
        unit_price: item.unit_price,
        extended_price: item.quantity * item.unit_price
      }));

      await supabase
        .schema('common')
        .from('vendor_po_items')
        .insert(itemsToInsert);
    }
  }

  return { ...po, items: poData.items || [] };
}

// Delete a vendor PO
export async function deleteVendorPO(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('vendor_pos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting vendor PO:', error);
    throw error;
  }
}

// Update PO status
export async function updateVendorPOStatus(id: string, status: VendorPO['status']): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('vendor_pos')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating PO status:', error);
    throw error;
  }
}

