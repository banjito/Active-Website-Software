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
  /** Table whose rows are shown/hidden based on dropdown "settings" (e.g. Primary=4 rows, Secondary=2) */
  CONDITIONAL_TABLE = 'conditional-table',
  CUSTOM_TEXT = 'custom-text',
  FUSE_DATA = 'fuse-data',
  VOLTAGE_READINGS = 'voltage-readings',
  CURRENT_READINGS = 'current-readings',
  RESISTANCE_READINGS = 'resistance-readings',
  // Report-derived components
  CONTACT_RESISTANCE = 'contact-resistance',
  TURNS_RATIO = 'turns-ratio',
  DIELECTRIC_ABSORPTION = 'dielectric-absorption',
  POLARIZATION_INDEX = 'polarization-index',
  WINDING_RESISTANCE = 'winding-resistance',
  RATIO_POLARITY_CT_PT = 'ratio-polarity-ct-pt',
  SECONDARY_INJECTION = 'secondary-injection',
  OIL_TEST = 'oil-test',
  POWER_FACTOR = 'power-factor',
  CAPACITANCE_TEST = 'capacitance-test',
  CONTACT_TIMING = 'contact-timing',
  EXTENDED_NAMEPLATE = 'extended-nameplate',
  TRIP_UNIT_SETTINGS = 'trip-unit-settings',
  APPLIED_VOLTAGE = 'applied-voltage',
  INSULATION_BY_WINDING = 'insulation-by-winding',
  // LV Circuit Breaker (from LowVoltageCircuitBreaker reports)
  LV_BREAKER_NAMEPLATE = 'lv-breaker-nameplate',
  DEVICE_SETTINGS_AS_FOUND_AS_LEFT = 'device-settings-as-found-as-left',
  PRIMARY_INJECTION_LV = 'primary-injection-lv',
  SECONDARY_INJECTION_LV = 'secondary-injection-lv',
}

export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  TEXTAREA = 'textarea',
  CHECKBOX = 'checkbox',
  CALCULATED = 'calculated',
  /** Single cell: Temp °F input, °C/TCF read-only, Humidity input */
  TEMPERATURE_HUMIDITY = 'temperature-humidity',
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
    formula: string; // e.g., "tcf * value" or "{sectionId.fieldId} * 1.5"
    dependsOn: string[]; // field IDs this calculation depends on
  };
  /** For TEMPERATURE_HUMIDITY: default °F and % (e.g. 68, 50) */
  defaultTemperature?: number;
  defaultHumidity?: number;
  /** For table cells: user entry, copy from another field, or calculate from formula */
  cellBehavior?: 'user' | 'populate' | 'calculate';
  /** When cellBehavior is 'populate', copy value from this field */
  populateFrom?: {
    sectionId: string;
    fieldId: string;
    /** For table sources: 'same' = same row index, 'first' = row 0 */
    rowMode?: 'same' | 'first';
    /** For table sources: specific 0-based row index (e.g. 2 = row 3). Used when picking a column+row. */
    rowIndex?: number;
  };
}

// ============================================================================
// Conditional / Dynamic Table (settings dropdowns → which rows show)
// ============================================================================

/** A dropdown or setting that controls which rows are visible in a conditional table */
export interface SettingFieldConfig {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}

/** One row in a conditional table; visible when current setting values match visibleWhen */
export interface ConditionalRowConfig {
  id: string;
  label: string;
  /** When set, row is visible only when each setting id's current value is in the given value(s) */
  visibleWhen?: Record<string, string | string[]>;
}

// ============================================================================
// Column Configuration (for tables)
// ============================================================================

export interface ColumnConfig {
  id: string;
  label: string;
  field: FieldConfig;
  width?: string; // CSS width (e.g., "20%", "100px")
  /** For conditional tables: show this column only when these setting values match */
  visibleWhen?: Record<string, string | string[]>;
}

// ============================================================================
// Table print layout (margins, row height) – applied in preview and print/PDF
// ============================================================================

export interface TablePrintLayout {
  /** Table wrapper margin (CSS values, e.g. "0", "4px", "0.25in") */
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  /** Row height for table body rows (e.g. "24px", "1.5rem", "auto") */
  rowHeight?: string;
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
  /** Short code for formulas, e.g. IR (Insulation Resistance), Job (Job Details). Shown as {IR.C1.R2}. */
  referenceCode?: string;

  // For table-based components
  columns?: ColumnConfig[];
  rows?: number; // Default number of rows
  allowAddRows?: boolean;
  allowRemoveRows?: boolean;
  minRows?: number;
  maxRows?: number;

  // For conditional-table: dropdowns that control which rows are visible
  settingFields?: SettingFieldConfig[];
  /** Row definitions; each row is shown when visibleWhen matches current setting values */
  conditionalRows?: ConditionalRowConfig[];
  
  // For single-field components (comments, etc.)
  field?: FieldConfig;
  
  // For grouped fields (nameplate data, test equipment)
  fields?: FieldConfig[];
  layout?: 'single-column' | 'two-column' | 'three-column' | 'four-column' | 'five-column' | 'grid';
  
  // For visual inspection checklists
  checklistItems?: {
    id: string;
    netaSection?: string;
    description: string;
    resultOptions: string[];
  }[];
  
  /** Per-cell formula overrides. Key = "row{N}_{colId}", value = formula string or reference.
   *  e.g. { "row0_col-voltage": "{ND.ratedVoltage}", "row2_col-power": "{ND.ratedCurrent}*{ND.ratedVoltage}" }
   */
  cellFormulas?: Record<string, string>;

  /** Per-table print layout: margins and row height. Applied in preview and print/PDF. */
  printLayout?: TablePrintLayout;

  /** For contact-resistance: show Value Deviation (Phase + Neutral/Ground) block. Toggle in edit. */
  showDeviation?: boolean;
  /** For contact-resistance: default labels for first column (e.g. Section 1, Section 2, ...). */
  defaultRowLabels?: string[];

  /** When set, add/remove rows on this section also updates all sections with the same id (linked tables). */
  rowCountLinkGroupId?: string;

  /** Optional fields shown above the table (e.g. Test Voltage, Test Duration). Each has configurable input type (text, number, date, dropdown). */
  aboveTableFields?: FieldConfig[];

  /** If this section was added from a saved component, its DB id. Used so "Save as new default" can also update that saved component. */
  savedComponentId?: string;

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
  isPublished?: boolean; // Only published templates appear in job custom forms dropdown
  
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


