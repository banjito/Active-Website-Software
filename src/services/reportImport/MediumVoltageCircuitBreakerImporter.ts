import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MediumVoltageCircuitBreakerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'medium_voltage_circuit_breaker_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`MediumVoltageCircuitBreaker Importer checking: ${data.reportType}`);
    const t = (data.reportType || (data as any)?.data?.reportType || '').toLowerCase();
    const canImport = t.includes('mediumvoltagecircuitbreaker') && !t.includes('mts');
    console.log(`MediumVoltageCircuitBreaker Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    console.log('🔍 MediumVoltageCircuitBreakerImporter - Starting prepareData');
    console.log('🔍 Input data structure:', data);
    console.log('🔍 Sections:', (data as any)?.sections);
    
    const f: any = (data as any)?.data?.fields || {};
    const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

    const temperature = {
      fahrenheit: toNum(f.temperatureF ?? 68),
      celsius: Math.round(((toNum(f.temperatureF ?? 68) - 32) * 5) / 9),
      tcf: 1.0,
    };
    const humidity = toNum(f.humidity ?? 0);

    // Visual & Mechanical Inspection
    let vmRows: any[] = [];
    
    // First try to find it in sections
    if (Array.isArray((data as any)?.sections)) {
      for (const section of (data as any).sections) {
        if (section.title && section.title.toLowerCase().includes('visual') && section.title.toLowerCase().includes('mechanical')) {
          for (const field of section.fields || []) {
            if (field.type === 'table' && field.value && Array.isArray(field.value.rows)) {
              vmRows = field.value.rows;
              console.log('🔍 Found VM table in sections:', vmRows);
              break;
            }
          }
          if (vmRows.length > 0) break;
        }
      }
    }
    
    // Fallback to data.fields if not found in sections
    if (vmRows.length === 0 && Array.isArray(f['vm-table']?.rows)) {
      vmRows = f['vm-table'].rows;
      console.log('🔍 Found VM table in data.fields:', vmRows);
    }
    
    const defaultVmIds = [
      '7.6.3.A.1','7.6.3.A.2','7.6.3.A.3','7.6.3.A.4','7.6.3.A.5','7.6.3.A.6','7.6.3.A.7',
      '7.6.3.A.8.1','7.6.3.A.9','7.6.3.A.10','7.6.3.A.11'
    ];
    
    const visualMechanicalInspection = defaultVmIds.reduce((acc: any, id: string) => {
      acc[id] = 'Select One';
      return acc;
    }, {} as any);
    
    // Populate from the found rows
    for (const row of vmRows) {
      if (row?.id && row?.result) {
        visualMechanicalInspection[row.id] = row.result;
        console.log(`🔍 Setting ${row.id} to ${row.result}`);
      }
    }

    const eGap = f.eGap || f.eGapMeasurements || {};
    const eGapMeasurements = {
      unitMeasurement: eGap.unitMeasurement || '',
      tolerance: eGap.tolerance || '',
      aPhase: eGap.aPhase || '',
      bPhase: eGap.bPhase || '',
      cPhase: eGap.cPhase || '',
    };

    const contactResistance = {
      p1: f.breakerCrFound?.p1 || '',
      p2: f.breakerCrFound?.p2 || '',
      p3: f.breakerCrFound?.p3 || '',
      units: 'μΩ'
    };

    const contIns = f.contactorInsulation || {};
    const irRows: any[] = Array.isArray(contIns.rows) ? contIns.rows : [];
    const insulationResistanceMeasured = {
      testVoltage: contIns.testVoltage || '1000V',
      poleToPoleClosedP1P2: '',
      poleToPoleClosedP2P3: '',
      poleToPoleClosedP3P1: '',
      poleToFrameClosedP1: '',
      poleToFrameClosedP2: '',
      poleToFrameClosedP3: '',
      lineToLoadOpenP1: '',
      lineToLoadOpenP2: '',
      lineToLoadOpenP3: '',
    };
    for (const r of irRows) {
      const id = (r.id || '').toLowerCase();
      if (id.includes('pole to pole')) {
        insulationResistanceMeasured.poleToPoleClosedP1P2 = r.p1 || '';
        insulationResistanceMeasured.poleToPoleClosedP2P3 = r.p2 || '';
        insulationResistanceMeasured.poleToPoleClosedP3P1 = r.p3 || '';
      } else if (id.includes('pole to frame')) {
        insulationResistanceMeasured.poleToFrameClosedP1 = r.p1 || '';
        insulationResistanceMeasured.poleToFrameClosedP2 = r.p2 || '';
        insulationResistanceMeasured.poleToFrameClosedP3 = r.p3 || '';
      } else if (id.includes('line to load')) {
        insulationResistanceMeasured.lineToLoadOpenP1 = r.p1 || '';
        insulationResistanceMeasured.lineToLoadOpenP2 = r.p2 || '';
        insulationResistanceMeasured.lineToLoadOpenP3 = r.p3 || '';
      }
    }

    const dielectricWithstand = {
      p1Ground: f.dielectricClosed?.p1Ground || '',
      p2Ground: f.dielectricClosed?.p2Ground || '',
      p3Ground: f.dielectricClosed?.p3Ground || '',
      units: f.dielectricClosed?.units || 'μA',
    };

    const testEquipment = {
      megohmmeter: f.megohmmeter || '',
      serialNumber: f.megohmmeterSerial || '',
      ampId: f.megohmmeterAmpId || '',
      lowResistanceOhmmeter: f.lro || f.lowResistanceOhmmeter || '',
      lroSerial: f.lroSerial || '',
      lroAmpId: f.lroAmpId || '',
      hipot: f.hipot || '',
      hipotSerial: f.hipotSerial || '',
      hipotAmpId: f.hipotAmpId || '',
    };

    const formData = {
      customer: f.customer || '',
      address: f.address || '',
      user: f.user || '',
      date: f.date || '',
      jobNumber: f.jobNumber || '',
      technicians: f.technicians || '',
      substation: f.substation || '',
      eqptLocation: f.eqptLocation || '',
      identifier: f.identifier || '',
      status: 'PASS',
      temperature,
      humidity,
      manufacturer: f.manufacturer || '',
      catalogNumber: f.catalogNumber || '',
      serialNumber: f.serialNumber || '',
      type: f.type || '',
      manufacturingDate: f.manufacturingDate || '',
      icRating: f.icRating || '',
      ratedVoltage: f.ratedVoltage || '',
      operatingVoltage: f.operatingVoltage || '',
      ampacity: f.ampacity || '',
      mvaRating: f.mvaRating || '',
      visualMechanicalInspection,
      // Mirrors to maximize compatibility with any legacy readers
      visual_mechanical_inspection: visualMechanicalInspection,
      visualInspection: visualMechanicalInspection,
      counterReadingAsFound: f.counterReadingAsFound || '',
      counterReadingAsLeft: f.counterReadingAsLeft || '',
      eGapMeasurements,
      contactResistance,
      insulationResistanceMeasured,
      insulationResistanceCorrected: {
        poleToPoleClosedP1P2: '',
        poleToPoleClosedP2P3: '',
        poleToPoleClosedP3P1: '',
        poleToFrameClosedP1: '',
        poleToFrameClosedP2: '',
        poleToFrameClosedP3: '',
        lineToLoadOpenP1: '',
        lineToLoadOpenP2: '',
        lineToLoadOpenP3: '',
      },
      dielectricWithstandClosed: {
        p1Ground: f.dielectricClosed?.p1Ground || '',
        p2Ground: f.dielectricClosed?.p2Ground || '',
        p3Ground: f.dielectricClosed?.p3Ground || '',
        units: f.dielectricClosed?.units || 'μA',
        result: '',
        testVoltage: '',
        testDuration: '1 Min.'
      },
      vacuumIntegrityOpen: {
        p1: f.dielectricOpen?.p1 || '',
        p2: f.dielectricOpen?.p2 || '',
        p3: f.dielectricOpen?.p3 || '',
        units: f.dielectricOpen?.units || 'μA',
        result: '',
        testVoltage: '',
        testDuration: '1 Min.'
      },
      testEquipment: {
        insulationResistanceTester: {
          model: f.megohmmeter || '',
          serial: f.megohmmeterSerial || '',
          id: f.megohmmeterAmpId || '',
        },
        microOhmmeter: {
          model: f.lro || f.lowResistanceOhmmeter || '',
          serial: f.lroSerial || '',
          id: f.lroAmpId || '',
        },
        hiPotTester: {
          model: f.hipot || '',
          serial: f.hipotSerial || '',
          id: f.hipotAmpId || '',
        },
      },
      comments: f.comments || '',
    };

    // Debug logging for visual mechanical inspection
    console.log('🔍 MediumVoltageCircuitBreakerImporter - Visual Mechanical Data:');
    console.log('  - vmRows found:', vmRows);
    console.log('  - visualMechanicalInspection prepared:', visualMechanicalInspection);
    console.log('  - formData.visualMechanicalInspection:', formData.visualMechanicalInspection);

    // Match component's save payload (report_data JSONB)
    const result = {
      job_id: jobId,
      user_id: userId,
      report_data: formData,
    };
    
    console.log('🔍 MediumVoltageCircuitBreakerImporter - Final result being returned:');
    console.log('  - result:', result);
    console.log('  - result.report_data.visualMechanicalInspection:', result.report_data.visualMechanicalInspection);
    
    return result;
  }

  protected getReportType(): string {
    return 'medium-voltage-circuit-breaker-report';
  }
}


