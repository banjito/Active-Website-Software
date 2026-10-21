import { addDays, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';

// Project checklist: steps every job goes through (contract signed, COI issued, ...).
// Tables are in database/migrations/job_checklist.sql. A job has no item row until
// someone acts on a step, so "no row" means open.

export type ChecklistPhase = 'Sales' | 'Setup' | 'Field' | 'Closeout';
export const CHECKLIST_PHASES: ChecklistPhase[] = ['Sales', 'Setup', 'Field', 'Closeout'];

export type DueAnchor = 'contract' | 'start' | 'end';
export type AutoRule = 'lead_assigned' | 'quickbooks_linked' | 'job_billed';
export type ItemState = 'open' | 'done' | 'na';

export interface ChecklistStep {
  id: string;
  key: string | null;
  name: string;
  phase: ChecklistPhase;
  sort_order: number;
  due_anchor: DueAnchor | null;
  due_offset_days: number;
  auto_rule: AutoRule | null;
  archived_at: string | null;
}

export interface ChecklistItem {
  id: string;
  job_id: string;
  step_id: string;
  state: ItemState;
  done_at: string | null;
  done_by: string | null;
  done_by_name: string | null;
  note: string | null;
}

/** The job fields that drive due dates and the self-ticking steps */
export interface ChecklistJobFacts {
  id: string;
  status: string | null;
  fireteam_lead: string | null;
  quickbooks_project_id: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
}

export const AUTO_RULE_LABELS: Record<AutoRule, string> = {
  lead_assigned: 'A lead is set on the job',
  quickbooks_linked: 'Job is linked to QuickBooks',
  job_billed: 'Job is marked Billed',
};

export const DUE_ANCHOR_LABELS: Record<DueAnchor, string> = {
  contract: 'contract signed',
  start: 'job start',
  end: 'job end',
};

// "Contract signed" is the anchor for the 'contract' due rule
const CONTRACT_STEP_KEY = 'contract_signed';

const STEP_COLUMNS =
  'id, key, name, phase, sort_order, due_anchor, due_offset_days, auto_rule, archived_at';
const ITEM_COLUMNS = 'id, job_id, step_id, state, done_at, done_by, done_by_name, note';
const FACT_COLUMNS =
  'id, status, fireteam_lead, quickbooks_project_id, start_date, due_date, completed_date';

// Keeps .in() lists short enough for the URL
const ID_CHUNK = 150;

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += ID_CHUNK) out.push(list.slice(i, i + ID_CHUNK));
  return out;
}

/** True when the migration has not been run yet */
export function isChecklistSetupMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /could not find the table/i.test(error.message ?? '');
}

export async function fetchChecklistSteps(includeArchived = false): Promise<ChecklistStep[]> {
  let query = supabase.schema('neta_ops').from('job_checklist_steps').select(STEP_COLUMNS);
  if (!includeArchived) query = query.is('archived_at', null);
  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) {
    if (isChecklistSetupMissing(error)) throw new ChecklistSetupMissingError();
    throw new Error(describeSupabaseError(error));
  }
  return (data ?? []) as ChecklistStep[];
}

export class ChecklistSetupMissingError extends Error {
  constructor() {
    super('Checklist database setup has not been run (database/migrations/job_checklist.sql).');
  }
}

export async function fetchChecklistItems(jobIds: string[]): Promise<ChecklistItem[]> {
  const out: ChecklistItem[] = [];
  for (const ids of chunks(jobIds)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_checklist_items')
      .select(ITEM_COLUMNS)
      .in('job_id', ids);
    if (error) {
      if (isChecklistSetupMissing(error)) throw new ChecklistSetupMissingError();
      throw new Error(describeSupabaseError(error));
    }
    out.push(...((data ?? []) as ChecklistItem[]));
  }
  return out;
}

