/**
 * Component Library
 * 
 * Defines all available components that can be used in custom forms.
 * Each component has a default configuration that can be customized.
 */

import {
  ComponentDefinition,
  ComponentType,
  FieldType,
  UNIT_OPTIONS,
  INSPECTION_RESULTS,
} from '@/lib/types/customForms';

export const COMPONENT_LIBRARY: ComponentDefinition[] = [
  // ============================================================================
  // INFO COMPONENTS
  // ============================================================================
  {
    id: ComponentType.JOB_INFO,
    name: 'Job Information',
    description: 'Standard job details including customer, address, date, technicians, temperature & humidity',
    icon: 'FileText',
    category: 'info',
    defaultConfig: {
      componentType: ComponentType.JOB_INFO,
      title: 'Job Details',
      order: 0,
      showInPrint: true,
      layout: 'two-column',
      fields: [
        {
          id: 'customer',
          label: 'Customer',
          type: FieldType.TEXT,
          required: true
        },
        {
          id: 'siteAddress',
          label: 'Site Address',
          type: FieldType.TEXT,
          required: true
        },
        {
          id: 'jobNumber',
          label: 'Job #',
          type: FieldType.TEXT,
          required: true
        },
        {
          id: 'user',
          label: 'User',
          type: FieldType.TEXT
        },
        {
          id: 'date',
          label: 'Date',
          type: FieldType.DATE,
          required: true
        },
        {
          id: 'technicians',
          label: 'Technicians',
          type: FieldType.TEXT,
          required: true
        },
        {
          id: 'identifier',
          label: 'Identifier',
          type: FieldType.TEXT
        },
        {
          id: 'substation',
          label: 'Substation',
          type: FieldType.TEXT
        },
        {
          id: 'eqptLocation',
          label: 'Eqpt. Location',
          type: FieldType.TEXT
        },
        {
          id: 'temperature',
          label: 'Temperature',
          type: FieldType.NUMBER,
          unit: '°F',
          defaultValue: 68
        },
        {
          id: 'temperatureCelsius',
          label: 'Temperature (°C)',
          type: FieldType.NUMBER,
          readOnly: true,
          calculation: {
            formula: '(temperature - 32) * 5 / 9',
            dependsOn: ['temperature']
          }
        },
        {
          id: 'tcf',
          label: 'TCF',
          type: FieldType.NUMBER,
          readOnly: true,
          calculation: {
            formula: 'getTCF(temperatureCelsius)',
            dependsOn: ['temperatureCelsius']
          }
        },
        {
          id: 'humidity',
          label: 'Humidity',
          type: FieldType.NUMBER,
          unit: '%',
          defaultValue: 50
        }
      ]
    }
  },

  // ============================================================================
  // TEMPERATURE CORRECTION COMPONENT
  // ============================================================================
  {
    id: ComponentType.TEMPERATURE_CORRECTION,
    name: 'Temperature Correction',
    description: 'Temperature, humidity, and TCF calculation',
    icon: 'Thermometer',
    category: 'info',
    defaultConfig: {
      componentType: ComponentType.TEMPERATURE_CORRECTION,
      title: 'Temperature & Humidity',
      order: 1,
      showInPrint: true,
      layout: 'two-column',
      fields: [
        {
          id: 'fahrenheit',
          label: 'Temperature (°F)',
          type: FieldType.NUMBER,
          defaultValue: 68
        },
        {
          id: 'celsius',
          label: 'Temperature (°C)',
          type: FieldType.NUMBER,
          readOnly: true,
          calculation: {
            formula: '(fahrenheit - 32) * 5 / 9',
            dependsOn: ['fahrenheit']
          }
        },
        {
          id: 'tcf',
          label: 'TCF',
          type: FieldType.NUMBER,
          readOnly: true,
          calculation: {
            formula: 'getTCF(celsius)',
            dependsOn: ['celsius']
          }
        },
        {
          id: 'humidity',
          label: 'Humidity (%)',
          type: FieldType.NUMBER
        }
      ]
    }
  },

  // ============================================================================
  // NAMEPLATE DATA COMPONENT
  // ============================================================================
  {
    id: ComponentType.NAMEPLATE_DATA,
    name: 'Nameplate Data',
    description: 'Equipment nameplate information',
    icon: 'Tag',
    category: 'info',
    defaultConfig: {
      componentType: ComponentType.NAMEPLATE_DATA,
      title: 'Nameplate Data',
      order: 2,
      showInPrint: true,
      layout: 'two-column',
      fields: [
        {
          id: 'manufacturer',
          label: 'Manufacturer',
          type: FieldType.TEXT
        },
        {
          id: 'model',
          label: 'Model',
          type: FieldType.TEXT
        },
        {
          id: 'serialNumber',
          label: 'Serial Number',
          type: FieldType.TEXT
        },
        {
          id: 'ratedVoltage',
          label: 'Rated Voltage',
          type: FieldType.TEXT,
          unit: 'kV'
        },
        {
          id: 'ratedCurrent',
          label: 'Rated Current',
          type: FieldType.TEXT,
          unit: 'A'
        },
        {
          id: 'yearManufactured',
          label: 'Year Manufactured',
          type: FieldType.NUMBER
        }
      ]
    }
  },

  // ============================================================================
  // TESTING COMPONENTS
  // ============================================================================
  {
    id: ComponentType.INSULATION_TEST,
    name: 'Insulation Resistance Test',
    description: 'Insulation resistance readings with temperature correction',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.INSULATION_TEST,
      title: 'Electrical Tests - Insulation Resistance Values',
      order: 3,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 2,
      columns: [
        {
          id: 'testType',
          label: 'Test Type',
          width: '15%',
          field: {
            id: 'testType',
            label: 'Test Type',
            type: FieldType.SELECT,
            options: [
              { label: 'Pre-Test', value: 'pre-test' },
              { label: 'Post-Test', value: 'post-test' }
            ]
          }
        },
        {
          id: 'ag',
          label: 'A-G',
          width: '15%',
          field: {
            id: 'ag',
            label: 'A-G',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'bg',
          label: 'B-G',
          width: '15%',
          field: {
            id: 'bg',
            label: 'B-G',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'cg',
          label: 'C-G',
          width: '15%',
          field: {
            id: 'cg',
            label: 'C-G',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'agCorrected',
          label: 'A-G (Corrected)',
          width: '15%',
          field: {
            id: 'agCorrected',
            label: 'A-G (Corrected)',
            type: FieldType.CALCULATED,
            readOnly: true,
            calculation: {
              formula: 'ag * tcf',
              dependsOn: ['ag', 'tcf']
            }
          }
        },
        {
          id: 'bgCorrected',
          label: 'B-G (Corrected)',
          width: '15%',
          field: {
            id: 'bgCorrected',
            label: 'B-G (Corrected)',
            type: FieldType.CALCULATED,
            readOnly: true,
            calculation: {
              formula: 'bg * tcf',
              dependsOn: ['bg', 'tcf']
            }
          }
        },
        {
          id: 'cgCorrected',
          label: 'C-G (Corrected)',
          width: '15%',
          field: {
            id: 'cgCorrected',
            label: 'C-G (Corrected)',
            type: FieldType.CALCULATED,
            readOnly: true,
            calculation: {
              formula: 'cg * tcf',
              dependsOn: ['cg', 'tcf']
            }
          }
        }
      ]
    }
  },

  {
    id: ComponentType.SHIELD_CONTINUITY,
    name: 'Shield Continuity Test',
    description: 'Cable shield continuity measurements',
    icon: 'Activity',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.SHIELD_CONTINUITY,
      title: 'Electrical Tests - Shield Continuity',
      order: 4,
      showInPrint: true,
      columns: [
        {
          id: 'phaseA',
          label: 'A Phase',
          width: '25%',
          field: {
            id: 'phaseA',
            label: 'A Phase',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'phaseB',
          label: 'B Phase',
          width: '25%',
          field: {
            id: 'phaseB',
            label: 'B Phase',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'phaseC',
          label: 'C Phase',
          width: '25%',
          field: {
            id: 'phaseC',
            label: 'C Phase',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'unit',
          label: 'Units',
          width: '25%',
          field: {
            id: 'unit',
            label: 'Units',
            type: FieldType.SELECT,
            unitOptions: UNIT_OPTIONS.continuity.map(u => u.symbol),
            defaultValue: 'Ω'
          }
        }
      ],
      rows: 1,
      allowAddRows: false,
      allowRemoveRows: false
    }
  },

  {
    id: ComponentType.WITHSTAND_TEST,
    name: 'Withstand Test',
    description: 'VLF withstand test readings over time',
    icon: 'TrendingUp',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.WITHSTAND_TEST,
      title: 'Electrical Tests Withstand Test',
      order: 5,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 6,
      columns: [
        {
          id: 'timeMinutes',
          label: 'Time (min)',
          width: '10%',
          field: {
            id: 'timeMinutes',
            label: 'Time',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'kVAC',
          label: 'kVAC',
          width: '10%',
          field: {
            id: 'kVAC',
            label: 'kVAC',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'phaseA_mA',
          label: 'A Phase (mA)',
          width: '13%',
          field: {
            id: 'phaseA_mA',
            label: 'A Phase',
            type: FieldType.NUMBER,
            unit: 'mA'
          }
        },
        {
          id: 'phaseA_nF',
          label: 'A Phase (nF)',
          width: '13%',
          field: {
            id: 'phaseA_nF',
            label: 'A Phase',
            type: FieldType.NUMBER,
            unit: 'nF'
          }
        },
        {
          id: 'phaseB_mA',
          label: 'B Phase (mA)',
          width: '13%',
          field: {
            id: 'phaseB_mA',
            label: 'B Phase',
            type: FieldType.NUMBER,
            unit: 'mA'
          }
        },
        {
          id: 'phaseB_nF',
          label: 'B Phase (nF)',
          width: '13%',
          field: {
            id: 'phaseB_nF',
            label: 'B Phase',
            type: FieldType.NUMBER,
            unit: 'nF'
          }
        },
        {
          id: 'phaseC_mA',
          label: 'C Phase (mA)',
          width: '13%',
          field: {
            id: 'phaseC_mA',
            label: 'C Phase',
            type: FieldType.NUMBER,
            unit: 'mA'
          }
        },
        {
          id: 'phaseC_nF',
          label: 'C Phase (nF)',
          width: '13%',
          field: {
            id: 'phaseC_nF',
            label: 'C Phase',
            type: FieldType.NUMBER,
            unit: 'nF'
          }
        }
      ]
    }
  },

  {
    id: ComponentType.VOLTAGE_READINGS,
    name: 'Voltage Readings',
    description: 'Generic voltage measurement table',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.VOLTAGE_READINGS,
      title: 'Voltage Readings',
      order: 6,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 50,
      rows: 3,
      columns: [
        {
          id: 'description',
          label: 'Description',
          width: '40%',
          field: {
            id: 'description',
            label: 'Description',
            type: FieldType.TEXT
          }
        },
        {
          id: 'reading',
          label: 'Reading',
          width: '30%',
          field: {
            id: 'reading',
            label: 'Reading',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'unit',
          label: 'Unit',
          width: '15%',
          field: {
            id: 'unit',
            label: 'Unit',
            type: FieldType.SELECT,
            unitOptions: UNIT_OPTIONS.voltage.map(u => u.symbol),
            defaultValue: 'V'
          }
        },
        {
          id: 'result',
          label: 'Result',
          width: '15%',
          field: {
            id: 'result',
            label: 'Result',
            type: FieldType.SELECT,
            options: [
              { label: 'Pass', value: 'pass' },
              { label: 'Fail', value: 'fail' }
            ]
          }
        }
      ]
    }
  },

  {
    id: ComponentType.CURRENT_READINGS,
    name: 'Current Readings',
    description: 'Generic current measurement table',
    icon: 'Activity',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.CURRENT_READINGS,
      title: 'Current Readings',
      order: 7,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 50,
      rows: 3,
      columns: [
        {
          id: 'description',
          label: 'Description',
          width: '40%',
          field: {
            id: 'description',
            label: 'Description',
            type: FieldType.TEXT
          }
        },
        {
          id: 'reading',
          label: 'Reading',
          width: '30%',
          field: {
            id: 'reading',
            label: 'Reading',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'unit',
          label: 'Unit',
          width: '15%',
          field: {
            id: 'unit',
            label: 'Unit',
            type: FieldType.SELECT,
            unitOptions: UNIT_OPTIONS.current.map(u => u.symbol),
            defaultValue: 'A'
          }
        },
        {
          id: 'result',
          label: 'Result',
          width: '15%',
          field: {
            id: 'result',
            label: 'Result',
            type: FieldType.SELECT,
            options: [
              { label: 'Pass', value: 'pass' },
              { label: 'Fail', value: 'fail' }
            ]
          }
        }
      ]
    }
  },

  {
    id: ComponentType.RESISTANCE_READINGS,
    name: 'Resistance Readings',
    description: 'Generic resistance measurement table',
    icon: 'CircleDot',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.RESISTANCE_READINGS,
      title: 'Resistance Readings',
      order: 8,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 50,
      rows: 3,
      columns: [
        {
          id: 'description',
          label: 'Description',
          width: '40%',
          field: {
            id: 'description',
            label: 'Description',
            type: FieldType.TEXT
          }
        },
        {
          id: 'reading',
          label: 'Reading',
          width: '30%',
          field: {
            id: 'reading',
            label: 'Reading',
            type: FieldType.NUMBER
          }
        },
        {
          id: 'unit',
          label: 'Unit',
          width: '15%',
          field: {
            id: 'unit',
            label: 'Unit',
            type: FieldType.SELECT,
            unitOptions: UNIT_OPTIONS.continuity.map(u => u.symbol),
            defaultValue: 'Ω'
          }
        },
        {
          id: 'result',
          label: 'Result',
          width: '15%',
          field: {
            id: 'result',
            label: 'Result',
            type: FieldType.SELECT,
            options: [
              { label: 'Pass', value: 'pass' },
              { label: 'Fail', value: 'fail' }
            ]
          }
        }
      ]
    }
  },

  // ============================================================================
  // INSPECTION COMPONENTS
  // ============================================================================
  {
    id: ComponentType.VISUAL_INSPECTION,
    name: 'Visual & Mechanical Inspection',
    description: 'NETA-style visual inspection checklist',
    icon: 'Eye',
    category: 'inspection',
    defaultConfig: {
      componentType: ComponentType.VISUAL_INSPECTION,
      title: '7.3.3.A Visual and Mechanical Inspection',
      order: 9,
      showInPrint: true,
      checklistItems: [
        {
          id: 'item1',
          netaSection: '7.3.3.A.1',
          description: 'Compare cable data with drawings and specifications.',
          resultOptions: INSPECTION_RESULTS.map(r => r.value)
        },
        {
          id: 'item2',
          netaSection: '7.3.3.A.2',
          description: 'Inspect exposed sections of cables for physical damage.',
          resultOptions: INSPECTION_RESULTS.map(r => r.value)
        }
      ]
    }
  },

  // ============================================================================
  // EQUIPMENT COMPONENTS
  // ============================================================================
  {
    id: ComponentType.TEST_EQUIPMENT,
    name: 'Test Equipment Used',
    description: 'Test equipment details with serial numbers and AMP IDs',
    icon: 'Wrench',
    category: 'equipment',
    defaultConfig: {
      componentType: ComponentType.TEST_EQUIPMENT,
      title: 'Test Equipment Used',
      order: 10,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 3,
      columns: [
        {
          id: 'equipment',
          label: 'Equipment',
          width: '25%',
          field: {
            id: 'equipment',
            label: 'Equipment',
            type: FieldType.TEXT
          }
        },
        {
          id: 'makeModel',
          label: 'Make/Model',
          width: '25%',
          field: {
            id: 'makeModel',
            label: 'Make/Model',
            type: FieldType.TEXT
          }
        },
        {
          id: 'serialNumber',
          label: 'Serial Number',
          width: '25%',
          field: {
            id: 'serialNumber',
            label: 'Serial Number',
            type: FieldType.TEXT
          }
        },
        {
          id: 'ampId',
          label: 'AMP ID',
          width: '25%',
          field: {
            id: 'ampId',
            label: 'AMP ID',
            type: FieldType.TEXT
          }
        }
      ]
    }
  },

  {
    id: ComponentType.FUSE_DATA,
    name: 'Fuse Data',
    description: 'Fuse rating and information table',
    icon: 'Zap',
    category: 'equipment',
    defaultConfig: {
      componentType: ComponentType.FUSE_DATA,
      title: 'Fuse Data',
      order: 11,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 50,
      rows: 3,
      columns: [
        {
          id: 'location',
          label: 'Location',
          width: '20%',
          field: {
            id: 'location',
            label: 'Location',
            type: FieldType.TEXT
          }
        },
        {
          id: 'rating',
          label: 'Rating',
          width: '15%',
          field: {
            id: 'rating',
            label: 'Rating',
            type: FieldType.TEXT
          }
        },
        {
          id: 'type',
          label: 'Type',
          width: '20%',
          field: {
            id: 'type',
            label: 'Type',
            type: FieldType.TEXT
          }
        },
        {
          id: 'manufacturer',
          label: 'Manufacturer',
          width: '20%',
          field: {
            id: 'manufacturer',
            label: 'Manufacturer',
            type: FieldType.TEXT
          }
        },
        {
          id: 'condition',
          label: 'Condition',
          width: '25%',
          field: {
            id: 'condition',
            label: 'Condition',
            type: FieldType.SELECT,
            options: INSPECTION_RESULTS
          }
        }
      ]
    }
  },

  // ============================================================================
  // OTHER COMPONENTS
  // ============================================================================
  {
    id: ComponentType.COMMENTS,
    name: 'Comments',
    description: 'Free-text comments section',
    icon: 'MessageSquare',
    category: 'other',
    defaultConfig: {
      componentType: ComponentType.COMMENTS,
      title: 'Comments',
      order: 99,
      showInPrint: true,
      field: {
        id: 'comments',
        label: 'Comments',
        type: FieldType.TEXTAREA,
        placeholder: 'Enter any additional comments or notes here...'
      }
    }
  },

  {
    id: ComponentType.CUSTOM_TABLE,
    name: 'Custom Table',
    description: 'Build your own custom table with any columns',
    icon: 'Table',
    category: 'other',
    defaultConfig: {
      componentType: ComponentType.CUSTOM_TABLE,
      title: 'Custom Table',
      order: 50,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 100,
      rows: 5,
      columns: [
        {
          id: 'col1',
          label: 'Column 1',
          width: '33%',
          field: {
            id: 'col1',
            label: 'Column 1',
            type: FieldType.TEXT
          }
        },
        {
          id: 'col2',
          label: 'Column 2',
          width: '33%',
          field: {
            id: 'col2',
            label: 'Column 2',
            type: FieldType.TEXT
          }
        },
        {
          id: 'col3',
          label: 'Column 3',
          width: '34%',
          field: {
            id: 'col3',
            label: 'Column 3',
            type: FieldType.TEXT
          }
        }
      ]
    }
  },

  {
    id: ComponentType.CUSTOM_TEXT,
    name: 'Custom Text Field',
    description: 'Single custom text field for any purpose',
    icon: 'Type',
    category: 'other',
    defaultConfig: {
      componentType: ComponentType.CUSTOM_TEXT,
      title: 'Custom Field',
      order: 51,
      showInPrint: true,
      field: {
        id: 'customField',
        label: 'Custom Field',
        type: FieldType.TEXT
      }
    }
  }
];

/**
 * Get component definition by ID
 */
export function getComponentDefinition(id: ComponentType): ComponentDefinition | undefined {
  return COMPONENT_LIBRARY.find(comp => comp.id === id);
}

/**
 * Get components by category
 */
export function getComponentsByCategory(category: string): ComponentDefinition[] {
  return COMPONENT_LIBRARY.filter(comp => comp.category === category);
}

/**
 * Get all categories
 */
export function getAllCategories(): string[] {
  return Array.from(new Set(COMPONENT_LIBRARY.map(comp => comp.category)));
}


