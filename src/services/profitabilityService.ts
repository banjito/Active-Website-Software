import { supabase } from '../lib/supabase';

export interface SOVItem {
  item: string;
  quantity: number;
  materialPrice: number;
  laborMen: number;
  laborHours: number;
  notes?: string;
}

export interface HoursSummary {
  men: number;
  hoursPerDay: number;
  daysOnsite: number;
  workHours: number;
  nonSovHours: number;
  travelHours: number;
  totalHours: number;
  straightTimeHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
}

export interface TravelExpense {
  trips: number;
  totalMiles: number;
  rate: number;
  vehicleTravelCost: number;
}

export interface PerDiem {
  numDays: number;
  firstDayRate: number;
}

export interface TravelData {
  travelExpense: TravelExpense[];
  perDiem: PerDiem[];
}

export interface EstimateData {
  sovItems: SOVItem[];
  hoursSummary: HoursSummary;
  travel_data: TravelData;
}

export interface BudgetData {
  opportunityId: string | null;
  quotedAmount: number;
  estimateData: EstimateData | null;
  jobStatus: string;
  jobEstimatedHours: number | null;
}

const FALLBACK_RATE = 45;

export async function getJobBudgetData(jobId: string): Promise<BudgetData> {
  const [jobResult, oppResult] = await Promise.all([
    supabase
      .schema('neta_ops')
      .from('jobs')
      .select('status, estimated_man_hours')
      .eq('id', jobId)
      .maybeSingle(),
    supabase
      .schema('business')
      .from('opportunities')
      .select('id, quoted_amount')
      .eq('job_id', jobId)
      .maybeSingle(),
  ]);

  const job = jobResult.data;
  const opp = oppResult.data;

  if (!opp) {
    return {
      opportunityId: null,
      quotedAmount: 0,
      estimateData: null,
      jobStatus: job?.status ?? 'unknown',
      jobEstimatedHours: job?.estimated_man_hours ?? null,
    };
  }

  const { data: estimate } = await supabase
    .schema('business')
    .from('estimates')
    .select('data')
    .eq('opportunity_id', opp.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let estimateData: EstimateData | null = null;
  if (estimate?.data) {
    const raw = estimate.data as any;
    estimateData = {
      sovItems: raw.sovItems ?? [],
      hoursSummary: raw.hoursSummary ?? {
        workHours: 0, nonSovHours: 0, travelHours: 0, totalHours: 0,
        men: 0, hoursPerDay: 0, daysOnsite: 0,
        straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0,
      },
      travel_data: raw.travel_data ?? { travelExpense: [], perDiem: [] },
    };
  }

  return {
    opportunityId: opp.id,
    quotedAmount: Number(opp.quoted_amount ?? 0),
    estimateData,
    jobStatus: job?.status ?? 'unknown',
    jobEstimatedHours: job?.estimated_man_hours ?? null,
  };
}

export async function getOverheadRate(): Promise<number> {
  try {
    const { data } = await supabase
      .schema('common')
      .from('app_settings')
      .select('value')
      .eq('key', 'profitability_overhead_rate')
      .maybeSingle();
    if (data?.value != null) return Number(data.value);
  } catch {
    // table may not exist yet
  }
  const stored = localStorage.getItem('profitability_overhead_rate');
  return stored != null ? Number(stored) : 0.494;
}

export async function saveOverheadRate(rate: number): Promise<void> {
  localStorage.setItem('profitability_overhead_rate', String(rate));
  try {
    await supabase
      .schema('common')
      .from('app_settings')
      .upsert({ key: 'profitability_overhead_rate', value: rate }, { onConflict: 'key' });
  } catch {
    // table may not exist; localStorage already saved
  }
}

export { FALLBACK_RATE };
