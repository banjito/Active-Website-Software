/**
 * Resolve recipients for scheduled ampOS digest emails.
 *
 * Two models live here. Company-wide digests opt everyone in: a user needs a
 * common.user_preferences row, and automatedEmails.<key> !== false subscribes them
 * (getDigestRecipientEmails). Targeted reports go to an admin-managed list held in
 * common.app_settings, with individual preferences overriding it either way
 * (getTargetedRecipientEmails). Keys in OPT_IN_ONLY use the second model.
 */

import { COMPANY_ACCOUNTING_EMAIL } from './companyConfig.ts';

export type DigestKey =
  | 'dailyReview'
  | 'dailyReadyToBill'
  | 'weeklyReports'
  | 'monthlyCalibration';

/**
 * Digests nobody is subscribed to by default. The three original digests opt everyone in
 * unless they say otherwise, which suits a company-wide summary; a targeted report goes
 * to a named list instead, so an unset preference means "not subscribed" here.
 */
const OPT_IN_ONLY: ReadonlySet<DigestKey> = new Set<DigestKey>([
  'monthlyCalibration',
]);

interface UserPreferenceRow {
  user_id: string;
  notification_preferences: unknown;
}

interface ProfileRow {
  id: string;
  email: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export function wantsDigest(
  notificationPreferences: unknown,
  digestKey: DigestKey
): boolean {
  const optInOnly = OPT_IN_ONLY.has(digestKey);
  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    return false;
  }
  const automated = (notificationPreferences as Record<string, unknown>).automatedEmails;
  if (automated === undefined || automated === null) {
    return !optInOnly;
  }
  if (typeof automated !== 'object') {
    return !optInOnly;
  }
  const val = (automated as Record<string, unknown>)[digestKey];
  if (val === undefined) return !optInOnly;
  return val === true;
}

/** Someone who has explicitly switched a digest off, whatever any list says. */
export function refusedDigest(
  notificationPreferences: unknown,
  digestKey: DigestKey
): boolean {
  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    return false;
  }
  const automated = (notificationPreferences as Record<string, unknown>).automatedEmails;
  if (!automated || typeof automated !== 'object') return false;
  return (automated as Record<string, unknown>)[digestKey] === false;
}

/** One entry of an admin-managed distribution list, as stored in common.app_settings. */
interface AudienceEmployee {
  id?: string;
  email?: string;
  name?: string;
}

/**
 * Recipients for a report that goes to a named list rather than to whoever opted in.
 *
 * The list is authoritative, but a person's own setting still wins in both directions:
 * someone on the list who switched the email off is dropped, and someone not on the list
 * who switched it on is added. That way the director can maintain the list without
 * anybody losing the ability to unsubscribe themselves.
 *
 * The settings row uses the same shape as announcement audiences:
 *   {"type": "selected", "employees": [{"id": "...", "email": "...", "name": "..."}]}
 */
