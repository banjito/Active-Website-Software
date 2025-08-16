import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class TwoSmallDryTypeTransformerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'two_small_dry_type_transformer_reports';
  protected requiredColumns = ['job_id', 'user_id', 'data'];

  canImport(data: ReportData): boolean {
    console.log(`TwoSmallDryTypeTransformer Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('twosmalldrytypetransformer') || 
           data.reportType?.toLowerCase().includes('two-small-dry-type-transformer');
    console.log(`TwoSmallDryTypeTransformer Importer canImport result: ${canImport}`);
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
      
      // Transformer specific fields
      reportData.manufacturer = fields.manufacturer || '';
      reportData.model = fields.model || '';
      reportData.serialNumber = fields.serialNumber || '';
      reportData.kva = fields.kva || '';
      reportData.primaryVoltage = fields.primaryVoltage || '';
      reportData.secondaryVoltage = fields.secondaryVoltage || '';
      reportData.temperature = parseFloat(fields.temperatureF || fields.temperature || '0') || 0;
      reportData.humidity = parseFloat(fields.humidity || '0') || 0;
      
      // Test equipment
      reportData.testEquipment = {
        megohmmeter: fields.megohmmeter || '',
        serialNumber: fields.serialNumber || '',
        ampId: fields.ampId || '',
        comments: fields.comments || ''
      };
      
      // Inspection results
      if (fields['vm-table'] && fields['vm-table'].rows) {
        reportData.inspectionResults = {};
        fields['vm-table'].rows.forEach((row: any) => {
          if (row.id && row.result) {
            reportData.inspectionResults[row.id] = row.result;
          }
        });
      }
      
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
    return 'two-small-dry-type-transformer';
  }
}