export async function fetchChecklistJobFacts(jobIds: string[]): Promise<ChecklistJobFacts[]> {
  const out: ChecklistJobFacts[] = [];
  for (const ids of chunks(jobIds)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select(FACT_COLUMNS)
      .in('id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    out.push(...((data ?? []) as ChecklistJobFacts[]));
  }
  return out;
}

export interface ChecklistActor {
  id: string;
  name: string | null;
}

/**
 * Sets a step's state and/or note on one job. Upserts on (job_id, step_id), so a save
 * sent twice lands on the same row.
 */
export async function saveChecklistItem(
  jobId: string,
  stepId: string,
  current: ChecklistItem | undefined,
  patch: { state?: ItemState; note?: string | null },
  actor: ChecklistActor,
): Promise<ChecklistItem> {
  const state = patch.state ?? current?.state ?? 'open';
  const stateChanged = patch.state !== undefined && patch.state !== current?.state;
  const row: Record<string, unknown> = { job_id: jobId, step_id: stepId, state };
  if (stateChanged) {
    const ticked = state !== 'open';
    row.done_at = ticked ? new Date().toISOString() : null;
    row.done_by = ticked ? actor.id : null;
    row.done_by_name = ticked ? actor.name : null;
  }
  if (patch.note !== undefined) row.note = patch.note;

  const { data, error, status } = await withWriteRetry(
    () =>
      supabase
        .schema('neta_ops')
        .from('job_checklist_items')
        .upsert(row, { onConflict: 'job_id,step_id' })
        .select(ITEM_COLUMNS)
        .single(),
    { label: 'save checklist item' },
  );
  if (error) throw new Error(describeSupabaseError(error, status));
  return data as ChecklistItem;
}

/** Saves the whole step list. New steps carry an id made in the browser. */
export async function saveChecklistSteps(steps: ChecklistStep[]): Promise<void> {
  const rows = steps.map((s) => ({
    id: s.id,
    name: s.name.trim(),
    phase: s.phase,
    sort_order: s.sort_order,
    due_anchor: s.due_anchor,
    due_offset_days: s.due_anchor ? s.due_offset_days : 0,
    auto_rule: s.auto_rule,
    archived_at: s.archived_at,
  }));
  const { error, status } = await withWriteRetry(
    () => supabase.schema('neta_ops').from('job_checklist_steps').upsert(rows, { onConflict: 'id' }),
    { label: 'save checklist steps' },
  );
  if (error) throw new Error(describeSupabaseError(error, status));
}

// ---------------------------------------------------------------------------
// Working out where a job stands
// ---------------------------------------------------------------------------

export type StepDisplay = 'done' | 'auto' | 'na' | 'open' | 'late';

export interface StepStatus {
  step: ChecklistStep;
  item?: ChecklistItem;
  display: StepDisplay;
  /** Null when the step has no due rule or its anchor date is not known yet */
  due: Date | null;
  /** Why a self-ticking step is ticked */
  autoDetail?: string;
}

export interface JobChecklistSummary {
  statuses: StepStatus[];
  done: number;
  /** Steps that count: everything except N/A */
  total: number;
  late: number;
}

function autoDetail(rule: AutoRule, facts: ChecklistJobFacts): string | undefined {
  if (rule === 'lead_assigned') {
    const lead = facts.fireteam_lead?.trim();
    return lead ? `Lead: ${lead}` : undefined;
  }
  if (rule === 'quickbooks_linked') {
    return facts.quickbooks_project_id ? 'Linked to QuickBooks' : undefined;
  }
  return facts.status === 'billed' ? 'Job marked Billed' : undefined;
}

function dateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function anchorDate(anchor: DueAnchor, facts: ChecklistJobFacts, contractDoneAt: string | null): Date | null {
  if (anchor === 'contract') return dateOnly(contractDoneAt);
  if (anchor === 'start') return dateOnly(facts.start_date);
  // No completed date yet: fall back to the planned end
  return dateOnly(facts.completed_date ?? facts.due_date);
}

export function summarizeJobChecklist(
  steps: ChecklistStep[],
  items: ChecklistItem[],
  facts: ChecklistJobFacts | undefined,
  today: Date = new Date(),
): JobChecklistSummary {
  const byStep = new Map(items.map((i) => [i.step_id, i]));
  const contractStep = steps.find((s) => s.key === CONTRACT_STEP_KEY);
  const contractItem = contractStep ? byStep.get(contractStep.id) : undefined;
  const contractDoneAt = contractItem?.state === 'done' ? contractItem.done_at : null;
  const todayStart = startOfDay(today);

  let done = 0;
  let total = 0;
  let late = 0;
  const statuses = steps.map((step): StepStatus => {
    const item = byStep.get(step.id);
    const auto = step.auto_rule && facts ? autoDetail(step.auto_rule, facts) : undefined;
    const anchor = step.due_anchor && facts ? anchorDate(step.due_anchor, facts, contractDoneAt) : null;
    const due = anchor ? addDays(anchor, step.due_offset_days) : null;

    let display: StepDisplay;
    if (item?.state === 'done') display = 'done';
    else if (auto) display = 'auto';
    else if (item?.state === 'na') display = 'na';
    else display = due && isBefore(due, todayStart) ? 'late' : 'open';

    if (display !== 'na') total += 1;
    if (display === 'done' || display === 'auto') done += 1;
    if (display === 'late') late += 1;
    return { step, item, display, due, autoDetail: auto };
  });

  return { statuses, done, total, late };
}

/** "5 days after contract signed", "On job start", "No due date" */
export function describeDueRule(step: Pick<ChecklistStep, 'due_anchor' | 'due_offset_days'>): string {
  if (!step.due_anchor) return 'No due date';
  const label = DUE_ANCHOR_LABELS[step.due_anchor];
  const n = step.due_offset_days;
  if (n === 0) return `On ${label}`;
  const days = Math.abs(n) === 1 ? '1 day' : `${Math.abs(n)} days`;
  return `${days} ${n > 0 ? 'after' : 'before'} ${label}`;
}

export function fmtChecklistDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? parseISO(value) : value;
  return Number.isNaN(d.getTime()) ? '' : format(d, 'MMM d');
}
