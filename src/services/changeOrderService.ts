import { supabase } from '../lib/supabase';
import { createChangeOrderEstimate } from './quickbooksService';

export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

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
  approved_by: string | null;
  approved_at: string | null;
  file_url: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  qbo_estimate_id: string | null;
  qbo_synced_at: string | null;
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
  file_url?: string | null;
  file_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
}

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
  // Retry once on unique-violation in case two users add a CO simultaneously
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
        file_url: input.file_url ?? null,
        file_path: input.file_path ?? null,
        file_type: input.file_type ?? null,
        file_size: input.file_size ?? null,
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
    qbo_estimate_id?: string | null;
    qbo_synced_at?: string | null;
  }
): Promise<ChangeOrder> {
  const { data, error } = await table().update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as ChangeOrder;
}

export async function deleteChangeOrder(id: string): Promise<void> {
  const { error } = await table().delete().eq('id', id);
  if (error) throw error;
}

/**
 * Approve a CO and, when the job is linked to a QBO project, push it as an
 * Accepted Estimate. The approval always succeeds locally; a failed QBO push
 * is returned as qboError so the UI can offer a retry instead of blocking.
 */
export async function approveChangeOrder(
  co: ChangeOrder,
  approverId: string,
  qbo?: { projectId?: string | null; jobNumber?: string | null }
): Promise<{ changeOrder: ChangeOrder; qboError: string | null }> {
  let updated = await updateChangeOrder(co.id, {
    status: 'approved',
    approved_by: approverId,
    approved_at: new Date().toISOString(),
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
