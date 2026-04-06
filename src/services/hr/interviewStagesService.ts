import { supabase } from '@/lib/supabase';

export interface InterviewStage {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  default_duration_minutes: number;
  is_final_stage: boolean;
  created_at: string;
  updated_at: string;
}

export interface InterviewStageQuestion {
  id: string;
  stage_id: string;
  label: string;
  question_type: 'text' | 'checkbox';
  display_order: number;
  required: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStageInput {
  name: string;
  slug: string;
  display_order?: number;
  default_duration_minutes?: number;
  is_final_stage?: boolean;
}

export interface CreateQuestionInput {
  stage_id: string;
  label: string;
  question_type: 'text' | 'checkbox';
  display_order?: number;
  required?: boolean;
}

export const interviewStagesService = {
  async getStages(): Promise<InterviewStage[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stages')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching interview stages:', error);
      throw error;
    }
    return data || [];
  },

  async getStageBySlug(slug: string): Promise<InterviewStage | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stages')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    return data;
  },

  async getQuestionsForStage(stageId: string): Promise<InterviewStageQuestion[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stage_questions')
      .select('*')
      .eq('stage_id', stageId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching stage questions:', error);
      throw error;
    }
    return data || [];
  },

  async getQuestionsByStageSlug(slug: string): Promise<InterviewStageQuestion[]> {
    const stage = await this.getStageBySlug(slug);
    if (!stage) return [];
    return this.getQuestionsForStage(stage.id);
  },

  async createStage(input: CreateStageInput): Promise<InterviewStage> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stages')
      .insert({
        name: input.name,
        slug: input.slug,
        display_order: input.display_order ?? 0,
        default_duration_minutes: input.default_duration_minutes ?? 60,
        is_final_stage: input.is_final_stage ?? false,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async updateStage(id: string, input: Partial<CreateStageInput>): Promise<InterviewStage> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stages')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteStage(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('interview_stages')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async createQuestion(input: CreateQuestionInput): Promise<InterviewStageQuestion> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stage_questions')
      .insert({
        stage_id: input.stage_id,
        label: input.label,
        question_type: input.question_type,
        display_order: input.display_order ?? 0,
        required: input.required ?? false,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async updateQuestion(id: string, input: Partial<CreateQuestionInput>): Promise<InterviewStageQuestion> {
    const { data, error } = await supabase
      .schema('common')
      .from('interview_stage_questions')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteQuestion(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('interview_stage_questions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async reorderQuestions(stageId: string, questionIds: string[]): Promise<void> {
    for (let i = 0; i < questionIds.length; i++) {
      await supabase
        .schema('common')
        .from('interview_stage_questions')
        .update({ display_order: i, updated_at: new Date().toISOString() })
        .eq('id', questionIds[i])
        .eq('stage_id', stageId);
    }
  },
};