export async function getTargetedRecipientEmails(
  supabase: SupabaseClient,
  digestKey: DigestKey,
  settingsKey: string,
  options?: { includeDivisionLeads?: boolean }
): Promise<string[]> {
  const emails = new Set<string>();
  const refusedEmails = new Set<string>();
  const refusedUserIds = new Set<string>();

  const { data: prefRows, error: prefError } = await supabase
    .schema('common')
    .from('user_preferences')
    .select('user_id, notification_preferences');

  if (prefError) {
    console.error('Failed to load user_preferences for targeted digest:', prefError);
    throw prefError;
  }

  const subscribedUserIds: string[] = [];
  for (const row of (prefRows ?? []) as UserPreferenceRow[]) {
    if (refusedDigest(row.notification_preferences, digestKey)) {
      refusedUserIds.add(row.user_id);
    } else if (wantsDigest(row.notification_preferences, digestKey)) {
      subscribedUserIds.push(row.user_id);
    }
  }

  // The admin-managed list.
  const { data: settingRow, error: settingError } = await supabase
    .schema('common')
    .from('app_settings')
    .select('value')
    .eq('key', settingsKey)
    .maybeSingle();

  if (settingError && settingError.code !== 'PGRST116') {
    console.error(`Failed to load ${settingsKey}:`, settingError);
  }

  const listed = (settingRow?.value?.employees ?? []) as AudienceEmployee[];
  for (const entry of listed) {
    if (entry?.id && refusedUserIds.has(entry.id)) continue;
    const email = entry?.email?.trim().toLowerCase();
    if (email) emails.add(email);
  }

  // Division leads, named on the division switcher in the sidebar. This is how "the
  // director and all the PMs" stays current without anyone maintaining a second list:
  // assigning a new project manager to a division subscribes them automatically.
  if (options?.includeDivisionLeads) {
    const { data: leadsRow, error: leadsError } = await supabase
      .schema('common')
      .from('app_settings')
      .select('value')
      .eq('key', 'division_leads')
      .maybeSingle();

    if (leadsError && leadsError.code !== 'PGRST116') {
      console.error('Failed to load division_leads:', leadsError);
    }

    const leads = (leadsRow?.value ?? {}) as Record<string, AudienceEmployee>;
    for (const lead of Object.values(leads)) {
      if (lead?.id && refusedUserIds.has(lead.id)) continue;
      const email = lead?.email?.trim().toLowerCase();
      if (email) emails.add(email);
    }
  }

  // Individual opt-ins from people not on the list.
  if (subscribedUserIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .schema('common')
      .from('profiles')
      .select('id, email')
      .in('id', subscribedUserIds);

    if (profileError) {
      console.error('Failed to load profiles for targeted digest:', profileError);
    } else {
      for (const profile of (profiles ?? []) as ProfileRow[]) {
        const email = profile.email?.trim();
        if (email) emails.add(email.toLowerCase());
      }
    }
  }

  // A refusal by someone whose profile is on the list under a different id still counts.
  if (refusedUserIds.size > 0) {
    const { data: refusedProfiles } = await supabase
      .schema('common')
      .from('profiles')
      .select('id, email')
      .in('id', [...refusedUserIds]);
    for (const profile of (refusedProfiles ?? []) as ProfileRow[]) {
      const email = profile.email?.trim().toLowerCase();
      if (email) refusedEmails.add(email);
    }
  }

  for (const email of refusedEmails) emails.delete(email);

  return [...emails];
}

/**
 * Emails for users subscribed to a digest (service-role client required).
 */
export async function getDigestRecipientEmails(
  supabase: SupabaseClient,
  digestKey: DigestKey,
  options?: { alwaysInclude?: string[] }
): Promise<string[]> {
  const { data: prefRows, error: prefError } = await supabase
    .schema('common')
    .from('user_preferences')
    .select('user_id, notification_preferences');

  if (prefError) {
    console.error('Failed to load user_preferences for digest:', prefError);
    throw prefError;
  }

  const subscribedUserIds = ((prefRows ?? []) as UserPreferenceRow[])
    .filter((row) => wantsDigest(row.notification_preferences, digestKey))
    .map((row) => row.user_id);

  const emails = new Set<string>();

  for (const extra of options?.alwaysInclude ?? []) {
    const trimmed = extra?.trim();
    if (trimmed) emails.add(trimmed.toLowerCase());
  }

  if (subscribedUserIds.length === 0) {
    return [...emails];
  }

  const { data: profiles, error: profileError } = await supabase
    .schema('common')
    .from('profiles')
    .select('id, email')
    .in('id', subscribedUserIds);

  if (profileError) {
    console.error('Failed to load profiles for digest recipients:', profileError);
    throw profileError;
  }

  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const email = profile.email?.trim();
    if (email) emails.add(email.toLowerCase());
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const missingProfileIds = subscribedUserIds.filter(
    (id) => !(profiles ?? []).some((p: ProfileRow) => p.id === id && p.email?.trim())
  );

  if (missingProfileIds.length > 0 && supabaseUrl && serviceKey) {
    for (const userId of missingProfileIds) {
      try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          const authEmail = userData?.email?.trim();
          if (authEmail) emails.add(authEmail.toLowerCase());
        }
      } catch (err) {
        console.warn(`Auth admin lookup failed for user ${userId}:`, err);
      }
    }
  }

  return [...emails];
}

export function getAccountingDigestEmail(): string {
  return COMPANY_ACCOUNTING_EMAIL;
}
