import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageCircuitBreakerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_cable_test_3sets';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`LowVoltageCircuitBreaker Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('lowvoltagecircuitbreaker') || 
           data.reportType?.toLowerCase().includes('low-voltage-circuit-breaker');
    console.log(`LowVoltageCircuitBreaker Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const normalized: any = { reportInfo: {}, visualInspection: {}, deviceSettings: {}, testEquipment: {} };
    const sections = data.sections || [];
    const fields = (data.data && (data.data as any).fields) ? (data.data as any).fields : {};

    // Job info
    const setJobInfo = (src: any) => {
      normalized.reportInfo.customer = src.customer || normalized.reportInfo.customer || '';
      normalized.reportInfo.address = src.address || normalized.reportInfo.address || '';
      normalized.reportInfo.userName = src.user || normalized.reportInfo.userName || '';
      normalized.reportInfo.date = src.date || normalized.reportInfo.date || '';
      normalized.reportInfo.identifier = src.identifier || normalized.reportInfo.identifier || '';
      normalized.reportInfo.jobNumber = src.jobNumber || normalized.reportInfo.jobNumber || '';
      normalized.reportInfo.technicians = src.technicians || normalized.reportInfo.technicians || '';
      normalized.reportInfo.substation = src.substation || normalized.reportInfo.substation || '';
      normalized.reportInfo.eqptLocation = src.eqptLocation || normalized.reportInfo.eqptLocation || '';
      const f = parseFloat(src.temperatureF || src.temperature || '');
      if (!isNaN(f)) {
        const c = Math.round((f - 32) * 5 / 9);
        normalized.reportInfo.temperature = { ambient: f, fahrenheit: f, celsius: c, correctionFactor: 1 };
      }
      if (src.humidity !== undefined) normalized.reportInfo.humidity = src.humidity;
    };
    if (Object.keys(fields).length) setJobInfo(fields);
    sections.forEach(sec => {
      if (typeof sec?.title === 'string' && Array.isArray(sec.fields)) {
        if (sec.title.toLowerCase().includes('job information')) {
          const obj: any = {};
          sec.fields.forEach((f: any) => { obj[f.label?.toLowerCase()?.replace(/\s+/g,'')] = f.value; });
          setJobInfo({
            customer: obj.customer,
            address: obj.address,
            user: obj.user,
            date: obj.date,
            identifier: obj.identifier,
            jobNumber: obj['job#'],
            technicians: obj.technicians,
            substation: obj.substation,
            eqptLocation: obj['eqpt.location'],
            temperatureF: obj['temp.°f'],
            humidity: obj['humidity(%)']
          });
        }
      }
    });

    // Nameplate
    normalized.nameplateData = {
      manufacturer: fields.manufacturer || '',
      catalogNumber: fields.catalogNumber || '',
      serialNumber: fields.serialNumber || '',
      type: fields.type || '',
      icRating: fields.icRating || fields.ic || '',
      frameSize: fields.frameSize || '',
      ratingPlug: fields.ratingPlug || '',
      curveNo: fields.curveNo || '',
      operation: fields.operation || '',
      mounting: fields.mounting || '',
      thermalMemory: fields.thermalMemory || ''
    };

    // Visual/mechanical
    if (fields['vm-table']?.rows) {
      fields['vm-table'].rows.forEach((row: any) => { if (row?.id) normalized.visualInspection[row.id] = row.result || '' });
    }

    // Device settings (thermal/magnetic)
    if (fields.tmDeviceSettings) normalized.deviceSettings = fields.tmDeviceSettings;

    // Contact resistance
    if (fields.breakerContactResistance) normalized.breakerContactResistance = fields.breakerContactResistance;

    // Insulation
    if (fields.contactorInsulation) normalized.contactorInsulation = fields.contactorInsulation;

    // Primary injection (thermal magnetic)
    if (fields.tmPrimaryInjection) normalized.primaryInjection = fields.tmPrimaryInjection;

    // Test equipment
    if (fields.testEquipment3) {
      normalized.testEquipment.megohmmeter = fields.testEquipment3.megohmmeter || { name: '', serialNumber: '', ampId: '' };
      normalized.testEquipment.lowResistanceOhmmeter = fields.testEquipment3.lowResistanceOhmmeter || { name: '', serialNumber: '', ampId: '' };
      normalized.testEquipment.primaryInjectionTestSet = fields.testEquipment3.primaryInjectionTestSet || { name: '', serialNumber: '', ampId: '' };
    }

    // Comments
    if (fields.comments) normalized.reportInfo.comments = fields.comments;

    const payload: any = {
      job_id: jobId,
      user_id: userId,
      data: {
        ...normalized,
        status: 'PASS',
        reportType: this.getReportType(data)
      }
    };
    return payload;
  }

  protected getReportType(data?: ReportData): string {
    const t = (data?.reportType || data?.data?.reportType || '').toLowerCase();
    if (t.includes('thermalmagnetic')) return 'low-voltage-circuit-breaker-thermal-magnetic-ats-report';
    if (t.includes('electronictrip')) return 'low-voltage-circuit-breaker-electronic-trip-ats-report';
    return 'low-voltage-circuit-breaker-ats-report';
  }
}
