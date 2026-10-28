import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SortHeader, type SortDirection } from "@/components/ui/SortHeader";
import {
  ActionItemsDialog,
  StatusPill,
} from "@/components/reports/common/ActionItemsDialog";
import {
  ACTION_ITEM_CATEGORY_LABELS,
  ACTION_ITEM_PRIORITY_LABELS,
  ACTION_ITEM_STATUS_LABELS,
  ACTION_ITEMS_CHANGED_EVENT,
  type ActionItem,
  type ActionItemStatus,
  fetchActionItemsForAssets,
} from "@/services/reportActionItemService";

/**
 * Reports → Action items tab on a job: every action item on the job's reports
 * in one list, searchable by ID. Clicking a row opens it in the same dialog the
 * report toolbar uses. Items are added from each report, not here.
 */
interface JobActionItemsProps {
  jobId: string;
  /** The job's reports, labelled the way the Reports tab shows them. */
  reports: { id: string; label: string }[];
}

type Filter = ActionItemStatus | "all";
type SortField = "code" | "title" | "report" | "category" | "status" | "priority" | "created";

const FILTERS: Filter[] = ["open", "told_customer", "closed", "not_needed", "all"];
const STATUS_ORDER: ActionItemStatus[] = ["open", "told_customer", "closed", "not_needed"];
const PRIORITY_ORDER = ["low", "normal", "high", "urgent"];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** "26103-203-2" → "26103-203" */
const reportCodeOf = (itemCode: string) => itemCode.replace(/-\d+$/, "");

export const JobActionItems: React.FC<JobActionItemsProps> = ({ jobId, reports }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [opened, setOpened] = useState<ActionItem | null>(null);
  const openedFromLink = useRef(false);

  const labels = useMemo(
    () => new Map(reports.map((r) => [r.id, r.label])),
    [reports],
  );
  const assetIdsKey = reports.map((r) => r.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const ids = assetIdsKey ? assetIdsKey.split(",") : [];
        const rows = await fetchActionItemsForAssets(ids);
        if (cancelled) return;
        setItems(rows);
        setError(null);
      } catch (e) {
        console.error("[JobActionItems] Failed to load:", e);
        if (!cancelled) setError("Couldn't load action items. Try again in a moment.");
      }
    };
    load();
    window.addEventListener(ACTION_ITEMS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ACTION_ITEMS_CHANGED_EVENT, load);
    };
  }, [assetIdsKey]);

  // The notification bell links here with ?actionItem=<id> for uploaded PDFs.
  useEffect(() => {
    if (!items || openedFromLink.current) return;
    const id = new URLSearchParams(window.location.search).get("actionItem");
    const match = id ? items.find((i) => i.id === id) : null;
    if (match) {
      openedFromLink.current = true;
      setOpened(match);
    }
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      open: 0,
      told_customer: 0,
      closed: 0,
      not_needed: 0,
      all: items?.length ?? 0,
    };
    (items || []).forEach((i) => (c[i.status] += 1));
    return c;
  }, [items]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (items || []).filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      return [i.item_code, i.title, i.description || "", labels.get(i.asset_id) || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const value = (i: ActionItem): string | number => {
      switch (sortField) {
        case "title":
          return i.title.toLowerCase();
        case "report":
          return (labels.get(i.asset_id) || "").toLowerCase();
        case "category":
          return ACTION_ITEM_CATEGORY_LABELS[i.category];
        case "status":
          return STATUS_ORDER.indexOf(i.status);
        case "priority":
          return PRIORITY_ORDER.indexOf(i.priority);
        case "created":
          return i.created_at;
        default:
          return i.item_code;
      }
    };
    const mult = sortDirection === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return cmp * mult;
    });
  }, [items, filter, search, sortField, sortDirection, labels]);

  const onSort = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  const header = (label: string, field: SortField, defaultDirection?: SortDirection) => (
    <SortHeader
      label={label}
      field={field}
      sortField={sortField}
      sortDirection={sortDirection}
      onSort={onSort}
      defaultDirection={defaultDirection}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Action items
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Things on passing reports that still need doing or telling the
          customer. Add them from a report's <b>Action items</b> button.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap border border-neutral-200 dark:border-neutral-700 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`px-3 py-1.5 text-sm font-medium rounded-none ${
                filter === f
                  ? "bg-brand text-white"
                  : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-100"
              }`}
            >
              {f === "all" ? "All" : ACTION_ITEM_STATUS_LABELS[f]} ({counts[f]})
            </button>
          ))}
        </div>
        <input
          id="job-action-items-search"
          type="text"
          aria-label="Search action items"
          placeholder="Search ID, item or report..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 rounded-none border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none dark:bg-dark-150 dark:text-white text-sm"
        />
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : items === null ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {items.length === 0
            ? "No action items on this job yet."
            : search.trim()
              ? "No action items match your search."
              : `No ${filter === "all" ? "" : ACTION_ITEM_STATUS_LABELS[filter as ActionItemStatus].toLowerCase() + " "}action items.`}
        </p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-dark-100">
              <tr className="text-left text-neutral-700 dark:text-neutral-300">
                <th scope="col" className="px-3 py-2 font-semibold">{header("ID", "code")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Item", "title")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Report", "report")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Category", "category")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Status", "status")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Priority", "priority", "desc")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Added", "created", "desc")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {rows.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setOpened(i)}
                  className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpened(i);
                      }}
                      className="font-mono text-xs text-brand hover:underline"
                    >
                      #{i.item_code}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-neutral-900 dark:text-white min-w-[14rem]">
                    {i.title}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 min-w-[12rem]">
                    {labels.get(i.asset_id) || "Report"}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                    {ACTION_ITEM_CATEGORY_LABELS[i.category]}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={i.status} />
                  </td>
                  <td
                    className={`px-3 py-2 whitespace-nowrap ${
                      i.priority === "high" || i.priority === "urgent"
                        ? "font-semibold text-red-600 dark:text-red-400"
                        : "text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    {ACTION_ITEM_PRIORITY_LABELS[i.priority]}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                    {formatDate(i.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {opened && (
        <ActionItemsDialog
          assetId={opened.asset_id}
          jobId={jobId}
          reportCode={reportCodeOf(opened.item_code)}
          reportName={labels.get(opened.asset_id)}
          userId={user?.id || ""}
          initialItemId={opened.id}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
};

export default JobActionItems;
