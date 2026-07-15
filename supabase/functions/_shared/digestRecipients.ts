/**
 * Resolve per-user recipients for scheduled ampOS digest emails.
 * Users must have a common.user_preferences row; automatedEmails.<key> !== false opts in.
 */

import { COMPANY_ACCOUNTING_EMAIL } from './companyConfig.ts';

export type DigestKey = 'dailyReview' | 'dailyReadyToBill' | 'weeklyReports';

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
  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    return false;
  }
  const automated = (notificationPreferences as Record<string, unknown>).automatedEmails;
  if (automated === undefined || automated === null) {
    return true;
  }
  if (typeof automated !== 'object') {
    return true;
  }
  const val = (automated as Record<string, unknown>)[digestKey];
  return val !== false;
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
