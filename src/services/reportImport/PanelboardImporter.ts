import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class PanelboardImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'panelboard_reports';
  // Be flexible: some environments use a single JSONB column, others split JSONBs
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`Panelboard Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('panelboard') || 
           data.reportType?.toLowerCase().includes('panelboardreport');
    console.log(`Panelboard Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const fields: any = data?.data?.fields || {};

    // Build report_info from fields/sections
    const report_info: any = {
      customer: fields.customer || fields.customerName || '',
      address: fields.address || '',
      user: fields.user || fields.userName || '',
      date: fields.date || '',
      jobNumber: fields.jobNumber || '',
      technicians: fields.technicians || '',
      substation: fields.substation || '',
      eqptLocation: fields.eqptLocation || '',
      identifier: fields.identifier || data?.data?.identifier || '',
      temperature: {
        fahrenheit: typeof fields.temperatureF !== 'undefined' ? fields.temperatureF : 68,
        celsius: 20,
        humidity: typeof fields.humidity !== 'undefined' ? Number(fields.humidity) : 0,
        tcf: 1
      },
      manufacturer: fields.manufacturer || '',
      catalogNumber: fields.catalogNumber || '',
      serialNumber: fields.serialNumber || '',
      type: fields.type || '',
      systemVoltage: fields.systemVoltage || '',
      ratedVoltage: fields.ratedVoltage || '',
      ratedCurrent: fields.ratedCurrent || '',
      phaseConfiguration: fields.phaseConfiguration || ''
    };

    // Visual & Mechanical: prefer vm-table.rows if present
    const vmRows = fields['vm-table']?.rows || [];
    const visual_mechanical = vmRows.length
      ? { items: vmRows }
      : undefined;

    // Insulation Resistance: map from panelboardIr
    const ir = fields.panelboardIr || {};
    const insulation_resistance = ir && (ir.measured || ir.tcf)
      ? {
          tests: [
            {
              values: {
                ag: ir.measured?.ag || '',
                bg: ir.measured?.bg || '',
                cg: ir.measured?.cg || '',
                ab: ir.measured?.ab || '',
                bc: ir.measured?.bc || '',
                ca: ir.measured?.ca || '',
                an: ir.measured?.an || '',
                bn: ir.measured?.bn || '',
                cn: ir.measured?.cn || ''
              },
              testVoltage: '',
              unit: 'MΩ'
            }
          ],
          correctedTests: [
            {
              values: {
                ag: ir.measured?.ag || '',
                bg: ir.measured?.bg || '',
                cg: ir.measured?.cg || '',
                ab: ir.measured?.ab || '',
                bc: ir.measured?.bc || '',
                ca: ir.measured?.ca || '',
                an: ir.measured?.an || '',
                bn: ir.measured?.bn || '',
                cn: ir.measured?.cn || ''
              }
            }
          ]
        }
      : undefined;

    // Contact Resistance: map from panelboardCr.rows
    const crRows = fields.panelboardCr?.rows || [];
    const contact_resistance = crRows.length
      ? {
          tests: crRows.map((r: any) => ({
            busSection: '',
            values: {
              aPhase: r.aPhase || '',
              bPhase: r.bPhase || '',
              cPhase: r.cPhase || '',
              neutral: r.neutral || '',
              ground: r.ground || ''
            },
            testVoltage: '',
            unit: r.unit || 'µΩ'
          }))
        }
      : undefined;

    // Test Equipment: from testEquipment3 (names aligned with component)
    const te = fields.testEquipment3 || {};
    const test_equipment = Object.keys(te).length
      ? {
          megohmmeter: {
            name: te.megohmmeter?.name || '',
            serialNumber: te.megohmmeter?.serialNumber || '',
            ampId: te.megohmmeter?.ampId || ''
          }
        }
      : undefined;

    const comments = fields.comments || '';

    // Build adaptive payload depending on available columns
    const dataToInsert: any = { job_id: jobId, user_id: userId };

    const has = (col: string) => schema.jsonbColumns.includes(col);
    const canBlobData = has('data') || has('report_data');

    if (has('report_info')) dataToInsert.report_info = report_info;
    if (has('visual_mechanical')) dataToInsert.visual_mechanical = visual_mechanical || { items: [] };
    if (has('visual_mechanical_inspection')) dataToInsert.visual_mechanical_inspection = visual_mechanical || { items: [] };
    if (has('insulation_resistance')) dataToInsert.insulation_resistance = insulation_resistance || { tests: [], correctedTests: [] };
    if (has('contact_resistance')) dataToInsert.contact_resistance = contact_resistance || { tests: [] };
    if (has('test_equipment')) dataToInsert.test_equipment = test_equipment || {};
    if (schema.columns.includes('comments')) dataToInsert.comments = comments;

    if (!Object.keys(dataToInsert).some(k => ['report_info','visual_mechanical','visual_mechanical_inspection','insulation_resistance','contact_resistance','test_equipment','comments'].includes(k)) && canBlobData) {
      const blob = {
        report_info,
        ...(visual_mechanical ? { visual_mechanical } : {}),
        ...(insulation_resistance ? { insulation_resistance } : {}),
        ...(contact_resistance ? { contact_resistance } : {}),
        ...(test_equipment ? { test_equipment } : {}),
        comments
      };
      if (has('data')) {
        dataToInsert.data = blob;
      } else {
        dataToInsert.report_data = blob;
      }
    }

    return dataToInsert;
  }

  protected getReportType(): string {
    // Must match the React Router path in App.tsx: '/jobs/:id/panelboard-report/:reportId?'
    return 'panelboard-report';
  }
}


