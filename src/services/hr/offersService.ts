import { supabase } from '@/lib/supabase';
import { candidatesService } from '@/services/hr/candidatesService';

/** Fire-and-forget email notification to the current offer approver */
function notifyOfferApprover(
  offerId: string,
  approverUserId: string,
  stepNumber: number,
  totalSteps: number,
  action: 'submitted' | 'advanced'
) {
  try {
    const fnUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if (!fnUrl || !anonKey) return;
    fetch(`${fnUrl.replace(/\/rest\/v1.*$/, '')}/functions/v1/offer-approval-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ offerId, approverUserId, stepNumber, totalSteps, action }),
    }).catch(() => {});
  } catch {
    /* silent */
  }
}

export interface OfferTemplate {
  id: string;
  name: string;
  description?: string;
  template_content: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Offer {
  id: string;
  candidate_id: string;
  candidate?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    position_applied: string;
  };
  requisition_id?: string;
  template_id?: string;
  position_title: string;
  department: string;
  employment_type: 'full-time' | 'part-time' | 'contract' | 'temporary';
  start_date?: string;
  location?: string;
  reporting_manager?: string;
  base_salary?: number;
  salary_currency: string;
  pay_frequency?: 'hourly' | 'weekly' | 'bi-weekly' | 'monthly' | 'annual';
  bonus_amount?: number;
  bonus_description?: string;
  equity_compensation?: string;
  benefits_summary?: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  offer_letter_content?: string;
  custom_fields?: Record<string, any>;
  offer_date?: string;
  expiration_date?: string;
  sent_date?: string;
  accepted_date?: string;
  declined_date?: string;
  signature_status: 'pending' | 'signed' | 'declined';
  signature_data?: Record<string, any>;
  signed_at?: string;
  signing_token?: string;
  current_approval_step?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OfferApproval {
  id: string;
  offer_id: string;
  approver_id: string;
  approver?: {
    id: string;
    email: string;
    user_metadata?: {
      name?: string;
    };
  };
  approval_order: number;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  comments?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface GlobalApprover {
  id: string;
  approver_id: string;
  approval_order: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ESignature {
  id: string;
  offer_id: string;
  signer_type: 'candidate' | 'manager' | 'hr';
  signer_id?: string;
  signer_email?: string;
  signer_name?: string;
  signature_image?: string;
  signature_data?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  signed_at?: string;
  created_at: string;
}

export interface OfferAttachment {
  id: string;
  offer_id: string;
  name: string;
  file_path: string;
  file_url: string;
  created_at: string;
}

export interface CreateOfferInput {
  candidate_id: string;
  requisition_id?: string;
  template_id?: string;
  position_title: string;
  department: string;
  employment_type: 'full-time' | 'part-time' | 'contract' | 'temporary';
  start_date?: string;
  location?: string;
  reporting_manager?: string;
  base_salary?: number;
  salary_currency?: string;
  pay_frequency?: 'hourly' | 'weekly' | 'bi-weekly' | 'monthly' | 'annual';
  bonus_amount?: number;
  bonus_description?: string;
  equity_compensation?: string;
  benefits_summary?: string;
  offer_letter_content?: string;
  custom_fields?: Record<string, any>;
  offer_date?: string;
  expiration_date?: string;
}

export interface CreateOfferTemplateInput {
  name: string;
  description?: string;
  template_content: string;
  is_default?: boolean;
}

export const offersService = {
  getDefaultExpirationDate(baseDate?: string): string {
    const startDate = baseDate ? new Date(baseDate) : new Date();
    if (Number.isNaN(startDate.getTime())) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 5);
      return fallback.toISOString().split('T')[0];
    }
    startDate.setDate(startDate.getDate() + 5);
    return startDate.toISOString().split('T')[0];
  },

  // Offer Templates
  async getTemplates(): Promise<OfferTemplate[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }

    return data || [];
  },

  async getTemplateById(id: string): Promise<OfferTemplate | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching template:', error);
      throw error;
    }

    return data;
  },

  async createTemplate(input: CreateOfferTemplateInput, userId: string): Promise<OfferTemplate> {
    // If setting as default, unset other defaults
    if (input.is_default) {
      await supabase
        .schema('common')
        .from('offer_templates')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .schema('common')
      .from('offer_templates')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      throw error;
    }

    return data;
  },

  async updateTemplate(id: string, input: Partial<CreateOfferTemplateInput>): Promise<OfferTemplate> {
    // If setting as default, unset other defaults
    if (input.is_default) {
      await supabase
        .schema('common')
        .from('offer_templates')
        .update({ is_default: false })
        .neq('id', id);
    }

    const { data, error } = await supabase
      .schema('common')
      .from('offer_templates')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      throw error;
    }

    return data;
  },

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('offer_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  },

  // Offers
  async getAll(): Promise<Offer[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching offers:', error);
      throw error;
    }

    // Fetch candidates separately
    const candidateIds = [...new Set((data || []).map((o: any) => o.candidate_id))];
    const { data: candidatesData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, position_applied')
      .in('id', candidateIds);

    const candidatesMap = new Map((candidatesData || []).map((c: any) => [c.id, c]));

    return (data || []).map((item: any) => ({
      ...item,
      candidate: candidatesMap.get(item.candidate_id),
    }));
  },

  async getById(id: string): Promise<Offer | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching offer:', error);
      throw error;
    }

    if (!data) return null;

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, position_applied')
      .eq('id', (data as any).candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },

  async getByCandidateId(candidateId: string): Promise<Offer[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching offers by candidate:', error);
      throw error;
    }

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, position_applied')
      .eq('id', candidateId)
      .single();

    return (data || []).map((item: any) => ({
      ...item,
      candidate: candidateData || undefined,
    }));
  },

  /** Returns offer_sent/offer_accepted per candidate id for candidates who have an offer in that state. Used for ATS display when candidate.status may still be "offer". */
  async getOfferStatusForCandidates(candidateIds: string[]): Promise<Record<string, 'offer_sent' | 'offer_accepted'>> {
    if (candidateIds.length === 0) return {};
    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .select('candidate_id, status')
      .in('candidate_id', candidateIds)
      .in('status', ['sent', 'accepted']);

    if (error) {
      console.error('Error fetching offer status for candidates:', error);
      return {};
    }
    const result: Record<string, 'offer_sent' | 'offer_accepted'> = {};
    for (const row of data || []) {
      const cid = (row as any).candidate_id;
      const s = (row as any).status;
      const mapped = s === 'accepted' ? 'offer_accepted' : 'offer_sent';
      if (!result[cid] || mapped === 'offer_accepted') result[cid] = mapped;
    }
    return result;
  },

  async create(input: CreateOfferInput, userId: string): Promise<Offer> {
    // Generate unique signing token immediately for security
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const signingToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .insert({
        ...input,
        expiration_date: input.expiration_date || this.getDefaultExpirationDate(input.offer_date),
        created_by: userId,
        status: 'draft',
        salary_currency: input.salary_currency || 'USD',
        signing_token: signingToken,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating offer:', error);
      throw error;
    }

    // Update candidate status to 'offer'
    await supabase
      .schema('common')
      .from('candidates')
      .update({
        status: 'offer',
        last_contact_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.candidate_id);

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, position_applied')
      .eq('id', input.candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },

  async update(id: string, input: Partial<CreateOfferInput>): Promise<Offer> {
    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating offer:', error);
      throw error;
    }

    // Fetch candidate separately
    const candidateId = (data as any).candidate_id || input.candidate_id;
    if (candidateId) {
      const { data: candidateData } = await supabase
        .schema('common')
        .from('candidates')
        .select('id, first_name, last_name, email, position_applied')
        .eq('id', candidateId)
        .single();

      return {
        ...data,
        candidate: candidateData || undefined,
      };
    }

    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('offers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting offer:', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: Offer['status']): Promise<Offer> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'sent') {
      const sentAt = new Date().toISOString();
      updateData.sent_date = sentAt;
      // Generate signing token when sending offer
      const currentOffer = await this.getById(id);
      if (currentOffer && !(currentOffer as any).signing_token) {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        updateData.signing_token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      }
      // Set a default expiration when offer is first sent (if one is not already set).
      if (currentOffer && !currentOffer.expiration_date) {
        updateData.expiration_date = this.getDefaultExpirationDate(sentAt);
      }
    } else if (status === 'accepted') {
      updateData.accepted_date = new Date().toISOString();
    } else if (status === 'declined') {
      updateData.declined_date = new Date().toISOString();
    }

    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .update(updateData)
      .eq('id', id)
      .select('id, candidate_id')
      .single();

    if (error) {
      console.error('Error updating offer status:', error);
      throw error;
    }

    // Update candidate tracking so it shows "Offer Sent" / "Offer Accepted" (not just "Offer" or "Sent")
    let candidateId = (data as Offer).candidate_id;
    if (!candidateId) {
      const offerRow = await this.getById(id);
      candidateId = offerRow?.candidate_id;
    }
    if (candidateId && (status === 'sent' || status === 'accepted')) {
      try {
        await candidatesService.updateStatus(
          candidateId,
          status === 'sent' ? 'offer_sent' : 'offer_accepted'
        );
      } catch (e) {
        console.error('Error updating candidate status:', e);
        // Don't throw — offer was updated successfully. Candidate may stay "Offer" if DB migration not run.
      }
    }

    // If status is pending_approval, set up the sequential approval chain from
    // the active global approvers, set current_approval_step=1 and notify the
    // first approver.
    if (status === 'pending_approval') {
      const globalApprovers = await this.getGlobalApprovers();
      const activeApprovers = globalApprovers
        .filter(a => a.is_active)
        .sort((a, b) => a.approval_order - b.approval_order);

      // Check if approvals already exist
      const existingApprovals = await this.getApprovalsByOfferId(id);
      const existingApproverIds = new Set(existingApprovals.map(a => a.approver_id));

      // Create approval records (reset to pending) for each active approver, ordered
      let stepCounter = 1;
      for (const approver of activeApprovers) {
        if (!existingApproverIds.has(approver.approver_id)) {
          await this.createApproval(id, approver.approver_id, stepCounter);
        }
        stepCounter += 1;
      }

      // Reset current step to 1 and notify the first approver
      await supabase
        .schema('common')
        .from('offers')
        .update({ current_approval_step: 1, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (activeApprovers.length > 0) {
        notifyOfferApprover(
          id,
          activeApprovers[0].approver_id,
          1,
          activeApprovers.length,
          'submitted'
        );
      }
    }

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, position_applied')
      .eq('id', (data as any).candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },

  // Offer Approvals
  async getApprovalsByOfferId(offerId: string): Promise<OfferApproval[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvals')
      .select('*')
      .eq('offer_id', offerId)
      .order('approval_order', { ascending: true });

    if (error) {
      console.error('Error fetching approvals:', error);
      throw error;
    }

    // Fetch approver details
    const approverIds = [...new Set((data || []).map((a: any) => a.approver_id))];
    // Note: We'll need to fetch from auth.users or profiles table
    // For now, return without approver details

    return data || [];
  },

  async createApproval(offerId: string, approverId: string, approvalOrder: number): Promise<OfferApproval> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvals')
      .insert({
        offer_id: offerId,
        approver_id: approverId,
        approval_order: approvalOrder,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating approval:', error);
      throw error;
    }

    return data;
  },

  async updateApproval(id: string, status: OfferApproval['status'], comments?: string): Promise<OfferApproval> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'approved' || status === 'rejected') {
      updateData.approved_at = new Date().toISOString();
    }

    if (comments !== undefined) {
      updateData.comments = comments;
    }

    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating approval:', error);
      throw error;
    }

    return data;
  },

  // Global Approvers
  async getGlobalApprovers(): Promise<GlobalApprover[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvers')
      .select('*')
      .order('approval_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching global approvers:', error);
      throw error;
    }

    return data || [];
  },

  async addGlobalApprover(approverId: string, approvalOrder: number, createdBy: string): Promise<GlobalApprover> {
    // Check if approver already exists
    const { data: existing } = await supabase
      .schema('common')
      .from('offer_approvers')
      .select('*')
      .eq('approver_id', approverId)
      .single();

    if (existing) {
      // Update existing approver
      const { data, error } = await supabase
        .schema('common')
        .from('offer_approvers')
        .update({
          approval_order: approvalOrder,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating global approver:', error);
        throw error;
      }

      return data;
    }

    // Create new approver
    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvers')
      .insert({
        approver_id: approverId,
        approval_order: approvalOrder,
        is_active: true,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating global approver:', error);
      throw error;
    }

    return data;
  },

  async removeGlobalApprover(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('offer_approvers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error removing global approver:', error);
      throw error;
    }
  },

  async updateGlobalApprover(id: string, updates: { approval_order?: number; is_active?: boolean }): Promise<GlobalApprover> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvers')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating global approver:', error);
      throw error;
    }

    return data;
  },

  // --- Sequential Approval Workflow ---

  /**
   * Load approvals for multiple offers at once, grouped by offer_id. Used by the
   * OfferApprovals page to display the approval chain on every card.
   */
  async getApprovalsForMultiple(offerIds: string[]): Promise<Record<string, OfferApproval[]>> {
    if (offerIds.length === 0) return {};
    const { data, error } = await supabase
      .schema('common')
      .from('offer_approvals')
      .select('*')
      .in('offer_id', offerIds)
      .order('approval_order', { ascending: true });

    if (error) {
      console.error('Error fetching approvals for multiple offers:', error);
      throw error;
    }

    const grouped: Record<string, OfferApproval[]> = {};
    for (const row of data || []) {
      const key = (row as any).offer_id as string;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row as OfferApproval);
    }
    return grouped;
  },

  /**
   * Approve the current step for an offer on behalf of the given user. Only the
   * user whose approval record matches the offer's current_approval_step may
   * approve. If there is no next step, the offer is marked as approved.
   */
  async approveStep(
    offerId: string,
    userId: string
  ): Promise<{ offer: Offer; allApproved: boolean }> {
    const offer = await this.getById(offerId);
    if (!offer) throw new Error('Offer not found');

    const approvals = await this.getApprovalsByOfferId(offerId);
    if (approvals.length === 0) {
      throw new Error('No approval chain is configured for this offer');
    }

    const currentStep = offer.current_approval_step || 1;
    const currentApproval = approvals.find(a => a.approval_order === currentStep);
    if (!currentApproval) throw new Error('No approver found for the current step');
    if (currentApproval.approver_id !== userId) {
      throw new Error('You are not the current approver for this offer');
    }

    await this.updateApproval(currentApproval.id, 'approved');

    const nextStep = currentStep + 1;
    const hasNext = approvals.some(a => a.approval_order === nextStep);

    if (hasNext) {
      const { error } = await supabase
        .schema('common')
        .from('offers')
        .update({
          current_approval_step: nextStep,
          updated_at: new Date().toISOString(),
        })
        .eq('id', offerId);
      if (error) throw error;

      const nextApproval = approvals.find(a => a.approval_order === nextStep);
      if (nextApproval) {
        notifyOfferApprover(
          offerId,
          nextApproval.approver_id,
          nextStep,
          approvals.length,
          'advanced'
        );
      }

      const refreshed = await this.getById(offerId);
      return { offer: refreshed as Offer, allApproved: false };
    }

    // All steps approved — mark offer approved.
    const finalOffer = await this.updateStatus(offerId, 'approved');
    return { offer: finalOffer, allApproved: true };
  },

  /**
   * Reject the current step for an offer on behalf of the given user. Reverts
   * the offer to draft so it can be edited and resubmitted, and records the
   * rejection reason in the approver's comments.
   */
  async rejectStep(offerId: string, userId: string, reason: string): Promise<Offer> {
    const offer = await this.getById(offerId);
    if (!offer) throw new Error('Offer not found');

    const approvals = await this.getApprovalsByOfferId(offerId);
    if (approvals.length === 0) {
      throw new Error('No approval chain is configured for this offer');
    }

    const currentStep = offer.current_approval_step || 1;
    const currentApproval = approvals.find(a => a.approval_order === currentStep);
    if (!currentApproval) throw new Error('No approver found for the current step');
    if (currentApproval.approver_id !== userId) {
      throw new Error('You are not the current approver for this offer');
    }

    await this.updateApproval(currentApproval.id, 'rejected', reason);

    // Revert the offer back to draft so it can be edited and resubmitted.
    const reverted = await this.updateStatus(offerId, 'draft');

    // Reset current_approval_step so a resubmit starts clean.
    await supabase
      .schema('common')
      .from('offers')
      .update({ current_approval_step: 0, updated_at: new Date().toISOString() })
      .eq('id', offerId);

    return reverted;
  },

  /**
   * Return the list of offers that are currently waiting on `userId` for
   * approval. An offer is returned only when the user is the current step
   * approver AND their approval record is still pending.
   */
  async getPendingForUser(
    userId: string
  ): Promise<{ offer: Offer; approval: OfferApproval }[]> {
    const all = await this.getAll();
    const pending = all.filter(o => o.status === 'pending_approval');
    if (pending.length === 0) return [];

    const approvalsMap = await this.getApprovalsForMultiple(pending.map(o => o.id));
    const out: { offer: Offer; approval: OfferApproval }[] = [];

    for (const offer of pending) {
      const chain = approvalsMap[offer.id] || [];
      const currentStep = offer.current_approval_step || 1;
      const current = chain.find(a => a.approval_order === currentStep);
      if (current && current.approver_id === userId && current.status === 'pending') {
        out.push({ offer, approval: current });
      }
    }
    return out;
  },

  /**
   * Extend the expiration date on an offer. Pass the exact ISO date (YYYY-MM-DD)
   * to set, or omit to push it out `daysFromNow` days from today (default 5).
   * Also regenerates the signing token so any previously-shared link becomes
   * invalid once the new link is distributed.
   */
  async refreshExpirationDate(
    offerId: string,
    opts?: { newDate?: string; daysFromNow?: number; regenerateToken?: boolean }
  ): Promise<Offer> {
    const newDate =
      opts?.newDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + (opts?.daysFromNow ?? 5));
        return d.toISOString().split('T')[0];
      })();

    const updatePayload: Record<string, any> = {
      expiration_date: newDate,
      updated_at: new Date().toISOString(),
    };

    const existing = await this.getById(offerId);

    if (opts?.regenerateToken) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      updatePayload.signing_token = Array.from(array, byte =>
        byte.toString(16).padStart(2, '0')
      ).join('');

      // A refreshed token represents a brand-new signing session. Clear any
      // stale signature state from previous attempts so the candidate isn't
      // greeted with "already signed" when they open the new link.
      updatePayload.signature_status = 'pending';
      updatePayload.signed_at = null;
      updatePayload.signature_data = null;

      // If the offer had been accepted/declined on the previous link, revert
      // those terminal states so the new link can be actioned again.
      if (existing?.status === 'accepted') {
        updatePayload.status = 'sent';
        updatePayload.accepted_date = null;
      } else if (existing?.status === 'declined') {
        updatePayload.status = 'sent';
        updatePayload.declined_date = null;
      }

      // Remove prior signature rows so the E-Signatures tab/audit doesn't
      // continue reporting this offer as signed.
      try {
        await supabase
          .schema('common')
          .from('e_signatures')
          .delete()
          .eq('offer_id', offerId);
      } catch (sigErr) {
        console.warn('Could not clear previous e_signatures on refresh:', sigErr);
      }
    }

    // If the offer had already expired, put it back into a usable state.
    if (!updatePayload.status && existing?.status === 'expired') {
      updatePayload.status = existing.sent_date ? 'sent' : 'approved';
    }

    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .update(updatePayload)
      .eq('id', offerId)
      .select()
      .single();

    if (error) {
      console.error('Error refreshing offer expiration:', error);
      throw error;
    }
    return data as Offer;
  },

  // E-Signatures
  async getSignaturesByOfferId(offerId: string): Promise<ESignature[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('e_signatures')
      .select('*')
      .eq('offer_id', offerId)
      .order('signed_at', { ascending: false });

    if (error) {
      console.error('Error fetching signatures:', error);
      throw error;
    }

    return data || [];
  },

  async createSignature(
    offerId: string,
    signerType: ESignature['signer_type'],
    signerData: {
      signer_id?: string;
      signer_email?: string;
      signer_name?: string;
      signature_image?: string;
      signature_data?: Record<string, any>;
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<ESignature> {
    const { data, error } = await supabase
      .schema('common')
      .from('e_signatures')
      .insert({
        offer_id: offerId,
        signer_type: signerType,
        ...signerData,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating signature:', error);
      throw error;
    }

    // Update offer signature status
    await supabase
      .schema('common')
      .from('offers')
      .update({
        signature_status: 'signed',
        signed_at: new Date().toISOString(),
        signature_data: signerData.signature_data,
      })
      .eq('id', offerId);

    return data;
  },


  // Get offer by signing token (for public signing page)
  // This is secure - only returns the offer if the exact token matches
  async getBySigningToken(token: string): Promise<Offer | null> {
    if (!token || token.length !== 64) {
      // Token should be 64 hex characters (32 bytes * 2)
      return null;
    }

    const { data, error } = await supabase
      .schema('common')
      .from('offers')
      .select('*')
      .eq('signing_token', token)
      .single();

    if (error) {
      // Don't log the error details to prevent information leakage
      // Just return null if token doesn't match
      if (error.code === 'PGRST116') {
        // No rows returned - invalid token
        return null;
      }
      console.error('Error fetching offer by token:', error);
      return null;
    }

    if (!data) return null;

    const offerData = data as Offer;
    if (
      offerData.expiration_date &&
      !['accepted', 'declined', 'withdrawn', 'expired'].includes(offerData.status)
    ) {
      const now = new Date();
      const expiration = new Date(offerData.expiration_date);
      expiration.setHours(23, 59, 59, 999);
      if (!Number.isNaN(expiration.getTime()) && now > expiration) {
        await supabase
          .schema('common')
          .from('offers')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', offerData.id);
        return null;
      }
    }

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, position_applied')
      .eq('id', (data as any).candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },

  // Generate signing link for an offer
  async generateSigningLink(offerId: string): Promise<string> {
    try {
      if (!offerId) {
        throw new Error('Offer ID is required');
      }

      console.log('Generating signing link for offer ID:', offerId);

      // First, check if offer exists and get current token
      // Select all fields to ensure we get the offer even if signing_token column doesn't exist yet
      const { data: offerData, error: fetchError } = await supabase
        .schema('common')
        .from('offers')
        .select('*')
        .eq('id', offerId)
        .single();

      if (fetchError) {
        console.error('Database error fetching offer:', {
          code: fetchError.code,
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          offerId: offerId
        });
        
        // Check if it's a "not found" error (PGRST116 = no rows returned)
        if (fetchError.code === 'PGRST116') {
          throw new Error(`Offer with ID ${offerId} not found in database`);
        }
        
        // Check if it's a column doesn't exist error
        if (fetchError.message?.includes('column') || fetchError.message?.includes('does not exist')) {
          console.warn('signing_token column may not exist yet. Please run the migration.');
        }
        
        throw new Error(`Database error: ${fetchError.message || 'Unknown error'}`);
      }

      if (!offerData) {
        console.error('No offer data returned for ID:', offerId);
        throw new Error('Offer not found');
      }

      console.log('Offer found:', { id: offerData.id, hasToken: !!(offerData as any).signing_token });

      // Always ensure a unique token exists - generate if missing
      let token = (offerData as any).signing_token;
      if (!token || token.length !== 64) {
        // Generate cryptographically secure random token (64 hex characters)
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        
        // Update the offer with the new token
        const { error: updateError } = await supabase
          .schema('common')
          .from('offers')
          .update({ signing_token: token })
          .eq('id', offerId);
        
        if (updateError) {
          console.error('Error updating signing token:', updateError);
          throw new Error(`Failed to generate signing link: ${updateError.message}`);
        }
      }

      const baseUrl = window.location.origin;
      return `${baseUrl}/sign-offer/${token}`;
    } catch (error: any) {
      console.error('Error in generateSigningLink:', error);
      throw error;
    }
  },

  async getAttachments(offerId: string): Promise<OfferAttachment[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('offer_attachments')
      .select('*')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: true });

    if (error) {
      // Table missing (migration not run) or 404 — return empty so UI doesn't break
      const status = (error as { status?: number }).status;
      const msg = (error as { message?: string }).message ?? '';
      if (status === 404 || error.code === 'PGRST116' || /relation.*does not exist/i.test(msg)) {
        return [];
      }
      console.error('Error fetching offer attachments:', error);
      throw error;
    }
    return (data || []) as OfferAttachment[];
  },

  async addAttachment(offerId: string, file: File, name?: string): Promise<OfferAttachment> {
    const fileExt = file.name.split('.').pop() || 'pdf';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${fileExt}`;
    const filePath = `offer-attachments/${offerId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
    const displayName = name?.trim() || file.name;

    const { data: row, error: insertError } = await supabase
      .schema('common')
      .from('offer_attachments')
      .insert({ offer_id: offerId, name: displayName, file_path: filePath, file_url: urlData.publicUrl })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from('documents').remove([filePath]);
      throw insertError;
    }
    return row as OfferAttachment;
  },

  async deleteAttachment(attachmentId: string): Promise<void> {
    const { data: row, error: fetchError } = await supabase
      .schema('common')
      .from('offer_attachments')
      .select('file_path')
      .eq('id', attachmentId)
      .single();

    if (!fetchError && row?.file_path) {
      await supabase.storage.from('documents').remove([(row as { file_path: string }).file_path]);
    }
    const { error: deleteError } = await supabase
      .schema('common')
      .from('offer_attachments')
      .delete()
      .eq('id', attachmentId);

    if (deleteError) throw deleteError;
  },
};
