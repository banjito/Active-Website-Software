import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageCircuitBreakerElectronicTripImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_cable_test_3sets';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`LowVoltageCircuitBreakerElectronicTrip Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('lowvoltagecircuitbreakerelectronictrip') || 
           data.reportType?.toLowerCase().includes('low-voltage-circuit-breaker-electronic-trip');
    console.log(`LowVoltageCircuitBreakerElectronicTrip Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const normalized: any = { reportInfo: {}, visualInspection: {}, testEquipment: {} };
    if (data.data && data.data.fields) {
      const f = data.data.fields as any;
      // Job info
      normalized.reportInfo = {
        customer: f.customer || '',
        address: f.address || '',
        userName: f.user || '',
        date: f.date || '',
        identifier: f.identifier || '',
        jobNumber: f.jobNumber || '',
        technicians: f.technicians || '',
        substation: f.substation || '',
        eqptLocation: f.eqptLocation || '',
        temperature: (() => {
          const fahrenheit = parseFloat(f.temperatureF || f.temperature || '0') || 0;
          const celsius = Math.round((fahrenheit - 32) * 5 / 9);
          return { ambient: fahrenheit, fahrenheit, celsius, correctionFactor: 1 };
        })(),
        humidity: f.humidity || ''
      };
      // Nameplate / breaker info
      normalized.nameplateData = {
        manufacturer: f.manufacturer || '',
        catalogNumber: f.catalogNumber || '',
        serialNumber: f.serialNumber || '',
        type: f.type || '',
        frameSize: f.frameSize || '',
        icRating: f.icRating || '',
        tripUnitType: f.tripUnitType || '',
        ratingPlug: f.ratingPlug || '',
        curveNo: f.curveNo || '',
        chargeMotorVoltage: f.chargeMotorVoltage || '',
        operation: f.operation || '',
        mounting: f.mounting || '',
        zoneInterlock: f.zoneInterlock || '',
        thermalMemory: f.thermalMemory || ''
      };
      // Visual/mechanical
      if (f['vm-table']?.rows) {
        for (const row of f['vm-table'].rows) {
          if (row?.id) normalized.visualInspection[row.id] = row.result || '';
        }
      }
      // Device settings and tests
      if (f.deviceSettings) normalized.deviceSettings = f.deviceSettings;
      if (f.breakerContactResistance) normalized.breakerContactResistance = f.breakerContactResistance;
      if (f.contactorInsulation) normalized.contactorInsulation = f.contactorInsulation;
      if (f.primaryInjection) normalized.primaryInjection = f.primaryInjection;
      // Test equipment (all three where available)
      if (f.testEquipment3) {
        normalized.testEquipment.megohmmeter = f.testEquipment3.megohmmeter || { name: '', serialNumber: '', ampId: '' };
        normalized.testEquipment.lowResistanceOhmmeter = f.testEquipment3.lowResistanceOhmmeter || { name: '', serialNumber: '', ampId: '' };
        normalized.testEquipment.primaryInjectionTestSet = f.testEquipment3.primaryInjectionTestSet || { name: '', serialNumber: '', ampId: '' };
      } else {
        normalized.testEquipment.megohmmeter = {
          name: f.megohmmeter || '', serialNumber: f.serialNumber || '', ampId: f.ampId || ''
        };
      }
      // Comments
      if (f.comments) normalized.reportInfo.comments = f.comments;
    } else if (data.sections) {
      // Minimal sections fallback
      for (const s of data.sections) {
        if (!s?.fields) continue;
        for (const field of s.fields) {
          if (typeof field?.label === 'string') {
            (normalized as any)[field.label] = field.value;
          }
        }
      }
    }

    // Build final payload under a single JSONB column 'data'
    const payload: any = {
      job_id: jobId,
      user_id: userId,
      data: {
        ...normalized,
        status: 'PASS',
        reportType: this.getReportType()
      }
    };
    console.log('💾 Low Voltage Electronic Trip payload:', payload);
    return payload;
  }

  protected getReportType(): string {
    // Default to ATS visual report slug for routing; other variants can be split later if needed
    return 'low-voltage-circuit-breaker-electronic-trip-ats-report';
  }
}
