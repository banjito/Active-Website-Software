import { SwitchgearImporter } from './SwitchgearImporter';
import { PanelboardImporter } from './PanelboardImporter';
import { LargeDryTypeTransformerImporter } from './LargeDryTypeTransformerImporter';
import { LargeDryTypeTransformerATSImporter } from './LargeDryTypeTransformerATSImporter';
import { CurrentTransformerATSImporter } from './CurrentTransformerATSImporter';
import { LiquidFilledTransformerImporter } from './LiquidFilledTransformerImporter';
import { MediumVoltageVLFImporter } from './MediumVoltageVLFImporter';
import { MediumVoltageVLFMTSImporter } from './MediumVoltageVLFMTSImporter';
import { MediumVoltageCableVLFWithTanDeltaMTSImporter } from './MediumVoltageCableVLFWithTanDeltaMTSImporter';
import { TanDeltaTestMTSImporter } from './TanDeltaTestMTSImporter';
// import { TanDeltaTestMTSImporter } from './TanDeltaTestMTSImporter';
// TanDeltaImporter imported below to avoid duplicate import
import { LowVoltageCableImporter } from './LowVoltageCableImporter';
import { MediumVoltageCircuitBreakerImporter } from './MediumVoltageCircuitBreakerImporter';
import { LowVoltageCircuitBreakerImporter } from './LowVoltageCircuitBreakerImporter';
import { LowVoltageSwitchImporter } from './LowVoltageSwitchImporter';
import { LowVoltagePanelboardSmallBreakerImporter } from './LowVoltagePanelboardSmallBreakerImporter';
import { AutomaticTransferSwitchImporter } from './AutomaticTransferSwitchImporter';
import { MetalEnclosedBuswayImporter } from './MetalEnclosedBuswayImporter';
import { OilInspectionImporter } from './OilInspectionImporter';
import { MediumVoltageSwitchOilImporter } from './MediumVoltageSwitchOilImporter';
import { TwoSmallDryTypeTransformerImporter } from './TwoSmallDryTypeTransformerImporter';
import { TwoSmallDryTyperXfmrMTSImporter } from './TwoSmallDryTyperXfmrMTSImporter';
import { TwoSmallDryTyperXfmrATSImporter } from './TwoSmallDryTyperXfmrATSImporter.ts';
import { VoltagePotentialTransformerImporter } from './VoltagePotentialTransformerImporter';
import { MediumVoltageMotorStarterImporter } from './MediumVoltageMotorStarterImporter';
import { SwitchgearPanelboardMTSImporter } from './SwitchgearPanelboardMTSImporter';
import { LiquidXfmrVisualMTSImporter } from './LiquidXfmrVisualMTSImporter';
import { LargeDryTypeXfmrMTSImporter } from './LargeDryTypeXfmrMTSImporter';
import { DryTypeTransformerImporter } from './DryTypeTransformerImporter';
import { LowVoltageSwitchMultiDeviceImporter } from './LowVoltageSwitchMultiDeviceImporter';
import { MediumVoltageCableVLFImporter } from './MediumVoltageCableVLFImporter';
import { CurrentTransformerMTSImporter } from './CurrentTransformerMTSImporter';
import { MediumVoltageCircuitBreakerMTSImporter } from './MediumVoltageCircuitBreakerMTSImporter';
import { LowVoltageCircuitBreakerElectronicTripImporter } from './LowVoltageCircuitBreakerElectronicTripImporter';
import { LowVoltageCable12SetsImporter } from './LowVoltageCable12SetsImporter';
import { LowVoltageCable20SetsImporter } from './LowVoltageCable20SetsImporter';
import { TanDeltaImporter } from './TanDeltaImporter';
import { ReportData, ReportImportResult, ReportImporter } from './types';
import { LowVoltageCircuitBreakerElectronicTripATSSecondaryImporter } from './LowVoltageCircuitBreakerElectronicTripATSSecondaryImporter';
import { LowVoltageCircuitBreakerElectronicTripMTSImporter } from './LowVoltageCircuitBreakerElectronicTripMTSImporter';

