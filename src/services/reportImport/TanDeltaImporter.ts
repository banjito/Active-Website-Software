import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class TanDeltaImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'tandelta_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_info', 'test_data'];

  canImport(data: ReportData): boolean {
    const t = (data.reportType || (data as any)?.data?.reportType || '').toLowerCase();
    const canImport = t.includes('tandeltaats')
      || t.includes('tan-delta-ats')
      || t.includes('tandelta-ats')
      || t.includes('tandeltachartmts')
      || t.includes('tan-delta-chart-mts')
      || t.includes('tandelta-mts');
    
    console.log(`🔍 TanDeltaImporter.canImport - reportType: "${data.reportType}", data.reportType: "${(data as any)?.data?.reportType}", normalized: "${t}", result: ${canImport}`);
    
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    // Store the report type for routing decisions
    (this as any).lastReportType = data.reportType || (data as any)?.data?.reportType || '';
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    console.log('🔍 TanDeltaImporter - Starting data preparation');
    console.log('🔍 Input data structure:', data);
    
    let reportData: any = {};
    
    // Extract data from sections if available
    if (data.sections) {
      console.log('🔍 Processing sections data:', data.sections);
      
      data.sections.forEach(section => {
        console.log(`🔍 Processing section: ${section.title}`);
        
        if (section.title === 'Tan Delta Test Data' || section.title === 'Tan Delta Test') {
          if (section.fields[0]?.value) {
            const tdData = section.fields[0].value;
            reportData.systemVoltageL2G = tdData.systemVoltageL2G || '14.4';
            reportData.tanDeltaValues = tdData.values || [];
          }
        }
        
        if (section.title === 'Comments') {
          if (section.fields[0]?.value) {
            reportData.comments = section.fields[0].value || '';
          }
        }
      });
    }
    
    // Extract test equipment from sections
    if (data.sections) {
      const testEquipmentSection = data.sections.find((section: any) => 
        section.title === 'Test Equipment Used'
      );
      
      if (testEquipmentSection && testEquipmentSection.fields && testEquipmentSection.fields.length > 0) {
        const testEquipmentField = testEquipmentSection.fields[0];
        if (testEquipmentField.value) {
          console.log('🔍 Found test equipment data:', testEquipmentField.value);
          reportData.testEquipment = {
            megohmmeter: testEquipmentField.value.megohmmeter?.name || '',
            lowResistanceOhmmeter: testEquipmentField.value.lowResistanceOhmmeter?.name || '',
            primaryInjectionTestSet: testEquipmentField.value.primaryInjectionTestSet?.name || ''
          };
        }
      }
    }
    
    // Fallback to data.fields if sections not found or incomplete
    if (data.data && data.data.fields) {
      console.log('🔍 Processing fallback data.fields:', data.data.fields);
      const fields = data.data.fields;
      
      // Only fill in missing data
      if (!reportData.systemVoltageL2G && fields.mvTanDelta?.systemVoltageL2G) {
        reportData.systemVoltageL2G = fields.mvTanDelta.systemVoltageL2G;
      }
      if (!reportData.tanDeltaValues && fields.mvTanDelta?.values) {
        reportData.tanDeltaValues = fields.mvTanDelta.values;
      }
      // Only use fallback test equipment if we didn't get it from sections
      if (!reportData.testEquipment && fields.testEquipment3) {
        reportData.testEquipment = {
          megohmmeter: fields.testEquipment3.megohmmeter?.name || '',
          lowResistanceOhmmeter: fields.testEquipment3.lowResistanceOhmmeter?.name || '',
          primaryInjectionTestSet: fields.testEquipment3.primaryInjectionTestSet?.name || ''
        };
      }
    }
    
    // Transform tan delta values to match component's expected format
    const transformedPoints = (reportData.tanDeltaValues || []).map((point: any) => ({
      voltageLabel: point.voltageStep || '',
      kV: parseFloat(point.kV) || 0,
      phaseA: parseFloat(point.phaseA?.td) || 0,
      phaseAStdDev: parseFloat(point.phaseA?.stdDev) || null,
      phaseB: parseFloat(point.phaseB?.td) || 0,
      phaseBStdDev: parseFloat(point.phaseB?.stdDev) || null,
      phaseC: parseFloat(point.phaseC?.td) || 0,
      phaseCStdDev: parseFloat(point.phaseC?.stdDev) || null
    }));
    
    // Set default values if no data found
    if (transformedPoints.length === 0) {
      transformedPoints.push(
        { voltageLabel: '0.5 Uo', kV: 7.2, phaseA: 0, phaseAStdDev: null, phaseB: 0, phaseBStdDev: null, phaseC: 0, phaseCStdDev: null },
        { voltageLabel: '1.0 Uo', kV: 14.4, phaseA: 0, phaseAStdDev: null, phaseB: 0, phaseBStdDev: null, phaseC: 0, phaseCStdDev: null },
        { voltageLabel: '1.5 Uo', kV: 21.6, phaseA: 0, phaseAStdDev: null, phaseB: 0, phaseBStdDev: null, phaseC: 0, phaseCStdDev: null },
        { voltageLabel: '2.0 Uo', kV: 28.8, phaseA: 0, phaseAStdDev: null, phaseB: 0, phaseBStdDev: null, phaseC: 0, phaseCStdDev: null }
      );
    }
    
    console.log('🔍 Final processed report data:', reportData);
    console.log('🔍 Transformed tan delta points:', transformedPoints);
    console.log('🔍 Comments extracted:', reportData.comments);
    console.log('🔍 Test equipment extracted:', reportData.testEquipment);

    // Structure the data according to the component's expected format
    const dataToInsert = {
      job_id: jobId,
      user_id: userId,
      report_info: {
        title: '4-Medium Voltage Cable VLF Tan Delta Test MTS',
        date: new Date().toISOString().split('T')[0], // Today's date as default
        location: 'Location Not Specified',
        technicians: ['Technician Not Specified'],
        reportNumber: '',
        customerName: 'Customer Not Specified',
        customerContactName: '',
        customerContactEmail: '',
        customerContactPhone: '',
        status: 'PASS',
        identifier: reportData.identifier || 'UNSET',
        cableType: 'Cable Type Not Specified',
        operatingVoltage: reportData.systemVoltageL2G || '14.4',
        systemVoltage: reportData.systemVoltageL2G || '14.4',
        comments: reportData.comments || '',
        testEquipment: {
          megohmeterSerial: reportData.testEquipment?.megohmmeter || '',
          megohmmeterAmpId: '', // Not provided in JSON, will be empty
          vlfHipotSerial: reportData.testEquipment?.primaryInjectionTestSet || '',
          vlfHipotAmpId: '' // Not provided in JSON, will be empty
        }
      },
      test_data: {
        points: transformedPoints,
        systemVoltageL2G: reportData.systemVoltageL2G || '14.4',
        frequency: '0.1'
      }
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    // Check if this is an MTS or ATS report
    const reportType = (this as any).lastReportType || '';
    if (reportType.toLowerCase().includes('mts')) {
      return 'medium-voltage-vlf-tan-delta-mts'; // routes to MTS chart component
    } else {
      return 'medium-voltage-vlf-tan-delta'; // routes to ATS chart component
    }
  }
}

