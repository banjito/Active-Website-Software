/**
 * Custom Form Builder Type Definitions
 * 
 * These types define the structure for custom form templates and instances.
 * Forms are composed of reusable components that can be customized and arranged.
 */

// ============================================================================
// Component Types - Building blocks for forms
// ============================================================================

/**
 * Component types, written as an erasable const object rather than a TS enum
 * so the custom-forms library runs under plain Node type stripping, which the
 * regression harness relies on. Usage is unchanged: ComponentType.JOB_INFO as
 * a value, ComponentType as a type.
 */
export const ComponentType = {
  JOB_INFO: 'job-info',
  NAMEPLATE_DATA: 'nameplate-data',
  INSULATION_TEST: 'insulation-test',
  TEMPERATURE_CORRECTION: 'temperature-correction',
  VISUAL_INSPECTION: 'visual-inspection',
  TEST_EQUIPMENT: 'test-equipment',
  SHIELD_CONTINUITY: 'shield-continuity',
  WITHSTAND_TEST: 'withstand-test',
  COMMENTS: 'comments',
  CUSTOM_TABLE: 'custom-table',
  /** Table whose rows are shown/hidden based on dropdown "settings" (e.g. Primary=4 rows, Secondary=2) */
  CONDITIONAL_TABLE: 'conditional-table',
  CUSTOM_TEXT: 'custom-text',
  FUSE_DATA: 'fuse-data',
  VOLTAGE_READINGS: 'voltage-readings',
  CURRENT_READINGS: 'current-readings',
  RESISTANCE_READINGS: 'resistance-readings',
  // Report-derived components
  CONTACT_RESISTANCE: 'contact-resistance',
  TURNS_RATIO: 'turns-ratio',
  DIELECTRIC_ABSORPTION: 'dielectric-absorption',
  POLARIZATION_INDEX: 'polarization-index',
  WINDING_RESISTANCE: 'winding-resistance',
  RATIO_POLARITY_CT_PT: 'ratio-polarity-ct-pt',
  SECONDARY_INJECTION: 'secondary-injection',
  OIL_TEST: 'oil-test',
  POWER_FACTOR: 'power-factor',
  CAPACITANCE_TEST: 'capacitance-test',
  CONTACT_TIMING: 'contact-timing',
  EXTENDED_NAMEPLATE: 'extended-nameplate',
  TRIP_UNIT_SETTINGS: 'trip-unit-settings',
  APPLIED_VOLTAGE: 'applied-voltage',
  INSULATION_BY_WINDING: 'insulation-by-winding',
  // LV Circuit Breaker (from LowVoltageCircuitBreaker reports)
  LV_BREAKER_NAMEPLATE: 'lv-breaker-nameplate',
  DEVICE_SETTINGS_AS_FOUND_AS_LEFT: 'device-settings-as-found-as-left',
  PRIMARY_INJECTION_LV: 'primary-injection-lv',
  SECONDARY_INJECTION_LV: 'secondary-injection-lv',
} as const;

export type ComponentType =
  (typeof ComponentType)[keyof typeof ComponentType];

export const FieldType = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  TEXTAREA: 'textarea',
  CHECKBOX: 'checkbox',
  /** Exclusive choice shown as radio buttons rather than a dropdown. */
  RADIO: 'radio',
  CALCULATED: 'calculated',
  /** Single cell: Temp °F input, °C/TCF read-only, Humidity input */
  TEMPERATURE_HUMIDITY: 'temperature-humidity',
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

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
  /** For grouped-field grid layout: how many grid columns this field spans (default 1).
   *  Lets the builder widen a field instead of relying on equal auto-sizing. */
  colSpan?: number;
  /** For grouped-field grid layout: how many grid rows this field spans (default 1). */
  rowSpan?: number;
  /** For table cells: a fixed value defined in the builder, shown read-only in the filler/print.
   *  Used when cellBehavior is 'static'. */
  staticValue?: string;
  /** For table cells: user entry, copy from another field, calculate from formula, or a fixed static value */
  cellBehavior?: 'user' | 'populate' | 'calculate' | 'static';
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

/**
 * The V2 parts of a table a V1 section can carry. Every field is optional: an
 * absent one keeps whatever the V1 adapter generated.
 */
