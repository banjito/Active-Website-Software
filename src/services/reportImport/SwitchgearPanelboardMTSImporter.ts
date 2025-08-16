import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class SwitchgearPanelboardMTSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'switchgear_panelboard_mts_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_data'];

  // Temperature correction factor lookup table
  private TCF_TABLE: { [key: string]: number } = {
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
    '91': 26.45, '92': 27.7, '93': 28.95, '94': 30.2, '95': 31.6,
    '96': 33.28, '97': 34.96, '98': 36.64, '99': 38.32, '100': 40,
    '101': 42.08, '102': 44.16, '103': 46.24, '104': 48.32, '105': 50.4,
    '106': 52.96, '107': 55.52, '108': 58.08, '109': 60.64, '110': 63.2
  };

  private getTCF(celsius: number): number {
    const roundedCelsius = Math.round(celsius);
    return this.TCF_TABLE[roundedCelsius.toString()] ?? 1;
  }

  canImport(data: ReportData): boolean {
    console.log(`🔍 SwitchgearPanelboardMTS Importer checking: ${data.reportType}`);
    const reportType = data.reportType || (data as any)?.data?.reportType || '';
    const canImport = reportType.toLowerCase().includes('switchgearpanelboardmts') || 
           reportType.toLowerCase().includes('switchgear-panelboard-mts') ||
           reportType.toLowerCase().includes('switchgear_panelboard_mts');
    console.log(`🔍 SwitchgearPanelboardMTS Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    console.log('🔍 SwitchgearPanelboardMTSImporter - Starting data preparation');
    console.log('🔍 Input data structure:', data);
    
    let reportData: any = {};
    
    // Extract data from sections if available
    if (data.sections) {
      console.log('🔍 Processing sections data:', data.sections);
      
      data.sections.forEach(section => {
        console.log(`🔍 Processing section: ${section.title}`);
        
        if (section.title === 'Job Information') {
          section.fields.forEach(field => {
            if (field.label === 'Customer') reportData.customerName = field.value;
            if (field.label === 'Job #') reportData.jobNumber = field.value;
            if (field.label === 'Technicians') reportData.technicians = field.value;
            if (field.label === 'Date') reportData.date = field.value;
            if (field.label === 'Identifier') reportData.identifier = field.value;
            if (field.label === 'Temp. °F') reportData.temperature = { fahrenheit: parseFloat(field.value) || 68, celsius: 20, tcf: 1, humidity: 50 };
            if (field.label === 'Substation') reportData.substation = field.value;
            if (field.label === 'Eqpt. Location') reportData.eqptLocation = field.value;
            if (field.label === 'User') reportData.userName = field.value;
            if (field.label === 'Humidity %') {
              if (reportData.temperature) {
                reportData.temperature.humidity = parseFloat(field.value) || 50;
              } else {
                reportData.temperature = { fahrenheit: 68, celsius: 20, tcf: 1, humidity: parseFloat(field.value) || 50 };
              }
            }
          });
          
          // Set default customer location since it's not in the JSON but expected by component
          reportData.customerLocation = 'Address not specified';
        }
        
        if (section.title === 'Nameplate Data') {
          reportData.nameplate = {};
          section.fields.forEach(field => {
            if (field.label === 'Manufacturer') reportData.nameplate.manufacturer = field.value;
            if (field.label === 'Catalog Number') reportData.nameplate.catalogNumber = field.value;
            if (field.label === 'Serial Number') reportData.nameplate.serialNumber = field.value;
            if (field.label === 'Series') reportData.nameplate.series = field.value;
            if (field.label === 'Type') reportData.nameplate.type = field.value;
            if (field.label === 'System Voltage') reportData.nameplate.systemVoltage = field.value;
            if (field.label === 'Rated Voltage') reportData.nameplate.ratedVoltage = field.value;
            if (field.label === 'Rated Current') reportData.nameplate.ratedCurrent = field.value;
            if (field.label === 'AIC Rating') reportData.nameplate.aicRating = field.value;
            if (field.label === 'Phase Configuration') reportData.nameplate.phaseConfiguration = field.value;
          });
        }
        
        if (section.title === 'Visual and Mechanical Inspection') {
          if (section.fields[0]?.value?.rows) {
            reportData.visualInspectionItems = section.fields[0].value.rows.map((row: any) => ({
              id: row.id,
              description: row.description,
              result: row.result || 'Select One'
            }));
          }
        }
        
        if (section.title === 'Electrical Tests - Measured Insulation Resistance Values') {
          if (section.fields[0]?.value?.rows) {
            reportData.measuredInsulationResistance = section.fields[0].value.rows.map((row: any) => ({
              busSection: row.bus,
              ag: row.ag || '',
              bg: row.bg || '',
              cg: row.cg || '',
              ab: row.ab || '',
              bc: row.bc || '',
              ca: row.ca || '',
              an: row.an || '',
              bn: row.bn || '',
              cn: row.cn || ''
            }));
            reportData.insulationResistanceUnit = section.fields[0].value.rows[0]?.unit || 'MΩ';
          }
        }
        
        if (section.title === 'Temperature Corrected Values') {
          if (section.fields[0]?.value?.rows) {
            reportData.tempCorrectedInsulationResistance = section.fields[0].value.rows.map((row: any) => ({
              busSection: row.bus,
              ag: row.ag || '',
              bg: row.bg || '',
              cg: row.cg || '',
              ab: row.ab || '',
              bc: row.bc || '',
              ca: row.ca || '',
              an: row.an || '',
              bn: row.bn || '',
              cn: row.cn || ''
            }));
          }
        }
        
        if (section.title === 'Contact Resistance') {
          if (section.fields[0]?.value?.rows) {
            reportData.contactResistanceTests = section.fields[0].value.rows.map((row: any) => ({
              busSection: row.bus,
              aPhase: row.a || '',
              bPhase: row.b || '',
              cPhase: row.c || '',
              neutral: row.neutral || '',
              ground: ''
            }));
            reportData.contactResistanceUnit = section.fields[0].value.rows[0]?.unit || 'µΩ';
          }
        }
        
        if (section.title === 'Dielectric Withstand') {
          if (section.fields[0]?.value?.rows) {
            reportData.dielectricWithstandTests = section.fields[0].value.rows.map((row: any) => ({
              busSection: row.bus,
              ag: row.ag || '',
              bg: row.bg || '',
              cg: row.cg || ''
            }));
            reportData.dielectricWithstandUnit = section.fields[0].value.rows[0]?.unit || 'µA';
          }
        }
        
        if (section.title === 'Test Equipment Used') {
          if (section.fields[0]?.value) {
            const te = section.fields[0].value;
            reportData.testEquipment = {
              megohmmeter: { 
                name: te.megohmmeter?.name || '', 
                serialNumber: '', 
                ampId: '' 
              },
              lowResistanceOhmmeter: { 
                name: te.lowResistanceOhmmeter?.name || '', 
                serialNumber: '', 
                ampId: '' 
              },
              hipot: { 
                name: te.primaryInjectionTestSet?.name || '', 
                serialNumber: '', 
                ampId: '' 
              }
            };
          }
        }
        
        if (section.title === 'Comments') {
          if (section.fields[0]?.value) {
            reportData.comments = section.fields[0].value;
          }
        }
      });
    }
    
    // Fallback to data.fields if sections not found or incomplete
    if (data.data && data.data.fields) {
      console.log('🔍 Processing fallback data.fields:', data.data.fields);
      const fields = data.data.fields;
      
      // Only fill in missing data
      if (!reportData.customerName) reportData.customerName = fields.customer || '';
      if (!reportData.jobNumber) reportData.jobNumber = fields.jobNumber || '';
      if (!reportData.technicians) reportData.technicians = fields.technicians || '';
      if (!reportData.date) reportData.date = fields.date || '';
      if (!reportData.identifier) reportData.identifier = fields.identifier || '';
      if (!reportData.substation) reportData.substation = fields.substation || '';
      if (!reportData.eqptLocation) reportData.eqptLocation = fields.eqptLocation || '';
      if (!reportData.userName) reportData.userName = fields.user || '';
      
      // Set default customer location since it's not in the JSON but expected by component
      if (!reportData.customerLocation) reportData.customerLocation = 'Address not specified';
      
      // Temperature and humidity
      if (!reportData.temperature) {
        const tempF = parseFloat(fields.temperatureF || fields.temperature || '68');
        const tempC = Math.round((tempF - 32) * 5 / 9);
        const tcf = this.getTCF(tempC);
        reportData.temperature = {
          fahrenheit: tempF,
          celsius: tempC,
          tcf: tcf,
          humidity: parseFloat(fields.humidity || '50')
        };
      }
      
      // Nameplate data
      if (!reportData.nameplate) {
        reportData.nameplate = {
          manufacturer: fields.manufacturer || '',
          catalogNumber: fields.catalogNumber || '',
          serialNumber: fields.serialNumber || '',
          series: fields.series || '',
          type: fields.type || '',
          systemVoltage: fields.systemVoltage || '',
          ratedVoltage: fields.ratedVoltage || '',
          ratedCurrent: fields.ratedCurrent || '',
          aicRating: fields.aicRating || '',
          phaseConfiguration: fields.phaseConfiguration || ''
        };
      }
      
      // Visual inspection items
      if (!reportData.visualInspectionItems && fields['vm-table']?.rows) {
        reportData.visualInspectionItems = fields['vm-table'].rows.map((row: any) => ({
          id: row.id,
          description: row.description,
          result: row.result || 'Select One'
        }));
      }
      
      // Insulation resistance data
      if (!reportData.measuredInsulationResistance && fields.insulationMeasured?.rows) {
        reportData.measuredInsulationResistance = fields.insulationMeasured.rows.map((row: any) => ({
          busSection: row.bus,
          ag: row.ag || '',
          bg: row.bg || '',
          cg: row.cg || '',
          ab: row.ab || '',
          bc: row.bc || '',
          ca: row.ca || '',
          an: row.an || '',
          bn: row.bn || '',
          cn: row.cn || ''
        }));
        reportData.insulationResistanceUnit = fields.insulationMeasured.rows[0]?.unit || 'MΩ';
      }
      
      // Temperature corrected insulation resistance
      if (!reportData.tempCorrectedInsulationResistance && fields.insulationCorrected?.rows) {
        reportData.tempCorrectedInsulationResistance = fields.insulationCorrected.rows.map((row: any) => ({
          busSection: row.bus,
          ag: row.ag || '',
          bg: row.bg || '',
          cg: row.cg || '',
          ab: row.ab || '',
          bc: row.bc || '',
          ca: row.ca || '',
          an: row.an || '',
          bn: row.bn || '',
          cn: row.cn || ''
        }));
      }
      
      // Contact resistance data
      if (!reportData.contactResistanceTests && fields.switchgearContact?.rows) {
        reportData.contactResistanceTests = fields.switchgearContact.rows.map((row: any) => ({
          busSection: row.bus,
          aPhase: row.a || '',
          bPhase: row.b || '',
          cPhase: row.c || '',
          neutral: row.neutral || '',
          ground: ''
        }));
        reportData.contactResistanceUnit = fields.switchgearContact.rows[0]?.unit || 'µΩ';
      }
      
      // Dielectric withstand data
      if (!reportData.dielectricWithstandTests && fields.switchgearDielectric?.rows) {
        reportData.dielectricWithstandTests = fields.switchgearDielectric.rows.map((row: any) => ({
          busSection: row.bus,
          ag: row.ag || '',
          bg: row.bg || '',
          cg: row.cg || ''
        }));
        reportData.dielectricWithstandUnit = fields.switchgearDielectric.rows[0]?.unit || 'µA';
      }
      
      // Test equipment
      if (!reportData.testEquipment && fields.testEquipment3) {
        reportData.testEquipment = {
          megohmmeter: { 
            name: fields.testEquipment3.megohmmeter?.name || '', 
            serialNumber: '', 
            ampId: '' 
          },
          lowResistanceOhmmeter: { 
            name: fields.testEquipment3.lowResistanceOhmmeter?.name || '', 
            serialNumber: '', 
            ampId: '' 
          },
          hipot: { 
            name: fields.testEquipment3.primaryInjectionTestSet?.name || '', 
            serialNumber: '', 
            ampId: '' 
          }
        };
      }
      
      // Comments
      if (!reportData.comments) reportData.comments = fields.comments || '';
      
      // Add missing test voltage fields that the component expects
      if (!reportData.insulationResistanceTestVoltage) reportData.insulationResistanceTestVoltage = '500V';
      if (!reportData.dielectricWithstandTestVoltage) reportData.dielectricWithstandTestVoltage = '2.2 kVAC';
    }
    
    // Set default status
    if (!reportData.status) reportData.status = 'PASS';
    
    // Ensure all required arrays are present
    if (!reportData.visualInspectionItems) {
      reportData.visualInspectionItems = [
        { id: '7.1.A.1', description: 'Inspect physical, electrical, and mechanical condition.', result: 'Select One' },
        { id: '7.1.A.2', description: 'Inspect anchorage, alignment, grounding, and required area clearances.', result: 'Select One' },
        { id: '7.1.A.3', description: 'Prior to cleaning the unit, perform as-found tests.', result: 'Select One' },
        { id: '7.1.A.4', description: 'Clean the unit.', result: 'Select One' },
        { id: '7.1.A.5', description: 'Verify that fuse and/or circuit breaker sizes and types correspond to drawings and coordination study as well as to the circuit breaker address for microprocessorcommunication packages.', result: 'Select One' },
        { id: '7.1.A.6', description: 'Verify that current and voltage transformer ratios correspond to drawings.', result: 'Select One' },
        { id: '7.1.A.7', description: 'Verify that wiring connections are tight and that wiring is secure to prevent damage during routine operation of moving parts.', result: 'Select One' },
        { id: '7.1.A.8.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.1.B.1.', result: 'Select One' },
        { id: '7.1.A.9', description: 'Confirm correct operation and sequencing of electrical and mechanical interlock systems.', result: 'Select One' },
        { id: '7.1.A.10', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: 'Select One' },
        { id: '7.1.A.11', description: 'Inspect insulators for evidence of physical damage or contaminated surfaces.', result: 'Select One' },
        { id: '7.1.A.12', description: 'Verify that barrier and shutter installation and operation.', result: 'Select One' },
        { id: '7.1.A.13', description: 'Exercise all active components.', result: 'Select One' },
        { id: '7.1.A.14', description: 'Inspect mechanical indicating devices for correct operation.', result: 'Select One' },
        { id: '7.1.A.15', description: 'Verify that filters are in place, filters are clean and free from debris, and vents are clear', result: 'Select One' }
      ];
    }
    
    if (!reportData.measuredInsulationResistance) {
      reportData.measuredInsulationResistance = ['Bus 1', 'Bus 2', 'Bus 3', 'Bus 4', 'Bus 5', 'Bus 6'].map(bus => ({
        busSection: bus, ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', an: '', bn: '', cn: ''
      }));
    }
    
    if (!reportData.tempCorrectedInsulationResistance) {
      reportData.tempCorrectedInsulationResistance = ['Bus 1', 'Bus 2', 'Bus 3', 'Bus 4', 'Bus 5', 'Bus 6'].map(bus => ({
        busSection: bus, ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', an: '', bn: '', cn: ''
      }));
    }
    
    if (!reportData.contactResistanceTests) {
      reportData.contactResistanceTests = ['Bus 1', 'Bus 2', 'Bus 3', 'Bus 4', 'Bus 5', 'Bus 6'].map(bus => ({
        busSection: bus, aPhase: '', bPhase: '', cPhase: '', neutral: '', ground: ''
      }));
    }
    
    if (!reportData.dielectricWithstandTests) {
      reportData.dielectricWithstandTests = ['Bus 1', 'Bus 2', 'Bus 3', 'Bus 4', 'Bus 5', 'Bus 6'].map(bus => ({
        busSection: bus, ag: '', bg: '', cg: ''
      }));
    }
    
    if (!reportData.testEquipment) {
      reportData.testEquipment = {
        megohmmeter: { name: '', serialNumber: '', ampId: '' },
        lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
        hipot: { name: '', serialNumber: '', ampId: '' }
      };
    }
    
    console.log('🔍 Final processed report data:', reportData);

    const jsonbColumn = schema.jsonbColumns.includes('report_data') ? 'report_data' : 'data';
    
    const dataToInsert: any = {
      job_id: jobId,
      user_id: userId,
      [jsonbColumn]: reportData
    };

    return dataToInsert;
  }

  protected getReportType(): string {
    return 'switchgear-panelboard-mts-report';
  }
}
