import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MediumVoltageSwitchOilImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'medium_voltage_switch_oil_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`MediumVoltageSwitchOil Importer checking: ${data.reportType}`);
    const t = (data.reportType || (data as any)?.data?.reportType || '').toLowerCase();
    const canImport = t.includes('mediumvoltageswitchoil');
    console.log(`MediumVoltageSwitchOil Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    console.log('🔍 MediumVoltageSwitchOilImporter - Starting prepareData');
    console.log('🔍 Input data structure:', data);
    console.log('🔍 Sections:', (data as any)?.sections);
    
    const f: any = (data as any)?.data?.fields || {};
    const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

    // Report Info (Job Information + Nameplate + VFI Data)
    const reportInfo = {
      customer: f.customer || '',
      address: f.address || '',
      user: f.user || '',
      date: f.date || '',
      jobNumber: f.jobNumber || '',
      technicians: f.technicians || '',
      substation: f.substation || '',
      eqptLocation: f.eqptLocation || '',
      identifier: f.identifier || '',
      temperature: toNum(f.temperatureF ?? 68),
      humidity: toNum(f.humidity ?? 0),
      
      // Nameplate Data - Match component's expected field names
      nameplate_manufacturer: f.manufacturer || '',
      nameplate_systemVoltage: f.systemVoltage || '',
      nameplate_catalogNo: f.catalogNumber || '',
      nameplate_ratedVoltage: f.ratedVoltage || '',
      nameplate_serialNumber: f.serialNumber || '',
      nameplate_ratedCurrent: f.ratedCurrent || '',
      nameplate_dateOfMfg: f.dateOfMfg || '',
      nameplate_aicRating: f.aicRating || '',
      nameplate_type: f.type || '',
      nameplate_impulseLevelBIL: f.impulseLevelBIL || '',
      
      // VFI Data - Match component's expected structure
      vfiData: {
        manufacturer: f.vfiManufacturer || '',
        ratedVoltage: f.vfiRatedVoltage || '',
        catalogNo: f.vfiCatalogNo || '',
        ratedCurrent: f.vfiRatedCurrent || '',
        type: f.vfiType || '',
        aicRating: f.vfiAicRating || '',
      },
    };

    // Insulation Resistance Data
    const irData = f.mvSwitchIr || {};
    const irRows: any[] = Array.isArray(irData.rows) ? irData.rows : [];
    const insulationResistanceMeasured = {
      testVoltage: irData.testVoltage || '5000V',
      rows: irRows.map(row => ({
        way: row.way || '',
        units: row.units || 'MΩ',
        ag: row.ag || '',
        bg: row.bg || '',
        cg: row.cg || '',
      }))
    };

    // Contact Resistance Data
    const crData = f.mvSwitchCr || {};
    const crRows: any[] = Array.isArray(crData.rows) ? crData.rows : [];
    const contactResistance = {
      rows: crRows.map(row => ({
        way: row.way || '',
        units: row.units || 'µΩ',
        aPhase: row.aPhase || '',
        bPhase: row.bPhase || '',
        cPhase: row.cPhase || '',
        aGround: row.aGround || '',
        bGround: row.bGround || '',
        cGround: row.cGround || '',
      }))
    };

    // Dielectric Tests - Split into separate columns as per table structure
    const dwData = f.mvWithstand || {};
    const dwRows: any[] = Array.isArray(dwData.rows) ? dwData.rows : [];
    
    // Find specific dielectric test rows
    const s1s2Row = dwRows.find(row => row.way === 'S1-S2') || {};
    const s1t1Row = dwRows.find(row => row.way === 'S1-T1') || {};
    const s1t2Row = dwRows.find(row => row.way === 'S1-T2') || {};
    const s1t3Row = dwRows.find(row => row.way === 'S1-T3') || {};

    const dielectricS1S2 = {
      testVoltage: dwData.testVoltage || '',
      units: s1s2Row.units || 'mA',
      ag: s1s2Row.ag || '',
      bg: s1s2Row.bg || '',
      cg: s1s2Row.cg || '',
    };

    const dielectricS1T1 = {
      testVoltage: dwData.testVoltage || '',
      units: s1t1Row.units || 'mA',
      ag: s1t1Row.ag || '',
      bg: s1t1Row.bg || '',
      cg: s1t1Row.cg || '',
    };

    const dielectricS1T2 = {
      testVoltage: dwData.testVoltage || '',
      units: s1t2Row.units || 'mA',
      ag: s1t2Row.ag || '',
      bg: s1t2Row.bg || '',
      cg: s1t2Row.cg || '',
    };

    const dielectricS1T3 = {
      testVoltage: dwData.testVoltage || '',
      units: s1t3Row.units || 'mA',
      ag: s1t3Row.ag || '',
      bg: s1t3Row.bg || '',
      cg: s1t3Row.cg || '',
    };

    // VFI Specific Tests
    const vfiData = f.dielectricOpen || {};
    const vfiRows: any[] = Array.isArray(vfiData.rows) ? vfiData.rows : [];
    const vfiTestRows = vfiRows.map(row => ({
      vfi: row.vfi || '',
      serialNumber: row.serialNumber || '',
      asFound: row.asFound || '',
      asLeft: row.asLeft || '',
      a: row.a || '',
      b: row.b || '',
      c: row.c || '',
      units: row.units || 'mA',
    }));

    // Test Equipment
    const teData = f.testEquipment3 || {};
    const testEquipment = {
      megohmmeter: {
        name: teData.megohmmeter?.name || '',
        serialNumber: teData.megohmmeter?.serialNumber || '',
        ampId: teData.megohmmeter?.ampId || '',
      },
      lowResistanceOhmmeter: {
        name: teData.lowResistanceOhmmeter?.name || '',
        serialNumber: teData.lowResistanceOhmmeter?.serialNumber || '',
        ampId: teData.lowResistanceOhmmeter?.ampId || '',
      },
      primaryInjectionTestSet: {
        name: teData.primaryInjectionTestSet?.name || '',
        serialNumber: teData.primaryInjectionTestSet?.serialNumber || '',
        ampId: teData.primaryInjectionTestSet?.ampId || '',
      },
    };

    // Debug logging
    console.log('🔍 MediumVoltageSwitchOilImporter - Data prepared:');
    console.log('  - reportInfo:', reportInfo);
    console.log('  - insulationResistanceMeasured:', insulationResistanceMeasured);
    console.log('  - contactResistance:', contactResistance);
    console.log('  - dielectricS1S2:', dielectricS1S2);
    console.log('  - dielectricS1T1:', dielectricS1T1);
    console.log('  - dielectricS1T2:', dielectricS1T2);
    console.log('  - dielectricS1T3:', dielectricS1T3);
    console.log('  - vfiTestRows:', vfiTestRows);
    console.log('  - testEquipment:', testEquipment);

    // Match the actual table structure with specific JSONB columns
    const result = {
      job_id: jobId,
      user_id: userId,
      report_info: reportInfo,
      insulation_resistance_measured: insulationResistanceMeasured,
      contact_resistance: contactResistance,
      dielectric_s1s2: dielectricS1S2,
      dielectric_s1t1: dielectricS1T1,
      dielectric_s1t2: dielectricS1T2,
      dielectric_s1t3: dielectricS1T3,
      vfi_test_rows: vfiTestRows,
      test_equipment: testEquipment,
      comments: f.comments || '',
      status: 'PASS',
    };
    
    console.log('🔍 MediumVoltageSwitchOilImporter - Final result being returned:');
    console.log('  - result:', result);
    
    return result;
  }

  protected getReportType(): string {
    return 'medium-voltage-switch-oil-report';
  }
}
