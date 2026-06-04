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

// One-line drawing interface
export interface OneLineDrawing {
  id: string;
  job_id: string;
  user_id: string;
  name: string;
  description?: string;
  file_url: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  version: string;
  is_current: boolean;
  upload_date: string;
  created_at: string;
  updated_at: string;
}

// General document interface (for documents bucket)
export interface Document {
  id: string;
  title: string;
  description?: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  division?: string;
  category?: string;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

// Document upload interface
export interface DocumentUpload {
  title: string;
  description?: string;
  file: File;
  division: string;
  category?: string;
  tags?: string[];
}

// One-line drawing upload interface
export interface OneLineDrawingUpload {
  name: string;
  description?: string;
  file: File;
  job_id: string;
  version?: string;
}

// Storage bucket types
export type StorageBucket = 'job-documents' | 'one-line-drawings' | 'documents' | 'user-uploads';

// Document categories
export type DocumentCategory = 
  | 'general'
  | 'reports'
  | 'manuals'
  | 'forms'
  | 'contracts'
  | 'agreements'
  | 'drawings'
  | 'schematics'
  | 'specifications';

// Opportunity type classification
export type OpportunityType = 'large_acceptance' | 'small_acceptance' | 'maintenance' | 'other' | 'time_materials' | 'engineering';

export interface Opportunity {
  id: string;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
  customer_id: string;
  contact_id?: string | null;
  title?: string;
  description?: string;
  status: 'awareness' | 'interest' | 'quote' | 'decision' | 'decision - forecasted win' | 'decision - forecast lose' | 'awarded' | 'lost' | 'no quote';
  expected_value?: number;
  probability?: number;
  opportunity_created_date?: string;
  letter_proposal_date?: string;
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
  opportunity_type?: OpportunityType;
  documents_stage?: string;
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
  letter_proposal_date?: string;
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
  opportunity_type: OpportunityType;
  documents_stage?: string;
} 
