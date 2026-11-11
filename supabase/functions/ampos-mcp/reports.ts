// Report storage helpers for the connector.
//
// MIRROR of src/lib/reportEvaluations.ts (REPORT_SLUG_TO_TABLE, SLUG_FALLBACK_TABLES,
// parseReportRef, extractEvaluationResult, extractReportIdentifier). That file
// imports the browser Supabase client, so Deno can't import it. When a report
// type is added there, add it here too.

export type EvaluationResult = "PASS" | "FAIL" | "LIMITED SERVICE";

export const REPORT_SLUG_TO_TABLE: Record<string, string> = {
  "switchgear-switchboard-assemblies-ats25": "switchgear_switchboard_ats25_reports",
  "panelboard-assemblies-ats25": "panelboard_assemblies_ats25_reports",
  "small-lv-dry-type-transformer-ats25": "small_lv_dry_type_transformer_ats25_reports",
  "liquid-filled-xfmr-ats25": "liquid_filled_xfmr_ats25_reports",
  "panelboard-report": "panelboard_reports",
  "switchgear-report": "switchgear_reports",
  "dry-type-transformer": "transformer_reports",
  "large-dry-type-transformer-report": "large_transformer_reports",
  "large-dry-type-transformer": "large_transformer_reports",
  "large-dry-type-xfmr-mts23": "large_dry_type_xfmr_mts23_reports",
  "large-dry-type-transformer-mts-report": "large_dry_type_transformer_mts_reports",
  "large-dry-type-xfmr-mts-report": "large_dry_type_transformer_mts_reports",
  "liquid-xfmr-visual-mts-report": "liquid_xfmr_visual_mts_reports",
  "low-voltage-switch-report": "low_voltage_switch_reports",
  "medium-voltage-switch-oil-report": "medium_voltage_switch_oil_reports",
  "medium-voltage-switch-sf6": "medium_voltage_switch_sf6_reports",
  "medium-voltage-switch-sf6-report": "medium_voltage_switch_sf6_reports",
  "potential-transformer-ats-report": "potential_transformer_ats_reports",
  "low-voltage-panelboard-small-breaker-report": "low_voltage_panelboard_small_breaker_reports",
  "medium-voltage-circuit-breaker-report": "medium_voltage_circuit_breaker_reports",
  "medium-voltage-vacuum-breaker-mts23": "medium_voltage_vacuum_breaker_mts23_reports",
  "medium-voltage-circuit-breaker-mts-report": "medium_voltage_circuit_breaker_mts_reports",
  "medium-voltage-vlf-mts-report": "medium_voltage_vlf_mts_reports",
  "medium-voltage-cable-vlf-tan-delta-mts23": "medium_voltage_cable_vlf_tan_delta_mts23_reports",
  "medium-voltage-cable-vlf-test-mts": "medium_voltage_vlf_mts_reports",
  "medium-voltage-vlf": "medium_voltage_vlf_mts_reports",
  "medium-voltage-vlf-tan-delta": "tandelta_reports",
  "medium-voltage-vlf-tan-delta-mts": "tandelta_mts_reports",
  "electrical-tan-delta-test-mts-form": "tandelta_mts_reports",
  "medium-voltage-cable-vlf-test": "medium_voltage_cable_vlf_test",
  "current-transformer-test-ats-report": "current_transformer_test_ats_reports",
  "12-current-transformer-test-ats-report": "current_transformer_test_ats_reports",
  "12-current-transformer-test-mts-report": "current_transformer_test_mts_reports",
  "13-voltage-potential-transformer-test-mts-report": "voltage_potential_transformer_mts_reports",
  "23-medium-voltage-motor-starter-mts-report": "medium_voltage_motor_starter_mts_reports",
  "23-medium-voltage-switch-mts-report": "medium_voltage_switch_mts_reports",
  "metal-enclosed-busway-mts23": "metal_enclosed_busway_mts23_reports",
  "metal-enclosed-busway": "metal_enclosed_busway_reports",
  "metal-enclosed-busway-report": "metal_enclosed_busway_reports",
  "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
    "low_voltage_circuit_breaker_thermal_magnetic_mts_reports",
  "lv-molded-case-circuit-breaker-ats25": "lv_molded_case_circuit_breaker_ats25",
  "lv-circuit-breaker-mts23": "lv_circuit_breaker_mts23_reports",
  "lv-circuit-breaker-mts25": "lv_circuit_breaker_mts25",
  "lv-circuit-breaker-mts": "lv_circuit_breaker_mts25",
  "emergency-systems-engine-generator-ats25": "emergency_systems_engine_generator_ats25",
  "low-voltage-circuit-breaker-electronic-trip-ats-report": "low_voltage_circuit_breaker_electronic_trip_ats",
  "low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report":
    "low_voltage_circuit_breaker_electronic_trip_ats",
  "low-voltage-circuit-breaker-thermal-magnetic-ats-report": "low_voltage_circuit_breaker_thermal_magnetic_ats",
  "automatic-transfer-switch-ats-report": "automatic_transfer_switch_ats_reports",
  "gfi-trip-test-report": "gfi_trip_test_reports",
  "low-voltage-circuit-breaker-electronic-trip-mts-report": "low_voltage_circuit_breaker_electronic_trip_mts",
  "low-voltage-circuit-breaker-electronic-trip-mts": "low_voltage_circuit_breaker_electronic_trip_mts",
  "low-voltage-circuit-breaker-electronic-trip-unit-mts": "low_voltage_circuit_breaker_electronic_trip_mts",
  "small-dry-type-xfmr-mts23": "small_dry_type_xfmr_mts23_reports",
  "two-small-dry-typer-xfmr-mts-report": "two_small_dry_type_xfmr_mts_reports",
  "two-small-dry-typer-xfmr-ats-report": "two_small_dry_type_xfmr_ats_reports",
  "low-voltage-cable-mts23": "low_voltage_cable_mts23_reports",
  "low-voltage-cable-test-3sets": "low_voltage_cable_test_3sets",
  "low-voltage-cable-test-12sets": "low_voltage_cable_test_12sets",
  "low-voltage-cable-test-20sets": "transformer_reports",
  "low-voltage-switch-multi-device-test": "low_voltage_switch_multi_device_reports",
  "switchgear-switchboard-mts23": "switchgear_switchboard_mts23_reports",
  "switchgear-panelboard-mts-report": "switchgear_panelboard_mts_reports",
  "liquid-filled-transformer": "liquid_filled_transformer_reports",
  "liquid-filled-transformer-report": "liquid_filled_transformer_reports",
  "oil-inspection": "oil_inspection_reports",
  "grounding-system-master": "grounding_system_master_reports",
  "grounding-fall-of-potential-slope-method-test": "grounding_fall_of_potential_slope_method_test_reports",
  "standard-report": "standard_reports",
  "low-voltage-air-switch-mts23": "low_voltage_air_switch_mts23_reports",
  "6-low-voltage-switch-maint-mts-report": "low_voltage_switch_maint_mts_reports",
  "applied-voltage-test-ats-report": "applied_voltage_test_ats_reports",
  "3-low-voltage-cable-mts": "low_voltage_cable_mts_reports",
  "3-low-voltage-cable-ats": "low_voltage_cable_ats_reports",
};

