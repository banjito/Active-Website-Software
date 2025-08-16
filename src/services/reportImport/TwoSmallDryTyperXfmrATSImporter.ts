import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class TwoSmallDryTyperXfmrATSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'two_small_dry_type_xfmr_ats_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_data'];

  canImport(data: ReportData): boolean {
    const rootType = (data.reportType || '').toLowerCase();
    const nestedType = ((data as any)?.data?.reportType || '').toLowerCase();
    const matches = (t: string) =>
      t.includes('twosmalldrytypexfmratsreport') ||
      t.includes('two-small-dry-type-xfmr-ats-report') ||
      t.includes('two-small-dry-typer-xfmr-ats-report');
    const result = matches(rootType) || matches(nestedType);
    return result;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const reportData: any = {
      status: 'PASS'
    };

    // Helper getters
    const findSection = (title: string) => (data as any)?.sections?.find((s: any) => s.title === title);

    // Job Information (prefer data.fields)
    const fields = (data as any)?.data?.fields || {};
    reportData.jobNumber = fields.jobNumber || '';
    reportData.identifier = fields.identifier || (data as any)?.data?.identifier || '';
    reportData.technicians = fields.technicians || '';
    reportData.user = fields.user || '';
    reportData.date = fields.date || '';
    reportData.substation = fields.substation || '';
    reportData.eqptLocation = fields.eqptLocation || '';
    // Temperature
    const tempF = parseFloat(String(fields.temperatureF ?? '')) || 0;
    const humidity = typeof fields.humidity === 'number' ? fields.humidity : parseFloat(String(fields.humidity ?? '')) || 0;
    const celsius = tempF ? (tempF - 32) * 5 / 9 : 0;
    reportData.temperature = {
      fahrenheit: tempF,
      celsius: parseFloat(celsius.toFixed(2)),
      tcf: 1,
      humidity,
      correctionFactor: 1,
    };

    // Nameplate Data
    const nameplateSection = findSection('Nameplate Data');
    const nameplateVal = nameplateSection?.fields?.[0]?.value || fields['dry-nameplate'] || {};
    reportData.nameplate = {
      manufacturer: nameplateVal.manufacturer || '',
      kvaBase: nameplateVal.kva || '',
      kvaCooling: nameplateVal.kvaSecondary || '',
      voltsPrimary: nameplateVal.primary?.volts || '',
      voltsSecondary: nameplateVal.secondary?.volts || '',
      connectionsPrimary: nameplateVal.primary?.connection || '',
      connectionsSecondary: nameplateVal.secondary?.connection || '',
      windingMaterialPrimary: nameplateVal.primary?.material || '',
      windingMaterialSecondary: nameplateVal.secondary?.material || '',
      catalogNumber: nameplateVal.catalogNumber || '',
      tempRise: nameplateVal.tempRise || '',
      serialNumber: nameplateVal.serialNumber || '',
      impedance: nameplateVal.impedance || '',
      tapVoltages: Array.isArray(nameplateVal.tapVoltages) ? nameplateVal.tapVoltages : Array(7).fill(''),
      tapPosition: nameplateVal.tapPositionCurrent || '',
      tapPositionLeftVolts: nameplateVal.tapSpecificVolts || '',
      tapPositionLeftPercent: nameplateVal.tapSpecificPercent || ''
    };

    // Visual and Mechanical Inspection
    let vmRows: any[] | undefined = fields['vm-table']?.rows;
    if (!vmRows) {
      const vmSection = findSection('Visual and Mechanical Inspection');
      vmRows = vmSection?.fields?.[0]?.value?.rows;
    }
    reportData.visualInspectionItems = Array.isArray(vmRows)
      ? vmRows.map((r: any) => ({
          netaSection: r.id || '',
          description: r.description || '',
          result: r.result || ''
        }))
      : [];
    reportData.visualInspectionComments = '';

    // Insulation Resistance
    const irSection = findSection('Electrical Tests - Measured Insulation Resistance');
    const irField = irSection?.fields?.find((f: any) => (f.label || '').toLowerCase() === 'insulation resistance' && f.type === 'table');
    const irVal = irField?.value || fields.dryTypeIr || fields.dryTypeIrSmall || {};
    const mapIR = (label: string, src: any) => ({
      winding: label,
      testVoltage: src?.testVoltage || '',
      measured0_5Min: src?.r05 ?? src?.r5 ?? '',
      measured1Min: src?.r1 ?? src?.r01 ?? '',
      units: src?.unit || src?.units || 'GΩ',
      corrected0_5Min: '',
      corrected1Min: '',
      correctedUnits: src?.unit || src?.units || 'GΩ',
      tableMinimum: src?.table100Value ?? src?.std05 ?? '',
      tableMinimumUnits: src?.table100Units ?? src?.stdUnit ?? (src?.unit || src?.units || 'GΩ')
    });
    reportData.insulationResistance = {
      tests: [
        mapIR('Primary to Ground', irVal.primaryToGround),
        mapIR('Secondary to Ground', irVal.secondaryToGround),
        mapIR('Primary to Secondary', irVal.primaryToSecondary)
      ],
      dielectricAbsorptionRatio: {
        calculatedAs: '1 Min. / 0.5 Min. Values',
        priToGnd: '',
        secToGnd: '',
        priToSec: '',
        passFail: irVal.passFail || '',
        minimumDAR: irVal.darMin || '1.0'
      }
    };

    // No hardcoded default; prefer provided std05/stdUnit per JSON

    // Turns Ratio
    const trSection = findSection('Electrical Tests - Turns Ratio');
    const trRows: any[] = trSection?.fields?.[0]?.value?.rows || fields.turnsRatioSmallDry?.rows || [];
    reportData.turnsRatio = {
      secondaryWindingVoltage: '',
      tests: trRows.map((r: any) => ({
        tap: r.tap || '',
        nameplateVoltage: r.nameplateVoltage || '',
        calculatedRatio: r.calculatedRatio || '',
        measuredH1H2: r.measuredH1H2 || '',
        devH1H2: r.devH1H2 || '',
        passFailH1H2: r.passFailH1H2 || '',
        measuredH2H3: r.measuredH2H3 || '',
        devH2H3: r.devH2H3 || '',
        passFailH2H3: r.passFailH2H3 || '',
        measuredH3H1: r.measuredH3H1 || '',
        devH3H1: r.devH3H1 || '',
        passFailH3H1: r.passFailH3H1 || ''
      }))
    };

    // Test Equipment
    const teSection = findSection('Test Equipment Used');
    const teVal = teSection?.fields?.[0]?.value || fields.testEquipment3 || {};
    reportData.testEquipment = {
      megohmmeter: {
        name: teVal.megohmmeter?.name || '',
        serialNumber: teVal.megohmmeter?.serialNumber || '',
        ampId: teVal.megohmmeter?.ampId || ''
      },
      ttrTestSet: {
        name: teVal.primaryInjectionTestSet?.name || '',
        serialNumber: teVal.primaryInjectionTestSet?.serialNumber || '',
        ampId: teVal.primaryInjectionTestSet?.ampId || ''
      }
    };

    // Comments
    const commentsSection = findSection('Comments');
    const commentsVal = commentsSection?.fields?.[0]?.value || fields.comments || '';
    reportData.comments = commentsVal || '';

    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      report_data: reportData
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'two-small-dry-typer-xfmr-ats-report';
  }
}


