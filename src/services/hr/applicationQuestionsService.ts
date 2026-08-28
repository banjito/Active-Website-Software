import { supabase } from '@/lib/supabase';
import { withWriteRetry, describeSupabaseError } from '@/lib/supabaseRetry';

export type ApplicationQuestionType =
  | 'short_text'
  | 'long_text'
  | 'yes_no'
  | 'single_select'
  | 'multi_select';

export const APPLICATION_QUESTION_TYPE_LABELS: Record<ApplicationQuestionType, string> = {
  short_text: 'Short answer',
  long_text: 'Long answer',
  yes_no: 'Yes / No',
  single_select: 'Pick one',
  multi_select: 'Pick any',
};

/** Types whose answers come from a fixed choice list. */
export function questionTypeUsesOptions(type: ApplicationQuestionType): boolean {
  return type === 'single_select' || type === 'multi_select';
}

export interface ApplicationQuestion {
  id: string;
  requisition_id: string;
  label: string;
  question_type: ApplicationQuestionType;
  options: string[];
  help_text?: string | null;
  display_order: number;
  required: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateApplicationQuestionInput {
  requisition_id: string;
  label: string;
  question_type: ApplicationQuestionType;
  options?: string[];
  help_text?: string | null;
  display_order?: number;
  required?: boolean;
}

/**
 * A question as the builder holds it in memory. `id` is present only once the
 * question exists in the database, which lets the same UI drive the create
 * modal (nothing saved yet) and the manage dialog (already saved).
 */
export interface DraftApplicationQuestion {
  id?: string;
  label: string;
  question_type: ApplicationQuestionType;
  options: string[];
  help_text: string;
  required: boolean;
}

export function toDraft(question: ApplicationQuestion): DraftApplicationQuestion {
  return {
    id: question.id,
    label: question.label,
    question_type: question.question_type,
    options: question.options,
    help_text: question.help_text || '',
    required: question.required,
  };
}

/** Strip the id so a question can be copied onto another posting. */
export function toNewDraft(question: ApplicationQuestion): DraftApplicationQuestion {
  const { id, ...rest } = toDraft(question);
  return rest;
}

export interface CandidateQuestionAnswer {
  id: string;
  candidate_id: string;
  question_id: string | null;
  question_label: string;
  question_type: ApplicationQuestionType;
  answer_text: string | null;
  answer_bool: boolean | null;
  answer_json: string[] | null;
  display_order: number;
  created_at: string;
}

/** One answer as the public form submits it. */
export interface SubmitAnswerInput {
  question_id: string;
  question_label: string;
  question_type: ApplicationQuestionType;
  answer_text?: string | null;
  answer_bool?: boolean | null;
  answer_json?: string[] | null;
  display_order: number;
}

/** PostgREST returns jsonb as unknown; normalise to a string array. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function normaliseQuestion(row: any): ApplicationQuestion {
  return { ...row, options: toStringArray(row?.options) };
}

export const applicationQuestionsService = {
  /** Questions for a requisition, as HR sees them (signed in). */
  async getByRequisition(requisitionId: string): Promise<ApplicationQuestion[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_application_questions')
      .select('*')
      .eq('requisition_id', requisitionId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching application questions:', describeSupabaseError(error));
      throw error;
    }
    return (data || []).map(normaliseQuestion);
  },

  /**
   * Questions for a requisition as an applicant sees them. Reads the public
   * view, so it works without a login and only returns questions on a posting
   * that is actually live.
   */
  async getPublicByRequisition(requisitionId: string): Promise<ApplicationQuestion[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('v_public_application_questions')
      .select('*')
      .eq('requisition_id', requisitionId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching public application questions:', describeSupabaseError(error));
      throw error;
    }
    return (data || []).map(normaliseQuestion);
  },