export class ReportImportService {
  private importers = [
    new SwitchgearImporter(),
    new PanelboardImporter(),
    new LargeDryTypeTransformerImporter(),
    new LargeDryTypeTransformerATSImporter(),
    new CurrentTransformerATSImporter(),
    new LiquidFilledTransformerImporter(),
    new MediumVoltageCableVLFWithTanDeltaMTSImporter(),
    new MediumVoltageVLFMTSImporter(),
    new TanDeltaTestMTSImporter(),
    new TanDeltaImporter(),
    new MediumVoltageVLFImporter(),
    new LowVoltageCableImporter(),
    new MediumVoltageCircuitBreakerImporter(),
    new LowVoltageCircuitBreakerImporter(),
    new LowVoltageSwitchImporter(),
    new LowVoltagePanelboardSmallBreakerImporter(),
    new AutomaticTransferSwitchImporter(),
    new MetalEnclosedBuswayImporter(),
    new OilInspectionImporter(),
    new MediumVoltageSwitchOilImporter(),
    new TwoSmallDryTyperXfmrATSImporter(),
    new TwoSmallDryTyperXfmrMTSImporter(),
    new TwoSmallDryTypeTransformerImporter(),
    new VoltagePotentialTransformerImporter(),
    new MediumVoltageMotorStarterImporter(),
    new SwitchgearPanelboardMTSImporter(),
    new LiquidXfmrVisualMTSImporter(),
    new LargeDryTypeXfmrMTSImporter(),
    new DryTypeTransformerImporter(),
    new LowVoltageSwitchMultiDeviceImporter(),
    new MediumVoltageCableVLFImporter(),
    new CurrentTransformerMTSImporter(),
    new MediumVoltageCircuitBreakerMTSImporter(),
    new LowVoltageCircuitBreakerElectronicTripImporter(), // ATS Primary Injection (visual)
    new LowVoltageCircuitBreakerElectronicTripATSSecondaryImporter(), // ATS Secondary Injection
    new LowVoltageCircuitBreakerElectronicTripMTSImporter(), // MTS Primary Injection
    new LowVoltageCable12SetsImporter(),
    new LowVoltageCable20SetsImporter(),
  ];

