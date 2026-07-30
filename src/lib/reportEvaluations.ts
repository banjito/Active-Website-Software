import { supabase } from "./supabase";

/** Equipment evaluation result recorded at the top of every test report. */
export type EvaluationResult = "PASS" | "FAIL" | "LIMITED SERVICE";

/**
 * Report route slug -> storage table. Each report type keeps its own table, so
 * resolving an asset's evaluation means parsing its `report:/` file_url and
 * looking the slug up here. Mirrors the maps in JobDetail / DiscrepancyTracker.
 */
export const REPORT_SLUG_TO_TABLE: Record<string, string> = {
  "switchgear-switchboard-assemblies-ats25":
    "switchgear_switchboard_ats25_reports",
  "panelboard-assemblies-ats25": "panelboard_assemblies_ats25_reports",
  "small-lv-dry-type-transformer-ats25":
    "small_lv_dry_type_transformer_ats25_reports",
  "liquid-filled-xfmr-ats25": "liquid_filled_xfmr_ats25_reports",
  "panelboard-report": "panelboard_reports",
  "switchgear-report": "switchgear_reports",
  "dry-type-transformer": "transformer_reports",
  "large-dry-type-transformer-report": "large_transformer_reports",
  "large-dry-type-transformer": "large_transformer_reports",
  "large-dry-type-transformer-mts-report":
    "large_dry_type_transformer_mts_reports",
  "large-dry-type-xfmr-mts-report": "large_dry_type_transformer_mts_reports",
  "liquid-xfmr-visual-mts-report": "liquid_xfmr_visual_mts_reports",
  "low-voltage-switch-report": "low_voltage_switch_reports",
  "medium-voltage-switch-oil-report": "medium_voltage_switch_oil_reports",
  "medium-voltage-switch-sf6": "medium_voltage_switch_sf6_reports",
  "medium-voltage-switch-sf6-report": "medium_voltage_switch_sf6_reports",
  "potential-transformer-ats-report": "potential_transformer_ats_reports",
  "low-voltage-panelboard-small-breaker-report":
    "low_voltage_panelboard_small_breaker_reports",
  "medium-voltage-circuit-breaker-report":
    "medium_voltage_circuit_breaker_reports",
  "medium-voltage-circuit-breaker-mts-report":
    "medium_voltage_circuit_breaker_mts_reports",
  "medium-voltage-vlf-mts-report": "medium_voltage_vlf_mts_reports",
  "medium-voltage-cable-vlf-test-mts": "medium_voltage_vlf_mts_reports",
  "medium-voltage-vlf": "medium_voltage_vlf_mts_reports",
  "medium-voltage-vlf-tan-delta": "tandelta_reports",
  "medium-voltage-vlf-tan-delta-mts": "tandelta_mts_reports",
  "electrical-tan-delta-test-mts-form": "tandelta_mts_reports",
  "medium-voltage-cable-vlf-test": "medium_voltage_cable_vlf_test",
  "current-transformer-test-ats-report": "current_transformer_test_ats_reports",
  "12-current-transformer-test-ats-report":
    "current_transformer_test_ats_reports",
  "12-current-transformer-test-mts-report":
    "current_transformer_test_mts_reports",
  "13-voltage-potential-transformer-test-mts-report":
    "voltage_potential_transformer_mts_reports",
  "23-medium-voltage-motor-starter-mts-report":
    "medium_voltage_motor_starter_mts_reports",
  "23-medium-voltage-switch-mts-report": "medium_voltage_switch_mts_reports",
  "metal-enclosed-busway": "metal_enclosed_busway_reports",
  "metal-enclosed-busway-report": "metal_enclosed_busway_reports",
  "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
    "low_voltage_circuit_breaker_thermal_magnetic_mts_reports",
  "lv-molded-case-circuit-breaker-ats25":
    "lv_molded_case_circuit_breaker_ats25",
  "emergency-systems-engine-generator-ats25":
    "emergency_systems_engine_generator_ats25",
  "low-voltage-circuit-breaker-electronic-trip-ats-report":
    "low_voltage_circuit_breaker_electronic_trip_ats",
  "low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report":
    "low_voltage_circuit_breaker_electronic_trip_ats",
  "low-voltage-circuit-breaker-thermal-magnetic-ats-report":
    "low_voltage_circuit_breaker_thermal_magnetic_ats",
  "automatic-transfer-switch-ats-report":
    "automatic_transfer_switch_ats_reports",
  "gfi-trip-test-report": "gfi_trip_test_reports",
  "low-voltage-circuit-breaker-electronic-trip-mts-report":
    "low_voltage_circuit_breaker_electronic_trip_mts",
  "low-voltage-circuit-breaker-electronic-trip-mts":
    "low_voltage_circuit_breaker_electronic_trip_mts",
  "low-voltage-circuit-breaker-electronic-trip-unit-mts":
    "low_voltage_circuit_breaker_electronic_trip_mts",
  "two-small-dry-typer-xfmr-mts-report": "two_small_dry_type_xfmr_mts_reports",
  "two-small-dry-typer-xfmr-ats-report": "two_small_dry_type_xfmr_ats_reports",
  "low-voltage-cable-test-3sets": "low_voltage_cable_test_3sets",
  "low-voltage-cable-test-12sets": "low_voltage_cable_test_12sets",
  "low-voltage-cable-test-20sets": "transformer_reports",
  "low-voltage-switch-multi-device-test":
    "low_voltage_switch_multi_device_reports",
  "switchgear-panelboard-mts-report": "switchgear_panelboard_mts_reports",
  "liquid-filled-transformer": "liquid_filled_transformer_reports",
  "liquid-filled-transformer-report": "liquid_filled_transformer_reports",
  "oil-inspection": "oil_inspection_reports",
  "grounding-system-master": "grounding_system_master_reports",
  "grounding-fall-of-potential-slope-method-test":
    "grounding_fall_of_potential_slope_method_test_reports",
  "standard-report": "standard_reports",
  "6-low-voltage-switch-maint-mts-report":
    "low_voltage_switch_maint_mts_reports",
  "applied-voltage-test-ats-report": "applied_voltage_test_ats_reports",
  "3-low-voltage-cable-mts": "low_voltage_cable_mts_reports",
  "3-low-voltage-cable-ats": "low_voltage_cable_ats_reports",
};

