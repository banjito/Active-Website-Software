import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageSwitchImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'low_voltage_switch_reports';
  // Only require job_id and user_id; JSONB columns vary by environment
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`LowVoltageSwitch Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('lowvoltageswitch') || 
           data.reportType?.toLowerCase().includes('low-voltage-switch');
    console.log(`LowVoltageSwitch Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    // Normalize from provided JSON format into low_voltage_switch_reports columns
    const fields = (data as any)?.data?.fields || {};
    const sections = (data as any)?.sections || [];

    // Report Info
    const temperatureF = parseFloat(fields.temperatureF || fields.temperature || '0') || 0;
    const humidity = parseFloat(fields.humidity || '0') || 0;

    const report_info: any = {
      customer: fields.customer || '',
      address: fields.address || '',
      user: fields.user || '',
      date: fields.date || '',
      jobNumber: fields.jobNumber || '',
      technicians: fields.technicians || '',
      substation: fields.substation || '',
      eqptLocation: fields.eqptLocation || '',
      identifier: fields.identifier || '',
      temperature: temperatureF,
      humidity: humidity,
      manufacturer: fields.manufacturer || '',
      catalogNo: fields.catalogNo || '',
      serialNumber: fields.serialNumber || '',
      series: fields.series || '',
      type: fields.type || '',
      systemVoltage: fields.systemVoltage || '',
      ratedVoltage: fields.ratedVoltage || '',
      ratedCurrent: fields.ratedCurrent || '',
      aicRating: fields.aicRating || '',
      phaseConfiguration: fields.phaseConfiguration || ''
    };

    // Switch rows
    const switchRows = (fields.switchRows?.rows || []).map((r: any) => ({
      position: r.position || '',
      manufacturer: r.manufacturer || '',
      catalogNo: r.catalogNo || '',
      serialNo: r.serialNo || '',
      type: r.type || '',
      ratedAmperage: r.ratedAmperage || '',
      ratedVoltage: r.ratedVoltage || ''
    }));

    // Fuse rows
    const fuseRows = (fields.fuseRows?.rows || []).map((r: any) => ({
      position: r.position || '',
      manufacturer: r.manufacturer || '',
      catalogNo: r.catalogNo || '',
      class: r.class || r.fuseClass || '',
      amperage: r.amperage || '',
      aic: r.aic || '',
      voltage: r.voltage || ''
    }));

    // Visual & Mechanical Inspection (map array to id->result)
    let visualInspectionMap: Record<string, string> = {};
    const vmRows = fields['vm-table']?.rows || [];
    if (Array.isArray(vmRows) && vmRows.length) {
      visualInspectionMap = vmRows.reduce((acc: any, row: any) => {
        acc[row.id] = row.result || '';
        return acc;
      }, {} as Record<string, string>);
    } else {
      // Try sections fallback
      const vmSection = sections.find((s: any) => s.title?.toLowerCase().includes('visual'));
      if (vmSection?.fields?.[0]?.value?.rows) {
        visualInspectionMap = vmSection.fields[0].value.rows.reduce((acc: any, row: any) => {
          acc[row.id] = row.result || '';
          return acc;
        }, {} as Record<string, string>);
      }
    }

    // Insulation Resistance
    const ir = fields.switchIrTables || {};
    const insulation_resistance: any = {
      testVoltage: ir.testVoltage || '1000V',
      units: (ir.rows?.[0]?.units) || 'MΩ',
      poleToPole: {
        'P1-P2': ir.rows?.[0]?.p1p2 || '',
        'P2-P3': ir.rows?.[0]?.p2p3 || '',
        'P3-P1': ir.rows?.[0]?.p3p1 || ''
      },
      poleToFrame: {
        'P1': ir.rows?.[0]?.p1_frame || '',
        'P2': ir.rows?.[0]?.p2_frame || '',
        'P3': ir.rows?.[0]?.p3_frame || ''
      },
      lineToLoad: {
        'P1': ir.rows?.[0]?.p1_line_to_load || ir.rows?.[0]?.p1_line || '',
        'P2': ir.rows?.[0]?.p2_line_to_load || ir.rows?.[0]?.p2_line || '',
        'P3': ir.rows?.[0]?.p3_line_to_load || ir.rows?.[0]?.p3_line || ''
      }
    };

    // Contact Resistance (supports both nested-object and rows formats)
    let cr: any = fields.switchContactLV || {};
    if ((!cr || (!cr.rows && !cr.poleToPole)) && Array.isArray(sections)) {
      const crSection = sections.find((s: any) => typeof s?.title === 'string' && s.title.toLowerCase().includes('contact resistance'));
      if (crSection?.fields?.[0]?.value) {
        cr = crSection.fields[0].value;
      }
    }

    let contact_resistance: any;
    if (cr && cr.poleToPole && cr.poleToFrame && cr.lineToLoad) {
      // New nested-object structure
      contact_resistance = {
        units: cr.units || 'µΩ',
        poleToPole: {
          'P1-P2': cr.poleToPole?.p1p2 || '',
          'P2-P3': cr.poleToPole?.p2p3 || '',
          'P3-P1': cr.poleToPole?.p3p1 || ''
        },
        poleToFrame: {
          'P1': cr.poleToFrame?.p1 || '',
          'P2': cr.poleToFrame?.p2 || '',
          'P3': cr.poleToFrame?.p3 || ''
        },
        lineToLoad: {
          'P1': cr.lineToLoad?.p1 || '',
          'P2': cr.lineToLoad?.p2 || '',
          'P3': cr.lineToLoad?.p3 || ''
        },
        raw: cr
      };
    } else {
      // Legacy rows structure or vendor-specific keys
      const crRow = Array.isArray(cr?.rows) && cr.rows.length > 0 ? cr.rows[0] : {};
      contact_resistance = {
        units: crRow.units || cr.units || 'µΩ',
        poleToPole: {
          'P1-P2': crRow.p1p2 || '',
          'P2-P3': crRow.p2p3 || '',
          'P3-P1': crRow.p3p1 || ''
        },
        poleToFrame: {
          'P1': crRow.p1 || crRow.fu_p1 || '',
          'P2': crRow.p2 || crRow.fu_p2 || '',
          'P3': crRow.p3 || crRow.fu_p3 || ''
        },
        lineToLoad: {
          'P1': crRow.l1 || crRow.sw_p1 || '',
          'P2': crRow.l2 || crRow.sw_p2 || '',
          'P3': crRow.l3 || crRow.sw_p3 || ''
        },
        raw: crRow || cr || null
      };
    }

    // Test Equipment
    const test_equipment = {
      megohmmeter: {
        model: fields.megohmmeter || '',
        serialNumber: fields.megohmmeterSerial || '',
        ampId: fields.megohmmeterAmpId || ''
      },
      lowResistance: {
        model: fields.lro || '',
        serialNumber: fields.lroSerial || '',
        ampId: fields.lroAmpId || ''
      }
    };

    const comments = fields.comments || '';
    const status = 'PASS';

    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      report_info,
      switch_data: switchRows,
      fuse_data: fuseRows,
      visual_inspection: visualInspectionMap,
      insulation_resistance,
      contact_resistance,
      test_equipment,
      comments,
      status
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    // Must match the route slug used by the app router
    return 'low-voltage-switch-report';
  }
}
