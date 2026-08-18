// Report name mappings based on the names used in JobDetail.tsx defaultAssets
// This ensures consistency between dropdown names, report titles, and save names

export const REPORT_NAMES: { [key: string]: string } = {
  // ATS Reports
  'switchgear-report': '1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21',
  'switchgear-switchboard-assemblies-ats25': '7.1.1 Switchgear & Switchboard Assemblies Test Sheet ATS 25',
  'panelboard-assemblies-ats25': '7.1.2 Panelboard Assemblies Test Sheet ATS 25',
  'small-lv-dry-type-transformer-ats25': '7.2.1.1 Small Low Voltage Dry Type Transformer Test Sheet ATS 25',
  'liquid-filled-xfmr-ats25': '7.2.2 Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 25',
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
  'medium-voltage-switch-sf6-report': 'Medium Voltage Way Switch (SF6)',
  'potential-transformer-ats-report': 'Potential Transformer ATS',
  'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report': '8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Secondary Injection',
  'low-voltage-circuit-breaker-electronic-trip-ats-report': '8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Primary Injection',
  'low-voltage-circuit-breaker-thermal-magnetic-ats-report': '8-Low Voltage Circuit Breaker Thermal-Magnetic ATS',
  'low-voltage-panelboard-small-breaker-report': '8-Low Voltage Panelboard Small Breaker Test ATS (up to 60 individual breakers)',
  'medium-voltage-circuit-breaker-report': '9-Medium Voltage Circuit Breaker Test Report ATS',
  'current-transformer-test-ats-report': '12-Current Transformer Test ATS (partial, single CT)',
  '12-current-transformer-test-ats-report': '12-Current Transformer Test ATS',
  'automatic-transfer-switch-ats-report': '35-Automatic Transfer Switch ATS',
  'grounding-system-master': 'Grounding System MASTER',
  'grounding-fall-of-potential-slope-method-test': 'Grounding Fall of Potential Slope Method Test',
  'lv-molded-case-circuit-breaker-ats25': 'LV Circuit Breaker ATS 25',
  'emergency-systems-engine-generator-ats25': '7.22.1 Emergency Systems, Engine Generator Test Sheet ATS 25',

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
  'lv-circuit-breaker-mts25': 'LV Circuit Breaker MTS 25',
  'medium-voltage-circuit-breaker-mts-report': '9-Medium Voltage Circuit Breaker Test Report MTS',
  '12-current-transformer-test-mts-report': '12-Current Transformer Test MTS',
  '13-voltage-potential-transformer-test-mts-report': '13-Voltage Potential Transformer Test MTS',
  '23-medium-voltage-motor-starter-mts-report': '23-Medium Voltage Motor Starter MTS Report',
  '23-medium-voltage-switch-mts-report': '23-Medium Voltage Switch MTS',
  '6-low-voltage-switch-maint-mts-report': '6-Low Voltage Switch Maint. MTS',
  
  // GFI Trip Test Report
  'gfi-trip-test-report': 'Ground Fault Trip Test Report',
  
  // Applied Voltage Test Report
  'applied-voltage-test-ats-report': 'Applied Voltage Test ATS',

  // Internal Forms
  'job-hazard-analysis-form': 'Job Hazard Analysis Form'
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

// The two halves of an asset name. Assets are stored as a single
// "<report type> - <asset identifier>" string (see getAssetName above), but the
// project views show them as two separate values: the report type (which repeats
// across many assets) and the asset identifier (the unique piece of equipment).
export interface AssetNameParts {
  reportType: string;
  assetIdentifier: string;
}

// Known report titles, longest first, so that a title that is a prefix of
// another one (e.g. '2-Large Dry Type Xfmr. …') never wins over the longer match.
const KNOWN_REPORT_NAMES: string[] = Array.from(
  new Set(Object.values(REPORT_NAMES)),
).sort((a, b) => b.length - a.length);

const ASSET_NAME_SEPARATOR = " - ";

const splitOnSeparator = (
  name: string,
  reportType: string,
): AssetNameParts | null => {
  if (name === reportType) {
    return { reportType, assetIdentifier: "" };
  }
  if (name.startsWith(reportType + ASSET_NAME_SEPARATOR)) {
    return {
      reportType,
      assetIdentifier: name
        .slice(reportType.length + ASSET_NAME_SEPARATOR.length)
        .trim(),
    };
  }
  return null;
};

// Lists re-render on every keystroke in the report search boxes, so results are
// cached: the same handful of names is split over and over.
const splitCache = new Map<string, AssetNameParts>();

/**
 * Split a stored asset name into its report type and asset identifier.
 *
 * Pass `routeSlug` (the report slug from the asset's `file_url`) whenever it is
 * known — it pins the report type instead of relying on the name itself.
 */
export const splitAssetName = (
  assetName: string,
  routeSlug?: string,
): AssetNameParts => {
  const cacheKey = `${routeSlug || ""}\u0000${assetName || ""}`;
  const cached = splitCache.get(cacheKey);
  if (cached) return cached;
  const parts = computeAssetNameParts(assetName, routeSlug);
  splitCache.set(cacheKey, parts);
  return parts;
};

const computeAssetNameParts = (
  assetName: string,
  routeSlug?: string,
): AssetNameParts => {
  const name = (assetName || "").trim();
  if (!name) return { reportType: "", assetIdentifier: "" };

  // 1. Preferred: the report type the slug maps to.
  const slugReportName = routeSlug ? REPORT_NAMES[routeSlug] : undefined;
  if (slugReportName) {
    const bySlug = splitOnSeparator(name, slugReportName);
    if (bySlug) return bySlug;
  }

  // 2. Any other known report title the name starts with. Covers assets saved
  //    before a slug was renamed, and assets we have no slug for (PDF uploads).
  for (const reportName of KNOWN_REPORT_NAMES) {
    const byName = splitOnSeparator(name, reportName);
    if (byName) return byName;
  }

  // 3. The report title was renamed since the asset was saved (or this is a
  //    custom form / imported PDF). Fall back to the last separator: report
  //    titles may contain ' - ' themselves, identifiers almost never do.
  const lastSep = name.lastIndexOf(ASSET_NAME_SEPARATOR);
  if (lastSep > 0) {
    return {
      reportType: slugReportName || name.slice(0, lastSep).trim(),
      assetIdentifier: name.slice(lastSep + ASSET_NAME_SEPARATOR.length).trim(),
    };
  }

  // 4. Nothing to split on — the whole name is the report type.
  return { reportType: slugReportName || name, assetIdentifier: "" };
};

/**
 * Pull the report route slug out of an asset `file_url`
 * (`report:/jobs/{jobId}/{slug}/{reportId}`). Returns undefined for PDF
 * uploads, custom forms and anything else that is not a report asset.
 */
export const getReportSlugFromFileUrl = (
  fileUrl?: string | null,
): string | undefined => {
  if (!fileUrl || !fileUrl.startsWith("report:")) return undefined;
  const parts = (fileUrl.split(":/")[1] || "").split("/");
  // ['jobs', jobId, slug, reportId]
  const slug = (parts[2] || "").split("?")[0];
  return slug || undefined;
};