import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageCable12SetsImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_cable_test_12sets'; // Use the 12-sets table
  protected requiredColumns = ['job_id', 'user_id', 'data'];

  canImport(data: ReportData): boolean {
    console.log(`ATS Cable Importer checking: ${data.reportType}`);
    // Check if this is a low voltage cable report (ATS version)
    const canImport = data.reportType?.toLowerCase().includes('lowvoltagecable') || 
           data.reportType?.toLowerCase().includes('low-voltage-cable') ||
           data.reportType?.toLowerCase().includes('12sets') ||
           data.reportType?.toLowerCase().includes('ats');
    console.log(`ATS Cable Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    // Process the data - check both sections and data.fields
    const reportData: any = {};
    
    // First, check if there's a data.fields object (this is the flattened structure)
    if (data.data && data.data.fields) {
      console.log('Found data.fields structure:', data.data.fields);
      
      // Map the flattened fields to the expected structure
      const fields = data.data.fields;
      
      // Job Information
      reportData.customer = fields.customer || '';
      reportData.address = fields.address || '';
      reportData.user = fields.user || '';
      reportData.date = fields.date || '';
      reportData.jobNumber = fields.jobNumber || '';
      reportData.technicians = fields.technicians || '';
      reportData.substation = fields.substation || '';
      reportData.eqptLocation = fields.eqptLocation || '';
      reportData.identifier = fields.identifier || '';
      
      // Environmental
      reportData.temperature = parseFloat(fields.temperatureF || fields.temperature || '0') || 0;
      reportData.humidity = parseFloat(fields.humidity || '0') || 0;
      
      // Cable Data
      reportData.testedFrom = fields.testedFrom || '';
      reportData.manufacturer = fields.manufacturer || '';
      reportData.conductorMaterial = fields.conductorMaterial || '';
      reportData.insulationType = fields.insulationType || '';
      reportData.systemVoltage = fields.systemVoltage || '';
      reportData.ratedVoltage = fields.ratedVoltage || '';
      reportData.length = fields.length || '';
      reportData.numberOfCables = parseInt(fields.numberOfCables || '0') || 0;
      reportData.testVoltage = fields.testVoltage || '';
      
      // Test Equipment
      reportData.testEquipment = {
        megohmmeter: fields.megohmmeter || '',
        serialNumber: fields.serialNumber || '',
        ampId: fields.ampId || '',
        comments: fields.comments || ''
      };
      
      // Inspection Results (from vm-table)
      if (fields['vm-table'] && fields['vm-table'].rows) {
        reportData.inspectionResults = {};
        fields['vm-table'].rows.forEach((row: any) => {
          if (row.id && row.result) {
            reportData.inspectionResults[row.id] = row.result;
          }
        });
      }
      
      // Test Sets (from electricalGrid)
      if (fields.electricalGrid && fields.electricalGrid.rows) {
        reportData.testSets = fields.electricalGrid.rows.map((row: any, index: number) => ({
          id: index + 1,
          from: row.from || '',
          to: row.to || '',
          size: row.size || '',
          config: row.config || '',
          result: row.result || '',
          readings: {
            aToGround: row.aG || '',
            bToGround: row.bG || '',
            cToGround: row.cG || '',
            nToGround: '',
            aToB: row.aB || '',
            bToC: '',
            cToA: '',
            aToN: '',
            bToN: '',
            cToN: '',
            continuity: row.cont || ''
          },
          correctedReadings: {
            aToGround: row.c_aG || '',
            bToGround: row.c_bG || '',
            cToGround: row.c_cG || '',
            nToGround: '',
            aToB: row.c_aB || '',
            bToC: '',
            cToA: '',
            aToN: '',
            bToN: '',
            cToN: '',
            continuity: row.cont || ''
          }
        }));
      }
      
    } else if (data.sections) {
      // Fallback to processing sections if data.fields doesn't exist
      console.log('Processing sections data:', data.sections);
      
      data.sections.forEach(section => {
        console.log(`Processing section: ${section.title}`);
        
        // Handle special sections that need specific structure
        if (section.title.toLowerCase().includes('job information') || 
            section.title.toLowerCase().includes('job info')) {
          section.fields.forEach(field => {
            // Map common field names to what the component expects
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('customer')) reportData.customer = field.value;
            else if (fieldName.includes('address')) reportData.address = field.value;
            else if (fieldName.includes('user')) reportData.user = field.value;
            else if (fieldName.includes('date')) reportData.date = field.value;
            else if (fieldName.includes('jobnumber') || fieldName.includes('job#')) reportData.jobNumber = field.value;
            else if (fieldName.includes('technicians')) reportData.technicians = field.value;
            else if (fieldName.includes('substation')) reportData.substation = field.value;
            else if (fieldName.includes('location')) reportData.eqptLocation = field.value;
            else if (fieldName.includes('identifier')) reportData.identifier = field.value;
          });
        } else if (section.title.toLowerCase().includes('environmental') || 
                   section.title.toLowerCase().includes('temperature')) {
          section.fields.forEach(field => {
            if (field.label.toLowerCase().includes('temperature')) {
              reportData.temperature = parseFloat(field.value) || 0;
            } else if (field.label.toLowerCase().includes('humidity')) {
              reportData.humidity = parseFloat(field.value) || 0;
            }
          });
        } else if (section.title.toLowerCase().includes('cable') || 
                   section.title.toLowerCase().includes('equipment')) {
          section.fields.forEach(field => {
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('testedfrom')) reportData.testedFrom = field.value;
            else if (fieldName.includes('manufacturer')) reportData.manufacturer = field.value;
            else if (fieldName.includes('conductormaterial')) reportData.conductorMaterial = field.value;
            else if (fieldName.includes('insulationtype')) reportData.insulationType = field.value;
            else if (fieldName.includes('systemvoltage')) reportData.systemVoltage = field.value;
            else if (fieldName.includes('ratedvoltage')) reportData.ratedVoltage = field.value;
            else if (fieldName.includes('length')) reportData.length = field.value;
            else if (fieldName.includes('numberofcables')) reportData.numberOfCables = parseInt(field.value) || 0;
            else if (fieldName.includes('testvoltage')) reportData.testVoltage = field.value;
          });
        } else if (section.title.toLowerCase().includes('test equipment') || 
                   section.title.toLowerCase().includes('equipment')) {
          reportData.testEquipment = {
            megohmmeter: '',
            serialNumber: '',
            ampId: '',
            comments: ''
          };
          
          section.fields.forEach(field => {
            const fieldName = field.label.toLowerCase().replace(/\s+/g, '');
            if (fieldName.includes('megohmmeter')) reportData.testEquipment.megohmmeter = field.value;
            else if (fieldName.includes('serial')) reportData.testEquipment.serialNumber = field.value;
            else if (fieldName.includes('ampid')) reportData.testEquipment.ampId = field.value;
            else if (fieldName.includes('comments')) reportData.testEquipment.comments = field.value;
          });
        } else if (section.title.toLowerCase().includes('test') || 
                   section.title.toLowerCase().includes('readings')) {
          // Handle test data - this might need more complex processing
          section.fields.forEach(field => {
            reportData[field.label] = field.value;
          });
        } else {
          // For other sections, preserve the original structure
          section.fields.forEach(field => {
            reportData[field.label] = field.value;
          });
        }
      });
    }
    
    // Initialize testSets if not present
    if (!reportData.testSets) {
      reportData.testSets = [];
    }
    
    // Initialize inspectionResults if not present
    if (!reportData.inspectionResults) {
      reportData.inspectionResults = {};
    }
    
    console.log('Final processed report data:', reportData);

    // Use the appropriate JSONB column based on schema
    const jsonbColumn = schema.jsonbColumns.includes('data') ? 'data' : 'report_data';
    
    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      [jsonbColumn]: reportData
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'low-voltage-cable-test-12sets'; // Route to the 12-sets ATS component
  }
}