/** Legacy tables some reports were saved into before slugs were canonicalized. */
export const SLUG_FALLBACK_TABLES: Record<string, string[]> = {
  "low-voltage-panelboard-small-breaker-report": ["low_voltage_cable_test_3sets"],
  "low-voltage-switch-multi-device-test": ["low_voltage_cable_test_3sets"],
  "medium-voltage-vlf-mts-report": ["medium_voltage_cable_vlf_test"],
  "medium-voltage-cable-vlf-test-mts": ["medium_voltage_cable_vlf_test"],
  "low-voltage-circuit-breaker-electronic-trip-mts-report": ["low_voltage_cable_test_3sets"],
  "low-voltage-circuit-breaker-thermal-magnetic-ats-report": ["low_voltage_cable_test_3sets"],
};

const SUBSTATION_FOLDER_SLUGS = new Set([
  "grounding-system-master",
  "grounding-fall-of-potential-slope-method-test",
  "gfi-trip-test-report",
]);

export type ReportRef =
  | { kind: "report"; slug: string; reportId: string; table: string | null }
  | { kind: "custom-form"; templateId: string; instanceId: string }
  | { kind: "file"; url: string };

/** Where a report document's data lives, from neta_ops.assets.file_url. */
export function parseFileUrl(fileUrl?: string | null): ReportRef | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("report:")) {
    const parts = (fileUrl.split(":/")[1] || "").split("/");
    if (parts[0] !== "jobs" || !parts[2]) return null;
    const slug = parts[2].split("?")[0];
    const reportId = (SUBSTATION_FOLDER_SLUGS.has(slug) && parts.length >= 5 ? parts[4] : parts[3] || "")
      .split("?")[0];
    if (!reportId) return null;
    return { kind: "report", slug, reportId, table: REPORT_SLUG_TO_TABLE[slug] ?? null };
  }
  if (fileUrl.startsWith("custom-form:")) {
    // custom-form:/jobs/{jobId}/custom-form/{templateId}/{instanceId}
    const parts = (fileUrl.split(":/")[1] || "").split("/");
    const templateId = parts[3] ?? "";
    const instanceId = (parts[4] ?? "").split("?")[0];
    if (!instanceId) return null;
    return { kind: "custom-form", templateId, instanceId };
  }
  return { kind: "file", url: fileUrl };
}

// deno-lint-ignore no-explicit-any
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
    if (upper === "PASS" || upper === "FAIL" || upper === "LIMITED SERVICE") return upper as EvaluationResult;
    if (upper === "LIMITED_SERVICE") return "LIMITED SERVICE";
  }
  return null;
}

const IDENTIFIER_COLUMN_KEYS = ["breakerIdentifier", "identifier", "eqpt_location", "eqptIdentifier"];
const IDENTIFIER_FORM_KEYS = [
  "breakerIdentifier",
  "identifier",
  "eqptLocation",
  "location",
  "equipment_location",
  "eqptIdentifier",
];

// deno-lint-ignore no-explicit-any
const pickIdentifier = (source: any, keys: string[]): string => {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

// deno-lint-ignore no-explicit-any
export function extractReportIdentifier(row: any): string {
  return (
    pickIdentifier(row, IDENTIFIER_COLUMN_KEYS) ||
    pickIdentifier(row?.report_info, IDENTIFIER_FORM_KEYS) ||
    pickIdentifier(row?.report_data, IDENTIFIER_FORM_KEYS) ||
    pickIdentifier(row?.report_data?.reportInfo, IDENTIFIER_FORM_KEYS) ||
    pickIdentifier(row?.data, IDENTIFIER_FORM_KEYS) ||
    pickIdentifier(row?.data?.reportInfo, IDENTIFIER_FORM_KEYS) ||
    ""
  );
}

/** "<Report Type> - <identifier>" as stored in neta_ops.assets.name. */
export function splitReportName(name?: string | null): { report_type: string; equipment: string } {
  const text = (name ?? "").trim();
  const idx = text.indexOf(" - ");
  if (idx < 0) return { report_type: text, equipment: "" };
  return { report_type: text.slice(0, idx).trim(), equipment: text.slice(idx + 3).trim() };
}