  async importReport(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    console.log('🚀 Starting report import...');
    console.log('📊 Report data structure:', {
      hasReportType: !!data.reportType,
      reportType: data.reportType,
      hasData: !!data.data,
      hasDataReportType: !!(data.data && data.data.reportType),
      dataReportType: data.data?.reportType,
      hasSections: !!(data.sections && data.sections.length > 0),
      sectionsCount: data.sections?.length || 0,
      hasDataFields: !!(data.data && data.data.fields),
      dataFieldsCount: data.data?.fields ? Object.keys(data.data.fields).length : 0
    });

    // Override: "Medium Voltage Cable VLF Test With Tan Delta MTS" should route to the combined VLF MTS form
    try {
      const tRoot = (data.reportType || '').toLowerCase();
      const tData = (data.data?.reportType || '').toLowerCase();
      const isMtsTanDeltaFormTitle =
        tRoot.includes('medium voltage cable vlf test with tan delta mts') ||
        tData.includes('medium voltage cable vlf test with tan delta mts') ||
        tRoot.includes('tandeltatestmtsform') ||
        tData.includes('tandeltatestmtsform');
      if (isMtsTanDeltaFormTitle) {
        const combined = this.importers.find(i => i.constructor.name === 'MediumVoltageCableVLFWithTanDeltaMTSImporter');
        if (combined) {
          console.log('🔁 Overriding to MediumVoltageCableVLFWithTanDeltaMTSImporter for "With Tan Delta MTS" combined form');
          return await combined.import(data, jobId, userId);
        }
      }
    } catch {}

    // Removed TanDeltaTestMTSImporter override for this test

    // Special-case detection: If the payload clearly contains Tan Delta test data,
    // force use of TanDeltaImporter even if the reportType string is ambiguous
    try {
      const tSections = (data.sections || []).map(s => (s.title || '').toLowerCase());
      const fields: any = (data as any)?.data?.fields || {};
      const hasTanDeltaSection = tSections.some(t => t.includes('tan delta'));
      const tStr = ((data.reportType || data.data?.reportType || '') + '').toLowerCase();
      const hasTanDeltaString = tStr.includes('tandelta') || (tStr.includes('tan') && tStr.includes('delta')) || tStr.includes('tan-delta') || tStr.includes('tan_delta');
      const hasTanDeltaFields = !!fields.mvTanDelta || !!fields.tanDelta || !!fields.tandelta;
      const indicatesMTS = ((data.reportType || data.data?.reportType || '') + '').toLowerCase().includes('mts');
      
      // Only force Tan Delta importer for ATS reports, not MTS
      if ((hasTanDeltaSection || hasTanDeltaFields || hasTanDeltaString) && !indicatesMTS) {
        console.log('🔍 Forcing TanDeltaImporter for ATS report with Tan Delta content');
        const tanDeltaImporter = this.importers.find(i => i.constructor.name === 'TanDeltaImporter');
        if (tanDeltaImporter) {
          return tanDeltaImporter.import(data, jobId, userId);
        }
      }
    } catch (error) {
      console.warn('Error in Tan Delta detection:', error);
    }
    
    // First try to find importer by reportType field
    if (data.reportType) {
      console.log(`🔍 Looking for importer by root reportType: ${data.reportType}`);
      const importer = this.findImporterByReportType(data.reportType);
      if (importer) {
        console.log(`✅ Found importer by root reportType: ${importer.constructor.name}`);
        console.log(`📋 Importer table: ${(importer as any).tableName}`);
        console.log(`🔍 Report type: ${data.reportType}, Selected importer: ${importer.constructor.name}`);
        try {
          return await importer.import(data, jobId, userId);
        } catch (error: any) {
          console.error('❌ Error importing report by root reportType:', error);
          return {
            success: false,
            error: error.message || 'Failed to import report'
          };
        }
      } else {
        console.log(`❌ No importer found for root reportType: ${data.reportType}`);
        console.log('📋 Available report types in mapping:', Object.keys(this.getReportTypeMap()));
        
        // Special debugging for Tan Delta reports
        if (data.reportType && data.reportType.toLowerCase().includes('tandelta')) {
          console.log('🔍 Tan Delta report detected - checking mapping details...');
          const mapping = this.getReportTypeMap();
          Object.entries(mapping).forEach(([key, importer]) => {
            if (importer.constructor.name === 'TanDeltaImporter') {
              console.log(`🔍 TanDeltaImporter mapped to: ${key}`);
            }
          });
        }
      }
    }
    
    // Also check data.reportType if it exists
    if (data.data && data.data.reportType) {
      console.log(`🔍 Looking for importer by data.reportType: ${data.data.reportType}`);
      const importer = this.findImporterByReportType(data.data.reportType);
      if (importer) {
        console.log(`✅ Found importer by data.reportType: ${importer.constructor.name}`);
        console.log(`📋 Importer table: ${(importer as any).tableName}`);
        try {
          return await importer.import(data, jobId, userId);
        } catch (error: any) {
          console.error('❌ Error importing report by data.reportType:', error);
          return {
            success: false,
            error: error.message || 'Failed to import report'
          };
        }
      } else {
        console.log(`❌ No importer found for data.reportType: ${data.data.reportType}`);
        console.log('📋 Available report types in mapping:', Object.keys(this.getReportTypeMap()));
      }
    }
    
    if (!data.reportType && (!data.data || !data.data.reportType)) {
      console.log('No reportType field found in data');
    }

    // Fallback to the old method
    console.log('🔄 Trying fallback importer detection...');
    const importer = this.importers.find(imp => imp.canImport(data));

    if (!importer) {
      console.log('❌ No suitable importer found. Available importers:', this.importers.map(i => i.constructor.name));
      return {
        success: false,
        error: 'No suitable importer found for this report type'
      };
    }

    console.log(`✅ Using fallback importer: ${importer.constructor.name}`);
    try {
      return await importer.import(data, jobId, userId);
    } catch (error: any) {
      console.error('❌ Error importing report:', error);
      return {
        success: false,
        error: error.message || 'Failed to import report'
      };
    }
  }

