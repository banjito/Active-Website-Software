import { supabase } from '../lib/supabase';

// An "interaction" is a logged contact note (call / email / in person) attached
// to a customer and one of its contacts. Stored in common.contact_notes.
export type InteractionType = 'call' | 'email' | 'in_person';

export interface ContactNote {
  id: string;
  contact_id: string;
  customer_id: string;
  author_email: string;
  contact_display_name: string;
  note_type: string;
  occurred_at: string;
  context: string;
  created_at: string;
}

// A contact note enriched with the customer's display name for feed views.
export interface InteractionFeedItem extends ContactNote {
  customer_name: string;
}

export interface NewInteraction {
  customer_id: string;
  contact_id: string;
  contact_display_name: string;
  author_email: string;
  note_type: InteractionType | string;
  context: string;
  occurred_at?: string;
}

export const INTERACTION_TYPE_LABELS: Record<string, string> = {
  call: 'Call',
  email: 'Email',
  in_person: 'In Person',
};

export function interactionTypeLabel(type: string): string {
  return INTERACTION_TYPE_LABELS[type] || 'Note';
}

export interface AuthorProfile {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  userId: string | null;
}

/**
 * Resolve display name + avatar for a set of author emails (from common.profiles),
 * keyed by lowercased email. Used to show who logged each interaction.
 */
export async function getAuthorProfilesByEmail(
  emails: string[],
): Promise<Map<string, AuthorProfile>> {
  const unique = [
    ...new Set(emails.map((e) => (e || '').toLowerCase().trim()).filter(Boolean)),
  ];
  const map = new Map<string, AuthorProfile>();
  if (unique.length === 0) return map;

  try {
    const { data, error } = await supabase
      .schema('common')
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('email', unique);
    if (error) {
      console.warn('Failed to load author profiles:', error.message);
      return map;
    }
    for (const row of data || []) {
      const r = row as {
        id: string;
        full_name?: string | null;
        email?: string | null;
        avatar_url?: string | null;
      };
      if (!r.email) continue;
      map.set(r.email.toLowerCase(), {
        email: r.email,
        displayName: r.full_name || r.email.split('@')[0],
        avatarUrl: r.avatar_url || null,
        userId: r.id || null,
      });
    }
  } catch (e) {
    console.warn('Failed to load author profiles', e);
  }
  return map;
}

/**
 * Fetch the most recent interactions across all customers/contacts, enriched
 * with the customer company name for display in the Interactions Feed.
 */
export async function getRecentInteractions(limit = 50): Promise<InteractionFeedItem[]> {
  const { data: notes, error } = await supabase
    .schema('common')
    .from('contact_notes')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!notes || notes.length === 0) return [];

  // Enrich with customer names in a single lookup.
  const customerIds = Array.from(new Set(notes.map((n) => n.customer_id).filter(Boolean)));
  const nameById: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .schema('common')
      .from('customers')
      .select('id, company_name, name')
      .in('id', customerIds);
    (customers || []).forEach((c: { id: string; company_name?: string; name?: string }) => {
      nameById[c.id] = c.company_name || c.name || 'Unknown Customer';
    });
  }

  return notes.map((n) => ({
    ...(n as ContactNote),
    customer_name: nameById[n.customer_id] || 'Unknown Customer',
  }));
}

/**
 * Log a new interaction (contact note).
 */
export async function createInteraction(payload: NewInteraction): Promise<ContactNote> {
  const { data, error } = await supabase
    .schema('common')
    .from('contact_notes')
    .insert({
      contact_id: payload.contact_id,
      customer_id: payload.customer_id,
      author_email: payload.author_email,
      contact_display_name: payload.contact_display_name,
      note_type: payload.note_type,
      context: payload.context.trim(),
      occurred_at: payload.occurred_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as ContactNote;
}

/**
 * Fetch the contacts belonging to a customer (for the quick-log widget).
 */
export async function getContactsForCustomer(
  customerId: string,
): Promise<{ id: string; first_name: string; last_name: string; is_primary?: boolean }[]> {
  const { data, error } = await supabase
    .schema('common')
    .from('contacts')
    .select('id, first_name, last_name, is_primary')
    .eq('customer_id', customerId)
    .order('is_primary', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Lightweight customer search for the quick-log widget combobox.
 */
export async function searchCustomers(
  term: string,
  limit = 10,
): Promise<{ id: string; company_name: string; name: string }[]> {
  let query = supabase
    .schema('common')
    .from('customers')
    .select('id, company_name, name')
    .order('company_name', { ascending: true })
    .limit(limit);

  const search = term.trim();
  if (search) {
    const like = `%${search}%`;
    query = query.or(`name.ilike.${like},company_name.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
