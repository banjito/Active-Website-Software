/**
 * Standardized Report Structure for AMP Reports
 * 
 * This file defines the standard interfaces and types that all reports should follow
 * to ensure consistency across the application.
 */

// Base interfaces that all reports should implement
export interface BaseReportData {
  // Job Information (standardized across all reports)
  jobInfo: {
    customer: string;
    address: string;
    date: string; // ISO date string
    technicians: string;
    jobNumber: string;
    substation: string;
    eqptLocation: string;
    identifier: string;
    userName: string;
  };

  // Environmental conditions (standardized)
  environmental: {
    temperature: {
      fahrenheit: number;
      celsius: number;
      tcf: number; // Temperature correction factor
    };
    humidity: number;
  };

  // Report status and metadata
  metadata: {
    status: 'PASS' | 'FAIL' | 'PENDING';
    reportType: string; // e.g., 'switchgear', 'transformer', etc.
    version: string; // Report template version
    isEditing?: boolean;
  };

  // Comments section (standardized)
  comments: string;
}

// Nameplate data structure (for equipment that has nameplates)
export interface StandardNameplateData {
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type?: string;
  manufacturingDate?: string;
  // Equipment-specific fields can extend this interface
}

// Visual inspection structure (standardized)
export interface VisualInspectionItem {
  netaSection: string; // e.g., "7.1.A.1"
  description: string;
  result: 'Select One' | 'Satisfactory' | 'Unsatisfactory' | 'Cleaned' | 'See Comments' | 'Not Applicable' | 'N/A';
  comments?: string;
}

export interface StandardVisualInspection {
  items: VisualInspectionItem[];
  generalComments?: string;
}

// Test equipment structure (standardized)
export interface TestEquipmentItem {
  equipmentType: string; // e.g., "Megohmmeter", "Contact Resistance Tester"
  manufacturer: string;
  model: string;
  serialNumber: string;
  ampId?: string; // AMP's internal equipment ID
  calibrationDate?: string;
  calibrationDue?: string;
}

export interface StandardTestEquipment {
  equipment: TestEquipmentItem[];
  comments?: string;
}

// Electrical test result structure
export interface ElectricalTestResult {
  testType: string;
  testVoltage?: string;
  measuredValue: string;
  correctedValue?: string; // Temperature corrected
  units: string;
  passCriteria?: string;
  result: 'PASS' | 'FAIL' | 'N/A';
  comments?: string;
}

// Insulation resistance test structure (standardized)
export interface InsulationResistanceTest {
  testVoltage: string;
  measurements: {
    [key: string]: string; // e.g., "ag", "bg", "cg", "ab", "bc", "ca"
  };
  correctedValues?: {
    [key: string]: string; // Temperature corrected values
  };
  units: string;
  comments?: string;
}

// Contact resistance test structure (standardized)
export interface ContactResistanceTest {
  measurements: {
    [key: string]: string; // e.g., "aPhase", "bPhase", "cPhase"
  };
  units: string;
  testCurrent?: string;
  comments?: string;
}

// Database storage structure (standardized)
export interface StandardReportRecord {
  id: string;
  job_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  
  // Standardized JSONB columns
  report_info: BaseReportData;
  nameplate_data?: StandardNameplateData;
  visual_inspection?: StandardVisualInspection;
  test_equipment?: StandardTestEquipment;
  
  // Equipment-specific test data (varies by report type)
  electrical_tests?: {
    insulation_resistance?: InsulationResistanceTest[];
    contact_resistance?: ContactResistanceTest[];
    dielectric_withstand?: ElectricalTestResult[];
    [key: string]: any; // Allow for equipment-specific tests
  };
  
  // Additional equipment-specific data
  equipment_specific?: {
    [key: string]: any; // Flexible for equipment-specific needs
  };
}

// Report type definitions
export type ReportType = 
  | 'switchgear'
  | 'panelboard' 
  | 'dry_type_transformer'
  | 'large_dry_type_transformer'
  | 'liquid_filled_transformer'
  | 'oil_transformer'
  | 'medium_voltage_cable'
  | 'low_voltage_cable'
  | 'circuit_breaker'
  | 'current_transformer'
  | 'voltage_transformer'
  | 'motor_starter'
  | 'automatic_transfer_switch';

// Standard dropdown options (to be used across all reports)
export const STANDARD_DROPDOWN_OPTIONS = {
  visualInspectionResults: [
    "Select One",
    "Satisfactory", 
    "Unsatisfactory",
    "Cleaned",
    "Repaired",
    "Adjusted",
    "See Comments",
    "Not Applicable",
    "N/A"
  ],
  
  insulationResistanceUnits: [
    { symbol: "kΩ", name: "Kilo-Ohms" },
    { symbol: "MΩ", name: "Mega-Ohms" },
    { symbol: "GΩ", name: "Giga-Ohms" }
  ],
  
  contactResistanceUnits: [
    { symbol: "µΩ", name: "Micro-Ohms" },
    { symbol: "mΩ", name: "Milli-Ohms" },
    { symbol: "Ω", name: "Ohms" }
  ],
  
  testVoltages: [
    "250V",
    "500V", 
    "1000V",
    "2500V",
    "5000V",
    "Other"
  ],
  
  passFailResults: [
    "PASS",
    "FAIL",
    "LIMITED SERVICE",
    "N/A"
  ],
  
  connectionTypes: [
    "Delta",
    "Wye", 
    "Single Phase"
  ],
  
  windingMaterials: [
    "Aluminum",
    "Copper"
  ]
} as const;

// Helper functions for report standardization
export const createStandardJobInfo = (overrides: Partial<BaseReportData['jobInfo']> = {}): BaseReportData['jobInfo'] => ({
  customer: '',
  address: '',
  date: new Date().toISOString().split('T')[0],
  technicians: '',
  jobNumber: '',
  substation: '',
  eqptLocation: '',
  identifier: '',
  userName: '',
  ...overrides
});

export const createStandardEnvironmental = (overrides: Partial<BaseReportData['environmental']> = {}): BaseReportData['environmental'] => ({
  temperature: {
    fahrenheit: 68,
    celsius: 20,
    tcf: 1.0
  },
  humidity: 50,
  ...overrides
});

export const createStandardMetadata = (reportType: ReportType, overrides: Partial<BaseReportData['metadata']> = {}): BaseReportData['metadata'] => ({
  status: 'PENDING',
  reportType,
  version: '1.0',
  ...overrides
});

// Validation functions
export const validateReportStructure = (report: any, reportType: ReportType): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Check required fields
  if (!report.report_info) {
    errors.push('Missing report_info section');
  } else {
    if (!report.report_info.jobInfo) {
      errors.push('Missing jobInfo in report_info');
    }
    if (!report.report_info.environmental) {
      errors.push('Missing environmental data in report_info');
    }
    if (!report.report_info.metadata) {
      errors.push('Missing metadata in report_info');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}; 