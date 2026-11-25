import React from "react";
import { Camera, ClipboardPlus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_BARS: Record<string, string> = {
  approved: "bg-green-600",
  approved_internal_forms: "bg-green-400",
  sent: "bg-green-800 dark:bg-green-700",
  ready_for_review: "bg-blue-500",
  issue: "bg-red-600",
  in_progress: "bg-yellow-400",
  "not started": "bg-neutral-300 dark:bg-neutral-600",
};

/** Furthest along first, so the bar fills from the left. */
const BAR_ORDER = Object.keys(STATUS_BARS);

const DONE = new Set(["approved", "approved_internal_forms", "sent"]);

interface StatusCount {
  key: string;
  label: string;
  count: number;
}

interface JobMobileOverviewProps<T extends StatusCount> {
  loading: boolean;
  /** Every status, counted the way the Reports tab counts them */
  statuses: readonly T[];
  onShowReports: (key: T["key"]) => void;
  onAddReport: () => void;
  onDailyJsa: () => void;
  onAddPhotos: () => void;
}

/** Top of the Overview tab on phones and upright iPads: quick actions and report progress. */
export default function JobMobileOverview<T extends StatusCount>({
  loading,
  statuses,
  onShowReports,
  onAddReport,
  onDailyJsa,
  onAddPhotos,
}: JobMobileOverviewProps<T>) {
  const used = statuses
    .filter((s) => s.count > 0 && s.key in STATUS_BARS)
    .sort((a, b) => BAR_ORDER.indexOf(a.key) - BAR_ORDER.indexOf(b.key));
  const total = used.reduce((sum, s) => sum + s.count, 0);
  const done = used
    .filter((s) => DONE.has(s.key))
    .reduce((sum, s) => sum + s.count, 0);

  const tiles = [
    { label: "Add report", icon: ClipboardPlus, onClick: onAddReport },
    { label: "Daily JSA", icon: ShieldCheck, onClick: onDailyJsa },
    { label: "Add photos", icon: Camera, onClick: onAddPhotos },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex h-[88px] flex-col items-center justify-center gap-2 rounded-none border border-neutral-200 bg-white px-1 text-sm font-semibold text-neutral-900 active:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-dark-300 dark:bg-dark-150 dark:text-white dark:active:bg-dark-200"
          >
            <Icon className="h-6 w-6 text-brand" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-none border border-neutral-200 bg-white p-4 dark:border-dark-300 dark:bg-dark-150">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            Reports
          </h2>
          <span className="text-sm text-neutral-600 dark:text-neutral-300">
            {loading
              ? "Loading…"
              : total === 0
                ? "None yet"
                : `${done} of ${total} approved`}
          </span>
        </div>
        {!loading && total > 0 && (
          <>
            <div className="mt-3 flex h-2.5 gap-0.5" aria-hidden="true">
              {used.map((s) => (
                <span
                  key={s.key}
                  className={cn("min-w-1 basis-0", STATUS_BARS[s.key])}
                  style={{ flexGrow: s.count }}
                />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4">
              {used.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onShowReports(s.key)}
                  className="flex min-h-11 items-center gap-2 rounded-none text-left text-sm text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-neutral-100"
                >
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0", STATUS_BARS[s.key])}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">{s.label}</span>
                  <span className="font-bold tabular-nums">{s.count}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
