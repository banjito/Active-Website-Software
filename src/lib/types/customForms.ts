/**
 * Custom Form Builder Type Definitions
 * 
 * These types define the structure for custom form templates and instances.
 * Forms are composed of reusable components that can be customized and arranged.
 */

// ============================================================================
// Component Types - Building blocks for forms
// ============================================================================

export enum ComponentType {
  JOB_INFO = 'job-info',
  NAMEPLATE_DATA = 'nameplate-data',
  INSULATION_TEST = 'insulation-test',
  TEMPERATURE_CORRECTION = 'temperature-correction',
  VISUAL_INSPECTION = 'visual-inspection',
  TEST_EQUIPMENT = 'test-equipment',
  SHIELD_CONTINUITY = 'shield-continuity',
  WITHSTAND_TEST = 'withstand-test',
  COMMENTS = 'comments',
  CUSTOM_TABLE = 'custom-table',
  CUSTOM_TEXT = 'custom-text',
  FUSE_DATA = 'fuse-data',
  VOLTAGE_READINGS = 'voltage-readings',
  CURRENT_READINGS = 'current-readings',
  RESISTANCE_READINGS = 'resistance-readings',
}

export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  TEXTAREA = 'textarea',
  CHECKBOX = 'checkbox',
  CALCULATED = 'calculated',
}

// ============================================================================
// Field Configuration
// ============================================================================

export interface FieldConfig {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: any;
  options?: { label: string; value: string }[]; // For select fields
  unit?: string;
  unitOptions?: string[]; // For fields with multiple unit options
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    customRule?: string;
  };
  calculation?: {
    formula: string; // e.g., "tcf * value"
    dependsOn: string[]; // field IDs this calculation depends on
  };
}

// ============================================================================
// Column Configuration (for tables)
// ============================================================================

export interface ColumnConfig {
  id: string;
  label: string;
  field: FieldConfig;
  width?: string; // CSS width (e.g., "20%", "100px")
}

// ============================================================================
// Section/Component Configuration
// ============================================================================

export interface SectionConfig {
  id: string;
  componentType: ComponentType;
  title: string;
  order: number;
  showInPrint: boolean;
  
  // For table-based components
  columns?: ColumnConfig[];
  rows?: number; // Default number of rows
  allowAddRows?: boolean;
  allowRemoveRows?: boolean;
  minRows?: number;
  maxRows?: number;
  
  // For single-field components (comments, etc.)
  field?: FieldConfig;
  
  // For grouped fields (nameplate data, test equipment)
  fields?: FieldConfig[];
  layout?: 'single-column' | 'two-column' | 'three-column' | 'grid';
  
  // For visual inspection checklists
  checklistItems?: {
    id: string;
    netaSection?: string;
    description: string;
    resultOptions: string[];
  }[];
  
  // Custom styling
  styles?: {
    backgroundColor?: string;
    borderColor?: string;
    headerColor?: string;
  };
}

// ============================================================================
// Form Template Structure
// ============================================================================

export interface CustomFormTemplate {
  id?: string;
  name: string;
  description?: string;
  netaSection?: string; // e.g., "ATS 7.3.3", "MTS 4.2"
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
  
  // The actual form structure
  structure: {
    sections: SectionConfig[];
    settings: {
      includePassFail: boolean;
      includeJobInfo: boolean;
      includePrintHeader: boolean;
      pageBreakAfterSection?: boolean;
    };
  };
}

// ============================================================================
// Form Instance (filled-out form)
// ============================================================================

export interface CustomFormInstance {
  id?: string;
  templateId?: string;
  templateName: string;
  netaSection?: string;
  jobId: string;
  userId?: string;
  status: 'PASS' | 'FAIL';
  createdAt?: string;
  updatedAt?: string;
  
  // The actual form data
  data: {
    // Job information
    jobInfo?: {
      customer?: string;
      siteAddress?: string;
      jobNumber?: string;
      date?: string;
      technicians?: string;
      identifier?: string;
      user?: string;
      substation?: string;
      eqptLocation?: string;
      temperature?: {
        fahrenheit?: number;
        celsius?: number;
        tcf?: number;
        humidity?: number;
      };
    };
    
    // Section data (keyed by section ID)
    sections: {
      [sectionId: string]: {
        // For table components
        rows?: Array<{
          [columnId: string]: any;
        }>;
        
        // For single-field components
        value?: any;
        
        // For grouped fields
        fields?: {
          [fieldId: string]: any;
        };
      };
    };
  };
}

// ============================================================================
// Component Library Definition
// ============================================================================

export interface ComponentDefinition {
  id: ComponentType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'info' | 'testing' | 'inspection' | 'equipment' | 'other';
  defaultConfig: Partial<SectionConfig>;
  preview?: string; // Optional preview image/description
}

// ============================================================================
// Form Builder State
// ============================================================================

export interface FormBuilderState {
  template: CustomFormTemplate;
  selectedSectionId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  sectionId?: string;
  fieldId?: string;
  message: string;
}

// ============================================================================
// Common Unit Options (reused across components)
// ============================================================================

export const UNIT_OPTIONS = {
  continuity: [
    { label: 'Ohms', symbol: 'Ω' },
    { label: 'Milliohms', symbol: 'mΩ' },
    { label: 'Microohms', symbol: 'μΩ' }
  ],
  insulation: [
    { label: 'Gigaohms', symbol: 'GΩ' },
    { label: 'Megaohms', symbol: 'MΩ' },
    { label: 'Kiloohms', symbol: 'kΩ' }
  ],
  current: [
    { label: 'Amps', symbol: 'A' },
    { label: 'Milliamps', symbol: 'mA' },
    { label: 'Microamps', symbol: 'µA' }
  ],
  voltage: [
    { label: 'Kilovolts', symbol: 'kV' },
    { label: 'Volts', symbol: 'V' },
    { label: 'Millivolts', symbol: 'mV' }
  ],
  temperature: [
    { label: 'Fahrenheit', symbol: '°F' },
    { label: 'Celsius', symbol: '°C' }
  ],
  capacitance: [
    { label: 'Farads', symbol: 'F' },
    { label: 'Microfarads', symbol: 'µF' },
    { label: 'Nanofarads', symbol: 'nF' },
    { label: 'Picofarads', symbol: 'pF' }
  ]
};

export const INSPECTION_RESULTS = [
  { label: 'Select one', value: 'select one' },
  { label: 'Satisfactory', value: 'satisfactory' },
  { label: 'Unsatisfactory', value: 'unsatisfactory' },
  { label: 'Cleaned', value: 'cleaned' },
  { label: 'See Comments', value: 'see comments' },
  { label: 'Not Applicable', value: 'Not Applicable' }
];


