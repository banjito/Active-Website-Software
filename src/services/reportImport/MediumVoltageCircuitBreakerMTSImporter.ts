import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MediumVoltageCircuitBreakerMTSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'medium_voltage_circuit_breaker_mts_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`MediumVoltageCircuitBreakerMTS Importer checking: ${data.reportType}`);
    const t = (data.reportType || (data as any)?.data?.reportType || '').toLowerCase();
    const canImport = t.includes('mediumvoltagecircuitbreakermts') || t.includes('medium-voltage-circuit-breaker-mts');
    console.log(`MediumVoltageCircuitBreakerMTS Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    console.log('🔍 MediumVoltageCircuitBreakerMTSImporter - Starting prepareData');
    console.log('🔍 Input data structure:', data);
    console.log('🔍 Sections:', (data as any)?.sections);
    
    const f: any = (data as any)?.data?.fields || {};
    const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

    // Temperature conversion and correction factor lookup table
    const tcfTable: { [key: string]: number } = {
      '-24': 0.054, '-23': 0.068, '-22': 0.082, '-21': 0.096, '-20': 0.11,
      '-19': 0.124, '-18': 0.138, '-17': 0.152, '-16': 0.166, '-15': 0.18,
      '-14': 0.194, '-13': 0.208, '-12': 0.222, '-11': 0.236, '-10': 0.25,
      '-9': 0.264, '-8': 0.278, '-7': 0.292, '-6': 0.306, '-5': 0.32,
      '-4': 0.336, '-3': 0.352, '-2': 0.368, '-1': 0.384, '0': 0.4,
      '1': 0.42, '2': 0.44, '3': 0.46, '4': 0.48, '5': 0.5,
      '6': 0.526, '7': 0.552, '8': 0.578, '9': 0.604, '10': 0.63,
      '11': 0.666, '12': 0.702, '13': 0.738, '14': 0.774, '15': 0.81,
      '16': 0.848, '17': 0.886, '18': 0.924, '19': 0.962, '20': 1,
      '21': 1.05, '22': 1.1, '23': 1.15, '24': 1.2, '25': 1.25,
      '26': 1.316, '27': 1.382, '28': 1.448, '29': 1.514, '30': 1.58,
      '31': 1.664, '32': 1.748, '33': 1.832, '34': 1.872, '35': 2,
      '36': 2.1, '37': 2.2, '38': 2.3, '39': 2.4, '40': 2.5,
      '41': 2.628, '42': 2.756, '43': 2.884, '44': 3.012, '45': 3.15,
      '46': 3.316, '47': 3.482, '48': 3.648, '49': 3.814, '50': 3.98,
      '51': 4.184, '52': 4.388, '53': 4.592, '54': 4.796, '55': 5,
      '56': 5.26, '57': 5.52, '58': 5.78, '59': 6.04, '60': 6.3,
      '61': 6.62, '62': 6.94, '63': 7.26, '64': 7.58, '65': 7.9,
      '66': 8.32, '67': 8.74, '68': 9.16, '69': 9.58, '70': 10,
      '71': 10.52, '72': 11.04, '73': 11.56, '74': 12.08, '75': 12.6,
      '76': 13.24, '77': 13.88, '78': 14.52, '79': 15.16, '80': 15.8,
      '81': 16.64, '82': 17.48, '83': 18.32, '84': 19.16, '85': 20,
      '86': 21.04, '87': 22.08, '88': 23.12, '89': 24.16, '90': 25.2,
      '91': 26.44, '92': 27.68, '93': 28.92, '94': 30.16, '95': 31.4,
      '96': 32.84, '97': 34.28, '98': 35.72, '99': 37.16, '100': 38.6,
      '101': 40.26, '102': 41.92, '103': 43.58, '104': 45.24, '105': 46.9,
      '106': 48.78, '107': 50.66, '108': 52.54, '109': 54.42, '110': 56.3,
      '111': 58.4, '112': 60.5, '113': 62.6, '114': 64.7, '115': 66.8,
      '116': 69.12, '117': 71.44, '118': 73.76, '119': 76.08, '120': 78.4,
      '121': 80.94, '122': 83.48, '123': 86.02, '124': 88.56, '125': 91.1,
      '126': 93.86, '127': 96.62, '128': 99.38, '129': 102.14, '130': 104.9,
      '131': 107.88, '132': 110.86, '133': 113.84, '134': 116.82, '135': 119.8,
      '136': 123, '137': 126.2, '138': 129.4, '139': 132.6, '140': 135.8,
      '141': 139.24, '142': 142.68, '143': 146.12, '144': 149.56, '145': 153,
      '146': 156.66, '147': 160.32, '148': 163.98, '149': 167.64, '150': 171.3
    };

    const getTCF = (celsius: number): number => {
      const key = celsius.toString();
      return tcfTable[key] || 1.0;
    };

    const calculateCorrectedValue = (value: string, tcf: number): string => {
      if (value && !isNaN(parseFloat(value))) {
        return (parseFloat(value) * tcf).toFixed(2);
      }
      return value; // Keep non-numeric values as is
    };

    const fahrenheit = toNum(f.temperatureF ?? 68);
    const celsius = Math.round(((fahrenheit - 32) * 5) / 9);
    const tcf = getTCF(celsius);
    
    console.log(`🔍 Temperature correction: ${fahrenheit}°F = ${celsius}°C, TCF = ${tcf}`);
    
    const temperature = {
      fahrenheit,
      celsius,
      tcf,
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
      '7.6.3.A.8','7.6.3.A.9','7.6.3.A.10','7.6.3.A.11.1','7.6.3.A.12','7.6.3.A.13','7.6.3.A.14','7.6.3.A.15'
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
      asFound: { p1: f.breakerCrFound?.p1 || '', p2: f.breakerCrFound?.p2 || '', p3: f.breakerCrFound?.p3 || '', units: 'μΩ' },
      asLeft: { p1: f.breakerCrLeft?.p1 || '', p2: f.breakerCrLeft?.p2 || '', p3: f.breakerCrLeft?.p3 || '', units: 'μΩ' },
    };

    const contIns = f.contactorInsulation || {};
    const irRows: any[] = Array.isArray(contIns.rows) ? contIns.rows : [];
    const irMeasured = {
      testVoltage: contIns.testVoltage || '1000V',
      poleToPoleUnits: 'MΩ',
      poleToFrameUnits: 'MΩ',
      lineToLoadUnits: 'MΩ',
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
        irMeasured.poleToPoleClosedP1P2 = r.p1 || '';
        irMeasured.poleToPoleClosedP2P3 = r.p2 || '';
        irMeasured.poleToPoleClosedP3P1 = r.p3 || '';
      } else if (id.includes('pole to frame')) {
        irMeasured.poleToFrameClosedP1 = r.p1 || '';
        irMeasured.poleToFrameClosedP2 = r.p2 || '';
        irMeasured.poleToFrameClosedP3 = r.p3 || '';
      } else if (id.includes('line to load')) {
        irMeasured.lineToLoadOpenP1 = r.p1 || '';
        irMeasured.lineToLoadOpenP2 = r.p2 || '';
        irMeasured.lineToLoadOpenP3 = r.p3 || '';
      }
    }

    // Dielectric Withstand (support both old and new JSON keys)
    const closedSrc = f.dielectricClosed || f.dielectricWithstandClosed || {};
    const openSrc = f.dielectricOpen || f.vacuumBottleIntegrity || {};
    const dielectricWithstand = {
      closed: {
        testVoltage: closedSrc.testVoltage || '',
        testDuration: closedSrc.testDuration || '1 Min.',
        p1Ground: closedSrc.p1Ground || '',
        p2Ground: closedSrc.p2Ground || '',
        p3Ground: closedSrc.p3Ground || '',
        units: closedSrc.units || 'μA',
      },
      open: {
        testVoltage: openSrc.testVoltage || '',
        testDuration: openSrc.testDuration || '1 Min.',
        p1: openSrc.p1 || '',
        p2: openSrc.p2 || '',
        p3: openSrc.p3 || '',
        units: openSrc.units || 'μA',
      },
    };

    const testEquipment = {
      megohmmeter: { model: f.megohmmeter || '', serialNumber: f.megohmmeterSerial || '', ampId: f.megohmmeterAmpId || '' },
      lowResistanceOhmmeter: { model: f.lro || f.lowResistanceOhmmeter || '', serialNumber: f.lroSerial || '', ampId: f.lroAmpId || '' },
      hipot: { model: f.hipot || '', serialNumber: f.hipotSerial || '', ampId: f.hipotAmpId || '' },
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
      insulationResistanceMeasured: irMeasured,
      insulationResistanceCorrected: (() => {
        const corrected = {
          poleToPoleClosedP1P2: calculateCorrectedValue(irMeasured.poleToPoleClosedP1P2, tcf),
          poleToPoleClosedP2P3: calculateCorrectedValue(irMeasured.poleToPoleClosedP2P3, tcf),
          poleToPoleClosedP3P1: calculateCorrectedValue(irMeasured.poleToPoleClosedP3P1, tcf),
          poleToFrameClosedP1: calculateCorrectedValue(irMeasured.poleToFrameClosedP1, tcf),
          poleToFrameClosedP2: calculateCorrectedValue(irMeasured.poleToFrameClosedP2, tcf),
          poleToFrameClosedP3: calculateCorrectedValue(irMeasured.poleToFrameClosedP3, tcf),
          lineToLoadOpenP1: calculateCorrectedValue(irMeasured.lineToLoadOpenP1, tcf),
          lineToLoadOpenP2: calculateCorrectedValue(irMeasured.lineToLoadOpenP2, tcf),
          lineToLoadOpenP3: calculateCorrectedValue(irMeasured.lineToLoadOpenP3, tcf),
        };
        console.log('🔍 Temperature-corrected insulation resistance values:', corrected);
        return corrected;
      })(),
      dielectricWithstand,
      testEquipment,
      comments: f.comments || '',
    };

    // Debug logging for visual mechanical inspection
    console.log('🔍 MediumVoltageCircuitBreakerMTSImporter - Visual Mechanical Data:');
    console.log('  - vmRows found:', vmRows);
    console.log('  - visualMechanicalInspection prepared:', visualMechanicalInspection);
    console.log('  - formData.visualMechanicalInspection:', formData.visualMechanicalInspection);

    // Match component's save payload (report_data JSONB)
    const result = {
      job_id: jobId,
      user_id: userId,
      report_data: formData,
    };
    
    console.log('🔍 MediumVoltageCircuitBreakerMTSImporter - Final result being returned:');
    console.log('  - result:', result);
    console.log('  - result.report_data.visualMechanicalInspection:', result.report_data.visualMechanicalInspection);
    
    return result;
  }

  protected getReportType(): string {
    return 'medium-voltage-circuit-breaker-mts-report';
  }
}