  async create(input: CreateApplicationQuestionInput): Promise<ApplicationQuestion> {
    const { data, error } = await supabase
      .schema('common')
      .from('job_application_questions')
      .insert({
        requisition_id: input.requisition_id,
        label: input.label,
        question_type: input.question_type,
        options: questionTypeUsesOptions(input.question_type) ? (input.options ?? []) : [],
        help_text: input.help_text || null,
        display_order: input.display_order ?? 0,
        required: input.required ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating application question:', describeSupabaseError(error));
      throw error;
    }
    return normaliseQuestion(data);
  },

  async update(
    id: string,
    input: Partial<Omit<CreateApplicationQuestionInput, 'requisition_id'>>,
  ): Promise<ApplicationQuestion> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.question_type !== undefined) {
      patch.question_type = input.question_type;
      // A type that has no choice list must not keep a stale one.
      if (!questionTypeUsesOptions(input.question_type)) patch.options = [];
    }
    if (input.options !== undefined && patch.options === undefined) patch.options = input.options;
    if (input.help_text !== undefined) patch.help_text = input.help_text || null;
    if (input.display_order !== undefined) patch.display_order = input.display_order;
    if (input.required !== undefined) patch.required = input.required;

    const { data, error } = await withWriteRetry(
      () =>
        supabase
          .schema('common')
          .from('job_application_questions')
          .update(patch)
          .eq('id', id)
          .select()
          .single(),
      { label: 'update application question' },
    );

    if (error) {
      console.error('Error updating application question:', describeSupabaseError(error));
      throw error;
    }
    return normaliseQuestion(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await withWriteRetry(
      () => supabase.schema('common').from('job_application_questions').delete().eq('id', id),
      { label: 'delete application question' },
    );

    if (error) {
      console.error('Error deleting application question:', describeSupabaseError(error));
      throw error;
    }
  },

  /**
   * Make the stored questions for a requisition match `drafts`, in order.
   * Questions dropped from the list are deleted; the rest are updated or
   * inserted. Called once when HR saves, rather than on every keystroke.
   */
  async saveForRequisition(
    requisitionId: string,
    drafts: DraftApplicationQuestion[],
  ): Promise<void> {
    const existing = await this.getByRequisition(requisitionId);
    const keptIds = new Set(drafts.map((d) => d.id).filter(Boolean) as string[]);

    for (const question of existing) {
      if (!keptIds.has(question.id)) await this.delete(question.id);
    }

    for (let index = 0; index < drafts.length; index++) {
      const draft = drafts[index];
      const fields = {
        label: draft.label,
        question_type: draft.question_type,
        options: draft.options,
        help_text: draft.help_text,
        required: draft.required,
        display_order: index,
      };
      if (draft.id) {
        await this.update(draft.id, fields);
      } else {
        await this.create({ requisition_id: requisitionId, ...fields });
      }
    }
  },

  /** Answers on one candidate, for the recruiter view. */
  async getAnswersForCandidate(candidateId: string): Promise<CandidateQuestionAnswer[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidate_question_answers')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching candidate answers:', describeSupabaseError(error));
      throw error;
    }
    return (data || []).map((row: any) => ({
      ...row,
      answer_json: Array.isArray(row?.answer_json) ? toStringArray(row.answer_json) : null,
    }));
  },

  /**
   * Submit an applicant's answers. Goes through an RPC because the applicant is
   * not signed in and must not hold a direct insert on the answers table. Safe
   * to retry: a second call for the same candidate inserts nothing.
   */
  async submitAnswers(candidateId: string, answers: SubmitAnswerInput[]): Promise<number> {
    if (answers.length === 0) return 0;

    const { data, error } = await withWriteRetry(
      () =>
        supabase.schema('common').rpc('submit_application_answers', {
          p_candidate_id: candidateId,
          p_answers: answers,
        }),
      { label: 'submit application answers' },
    );

    if (error) {
      console.error('Error submitting application answers:', describeSupabaseError(error));
      throw error;
    }
    return typeof data === 'number' ? data : 0;
  },
};
