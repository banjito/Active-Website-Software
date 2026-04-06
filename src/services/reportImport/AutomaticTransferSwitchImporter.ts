import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class AutomaticTransferSwitchImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'automatic_transfer_switch_ats_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`AutomaticTransferSwitch Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('automatictransferswitch') || 
           data.reportType?.toLowerCase().includes('automatic-transfer-switch');
    console.log(`AutomaticTransferSwitch Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const reportData: any = {
      // Job Information
      customerName: '',
      customerLocation: '',
      userName: '',
      date: '',
      identifier: '',
      jobNumber: '',
      technicians: '',
      temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50 },
      substation: '',
      eqptLocation: '',
      status: 'PASS',

      // Nameplate Data
      nameplateManufacturer: '',
      nameplateModelType: '',
      nameplateCatalogNo: '',
      nameplateSerialNumber: '',
      nameplateSystemVoltage: '',
      nameplateRatedVoltage: '',
      nameplateRatedCurrent: '',
      nameplateSCCR: '',

      // Visual and Mechanical Inspection
      visualInspectionItems: [] as Array<{ netaSection: string; description: string; result: string }>,

      // Electrical Tests
      insulationTestVoltage: '1000V',
      insulationResistance: {
        poleToPoleNormalClosed: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        poleToPoleEmergencyClosed: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        poleToNeutralNormalClosed: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        poleToNeutralEmergencyClosed: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        poleToGroundNormalClosed: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        poleToGroundEmergencyClosed: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        lineToLoadNormalOpen: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' },
        lineToLoadEmergencyOpen: { p1Reading: '', p1Corrected: '', p2Reading: '', p2Corrected: '', p3Reading: '', p3Corrected: '', neutralReading: '', neutralCorrected: '', units: 'MΩ' }
      },

      contactResistance: {
        normal: { p1: '', p2: '', p3: '', neutral: '', units: 'µΩ' },
        emergency: { p1: '', p2: '', p3: '', neutral: '', units: 'µΩ' }
      },

      // Test Equipment Used
      testEquipmentUsed: {
        megohmmeter: { name: '', serialNumber: '', ampId: '' },
        lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' }
      },

      comments: ''
    };

    const toNumber = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;
    const setTempFromF = (f: any) => {
      const fahrenheit = toNumber(f);
      const celsius = Math.round((fahrenheit - 32) * 5 / 9);
      reportData.temperature = { ...reportData.temperature, fahrenheit, celsius };
    };

    // Prefer sections
    if (data.sections && data.sections.length) {
      data.sections.forEach(section => {
        const title = section.title;
        if (title === 'Job Information') {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('customer')) reportData.customerName = field.value;
            else if (L.includes('user')) reportData.userName = field.value;
            else if (L.includes('date')) reportData.date = field.value;
            else if (L.includes('identifier')) reportData.identifier = field.value;
            else if (L.includes('job')) reportData.jobNumber = field.value;
            else if (L.includes('technicians')) reportData.technicians = field.value;
            else if (L.includes('substation')) reportData.substation = field.value;
            else if (L.includes('eqpt') || L.includes('location')) reportData.eqptLocation = field.value;
            else if (L.includes('temp')) setTempFromF(field.value);
            else if (L.includes('humidity')) reportData.temperature.humidity = toNumber(field.value);
          });
        } else if (title === 'Nameplate Data') {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('manufacturer')) reportData.nameplateManufacturer = field.value;
            else if (L.includes('model') || L.includes('type')) reportData.nameplateModelType = field.value;
            else if (L.includes('catalog')) reportData.nameplateCatalogNo = field.value;
            else if (L.includes('serial')) reportData.nameplateSerialNumber = field.value;
            else if (L.includes('system voltage')) reportData.nameplateSystemVoltage = field.value;
            else if (L.includes('rated voltage')) reportData.nameplateRatedVoltage = field.value;
            else if (L.includes('rated current')) reportData.nameplateRatedCurrent = field.value;
            else if (L.includes('sccr')) reportData.nameplateSCCR = field.value;
          });
        } else if (title === 'Visual and Mechanical Inspection') {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value?.rows) {
              reportData.visualInspectionItems = field.value.rows.map((r: any) => ({
                netaSection: r.id || '', description: r.description || '', result: r.result || 'Select One'
              }));
            }
          });
        } else if (title === 'Electrical Tests - Insulation Resistance') {
          section.fields.forEach(field => {
            if (field.label.includes('Insulation Resistance Grid') && field.value?.rows) {
              reportData.insulationTestVoltage = field.value.testVoltage || '1000V';
              
              field.value.rows.forEach((row: any) => {
                const id = row.id || '';
                const mapRow = (r: any) => ({
                  p1Reading: r.p1 || '', p1Corrected: r.p1c || '',
                  p2Reading: r.p2 || '', p2Corrected: r.p2c || '',
                  p3Reading: r.p3 || '', p3Corrected: r.p3c || '',
                  neutralReading: r.neutral || '', neutralCorrected: r.neutralc || '',
                  units: r.units || 'MΩ'
                });
                if (id.includes('Pole to Pole (Normal Closed)')) reportData.insulationResistance.poleToPoleNormalClosed = mapRow(row);
                else if (id.includes('Pole to Pole (Emergency Closed)')) reportData.insulationResistance.poleToPoleEmergencyClosed = mapRow(row);
                else if (id.includes('Pole to Neutral (Normal Closed)')) reportData.insulationResistance.poleToNeutralNormalClosed = mapRow(row);
                else if (id.includes('Pole to Neutral (Emergency Closed)')) reportData.insulationResistance.poleToNeutralEmergencyClosed = mapRow(row);
                else if (id.includes('Pole to Ground (Normal Closed)')) reportData.insulationResistance.poleToGroundNormalClosed = mapRow(row);
                else if (id.includes('Pole to Ground (Emergency Closed)')) reportData.insulationResistance.poleToGroundEmergencyClosed = mapRow(row);
                else if (id.includes('Line to Load (Normal Open)')) reportData.insulationResistance.lineToLoadNormalOpen = mapRow(row);
                else if (id.includes('Line to Load (Emergency Open)')) reportData.insulationResistance.lineToLoadEmergencyOpen = mapRow(row);
              });
            }
          });
        } else if (title === 'Electrical Tests - Contact/Pole Resistance') {
          section.fields.forEach(field => {
            if (field.label.includes('Contact/Pole Resistance') && field.value?.rows) {
              field.value.rows.forEach((row: any) => {
                if (row.state === 'Normal') {
                  reportData.contactResistance.normal = {
                    p1: row.p1 || '', p2: row.p2 || '', p3: row.p3 || '', neutral: row.neutral || '', units: row.units || 'µΩ'
                  };
                } else if (row.state === 'Emergency') {
                  reportData.contactResistance.emergency = {
                    p1: row.p1 || '', p2: row.p2 || '', p3: row.p3 || '', neutral: row.neutral || '', units: row.units || 'µΩ'
                  };
                }
              });
            }
          });
        } else if (title === 'Test Equipment Used') {
          let current = '';
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('megohmmeter')) { current = 'meg'; reportData.testEquipmentUsed.megohmmeter.name = field.value; }
            else if (L.includes('low resistance ohmmeter')) { current = 'lro'; reportData.testEquipmentUsed.lowResistanceOhmmeter.name = field.value; }
            else if (L.includes('serial number')) {
              if (current === 'meg') reportData.testEquipmentUsed.megohmmeter.serialNumber = field.value;
              else if (current === 'lro') reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = field.value;
            } else if (L.includes('amp id')) {
              if (current === 'meg') reportData.testEquipmentUsed.megohmmeter.ampId = field.value;
              else if (current === 'lro') reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = field.value;
            }
          });
        } else if (title === 'Comments') {
          section.fields.forEach(field => {
            if (field.type === 'text' || field.type === 'textarea') reportData.comments = field.value || '';
          });
        }
      });
    }

    // Fallback to data.fields
    if (data.data && data.data.fields) {
      const f: any = data.data.fields;
      if (!reportData.customerName) reportData.customerName = f.customer || '';
      if (!reportData.userName) reportData.userName = f.user || '';
      if (!reportData.date) reportData.date = f.date || '';
      if (!reportData.identifier) reportData.identifier = f.identifier || '';
      if (!reportData.jobNumber) reportData.jobNumber = f.jobNumber || '';
      if (!reportData.technicians) reportData.technicians = f.technicians || '';
      if (!reportData.substation) reportData.substation = f.substation || '';
      if (!reportData.eqptLocation) reportData.eqptLocation = f.eqptLocation || '';
      if (reportData.temperature.fahrenheit === 68 && f.temperatureF) setTempFromF(f.temperatureF);
      if (reportData.temperature.humidity === 50 && f.humidity) reportData.temperature.humidity = toNumber(f.humidity);

      // Nameplate
      if (!reportData.nameplateManufacturer) reportData.nameplateManufacturer = f.manufacturer || '';
      if (!reportData.nameplateModelType) reportData.nameplateModelType = f.modelType || '';
      if (!reportData.nameplateCatalogNo) reportData.nameplateCatalogNo = f.catalogNo || '';
      if (!reportData.nameplateSerialNumber) reportData.nameplateSerialNumber = f.serialNumber || '';
      if (!reportData.nameplateSystemVoltage) reportData.nameplateSystemVoltage = f.systemVoltage || '';
      if (!reportData.nameplateRatedVoltage) reportData.nameplateRatedVoltage = f.ratedVoltage || '';
      if (!reportData.nameplateRatedCurrent) reportData.nameplateRatedCurrent = f.ratedCurrent || '';
      if (!reportData.nameplateSCCR) reportData.nameplateSCCR = f.sccr || '';

      // Visual table
      if (!reportData.visualInspectionItems.length && f['vm-table']?.rows) {
        reportData.visualInspectionItems = f['vm-table'].rows.map((r: any) => ({
          netaSection: r.id || '', description: r.description || '', result: r.result || 'Select One'
        }));
      }

      // Insulation
      if (f.atsInsulation?.rows) {
        reportData.insulationTestVoltage = f.atsInsulation.testVoltage || '1000V';
        f.atsInsulation.rows.forEach((row: any) => {
          const id = row.id || '';
          const mapRow = (r: any) => ({
            p1Reading: r.p1 || '', p1Corrected: r.p1c || '',
            p2Reading: r.p2 || '', p2Corrected: r.p2c || '',
            p3Reading: r.p3 || '', p3Corrected: r.p3c || '',
            neutralReading: r.neutral || '', neutralCorrected: r.neutralc || '',
            units: r.units || 'MΩ'
          });
          if (id.includes('Pole to Pole (Normal Closed)')) reportData.insulationResistance.poleToPoleNormalClosed = mapRow(row);
          else if (id.includes('Pole to Pole (Emergency Closed)')) reportData.insulationResistance.poleToPoleEmergencyClosed = mapRow(row);
          else if (id.includes('Pole to Neutral (Normal Closed)')) reportData.insulationResistance.poleToNeutralNormalClosed = mapRow(row);
          else if (id.includes('Pole to Neutral (Emergency Closed)')) reportData.insulationResistance.poleToNeutralEmergencyClosed = mapRow(row);
          else if (id.includes('Pole to Ground (Normal Closed)')) reportData.insulationResistance.poleToGroundNormalClosed = mapRow(row);
          else if (id.includes('Pole to Ground (Emergency Closed)')) reportData.insulationResistance.poleToGroundEmergencyClosed = mapRow(row);
          else if (id.includes('Line to Load (Normal Open)')) reportData.insulationResistance.lineToLoadNormalOpen = mapRow(row);
          else if (id.includes('Line to Load (Emergency Open)')) reportData.insulationResistance.lineToLoadEmergencyOpen = mapRow(row);
        });
      }

      // Contact resistance
      if (f.atsContactResistance?.rows) {
        f.atsContactResistance.rows.forEach((row: any) => {
          if (row.state === 'Normal') {
            reportData.contactResistance.normal = {
              p1: row.p1 || '', p2: row.p2 || '', p3: row.p3 || '', neutral: row.neutral || '', units: row.units || 'µΩ'
            };
          } else if (row.state === 'Emergency') {
            reportData.contactResistance.emergency = {
              p1: row.p1 || '', p2: row.p2 || '', p3: row.p3 || '', neutral: row.neutral || '', units: row.units || 'µΩ'
            };
          }
        });
      }

      // Equipment
      if (f.megohmmeter) reportData.testEquipmentUsed.megohmmeter.name = f.megohmmeter;
      if (f.megohmmeterSerial) reportData.testEquipmentUsed.megohmmeter.serialNumber = f.megohmmeterSerial;
      if (f.megohmmeterAmpId) reportData.testEquipmentUsed.megohmmeter.ampId = f.megohmmeterAmpId;
      if (f.lro) reportData.testEquipmentUsed.lowResistanceOhmmeter.name = f.lro;
      if (f.lroSerial) reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = f.lroSerial;
      if (f.lroAmpId) reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = f.lroAmpId;

      if (!reportData.comments) reportData.comments = f.comments || '';
    }

    // Decide storage strategy based on detected schema
    const hasDataColumn = schema.jsonbColumns?.includes('data');

    if (hasDataColumn) {
      return {
        job_id: jobId,
        user_id: userId,
        data: {
          ...reportData
        }
      };
    }

    // Default to split columns expected by the table/table variant
    return {
      job_id: jobId,
      user_id: userId,
      report_info: {
        customerName: reportData.customerName,
        customerLocation: reportData.customerLocation,
        userName: reportData.userName,
        date: reportData.date,
        identifier: reportData.identifier,
        jobNumber: reportData.jobNumber,
        technicians: reportData.technicians,
        temperature: reportData.temperature,
        substation: reportData.substation,
        eqptLocation: reportData.eqptLocation,
        status: reportData.status,
        insulationTestVoltage: reportData.insulationTestVoltage,
        nameplateManufacturer: reportData.nameplateManufacturer,
        nameplateModelType: reportData.nameplateModelType,
        nameplateCatalogNo: reportData.nameplateCatalogNo,
        nameplateSerialNumber: reportData.nameplateSerialNumber,
        nameplateSystemVoltage: reportData.nameplateSystemVoltage,
        nameplateRatedVoltage: reportData.nameplateRatedVoltage,
        nameplateRatedCurrent: reportData.nameplateRatedCurrent,
        nameplateSCCR: reportData.nameplateSCCR,
        // Inline test equipment when dedicated column is missing
        testEquipmentUsed: reportData.testEquipmentUsed
      },
      visual_inspection_items: reportData.visualInspectionItems,
      insulation_resistance: reportData.insulationResistance,
      contact_resistance: reportData.contactResistance,
      // No test_equipment_used column; comments still supported
      comments: reportData.comments
    };
  }

  protected getReportType(): string {
    return 'automatic-transfer-switch-ats-report';
  }
}
