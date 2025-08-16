import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';
import { supabase } from '@/lib/supabase';

export class DryTypeTransformerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'transformer_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`DryTypeTransformer Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('drytypetransformer') || 
           data.reportType?.toLowerCase().includes('dry-type-transformer');
    console.log(`DryTypeTransformer Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    try {
      console.log('🚀 DryTypeTransformerImporter.import called - bypassing BaseImporter schema validation');
      
      const preparedData = this.prepareData(data, jobId, userId, { columns: [], jsonbColumns: [] });
      
      console.log(`📤 Inserting into ${this.tableName}:`, preparedData);

      const { data: result, error } = await supabase
        .schema('neta_ops')
        .from(this.tableName)
        .insert(preparedData)
        .select('id')
        .single();

      if (error) {
        console.error(`❌ Error inserting report into ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully inserted into ${this.tableName}:`, result);

      return {
        success: true,
        reportId: result.id,
        reportType: this.getReportType()
      };
    } catch (error: any) {
      console.error(`❌ Error importing report into ${this.tableName}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to import report'
      };
    }
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    console.log('🔍 DryTypeTransformerImporter.prepareData called with:', { jobId, userId, schema });
    console.log('📊 Input data sections:', data.sections?.length || 0);
    console.log('📊 Input data.fields:', !!data.data?.fields);
    
    const reportInfo: any = {};
    const nameplateData: any = {};
    const visualInspectionItems: any[] = [];
    const insulationResistance: any = {};
    const testEquipment: any = {};
    let comments = '';

    // Process sections first
    if (data.sections && data.sections.length > 0) {
      console.log('✅ Processing sections data');
      data.sections.forEach(section => {
        const title = section.title.toLowerCase();
        console.log(`  📝 Processing section: ${section.title}`);
        if (title.includes('job information') || title.includes('job info')) {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('customer')) reportInfo.customer = field.value;
            else if (L.includes('address')) reportInfo.address = field.value;
            else if (L.includes('user')) reportInfo.userName = field.value;
            else if (L.includes('date')) reportInfo.date = field.value;
            else if (L.includes('job')) reportInfo.jobNumber = field.value;
            else if (L.includes('technicians')) reportInfo.technicians = field.value;
            else if (L.includes('substation')) reportInfo.substation = field.value;
            else if (L.includes('eqpt') || L.includes('location')) reportInfo.eqptLocation = field.value;
            else if (L.includes('identifier')) reportInfo.identifier = field.value;
            else if (L.includes('temp')) {
              const f = parseFloat(field.value) || 68;
              reportInfo.temperature = { 
                ambient: f,
                fahrenheit: f, 
                celsius: Math.round((f - 32) * 5/9), 
                correctionFactor: 1 
              };
            }
          });
        } else if (title.includes('nameplate') || title.includes('device')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value) {
              const np = field.value;
              nameplateData.manufacturer = np.manufacturer || '';
              nameplateData.catalogNumber = np.catalogNumber || '';
              nameplateData.serialNumber = np.serialNumber || '';
              nameplateData.kva = np.kva || '';
              nameplateData.kvaSecondary = np.kvaSecondary || '';
              nameplateData.tempRise = np.tempRise || '';
              nameplateData.impedance = np.impedance || '';
              nameplateData.primary = np.primary || {};
              nameplateData.secondary = np.secondary || {};
              nameplateData.tapConfiguration = {
                positions: [1, 2, 3, 4, 5, 6, 7],
                voltages: np.tapVoltages || [],
                currentPosition: parseInt(np.tapPositionCurrent) || 1,
                currentPositionSecondary: np.tapPositionSecondary || '',
                tapVoltsSpecific: np.tapSpecificVolts || '',
                tapPercentSpecific: np.tapSpecificPercent || ''
              };
            }
          });
        } else if (title.includes('visual') || title.includes('mechanical')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value?.rows) {
              field.value.rows.forEach((row: any) => {
                visualInspectionItems.push({
                  id: row.id || '',
                  description: row.description || '',
                  result: row.result || 'Select One',
                  comments: ''
                });
              });
            }
          });
        } else if (title.includes('electrical tests') || title.includes('insulation resistance')) {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value) {
              const ir = field.value;
              const daRow = Array.isArray(ir.rows) ? ir.rows.find((r: any) => (r.id || '').toLowerCase().includes('dielectric')) : null;
              const piRow = Array.isArray(ir.rows) ? ir.rows.find((r: any) => (r.id || '').toLowerCase().includes('polarization')) : null;
              if (daRow) insulationResistance.dielectricAbsorptionAcceptable = daRow.acceptable || '';
              if (piRow) insulationResistance.polarizationIndexAcceptable = piRow.acceptable || '';

              if (ir.primaryToGround) {
                insulationResistance.primaryToGround = {
                  testVoltage: ir.primaryToGround.testVoltage || '',
                  unit: ir.primaryToGround.unit || ir.primaryToGround.units || 'MΩ',
                  readings: {
                    halfMinute: ir.primaryToGround.r05 || '',
                    oneMinute: ir.primaryToGround.r1 || '',
                    tenMinute: ir.primaryToGround.r10 || ''
                  },
                  corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
                  dielectricAbsorption: daRow?.primary || '',
                  polarizationIndex: piRow?.primary || ''
                };
              }
              if (ir.secondaryToGround) {
                insulationResistance.secondaryToGround = {
                  testVoltage: ir.secondaryToGround.testVoltage || '',
                  unit: ir.secondaryToGround.unit || ir.secondaryToGround.units || 'MΩ',
                  readings: {
                    halfMinute: ir.secondaryToGround.r05 || '',
                    oneMinute: ir.secondaryToGround.r1 || '',
                    tenMinute: ir.secondaryToGround.r10 || ''
                  },
                  corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
                  dielectricAbsorption: daRow?.secondary || '',
                  polarizationIndex: piRow?.secondary || ''
                };
              }
              if (ir.primaryToSecondary) {
                insulationResistance.primaryToSecondary = {
                  testVoltage: ir.primaryToSecondary.testVoltage || '',
                  unit: ir.primaryToSecondary.unit || ir.primaryToSecondary.units || 'MΩ',
                  readings: {
                    halfMinute: ir.primaryToSecondary.r05 || '',
                    oneMinute: ir.primaryToSecondary.r1 || '',
                    tenMinute: ir.primaryToSecondary.r10 || ''
                  },
                  corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
                  dielectricAbsorption: daRow?.primaryToSecondary || '',
                  polarizationIndex: piRow?.primaryToSecondary || ''
                };
              }
            }
          });
        } else if (title.includes('test equipment')) {
          let current: 'meg' | null = null;
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('megohmmeter')) { current = 'meg'; testEquipment.megohmmeter = { name: field.value, serialNumber: '', ampId: '' }; }
            else if (L.includes('serial')) { if (current === 'meg') testEquipment.megohmmeter.serialNumber = field.value; }
            else if (L.includes('amp') || L.includes('id')) { if (current === 'meg') testEquipment.megohmmeter.ampId = field.value; }
          });
        } else if (title.includes('comments')) {
          section.fields.forEach(field => { 
            if (field.type === 'text' || field.type === 'textarea') comments = field.value || ''; 
          });
        }
      });
    }

    // Fallback to data.fields
    if (data.data && data.data.fields) {
      console.log('✅ Processing data.fields fallback');
      const f: any = data.data.fields;
      reportInfo.customer = reportInfo.customer || f.customer || '';
      reportInfo.address = reportInfo.address || f.address || '';
      reportInfo.userName = reportInfo.userName || f.user || '';
      reportInfo.date = reportInfo.date || f.date || '';
      reportInfo.jobNumber = reportInfo.jobNumber || f.jobNumber || '';
      reportInfo.technicians = reportInfo.technicians || f.technicians || '';
      reportInfo.substation = reportInfo.substation || f.substation || '';
      reportInfo.eqptLocation = reportInfo.eqptLocation || f.eqptLocation || '';
      reportInfo.identifier = reportInfo.identifier || f.identifier || '';
      if (!reportInfo.temperature && f.temperatureF) {
        const tf = parseFloat(f.temperatureF) || 68;
        reportInfo.temperature = { 
          ambient: tf,
          fahrenheit: tf, 
          celsius: Math.round((tf - 32) * 5/9), 
          correctionFactor: 1 
        };
      }

      if (Object.keys(nameplateData).length === 0 && f['dry-nameplate']) {
        const np = f['dry-nameplate'];
        nameplateData.manufacturer = np.manufacturer || '';
        nameplateData.catalogNumber = np.catalogNumber || '';
        nameplateData.serialNumber = np.serialNumber || '';
        nameplateData.kva = np.kva || '';
        nameplateData.kvaSecondary = np.kvaSecondary || '';
        nameplateData.tempRise = np.tempRise || '';
        nameplateData.impedance = np.impedance || '';
        nameplateData.primary = np.primary || {};
        nameplateData.secondary = np.secondary || {};
        nameplateData.tapConfiguration = {
          positions: [1, 2, 3, 4, 5, 6, 7],
          voltages: np.tapVoltages || [],
          currentPosition: parseInt(np.tapPositionCurrent) || 1,
          currentPositionSecondary: np.tapPositionSecondary || '',
          tapVoltsSpecific: np.tapSpecificVolts || '',
          tapPercentSpecific: np.tapSpecificPercent || ''
        };
      }

      if (visualInspectionItems.length === 0 && f['vm-table']?.rows) {
        f['vm-table'].rows.forEach((row: any) => {
          visualInspectionItems.push({
            id: row.id || '',
            description: row.description || '',
            result: row.result || 'Select One',
            comments: ''
          });
        });
      }

      if (Object.keys(insulationResistance).length === 0 && f.dryTypeIr) {
        const ir = f.dryTypeIr;
        const daRow = Array.isArray(ir.rows) ? ir.rows.find((r: any) => (r.id || '').toLowerCase().includes('dielectric')) : null;
        const piRow = Array.isArray(ir.rows) ? ir.rows.find((r: any) => (r.id || '').toLowerCase().includes('polarization')) : null;
        if (daRow) insulationResistance.dielectricAbsorptionAcceptable = daRow.acceptable || '';
        if (piRow) insulationResistance.polarizationIndexAcceptable = piRow.acceptable || '';
        if (ir.primaryToGround) {
          insulationResistance.primaryToGround = {
            testVoltage: ir.primaryToGround.testVoltage || '',
            unit: ir.primaryToGround.unit || ir.primaryToGround.units || 'MΩ',
            readings: {
              halfMinute: ir.primaryToGround.r05 || '',
              oneMinute: ir.primaryToGround.r1 || '',
              tenMinute: ir.primaryToGround.r10 || ''
            },
            corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
            dielectricAbsorption: daRow?.primary || '',
            polarizationIndex: piRow?.primary || ''
          };
        }
        if (ir.secondaryToGround) {
          insulationResistance.secondaryToGround = {
            testVoltage: ir.secondaryToGround.testVoltage || '',
            unit: ir.secondaryToGround.unit || ir.secondaryToGround.units || 'MΩ',
            readings: {
              halfMinute: ir.secondaryToGround.r05 || '',
              oneMinute: ir.secondaryToGround.r1 || '',
              tenMinute: ir.secondaryToGround.r10 || ''
            },
            corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
            dielectricAbsorption: daRow?.secondary || '',
            polarizationIndex: piRow?.secondary || ''
          };
        }
        if (ir.primaryToSecondary) {
          insulationResistance.primaryToSecondary = {
            testVoltage: ir.primaryToSecondary.testVoltage || '',
            unit: ir.primaryToSecondary.unit || ir.primaryToSecondary.units || 'MΩ',
            readings: {
              halfMinute: ir.primaryToSecondary.r05 || '',
              oneMinute: ir.primaryToSecondary.r1 || '',
              tenMinute: ir.primaryToSecondary.r10 || ''
            },
            corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
            dielectricAbsorption: daRow?.primaryToSecondary || '',
            polarizationIndex: piRow?.primaryToSecondary || ''
          };
        }
      }

      if (Object.keys(testEquipment).length === 0) {
        testEquipment.megohmmeter = {
          name: f.megohmmeter || '',
          serialNumber: f.serialNumber || '',
          ampId: f.ampId || ''
        };
      }

      if (!comments) comments = f.comments || '';
    }

    // Build the payload according to the component's expected structure
    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      report_info: {
        ...reportInfo,
        nameplateData,
        status: 'PASS',
        comments: comments
      },
      visual_inspection: {
        items: visualInspectionItems
      },
      insulation_resistance: {
        tests: insulationResistance
      },
      test_equipment: testEquipment
    };

    console.log('📤 Final dataToInsert:', dataToInsert);
    console.log('📊 Schema expected columns:', schema.columns);
    console.log('📊 Schema expected JSONB columns:', schema.jsonbColumns);

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'dry-type-transformer';
  }
}
