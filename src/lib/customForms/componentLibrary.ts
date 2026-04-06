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
  type SettingFieldConfig,
  type ConditionalRowConfig,
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
      referenceCode: 'JD',
      layout: 'five-column',
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
          id: 'temperatureHumidity',
          label: 'Temp °F / °C, Humidity',
          type: FieldType.TEMPERATURE_HUMIDITY,
          defaultTemperature: 68,
          defaultHumidity: 50
        },
        {
          id: 'tcf',
          label: 'TCF',
          type: FieldType.NUMBER,
          readOnly: true
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
      referenceCode: 'ETI',
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
            type: FieldType.NUMBER,
            readOnly: true,
            cellBehavior: 'calculate',
            calculation: {
              formula: '{ETI.C2}*{JD.tcf}',
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
            type: FieldType.NUMBER,
            readOnly: true,
            cellBehavior: 'calculate',
            calculation: {
              formula: '{ETI.C3}*{JD.tcf}',
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
            type: FieldType.NUMBER,
            readOnly: true,
            cellBehavior: 'calculate',
            calculation: {
              formula: '{ETI.C4}*{JD.tcf}',
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
  // REPORT-DERIVED TESTING COMPONENTS
  // ============================================================================
  {
    id: ComponentType.CONTACT_RESISTANCE,
    name: 'Contact / Pole Resistance',
    description: 'Contact resistance by bus section (A/B/C-Phase, Neutral, Ground) with optional value deviation',
    icon: 'CircleDot',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.CONTACT_RESISTANCE,
      title: 'Electrical - Contact Resistance Tests',
      order: 12,
      showInPrint: true,
      showDeviation: true,
      rows: 5,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      defaultRowLabels: ['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Section 5'],
      columns: [
        { id: 'busSection', label: 'BUS SECTION', width: '12%', field: { id: 'busSection', label: 'Bus Section', type: FieldType.TEXT } },
        { id: 'aPhase', label: 'A-PHASE', width: '17%', field: { id: 'aPhase', label: 'A-Phase', type: FieldType.NUMBER } },
        { id: 'bPhase', label: 'B-PHASE', width: '17%', field: { id: 'bPhase', label: 'B-Phase', type: FieldType.NUMBER } },
        { id: 'cPhase', label: 'C-PHASE', width: '17%', field: { id: 'cPhase', label: 'C-Phase', type: FieldType.NUMBER } },
        { id: 'neutral', label: 'NEUTRAL', width: '17%', field: { id: 'neutral', label: 'Neutral', type: FieldType.NUMBER } },
        { id: 'ground', label: 'GROUND', width: '17%', field: { id: 'ground', label: 'Ground', type: FieldType.NUMBER } },
        { id: 'unit', label: 'UNITS', width: '8%', field: { id: 'unit', label: 'Units', type: FieldType.SELECT, options: UNIT_OPTIONS.continuity.map(u => ({ label: u.symbol, value: u.symbol })), defaultValue: 'μΩ' } },
      ],
    },
  },
  {
    id: ComponentType.TURNS_RATIO,
    name: 'Turns Ratio (TTR)',
    description: 'Turns ratio test table – tap, nameplate V, measured ratio, deviation, polarity',
    icon: 'TrendingUp',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.TURNS_RATIO,
      title: 'Turns Ratio Tests (TTR)',
      order: 13,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 4,
      columns: [
        { id: 'identifier', label: 'Identifier', width: '12%', field: { id: 'identifier', label: 'Identifier', type: FieldType.TEXT } },
        { id: 'tap', label: 'Tap', width: '8%', field: { id: 'tap', label: 'Tap', type: FieldType.TEXT } },
        { id: 'nameplateVoltage', label: 'Nameplate V', width: '12%', field: { id: 'nameplateVoltage', label: 'Nameplate V', type: FieldType.NUMBER } },
        { id: 'testValue', label: 'Test Value', width: '10%', field: { id: 'testValue', label: 'Test Value', type: FieldType.NUMBER } },
        { id: 'pri', label: 'Pri', width: '10%', field: { id: 'pri', label: 'Pri', type: FieldType.NUMBER } },
        { id: 'sec', label: 'Sec', width: '10%', field: { id: 'sec', label: 'Sec', type: FieldType.NUMBER } },
        { id: 'measuredRatio', label: 'Measured Ratio', width: '12%', field: { id: 'measuredRatio', label: 'Measured Ratio', type: FieldType.NUMBER } },
        { id: 'ratioDev', label: 'Ratio Dev %', width: '10%', field: { id: 'ratioDev', label: 'Ratio Dev %', type: FieldType.NUMBER } },
        { id: 'polarity', label: 'Polarity', width: '16%', field: { id: 'polarity', label: 'Polarity', type: FieldType.SELECT, options: [{ label: 'Select One', value: 'select one' }, { label: 'Add', value: 'Add' }, { label: 'Subtract', value: 'Subtract' }] } },
      ],
    },
  },
  {
    id: ComponentType.DIELECTRIC_ABSORPTION,
    name: 'Dielectric Absorption',
    description: 'Dielectric absorption (DAR) – A/B/C phase and phases-to, result',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.DIELECTRIC_ABSORPTION,
      title: 'Dielectric Absorption',
      order: 14,
      showInPrint: true,
      rows: 1,
      columns: [
        { id: 'aPhase', label: 'A Phase', width: '18%', field: { id: 'aPhase', label: 'A Phase', type: FieldType.NUMBER } },
        { id: 'bPhase', label: 'B Phase', width: '18%', field: { id: 'bPhase', label: 'B Phase', type: FieldType.NUMBER } },
        { id: 'cPhase', label: 'C Phase', width: '18%', field: { id: 'cPhase', label: 'C Phase', type: FieldType.NUMBER } },
        { id: 'phasesTo', label: 'Phases To', width: '18%', field: { id: 'phasesTo', label: 'Phases To', type: FieldType.TEXT } },
        { id: 'result', label: 'Result', width: '28%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.POLARIZATION_INDEX,
    name: 'Polarization Index',
    description: 'Polarization index (PI) – A/B/C phase and phases-to, result',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.POLARIZATION_INDEX,
      title: 'Polarization Index',
      order: 15,
      showInPrint: true,
      rows: 1,
      columns: [
        { id: 'aPhase', label: 'A Phase', width: '18%', field: { id: 'aPhase', label: 'A Phase', type: FieldType.NUMBER } },
        { id: 'bPhase', label: 'B Phase', width: '18%', field: { id: 'bPhase', label: 'B Phase', type: FieldType.NUMBER } },
        { id: 'cPhase', label: 'C Phase', width: '18%', field: { id: 'cPhase', label: 'C Phase', type: FieldType.NUMBER } },
        { id: 'phasesTo', label: 'Phases To', width: '18%', field: { id: 'phasesTo', label: 'Phases To', type: FieldType.TEXT } },
        { id: 'result', label: 'Result', width: '28%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.WINDING_RESISTANCE,
    name: 'Winding Resistance',
    description: 'Winding resistance measurements – multiple windings/phases',
    icon: 'Activity',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.WINDING_RESISTANCE,
      title: 'Winding Resistance',
      order: 16,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 4,
      columns: [
        { id: 'winding', label: 'Winding', width: '25%', field: { id: 'winding', label: 'Winding', type: FieldType.TEXT } },
        { id: 'reading', label: 'Reading', width: '25%', field: { id: 'reading', label: 'Reading', type: FieldType.NUMBER } },
        { id: 'unit', label: 'Unit', width: '25%', field: { id: 'unit', label: 'Unit', type: FieldType.SELECT, options: UNIT_OPTIONS.continuity.map(u => ({ label: u.symbol, value: u.symbol })), defaultValue: 'Ω' } },
        { id: 'result', label: 'Result', width: '25%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.RATIO_POLARITY_CT_PT,
    name: 'Ratio & Polarity (CT/PT)',
    description: 'CT or PT ratio and polarity test rows',
    icon: 'ArrowLeftRight',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.RATIO_POLARITY_CT_PT,
      title: 'Ratio and Polarity Test',
      order: 17,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 4,
      columns: [
        { id: 'identifier', label: 'Identifier', width: '12%', field: { id: 'identifier', label: 'Identifier', type: FieldType.TEXT } },
        { id: 'ratio', label: 'Ratio', width: '10%', field: { id: 'ratio', label: 'Ratio', type: FieldType.TEXT } },
        { id: 'testType', label: 'Test Type', width: '12%', field: { id: 'testType', label: 'Test Type', type: FieldType.SELECT, options: [{ label: 'Voltage', value: 'voltage' }, { label: 'Current', value: 'current' }] } },
        { id: 'testValue', label: 'Test Value', width: '10%', field: { id: 'testValue', label: 'Test Value', type: FieldType.NUMBER } },
        { id: 'pri', label: 'Pri', width: '10%', field: { id: 'pri', label: 'Pri', type: FieldType.NUMBER } },
        { id: 'sec', label: 'Sec', width: '10%', field: { id: 'sec', label: 'Sec', type: FieldType.NUMBER } },
        { id: 'measuredRatio', label: 'Measured Ratio', width: '12%', field: { id: 'measuredRatio', label: 'Measured Ratio', type: FieldType.NUMBER } },
        { id: 'ratioDev', label: 'Ratio Dev %', width: '10%', field: { id: 'ratioDev', label: 'Ratio Dev %', type: FieldType.NUMBER } },
        { id: 'polarity', label: 'Polarity', width: '14%', field: { id: 'polarity', label: 'Polarity', type: FieldType.SELECT, options: [{ label: 'Select One', value: 'select one' }, { label: 'Correct', value: 'Correct' }, { label: 'Incorrect', value: 'Incorrect' }] } },
      ],
    },
  },
  {
    id: ComponentType.SECONDARY_INJECTION,
    name: 'Secondary Injection / Trip Test',
    description: 'Trip unit secondary injection test – pickup, timing, result',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.SECONDARY_INJECTION,
      title: 'Secondary Injection Test',
      order: 18,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 3,
      columns: [
        { id: 'description', label: 'Description', width: '30%', field: { id: 'description', label: 'Description', type: FieldType.TEXT } },
        { id: 'pickup', label: 'Pickup', width: '15%', field: { id: 'pickup', label: 'Pickup', type: FieldType.NUMBER } },
        { id: 'time', label: 'Time (ms)', width: '15%', field: { id: 'time', label: 'Time (ms)', type: FieldType.NUMBER } },
        { id: 'trip', label: 'Trip', width: '15%', field: { id: 'trip', label: 'Trip', type: FieldType.TEXT } },
        { id: 'result', label: 'Result', width: '25%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.OIL_TEST,
    name: 'Oil Test / DGA',
    description: 'Oil test results – moisture, dielectric, color, etc.',
    icon: 'FlaskConical',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.OIL_TEST,
      title: 'Oil Test Results',
      order: 19,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 30,
      rows: 5,
      columns: [
        { id: 'test', label: 'Test', width: '30%', field: { id: 'test', label: 'Test', type: FieldType.TEXT } },
        { id: 'result', label: 'Result', width: '25%', field: { id: 'result', label: 'Result', type: FieldType.NUMBER } },
        { id: 'unit', label: 'Unit', width: '20%', field: { id: 'unit', label: 'Unit', type: FieldType.TEXT } },
        { id: 'limit', label: 'Limit', width: '25%', field: { id: 'limit', label: 'Limit', type: FieldType.TEXT } },
      ],
    },
  },
  {
    id: ComponentType.POWER_FACTOR,
    name: 'Power Factor / Dissipation Factor',
    description: 'Power factor or dissipation factor test table',
    icon: 'TrendingUp',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.POWER_FACTOR,
      title: 'Power Factor / Dissipation Factor',
      order: 20,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 4,
      columns: [
        { id: 'description', label: 'Description', width: '35%', field: { id: 'description', label: 'Description', type: FieldType.TEXT } },
        { id: 'kV', label: 'kV', width: '15%', field: { id: 'kV', label: 'kV', type: FieldType.NUMBER } },
        { id: 'powerFactor', label: 'PF %', width: '15%', field: { id: 'powerFactor', label: 'PF %', type: FieldType.NUMBER } },
        { id: 'capacitance', label: 'Cap (pF)', width: '15%', field: { id: 'capacitance', label: 'Cap (pF)', type: FieldType.NUMBER } },
        { id: 'result', label: 'Result', width: '20%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.CAPACITANCE_TEST,
    name: 'Capacitance Test',
    description: 'Capacitance readings by phase (nF/pF)',
    icon: 'CircleDot',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.CAPACITANCE_TEST,
      title: 'Capacitance Test',
      order: 21,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 3,
      columns: [
        { id: 'description', label: 'Description', width: '40%', field: { id: 'description', label: 'Description', type: FieldType.TEXT } },
        { id: 'reading', label: 'Reading', width: '30%', field: { id: 'reading', label: 'Reading', type: FieldType.NUMBER } },
        { id: 'unit', label: 'Unit', width: '15%', field: { id: 'unit', label: 'Unit', type: FieldType.SELECT, options: UNIT_OPTIONS.capacitance.map(u => ({ label: u.symbol, value: u.symbol })), defaultValue: 'nF' } },
        { id: 'result', label: 'Result', width: '15%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.CONTACT_TIMING,
    name: 'Contact Timing',
    description: 'Open/close contact timing (ms)',
    icon: 'Clock',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.CONTACT_TIMING,
      title: 'Contact Timing',
      order: 22,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 20,
      rows: 4,
      columns: [
        { id: 'pole', label: 'Pole', width: '25%', field: { id: 'pole', label: 'Pole', type: FieldType.TEXT } },
        { id: 'openTime', label: 'Open (ms)', width: '25%', field: { id: 'openTime', label: 'Open (ms)', type: FieldType.NUMBER } },
        { id: 'closeTime', label: 'Close (ms)', width: '25%', field: { id: 'closeTime', label: 'Close (ms)', type: FieldType.NUMBER } },
        { id: 'result', label: 'Result', width: '25%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.APPLIED_VOLTAGE,
    name: 'Applied Voltage Test',
    description: 'Applied voltage / hi-pot test – voltage, duration, leakage, result',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.APPLIED_VOLTAGE,
      title: 'Applied Voltage Test',
      order: 23,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 15,
      rows: 3,
      columns: [
        { id: 'description', label: 'Description', width: '30%', field: { id: 'description', label: 'Description', type: FieldType.TEXT } },
        { id: 'voltage', label: 'Voltage (kV)', width: '20%', field: { id: 'voltage', label: 'Voltage (kV)', type: FieldType.NUMBER } },
        { id: 'duration', label: 'Duration', width: '20%', field: { id: 'duration', label: 'Duration', type: FieldType.TEXT } },
        { id: 'leakage', label: 'Leakage (mA)', width: '15%', field: { id: 'leakage', label: 'Leakage (mA)', type: FieldType.NUMBER } },
        { id: 'result', label: 'Result', width: '15%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.INSULATION_BY_WINDING,
    name: 'Insulation by Winding',
    description: 'Insulation resistance by winding (e.g. A-G, B-G, C-G, windings)',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.INSULATION_BY_WINDING,
      title: 'Insulation Resistance by Winding',
      order: 24,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 25,
      rows: 6,
      columns: [
        { id: 'winding', label: 'Winding', width: '25%', field: { id: 'winding', label: 'Winding', type: FieldType.TEXT } },
        { id: 'reading', label: 'Reading', width: '25%', field: { id: 'reading', label: 'Reading', type: FieldType.NUMBER } },
        { id: 'corrected', label: 'Corrected', width: '25%', field: { id: 'corrected', label: 'Corrected', type: FieldType.NUMBER } },
        { id: 'unit', label: 'Unit', width: '25%', field: { id: 'unit', label: 'Unit', type: FieldType.SELECT, options: UNIT_OPTIONS.insulation.map(u => ({ label: u.symbol, value: u.symbol })), defaultValue: 'MΩ' } },
      ],
    },
  },
  {
    id: ComponentType.TRIP_UNIT_SETTINGS,
    name: 'Trip Unit Settings',
    description: 'Trip unit or relay settings – function, pickup, delay, etc.',
    icon: 'Settings',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.TRIP_UNIT_SETTINGS,
      title: 'Trip Unit Settings',
      order: 25,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      minRows: 1,
      maxRows: 30,
      rows: 5,
      columns: [
        { id: 'function', label: 'Function', width: '25%', field: { id: 'function', label: 'Function', type: FieldType.TEXT } },
        { id: 'pickup', label: 'Pickup', width: '20%', field: { id: 'pickup', label: 'Pickup', type: FieldType.NUMBER } },
        { id: 'delay', label: 'Delay', width: '20%', field: { id: 'delay', label: 'Delay', type: FieldType.TEXT } },
        { id: 'setting', label: 'Setting', width: '20%', field: { id: 'setting', label: 'Setting', type: FieldType.TEXT } },
        { id: 'result', label: 'Result', width: '15%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },

  // ============================================================================
  // LV CIRCUIT BREAKER COMPONENTS (from LowVoltageCircuitBreaker reports)
  // ============================================================================
  {
    id: ComponentType.LV_BREAKER_NAMEPLATE,
    name: 'LV Breaker Nameplate',
    description: 'Nameplate for LV circuit breakers – type, frame, I_C, trip unit type, rating plug, curve, etc.',
    icon: 'Tag',
    category: 'info',
    defaultConfig: {
      componentType: ComponentType.LV_BREAKER_NAMEPLATE,
      title: 'Nameplate Data',
      order: 27,
      showInPrint: true,
      layout: 'two-column',
      fields: [
        { id: 'manufacturer', label: 'Manufacturer', type: FieldType.TEXT },
        { id: 'catalogNumber', label: 'Catalog Number', type: FieldType.TEXT },
        { id: 'serialNumber', label: 'Serial Number', type: FieldType.TEXT },
        { id: 'type', label: 'Type', type: FieldType.TEXT },
        { id: 'frameSize', label: 'Frame Size (A)', type: FieldType.TEXT },
        { id: 'icRating', label: 'I_C Rating (kA)', type: FieldType.TEXT },
        { id: 'tripUnitType', label: 'Trip Unit Type', type: FieldType.SELECT, options: [{ label: 'On', value: 'On' }, { label: 'Off', value: 'Off' }, { label: 'In', value: 'In' }, { label: 'Out', value: 'Out' }, { label: 'N/A', value: 'N/A' }] },
        { id: 'ratingPlug', label: 'Rating Plug (A)', type: FieldType.TEXT },
        { id: 'curveNo', label: 'Curve No.', type: FieldType.TEXT },
        { id: 'chargeMotorVoltage', label: 'Charge Motor Voltage', type: FieldType.TEXT },
        { id: 'operation', label: 'Operation', type: FieldType.TEXT },
        { id: 'mounting', label: 'Mounting', type: FieldType.TEXT },
        { id: 'zoneInterlock', label: 'Zone Interlock', type: FieldType.TEXT },
        { id: 'thermalMemory', label: 'Thermal Memory', type: FieldType.TEXT },
      ],
    },
  },
  {
    id: ComponentType.DEVICE_SETTINGS_AS_FOUND_AS_LEFT,
    name: 'Device Settings (As Found / As Left)',
    description: 'Trip unit settings as found and as left – Long Time, Short Time, Instantaneous, Ground Fault',
    icon: 'Settings',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.DEVICE_SETTINGS_AS_FOUND_AS_LEFT,
      title: 'Device Settings',
      order: 28,
      showInPrint: true,
      rows: 8,
      allowAddRows: false,
      allowRemoveRows: false,
      columns: [
        { id: 'block', label: 'Block', width: '15%', field: { id: 'block', label: 'Block', type: FieldType.SELECT, options: [{ label: 'As Found', value: 'As Found' }, { label: 'As Left', value: 'As Left' }] } },
        { id: 'function', label: 'Function', width: '20%', field: { id: 'function', label: 'Function', type: FieldType.SELECT, options: [{ label: 'Long Time', value: 'Long Time' }, { label: 'Short Time', value: 'Short Time' }, { label: 'Instantaneous', value: 'Instantaneous' }, { label: 'Ground Fault', value: 'Ground Fault' }] } },
        { id: 'setting', label: 'Setting', width: '25%', field: { id: 'setting', label: 'Setting', type: FieldType.TEXT } },
        { id: 'delay', label: 'Delay', width: '20%', field: { id: 'delay', label: 'Delay', type: FieldType.TEXT } },
        { id: 'i2t', label: 'I²t', width: '20%', field: { id: 'i2t', label: 'I²t', type: FieldType.SELECT, options: [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }, { label: 'N/A', value: 'N/A' }] } },
      ],
    },
  },
  {
    id: ComponentType.PRIMARY_INJECTION_LV,
    name: 'Primary Injection (LV Breaker)',
    description: 'Primary injection test – Long Time, Short Time, Instantaneous, Ground Fault with rated/test amperes and pole results',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.PRIMARY_INJECTION_LV,
      title: 'Electrical Tests - Primary Injection',
      order: 29,
      showInPrint: true,
      rows: 4,
      allowAddRows: false,
      allowRemoveRows: false,
      columns: [
        { id: 'function', label: 'Function', width: '12%', field: { id: 'function', label: 'Function', type: FieldType.SELECT, options: [{ label: 'Long Time', value: 'Long Time' }, { label: 'Short Time', value: 'Short Time' }, { label: 'Instantaneous', value: 'Instantaneous' }, { label: 'Ground Fault', value: 'Ground Fault' }] } },
        { id: 'setting', label: 'Setting', width: '10%', field: { id: 'setting', label: 'Setting', type: FieldType.TEXT } },
        { id: 'delay', label: 'Delay', width: '8%', field: { id: 'delay', label: 'Delay', type: FieldType.TEXT } },
        { id: 'i2t', label: 'I²t', width: '6%', field: { id: 'i2t', label: 'I²t', type: FieldType.TEXT } },
        { id: 'ratedAmps', label: 'Rated Amps', width: '10%', field: { id: 'ratedAmps', label: 'Rated Amps', type: FieldType.NUMBER } },
        { id: 'testAmps', label: 'Test Amps', width: '10%', field: { id: 'testAmps', label: 'Test Amps', type: FieldType.NUMBER } },
        { id: 'pole1', label: 'Pole 1 (s / A)', width: '12%', field: { id: 'pole1', label: 'Pole 1', type: FieldType.TEXT } },
        { id: 'pole2', label: 'Pole 2 (s / A)', width: '12%', field: { id: 'pole2', label: 'Pole 2', type: FieldType.TEXT } },
        { id: 'pole3', label: 'Pole 3 (s / A)', width: '12%', field: { id: 'pole3', label: 'Pole 3', type: FieldType.TEXT } },
        { id: 'result', label: 'Result', width: '10%', field: { id: 'result', label: 'Result', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }] } },
      ],
    },
  },
  {
    id: ComponentType.SECONDARY_INJECTION_LV,
    name: 'Secondary Injection (LV Breaker)',
    description: 'Secondary injection / trip test – Long Time, Short Time, Instantaneous, Ground Fault with amperes and tolerances',
    icon: 'Zap',
    category: 'testing',
    defaultConfig: {
      componentType: ComponentType.SECONDARY_INJECTION_LV,
      title: 'Electrical Tests - Secondary Injection',
      order: 30,
      showInPrint: true,
      rows: 4,
      allowAddRows: false,
      allowRemoveRows: false,
      columns: [
        { id: 'function', label: 'Function', width: '14%', field: { id: 'function', label: 'Function', type: FieldType.SELECT, options: [{ label: 'Long Time', value: 'Long Time' }, { label: 'Short Time', value: 'Short Time' }, { label: 'Instantaneous', value: 'Instantaneous' }, { label: 'Ground Fault', value: 'Ground Fault' }] } },
        { id: 'amperes1', label: 'Amperes 1', width: '10%', field: { id: 'amperes1', label: 'Amperes 1', type: FieldType.NUMBER } },
        { id: 'amperes2', label: 'Amperes 2', width: '10%', field: { id: 'amperes2', label: 'Amperes 2', type: FieldType.NUMBER } },
        { id: 'toleranceMin', label: 'Tol Min', width: '10%', field: { id: 'toleranceMin', label: 'Tol Min', type: FieldType.TEXT } },
        { id: 'toleranceMax', label: 'Tol Max', width: '10%', field: { id: 'toleranceMax', label: 'Tol Max', type: FieldType.TEXT } },
        { id: 'pole1', label: 'Pole 1', width: '12%', field: { id: 'pole1', label: 'Pole 1', type: FieldType.TEXT } },
        { id: 'pole2', label: 'Pole 2', width: '12%', field: { id: 'pole2', label: 'Pole 2', type: FieldType.TEXT } },
        { id: 'pole3', label: 'Pole 3', width: '12%', field: { id: 'pole3', label: 'Pole 3', type: FieldType.TEXT } },
        { id: 'unit', label: 'Unit', width: '10%', field: { id: 'unit', label: 'Unit', type: FieldType.SELECT, options: [{ label: 'sec.', value: 'sec.' }, { label: 'cycles', value: 'cycles' }, { label: 'ms', value: 'ms' }], defaultValue: 'sec.' } },
        { id: 'passFail', label: 'Pass/Fail', width: '10%', field: { id: 'passFail', label: 'Pass/Fail', type: FieldType.SELECT, options: [{ label: 'Pass', value: 'Pass' }, { label: 'Fail', value: 'Fail' }] } },
      ],
    },
  },

  // ============================================================================
  // EXTENDED INFO COMPONENTS (from reports)
  // ============================================================================
  {
    id: ComponentType.EXTENDED_NAMEPLATE,
    name: 'Extended Nameplate',
    description: 'Full nameplate – kVA, PF, kW, HP, voltages, current, frequency, connections',
    icon: 'Tag',
    category: 'info',
    defaultConfig: {
      componentType: ComponentType.EXTENDED_NAMEPLATE,
      title: 'Nameplate Data (Extended)',
      order: 26,
      showInPrint: true,
      layout: 'two-column',
      fields: [
        { id: 'manufacturer', label: 'Manufacturer', type: FieldType.TEXT },
        { id: 'catalogModelNo', label: 'Catalog/Model No.', type: FieldType.TEXT },
        { id: 'serialNumber', label: 'Serial Number', type: FieldType.TEXT },
        { id: 'yearMfd', label: 'Year Mfd', type: FieldType.TEXT },
        { id: 'ratedKva', label: 'Rated kVA', type: FieldType.TEXT },
        { id: 'powerFactor', label: 'Power Factor', type: FieldType.TEXT },
        { id: 'ratedKw', label: 'Rated kW', type: FieldType.TEXT },
        { id: 'hp', label: 'HP', type: FieldType.TEXT },
        { id: 'voltages1', label: 'Voltages 1', type: FieldType.TEXT },
        { id: 'voltages2', label: 'Voltages 2', type: FieldType.TEXT },
        { id: 'currentRating', label: 'Current Rating (A)', type: FieldType.TEXT },
        { id: 'frequency', label: 'Frequency (Hz)', type: FieldType.TEXT },
        { id: 'connections', label: 'Connections', type: FieldType.TEXT },
      ],
    },
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
    description: 'Test equipment with lookup from field equipment table (Equipment, Serial, AMP ID, Cal Date)',
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
        },
        {
          id: 'calibrationDate',
          label: 'Calibration Date',
          width: '25%',
          field: {
            id: 'calibrationDate',
            label: 'Calibration Date',
            type: FieldType.DATE
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
    id: ComponentType.CONDITIONAL_TABLE,
    name: 'Conditional Table',
    description: 'Table that shows different rows and columns based on dropdown settings (e.g. Primary = 4 rows, 3 cols; Secondary = 2 rows, different cols)',
    icon: 'Table2',
    category: 'other',
    defaultConfig: {
      componentType: ComponentType.CONDITIONAL_TABLE,
      title: 'Settings Table',
      order: 51,
      showInPrint: true,
      allowAddRows: true,
      allowRemoveRows: true,
      settingFields: [
        {
          id: 'mode',
          label: 'Mode',
          options: [
            { value: 'Primary', label: 'Primary' },
            { value: 'Secondary', label: 'Secondary' }
          ],
          defaultValue: 'Primary'
        }
      ] as SettingFieldConfig[],
      conditionalRows: [
        { id: 'row0', label: 'Row 1', visibleWhen: { mode: 'Primary' } },
        { id: 'row1', label: 'Row 2', visibleWhen: { mode: 'Primary' } },
        { id: 'row2', label: 'Row 3', visibleWhen: { mode: 'Primary' } },
        { id: 'row3', label: 'Row 4', visibleWhen: { mode: 'Primary' } },
        { id: 'row4', label: 'Row A', visibleWhen: { mode: 'Secondary' } },
        { id: 'row5', label: 'Row B', visibleWhen: { mode: 'Secondary' } }
      ] as ConditionalRowConfig[],
      columns: [
        {
          id: 'label',
          label: 'Label',
          width: '25%',
          field: {
            id: 'label',
            label: 'Label',
            type: FieldType.TEXT
          }
        },
        {
          id: 'value',
          label: 'Value',
          width: '25%',
          field: {
            id: 'value',
            label: 'Value',
            type: FieldType.TEXT
          },
          visibleWhen: { mode: 'Primary' }
        },
        {
          id: 'notes',
          label: 'Notes',
          width: '25%',
          field: {
            id: 'notes',
            label: 'Notes',
            type: FieldType.TEXT
          },
          visibleWhen: { mode: 'Primary' }
        },
        {
          id: 'settingAmperes',
          label: 'Setting Amperes',
          width: '25%',
          field: {
            id: 'settingAmperes',
            label: 'Setting Amperes',
            type: FieldType.TEXT
          },
          visibleWhen: { mode: 'Secondary' }
        },
        {
          id: 'testAmperes',
          label: 'Test Amperes',
          width: '25%',
          field: {
            id: 'testAmperes',
            label: 'Test Amperes',
            type: FieldType.TEXT
          },
          visibleWhen: { mode: 'Secondary' }
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


