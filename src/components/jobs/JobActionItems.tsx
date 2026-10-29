import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  fetchActionItemsAcrossJobs,
  fetchActionItemsForAssets,
} from "@/services/reportActionItemService";

/**
 * A list of action items, searchable by ID. Two places use it:
 * - a job's Reports → Action items tab (pass jobId and reports), and
 * - the Action items button on the jobs list (pass nothing: every job).
 * Clicking a row opens it in the same dialog the report toolbar uses. Items are
 * added from each report, not here.
 */
interface JobActionItemsProps {
  jobId?: string;
  /** The job's reports, labelled the way the Reports tab shows them. */
  reports?: { id: string; label: string }[];
}

interface Row extends ActionItem {
  report_label: string;
  job_number: string | null;
  job_title: string | null;
}

type Filter = ActionItemStatus | "all";
type SortField = "code" | "title" | "report" | "job" | "category" | "status" | "priority" | "created";

const STATUS_ORDER = Object.keys(ACTION_ITEM_STATUS_LABELS) as ActionItemStatus[];
const FILTERS: Filter[] = [...STATUS_ORDER, "all"];
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
  const allJobs = !jobId;
  const [items, setItems] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unaddressed");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>(allJobs ? "created" : "code");
  const [sortDirection, setSortDirection] = useState<SortDirection>(allJobs ? "desc" : "asc");
  const [opened, setOpened] = useState<Row | null>(null);
  const openedFromLink = useRef(false);

  const labels = useMemo(
    () => new Map((reports || []).map((r) => [r.id, r.label])),
    [reports],
  );
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const assetIdsKey = (reports || []).map((r) => r.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let rows: Row[];
        if (allJobs) {
          rows = (await fetchActionItemsAcrossJobs()).map((i) => ({
            ...i,
            report_label: i.report_name || "Report",
          }));
        } else {
          const ids = assetIdsKey ? assetIdsKey.split(",") : [];
          rows = (await fetchActionItemsForAssets(ids)).map((i) => ({
            ...i,
            report_label: labelsRef.current.get(i.asset_id) || "Report",
            job_number: null,
            job_title: null,
          }));
        }
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
  }, [allJobs, assetIdsKey]);

  // The notification bell links a job here with ?actionItem=<id> for uploaded PDFs.
  useEffect(() => {
    if (!items || openedFromLink.current || allJobs) return;
    const id = new URLSearchParams(window.location.search).get("actionItem");
    const match = id ? items.find((i) => i.id === id) : null;
    if (match) {
      openedFromLink.current = true;
      setOpened(match);
    }
  }, [items, allJobs]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map((f) => [f, 0])) as Record<Filter, number>;
    (items || []).forEach((i) => (c[i.status] += 1));
    c.all = items?.length ?? 0;
    return c;
  }, [items]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (items || []).filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      return [i.item_code, i.title, i.description || "", i.report_label, i.job_number || "", i.job_title || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const value = (i: Row): string | number => {
      switch (sortField) {
        case "title":
          return i.title.toLowerCase();
        case "report":
          return i.report_label.toLowerCase();
        case "job":
          return i.job_number || "";
        case "category":
          return ACTION_ITEM_CATEGORY_LABELS[i.category] || i.category;
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
  }, [items, filter, search, sortField, sortDirection]);

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

  const emptyText =
    items?.length === 0
      ? allJobs
        ? "No action items yet."
        : "No action items on this job yet."
      : search.trim()
        ? "No action items match your search."
        : filter === "all"
          ? "No action items."
          : filter === "unaddressed"
            ? "Nothing unaddressed: every item has been formally notified, closed or archived."
            : `No action items are ${ACTION_ITEM_STATUS_LABELS[filter].toLowerCase()}.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {allJobs ? "Action items on all jobs" : "Action items"}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Things on passing reports that still need doing or telling the
          customer. Add them from a report's <b>Action items</b> button.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
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
          id={allJobs ? "all-action-items-search" : "job-action-items-search"}
          type="text"
          aria-label="Search action items"
          placeholder={allJobs ? "Search ID, item, report or job..." : "Search ID, item or report..."}
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
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-dark-100">
              <tr className="text-left text-neutral-700 dark:text-neutral-300">
                <th scope="col" className="px-3 py-2 font-semibold">{header("ID", "code")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{header("Item", "title")}</th>
                {allJobs && (
                  <th scope="col" className="px-3 py-2 font-semibold">{header("Job", "job")}</th>
                )}
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
                  {allJobs && (
                    <td className="px-3 py-2 min-w-[10rem]">
                      <Link
                        to={`/jobs/${i.job_id}?tab=action-items`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-neutral-900 dark:text-white hover:text-brand hover:underline"
                        title={i.job_title || undefined}
                      >
                        {i.job_number ? `#${i.job_number}` : "Job"}
                        {i.job_title && (
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[16rem]">
                            {i.job_title}
                          </span>
                        )}
                      </Link>
                    </td>
                  )}
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 min-w-[12rem]">
                    {i.report_label}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                    {ACTION_ITEM_CATEGORY_LABELS[i.category] || i.category}
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
          jobId={opened.job_id}
          reportCode={reportCodeOf(opened.item_code)}
          reportName={opened.report_label}
          userId={user?.id || ""}
          initialItemId={opened.id}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
};

export default JobActionItems;