export interface SectionTableOverlay {
  /** Header rows, in order. Cells may span columns and rows. */
  header?: import('@/lib/customForms/v2/schema').HeaderRowV2[];
  /** Replaces the generated body. Mixes repeated records with literal rows. */
  body?: import('@/lib/customForms/v2/schema').BodyRowV2[];
  footer?: import('@/lib/customForms/v2/schema').FooterRowV2[];
  /** Table-level unit selector. */
  units?: import('@/lib/customForms/v2/schema').UnitSpecV2;
  /** Per-column unit selectors, keyed by column id. */
  columnUnits?: Record<string, import('@/lib/customForms/v2/schema').UnitSpecV2>;
  print?: import('@/lib/customForms/v2/schema').TablePrintV2;
}

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
  /** Persisted definition IDs for fixed rows in an explicitly upgraded typed template. */
  calculationRowIds?: string[];
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

  /** Per-cell static text for columns whose cellBehavior is 'static'. Key = "row{N}_{colId}".
   *  Rendered read-only in the filler/print (e.g. NETA section numbers, fixed descriptions). */
  staticCells?: Record<string, string>;

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

  /**
   * V2 table structure this section declares, for the shapes V1 cannot express:
   * multi-row headers with merged cells, heterogeneous body rows, footers and
   * unit selectors.
   *
   * Stored as an overlay rather than replacing `columns` and `rows`, so every
   * existing reader (the expression engine, the row mutations, the instance
   * adapter) keeps working unchanged and a section can be converted back by
   * deleting this one key. The adapter merges it over the generated table.
   */
  v2?: SectionTableOverlay;

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
  
  // The actual form structure. On a template this is the editable DRAFT.
  structure: CustomFormStructure;

  /** Published version this template's draft was last released as. */
  activeVersionId?: string | null;
  latestVersion?: number;
  archivedAt?: string | null;
}

export interface CustomFormSettings {
  includePassFail: boolean;
  includeJobInfo: boolean;
  includePrintHeader: boolean;
  pageBreakAfterSection?: boolean;
}

export interface LookupTableDefinition {
  id: string;
  keyType: 'string' | 'number';
  valueType: 'string' | 'number' | 'boolean';
  entries: { key: string | number; value: string | number | boolean }[];
  fallback?: string | number | boolean | null;
}

export interface InterpolationCurveDefinition {
  id: string;
  points: { x: number; y: number }[];
  /** `null` refuses to extrapolate past the declared range; it is the default. */
  outOfRange?: 'clamp' | 'null';
}

export interface CustomFormStructure {
  sections: SectionConfig[];
  settings: CustomFormSettings;
  /** Absent means legacy evaluation. This payload is frozen and checksummed with the version. */
  expressions?: {
    engineVersion: 'typed-1';
    /** Stable field/cell target ID to source. Never keyed by a display label or row index. */
    formulas: Record<string, string>;
    /** Lookup tables the formulas may name. Resolved by id at compile time. */
    lookups?: LookupTableDefinition[];
    /** Interpolation curves the formulas may name. */
    curves?: InterpolationCurveDefinition[];
    /** Rule pack ids applied to this template, with the version they were built against. */
    rulePacks?: { id: string; version: string }[];
  };
}

// ============================================================================
// Status: result, workflow and publication are three different things
// ============================================================================

/** What the equipment did. Never overload this with review state. */
export type CustomFormResult = 'PASS' | 'FAIL' | 'LIMITED SERVICE' | 'N/A';

export const CUSTOM_FORM_RESULTS: CustomFormResult[] = [
  'PASS',
  'FAIL',
  'LIMITED SERVICE',
  'N/A',
];

/** Where the filled-in form sits in review. */
export type CustomFormWorkflowStatus =
  | 'draft'
  | 'ready_for_review'
  | 'in_review'
  | 'changes_requested'
  | 'approved';

/** Whether a template has a published version behind it. */
export type TemplatePublicationStatus =
  | 'unpublished'
  | 'published'
  | 'draft_ahead_of_published';

// ============================================================================
// Immutable template versions
// ============================================================================

/**
 * A published snapshot. Instances render from one of these, never from the
 * mutable draft, so editing a template cannot change a report signed last year.
 */
export interface CustomFormTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  /** 1 = flat V1 structure. 2 = the document schema arriving in phase 2. */
  schemaVersion: number;
  name: string;
  description?: string;
  netaSection?: string;
  structure: CustomFormStructure;
  /** sha256 over canonical JSON. Absent on versions imported by the backfill. */
  checksum?: string | null;
  releaseNotes?: string | null;
  origin: 'published' | 'imported';
  createdBy?: string | null;
  publishedBy?: string | null;
  publishedAt: string;
  createdAt: string;
}

// ============================================================================
// Form Instance (filled-out form)
// ============================================================================

export interface CustomFormInstance {
  id?: string;
  templateId?: string;
  /** Required for anything created after the versioning migration. */
  templateVersionId?: string;
  templateVersion?: number;
  templateName: string;
  netaSection?: string;
  jobId: string;
  userId?: string;
  /** Result status. See CustomFormResult; this is not review state. */
  status: CustomFormResult;
  workflowStatus?: CustomFormWorkflowStatus;
  /** 1 = flat sections map, 2 = durable state with stable row instance ids. */
  schemaVersion?: number;
  /** Bumped on every save; a stale value means someone else saved first. */
  revision?: number;
  templateChecksum?: string | null;
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


