import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LiquidFilledTransformerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_cable_test_3sets';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`LiquidFilledTransformer Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('liquidfilledtransformer') || 
           data.reportType?.toLowerCase().includes('liquid-filled-transformer');
    console.log(`LiquidFilledTransformer Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    console.log('🔄 Starting data preparation for LiquidFilledTransformer ATS Report');
    
    // Initialize the data structure to match the component's FormData interface exactly
    const reportInfo: any = {};
    const visualInspection: any = {};
    const insulationResistance: any = {};
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
        } else if (section.title.toLowerCase().includes('indicator gauge values')) {
          section.fields.forEach(field => {
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('oil level')) reportInfo.oilLevel = field.value;
            else if (fieldName.includes('tank pressure')) reportInfo.tankPressure = field.value;
            else if (fieldName.includes('oil temperature')) reportInfo.oilTemperature = field.value;
            else if (fieldName.includes('winding temperature')) reportInfo.windingTemperature = field.value;
            else if (fieldName.includes('oil temp range')) reportInfo.oilTempRange = field.value;
            else if (fieldName.includes('winding temp range')) reportInfo.windingTempRange = field.value;
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
                  halfMinute: irData.secondaryToGround?.r05 || '',
                  oneMinute: irData.secondaryToGround?.r1 || '',
                  tenMinute: irData.secondaryToGround?.r10 || ''
                },
                corrected: {
                  halfMinute: irData.secondaryToGround?.r05 || '',
                  oneMinute: irData.secondaryToGround?.r1 || '',
                  tenMinute: irData.secondaryToGround?.r10 || ''
                },
                dielectricAbsorption: '',
                polarizationIndex: ''
              };
              insulationResistance.primaryToSecondary = {
                testVoltage: irData.primaryToSecondary?.testVoltage || '',
                unit: irData.primaryToSecondary?.unit || '',
                readings: {
                  halfMinute: irData.primaryToSecondary?.r05 || '',
                  oneMinute: irData.primaryToSecondary?.r1 || '',
                  tenMinute: irData.primaryToSecondary?.r10 || ''
                },
                corrected: {
                  halfMinute: irData.primaryToSecondary?.r05 || '',
                  oneMinute: irData.primaryToSecondary?.r1 || '',
                  tenMinute: irData.primaryToSecondary?.r10 || ''
                },
                dielectricAbsorption: '',
                polarizationIndex: ''
              };
              insulationResistance.dielectricAbsorptionAcceptable = '';
              insulationResistance.polarizationIndexAcceptable = '';
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

    // Also check if data exists in data.fields (fallback)
    if (data.data && data.data.fields) {
      console.log('📊 Processing data.fields fallback...');
      const fields = data.data.fields;
      
      // Job Information
      if (!reportInfo.customer) reportInfo.customer = fields.customer || '';
      if (!reportInfo.address) reportInfo.address = fields.address || '';
      if (!reportInfo.userName) reportInfo.userName = fields.user || '';
      if (!reportInfo.date) reportInfo.date = fields.date || '';
      if (!reportInfo.jobNumber) reportInfo.jobNumber = fields.jobNumber || '';
      if (!reportInfo.technicians) reportInfo.technicians = fields.technicians || '';
      if (!reportInfo.substation) reportInfo.substation = fields.substation || '';
      if (!reportInfo.eqptLocation) reportInfo.eqptLocation = fields.eqptLocation || '';
      if (!reportInfo.identifier) reportInfo.identifier = fields.identifier || '';
      
      // Temperature
      if (!reportInfo.temperature && fields.temperatureF) {
        const tempF = parseFloat(fields.temperatureF) || 0;
        reportInfo.temperature = {
          ambient: tempF,
          fahrenheit: tempF,
          celsius: Math.round((tempF - 32) * 5/9),
          correctionFactor: 1.0
        };
      }

      // Nameplate data from dry-nameplate
      if (fields['dry-nameplate'] && !reportInfo.nameplateData) {
        const nameplate = fields['dry-nameplate'];
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

      // Indicator gauge values
      if (!reportInfo.oilLevel) reportInfo.oilLevel = fields.oilLevel || '';
      if (!reportInfo.tankPressure) reportInfo.tankPressure = fields.tankPressure || '';
      if (!reportInfo.oilTemperature) reportInfo.oilTemperature = fields.oilTemperature || '';
      if (!reportInfo.windingTemperature) reportInfo.windingTemperature || '';
      if (!reportInfo.oilTempRange) reportInfo.oilTempRange = fields.oilTempRange || '';
      if (!reportInfo.windingTempRange) reportInfo.windingTempRange = fields.windingTempRange || '';

      // Visual inspection from vm-table
      if (fields['vm-table'] && fields['vm-table'].rows && Object.keys(visualInspection).length === 0) {
        fields['vm-table'].rows.forEach((row: any) => {
          if (row.id && row.description) {
            visualInspection[row.id] = row.result || '';
          }
        });
      }

      // Insulation resistance from dryTypeIr
      if (fields.dryTypeIr && Object.keys(insulationResistance).length === 0) {
        const irData = fields.dryTypeIr;
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
            halfMinute: irData.secondaryToGround?.r05 || '',
            oneMinute: irData.secondaryToGround?.r1 || '',
            tenMinute: irData.secondaryToGround?.r10 || ''
          },
          corrected: {
            halfMinute: irData.secondaryToGround?.r05 || '',
            oneMinute: irData.secondaryToGround?.r1 || '',
            tenMinute: irData.secondaryToGround?.r10 || ''
          },
          dielectricAbsorption: '',
          polarizationIndex: ''
        };
        insulationResistance.primaryToSecondary = {
          testVoltage: irData.primaryToSecondary?.testVoltage || '',
          unit: irData.primaryToSecondary?.unit || '',
          readings: {
            halfMinute: irData.primaryToSecondary?.r05 || '',
            oneMinute: irData.primaryToSecondary?.r1 || '',
            tenMinute: irData.primaryToSecondary?.r10 || ''
          },
          corrected: {
            halfMinute: irData.primaryToSecondary?.r05 || '',
            oneMinute: irData.primaryToSecondary?.r1 || '',
            tenMinute: irData.primaryToSecondary?.r10 || ''
          },
          dielectricAbsorption: '',
          polarizationIndex: ''
        };
        insulationResistance.dielectricAbsorptionAcceptable = '';
        insulationResistance.polarizationIndexAcceptable = '';
      }

      // Test equipment
      if (!testEquipment.megohmmeter.name) testEquipment.megohmmeter.name = fields.megohmmeter || '';
      if (!testEquipment.megohmmeter.serialNumber) testEquipment.megohmmeter.serialNumber = fields.serialNumber || '';
      if (!testEquipment.megohmmeter.ampId) testEquipment.megohmmeter.ampId = fields.ampId || '';

      // Comments
      if (!comments) comments = fields.comments || '';
    }

    console.log('✅ Final processed report data:', {
      reportInfo,
      visualInspection,
      insulationResistance,
      testEquipment,
      comments
    });

    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      data: {
        reportInfo,
        visualInspection,
        insulationResistance,
        testEquipment,
        comments,
        status: 'PASS',
        isLiquidType: true,
        reportType: 'liquid_filled_transformer_ats'
      }
    };

    console.log('💾 Data being inserted into database:', JSON.stringify(dataToInsert, null, 2));

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'liquid-filled-transformer';
  }
}

