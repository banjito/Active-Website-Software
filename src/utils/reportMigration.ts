/**
 * Report Migration Utilities
 * 
 * This file contains utilities to migrate existing reports to the new standardized structure.
 */

import { 
  BaseReportData, 
  StandardReportRecord, 
  StandardNameplateData,
  StandardVisualInspection,
  VisualInspectionItem,
  ReportType,
  createStandardJobInfo,
  createStandardEnvironmental,
  createStandardMetadata
} from '../types/standardReportStructure';

// Legacy report structure patterns we need to handle
interface LegacyReportPattern1 {
  // Pattern 1: report_info + separate columns
  report_info?: any;
  nameplate_data?: any;
  visual_inspection?: any;
  test_equipment?: any;
  [key: string]: any;
}

interface LegacyReportPattern2 {
  // Pattern 2: report_data with everything nested
  report_data?: any;
  [key: string]: any;
}

interface LegacyReportPattern3 {
  // Pattern 3: flat structure
  customer?: string;
  customerName?: string;
  address?: string;
  date?: string;
  technicians?: string;
  temperature?: any;
  [key: string]: any;
}

type LegacyReport = LegacyReportPattern1 | LegacyReportPattern2 | LegacyReportPattern3;

/**
 * Extracts job information from various legacy formats
 */
export const extractJobInfo = (legacyReport: LegacyReport): BaseReportData['jobInfo'] => {
  // Try to extract from different possible locations
  const reportInfo = (legacyReport as LegacyReportPattern1).report_info;
  const reportData = (legacyReport as LegacyReportPattern2).report_data;
  const flatData = legacyReport as LegacyReportPattern3;

  // Extract customer name from various possible fields
  const customer = reportInfo?.customer || 
                  reportData?.customer || 
                  reportData?.customerName ||
                  flatData.customer || 
                  flatData.customerName || 
                  '';

  // Extract address from various possible fields  
  const address = reportInfo?.address || 
                 reportData?.address ||
                 reportData?.customerAddress ||
                 flatData.address || 
                 '';

  // Extract date from various possible fields
  const date = reportInfo?.date || 
              reportData?.date ||
              reportData?.testDate ||
              flatData.date || 
              new Date().toISOString().split('T')[0];

  // Extract other fields
  const technicians = reportInfo?.technicians || 
                     reportData?.technicians ||
                     flatData.technicians || 
                     '';

  const jobNumber = reportInfo?.jobNumber || 
                   reportData?.jobNumber ||
                   flatData.jobNumber || 
                   '';

  const substation = reportInfo?.substation || 
                    reportData?.substation ||
                    flatData.substation || 
                    '';

  const eqptLocation = reportInfo?.eqptLocation || 
                      reportData?.eqptLocation ||
                      reportData?.equipmentLocation ||
                      flatData.eqptLocation || 
                      '';

  const identifier = reportInfo?.identifier || 
                    reportData?.identifier ||
                    flatData.identifier || 
                    '';

  const userName = reportInfo?.userName || 
                  reportInfo?.user ||
                  reportData?.userName ||
                  reportData?.user ||
                  flatData.userName ||
                  flatData.user || 
                  '';

  return createStandardJobInfo({
    customer,
    address,
    date,
    technicians,
    jobNumber,
    substation,
    eqptLocation,
    identifier,
    userName
  });
};

/**
 * Extracts environmental data from various legacy formats
 */
export const extractEnvironmental = (legacyReport: LegacyReport): BaseReportData['environmental'] => {
  const reportInfo = (legacyReport as LegacyReportPattern1).report_info;
  const reportData = (legacyReport as LegacyReportPattern2).report_data;
  const flatData = legacyReport as LegacyReportPattern3;

  // Extract temperature data
  const tempData = reportInfo?.temperature || 
                  reportData?.temperature ||
                  flatData.temperature || 
                  {};

  const fahrenheit = tempData.fahrenheit || tempData.ambient || 68;
  const celsius = tempData.celsius || 20;
  const tcf = tempData.tcf || tempData.correctionFactor || 1.0;
  const humidity = tempData.humidity || reportData?.humidity || flatData.humidity || 50;

  return createStandardEnvironmental({
    temperature: {
      fahrenheit,
      celsius,
      tcf
    },
    humidity
  });
};

/**
 * Extracts and standardizes visual inspection data
 */
export const extractVisualInspection = (legacyReport: LegacyReport): StandardVisualInspection | undefined => {
  const reportInfo = (legacyReport as LegacyReportPattern1).report_info;
  const reportData = (legacyReport as LegacyReportPattern2).report_data;
  const visualInspection = (legacyReport as LegacyReportPattern1).visual_inspection;
  const flatData = legacyReport as LegacyReportPattern3;

  // Try to find visual inspection data
  const visualData = visualInspection ||
                    reportData?.visualInspection ||
                    reportData?.visualInspectionItems ||
                    reportData?.visualMechanicalInspection ||
                    flatData.visualInspectionItems ||
                    flatData.visualMechanicalInspection;

  if (!visualData) return undefined;

  let items: VisualInspectionItem[] = [];

  // Handle array format (most common)
  if (Array.isArray(visualData)) {
    items = visualData.map((item: any) => ({
      netaSection: item.netaSection || item.id || '',
      description: item.description || '',
      result: item.result || 'Select One',
      comments: item.comments || item.notes || undefined
    }));
  }
  // Handle object format (key-value pairs)
  else if (typeof visualData === 'object') {
    items = Object.entries(visualData).map(([key, value]: [string, any]) => {
      // Handle cases where value is a string (result) or object with result and comments
      if (typeof value === 'string') {
        return {
          netaSection: key,
          description: key, // Use key as description if not available
          result: value as VisualInspectionItem['result'],
        };
      } else if (typeof value === 'object' && value.result) {
        return {
          netaSection: key,
          description: value.description || key,
          result: value.result as VisualInspectionItem['result'],
          comments: value.comments
        };
      }
      return {
        netaSection: key,
        description: key,
        result: 'Select One' as VisualInspectionItem['result']
      };
    });
  }

  // Extract general comments
  const generalComments = reportData?.visualInspectionComments ||
                         reportData?.visualMechanicalInspectionComments ||
                         flatData.visualInspectionComments;

  return {
    items,
    generalComments
  };
};

