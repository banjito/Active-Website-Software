import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class VoltagePotentialTransformerImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'voltage_potential_transformer_mts_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`VoltagePotentialTransformer Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('voltagepotentialtransformer') || 
           data.reportType?.toLowerCase().includes('voltage-potential-transformer') ||
           data.reportType?.toLowerCase().includes('13-voltagepotentialtransformertestmtsreport');
    console.log(`VoltagePotentialTransformer Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    console.log('=== VOLTAGE POTENTIAL TRANSFORMER IMPORTER - prepareData START ===');
    
    const reportData: any = {
      // Initialize with shapes expected by the component
      customerName: '',
      customerAddress: '',
      userName: '',
      date: '',
      identifier: '',
      jobNumber: '',
      technicians: '',
      temperature: { fahrenheit: 76, celsius: 24, tcf: 1, humidity: 0 },
      substation: '',
      eqptLocation: '',
      deviceData: {
        manufacturer: '', catalogNumber: '', serialNumber: '', accuracyClass: '',
        manufacturedYear: '', voltageRating: '', insulationClass: '', frequency: ''
      },
      visualMechanicalInspection: [],
      fuseData: { manufacturer: '', catalogNumber: '', class: '', voltageRatingKv: '', ampacityA: '', icRatingKa: '' },
      fuseResistanceTest: { asFound: '', asLeft: '', units: 'µΩ' },
      insulationResistance: [],
      secondaryVoltageAsFoundTap: '',
      turnsRatioTest: [{ id: 'tr-0', tap: '', primaryVoltage: '', calculatedRatio: '', measuredH1H2: '', percentDeviation: '', passFail: '' }],
      testEquipmentUsed: {
        megohmmeter: { name: '', serialNumber: '', ampId: '' },
        lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
        ttrTestSet: { name: '', serialNumber: '', ampId: '' }
      },
      comments: ''
    };

    const toNumber = (val: any): number => {
      const n = typeof val === 'number' ? val : parseFloat(val);
      return isNaN(n) ? 0 : n;
    };

    const setTempFromF = (f: any) => {
      const fahrenheit = toNumber(f);
      const celsius = Math.round((fahrenheit - 32) * 5 / 9);
      reportData.temperature = { ...reportData.temperature, fahrenheit, celsius };
    };

    // PRIORITIZE SECTIONS PROCESSING
    if (data.sections && data.sections.length > 0) {
      console.log('✅ Found sections data, processing:', data.sections.length, 'sections');
      
      data.sections.forEach(section => {
        console.log(`Processing section: "${section.title}"`);
        
        if (section.title === 'Job Information') {
          console.log('Processing Job Information section:', section.fields);
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            if (fieldLabel.includes('customer')) {
              reportData.customerName = field.value;
            }
            else if (fieldLabel.includes('job') || fieldLabel.includes('job#')) {
              reportData.jobNumber = field.value;
            }
            else if (fieldLabel.includes('technicians')) {
              reportData.technicians = field.value;
            }
            else if (fieldLabel.includes('date')) {
              reportData.date = field.value;
            }
            else if (fieldLabel.includes('identifier')) {
              reportData.identifier = field.value;
            }
            else if (fieldLabel.includes('substation')) {
              reportData.substation = field.value;
            }
            else if (fieldLabel.includes('eqpt. location') || fieldLabel.includes('equipment') || fieldLabel.includes('location')) {
              reportData.eqptLocation = field.value;
            }
            else if (fieldLabel.includes('user')) {
              reportData.userName = field.value;
            }
            else if (fieldLabel.includes('temp') || fieldLabel.includes('temperature')) {
              setTempFromF(field.value);
            }
            else if (fieldLabel.includes('humidity')) {
              reportData.temperature = { ...reportData.temperature, humidity: toNumber(field.value) };
            }
          });
        } else if (section.title === 'Device Data') {
          console.log('Processing Device Data section:', section.fields);
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            if (fieldLabel.includes('manufacturer')) reportData.deviceData.manufacturer = field.value;
            else if (fieldLabel.includes('catalog number')) reportData.deviceData.catalogNumber = field.value;
            else if (fieldLabel.includes('serial number')) reportData.deviceData.serialNumber = field.value;
            else if (fieldLabel.includes('accuracy class')) reportData.deviceData.accuracyClass = field.value;
            else if (fieldLabel.includes('manufactured year')) reportData.deviceData.manufacturedYear = field.value;
            else if (fieldLabel.includes('voltage rating')) reportData.deviceData.voltageRating = field.value;
            else if (fieldLabel.includes('insulation class')) reportData.deviceData.insulationClass = field.value;
            else if (fieldLabel.includes('frequency')) reportData.deviceData.frequency = field.value;
          });
        } else if (section.title === 'Visual and Mechanical Inspection') {
          console.log('Processing Visual and Mechanical Inspection section:', section.fields);
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value && field.value.rows) {
              reportData.visualMechanicalInspection = field.value.rows.map((row: any) => ({
                netaSection: row.id || '',
                description: row.description || '',
                result: row.result || 'Select One'
              }));
            }
          });
        } else if (section.title === 'Fuse Data') {
          console.log('Processing Fuse Data section:', section.fields);
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            if (fieldLabel.includes('manufacturer')) reportData.fuseData.manufacturer = field.value;
            else if (fieldLabel.includes('catalog number')) reportData.fuseData.catalogNumber = field.value;
            else if (fieldLabel.includes('class')) reportData.fuseData.class = field.value;
            else if (fieldLabel.includes('voltage rating') && fieldLabel.includes('kv')) reportData.fuseData.voltageRatingKv = field.value;
            else if (fieldLabel.includes('ampacity') || fieldLabel.includes('amp')) reportData.fuseData.ampacityA = field.value;
            else if (fieldLabel.includes('i.c. rating') || fieldLabel.includes('ka')) reportData.fuseData.icRatingKa = field.value;
          });
        } else if (section.title === 'Electrical Tests - Fuse Resistance') {
          console.log('Processing Fuse Resistance section:', section.fields);
          section.fields.forEach(field => {
            if (field.label === 'Fuse Resistance' && field.value) {
              reportData.fuseResistanceTest = {
                ...reportData.fuseResistanceTest,
                asFound: field.value.asFound || '',
                asLeft: field.value.asLeft || ''
              };
            }
          });
        } else if (section.title === 'Electrical Tests - Insulation Resistance & Ratio') {
          console.log('Processing Insulation Resistance & Ratio section:', section.fields);
          section.fields.forEach(field => {
            if (field.label === 'Insulation Resistance' && field.value && field.value.rows) {
              reportData.insulationResistance = field.value.rows.map((row: any) => ({
                id: row.id || '',
                windingTested: row.id || '',
                testVoltage: row.testVoltage || '',
                results: row.results || '',
                units: row.units || 'MΩ',
                correctedResults: row.corrected || ''
              }));
            } else if (field.label === 'Secondary Voltage at as-found tap (V)') {
              reportData.secondaryVoltageAsFoundTap = field.value;
            } else if (field.label === 'Turns Ratio Test' && field.value) {
              reportData.turnsRatioTest = [{
                id: 'tr-0',
                tap: field.value.tap || '',
                primaryVoltage: field.value.primaryVoltage || '',
                calculatedRatio: field.value.calculatedRatio || '',
                measuredH1H2: field.value.measuredH1H2 || '',
                percentDeviation: field.value.percentDeviation || '',
                passFail: field.value.passFail || ''
              }];
            }
          });
        } else if (section.title === 'Test Equipment Used') {
          console.log('Processing Test Equipment section:', section.fields);
          let currentEquipment = '';
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            if (fieldLabel.includes('megohmmeter')) {
              currentEquipment = 'megohmmeter';
              reportData.testEquipmentUsed.megohmmeter.name = field.value || '';
            } else if (fieldLabel.includes('low resistance ohmmeter')) {
              currentEquipment = 'lowResistanceOhmmeter';
              reportData.testEquipmentUsed.lowResistanceOhmmeter.name = field.value || '';
            } else if (fieldLabel.includes('ttr test set')) {
              currentEquipment = 'ttrTestSet';
              reportData.testEquipmentUsed.ttrTestSet.name = field.value || '';
            } else if (fieldLabel.includes('serial number')) {
              if (currentEquipment === 'megohmmeter') {
                reportData.testEquipmentUsed.megohmmeter.serialNumber = field.value || '';
              } else if (currentEquipment === 'lowResistanceOhmmeter') {
                reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = field.value || '';
              } else if (currentEquipment === 'ttrTestSet') {
                reportData.testEquipmentUsed.ttrTestSet.serialNumber = field.value || '';
              }
            } else if (fieldLabel.includes('amp id')) {
              if (currentEquipment === 'megohmmeter') {
                reportData.testEquipmentUsed.megohmmeter.ampId = field.value || '';
              } else if (currentEquipment === 'lowResistanceOhmmeter') {
                reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = field.value || '';
              } else if (currentEquipment === 'ttrTestSet') {
                reportData.testEquipmentUsed.ttrTestSet.ampId = field.value || '';
              }
            }
          });
        } else if (section.title === 'Comments') {
          console.log('Processing Comments section:', section.fields);
          section.fields.forEach(field => {
            if (field.type === 'text' || field.type === 'textarea') {
              reportData.comments = field.value || '';
            }
          });
        } else {
          console.log(`⚠️ Unknown section title: "${section.title}" - skipping`);
        }
      });
      
      console.log('Report data after sections processing:', reportData);
      
      // Also check data.fields as a fallback
      if (data.data && data.data.fields) {
        console.log('Processing data.fields as fallback:', data.data.fields);
        const fields = data.data.fields as any;
        // Job info
        if (!reportData.customerName && fields.customer) reportData.customerName = fields.customer;
        if (!reportData.jobNumber && fields.jobNumber) reportData.jobNumber = fields.jobNumber;
        if (!reportData.technicians && fields.technicians) reportData.technicians = fields.technicians;
        if (!reportData.date && fields.date) reportData.date = fields.date;
        if (!reportData.identifier && fields.identifier) reportData.identifier = fields.identifier;
        if (!reportData.substation && fields.substation) reportData.substation = fields.substation;
        if (!reportData.eqptLocation && fields.eqptLocation) reportData.eqptLocation = fields.eqptLocation;
        if (!reportData.userName && fields.user) reportData.userName = fields.user;
        if (reportData.temperature.fahrenheit === 76 && fields.temperatureF) setTempFromF(fields.temperatureF);
        if (reportData.temperature.humidity === 0 && fields.humidity) reportData.temperature.humidity = toNumber(fields.humidity);
        // Device data
        if (!reportData.deviceData.manufacturer && fields.manufacturer) reportData.deviceData.manufacturer = fields.manufacturer;
        if (!reportData.deviceData.catalogNumber && fields.catalogNumber) reportData.deviceData.catalogNumber = fields.catalogNumber;
        if (!reportData.deviceData.serialNumber && fields.serialNumber) reportData.deviceData.serialNumber = fields.serialNumber;
        if (!reportData.deviceData.accuracyClass && fields.accuracyClass) reportData.deviceData.accuracyClass = fields.accuracyClass;
        if (!reportData.deviceData.manufacturedYear && fields.manufacturedYear) reportData.deviceData.manufacturedYear = fields.manufacturedYear;
        if (!reportData.deviceData.voltageRating && fields.voltageRating) reportData.deviceData.voltageRating = fields.voltageRating;
        if (!reportData.deviceData.insulationClass && fields.insulationClass) reportData.deviceData.insulationClass = fields.insulationClass;
        if (!reportData.deviceData.frequency && fields.frequency) reportData.deviceData.frequency = fields.frequency;
        // Visual/mech table fallback
        if (!reportData.visualMechanicalInspection.length && fields['vm-table']?.rows) {
          reportData.visualMechanicalInspection = fields['vm-table'].rows.map((row: any) => ({
            netaSection: row.id || '', description: row.description || '', result: row.result || 'Select One'
          }));
        }
        // Fuse data
        if (!reportData.fuseData.manufacturer && fields.fuseManufacturer) reportData.fuseData.manufacturer = fields.fuseManufacturer;
        if (!reportData.fuseData.catalogNumber && fields.fuseCatalogNumber) reportData.fuseData.catalogNumber = fields.fuseCatalogNumber;
        if (!reportData.fuseData.class && fields.fuseClass) reportData.fuseData.class = fields.fuseClass;
        if (!reportData.fuseData.voltageRatingKv && fields.fuseVoltageRatingKv) reportData.fuseData.voltageRatingKv = fields.fuseVoltageRatingKv;
        if (!reportData.fuseData.ampacityA && fields.fuseAmpacityA) reportData.fuseData.ampacityA = fields.fuseAmpacityA;
        if (!reportData.fuseData.icRatingKa && fields.fuseIcRatingKa) reportData.fuseData.icRatingKa = fields.fuseIcRatingKa;
        // Fuse resistance
        if ((!reportData.fuseResistanceTest.asFound && fields.fuseResistance?.asFound) || (!reportData.fuseResistanceTest.asLeft && fields.fuseResistance?.asLeft)) {
          reportData.fuseResistanceTest = {
            ...reportData.fuseResistanceTest,
            asFound: fields.fuseResistance.asFound || '',
            asLeft: fields.fuseResistance.asLeft || ''
          };
        }
        // Insulation resistance
        if (!reportData.insulationResistance.length && fields.vtInsulation?.rows) {
          reportData.insulationResistance = fields.vtInsulation.rows.map((row: any) => ({
            id: row.id || '', windingTested: row.id || '', testVoltage: row.testVoltage || '', results: row.results || '', units: row.units || 'MΩ', correctedResults: row.corrected || ''
          }));
        }
        if (!reportData.secondaryVoltageAsFoundTap && fields.secondaryVoltageTap) reportData.secondaryVoltageAsFoundTap = fields.secondaryVoltageTap;
        if (reportData.turnsRatioTest[0] && !reportData.turnsRatioTest[0].tap && fields.turnsRatio) {
          reportData.turnsRatioTest = [{
            id: 'tr-0',
            tap: fields.turnsRatio.tap || '',
            primaryVoltage: fields.turnsRatio.primaryVoltage || '',
            calculatedRatio: fields.turnsRatio.calculatedRatio || '',
            measuredH1H2: fields.turnsRatio.measuredH1H2 || '',
            percentDeviation: fields.turnsRatio.percentDeviation || '',
            passFail: fields.turnsRatio.passFail || ''
          }];
        }
        // Test equipment
        if (fields.megohmmeter) reportData.testEquipmentUsed.megohmmeter.name = fields.megohmmeter;
        if (fields.megohmmeterSerial) reportData.testEquipmentUsed.megohmmeter.serialNumber = fields.megohmmeterSerial;
        if (fields.megohmmeterAmpId) reportData.testEquipmentUsed.megohmmeter.ampId = fields.megohmmeterAmpId;
        if (fields.lro) reportData.testEquipmentUsed.lowResistanceOhmmeter.name = fields.lro;
        if (fields.lroSerial) reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = fields.lroSerial;
        if (fields.lroAmpId) reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = fields.lroAmpId;
        if (fields.ttr) reportData.testEquipmentUsed.ttrTestSet.name = fields.ttr;
        if (fields.ttrSerial) reportData.testEquipmentUsed.ttrTestSet.serialNumber = fields.ttrSerial;
        if (fields.ttrAmpId) reportData.testEquipmentUsed.ttrTestSet.ampId = fields.ttrAmpId;
        if (!reportData.comments && fields.comments) reportData.comments = fields.comments;
      }
    } else if (data.data && data.data.fields) {
      console.log('No sections found, using data.fields fallback:', data.data.fields);
      const fields = data.data.fields as any;
      // Map same as above purely from fields
      reportData.customerName = fields.customer || '';
      reportData.jobNumber = fields.jobNumber || '';
      reportData.technicians = fields.technicians || '';
      reportData.date = fields.date || '';
      reportData.identifier = fields.identifier || '';
      reportData.substation = fields.substation || '';
      reportData.eqptLocation = fields.eqptLocation || '';
      reportData.userName = fields.user || '';
      if (fields.temperatureF) setTempFromF(fields.temperatureF);
      reportData.temperature.humidity = toNumber(fields.humidity || 0);
      reportData.deviceData = {
        manufacturer: fields.manufacturer || '',
        catalogNumber: fields.catalogNumber || '',
        serialNumber: fields.serialNumber || '',
        accuracyClass: fields.accuracyClass || '',
        manufacturedYear: fields.manufacturedYear || '',
        voltageRating: fields.voltageRating || '',
        insulationClass: fields.insulationClass || '',
        frequency: fields.frequency || ''
      };
      if (fields['vm-table']?.rows) {
        reportData.visualMechanicalInspection = fields['vm-table'].rows.map((row: any) => ({
          netaSection: row.id || '', description: row.description || '', result: row.result || 'Select One'
        }));
      }
      reportData.fuseData = {
        manufacturer: fields.fuseManufacturer || '',
        catalogNumber: fields.fuseCatalogNumber || '',
        class: fields.fuseClass || '',
        voltageRatingKv: fields.fuseVoltageRatingKv || '',
        ampacityA: fields.fuseAmpacityA || '',
        icRatingKa: fields.fuseIcRatingKa || ''
      };
      if (fields.fuseResistance) {
        reportData.fuseResistanceTest = { asFound: fields.fuseResistance.asFound || '', asLeft: fields.fuseResistance.asLeft || '', units: 'µΩ' };
      }
      if (fields.vtInsulation?.rows) {
        reportData.insulationResistance = fields.vtInsulation.rows.map((row: any) => ({
          id: row.id || '', windingTested: row.id || '', testVoltage: row.testVoltage || '', results: row.results || '', units: row.units || 'MΩ', correctedResults: row.corrected || ''
        }));
      }
      reportData.secondaryVoltageAsFoundTap = fields.secondaryVoltageTap || '';
      if (fields.turnsRatio) {
        reportData.turnsRatioTest = [{ id: 'tr-0', tap: fields.turnsRatio.tap || '', primaryVoltage: fields.turnsRatio.primaryVoltage || '', calculatedRatio: fields.turnsRatio.calculatedRatio || '', measuredH1H2: fields.turnsRatio.measuredH1H2 || '', percentDeviation: fields.turnsRatio.percentDeviation || '', passFail: fields.turnsRatio.passFail || '' }];
      }
      reportData.testEquipmentUsed.megohmmeter.name = fields.megohmmeter || '';
      reportData.testEquipmentUsed.megohmmeter.serialNumber = fields.megohmmeterSerial || '';
      reportData.testEquipmentUsed.megohmmeter.ampId = fields.megohmmeterAmpId || '';
      reportData.testEquipmentUsed.lowResistanceOhmmeter.name = fields.lro || '';
      reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = fields.lroSerial || '';
      reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = fields.lroAmpId || '';
      reportData.testEquipmentUsed.ttrTestSet.name = fields.ttr || '';
      reportData.testEquipmentUsed.ttrTestSet.serialNumber = fields.ttrSerial || '';
      reportData.testEquipmentUsed.ttrTestSet.ampId = fields.ttrAmpId || '';
      reportData.comments = fields.comments || '';
    } else {
      console.log('No sections or data.fields found!');
    }
    
    console.log('Final processed data:', reportData);

    // Final return using correct JSONB column
    const jsonbColumn = schema.jsonbColumns.includes('data') ? 'data' : 'report_data';
    console.log(`Using JSONB column: ${jsonbColumn}`);
    
    const result = {
      job_id: jobId,
      user_id: userId,
      [jsonbColumn]: reportData
    };
    
    console.log('Final return object:', result);
    console.log('=== VOLTAGE POTENTIAL TRANSFORMER IMPORTER - prepareData END ===\n');
    
    return result;
  }

  protected getReportType(): string {
    return '13-voltage-potential-transformer-test-mts-report';
  }
}
