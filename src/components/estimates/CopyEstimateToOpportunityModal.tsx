import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Search, X } from "lucide-react";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { supabase } from "../../lib/supabase";

export interface CopyTargetOpportunity {
  id: string;
  title: string | null;
  quote_number: string | null;
  customer_name: string | null;
}

interface CopyEstimateToOpportunityModalProps {
  open: boolean;
  onClose: () => void;
  /** The opportunity the estimate currently belongs to (excluded from results). */
  currentOpportunityId: string;
  onSelect: (opportunity: CopyTargetOpportunity) => void;
  isSaving?: boolean;
  /** Heading text (defaults to the copy-estimate wording). */
  title?: string;
  /** Per-row action button label (defaults to "Copy here"). */
  selectLabel?: string;
}

interface OpportunityRow {
  id: string;
  title: string | null;
  quote_number: string | null;
  description: string | null;
  customer_id: string | null;
  jobsite_location: string | null;
}

const PAGE_SIZE = 50;

export const CopyEstimateToOpportunityModal: React.FC<
  CopyEstimateToOpportunityModalProps
> = ({
  open,
  onClose,
  currentOpportunityId,
  onSelect,
  isSaving,
  title = "Copy Estimate to Opportunity",
  selectLabel = "Copy here",
}) => {
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setDebouncedQuery("");
  }, [open]);

  // Debounce the search query.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // Escape to close + focus the search box on mount.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  // Load opportunities (recent by default, or matching the search query).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadOpportunities = async () => {
      setLoading(true);
      setError(null);
      try {
        const term = debouncedQuery;
        let opportunityQuery = supabase
          .schema("business")
          .from("opportunities")
          .select(
            "id, title, quote_number, description, customer_id, jobsite_location",
          );

        if (term) {
          const like = `%${term}%`;
          // Find customers matching the term so we can search by company too.
          const { data: matchingCustomers } = await supabase
            .schema("common")
            .from("customers")
            .select("id")
            .or(`name.ilike.${like},company_name.ilike.${like}`)
            .limit(1000);
          const customerIds = (matchingCustomers || []).map((c: any) => c.id);

          const orFilters = [
            `quote_number.ilike.${like}`,
            `title.ilike.${like}`,
            `description.ilike.${like}`,
          ];
          if (customerIds.length) {
            orFilters.push(`customer_id.in.(${customerIds.join(",")})`);
          }
          opportunityQuery = opportunityQuery.or(orFilters.join(","));
        }

        opportunityQuery = opportunityQuery
          .order("opportunity_created_date", {
            ascending: false,
            nullsFirst: false,
          })
          .limit(PAGE_SIZE);

        const { data, error: queryError } = await opportunityQuery;
        if (queryError) throw queryError;
        if (cancelled) return;

        const opportunityRows = (data || []).filter(
          (row: OpportunityRow) => row.id !== currentOpportunityId,
        );
        setRows(opportunityRows);

        // Resolve customer names for display.
        const ids = Array.from(
          new Set(
            opportunityRows
              .map((row) => row.customer_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        if (ids.length) {
          const { data: customers } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name")
            .in("id", ids);
          if (!cancelled && customers) {
            const map: Record<string, string> = {};
            customers.forEach((c: any) => {
              map[c.id] = c.company_name || c.name || "";
            });
            setCustomerNames(map);
          }
        } else if (!cancelled) {
          setCustomerNames({});
        }
      } catch (err: any) {
        console.error("Error loading opportunities for estimate copy:", err);
        if (!cancelled) {
          setError(err?.message || "Failed to load opportunities.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOpportunities();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, currentOpportunityId]);

  const resultsLabel = useMemo(() => {
    if (loading) return "";
    if (debouncedQuery) return `${rows.length} match(es)`;
    return `${rows.length} most recent`;
  }, [loading, debouncedQuery, rows.length]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[69]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[70] bg-white dark:bg-dark-150 rounded-none shadow-xl w-full max-w-[760px] mx-4 max-h-[85vh] flex flex-col border border-neutral-200 dark:border-neutral-700"
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Copy className="h-5 w-5 text-brand" />
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            aria-label="Close copy estimate dialog"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-2"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by quote #, title, description, or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
              autoFocus
            />
          </div>
          {resultsLabel && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
              {resultsLabel}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-12">
              {debouncedQuery
                ? "No opportunities match your search."
                : "No other opportunities found."}
            </div>
          ) : (
            <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700 rounded-none">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 text-sm">
                <thead className="bg-neutral-50 dark:bg-dark-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Action
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Quote #
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Title
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-200">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-white dark:bg-dark-150">
                  {rows.map((row) => {
                    const customerName = row.customer_id
                      ? customerNames[row.customer_id] || "—"
                      : "—";
                    const handleSelect = () =>
                      onSelect({
                        id: row.id,
                        title: row.title,
                        quote_number: row.quote_number,
                        customer_name: row.customer_id
                          ? customerNames[row.customer_id] || null
                          : null,
                      });
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-orange-50 dark:hover:bg-dark-100 transition-colors cursor-pointer"
                        onDoubleClick={handleSelect}
                      >
                        <td className="px-3 py-3 align-top text-left whitespace-nowrap">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelect();
                            }}
                            size="sm"
                            disabled={isSaving}
                            className="bg-brand text-white hover:bg-brand-dark"
                          >
                            {selectLabel}
                          </Button>
                        </td>
                        <td className="px-3 py-3 align-top text-neutral-900 dark:text-white whitespace-nowrap font-medium">
                          {row.quote_number || "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[200px]">
                          {row.title || "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[160px]">
                          {customerName}
                        </td>
                        <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 min-w-[160px]">
                          {row.jobsite_location || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CopyEstimateToOpportunityModal;