/** Legacy tables some reports were saved into before slugs were canonicalized. */
const SLUG_FALLBACK_TABLES: Record<string, string[]> = {
  "low-voltage-panelboard-small-breaker-report": ["low_voltage_cable_test_3sets"],
  "low-voltage-switch-multi-device-test": ["low_voltage_cable_test_3sets"],
  "medium-voltage-vlf-mts-report": ["medium_voltage_cable_vlf_test"],
  "medium-voltage-cable-vlf-test-mts": ["medium_voltage_cable_vlf_test"],
  "low-voltage-circuit-breaker-electronic-trip-mts-report": [
    "low_voltage_cable_test_3sets",
  ],
  "low-voltage-circuit-breaker-thermal-magnetic-ats-report": [
    "low_voltage_cable_test_3sets",
  ],
};

/** Grounding-style reports carry an extra substation folder segment in the URL. */
const SUBSTATION_FOLDER_SLUGS = new Set([
  "grounding-system-master",
  "grounding-fall-of-potential-slope-method-test",
  "gfi-trip-test-report",
]);

export interface ReportRef {
  slug: string;
  reportId: string;
}

/** Parse `report:/jobs/{jobId}/{slug}[/{substation}]/{reportId}` into its parts. */
export function parseReportRef(fileUrl?: string | null): ReportRef | null {
  if (!fileUrl || !fileUrl.startsWith("report:")) return null;
  const parts = (fileUrl.split(":/")[1] || "").split("/");
  if (parts[0] !== "jobs" || !parts[2]) return null;
  const slug = parts[2].split("?")[0];
  const reportId = (
    SUBSTATION_FOLDER_SLUGS.has(slug) && parts.length >= 5
      ? parts[4]
      : parts[3] || ""
  ).split("?")[0];
  if (!reportId) return null;
  return { slug, reportId };
}