  // Batch import multiple reports; returns lists of successes and failures
  async batchImportReports(
    reports: ReportData[],
    jobId: string,
    userId: string
  ): Promise<{ successful: { data: ReportData; result: ReportImportResult }[]; failed: { data: ReportData; error: string }[] }> {
    const successful: { data: ReportData; result: ReportImportResult }[] = [];
    const failed: { data: ReportData; error: string }[] = [];

    for (const data of reports) {
      try {
        const result = await this.importReport(data, jobId, userId);
        if (result && (result as any).success !== false && !(result as any).error) {
          successful.push({ data, result });
        } else {
          failed.push({ data, error: (result as any)?.error || 'Import failed' });
        }
      } catch (err: any) {
        failed.push({ data, error: err?.message || 'Import error' });
      }
    }

    return { successful, failed };
  }

  private findImporterByReportType(reportType: string): ReportImporter | null {
    // Create a mapping from reportType to importer
    const reportTypeMap = this.createReportTypeMap();

    // First try exact match
    if (reportTypeMap[reportType]) {
      console.log(`Exact match found for ${reportType}: ${reportTypeMap[reportType].constructor.name}`);
      return reportTypeMap[reportType];
    }

    // Then try exact match without .tsx extension
    const reportTypeWithoutExt = reportType.replace('.tsx', '');
    if (reportTypeMap[reportTypeWithoutExt]) {
      console.log(`Exact match found for ${reportTypeWithoutExt}: ${reportTypeMap[reportTypeWithoutExt].constructor.name}`);
      return reportTypeMap[reportTypeWithoutExt];
    }

    // Finally try partial matching as fallback
    for (const [key, importer] of Object.entries(reportTypeMap)) {
      if (reportType.includes(key)) {
        console.log(`Partial match found: ${reportType} includes ${key} -> ${importer.constructor.name}`);
        return importer;
      }
    }

    console.log(`No importer found for reportType: ${reportType}`);
    console.log('Available keys in mapping:', Object.keys(reportTypeMap));
    return null;
  }

