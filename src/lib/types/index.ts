export interface ReportInfo {
  identifier: string;
  substation?: string;
  equipmentLocation?: string;
}

export interface Header {
  identifier: string;
  substation?: string;
  equipmentLocation?: string;
  [key: string]: any;
}

export interface PanelboardReportInfo {
  identifier: string;
  customer: string;
  address: string;
  jobNumber: string;
  technicians: string;
  temperatureF: number;
  temperatureC: number;
  substation: string;
  date: string;
  panelType: string;
  phaseConfiguration: string;
}

export interface SubcontractorAgreement {
  id: string;
  name: string;
  file_url: string;
  upload_date: string;
  status: 'pending' | 'signed' | 'expired' | 'cancelled';
  value?: number;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface Opportunity {
  id: string;
  created_at: string;
  updated_at: string;
  customer_id: string;
  contact_id?: string | null;
  title?: string;
  description?: string;
  status: 'awareness' | 'interest' | 'quote' | 'decision' | 'decision - forecasted win' | 'decision - forecast lose' | 'awarded' | 'lost' | 'no quote';
  expected_value?: number;
  probability?: number;
  opportunity_created_date?: string;
  letter_proposal_created_date?: string;
  quote_number: string;
  notes?: string;
  job_id?: string;
  awarded_date?: string;
  sales_person?: string;
  amp_division?: string;
  reviewed_by?: string;
  prepared_by?: string;
  jobsite_location?: string;
  estimated_start_date?: string;
  period_of_performance?: string;
  total_man_hours?: number;
  subcontractor_agreements?: SubcontractorAgreement[];
}

export interface OpportunityFormData {
  customer_id: string;
  contact_id?: string | null;
  title?: string;
  description: string;
  status: 'awareness' | 'interest' | 'quote' | 'decision' | 'decision - forecasted win' | 'decision - forecast lose' | 'awarded' | 'lost' | 'no quote';
  expected_value: string;
  probability: string;
  opportunity_created_date?: string;
  proposal_due_date?: string;
  notes: string;
  sales_person: string;
  amp_division: string;
  quoted_amount: string;
  selected_letter_proposal: string;
  reviewed_by: string;
  prepared_by: string;
  jobsite_location: string;
  estimated_start_date: string;
  period_of_performance: string;
  total_man_hours: string;
} 