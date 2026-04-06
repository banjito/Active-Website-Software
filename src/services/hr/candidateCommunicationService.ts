import { supabase } from '@/lib/supabase';
import type { Candidate } from './candidatesService';

export interface CandidateCommunicationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  name: string;
  subject: string;
  body: string;
}

const PLACEHOLDERS = [
  '{{first_name}}',
  '{{last_name}}',
  '{{candidate_name}}',
  '{{email}}',
  '{{position_applied}}',
  '{{phone}}',
  '{{location}}',
] as const;

/** Replace template placeholders with candidate data */
export function fillTemplate(
  subject: string,
  body: string,
  candidate: Candidate | null
): { subject: string; body: string } {
  if (!candidate) return { subject, body };
  const fullName = `${candidate.first_name} ${candidate.last_name}`.trim();
  let subj = subject;
  let b = body;
  subj = subj.replace(/\{\{candidate_name\}\}/g, fullName);
  subj = subj.replace(/\{\{first_name\}\}/g, candidate.first_name || '');
  subj = subj.replace(/\{\{last_name\}\}/g, candidate.last_name || '');
  subj = subj.replace(/\{\{email\}\}/g, candidate.email || '');
  subj = subj.replace(/\{\{position_applied\}\}/g, candidate.position_applied || '');
  subj = subj.replace(/\{\{phone\}\}/g, candidate.phone || '');
  subj = subj.replace(/\{\{location\}\}/g, candidate.location || '');
  b = b.replace(/\{\{candidate_name\}\}/g, fullName);
  b = b.replace(/\{\{first_name\}\}/g, candidate.first_name || '');
  b = b.replace(/\{\{last_name\}\}/g, candidate.last_name || '');
  b = b.replace(/\{\{email\}\}/g, candidate.email || '');
  b = b.replace(/\{\{position_applied\}\}/g, candidate.position_applied || '');
  b = b.replace(/\{\{phone\}\}/g, candidate.phone || '');
  b = b.replace(/\{\{location\}\}/g, candidate.location || '');
  return { subject: subj, body: b };
}

export function getPlaceholderList(): readonly string[] {
  return PLACEHOLDERS;
}

export const candidateCommunicationService = {
  async getTemplates(): Promise<CandidateCommunicationTemplate[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidate_communication_templates')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async getTemplateById(id: string): Promise<CandidateCommunicationTemplate | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidate_communication_templates')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return data;
  },

  async createTemplate(input: CreateTemplateInput): Promise<CandidateCommunicationTemplate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidate_communication_templates')
      .insert({
        name: input.name,
        subject: input.subject,
        body: input.body,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async updateTemplate(
    id: string,
    input: Partial<CreateTemplateInput>
  ): Promise<CandidateCommunicationTemplate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidate_communication_templates')
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

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('candidate_communication_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  fillTemplate,
  getPlaceholderList,
};