/**
 * Pull PASS / FAIL / LIMITED SERVICE out of a report row. Report types nest the
 * value differently (root column, `report_data`, `report_info`, `data`), so all
 * known shapes are probed.
 */
export function extractEvaluationResult(row: any): EvaluationResult | null {
  const candidates = [
    row?.report_info?.status,
    row?.status,
    row?.report_data?.status,
    row?.report_data?.reportInfo?.status,
    row?.report_data?.report_info?.status,
    row?.data?.status,
    row?.data?.reportInfo?.status,
    row?.data?.report_info?.status,
    row?.report_info?.equipment_evaluation_result,
    row?.report_data?.equipment_evaluation_result,
    row?.equipment_evaluation_result,
  ];
  for (const val of candidates) {
    if (typeof val !== "string") continue;
    const upper = val.toUpperCase().trim();
    if (upper === "PASS" || upper === "FAIL" || upper === "LIMITED SERVICE") {
      return upper as EvaluationResult;
    }
    if (upper === "LIMITED_SERVICE") return "LIMITED SERVICE";
  }
  return null;
}

interface EvaluationAsset {
  id: string;
  file_url?: string | null;
}

const IN_CHUNK_SIZE = 200;

/**
 * Resolve evaluation results for a set of report assets, keyed by asset id.
 * Queries are grouped by storage table so a folder of 200 reports costs one
 * round trip per report type rather than one per report.
 */
export async function fetchEvaluationResults(
  assets: EvaluationAsset[],
): Promise<Record<string, EvaluationResult>> {
  // table -> reportId -> assetIds sharing that report
  type TableIndex = Map<string, Map<string, string[]>>;
  const primaryIndex: TableIndex = new Map();
  const fallbackIndex: TableIndex = new Map();
  const addRef = (
    index: TableIndex,
    table: string,
    reportId: string,
    assetId: string,
  ) => {
    let reports = index.get(table);
    if (!reports) {
      reports = new Map();
      index.set(table, reports);
    }
    const ids = reports.get(reportId);
    if (ids) ids.push(assetId);
    else reports.set(reportId, [assetId]);
  };

  for (const asset of assets) {
    const ref = parseReportRef(asset.file_url);
    if (!ref) continue;
    const primary = REPORT_SLUG_TO_TABLE[ref.slug];
    if (!primary) continue;
    addRef(primaryIndex, primary, ref.reportId, asset.id);
    for (const table of SLUG_FALLBACK_TABLES[ref.slug] || []) {
      addRef(fallbackIndex, table, ref.reportId, asset.id);
    }
  }

  const results: Record<string, EvaluationResult> = {};

  const runIndex = async (index: TableIndex) => {
    await Promise.all(
      Array.from(index.entries()).map(async ([table, reports]) => {
        const reportIds = Array.from(reports.keys());
        for (let i = 0; i < reportIds.length; i += IN_CHUNK_SIZE) {
          const chunk = reportIds.slice(i, i + IN_CHUNK_SIZE);
          try {
            const { data, error } = await supabase
              .schema("neta_ops")
              .from(table)
              .select("*")
              .in("id", chunk);
            if (error || !data) continue;
            for (const row of data) {
              const status = extractEvaluationResult(row);
              if (!status) continue;
              for (const assetId of reports.get((row as any).id) || []) {
                if (!results[assetId]) results[assetId] = status;
              }
            }
          } catch {
            // Missing/legacy tables are expected — skip them.
          }
        }
      }),
    );
  };

  await runIndex(primaryIndex);
  // Legacy tables only fill gaps left by the canonical ones.
  await runIndex(fallbackIndex);

  return results;
}
