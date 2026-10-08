import * as Crypto from 'expo-crypto';
import { Entry } from './clock';
import { db, supabase } from './supabase';

export type WeekEntry = Entry & { fixed_at: string | null };

export type MyWeek = {
  entries: WeekEntry[];
  extras: { work_date: string; per_diem: boolean; miles: number }[];
  status: 'open' | 'submitted' | 'approved' | 'denied';
  deniedNote: string | null;
};

// Day strings are YYYY-MM-DD. Built from parts so the time zone can't shift the day.
export const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseYmd = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (day: string, count: number) => {
  const d = parseYmd(day);
  d.setDate(d.getDate() + count);
  return toYmd(d);
};

// Weeks run Sunday to Saturday, same as payroll
export const weekStartOf = (day: string) => {
  const d = parseYmd(day);
  d.setDate(d.getDate() - d.getDay());
  return toYmd(d);
};

// A time of day on a given day, in the form the database wants
export const atTime = (day: string, hours: number, minutes: number) => {
  const d = parseYmd(day);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

async function myId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return session.user.id;
}

/**
 * My punches, per diem and miles, and where the week stands with my approver
 */
export async function getMyWeek(weekStart: string): Promise<MyWeek> {
  const me = await myId();
  const weekEnd = addDays(weekStart, 6);

  const [entries, extras, week] = await Promise.all([
    db
      .from('time_entries')
      .select('id, work_date, qb_time_jobcode_id, clock_in_at, clock_out_at, counted_in_at, counted_out_at, ended_for, hours, fixed_at, time_jobs(qb_time_jobcode_id, name, customer_name, kind)')
      .eq('profile_id', me)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('clock_in_at'),
    db
      .from('time_day_extras')
      .select('work_date, per_diem, miles')
      .eq('profile_id', me)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd),
    db
      .from('time_weeks')
      .select('status, denied_note')
      .eq('profile_id', me)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ]);

  if (entries.error) throw entries.error;
  if (extras.error) throw extras.error;
  if (week.error) throw week.error;

  return {
    entries: (entries.data ?? []) as unknown as WeekEntry[],
    extras: (extras.data ?? []).map((x: any) => ({ ...x, miles: Number(x.miles ?? 0) })),
    // No row yet means nobody has touched the week
    status: (week.data?.status ?? 'open') as MyWeek['status'],
    deniedNote: week.data?.denied_note ?? null,
  };
}

export async function submitWeek(weekStart: string): Promise<void> {
  const { error } = await db.rpc('time_submit_week', { p_week_start: weekStart });
  if (error) throw error;
}

/**
 * Change a punch's real in or out time. Leave one empty to keep it. The database
 * rounds again and keeps a record of the change with the reason.
 */
export async function fixPunch(
  entryId: string,
  clockInAt: string | null,
  clockOutAt: string | null,
  reason: string
): Promise<void> {
  const { error } = await db.rpc('time_fix_entry', {
    p_entry_id: entryId,
    p_clock_in_at: clockInAt,
    p_clock_out_at: clockOutAt,
    p_jobcode_id: null,
    p_reason: reason,
    p_ended_for: null,
  });
  if (error) throw error;
}

/**
 * Add a stretch that was never punched
 */
export async function addPunch(
  workDate: string,
  jobcodeId: number,
  clockInAt: string,
  clockOutAt: string,
  reason: string
): Promise<void> {
  const { error } = await db.rpc('time_add_entry', {
    p_entry_id: Crypto.randomUUID(),
    p_profile_id: null,
    p_work_date: workDate,
    p_jobcode_id: jobcodeId,
    p_clock_in_at: clockInAt,
    p_clock_out_at: clockOutAt,
    p_reason: reason,
    p_from: 'day',
    p_for: 'day',
  });
  if (error) throw error;
}

export async function removePunch(entryId: string, reason: string): Promise<void> {
  const { error } = await db.rpc('time_remove_entry', { p_entry_id: entryId, p_reason: reason });
  if (error) throw error;
}
