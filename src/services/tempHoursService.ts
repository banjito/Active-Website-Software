import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';

/**
 * Temp hours (PM scope item 7): agencies, their temps, and each temp's weekly total
 * hours by job. Sent to the agency by the temp-hours-email edge function. Never sent
 * to QuickBooks. Tables: database/migrations/temp_hours.sql.
 */

export interface TempAgency {
  id: string;
  name: string;
  recipients: string[];
  active: boolean;
}

export interface TempWorker {
  id: string;
  agency_id: string;
  name: string;
  active: boolean;
}

export interface TempHourLine {
  id: string;
  week_start: string;
  worker_id: string;
  job_id: string;
  hours: number;
}

export interface TempWeekSend {
  agency_id: string;
  sent_at: string;
  sent_to: string[];
  total_hours: number | null;
}

/** Thrown when temp_hours.sql hasn't been run, so the tab can say so. */
export class TempHoursSetupMissingError extends Error {}

const ops = () => supabase.schema('neta_ops');

const isMissing = (error: { code?: string } | null) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202');

const fail = (error: any, status?: number): never => {
  if (isMissing(error)) throw new TempHoursSetupMissingError('Run database/migrations/temp_hours.sql first.');
  throw new Error(describeSupabaseError(error, status));
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The Sunday that starts the week holding this day (weeks run Sunday to Saturday). */
export function weekStartOf(d: Date = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return ymd(copy);
}

export function shiftWeek(weekStart: string, by: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + by * 7));
}

export function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const short = (x: Date) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${short(start)} to ${short(end)}, ${end.getFullYear()}`;
}

export async function fetchTempSetup(): Promise<{ agencies: TempAgency[]; workers: TempWorker[] }> {
  const [a, w] = await Promise.all([
    ops().from('temp_agencies').select('id, name, recipients, active').order('name'),
    ops().from('temp_workers').select('id, agency_id, name, active').order('name'),
  ]);
  if (a.error) fail(a.error, a.status);
  if (w.error) fail(w.error, w.status);
  return {
    agencies: ((a.data ?? []) as TempAgency[]).map((x) => ({ ...x, recipients: x.recipients ?? [] })),
    workers: (w.data ?? []) as TempWorker[],
  };
}

/** Saves agencies and temps from the settings dialog, and removes the ones taken off. */
export async function saveTempSetup(
  agencies: TempAgency[],
  workers: TempWorker[],
  removed: { agencyIds: string[]; workerIds: string[] },
  userId?: string,
): Promise<void> {
  if (agencies.length) {
    const { error, status } = await withWriteRetry(
      () =>
        ops()
          .from('temp_agencies')
          .upsert(
            agencies.map((a) => ({
              id: a.id,
              name: a.name.trim(),
              recipients: a.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean),
              active: a.active,
              updated_at: new Date().toISOString(),
              updated_by: userId ?? null,
            })),
            { onConflict: 'id' },
          ),
      { label: 'save temp agencies' },
    );
    if (error) fail(error, status);
  }
  if (workers.length) {
    const { error, status } = await withWriteRetry(
      () =>
        ops()
          .from('temp_workers')
          .upsert(
            workers.map((w) => ({ id: w.id, agency_id: w.agency_id, name: w.name.trim(), active: w.active })),
            { onConflict: 'id' },
          ),
      { label: 'save temps' },
    );
    if (error) fail(error, status);
  }
  if (removed.workerIds.length) {
    const { error, status } = await ops().from('temp_workers').delete().in('id', removed.workerIds);
    if (error) fail(error, status);
  }
  if (removed.agencyIds.length) {
    const { error, status } = await ops().from('temp_agencies').delete().in('id', removed.agencyIds);
    if (error) fail(error, status);
  }
}

/** This week's hour rows on the jobs you can see. */
export async function fetchTempLines(weekStart: string): Promise<TempHourLine[]> {
  const { data, error, status } = await ops()
    .from('temp_hour_lines')
    .select('id, week_start, worker_id, job_id, hours')
    .eq('week_start', weekStart)
    .order('created_at');
  if (error) fail(error, status);
  return ((data ?? []) as any[]).map((l) => ({ ...l, hours: Number(l.hours) || 0 }));
}

export async function saveTempLines(lines: TempHourLine[], removedIds: string[]): Promise<void> {
  const rows = lines.filter((l) => l.worker_id && l.job_id);
  if (rows.length) {
    const { error, status } = await withWriteRetry(
      () =>
        ops()
          .from('temp_hour_lines')
          .upsert(
            rows.map((l) => ({
              id: l.id,
              week_start: l.week_start,
              worker_id: l.worker_id,
              job_id: l.job_id,
              hours: l.hours,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'id' },
          ),
      { label: 'save temp hours' },
    );
    if (error) {
      if ((error as any).code === '23505') throw new Error('The same temp is on the same job twice this week. Combine those rows.');
      fail(error, status);
    }
  }
  if (removedIds.length) {
    const { error, status } = await ops().from('temp_hour_lines').delete().in('id', removedIds);
    if (error) fail(error, status);
  }
}

export async function fetchWeekSends(weekStart: string): Promise<Record<string, TempWeekSend>> {
  const { data, error, status } = await ops()
    .from('temp_hour_weeks')
    .select('agency_id, sent_at, sent_to, total_hours')
    .eq('week_start', weekStart);
  if (error) fail(error, status);
  const out: Record<string, TempWeekSend> = {};
  for (const row of (data ?? []) as TempWeekSend[]) out[row.agency_id] = row;
  return out;
}

/** Emails the agency the week's hours for all its temps, every PM's jobs combined. */
export async function sendTempHours(weekStart: string, agencyId: string): Promise<{ sentTo: string[]; totalHours: number }> {
  const { data, error } = await supabase.functions.invoke('temp-hours-email', { body: { weekStart, agencyId } });
  if (error) {
    const response = (error as any)?.context;
    if (response instanceof Response) {
      const body = await response.clone().json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
