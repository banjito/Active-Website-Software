import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LiquidXfmrVisualMTSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_cable_test_3sets';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`LiquidXfmrVisualMTS Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('liquidxfmrvisualmts') || 
           data.reportType?.toLowerCase().includes('liquid-xfmr-visual-mts');
    console.log(`LiquidXfmrVisualMTS Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    console.log('🚀 LIQUID XFMR VISUAL MTS IMPORTER IS RUNNING!');
    console.log('🔄 Starting data preparation for LiquidXfmrVisualMTS Report');
    
    // Initialize the data structure to match the component's expected format
    const reportInfo: any = {};
    const visualInspection: any = {};
    const testEquipment: any = { megohmmeter: { name: '', serialNumber: '', ampId: '' } };
    let comments = '';

    // Prioritize data.fields processing since that's where the main data is
    if (data.data && data.data.fields) {
      console.log('📊 Processing data.fields (primary data source)...');
      const fields = data.data.fields;
      console.log('Available fields:', Object.keys(fields));
      console.log('Full fields object:', fields);
      
      // Job Information
      reportInfo.customer = fields.customer || '';
      reportInfo.address = fields.address || '';
      reportInfo.userName = fields.user || '';
      reportInfo.date = fields.date || '';
      reportInfo.jobNumber = fields.jobNumber || '';
      reportInfo.technicians = fields.technicians || '';
      reportInfo.substation = fields.substation || '';
      reportInfo.eqptLocation = fields.eqptLocation || '';
      reportInfo.identifier = fields.identifier || '';
      
      console.log('Job info processed:', {
        customer: reportInfo.customer,
        address: reportInfo.address,
        userName: reportInfo.userName,
        date: reportInfo.date,
        jobNumber: reportInfo.jobNumber,
        technicians: reportInfo.technicians,
        substation: reportInfo.substation,
        eqptLocation: reportInfo.eqptLocation,
        identifier: reportInfo.identifier
      });
      
      // Temperature - handle both temperatureF and temperature fields
      if (fields.temperatureF) {
        const tempF = parseFloat(fields.temperatureF) || 0;
        reportInfo.temperature = {
          ambient: tempF,
          fahrenheit: tempF,
          celsius: Math.round((tempF - 32) * 5/9),
          correctionFactor: 1.0
        };
        console.log('Temperature processed:', reportInfo.temperature);
      }
      
      // Nameplate Data
      if (fields['dry-nameplate']) {
        console.log('Processing dry-nameplate data:', fields['dry-nameplate']);
        const nameplate = fields['dry-nameplate'];
        reportInfo.nameplateData = {
          manufacturer: nameplate.manufacturer || '',
          catalogNumber: nameplate.catalogNumber || '',
          serialNumber: nameplate.serialNumber || '',
          kva: nameplate.kva || '',
          kvaSecondary: nameplate.kvaSecondary || '',
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
        console.log('Nameplate data processed:', reportInfo.nameplateData);
      } else {
        console.log('❌ No dry-nameplate data found');
      }
      
      // Indicator Gauge Values
      console.log('Setting indicator gauge values:', {
        oilLevel: fields.oilLevel,
        tankPressure: fields.tankPressure,
        oilTemperature: fields.oilTemperature,
        windingTemperature: fields.windingTemperature,
        oilTempRange: fields.oilTempRange,
        windingTempRange: fields.windingTempRange
      });
      
      reportInfo.oilLevel = fields.oilLevel || '';
      reportInfo.tankPressure = fields.tankPressure || '';
      reportInfo.oilTemperature = fields.oilTemperature || '';
      reportInfo.windingTemperature = fields.windingTemperature || '';
      reportInfo.oilTempRange = fields.oilTempRange || '';
      reportInfo.windingTempRange = fields.windingTempRange || '';
      
      console.log('Indicator gauge values processed:', {
        oilLevel: reportInfo.oilLevel,
        tankPressure: reportInfo.tankPressure,
        oilTemperature: reportInfo.oilTemperature,
        windingTemperature: reportInfo.windingTemperature,
        oilTempRange: reportInfo.oilTempRange,
        windingTempRange: reportInfo.windingTempRange
      });
      
      // Visual Inspection
      if (fields['vm-table'] && fields['vm-table'].rows) {
        console.log('Processing vm-table data:', fields['vm-table'].rows);
        fields['vm-table'].rows.forEach((row: any) => {
          if (row.id && row.description) {
            console.log(`Setting visual inspection ${row.id}: ${row.result}`);
            visualInspection[row.id] = row.result || '';
          }
        });
        console.log('Visual inspection processed:', visualInspection);
      } else {
        console.log('❌ No vm-table data found');
      }
      
      // Electrical Tests
      if (fields.dryTypeIr) {
        console.log('Processing dryTypeIr data:', fields.dryTypeIr);
        const ir = fields.dryTypeIr;
        const normalizeVoltage = (val: any) => {
          if (val === undefined || val === null) return '';
          const s = String(val).trim();
          return /^\d+$/.test(s) ? `${s}V` : s;
        };
        const result: any = {
          primaryToGround: {
            testVoltage: normalizeVoltage(ir.primaryToGround?.testVoltage || ''),
            unit: ir.primaryToGround?.unit || ir.primaryToGround?.units || '',
            readings: {
              halfMinute: ir.primaryToGround?.r05 || '',
              oneMinute: ir.primaryToGround?.r1 || '',
              tenMinute: ir.primaryToGround?.r10 || ''
            }
          },
          secondaryToGround: {
            testVoltage: normalizeVoltage(ir.secondaryToGround?.testVoltage || ''),
            unit: ir.secondaryToGround?.unit || ir.secondaryToGround?.units || '',
            readings: {
              halfMinute: ir.secondaryToGround?.r05 || '',
              oneMinute: ir.secondaryToGround?.r1 || '',
              tenMinute: ir.secondaryToGround?.r10 || ''
            }
          },
          primaryToSecondary: {
            testVoltage: normalizeVoltage(ir.primaryToSecondary?.testVoltage || ''),
            unit: ir.primaryToSecondary?.unit || ir.primaryToSecondary?.units || '',
            readings: {
              halfMinute: ir.primaryToSecondary?.r05 || '',
              oneMinute: ir.primaryToSecondary?.r1 || '',
              tenMinute: ir.primaryToSecondary?.r10 || ''
            }
          }
        };
        if (Array.isArray(ir.rows)) {
          const daRow = ir.rows.find((r: any) => (r.id || '').toLowerCase().includes('dielectric'));
          const piRow = ir.rows.find((r: any) => (r.id || '').toLowerCase().includes('polarization'));
          if (daRow) {
            result.dielectricAbsorption = {
              primary: daRow.primary || '',
              secondary: daRow.secondary || '',
              primaryToSecondary: daRow.primaryToSecondary || ''
            };
          }
          if (piRow) {
            result.polarizationIndex = {
              primary: piRow.primary || '',
              secondary: piRow.secondary || '',
              primaryToSecondary: piRow.primaryToSecondary || ''
            };
          }
          const acceptable = daRow?.acceptable || piRow?.acceptable;
          if (acceptable) (result as any).acceptable = acceptable;
        }
        reportInfo.insulationResistance = result;
        console.log('Electrical tests processed:', reportInfo.insulationResistance);
      } else {
        console.log('❌ No dryTypeIr data found');
      }
      
      // Test Equipment
      console.log('Setting test equipment:', {
        megohmmeter: fields.megohmmeter,
        serialNumber: fields.serialNumber,
        ampId: fields.ampId
      });
      
      testEquipment.megohmmeter.name = fields.megohmmeter || '';
      testEquipment.megohmmeter.serialNumber = fields.serialNumber || '';
      testEquipment.megohmmeter.ampId = fields.ampId || '';
      comments = fields.comments || '';
      
      console.log('Test equipment processed:', testEquipment);
      console.log('Comments processed:', comments);
    }

    // Fallback to sections processing if data.fields not available
    if (data.sections && data.sections.length > 0 && Object.keys(reportInfo).length === 0) {
      console.log('📋 Processing sections data (fallback)...');
      
      data.sections.forEach(section => {
        console.log(`📁 Processing section: ${section.title}`);
        
        if (section.title.toLowerCase().includes('job information')) {
          section.fields.forEach(field => {
            console.log(`Processing job info field: ${field.label} = ${field.value}`);
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
            else if (fieldName.includes('temp') || fieldName.includes('°f')) {
              console.log(`Found temperature field: ${field.label} = ${field.value}`);
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
              console.log('Processing nameplate data:', field.value);
              const nameplate = field.value;
              reportInfo.nameplateData = {
                manufacturer: nameplate.manufacturer || '',
                catalogNumber: nameplate.catalogNumber || '',
                serialNumber: nameplate.serialNumber || '',
                kva: nameplate.kva || '',
                kvaSecondary: nameplate.kvaSecondary || '',
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
                },
                fluidType: reportInfo.nameplateData?.fluidType || '',
                fluidVolume: reportInfo.nameplateData?.fluidVolume || ''
              };
            }
            const L = (field.label || '').toLowerCase();
            if (L.includes('fluid type')) {
              reportInfo.nameplateData = reportInfo.nameplateData || {};
              reportInfo.nameplateData.fluidType = field.value || '';
            } else if (L.includes('fluid volume')) {
              reportInfo.nameplateData = reportInfo.nameplateData || {};
              reportInfo.nameplateData.fluidVolume = field.value || '';
            }
          });
        } else if (section.title.toLowerCase().includes('indicator gauge values')) {
          section.fields.forEach(field => {
            console.log(`Processing indicator gauge: ${field.label} = ${field.value}`);
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
              console.log('Processing visual inspection data:', field.value.rows);
              field.value.rows.forEach((row: any) => {
                if (row.id && row.description) {
                  console.log(`Setting visual inspection ${row.id}: ${row.result}`);
                  visualInspection[row.id] = row.result || '';
                }
              });
            }
          });
        } else if (section.title.toLowerCase().includes('electrical tests') && section.title.toLowerCase().includes('insulation resistance')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value) {
              console.log('Processing electrical tests:', field.value);
              const testData = field.value;
              reportInfo.insulationResistance = {
                primaryToGround: {
                  testVoltage: testData.primaryToGround?.testVoltage || '',
                  unit: testData.primaryToGround?.unit || '',
                  readings: {
                    halfMinute: testData.primaryToGround?.r05 || '',
                    oneMinute: testData.primaryToGround?.r1 || '',
                    tenMinute: testData.primaryToGround?.r10 || ''
                  }
                },
                secondaryToGround: {
                  testVoltage: testData.secondaryToGround?.testVoltage || '',
                  unit: testData.secondaryToGround?.unit || '',
                  readings: {
                    halfMinute: testData.secondaryToGround?.r05 || '',
                    oneMinute: testData.secondaryToGround?.r1 || '',
                    tenMinute: testData.secondaryToGround?.r10 || ''
                  }
                },
                primaryToSecondary: {
                  testVoltage: testData.primaryToSecondary?.testVoltage || '',
                  unit: testData.primaryToSecondary?.unit || ''
                }
              };
            }
          });
        } else if (section.title.toLowerCase().includes('test equipment')) {
          section.fields.forEach(field => {
            console.log(`Processing test equipment: ${field.label} = ${field.value}`);
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('megohmmeter')) testEquipment.megohmmeter.name = field.value;
            else if (fieldName.includes('serial number')) testEquipment.megohmmeter.serialNumber = field.value;
            else if (fieldName.includes('amp id')) testEquipment.megohmmeter.ampId = field.value;
          });
        } else if (section.title.toLowerCase().includes('comments')) {
          section.fields.forEach(field => {
            if (field.label.toLowerCase().includes('comments')) {
              comments = field.value || '';
            }
          });
        }
      });
    }

    console.log('✅ Final processed report data:', { reportInfo, visualInspection, testEquipment, comments });

    // Store comments within report_info since there's no separate comments column
    if (comments) {
      reportInfo.comments = comments;
    }

    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      data: {
        reportInfo,
        visualInspection,
        testEquipment,
        status: 'PASS',
        isLiquidType: true,
        reportType: 'liquid-xfmr-visual-mts-report'
      }
    };

    console.log('💾 Data being inserted into database:', JSON.stringify(dataToInsert, null, 2));
    return dataToInsert;
  }

  protected getReportType(): string {
    return 'liquid-xfmr-visual-mts-report';
  }
}
