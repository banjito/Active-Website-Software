import { supabase } from '@/lib/supabase';
import { eeoComplianceService } from './eeoComplianceService';

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  location?: string;
  position_applied: string;
  requisition_id?: string;
  status: 'new' | 'screening' | 'interview' | 'offer' | 'offer_sent' | 'offer_accepted' | 'hired' | 'rejected';
  source: string;
  resume_url?: string;
  cover_letter?: string;
  cover_letter_url?: string;
  applied_date: string;
  last_contact_date?: string;
  notes?: string;
  eeo_gender?: string;
  eeo_race?: string;
  eeo_veteran?: boolean;
  eeo_disability?: boolean;
  linked_user_id?: string;
  linked_user_email?: string;
  fr_shirt_size?: string;
  fr_pant_size?: string;
  fr_jacket_size?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCandidateInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  location?: string;
  position_applied: string;
  requisition_id?: string;
  status?: 'new' | 'screening' | 'interview' | 'offer' | 'offer_sent' | 'offer_accepted' | 'hired' | 'rejected';
  source: string;
  resume_url?: string;
  cover_letter?: string;
  cover_letter_url?: string;
  notes?: string;
  eeo_gender?: string;
  eeo_race?: string;
  eeo_veteran?: boolean;
  eeo_disability?: boolean;
  fr_shirt_size?: string;
  fr_pant_size?: string;
  fr_jacket_size?: string;
}

export const candidatesService = {
  async getAll(): Promise<Candidate[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .select('*')
      .order('applied_date', { ascending: false });

    if (error) {
      console.error('Error fetching candidates:', error);
      throw error;
    }

    return data || [];
  },

  async getById(id: string): Promise<Candidate | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching candidate:', error);
      throw error;
    }

    return data;
  },

  async create(input: CreateCandidateInput): Promise<Candidate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .insert({
        ...input,
        status: input.status || 'new',
        applied_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating candidate:', error);
      throw error;
    }

    return data;
  },

  async update(id: string, input: Partial<CreateCandidateInput>): Promise<Candidate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating candidate:', error);
      throw error;
    }

    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('candidates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting candidate:', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: Candidate['status']): Promise<Candidate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .update({
        status,
        last_contact_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating candidate status:', error);
      throw error;
    }

    const candidate = data;
    if ((status === 'rejected' || status === 'hired') && candidate.requisition_id) {
      try {
        await eeoComplianceService.updateEeoStatus(
          candidate.requisition_id,
          candidate.position_applied,
          status,
        );
      } catch {
        // EEO sync is non-blocking
      }
    }

    return candidate;
  },

  async linkUser(candidateId: string, userId: string, userEmail: string): Promise<Candidate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .update({
        linked_user_id: userId,
        linked_user_email: userEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .select()
      .single();

    if (error) {
      console.error('Error linking user to candidate:', error);
      throw error;
    }

    return data;
  },

  async unlinkUser(candidateId: string): Promise<Candidate> {
    const { data, error } = await supabase
      .schema('common')
      .from('candidates')
      .update({
        linked_user_id: null,
        linked_user_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .select()
      .single();

    if (error) {
      console.error('Error unlinking user from candidate:', error);
      throw error;
    }

    return data;
  },

  async transferDocumentsToEmployee(candidateId: string, employeeId: string): Promise<{ transferred: number }> {
    const candidate = await this.getById(candidateId);
    if (!candidate) throw new Error('Candidate not found');

    let transferred = 0;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (candidate.resume_url) {
      try {
        const response = await fetch(candidate.resume_url);
        const blob = await response.blob();
        const fileName = `resume_${candidate.first_name}_${candidate.last_name}`.replace(/\s+/g, '_');
        const ext = candidate.resume_url.split('.').pop()?.split('?')[0] || 'pdf';
        const file = new File([blob], `${fileName}.${ext}`, { type: blob.type });

        const filePath = `employee-documents/${employeeId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('employee-documents')
          .upload(filePath, file);

        if (!uploadError) {
          const { data: urlData } = await supabase.storage
            .from('employee-documents')
            .createSignedUrl(filePath, 31536000);

          await supabase.schema('common').from('employee_documents').insert({
            employee_id: employeeId,
            name: `Resume – ${candidate.first_name} ${candidate.last_name}`,
            description: `Transferred from candidate application for ${candidate.position_applied}`,
            category: 'hr',
            file_path: filePath,
            file_url: urlData?.signedUrl || '',
            file_type: file.type || ext.toUpperCase(),
            file_size: file.size,
            tags: ['candidate-transfer', 'resume'],
            version: 1,
            uploaded_by: user.id,
          });
          transferred++;
        }
      } catch (e) {
        console.error('Error transferring resume:', e);
      }
    }

    if (candidate.cover_letter_url) {
      try {
        const response = await fetch(candidate.cover_letter_url);
        const blob = await response.blob();
        const ext = candidate.cover_letter_url.split('.').pop()?.split('?')[0] || 'pdf';
        const file = new File([blob], `cover_letter.${ext}`, { type: blob.type });

        const filePath = `employee-documents/${employeeId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('employee-documents')
          .upload(filePath, file);

        if (!uploadError) {
          const { data: urlData } = await supabase.storage
            .from('employee-documents')
            .createSignedUrl(filePath, 31536000);

          await supabase.schema('common').from('employee_documents').insert({
            employee_id: employeeId,
            name: `Cover Letter – ${candidate.first_name} ${candidate.last_name}`,
            description: `Transferred from candidate application for ${candidate.position_applied}`,
            category: 'hr',
            file_path: filePath,
            file_url: urlData?.signedUrl || '',
            file_type: file.type || ext.toUpperCase(),
            file_size: file.size,
            tags: ['candidate-transfer', 'cover-letter'],
            version: 1,
            uploaded_by: user.id,
          });
          transferred++;
        }
      } catch (e) {
        console.error('Error transferring cover letter:', e);
      }
    }

    const { data: offers } = await supabase
      .schema('common')
      .from('offers')
      .select('id, position_title, signed_document_url')
      .eq('candidate_id', candidateId)
      .eq('status', 'accepted');

    if (offers?.length) {
      for (const offer of offers) {
        if (!offer.signed_document_url) continue;
        try {
          const response = await fetch(offer.signed_document_url);
          const blob = await response.blob();
          const ext = offer.signed_document_url.split('.').pop()?.split('?')[0] || 'pdf';
          const file = new File([blob], `offer_letter.${ext}`, { type: blob.type });

          const filePath = `employee-documents/${employeeId}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('employee-documents')
            .upload(filePath, file);

          if (!uploadError) {
            const { data: urlData } = await supabase.storage
              .from('employee-documents')
              .createSignedUrl(filePath, 31536000);

            await supabase.schema('common').from('employee_documents').insert({
              employee_id: employeeId,
              name: `Signed Offer Letter – ${(offer as any).position_title}`,
              description: `Accepted offer transferred from candidate record`,
              category: 'contracts',
              file_path: filePath,
              file_url: urlData?.signedUrl || '',
              file_type: file.type || ext.toUpperCase(),
              file_size: file.size,
              tags: ['candidate-transfer', 'offer-letter'],
              version: 1,
              uploaded_by: user.id,
            });
            transferred++;
          }
        } catch (e) {
          console.error('Error transferring offer letter:', e);
        }
      }
    }

    return { transferred };
  },
};
