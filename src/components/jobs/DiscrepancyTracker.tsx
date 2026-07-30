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
import {
  REPORT_SLUG_TO_TABLE,
  extractEvaluationResult,
  parseReportRef,
  type EvaluationResult,
} from "../../lib/reportEvaluations";

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
          const ref = parseReportRef(asset.file_url);
          if (!ref) return;

          const table = REPORT_SLUG_TO_TABLE[ref.slug];
          if (!table) return;

          const { data } = await supabase
            .schema("neta_ops")
            .from(table)
            .select("*")
            .eq("id", ref.reportId)
            .maybeSingle();

          if (!data) return;

          const status = extractEvaluationResult(data);
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
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-brand focus:ring-brand"
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
