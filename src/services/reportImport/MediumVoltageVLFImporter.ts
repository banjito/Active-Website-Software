import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MediumVoltageVLFImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'medium_voltage_vlf_reports';
  // Table uses split JSONB columns; don't require a generic data column
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`MediumVoltageVLF Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('mediumvoltagevlf') || 
           data.reportType?.toLowerCase().includes('medium-voltage-vlf');
    console.log(`MediumVoltageVLF Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    const f: any = (data as any)?.data?.fields || {};
    const toNumber = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

    // Visual inspection mapping by id → component keys
    const visualInspection = (() => {
      const normalize = (val: any) => {
        const v = (val || '').toString().trim().toLowerCase();
        switch (v) {
          case 'satisfactory': return 'satisfactory';
          case 'unsatisfactory': return 'unsatisfactory';
          case 'cleaned': return 'cleaned';
          case 'see comments': return 'see comments';
          case 'none of the above': return 'none of the above';
          case 'select one':
          default: return 'select one';
        }
      };
      const defaultVI: any = {
        compareData: 'select one',
        inspectDamage: 'select one',
        useOhmmeter: 'select one',
        inspectConnectors: 'select one',
        inspectGrounding: 'select one',
        verifyBends: 'select one',
        inspectCurrentTransformers: 'select one',
        inspectIdentification: 'select one',
        inspectJacket: 'select one'
      };
      let rows: any[] = Array.isArray(f['vm-table']?.rows) ? f['vm-table'].rows : [];
      if ((!rows || rows.length === 0) && Array.isArray(data.sections)) {
        for (const s of data.sections) {
          const t = (s.title || '').toLowerCase();
          if (!t.includes('visual') || !t.includes('mechanical')) continue;
          for (const fld of s.fields || []) {
            const lbl = (fld.label || '').toLowerCase();
            if (fld.type === 'table' && lbl.includes('visual') && Array.isArray(fld.value?.rows)) {
              rows = fld.value.rows;
              break;
            }
          }
          if (rows && rows.length) break;
        }
      }
      for (const r of rows || []) {
        switch (r.id) {
          case '7.3.3.A.1': defaultVI.compareData = normalize(r.result) || defaultVI.compareData; break;
          case '7.3.3.A.2': defaultVI.inspectDamage = normalize(r.result) || defaultVI.inspectDamage; break;
          case '7.3.3.A.3.1': defaultVI.useOhmmeter = normalize(r.result) || defaultVI.useOhmmeter; break;
          case '7.3.3.A.4': defaultVI.inspectConnectors = normalize(r.result) || defaultVI.inspectConnectors; break;
          case '7.3.3.A.5': defaultVI.inspectGrounding = normalize(r.result) || defaultVI.inspectGrounding; break;
          case '7.3.3.A.6': defaultVI.verifyBends = normalize(r.result) || defaultVI.verifyBends; break;
          case '7.3.3.A.8': defaultVI.inspectCurrentTransformers = normalize(r.result) || defaultVI.inspectCurrentTransformers; break;
          case '7.3.3.A.9': defaultVI.inspectIdentification = normalize(r.result) || defaultVI.inspectIdentification; break;
          case '7.3.3.A.10': defaultVI.inspectJacket = normalize(r.result) || defaultVI.inspectJacket; break;
        }
      }
      return defaultVI;
    })();

    const shieldContinuity = (() => {
      const sc = f.mvShieldContinuity || {};
      return {
        phaseA: sc.phaseA ?? sc.a ?? '',
        phaseB: sc.phaseB ?? sc.b ?? '',
        phaseC: sc.phaseC ?? sc.c ?? '',
        unit: sc.unit || 'Ω'
      };
    })();

    const insulationTest = (() => {
      const src = f.mvIrPrePost || {};
      return {
        testVoltage: (src.testVoltage ?? '1000').toString(),
        unit: src.unit || 'GΩ',
        preTest: { ag: src.pre?.ag || '', bg: src.pre?.bg || '', cg: src.pre?.cg || '' },
        postTest: { ag: src.post?.ag || '', bg: src.post?.bg || '', cg: src.post?.cg || '' },
        preTestCorrected: { ag: '', bg: '', cg: '' },
        postTestCorrected: { ag: '', bg: '', cg: '' }
      };
    })();

    const withstandTest = (() => {
      const src = f.vlfWithstand || {};
      const readings = Array.isArray(src.readings) ? src.readings : [];
      return { readings: readings.map((r: any) => ({
        timeMinutes: (r.timeMinutes ?? '').toString(),
        kVAC: (r.kVAC ?? '').toString(),
        phaseA: { currentUnit: r.phaseA?.currentUnit || 'mA', mA: r.phaseA?.mA || '' },
        phaseB: { currentUnit: r.phaseB?.currentUnit || 'mA', mA: r.phaseB?.mA || '' },
        phaseC: { currentUnit: r.phaseC?.currentUnit || 'mA', mA: r.phaseC?.mA || '' }
      })) };
    })();

    const equipment = (() => {
      const te = f.testEquipment3 || {};
      return {
        ohmmeter: te.lowResistanceOhmmeter?.makeModel || te.lowResistanceOhmmeter?.name || (te.lowResistanceOhmmeter?.serialNumber ? 'Low Resistance Ohmmeter' : ''),
        ohmSerialNumber: te.lowResistanceOhmmeter?.serialNumber || '',
        megohmmeter: te.megohmmeter?.makeModel || te.megohmmeter?.name || (te.megohmmeter?.serialNumber ? 'Megohmmeter' : ''),
        megohmSerialNumber: te.megohmmeter?.serialNumber || '',
        vlfHipot: te.primaryInjectionTestSet?.makeModel || te.primaryInjectionTestSet?.name || (te.primaryInjectionTestSet?.serialNumber ? 'VLF Hipot' : ''),
        vlfSerialNumber: te.primaryInjectionTestSet?.serialNumber || '',
        ampId: te.primaryInjectionTestSet?.ampId || '',
        vlfTestSet: te.primaryInjectionTestSet?.makeModel || te.primaryInjectionTestSet?.name || ''
      };
    })();

    const temperature = {
      fahrenheit: toNumber(f.temperatureF ?? 68),
      celsius: Math.round(((toNumber(f.temperatureF ?? 68) - 32) * 5) / 9),
      humidity: toNumber(f.humidity ?? 0),
      tcf: 1.0
    };

    const cableInfo = {
      description: '',
      size: f.conductorSize || '',
      length: f.lengthFt || '',
      voltageRating: f.cableRatedVoltage || '',
      insulation: f.insulationType || '',
      yearInstalled: '',
      testedFrom: f.testedFrom || '',
      testedTo: '',
      from: f.from || '',
      to: f.to || '',
      manufacturer: f.manufacturer || '',
      insulationThickness: f.insulationThickness || '',
      conductorMaterial: f.conductorMaterial || ''
    };

    const terminationData = {
      terminationData: f.terminationData1 || '',
      ratedVoltage: f.terminationRatedVoltage1 || '',
      terminationData2: f.terminationData2 || '',
      ratedVoltage2: f.terminationRatedVoltage2 || '',
      from: f.from || '',
      to: f.to || ''
    };

    const report_info: any = {
      title: '',
      date: f.date || '',
      testDate: f.date || '',
      location: f.substation || '',
      equipmentLocation: f.eqptLocation || '',
      technicians: f.technicians ? (Array.isArray(f.technicians) ? f.technicians : (f.technicians || '').split(',').map((s: string) => s.trim()).filter(Boolean)) : [],
      testedBy: Array.isArray(f.technicians)
        ? (f.technicians as string[]).join(', ')
        : (f.technicians || ''),
      reportNumber: '',
      customerName: f.customer || '',
      siteAddress: f.address || '',
      customerContactName: '',
      customerContactEmail: '',
      customerContactPhone: '',
      jobNumber: f.jobNumber || '',
      identifier: f.identifier || '',
      // Also surface common cable fields at top-level for component bindings
      cableType: f.cableType || '',
      operatingVoltage: f.cableRatedVoltage || '',
      cableLength: f.lengthFt || '',
      status: 'PASS',
      cableInfo,
      terminationData,
      visualInspection,
      shieldContinuity,
      insulationTest,
      equipment,
      temperature,
      withstandTest,
      comments: f.comments || ''
    };

    // Build final payload matching component expectations
    return {
      job_id: jobId,
      user_id: userId,
      report_info,
      cable_info: cableInfo,
      termination_data: terminationData,
      visual_inspection: visualInspection,
      shield_continuity: shieldContinuity,
      insulation_test: insulationTest,
      equipment,
      temperature,
      withstand_test: withstandTest,
      comments: f.comments || '',
      status: 'PASS'
    };
  }

  protected getReportType(data?: ReportData): string {
    const t = (data?.reportType || (data as any)?.data?.reportType || '').toLowerCase();
    if (t.includes('mts')) return 'medium-voltage-vlf-mts-report';
    return 'medium-voltage-vlf';
  }
}


