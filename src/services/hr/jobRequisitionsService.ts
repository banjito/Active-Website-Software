import { supabase } from '@/lib/supabase';

/** Fire-and-forget email notification to the current approver */
function notifyApprover(requisitionId: string, approverUserId: string, stepNumber: number, totalSteps: number, action: 'submitted' | 'advanced') {
  try {
    const fnUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if (!fnUrl || !anonKey) return;
    fetch(`${fnUrl.replace(/\/rest\/v1.*$/, '')}/functions/v1/requisition-approval-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ requisitionId, approverUserId, stepNumber, totalSteps, action })
    }).catch(() => {});
  } catch { /* silent */ }
}

/** Escape HTML for safe display */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Get combined description HTML for display. New format stores all in description; old format has separate description, requirements, notes. */
export function getJobRequisitionDisplayHtml(
  req: Pick<JobRequisition, 'description' | 'requirements' | 'notes'>,
  opts?: { excludeNotes?: boolean }
): string {
  const desc = req.description || '';
  const reqs = req.requirements || '';
  const includeNotes = !opts?.excludeNotes;
  const nts = includeNotes ? (req.notes || '') : '';
  if (desc && (desc.includes('<p>') || desc.includes('<b>') || desc.includes('<div') || desc.includes('<br'))) {
    return desc;
  }
  const parts: string[] = [];
  if (desc.trim()) parts.push(`<p>${escapeHtml(desc).replace(/\n/g, '<br>')}</p>`);
  if (reqs.trim()) parts.push(`<p><strong>Requirements</strong></p><p>${escapeHtml(reqs).replace(/\n/g, '<br>')}</p>`);
  if (nts.trim()) parts.push(`<p><strong>Notes</strong></p><p>${escapeHtml(nts).replace(/\n/g, '<br>')}</p>`);
  return parts.join('') || '';
}

export interface RequisitionApprover {
  id: string;
  requisition_id: string;
  approver_user_id: string;
  step_order: number;
  status: 'pending' | 'approved' | 'rejected';
  decided_at?: string;
  rejection_reason?: string;
  created_at: string;
  approver_name?: string;
  approver_email?: string;
}

export interface JobRequisition {
  id: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  salary_range_min?: number;
  salary_range_max?: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'posted' | 'closed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  description?: string;
  requirements?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  approved_by?: string;
  approved_at?: string;
  posted_at?: string;
  closed_at?: string;
  closed_by?: string;
  closing_reason?: string;
  submitted_for_approval_at?: string;
  notes?: string;
  current_approval_step?: number;
  approvers?: RequisitionApprover[];
}

export interface CreateJobRequisitionInput {
  title: string;
  department: string;
  location: string;
  employment_type: string;
  salary_range_min?: number;
  salary_range_max?: number;
  status?: 'draft' | 'pending_approval' | 'approved' | 'posted' | 'closed';
  priority?: 'low' | 'medium' | 'high';
  description?: string;
  requirements?: string;
  notes?: string;
}

export const jobRequisitionsService = {
  async getAll(): Promise<JobRequisition[]> {
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('job_requisitions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching job requisitions:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(error.message || 'Failed to fetch job requisitions');
      }

      return data || [];
    } catch (err: any) {
      console.error('Exception in getAll:', err);
      throw err;
    }
  },

  async getById(id: string): Promise<JobRequisition | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching job requisition:', error);
      throw error;
    }

    return data;
  },

  async create(input: CreateJobRequisitionInput, userId: string): Promise<JobRequisition> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .insert({
        ...input,
        created_by: userId,
        status: input.status || 'draft',
        priority: input.priority || 'medium',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job requisition:', error);
      throw error;
    }

    return data;
  },

  async update(id: string, input: Partial<CreateJobRequisitionInput>): Promise<JobRequisition> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job requisition:', error);
      throw error;
    }

    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting job requisition:', error);
      throw error;
    }
  },

  async submitForApproval(id: string): Promise<JobRequisition> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        status: 'pending_approval',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error submitting for approval:', error);
      throw error;
    }

    return data;
  },

  async approve(id: string, approvedBy: string): Promise<JobRequisition> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error approving job requisition:', error);
      throw error;
    }

    return data;
  },

  async reject(id: string, reason?: string, rejectedBy?: string): Promise<JobRequisition> {
    const updateData: any = {
      status: 'closed',
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add rejection reason to notes
    if (reason) {
      updateData.notes = reason.trim();
      updateData.closing_reason = 'rejected';
    } else {
      updateData.closing_reason = 'rejected';
    }

    // Set who rejected it if provided
    if (rejectedBy) {
      updateData.closed_by = rejectedBy;
    }

    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error rejecting job requisition:', error);
      throw error;
    }

    return data;
  },

  async post(id: string): Promise<JobRequisition> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error posting job requisition:', error);
      throw error;
    }

    return data;
  },

  async close(id: string): Promise<JobRequisition> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error closing job requisition:', error);
      throw error;
    }

    return data;
  },

  // --- Approver Management ---

  async getApprovers(requisitionId: string): Promise<RequisitionApprover[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('requisition_approvers')
      .select('*')
      .eq('requisition_id', requisitionId)
      .order('step_order', { ascending: true });

    if (error) {
      console.error('Error fetching approvers:', error);
      throw error;
    }
    return data || [];
  },

  async getApproversForMultiple(requisitionIds: string[]): Promise<Record<string, RequisitionApprover[]>> {
    if (requisitionIds.length === 0) return {};
    const { data, error } = await supabase
      .schema('common')
      .from('requisition_approvers')
      .select('*')
      .in('requisition_id', requisitionIds)
      .order('step_order', { ascending: true });

    if (error) {
      console.error('Error fetching approvers for multiple:', error);
      throw error;
    }

    const grouped: Record<string, RequisitionApprover[]> = {};
    for (const row of data || []) {
      if (!grouped[row.requisition_id]) grouped[row.requisition_id] = [];
      grouped[row.requisition_id].push(row);
    }
    return grouped;
  },

  async setApprovers(requisitionId: string, approverUserIds: string[]): Promise<RequisitionApprover[]> {
    if (approverUserIds.length < 1 || approverUserIds.length > 3) {
      throw new Error('Must have between 1 and 3 approvers');
    }

    // Delete existing approvers
    await supabase
      .schema('common')
      .from('requisition_approvers')
      .delete()
      .eq('requisition_id', requisitionId);

    const rows = approverUserIds.map((uid, idx) => ({
      requisition_id: requisitionId,
      approver_user_id: uid,
      step_order: idx + 1,
      status: 'pending',
    }));

    const { data, error } = await supabase
      .schema('common')
      .from('requisition_approvers')
      .insert(rows)
      .select();

    if (error) {
      console.error('Error setting approvers:', error);
      throw error;
    }
    return data || [];
  },

  async submitForApprovalWithApprovers(id: string, approverUserIds: string[]): Promise<JobRequisition> {
    await this.setApprovers(id, approverUserIds);

    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        status: 'pending_approval',
        current_approval_step: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error submitting for approval:', error);
      throw error;
    }

    // Notify the first approver
    notifyApprover(id, approverUserIds[0], 1, approverUserIds.length, 'submitted');

    return data;
  },

  async approveStep(requisitionId: string, userId: string): Promise<{ requisition: JobRequisition; allApproved: boolean }> {
    const approvers = await this.getApprovers(requisitionId);
    const requisition = await this.getById(requisitionId);
    if (!requisition) throw new Error('Requisition not found');

    const currentStep = requisition.current_approval_step || 1;
    const currentApprover = approvers.find(a => a.step_order === currentStep);
    if (!currentApprover) throw new Error('No approver found for current step');
    if (currentApprover.approver_user_id !== userId) {
      throw new Error('You are not the current approver for this requisition');
    }

    // Mark this step as approved
    const { error: stepError } = await supabase
      .schema('common')
      .from('requisition_approvers')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
      })
      .eq('id', currentApprover.id);

    if (stepError) throw stepError;

    const nextStep = currentStep + 1;
    const hasNextApprover = approvers.some(a => a.step_order === nextStep);

    if (hasNextApprover) {
      // Move to next step
      const { data, error } = await supabase
        .schema('common')
        .from('job_requisitions')
        .update({
          current_approval_step: nextStep,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requisitionId)
        .select()
        .single();

      if (error) throw error;

      // Notify the next approver that it's their turn
      const nextApprover = approvers.find(a => a.step_order === nextStep);
      if (nextApprover) {
        notifyApprover(requisitionId, nextApprover.approver_user_id, nextStep, approvers.length, 'advanced');
      }

      return { requisition: data, allApproved: false };
    } else {
      // All steps approved — mark requisition as approved and auto-post to career page
      const { data, error } = await supabase
        .schema('common')
        .from('job_requisitions')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requisitionId)
        .select()
        .single();

      if (error) throw error;
      return { requisition: data, allApproved: true };
    }
  },

  async rejectStep(requisitionId: string, userId: string, reason: string): Promise<JobRequisition> {
    const approvers = await this.getApprovers(requisitionId);
    const requisition = await this.getById(requisitionId);
    if (!requisition) throw new Error('Requisition not found');

    const currentStep = requisition.current_approval_step || 1;
    const currentApprover = approvers.find(a => a.step_order === currentStep);
    if (!currentApprover) throw new Error('No approver found for current step');
    if (currentApprover.approver_user_id !== userId) {
      throw new Error('You are not the current approver for this requisition');
    }

    // Mark this step as rejected
    const { error: stepError } = await supabase
      .schema('common')
      .from('requisition_approvers')
      .update({
        status: 'rejected',
        decided_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', currentApprover.id);

    if (stepError) throw stepError;

    // Reject the whole requisition
    const { data, error } = await supabase
      .schema('common')
      .from('job_requisitions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: userId,
        closing_reason: 'rejected',
        notes: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requisitionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getPendingForUser(userId: string): Promise<{ requisition: JobRequisition; approverRecord: RequisitionApprover }[]> {
    const allReqs = await this.getAll();
    const pending = allReqs.filter(r => r.status === 'pending_approval');
    if (pending.length === 0) return [];

    const approverMap = await this.getApproversForMultiple(pending.map(r => r.id));
    const results: { requisition: JobRequisition; approverRecord: RequisitionApprover }[] = [];

    for (const req of pending) {
      const approvers = approverMap[req.id] || [];
      const currentStep = req.current_approval_step || 1;
      const currentApprover = approvers.find(a => a.step_order === currentStep);
      if (currentApprover && currentApprover.approver_user_id === userId) {
        results.push({ requisition: req, approverRecord: currentApprover });
      }
    }
    return results;
  },
};
