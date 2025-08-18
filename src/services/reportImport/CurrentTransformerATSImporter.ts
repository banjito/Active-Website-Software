import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class CurrentTransformerATSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'current_transformer_test_ats_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_info', 'nameplate_data', 'visual_mechanical_inspection', 'electrical_tests', 'test_equipment', 'comments'];
  private routeSlug: string = 'current-transformer-test-ats-report';

  canImport(data: ReportData): boolean {
    console.log(`CurrentTransformer ATS Importer checking: ${data.reportType}`);
    const type = (data.reportType || data.data?.reportType || '').toLowerCase();
    const isCT = type.includes('currenttransformer') || type.includes('current-transformer');
    const isATS = type.includes('atsreport') || type.includes('ats-report') || type.includes('ats');
    const canImport = isCT && isATS;
    console.log(`CurrentTransformer ATS Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    const rt = data.reportType || data.data?.reportType || '';
    if (/^12-.*current.*transformer.*ats/i.test(rt)) {
      this.routeSlug = '12-current-transformer-test-ats-report';
    } else {
      this.routeSlug = 'current-transformer-test-ats-report';
    }
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const reportInfo: any = {};
    const nameplateData: any = {};
    const visualMechanicalInspection: any[] = [];
    const electricalTests: any = {};
    const testEquipment: any = {};
    let comments = '';

    const isBaseATS = this.routeSlug === 'current-transformer-test-ats-report';

    // Initialize defaults
    if (!isBaseATS) {
      electricalTests.ratioPolarity = [
        { id: '1', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' },
        { id: '2', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' },
        { id: '3', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' },
        { id: '4', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' }
      ];
      electricalTests.primaryWindingInsulation = { testVoltage: '1000V', readingPhase1: '', readingPhase2: '', readingPhase3: '', readingNeutral: '', units: 'MΩ', tempCorrection20CPhase1: '', tempCorrection20CPhase2: '', tempCorrection20CPhase3: '', tempCorrection20CNeutral: '' };
      electricalTests.secondaryWindingInsulation = { testVoltage: '1000V', readingPhase1: '', readingPhase2: '', readingPhase3: '', readingNeutral: '', units: 'MΩ', tempCorrection20CPhase1: '', tempCorrection20CPhase2: '', tempCorrection20CPhase3: '', tempCorrection20CNeutral: '' };
    }

    // Sections first
    if (data.sections && data.sections.length > 0) {
      data.sections.forEach(section => {
        const title = section.title.toLowerCase();
        if (title.includes('job information') || title.includes('job info')) {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('customer')) reportInfo.customerName = field.value;
            else if (L.includes('address')) reportInfo.customerAddress = field.value;
            else if (L.includes('user')) reportInfo.userName = field.value;
            else if (L.includes('date')) reportInfo.date = field.value;
            else if (L.includes('job')) reportInfo.jobNumber = field.value;
            else if (L.includes('technicians')) reportInfo.technicians = field.value;
            else if (L.includes('substation')) reportInfo.substation = field.value;
            else if (L.includes('eqpt') || L.includes('location')) reportInfo.eqptLocation = field.value;
            else if (L.includes('identifier')) reportInfo.identifier = field.value;
            else if (L.includes('temp')) {
              const f = parseFloat(field.value) || 68;
              reportInfo.temperature = { fahrenheit: f, celsius: Math.round((f - 32) * 5/9), tcf: 1, humidity: reportInfo.temperature?.humidity ?? 0 };
            } else if (L.includes('humidity')) {
              reportInfo.temperature = { ...(reportInfo.temperature || { fahrenheit: 68, celsius: 20, tcf: 1 }), humidity: parseFloat(field.value) || 0 };
            }
          });
        } else if (title.includes('device') || title.includes('nameplate')) {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('manufacturer')) nameplateData.manufacturer = field.value;
            else if (L === 'class') nameplateData.deviceClass = field.value;
            else if (L.includes('ct ratio') || L === 'ct ratio') nameplateData.ctRatio = field.value;
            else if (L.includes('serial')) nameplateData.serialNumber = field.value;
            else if (L.includes('catalog')) nameplateData.catalogNumber = field.value;
            else if (L.includes('voltage rating')) nameplateData.voltageRating = field.value;
            else if (L.includes('polarity')) nameplateData.polarityFacing = field.value;
            else if (L === 'type') nameplateData.deviceType = field.value;
            else if (L.includes('frequency')) nameplateData.frequency = field.value;
          });
        } else if (section.title === 'Visual and Mechanical Inspection') {
          visualMechanicalInspection.length = 0;
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value?.rows) {
              field.value.rows.forEach((row: any) => {
                visualMechanicalInspection.push({ netaSection: row.id || '', description: row.description || '', result: row.result || 'Select One' });
              });
            }
          });
        } else if (title.startsWith('electrical tests')) {
          section.fields.forEach(field => {
            const fl = field.label.toLowerCase();
            if (isBaseATS) {
              // Map to component shape
              if (fl.includes('primary winding') && field.value) {
                electricalTests.primaryWinding = {
                  testVoltage: field.value.testVoltage || '1000V',
                  results: '',
                  units: 'MΩ',
                  reading: field.value.readingPhase1 || '',
                  tempCorrection20C: field.value.tempCorrection20CPhase1 || ''
                };
              } else if (fl.includes('secondary winding') && field.value) {
                electricalTests.secondaryWinding = {
                  testVoltage: field.value.testVoltage || '1000V',
                  results: '',
                  units: 'MΩ',
                  reading: field.value.readingPhase1 || '',
                  tempCorrection20C: field.value.tempCorrection20CPhase1 || ''
                };
              }
            } else {
              // 12-variant structure
              if (fl.includes('ratio') && fl.includes('polarity') && field.type === 'table' && field.value?.rows) {
                electricalTests.ratioPolarity = field.value.rows.map((row: any, idx: number) => ({
                  id: row.id || `rp-${idx}`, identifier: row.identifier || '', ratio: row.ratio || '', testType: field.value.testType || 'voltage', testValue: row.testValue || '', pri: row.pri || '', sec: row.sec || '', measuredRatio: row.measuredRatio || '', ratioDev: row.ratioDev || '', polarity: row.polarity || 'Select One'
                }));
              } else if (fl.includes('primary') && fl.includes('winding') && field.value) {
                electricalTests.primaryWindingInsulation = { ...electricalTests.primaryWindingInsulation, ...field.value };
              } else if (fl.includes('secondary') && fl.includes('winding') && field.value) {
                electricalTests.secondaryWindingInsulation = { ...electricalTests.secondaryWindingInsulation, ...field.value };
              }
            }
          });
        } else if (title === 'test equipment used') {
          let current: 'meg' | null = null;
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('megohmmeter')) { current = 'meg'; if (isBaseATS) testEquipment.megohmmeter = field.value; else testEquipment.megohmmeterName = field.value; }
            else if (L.includes('serial')) { if (current === 'meg') (isBaseATS ? testEquipment.megohmmeterSerial = field.value : testEquipment.megohmmeterSerial = field.value); }
            else if (L.includes('amp') || L.includes('id')) { if (current === 'meg') (isBaseATS ? testEquipment.megohmmeterAmpId = field.value : testEquipment.megohmmeterAmpId = field.value); }
          });
        } else if (title === 'comments') {
          section.fields.forEach(field => { if (field.type === 'text' || field.type === 'textarea') comments = field.value || ''; });
        }
      });
    }

    // Fallback to data.fields
    if (data.data && data.data.fields) {
      const f: any = data.data.fields;
      reportInfo.customerName = reportInfo.customerName || f.customer || f.customerName || '';
      reportInfo.customerAddress = reportInfo.customerAddress || f.address || f.customerAddress || '';
      reportInfo.userName = reportInfo.userName || f.user || f.userName || '';
      reportInfo.date = reportInfo.date || f.date || '';
      reportInfo.jobNumber = reportInfo.jobNumber || f.jobNumber || '';
      reportInfo.technicians = reportInfo.technicians || f.technicians || '';
      reportInfo.substation = reportInfo.substation || f.substation || '';
      reportInfo.eqptLocation = reportInfo.eqptLocation || f.eqptLocation || '';
      reportInfo.identifier = reportInfo.identifier || f.identifier || '';
      if (!reportInfo.temperature && (f.temperatureF || f.humidity)) {
        const tf = parseFloat(f.temperatureF || '68') || 68;
        reportInfo.temperature = { fahrenheit: tf, celsius: Math.round((tf - 32) * 5/9), tcf: 1, humidity: parseFloat(f.humidity || '0') || 0 };
      }

      if (Object.keys(nameplateData).length === 0) {
        nameplateData.manufacturer = f.manufacturer || '';
        nameplateData.deviceClass = f.class || '';
        nameplateData.ctRatio = f.ctRatio || '';
        nameplateData.serialNumber = f.serialNumber || '';
        nameplateData.catalogNumber = f.catalogNumber || '';
        nameplateData.voltageRating = f.voltageRating || '';
        nameplateData.polarityFacing = f.polarityFacing || '';
        nameplateData.deviceType = f.type || '';
        nameplateData.frequency = f.frequency || '';
      }

      if (visualMechanicalInspection.length === 0 && f['vm-table']?.rows) {
        f['vm-table'].rows.forEach((row: any) => visualMechanicalInspection.push({ netaSection: row.id || '', description: row.description || '', result: row.result || 'Select One' }));
      }

      if (isBaseATS) {
        if (!electricalTests.primaryWinding && f.primaryInsulation) {
          const v = f.primaryInsulation;
          electricalTests.primaryWinding = { testVoltage: v.testVoltage || '1000V', results: '', units: 'MΩ', reading: v.readingPhase1 || '', tempCorrection20C: v.tempCorrection20CPhase1 || '' };
        }
        if (!electricalTests.secondaryWinding && f.secondaryInsulation) {
          const v = f.secondaryInsulation;
          electricalTests.secondaryWinding = { testVoltage: v.testVoltage || '1000V', results: '', units: 'MΩ', reading: v.readingPhase1 || '', tempCorrection20C: v.tempCorrection20CPhase1 || '' };
        }
        if (Object.keys(testEquipment).length === 0) {
          if (f.megohmmeter) testEquipment.megohmmeter = f.megohmmeter;
          if (f.megohmmeterSerial) testEquipment.megohmmeterSerial = f.megohmmeterSerial;
          if (f.megohmmeterAmpId || f.ampId) testEquipment.megohmmeterAmpId = f.megohmmeterAmpId || f.ampId;
        }
      }

      if (!comments) comments = f.comments || '';
    }

    // Build final payload depending on variant
    if (isBaseATS) {
      const payload: any = {
        job_id: jobId,
        user_id: userId,
        report_info: reportInfo,
        nameplate_data: nameplateData,
        visual_mechanical_inspection: { items: visualMechanicalInspection },
        electrical_tests: {
          primaryWinding: electricalTests.primaryWinding || { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' },
          secondaryWinding: electricalTests.secondaryWinding || { testVoltage: '1000V', results: '', units: 'MΩ', reading: '', tempCorrection20C: '' }
        },
        test_equipment: {
          megohmmeter: testEquipment.megohmmeter || '',
          megohmmeterSerial: testEquipment.megohmmeterSerial || '',
          megohmmeterAmpId: testEquipment.megohmmeterAmpId || ''
        },
        comments
      };
      return payload;
    }

    // 12-variant payload
    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      report_info: reportInfo,
      nameplate_data: nameplateData,
      visual_mechanical_inspection: visualMechanicalInspection,
      electrical_tests: {
        ...electricalTests,
        ctIdentification: {
          phase1: nameplateData.phase1 || '',
          phase1Serial: nameplateData.phase1Serial || '',
          phase2: nameplateData.phase2 || '',
          phase2Serial: nameplateData.phase2Serial || '',
          phase3: nameplateData.phase3 || '',
          phase3Serial: nameplateData.phase3Serial || '',
          neutral: nameplateData.neutral || '',
          neutralSerial: nameplateData.neutralSerial || ''
        }
      },
      test_equipment: testEquipment,
      comments: comments
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    return this.routeSlug;
  }
}