  // Helper method to create the report type mapping
  private createReportTypeMap(): { [key: string]: ReportImporter } {
    const reportTypeMap: { [key: string]: ReportImporter } = {};
    
    // Explicit mappings to ensure correct routing for VLF ATS tests
    try {
      const vlfImporter = this.importers.find(i => i.constructor.name === 'MediumVoltageVLFImporter');
      if (vlfImporter) {
        reportTypeMap['MediumVoltageCableVLFATSTest'] = vlfImporter;
        reportTypeMap['MediumVoltageCableVLFATSTest.tsx'] = vlfImporter;
      }
    } catch {}

    this.importers.forEach(importer => {
      // Map common report type patterns to importers
      if (importer.constructor.name.includes('MediumVoltageMotorStarter')) {
        // Register all modern keys for MTS/ATS variants
        reportTypeMap['MediumVoltageMotorStarterMTSReport'] = importer;
        reportTypeMap['MediumVoltageMotorStarterMTSReport.tsx'] = importer;
        reportTypeMap['23-MediumVoltageMotorStarterMTSReport'] = importer;
        reportTypeMap['23-MediumVoltageMotorStarterMTSReport.tsx'] = importer;
        reportTypeMap['medium-voltage-motor-starter-mts-report'] = importer; // route slug
        reportTypeMap['MediumVoltageMotorStarterATSReport'] = importer;
        reportTypeMap['MediumVoltageMotorStarterATSReport.tsx'] = importer;
      } else if (importer.constructor.name === 'SwitchgearImporter') {
        // Basic switchgear reports (ATS version)
        reportTypeMap['SwitchgearReport'] = importer;
        reportTypeMap['SwitchgearReport.tsx'] = importer;
      } else if (importer.constructor.name === 'SwitchgearPanelboardMTSImporter') {
        // MTS version of switchgear reports
        reportTypeMap['SwitchgearPanelboardMTSReport'] = importer;
        reportTypeMap['SwitchgearPanelboardMTSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('Switchgear')) {
        // Fallback for any other switchgear importers
        reportTypeMap['SwitchgearReport'] = importer;
        reportTypeMap['SwitchgearReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('Panelboard')) {
        reportTypeMap['PanelboardReport'] = importer;
        reportTypeMap['PanelboardReport.tsx'] = importer;
        reportTypeMap['LowVoltagePanelboardSmallBreakerTestATSReport'] = importer;
        reportTypeMap['LowVoltagePanelboardSmallBreakerTestATSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('LowVoltageCable')) {
        if (importer.constructor.name.includes('LowVoltageCableImporter')) {
          // This is the 3-sets MTS importer
          reportTypeMap['3-LowVoltageCableMTS'] = importer;
          reportTypeMap['3-LowVoltageCableMTS.tsx'] = importer;
          reportTypeMap['LowVoltageCableMTS'] = importer;
          reportTypeMap['lowvoltagecablemts'] = importer;
        } else if (importer.constructor.name.includes('LowVoltageCable12SetsImporter')) {
          // This is the 12-sets ATS importer
          reportTypeMap['3-LowVoltageCableATS'] = importer;
          reportTypeMap['3-LowVoltageCableATS.tsx'] = importer;
          reportTypeMap['LowVoltageCableATS'] = importer;
          reportTypeMap['lowvoltagecableats'] = importer;
          reportTypeMap['LowVoltageCable12Sets'] = importer;
          reportTypeMap['lowvoltagecable12sets'] = importer;
        } else if (importer.constructor.name.includes('LowVoltageCable20SetsImporter')) {
          // This is the 20-sets ATS importer (also routes to 12-sets)
          reportTypeMap['LowVoltageCable20Sets'] = importer;
          reportTypeMap['lowvoltagecable20sets'] = importer;
        }
      } else if (importer.constructor.name === 'MediumVoltageVLFMTSImporter') {
        // MTS VLF report mappings
        reportTypeMap['MediumVoltageCableVLFMTSTestReport'] = importer;
        reportTypeMap['MediumVoltageCableVLFMTSTestReport.tsx'] = importer;
        reportTypeMap['MediumVoltageCableVLFMTSTest'] = importer; // alternate
        reportTypeMap['MediumVoltageCableVLFMTSTest.tsx'] = importer; // alternate
        reportTypeMap['medium-voltage-vlf-mts-report'] = importer; // route (no Tan Delta)
      } else if (importer.constructor.name === 'MediumVoltageCableVLFWithTanDeltaMTSImporter') {
        // Combined VLF + Tan Delta MTS form
        reportTypeMap['Medium Voltage Cable VLF Test With Tan Delta MTS'] = importer;
        reportTypeMap['Medium Voltage Cable VLF Test With Tan Delta MTS.tsx'] = importer;
        reportTypeMap['TanDeltaTestMTSForm'] = importer;
        reportTypeMap['TanDeltaTestMTSForm.tsx'] = importer;
        reportTypeMap['medium-voltage-cable-vlf-test-mts'] = importer; // route slug
      } else if (importer.constructor.name === 'TanDeltaTestMTSImporter') {
        // Only map explicit Tan Delta standalone MTS form keys (not the combined VLF+TD form)
        reportTypeMap['TanDeltaTestMTSForm'] = importer;
        reportTypeMap['TanDeltaTestMTSForm.tsx'] = importer;
      } else if (importer.constructor.name.includes('MediumVoltageVLF')) {
        // ATS-only mappings for VLF (do not include MTS here to avoid overriding MTS importer)
        reportTypeMap['MediumVoltageCableVLFATSTest'] = importer;
        reportTypeMap['MediumVoltageCableVLFATSTest.tsx'] = importer;
      } else if (importer.constructor.name.includes('CurrentTransformerATS')) {
        reportTypeMap['CurrentTransformerTestATSReport'] = importer;
        reportTypeMap['CurrentTransformerTestATSReport.tsx'] = importer;
        reportTypeMap['12-CurrentTransformerTestATSReport'] = importer;
        reportTypeMap['12-CurrentTransformerTestATSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('CurrentTransformerMTS')) {
        reportTypeMap['CurrentTransformerTestMTSReport'] = importer;
        reportTypeMap['CurrentTransformerTestMTSReport.tsx'] = importer;
        reportTypeMap['12-CurrentTransformerTestMTSReport'] = importer;
        reportTypeMap['12-CurrentTransformerTestMTSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('CurrentTransformer')) {
        // Fallback for any other current transformer importers
        reportTypeMap['CurrentTransformerTestATSReport'] = importer;
        reportTypeMap['CurrentTransformerTestATSReport.tsx'] = importer;
        reportTypeMap['CurrentTransformerTestMTSReport'] = importer;
        reportTypeMap['CurrentTransformerTestMTSReport.tsx'] = importer;
        reportTypeMap['12-CurrentTransformerTestATSReport'] = importer;
        reportTypeMap['12-CurrentTransformerTestATSReport.tsx'] = importer;
        reportTypeMap['12-CurrentTransformerTestMTSReport'] = importer;
        reportTypeMap['12-CurrentTransformerTestMTSReport.tsx'] = importer;
      } else if (importer.constructor.name === 'LowVoltageCircuitBreakerElectronicTripATSSecondaryImporter') {
        reportTypeMap['LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport'] = importer;
        reportTypeMap['LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport.tsx'] = importer;
      } else if (importer.constructor.name === 'LowVoltageCircuitBreakerElectronicTripMTSImporter') {
        reportTypeMap['LowVoltageCircuitBreakerElectronicTripMTSReport'] = importer;
        reportTypeMap['LowVoltageCircuitBreakerElectronicTripMTSReport.tsx'] = importer;
      } else if (importer.constructor.name === 'LowVoltageCircuitBreakerElectronicTripImporter') {
        reportTypeMap['LowVoltageCircuitBreakerElectronicTripATSReport'] = importer;
        reportTypeMap['LowVoltageCircuitBreakerElectronicTripATSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('LiquidFilledTransformer')) {
        reportTypeMap['LiquidFilledTransformerReportATS'] = importer;
        reportTypeMap['LiquidFilledTransformerReportATS.tsx'] = importer;
      } else if (importer.constructor.name.includes('LargeDryTypeTransformer') && !importer.constructor.name.includes('ATS')) {
        // This is the LargeDryTypeTransformerImporter (MTS only)
        reportTypeMap['LargeDryTypeTransformerMTSReport'] = importer;
        reportTypeMap['LargeDryTypeTransformerMTSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('LargeDryTypeTransformerATS')) {
        // This is the LargeDryTypeTransformerATSImporter (ATS only)
        reportTypeMap['LargeDryTypeTransformerReport'] = importer;
        reportTypeMap['LargeDryTypeTransformerReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('LargeDryTypeXfmr')) {
        // This is the LargeDryTypeXfmrMTSImporter
        reportTypeMap['LargeDryTypeXfmrMTSReport'] = importer;
        reportTypeMap['LargeDryTypeXfmrMTSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('LargeDryType') && !importer.constructor.name.includes('Transformer')) {
        // Fallback for any other LargeDryType importers (not Transformer)
        reportTypeMap['LargeDryTypeXfmrMTSReport'] = importer;
        reportTypeMap['LargeDryTypeXfmrMTSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('TwoSmallDryTyperXfmrATSImporter')) {
        reportTypeMap['TwoSmallDryTypeXfmrATSReport'] = importer;
        reportTypeMap['TwoSmallDryTypeXfmrATSReport.tsx'] = importer;
        reportTypeMap['two-small-dry-typer-xfmr-ats-report'] = importer;
      } else if (importer.constructor.name.includes('TwoSmallDryTyperXfmrMTSImporter')) {
        reportTypeMap['TwoSmallDryTypeXfmrMTSReport'] = importer;
        reportTypeMap['TwoSmallDryTypeXfmrMTSReport.tsx'] = importer;
        reportTypeMap['two-small-dry-typer-xfmr-mts-report'] = importer;
      } else if (importer.constructor.name.includes('DryType')) {
        reportTypeMap['DryTypeTransformerReport'] = importer;
        reportTypeMap['DryTypeTransformerReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('OilInspection')) {
        reportTypeMap['OilInspectionReport'] = importer;
        reportTypeMap['OilInspectionReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('AutomaticTransferSwitch')) {
        reportTypeMap['AutomaticTransferSwitchATSReport'] = importer;
        reportTypeMap['AutomaticTransferSwitchATSReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('MetalEnclosedBusway')) {
        reportTypeMap['MetalEnclosedBuswayReport'] = importer;
        reportTypeMap['MetalEnclosedBuswayReport.tsx'] = importer;
      } else if (importer.constructor.name === 'LowVoltageSwitchImporter') {
        // Single-switch report
        reportTypeMap['LowVoltageSwitchReport'] = importer;
        reportTypeMap['LowVoltageSwitchReport.tsx'] = importer;
      } else if (importer.constructor.name === 'LowVoltageSwitchMultiDeviceImporter') {
        // Multi-device report
        reportTypeMap['LowVoltageSwitchMultiDeviceTest'] = importer;
        reportTypeMap['LowVoltageSwitchMultiDeviceTest.tsx'] = importer;
      } else if (importer.constructor.name.includes('MediumVoltageCircuitBreaker')) {
        if (importer.constructor.name === 'MediumVoltageCircuitBreakerMTSImporter') {
          // MTS version
          reportTypeMap['MediumVoltageCircuitBreakerMTSReport'] = importer;
          reportTypeMap['MediumVoltageCircuitBreakerMTSReport.tsx'] = importer;
        } else if (importer.constructor.name === 'MediumVoltageCircuitBreakerImporter') {
          // Regular version
          reportTypeMap['MediumVoltageCircuitBreakerReport'] = importer;
          reportTypeMap['MediumVoltageCircuitBreakerReport.tsx'] = importer;
        }
      } else if (importer.constructor.name.includes('MediumVoltageSwitchOil')) {
        reportTypeMap['MediumVoltageSwitchOilReport'] = importer;
        reportTypeMap['MediumVoltageSwitchOilReport.tsx'] = importer;
      } else if (importer.constructor.name.includes('VoltagePotentialTransformer')) {
        reportTypeMap['13-VoltagePotentialTransformerTestMTSReport'] = importer;
        reportTypeMap['13-VoltagePotentialTransformerTestMTSReport.tsx'] = importer;
      } else if (importer.constructor.name === 'TanDeltaImporter') {
        reportTypeMap['MediumVoltageCableVLFTestWithTanDeltaATS'] = importer;
        reportTypeMap['MediumVoltageCableVLFTestWithTanDeltaATS.tsx'] = importer;
        reportTypeMap['medium-voltage-cable-vlf-test'] = importer; // ATS Tan Delta
        reportTypeMap['medium-voltage-vlf-tan-delta'] = importer; // ATS route
        // Note: MTS Tan Delta forms should NOT map here - they go to VLF MTS importer
      } else if (importer.constructor.name === 'MediumVoltageVLFImporter') {
        // ATS-only mappings for VLF (do not include MTS here to avoid overriding MTS importer)
        reportTypeMap['MediumVoltageCableVLFATSTest'] = importer;
        reportTypeMap['MediumVoltageCableVLFATSTest.tsx'] = importer;
      } else if (importer.constructor.name.includes('LiquidXfmrVisual')) {
        reportTypeMap['LiquidXfmrVisualMTSReport'] = importer;
        reportTypeMap['LiquidXfmrVisualMTSReport.tsx'] = importer;
      }
    });
    
    return reportTypeMap;
  }

  // Helper method to get the report type mapping for debugging
  private getReportTypeMap(): { [key: string]: ReportImporter } {
    return this.createReportTypeMap();
  }
}

// Export a singleton instance
export const reportImportService = new ReportImportService(); 