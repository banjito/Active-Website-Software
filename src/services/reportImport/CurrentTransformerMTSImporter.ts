import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class CurrentTransformerMTSImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'current_transformer_test_mts_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_data'];

  canImport(data: ReportData): boolean {
    console.log(`CurrentTransformer MTS Importer checking: ${data.reportType}`);
    const canImport = (data.reportType?.toLowerCase().includes('currenttransformer') ||
           data.reportType?.toLowerCase().includes('current-transformer')) &&
           (data.reportType?.toLowerCase().includes('mts') ||
            data.reportType?.toLowerCase().includes('mtsreport') ||
            data.reportType?.toLowerCase().includes('mtsreport.tsx'));
    console.log(`CurrentTransformer MTS Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
    const reportData: any = {};

    // Initialize with default structures
    reportData.visualMechanicalInspection = [
      { netaSection: '7.10.1.A.1', description: 'Compare equipment nameplate data with drawings and specifications.', result: 'Select One' },
      { netaSection: '7.10.1.A.2', description: 'Inspect physical and mechanical condition.', result: 'Select One' },
      { netaSection: '7.10.1.A.3', description: 'Verify correct connection of transformers with system requirements.', result: 'Select One' },
      { netaSection: '7.10.1.A.4', description: 'Verify that adequate clearances exist between primary and secondary circuit wiring.', result: 'Select One' },
      { netaSection: '7.10.1.A.5', description: 'Verify the unit is clean.', result: 'Select One' },
      { netaSection: '7.10.1.A.6.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.10.1.B.1.', result: 'Select One' },
      { netaSection: '7.10.1.A.7', description: 'Verify that all required grounding and shorting connections provide contact.', result: 'Select One' },
      { netaSection: '7.10.1.A.8', description: 'Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: 'Select One' }
    ];
    
    reportData.electricalTests = {
      ratioPolarity: [
        { id: '1', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' },
        { id: '2', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' },
        { id: '3', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' },
        { id: '4', identifier: '', ratio: '', testType: 'voltage', testValue: '', pri: '', sec: '', measuredRatio: '', ratioDev: '', polarity: 'Select One' }
      ],
      primaryWindingInsulation: {
        testVoltage: '1000V',
        readingPhase1: '',
        readingPhase2: '',
        readingPhase3: '',
        readingNeutral: '',
        units: 'MΩ',
        tempCorrection20CPhase1: '',
        tempCorrection20CPhase2: '',
        tempCorrection20CPhase3: '',
        tempCorrection20CNeutral: ''
      },
      secondaryWindingInsulation: {
        testVoltage: '1000V',
        readingPhase1: '',
        readingPhase2: '',
        readingPhase3: '',
        readingNeutral: '',
        units: 'MΩ',
        tempCorrection20CPhase1: '',
        tempCorrection20CPhase2: '',
        tempCorrection20CPhase3: '',
        tempCorrection20CNeutral: ''
      }
    };

    // PRIORITIZE SECTIONS PROCESSING - This is the enhanced approach
    if (data.sections && data.sections.length > 0) {
      console.log('Processing sections data:', data.sections);
      
      data.sections.forEach(section => {
        console.log(`Processing section: "${section.title}"`);
        
        if (section.title.toLowerCase().includes('job information') || section.title.toLowerCase().includes('job info')) {
          console.log('Processing Job Information section:', section.fields);
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            console.log(`Processing field: "${field.label}" with value: "${field.value}"`);
            if (fieldLabel.includes('customer')) {
              reportData.customer = field.value;
              console.log(`Set customer to: ${field.value}`);
            }
            else if (fieldLabel.includes('address')) {
              reportData.address = field.value;
              console.log(`Set address to: ${field.value}`);
            }
            else if (fieldLabel.includes('user')) {
              reportData.user = field.value;
              console.log(`Set user to: ${field.value}`);
            }
            else if (fieldLabel.includes('date')) {
              reportData.date = field.value;
              console.log(`Set date to: ${field.value}`);
            }
            else if (fieldLabel.includes('job') || fieldLabel.includes('job#')) {
              reportData.jobNumber = field.value;
              console.log(`Set jobNumber to: ${field.value}`);
            }
            else if (fieldLabel.includes('technicians')) {
              reportData.technicians = field.value;
              console.log(`Set technicians to: ${field.value}`);
            }
            else if (fieldLabel.includes('substation')) {
              reportData.substation = field.value;
              console.log(`Set substation to: ${field.value}`);
            }
            else if (fieldLabel.includes('equipment location') || fieldLabel.includes('location')) {
              reportData.eqptLocation = field.value;
              console.log(`Set eqptLocation to: ${field.value}`);
            }
            else if (fieldLabel.includes('identifier')) {
              reportData.identifier = field.value;
              console.log(`Set identifier to: ${field.value}`);
            }
            else if (fieldLabel.includes('temp') || fieldLabel.includes('temperature')) {
              const tempValue = parseFloat(field.value) || 68;
              reportData.temperature = tempValue;
              console.log(`Set temperature to: ${tempValue}°F`);
            }
            else if (fieldLabel.includes('humidity')) {
              const humidityValue = parseFloat(field.value) || 0;
              reportData.humidity = humidityValue;
              console.log(`Set humidity to: ${humidityValue}%`);
            }
          });
        } else if (section.title.toLowerCase().includes('device') || section.title.toLowerCase().includes('nameplate')) {
          console.log('Processing Device Data section:', section.fields);
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            if (fieldLabel.includes('manufacturer')) reportData.manufacturer = field.value;
            else if (fieldLabel.includes('class')) reportData.class = field.value;
            else if (fieldLabel.includes('ct ratio') || fieldLabel.includes('ratio')) reportData.ctRatio = field.value;
            else if (fieldLabel.includes('catalog') || fieldLabel.includes('catalog number')) reportData.catalogNumber = field.value;
            else if (fieldLabel.includes('voltage rating') || fieldLabel.includes('voltage')) reportData.voltageRating = field.value;
            else if (fieldLabel.includes('polarity facing') || fieldLabel.includes('polarity')) reportData.polarityFacing = field.value;
            else if (fieldLabel.includes('type')) reportData.type = field.value;
            else if (fieldLabel.includes('frequency')) reportData.frequency = field.value;
          });
        } else if (section.title === 'Visual and Mechanical Inspection') {
          console.log('Processing Visual and Mechanical Inspection section:', section.fields);
          // Clear the default array and populate with real data
          reportData.visualMechanicalInspection.length = 0;
          section.fields.forEach(field => {
            console.log(`Processing inspection field: "${field.label}" type: "${field.type}"`);
            if (field.type === 'table' && field.value && field.value.rows) {
              console.log('Found inspection table with rows:', field.value.rows);
              field.value.rows.forEach((row: any) => {
                reportData.visualMechanicalInspection.push({
                  netaSection: row.id || '',
                  description: row.description || '',
                  result: row.result || 'Select One'
                });
              });
              console.log(`Added ${field.value.rows.length} inspection items`);
            }
          });
        } else if (section.title === 'CT Identification') {
          console.log('Processing CT Identification section:', section.fields);
          // Handle CT Identification table
          section.fields.forEach(field => {
            console.log(`Processing CT ID field: "${field.label}" type: "${field.type}"`);
            if (field.type === 'table' && field.value && field.value.rows) {
              console.log('Found CT ID table with rows:', field.value.rows);
              field.value.rows.forEach((row: any, index: number) => {
                if (index === 0) {
                  reportData.phase1 = row.phase || '';
                  reportData.phase1Serial = row.serial || '';
                  console.log(`Set phase1: ${row.phase}, serial: ${row.serial}`);
                } else if (index === 1) {
                  reportData.phase2 = row.phase || '';
                  reportData.phase2Serial = row.serial || '';
                  console.log(`Set phase2: ${row.phase}, serial: ${row.serial}`);
                } else if (index === 2) {
                  reportData.phase3 = row.phase || '';
                  reportData.phase3Serial = row.serial || '';
                  console.log(`Set phase3: ${row.phase}, serial: ${row.serial}`);
                } else if (index === 3) {
                  reportData.neutral = row.phase || '';
                  reportData.neutralSerial = row.serial || '';
                  console.log(`Set neutral: ${row.phase}, serial: ${row.serial}`);
                }
              });
            }
          });
        } else if (section.title === 'Electrical Tests') {
          console.log('Processing Electrical Tests section:', section.fields);
          // Handle Electrical Tests section
          section.fields.forEach(field => {
            console.log(`Processing electrical test field: "${field.label}" type: "${field.type}"`);
            if (field.label.toLowerCase().includes('ratio') && field.label.toLowerCase().includes('polarity')) {
              if (field.type === 'table' && field.value && field.value.rows) {
                console.log('Found ratio/polarity table with rows:', field.value.rows);
                // Clear the default array and populate with real data
                reportData.electricalTests.ratioPolarity.length = 0;
                reportData.electricalTests.ratioPolarity = field.value.rows.map((row: any, index: number) => ({
                  id: row.id || `rp-${index}`,
                  identifier: row.identifier || '',
                  ratio: row.ratio || '',
                  testType: field.value.testType || 'voltage',
                  testValue: row.testValue || '',
                  pri: row.pri || '',
                  sec: row.sec || '',
                  measuredRatio: row.measuredRatio || '',
                  ratioDev: row.ratioDev || '',
                  polarity: row.polarity || 'Select One'
                }));
                console.log(`Added ${field.value.rows.length} ratio/polarity test items`);
              }
            } else if (field.label.toLowerCase().includes('primary') && field.label.toLowerCase().includes('winding')) {
              console.log('Found primary winding insulation data:', field.value);
              if (field.value) {
                reportData.electricalTests.primaryWindingInsulation = {
                  testVoltage: '1000V',
                  readingPhase1: field.value.readingPhase1 || '',
                  readingPhase2: field.value.readingPhase2 || '',
                  readingPhase3: field.value.readingPhase3 || '',
                  readingNeutral: field.value.readingNeutral || '',
                  units: 'MΩ',
                  tempCorrection20CPhase1: field.value.tempCorrection20CPhase1 || '',
                  tempCorrection20CPhase2: field.value.tempCorrection20CPhase2 || '',
                  tempCorrection20CPhase3: field.value.tempCorrection20CPhase3 || '',
                  tempCorrection20CNeutral: field.value.tempCorrection20CNeutral || ''
                };
                console.log('Set primary winding insulation data');
              }
            } else if (field.label.toLowerCase().includes('secondary') && field.label.toLowerCase().includes('winding')) {
              console.log('Found secondary winding insulation data:', field.value);
              if (field.value) {
                reportData.electricalTests.secondaryWindingInsulation = {
                  testVoltage: '1000V',
                  readingPhase1: field.value.readingPhase1 || '',
                  readingPhase2: field.value.readingPhase2 || '',
                  readingPhase3: field.value.readingPhase3 || '',
                  readingNeutral: field.value.readingNeutral || '',
                  units: 'MΩ',
                  tempCorrection20CPhase1: field.value.tempCorrection20CPhase1 || '',
                  tempCorrection20CPhase2: field.value.tempCorrection20CPhase2 || '',
                  tempCorrection20CPhase3: field.value.tempCorrection20CPhase3 || '',
                  tempCorrection20CNeutral: field.value.tempCorrection20CNeutral || ''
                };
                console.log('Set secondary winding insulation data');
              }
            }
          });
        } else if (section.title === 'Test Equipment Used') {
          console.log('Processing Test Equipment section:', section.fields);
          section.fields.forEach(field => {
            const fieldLabel = field.label.toLowerCase();
            if (fieldLabel.includes('megohmmeter')) {
              if (fieldLabel.includes('name')) reportData.megohmmeterName = field.value;
              else if (fieldLabel.includes('serial')) reportData.megohmmeterSerial = field.value;
              else if (fieldLabel.includes('amp') || fieldLabel.includes('id')) reportData.megohmmeterAmpId = field.value;
            } else if (fieldLabel.includes('ct ratio') || fieldLabel.includes('ratio test')) {
              if (fieldLabel.includes('name')) reportData.ctRatioTestSetName = field.value;
              else if (fieldLabel.includes('serial')) reportData.ctRatioTestSetSerial = field.value;
              else if (fieldLabel.includes('amp') || fieldLabel.includes('id')) reportData.ctRatioTestSetAmpId = field.value;
            }
          });
        } else if (section.title === 'Comments') {
          console.log('Processing Comments section:', section.fields);
          section.fields.forEach(field => {
            if (field.type === 'text' || field.type === 'textarea') {
              reportData.comments = field.value || '';
              console.log(`Set comments to: ${reportData.comments}`);
            }
          });
        }
      });
      
      // Also check data.fields as a fallback to ensure we capture all data
      if (data.data && data.data.fields) {
        console.log('Processing data.fields as fallback:', data.data.fields);
        const fields = data.data.fields;
        
        // Fill in any missing job information
        if (!reportData.customer && fields.customerName) reportData.customer = fields.customerName;
        if (!reportData.address && fields.customerAddress) reportData.address = fields.customerAddress;
        if (!reportData.user && fields.userName) reportData.user = fields.userName;
        if (!reportData.date && fields.date) reportData.date = fields.date;
        if (!reportData.jobNumber && fields.jobNumber) reportData.jobNumber = fields.jobNumber;
        if (!reportData.technicians && fields.technicians) reportData.technicians = fields.technicians;
        if (!reportData.substation && fields.substation) reportData.substation = fields.substation;
        if (!reportData.eqptLocation && fields.eqptLocation) reportData.eqptLocation = fields.eqptLocation;
        if (!reportData.identifier && fields.identifier) reportData.identifier = fields.identifier;
        
        // Fill in any missing temperature
        if (!reportData.temperature && fields.temperatureF) {
          const tempValue = parseFloat(fields.temperatureF) || 68;
          reportData.temperature = tempValue;
          console.log(`Set temperature from data.fields to: ${tempValue}°F`);
        }
        
        // Fill in any missing device data
        if (!reportData.manufacturer && fields.manufacturer) reportData.manufacturer = fields.manufacturer;
        if (!reportData.class && fields.class) reportData.class = fields.class;
        if (!reportData.ctRatio && fields.ctRatio) reportData.ctRatio = fields.ctRatio;
        if (!reportData.catalogNumber && fields.catalogNumber) reportData.catalogNumber = fields.catalogNumber;
        if (!reportData.voltageRating && fields.voltageRating) reportData.voltageRating = fields.voltageRating;
        if (!reportData.polarityFacing && fields.polarityFacing) reportData.polarityFacing = fields.polarityFacing;
        if (!reportData.type && fields.type) reportData.type = fields.type;
        if (!reportData.frequency && fields.frequency) reportData.frequency = fields.frequency;
        
        // Fill in any missing visual inspection data
        if (reportData.visualMechanicalInspection.length === 0 && fields['vm-table'] && fields['vm-table'].rows) {
          console.log('Setting visual inspection from data.fields vm-table');
          reportData.visualMechanicalInspection.length = 0;
          fields['vm-table'].rows.forEach((row: any) => {
            reportData.visualMechanicalInspection.push({
              netaSection: row.id || '',
              description: row.description || '',
              result: row.result || 'Select One'
            });
          });
        }
        
        // Fill in any missing CT identification data
        if (fields.ctId && fields.ctId.rows) {
          console.log('Setting CT identification from data.fields ctId');
          fields.ctId.rows.forEach((row: any, index: number) => {
            if (index === 0) {
              reportData.phase1 = row.phase || '';
              reportData.phase1Serial = row.serial || '';
            } else if (index === 1) {
              reportData.phase2 = row.phase || '';
              reportData.phase2Serial = row.serial || '';
            } else if (index === 2) {
              reportData.phase3 = row.phase || '';
              reportData.phase3Serial = row.serial || '';
            } else if (index === 3) {
              reportData.neutral = row.phase || '';
              reportData.neutralSerial = row.serial || '';
            }
          });
        }
        
        // Fill in any missing electrical test data
        if (!reportData.electricalTests.ratioPolarity || reportData.electricalTests.ratioPolarity.length === 0) {
          if (fields.ratioPolarity && fields.ratioPolarity.rows) {
            console.log('Setting ratio polarity from data.fields ratioPolarity');
            reportData.electricalTests.ratioPolarity = fields.ratioPolarity.rows.map((row: any, index: number) => ({
              id: row.id || `rp-${index}`,
              identifier: row.identifier || '',
              ratio: row.ratio || '',
              testType: 'voltage',
              testValue: row.testValue || '',
              pri: row.pri || '',
              sec: row.sec || '',
              measuredRatio: row.measuredRatio || '',
              ratioDev: row.ratioDev || '',
              polarity: row.polarity || 'Select One'
            }));
          }
        }
      }
    } else if (data.data && data.data.fields) {
      console.log('No sections found, using data.fields fallback:', data.data.fields);
      
      const fields = data.data.fields;
      
      // Job Information
      reportData.customer = fields.customer || '';
      reportData.address = fields.address || '';
      reportData.user = fields.user || '';
      reportData.date = fields.date || '';
      reportData.jobNumber = fields.jobNumber || '';
      reportData.technicians = fields.technicians || '';
      reportData.substation = fields.substation || '';
      reportData.eqptLocation = fields.eqptLocation || '';
      reportData.identifier = fields.identifier || '';
      
      // Environmental
      reportData.temperature = parseFloat(fields.temperatureF || fields.temperature || '0') || 0;
      reportData.humidity = parseFloat(fields.humidity || '0') || 0;
      
      // Device Data
      reportData.manufacturer = fields.manufacturer || '';
      reportData.class = fields.class || '';
      reportData.ctRatio = fields.ctRatio || '';
      reportData.catalogNumber = fields.catalogNumber || '';
      reportData.voltageRating = fields.voltageRating || '';
      reportData.polarityFacing = fields.polarityFacing || '';
      reportData.type = fields.type || '';
      reportData.frequency = fields.frequency || '';
      
      // CT Identification
      reportData.phase1 = fields.phase1 || '';
      reportData.phase1Serial = fields.phase1Serial || '';
      reportData.phase2 = fields.phase2 || '';
      reportData.phase2Serial = fields.phase2Serial || '';
      reportData.phase3 = fields.phase3 || '';
      reportData.phase3Serial = fields.phase3Serial || '';
      reportData.neutral = fields.neutral || '';
      reportData.neutralSerial = fields.neutralSerial || '';
      
      // Test Equipment
      reportData.megohmmeterName = fields.megohmmeterName || '';
      reportData.megohmmeterSerial = fields.megohmmeterSerial || '';
      reportData.megohmmeterAmpId = fields.megohmmeterAmpId || '';
      reportData.ctRatioTestSetName = fields.ctRatioTestSetName || '';
      reportData.ctRatioTestSetSerial = fields.ctRatioTestSetSerial || '';
      reportData.ctRatioTestSetAmpId = fields.ctRatioTestSetAmpId || '';
      
      // Comments
      reportData.comments = fields.comments || '';
      reportData.status = fields.status || 'PASS';
    }
    
    // Set default status if not already set
    if (!reportData.status) {
      reportData.status = 'PASS';
    }
    
    console.log('Final prepared data (raw):', reportData);

    // Normalize into component's expected shape
    const tempFVal = typeof reportData.temperature === 'number'
      ? reportData.temperature
      : (typeof (data as any)?.data?.fields?.temperatureF !== 'undefined' ? parseFloat((data as any).data.fields.temperatureF) : 68);
    const humidityVal = typeof reportData.humidity === 'number' ? reportData.humidity : (parseFloat((data as any)?.data?.fields?.humidity || '0') || 0);
    const celsiusVal = Math.round(((tempFVal || 68) - 32) * 5 / 9);

    const report_data = {
      // Job info
      customerName: reportData.customer || (data as any)?.data?.fields?.customerName || '',
      customerAddress: reportData.address || (data as any)?.data?.fields?.customerAddress || '',
      userName: reportData.user || (data as any)?.data?.fields?.userName || '',
      date: reportData.date || (data as any)?.data?.fields?.date || '',
      identifier: reportData.identifier || (data as any)?.data?.fields?.identifier || '',
      jobNumber: reportData.jobNumber || (data as any)?.data?.fields?.jobNumber || '',
      technicians: reportData.technicians || (data as any)?.data?.fields?.technicians || '',
      temperature: { fahrenheit: tempFVal || 68, celsius: celsiusVal, tcf: 1, humidity: humidityVal },
      substation: reportData.substation || (data as any)?.data?.fields?.substation || '',
      eqptLocation: reportData.eqptLocation || (data as any)?.data?.fields?.eqptLocation || '',

      // Device data
      deviceData: {
        manufacturer: reportData.manufacturer || (data as any)?.data?.fields?.manufacturer || '',
        class: reportData.class || (data as any)?.data?.fields?.class || '',
        ctRatio: reportData.ctRatio || (data as any)?.data?.fields?.ctRatio || '',
        catalogNumber: reportData.catalogNumber || (data as any)?.data?.fields?.catalogNumber || '',
        voltageRating: reportData.voltageRating || (data as any)?.data?.fields?.voltageRating || '',
        polarityFacing: reportData.polarityFacing || (data as any)?.data?.fields?.polarityFacing || '',
        type: reportData.type || (data as any)?.data?.fields?.type || '',
        frequency: reportData.frequency || (data as any)?.data?.fields?.frequency || ''
      },

      // Visual & Mechanical
      visualMechanicalInspection: Array.isArray(reportData.visualMechanicalInspection) ? reportData.visualMechanicalInspection : [],

      // CT Identification
      ctIdentification: {
        phase1: reportData.phase1 || '',
        phase1Serial: reportData.phase1Serial || '',
        phase2: reportData.phase2 || '',
        phase2Serial: reportData.phase2Serial || '',
        phase3: reportData.phase3 || '',
        phase3Serial: reportData.phase3Serial || '',
        neutral: reportData.neutral || '',
        neutralSerial: reportData.neutralSerial || ''
      },

      // Electrical Tests
      electricalTests: {
        ratioPolarity: (reportData.electricalTests?.ratioPolarity || []).map((row: any, idx: number) => ({
          id: row.id || `rp-${idx}`,
          identifier: row.identifier || '',
          ratio: row.ratio || '',
          testType: (row.testType || reportData.electricalTests?.ratioPolarity?.[0]?.testType || 'voltage'),
          testValue: row.testValue || '',
          pri: row.pri || '',
          sec: row.sec || '',
          measuredRatio: row.measuredRatio || '',
          ratioDev: row.ratioDev || '',
          polarity: row.polarity || 'Select One'
        })),
        primaryWindingInsulation: {
          testVoltage: reportData.electricalTests?.primaryWindingInsulation?.testVoltage || (data as any)?.data?.fields?.primaryInsulation?.testVoltage || '1000V',
          readingPhase1: reportData.electricalTests?.primaryWindingInsulation?.readingPhase1 || (data as any)?.data?.fields?.primaryInsulation?.readingPhase1 || '',
          readingPhase2: reportData.electricalTests?.primaryWindingInsulation?.readingPhase2 || (data as any)?.data?.fields?.primaryInsulation?.readingPhase2 || '',
          readingPhase3: reportData.electricalTests?.primaryWindingInsulation?.readingPhase3 || (data as any)?.data?.fields?.primaryInsulation?.readingPhase3 || '',
          readingNeutral: reportData.electricalTests?.primaryWindingInsulation?.readingNeutral || (data as any)?.data?.fields?.primaryInsulation?.readingNeutral || '',
          units: reportData.electricalTests?.primaryWindingInsulation?.units || 'MΩ',
          tempCorrection20CPhase1: reportData.electricalTests?.primaryWindingInsulation?.tempCorrection20CPhase1 || (data as any)?.data?.fields?.primaryInsulation?.tempCorrection20CPhase1 || '',
          tempCorrection20CPhase2: reportData.electricalTests?.primaryWindingInsulation?.tempCorrection20CPhase2 || (data as any)?.data?.fields?.primaryInsulation?.tempCorrection20CPhase2 || '',
          tempCorrection20CPhase3: reportData.electricalTests?.primaryWindingInsulation?.tempCorrection20CPhase3 || (data as any)?.data?.fields?.primaryInsulation?.tempCorrection20CPhase3 || '',
          tempCorrection20CNeutral: reportData.electricalTests?.primaryWindingInsulation?.tempCorrection20CNeutral || (data as any)?.data?.fields?.primaryInsulation?.tempCorrection20CNeutral || ''
        },
        secondaryWindingInsulation: {
          testVoltage: reportData.electricalTests?.secondaryWindingInsulation?.testVoltage || (data as any)?.data?.fields?.secondaryInsulation?.testVoltage || '1000V',
          readingPhase1: reportData.electricalTests?.secondaryWindingInsulation?.readingPhase1 || (data as any)?.data?.fields?.secondaryInsulation?.readingPhase1 || '',
          readingPhase2: reportData.electricalTests?.secondaryWindingInsulation?.readingPhase2 || (data as any)?.data?.fields?.secondaryInsulation?.readingPhase2 || '',
          readingPhase3: reportData.electricalTests?.secondaryWindingInsulation?.readingPhase3 || (data as any)?.data?.fields?.secondaryInsulation?.readingPhase3 || '',
          readingNeutral: reportData.electricalTests?.secondaryWindingInsulation?.readingNeutral || (data as any)?.data?.fields?.secondaryInsulation?.readingNeutral || '',
          units: reportData.electricalTests?.secondaryWindingInsulation?.units || 'MΩ',
          tempCorrection20CPhase1: reportData.electricalTests?.secondaryWindingInsulation?.tempCorrection20CPhase1 || (data as any)?.data?.fields?.secondaryInsulation?.tempCorrection20CPhase1 || '',
          tempCorrection20CPhase2: reportData.electricalTests?.secondaryWindingInsulation?.tempCorrection20CPhase2 || (data as any)?.data?.fields?.secondaryInsulation?.tempCorrection20CPhase2 || '',
          tempCorrection20CPhase3: reportData.electricalTests?.secondaryWindingInsulation?.tempCorrection20CPhase3 || (data as any)?.data?.fields?.secondaryInsulation?.tempCorrection20CPhase3 || '',
          tempCorrection20CNeutral: reportData.electricalTests?.secondaryWindingInsulation?.tempCorrection20CNeutral || (data as any)?.data?.fields?.secondaryInsulation?.tempCorrection20CNeutral || ''
        }
      },

      // Test Equipment Used
      testEquipmentUsed: {
        megohmmeterName: reportData.megohmmeterName || (data as any)?.data?.fields?.megohmmeter || '',
        megohmmeterSerial: reportData.megohmmeterSerial || (data as any)?.data?.fields?.serialNumber || '',
        megohmmeterAmpId: reportData.megohmmeterAmpId || (data as any)?.data?.fields?.ampId || '',
        ctRatioTestSetName: reportData.ctRatioTestSetName || (data as any)?.data?.fields?.ctRatioTestSetName || '',
        ctRatioTestSetSerial: reportData.ctRatioTestSetSerial || (data as any)?.data?.fields?.ctRatioTestSetSerial || '',
        ctRatioTestSetAmpId: reportData.ctRatioTestSetAmpId || (data as any)?.data?.fields?.ctRatioTestSetAmpId || ''
      },

      comments: reportData.comments || (data as any)?.data?.fields?.comments || '',
      status: reportData.status || 'PASS'
    };

    console.log('Normalized report_data for component:', report_data);

    return {
      job_id: jobId,
      user_id: userId,
      report_data
    };
  }

  protected getReportType(): string {
    return '12-current-transformer-test-mts-report';
  }
}
