// Report name mappings based on the names used in JobDetail.tsx defaultAssets
// This ensures consistency between dropdown names, report titles, and save names

export const REPORT_NAMES: { [key: string]: string } = {
  // ATS Reports
  'switchgear-report': '1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21',
  'panelboard-report': '1-Panelboard Inspection & Test Report ATS 21',
  'dry-type-transformer': '2-Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
  'large-dry-type-transformer-report': '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
  'large-dry-type-transformer': '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
  'liquid-filled-transformer': '2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
  'oil-inspection': '2-Oil Xfmr. Inspection and Test ATS 21',
  'two-small-dry-typer-xfmr-ats-report': '2-Small Dry Typer Xfmr. Inspection and Test ATS',
  'low-voltage-cable-test-12sets': '3-Low Voltage Cable Test ATS',
  'low-voltage-cable-test-20sets': '3-Low Voltage Cable Test ATS 20 sets',
  'medium-voltage-vlf-tan-delta': '4-Medium Voltage Cable VLF Tan Delta Test ATS',
  'medium-voltage-vlf': '4-Medium Voltage Cable VLF Test ATS',
  'medium-voltage-cable-vlf-test': '4-Medium Voltage Cable VLF Test With Tan Delta ATS',
  'metal-enclosed-busway': '5-Metal Enclosed Busway ATS',
  'low-voltage-switch-multi-device-test': '6-Low Voltage Switch - Multi-Device TEST',
  'low-voltage-switch-report': '6-Low Voltage Switch ATS',
  'medium-voltage-switch-oil-report': '7-Medium Voltage Way Switch (OIL) Report ATS 21',
  'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report': '8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Secondary Injection',
  'low-voltage-circuit-breaker-electronic-trip-ats-report': '8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Primary Injection',
  'low-voltage-circuit-breaker-thermal-magnetic-ats-report': '8-Low Voltage Circuit Breaker Thermal-Magnetic ATS',
  'low-voltage-panelboard-small-breaker-report': '8-Low Voltage Panelboard Small Breaker Test ATS (up to 60 individual breakers)',
  'medium-voltage-circuit-breaker-report': '9-Medium Voltage Circuit Breaker Test Report ATS',
  'current-transformer-test-ats-report': '12-Current Transformer Test ATS (partial, single CT)',
  '12-current-transformer-test-ats-report': '12-Current Transformer Test ATS',
  'automatic-transfer-switch-ats-report': '35-Automatic Transfer Switch ATS',

  // MTS Reports
  'switchgear-panelboard-mts-report': '1-Switchgear, Switchboard, Panelboard Inspection & Test Report MTS',
  'large-dry-type-transformer-mts-report': '2-Large Dry Type Xfmr. Inspection and Test MTS 23',
  'large-dry-type-xfmr-mts-report': '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test MTS',
  'liquid-xfmr-visual-mts-report': '2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test MTS',
  'two-small-dry-typer-xfmr-mts-report': '2-Small Dry Typer Xfmr. Inspection and Test MTS',
  'low-voltage-cable-test-3sets': '3-Low Voltage Cable MTS',
  'electrical-tan-delta-test-mts-form': '4-Medium Voltage Cable VLF Tan Delta MTS',
  'medium-voltage-vlf-tan-delta-mts': '4-Medium Voltage Cable VLF Tan Delta Test MTS',
  'medium-voltage-vlf-mts-report': '4-Medium Voltage Cable VLF Test Report MTS',
  'medium-voltage-cable-vlf-test-mts': '4-Medium Voltage Cable VLF Test With Tan Delta MTS',
  'low-voltage-circuit-breaker-electronic-trip-mts-report': '8-Low Voltage Circuit Breaker Electronic Trip Unit MTS - Primary Injection',
  'low-voltage-circuit-breaker-thermal-magnetic-mts-report': '8-Low Voltage Circuit Breaker Thermal-Magnetic MTS',
  'medium-voltage-circuit-breaker-mts-report': '9-Medium Voltage Circuit Breaker Test Report MTS',
  '12-current-transformer-test-mts-report': '12-Current Transformer Test MTS',
  '13-voltage-potential-transformer-test-mts-report': '13-Voltage Potential Transformer Test MTS',
  '23-medium-voltage-motor-starter-mts-report': '23-Medium Voltage Motor Starter MTS Report'
};

// Helper function to get report name by route slug
export const getReportName = (routeSlug: string): string => {
  return REPORT_NAMES[routeSlug] || 'Unknown Report';
};

// Helper function to get asset name for saving (includes identifier)
export const getAssetName = (routeSlug: string, identifier?: string): string => {
  const reportName = getReportName(routeSlug);
  if (identifier && identifier.trim()) {
    return `${reportName} - ${identifier.trim()}`;
  }
  return reportName;
}; 