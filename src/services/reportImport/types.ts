export interface ReportData {
  schemaVersion?: number;
  exportId?: string;
  reportType: string; // e.g., "23-MediumVoltageMotorStarterMTSReport.tsx"
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  sections?: Array<{
    title: string;
    fields: Array<{
      label: string;
      type: string;
      value: any;
    }>;
  }>;
  [key: string]: any;
}

export interface ReportImportResult {
  success: boolean;
  reportId?: string;
  reportType?: string;
  error?: string;
}

export interface ReportImporter {
  canImport(data: ReportData): boolean;
  import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult>;
}

export interface DatabaseSchema {
  columns: string[];
  jsonbColumns: string[];
}

export interface ContactResistanceData {
  tests: any[];
  dielectricTests?: any[];
} 