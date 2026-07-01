import React, { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type EvaluationResult = "PASS" | "FAIL" | "LIMITED SERVICE";

interface DiscrepancyRow {
  assetId: string;
  substation: string;
  identifier: string;
  result: EvaluationResult;
  comments: string;
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  status?: string;
}

interface DiscrepancyTrackerProps {
  jobId: string;
  assets: Asset[];
  dynamicAssetNames?: Record<string, string>;
  assetSubstations?: Record<string, string>;
}

/** Slug-to-table mapping (mirrors the one in JobDetail) */
const slugToTable: Record<string, string> = {
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
  "low-voltage-cable-test-3sets": "low_voltage_cable_test_3sets",
  "low-voltage-cable-test-12sets": "low_voltage_cable_test_12sets",
  "low-voltage-cable-test-20sets": "transformer_reports",
  "low-voltage-switch-multi-device-test":
    "low_voltage_switch_multi_device_reports",
  "two-small-dry-typer-xfmr-ats-report": "two_small_dry_type_xfmr_ats_reports",
  "switchgear-panelboard-mts-report": "switchgear_panelboard_mts_reports",
  "liquid-filled-transformer": "liquid_filled_transformer_reports",
  "liquid-filled-transformer-report": "liquid_filled_transformer_reports",
  "metal-enclosed-busway-report": "metal_enclosed_busway_reports",
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

/** Extract status (PASS/FAIL/LIMITED SERVICE) from report data with deep heuristics */
function extractStatus(data: any): EvaluationResult | null {
  const candidates = [
    data?.report_info?.status,
    data?.status,
    data?.report_data?.status,
    data?.report_data?.reportInfo?.status,
    data?.data?.status,
    data?.data?.reportInfo?.status,
    data?.report_info?.equipment_evaluation_result,
    data?.report_data?.equipment_evaluation_result,
    data?.equipment_evaluation_result,
  ];
  for (const val of candidates) {
    if (typeof val === "string") {
      const upper = val.toUpperCase().trim();
      if (upper === "PASS" || upper === "FAIL" || upper === "LIMITED SERVICE") {
        return upper as EvaluationResult;
      }
    }
  }
  return null;
}

/** Extract comments from report data */
function extractComments(data: any): string {
  const candidates = [
    data?.comments,
    data?.report_info?.comments,
    data?.report_data?.comments,
    data?.data?.comments,
  ];
  for (const val of candidates) {
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return "";
}

/** Extract identifier from report data */
function extractIdentifier(data: any): string {
  const candidates = [
    data?.identifier,
    data?.eqpt_location,
    data?.breakerIdentifier,
    data?.eqptIdentifier,
    data?.report_info?.identifier,
    data?.report_info?.eqptLocation,
    data?.report_info?.location,
    data?.report_info?.breakerIdentifier,
    data?.report_info?.eqptIdentifier,
    data?.report_data?.identifier,
    data?.report_data?.eqptLocation,
    data?.report_data?.location,
    data?.report_data?.breakerIdentifier,
    data?.report_data?.eqptIdentifier,
    data?.report_data?.reportInfo?.identifier,
    data?.report_data?.reportInfo?.eqptLocation,
    data?.report_data?.reportInfo?.location,
    data?.data?.identifier,
    data?.data?.eqptLocation,
    data?.data?.location,
    data?.data?.equipment_location,
    data?.data?.breakerIdentifier,
    data?.data?.eqptIdentifier,
    data?.data?.reportInfo?.identifier,
    data?.data?.reportInfo?.eqptLocation,
    data?.data?.reportInfo?.location,
  ];
  for (const val of candidates) {
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return "";
}

/** Extract substation from report data */
function extractSubstation(data: any): string {
  const candidates = [
    data?.substation,
    data?.report_info?.substation,
    data?.report_info?.location,
    data?.report_info?.jobInfo?.substation,
    data?.report_data?.substation,
    data?.report_data?.jobInfo?.substation,
    data?.report_data?.reportInfo?.substation,
    data?.report_data?.reportInfo?.location,
    data?.data?.substation,
    data?.data?.location,
    data?.data?.jobInfo?.substation,
    data?.data?.reportInfo?.substation,
    data?.data?.reportInfo?.location,
  ];
  for (const val of candidates) {
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return "";
}

export const DiscrepancyTracker: React.FC<DiscrepancyTrackerProps> = ({
  jobId,
  assets,
  dynamicAssetNames = {},
  assetSubstations = {},
}) => {
  const [rows, setRows] = useState<DiscrepancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResults, setSelectedResults] = useState<Set<EvaluationResult>>(
    new Set(["PASS", "FAIL", "LIMITED SERVICE"]),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;

  // Fetch report data for all report assets
  useEffect(() => {
    if (!jobId || !assets || assets.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      const discrepancyRows: DiscrepancyRow[] = [];

      const reportAssets = assets.filter(
        (a) =>
          a.file_url &&
          a.file_url.startsWith("report:") &&
          a.status !== "archived",
      );

      const tasks = reportAssets.map(async (asset) => {
        try {
          const urlContent = asset.file_url.split(":/")[1] || "";
          const parts = urlContent.split("/");
          if (parts[0] !== "jobs" || !parts[2]) return;

          let slug = parts[2].split("?")[0];
          const isGroundingReport =
            slug === "grounding-system-master" ||
            slug === "grounding-fall-of-potential-slope-method-test" ||
            slug === "gfi-trip-test-report";

          let reportIdFromUrl = "";
          if (isGroundingReport && parts.length >= 5) {
            reportIdFromUrl = (parts[4] || "").split("?")[0];
          } else {
            reportIdFromUrl = (parts[3] || "").split("?")[0];
          }
          if (!reportIdFromUrl) return;

          const table = slugToTable[slug];
          if (!table) return;

          const { data } = await supabase
            .schema("neta_ops")
            .from(table)
            .select("*")
            .eq("id", reportIdFromUrl)
            .maybeSingle();

          if (!data) return;

          const status = extractStatus(data);
          if (!status) return; // Skip reports without a status

          const identifier =
            extractIdentifier(data) ||
            dynamicAssetNames[asset.id]?.split(" - ").pop() ||
            "";
          const substation =
            assetSubstations[asset.id] || extractSubstation(data) || "";
          const comments = extractComments(data);

          discrepancyRows.push({
            assetId: asset.id,
            substation,
            identifier,
            result: status,
            comments,
          });
        } catch {
          // Ignore per-asset failures
        }
      });

      await Promise.all(tasks);

      // Sort: FAIL first, then LIMITED SERVICE, then PASS; within each group sort by substation then identifier
      const resultOrder: Record<EvaluationResult, number> = {
        FAIL: 0,
        "LIMITED SERVICE": 1,
        PASS: 2,
      };
      discrepancyRows.sort((a, b) => {
        const ro = resultOrder[a.result] - resultOrder[b.result];
        if (ro !== 0) return ro;
        const sc = a.substation.localeCompare(b.substation);
        if (sc !== 0) return sc;
        return a.identifier.localeCompare(b.identifier);
      });

      setRows(discrepancyRows);
      setLoading(false);
    })();
  }, [jobId, assets, dynamicAssetNames, assetSubstations]);

  // Toggle a result type in the filter
  const toggleResult = (result: EvaluationResult) => {
    setSelectedResults((prev) => {
      const next = new Set(prev);
      if (next.has(result)) {
        // Don't allow deselecting all
        if (next.size > 1) next.delete(result);
      } else {
        next.add(result);
      }
      return next;
    });
  };

  // Filtered rows based on selected result types
  const filteredRows = useMemo(
    () => rows.filter((r) => selectedResults.has(r.result)),
    [rows, selectedResults],
  );

  // Reset to page 1 whenever the filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedResults]);

  // Pagination derived values
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () =>
      filteredRows.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [filteredRows, currentPage],
  );

  // Counts for the summary badges
  const counts = useMemo(() => {
    const c = { PASS: 0, FAIL: 0, "LIMITED SERVICE": 0 };
    rows.forEach((r) => c[r.result]++);
    return c;
  }, [rows]);

  const getResultBadge = (result: EvaluationResult) => {
    switch (result) {
      case "PASS":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            PASS
          </span>
        );
      case "FAIL":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            FAIL
          </span>
        );
      case "LIMITED SERVICE":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            LIMITED SERVICE
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-neutral-400 mx-auto mb-3" />
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
          No report evaluations found for this project. Evaluations will appear
          here once reports have been completed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Discrepancy Summary
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Overview of all report evaluations for this project. Filter by
            result type to focus on deficiencies.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
                Pass
              </p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                {counts.PASS}
              </p>
            </div>
            <div className="h-12 w-12 rounded-none bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="text-green-600 dark:text-green-400 text-lg font-bold">
                &#10003;
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
                Fail
              </p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                {counts.FAIL}
              </p>
            </div>
            <div className="h-12 w-12 rounded-none bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-lg font-bold">
                &#10007;
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
                Limited Service
              </p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                {counts["LIMITED SERVICE"]}
              </p>
            </div>
            <div className="h-12 w-12 rounded-none bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Showing{" "}
          {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredRows.length)}–
          {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of{" "}
          {filteredRows.length} reports
          {filteredRows.length !== rows.length && ` (${rows.length} total)`}
        </p>
        <div className="relative">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors"
          >
            <Filter className="h-4 w-4" />
            Filter by Result
            <ChevronDown
              className={`h-4 w-4 transition-transform ${filterOpen ? "rotate-180" : ""}`}
            />
          </button>
          {filterOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 shadow-lg z-10 py-2">
              <p className="px-4 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                Select all that apply
              </p>
              {(["PASS", "FAIL", "LIMITED SERVICE"] as EvaluationResult[]).map(
                (result) => (
                  <label
                    key={result}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-50 dark:hover:bg-dark-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedResults.has(result)}
                      onChange={() => toggleResult(result)}
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-[#f26722] focus:ring-[#f26722]"
                    />
                    <span className="flex items-center gap-2 text-sm">
                      {getResultBadge(result)}
                      <span className="text-neutral-500 dark:text-neutral-400">
                        ({counts[result]})
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
            <thead className="bg-neutral-50 dark:bg-dark-100">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider"
                >
                  Substation
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider"
                >
                  Identifier
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider"
                >
                  Result
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider"
                >
                  Issues &amp; Recommendations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {paginatedRows.map((row) => (
                <tr
                  key={row.assetId}
                  className={`hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors ${
                    row.result === "FAIL"
                      ? "bg-red-50/40 dark:bg-red-900/10"
                      : row.result === "LIMITED SERVICE"
                        ? "bg-yellow-50/40 dark:bg-yellow-900/10"
                        : ""
                  }`}
                >
                  <td className="px-6 py-4 text-sm text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                    {row.substation || (
                      <span className="text-neutral-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                    {row.identifier || (
                      <span className="text-neutral-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getResultBadge(row.result)}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-700 dark:text-neutral-300 max-w-md">
                    {row.comments ? (
                      <span className="whitespace-pre-wrap">
                        {row.comments}
                      </span>
                    ) : (
                      <span className="text-neutral-400 italic">
                        No comments
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">
              No reports match the current filter. Adjust your filter to see
              results.
            </p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
