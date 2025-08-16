import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class MetalEnclosedBuswayImporter extends BaseImporter implements ReportImporter {
  protected tableName = 'metal_enclosed_busway_reports';
  protected requiredColumns = ['job_id', 'user_id', 'report_info', 'visual_mechanical', 'insulation_resistance', 'visual_mechanical_inspection', 'bus_resistance', 'test_equipment', 'comments', 'status'];

  canImport(data: ReportData): boolean {
    console.log(`MetalEnclosedBusway Importer checking: ${data.reportType}`);
    const t = (data.reportType || (data as any)?.data?.reportType || '').toLowerCase();
    const canImport = t.includes('metalenclosedbusway') || t.includes('metal_enclosed_busway') || t.includes('metal enclosed busway');
    console.log(`MetalEnclosedBusway Importer canImport result: ${canImport}`);
    return canImport;
  }

  async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    return this.insertReport(data, jobId, userId);
  }

  protected prepareData(data: ReportData, jobId: string, userId: string, _schema: DatabaseSchema): any {
    console.log('🔍 MetalEnclosedBuswayImporter - Starting prepareData');
    console.log('🔍 Input data structure:', data);
    console.log('🔍 Sections:', (data as any)?.sections);
    
    const f: any = (data as any)?.data?.fields || {};
    const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;

    // Report Info (Job Information + Nameplate Data)
    const reportInfo = {
      customer: f.customer || '',
      address: f.address || '',
      user: f.user || '',
      date: f.date || '',
      jobNumber: f.jobNumber || '',
      technicians: f.technicians || '',
      substation: f.substation || '',
      eqptLocation: f.eqptLocation || '',
      identifier: f.identifier || '',
      temperature: toNum(f.temperatureF ?? 68),
      humidity: toNum(f.humidity ?? 0),
      
      // Nameplate Data
      manufacturer: f.manufacturer || '',
      catalogNumber: f.catalogNumber || '',
      serialNumber: f.serialNumber || '',
      fedFrom: f.fedFrom || '',
      conductorMaterial: f.conductorMaterial || '',
      ratedVoltage: f.ratedVoltage || '',
      operatingVoltage: f.operatingVoltage || '',
      ampacity: f.ampacity || '',
    };

    // Visual and Mechanical Inspection
    const vmData = f['vm-table'] || {};
    const vmRows: any[] = Array.isArray(vmData.rows) ? vmData.rows : [];
    const visualMechanicalInspection = vmRows.map(row => ({
      id: row.id || '',
      description: row.description || '',
      result: row.result || 'Select One',
    }));

    // Bus Resistance (Contact/Pole Resistance)
    const busResistanceData = f.busResistance || {};
    const busResistance = {
      p1: busResistanceData.p1 || '',
      p2: busResistanceData.p2 || '',
      p3: busResistanceData.p3 || '',
      neutral: busResistanceData.neutral || '',
      units: 'µΩ',
    };

    // Insulation Resistance with Temperature Correction
    // Look for insulation resistance data in the sections array
    let irData: any = {};
    let teData: any = {};
    
    // Extract data from sections if available
    if ((data as any)?.sections) {
      const sections = (data as any).sections;
      console.log('🔍 MetalEnclosedBuswayImporter - Found sections:', sections);
      
      // Find insulation resistance section
      const irSection = sections.find((s: any) => s.title === 'Electrical Tests - Insulation Resistance');
      console.log('🔍 MetalEnclosedBuswayImporter - IR section found:', irSection);
      if (irSection?.fields?.[0]?.value) {
        irData = irSection.fields[0].value;
        console.log('🔍 MetalEnclosedBuswayImporter - IR data extracted:', irData);
        console.log('🔍 MetalEnclosedBuswayImporter - IR readings:', irData.readings);
        console.log('🔍 MetalEnclosedBuswayImporter - IR testVoltage:', irData.testVoltage);
        console.log('🔍 MetalEnclosedBuswayImporter - IR units:', irData.units);
      }
      
      // Find test equipment section
      const teSection = sections.find((s: any) => s.title === 'Test Equipment Used');
      console.log('🔍 MetalEnclosedBuswayImporter - TE section found:', teSection);
      if (teSection?.fields?.[0]?.value) {
        teData = teSection.fields[0].value;
        console.log('🔍 MetalEnclosedBuswayImporter - TE data extracted:', teData);
      }
    }
    
    // Fallback to fields if sections not found
    if (!irData.testVoltage) {
      irData = f.buswayIr || {};
    }
    if (!teData.megohmmeter) {
      teData = f.testEquipment3 || {};
    }
    
    const temperatureF = toNum(f.temperatureF ?? 68);
    const temperatureC = (temperatureF - 32) * 5/9; // Convert to Celsius
    
    // Temperature Correction Factor (TCF) calculation
    // Base reference temperature is 20°C
    const baseTempC = 20;
    const tcf = Math.pow(1.6, (temperatureC - baseTempC) / 10); // Standard TCF formula
    
    const originalReadings = {
      aToB: irData.readings?.['A-B'] || '',
      bToC: irData.readings?.['B-C'] || '',
      cToA: irData.readings?.['C-A'] || '',
      aToN: irData.readings?.['A-N'] || '',
      bToN: irData.readings?.['B-N'] || '',
      cToN: irData.readings?.['C-N'] || '',
      aToG: irData.readings?.['A-G'] || '',
      bToG: irData.readings?.['B-G'] || '',
      cToG: irData.readings?.['C-G'] || '',
      nToG: irData.readings?.['N-G'] || '',
    };
    
    // Calculate temperature-corrected readings
    const correctedReadings = {
      aToB: originalReadings.aToB ? (parseFloat(originalReadings.aToB) * tcf).toFixed(2) : '',
      bToC: originalReadings.bToC ? (parseFloat(originalReadings.bToC) * tcf).toFixed(2) : '',
      cToA: originalReadings.cToA ? (parseFloat(originalReadings.cToA) * tcf).toFixed(2) : '',
      aToN: originalReadings.aToN ? (parseFloat(originalReadings.aToN) * tcf).toFixed(2) : '',
      bToN: originalReadings.bToN ? (parseFloat(originalReadings.bToN) * tcf).toFixed(2) : '',
      cToN: originalReadings.cToN ? (parseFloat(originalReadings.cToN) * tcf).toFixed(2) : '',
      aToG: originalReadings.aToG ? (parseFloat(originalReadings.aToG) * tcf).toFixed(2) : '',
      bToG: originalReadings.bToG ? (parseFloat(originalReadings.bToG) * tcf).toFixed(2) : '',
      cToG: originalReadings.cToG ? (parseFloat(originalReadings.cToG) * tcf).toFixed(2) : '',
      nToG: originalReadings.nToG ? (parseFloat(originalReadings.nToG) * tcf).toFixed(2) : '',
    };
    
    const insulationResistance = {
      testVoltage: irData.testVoltage || '500V',
      units: irData.units || 'MΩ',
      temperature: temperatureF,
      temperatureC: temperatureC.toFixed(1),
      tcf: tcf.toFixed(3),
      readings: originalReadings,
      correctedReadings: correctedReadings,
    };

    // Test Equipment
    const testEquipment = {
      megohmmeter: {
        name: teData.megohmmeter?.name || '',
        serialNumber: teData.megohmmeter?.serialNumber || '',
        ampId: '',
      },
      lowResistanceOhmmeter: {
        name: '',
        serialNumber: teData.lowResistanceOhmmeter?.serialNumber || '',
        ampId: '',
      },
      primaryInjectionTestSet: {
        name: '',
        serialNumber: '',
        ampId: '',
      },
    };

    // Debug logging
    console.log('🔍 MetalEnclosedBuswayImporter - Data prepared:');
    console.log('  - reportInfo:', reportInfo);
    console.log('  - visualMechanicalInspection:', visualMechanicalInspection);
    console.log('  - busResistance:', busResistance);
    console.log('  - insulationResistance:', insulationResistance);
    console.log('  - testEquipment:', testEquipment);
    console.log('  - temperatureF:', temperatureF);
    console.log('  - temperatureC:', temperatureC);
    console.log('  - tcf:', tcf);
    console.log('  - originalReadings:', originalReadings);
    console.log('  - correctedReadings:', correctedReadings);

    // Use the correct column names that exist in the table
    const result = {
      job_id: jobId,
      user_id: userId,
      report_info: reportInfo,
      visual_mechanical: visualMechanicalInspection,
      insulation_resistance: insulationResistance,
      visual_mechanical_inspection: visualMechanicalInspection,
      bus_resistance: busResistance,
      test_equipment: testEquipment,
      comments: f.comments || '',
      status: 'PASS',
    };
    
    console.log('🔍 MetalEnclosedBuswayImporter - Final result being returned:');
    console.log('  - result:', result);
    console.log('  - insulation_resistance column data:', result.insulation_resistance);
    console.log('  - insulation_resistance.readings:', result.insulation_resistance.readings);
    console.log('  - insulation_resistance.correctedReadings:', result.insulation_resistance.correctedReadings);
    
    return result;
  }

  protected getReportType(): string {
    return 'metal-enclosed-busway';
  }
}
