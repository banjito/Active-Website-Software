import { supabase } from '@/lib/supabase';

export type AmpContact = {
  id: string;
  work_phone: string;
  name: string;
  email: string;
  role: string;
  display_order: number;
  created_at?: string;
  updated_at?: string;
};

export async function fetchAmpContacts(): Promise<AmpContact[]> {
  const { data, error } = await supabase
    .schema('common')
    .from('amp_contacts')
    .select('id, work_phone, name, email, role, display_order, created_at, updated_at')
    .order('display_order', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return [];
    }
    throw error;
  }
  return (data ?? []) as AmpContact[];
}

export async function upsertAmpContact(contact: Omit<AmpContact, 'created_at' | 'updated_at'>): Promise<AmpContact> {
  const payload = {
    work_phone: contact.work_phone,
    name: contact.name,
    email: contact.email,
    role: contact.role,
    display_order: contact.display_order ?? 0,
  };
  if (contact.id) {
    const { data, error } = await supabase
      .schema('common')
      .from('amp_contacts')
      .update(payload)
      .eq('id', contact.id)
      .select()
      .single();
    if (error) throw error;
    return data as AmpContact;
  }
  const { data, error } = await supabase
    .schema('common')
    .from('amp_contacts')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as AmpContact;
}

export async function deleteAmpContact(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('amp_contacts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
