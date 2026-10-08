import { supabase } from '@/lib/supabase';

/**
 * TimeStAMP weekly review. The database decides whose time you may see
 * (you, your direct reports, or everyone for payroll), so these calls only
 * ever return what the signed-in person is allowed to look at.
 */

export interface TimeReviewRow {
  profile_id: string;
  full_name: string | null;
  status: 'open' | 'submitted' | 'approved' | 'denied';
  hours: number;
  per_diem_days: number;
  miles: number;
  fixes: number;
  no_lunch_days: number;
  clocked_in: boolean;
  is_direct: boolean;
  is_ready: boolean;
  is_late: boolean;
  decided_by: string | null;
  decided_at: string | null;
  denied_note: string | null;
  denied_days: string[];
  extras_paid_at: string | null;
}

export interface TimeWeekDetail {
  entries: any[];
  extras: any[];
  changes: any[];
}

// Day strings are YYYY-MM-DD. Built from parts so the browser's time zone can't shift the day.
function addDays(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + count);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Everyone whose week (starting on the given Sunday) I may review, with totals and flags
 */
export async function getMyTimeReviews(weekStart: string): Promise<TimeReviewRow[]> {
  const { data, error } = await supabase
    .schema('common')
    .rpc('time_my_reviews', { p_week_start: weekStart });

  if (error) throw error;
  return (data ?? []) as TimeReviewRow[];
}

/**
 * One person's punches, per diem and miles, and punch fixes for a week
 */
export async function getTimeWeekDetail(profileId: string, weekStart: string): Promise<TimeWeekDetail> {
  const weekEnd = addDays(weekStart, 6);

  const [entries, extras, changes] = await Promise.all([
    supabase
      .schema('common')
      .from('time_entries')
      .select('id, work_date, clock_in_at, clock_out_at, counted_in_at, counted_out_at, ended_for, hours, fixed_at, time_jobs(name, customer_name, kind)')
      .eq('profile_id', profileId)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('clock_in_at'),
    supabase
      .schema('common')
      .from('time_day_extras')
      .select('work_date, per_diem, miles')
      .eq('profile_id', profileId)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd),
    supabase
      .schema('common')
      .from('time_entry_changes')
      .select('id, work_date, action, reason, changed_at')
      .eq('profile_id', profileId)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('changed_at'),
  ]);

  if (entries.error) throw entries.error;
  if (extras.error) throw extras.error;
  if (changes.error) throw changes.error;

  return { entries: entries.data ?? [], extras: extras.data ?? [], changes: changes.data ?? [] };
}

/**
 * Approve a week. expectedHours is the total on screen: if the hours changed since
 * the page loaded, the database refuses so nobody approves a number they never saw.
 */
export async function approveTimeWeek(profileId: string, weekStart: string, expectedHours: number): Promise<void> {
  const { error } = await supabase.schema('common').rpc('time_approve_week', {
    p_profile_id: profileId,
    p_week_start: weekStart,
    p_expected_hours: expectedHours,
  });

  if (error) throw error;
}

/**
 * Send a week back to the person with a note
 */
export async function denyTimeWeek(profileId: string, weekStart: string, note: string): Promise<void> {
  const { error } = await supabase.schema('common').rpc('time_deny_week', {
    p_profile_id: profileId,
    p_week_start: weekStart,
    p_note: note,
  });

  if (error) throw error;
}

/**
 * Unlock an approved week (payroll only)
 */
export async function reopenTimeWeek(profileId: string, weekStart: string, note: string): Promise<void> {
  const { error } = await supabase.schema('common').rpc('time_reopen_week', {
    p_profile_id: profileId,
    p_week_start: weekStart,
    p_note: note,
  });

  if (error) throw error;
}

// The server function holds the QuickBooks Time key. It answers expected failures with
// an `error` field instead of a failed request, so the reason can be shown.
async function callQuickBooksTime(body: Record<string, unknown>): Promise<any> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('quickbooks-time-api', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Send an approved week's hours to QuickBooks Time, one entry per day per job.
 * Safe to call again: anything already sent is skipped.
 */
export async function sendTimeWeekToQuickBooks(profileId: string, weekStart: string): Promise<void> {
  const result = await callQuickBooksTime({ action: 'send_week', profile_id: profileId, week_start: weekStart });
  if (result?.failed?.length) {
    throw new Error(`QuickBooks Time refused: ${result.failed.join(' | ')}`);
  }
}

/**
 * Take a week's entries back out of QuickBooks Time (payroll only). Needed before a reopen.
 */
export async function pullTimeWeekFromQuickBooks(profileId: string, weekStart: string): Promise<void> {
  await callQuickBooksTime({ action: 'unsend_week', profile_id: profileId, week_start: weekStart });
}

/**
 * For each person I can see that week: whether their hours reached QuickBooks Time
 */
export async function getTimeWeekSendStatus(
  weekStart: string
): Promise<Record<string, { qb_sent_at: string | null; qb_error: string | null }>> {
  const { data, error } = await supabase
    .schema('common')
    .from('time_weeks')
    .select('profile_id, qb_sent_at, qb_error')
    .eq('week_start', weekStart);

  if (error) throw error;

  const byPerson: Record<string, { qb_sent_at: string | null; qb_error: string | null }> = {};
  for (const row of data ?? []) {
    byPerson[row.profile_id] = { qb_sent_at: row.qb_sent_at, qb_error: row.qb_error };
  }
  return byPerson;
}

export interface TimePerson {
  profile_id: string;
  full_name: string | null;
  start_time: string | null;
  work_days: number[];
}

/**
 * Everyone who clocks in, with the start time and work days their phone alarm uses
 */
export async function getTimePeople(): Promise<TimePerson[]> {
  const { data, error } = await supabase
    .schema('common')
    .from('time_people')
    .select('profile_id, start_time, work_days')
    .eq('clocks_in', true);

  if (error) throw error;

  const ids = (data ?? []).map((p) => p.profile_id);
  if (ids.length === 0) return [];

  // time_people points at the login, not the profile, so names are a second lookup
  const { data: profiles, error: profileError } = await supabase
    .schema('common')
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);

  if (profileError) throw profileError;

  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  return (data ?? [])
    .map((p) => ({ ...p, work_days: p.work_days ?? [], full_name: names.get(p.profile_id) ?? null }))
    .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
}

/**
 * Set a person's start time (HH:MM, or null for no alarm) or work days (0 = Sunday)
 */
export async function updateTimePerson(
  profileId: string,
  changes: { start_time?: string | null; work_days?: number[] }
): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('time_people')
    .update(changes)
    .eq('profile_id', profileId);

  if (error) throw error;
}
