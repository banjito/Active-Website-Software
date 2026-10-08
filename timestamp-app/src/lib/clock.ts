import * as Crypto from 'expo-crypto';
import { db, supabase } from './supabase';

export type Job = {
  qb_time_jobcode_id: number;
  name: string;
  customer_name: string | null;
  kind: string;
};

export type Entry = {
  id: string;
  work_date: string;
  qb_time_jobcode_id: number;
  clock_in_at: string;
  clock_out_at: string | null;
  counted_in_at: string;
  counted_out_at: string | null;
  ended_for: 'day' | 'lunch' | 'switch' | null;
  hours: number | null;
  time_jobs: { name: string; customer_name: string | null; kind: string } | null;
};

export type MyDay = {
  open: Entry | null;
  last: Entry | null;
  atLunch: boolean;
  todayHours: number;
  todayEntries: Entry[];
  recentJobs: Job[];
};

const JOB_FIELDS = 'qb_time_jobcode_id, name, customer_name, kind';

// The day on the phone, as YYYY-MM-DD. Built from parts so the time zone can't shift it.
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function jobLabel(job: { name: string; customer_name: string | null } | null): string {
  if (!job) return 'Unknown job';
  return job.customer_name ? `${job.customer_name}: ${job.name}` : job.name;
}

// "26015 - Core Scientific DNN4" -> the number and the name, shown apart
export function jobParts(job: { name: string; kind?: string } | null): { code: string; title: string } {
  if (!job) return { code: '', title: 'Unknown job' };
  if (job.kind === 'shop') return { code: 'Shop', title: 'Not on a job' };
  if (job.kind === 'training') return { code: 'Training', title: 'Not on a job' };
  const match = job.name.match(/^\s*(\d+)\s*-?\s*(.*)$/);
  return match ? { code: match[1], title: match[2] || job.name } : { code: '', title: job.name };
}

export function entryJob(entry: Entry | null): Job | null {
  if (!entry?.time_jobs) return null;
  return { qb_time_jobcode_id: entry.qb_time_jobcode_id, ...entry.time_jobs };
}

/**
 * Where I stand right now: on the clock, at lunch, or out, plus today's counted hours
 */
export async function getMyDay(): Promise<MyDay> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  // Bosses and payroll can read other people's punches, so ask for mine only
  const { data, error } = await db
    .from('time_entries')
    .select(`id, work_date, qb_time_jobcode_id, clock_in_at, clock_out_at, counted_in_at, counted_out_at, ended_for, hours, time_jobs(${JOB_FIELDS})`)
    .eq('profile_id', session.user.id)
    .order('clock_in_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  const entries = (data ?? []) as unknown as Entry[];
  const open = entries.find((e) => !e.clock_out_at) ?? null;
  const last = entries[0] ?? null;
  const day = today();

  // Last few different jobs, newest first, for one-tap picking
  const recentJobs: Job[] = [];
  for (const entry of entries) {
    const job = entryJob(entry);
    if (job && !recentJobs.some((j) => j.qb_time_jobcode_id === job.qb_time_jobcode_id)) recentJobs.push(job);
    if (recentJobs.length === 4) break;
  }

  return {
    open,
    last,
    recentJobs,
    todayEntries: entries.filter((e) => e.work_date === day).reverse(),
    atLunch: !open && last?.ended_for === 'lunch' && last.work_date === day,
    todayHours: entries
      .filter((e) => e.work_date === day)
      .reduce((sum, e) => sum + Number(e.hours ?? 0), 0),
  };
}

/**
 * Shop and Training, shown as one-tap picks
 */
export async function getQuickJobs(): Promise<Job[]> {
  const { data, error } = await db
    .from('time_jobs')
    .select(JOB_FIELDS)
    .eq('active', true)
    .in('kind', ['shop', 'training'])
    .order('kind');

  if (error) throw error;
  return (data ?? []) as Job[];
}

/**
 * Find jobs by number, name, or customer
 */
export async function searchJobs(text: string): Promise<Job[]> {
  // Commas and brackets would break the filter below
  const clean = text.replace(/[,()%*\\]/g, ' ').trim();
  if (clean.length < 2) return [];

  const { data, error } = await db
    .from('time_jobs')
    .select(JOB_FIELDS)
    .eq('active', true)
    .eq('kind', 'job')
    // Customers are in the list too. Only real jobs start with a job number.
    .not('job_number', 'is', null)
    .or(`name.ilike.%${clean}%,customer_name.ilike.%${clean}%`)
    .order('name', { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as Job[];
}

/**
 * My per diem and miles for one day
 */
export async function getDayExtras(workDate: string): Promise<{ per_diem: boolean; miles: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const { data, error } = await db
    .from('time_day_extras')
    .select('per_diem, miles')
    .eq('profile_id', session.user.id)
    .eq('work_date', workDate)
    .maybeSingle();

  if (error) throw error;
  return { per_diem: !!data?.per_diem, miles: Number(data?.miles ?? 0) };
}

/**
 * Save per diem and miles for a day, tagged to the job worked. The database refuses
 * once the week is approved.
 */
export async function saveDayExtras(
  workDate: string,
  perDiem: boolean,
  miles: number,
  jobcodeId: number | null
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const { error } = await db.from('time_day_extras').upsert(
    {
      profile_id: session.user.id,
      work_date: workDate,
      per_diem: perDiem,
      miles,
      qb_time_jobcode_id: jobcodeId,
    },
    { onConflict: 'profile_id,work_date' }
  );

  if (error) throw error;
}

// The phone makes the entry's ID, so a punch sent twice on a bad signal is saved once.
// The database does the quarter-hour rounding.

export async function clockIn(jobcodeId: number, from: 'day' | 'lunch', workDate: string): Promise<void> {
  const { error } = await db.rpc('time_clock_in', {
    p_entry_id: Crypto.randomUUID(),
    p_jobcode_id: jobcodeId,
    p_at: new Date().toISOString(),
    p_work_date: workDate,
    p_from: from,
  });
  if (error) throw error;
}

export async function clockOut(endedFor: 'day' | 'lunch'): Promise<void> {
  const { error } = await db.rpc('time_clock_out', {
    p_at: new Date().toISOString(),
    p_for: endedFor,
  });
  if (error) throw error;
}

export async function switchJob(jobcodeId: number, workDate: string): Promise<void> {
  const { error } = await db.rpc('time_switch_job', {
    p_entry_id: Crypto.randomUUID(),
    p_jobcode_id: jobcodeId,
    p_at: new Date().toISOString(),
    p_work_date: workDate,
  });
  if (error) throw error;
}
