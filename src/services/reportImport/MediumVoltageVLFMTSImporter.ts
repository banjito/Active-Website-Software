import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MediumVoltageVLFMTSImporter extends BaseImporter implements ReportImporter {
  // Plain VLF MTS form (no Tan Delta chart)
  // Component: MediumVoltageVLFMTSReport.tsx
  // Table: neta_ops.medium_voltage_vlf_mts_reports (data jsonb)
  protected tableName = 'medium_voltage_vlf_mts_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    const tRaw = (data.reportType || (data as any)?.data?.reportType || '');
    const t = tRaw.toLowerCase();
    return t.includes('mediumvoltagecablevlfmts')
      || t.includes('medium-voltage-cable-vlfmts')
      || t.includes('mediumvoltagecablevlfmtstestreport')
      || t.includes('medium-voltage-cable-vlf-mts')
      || t.includes('medium voltage cable vlf test with tan delta mts')
      || t.includes('medium_voltage_cable_vlf_test_with_tan_delta_mts');
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    const f: any = (data as any)?.data?.fields || {};
    const toNumber = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

    const normalizeResult = (val: any) => {
      const v = (val || '').toString().trim().toLowerCase();
      switch (v) {
        case 'satisfactory': return 'satisfactory';
        case 'unsatisfactory': return 'unsatisfactory';
        case 'cleaned': return 'cleaned';
        case 'see comments': return 'see comments';
        case 'none of the above': return 'none of the above';
        default: return 'select one';
      }
    };

    // Visual & Mechanical
    let vmRows: any[] = Array.isArray(f['vm-table']?.rows) ? f['vm-table'].rows : [];
    if ((!vmRows || vmRows.length === 0) && Array.isArray(data.sections)) {
      for (const s of data.sections) {
        const t = (s.title || '').toLowerCase();
        if (!t.includes('visual') || !t.includes('mechanical')) continue;
        for (const fld of s.fields || []) {
          if (fld.type === 'table' && Array.isArray(fld.value?.rows)) {
            vmRows = fld.value.rows;
            break;
          }
        }
        if (vmRows && vmRows.length) break;
      }
    }
    // Map to component's expected keys
    const visualInspection = {
      // Component fields:
      // inspectCablesAndConnectors, inspectTerminationsAndSplices, useOhmmeter,
      // inspectShieldGrounding, verifyBendRadius, inspectCurrentTransformers, comments
      inspectCablesAndConnectors: normalizeResult(vmRows.find((r: any) => r.id === '7.3.3.A.1')?.result),
      inspectTerminationsAndSplices: normalizeResult(vmRows.find((r: any) => r.id === '7.3.3.A.2')?.result),
      useOhmmeter: normalizeResult(vmRows.find((r: any) => r.id === '7.3.3.A.3.1')?.result),
      inspectShieldGrounding: normalizeResult(vmRows.find((r: any) => r.id === '7.3.3.A.4')?.result),
      verifyBendRadius: normalizeResult(vmRows.find((r: any) => r.id === '7.3.3.A.5')?.result),
      inspectCurrentTransformers: normalizeResult(vmRows.find((r: any) => r.id === '7.3.3.A.7' || r.id === '7.3.3.A.8')?.result),
      comments: ''
    } as const;

    // Shield continuity
    const sc = f.mvShieldContinuity || {};
    const shieldContinuity = {
      phaseA: sc.phaseA ?? sc.a ?? '',
      phaseB: sc.phaseB ?? sc.b ?? '',
      phaseC: sc.phaseC ?? sc.c ?? '',
      unit: sc.unit || 'Ω'
    };

    // Insulation pre/post
    const ir = f.mvIrPrePost || {};
    const insulationTest = {
      testVoltage: (ir.testVoltage ?? '1000').toString(),
      unit: ir.unit || 'GΩ',
      preTest: { ag: ir.pre?.ag || '', bg: ir.pre?.bg || '', cg: ir.pre?.cg || '' },
      postTest: { ag: ir.post?.ag || '', bg: ir.post?.bg || '', cg: ir.post?.cg || '' },
      preTestCorrected: { ag: '', bg: '', cg: '' },
      postTestCorrected: { ag: '', bg: '', cg: '' }
    };

    // Withstand readings
    const ws = f.vlfWithstand || {};
    const withstandTest = {
      readings: (Array.isArray(ws.readings) ? ws.readings : []).map((r: any) => ({
        timeMinutes: (r.timeMinutes ?? '').toString(),
        kVAC: (r.kVAC ?? '').toString(),
        phaseA: { currentUnit: r.phaseA?.currentUnit || 'mA', mA: r.phaseA?.mA || '', nF: r.phaseA?.nF || '' },
        phaseB: { currentUnit: r.phaseB?.currentUnit || 'mA', mA: r.phaseB?.mA || '', nF: r.phaseB?.nF || '' },
        phaseC: { currentUnit: r.phaseC?.currentUnit || 'mA', mA: r.phaseC?.mA || '', nF: r.phaseC?.nF || '' }
      }))
    };

    const temperature = {
      fahrenheit: toNumber(f.temperatureF ?? 68),
      celsius: Math.round(((toNumber(f.temperatureF ?? 68) - 32) * 5) / 9),
      humidity: toNumber(f.humidity ?? 0),
      tcf: 1.0
    };

    const equipment = (() => {
      const te = f.testEquipment3 || {};
      return {
        ohmmeter: te.lowResistanceOhmmeter?.name || (te.lowResistanceOhmmeter?.serialNumber ? 'Low Resistance Ohmmeter' : ''),
        ohmSerialNumber: te.lowResistanceOhmmeter?.serialNumber || '',
        megohmmeter: te.megohmmeter?.name || (te.megohmmeter?.serialNumber ? 'Megohmmeter' : ''),
        megohmSerialNumber: te.megohmmeter?.serialNumber || '',
        vlfHipot: te.primaryInjectionTestSet?.name || (te.primaryInjectionTestSet?.serialNumber ? 'VLF Hipot' : ''),
        vlfSerialNumber: te.primaryInjectionTestSet?.serialNumber || '',
        ampId: te.primaryInjectionTestSet?.ampId || '',
        vlfTestSet: te.primaryInjectionTestSet?.name || ''
      };
    })();

    // Tan Delta data (needed by MediumVoltageCableVLFTest.jsx as formData.tanDeltaTest)
    const tanDeltaFromFields = f.mvTanDelta || f.tanDelta || f.tandelta;
    let tanDeltaTest: any = undefined;
    if (tanDeltaFromFields && typeof tanDeltaFromFields === 'object') {
      tanDeltaTest = {
        systemVoltageL2G: (tanDeltaFromFields.systemVoltageL2G ?? '').toString() || '14.4',
        values: Array.isArray(tanDeltaFromFields.values) ? tanDeltaFromFields.values : [],
        result: (f.tanDeltaResult || '').toString().toUpperCase() || 'PASS'
      };
    } else if (Array.isArray((data as any)?.sections)) {
      // Fallback: read from sections titled like Tan Delta (Power Factor) Test
      for (const s of (data as any).sections) {
        const title = (s.title || '').toLowerCase();
        if (title.includes('tan delta')) {
          const fld = (s.fields || []).find((x: any) => (x.label || '').toLowerCase().includes('tan delta'));
          const val = fld?.value;
          if (val && typeof val === 'object') {
            tanDeltaTest = {
              systemVoltageL2G: (val.systemVoltageL2G ?? '').toString() || '14.4',
              values: Array.isArray(val.values) ? val.values : [],
              result: (f.tanDeltaResult || '').toString().toUpperCase() || 'PASS'
            };
          }
          break;
        }
      }
    }

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

    const techniciansArray: string[] = f.technicians
      ? (Array.isArray(f.technicians) ? f.technicians : (f.technicians || '').split(',').map((s: string) => s.trim()).filter(Boolean))
      : [];

    const techniciansString: string = techniciansArray.join(', ');

    const formData: any = {
      reportInfo: {
        title: 'MEDIUM VOLTAGE CABLE VLF TEST REPORT MTS',
        date: f.date || '',
        location: f.substation || '',
        technicians: techniciansArray,
        reportNumber: '',
        customerName: f.customer || '',
        customerContactName: '',
        customerContactEmail: '',
        customerContactPhone: ''
      },
      status: 'PASS',
      customerName: f.customer || '',
      siteAddress: f.address || '',
      jobNumber: f.jobNumber || '',
      identifier: f.identifier || '',
      testedBy: techniciansString,
      testDate: f.date || '',
      location: f.substation || '',
      equipmentLocation: f.eqptLocation || '',
      cableType: f.cableType || '',
      operatingVoltage: f.cableRatedVoltage || '',
      cableLength: f.lengthFt || '',
      cableInfo,
      terminationData,
      visualInspection,
      shieldContinuity,
      insulationTest,
      equipment,
      temperature,
      withstandTest,
      comments: f.comments || '',
      ...(tanDeltaTest ? { tanDeltaTest } : {})
    };

    return {
      job_id: jobId,
      user_id: userId,
      data: formData
    };
  }

  protected getReportType(_data?: ReportData): string {
    // Route to the plain VLF MTS form (no Tan Delta chart)
    return 'medium-voltage-vlf-mts-report';
  }
}