/**
 * Extracts and standardizes nameplate data
 */
export const extractNameplateData = (legacyReport: LegacyReport): StandardNameplateData | undefined => {
  const nameplateData = (legacyReport as LegacyReportPattern1).nameplate_data;
  const reportData = (legacyReport as LegacyReportPattern2).report_data;
  const flatData = legacyReport as LegacyReportPattern3;

  // Try to find nameplate data
  const nameplate = nameplateData ||
                   reportData?.nameplateData ||
                   reportData?.nameplate ||
                   reportData?.deviceData ||
                   reportData?.nameplate_data;

  if (!nameplate && !flatData.manufacturer) return undefined;

  return {
    manufacturer: nameplate?.manufacturer || flatData.manufacturer || '',
    catalogNumber: nameplate?.catalogNumber || nameplate?.catalogNo || flatData.catalogNumber || '',
    serialNumber: nameplate?.serialNumber || flatData.serialNumber || '',
    type: nameplate?.type || flatData.type || undefined,
    manufacturingDate: nameplate?.manufacturingDate || nameplate?.dateOfMfg || undefined
  };
};

/**
 * Main migration function that converts a legacy report to standardized structure
 */
export const migrateReportToStandardStructure = (
  legacyReport: LegacyReport,
  reportType: ReportType,
  jobId: string,
  userId: string
): StandardReportRecord => {
  // Extract standardized components
  const jobInfo = extractJobInfo(legacyReport);
  const environmental = extractEnvironmental(legacyReport);
  const metadata = createStandardMetadata(reportType, {
    status: legacyReport.status || 'PENDING'
  });

  // Build the standardized report_info
  const report_info: BaseReportData = {
    jobInfo,
    environmental,
    metadata,
    comments: legacyReport.comments || ''
  };

  // Extract other standardized sections
  const nameplate_data = extractNameplateData(legacyReport);
  const visual_inspection = extractVisualInspection(legacyReport);

  // Preserve equipment-specific data in the equipment_specific section
  const equipment_specific: { [key: string]: any } = {};
  
  // Copy over any fields that don't fit the standard structure
  Object.keys(legacyReport).forEach(key => {
    if (!['report_info', 'nameplate_data', 'visual_inspection', 'test_equipment', 
          'customer', 'customerName', 'address', 'date', 'technicians', 'temperature',
          'jobNumber', 'substation', 'eqptLocation', 'identifier', 'userName',
          'status', 'comments', 'report_data'].includes(key)) {
      equipment_specific[key] = (legacyReport as any)[key];
    }
  });

  // If we had report_data, preserve any unhandled fields
  const reportData = (legacyReport as LegacyReportPattern2).report_data;
  if (reportData) {
    Object.keys(reportData).forEach(key => {
      if (!['customer', 'customerName', 'address', 'date', 'technicians', 'temperature',
            'jobNumber', 'substation', 'eqptLocation', 'identifier', 'userName',
            'nameplateData', 'nameplate', 'visualInspection', 'visualInspectionItems',
            'visualMechanicalInspection'].includes(key)) {
        equipment_specific[key] = reportData[key];
      }
    });
  }

  return {
    id: legacyReport.id || '',
    job_id: jobId,
    user_id: userId,
    created_at: legacyReport.created_at || new Date().toISOString(),
    updated_at: legacyReport.updated_at || new Date().toISOString(),
    report_info,
    nameplate_data,
    visual_inspection,
    equipment_specific: Object.keys(equipment_specific).length > 0 ? equipment_specific : undefined
  };
};

/**
 * Utility to identify which migration pattern a report follows
 */
export const identifyReportPattern = (report: LegacyReport): 'pattern1' | 'pattern2' | 'pattern3' | 'unknown' => {
  if (report.report_info && typeof report.report_info === 'object') {
    return 'pattern1'; // report_info + separate columns
  }
  
  if (report.report_data && typeof report.report_data === 'object') {
    return 'pattern2'; // report_data with everything nested
  }
  
  if (report.customer || report.customerName || report.address) {
    return 'pattern3'; // flat structure
  }
  
  return 'unknown';
};

/**
 * Batch migration utility for multiple reports
 */
export const batchMigrateReports = (
  reports: LegacyReport[],
  reportType: ReportType,
  jobId: string,
  userId: string
): { migrated: StandardReportRecord[]; errors: { report: LegacyReport; error: string }[] } => {
  const migrated: StandardReportRecord[] = [];
  const errors: { report: LegacyReport; error: string }[] = [];

  reports.forEach(report => {
    try {
      const migratedReport = migrateReportToStandardStructure(report, reportType, jobId, userId);
      migrated.push(migratedReport);
    } catch (error) {
      errors.push({
        report,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return { migrated, errors };
}; 