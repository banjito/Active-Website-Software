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

export type AmpContactsSyncResult = {
  success: boolean;
  total: number;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
};

export async function syncAmpContactsFromSheet(): Promise<AmpContactsSyncResult> {
  const { data, error } = await supabase.functions.invoke('sync-amp-contacts', { body: {} });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Sync failed');
  return data as AmpContactsSyncResult;
}

export type AmpContactsPushResult = {
  success: boolean;
  total: number;
  inserted: number;
  updated: number;
  removed: number;
  unchanged: number;
  target: 'google-sheet' | 'xlsx';
  /** false for .xlsx files: SheetJS keeps every value but flattens cell styling. */
  formattingPreserved: boolean;
};

/** Push the ampOS list back into the Google Drive phone list (ampOS wins). */
export async function pushAmpContactsToSheet(force = false): Promise<AmpContactsPushResult> {
  const { data, error } = await supabase.functions.invoke('push-amp-contacts', {
    body: force ? { force: true } : {},
  });
  if (error) {
    // Edge function errors carry the useful message in the response body.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || 'Push failed');
  }
  if (!data?.success) throw new Error(data?.error || 'Push failed');
  return data as AmpContactsPushResult;
}

export async function deleteAmpContact(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('amp_contacts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
