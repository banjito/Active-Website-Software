import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class OilInspectionImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'oil_inspection_reports';
  protected requiredColumns = ['job_id', 'user_id', 'data'];

  canImport(data: ReportData): boolean {
    console.log(`OilInspection Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('oilinspection') || 
           data.reportType?.toLowerCase().includes('oil-inspection');
    console.log(`OilInspection Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const reportData: any = {};
    
    if (data.data && data.data.fields) {
      console.log('Found data.fields structure:', data.data.fields);
      
      const fields = data.data.fields;
      
      // Map common fields
      reportData.customer = fields.customer || '';
      reportData.address = fields.address || '';
      reportData.user = fields.user || '';
      reportData.date = fields.date || '';
      reportData.jobNumber = fields.jobNumber || '';
      reportData.technicians = fields.technicians || '';
      reportData.substation = fields.substation || '';
      reportData.eqptLocation = fields.eqptLocation || '';
      reportData.identifier = fields.identifier || '';
      
      // Oil inspection specific fields
      reportData.oilType = fields.oilType || '';
      reportData.oilVolume = fields.oilVolume || '';
      reportData.temperature = parseFloat(fields.temperatureF || fields.temperature || '0') || 0;
      reportData.humidity = parseFloat(fields.humidity || '0') || 0;
      
      // Test results
      reportData.testResults = fields.testResults || [];
      reportData.inspectionResults = fields.inspectionResults || {};
      
      // Test equipment
      reportData.testEquipment = {
        megohmmeter: fields.megohmmeter || '',
        serialNumber: fields.serialNumber || '',
        ampId: fields.ampId || '',
        comments: fields.comments || ''
      };
      
    } else if (data.sections) {
      console.log('Processing sections data:', data.sections);
      
      data.sections.forEach(section => {
        section.fields.forEach(field => {
          reportData[field.label] = field.value;
        });
      });
    }
    
    console.log('Final processed report data:', reportData);

    const jsonbColumn = schema.jsonbColumns.includes('data') ? 'data' : 'report_data';
    
    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      [jsonbColumn]: reportData
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'oil-inspection';
  }
}
