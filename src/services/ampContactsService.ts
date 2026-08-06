import { supabase } from '@/lib/supabase';

export type AmpContact = {
  id: string;
  work_phone: string;
  name: string;
  email: string;
  role: string;
  display_order: number;
  /** Pinned ampOS account. Null means "match automatically by email, then name". */
  profile_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** A profile the call list can be pinned to. */
export type LinkableProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const CONTACT_COLUMNS =
  'id, work_phone, name, email, role, display_order, profile_id, created_at, updated_at';
// Without profile_id, for instances where add_amp_contacts_profile_id.sql has not run yet.
const CONTACT_COLUMNS_LEGACY =
  'id, work_phone, name, email, role, display_order, created_at, updated_at';

export async function fetchAmpContacts(): Promise<AmpContact[]> {
  const { data, error } = await supabase
    .schema('common')
    .from('amp_contacts')
    .select(CONTACT_COLUMNS)
    .order('display_order', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return [];
    }
    // 42703: profile_id column missing. Fall back so the list still loads.
    if (error.code === '42703') {
      const { data: legacy, error: legacyError } = await supabase
        .schema('common')
        .from('amp_contacts')
        .select(CONTACT_COLUMNS_LEGACY)
        .order('display_order', { ascending: true });
      if (legacyError) throw legacyError;
      return (legacy ?? []) as AmpContact[];
    }
    throw error;
  }
  return (data ?? []) as AmpContact[];
}

/** Accounts a call-list entry can be pinned to, for the HR call-list picker. */
export async function fetchLinkableProfiles(): Promise<LinkableProfile[]> {
  const { data, error } = await supabase
    .schema('common')
    .from('profiles')
    .select('id, full_name, email')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as LinkableProfile[];
}

/**
 * Normalize a person's name for matching: drop quoted/parenthesized nicknames
 * ('Nathan "GOAT" Ladner'), punctuation and middle initials, then keep just
 * first + last token so 'John A. Hammond' and 'John Hammond' agree.
 */
function nameKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/["'“”‘’].*?["'“”‘’]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z\s]/gi, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];
  return `${cleaned[0]} ${cleaned[cleaned.length - 1]}`;
}

/**
 * Map AMP contacts to ampOS user profiles so the contacts dropdown can open a
 * profile. A pinned profile_id always wins (that is how nicknames like
 * "Liam"/"William" get resolved). Otherwise email is the reliable key, and the
 * name fallback covers profiles whose email mirror is still blank (see
 * database/migrations/backfill_profiles_email.sql). Returns
 * { [contactId]: profileId }, omitting contacts with no account.
 */
export async function fetchContactProfileIds(
  contacts: AmpContact[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (contacts.length === 0) return map;

  const { data, error } = await supabase
    .schema('common')
    .from('profiles')
    .select('id, email, full_name');

  if (error || !data) return map;

  const profileIds = new Set((data as { id: string }[]).map((p) => p.id));
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  for (const p of data as { id: string; email: string | null; full_name: string | null }[]) {
    const email = p.email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, p.id);
    const key = nameKey(p.full_name);
    if (key) {
      // Two people sharing a name: don't guess, fall through to no link.
      if (byName.has(key) && byName.get(key) !== p.id) ambiguousNames.add(key);
      else byName.set(key, p.id);
    }
  }

  for (const c of contacts) {
    // A pin set in the HR call list beats anything we could infer.
    if (c.profile_id && profileIds.has(c.profile_id)) {
      map[c.id] = c.profile_id;
      continue;
    }
    const email = c.email?.trim().toLowerCase();
    const key = nameKey(c.name);
    const byNameId = key && !ambiguousNames.has(key) ? byName.get(key) : null;
    const profileId = (email && byEmail.get(email)) || byNameId || null;
    if (profileId) map[c.id] = profileId;
  }
  return map;
}

export async function upsertAmpContact(contact: Omit<AmpContact, 'created_at' | 'updated_at'>): Promise<AmpContact> {
  const payload: Record<string, unknown> = {
    work_phone: contact.work_phone,
    name: contact.name,
    email: contact.email,
    role: contact.role,
    display_order: contact.display_order ?? 0,
  };
  // Only touch the pin when the caller passed one, so callers that don't know
  // about linking can't clear it.
  if ('profile_id' in contact) {
    payload.profile_id = contact.profile_id || null;
  }
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
