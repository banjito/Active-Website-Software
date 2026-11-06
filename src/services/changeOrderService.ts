import { supabase } from '../lib/supabase';
import { createChangeOrderEstimate } from './quickbooksService';

export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ApprovalMethod = 'email' | 'signed_online' | 'customer_form' | 'signed_letter';

export const APPROVAL_METHOD_LABEL: Record<ApprovalMethod, string> = {
  email: 'Email reply',
  signed_online: 'Signed online',
  customer_form: 'Their own form',
  signed_letter: 'Signed letter',
};

export interface ChangeOrder {
  id: string;
  job_id: string;
  user_id: string;
  co_number: number;
  title: string;
  description: string | null;
  amount: number;
  schedule_impact_days: number | null;
  status: ChangeOrderStatus;
  requested_by: string | null;
  requested_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approved_date: string | null;
  approved_by_name: string | null;
  file_url: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  qbo_estimate_id: string | null;
  qbo_synced_at: string | null;
  /** The quote holding this Change Order's estimate sheets and letters. Null on older, simple ones. */
  opportunity_id?: string | null;
  /** Billed on its own terms, outside the original contract. */
  outside_contract?: boolean;
  /** How the customer approved, with proof (pasted email or a file) */
  approval_method?: ApprovalMethod | null;
  approval_note?: string | null;
  approval_file_url?: string | null;
  approval_file_path?: string | null;
  /** Work began before approval on this date, backed by work_started_note */
  work_started_on?: string | null;
  work_started_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeOrderInput {
  title: string;
  description?: string | null;
  amount: number;
  schedule_impact_days?: number | null;
  status?: ChangeOrderStatus;
  requested_by?: string | null;
  requested_date?: string | null;
  file_url?: string | null;
  file_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  outside_contract?: boolean;
  work_started_on?: string | null;
  work_started_note?: string | null;
}

/** Shown in place of the raw status value. "submitted" means sent to the customer. */
export const CHANGE_ORDER_STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  draft: 'Draft',
  submitted: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** 1 -> "001", the way Change Orders are numbered on a job. */
export const formatChangeOrderNumber = (n: number) => String(n).padStart(3, '0');

export interface ChangeOrderSummary {
  approvedTotal: number;
  pendingTotal: number;
  approvedCount: number;
  pendingCount: number;
}

function table() {
  return supabase.schema('neta_ops').from('job_change_orders');
}

export async function fetchChangeOrders(jobId: string): Promise<ChangeOrder[]> {
  const { data, error } = await table()
    .select('*')
    .eq('job_id', jobId)
    .order('co_number', { ascending: true });

  if (error) {
    // Missing relation = migrations not run yet in this environment; treat as empty
    if ((error as any).code === '42P01') {
      console.warn('job_change_orders table not found; treating as empty.');
      return [];
    }
    throw error;
  }
  return (data as ChangeOrder[]) || [];
}

export async function createChangeOrder(
  jobId: string,
  userId: string,
  input: ChangeOrderInput
): Promise<ChangeOrder> {
  // Retry once on unique-violation in case two users add a Change Order at the same time
  for (let attempt = 0; ; attempt++) {
    const { data: last } = await table()
      .select('co_number')
      .eq('job_id', jobId)
      .order('co_number', { ascending: false })
      .limit(1);
    const nextNumber = ((last?.[0]?.co_number as number) ?? 0) + 1;

    const { data, error } = await table()
      .insert({
        job_id: jobId,
        user_id: userId,
        co_number: nextNumber,
        title: input.title,
        description: input.description ?? null,
        amount: input.amount,
        schedule_impact_days: input.schedule_impact_days ?? null,
        status: input.status ?? 'draft',
        requested_by: input.requested_by ?? null,
        requested_date: input.requested_date ?? null,
        file_url: input.file_url ?? null,
        file_path: input.file_path ?? null,
        file_type: input.file_type ?? null,
        file_size: input.file_size ?? null,
        outside_contract: input.outside_contract ?? false,
        work_started_on: input.work_started_on ?? null,
        work_started_note: input.work_started_note ?? null,
      })
      .select()
      .single();

    if (!error) return data as ChangeOrder;
    if ((error as any).code === '23505' && attempt === 0) continue;
    throw error;
  }
}

export async function updateChangeOrder(
  id: string,
  patch: Partial<ChangeOrderInput> & {
    status?: ChangeOrderStatus;
    approved_by?: string | null;
    approved_at?: string | null;
    approved_date?: string | null;
    approved_by_name?: string | null;
    approval_method?: ApprovalMethod | null;
    approval_note?: string | null;
    approval_file_url?: string | null;
    approval_file_path?: string | null;
    qbo_estimate_id?: string | null;
    qbo_synced_at?: string | null;
  }
): Promise<ChangeOrder> {
  const { data, error } = await table().update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as ChangeOrder;
}

/**
 * New Change Order priced on an estimate sheet. The database makes the Change
 * Order and its own quote (with a brand-new letter number) together; open
 * /sales-dashboard/opportunities/<opportunity_id> to build the estimate.
 */
export async function createChangeOrderQuote(
  jobId: string,
  input: {
    title: string;
    description?: string | null;
    requested_by?: string | null;
    requested_date?: string | null;
    schedule_impact_days?: number | null;
    outside_contract?: boolean;
  }
): Promise<ChangeOrder> {
  const { data, error } = await supabase.schema('neta_ops').rpc('create_change_order_quote', {
    p_job_id: jobId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_requested_by: input.requested_by ?? null,
    p_requested_date: input.requested_date || null,
    p_schedule_impact_days: input.schedule_impact_days ?? null,
    p_outside_contract: input.outside_contract ?? false,
  });
  if (error) throw error;
  return data as ChangeOrder;
}

/** Badge colors per status, shared by the job card and the PM Dashboard. */
export const CHANGE_ORDER_STATUS_STYLE: Record<ChangeOrderStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-100',
  submitted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
  approved: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100',
};

