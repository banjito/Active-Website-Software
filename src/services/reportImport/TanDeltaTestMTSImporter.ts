import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class TanDeltaTestMTSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'tan_delta_test_mts';
  protected requiredColumns = ['job_id', 'user_id', 'data'];

  canImport(data: ReportData): boolean {
    const tRoot = (data.reportType || '').toLowerCase();
    const tData = ((data as any)?.data?.reportType || '').toLowerCase();
    const t = `${tRoot} ${tData}`;
    return (
      t.includes('tan') && t.includes('delta') && t.includes('mts')
    ) ||
      t.includes('tandeltatestmtsform') ||
      t.includes('medium voltage cable vlf test with tan delta mts');
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    // Helpers
    const toNum = (v: any) => {
      if (v === null || v === undefined || v === '') return NaN;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : NaN;
    };

    const getSections = () => Array.isArray(data.sections) ? data.sections : [];
    const getFields = () => ((data as any)?.data?.fields) || {};

    // Extract from sections first
    const sections = getSections();
    const fieldsObj: any = getFields();

    let systemVoltage: string | undefined;
    let tanDeltaValues: any[] = [];
    let status: 'PASS' | 'FAIL' | undefined;
    let comments: string | undefined;
    let equipment: {
      megohmmeterMakeModel?: string;
      megohmeterSerial?: string;
      megohmmeterAmpId?: string;
      vlfHipotMakeModel?: string;
      vlfHipotSerial?: string;
      vlfHipotAmpId?: string;
    } = {};

    for (const s of sections) {
      const title = (s.title || '').toLowerCase();
      if (title.includes('tan delta') && s.fields && s.fields.length) {
        // e.g., section.title === 'Tan Delta (Power Factor) Test' with a table value
        const tdField = s.fields.find(f => (f.label || '').toLowerCase().includes('tan delta'));
        const val = tdField?.value;
        if (val && typeof val === 'object') {
          if (!systemVoltage && val.systemVoltageL2G) {
            systemVoltage = String(val.systemVoltageL2G);
          }
          if (Array.isArray(val.values)) {
            tanDeltaValues = val.values;
          }
        }
      }
      if (title.includes('test result') && s.fields) {
        const resField = s.fields.find(f => (f.label || '').toLowerCase().includes('result'));
        const v = (resField?.value || '').toString().toUpperCase();
        if (v === 'PASS' || v === 'FAIL') status = v as 'PASS' | 'FAIL';
      }
      if (title === 'comments' && s.fields && s.fields.length) {
        const cField = s.fields.find(f => (f.label || '').toLowerCase().includes('comments'));
        if (cField && typeof cField.value === 'string') comments = cField.value;
      }
      if (title.includes('test equipment') && s.fields && s.fields.length) {
        const te = s.fields[0]?.value || {};
        // Prefer names as Make/Model, serialNumber fields as serials
        equipment = {
          megohmmeterMakeModel: te.megohmmeter?.name || '',
          megohmeterSerial: te.megohmmeter?.serialNumber || '',
          megohmmeterAmpId: te.megohmmeter?.ampId || '',
          vlfHipotMakeModel: te.primaryInjectionTestSet?.name || '',
          vlfHipotSerial: te.primaryInjectionTestSet?.serialNumber || '',
          vlfHipotAmpId: te.primaryInjectionTestSet?.ampId || ''
        };
      }
    }

    // Fallbacks to data.fields
    if (!systemVoltage) systemVoltage = fieldsObj?.mvTanDelta?.systemVoltageL2G || fieldsObj?.tanDelta?.systemVoltageL2G || fieldsObj?.systemVoltageL2G;
    if ((!tanDeltaValues || tanDeltaValues.length === 0) && (fieldsObj?.mvTanDelta?.values || fieldsObj?.tanDelta?.values)) {
      tanDeltaValues = fieldsObj?.mvTanDelta?.values || fieldsObj?.tanDelta?.values || [];
    }
    if (!status) {
      const sVal = (fieldsObj?.tanDeltaResult || '').toString().toUpperCase();
      if (sVal === 'PASS' || sVal === 'FAIL') status = sVal as 'PASS' | 'FAIL';
    }
    if (!comments && typeof fieldsObj?.comments === 'string') comments = fieldsObj.comments;
    if (!equipment || Object.keys(equipment).length === 0) {
      const te = fieldsObj?.testEquipment3 || {};
      equipment = {
        megohmmeterMakeModel: te.megohmmeter?.name || '',
        megohmeterSerial: te.megohmmeter?.serialNumber || '',
        megohmmeterAmpId: te.megohmmeter?.ampId || '',
        vlfHipotMakeModel: te.primaryInjectionTestSet?.name || '',
        vlfHipotSerial: te.primaryInjectionTestSet?.serialNumber || '',
        vlfHipotAmpId: te.primaryInjectionTestSet?.ampId || ''
      };
    }

    // Transform values to component shape
    const points = (Array.isArray(tanDeltaValues) ? tanDeltaValues : []).map((p: any) => {
      const kVNum = toNum(p?.kV);
      const aTd = toNum(p?.phaseA?.td);
      const aStd = toNum(p?.phaseA?.stdDev);
      const bTd = toNum(p?.phaseB?.td);
      const bStd = toNum(p?.phaseB?.stdDev);
      const cTd = toNum(p?.phaseC?.td);
      const cStd = toNum(p?.phaseC?.stdDev);
      return {
        voltageLabel: (p?.voltageStep || '').toString(),
        kV: Number.isFinite(kVNum) ? kVNum : 0,
        phaseA: Number.isFinite(aTd) ? aTd : 0,
        phaseAStdDev: Number.isFinite(aStd) ? aStd : null,
        phaseB: Number.isFinite(bTd) ? bTd : 0,
        phaseBStdDev: Number.isFinite(bStd) ? bStd : null,
        phaseC: Number.isFinite(cTd) ? cTd : 0,
        phaseCStdDev: Number.isFinite(cStd) ? cStd : null
      };
    });

    // Reasonable defaults
    const finalSystemVoltage = (systemVoltage || '14.400').toString();
    const finalStatus: 'PASS' | 'FAIL' = status || 'PASS';

    return {
      job_id: jobId,
      user_id: userId,
      data: {
        systemVoltage: finalSystemVoltage,
        testEquipment: equipment,
        status: finalStatus,
        points
      }
    };
  }

  protected getReportType(): string {
    // Route to the Tan Delta MTS form
    return 'electrical-tan-delta-test-mts-form';
  }
}


