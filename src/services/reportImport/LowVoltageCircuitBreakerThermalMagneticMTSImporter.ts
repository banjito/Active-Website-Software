import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageCircuitBreakerThermalMagneticMTSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_circuit_breaker_thermal_magnetic_mts_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    const t = (data.reportType || data.data?.reportType || '').toLowerCase();
    return t.includes('lowvoltagecircuitbreakerthermalmagneticmtsreport')
      || t.includes('lowvoltagecircuitbreakerthermalmagneticmtsreport.tsx')
      || t.includes('low-voltage-circuit-breaker-thermal-magnetic-mts-report')
      || t.includes('lowvoltagecircuitbreakerthermalmagneticmts');
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const f = (data as any)?.data?.fields || {};

    const report_info: any = {
      // Job info
      customer: f.customer || '',
      address: f.address || '',
      user: f.user || '',
      date: f.date || '',
      identifier: f.identifier || '',
      jobNumber: f.jobNumber || '',
      technicians: f.technicians || '',
      substation: f.substation || '',
      eqptLocation: f.eqptLocation || '',
      temperature: {
        fahrenheit: parseFloat(f.temperatureF || f.temperature || '0') || 0,
        celsius: 0,
        tcf: 1,
        humidity: f.humidity || ''
      },
      // Nameplate (flattened at top-level to match component state)
      manufacturer: f.manufacturer || '',
      catalogNumber: f.catalogNumber || '',
      serialNumber: f.serialNumber || '',
      type: f.type || '',
      icRating: f.icRating || '',
      frameSize: f.frameSize || '',
      ratingPlug: f.ratingPlug || '',
      curveNo: f.curveNo || '',
      operation: f.operation || '',
      mounting: f.mounting || '',
      thermalMemory: f.thermalMemory || '',
      // Visual/mechanical
      inspectionResults: (() => {
        const res: Record<string, string> = {};
        const rows = f['vm-table']?.rows || [];
        for (const r of rows) if (r?.id) res[r.id] = r.result || '';
        return res;
      })(),
      // Device/counter/test data
      counterReading: { asFound: f.counterReadingFound || '', asLeft: f.counterReadingLeft || '' },
      deviceSettings: f.tmDeviceSettings || f.deviceSettings || {},
      contactResistance: f.breakerContactResistance || {},
      insulationResistance: (() => {
        const src = f.contactorInsulation || {};
        const out: any = {
          testVoltage: src.testVoltage || '',
          unit: 'MΩ',
          measured: {
            poleToPole: { p1p2: '', p2p3: '', p3p1: '' },
            poleToFrame: { p1: '', p2: '', p3: '' },
            lineToLoad: { p1: '', p2: '', p3: '' }
          },
          corrected: {
            poleToPole: { p1p2: '', p2p3: '', p3p1: '' },
            poleToFrame: { p1: '', p2: '', p3: '' },
            lineToLoad: { p1: '', p2: '', p3: '' }
          }
        };
        const rows = Array.isArray(src.rows) ? src.rows : [];
        const find = (name: string) => rows.find((r: any) => (r.id || '').toLowerCase().includes(name));
        const ptp = find('pole to pole');
        const ptf = find('pole to frame');
        const ltl = find('line to load');
        if (ptp) {
          out.measured.poleToPole.p1p2 = ptp.p1 || '';
          out.measured.poleToPole.p2p3 = ptp.p2 || '';
          out.measured.poleToPole.p3p1 = ptp.p3 || '';
          out.corrected.poleToPole.p1p2 = ptp.p1c || '';
          out.corrected.poleToPole.p2p3 = ptp.p2c || '';
          out.corrected.poleToPole.p3p1 = ptp.p3c || '';
        }
        if (ptf) {
          out.measured.poleToFrame.p1 = ptf.p1 || '';
          out.measured.poleToFrame.p2 = ptf.p2 || '';
          out.measured.poleToFrame.p3 = ptf.p3 || '';
          out.corrected.poleToFrame.p1 = ptf.p1c || '';
          out.corrected.poleToFrame.p2 = ptf.p2c || '';
          out.corrected.poleToFrame.p3 = ptf.p3c || '';
        }
        if (ltl) {
          out.measured.lineToLoad.p1 = ltl.p1 || '';
          out.measured.lineToLoad.p2 = ltl.p2 || '';
          out.measured.lineToLoad.p3 = ltl.p3 || '';
          out.corrected.lineToLoad.p1 = ltl.p1c || '';
          out.corrected.lineToLoad.p2 = ltl.p2c || '';
          out.corrected.lineToLoad.p3 = ltl.p3c || '';
        }
        return out;
      })(),
      primaryInjection: (() => {
        const src = f.tmPrimaryInjection || f.primaryInjection || {};
        const out: any = {
          testedSettings: {
            thermal: src.testedSettings?.thermal || '',
            magnetic: src.testedSettings?.magnetic || ''
          },
          results: {
            thermal: {
              multiplier: src.results?.thermal?.multiplier || src.results?.thermal?.multiplierTolerance || '300%',
              toleranceMin: src.results?.thermal?.toleranceMin || '',
              toleranceMax: src.results?.thermal?.toleranceMax || '',
              amperes1: src.results?.thermal?.amperes1 || '',
              pole1: { sec: src.results?.thermal?.pole1?.sec || '' , a: src.results?.thermal?.pole1?.a || '' },
              pole2: { sec: src.results?.thermal?.pole2?.sec || '' , a: src.results?.thermal?.pole2?.a || '' },
              pole3: { sec: src.results?.thermal?.pole3?.sec || '' , a: src.results?.thermal?.pole3?.a || '' }
            },
            magnetic: {
              multiplier: src.results?.magnetic?.multiplier || src.results?.magnetic?.multiplierTolerance || '-10% 10%',
              toleranceMin: src.results?.magnetic?.toleranceMin || '',
              toleranceMax: src.results?.magnetic?.toleranceMax || '',
              amperes1: src.results?.magnetic?.amperes1 || '',
              pole1: { a: src.results?.magnetic?.pole1?.a || src.results?.magnetic?.pole1?.sec || '' },
              pole2: { a: src.results?.magnetic?.pole2?.a || src.results?.magnetic?.pole2?.sec || '' },
              pole3: { a: src.results?.magnetic?.pole3?.a || src.results?.magnetic?.pole3?.sec || '' }
            }
          }
        };
        return out;
      })(),
      testEquipment: f.testEquipment3 || {},
      status: 'PASS'
    };

    // Choose column based on schema
    const hasData = (schema.jsonbColumns || []).includes('data');
    const hasReportData = (schema.jsonbColumns || []).includes('report_data');
    let payload: any = { job_id: jobId, user_id: userId };
    if (hasData) payload.data = report_info;
    else if (hasReportData) payload.report_data = report_info;
    else payload = { job_id: jobId, user_id: userId, report_info };
    return payload;
  }

  protected getReportType(): string {
    return 'low-voltage-circuit-breaker-thermal-magnetic-mts-report';
  }
}


