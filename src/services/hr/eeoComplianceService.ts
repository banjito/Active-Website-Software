import { supabase } from '@/lib/supabase';

export interface EeoSubmission {
  id: string;
  requisition_id?: string;
  position_title: string;
  department?: string;
  gender?: string;
  race?: string;
  veteran: boolean;
  disability: boolean;
  candidate_status?: string;
  submitted_at: string;
}

export interface EeoSubmissionInput {
  requisition_id?: string;
  position_title: string;
  department?: string;
  gender?: string;
  race?: string;
  veteran?: boolean;
  disability?: boolean;
  candidate_status?: string;
}

export interface EeoAggregation {
  position_title: string;
  department?: string;
  requisition_id?: string;
  total: number;
  genderBreakdown: Record<string, number>;
  raceBreakdown: Record<string, number>;
  veteranCount: number;
  disabilityCount: number;
  statusBreakdown: Record<string, number>;
}

export type EeoPipelineStage = 'applied' | 'rejected' | 'hired';

export interface EeoPipelineSummary {
  stage: EeoPipelineStage;
  label: string;
  total: number;
  genderBreakdown: Record<string, number>;
  genderPercent: Record<string, number>;
  raceBreakdown: Record<string, number>;
  racePercent: Record<string, number>;
  veteranCount: number;
  veteranPercent: number;
  disabilityCount: number;
  disabilityPercent: number;
}

function stageFromStatus(status: string): EeoPipelineStage {
  if (status === 'hired') return 'hired';
  if (status === 'rejected') return 'rejected';
  return 'applied';
}

export const eeoComplianceService = {
  async updateEeoStatus(requisitionId: string, positionTitle: string, newStatus: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('eeo_submissions')
      .update({ candidate_status: newStatus })
      .eq('requisition_id', requisitionId)
      .eq('position_title', positionTitle)
      .eq('candidate_status', 'new');

    if (error) {
      console.error('Error updating EEO status (non-blocking):', error);
    }
  },

  async updateEeoStatusByPosition(positionTitle: string, oldStatus: string, newStatus: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('eeo_submissions')
      .update({ candidate_status: newStatus })
      .eq('position_title', positionTitle)
      .eq('candidate_status', oldStatus);

    if (error) {
      console.error('Error updating EEO status by position (non-blocking):', error);
    }
  },

  async submit(input: EeoSubmissionInput): Promise<EeoSubmission> {
    const { data, error } = await supabase
      .schema('common')
      .from('eeo_submissions')
      .insert({
        requisition_id: input.requisition_id || null,
        position_title: input.position_title,
        department: input.department || null,
        gender: input.gender || null,
        race: input.race || null,
        veteran: input.veteran ?? false,
        disability: input.disability ?? false,
        candidate_status: input.candidate_status || 'new',
      })
      .select()
      .single();

    if (error) {
      console.error('Error submitting EEO data:', error);
      throw error;
    }
    return data;
  },

  async getAll(): Promise<EeoSubmission[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('eeo_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching EEO submissions:', error);
      throw error;
    }
    return data || [];
  },

  async getAggregatedByPosition(): Promise<EeoAggregation[]> {
    const submissions = await this.getAll();

    const grouped: Record<string, EeoSubmission[]> = {};
    for (const s of submissions) {
      const key = s.position_title || 'Unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    }

    return Object.entries(grouped).map(([title, items]) => {
      const genderBreakdown: Record<string, number> = {};
      const raceBreakdown: Record<string, number> = {};
      const statusBreakdown: Record<string, number> = {};
      let veteranCount = 0;
      let disabilityCount = 0;

      for (const item of items) {
        const g = item.gender || 'Not reported';
        genderBreakdown[g] = (genderBreakdown[g] || 0) + 1;

        const r = item.race || 'Not reported';
        raceBreakdown[r] = (raceBreakdown[r] || 0) + 1;

        const st = item.candidate_status || 'new';
        statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;

        if (item.veteran) veteranCount++;
        if (item.disability) disabilityCount++;
      }

      return {
        position_title: title,
        department: items[0]?.department || undefined,
        requisition_id: items[0]?.requisition_id || undefined,
        total: items.length,
        genderBreakdown,
        raceBreakdown,
        veteranCount,
        disabilityCount,
        statusBreakdown,
      };
    });
  },

  async getOverallSummary() {
    const submissions = await this.getAll();
    const total = submissions.length;

    const genderBreakdown: Record<string, number> = {};
    const raceBreakdown: Record<string, number> = {};
    let veteranCount = 0;
    let disabilityCount = 0;

    for (const s of submissions) {
      const g = s.gender || 'Not reported';
      genderBreakdown[g] = (genderBreakdown[g] || 0) + 1;
      const r = s.race || 'Not reported';
      raceBreakdown[r] = (raceBreakdown[r] || 0) + 1;
      if (s.veteran) veteranCount++;
      if (s.disability) disabilityCount++;
    }

    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

    return {
      total,
      genderBreakdown,
      genderPercent: Object.fromEntries(
        Object.entries(genderBreakdown).map(([k, v]) => [k, pct(v)])
      ),
      raceBreakdown,
      racePercent: Object.fromEntries(
        Object.entries(raceBreakdown).map(([k, v]) => [k, pct(v)])
      ),
      veteranCount,
      veteranPercent: pct(veteranCount),
      disabilityCount,
      disabilityPercent: pct(disabilityCount),
    };
  },

  async getPipelineBreakdown(positionFilter?: string): Promise<EeoPipelineSummary[]> {
    let submissions = await this.getAll();
    if (positionFilter && positionFilter !== 'all') {
      submissions = submissions.filter(s => s.position_title === positionFilter);
    }

    const stages: { stage: EeoPipelineStage; label: string; filter: (s: EeoSubmission) => boolean }[] = [
      { stage: 'applied', label: 'All Applicants', filter: () => true },
      { stage: 'hired', label: 'Hired', filter: s => stageFromStatus(s.candidate_status || 'new') === 'hired' },
      { stage: 'rejected', label: 'Rejected', filter: s => stageFromStatus(s.candidate_status || 'new') === 'rejected' },
    ];

    return stages.map(({ stage, label, filter }) => {
      const items = submissions.filter(filter);
      const total = items.length;
      const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

      const genderBreakdown: Record<string, number> = {};
      const raceBreakdown: Record<string, number> = {};
      let veteranCount = 0;
      let disabilityCount = 0;

      for (const item of items) {
        const g = item.gender || 'Not reported';
        genderBreakdown[g] = (genderBreakdown[g] || 0) + 1;
        const r = item.race || 'Not reported';
        raceBreakdown[r] = (raceBreakdown[r] || 0) + 1;
        if (item.veteran) veteranCount++;
        if (item.disability) disabilityCount++;
      }

      return {
        stage,
        label,
        total,
        genderBreakdown,
        genderPercent: Object.fromEntries(Object.entries(genderBreakdown).map(([k, v]) => [k, pct(v)])),
        raceBreakdown,
        racePercent: Object.fromEntries(Object.entries(raceBreakdown).map(([k, v]) => [k, pct(v)])),
        veteranCount,
        veteranPercent: pct(veteranCount),
        disabilityCount,
        disabilityPercent: pct(disabilityCount),
      };
    });
  },
};
