import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MediumVoltageMotorStarterImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'medium_voltage_motor_starter_mts_reports';
  protected requiredColumns = ['job_id', 'user_id'];

  canImport(data: ReportData): boolean {
    console.log(`MediumVoltageMotorStarter Importer checking: ${data.reportType}`);
    const canImport = data.reportType?.toLowerCase().includes('mediumvoltagemotorstarter') || 
           data.reportType?.toLowerCase().includes('medium-voltage-motor-starter');
    console.log(`MediumVoltageMotorStarter Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const reportData: any = {
      // Job Info
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
      status: 'PASS',

      // Nameplate
      nameplateData: {
        manufacturer: '', catalogNumber: '', serialNumber: '', type: '', manufacturingDate: '',
        icRating: '', ratedVoltageKV: '', operatingVoltageKV: '', ampacity: '', impulseRatingBIL: ''
      },

      // Visual/Mechanical
      visualMechanicalInspection: {
        items: [] as Array<{ netaSection: string; description: string; result: string }>,
        eGap: { unitMeasurement: '', tolerance: '', aPhase: '', bPhase: '', cPhase: '' }
      },

      // Fuse Data
      fuseData: { manufacturer: '', catalogNumber: '', class: '', ratedVoltageKV: '', ampacity: '', icRatingKA: '' },

      // Electrical Tests (main assembly)
      electricalTests: {
        contactResistanceAsFound: [] as Array<{ test: string; p1: string; p2: string; p3: string; units: string }>,
        contactResistanceAsLeft: [] as Array<{ test: string; p1: string; p2: string; p3: string; units: string }>,
        insulationResistance: { testVoltage: '1000V', readings: [] as Array<{ test: string; state: string; p1_mq: string; p2_mq: string; p3_mq: string }> },
        temperatureCorrected: { testVoltage: '1000V', readings: [] as Array<{ test: string; state: string; p1_mq: string; p2_mq: string; p3_mq: string }> }
      },

      // Contactor
      contactorData: {
        manufacturer: '', catalogNumber: '', serialNumber: '', type: '', manufacturingDate: '',
        icRatingKA: '', ratedVoltageKV: '', operatingVoltageKV: '', ampacity: '', controlVoltageV: ''
      },
      electricalTestContactor: {
        insulationResistance: { testVoltage: '1000V', readings: [] as Array<{ test: string; state: string; p1_mq: string; p2_mq: string; p3_mq: string }> },
        temperatureCorrected: { testVoltage: '1000V', readings: [] as Array<{ test: string; state: string; p1_mq: string; p2_mq: string; p3_mq: string }> },
        vacuumBottleIntegrity: { testVoltage: '', testDuration: '1 Min.', p1: '', p2: '', p3: '', units: '' }
      },

      // Starting Reactor
      startingReactorData: { manufacturer: '', catalogNumber: '', serialNumber: '', ratedCurrentA: '', ratedVoltageKV: '', operatingVoltageKV: '' },
      electricalTestReactor: {
        insulationResistance: { testVoltage: '1000V', windingToGround: { aPhase: '', bPhase: '', cPhase: '', units: 'MΩ' } },
        temperatureCorrected: { testVoltage: '1000V', windingToGround: { aPhase: '', bPhase: '', cPhase: '', units: 'MΩ' } },
        contactResistanceAsFound: { aPhase: '', bPhase: '', cPhase: '', units: 'µΩ' },
        contactResistanceAsLeft: { aPhase: '', bPhase: '', cPhase: '', units: 'µΩ' }
      },

      // Equipment
      testEquipmentUsed: {
        megohmmeter: { name: '', serialNumber: '', ampId: '' },
        lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
        hipot: { name: '', serialNumber: '', ampId: '' }
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
            else if (L.includes('address')) reportData.customerAddress = field.value;
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
            if (L.includes('manufacturer')) reportData.nameplateData.manufacturer = field.value;
            else if (L.includes('catalog')) reportData.nameplateData.catalogNumber = field.value;
            else if (L.includes('serial')) reportData.nameplateData.serialNumber = field.value;
            else if (L === 'type') reportData.nameplateData.type = field.value;
            else if (L.includes('manufacturing')) reportData.nameplateData.manufacturingDate = field.value;
            else if (L.includes('i.c. rating')) reportData.nameplateData.icRating = field.value;
            else if (L.includes('rated voltage')) reportData.nameplateData.ratedVoltageKV = field.value;
            else if (L.includes('operating voltage')) reportData.nameplateData.operatingVoltageKV = field.value;
            else if (L.includes('ampacity')) reportData.nameplateData.ampacity = field.value;
            else if (L.includes('impulse')) reportData.nameplateData.impulseRatingBIL = field.value;
            // E-Gap table sometimes appears under Nameplate Data
            if (field.type === 'table' && field.label.toLowerCase().includes('e-gap') && field.value) {
              reportData.visualMechanicalInspection.eGap = {
                unitMeasurement: field.value.unitMeasurement || '',
                tolerance: field.value.tolerance || '',
                aPhase: field.value.aPhase || '',
                bPhase: field.value.bPhase || '',
                cPhase: field.value.cPhase || ''
              };
            }
          });
        } else if (title === 'Visual and Mechanical Inspection') {
          section.fields.forEach(field => {
            if (field.type === 'table' && field.value?.rows) {
              reportData.visualMechanicalInspection.items = field.value.rows.map((r: any) => ({
                netaSection: r.id || '', description: r.description || '', result: r.result || 'Select One'
              }));
            }
          });
        } else if (title === 'Fuse Data') {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('manufacturer')) reportData.fuseData.manufacturer = field.value;
            else if (L.includes('catalog')) reportData.fuseData.catalogNumber = field.value;
            else if (L === 'class') reportData.fuseData.class = field.value;
            else if (L.includes('rated voltage')) reportData.fuseData.ratedVoltageKV = field.value;
            else if (L.includes('ampacity')) reportData.fuseData.ampacity = field.value;
            else if (L.includes('i.c. rating')) reportData.fuseData.icRatingKA = field.value;
          });
        } else if (title === 'Electrical Tests') {
          section.fields.forEach(field => {
            if (field.label.includes('Contact Resistance (As Found)') && field.value?.rows) {
              reportData.electricalTests.contactResistanceAsFound = field.value.rows.map((r: any) => ({
                test: r.test || '', p1: r.p1 || '', p2: r.p2 || '', p3: r.p3 || '', units: r.units || 'µΩ'
              }));
            } else if (field.label.includes('Contact Resistance (As Left)') && field.value?.rows) {
              reportData.electricalTests.contactResistanceAsLeft = field.value.rows.map((r: any) => ({
                test: r.test || '', p1: r.p1 || '', p2: r.p2 || '', p3: r.p3 || '', units: r.units || 'µΩ'
              }));
            } else if (field.label.toLowerCase().includes('insulation resistance') && field.value) {
              // New JSON structure: { testVoltage, poleToPole: {p1,p2}, poleToFrame: {p1,p2,p3}, lineToLoad: {...} }
              const v = field.value || {};
              reportData.electricalTests.insulationResistance.testVoltage = v.testVoltage || reportData.electricalTests.insulationResistance.testVoltage;
              const readings: Array<{ test: string; state: string; p1_mq: string; p2_mq: string; p3_mq: string }> = [];
              if (v.poleToPole) {
                readings.push({ test: 'Pole to Pole', state: '', p1_mq: v.poleToPole.p1 || '', p2_mq: v.poleToPole.p2 || '', p3_mq: v.poleToPole.p3 || '' });
              }
              if (v.poleToFrame) {
                readings.push({ test: 'Pole to Frame', state: '', p1_mq: v.poleToFrame.p1 || '', p2_mq: v.poleToFrame.p2 || '', p3_mq: v.poleToFrame.p3 || '' });
              }
              if (v.lineToLoad) {
                readings.push({ test: 'Line to Load', state: '', p1_mq: v.lineToLoad.p1 || '', p2_mq: v.lineToLoad.p2 || '', p3_mq: v.lineToLoad.p3 || '' });
              }
              if (readings.length) {
                reportData.electricalTests.insulationResistance.readings = readings;
              }
            }
          });
        } else if (title === 'Contactor Data') {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('manufacturer')) reportData.contactorData.manufacturer = field.value;
            else if (L.includes('catalog')) reportData.contactorData.catalogNumber = field.value;
            else if (L.includes('serial')) reportData.contactorData.serialNumber = field.value;
            else if (L === 'type') reportData.contactorData.type = field.value;
            else if (L.includes('manufacturing')) reportData.contactorData.manufacturingDate = field.value;
            else if (L.includes('i.c. rating')) reportData.contactorData.icRatingKA = field.value;
            else if (L.includes('rated voltage')) reportData.contactorData.ratedVoltageKV = field.value;
            else if (L.includes('operating voltage')) reportData.contactorData.operatingVoltageKV = field.value;
            else if (L.includes('ampacity')) reportData.contactorData.ampacity = field.value;
            else if (L.includes('control voltage')) reportData.contactorData.controlVoltageV = field.value;
          });
        } else if (title === 'Electrical Test - Contactor') {
          section.fields.forEach(field => {
            if (field.label.includes('Insulation Resistance') && field.value?.rows) {
              reportData.electricalTestContactor.insulationResistance.testVoltage = field.value.testVoltage || '1000V';
              reportData.electricalTestContactor.insulationResistance.readings = field.value.rows.map((r: any) => ({
                test: r.id || '', state: r.state || '', p1_mq: r.p1 || '', p2_mq: r.p2 || '', p3_mq: r.p3 || ''
              }));
            } else if (field.label.includes('Vacuum Bottle Integrity')) {
              reportData.electricalTestContactor.vacuumBottleIntegrity = {
                testVoltage: field.value?.testVoltage || '',
                testDuration: field.value?.testDuration || '1 Min.',
                p1: field.value?.p1 || '', p2: field.value?.p2 || '', p3: field.value?.p3 || '', units: field.value?.units || ''
              };
            }
          });
        } else if (title === 'Starting Reactor Data') {
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('manufacturer')) reportData.startingReactorData.manufacturer = field.value;
            else if (L.includes('catalog')) reportData.startingReactorData.catalogNumber = field.value;
            else if (L.includes('serial')) reportData.startingReactorData.serialNumber = field.value;
            else if (L.includes('rated current')) reportData.startingReactorData.ratedCurrentA = field.value;
            else if (L.includes('rated voltage')) reportData.startingReactorData.ratedVoltageKV = field.value;
            else if (L.includes('operating voltage')) reportData.startingReactorData.operatingVoltageKV = field.value;
          });
        } else if (title === 'Electrical Test - Reactor') {
          section.fields.forEach(field => {
            if (field.label.includes('Insulation Resistance Values') && field.value) {
              reportData.electricalTestReactor.insulationResistance.testVoltage = field.value.testVoltage || '1000V';
              reportData.electricalTestReactor.insulationResistance.windingToGround = {
                units: field.value?.windingToGround?.units || 'MΩ',
                aPhase: field.value?.windingToGround?.aPhase || '',
                bPhase: field.value?.windingToGround?.bPhase || '',
                cPhase: field.value?.windingToGround?.cPhase || ''
              };
              reportData.electricalTestReactor.temperatureCorrected = {
                testVoltage: field.value?.testVoltage || '1000V',
                windingToGround: {
                  units: field.value?.windingToGround?.units || 'MΩ',
                  aPhase: field.value?.corrected?.aPhase || '',
                  bPhase: field.value?.corrected?.bPhase || '',
                  cPhase: field.value?.corrected?.cPhase || ''
                }
              };
            } else if (field.label.includes('Contact Resistance (As Found)') && field.value?.rows) {
              reportData.electricalTestReactor.contactResistanceAsFound = {
                aPhase: field.value.rows[0]?.p1 || '',
                bPhase: field.value.rows[0]?.p2 || '',
                cPhase: field.value.rows[0]?.p3 || '',
                units: field.value.rows[0]?.units || 'µΩ'
              };
            } else if (field.label.includes('Contact Resistance (As Left)') && field.value?.rows) {
              reportData.electricalTestReactor.contactResistanceAsLeft = {
                aPhase: field.value.rows[0]?.p1 || '',
                bPhase: field.value.rows[0]?.p2 || '',
                cPhase: field.value.rows[0]?.p3 || '',
                units: field.value.rows[0]?.units || 'µΩ'
              };
            }
          });
        } else if (title === 'Test Equipment Used') {
          let current = '';
          section.fields.forEach(field => {
            const L = field.label.toLowerCase();
            if (L.includes('megohmmeter')) { current = 'meg'; reportData.testEquipmentUsed.megohmmeter.name = field.value; }
            else if (L.includes('low resistance ohmmeter')) { current = 'lro'; reportData.testEquipmentUsed.lowResistanceOhmmeter.name = field.value; }
            else if (L.includes('hipot')) { current = 'hipot'; reportData.testEquipmentUsed.hipot.name = field.value; }
            else if (L.includes('serial number')) {
              if (current === 'meg') reportData.testEquipmentUsed.megohmmeter.serialNumber = field.value;
              else if (current === 'lro') reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = field.value;
              else if (current === 'hipot') reportData.testEquipmentUsed.hipot.serialNumber = field.value;
            } else if (L.includes('amp id')) {
              if (current === 'meg') reportData.testEquipmentUsed.megohmmeter.ampId = field.value;
              else if (current === 'lro') reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = field.value;
              else if (current === 'hipot') reportData.testEquipmentUsed.hipot.ampId = field.value;
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
      if (!reportData.customerAddress) reportData.customerAddress = f.address || '';
      if (!reportData.userName) reportData.userName = f.user || '';
      if (!reportData.date) reportData.date = f.date || '';
      if (!reportData.identifier) reportData.identifier = f.identifier || '';
      if (!reportData.jobNumber) reportData.jobNumber = f.jobNumber || '';
      if (!reportData.technicians) reportData.technicians = f.technicians || '';
      if (!reportData.substation) reportData.substation = f.substation || '';
      if (!reportData.eqptLocation) reportData.eqptLocation = f.eqptLocation || '';
      if (reportData.temperature.fahrenheit === 76 && f.temperatureF) setTempFromF(f.temperatureF);
      if (reportData.temperature.humidity === 0 && f.humidity) reportData.temperature.humidity = toNumber(f.humidity);

      // Nameplate
      const np = reportData.nameplateData;
      if (!np.manufacturer) np.manufacturer = f.manufacturer || '';
      if (!np.catalogNumber) np.catalogNumber = f.catalogNumber || '';
      if (!np.serialNumber) np.serialNumber = f.serialNumber || '';
      if (!np.type) np.type = f.type || '';
      if (!np.manufacturingDate) np.manufacturingDate = f.manufacturingDate || '';
      if (!np.icRating) np.icRating = f.icRating || '';
      if (!np.ratedVoltageKV) np.ratedVoltageKV = f.ratedVoltageKV || '';
      if (!np.operatingVoltageKV) np.operatingVoltageKV = f.operatingVoltageKV || '';
      if (!np.ampacity) np.ampacity = f.ampacity || '';
      if (!np.impulseRatingBIL) np.impulseRatingBIL = f.impulseRatingBIL || '';

      // Visual table
      if (!reportData.visualMechanicalInspection.items.length && f['vm-table']?.rows) {
        reportData.visualMechanicalInspection.items = f['vm-table'].rows.map((r: any) => ({
          netaSection: r.id || '', description: r.description || '', result: r.result || 'Select One'
        }));
      }

      // Fuse
      const fu = reportData.fuseData;
      if (!fu.manufacturer) fu.manufacturer = f.fuseManufacturer || '';
      if (!fu.catalogNumber) fu.catalogNumber = f.fuseCatalogNumber || '';
      if (!fu.class) fu.class = f.fuseClass || '';
      if (!fu.ratedVoltageKV) fu.ratedVoltageKV = f.fuseRatedVoltageKV || '';
      if (!fu.ampacity) fu.ampacity = f.fuseAmpacityA || '';
      if (!fu.icRatingKA) fu.icRatingKA = f.fuseIcRatingKA || '';

      // CR tables (support multiple aliases)
      const crFound = f.crAsFound || f.switchCrFound || f.contactResistanceAsFound;
      const crLeft = f.crAsLeft || f.switchCrLeft || f.contactResistanceAsLeft;
      if (!reportData.electricalTests.contactResistanceAsFound.length && crFound?.rows) {
        reportData.electricalTests.contactResistanceAsFound = f.crAsFound.rows.map((r: any) => ({
          test: r.test || '', p1: r.p1 || '', p2: r.p2 || '', p3: r.p3 || '', units: r.units || 'µΩ'
        }));
      }
      if (!reportData.electricalTests.contactResistanceAsLeft.length && crLeft?.rows) {
        reportData.electricalTests.contactResistanceAsLeft = f.crAsLeft.rows.map((r: any) => ({
          test: r.test || '', p1: r.p1 || '', p2: r.p2 || '', p3: r.p3 || '', units: r.units || 'µΩ'
        }));
      }

      // Insulation/Temperature corrected (support both table rows and structured object)
      if (!reportData.electricalTests.insulationResistance.readings.length && f.mvInsulation?.rows) {
        reportData.electricalTests.insulationResistance.readings = f.mvInsulation.rows.map((r: any) => ({
          test: r.id || '', state: '', p1_mq: r.results || '', p2_mq: '', p3_mq: ''
        }));
      }
      if (!reportData.electricalTests.temperatureCorrected.readings.length && f.mvTempCorrected?.rows) {
        reportData.electricalTests.temperatureCorrected.readings = f.mvTempCorrected.rows.map((r: any) => ({
          test: r.id || '', state: '', p1_mq: r.corrected || '', p2_mq: '', p3_mq: ''
        }));
      }

      if (!reportData.electricalTests.insulationResistance.readings.length && f.motorStarterIr) {
        const ir = f.motorStarterIr;
        reportData.electricalTests.insulationResistance.testVoltage = ir.testVoltage || reportData.electricalTests.insulationResistance.testVoltage;
        const readings: Array<{ test: string; state: string; p1_mq: string; p2_mq: string; p3_mq: string }> = [];
        if (ir.poleToPole) readings.push({ test: 'Pole to Pole', state: '', p1_mq: ir.poleToPole.p1 || '', p2_mq: ir.poleToPole.p2 || '', p3_mq: ir.poleToPole.p3 || '' });
        if (ir.poleToFrame) readings.push({ test: 'Pole to Frame', state: '', p1_mq: ir.poleToFrame.p1 || '', p2_mq: ir.poleToFrame.p2 || '', p3_mq: ir.poleToFrame.p3 || '' });
        if (ir.lineToLoad) readings.push({ test: 'Line to Load', state: '', p1_mq: ir.lineToLoad.p1 || '', p2_mq: ir.lineToLoad.p2 || '', p3_mq: ir.lineToLoad.p3 || '' });
        if (readings.length) {
          reportData.electricalTests.insulationResistance.readings = readings;
        }
      }

      // Contactor test
      if (f.contactorInsulation?.rows) {
        reportData.electricalTestContactor.insulationResistance.readings = f.contactorInsulation.rows.map((r: any) => ({
          test: r.id || '', state: r.state || '', p1_mq: r.p1 || '', p2_mq: r.p2 || '', p3_mq: r.p3 || ''
        }));
        reportData.electricalTestContactor.insulationResistance.testVoltage = f.contactorInsulation.testVoltage || '1000V';
        reportData.electricalTestContactor.temperatureCorrected.readings = f.contactorInsulation.rows.map((r: any) => ({
          test: r.id || '', state: r.state || '', p1_mq: r.p1c || '', p2_mq: r.p2c || '', p3_mq: r.p3c || ''
        }));
        reportData.electricalTestContactor.temperatureCorrected.testVoltage = f.contactorInsulation.testVoltage || '1000V';
      }
      if (f.vacuumBottleIntegrity) {
        reportData.electricalTestContactor.vacuumBottleIntegrity = {
          testVoltage: f.vacuumBottleIntegrity.testVoltage || '',
          testDuration: f.vacuumBottleIntegrity.testDuration || '1 Min.',
          p1: f.vacuumBottleIntegrity.p1 || '',
          p2: f.vacuumBottleIntegrity.p2 || '',
          p3: f.vacuumBottleIntegrity.p3 || '',
          units: f.vacuumBottleIntegrity.units || ''
        };
      }

      // Starting Reactor
      const sr = reportData.startingReactorData;
      if (!sr.manufacturer) sr.manufacturer = f.srManufacturer || '';
      if (!sr.catalogNumber) sr.catalogNumber = f.srCatalogNumber || '';
      if (!sr.serialNumber) sr.serialNumber = f.srSerialNumber || '';
      if (!sr.ratedCurrentA) sr.ratedCurrentA = f.srRatedCurrentA || '';
      if (!sr.ratedVoltageKV) sr.ratedVoltageKV = f.srRatedVoltageKV || '';
      if (!sr.operatingVoltageKV) sr.operatingVoltageKV = f.srOperatingVoltageKV || '';

      if (f.reactorInsulation) {
        reportData.electricalTestReactor.insulationResistance.testVoltage = f.reactorInsulation.testVoltage || '1000V';
        reportData.electricalTestReactor.insulationResistance.windingToGround = {
          units: f.reactorInsulation?.windingToGround?.units || 'MΩ',
          aPhase: f.reactorInsulation?.windingToGround?.aPhase || '',
          bPhase: f.reactorInsulation?.windingToGround?.bPhase || '',
          cPhase: f.reactorInsulation?.windingToGround?.cPhase || ''
        };
        reportData.electricalTestReactor.temperatureCorrected = {
          testVoltage: f.reactorInsulation?.testVoltage || '1000V',
          windingToGround: {
            units: f.reactorInsulation?.windingToGround?.units || 'MΩ',
            aPhase: f.reactorInsulation?.corrected?.aPhase || '',
            bPhase: f.reactorInsulation?.corrected?.bPhase || '',
            cPhase: f.reactorInsulation?.corrected?.cPhase || ''
          }
        };
      }
      if (f.reactorCrFound?.rows) {
        reportData.electricalTestReactor.contactResistanceAsFound = {
          aPhase: f.reactorCrFound.rows[0]?.p1 || '',
          bPhase: f.reactorCrFound.rows[0]?.p2 || '',
          cPhase: f.reactorCrFound.rows[0]?.p3 || '',
          units: f.reactorCrFound.rows[0]?.units || 'µΩ'
        };
      }
      if (f.reactorCrLeft?.rows) {
        reportData.electricalTestReactor.contactResistanceAsLeft = {
          aPhase: f.reactorCrLeft.rows[0]?.p1 || '',
          bPhase: f.reactorCrLeft.rows[0]?.p2 || '',
          cPhase: f.reactorCrLeft.rows[0]?.p3 || '',
          units: f.reactorCrLeft.rows[0]?.units || 'µΩ'
        };
      }

      // Equipment
      if (f.megohmmeter) reportData.testEquipmentUsed.megohmmeter.name = f.megohmmeter;
      if (f.megohmmeterSerial) reportData.testEquipmentUsed.megohmmeter.serialNumber = f.megohmmeterSerial;
      if (f.megohmmeterAmpId) reportData.testEquipmentUsed.megohmmeter.ampId = f.megohmmeterAmpId;
      if (f.lro) reportData.testEquipmentUsed.lowResistanceOhmmeter.name = f.lro;
      if (f.lroSerial) reportData.testEquipmentUsed.lowResistanceOhmmeter.serialNumber = f.lroSerial;
      if (f.lroAmpId) reportData.testEquipmentUsed.lowResistanceOhmmeter.ampId = f.lroAmpId;
      if (f.hipot) reportData.testEquipmentUsed.hipot.name = f.hipot;
      if (f.hipotSerial) reportData.testEquipmentUsed.hipot.serialNumber = f.hipotSerial;
      if (f.hipotAmpId) reportData.testEquipmentUsed.hipot.ampId = f.hipotAmpId;

      if (!reportData.comments) reportData.comments = f.comments || '';
    }

    // Choose JSONB column dynamically
    const jsonbColumn = schema.jsonbColumns.includes('data') ? 'data' : 'report_data';
    return { job_id: jobId, user_id: userId, [jsonbColumn]: reportData } as any;
  }

  protected getReportType(): string {
    return '23-medium-voltage-motor-starter-mts-report';
  }
}
