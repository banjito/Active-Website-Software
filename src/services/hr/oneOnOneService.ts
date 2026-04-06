import { supabase } from '@/lib/supabase';

export interface KeyEvent {
  label: string;
  description: string;
}

export interface CounselItem {
  text: string;
  followUp: string;
}

export interface GoalItem {
  goal: string;
  dueDate: string;
  status: string;
  notes: string;
}

export interface OneOnOneCheckin {
  id: string;
  employee_id: string;
  manager_id: string;
  meeting_date: string;
  period_covered: string | null;
  overall_pulse: 'needs-attention' | 'on-track' | 'exceeding' | null;
  key_events: KeyEvent[];
  strengths: CounselItem[];
  development_areas: CounselItem[];
  goals: GoalItem[];
  employee_commitments: string[];
  manager_commitments: string[];
  additional_notes: string | null;
  employee_signature: string | null;
  manager_signature: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export type OneOnOneCheckinInsert = Omit<OneOnOneCheckin, 'id' | 'created_at' | 'updated_at'>;

function parseJsonField<T>(val: unknown, fallback: T[]): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : fallback; }
    catch { return fallback; }
  }
  return fallback;
}

function normalizeCheckin(row: any): OneOnOneCheckin {
  return {
    ...row,
    key_events: parseJsonField<KeyEvent>(row.key_events, []),
    strengths: parseJsonField<CounselItem>(row.strengths, []),
    development_areas: parseJsonField<CounselItem>(row.development_areas, []),
    goals: parseJsonField<GoalItem>(row.goals, []),
    employee_commitments: parseJsonField<string>(row.employee_commitments, []),
    manager_commitments: parseJsonField<string>(row.manager_commitments, []),
  };
}

export async function fetchCheckinsForEmployee(employeeId: string): Promise<OneOnOneCheckin[]> {
  const { data, error } = await supabase
    .schema('common')
    .from('one_on_one_checkins')
    .select('*')
    .eq('employee_id', employeeId)
    .order('meeting_date', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeCheckin);
}

export async function fetchCheckinById(id: string): Promise<OneOnOneCheckin | null> {
  const { data, error } = await supabase
    .schema('common')
    .from('one_on_one_checkins')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data ? normalizeCheckin(data) : null;
}

export async function createCheckin(checkin: OneOnOneCheckinInsert): Promise<OneOnOneCheckin> {
  const { data, error } = await supabase
    .schema('common')
    .from('one_on_one_checkins')
    .insert({
      ...checkin,
      key_events: checkin.key_events,
      strengths: checkin.strengths,
      development_areas: checkin.development_areas,
      goals: checkin.goals,
      employee_commitments: checkin.employee_commitments,
      manager_commitments: checkin.manager_commitments,
    })
    .select()
    .single();

  if (error) throw error;
  return normalizeCheckin(data);
}

export async function updateCheckin(id: string, updates: Partial<OneOnOneCheckinInsert>): Promise<OneOnOneCheckin> {
  const payload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .schema('common')
    .from('one_on_one_checkins')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalizeCheckin(data);
}

export async function deleteCheckin(id: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('one_on_one_checkins')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function signCheckinAsEmployee(id: string, signature: string): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('one_on_one_checkins')
    .update({ employee_signature: signature, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}
