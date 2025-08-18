import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LargeDryTypeTransformerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'large_dry_type_transformer_mts_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_info', 'visual_inspection', 'insulation_resistance', 'turns_ratio', 'test_equipment', 'comments'];

  canImport(data: ReportData): boolean {
    console.log(`LargeDryTypeTransformer MTS Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('largedrytype') &&
           data.reportType?.toLowerCase().includes('mts');
    console.log(`LargeDryTypeTransformer MTS Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    console.log('🔄 Starting data preparation for LargeDryTypeTransformerMTSReport');
    
    // Initialize the data structure to match the component's FormData interface exactly
    const reportInfo: any = {};
    const visualInspection: any = {};
    const insulationResistance: any = {};
    const turnsRatio: any = {
      secondaryWindingVoltage: '',
      taps: []
    };
    const testEquipment: any = {
      megohmmeter: { name: '', serialNumber: '', ampId: '' }
    };
    let comments = '';

    // Process sections first (this is the primary data source)
    if (data.sections && data.sections.length > 0) {
      console.log('📋 Processing sections data...');
      
      data.sections.forEach(section => {
        console.log(`📁 Processing section: ${section.title}`);
        
        if (section.title.toLowerCase().includes('job information')) {
          section.fields.forEach(field => {
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('customer')) reportInfo.customer = field.value;
            else if (fieldName.includes('address')) reportInfo.address = field.value;
            else if (fieldName.includes('user')) reportInfo.userName = field.value;
            else if (fieldName.includes('date')) reportInfo.date = field.value;
            else if (fieldName.includes('job') && fieldName.includes('#')) reportInfo.jobNumber = field.value;
            else if (fieldName.includes('technicians')) reportInfo.technicians = field.value;
            else if (fieldName.includes('substation')) reportInfo.substation = field.value;
            else if (fieldName.includes('eqpt') && fieldName.includes('location')) reportInfo.eqptLocation = field.value;
            else if (fieldName.includes('identifier')) reportInfo.identifier = field.value;
            else if (fieldName.includes('temp') && fieldName.includes('°f')) {
              const tempF = parseFloat(field.value) || 0;
              reportInfo.temperature = {
                ambient: tempF,
                fahrenheit: tempF,
                celsius: Math.round((tempF - 32) * 5/9),
                correctionFactor: 1.0
              };
            }
          });
        } else if (section.title.toLowerCase().includes('nameplate data')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value) {
              const nameplate = field.value;
              reportInfo.nameplateData = {
                manufacturer: nameplate.manufacturer || '',
                catalogNumber: nameplate.catalogNumber || '',
                serialNumber: nameplate.serialNumber || '',
                kva: nameplate.kva || '',
                tempRise: nameplate.tempRise || '',
                impedance: nameplate.impedance || '',
                primary: {
                  volts: nameplate.primary?.volts || '',
                  voltsSecondary: nameplate.primary?.voltsSecondary || '',
                  connection: nameplate.primary?.connection || '',
                  material: nameplate.primary?.material || ''
                },
                secondary: {
                  volts: nameplate.secondary?.volts || '',
                  voltsSecondary: nameplate.secondary?.voltsSecondary || '',
                  connection: nameplate.secondary?.connection || '',
                  material: nameplate.secondary?.material || ''
                },
                tapConfiguration: {
                  positions: nameplate.tapVoltages?.map((_: any, index: number) => index + 1) || [],
                  voltages: nameplate.tapVoltages || [],
                  currentPosition: parseInt(nameplate.tapPositionCurrent) || 1,
                  currentPositionSecondary: nameplate.tapPositionSecondary || '',
                  tapVoltsSpecific: nameplate.tapSpecificVolts || '',
                  tapPercentSpecific: nameplate.tapSpecificPercent || ''
                }
              };
            }
          });
        } else if (section.title.toLowerCase().includes('visual') && section.title.toLowerCase().includes('mechanical')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value && field.value.rows) {
              field.value.rows.forEach((row: any) => {
                if (row.id && row.description) {
                  visualInspection[row.id] = row.result || '';
                }
              });
            }
          });
        } else if (section.title.toLowerCase().includes('insulation') && section.title.toLowerCase().includes('resistance')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value) {
              const irData = field.value;
              insulationResistance.temperature = reportInfo.temperature?.fahrenheit?.toString() || '';
              insulationResistance.primaryToGround = {
                testVoltage: irData.primaryToGround?.testVoltage || '',
                unit: irData.primaryToGround?.unit || '',
                readings: {
                  halfMinute: irData.primaryToGround?.r05 || '',
                  oneMinute: irData.primaryToGround?.r1 || '',
                  tenMinute: irData.primaryToGround?.r10 || ''
                },
                corrected: {
                  halfMinute: irData.primaryToGround?.r05 || '',
                  oneMinute: irData.primaryToGround?.r1 || '',
                  tenMinute: irData.primaryToGround?.r10 || ''
                },
                dielectricAbsorption: '',
                polarizationIndex: ''
              };
              insulationResistance.secondaryToGround = {
                testVoltage: irData.secondaryToGround?.testVoltage || '',
                unit: irData.secondaryToGround?.unit || '',
                readings: {
                  halfMinute: '',
                  oneMinute: '',
                  tenMinute: ''
                },
                corrected: {
                  halfMinute: '',
                  oneMinute: '',
                  tenMinute: ''
                },
                dielectricAbsorption: '',
                polarizationIndex: ''
              };
              insulationResistance.primaryToSecondary = {
                testVoltage: irData.primaryToSecondary?.testVoltage || '',
                unit: irData.primaryToSecondary?.unit || '',
                readings: {
                  halfMinute: '',
                  oneMinute: '',
                  tenMinute: ''
                },
                corrected: {
                  halfMinute: '',
                  oneMinute: '',
                  tenMinute: ''
                },
                dielectricAbsorption: '',
                polarizationIndex: ''
              };
              insulationResistance.dielectricAbsorptionAcceptable = '';
              insulationResistance.polarizationIndexAcceptable = '';
            }
          });
        } else if (section.title.toLowerCase().includes('turns') && section.title.toLowerCase().includes('ratio')) {
          section.fields.forEach(field => {
            if (field.label.toLowerCase().includes('secondary') && field.label.toLowerCase().includes('winding') && field.label.toLowerCase().includes('voltage')) {
              turnsRatio.secondaryWindingVoltage = field.value;
            } else if (field.type === 'table' && field.value && field.value.rows) {
              turnsRatio.taps = field.value.rows.map((row: any) => ({
                tap: row.tap || '',
                nameplateVoltage: row.nameplateVoltage || '',
                calculatedRatio: row.calculatedRatio || '',
                phaseA_TTR: row.phaseA_TTR || '',
                phaseA_Dev: row.phaseA_Dev || '',
                phaseB_TTR: row.phaseB_TTR || '',
                phaseB_Dev: row.phaseB_Dev || '',
                phaseC_TTR: row.phaseC_TTR || '',
                phaseC_Dev: row.phaseC_Dev || '',
                assessment: row.assessment || ''
              }));
            }
          });
        } else if (section.title.toLowerCase().includes('test equipment')) {
          section.fields.forEach(field => {
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('megohmmeter') && !fieldName.includes('serial') && !fieldName.includes('ampid')) {
              testEquipment.megohmmeter.name = field.value;
            } else if (fieldName.includes('serial') && fieldName.includes('number')) {
              testEquipment.megohmmeter.serialNumber = field.value;
            } else if (fieldName.includes('amp') && fieldName.includes('id')) {
              testEquipment.megohmmeter.ampId = field.value;
            }
          });
        } else if (section.title.toLowerCase().includes('comments')) {
          section.fields.forEach(field => {
            comments = field.value;
          });
        }
      });
    }

    // Also check if turns ratio data exists in data.fields.turnsRatio (fallback)
    if (data.data && data.data.fields && data.data.fields.turnsRatio && data.data.fields.turnsRatio.rows) {
      console.log('📊 Found turns ratio data in data.fields.turnsRatio.rows:', data.data.fields.turnsRatio.rows);
      turnsRatio.taps = data.data.fields.turnsRatio.rows.map((row: any) => ({
        tap: row.tap || '',
        nameplateVoltage: row.nameplateVoltage || '',
        calculatedRatio: row.calculatedRatio || '',
        phaseA_TTR: row.phaseA_TTR || '',
        phaseA_Dev: row.phaseA_Dev || '',
        phaseB_TTR: row.phaseB_TTR || '',
        phaseB_Dev: row.phaseB_Dev || '',
        phaseC_TTR: row.phaseC_TTR || '',
        phaseC_Dev: row.phaseC_Dev || '',
        assessment: row.assessment || ''
      }));
    }

    // Also check for secondary winding voltage in data.fields (fallback)
    if (data.data && data.data.fields && data.data.fields.secondaryVoltageTap) {
      turnsRatio.secondaryWindingVoltage = data.data.fields.secondaryVoltageTap;
    }

    // Ensure turnsRatio.taps is always an array
    if (!turnsRatio.taps || !Array.isArray(turnsRatio.taps)) {
      turnsRatio.taps = [];
    }

    console.log('✅ Final processed report data:', {
      reportInfo,
      visualInspection,
      insulationResistance,
      turnsRatio,
      testEquipment,
      comments
    });

    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      report_info: reportInfo,
      visual_inspection: { items: visualInspection },
      insulation_resistance: { tests: insulationResistance },
      turns_ratio: turnsRatio,
      test_equipment: testEquipment,
      comments: comments
    };

    console.log('💾 Data being inserted into database:', JSON.stringify(dataToInsert, null, 2));
    console.log('🔍 Key structures:');
    console.log('  - visual_inspection.items:', dataToInsert.visual_inspection.items);
    console.log('  - insulation_resistance.tests:', dataToInsert.insulation_resistance.tests);
    console.log('  - turns_ratio.taps:', dataToInsert.turns_ratio.taps);
    console.log('  - test_equipment.megohmmeter:', dataToInsert.test_equipment.megohmmeter);

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'large-dry-type-transformer-mts-report';
  }
}


