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
  expected_close_date?: string;
  quote_number: string;
  notes?: string;
  job_id?: string;
  awarded_date?: string;
  sales_person?: string;
  amp_division?: string;
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
  expected_close_date: string;
  notes: string;
  sales_person: string;
  amp_division: string;
} 