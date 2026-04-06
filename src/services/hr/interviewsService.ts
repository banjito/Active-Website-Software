import { supabase } from '@/lib/supabase';

export interface Interview {
  id: string;
  candidate_id: string;
  candidate?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    position_applied: string;
  };
  interview_type: 'phone' | 'video' | 'in-person' | 'panel';
  interview_stage: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  location?: string;
  video_link?: string;
  interviewer_ids: string[];
  interviewers?: Array<{
    id: string;
    email: string;
    user_metadata?: {
      name?: string;
    };
  }>;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show' | 'rescheduled';
  notes?: string;
  feedback?: string;
  rating?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInterviewInput {
  candidate_id: string;
  interview_type: 'phone' | 'video' | 'in-person' | 'panel';
  interview_stage: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  location?: string;
  video_link?: string;
  interviewer_ids: string[];
  status?: 'scheduled' | 'completed' | 'cancelled' | 'no-show' | 'rescheduled';
  notes?: string;
}

export const interviewsService = {
  async getAll(): Promise<Interview[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('interviews')
      .select('*')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('Error fetching interviews:', error);
      throw error;
    }

    // Fetch candidates separately and join
    const candidateIds = [...new Set((data || []).map((i: any) => i.candidate_id))];
    const { data: candidatesData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, phone, position_applied')
      .in('id', candidateIds);

    const candidatesMap = new Map((candidatesData || []).map((c: any) => [c.id, c]));

    return (data || []).map((item: any) => ({
      ...item,
      candidate: candidatesMap.get(item.candidate_id),
    }));
  },

  async getById(id: string): Promise<Interview | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('interviews')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching interview:', error);
      throw error;
    }

    if (!data) return null;

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, phone, position_applied')
      .eq('id', (data as any).candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },

  async getByCandidateId(candidateId: string): Promise<Interview[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('interviews')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('Error fetching interviews by candidate:', error);
      throw error;
    }

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, phone, position_applied')
      .eq('id', candidateId)
      .single();

    return (data || []).map((item: any) => ({
      ...item,
      candidate: candidateData || undefined,
    }));
  },

  async create(input: CreateInterviewInput, userId: string): Promise<Interview> {
    const { data, error } = await supabase
      .schema('common')
      .from('interviews')
      .insert({
        ...input,
        created_by: userId,
        status: input.status || 'scheduled',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating interview:', error);
      throw error;
    }

    // Update candidate status to 'interview'
    await supabase
      .schema('common')
      .from('candidates')
      .update({
        status: 'interview',
        last_contact_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.candidate_id);

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, phone, position_applied')
      .eq('id', input.candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },

  async update(id: string, input: Partial<CreateInterviewInput>): Promise<Interview> {
    const { data, error } = await supabase
      .schema('common')
      .from('interviews')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating interview:', error);
      throw error;
    }

    // Fetch candidate separately
    const candidateId = (data as any).candidate_id || input.candidate_id;
    if (candidateId) {
      const { data: candidateData } = await supabase
        .schema('common')
        .from('candidates')
        .select('id, first_name, last_name, email, phone, position_applied')
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
      .from('interviews')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting interview:', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: Interview['status'], feedback?: string, rating?: number): Promise<Interview> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (feedback !== undefined) {
      updateData.feedback = feedback;
    }

    if (rating !== undefined) {
      updateData.rating = rating;
    }

    const { data, error } = await supabase
      .schema('common')
      .from('interviews')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating interview status:', error);
      throw error;
    }

    // Fetch candidate separately
    const { data: candidateData } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email, phone, position_applied')
      .eq('id', (data as any).candidate_id)
      .single();

    return {
      ...data,
      candidate: candidateData || undefined,
    };
  },
};