/** Every Change Order on these jobs, for the PM Dashboard. Reads in chunks to keep URLs short. */
export async function fetchChangeOrdersForJobs(jobIds: string[]): Promise<ChangeOrder[]> {
  const out: ChangeOrder[] = [];
  for (let i = 0; i < jobIds.length; i += 100) {
    const { data, error } = await table()
      .select('*')
      .in('job_id', jobIds.slice(i, i + 100))
      .order('co_number', { ascending: true });
    if (error) {
      if ((error as any).code === '42P01') return [];
      throw error;
    }
    out.push(...((data ?? []) as ChangeOrder[]));
  }
  return out;
}

/** Letter numbers for Change Orders that have their own quote, keyed by quote id. */
export async function fetchChangeOrderLetterNumbers(
  opportunityIds: string[]
): Promise<Record<string, string>> {
  if (opportunityIds.length === 0) return {};
  const { data, error } = await supabase
    .schema('business')
    .from('opportunities')
    .select('id, quote_number')
    .in('id', opportunityIds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; quote_number: string | null }[]) {
    if (row.quote_number) out[row.id] = row.quote_number;
  }
  return out;
}

/** Deleting a Change Order also deletes its quote, estimates and letters (database trigger). */
export async function deleteChangeOrder(id: string): Promise<void> {
  const { error } = await table().delete().eq('id', id);
  if (error) throw error;
}

/**
 * Approve a Change Order and, when the job is linked to a QBO project, push it as an
 * Accepted Estimate. The approval always succeeds locally; a failed QBO push
 * is returned as qboError so the UI can offer a retry instead of blocking.
 */
export async function approveChangeOrder(
  co: ChangeOrder,
  approverId: string,
  qbo?: { projectId?: string | null; jobNumber?: string | null },
  details?: {
    approved_date?: string | null;
    approved_by_name?: string | null;
    approval_method?: ApprovalMethod | null;
    approval_note?: string | null;
    approval_file_url?: string | null;
    approval_file_path?: string | null;
  }
): Promise<{ changeOrder: ChangeOrder; qboError: string | null }> {
  let updated = await updateChangeOrder(co.id, {
    status: 'approved',
    approved_by: approverId,
    approved_at: new Date().toISOString(),
    ...(details ?? {}),
  });

  if (!qbo?.projectId || updated.qbo_estimate_id) {
    return { changeOrder: updated, qboError: null };
  }

  try {
    updated = await pushChangeOrderToQuickBooks(updated, qbo.projectId, qbo.jobNumber);
    return { changeOrder: updated, qboError: null };
  } catch (err) {
    console.error('Change order QBO push failed:', err);
    const message = err instanceof Error ? err.message : 'QuickBooks push failed';
    return { changeOrder: updated, qboError: message };
  }
}

export async function pushChangeOrderToQuickBooks(
  co: ChangeOrder,
  projectId: string,
  jobNumber?: string | null
): Promise<ChangeOrder> {
  const estimateId = await createChangeOrderEstimate({
    projectId,
    coNumber: co.co_number,
    title: co.title,
    amount: Number(co.amount),
    description: co.description,
    jobNumber,
  });
  return updateChangeOrder(co.id, {
    qbo_estimate_id: estimateId,
    qbo_synced_at: new Date().toISOString(),
  });
}

export function summarizeChangeOrders(cos: ChangeOrder[]): ChangeOrderSummary {
  return cos.reduce<ChangeOrderSummary>(
    (acc, co) => {
      const amount = Number(co.amount) || 0;
      if (co.status === 'approved') {
        acc.approvedTotal += amount;
        acc.approvedCount += 1;
      } else if (co.status === 'draft' || co.status === 'submitted') {
        acc.pendingTotal += amount;
        acc.pendingCount += 1;
      }
      return acc;
    },
    { approvedTotal: 0, pendingTotal: 0, approvedCount: 0, pendingCount: 0 }
  );
}
