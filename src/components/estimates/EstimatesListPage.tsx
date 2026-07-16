/**
 * Estimates List Page
 *
 * A standalone, estimates-only view. Lists every estimate across all
 * opportunities (one row per estimate) so estimators can find and open an
 * estimate directly without navigating through the opportunity first.
 *
 * Clicking a row opens the estimate in the opportunity detail view via
 * `?openEstimate=<estimateId>` (handled in OpportunityDetail).
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";

function formatEstimateApprovalStatus(status: string | null | undefined): string {
  if (!status) return "Not Started";
  const labels: Record<string, string> = {
    in_progress: "In Progress",
    ready_for_review: "Ready for Review",
    approved_to_send: "Approved to Send",
    sent: "Sent",
    no_quote: "No Quote",
  };
  return labels[status] || status.replace(/_/g, " ");
}

function getEstimateApprovalColor(status: string | null | undefined) {
  switch (status) {
    case "in_progress":
      return "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100";
    case "ready_for_review":
      return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
    case "approved_to_send":
      return "bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100";
    case "sent":
      return "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100";
    default:
      return "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400";
  }
}

interface EstimateRow {
  id: string;
  opportunityId: string;
  createdAt: string;
  status: string | null;
  quoteNumber: string;
  title: string;
  customerName: string;
  salesPerson: string;
  // 1-based index of this estimate among its opportunity's estimates (oldest = 1)
  revision: number;
  revisionCount: number;
}

const STATUS_FILTER_OPTIONS = [
  { value: "in_progress", label: "In Progress" },
  { value: "ready_for_review", label: "Ready for Review" },
  { value: "approved_to_send", label: "Approved to Send" },
  { value: "sent", label: "Sent" },
  { value: "no_quote", label: "No Quote" },
];

export const EstimatesListPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchEstimates() {
      setLoading(true);
      setLoadError(null);
      try {
        // 1) All estimates, newest first (id as deterministic tiebreak).
        const { data: estimatesData, error: estimatesError } = await supabase
          .schema("business")
          .from("estimates")
          .select("id, opportunity_id, status, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });

        if (estimatesError) throw estimatesError;
        const estimates = estimatesData || [];

        // 2) Opportunities referenced by those estimates.
        const opportunityIds = Array.from(
          new Set(estimates.map((e: any) => e.opportunity_id).filter(Boolean)),
        );

        const opportunityMap: Record<string, any> = {};
        if (opportunityIds.length > 0) {
          const { data: opps, error: oppsError } = await supabase
            .schema("business")
            .from("opportunities")
            .select("id, quote_number, title, customer_id, sales_person")
            .in("id", opportunityIds);
          if (oppsError) throw oppsError;
          (opps || []).forEach((o: any) => {
            opportunityMap[o.id] = o;
          });
        }

        // 3) Customers referenced by those opportunities.
        const customerIds = Array.from(
          new Set(
            Object.values(opportunityMap)
              .map((o: any) => o.customer_id)
              .filter(Boolean),
          ),
        );

        const customerMap: Record<string, any> = {};
        if (customerIds.length > 0) {
          const { data: customers, error: customersError } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name")
            .in("id", customerIds);
          if (customersError) throw customersError;
          (customers || []).forEach((c: any) => {
            customerMap[c.id] = c;
          });
        }

        // Compute per-opportunity revision numbering (oldest = 1). The list is
        // newest-first, so within each opportunity the count decreases as we go.
        const seenSoFar: Record<string, number> = {};
        const totalByOpportunity: Record<string, number> = {};
        estimates.forEach((e: any) => {
          totalByOpportunity[e.opportunity_id] =
            (totalByOpportunity[e.opportunity_id] || 0) + 1;
        });

        const built: EstimateRow[] = estimates.map((e: any) => {
          const opp = opportunityMap[e.opportunity_id] || {};
          const customer = opp.customer_id ? customerMap[opp.customer_id] : null;
          const total = totalByOpportunity[e.opportunity_id] || 1;
          seenSoFar[e.opportunity_id] = (seenSoFar[e.opportunity_id] || 0) + 1;
          // seenSoFar counts down from newest; oldest gets revision 1.
          const revision = total - seenSoFar[e.opportunity_id] + 1;
          return {
            id: e.id,
            opportunityId: e.opportunity_id,
            createdAt: e.created_at,
            status: e.status,
            quoteNumber: opp.quote_number || "—",
            title: opp.title || "Untitled",
            customerName:
              customer?.company_name || customer?.name || "Unknown customer",
            salesPerson: opp.sales_person || "",
            revision,
            revisionCount: total,
          };
        });

        if (!cancelled) setRows(built);
      } catch (err: any) {
        console.error("Error loading estimates list:", err);
        if (!cancelled)
          setLoadError(err?.message || "Failed to load estimates.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEstimates();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilters.length > 0) {
        const s = r.status || "";
        if (!statusFilters.includes(s)) return false;
      }
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        r.quoteNumber.toLowerCase().includes(term) ||
        r.customerName.toLowerCase().includes(term) ||
        r.salesPerson.toLowerCase().includes(term)
      );
    });
  }, [rows, searchTerm, statusFilters]);

  const toggleStatusFilter = (value: string) => {
    setStatusFilters((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value],
    );
  };

  const openEstimate = (row: EstimateRow) => {
    navigate(
      `/sales-dashboard/opportunities/${row.opportunityId}?openEstimate=${row.id}`,
    );
  };

  return (
    <div className="text-foreground">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Estimates</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Every estimate across all opportunities. Click a row to open it.
        </p>
      </div>

      {/* Search + status filters */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by quote #, title, customer, or salesperson"
            className="w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-black placeholder:text-neutral-400 focus:border-brand focus:outline-none dark:border-dark-200 dark:bg-dark-100 dark:text-dark-900"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const active = statusFilters.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatusFilter(opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-dark-200 dark:bg-dark-100 dark:text-neutral-300 dark:hover:bg-dark-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-neutral-500">
          Loading estimates…
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="py-12 text-center text-sm text-neutral-500">
          {rows.length === 0
            ? "No estimates found."
            : "No estimates match your filters."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-dark-200">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-dark-200">
            <thead className="bg-neutral-50 dark:bg-dark-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Quote #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Salesperson
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 bg-white dark:divide-dark-200 dark:bg-dark-150">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => openEstimate(row)}
                  className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-dark-900">
                    {row.quoteNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-black dark:text-dark-900">
                    {row.title}
                    {row.revisionCount > 1 && (
                      <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-dark-100 dark:text-neutral-400">
                        Est. {row.revision} of {row.revisionCount}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-black dark:text-dark-900">
                    {row.customerName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-600 dark:text-neutral-300">
                    {row.salesPerson || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getEstimateApprovalColor(
                        row.status,
                      )}`}
                    >
                      {formatEstimateApprovalStatus(row.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-600 dark:text-neutral-300">
                    {row.createdAt
                      ? format(new Date(row.createdAt), "MMM d, yyyy")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <div className="mt-3 text-xs text-neutral-500">
          Showing {filteredRows.length} of {rows.length} estimate
          {rows.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
};

export default EstimatesListPage;
